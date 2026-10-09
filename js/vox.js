// Голос: тысячи адлибов — коротких фраз и выкриков, которые подмешиваются в трек.
// Фразы заранее озвучены нейросетью (tools/render_vox.py) и лежат в vox/*.mp3; список — vox/index.json.
// Здесь: загрузка, поиск и подбор фраз, рисунки дорожки «Голос» и план адлибов для целого трека.

import { FL, flUrl } from './fl.js?v=5';

export const VOX = { ready: false, clips: [], byId: new Map(), cats: {}, voices: {} };

const V = '?v=5';
let base = 'vox/';
export function voxSetIndex(d, dir = 'vox/') {
  base = dir;
  const cols = d.cols, ix = Object.fromEntries(cols.map((c, i) => [c, i]));
  VOX.clips = d.clips.map(r => ({ id: r[ix.id], text: r[ix.text], cat: r[ix.cat], lang: r[ix.lang], voice: r[ix.voice], ms: r[ix.ms], on: r[ix.on] || [0] }));
  VOX.byId = new Map(VOX.clips.map(c => [c.id, c]));
  VOX.cats = d.cats;
  VOX.voices = d.voices;
  VOX.ready = VOX.clips.length > 0;
}
let initP = null;
export function voxInit() {
  if (!initP) {
    initP = fetch(base + 'index.json' + V).then(r => (r.ok ? r.json() : null)).then(d => { if (d) voxSetIndex(d); return VOX.ready; })
      .catch(() => { initP = null; return false; });
  }
  return initP;
}
export const voxInfo = id => VOX.byId.get(id) || null;

// Вокальные фразы из FL Studio («Come On», «Dance», «Let's Go») — отдельный голос, только на этом компьютере
export function voxAddFl() {
  if (!FL.ready || !VOX.ready || VOX.voices.fl) return;
  for (const it of FL.items) {
    if (it.cat !== 'vocal') continue;
    const c = { id: it.id, text: it.name, cat: it.vcat || 'hype', lang: 'en', voice: 'fl', ms: it.ms || 800, on: [0] };
    VOX.clips.push(c);
    VOX.byId.set(c.id, c);
  }
  VOX.voices.fl = ['Вокал FL Studio', 'f'];
}

// ——— Звук: загрузка и раскодирование по требованию ———
const bufs = new Map(), backs = new Map(), loading = new Map();
let dec = null;
function load(id) {
  const fl = String(id).startsWith('fl:');
  if (bufs.has(id) || (fl ? !FL.byId.has(id) : !VOX.byId.has(id))) return Promise.resolve(bufs.get(id) || null);
  if (loading.has(id)) return loading.get(id);
  const p = fetch(fl ? flUrl(id) : base + id + '.mp3' + V).then(r => r.arrayBuffer()).then(ab => {
    dec = dec || new OfflineAudioContext(1, 1, 44100);
    return new Promise((ok, no) => dec.decodeAudioData(ab, ok, no));
  }).then(b => { bufs.set(id, b); loading.delete(id); return b; })
    .catch(() => { loading.delete(id); return null; });
  loading.set(id, p);
  return p;
}
export const voxFetch = ids => Promise.all([...new Set(ids)].filter(Boolean).map(load));
// back — задом наперёд (для «реверса»)
export function voxBuffer(id, back = false) {
  const b = bufs.get(id);
  if (!b || !back) return b || null;
  let r = backs.get(id);
  if (!r) {
    r = new AudioBuffer({ length: b.length, sampleRate: b.sampleRate, numberOfChannels: 1 });
    const s = b.getChannelData(0), d = r.getChannelData(0), n = s.length;
    for (let i = 0; i < n; i++) d[i] = s[n - 1 - i];
    backs.set(id, r);
  }
  return r;
}

// ——— Подбор фраз ———
const rnd = () => Math.random();
const pick = a => a[Math.floor(rnd() * a.length)];
const wpick = o => { const e = Object.entries(o); let x = rnd() * e.reduce((a, [, w]) => a + w, 0); for (const [k, w] of e) if ((x -= w) < 0) return k; return e[0][0]; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const LANGS = { mix: 'Оба языка', en: 'Английский', ru: 'Русский' };
export const SEXES = { any: 'Любой', m: 'Мужской', f: 'Женский' };
export const EVERY = { 1: 'каждый такт', 2: 'раз в 2 такта', 4: 'раз в 4 такта', 8: 'раз в 8 тактов' };
export const voxDefaults = () => ({ lang: 'mix', sex: 'any', voice: null, every: 4, swap: true, pool: [] });

// Стили дорожки «Голос»: какие фразы и как расставлены.
export const STYLES = {
  mix: { name: 'Микс', cats: { hype: 3, body: 2, sound: 2, shout: 2, deep: 1 } },
  hype: { name: 'Заводилы', cats: { hype: 4, body: 2, shout: 1 } },
  shouts: { name: 'Выкрики', cats: { shout: 1 } },
  talk: { name: 'Про звук', cats: { sound: 1 } },
  move: { name: 'Двигайся', cats: { body: 1 } },
  dark: { name: 'Тёмные фразы', cats: { deep: 1 } },
  soul: { name: 'Хаус-фразы', cats: { house: 3, body: 1 } },
  count: { name: 'Отсчёт', cats: { count: 1 } },
  chop: { name: 'Нарезка', cats: { hype: 2, sound: 2, body: 1 } },
};
// Какие фразы подходят жанру (для трека целиком и «добавь голос»).
export const GENRE_VOX = {
  techno: { cats: { sound: 3, hype: 2, deep: 2, shout: 1, body: 1 }, style: 'mix', use: 0.55 },
  acid: { cats: { sound: 3, body: 2, hype: 2, shout: 1 }, style: 'mix', use: 0.6 },
  minimal: { cats: { deep: 3, body: 1, sound: 1 }, style: 'dark', use: 0.35 },
  dub: { cats: { deep: 4, sound: 1 }, style: 'dark', use: 0.35 },
  detroit: { cats: { sound: 2, house: 2, deep: 1, body: 1 }, style: 'talk', use: 0.45 },
  melodic: { cats: { deep: 3, house: 1 }, style: 'dark', use: 0.4 },
  hypnotic: { cats: { deep: 4, sound: 1 }, style: 'dark', use: 0.35 },
  industrial: { cats: { deep: 2, hype: 2, shout: 2, count: 1 }, style: 'shouts', use: 0.55 },
  hard: { cats: { hype: 3, shout: 3, count: 1, sound: 1 }, style: 'hype', use: 0.7 },
  witch: { cats: { deep: 5 }, style: 'dark', use: 0.5 },
  house: { cats: { house: 4, body: 3, hype: 1, shout: 1 }, style: 'soul', use: 0.7 },
};
export const genreVox = g => GENRE_VOX[g] || GENRE_VOX[g === 'peak' ? 'techno' : 'techno'];

// Фразы под условия. o: { cats, lang, sex, voice, maxMs }
export function voxFilter(o = {}) {
  const sexOf = v => (VOX.voices[v] ? VOX.voices[v][1] : 'm');
  return VOX.clips.filter(c => (!o.cats || o.cats[c.cat]) && (!o.lang || o.lang === 'mix' || c.lang === o.lang)
    && (!o.voice || c.voice === o.voice) && (!o.sex || o.sex === 'any' || sexOf(c.voice) === o.sex) && (!o.maxMs || c.ms <= o.maxMs)
    && (!o.minMs || c.ms >= o.minMs));
}

// Голос (диктор) под язык и пол: у одного трека обычно один голос, иногда второй — на ответы.
function chooseVoice(o) {
  if (o.voice && VOX.voices[o.voice]) return o.voice;
  const vs = Object.keys(VOX.voices).filter(v => !o.sex || o.sex === 'any' || VOX.voices[v][1] === o.sex);
  return vs.length ? pick(vs) : null;
}

// Набор из n разных фраз: категория по весам, без повторов текста.
function poolOf(cats, o, voice, n, maxMs) {
  const out = [], seen = new Set();
  for (let g = 0; out.length < n && g < n * 12; g++) {
    const cat = wpick(cats);
    let list = voxFilter({ cats: { [cat]: 1 }, lang: o.lang, voice, maxMs });
    if (!list.length) list = voxFilter({ cats: { [cat]: 1 }, lang: o.lang, sex: o.sex, maxMs });
    if (!list.length) continue;
    const c = pick(list);
    if (seen.has(c.text)) continue;
    seen.add(c.text);
    out.push(c.id);
  }
  // Подходящих нет (узкий фильтр) — берём любые фразы на нужном языке
  if (!out.length) out.push(...shuffle(voxFilter({ lang: o.lang, maxMs })).slice(0, n).map(c => c.id));
  if (!out.length && VOX.clips.length) out.push(pick(VOX.clips).id);
  return out;
}

// Шаг, с которого фраза закончится к концу такта (для отсчёта перед дропом).
export function endStep(id, bpm) {
  const c = voxInfo(id), sd = 15 / bpm;
  return c ? Math.max(0, 16 - Math.ceil(c.ms / 1000 / sd)) : 8;
}

// Рисунок дорожки «Голос» в петле: steps (16 шагов), pool (из чего меняются фразы), every.
export function voxPattern(style, o, bpm = 130, genre = null) {
  const S = STYLES[style] || STYLES.mix;
  const cats = style === 'mix' && genre ? genreVox(genre).cats : S.cats;
  const voice = chooseVoice(o);
  const steps = Array(16).fill(null);
  let every = 4, pool;
  if (style === 'shouts') {
    pool = poolOf(cats, o, voice, 8, 900);
    const at = pick([[6, 14], [2, 10], [4, 12], [7, 15], [3, 11]]);
    at.forEach((s, k) => { steps[s] = { a: pool[k % pool.length] }; });
    every = 2;
  } else if (style === 'dark') {
    pool = poolOf(cats, o, voice, 8);
    steps[0] = { a: pool[0] };
    every = pick([4, 8]);
  } else if (style === 'count') {
    pool = poolOf(cats, o, voice, 6);
    steps[endStep(pool[0], bpm)] = { a: pool[0] };
    every = 8;
  } else if (style === 'chop') {
    // Нарезка: одно слово рубится по слогам в ритм
    pool = poolOf(cats, o, voice, 6, 1600);
    const a = pool[0], on = (voxInfo(a) || { on: [0] }).on;
    const rh = pick([[0, 3, 6, 8, 11, 14], [0, 2, 4, 7, 10, 12], [0, 3, 6, 10, 12, 14], [0, 1, 4, 6, 8, 12]]);
    rh.forEach((s, k) => { steps[s] = { a, c: k % 3 === 2 ? 0 : k % on.length, len: k === rh.length - 1 ? 2 : 1 }; });
    every = 2;
  } else {
    pool = poolOf(cats, o, voice, 8);
    steps[0] = { a: pool[0] };
    const c = voxInfo(pool[0]);
    // Короткий призыв — ещё ответ во второй половине такта
    if (c && c.ms < (60 / bpm) * 2 * 1000 && rnd() < 0.6) steps[pick([8, 10, 12])] = { a: pool[1] || pool[0] };
    every = style === 'soul' || style === 'move' ? 2 : 4;
  }
  return { steps, pool, every, voice };
}

// Какая фраза звучит на этом повторе петли: фразы по кругу меняются, чтобы не надоедать.
export function voxRotate(x, o, rep) {
  if (!o || !o.swap || !rep || x.c != null) return x;
  const pool = o.pool || [];
  if (pool.length < 2) return x;
  const k = pool.indexOf(x.a);
  return { ...x, a: pool[((k < 0 ? 0 : k) + rep) % pool.length] };
}

// Короткая подпись фразы для клетки секвенсора.
export function voxLabel(id) {
  const c = voxInfo(id);
  if (!c) return '…';
  const w = c.text.replace(/[!?.,]/g, '').split(' ')[0];
  return w.length > 6 ? w.slice(0, 5) + '·' : w;
}

// ——— Целый трек: где и какие адлибы ———
// Возвращает { pool, voice, fx } и раскладывает события в sec.vox: [такт, шаг, фраза, эффект].
const FX_BREAK = ['vspace', 'vdub', 'vspace', null];
export function planSongVox(sections, genre, o, bpm, only = null) {
  if (!VOX.ready) return null;
  const G = genreVox(genre), voice = chooseVoice(o);
  // Второй голос — на выкрики и ответы (если человек не выбрал одного диктора)
  const v2 = !o.voice && rnd() < 0.6 ? pick(Object.keys(VOX.voices).filter(v => v !== voice && (!o.sex || o.sex === 'any' || VOX.voices[v][1] === o.sex))) : null;
  const KIND = { short: [{ shout: 2, hype: 1 }, 900], main: [G.cats, 0], deep: [{ deep: 1 }, 0], pre: [{ hype: 2, count: 1 }, 2400] };
  // Тексты, что уже звучат в треке, — чтобы фразы не повторялись
  const usedT = new Set();
  sections.forEach((x, i) => { if (only != null && i !== only && x.vox) x.vox.forEach(e => { const c = voxInfo(e[2]); if (c) usedT.add(c.text); }); });
  const dense = G.use >= 0.6 ? 1 : G.use >= 0.45 ? 0.75 : 0.5; // насколько разговорчив жанр
  const gap = { 1: 2, 2: 4, 4: 8, 8: 16 }[o.every] || 8, half = gap >> 1; // «адлибы чаще/реже»
  const hookOn = rnd() < 0.5;
  let hook = null;
  // Каждый раз новая фраза из каталога: категория по весам жанра, текст, которого ещё не было
  const take = kind => {
    const [cats, maxMs] = KIND[kind], vv = kind === 'short' && v2 && rnd() < 0.45 ? v2 : voice;
    let spare = null;
    for (let g = 0; g < 40; g++) {
      const cat = wpick(cats);
      let list = voxFilter({ cats: { [cat]: 1 }, lang: o.lang, voice: vv, maxMs });
      if (!list.length) list = voxFilter({ cats: { [cat]: 1 }, lang: o.lang, sex: o.sex, maxMs });
      if (!list.length) continue;
      const c = pick(list);
      spare = spare || c;
      if (usedT.has(c.text)) continue;
      usedT.add(c.text);
      return c.id;
    }
    return spare ? spare.id : null;
  };
  sections.forEach((sec, i) => {
    if (only != null && i !== only) return;
    const ev = [], n = sec.bars, t = sec.type, next = sections[i + 1];
    const add = e => { if (e[2]) ev.push(e); }; // фраза не нашлась — пропускаем
    if (t === 'intro' || t === 'outro') { /* интро и аутро — для диджея, без голоса */ }
    else if (t === 'build' || t === 'main' || t === 'down') {
      for (let j = half; j < n; j += gap) if (rnd() < 0.7 * dense) add([j, rnd() < 0.5 ? 0 : 8, take('main')]);
      if (t === 'main' && rnd() < 0.4 * dense) for (let j = half >> 1; j < n; j += gap) add([j, pick([6, 14]), take('short')]);
    } else if (t === 'break') {
      for (let j = 0; j < n; j += 4) if (rnd() < 0.55) add([j, 0, take('deep'), pick(FX_BREAK)]);
    } else if (t === 'pit') {
      // Яма: слово рубится по слогам в ритм — или одна фраза тонет в космосе
      if (rnd() < 0.5) {
        const a = take('main'), on = (voxInfo(a) || { on: [0] }).on, rh = pick([[0, 3, 6, 10], [0, 3, 8, 11], [0, 6, 8, 14]]);
        for (let j = 1; j < n; j += 2) rh.forEach((s, k) => add([j, s, a, null, k % on.length]));
      } else for (let j = 0; j < n; j += 4) add([j, 0, take('deep'), 'vspace']);
    } else if (t === 'rise') {
      // Перед дропом — призыв или отсчёт, который заканчивается ровно к дропу
      const a = take('pre');
      add([n - 1, endStep(a, bpm), a]);
    } else if (t === 'drop') {
      // Крючок: одна и та же фраза открывает каждый дроп (иногда) — как припев у диджея
      if (!hook) hook = take('short');
      add([0, 0, hookOn ? hook : take('short'), rnd() < 0.3 ? 'vstut' : null]);
      for (let j = gap; j < n; j += gap) if (rnd() < 0.8 * dense) add([j, 0, take('main')]);
      for (let j = half; j < n; j += gap) if (rnd() < 0.5 * dense) add([j, pick([6, 14]), take('short')]);
    } else if (t === 'insert' && rnd() < 0.6) add([0, 0, take('main'), pick(['vback', 'vstut', 'vtel'])]);
    if (next && next.type === 'drop' && t !== 'rise' && t !== 'intro' && rnd() < 0.5) { const a = take('pre'); add([n - 1, endStep(a, bpm), a]); }
    if (ev.length) sec.vox = ev; else delete sec.vox;
    sec.lv.vox = ev.length ? 1 : 0;
  });
  return { voice };
}

// Все фразы, которые понадобятся состоянию (чтобы заранее загрузить звук).
export function voxIdsOf(state) {
  const ids = [];
  const tr = state.tracks.vox;
  if (tr) { tr.steps.forEach(x => x && ids.push(x.a)); if (tr.vox && tr.vox.swap) ids.push(...(tr.vox.pool || [])); }
  if (state.song) for (const s of state.song.sections) if (s.vox) s.vox.forEach(e => ids.push(e[2]));
  // Звуки FL: живые ударные дорожек и эффекты переходов
  for (const t of Object.values(state.tracks)) if (t.p && t.p.sample) ids.push(t.p.sample);
  const fx = state.song && state.song.flfx;
  if (fx) ids.push(fx.riser, fx.impact, fx.down, ...(fx.ear || []));
  return [...new Set(ids)];
}

// Поиск по тексту: «move your body», «давай».
export function voxSearch(q, o = {}, n = 40) {
  // Без знаков и пробелов: «let s go» найдёт «Let's go!», «ещe» — «Ещё»
  const norm = t => String(t || '').toLowerCase().replace(/[ёэ]/g, 'е').replace(/[^a-zа-я0-9]/g, '');
  const s = norm(q);
  if (!s) return [];
  const hit = voxFilter(o).filter(c => norm(c.text).includes(s));
  // Сначала точные совпадения, потом фразы, где это слово внутри
  const exact = shuffle(hit.filter(c => norm(c.text) === s));
  return [...exact, ...shuffle(hit.filter(c => norm(c.text) !== s))].slice(0, n);
}
export { shuffle as voxShuffle };
