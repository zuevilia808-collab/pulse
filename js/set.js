// Диджей-сет: час (или сколько нужно) непрерывной музыки. Треки сочиняются один за другим по «пути энергии»
// и сводятся, как у живого диджея: следующий трек входит в долю и в темпе, без низа, на сильной доле низ
// «перекидывается» (басовый своп), прошлый трек уходит, а темп плавно сползает к темпу нового.
// Звук каждого трека рендерится отдельно, сводит всё FFmpeg на компьютере (server.js → /api/set-mix).
import { GENRES, emptyState, genreState } from './music.js?v=5';
import { compose, songBars, barData, withSeed, PART } from './arrange.js?v=5';
import { renderSong } from './engine.js?v=5';
import { voxFetch, voxIdsOf } from './vox.js?v=5';

// Настроение сета: путь жанров по четвертям сета и темп (начало → пик → конец)
export const MOODS = {
  night: { name: 'Ночной клуб', path: [['minimal', 'dub', 'melodic', 'detroit'], ['peak', 'detroit', 'acid', 'hypnotic'], ['peak', 'acid', 'hard', 'industrial'], ['melodic', 'hypnotic', 'peak']], bpm: [124, 128, 134, 128] },
  house: { name: 'Хаус-вечеринка', path: [['house', 'detroit'], ['house', 'detroit', 'acid'], ['house', 'acid', 'peak'], ['house', 'melodic']], bpm: [122, 124, 127, 124] },
  dark: { name: 'Тёмный андеграунд', path: [['dub', 'hypnotic', 'minimal'], ['hypnotic', 'peak', 'industrial'], ['industrial', 'hard', 'acid'], ['hypnotic', 'dub']], bpm: [126, 132, 140, 130] },
  melodic: { name: 'Мелодичный рассвет', path: [['melodic', 'dub'], ['melodic', 'detroit', 'peak'], ['melodic', 'peak', 'acid'], ['melodic', 'hypnotic']], bpm: [122, 125, 128, 124] },
  peak: { name: 'Пик-тайм без остановки', path: [['peak', 'detroit'], ['peak', 'acid', 'hypnotic'], ['hard', 'industrial', 'peak'], ['peak', 'acid']], bpm: [130, 134, 140, 134] },
};

const TRACK_MIN = 5.5; // длина одного трека в сете, минут
const rnd = () => Math.random();
const pick = a => a[Math.floor(rnd() * a.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Сколько тактов в начале трека — интро, в конце — аутро (туда удобно сводить)
const lead = (secs, type) => { let n = 0; for (const s of secs) { if (s.type !== type) break; n += s.bars; } return n; };
const tail = (secs, type) => lead([...secs].reverse(), type);

// Время начала каждого такта трека (секунды от начала трека) при темпе bpmAt(такт)
function barTimes(bars, bpmAt) {
  const t = [0];
  for (let k = 0; k < bars; k++) t.push(t[k] + 240 / bpmAt(k));
  return t;
}

// Следующий трек сета. x — где мы в сете (0 — начало, 1 — конец): от этого настроение и темп.
// prev — прошлый трек (его жанр, темп и сколько тактов сводим): новый начинается в его темпе и за 16 тактов уходит к своему.
export function makeTrack(x, mood = 'night', prev = null) {
  x = clamp(x || 0, 0, 1);
  const M = MOODS[mood] || MOODS.night, q = Math.min(3, Math.floor(x * 4));
  // Темп по кривой энергии: плавно между точками четвертей
  const f = Math.min(2.999, x * 3), k = Math.floor(f), target = Math.round(M.bpm[k] + (M.bpm[k + 1] - M.bpm[k]) * (f - k));
  // Жанр — из подходящих по темпу (диджей не прыгает на 10 BPM): ±9 от нужного темпа, и не тот же, что был
  let pool = M.path[q].filter(g => Math.abs(GENRES[g].bpm - target) <= 9);
  if (!pool.length) pool = M.path[q];
  if (pool.length > 1 && prev) pool = pool.filter(g => g !== prev.genre);
  const genre = pick(pool);
  const bpm = clamp(target, GENRES[genre].bpm - 8, GENRES[genre].bpm + 8);
  const seed = 1 + Math.floor(rnd() * 99999);
  const state = genreState(emptyState(), genre);
  state.bpm = bpm;
  state.song = compose(state, TRACK_MIN, genre, seed, true);
  state.mode = 'song';
  const bars = songBars(state.song), from = prev ? prev.bpm : bpm, xin = prev ? prev.xout : 0;
  const bpmAt = b => (b < xin ? from : b < xin + 16 ? from + ((bpm - from) * (b - xin + 1)) / 16 : bpm);
  const T = { genre, bpm, from, seed, state, bars, xin, bpmAt, name: GENRES[genre].name };
  T.times = barTimes(bars, bpmAt);
  // Сколько тактов этого трека сведём со следующим: по аутро (16–32, кратно 8)
  T.xout = clamp(Math.round((tail(state.song.sections, 'outro') + 8) / 8) * 8, 16, 32);
  return T;
}

// План сета: какие треки, в каком темпе, где начинается каждый и как сводится с предыдущим.
export function planSet({ minutes = 60, mood = 'night', seed = 1 + Math.floor(Math.random() * 99999) } = {}) {
  const M = MOODS[mood] || MOODS.night; // eslint-disable-line no-unused-vars
  return withSeed(seed, () => {
    // Сколько треков: каждый ~5,5 мин, но с соседом звучит вместе ~0,6 мин — считаем с запасом, лишнее отрежем ниже
    const n = Math.max(2, Math.ceil(minutes / (TRACK_MIN - 0.7)));
    const tracks = [];
    let start = 0;
    for (let i = 0; i < n; i++) {
      const T = makeTrack(n > 1 ? i / (n - 1) : 0, mood, tracks[i - 1]);
      T.i = i;
      if (i) {
        // Переход: последние X тактов прошлого трека звучат вместе с первыми X тактами этого
        const A = tracks[i - 1], X = A.xout;
        start = A.start + A.times[A.bars - X];
        const sw = Math.max(8, Math.round(X / 2 / 8) * 8); // своп низа — на сильной доле, в середине перехода
        T.fadeIn = T.times[Math.min(8, X)];
        T.hpUntil = T.times[sw];
        A.hpFrom = A.times[A.bars - X + sw];
        A.fadeOut = [A.times[A.bars - X + sw], A.times[A.bars] - A.times[A.bars - X + sw]];
      }
      T.start = start;
      tracks.push(T);
    }
    // Лишние треки в конце убираем, если сет и без них уже нужной длины
    while (tracks.length > 2) {
      const prev = tracks[tracks.length - 2];
      if (prev.start + prev.times[prev.bars] < minutes * 60) break;
      tracks.pop();
      delete prev.hpFrom;
      delete prev.fadeOut;
    }
    const last = tracks[tracks.length - 1];
    const total = last.start + last.times[last.bars];
    return { seed, mood, minutes, name: M.name, tracks, total };
  });
}

// Где в сете находится момент t (секунды): какой трек «главный», какой такт, доля, энергия — для сцены и аватара
export function setAt(plan, t) {
  let cur = plan.tracks[0];
  for (const T of plan.tracks) if (T.start <= t && (T.hpUntil == null || t >= T.start + T.hpUntil)) cur = T;
  const lt = t - cur.start, times = cur.times;
  let b = 0;
  while (b < cur.bars - 1 && times[b + 1] <= lt) b++;
  const barDur = times[b + 1] - times[b], beat = clamp((lt - times[b]) / barDur * 4, 0, 3.999);
  const d = barData(cur.state, b);
  return { track: cur, bar: b, beat, bpm: cur.bpmAt(b), type: d ? d.type : 'outro', partName: d ? PART[d.type].name : '', steps: d ? d.steps : {} };
}

// Карточка сета: название, настроение, длина и путь жанров
export function setInfo(plan) {
  const m = Math.round(plan.total / 60), len = m >= 60 ? `${Math.floor(m / 60)} ч${m % 60 ? ' ' + (m % 60) + ' мин' : ''}` : `${m} мин`;
  return { title: `${MOODS[plan.mood].name} · ${len}`, mood: plan.mood, moodName: MOODS[plan.mood].name, minutes: plan.minutes, sec: Math.round(plan.total),
    seed: plan.seed, tracks: plan.tracks.map(T => `${GENRES[T.genre].name.replace(/ техно| Techno/i, '')} ${T.bpm}`) };
}

// Загрузить WAV на компьютер кусками по 8 МБ (большой Blob браузер не тянет)
async function upload(file, r) {
  const bytes = new Uint8Array(r.pcm.buffer), CH = 8 << 20;
  let res = await fetch(`/api/render?name=${file}`, { method: 'POST', body: r.header }).then(x => x.json());
  for (let o = 0; o < bytes.length && res.file; o += CH) {
    res = await fetch(`/api/render?name=${file}&append=1`, { method: 'POST', body: bytes.slice(o, o + CH) }).then(x => x.json());
  }
  if (!res.file) throw new Error('Не удалось сохранить трек: ' + (res.error || ''));
}

// Звук всего сета: каждый трек — в свой файл, потом сведение на компьютере. onProgress(доля, подпись).
export async function renderSetAudio(plan, name, onProgress = () => {}) {
  const parts = [];
  for (const T of plan.tracks) {
    const st = structuredClone(T.state);
    await voxFetch(voxIdsOf(st));
    onProgress(T.i / (plan.tracks.length + 1), `Трек ${T.i + 1} из ${plan.tracks.length}: ${GENRES[T.genre].name}, ${T.bpm} BPM`);
    let r = await renderSong(st, k => barData(st, k), T.bars, p => onProgress((T.i + p) / (plan.tracks.length + 1), `Трек ${T.i + 1} из ${plan.tracks.length}: ${GENRES[T.genre].name}, ${T.bpm} BPM`), T.bpmAt, true);
    const file = `${name}_t${String(T.i).padStart(2, '0')}`;
    await upload(file, r);
    r = null;
    parts.push({ file: file + '.wav', start: T.start, fadeIn: T.fadeIn, hpUntil: T.hpUntil, hpFrom: T.hpFrom, fadeOut: T.fadeOut });
  }
  onProgress(plan.tracks.length / (plan.tracks.length + 1), 'Свожу треки в один сет…');
  const res = await fetch('/api/set-mix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parts, info: setInfo(plan) }) }).then(x => x.json());
  if (!res.file) throw new Error('Сведение не удалось: ' + (res.error || ''));
  onProgress(1, 'Готово');
  return res;
}
