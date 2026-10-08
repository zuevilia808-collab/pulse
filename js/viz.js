// Визуализация: лаймовое «поле» уходит к горизонту в темп, над горизонтом — спектр, бочка вспыхивает.
export class Viz {
  constructor(canvas, engine, getState) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.engine = engine;
    this.getState = getState;
    this.phase = 0;
    this.pulse = 0;
    this.kicks = [];
    this.last = performance.now();
    this.bins = new Uint8Array(1024);
    this.bars = new Float32Array(56);
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize() {
    const r = this.c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.c.width = Math.round(this.w * dpr);
    this.c.height = Math.round(this.h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  kick(t) { this.kicks.push(t); }

  draw() {
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const e = this.engine, st = this.getState(), g = this.g, w = this.w, h = this.h;
    this.phase += e.playing ? (dt * st.bpm) / 60 : dt * 0.12;
    if (e.ctx) {
      const ct = e.ctx.currentTime;
      while (this.kicks.length && this.kicks[0] <= ct) { this.kicks.shift(); this.pulse = 1; }
    }
    this.pulse *= Math.pow(0.015, dt);

    const hz = h * 0.5, vx = w / 2;
    g.clearRect(0, 0, w, h);

    // свечение горизонта
    const glow = g.createRadialGradient(vx, hz, 0, vx, hz, w * 0.55);
    glow.addColorStop(0, `rgba(212,255,58,${0.1 + this.pulse * 0.22})`);
    glow.addColorStop(1, 'rgba(212,255,58,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);

    // пол-сетка
    g.lineWidth = 1;
    const frac = this.phase % 1;
    for (let k = 0; k < 16; k++) {
      const d = k + 1 - frac;
      const y = hz + (h - hz) * (0.9 / d);
      if (y > h + 2) continue;
      g.strokeStyle = `rgba(212,255,58,${Math.min(0.32, 0.5 / d) + this.pulse * 0.08})`;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    for (let j = -14; j <= 14; j++) {
      const xb = vx + j * w * 0.085;
      g.strokeStyle = `rgba(212,255,58,${0.16 - Math.abs(j) * 0.006})`;
      g.beginPath(); g.moveTo(vx + j * 4, hz); g.lineTo(xb, h); g.stroke();
    }
    const fade = g.createLinearGradient(0, hz, 0, hz + 40);
    fade.addColorStop(0, 'rgba(10,11,8,0.9)');
    fade.addColorStop(1, 'rgba(10,11,8,0)');
    g.fillStyle = fade;
    g.fillRect(0, hz, w, 40);

    // спектр над горизонтом
    const n = this.bars.length;
    if (e.analyser) {
      e.analyser.getByteFrequencyData(this.bins);
      const sr = e.ctx.sampleRate, binHz = sr / 2 / this.bins.length;
      for (let i = 0; i < n; i++) {
        const f0 = 35 * Math.pow(14000 / 35, i / n), f1 = 35 * Math.pow(14000 / 35, (i + 1) / n);
        let m = 0;
        for (let b = Math.floor(f0 / binHz); b <= Math.ceil(f1 / binHz) && b < this.bins.length; b++) m = Math.max(m, this.bins[b]);
        this.bars[i] = Math.max(m / 255, this.bars[i] - dt * 1.6);
      }
    } else for (let i = 0; i < n; i++) this.bars[i] = Math.max(0, this.bars[i] - dt);
    const span = w * 0.9, bw = span / n, x0 = vx - span / 2, maxH = hz * 0.78;
    for (let i = 0; i < n; i++) {
      const v = this.bars[i], bh = Math.max(1.5, v * v * maxH);
      const x = x0 + i * bw;
      g.fillStyle = `rgba(212,255,58,${0.25 + v * 0.65})`;
      g.fillRect(x + 1, hz - bh, Math.max(1, bw - 2), bh);
      g.fillStyle = `rgba(212,255,58,${0.06 + v * 0.1})`;
      g.fillRect(x + 1, hz + 2, Math.max(1, bw - 2), bh * 0.35);
    }
    g.fillStyle = `rgba(232,255,160,${0.35 + this.pulse * 0.5})`;
    g.fillRect(0, hz, w, 1);
  }
}
