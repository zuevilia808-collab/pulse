// Голос → музыка: захват микрофона, распознавание высоты (YIN) и битбокса (спектральный поток).
import { SCALES, snap } from './music.js?v=5';

export class Mic {
  constructor(engine) {
    this.engine = engine;
    this.stream = null;
    this.chunks = [];
    this.inLatency = 0.015;
    this.buf = new Float32Array(1024);
  }

  get live() { return !!this.stream && this.stream.getAudioTracks().some(t => t.readyState === 'live'); }

  async ensure() {
    if (this.live) return;
    const ctx = this.engine.ctx;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    this.stream = stream;
    const s = (stream.getAudioTracks()[0].getSettings && stream.getAudioTracks()[0].getSettings()) || {};
    if (typeof s.latency === 'number' && s.latency > 0 && s.latency < 0.5) this.inLatency = s.latency;
    await this.engine.loadWorklet();
    this.cap?.disconnect();
    const src = this.src = ctx.createMediaStreamSource(stream);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 45;
    const notch = ctx.createBiquadFilter(); // вырезает щелчки метронома
    notch.type = 'notch';
    notch.frequency.value = 2500;
    notch.Q.value = 5;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.cap = new AudioWorkletNode(ctx, 'capture', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
      channelCount: 1, channelCountMode: 'explicit', processorOptions: { channels: 1 },
    });
    this.cap.port.onmessage = e => this.chunks.push({ t: e.data.frame / ctx.sampleRate, d: e.data.chans[0] });
    src.connect(hp).connect(notch).connect(this.cap).connect(this.engine.silent);
    src.connect(this.analyser);
  }

  // Отпустить микрофон: на телефоне его нельзя делить между записью и распознаванием речи.
  release() {
    if (!this.stream) return;
    this.stream.getTracks().forEach(t => t.stop());
    try { this.src.disconnect(); } catch { /* уже отключён */ }
    this.stream = null;
    this.analyser = null;
  }

  level() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    return Math.sqrt(s / this.buf.length);
  }

  begin() { this.chunks = []; this.cap.port.postMessage('on'); }

  async end() {
    this.cap.port.postMessage('off');
    await new Promise(r => setTimeout(r, 120));
  }

  // Кусок записи между t0 и t1 по часам AudioContext.
  slice(t0, t1) {
    const sr = this.engine.ctx.sampleRate, n = Math.max(0, Math.round((t1 - t0) * sr)), out = new Float32Array(n);
    for (const c of this.chunks) {
      const off = Math.round((c.t - t0) * sr), a = Math.max(0, -off), b = Math.min(c.d.length, n - off);
      if (b > a) out.set(c.d.subarray(a, b), off + a);
    }
    return out;
  }
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

// Высота тона по кадрам (10 мс). Перед анализом сигнал прореживается до ~16 кГц.
export function yinTrack(x, sr) {
  const f = Math.max(1, Math.round(sr / 16000)), sr2 = sr / f, n = Math.floor(x.length / f);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < f; k++) s += x[i * f + k]; y[i] = s / f; }
  const W = Math.round(0.03 * sr2), tMin = Math.floor(sr2 / 1100), tMax = Math.ceil(sr2 / 60), H = Math.round(0.01 * sr2);
  const d = new Float32Array(tMax + 2), frames = [];
  for (let st = 0; st + W + tMax + 1 <= n; st += H) {
    let e = 0;
    for (let j = 0; j < W; j++) e += y[st + j] * y[st + j];
    const rms = Math.sqrt(e / W);
    for (let tau = 1; tau <= tMax + 1; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) { const v = y[st + j] - y[st + j + tau]; s += v * v; }
      d[tau] = s;
    }
    d[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= tMax + 1; tau++) { run += d[tau]; d[tau] = run > 0 ? (d[tau] * tau) / run : 1; }
    let tau = -1;
    for (let t = tMin; t <= tMax; t++) {
      if (d[t] < 0.15) { while (t + 1 <= tMax && d[t + 1] < d[t]) t++; tau = t; break; }
    }
    if (tau < 0) { tau = tMin; for (let t = tMin; t <= tMax; t++) if (d[t] < d[tau]) tau = t; }
    let tf = tau;
    if (tau > 1) {
      const a = d[tau - 1], b = d[tau], c = d[tau + 1], den = a + c - 2 * b;
      if (den > 0) tf = tau + (a - c) / (2 * den);
    }
    frames.push({ t: (st + W / 2) / sr2, f0: sr2 / tf, conf: 1 - d[tau], rms });
  }
  return frames;
}

// Напетая партия → ноты на 16 шагах. pre — сколько секунд записи взято до начала такта.
export function humToNotes(x, sr, sd, nSteps = 16, pre = 0) {
  const fr = yinTrack(x, sr);
  if (!fr.length) return [];
  const rs = fr.map(f => f.rms).sort((a, b) => a - b);
  const peak = rs[rs.length - 1], floor = rs[Math.floor(rs.length * 0.1)];
  if (peak < 0.004) return [];
  const gate = Math.max(floor * 3, peak * 0.12, 0.003);
  for (const f of fr) {
    f.t -= pre;
    f.v = f.rms > gate && f.conf > 0.75 && f.f0 > 60 && f.f0 < 1100;
    f.m = 69 + 12 * Math.log2(f.f0 / 440);
  }
  // Сглаживаем высоту медианой по соседним кадрам — убирает случайные скачки на октаву.
  const sm = fr.map((f, i) => {
    if (!f.v) return f.m;
    const w = [];
    for (let j = Math.max(0, i - 2); j <= Math.min(fr.length - 1, i + 2); j++) if (fr[j].v) w.push(fr[j].m);
    return median(w);
  });

  // Слоги: непрерывные озвученные куски. Граница — пауза, провал громкости или смена высоты.
  const segs = [];
  let seg = null, miss = 0;
  const close = (t, legato) => {
    if (seg && seg.ms.length >= 4) { seg.t1 = t; seg.legatoNext = legato; segs.push(seg); }
    seg = null;
  };
  for (let i = 0; i < fr.length; i++) {
    const f = fr[i], m = sm[i];
    if (!f.v) {
      if (seg && ++miss >= 3) close(fr[i - miss + 1].t, false);
      continue;
    }
    miss = 0;
    if (seg) {
      const ref = median(seg.ms.slice(-6));
      const jump = Math.abs(m - ref) > 0.8 && [1, 2].every(k => fr[i + k] && fr[i + k].v && Math.abs(sm[i + k] - ref) > 0.8);
      const dip = f.rms < 0.5 * seg.peak && fr[i + 1] && fr[i + 1].rms > f.rms * 1.25;
      if (jump) { close(f.t, true); seg = { t0: f.t, ms: [], peak: 0, e: 0, slide: true }; }
      else if (dip) { close(f.t, false); continue; }
    }
    if (!seg) seg = { t0: f.t - 0.01, ms: [], peak: 0, e: 0, slide: false };
    seg.ms.push(m);
    seg.peak = Math.max(seg.peak, f.rms);
    seg.e += f.rms;
  }
  if (seg) close(fr[fr.length - 1].t, false);

  // Начало и конец слога округляются к ближайшему шагу.
  const notes = [];
  for (const g of segs) {
    let s = Math.round(g.t0 / sd);
    const end = Math.round(g.t1 / sd);
    if (s < 0) { if (g.t1 < sd * 0.5) continue; s = 0; }
    if (s >= nSteps) continue;
    const prev = notes[notes.length - 1];
    if (prev && s <= prev.step) {
      if (prev.step + 1 >= nSteps) continue;
      s = prev.step + 1;
    }
    if (prev && prev.step + prev.len > s) prev.len = s - prev.step;
    const len = Math.max(1, Math.min(nSteps - s, end - s));
    const m = median(g.ms);
    const adj = !!prev && prev.step + prev.len === s;
    if (g.slide && adj && Math.abs(prev.m - m) < 0.6) { prev.len += len; continue; }
    notes.push({ step: s, len, m, e: g.e / g.ms.length, slide: g.slide && adj });
  }
  return notes;
}

// Ноты из голоса → шаги дорожки в тональности трека. Тоника напетого определяется сама.
export function notesToSteps(notes, scale, track) {
  const sc = SCALES[scale] || SCALES.minor;
  const r = notes.map(n => Math.round(n.m));
  const pcOf = (m, T) => (((m - T) % 12) + 12) % 12;
  let bestT = 0, best = -1;
  for (let T = 0; T < 12; T++) {
    let score = pcOf(r[0], T) === 0 ? 1.2 : 0;
    notes.forEach((n, i) => {
      const pc = pcOf(r[i], T);
      if (sc.includes(pc)) score += n.len;
      if (pc === 0) score += 0.7 * n.len;
      if (pc === 7) score += 0.2 * n.len;
    });
    if (score > best) { best = score; bestT = T; }
  }
  const lo = Math.min(...r), anchor = lo - pcOf(lo, bestT);
  const maxE = Math.max(...notes.map(n => n.e));
  const out = Array(16).fill(null);
  notes.forEach((n, i) => {
    let rel = snap(r[i] - anchor, scale);
    while (rel > (track === 'bass' ? 19 : 24)) rel -= 12;
    out[n.step] = track === 'bass'
      ? { n: rel, len: n.len, acc: n.e > 0.82 * maxE, slide: n.slide }
      : { n: rel, len: n.len };
  });
  return out;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < h; j++) {
        const a = i + j, b = a + h;
        const vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr; im[a] += vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

// Битбокс → список ударов: время, «бочка / клэп / хэт», сила.
export function beatboxToHits(x, sr, pre = 0) {
  const N = 1024, H = 256, half = N / 2, binHz = sr / N;
  const nF = Math.floor((x.length - N) / H) + 1;
  if (nF < 4) return [];
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const re = new Float32Array(N), im = new Float32Array(N);
  const mags = [], flux = new Float32Array(nF), rmsT = new Float32Array(nF);
  // Поток считается по 24 полосам в логарифмической шкале, чтобы низкое «бум»
  // весило столько же, сколько широкополосное «тс».
  const NB = 24, edges = [];
  for (let b = 0; b <= NB; b++) {
    const k = Math.round((40 * (16000 / 40) ** (b / NB)) / binHz);
    edges.push(Math.min(half, Math.max(b ? edges[b - 1] + 1 : 1, k)));
  }
  let prev = null;
  for (let f = 0; f < nF; f++) {
    const o = f * H;
    let e = 0;
    for (let i = 0; i < N; i++) { const v = x[o + i]; e += v * v; re[i] = v * win[i]; im[i] = 0; }
    rmsT[f] = Math.sqrt(e / N);
    fft(re, im);
    const m = new Float32Array(half);
    for (let k = 0; k < half; k++) m[k] = Math.hypot(re[k], im[k]);
    const be = new Float32Array(NB);
    for (let b = 0; b < NB; b++) {
      let s = 0;
      for (let k = edges[b]; k < edges[b + 1]; k++) s += m[k] * m[k];
      be[b] = Math.log1p(s);
    }
    let fl = 0;
    if (prev) for (let b = 0; b < NB; b++) { const dl = be[b] - prev[b]; if (dl > 0) fl += dl; }
    flux[f] = fl;
    mags.push(m);
    prev = be;
  }
  let maxF = 0, maxR = 0;
  for (let f = 0; f < nF; f++) { maxF = Math.max(maxF, flux[f]); maxR = Math.max(maxR, rmsT[f]); }
  if (maxR < 0.008) return [];
  const hits = [], minGap = Math.round((0.06 * sr) / H);
  let last = -1e9;
  for (let f = 1; f < nF - 1; f++) {
    const loc = Array.from(flux.subarray(Math.max(0, f - 10), Math.min(nF, f + 11))).sort((a, b) => a - b);
    const thr = loc[loc.length >> 1] * 1.5 + 0.12 * maxF;
    if (!(flux[f] > thr && flux[f] >= flux[f - 1] && flux[f] >= flux[f + 1] && f - last >= minGap)) continue;
    let eA = 0;
    for (let k = f; k < Math.min(nF, f + 4); k++) eA = Math.max(eA, rmsT[k]);
    if (eA < Math.max(0.008, 0.08 * maxR)) continue;
    if (f >= 4 && eA < 1.6 * rmsT[f - 4]) continue; // громкость не выросла — это хвост, а не удар
    let E = 0, low = 0, high = 0, cen = 0;
    for (let k = f; k < Math.min(nF, f + 6); k++) {
      const m = mags[k];
      for (let b = 1; b < half; b++) {
        const p = m[b] * m[b], hz = b * binHz;
        E += p; cen += p * hz;
        if (hz < 220) low += p; else if (hz > 4500) high += p;
      }
    }
    if (E <= 0) continue;
    cen /= E;
    const h = { t: (f * H + N / 2) / sr - pre, cen, low: low / E, high: high / E, e: eA };
    h.cls = h.low > 0.3 || h.cen < 900 ? 'kick' : h.cen > 4200 || h.high > 0.45 ? 'hat' : 'clap';
    hits.push(h);
    last = f;
  }
  return hits;
}

export function hitsToPatterns(hits, sd) {
  const out = { kick: Array(16).fill(0), clap: Array(16).fill(0), hat: Array(16).fill(0) };
  const maxE = {};
  for (const h of hits) maxE[h.cls] = Math.max(maxE[h.cls] || 0, h.e);
  for (const h of hits) {
    const s = Math.round(h.t / sd);
    if (s < 0 || s > 15) continue;
    const r = h.e / maxE[h.cls], v = r > 0.75 ? 1 : r > 0.4 ? 0.85 : 0.55;
    out[h.cls][s] = Math.max(out[h.cls][s], v);
  }
  return out;
}
