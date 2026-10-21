"""Инструменты FL Studio (рояль, Rhodes, струнные, хор, медь...) как сэмплер для «Пульса».

Файлы в FL подписаны номерами, без нот, — поэтому высоту каждого определяем сами (автокорреляция),
и пишем local/fl/inst.json: {инструмент: [[id, midi], ...]}. Только для «Пульса» на этом компьютере.
Запуск после tools/fl_import.py:  python tools/fl_instruments.py
"""
import json, re, subprocess
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'local' / 'fl'
FFMPEG = HERE.parent.parent / 'data' / 'bin' / 'ffmpeg.exe'
SR = 22050
NOTES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
NOTE_RX = re.compile(r'(?<![A-Za-z])([A-Ga-g])(#|s|b)?(-?\d)(?!\d)\s*$')


def decode(path):
    raw = subprocess.run([str(FFMPEG), '-v', 'error', '-i', str(path), '-t', '1.5', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def pitch(x):
    """Основная частота (Гц) по устойчивой части звука: нормированная разностная функция (YIN)."""
    if x.size < SR * 0.2:
        return None
    i0 = int(np.argmax(np.abs(x) > np.abs(x).max() * 0.3))
    seg = x[i0 + int(0.05 * SR): i0 + int(0.05 * SR) + 4096]
    if seg.size < 4096:
        return None
    W, lo, hi = 2048, int(SR / 1500), int(SR / 30)
    d = np.array([np.sum((seg[:W] - seg[t:t + W]) ** 2) for t in range(hi)])
    cm = d[1:] * np.arange(1, hi) / np.maximum(np.cumsum(d[1:]), 1e-12)
    cm = np.concatenate([[1.0], cm])
    for t in range(lo, hi - 1):
        if cm[t] < 0.15 and cm[t] <= cm[t + 1]:
            a, b, c = cm[t - 1], cm[t], cm[t + 1]
            shift = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) else 0
            return SR / (t + shift)
    t = lo + int(np.argmin(cm[lo:hi]))
    return SR / t if cm[t] < 0.35 else None


def main():
    idx = json.loads((OUT / 'index.json').read_text('utf-8'))
    groups = defaultdict(list)
    for it in idx['items']:
        if it['cat'] != 'inst':
            continue
        # Инструмент = папка (Keyboard/Rhodes, Orchestral/Strings Section...)
        groups[it.get('dir', '').split('/')[-1] or it['name']].append(it)
    out, gains = {}, {}
    for name, items in sorted(groups.items()):
        if len(items) < 4:
            continue  # одиночные звуки — не инструмент
        notes = []
        for it in items:
            m = NOTE_RX.search(it['name'])
            if m:  # нота в имени: «OSTR C3», «Strings A#2»
                notes.append([it['id'], 12 * (int(m[3]) + 1) + NOTES[m[1].upper()] + (1 if m[2] in ('#', 's') else -1 if m[2] == 'b' else 0)])
                continue
            f = pitch(decode(OUT / it['file']))
            if f and 25 < f < 2500:
                notes.append([it['id'], round(69 + 12 * np.log2(f / 440))])
        if len(notes) >= 4:
            notes.sort(key=lambda n: n[1])
            out[name] = notes
            # Громкость инструмента (средняя по записям) → поправка, чтобы все звучали ровно
            lv = []
            for nid, _ in notes[:: max(1, len(notes) // 8)]:
                x = decode(OUT / next(i['file'] for i in items if i['id'] == nid))
                if x.size:
                    lv.append(20 * np.log10(np.sqrt(np.mean(x[: SR] ** 2)) + 1e-9))
            gains[name] = round(float(np.clip(10 ** ((-16 - np.mean(lv)) / 20), 0.3, 8)), 2) if lv else 1
            print(f'{name}: {len(notes)} нот, {notes[0][1]}–{notes[-1][1]}', flush=True)
    out['_gain'] = gains
    (OUT / 'inst.json').write_text(json.dumps(out, ensure_ascii=False), 'utf-8')
    print('инструментов:', len(out))


if __name__ == '__main__':
    main()
