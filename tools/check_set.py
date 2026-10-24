"""Проверка сведения сета: попадают ли бочки нового трека в долю старого.
Сравнивает фазу ударов в низу за 12 с до момента свопа низа и 12 с после — по сетке темпа старого трека.
Запуск: python tools/check_set.py сет.wav '[[старт, своп, bpm], ...]'
"""
import json, subprocess, sys
from pathlib import Path

import numpy as np

FFMPEG = Path(__file__).resolve().parent.parent.parent / 'data' / 'bin' / 'ffmpeg.exe'
SR = 11025


def clip(path, t0, dur):
    raw = subprocess.run([str(FFMPEG), '-v', 'error', '-ss', str(t0), '-t', str(dur), '-i', str(path), '-af', 'lowpass=f=120,lowpass=f=120',
                          '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def onsets(x):
    hop = 32
    n = x.size // hop
    e = np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1))
    d = np.maximum(0, np.diff(e))
    thr = d.max() * 0.3
    idx = [i for i in range(1, d.size - 1) if d[i] > thr and d[i] >= d[i - 1] and d[i] >= d[i + 1]]
    out, last = [], -999
    for i in idx:  # не чаще раза в 0,2 с
        if i - last > 0.2 * SR / hop:
            out.append(i * hop / SR)
            last = i
    return np.array(out)


def phase(times, t0, beat):
    """Средняя фаза ударов (мс от доли) и её устойчивость (1 — все удары в одну точку)."""
    ph = ((times + t0) % beat) / beat * 2 * np.pi
    z = np.exp(1j * ph).mean()
    return (np.angle(z) % (2 * np.pi)) / (2 * np.pi) * beat * 1000, abs(z)


def profile(x, t0, beat, n=96):
    """Громкость низа, сложенная по долям: острый пик — бочка, бас размазывается."""
    hop = 16
    m = x.size // hop
    e = np.sqrt(np.mean(x[: m * hop].reshape(m, hop) ** 2, axis=1))
    t = t0 + np.arange(m) * hop / SR
    bins = ((t % beat) / beat * n).astype(int) % n
    prof = np.bincount(bins, weights=e, minlength=n) / np.maximum(np.bincount(bins, minlength=n), 1)
    return prof - prof.mean()


def main(path, plan):
    bad = 0
    for k, (start, swap, bpm) in enumerate(plan):
        beat, n = 60 / bpm, 96
        pa = profile(clip(path, swap - 12, 12), swap - 12, beat, n)
        pb = profile(clip(path, swap, 12), swap, beat, n)
        xc = np.array([np.dot(pa, np.roll(pb, -s)) for s in range(n)])
        lag = int(np.argmax(xc))
        diff = (lag if lag < n / 2 else lag - n) * beat / n * 1000
        sharp = pa.max() / (np.abs(pa).mean() + 1e-12)
        ok = abs(diff) < 15
        bad += not ok
        print(f'переход {k + 1}->{k + 2} на {swap / 60:5.2f} мин: сдвиг ударов {diff:+6.1f} мс (чёткость удара {sharp:.1f}) {"OK" if ok else "МИМО"}')
    print('плохих переходов:', bad)


if __name__ == '__main__':
    main(sys.argv[1], json.loads(sys.argv[2]))
