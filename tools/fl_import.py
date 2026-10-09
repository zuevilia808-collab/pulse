"""Звуки из FL Studio — только для «Пульса» на этом компьютере.

Берёт все паки из папки Packs FL Studio (родные и скачанные наборы), раскладывает по видам
и перекодирует в mp3 в techno/local/fl (папка в .gitignore — на GitHub и сайт не попадает:
лицензия Image-Line разрешает использовать звуки в своей музыке, но не раздавать их как файлы).

Запуск: python tools/fl_import.py   (можно ещё раз — готовые файлы пропускаются)
"""
import json, re, subprocess, hashlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / 'local' / 'fl'
FFMPEG = ROOT.parent / 'data' / 'bin' / 'ffmpeg.exe'
PACKS = Path(r'C:\Program Files\Image-Line\FL Studio 2024\Data\Patches\Packs')
AUDIO = {'.wav', '.wv', '.flac', '.ogg', '.mp3'}

# Вид звука по папке
DRUM_DIRS = {
    'kicks': 'kick', 'snares': 'clap', 'claps': 'clap', 'rims': 'clap', 'hats': 'hat', 'hi hats': 'hat', 'shakers': 'hat',
    'cymbals': 'ohat', 'percussion': 'perc', 'toms': 'perc', 'foley': 'fx', 'sfx': 'fx',
}
FL_DIRS = {'Drums', 'Drums (ModeAudio)', 'Risers', 'SFX', 'Vocals', 'Legacy', 'Loops', 'Instruments', 'FLEX'}
CAT_RU = {'808': 'Басы 808', 'loop': 'Лупы', 'inst': 'Инструменты', 'kick': 'Бочки', 'clap': 'Клэпы и снейры', 'hat': 'Хэты', 'ohat': 'Открытые хэты и тарелки', 'perc': 'Перкуссия',
          'riser': 'Райзеры', 'impact': 'Удары', 'down': 'Спуски', 'fx': 'Эффекты и приколы', 'vocal': 'Вокал'}
# Вокальные фразы → темы адлибов
VOC_CATS = [('house', r'house|jack|baby|rock me|introduce|smash|remember'), ('body', r'dance|shake|move|jump|push|spin|kick'),
            ('shout', r'^(hey|yeah|oh yeah|ok|ahh|ooh|mmh|la la|wait)\b'), ('hype', r'.')]


# Вид по названию папки или файла (для скачанных наборов): первое совпадение
KEYS = [('808', r'\b808'), ('ohat', r'open|\boh\b|crash|ride|cymbal'), ('kick', r'kick|\bbd\b'), ('clap', r'snr|snare|clap|rim'),
        ('hat', r'\bhh\b|hat|shaker'), ('perc', r'perc|tom|conga|bongo|cowbell|clave'), ('vocal', r'vocal|\bvox\b|\bvoc\b|chant'),
        ('loop', r'loop'), ('inst', r'bass|chord|keys|keyboard|guitar|orchestral|piano|pluck|lead|synth|one ?shot'),
        ('fx', r'sfx|\bfx\b|noise|sample|riser|sweep|impact|foley|texture')]


def by_keys(text):
    for cat, rx in KEYS:
        if re.search(rx, text):
            return cat
    return None


def fx_kind(name):
    if re.search(r'spin down|down|fall|drop', name):
        return 'down'
    if re.search(r'reverse|swell|rise|riser|uplift|build|sweep up', name):
        return 'riser'
    if re.search(r'impact|hit|boom|crash|blast', name):
        return 'impact'
    return 'fx'


def classify(rel: Path):
    parts = [p.lower() for p in rel.parts]
    name = rel.stem.lower()
    top = parts[0]
    if top == 'shapes':
        return None  # одиночные периоды волны для синтезаторов — не звуки
    if top == 'loops':
        return 'loop'
    if top == 'instruments' or parts[:2] == ['legacy', 'instruments']:
        return 'inst'
    if parts[:2] == ['legacy', 'loops']:
        return 'loop'
    if top == 'risers':
        return 'riser'
    if top in ('sfx',) or parts[:2] == ['legacy', 'fx']:
        if re.search(r'spin down|down|fall|drop', name):
            return 'down'
        if re.search(r'reverse|swell|rise|riser|uplift|build', name):
            return 'riser'
        if re.search(r'impact|hit|boom|crash|blast', name):
            return 'impact'
        return 'fx'
    if top == 'vocals' or parts[:2] == ['legacy', 'vocals']:
        return 'vocal'
    if top in ('drums', 'drums (modeaudio)') or parts[:2] == ['legacy', 'drums']:
        for p in parts[1:-1]:
            if p in DRUM_DIRS:
                cat = DRUM_DIRS[p]
                if cat == 'hat' and re.search(r'open|\boh\b|opn', name):
                    cat = 'ohat'
                if cat == 'fx' and re.search(r'impact|hit|boom|crash', name):
                    cat = 'impact'
                return cat
        cat = by_keys(name)
        return cat if cat in ('kick', 'clap', 'hat', 'ohat', 'perc', '808') else None
    # Скачанные наборы: сначала по папке (снизу вверх), потом по имени файла
    for p in reversed(parts[1:-1]):
        cat = by_keys(p)
        if cat:
            break
    else:
        cat = by_keys(name)
    if cat == 'fx':
        return fx_kind(name)
    if cat == 'hat' and re.search(r'open|\boh\b', name):
        return 'ohat'
    return cat


def vocal_text(stem: str):
    t = re.sub(r'^(laurie webb|voc|fls)[ _]+', '', stem, flags=re.I)
    t = re.sub(r'\s+[A-D]$', '', t).replace('_', ' ').strip()
    return re.sub(r'\bDont\b', "Don't", re.sub(r'\bIts\b', "It's", re.sub(r'\bLets\b', "Let's", re.sub(r'\bThats\b', "That's", t))))


def nice(stem: str):
    return re.sub(r'^(FLS|DL|FX|VOC)[ _]+', '', stem).replace('_', ' ').strip()


def convert(job):
    src, dst, cat = job
    if dst.exists():
        return dst, True
    dst.parent.mkdir(parents=True, exist_ok=True)
    cap = {'riser': 16, 'down': 10, 'fx': 10, 'impact': 8, 'vocal': 6, 'loop': 16, 'inst': 6, '808': 4}.get(cat, 2.5)  # одиночный удар — до 2,5 с
    stereo = cat in ('riser', 'down', 'fx', 'impact', 'loop')
    def run(inp):
        return subprocess.run([str(FFMPEG), '-v', 'error', '-y', '-i', str(inp), '-t', str(cap), '-ac', '2' if stereo else '1', '-ar', '44100',
                               '-af', 'silenceremove=start_periods=1:start_threshold=-60dB', '-c:a', 'libmp3lame', '-b:a', '128k' if stereo else '96k', str(dst)],
                              capture_output=True).returncode == 0
    if run(src):
        return dst, True
    # Сжатый WAV от Image-Line: внутри поток Ogg Vorbis — вынимаем его и перекодируем
    b = src.read_bytes()
    i = b.find(b'OggS')
    if i < 0:
        return dst, False
    tmp = dst.with_suffix('.ogg')
    tmp.write_bytes(b[i:])
    ok = run(tmp)
    tmp.unlink(missing_ok=True)
    return dst, ok


def duration_ms(path: Path):
    r = subprocess.run([str(FFMPEG), '-i', str(path)], capture_output=True, text=True, errors='ignore')
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', r.stderr)
    return int((int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])) * 1000) if m else 0


def main():
    jobs, meta = [], []
    for base in sorted(p for p in PACKS.iterdir() if p.is_dir()):
        folder = base.name
        if not base.exists():
            continue
        for src in sorted(base.rglob('*')):
            if src.suffix.lower() not in AUDIO:
                continue
            rel = src.relative_to(PACKS)
            cat = classify(rel)
            if not cat:
                continue
            fid = hashlib.md5(str(rel).encode()).hexdigest()[:10]
            dst = OUT / cat / f'{fid}.mp3'
            jobs.append((src, dst, cat))
            pack = 'ModeAudio' if rel.parts[0] == 'Drums (ModeAudio)' else 'Legacy' if rel.parts[0] == 'Legacy' else 'FL' if rel.parts[0] in FL_DIRS else rel.parts[0].strip('!@ ')[:40]
            meta.append({'id': 'fl:' + fid, 'cat': cat, 'name': vocal_text(src.stem) if cat == 'vocal' else nice(src.stem), 'pack': pack,
                         'file': f'{cat}/{fid}.mp3'})
    print('звуков:', len(jobs), flush=True)
    with ThreadPoolExecutor(8) as ex:
        ok = list(ex.map(convert, jobs))
    items = []
    for m, (dst, good) in zip(meta, ok):
        if not good or not dst.exists():
            continue
        m['ms'] = duration_ms(dst)
        if m['cat'] == 'vocal':
            m['vcat'] = next(c for c, rx in VOC_CATS if re.search(rx, m['name'], re.I))
        items.append(m)
    (OUT / 'index.json').write_text(json.dumps({'v': 1, 'cats': CAT_RU, 'items': items}, ensure_ascii=False), 'utf-8')
    from collections import Counter
    print('готово:', len(items), dict(Counter(i['cat'] for i in items)), flush=True)


if __name__ == '__main__':
    main()
