"""Разбор трека «на слух приборами»: темп, бочка, румбл, хэты, сжатие, баланс частот, стерео.
Запуск: python tools/analyze_ref.py файл.wav [файл2.wav ...]
"""
import subprocess, sys
from pathlib import Path

import numpy as np

FFMPEG = Path(__file__).resolve().parent.parent.parent / 'data' / 'bin' / 'ffmpeg.exe'
SR = 22050


def load(path):
    raw = subprocess.run([str(FFMPEG), '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)
    return x[:, 0], x[:, 1]


def band(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(x.size, 1 / SR)
    X[(f < lo) | (f >= hi)] = 0
    return np.fft.irfft(X, x.size)


def db(v):
    return 20 * np.log10(max(v, 1e-12))


def env(x, hop):
    n = x.size // hop
    return np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1))


def tempo(low, hop):
    e = env(low, hop)
    o = np.maximum(0, np.diff(e))
    o -= o.mean()
    ac = np.correlate(o, o, 'full')[o.size - 1:]
    fps = SR / hop
    best, bpm = 0, 0
    for b in np.arange(100, 185, 0.25):
        lag = 60 / b * fps
        i = int(round(lag))
        if i * 4 >= ac.size:
            continue
        s = ac[i] + 0.5 * ac[2 * i] + 0.25 * ac[4 * i]
        if s > best:
            best, bpm = s, b
    return bpm


def main(path):
    L, R = load(path)
    m = (L + R) / 2
    side = (L - R) / 2
    rms = np.sqrt(np.mean(m ** 2))
    bands = [(20, 120), (120, 500), (500, 2000), (2000, 6000), (6000, 11000)]
    rel = [db(np.sqrt(np.mean(band(m, lo, hi) ** 2))) - db(rms) for lo, hi in bands]
    low = band(m, 30, 150)
    hop = 128
    bpm = tempo(low, hop)
    # Бочка: удары по низу — пики огибающей с шагом в долю
    e = env(low, hop)
    fps = SR / hop
    beat = 60 / bpm * fps
    peaks = [i for i in range(2, e.size - 2) if e[i] == e[max(0, i - int(beat * 0.4)):i + int(beat * 0.4)].max() and e[i] > e.max() * 0.35]
    f0s, decays, drives = [], [], []
    for p in peaks[:200]:
        s = p * hop
        seg = m[s + int(0.03 * SR): s + int(0.16 * SR)]
        if seg.size < 256:
            continue
        S = np.abs(np.fft.rfft(seg * np.hanning(seg.size), 8192))
        f = np.fft.rfftfreq(8192, 1 / SR)
        lo = (f > 35) & (f < 130)
        f0s.append(f[lo][np.argmax(S[lo])])
        # Перегруз: доля гармоник 150–1000 Гц к основному тону внутри удара
        drives.append(db(S[(f > 150) & (f < 1000)].sum()) - db(S[lo].sum()))
        tail = e[p: p + int(beat)]
        below = np.nonzero(tail < e[p] * 0.1)[0]
        decays.append((below[0] if below.size else tail.size) / fps * 1000)
    # Румбл: сколько низа звучит между ударами (доля от удара)
    gaps = [e[p + int(beat * 0.45): p + int(beat * 0.8)].mean() / max(e[p], 1e-9) for p in peaks[:200] if p + int(beat) < e.size]
    # Хэты: сколько ударов верха на долю
    hi = env(band(m, 6000, 11000), 64)
    ho = np.maximum(0, np.diff(hi))
    thr = ho.mean() + 2 * ho.std()
    hits = np.sum((ho[1:-1] > thr) & (ho[1:-1] >= ho[:-2]) & (ho[1:-1] >= ho[2:]))
    beats = m.size / SR / (60 / bpm)
    crest = db(np.abs(m).max()) - db(rms)
    print(f'\n== {Path(path).name}')
    print(f'темп {bpm:.1f} BPM · громкость RMS {db(rms):.1f} дБ · пик/RMS (сжатие) {crest:.1f} дБ · стерео (side к общему) {db(np.sqrt(np.mean(side ** 2))) - db(rms):.1f} дБ')
    print('баланс к общему, дБ:  <120 {:.1f} | 120-500 {:.1f} | 500-2k {:.1f} | 2k-6k {:.1f} | >6k {:.1f}'.format(*rel))
    if f0s:
        print(f'бочка: основной тон {np.median(f0s):.0f} Гц · затухание до −20 дБ {np.median(decays):.0f} мс · перегруз (гармоники к основе) {np.median(drives):.1f} дБ')
    if gaps:
        print(f'румбл: низ между ударами = {np.median(gaps) * 100:.0f}% от удара')
    print(f'хэты/верх: {hits / beats:.1f} ударов на долю')


if __name__ == '__main__':
    for p in sys.argv[1:]:
        main(p)
