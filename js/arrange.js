// Аранжировка: как из одного такта сделать трек на 1–5 минут — и каждый раз другой.
// Генератор собирает трек из блоков по 16 тактов по правилам жанра (PROFILES) и одной из форм (FORMS).
// Каждый вариант получает номер (seed): с тем же номером получится тот же трек. Правила словами — в ARRANGEMENT.md.
import { TRACK, isEmpty, deg, semiToDeg, makePattern, VARIANTS, defaultVariant } from './music.js?v=3';

export const LANES = ['kick', 'clap', 'hat', 'ohat', 'perc', 'bass', 'stab', 'lead'];

// Типы частей трека.
export const PART = {
  intro: { name: 'Интро', color: '#5ce1ff', hint: 'вход: мало инструментов, фильтр открывается' },
  build: { name: 'Набор', color: '#8fa2ff', hint: 'инструменты входят по одному' },
  main: { name: 'Грув', color: '#d4ff3a', hint: 'основная часть, всё качает' },
  break: { name: 'Брейк', color: '#b67cff', hint: 'бочка уходит, звучат аккорды и мелодия' },
  pit: { name: 'Яма', color: '#7d6aa6', hint: 'почти тишина перед подъёмом' },
  rise: { name: 'Подъём', color: '#ffb547', hint: 'шум растёт, дробь, срез низа' },
  drop: { name: 'Дроп', color: '#ff5c8a', hint: 'пик энергии, всё вместе' },
  down: { name: 'Спад', color: '#4dffb8', hint: 'энергия уходит, остаётся грув' },
  outro: { name: 'Аутро', color: '#8b9480', hint: 'выход: инструменты уходят по одному' },
  insert: { name: 'Вставка', color: '#e6e1ff', hint: '1–2 такта неожиданного контраста посреди трека' },
};

// Метка в начале части.
export const INS = { none: 'Нет', crash: 'Тарелка', impact: 'Удар', hit: 'Удар в реверб', down: 'Спуск', fake: 'Ложный дроп' };
// Приём в конце части (разворот перед следующей).
export const OUTS = {
  none: 'Нет', fill: 'Сбивка', toms: 'Томы', kickroll: 'Дробь бочки', stutter: 'Заикание', scoop: 'Без низа',
  swell: 'Свуш', delay: 'Эхо-бросок', wash: 'Реверб-бросок', stop: 'Выключение', gap: 'Яма', rise: 'Нарастание',
};
// Начало части: первые 1–2 такта.
export const HEADS = { none: 'Обычно', scoop: 'Без низа', minimal: 'Минимум' };
export const FILTERS = { none: 'Нет', rise: 'Открывается', fall: 'Закрывается', dark: 'Тёмный', hp: 'Срез низа' };

// Гармония: на сколько ступеней лада сдвигаются бас, аккорды и мелодия в каждом такте (per — тактов на аккорд).
export const PROGS = {
  none: { name: 'На месте', d: [0] },
  'i-VI': { name: 'i – VI', d: [0, -2], per: 2 },
  'i-VI-III-VII': { name: 'i – VI – III – VII', d: [0, -2, 2, -1] },
  'i-iv-VI-v': { name: 'i – iv – VI – v', d: [0, 3, -2, -3] },
  'i-VII-VI-VII': { name: 'i – VII – VI – VII', d: [0, -1, -2, -1] },
  'i-II': { name: 'i – II', d: [0, 1], per: 2 },
};

// «Главный герой»: инструмент, который разгорается и затухает через весь трек, не глядя на границы частей.
export const SHAPES = { arc: 'разгорается к пику', rise: 'растёт до конца', wave: 'две волны' };
export function heroCurve(shape, x) {
  const g = (c, w) => Math.exp(-(((x - c) / w) ** 2));
  const m = shape === 'rise' ? 0.4 + 1.4 * x ** 1.3 : shape === 'wave' ? 0.5 + 0.7 * (g(0.3, 0.12) + g(0.72, 0.14)) : 0.45 + 1.3 * g(0.65, 0.25);
  return Math.min(1.9, Math.max(0.3, m));
}

// ——— Формы трека: кривые энергии. Вес — сколько блоков по 16 тактов отдать части (0,5 — полблока). ———
export const FORMS = {
  classic: { name: 'Классика', seq: [['intro', 2], ['build', 1.5], ['main', 3], ['break', 1.5], ['rise', 0.5], ['drop', 3], ['down', 1], ['outro', 1.5]] },
  twoPeaks: { name: 'Две волны', seq: [['intro', 1.5], ['build', 1], ['drop', 2], ['break', 1], ['rise', 0.5], ['drop', 2.5], ['pit', 0.5], ['rise', 0.5], ['drop', 2], ['outro', 1.5]] },
  trilogy: { name: 'Трилогия брейка', seq: [['intro', 1.5], ['build', 1], ['main', 3], ['pit', 1], ['rise', 1], ['drop', 3], ['down', 1], ['outro', 1.5]] },
  slowBurn: { name: 'Медленный разогрев', seq: [['intro', 2], ['build', 2], ['main', 2], ['main', 2], ['rise', 0.5], ['drop', 2.5], ['outro', 1.5]] },
  longBreak: { name: 'Большой брейк', seq: [['intro', 1.5], ['build', 1], ['main', 2], ['break', 2.5], ['rise', 1], ['drop', 3], ['outro', 1.5]] },
  plateau: { name: 'Плато', seq: [['intro', 1.5], ['main', 3], ['pit', 0.5], ['main', 3], ['main', 1.5], ['outro', 1.5]] },
  djTool: { name: 'DJ-тул', seq: [['intro', 2], ['build', 1], ['main', 2.5], ['main', 2.5], ['outro', 2]] },
  earlyDrop: { name: 'Сразу в бой', seq: [['intro', 1], ['rise', 0.5], ['drop', 3], ['break', 1], ['rise', 0.5], ['drop', 3], ['outro', 1]] },
  fromSilence: { name: 'Из тишины', seq: [['intro', 2], ['build', 1.5], ['main', 2], ['break', 1.5], ['rise', 0.5], ['drop', 2.5], ['outro', 1.5]], soft: true },
};

// ——— Правила жанров ———
// groove — ударные и бас в порядке, из которого случайно собирается очередь вступления (первым всегда идёт бочка);
// music — мелодические партии; hero — кто может быть «главным героем»; turns — приёмы на стыках.
const TURNS = {
  groove: ['fill', 'fill', 'toms', 'stutter', 'scoop', 'delay', 'none', 'none', 'none'],
  toBreak: ['swell', 'wash', 'delay', 'scoop', 'stop'],
  preDrop: ['gap', 'kickroll', 'stutter'],
};
const P = o => ({
  groove: ['kick', 'hat', 'bass', 'perc', 'clap', 'ohat'], music: ['stab', 'lead'], hero: ['bass', 'stab', 'lead', 'perc'],
  progs: ['none'], progUse: 0.6, squeeze: 0.35, heads: 0.25, introCount: 2, softIntro: 0, breakBass: 0, bassF: false,
  turns: TURNS, marks: ['crash', 'crash', 'hit', 'down'], drops: ['impact', 'impact', 'fake'], ...o,
});
export const PROFILES = {
  techno: P({ name: 'Техно', forms: { classic: 3, twoPeaks: 2, trilogy: 2, slowBurn: 1, longBreak: 1, djTool: 1 }, progs: ['none', 'none', 'i-VII-VI-VII'] }),
  acid: P({
    name: 'Эсид', forms: { classic: 3, twoPeaks: 2, slowBurn: 2, trilogy: 1, plateau: 1 }, hero: ['stab', 'perc', 'lead'],
    music: ['stab', 'lead'], breakBass: 1, bassF: true,
  }),
  minimal: P({
    name: 'Минимал', forms: { djTool: 3, plateau: 3, slowBurn: 2, classic: 1 }, squeeze: 0.55, heads: 0.45, hero: ['perc', 'bass', 'stab'],
    turns: { groove: ['scoop', 'delay', 'toms', 'none', 'none', 'none'], toBreak: ['delay', 'swell', 'scoop'], preDrop: ['gap', 'scoop'] },
    marks: ['hit', 'none', 'crash'], drops: ['impact', 'crash'],
  }),
  dub: P({
    name: 'Даб-техно', forms: { fromSilence: 3, plateau: 2, slowBurn: 2 }, hero: ['stab'], softIntro: 0.8,
    turns: { groove: ['delay', 'delay', 'wash', 'none', 'none'], toBreak: ['wash', 'delay', 'swell'], preDrop: ['gap', 'delay'] },
    marks: ['hit', 'none'], drops: ['crash', 'hit'],
  }),
  detroit: P({ name: 'Детройт', forms: { classic: 3, longBreak: 2, twoPeaks: 1 }, hero: ['stab', 'lead'], progs: ['i-VI-III-VII', 'i-VII-VI-VII', 'i-iv-VI-v'], progUse: 0.8 }),
  melodic: P({ name: 'Мелодик-техно', forms: { longBreak: 4, classic: 2, fromSilence: 2 }, hero: ['lead', 'stab'], progs: ['i-iv-VI-v', 'i-VI-III-VII'], progUse: 0.85, softIntro: 0.4 }),
  hypnotic: P({ name: 'Гипнотик', forms: { plateau: 4, djTool: 2, slowBurn: 2, trilogy: 1 }, hero: ['perc', 'bass', 'stab'], squeeze: 0.45, heads: 0.4 }),
  industrial: P({
    name: 'Индастриал', forms: { earlyDrop: 2, twoPeaks: 3, trilogy: 2, classic: 1 }, hero: ['perc', 'bass'], music: ['stab'],
    turns: { groove: ['stutter', 'toms', 'kickroll', 'fill', 'none', 'none'], toBreak: ['stop', 'wash', 'scoop'], preDrop: ['gap', 'kickroll', 'stutter'] },
  }),
  hard: P({
    name: 'Хард-техно', forms: { earlyDrop: 4, twoPeaks: 3, trilogy: 2 }, hero: ['bass', 'lead', 'stab'],
    turns: { groove: ['kickroll', 'fill', 'stutter', 'toms', 'none', 'none'], toBreak: ['stop', 'swell', 'wash'], preDrop: ['kickroll', 'gap', 'stutter'] },
    drops: ['impact', 'fake', 'impact'],
  }),
  witch: P({
    name: 'Witch House', forms: { fromSilence: 4, twoPeaks: 2, longBreak: 2 }, groove: ['kick', 'clap', 'hat', 'bass', 'perc', 'ohat'],
    hero: ['stab', 'lead'], progs: ['i-VI', 'i-II', 'i-VII-VI-VII'], progUse: 0.8, softIntro: 1,
    turns: { groove: ['fill', 'stop', 'wash', 'delay', 'none', 'none'], toBreak: ['stop', 'wash', 'swell'], preDrop: ['gap', 'stop'] },
    marks: ['hit', 'down', 'none'], drops: ['impact', 'fake'],
  }),
};
const PROFILE_OF = { peak: 'techno' };
export const profileFor = genre => (PROFILES[genre] ? genre : PROFILE_OF[genre] || 'techno');

// ——— Случайность с номером варианта ———
export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// На время сочинения Math.random заменяется генератором с номером — так одинаковый номер даёт одинаковый трек.
export function withSeed(seed, fn) {
  const orig = Math.random;
  Math.random = rngFrom(seed);
  try { return fn(); } finally { Math.random = orig; }
}
const rnd = () => Math.random();
const pick = a => a[Math.floor(rnd() * a.length)];
const chance = p => rnd() < p;
const wpick = obj => {
  const e = Object.entries(obj);
  let r = rnd() * e.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of e) if ((r -= w) <= 0) return k;
  return e[0][0];
};
const shuffle = a => {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const songBars = song => (song ? song.sections.reduce((a, s) => a + s.bars, 0) : 0);
export const barSec = bpm => 240 / bpm;
const drum = id => TRACK[id].kind === 'drum';
const TOP = ['hat', 'ohat', 'perc', 'clap'];

// ——— Варианты рисунков B и C для «переключения передач» ———
const N = (n, o = {}) => ({ n, len: 1, ...o });
function drumAlt(id, A, genre, k) {
  const v = genre === 'witch';
  if (id === 'kick') {
    if (v) return makePattern('kick', 'trap');
    const s = A.slice();
    const spots = k === 1 ? [7, 15, 14] : [10, 3, 11, 13];
    let added = 0;
    for (const i of shuffle(spots.slice())) if (!s[i] && added < k) { s[i] = 0.55; added++; }
    return s;
  }
  if (id === 'clap') {
    if (v) return makePattern('clap', 'slow');
    if (k === 2) return makePattern('clap', 'sync');
    const s = A.slice();
    s[pick([15, 7, 11])] = 0.55;
    return s;
  }
  if (id === 'hat') {
    if (v) return makePattern('hat', 'trap');
    if (k === 1) return makePattern('hat', pick(VARIANTS.hat.filter(x => x !== 'trap' && x !== 'sparse')));
    // Живые хэты: офбиты сильно, шестнадцатые — с вероятностью и тише
    return Array.from({ length: 16 }, (_, i) => (i % 4 === 2 ? 0.85 : chance(i % 2 ? 0.45 : 0.25) ? 0.5 : 0));
  }
  if (id === 'ohat') return makePattern('ohat', k === 1 ? 'sparse' : 'off');
  if (id === 'perc') {
    if (k === 1) return makePattern('perc', 'gen');
    // Полиметр: фраза короче такта, которая сдвигается относительно бита
    const len = pick([3, 5, 6, 7, 10]);
    const s = Array(len).fill(0);
    s[0] = 0.85;
    if (len > 4 && chance(0.6)) s[Math.floor(len / 2)] = 0.55;
    return s;
  }
  return A.slice();
}

function synthAlt(id, A, scale, genre, k) {
  const v = A.some(Boolean);
  if (id === 'bass') {
    if (k === 2 || !v) return makePattern('bass', defaultVariant('bass', genre), scale);
    // Мутация: несколько нот уходят на соседние ступени или на октаву
    const s = A.map(x => x && { ...x });
    const on = s.map((x, i) => (x ? i : -1)).filter(i => i > 0);
    for (const i of shuffle(on).slice(0, 2 + Math.floor(rnd() * 2))) {
      s[i].n = chance(0.35) && s[i].n < 12 ? s[i].n + 12 : deg(scale, semiToDeg(s[i].n, scale) + pick([-2, -1, 1, 2]));
    }
    return s;
  }
  if (id === 'stab') {
    if (k === 1 || !v) return makePattern('stab', genre === 'witch' ? 'pad' : pick(['dub', 'chords', 'sparse']), scale);
    // Вопрос — ответ: два удара в первой половине, ответ другим аккордом во второй
    const s = Array(16).fill(null);
    s[2] = N(0); s[5] = N(0);
    s[10] = N(deg(scale, pick([3, -2, 4]))); s[13] = N(deg(scale, pick([2, -1])), { len: 2 });
    return s;
  }
  if (k === 1) {
    // Вопрос — ответ — разворот
    const s = Array(16).fill(null), base = pick([0, 2, 4]);
    s[0] = N(deg(scale, base + 2)); s[2] = N(deg(scale, base + 4), { len: 2 });
    s[8] = N(deg(scale, base + 1)); s[10] = N(deg(scale, base), { len: 2 });
    s[14] = N(deg(scale, base + pick([5, -1])));
    return s;
  }
  // Полиметрическое арпеджио: 3–7 нот по кругу
  const len = pick([3, 5, 6, 7]);
  return Array.from({ length: len }, (_, i) => (i === len - 1 && len > 4 ? null : N(deg(scale, pick([0, 2, 4, 7, 9])))));
}

function makeAlts(state, genre) {
  const alt = {};
  for (const id of LANES) {
    const A = state.tracks[id].steps;
    alt[id] = [1, 2].map(k => (drum(id) ? drumAlt(id, A, genre, k) : synthAlt(id, A, state.scale, genre, k)));
  }
  return alt;
}

// ——— Сочинение ———
function allocate(seq, n) {
  const half = t => t === 'rise' || t === 'pit';
  const W = seq.reduce((a, s) => a + s[1], 0);
  const segs = seq.map(([type, w]) => {
    const raw = (w * n) / W;
    return { type, n: half(type) ? Math.max(0.5, Math.round(raw * 2) / 2) : Math.max(1, Math.round(raw)) };
  });
  const sum = () => segs.reduce((a, s) => a + s.n, 0);
  const flex = ['main', 'drop', 'build', 'break'];
  for (let g = 0; sum() > n + 0.5 && g < 200; g++) {
    const c = segs.filter(s => flex.includes(s.type) && s.n > 1).sort((a, b) => b.n - a.n)[0];
    if (c) { c.n--; continue; }
    const k = segs.findIndex(s => ['down', 'build', 'pit'].includes(s.type));
    if (k < 0) break;
    segs.splice(k, 1);
  }
  const grow = segs.filter(s => s.type === 'main' || s.type === 'drop');
  for (let g = 0; sum() < n - 0.5 && g < 200; g++) (grow.length ? grow[g % grow.length] : segs[segs.length >> 1]).n++;
  return segs;
}

// Уровни дорожек в блоке. ctx: очередь вступления, герой, жанр, сколько ударных уже играет.
function planLevels(t, bl, ctx) {
  const { G, M, hero, prof } = ctx, gN = G.length, lv = Object.fromEntries(LANES.map(id => [id, 0]));
  const on = (ids, l = 2) => ids.forEach(id => { lv[id] = l; });
  const dropTop = () => { const c = G.filter(id => TOP.includes(id) && lv[id]); if (c.length > 1) lv[pick(c)] = 0; };
  if (t === 'intro') {
    if (ctx.soft && bl.b < Math.ceil(bl.nb / 2)) {
      on(M, 1);
      if (hero !== 'none') lv[hero] = 2;
      if (G.includes('perc') && chance(0.5)) lv.perc = 1;
    } else {
      on(G.slice(0, Math.min(gN, ctx.a)));
      if (lv.hat) lv.hat = 1;
      ctx.a = Math.min(gN, ctx.a + 1);
    }
  } else if (t === 'build') {
    on(G.slice(0, Math.min(gN, ctx.a)));
    ctx.a = Math.min(gN, ctx.a + 1);
  } else if (t === 'main') {
    ctx.a = gN;
    on(G);
    if (chance(0.45)) dropTop();
    if (chance(0.3)) lv.hat = 3;
    M.forEach(id => { lv[id] = chance(0.45) ? 1 : 0; });
    if (M.length && chance(0.4)) lv[pick(M)] = 2; // «плюс»-блок: добавочный слой сверху
  } else if (t === 'break') {
    lv.hat = chance(0.6) ? 1 : 0;
    lv.perc = chance(0.5) ? 1 : 0;
    on(M);
    if (M.length > 1 && chance(0.3)) lv[M[1]] = 1;
    if (prof.breakBass) lv.bass = prof.breakBass;
  } else if (t === 'pit') {
    if (chance(0.5)) lv.perc = 1;
    if (M[0]) lv[M[0]] = 1;
  } else if (t === 'rise') {
    lv.kick = chance(0.4) ? 1 : 0;
    lv.hat = chance(0.5) ? 3 : 2;
    lv.bass = 1;
    on(M);
    if (chance(0.5)) lv.perc = 1;
  } else if (t === 'drop') {
    on(G);
    lv.hat = 3;
    lv.bass = chance(0.5) ? 3 : 2;
    if (chance(0.4)) lv.perc = 3;
    on(M);
    if (bl.b > 0 && chance(0.35)) { if (chance(0.5)) dropTop(); else if (M.length) lv[pick(M)] = 1; }
  } else if (t === 'down') {
    on(G);
    if (chance(0.4)) lv.clap = 0;
  } else if (t === 'outro') {
    // Инструменты уходят по одному, в обратном порядке вступления
    const left = Math.max(2, Math.round(gN * (1 - (bl.b + 1) / (bl.nb + 1))));
    on(G.slice(0, left));
    if (bl.b === bl.nb - 1) { if (lv.hat) lv.hat = 1; if (ctx.soft && chance(0.6)) { on(G, 0); on(M, 1); } }
  } else if (t === 'insert') {
    const kind = pick(['echo', 'solo', 'same', 'same']);
    if (kind === 'echo') { lv.perc = 2; lv.clap = 1; on(M); }
    else if (kind === 'solo') { lv.perc = 1; if (hero !== 'none') lv[hero] = 2; }
    else Object.assign(lv, ctx.prev || {});
    ctx.insertKind = kind;
  }
  // Герой слышен почти весь трек
  if (hero !== 'none' && ['build', 'main', 'break', 'drop', 'rise', 'down'].includes(t) && !lv[hero]) lv[hero] = 1;
  for (const id of LANES) if (!G.includes(id) && !M.includes(id)) lv[id] = 0;
  return lv;
}

const BASSF = { intro: [0.35, 0.6], build: [0.6, 0.9], main: [0.9, 1.3], break: [0.5, 0.7], pit: [0.5, 0.5], rise: [0.7, 2.2], drop: [1.3, 2], down: [1.2, 0.8], outro: [0.7, 0.35], insert: [1, 1] };

// Всё, кроме уровней: переходы, фильтр, гармония, начало части.
function planDetails(sec, bl, next, k, ctx) {
  const { prof } = ctx, t = sec.type;
  let out = 'none';
  if (t === 'rise') out = 'rise';
  else if (t === 'insert') out = ctx.insertKind === 'echo' ? 'delay' : ctx.insertKind === 'same' ? pick(['stutter', 'wash', 'stop']) : 'none';
  else if (!next) out = 'none';
  else if (next.type === 'drop' && next.b === 0) out = pick(prof.turns.preDrop);
  else if ((next.type === 'break' || next.type === 'pit') && next.b === 0) out = pick(prof.turns.toBreak);
  else if (t === 'outro' || t === 'intro') out = chance(0.3) ? 'fill' : 'none';
  else out = pick(prof.turns.groove);

  let inn = 'none';
  if (bl.b === 0 && t === 'drop') inn = pick(prof.drops);
  else if (bl.b === 0 && (t === 'break' || t === 'pit')) inn = chance(0.7) ? 'down' : 'none';
  else if (bl.b === 0 && t === 'main' && k > 0) inn = chance(0.65) ? 'crash' : 'hit';
  else if (k > 0 && ['main', 'drop', 'build'].includes(t) && chance(0.22)) inn = pick(prof.marks);

  let head = 'none';
  if (['main', 'drop'].includes(t) && bl.b > 0 && inn !== 'fake' && chance(prof.heads)) head = chance(0.5) ? 'scoop' : 'minimal';

  let filter = 'none';
  if (t === 'intro' && bl.b === 0) filter = ctx.soft || chance(0.6) ? 'rise' : 'none';
  else if (t === 'outro' && bl.b === bl.nb - 1) filter = chance(0.75) ? 'fall' : 'none';
  else if (t === 'break' || t === 'pit' || (t === 'insert' && ctx.insertKind === 'echo')) filter = chance(0.5) ? 'dark' : 'none';
  else if (t === 'rise') filter = 'hp';

  const prog = ['break', 'drop', 'main', 'rise'].includes(t) && ctx.prog !== 'none' && chance(prof.progUse) ? ctx.prog : 'none';
  Object.assign(sec, { in: inn, out, head, filter, prog, bassF: prof.bassF ? BASSF[t] : null });
}

// Какой рисунок (A, B или C) играет у дорожки в блоке и с какого места части она вступает.
function planPatterns(sec, k, ctx, bl) {
  const pat = {}, enter = {};
  for (const id of LANES) {
    if (!sec.lv[id]) continue;
    const p = TOP.includes(id) ? 0.5 : id === 'kick' ? 0.15 : id === 'bass' ? 0.3 : 0.35;
    if (k > 0 && chance(p)) ctx.cur[id] = pick([0, 1, 2].filter(x => x !== ctx.cur[id]));
    if (ctx.cur[id]) pat[id] = ctx.cur[id];
    // Вступление со сдвигом, как у живых продюсеров, — не всё сразу с начала части
    const was = ctx.prev && ctx.prev[id];
    if (!was && k > 0 && sec.bars >= 8 && ['intro', 'build', 'main', 'drop'].includes(sec.type) && !(sec.type === 'drop' && bl.b === 0) && chance(0.35)) {
      enter[id] = pick([0.25, 0.5, 0.5, 0.75]);
    }
  }
  sec.pat = pat;
  sec.enter = enter;
}

// Сочинить трек: state меняется (пустые партии, которые нужны жанру, дописываются), возвращается song.
export function compose(state, minutes, genre, seed) {
  return withSeed(seed, () => {
    const pid = profileFor(genre), prof = PROFILES[pid];
    // Партии, которых нет, сочиняем, иначе блокам нечего играть
    for (const id of [...prof.groove, ...prof.music]) {
      const tr = state.tracks[id];
      if (isEmpty(tr)) { tr.steps = makePattern(id, defaultVariant(id, genre), state.scale); tr.variant = defaultVariant(id, genre); }
    }
    const T = Math.max(16, Math.round((minutes * 60) / barSec(state.bpm)));
    const B = T >= 96 ? 16 : T >= 48 ? 8 : 4;
    const formId = wpick(prof.forms), form = FORMS[formId];
    const segs = allocate(form.seq, Math.max(4, Math.round(T / B)));
    const G = ['kick', ...shuffle(prof.groove.filter(x => x !== 'kick'))];
    // Сразу за бочкой — хэты или перкуссия (так интро удобно сводить), бас — не позже четвёртого
    const second = G.findIndex(x => x === 'hat' || x === 'perc');
    if (second > 1) G.splice(1, 0, G.splice(second, 1)[0]);
    if (G.indexOf('bass') > 3) { G.splice(G.indexOf('bass'), 1); G.splice(3, 0, 'bass'); }
    const hero = { id: pick(prof.hero), shape: pick(Object.keys(SHAPES)) };
    const ctx = {
      G, M: prof.music, hero: hero.id, prof, a: prof.introCount - (chance(0.3) ? 1 : 0),
      soft: !!form.soft || chance(prof.softIntro), prog: pick(prof.progs), cur: {}, prev: null,
    };
    const blocks = [];
    for (const seg of segs) {
      const whole = Math.floor(seg.n), half = seg.n - whole >= 0.5, nb = whole + (half ? 1 : 0);
      for (let b = 0; b < nb; b++) blocks.push({ type: seg.type, bars: b === nb - 1 && half ? B / 2 : B, b, nb });
    }
    // Вставки: 1–2 такта контраста в середине трека (не в начале и не в конце — там диджей сводит)
    if (B >= 8 && blocks.length >= 6 && chance(prof.squeeze)) {
      const spots = blocks.map((bl, i) => i).filter(i => i >= blocks.length * 0.25 && i <= blocks.length * 0.75 && ['main', 'drop'].includes(blocks[i].type) && blocks[i + 1] && ['main', 'drop'].includes(blocks[i + 1].type));
      for (const i of shuffle(spots).slice(0, chance(0.3) ? 2 : 1).sort((a, b) => b - a)) blocks.splice(i + 1, 0, { type: 'insert', bars: B >= 16 ? pick([1, 2, 2]) : 1, b: 0, nb: 1 });
    }
    const sections = blocks.map((bl, k) => {
      const lv = planLevels(bl.type, bl, ctx);
      const sec = { type: bl.type, bars: bl.bars, lv };
      planDetails(sec, bl, blocks[k + 1], k, ctx);
      planPatterns(sec, k, ctx, bl);
      ctx.prev = lv;
      return sec;
    });
    return { genre: pid, seed, form: formId, hero, alt: makeAlts(state, genre), sections };
  });
}

// Пересочинить одну часть: тип и длина остаются, остальное — заново по правилам жанра.
export function rerollSection(state, i) {
  const song = state.song, sec = song.sections[i], prof = PROFILES[song.genre] || PROFILES.techno;
  const G = ['kick', ...shuffle(prof.groove.filter(x => x !== 'kick'))];
  const ctx = { G, M: prof.music, hero: song.hero ? song.hero.id : 'none', prof, a: G.length - 1, soft: false, prog: pick(prof.progs), cur: {}, prev: i ? song.sections[i - 1].lv : null };
  const bl = { type: sec.type, bars: sec.bars, b: sec.type === 'intro' || sec.type === 'outro' ? 0 : 1, nb: 2 };
  const nx = song.sections[i + 1];
  sec.lv = planLevels(sec.type, bl, ctx);
  planDetails(sec, bl, nx && { type: nx.type, b: 0 }, i, ctx);
  planPatterns(sec, Math.max(1, i), ctx, bl);
}

export function locate(song, bar) {
  let a = 0;
  for (let i = 0; i < song.sections.length; i++) {
    const s = song.sections[i];
    if (bar < a + s.bars) return { i, j: bar - a, s, start: a };
    a += s.bars;
  }
  return null;
}

export const sectionStart = (song, i) => song.sections.slice(0, i).reduce((a, s) => a + s.bars, 0);

// Лёгкая версия рисунка ударных (уровень 1).
function thin(id, s) {
  const o = s.slice();
  if (id === 'kick') return o.map((v, i) => (i % 4 === 0 ? v : 0));
  if (id === 'hat') {
    const off = o.map((v, i) => (i % 4 === 2 ? v : 0));
    return off.some(Boolean) ? off : o.map((v, i) => (i % 4 === 0 ? v : 0));
  }
  if (id === 'clap' || id === 'ohat') {
    const last = o.map((v, i) => (v ? i : -1)).filter(i => i >= 0).pop();
    return o.map((v, i) => (i === last ? v : 0));
  }
  let k = 0;
  return o.map(v => (v && k++ % 2 === 0 ? v : 0));
}

// Плотная версия (уровень 3).
function thick(id, s) {
  const o = s.slice();
  if (id === 'hat') return o.map((v, i) => v || (i % 2 === 0 ? 0.5 : 0));
  if (id === 'perc') return o.map((v, i) => v || (i % 4 === 3 ? 0.5 : 0));
  return o;
}

const shiftNote = (n, d, scale) => deg(scale, semiToDeg(n, scale) + d);
const need = (steps, id) => steps[id] || (steps[id] = Array(16).fill(0));
const clearFrom = (steps, ids, from, to = 16) => {
  for (const id of ids) {
    const s = steps[id];
    if (s) for (let i = from; i < to; i++) s[i] = drum(id) ? 0 : null;
  }
};

// Сбивка в конце фразы.
function fill(steps, kind) {
  if (kind === 'end') {
    clearFrom(steps, ['kick'], 12);
    const c = need(steps, 'clap');
    [0.45, 0.6, 0.75, 0.95].forEach((v, i) => { c[12 + i] = v; });
  } else if (kind === 'snare') {
    const c = need(steps, 'clap');
    c[14] = Math.max(c[14], 0.55);
    c[15] = Math.max(c[15], 0.85);
    if (steps.kick) steps.kick[14] = 0;
  } else {
    if (steps.hat) for (let i = 12; i < 16; i++) steps.hat[i] = Math.max(steps.hat[i], 0.7);
    need(steps, 'ohat')[14] = 0.85;
  }
}

// Рисунок дорожки в такте bar: выбранный вариант (A/B/C); полиметр продолжается через такты.
function source(state, id, pi, bar) {
  const alt = state.song.alt && state.song.alt[id];
  let src = pi && alt && alt[pi - 1] ? alt[pi - 1] : state.tracks[id].steps;
  if (!src.some(Boolean)) return null;
  if (src.length !== 16) { const L = src.length; src = Array.from({ length: 16 }, (_, s) => src[(bar * 16 + s) % L]); }
  return src;
}

// Что играет в такте bar трека: рисунки, громкость, фильтры, переходы.
export function barData(state, bar) {
  const song = state.song;
  if (!song) return null;
  const L = locate(song, bar);
  if (!L) return null;
  const { s: sec, j } = L, n = sec.bars, last = j === n - 1;
  const groove = sec.type === 'main' || sec.type === 'drop' || sec.type === 'build';
  const pr = PROGS[sec.prog] || PROGS.none;
  const shift = pr.d[Math.floor(j / (pr.per || 1)) % pr.d.length];
  const pats = sec.pat || {}, enter = sec.enter || {}, hero = song.hero && song.hero.id !== 'none' ? song.hero : null;
  const steps = {}, gain = {}, cut = {};
  for (const id of LANES) {
    const l = sec.lv[id] || 0;
    gain[id] = 1;
    cut[id] = 1;
    const src = l ? source(state, id, pats[id] || 0, bar) : null;
    if (!src || (enter[id] && j < Math.floor(n * enter[id]))) { steps[id] = null; continue; }
    if (drum(id)) { steps[id] = l === 1 ? thin(id, src) : l === 3 ? thick(id, src) : src.slice(); continue; }
    const s = src.map(x => x && { ...x, n: shift ? shiftNote(x.n, shift, state.scale) : x.n });
    if (id === 'bass' && groove && l >= 2 && j % 4 === 3) {
      // Разворот в конце каждых 4 тактов: последняя нота баса — на октаву выше
      const k = s.map((x, i) => (x ? i : -1)).filter(i => i > 0).pop();
      if (k != null && s[k].n < 12) s[k] = { ...s[k], n: s[k].n + 12 };
    }
    steps[id] = s;
    if (l === 1) { gain[id] = 0.6; cut[id] = 0.5; } else if (l === 3) cut[id] = 1.35;
  }
  if (sec.bassF) { const [a, b] = sec.bassF; cut.bass *= a + (b - a) * (n > 1 ? j / (n - 1) : 1); }
  if (hero && steps[hero.id]) {
    const m = heroCurve(hero.shape, (bar + 0.5) / songBars(song));
    if (drum(hero.id)) gain[hero.id] *= 0.55 + 0.45 * Math.min(1, m);
    else { cut[hero.id] *= m; gain[hero.id] *= 0.75 + 0.25 * Math.min(1, m); }
  }

  // Начало части: без низа или только бочка с героем
  const hb = sec.head && sec.head !== 'none' ? Math.max(1, Math.min(2, n >> 2)) : 0;
  if (j < hb) {
    if (sec.head === 'scoop') clearFrom(steps, ['kick', 'bass'], 0);
    else for (const id of LANES) if (id !== 'kick' && (!hero || id !== hero.id)) steps[id] = null;
  }

  const fx = [];
  if (j === 0 && sec.in && sec.in !== 'none') {
    if (sec.in === 'fake') { clearFrom(steps, LANES, 0, 8); fx.push({ type: 'impact', at: 8 }); }
    else fx.push({ type: sec.in });
  } else if (groove && j > 0 && j % 16 === 0) fx.push({ type: 'crash' });
  if (last && sec.out === 'fill') fill(steps, 'end');
  else if (groove && !last && (j + 1) % 8 === 0) fill(steps, ((j + 1) / 8) % 2 ? 'snare' : 'hats');
  let roll = null;
  if (sec.out === 'rise') {
    const R = Math.min(8, n), rr = Math.min(4, n);
    if (j === n - R) fx.push({ type: 'riser', bars: R });
    if (j >= n - rr) roll = [(j - (n - rr)) / rr, (j - (n - rr) + 1) / rr];
    if (last) { clearFrom(steps, ['kick', 'bass'], 8); clearFrom(steps, LANES, 12); }
  }
  if (last) {
    const o = sec.out;
    if (o === 'gap') clearFrom(steps, LANES, 12);
    else if (o === 'swell') fx.push({ type: 'swell' });
    else if (o === 'scoop') clearFrom(steps, ['kick', 'bass'], 8);
    else if (o === 'stutter') fx.push({ type: 'stutter', at: 12 });
    else if (o === 'kickroll') {
      const k = need(steps, 'kick');
      [8, 10, 12, 13, 14, 15].forEach((i, x) => { k[i] = 0.6 + x * 0.08; });
      clearFrom(steps, ['bass'], 8);
    } else if (o === 'toms') { fx.push({ type: 'toms', at: 8 }); clearFrom(steps, ['kick'], 12); }
    else if (o === 'delay' || o === 'wash') { fx.push({ type: 'throw', kind: o === 'delay' ? 'dly' : 'rev', at: 12 }); clearFrom(steps, LANES, 13); }
    else if (o === 'stop') fx.push({ type: 'stop', at: 12 });
  }

  const ex = (a, b, x) => a * (b / a) ** Math.min(1, Math.max(0, x));
  let lp = [20000, 20000], hp = [20, 20];
  if (sec.filter === 'rise') lp = [ex(350, 20000, j / n), ex(350, 20000, (j + 1) / n)];
  else if (sec.filter === 'fall') lp = [ex(20000, 350, j / n), ex(20000, 350, (j + 1) / n)];
  else if (sec.filter === 'dark') lp = [1300, 1300];
  else if (sec.filter === 'hp') {
    const w = Math.min(8, n), x0 = (j - (n - w)) / w;
    if (x0 >= 0) hp = [ex(20, 700, x0), ex(20, 700, x0 + 1 / w)];
  }
  return { i: L.i, j, n, type: sec.type, steps, gain, cut, fx, roll, lp, hp };
}

// Энергия части для графика: [в начале, в конце], от 0 до 1.
const EW = { kick: 3, clap: 1.2, hat: 1, ohat: 0.6, perc: 0.6, bass: 2, stab: 1, lead: 1.2 };
export function energy(state, sec) {
  let e = 0, m = 0;
  for (const id of LANES) {
    m += EW[id] * 2;
    if (!isEmpty(state.tracks[id])) e += EW[id] * Math.min(3, sec.lv[id] || 0) * (1 - ((sec.enter && sec.enter[id]) || 0) * 0.5);
  }
  const v = Math.min(1, e / (m * 0.8));
  if (sec.out === 'rise') return [v, Math.min(1, v + 0.35)];
  if (sec.filter === 'rise') return [v * 0.45, v];
  if (sec.filter === 'fall') return [v, v * 0.4];
  if (sec.filter === 'dark') return [v * 0.8, v * 0.8];
  return [v, v];
}
