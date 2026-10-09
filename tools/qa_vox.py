"""Проверка адлибов на слух: Whisper распознаёт каждую фразу и сравнивает с текстом.

Запуск — питоном «Эхо»:
    ..\\..\\.venv\\Scripts\\python.exe qa_vox.py [--only bad]
Пишет vox/qa.json: {id: [похожесть 0..1, что распознано]}; плохие id — в vox/bad.json.
"""
import argparse, difflib, json, re, subprocess
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'vox'
FFMPEG = HERE.parent.parent / 'data' / 'bin' / 'ffmpeg.exe'
ASR = 'openai/whisper-large-v3-turbo'


def norm(t, lang):
    from num2words import num2words
    t = t.lower().replace('ё', 'е')
    t = re.sub(r'\d+', lambda m: ' ' + num2words(int(m.group()), lang=lang) + ' ', t)
    return re.sub(r'[^a-zа-я]', '', t)


def decode(path):
    raw = subprocess.run([str(FFMPEG), '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def verdict(clip, heard):
    """Похожесть услышанного на текст и годится ли фраза."""
    cid, text, cat, lang = clip[0], clip[1], clip[2], clip[3]
    a, b = norm(text, lang), norm(heard, lang)
    sim = difflib.SequenceMatcher(None, a, b).ratio() if a and b else 0.0
    # Междометия («Ха!», «Уу!», «Shhh») распознаются как угодно — им хватит, чтобы не было лишних слов
    if cat == 'shout' or len(a) <= 5:
        ok = len(b) <= max(12, len(a) * 3)
    else:
        ok = sim >= 0.5
    return sim, ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    args = ap.parse_args()
    import torch
    from transformers import pipeline
    try:  # видеопамяти может не хватить (рядом работает «Эхо») — тогда на процессоре, медленнее
        asr = pipeline('automatic-speech-recognition', model=ASR, dtype=torch.float16, device='cuda:0')
        asr({'raw': np.zeros(16000, dtype=np.float32), 'sampling_rate': 16000})
    except Exception as e:
        print('GPU недоступен, считаю на процессоре:', str(e)[:80], flush=True)
        torch.cuda.empty_cache()
        asr = pipeline('automatic-speech-recognition', model=ASR, dtype=torch.float32, device=-1)
    idx = json.loads((OUT / 'index.json').read_text('utf-8'))
    qa_path = OUT / 'qa.json'
    qa = json.loads(qa_path.read_text('utf-8')) if qa_path.exists() else {}
    clips = idx['clips']
    if args.only == 'bad':
        bad = set(json.loads((OUT / 'bad.json').read_text('utf-8')))
        clips = [c for c in clips if c[0] in bad]
    lang_name = {'en': 'english', 'ru': 'russian'}
    for k, c in enumerate(clips):
        path = OUT / f'{c[0]}.mp3'
        if not path.exists() or (c[0] in qa and args.only != 'bad'):
            continue  # уже проверена
        out = asr({'raw': decode(path), 'sampling_rate': 16000}, generate_kwargs={'task': 'transcribe', 'language': lang_name[c[3]]})
        heard = (out.get('text') or '').strip()
        sim, ok = verdict(c, heard)
        qa[c[0]] = [round(sim, 3), heard, ok]
        if (k + 1) % 100 == 0:
            print(f'{k + 1}/{len(clips)}', flush=True)
            qa_path.write_text(json.dumps(qa, ensure_ascii=False), 'utf-8')
    qa_path.write_text(json.dumps(qa, ensure_ascii=False), 'utf-8')
    bad = [c[0] for c in idx['clips'] if c[0] in qa and not qa[c[0]][2]]
    (OUT / 'bad.json').write_text(json.dumps(bad), 'utf-8')
    print('проверено', len(clips), 'плохих', len(bad), flush=True)


if __name__ == '__main__':
    main()
