// Снимает звук блоками по 2048 сэмплов и передаёт их вместе с номером первого кадра,
// чтобы запись можно было точно сопоставить с часами AudioContext.
class Capture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ch = (options.processorOptions && options.processorOptions.channels) || 1;
    this.size = 2048;
    this.on = false;
    this.buf = null;
    this.n = 0;
    this.frame0 = 0;
    this.port.onmessage = e => {
      if (e.data === 'on') this.on = true;
      else if (e.data === 'off') { this.flush(); this.on = false; }
    };
  }

  flush() {
    if (this.buf && this.n) {
      const chans = this.buf.map(b => b.slice(0, this.n));
      this.port.postMessage({ frame: this.frame0, chans }, chans.map(c => c.buffer));
    }
    this.buf = null;
    this.n = 0;
  }

  process(inputs) {
    const inp = inputs[0];
    if (!this.on || !inp || !inp.length) return true;
    if (!this.buf) {
      this.buf = Array.from({ length: this.ch }, () => new Float32Array(this.size));
      this.n = 0;
      this.frame0 = currentFrame;
    }
    for (let c = 0; c < this.ch; c++) this.buf[c].set(inp[Math.min(c, inp.length - 1)], this.n);
    this.n += inp[0].length;
    if (this.n >= this.size) this.flush();
    return true;
  }
}

registerProcessor('capture', Capture);
