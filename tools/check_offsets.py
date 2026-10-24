"""Точность сведения сета: где в миксе на самом деле начинается каждый трек (сверка верха микса с файлом трека).
Запуск: python tools/check_offsets.py local/renders/hour1 '[старт2, старт3, ...]'
"""
import json, subprocess, sys
from pathlib import Path

import numpy as np

FFMPEG = Path(__file__).resolve().parent.parent.parent / 'data' / 'bin' / 'ffmpeg.exe'
SR = 8000


def hi(path, t0, dur):
    raw = subprocess.run([str(FFMPEG), '-v', 'error', '-ss', str(max(0, t0)), '-t', str(dur), '-i', str(path), '-af', 'highpass=f=2500',
                          '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    hop = 8  # огибающая с шагом 1 мс
    n = x.size // hop
    e = np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1))
    return e - e.mean()


def main(prefix, starts):
    bad = 0
    for k, s in enumerate(starts, start=1):
        trk = hi(f'{prefix}_t{k:02d}.wav', 20, 30)       # 30 с трека, с 20-й секунды (свой звук уже вошёл)
        mix = hi(f'{prefix}.wav', s + 20 - 0.5, 31)        # то же место в миксе ± полсекунды
        xc = np.correlate(mix, trk, 'valid')
        lag = int(np.argmax(xc)) - 500                      # мс относительно плана
        ok = abs(lag) <= 3
        bad += not ok
        print(f'трек {k + 1}: в миксе на {lag:+d} мс от плана {"OK" if ok else "СДВИГ"}')
    print('сдвинутых:', bad)


if __name__ == '__main__':
    main(sys.argv[1], json.loads(sys.argv[2]))
