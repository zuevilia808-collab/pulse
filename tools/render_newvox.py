"""Новые голоса для адлибов: тембр «с нуля» из сдвинутого образца готового голоса.

Берём несколько фраз готового голоса (vox/*.mp3), сдвигаем высоту и форманты (ffmpeg) — получается
образец другого человека. Базовая модель Qwen3-TTS по этому образцу (только тембр, x-vector) озвучивает
фразы заново — голос звучит естественно, потому что фразу целиком произносит нейросеть.

Запуск — питоном «Эхо», видеокарта должна быть свободна (закрыть «Эхо»):
    ..\\..\\.venv\\Scripts\\python.exe render_newvox.py [--per 2] [--limit N]
Дописывает vox/<id>.mp3 и vox/index.json.
"""
import argparse, json, subprocess, sys, time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from render_vox import OUT, FFMPEG, LANG, VOICES, clip_id, trim, onsets, encode, index  # noqa: E402
from vox_phrases import phrases  # noqa: E402

BASE = 'Qwen/Qwen3-TTS-12Hz-0.6B-Base'
REFS = HERE / 'voice_refs'
# id: (имя, пол, из какого голоса, сдвиг в полутонах)
NEW = {
    'bruno': ('Бруно', 'm', 'ryan', -3.0),
    'grom': ('Гром', 'm', 'uncle_fu', -3.5),
    'max': ('Макс', 'm', 'aiden', -2.0),
    'tim': ('Тим', 'm', 'dylan', 2.0),
    'mia': ('Мия', 'f', 'vivian', -2.5),
    'nika': ('Ника', 'f', 'serena', -3.0),
    'zoya': ('Зоя', 'f', 'sohee', 2.0),
}


def make_ref(vid, src, semis, clips):
    """Образец нового голоса: ~10 секунд фраз исходного голоса со сдвигом высоты и формант."""
    REFS.mkdir(exist_ok=True)
    out = REFS / f'{vid}.wav'
    if out.exists():
        return out
    files = [OUT / f'{c[0]}.mp3' for c in clips if c[4] == src and c[3] == 'en' and 900 < c[5] < 2500][:8]
    k = 2 ** (semis / 12)
    inputs = sum([['-i', str(f)] for f in files], [])
    chain = ''.join(f'[{i}:a]' for i in range(len(files))) + f'concat=n={len(files)}:v=0:a=1,aresample=24000,asetrate={int(24000 * k)},aresample=24000,atempo={1 / k:.4f}[a]'
    subprocess.run([str(FFMPEG), '-v', 'error', '-y', *inputs, '-filter_complex', chain, '-map', '[a]', '-ac', '1', str(out)], check=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--per', type=int, default=2)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--only', default='', help='только эти голоса, через запятую')
    args = ap.parse_args()
    idx = json.loads((OUT / 'index.json').read_text('utf-8'))
    clips = idx['clips']
    have = {c[0] for c in clips}
    new = {k: v for k, v in NEW.items() if not args.only or k in args.only.split(',')}
    refs = {vid: make_ref(vid, src, semis, clips) for vid, (_, _, src, semis) in new.items()}

    import torch
    from faster_qwen3_tts import FasterQwen3TTS
    tts = FasterQwen3TTS.from_pretrained(BASE, device='cuda', dtype=torch.bfloat16)
    tts.warmup()

    ids = list(new)
    jobs = []
    for i, p in enumerate(phrases()):
        for k in range(args.per):
            jobs.append((p, ids[(i * args.per + k) % len(ids)]))
    if args.limit:
        jobs = jobs[:args.limit]
    voices = {**VOICES, **{k: (v[0], v[1]) for k, v in NEW.items()}}
    t0, done = time.time(), 0
    for n, (p, v) in enumerate(jobs):
        cid = clip_id(v, p['text'])
        if cid in have and (OUT / f'{cid}.mp3').exists():
            continue
        limit = 0.6 + 0.07 * sum(ch.isalpha() for ch in p['text'])
        best, sr = None, 24000
        for attempt in range(3):
            torch.manual_seed(int(cid, 16) % 2**31 + attempt * 7919)
            wavs, sr = tts.generate_voice_clone(text=p['text'], language=LANG[p['lang']], ref_audio=str(refs[v]), ref_text='',
                                                xvec_only=True, max_new_tokens=int((limit * 1.6 + 1) * 12.5))
            a = trim(np.asarray(wavs[0], dtype=np.float32), sr)
            if a.size and (best is None or a.size < best.size):
                best = a
            if a.size and a.size / sr <= limit:
                break
        if best is None or best.size < sr * 0.08:
            continue
        encode(best, sr, OUT / f'{cid}.mp3')
        clips.append([cid, p['text'], p['cat'], p['lang'], v, int(best.size / sr * 1000), onsets(best, sr)])
        have.add(cid)
        done += 1
        if done % 25 == 0:
            print(f'{n + 1}/{len(jobs)}  {(time.time() - t0) / done:.2f} с на фразу', flush=True)
            (OUT / 'index.json').write_text(json.dumps({**index(clips), 'voices': {k: list(x) for k, x in voices.items()}}, ensure_ascii=False, separators=(',', ':')), 'utf-8')
    (OUT / 'index.json').write_text(json.dumps({**index(clips), 'voices': {k: list(x) for k, x in voices.items()}}, ensure_ascii=False, separators=(',', ':')), 'utf-8')
    print('готово: новых', done, 'всего', len(clips), f'{time.time() - t0:.0f} с', flush=True)


if __name__ == '__main__':
    main()
