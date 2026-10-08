// Распознавание речи в Chrome (Web Speech API, русский). Слушает непрерывно и само перезапускается.
export class Voice {
  constructor(h) {
    this.h = h;
    this.SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!this.SR;
    this.want = false;
    this.paused = false;
    this.rec = null;
    this.session = 0;
    this.fails = 0;
  }

  start() {
    if (!this.supported) return false;
    this.want = true;
    this.paused = false;
    this.fails = 0;
    this.spawn();
    return true;
  }

  stop() {
    this.want = false;
    clearTimeout(this.timer);
    if (this.rec) try { this.rec.stop(); } catch { /* уже остановлено */ }
    this.h.state?.('off');
  }

  pause() {
    this.paused = true;
    clearTimeout(this.timer);
    if (this.rec) try { this.rec.abort(); } catch { /* уже остановлено */ }
  }

  resume() {
    this.paused = false;
    if (this.want) this.spawn();
  }

  spawn() {
    if (this.rec || !this.want || this.paused) return;
    const r = new this.SR(), sid = ++this.session;
    r.lang = 'ru-RU';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.onstart = () => this.h.state?.('listening');
    r.onresult = e => {
      this.fails = 0;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i], key = sid + ':' + i;
        if (res.isFinal) this.h.final?.(Array.from(res, a => a.transcript), key);
        else this.h.interim?.(res[0].transcript, key);
      }
    };
    r.onerror = e => {
      this.lastError = e.error;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') this.want = false;
      if (e.error !== 'no-speech' && e.error !== 'aborted') this.fails++;
      this.h.error?.(e.error);
    };
    r.onend = () => {
      if (this.rec === r) this.rec = null;
      if (this.want && !this.paused) {
        const delay = this.fails ? Math.min(8000, 400 * 2 ** this.fails) : 150;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.spawn(), delay);
        if (this.fails) this.h.state?.('retry');
      } else this.h.state?.(this.paused ? 'paused' : 'off');
    };
    try {
      r.start();
      this.rec = r;
    } catch {
      this.h.error?.('start');
    }
  }
}
