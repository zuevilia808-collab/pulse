// Звуковой движок: синтез всех инструментов в Web Audio, секвенсор с упреждением,
// эффекты (реверб, эхо, румбл, сайдчейн), запись выхода в WAV.
import { TRACKS, mtof, baseMidi, deg, semiToDeg } from './music.js';

const dbToGain = v => 10 ** (v / 20);
const LEVEL = { kick: 0.72, clap: 0.75, hat: 0.5, ohat: 0.42, perc: 0.45, bass: 0.5, stab: 0.42, lead: 0.34 };
const LOOKAHEAD = 0.12;

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
    this.onStep = null;
    this.onKick = null;
    this.onBuildEnd = null;
  }

  async init() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return;
    }
    const ctx = this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const F = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    this.G = G;
    this.F = F;

    // Мастер: сумма → фильтры для брейков → компрессор → лимитер → гейт записи голоса → громкость → анализатор.
    this.mix = G(0.6);
    this.hp = F('highpass', 10);
    this.lp = F('lowpass', 20000, 0.8);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10; this.comp.ratio.value = 2.5; this.comp.knee.value = 6;
    this.comp.attack.value = 0.005; this.comp.release.value = 0.12;
    this.limit = ctx.createDynamicsCompressor();
    this.limit.threshold.value = -3; this.limit.ratio.value = 20; this.limit.knee.value = 0;
    this.limit.attack.value = 0.001; this.limit.release.value = 0.06;
    this.gate = G(1);
    this.out = G(1);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.78;
    this.mix.connect(this.hp).connect(this.lp).connect(this.comp).connect(this.limit).connect(this.gate)
      .connect(this.out).connect(this.analyser).connect(ctx.destination);

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

    // Каналы дорожек с посылами на эффекты
    this.ch = {};
    this.sendR = {};
    this.sendD = {};
    for (const t of TRACKS) {
      const c = G(1);
      c.connect(t.kind === 'drum' ? this.drums : this.duck);
      const r = G(0), d = G(0);
      c.connect(r).connect(this.revIn);
      c.connect(d).connect(this.dlyIn);
      this.ch[t.id] = c;
      this.sendR[t.id] = r;
      this.sendD[t.id] = d;
    }

    this.kickShaper = ctx.createWaveShaper();
    this.kickShaper.oversample = '2x';
    this.kickShaper.connect(this.ch.kick);

    // Бас — постоянный монофонический голос, как у 303: генератор → 2 фильтра → VCA → перегруз
    this.bOsc = ctx.createOscillator();
    this.bOsc.type = 'sawtooth';
    this.bF1 = F('lowpass', 400, 8);
    this.bF2 = F('lowpass', 520, 0.5);
    this.bVca = G(0);
    this.bShaper = ctx.createWaveShaper();
    this.bShaper.oversample = '2x';
    this.bOsc.connect(this.bF1).connect(this.bF2).connect(this.bVca).connect(this.bShaper).connect(this.ch.bass);
    this.bOsc.start();

    this.ticker = new Worker(URL.createObjectURL(new Blob([TICKER], { type: 'text/javascript' })));
    this.ticker.onmessage = () => this.tick();
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

  start() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.bar = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.ticker.postMessage('start');
    this.tick();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    this.ticker.postMessage('stop');
    const now = this.ctx.currentTime;
    this.bVca.gain.cancelScheduledValues(now);
    this.bVca.gain.setTargetAtTime(0, now, 0.02);
    for (const q of ['beat', 'bar']) this.queues[q].splice(0).forEach(f => f(now));
    this.endBuild(now);
  }

  // Выполнить fn в начале следующей доли/такта (fn получает точное время).
  queue(unit, fn) { this.queues[unit].push(fn); }

  tick() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.03; // вкладка подвисала — догоняем
    while (this.nextTime < now + LOOKAHEAD) {
      this.scheduleStep(this.step, this.nextTime);
      this.nextTime += this.stepDur();
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  scheduleStep(s, t0) {
    if (s % 4 === 0 && this.queues.beat.length) this.queues.beat.splice(0).forEach(f => f(t0));
    if (s === 0 && this.queues.bar.length) this.queues.bar.splice(0).forEach(f => f(t0));
    if (this.build && t0 >= this.build.t1 - 1e-3) { this.build = null; this.onBuildEnd?.(t0); }

    const st = this.getState();
    const sd = 60 / st.bpm / 4;
    const t = t0 + (s % 2 ? st.swing * sd * 0.5 : 0);
    const anySolo = TRACKS.some(x => st.tracks[x.id].solo);
    const take = this.take && t0 >= this.take.countStart - 1e-3 && t0 < this.take.recEnd - 1e-3 ? this.take : null;
    const b = this.build && t0 >= this.build.t0 - 1e-3 ? this.build : null;
    const prog = b ? (t0 - b.t0) / (b.t1 - b.t0) : 0;

    for (const tr of TRACKS) {
      const T = st.tracks[tr.id];
      if (T.mute || (anySolo && !T.solo)) continue;
      if (take && take.mute.includes(tr.id)) continue;
      if (b && prog > 0.875 && (tr.id === 'kick' || tr.id === 'bass')) continue;
      if (tr.kind === 'drum') {
        const v = T.steps[s];
        if (v) this.hit(tr.id, t, v, T.p, s);
      } else {
        const n = T.steps[s];
        if (n) this.note(tr.id, t, n, T, s, st, sd);
      }
    }
    if (b) {
      const every = prog < 0.5 ? 4 : prog < 0.75 ? 2 : 1;
      if (s % every === 0) this.clap(t, 0.35 + 0.6 * prog, { tone: 900 + 2200 * prog, decay: 0.12 }, true);
    }
    if ((take || st.metronome) && s % 4 === 0) this.click(t, s === 0);
    this.onStep?.(s, t, this.bar);
  }

  // ——— Ударные ———
  hit(id, t, v, p, s) {
    if (id === 'kick') this.kick(t, v, p);
    else if (id === 'clap') this.clap(t, v, p);
    else if (id === 'hat') this.hat(t, v, p, false);
    else if (id === 'ohat') this.hat(t, v, p, true);
    else if (id === 'perc') this.perc(t, v, p, s);
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
    const f = p.tune, dec = p.decay;
    o.frequency.setValueAtTime(f * 6, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.025);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.003);
    g.gain.setValueAtTime(v, t + dec * 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + dec);
    o.connect(g);
    g.connect(this.kickShaper);
    g.connect(this.rumbleIn);
    o.start(t);
    o.stop(t + dec + 0.05);
    if (p.click > 0) {
      const n = this.noiseSrc(t, 0.012), cg = this.G(0);
      cg.gain.setValueAtTime(p.click * v * 0.6, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
      n.connect(this.F('highpass', 2500)).connect(cg).connect(this.kickShaper);
    }
    this.duckAt(this.duck.gain, t, 0.55);
    this.duckAt(this.rumbleDuck.gain, t, 0.95);
    this.onKick?.(t);
  }

  clap(t, v, p, roll = false) {
    const n = this.noiseSrc(t, 0.1 + p.decay), g = this.G(0);
    if (!roll) {
      for (let i = 0; i < 3; i++) {
        const ti = t + i * 0.0105;
        g.gain.setValueAtTime(v, ti);
        g.gain.exponentialRampToValueAtTime(v * 0.15, ti + 0.009);
      }
    }
    const t2 = roll ? t : t + 0.032;
    g.gain.setValueAtTime(v, t2);
    g.gain.exponentialRampToValueAtTime(0.001, t2 + p.decay);
    n.connect(this.F('bandpass', p.tone, 1.1)).connect(this.F('highpass', 600)).connect(g).connect(this.ch.clap);
  }

  hat(t, v, p, open) {
    const ctx = this.ctx, dec = p.decay, end = t + dec + 0.03, k = p.tone / 8000;
    const bp = this.F('bandpass', p.tone * 1.25, 0.9), g = this.G(0), mg = this.G(0.16);
    for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f * k;
      o.connect(mg);
      o.start(t);
      o.stop(end);
    }
    const n = this.noiseSrc(t, dec + 0.02), ng = this.G(0.5);
    n.connect(ng).connect(bp);
    mg.connect(bp);
    bp.connect(this.F('highpass', p.tone * 0.85)).connect(g).connect(this.ch[open ? 'ohat' : 'hat']);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dec);
    if (open) this.lastOpen = g;
    else if (this.lastOpen) {
      const prm = this.lastOpen.gain;
      if (prm.cancelAndHoldAtTime) prm.cancelAndHoldAtTime(t); else prm.cancelScheduledValues(t);
      prm.setTargetAtTime(0, t, 0.008);
      this.lastOpen = null;
    }
  }

  perc(t, v, p, s) {
    const f = p.tune * [1, 1.335, 0.75, 1.5][(s * 7) % 4];
    const o = this.ctx.createOscillator(), g = this.G(0);
    o.type = 'triangle';
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.02);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
    o.connect(g).connect(this.ch.perc);
    o.start(t);
    o.stop(t + p.decay + 0.03);
    const n = this.noiseSrc(t, 0.02), ng = this.G(0);
    ng.gain.setValueAtTime(v * 0.4, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    n.connect(this.F('bandpass', Math.min(15000, f * 4), 2)).connect(ng).connect(this.ch.perc);
  }

  // ——— Синты ———
  note(id, t, n, T, s, st, sd) {
    const midi = baseMidi(st.key, id) + n.n;
    if (id === 'bass') {
      const len = n.len || 1;
      const nx = T.steps[(s + len) % 16];
      const legato = !!(nx && nx.slide);
      this.bassNote(t, midi, !!n.acc, !!n.slide, len * sd * (legato ? 1.02 : 0.6), legato, T.p);
    } else if (id === 'stab') this.stab(t, n, T.p, st, sd);
    else this.lead(t, midi, n, T.p, sd);
  }

  bassNote(t, midi, acc, slide, dur, legato, p) {
    const f = mtof(midi), of = this.bOsc.frequency;
    if (slide) of.setTargetAtTime(f, t, 0.025); else of.setValueAtTime(f, t);
    const base = p.cutoff, peak = Math.min(16000, base + (acc ? 1.5 : 1) * p.env * 5000 + 150);
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
    if (!legato) vg.setTargetAtTime(0, t + dur, 0.012);
  }

  releaseBass() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.bVca.gain.cancelScheduledValues(now);
    this.bVca.gain.setTargetAtTime(0, now, 0.02);
  }

  stab(t, n, p, st, sd) {
    const ctx = this.ctx, d0 = semiToDeg(n.n, st.scale), root = baseMidi(st.key, 'stab');
    const end = t + p.decay * 4 + 0.15;
    const flt = this.F('lowpass', p.cutoff, p.res || 2), g = this.G(0);
    flt.frequency.setValueAtTime(p.cutoff * 2.2, t);
    flt.frequency.setTargetAtTime(p.cutoff * 0.6, t + 0.005, p.decay * 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.004);
    g.gain.setTargetAtTime(0, t + Math.min((n.len || 1) * sd, 0.4), p.decay * 0.6);
    for (const k of [0, 2, 4, 6]) {
      const f = mtof(root + deg(st.scale, d0 + k));
      for (const det of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(flt);
        o.start(t);
        o.stop(end);
      }
    }
    flt.connect(g).connect(this.ch.stab);
  }

  lead(t, midi, n, p, sd) {
    const ctx = this.ctx, dur = (n.len || 1) * sd * 0.85, f = mtof(midi), end = t + dur + 0.3;
    const flt = this.F('lowpass', p.cutoff, p.res || 3), g = this.G(0);
    flt.frequency.setValueAtTime(p.cutoff * 2.5, t);
    flt.frequency.setTargetAtTime(p.cutoff, t + 0.005, p.decay * 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.005);
    g.gain.setTargetAtTime(0.18, t + 0.01, p.decay * 0.4);
    g.gain.setTargetAtTime(0, t + dur, 0.03);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = p.wave || 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(flt);
      o.start(t);
      o.stop(end);
    }
    flt.connect(g).connect(this.ch.lead);
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

  // ——— Шоу: нарастание и дроп ———
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

  // ——— Запись трека в WAV ———
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

export function wavBlob(chunks, frames, sr, ch) {
  const bytes = frames * ch * 2, h = new DataView(new ArrayBuffer(44));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) h.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); h.setUint32(4, 36 + bytes, true); str(8, 'WAVE');
  str(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, ch, true);
  h.setUint32(24, sr, true); h.setUint32(28, sr * ch * 2, true); h.setUint16(32, ch * 2, true); h.setUint16(34, 16, true);
  str(36, 'data'); h.setUint32(40, bytes, true);
  return new Blob([h.buffer, ...chunks], { type: 'audio/wav' });
}
