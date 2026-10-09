"""Озвучивает банк адлибов (tools/vox_phrases.py) готовыми голосами Qwen3-TTS CustomVoice.

Запуск — питоном «Эхо» (там стоят torch и faster-qwen3-tts):
    ..\\..\\.venv\\Scripts\\python.exe render_vox.py [--limit N] [--per 3]
Результат: vox/<id>.mp3 и vox/index.json. Уже готовые файлы не переозвучиваются.
"""
import argparse, hashlib, json, subprocess, sys, time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / 'vox'
FFMPEG = ROOT.parent / 'data' / 'bin' / 'ffmpeg.exe'
MODEL = 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice'
sys.path.insert(0, str(HERE))
from vox_phrases import CATS, phrases  # noqa: E402

# Голоса модели: имя для интерфейса и пол. Каждая фраза звучит и мужским, и женским голосом.
VOICES = {
    'ryan': ('Райан', 'm'), 'aiden': ('Эйден', 'm'), 'uncle_fu': ('Фу', 'm'), 'dylan': ('Дилан', 'm'),
    'vivian': ('Вивиан', 'f'), 'serena': ('Серена', 'f'), 'sohee': ('Сохи', 'f'), 'ono_anna': ('Анна', 'f'),
}
MALE = [v for v, (_, s) in VOICES.items() if s == 'm']
FEMALE = [v for v, (_, s) in VOICES.items() if s == 'f']
LANG = {'en': 'english', 'ru': 'russian'}


def voices_for(i, per):
    """Голоса для i-й фразы: по кругу, мужские и женские вперемешку."""
    m = [MALE[(i + k) % len(MALE)] for k in range(per)]
    f = [FEMALE[(i * 3 + k) % len(FEMALE)] for k in range(per)]
    nm = (per + (i % 2)) // 2
    return m[:nm] + f[:per - nm]


def clip_id(voice, text):
    return hashlib.md5(f'{voice}|{text}'.encode()).hexdigest()[:9]


def trim(a, sr):
    """Срезает тишину по краям и добавляет мягкие края."""
    env = np.abs(a)
    thr = max(env.max() * 0.02, 1e-4)
    idx = np.nonzero(env > thr)[0]
    if idx.size == 0:
        return a[:0]
    s = max(0, idx[0] - int(0.01 * sr))
    e = min(a.size, idx[-1] + int(0.06 * sr))
    a = a[s:e].copy()
    f = min(int(0.004 * sr), a.size // 4)
    if f:
        a[:f] *= np.linspace(0, 1, f)
        a[-f:] *= np.linspace(1, 0, f)
    return a


def onsets(a, sr):
    """Начала слогов (мс): рост огибающей после провала — для нарезки в «Пульсе»."""
    hop = int(sr * 0.01)
    n = a.size // hop
    if n < 3:
        return [0]
    env = np.sqrt(np.mean(a[:n * hop].reshape(n, hop) ** 2, axis=1))
    env = np.convolve(env, np.ones(3) / 3, mode='same')
    top = env.max() or 1
    k0 = int(np.argmax(env > top * 0.32))  # первая атака — это начало фразы
    out, low, last = [0], False, k0
    for k in range(k0 + 1, n):
        if env[k] < top * 0.18:
            low = True
        elif low and env[k] > top * 0.32 and k - last > 9:
            out.append(k * 10)
            last, low = k, False
    return out


def encode(a, sr, path):
    peak = np.abs(a).max() or 1
    pcm = (a / peak * 0.89 * 32767).astype('<i2').tobytes()
    subprocess.run([str(FFMPEG), '-v', 'error', '-y', '-f', 's16le', '-ar', str(sr), '-ac', '1', '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', '40k', str(path)], input=pcm, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--per', type=int, default=3)
    ap.add_argument('--redo', type=int, default=0, help='переозвучить фразы из vox/bad.json с другим зерном (номер попытки)')
    ap.add_argument('--drop', action='store_true', help='убрать из каталога фразы, которые так и остались в vox/bad.json')
    args = ap.parse_args()
    bad_path = OUT / 'bad.json'
    if args.drop:
        bad = set(json.loads(bad_path.read_text('utf-8')))
        idx = json.loads((OUT / 'index.json').read_text('utf-8'))
        idx['clips'] = [c for c in idx['clips'] if c[0] not in bad]
        for cid in bad:
            (OUT / f'{cid}.mp3').unlink(missing_ok=True)
        (OUT / 'index.json').write_text(json.dumps(idx, ensure_ascii=False, separators=(',', ':')), 'utf-8')
        bad_path.unlink(missing_ok=True)
        print('убрано', len(bad), 'осталось', len(idx['clips']), flush=True)
        return
    redo = set(json.loads(bad_path.read_text('utf-8'))) if args.redo else set()

    import torch
    from faster_qwen3_tts import FasterQwen3TTS
    tts = FasterQwen3TTS.from_pretrained(MODEL, device='cuda', dtype=torch.bfloat16)
    tts.warmup()

    OUT.mkdir(exist_ok=True)
    idx_path = OUT / 'index.json'
    old = {}
    if idx_path.exists():
        for c in json.loads(idx_path.read_text('utf-8'))['clips']:
            old[c[0]] = c

    ps = phrases()
    jobs = []
    for i, p in enumerate(ps):
        for v in voices_for(i, args.per):
            jobs.append((p, v))
    if args.limit:
        jobs = jobs[:args.limit]

    clips, t0, done = [], time.time(), 0
    for n, (p, v) in enumerate(jobs):
        cid = clip_id(v, p['text'])
        path = OUT / f'{cid}.mp3'
        if path.exists() and cid in old and cid not in redo:
            clips.append(old[cid])
            continue
        limit = 0.6 + 0.07 * sum(ch.isalpha() for ch in p['text'])  # бодрая речь: ~14 букв в секунду
        best = None
        for attempt in range(3):
            torch.manual_seed((int(cid, 16) + args.redo * 104729) % 2**31 + attempt * 7919)
            wavs, sr = tts.generate_custom_voice(text=p['text'], speaker=v, language=LANG[p['lang']],
                                                 max_new_tokens=int((limit * 1.6 + 1) * 12.5))
            a = trim(np.asarray(wavs[0], dtype=np.float32), sr)
            if a.size and (best is None or a.size < best.size):
                best = a
            if a.size and a.size / sr <= limit:
                break
        if best is None or best.size < sr * 0.08:
            print('  пусто:', v, p['text'], flush=True)
            continue
        encode(best, sr, path)
        clips.append([cid, p['text'], p['cat'], p['lang'], v, int(best.size / sr * 1000), onsets(best, sr)])
        done += 1
        if done % 25 == 0:
            el = time.time() - t0
            print(f'{n + 1}/{len(jobs)}  {el / done:.2f} с на фразу', flush=True)
            idx_path.write_text(json.dumps(index(clips), ensure_ascii=False, separators=(',', ':')), 'utf-8')
    idx_path.write_text(json.dumps(index(clips), ensure_ascii=False, separators=(',', ':')), 'utf-8')
    print('готово:', len(clips), 'новых', done, f'{time.time() - t0:.0f} с', flush=True)


def index(clips):
    return {'v': 1, 'cats': CATS, 'voices': {k: list(v) for k, v in VOICES.items()},
            'cols': ['id', 'text', 'cat', 'lang', 'voice', 'ms', 'on'], 'clips': clips}


if __name__ == '__main__':
    main()
