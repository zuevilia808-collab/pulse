// Живой диджей «Пульса»: две деки в одном звуке, бесконечный (или заданной длины) сет вживую.
// Пока играет один трек, следующий уже сочинён и ждёт. В конце трека (на границе фразы) следующий входит
// точно в долю и в темпе — и диджей делает один из переходов, как живые диджеи:
//   swap   — басовый своп: новый трек входит без низа, на сильной доле низ перекидывается, старый уходит;
//   eq     — EQ-блендинг: низ старого постепенно срезается, новый так же постепенно открывается;
//   filter — фильтр: старый трек «закрывается» фильтром, новый входит, открываясь;
//   echo   — эхо-выход: старый трек на сильной доле уходит в эхо, новый вступает сразу полностью.
import { Engine } from './engine.js?v=5';
import { barData, PART } from './arrange.js?v=5';
import { makeTrack, MOODS } from './set.js?v=5';
import { voxFetch, voxIdsOf } from './vox.js?v=5';

export const MIXES = { swap: 'басовый своп', eq: 'EQ-блендинг', filter: 'фильтр', echo: 'эхо-выход' };
const pick = a => a[Math.floor(Math.random() * a.length)];

export class DJ {
  // ctx — общий AudioContext приложения
  constructor(ctx) {
    this.ctx = ctx;
    this.on = false;
    this.onChange = null; // сообщить интерфейсу: новый трек, переход, конец
  }

  // Сборка «пульта»: у каждой деки фильтр низа, фильтр верха, громкость и посыл в эхо; общий лимитер
  wire() {
    if (this.bus) return;
    const ctx = this.ctx, G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    this.bus = G(1);
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -1.5; lim.ratio.value = 20; lim.knee.value = 0; lim.attack.value = 0.002; lim.release.value = 0.1;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.stream = ctx.createMediaStreamDestination(); // для записи и эфира
    this.bus.connect(lim).connect(this.analyser).connect(ctx.destination);
    this.analyser.connect(this.stream);
    this.decks = [0, 1].map(() => {
      const d = { in: G(1), hp: ctx.createBiquadFilter(), lp: ctx.createBiquadFilter(), vol: G(0), echo: G(0) };
      d.hp.type = 'highpass'; d.hp.frequency.value = 10; d.hp.Q.value = 0.7;
      d.lp.type = 'lowpass'; d.lp.frequency.value = 20000; d.lp.Q.value = 0.7;
      const dl = ctx.createDelay(2), fb = G(0.55), eo = G(0.8);
      d.dl = dl;
      d.in.connect(d.hp).connect(d.lp).connect(d.vol).connect(this.bus);
      d.lp.connect(d.echo).connect(dl).connect(fb).connect(dl);
      dl.connect(eo).connect(this.bus);
      return d;
    });
  }

  // Начать сет. minutes = 0 — без конца (энергия ходит волнами по часу)
  async start({ mood = 'night', minutes = 60 } = {}) {
    this.wire();
    this.mood = mood;
    this.minutes = minutes;
    this.on = true;
    this.t0 = this.ctx.currentTime + 0.3;
    this.count = 0;
    this.cur = null;
    this.next = null;
    const T = await this.prepare(null);
    this.play(0, T, this.t0, null);
    this.prepareNext();
  }

  stop() {
    this.on = false;
    const now = this.ctx.currentTime;
    for (const k of [this.cur, this.next]) if (k && k.engine) { k.engine.stop(); }
    if (this.decks) for (const d of this.decks) { d.vol.gain.cancelScheduledValues(now); d.vol.gain.setTargetAtTime(0, now, 0.05); d.echo.gain.setTargetAtTime(0, now, 0.05); }
    this.cur = this.next = null;
    this.onChange?.('stop');
  }

  // Где мы в сете (0…1) — от этого настроение и темп следующего трека
  pos(t) {
    const el = (t - this.t0) / 60;
    return this.minutes ? Math.min(1, el / this.minutes) : (el % 60) / 60;
  }

  async prepare(prev) {
    const T = makeTrack(this.pos(this.ctx.currentTime + (prev ? 240 : 0)), this.mood, prev);
    T.n = ++this.count;
    await voxFetch(voxIdsOf(T.state)); // голос и звуки FL — заранее
    return T;
  }
  async prepareNext() {
    if (!this.cur || this.next) return;
    const A = this.cur.T;
    // Сет заданной длины: если после этого трека время вышло — следующего не будет, трек доиграет до конца
    if (this.minutes && (this.cur.start - this.t0) + A.times[A.bars] > this.minutes * 60 - 30) { this.last = true; return; }
    this.next = { T: await this.prepare(A) };
    this.onChange?.('next');
  }

  // Поставить трек T на деку k со времени at. mix — как он входит (для первого трека — null)
  play(k, T, at, mix) {
    const e = new Engine(() => T.state), deck = this.decks[k];
    const slot = { k, T, engine: e, start: at, endBar: T.bars, mix };
    e.init(this.ctx, deck.in);
    e.mode = 'song';
    e.barFn = b => {
      if (b >= slot.endBar) return null;
      T.state.bpm = T.bpmAt(b);
      slot.bar = b;
      return barData(T.state, b);
    };
    e.onSongBar = (b, t0) => this.bar(slot, b, t0);
    e.onSongEnd = t => { setTimeout(() => { e.stop(); if (this.cur === slot) this.finish(); }, Math.max(0, (t - this.ctx.currentTime) * 1000) + 3500); };
    e.start(at);
    if (!mix) { deck.vol.gain.setValueAtTime(1, at); deck.hp.frequency.setValueAtTime(10, at); deck.lp.frequency.setValueAtTime(20000, at); }
    this.cur = this.cur || slot;
    this.onChange?.('play');
    return slot;
  }

  finish() { // последний трек доиграл
    if (this.last) this.stop();
  }

  // Каждый такт текущей деки: пора ли начинать переход
  bar(slot, b, t0) {
    slot.barT0 = t0;
    if (slot !== this.cur || !this.on) return;
    const A = slot.T, X = A.xout, startBar = slot.force != null ? slot.force : A.bars - X;
    if (b === startBar - 8 && !this.next && !this.last) this.prepareNext();
    if (b !== startBar || !this.next) return;
    // Переход: следующий трек — на свободной деке с начала этого такта, в темпе текущего
    const B = this.next.T, mix = this.forceMix || pick(Object.keys(MIXES)), bar = 240 / A.bpmAt(b); // forceMix — заказать переход (проверки)
    slot.endBar = b + X;
    const nb = this.play(1 - slot.k, B, t0, mix);
    this.transition(slot, nb, mix, t0, bar, X);
    this.prev = slot;
    this.cur = nb;
    this.next = null;
    this.mixName = MIXES[mix];
    this.onChange?.('mix');
  }

  // Автоматика пульта на переход: X тактов, своп — на сильной доле в середине
  transition(a, b, mix, t0, bar, X) {
    const A = this.decks[a.k], B = this.decks[b.k], sw = Math.max(8, Math.round(X / 2 / 8) * 8);
    const tSw = t0 + sw * bar, tEnd = t0 + X * bar;
    const lin = (p, v, t) => p.linearRampToValueAtTime(v, t), exp = (p, v, t) => p.exponentialRampToValueAtTime(v, t);
    const at = (p, v, t) => { p.cancelScheduledValues(t); p.setValueAtTime(v, t); };
    at(B.hp.frequency, 10, t0); at(B.lp.frequency, 20000, t0); at(B.vol.gain, 0, t0); at(B.echo.gain, 0, t0);
    if (mix === 'swap') {
      at(B.hp.frequency, 220, t0); lin(B.vol.gain, 1, t0 + 8 * bar);          // входит без низа
      at(B.hp.frequency, 10, tSw); at(A.hp.frequency, 220, tSw);                  // своп на сильной доле
      at(A.vol.gain, 1, tSw); lin(A.vol.gain, 0, tEnd);
    } else if (mix === 'eq') {
      at(B.hp.frequency, 700, t0); lin(B.vol.gain, 1, t0 + 8 * bar); exp(B.hp.frequency, 10, tSw + 4 * bar);
      at(A.hp.frequency, 10, t0 + 4 * bar); exp(A.hp.frequency, 700, tSw + 4 * bar);
      at(A.vol.gain, 1, tSw); lin(A.vol.gain, 0, tEnd);
    } else if (mix === 'filter') {
      at(B.hp.frequency, 1500, t0); lin(B.vol.gain, 1, t0 + 4 * bar); exp(B.hp.frequency, 10, tSw);
      at(A.lp.frequency, 20000, t0); exp(A.lp.frequency, 250, tSw); at(A.hp.frequency, 10, tSw);
      at(A.vol.gain, 1, tSw); lin(A.vol.gain, 0, tSw + 4 * bar);
    } else { // echo
      at(B.hp.frequency, 300, t0); lin(B.vol.gain, 0.7, tSw - bar);
      A.dl.delayTime.setValueAtTime(bar * 3 / 16, t0);
      at(A.echo.gain, 0, tSw - bar / 2); lin(A.echo.gain, 1, tSw);                // старый трек — в эхо…
      at(A.vol.gain, 1, tSw); lin(A.vol.gain, 0, tSw + bar / 8);                  // …и выключается на сильной доле
      lin(A.echo.gain, 0, tSw + 4 * bar);
      at(B.hp.frequency, 10, tSw); at(B.vol.gain, 1, tSw);                        // новый — сразу полностью
    }
  }

  // Пропустить: переход к следующему треку на ближайшей границе фразы (кратно 8 тактам)
  skip() {
    const s = this.cur;
    if (!s || !this.next || s.bar == null) return false;
    s.force = Math.min(s.T.bars - s.T.xout, Math.ceil((s.bar + 2) / 8) * 8);
    return true;
  }

  // Что показать на экране
  status() {
    const s = this.cur;
    if (!this.on || !s) return null;
    const T = s.T, b = s.bar ?? 0, d = barData(T.state, Math.min(b, T.bars - 1));
    const startBar = s.force != null ? s.force : T.bars - T.xout, toMix = (startBar - b) * 240 / T.bpmAt(b);
    return {
      n: T.n, name: T.name, bpm: Math.round(T.bpmAt(b)), part: d ? PART[d.type].name : '', bar: b, bars: T.bars,
      elapsed: this.ctx.currentTime - this.t0, next: this.next ? { name: this.next.T.name, bpm: this.next.T.bpm } : null,
      toMix: this.next && b < startBar ? toMix : null, mixing: this.prev && this.prev.engine.playing ? this.mixName : null,
      last: !!this.last, mood: MOODS[this.mood].name,
    };
  }
}
