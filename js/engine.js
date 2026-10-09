// Звуковой движок: синтез всех инструментов в Web Audio, секвенсор с упреждением,
// эффекты (реверб, эхо, румбл, сайдчейн), проигрывание трека по частям, запись в WAV.
import { TRACKS, TRACK, mtof, baseMidi, deg, semiToDeg } from './music.js?v=5';
import { SOUNDS } from './sounds.js?v=5';
import { voxBuffer, voxFetch, voxInfo, voxRotate } from './vox.js?v=5';

const dbToGain = v => 10 ** (v / 20);
const LEVEL = { kick: 0.72, clap: 0.75, hat: 0.5, ohat: 0.42, perc: 0.45, bass: 0.5, stab: 0.42, lead: 0.34, vox: 0.62 };
const LOOKAHEAD = 0.12;
const CHORDS = { seventh: [0, 2, 4, 6], triad: [0, 2, 4], fifth: [0, 4, 7], sus: [0, 3, 4] };

const TICKER = 'let id=null;onmessage=e=>{if(e.data==="start"){if(!id)id=setInterval(()=>postMessage(0),20)}else{clearInterval(id);id=null}}';

export class Engine {
  constructor(getState) {
    this.getState = getState;
    this.ctx = null;
    this.playing = false;
    this.step = 0;
    this.bar = 0;
    this.nextTime = 0;
    this.queues = { beat: [], bar: [] };
    this.take = null;
    this.build = null;
    // Режим трека: barFn(номер такта) отдаёт, что играет в этом такте (arrange.js → barData).
    this.mode = 'loop';
    this.barFn = null;
    this.songPos = 0;
    this.seekTo = null;
    this.cur = null;
    // Гармония петли: harmFn(такт, шаг) — на сколько ступеней лада сдвинуть бас, аккорды и мелодию.
    this.harmFn = null;
    // Рисунок петли: loopFn(дорожка, такт) — шаги выбранного рисунка A/B/C.
    this.loopFn = null;
    this.onStep = null;
    this.onKick = null;
    this.onBuildEnd = null;
    this.onSongBar = null;
    this.onSongEnd = null;
  }

  async init(offlineCtx = null) {
    if (this.ctx) {
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return;
    }
    const ctx = this.ctx = offlineCtx || new AudioContext({ latencyHint: 'interactive' });
    this.offline = !!offlineCtx;
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const F = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    this.G = G;
    this.F = F;

    // Мастер: сумма → фильтры брейков → фильтры трека → компрессор → лимитер → гейт записи голоса → громкость.
    this.mix = G(0.6);
    this.hp = F('highpass', 10);
    this.lp = F('lowpass', 20000, 0.8);
    this.sHP = F('highpass', 20);
    this.sLP = F('lowpass', 20000, 0.8);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10; this.comp.ratio.value = 2.5; this.comp.knee.value = 6;
    this.comp.attack.value = 0.005; this.comp.release.value = 0.12;
    this.limit = ctx.createDynamicsCompressor();
    this.limit.threshold.value = -3; this.limit.ratio.value = 20; this.limit.knee.value = 0;
    this.limit.attack.value = 0.001; this.limit.release.value = 0.06;
    this.gate = G(1);
    this.stut = G(1); // заикание и «выключение» в конце частей трека
    this.out = G(1);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.78;
    this.mix.connect(this.hp).connect(this.lp).connect(this.sHP).connect(this.sLP).connect(this.stut).connect(this.comp).connect(this.limit)
      .connect(this.gate).connect(this.out).connect(this.analyser).connect(ctx.destination);

    this.silent = G(0);
    this.silent.connect(ctx.destination);
    this.metro = G(0.32);
    this.metro.connect(ctx.destination);

    this.drums = G(1);
    this.drums.connect(this.mix);
    this.duck = G(1); // шина синтов, приседает под бочку
    this.duck.connect(this.mix);

    this.noise = this.makeNoise(2);

    // Реверб
    this.revIn = G(1);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeIR(2.6, 3.2);
    this.revOut = G(0.55);
    this.revIn.connect(F('highpass', 180)).connect(this.reverb).connect(this.revOut).connect(this.duck);

    // Эхо (пунктирная восьмая) с фильтрами в петле
    this.dlyIn = G(1);
    this.delay = ctx.createDelay(2);
    this.fb = G(0.42);
    const dLP = F('lowpass', 3200), dHP = F('highpass', 250);
    this.dlyOut = G(0.55);
    this.dlyIn.connect(this.delay).connect(dLP).connect(dHP).connect(this.fb).connect(this.delay);
    dHP.connect(this.dlyOut).connect(this.duck);

    // Румбл: тёмный реверб бочки → низкий фильтр → перегруз → сайдчейн
    this.rumbleIn = G(1);
    const rConv = ctx.createConvolver();
    rConv.buffer = this.makeIR(1.6, 3, true);
    const rShaper = ctx.createWaveShaper();
    rShaper.curve = this.curve(0.6);
    this.rumbleDuck = G(1);
    this.rumbleOut = G(0);
    this.rumbleIn.connect(rConv).connect(F('lowpass', 140, 1.4)).connect(rShaper).connect(F('highpass', 32))
      .connect(this.rumbleDuck).connect(this.rumbleOut).connect(this.mix);

    // Шина переходов (свуш, тарелка, спуск)
    this.fxBus = G(0.9);
    this.fxBus.connect(this.mix);
    this.fxBus.connect(G(0.35)).connect(this.revIn);

    // Каналы дорожек: громкость → громкость части трека → шина и посылы на эффекты
    this.ch = {};
    this.arrG = {};
    this.sendR = {};
    this.sendD = {};
    this.throwD = {};
    this.throwR = {};
    for (const t of TRACKS) {
      const c = G(1), a = G(1);
      // Голос не приседает под бочку — идёт прямо в сумму
      c.connect(a).connect(t.kind === 'drum' ? this.drums : t.kind === 'vox' ? this.mix : this.duck);
      const r = G(0), d = G(0);
      a.connect(r).connect(this.revIn);
      a.connect(d).connect(this.dlyIn);
      // Отдельные посылы для «бросков» эха и реверба на стыках частей
      const td = G(0), tr = G(0);
      a.connect(td).connect(this.dlyIn);
      a.connect(tr).connect(this.revIn);
      this.throwD[t.id] = td;
      this.throwR[t.id] = tr;
      this.ch[t.id] = c;
      this.arrG[t.id] = a;
      this.sendR[t.id] = r;
      this.sendD[t.id] = d;
    }

    this.kickShaper = ctx.createWaveShaper();
    this.kickShaper.oversample = '2x';
    this.kickShaper.connect(this.ch.kick);

    // Бас — постоянный монофонический голос, как у 303: генераторы → 2 фильтра → VCA → перегруз.
    // Второй генератор (расстроенная пила) нужен для «риза», саб — для низа.
    this.bOsc = ctx.createOscillator();
    this.bOsc.type = 'sawtooth';
    this.bOsc2 = ctx.createOscillator();
    this.bOsc2.type = 'sawtooth';
    this.bSub = ctx.createOscillator();
    this.bO2g = G(0);
    this.bSubG = G(0);
    this.bF1 = F('lowpass', 400, 8);
    this.bF2 = F('lowpass', 520, 0.5);
    this.bVca = G(0);
    this.bShaper = ctx.createWaveShaper();
    this.bShaper.oversample = '2x';
    this.bOsc.connect(this.bF1);
    this.bOsc2.connect(this.bO2g).connect(this.bF1);
    this.bSub.connect(this.bSubG).connect(this.bF1);
    this.bF1.connect(this.bF2).connect(this.bVca).connect(this.bShaper).connect(this.ch.bass);
    for (const o of [this.bOsc, this.bOsc2, this.bSub]) o.start();

    if (!this.offline) {
      this.ticker = new Worker(URL.createObjectURL(new Blob([TICKER], { type: 'text/javascript' })));
      this.ticker.onmessage = () => this.tick();
    }
    this.applyParams();
  }

  makeNoise(sec) {
    const n = Math.floor(sec * this.ctx.sampleRate), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  makeIR(sec, decay, dark = false) {
    const sr = this.ctx.sampleRate, n = Math.floor(sec * sr), b = this.ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        lp = dark ? lp + (w - lp) * 0.08 : w;
        d[i] = lp * (1 - i / n) ** decay;
      }
    }
    return b;
  }

  curve(drive) {
    const n = 1024, c = new Float32Array(n), k = 1 + drive * 10, nk = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / nk; }
    return c;
  }

  // Переносит параметры из состояния в узлы (плавно).
  applyParams() {
    if (!this.ctx) return;
    const st = this.getState(), now = this.ctx.currentTime;
    const set = (param, v, tc = 0.03) => param.setTargetAtTime(v, now, tc);
    for (const t of TRACKS) {
      const tr = st.tracks[t.id];
      set(this.ch[t.id].gain, dbToGain(tr.p.vol) * LEVEL[t.id]);
      set(this.sendR[t.id].gain, tr.p.rev || 0);
      set(this.sendD[t.id].gain, tr.p.dly || 0);
    }
    const kd = st.tracks.kick.p.drive;
    if (kd !== this._kd) { this.kickShaper.curve = this.curve(kd); this._kd = kd; }
    const b = st.tracks.bass.p;
    if (b.drive !== this._bd) { this.bShaper.curve = this.curve(b.drive); this._bd = b.drive; }
    if (this.bOsc.type !== b.wave) this.bOsc.type = b.wave;
    set(this.bO2g.gain, b.osc2 || 0);
    set(this.bOsc2.detune, b.det || 0);
    set(this.bSubG.gain, b.sub || 0);
    set(this.bF1.Q, b.res);
    if (!this.playing) { set(this.bF1.frequency, b.cutoff); set(this.bF2.frequency, b.cutoff * 1.3); }
    set(this.out.gain, dbToGain(st.master.vol));
    set(this.lp.frequency, st.master.cut, 0.25);
    set(this.rumbleOut.gain, st.master.rumble * 1.6);
    set(this.revOut.gain, st.master.reverb);
    set(this.dlyOut.gain, st.master.delay);
    set(this.delay.delayTime, (0.75 * 60) / st.bpm, 0.05);
  }

  // ——— Транспорт ———
  stepDur() { return 60 / this.getState().bpm / 4; }
  nextBarTime() { return this.nextTime + ((16 - this.step) % 16) * this.stepDur(); }

  start(at = null) {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.bar = 0;
    this.ended = false;
    this.nextTime = at ?? this.ctx.currentTime + 0.08;
    if (this.ticker) this.ticker.postMessage('start');
    this.tick();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    this.ticker?.postMessage('stop');
    const now = this.ctx.currentTime;
    this.bVca.gain.cancelScheduledValues(now);
    this.bVca.gain.setTargetAtTime(0, now, 0.02);
    for (const q of ['beat', 'bar']) this.queues[q].splice(0).forEach(f => f(now));
    this.endBuild(now);
    if (this.cur) { this.cur = null; this.resetSong(now); }
  }

  // Выполнить fn в начале следующей доли/такта (fn получает точное время).
  queue(unit, fn) { this.queues[unit].push(fn); }

  tick(until = null) {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    if (until == null && this.nextTime < now - 0.25) this.nextTime = now + 0.03; // вкладка подвисала — догоняем
    const end = until ?? now + LOOKAHEAD;
    while (this.playing && this.nextTime < end) {
      this.scheduleStep(this.step, this.nextTime);
      this.nextTime += this.stepDur();
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'loop') this.seekTo = null;
  }

  // Перейти к такту трека с начала следующего такта.
  seek(bar) {
    this.seekTo = bar;
    this.ended = false;
  }

  resetSong(t) {
    for (const t2 of TRACKS) { this.arrG[t2.id].gain.cancelScheduledValues(t); this.arrG[t2.id].gain.setTargetAtTime(1, t, 0.02); }
    for (const [f, v] of [[this.sLP.frequency, 20000], [this.sHP.frequency, 20]]) { f.cancelScheduledValues(t); f.setValueAtTime(v, t); }
  }

  // Начало такта в режиме трека: что играет, фильтры, переходы.
  enterBar(t0) {
    if (this.mode !== 'song' || !this.barFn) {
      if (this.cur) { this.cur = null; this.resetSong(t0); }
      return;
    }
    if (this.seekTo != null) { this.songPos = this.seekTo; this.seekTo = null; this.endBuild(t0); }
    const info = this.barFn(this.songPos);
    if (!info) {
      this.cur = { steps: {}, gain: {}, cut: {}, end: true };
      if (!this.ended) { this.ended = true; this.onSongEnd?.(t0); }
      return;
    }
    const bd = 16 * this.stepDur(), sd = bd / 16;
    this.cur = info;
    this.stut.gain.cancelScheduledValues(t0);
    this.stut.gain.setValueAtTime(1, t0);
    for (const t of TRACKS) {
      const g = this.arrG[t.id].gain;
      g.cancelScheduledValues(t0);
      g.setTargetAtTime(info.gain[t.id] ?? 1, t0, 0.015);
    }
    for (const [f, [a, b]] of [[this.sLP.frequency, info.lp], [this.sHP.frequency, info.hp]]) {
      f.cancelScheduledValues(t0);
      f.setValueAtTime(a, t0);
      if (b !== a) f.exponentialRampToValueAtTime(b, t0 + bd);
    }
    for (const fx of info.fx) {
      const at = t0 + (fx.at || 0) * sd, end = t0 + bd;
      if (fx.type === 'riser') this.riser(at, fx.bars * bd);
      else if (fx.type === 'impact') this.impact(at);
      else if (fx.type === 'crash') this.crash(at);
      else if (fx.type === 'hit') this.hitverb(at);
      else if (fx.type === 'down') this.downlifter(at, Math.min(bd * 2, 4));
      else if (fx.type === 'swell') { const d = Math.min(bd, 2.2); this.swell(end - d, d); }
      else if (fx.type === 'toms') { const k0 = fx.at || 8; for (let k = k0; k < 16; k++) this.tom(t0 + k * sd, 240 * 0.9 ** (k - k0), 0.45 + (0.5 * (k - k0)) / (16 - k0)); }
      else if (fx.type === 'stutter') this.stutter(at, end, sd / 2);
      else if (fx.type === 'throw') this.throwFx(fx.kind, at, sd * 4, bd);
      else if (fx.type === 'stop') this.powerDown(at, end - at);
      else if (fx.type === 'flfx') this.flFx(fx, t0, sd, bd);
    }
    this.onSongBar?.(this.songPos, t0);
    this.songPos++;
  }

  scheduleStep(s, t0) {
    if (s % 4 === 0 && this.queues.beat.length) this.queues.beat.splice(0).forEach(f => f(t0));
    if (s === 0 && this.queues.bar.length) this.queues.bar.splice(0).forEach(f => f(t0));
    if (s === 0) this.enterBar(t0);
    if (this.build && t0 >= this.build.t1 - 1e-3) { this.build = null; this.onBuildEnd?.(t0); }

    const st = this.getState();
    const sd = 60 / st.bpm / 4;
    const t = t0 + (s % 2 ? st.swing * sd * 0.5 : 0);
    const anySolo = TRACKS.some(x => st.tracks[x.id].solo);
    const take = this.take && t0 >= this.take.countStart - 1e-3 && t0 < this.take.recEnd - 1e-3 ? this.take : null;
    const b = this.build && t0 >= this.build.t0 - 1e-3 ? this.build : null;
    const prog = b ? (t0 - b.t0) / (b.t1 - b.t0) : 0;
    const cur = this.cur;

    for (const tr of TRACKS) {
      const T = st.tracks[tr.id];
      if (T.mute || (anySolo && !T.solo)) continue;
      if (take && take.mute.includes(tr.id)) continue;
      if (b && prog > 0.875 && (tr.id === 'kick' || tr.id === 'bass')) continue;
      // В петле рисунок может быть B или C (кнопки A/B/C) — его даёт loopFn
      const steps = cur ? cur.steps[tr.id] : this.loopFn ? this.loopFn(tr.id, this.bar) : T.steps;
      if (!steps) continue;
      if (tr.kind === 'drum') {
        const v = steps[s];
        if (v) this.hit(tr.id, t, v, T.p, s);
      } else if (tr.kind === 'vox') {
        let x = steps[s];
        if (!x) continue;
        if (!cur) {
          // В петле голос звучит раз в несколько тактов, и фразы по кругу меняются
          const o = T.vox || {}, ev = o.every || 1;
          if (this.bar % ev) continue;
          x = voxRotate(x, o, Math.floor(this.bar / ev));
        }
        this.voxNote(t, x, T.p, sd);
      } else {
        let n = steps[s];
        if (!n) continue;
        // В петле ноты идут по аккордам гармонии (в треке это уже сделала аранжировка)
        const d = !cur && this.harmFn ? this.harmFn(this.bar, s) : 0;
        if (d) n = { ...n, n: deg(st.scale, semiToDeg(n.n, st.scale) + d) };
        // На нарастании фильтр синтов открывается — вместо дроби хэтов
        this.note(tr.id, t, n, T, s, st, sd, steps, (cur ? cur.cut[tr.id] ?? 1 : 1) * (b ? 0.6 + 1.3 * prog : 1));
      }
    }
    if ((take || st.metronome) && s % 4 === 0) this.click(t, s === 0);
    this.onStep?.(s, t, this.bar);
  }

  // ——— Ударные ———
  hit(id, t, v, p, s) {
    if (p.sample) return this.sampleHit(id, t, v, p);
    if (id === 'kick') this.kick(t, v, p);
    else if (id === 'clap') this.clap(t, v, p);
    else if (id === 'hat') this.hat(t, v, p, false);
    else if (id === 'ohat') this.hat(t, v, p, true);
    else if (id === 'perc') this.perc(t, v, p, s);
  }

  // Живой удар из FL Studio. «Короче/длиннее» — затухание, «выше/ниже» у бочки — скорость сэмпла.
  sampleHit(id, t, v, p) {
    const buf = voxBuffer(p.sample);
    if (!buf) { voxFetch([p.sample]); return; }
    const ctx = this.ctx, src = ctx.createBufferSource(), g = this.G(0);
    src.buffer = buf;
    const rate = p.tune0 && p.tune ? Math.min(2, Math.max(0.5, p.tune / p.tune0)) : 1;
    src.playbackRate.value = rate;
    const len = Math.min(buf.duration / rate, Math.max(0.05, (p.decay || 0.3) * (id === 'kick' || id === 'ohat' ? 3 : 4)));
    g.gain.setValueAtTime(v * (p.gain || 1) * 1.15, t);
    g.gain.setTargetAtTime(0, t + len * 0.75, len * 0.12);
    src.connect(g);
    if (id === 'kick') { g.connect(this.kickShaper); g.connect(this.rumbleIn); } else g.connect(this.ch[id]);
    src.start(t);
    src.stop(t + len + 0.1);
    if (id === 'kick') {
      this.duckAt(this.duck.gain, t, 0.55);
      this.duckAt(this.rumbleDuck.gain, t, 0.95);
      this.onKick?.(t);
    } else if (id === 'ohat') this.lastOpen = g;
    else if (id === 'hat' && this.lastOpen) {
      const prm = this.lastOpen.gain;
      if (prm.cancelAndHoldAtTime) prm.cancelAndHoldAtTime(t); else prm.cancelScheduledValues(t);
      prm.setTargetAtTime(0, t, 0.008);
      this.lastOpen = null;
    }
  }

  // Звуковой эффект FL на переходе: райзер заканчивается ровно к концу окна (end — в тактах от начала такта)
  flFx(fx, t0, sd, bd) {
    const buf = voxBuffer(fx.id);
    if (!buf) { voxFetch([fx.id]); return; }
    let at = t0 + (fx.at || 0) * sd;
    if (fx.end != null) at = Math.max(at, t0 + fx.end * bd - buf.duration);
    const src = this.ctx.createBufferSource(), g = this.G(fx.vol ?? 0.8);
    src.buffer = buf;
    src.connect(g).connect(this.fxBus);
    src.start(at);
  }

  noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.start(t, Math.random() * 1.5, dur + 0.05);
    return s;
  }

  duckAt(param, t, depth) {
    param.setTargetAtTime(1 - depth, t, 0.004);
    param.setTargetAtTime(1, t + 0.05, 0.08);
  }

  kick(t, v, p) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = this.G(0);
    const f = p.tune, dec = p.decay, sw = p.sweep ?? 6, bend = p.bend ?? 0.12;
    o.type = p.wave || 'sine';
    o.frequency.setValueAtTime(f * sw, t);
    o.frequency.exponentialRampToValueAtTime(f * Math.min(1.5, sw), t + bend * 0.2);
    o.frequency.exponentialRampToValueAtTime(f, t + bend);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.003);
    g.gain.setValueAtTime(v, t + dec * (p.hold ?? 0.3));
    g.gain.exponentialRampToValueAtTime(0.001, t + dec);
    o.connect(g);
    let body = g;
    if (p.tone && p.tone < 18000) body = g.connect(this.F('lowpass', p.tone, 0.7));
    body.connect(this.kickShaper);
    body.connect(this.rumbleIn);
    o.start(t);
    o.stop(t + dec + 0.05);
    if (p.click > 0) {
      const n = this.noiseSrc(t, 0.012), cg = this.G(0);
      cg.gain.setValueAtTime(p.click * v * 0.6, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
      n.connect(this.F('highpass', 2500)).connect(cg).connect(this.kickShaper);
    }
    if (p.grit > 0) {
      const n = this.noiseSrc(t, dec), ng = this.G(0);
      ng.gain.setValueAtTime(p.grit * v * 0.5, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + dec * 0.6);
      n.connect(this.F('bandpass', 180, 0.8)).connect(ng).connect(this.kickShaper);
    }
    this.duckAt(this.duck.gain, t, 0.55);
    this.duckAt(this.rumbleDuck.gain, t, 0.95);
    this.onKick?.(t);
  }

  clap(t, v, p, roll = false) {
    const bursts = roll ? 0 : p.bursts ?? 3, sp = p.spread ?? 0.0105;
    const n = this.noiseSrc(t, 0.1 + p.decay + bursts * sp), g = this.G(0);
    for (let i = 0; i < bursts; i++) {
      const ti = t + i * sp;
      g.gain.setValueAtTime(v, ti);
      g.gain.exponentialRampToValueAtTime(v * 0.15, ti + sp * 0.85);
    }
    const t2 = t + bursts * sp + (bursts ? 0.0005 : 0);
    g.gain.setValueAtTime(v, t2);
    g.gain.exponentialRampToValueAtTime(0.001, t2 + p.decay);
    n.connect(this.F('bandpass', p.tone, p.q ?? 1.1)).connect(this.F('highpass', p.hp ?? 600)).connect(g).connect(this.ch.clap);
    if (!roll && p.body > 0) {
      const o = this.ctx.createOscillator(), og = this.G(0), f = p.bodyF || 200, d = Math.min(0.15, p.decay);
      o.type = 'triangle';
      o.frequency.setValueAtTime(f * 1.5, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      og.gain.setValueAtTime(v * p.body * 0.8, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(og).connect(this.ch.clap);
      o.start(t);
      o.stop(t + d + 0.03);
    }
  }

  hat(t, v, p, open) {
    const ctx = this.ctx, dec = p.decay, end = t + dec + 0.03, k = p.tone / 8000;
    const bp = this.F('bandpass', p.tone * 1.25, p.q ?? 0.9), g = this.G(0), metal = p.metal ?? 0.16;
    if (metal > 0) {
      const mg = this.G(metal);
      for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f * k;
        o.connect(mg);
        o.start(t);
        o.stop(end);
      }
      mg.connect(bp);
    }
    const n = this.noiseSrc(t, dec + 0.02), ng = this.G(p.noise ?? 0.5);
    n.connect(ng).connect(bp);
    bp.connect(this.F('highpass', p.tone * 0.85)).connect(g).connect(this.ch[open ? 'ohat' : 'hat']);
    if (p.att > 0) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + p.att); } else g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(dec, (p.att || 0) + 0.01));
    if (open) this.lastOpen = g;
    else if (this.lastOpen) {
      const prm = this.lastOpen.gain;
      if (prm.cancelAndHoldAtTime) prm.cancelAndHoldAtTime(t); else prm.cancelScheduledValues(t);
      prm.setTargetAtTime(0, t, 0.008);
      this.lastOpen = null;
    }
  }

  perc(t, v, p, s) {
    const ratios = p.ratios || [1, 1.335, 0.75, 1.5];
    const f = p.tune * ratios[(s * 7) % ratios.length], drop = p.drop ?? 1.6, end = t + p.decay + 0.03;
    const g = this.G(0);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
    const dest = p.band ? this.F('bandpass', f * p.band, 1.2) : null;
    if (dest) dest.connect(g);
    for (const [mul, lvl] of p.pair ? [[1, 1], [p.pair, 0.6]] : [[1, 1]]) {
      const o = this.ctx.createOscillator(), og = this.G(lvl);
      o.type = p.wave || 'triangle';
      o.frequency.setValueAtTime(f * mul * drop, t);
      if (drop !== 1) o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.02);
      o.connect(og).connect(dest || g);
      o.start(t);
      o.stop(end);
    }
    g.connect(this.ch.perc);
    const nz = p.noise ?? 0.4;
    if (nz > 0) {
      const n = this.noiseSrc(t, 0.02), ng = this.G(0);
      ng.gain.setValueAtTime(v * nz, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
      n.connect(this.F('bandpass', Math.min(15000, f * 4), 2)).connect(ng).connect(this.ch.perc);
    }
  }

  // ——— Синты ———
  note(id, t, n, T, s, st, sd, steps, cut = 1) {
    const midi = baseMidi(st.key, id) + n.n;
    if (id === 'bass') {
      const len = n.len || 1;
      const nx = steps[(s + len) % 16];
      const legato = !!(nx && nx.slide);
      this.bassNote(t, midi, !!n.acc, !!n.slide, len * sd * (legato ? 1.02 : 0.6), legato, T.p, cut);
    } else if (id === 'stab') this.stab(t, n, T.p, st, sd, cut);
    else this.lead(t, midi, n, T.p, sd, cut);
  }

  bassNote(t, midi, acc, slide, dur, legato, p, cut = 1) {
    const f = mtof(midi), gl = p.glide ?? 0.025;
    for (const [o, m] of [[this.bOsc, 1], [this.bOsc2, 1], [this.bSub, 0.5]]) {
      if (slide) o.frequency.setTargetAtTime(f * m, t, gl); else o.frequency.setValueAtTime(f * m, t);
    }
    const base = Math.min(16000, p.cutoff * cut), peak = Math.min(16000, base + (acc ? 1.5 : 1) * p.env * 5000 + 150);
    const tc = (acc ? 0.5 : 1) * p.decay * 0.5;
    if (!slide) {
      for (const [flt, m] of [[this.bF1, 1], [this.bF2, 1.3]]) {
        flt.frequency.setValueAtTime(peak * m, t);
        flt.frequency.setTargetAtTime(base * m, t + 0.004, tc);
      }
    }
    const lvl = acc ? 1 : 0.72, vg = this.bVca.gain;
    if (!slide) {
      vg.setTargetAtTime(0, t - 0.004, 0.0012);
      vg.setTargetAtTime(lvl, t, 0.0015);
    } else vg.setTargetAtTime(lvl, t, 0.01);
    if (!legato) vg.setTargetAtTime(0, t + dur, p.rel ?? 0.012);
  }

  releaseBass() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.bVca.gain.cancelScheduledValues(now);
    this.bVca.gain.setTargetAtTime(0, now, 0.02);
  }

  stab(t, n, p, st, sd, cut = 1) {
    const ctx = this.ctx, d0 = semiToDeg(n.n, st.scale), root = baseMidi(st.key, 'stab') + 12 * (p.oct || 0);
    const chord = CHORDS[p.chord] || CHORDS.seventh, att = p.attack ?? 0.004, rel = p.decay;
    const gate = Math.max(att, Math.min((n.len || 1) * sd, p.hold ?? 0.4));
    const end = t + gate + rel * 4 + 0.15, c = p.cutoff * cut, det = p.det ?? 9;
    const flt = this.F('lowpass', c, p.res || 2), g = this.G(0);
    const lvl = 0.2 * Math.sqrt(4 / chord.length) * (p.gain ?? 1);
    flt.frequency.setValueAtTime(c * (p.env ?? 2.2), t);
    flt.frequency.setTargetAtTime(c * 0.6, t + 0.005 + att, rel * 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl, t + att);
    g.gain.setTargetAtTime(0, t + gate, rel * 0.6);
    for (const k of chord) {
      const f = mtof(root + deg(st.scale, d0 + k));
      for (const dt of [-det, det]) {
        const o = ctx.createOscillator();
        o.type = p.wave || 'sawtooth';
        o.frequency.value = f;
        o.detune.value = dt;
        o.connect(flt);
        o.start(t);
        o.stop(end);
      }
    }
    flt.connect(g).connect(this.ch.stab);
  }

  lead(t, midi, n, p, sd, cut = 1) {
    const ctx = this.ctx, dur = (n.len || 1) * sd * 0.85, f = mtof(midi), att = p.attack ?? 0.005, rel = p.rel ?? 0.03;
    const end = t + Math.max(dur, att) + rel * 5 + 0.1, c = Math.min(16000, p.cutoff * cut), lvl = 0.35 * (p.gain ?? 1);
    const flt = this.F('lowpass', c, p.res || 3), g = this.G(0);
    flt.frequency.setValueAtTime(Math.min(18000, c * 2.5), t);
    flt.frequency.setTargetAtTime(c, t + 0.005, p.decay * 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl, t + att);
    g.gain.setTargetAtTime(lvl * 0.5, t + att + 0.005, p.decay * 0.4);
    g.gain.setTargetAtTime(0, t + Math.max(dur, att), rel);
    const oscs = [];
    if (p.fm > 0) {
      // Колокол: синус, которым качает второй синус (частотная модуляция)
      const o = ctx.createOscillator(), m = ctx.createOscillator(), mg = this.G(0);
      o.frequency.value = f;
      m.frequency.value = f * (p.fmr || 2);
      mg.gain.setValueAtTime(f * p.fm, t);
      mg.gain.setTargetAtTime(f * p.fm * 0.15, t, p.decay * 0.5);
      m.connect(mg).connect(o.frequency);
      o.connect(flt);
      oscs.push(o, m);
    } else {
      const det = p.det ?? 7;
      for (const dt of det ? [-det, det] : [0]) {
        const o = ctx.createOscillator();
        o.type = p.wave || 'sawtooth';
        o.frequency.value = f;
        o.detune.value = dt;
        o.connect(flt);
        oscs.push(o);
      }
    }
    if (p.vib > 0) {
      const l = ctx.createOscillator(), lg = this.G(p.vib);
      l.frequency.value = 5.2;
      l.connect(lg);
      for (const o of oscs) lg.connect(o.detune);
      oscs.push(l);
    }
    for (const o of oscs) { o.start(t); o.stop(end); }
    flt.connect(g).connect(this.ch.lead);
  }

  // ——— Голос: адлиб с обработкой ———
  // x: { a — фраза, v — громкость, fx — своя обработка, c — слог для нарезки, len — длина слога в шагах }
  voxNote(t, x, p, sd) {
    const P = x.fx && SOUNDS.vox[x.fx] ? { ...p, ...SOUNDS.vox[x.fx].p, rev: p.rev, dly: p.dly } : p;
    const buf = voxBuffer(x.a, !!P.back);
    if (!buf) { voxFetch([x.a]); return; } // ещё не загружена — прозвучит в следующий раз
    const ctx = this.ctx, info = voxInfo(x.a) || { on: [0] }, rate = 2 ** ((P.pitch || 0) / 12);
    // Голос один: новая фраза обрывает предыдущую
    if (this.voxVca) { const g = this.voxVca.gain; g.cancelScheduledValues(t); g.setTargetAtTime(0, t, 0.006); }
    const vca = this.G(0), hp = this.F('highpass', P.hp || 120), lp = this.F('lowpass', P.lp || 14000, P.q || 0.7);
    this.voxVca = vca;
    hp.connect(lp);
    let tail = lp;
    const nodes = [vca, hp, lp];
    if (P.drive) { const sh = ctx.createWaveShaper(); sh.curve = this.curve(P.drive); tail.connect(sh); tail = sh; nodes.push(sh); }
    let ring = null;
    if (P.ring) { // кольцевая модуляция — металлический «робот»
      const rg = this.G(0);
      ring = ctx.createOscillator();
      ring.frequency.value = P.ring;
      ring.connect(rg.gain);
      tail.connect(rg);
      tail = rg;
      nodes.push(rg, ring);
    }
    tail.connect(vca).connect(this.ch.vox);
    const v = x.v ?? 1, full = buf.duration / rate;
    const play = (at, off, dur) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(hp);
      src.start(at, off, dur * rate);
      nodes.push(src);
      return src;
    };
    let end;
    if (x.c != null) {
      // Нарезка: один слог фразы на сетке
      const on = info.on, k = x.c % on.length, off = on[k] / 1000;
      const nxt = k + 1 < on.length ? on[k + 1] / 1000 : buf.duration;
      const dur = Math.min(sd * (x.len || 1) * 0.92, (nxt - off) / rate + 0.03);
      play(t, P.back ? Math.max(0, buf.duration - nxt) : off, dur);
      end = t + dur;
    } else {
      let at = t;
      if (P.stut) { // заикание: начало фразы повторяется шестнадцатыми
        const piece = Math.min(sd * 0.85, ((info.on[1] || 160) / 1000) / rate);
        for (let k = 0; k < P.stut; k++, at += sd) play(at, 0, piece);
      }
      const dur = Math.min(full, sd * 16 * 3);
      play(at, 0, dur);
      end = at + dur;
    }
    const g = vca.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(v, t + 0.004);
    if (P.gate) for (let k = 1, a = t + sd * 0.5; a < end; k++, a = t + sd * (k - 0.5)) {
      g.setTargetAtTime(0.05 * v, a, 0.004);
      g.setTargetAtTime(v, t + sd * k, 0.002);
    }
    g.setTargetAtTime(0, end, 0.015);
    if (ring) { ring.start(t); ring.stop(end + 0.2); }
    // Обработка части трека: свой «бросок» в реверб или эхо
    if (x.fx && SOUNDS.vox[x.fx]) {
      const fp = SOUNDS.vox[x.fx].p;
      for (const [send, lvl] of [[this.throwR.vox, fp.rev - p.rev], [this.throwD.vox, fp.dly - p.dly]]) {
        if (!(lvl > 0.05)) continue;
        send.gain.setTargetAtTime(lvl, t, 0.01);
        send.gain.setTargetAtTime(0, end, 0.05);
      }
    }
    if (!this.offline) setTimeout(() => nodes.forEach(n => n.disconnect()), (end - ctx.currentTime + 1.5) * 1000);
  }

  // Прослушать звук дорожки прямо сейчас (при выборе звука или ноты). У голоса n — фраза.
  preview(id, n = 0) {
    if (!this.ctx) return;
    const st = this.getState(), T = st.tracks[id], t = this.ctx.currentTime + 0.02, sd = 60 / st.bpm / 4;
    if (id === 'vox') {
      const a = typeof n === 'string' ? n : (T.steps.find(Boolean) || {}).a || (T.vox.pool || [])[0];
      if (a) voxFetch([a]).then(() => this.voxNote(this.ctx.currentTime + 0.02, { a }, T.p, sd));
      return;
    }
    if (TRACK[id].kind === 'drum') this.hit(id, t, 0.9, T.p, 0);
    else if (id === 'bass') this.bassNote(t, baseMidi(st.key, 'bass') + n, false, false, sd * 2, false, T.p);
    else if (id === 'stab') this.stab(t, { n, len: 2 }, T.p, st, sd);
    else this.lead(t, baseMidi(st.key, 'lead') + n, { n, len: 2 }, T.p, sd);
  }

  // Метроном: чистый синус 2,5 кГц — его вырезает фильтр на микрофоне.
  click(t, accent) {
    const o = this.ctx.createOscillator(), g = this.G(0);
    o.frequency.value = 2500;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent ? 0.9 : 0.5, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    o.connect(g).connect(this.metro);
    o.start(t);
    o.stop(t + 0.06);
  }

  // ——— Шоу: нарастание, дроп и переходы ———
  riser(t, dur) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const bp = this.F('bandpass', 300, 3), g = this.G(0);
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + dur);
    g.gain.setTargetAtTime(0, t + dur, 0.02);
    n.connect(bp).connect(g);
    g.connect(this.mix);
    g.connect(this.revIn);
    n.start(t);
    n.stop(t + dur + 0.3);
    this.riserGain = g;
  }

  // Обратная тарелка: шум нарастает и обрывается ровно к следующему такту.
  swell(t, dur) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const g = this.G(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42, t + dur);
    g.gain.setValueAtTime(0, t + dur + 0.005);
    n.connect(this.F('highpass', 2500)).connect(g).connect(this.fxBus);
    n.start(t);
    n.stop(t + dur + 0.05);
  }

  // Спуск: шум и тон уходят вниз в начале брейка.
  downlifter(t, dur) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const bp = this.F('bandpass', 6000, 2), g = this.G(0);
    bp.frequency.setValueAtTime(6000, t);
    bp.frequency.exponentialRampToValueAtTime(250, t + dur);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(bp).connect(g).connect(this.fxBus);
    n.start(t);
    n.stop(t + dur + 0.05);
    const o = this.ctx.createOscillator(), og = this.G(0);
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(50, t + dur * 0.8);
    og.gain.setValueAtTime(0.18, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);
    o.connect(og).connect(this.fxBus);
    o.start(t);
    o.stop(t + dur);
  }

  // Том для сбивок: звук не из основного грува, поэтому сбивка слышна.
  tom(t, f, v) {
    const o = this.ctx.createOscillator(), g = this.G(0);
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    g.gain.setValueAtTime(v * 0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g).connect(this.fxBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  // Метка «удар в реверб»: короткий удар, который тонет в большом зале.
  hitverb(t) {
    const n = this.noiseSrc(t, 0.12), g = this.G(0);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    const send = this.G(1.1);
    n.connect(this.F('bandpass', 1400, 0.9)).connect(g);
    g.connect(this.fxBus);
    g.connect(send).connect(this.revIn);
    this.tom(t, 150, 0.9);
    const rb = this.revOut.gain, base = this.getState().master.reverb;
    rb.setTargetAtTime(Math.min(1.4, base + 0.5), t, 0.01);
    rb.setTargetAtTime(base, t + 1.5, 0.4);
  }

  // Заикание: звук рубится на тридцать вторые до конца такта.
  stutter(t, end, chop) {
    const g = this.stut.gain;
    let on = false;
    for (let x = t; x < end - 1e-4; x += chop) { g.setValueAtTime(on ? 1 : 0.06, x); on = !on; }
    g.setValueAtTime(1, end);
  }

  // Бросок эха или реверба: последний удар уходит в длинный хвост, остальное замолкает.
  throwFx(kind, t, dur, bd) {
    const sends = kind === 'dly' ? this.throwD : this.throwR;
    for (const id of ['clap', 'perc', 'stab', 'lead', 'hat']) {
      const g = sends[id].gain;
      g.setTargetAtTime(kind === 'dly' ? 0.9 : 1.3, t, 0.004);
      g.setTargetAtTime(0, t + dur * 0.8, 0.03);
    }
    if (kind === 'dly') {
      this.fb.gain.setTargetAtTime(0.66, t, 0.01);
      this.fb.gain.setTargetAtTime(0.42, t + bd * 1.5, 0.3);
    } else {
      const rb = this.revOut.gain, base = this.getState().master.reverb;
      rb.setTargetAtTime(Math.min(1.5, base + 0.6), t, 0.01);
      rb.setTargetAtTime(base, t + bd * 1.2, 0.4);
    }
  }

  // «Выключение»: звук будто обесточили — фильтр и громкость падают к концу такта.
  powerDown(t, dur) {
    this.sLP.frequency.setTargetAtTime(160, t, dur / 3);
    this.stut.gain.setTargetAtTime(0.2, t, dur / 2);
  }

  // Тарелка в начале новой фразы.
  crash(t) {
    const dur = 2.2, end = t + dur + 0.05, g = this.G(0), bp = this.F('bandpass', 7000, 0.6), mg = this.G(0.25);
    for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f * 0.8;
      o.connect(mg);
      o.start(t);
      o.stop(end);
    }
    mg.connect(bp);
    this.noiseSrc(t, dur).connect(this.G(0.7)).connect(bp);
    bp.connect(this.F('highpass', 4000)).connect(g).connect(this.fxBus);
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  }

  startBuild(t, bars = 2) {
    const dur = bars * 16 * this.stepDur();
    this.build = { t0: t, t1: t + dur };
    this.riser(t, dur);
    const f = this.hp.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(10, t);
    f.exponentialRampToValueAtTime(700, t + dur);
    f.setValueAtTime(10, t + dur);
  }

  endBuild(t) {
    this.build = null;
    if (!this.ctx) return;
    const f = this.hp.frequency;
    f.cancelScheduledValues(Math.max(t, this.ctx.currentTime));
    f.setValueAtTime(10, Math.max(t, this.ctx.currentTime));
    if (this.riserGain && t <= this.ctx.currentTime + 0.01) {
      this.riserGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.riserGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    }
  }

  impact(t) {
    const n = this.noiseSrc(t, 2.2), g = this.G(0);
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2);
    n.connect(this.F('highpass', 3000)).connect(g);
    g.connect(this.mix);
    g.connect(this.revIn);
    const o = this.ctx.createOscillator(), og = this.G(0);
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.8);
    og.gain.setValueAtTime(0.9, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    o.connect(og).connect(this.mix);
    o.start(t);
    o.stop(t + 1.3);
  }

  // ——— Запись голоса: отсчёт и гейт ———
  beginTake(o) {
    this.take = o;
    if (o.gate) {
      const g = this.gate.gain;
      g.setValueAtTime(1, o.recStart - 0.03);
      g.linearRampToValueAtTime(0, o.recStart);
      g.setValueAtTime(0, o.recEnd);
      g.linearRampToValueAtTime(1, o.recEnd + 0.02);
    }
  }

  endTake() {
    this.take = null;
    const g = this.gate.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(1, now, 0.01);
  }

  loadWorklet() {
    if (!this._wl) this._wl = this.ctx.audioWorklet.addModule('js/capture-worklet.js');
    return this._wl;
  }

  // ——— Запись того, что играет, в WAV ———
  async recStart() {
    await this.loadWorklet();
    const node = new AudioWorkletNode(this.ctx, 'capture', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      channelCount: 2, channelCountMode: 'explicit', processorOptions: { channels: 2 },
    });
    this.recData = [];
    this.recLen = 0;
    node.port.onmessage = e => {
      const [l, r] = e.data.chans, n = l.length, out = new Int16Array(n * 2);
      for (let i = 0; i < n; i++) {
        out[2 * i] = Math.max(-1, Math.min(1, l[i])) * 32767;
        out[2 * i + 1] = Math.max(-1, Math.min(1, r[i])) * 32767;
      }
      this.recData.push(out);
      this.recLen += n;
    };
    this.out.connect(node);
    node.connect(this.silent);
    node.port.postMessage('on');
    this.recNode = node;
  }

  async recStop() {
    const node = this.recNode;
    if (!node) return null;
    node.port.postMessage('off');
    await new Promise(r => setTimeout(r, 150));
    this.out.disconnect(node);
    node.disconnect();
    this.recNode = null;
    const blob = wavBlob(this.recData, this.recLen, this.ctx.sampleRate, 2);
    const sec = this.recLen / this.ctx.sampleRate;
    this.recData = null;
    return { blob, sec };
  }
}

// Быстрый рендер всего трека без проигрывания: отдельный движок на OfflineAudioContext,
// такты подкладываются кусками по полсекунды (suspend → запланировать → resume).
export async function renderSong(state, barFn, bars, onProgress) {
  const sr = 44100, barDur = 240 / state.bpm, tail = 3, dur = bars * barDur + tail + 0.2;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const e = new Engine(() => state);
  await e.init(ctx);
  e.mode = 'song';
  e.barFn = k => (k < bars ? barFn(k) : null);
  e.start(0.1);
  const CH = 0.5;
  e.tick(CH + 0.2);
  for (let t = CH; t < dur - 0.05; t += CH) {
    ctx.suspend(t).then(() => {
      if (e.playing) e.tick(t + CH + 0.2);
      if (e.ended && e.playing) e.playing = false;
      onProgress?.(t / dur);
      ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  const n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1), out = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767;
    out[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767;
  }
  return { blob: wavBlob([out], n, sr, 2), sec: n / sr };
}

export function wavBlob(chunks, frames, sr, ch) {
  const bytes = frames * ch * 2, h = new DataView(new ArrayBuffer(44));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) h.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); h.setUint32(4, 36 + bytes, true); str(8, 'WAVE');
  str(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, ch, true);
  h.setUint32(24, sr, true); h.setUint32(28, sr * ch * 2, true); h.setUint16(32, ch * 2, true); h.setUint16(34, 16, true);
  str(36, 'data'); h.setUint32(40, bytes, true);
  return new Blob([h.buffer, ...chunks], { type: 'audio/wav' });
}
