// Аранжировка: как из одного такта сделать трек на 1–5 минут — и каждый раз другой.
// Генератор собирает трек из блоков по 16 тактов по правилам жанра (PROFILES) и одной из форм (FORMS).
// Каждый вариант получает номер (seed): с тем же номером получится тот же трек. Правила словами — в ARRANGEMENT.md.
import { TRACK, isEmpty, deg, semiToDeg, makePattern, VARIANTS, defaultVariant, PROGS, GENRE_PROGS, harmShift, freshParts } from './music.js?v=5';
import { VOX, genreVox, planSongVox } from './vox.js?v=5';
import { FL } from './fl.js?v=5';

// Звуки FL для переходов трека (если есть): свой райзер, удар, спуск и пара «приколов»
function planFlFx() {
  if (!FL.ready) return null;
  const of = c => FL.items.filter(i => i.cat === c);
  const one = c => { const l = of(c); return l.length ? pick(l).id : null; };
  const ear = shuffle(of('fx')).slice(0, 3).map(i => i.id);
  return { riser: one('riser'), impact: one('impact'), down: one('down'), ear };
}

export { PROGS };

export const LANES = ['kick', 'clap', 'hat', 'ohat', 'perc', 'bass', 'stab', 'lead'];

// Типы частей трека.
export const PART = {
  intro: { name: 'Интро', color: '#5ce1ff', hint: 'вход: мало инструментов, фильтр открывается' },
  build: { name: 'Набор', color: '#8fa2ff', hint: 'инструменты входят по одному' },
  main: { name: 'Грув', color: '#d4ff3a', hint: 'основная часть, всё качает' },
  break: { name: 'Брейк', color: '#b67cff', hint: 'бочка уходит, звучат аккорды и мелодия' },
  pit: { name: 'Яма', color: '#7d6aa6', hint: 'без бочки и баса: мелодия и перкуссия отыгрывают, каждый такт свой' },
  rise: { name: 'Подъём', color: '#ffb547', hint: 'аккорды лезут вверх, фильтр открывается, шум растёт, срез низа' },
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
  progUse: 0.88, pers: { 1: 3, 2: 3, 4: 1, 0.5: 1 }, squeeze: 0.35, heads: 0.25, introCount: 2, softIntro: 0, breakBass: 0, bassF: false,
  turns: TURNS, marks: ['crash', 'crash', 'hit', 'down'], drops: ['impact', 'impact', 'fake'], ...o,
});
export const PROFILES = {
  techno: P({ name: 'Техно', forms: { classic: 3, twoPeaks: 2, trilogy: 2, slowBurn: 1, longBreak: 1, djTool: 1 } }),
  acid: P({
    name: 'Эсид', forms: { classic: 3, twoPeaks: 2, slowBurn: 2, trilogy: 1, plateau: 1 }, hero: ['stab', 'perc', 'lead'],
    music: ['stab', 'lead'], breakBass: 1, bassF: true,
  }),
  minimal: P({
    name: 'Минимал', forms: { djTool: 3, plateau: 3, slowBurn: 2, classic: 1 }, squeeze: 0.55, heads: 0.45, hero: ['perc', 'bass', 'stab'],
    progUse: 0.7, pers: { 1: 1, 2: 2, 4: 3 },
    turns: { groove: ['scoop', 'delay', 'toms', 'none', 'none', 'none'], toBreak: ['delay', 'swell', 'scoop'], preDrop: ['gap', 'scoop'] },
    marks: ['hit', 'none', 'crash'], drops: ['impact', 'crash'],
  }),
  dub: P({
    name: 'Даб-техно', forms: { fromSilence: 3, plateau: 2, slowBurn: 2 }, hero: ['stab'], softIntro: 0.8, pers: { 1: 1, 2: 2, 4: 3 },
    turns: { groove: ['delay', 'delay', 'wash', 'none', 'none'], toBreak: ['wash', 'delay', 'swell'], preDrop: ['gap', 'delay'] },
    marks: ['hit', 'none'], drops: ['crash', 'hit'],
  }),
  detroit: P({ name: 'Детройт', forms: { classic: 3, longBreak: 2, twoPeaks: 1 }, hero: ['stab', 'lead'], progUse: 0.95, pers: { 1: 2, 2: 3, 4: 1 } }),
  melodic: P({ name: 'Мелодик-техно', forms: { longBreak: 4, classic: 2, fromSilence: 2 }, hero: ['lead', 'stab'], progUse: 0.95, pers: { 1: 2, 2: 3, 4: 1 }, softIntro: 0.4 }),
  hypnotic: P({ name: 'Гипнотик', forms: { plateau: 4, djTool: 2, slowBurn: 2, trilogy: 1 }, hero: ['perc', 'bass', 'stab'], squeeze: 0.45, heads: 0.4, progUse: 0.7, pers: { 1: 1, 2: 2, 4: 3 } }),
  industrial: P({
    name: 'Индастриал', forms: { earlyDrop: 2, twoPeaks: 3, trilogy: 2, classic: 1 }, hero: ['perc', 'bass'], music: ['stab'], pers: { 0.5: 2, 1: 3, 2: 2 },
    turns: { groove: ['stutter', 'toms', 'kickroll', 'fill', 'none', 'none'], toBreak: ['stop', 'wash', 'scoop'], preDrop: ['gap', 'kickroll', 'stutter'] },
  }),
  hard: P({
    name: 'Хард-техно', forms: { earlyDrop: 4, twoPeaks: 3, trilogy: 2 }, hero: ['bass', 'lead', 'stab'], pers: { 0.5: 2, 1: 3, 2: 2 },
    turns: { groove: ['kickroll', 'fill', 'stutter', 'toms', 'none', 'none'], toBreak: ['stop', 'swell', 'wash'], preDrop: ['kickroll', 'gap', 'stutter'] },
    drops: ['impact', 'fake', 'impact'],
  }),
  witch: P({
    name: 'Witch House', forms: { fromSilence: 4, twoPeaks: 2, longBreak: 2 }, groove: ['kick', 'clap', 'hat', 'bass', 'perc', 'ohat'],
    hero: ['stab', 'lead'], progUse: 0.9, pers: { 1: 2, 2: 3, 4: 1 }, softIntro: 1,
    turns: { groove: ['fill', 'stop', 'wash', 'delay', 'none', 'none'], toBreak: ['stop', 'wash', 'swell'], preDrop: ['gap', 'stop'] },
    marks: ['hit', 'down', 'none'], drops: ['impact', 'fake'],
  }),
  house: P({
    name: 'Хаус', forms: { classic: 3, slowBurn: 2, longBreak: 2, djTool: 1, plateau: 1 }, groove: ['kick', 'clap', 'hat', 'bass', 'ohat', 'perc'],
    hero: ['stab', 'lead', 'bass'], progUse: 0.95, pers: { 1: 2, 2: 3, 4: 1 },
    turns: { groove: ['fill', 'delay', 'scoop', 'toms', 'none', 'none'], toBreak: ['swell', 'delay', 'wash'], preDrop: ['gap', 'scoop', 'stutter'] },
    marks: ['crash', 'crash', 'hit'], drops: ['impact', 'crash'],
  }),
};
for (const [k, p] of Object.entries(PROFILES)) p.progs = GENRE_PROGS[k];
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
    // Яма: бочка и бас молчат, зато мелодия, аккорды и перкуссия отыгрывают — каждый такт свой
    M.forEach((id, k) => { lv[id] = k ? 1 : 2; });
    if (G.includes('perc')) lv.perc = chance(0.6) ? 2 : 1;
  } else if (t === 'rise') {
    // Подъём держится на гармонии и фильтре, а не на дроби хэтов
    lv.kick = chance(0.4) ? 1 : 0;
    lv.hat = chance(0.4) ? 1 : 0;
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
  else if (t === 'break' || (t === 'insert' && ctx.insertKind === 'echo')) filter = chance(0.5) ? 'dark' : 'none';
  else if (t === 'pit') filter = chance(0.25) ? 'dark' : 'none';
  else if (t === 'rise') filter = 'hp';

  // Гармония: в груве и дропе — главный круг аккордов, в брейке — свой, в подъёме аккорды лезут вверх
  const H = ctx.harm, still = { prog: 'none', per: 1 };
  let hm = still;
  if (t === 'rise') hm = H.rise.prog === 'climb' ? { prog: 'climb', per: Math.max(0.5, sec.bars / 4) } : H.rise;
  else if (t === 'break' || t === 'pit') hm = H.brk;
  else if (t === 'main' || t === 'drop' || t === 'down') hm = chance(prof.progUse) ? H.main : still;
  else if (t === 'build') hm = chance(0.6) ? H.main : still;
  else if (t === 'intro') hm = bl.b > 0 && bl.b === bl.nb - 1 && chance(0.5) ? H.main : still;
  else if (t === 'outro') hm = bl.b === 0 && chance(0.5) ? H.main : still;
  else if (t === 'insert') hm = chance(0.5) ? H.main : still;

  // Во втором и следующих дропах мелодия или аккорды иногда уходят на октаву выше — так пик звучит сильнее первого
  if (t === 'drop' && bl.b === 0) ctx.oct = (ctx.drops = (ctx.drops || 0) + 1) > 1 && chance(0.45) ? { [ctx.M.includes('lead') ? 'lead' : ctx.M[0]]: 12 } : null;
  Object.assign(sec, { in: inn, out, head, filter, prog: hm.prog, per: hm.per, bassF: prof.bassF ? BASSF[t] : null });
  if (t === 'drop' && ctx.oct) sec.oct = { ...ctx.oct };
}

// Гармония трека: главный круг аккордов, круг для брейка и «лестница» для подъёма.
function planHarmony(prof, state) {
  const h = state.harm, own = h && !h.auto && h.prog !== 'none';
  const per = () => Number(wpick(prof.pers));
  const main = own ? { prog: h.prog, per: h.per } : { prog: pick(prof.progs), per: per() };
  const moving = prof.progs.filter(x => x !== 'none');
  const r = rnd();
  // В брейке аккорды часто тянутся вдвое дольше — больше воздуха; иногда там свой круг
  const brk = r < 0.45 && main.prog !== 'none' ? { prog: main.prog, per: Math.min(4, main.per * 2) } : r < 0.85 ? { prog: pick(moving) || main.prog, per: per() } : main;
  // Подъём: аккорды лезут вверх по ступеням или меняются вдвое чаще — напряжение без дроби хэтов
  const rise = chance(0.55) || main.prog === 'none' ? { prog: 'climb', per: 0 } : { prog: main.prog, per: Math.max(0.5, main.per / 2) };
  return { main, brk, rise };
}

// ——— Отыгрыш: в яме и брейке у партий каждый такт свой, но всё в ладу и в сетке ———
// Ритмические ячейки на такт: синкопы, 3-3-2, пунктир «три против четырёх».
const CELLS = [
  [0, 3, 6, 10, 12], [0, 3, 6, 8, 11, 14], [0, 2, 3, 6, 8, 10, 11, 14], [2, 3, 6, 7, 10, 11, 14],
  [0, 3, 6, 9, 12, 15], [0, 1, 4, 6, 8, 9, 12, 14], [0, 4, 6, 10, 11, 14], [0, 6, 8, 14],
  [0, 2, 4, 7, 10, 12, 14], [3, 6, 9, 12, 14, 15], [0, 3, 4, 7, 8, 11, 12, 15], [0, 2, 5, 8, 10, 13],
];
const TONES = [-3, 0, 2, 4, 6, 7, 9, 11]; // звуки аккорда — на сильные доли
const nearTone = d => TONES.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a));
const clampD = (d, hi = 11) => Math.max(-3, Math.min(hi, d));

// Мотив: ритм из ячейки, мелодия ходит по ладу шагами и прыжками, на сильных долях — звук аккорда.
function motif(cell, start) {
  let d = start;
  return cell.map((s, k) => {
    if (k) d = clampD(d + pick([-2, -1, -1, 1, 1, 2, 2, 3, -3, 4]));
    if (k === 0 || s % 4 === 0) d = nearTone(d);
    return [s, d];
  });
}
// Как мотив развивается от такта к такту.
const VARY = {
  seq: m => { const k = pick([1, 2, -1, -2, 3]); return m.map(([s, d]) => [s, clampD(d + k)]); }, // секвенция: тот же рисунок выше или ниже
  shift: m => { const k = pick([1, 2, 3]); return m.map(([s, d]) => [(s + k) % 16, d]).sort((a, b) => a[0] - b[0]); }, // смещение — синкопа
  oct: m => m.map(([s, d], i) => [s, i % 2 ? clampD(d + 7, 14) : d]), // прыжки через октаву
  mirror: m => m.map(([s, d]) => [s, clampD(2 * m[0][1] - d)]), // зеркало
  half: m => { const h = m.filter(([s]) => s < 8), k = pick([2, -2, 4]); return [...h, ...h.map(([s, d]) => [s + 8, clampD(d + k)])]; }, // половинка и ответ
  run: m => { // пробежка по ладу в конце такта
    const h = m.filter(([s]) => s < 10), last = h.length ? h[h.length - 1][1] : 0, dir = pick([1, -1]);
    return [...h, ...[10, 11, 12, 13, 14, 15].map((s, i) => [s, clampD(last + dir * (i + 1))])];
  },
};
const vary = m => VARY[pick(Object.keys(VARY))](m);
const cadence = m => [...m.filter(([s]) => s < 8), [8, pick([0, 4, 7]), 6]]; // фраза приходит домой длинной нотой

function leadPhrase(P) {
  const A = motif(pick(CELLS), pick([0, 2, 4, 7])), B = motif(pick(CELLS), pick([4, 7, 9]));
  if (P === 1) return [vary(A)];
  if (P === 2) return [A, cadence(vary(A))];
  if (P <= 4) return [A, vary(A), B, cadence(A)];
  return [A, vary(A), vary(A), B, vary(A), vary(B), VARY.run(vary(A)), cadence(B)];
}
function phraseSteps(bar, scale) {
  const s = Array(16).fill(null);
  bar.forEach(([i, d, L], k) => {
    const next = k + 1 < bar.length ? bar[k + 1][0] : 16;
    s[i] = N(deg(scale, d), { len: L ? Math.min(L, 16 - i) : next - i >= 3 && chance(0.5) ? 2 : 1 });
  });
  return s;
}
function stabPhrase(P, lead, state) {
  const sc = state.scale, pad = (state.tracks.stab.p.hold ?? 0.4) > 2, colors = [0, 0, 2, -2, 4, 3];
  return Array.from({ length: P }, (_, k) => {
    const s = Array(16).fill(null), last = k === P - 1;
    if (pad) {
      // Пэд: длинные аккорды, но цвет меняется — то тоника, то соседний аккорд
      const whole = last || chance(0.4);
      s[0] = N(deg(sc, k ? pick(colors) : 0), { len: whole ? 16 : 8 });
      if (!whole) s[8] = N(deg(sc, pick(colors)), { len: 8 });
      return s;
    }
    // Стаб отвечает мелодии в её паузах
    const busy = new Set(lead ? lead[k].map(([i]) => i) : []);
    const hits = pick(CELLS).filter(i => !busy.has(i) && !(last && i >= 8)).slice(0, 2 + Math.floor(rnd() * 3));
    hits.forEach((i, h) => { s[i] = N(h === hits.length - 1 && chance(0.4) ? deg(sc, pick(colors)) : 0); });
    if (last) s[8] = N(deg(sc, pick([0, 4, -2])), { len: 8 });
    if (!s.some(Boolean)) s[0] = N(0);
    return s;
  });
}
function percPhrase(P) {
  const base = pick(CELLS);
  return Array.from({ length: P }, (_, k) => {
    const s = Array(16).fill(0);
    let cell = k % 2 ? pick(CELLS) : base;
    if (k % 4 === 2) { const r = pick([1, 2, 3]); cell = cell.map(i => (i + r) % 16); } // ритм «спотыкается» и возвращается
    cell.forEach(i => { s[i] = i % 4 === 0 ? 1 : pick([0.55, 0.7, 0.85]); });
    if (k === P - 1) for (const i of [10, 11, 14]) s[i] = Math.max(s[i], 0.85);
    return s;
  });
}

// Фразы отыгрыша для партий ids на части длиной bars тактов (фраза — 4 или 8 тактов, дальше по кругу).
export function makePerf(state, ids, bars) {
  const P = bars >= 8 ? 8 : bars >= 4 ? 4 : Math.max(1, bars);
  const lead = ids.includes('lead') ? leadPhrase(P) : null, out = {};
  for (const id of ids) {
    if (id === 'lead') out.lead = lead.map(b => phraseSteps(b, state.scale));
    else if (id === 'stab') out.stab = stabPhrase(P, lead, state);
    else if (id === 'perc') out.perc = percPhrase(P);
    else if (TRACK[id].kind === 'synth') out[id] = leadPhrase(P).map(b => phraseSteps(b, state.scale));
  }
  return out;
}
function planPerf(sec, ctx, state) {
  const t = sec.type, lanes = [];
  if (t === 'pit') lanes.push(...ctx.M, 'perc');
  else if (t === 'break') { lanes.push(...ctx.M); if (chance(0.5)) lanes.push('perc'); }
  else if (t === 'insert' && ctx.insertKind === 'solo') lanes.push('perc', ...ctx.M);
  const ids = lanes.filter(id => sec.lv[id] && !isEmpty(state.tracks[id]));
  if (ids.length) sec.perf = makePerf(state, ids, sec.bars);
  else delete sec.perf;
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
// fresh — новый вариант: свои бочка, бас, хэты, аккорды и звуки (кроме напетого и поправленного руками).
export function compose(state, minutes, genre, seed, fresh = false) {
  return withSeed(seed, () => {
    const pid = profileFor(genre), prof = PROFILES[pid];
    if (fresh) freshParts(state, genre || 'peak');
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
      soft: !!form.soft || chance(prof.softIntro), harm: planHarmony(prof, state), cur: {}, prev: null,
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
      planPerf(sec, ctx, state);
      ctx.prev = lv;
      return sec;
    });
    // Голос: адлибы в груве и дропах, тёмные фразы в брейке, нарезка в яме, призыв перед дропом.
    // Сами решают жанр и номер варианта; если дорожка «Голос» уже заполнена — голос будет точно.
    const vt = state.tracks.vox;
    let vox = null;
    if (vt && VOX.ready && (!isEmpty(vt) || chance(genreVox(pid).use))) {
      const v = planSongVox(sections, pid, vt.vox, state.bpm);
      vox = v && { voice: v.voice };
    }
    return { genre: pid, seed, form: formId, hero, harm: ctx.harm, alt: makeAlts(state, genre), sections, vox, flfx: planFlFx() };
  });
}

// Пересочинить одну часть: тип и длина остаются, остальное — заново по правилам жанра.
export function rerollSection(state, i) {
  const song = state.song, sec = song.sections[i], prof = PROFILES[song.genre] || PROFILES.techno;
  const G = ['kick', ...shuffle(prof.groove.filter(x => x !== 'kick'))];
  const ctx = { G, M: prof.music, hero: song.hero ? song.hero.id : 'none', prof, a: G.length - 1, soft: false, harm: song.harm || planHarmony(prof, state), cur: {}, prev: i ? song.sections[i - 1].lv : null };
  const bl = { type: sec.type, bars: sec.bars, b: sec.type === 'intro' || sec.type === 'outro' ? 0 : 1, nb: 2 };
  const nx = song.sections[i + 1];
  sec.lv = planLevels(sec.type, bl, ctx);
  planDetails(sec, bl, nx && { type: nx.type, b: 0 }, i, ctx);
  planPatterns(sec, Math.max(1, i), ctx, bl);
  planPerf(sec, ctx, state);
  if (song.vox && VOX.ready) planSongVox(song.sections, song.genre, { ...state.tracks.vox.vox, voice: song.vox.voice }, state.bpm, i);
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
    // Провал: последняя доля без бочки — новая фраза падает сильнее
    clearFrom(steps, ['kick'], 12);
  }
}

// ——— Свобода: живые отступления от рисунка, как у человека за пультом ———
// Решения зависят от номера варианта и такта: тот же номер — те же отступления.
const hash = (...a) => a.reduce((h, x) => Math.imul(h ^ (x | 0), 16777619) >>> 0, 2166136261);
const trimBefore = (s, at) => { for (let i = 0; i < at; i++) if (s[i] && i + (s[i].len || 1) > at) s[i] = { ...s[i], len: at - i }; };
const inRange = (n, lo, hi) => (n > hi ? n - 12 : n < lo ? n + 12 : n);

function improvise(steps, sec, j, bar, song, scale, shiftAt, skip) {
  const R = rngFrom(hash(song.seed || 1, bar, 77)), ch = p => R() < p, pk = a => a[Math.floor(R() * a.length)];
  const t = sec.type, n = sec.bars;
  const hot = t === 'drop' ? 1 : t === 'main' || t === 'down' ? 0.8 : t === 'build' || t === 'break' ? 0.55 : t === 'intro' || t === 'outro' ? 0.25 : 0.45;
  const odd = j % 2 === 1, end4 = j % 4 === 3, end8 = j % 8 === 7;
  const turn = j < n - 1 && shiftAt(16) !== shiftAt(15); // на следующем такте сменится аккорд
  const rootNext = deg(scale, shiftAt(16));

  const b = !skip.bass && steps.bass;
  if (b) {
    // Во втором такте пары одна-две ноты баса уходят на октаву, квинту или септиму
    if (odd && ch(0.55 * hot)) {
      const on = b.map((x, i) => (x ? i : -1)).filter(i => i > 0);
      for (let c = 1 + Math.floor(R() * 2); c > 0 && on.length; c--) {
        const i = on.splice(Math.floor(R() * on.length), 1)[0];
        b[i] = { ...b[i], n: inRange(deg(scale, semiToDeg(b[i].n, scale) + pk([7, 4, -3, 2, 6])), -9, 19) };
      }
    }
    // Эсид: акценты и глайды каждый раз в новых местах
    if (song.genre === 'acid' && ch(0.6)) b.forEach((x, i) => { if (x && i) b[i] = { ...x, acc: ch(0.3), slide: !!b[i - 1] && ch(0.28) }; });
    // Толчок: последняя шестнадцатая играет уже следующий аккорд, как живой басист
    if (turn && ch(0.5 * hot + 0.2)) { trimBefore(b, 15); b[15] = { n: rootNext + (b.find(Boolean)?.n >= 12 ? 12 : 0), len: 1, acc: true }; }
  }
  const S = !skip.stab && steps.stab;
  if (S) {
    if (turn && !S[15] && ch(0.45 * hot)) { trimBefore(S, 15); S[15] = { n: rootNext, len: 1 }; }
    else if (odd && ch(0.25)) { const on = S.map((x, i) => (x ? i : -1)).filter(i => i > 0); if (on.length > 1) S[pk(on)] = null; }
  }
  const L = !skip.lead && steps.lead;
  if (L && L.some(Boolean)) {
    // Ответ: вторая половина каждой четвёртой строки уходит выше или ниже
    if (end4 && ch(0.4 + 0.4 * hot)) { const k = pk([2, -2, 4, 7, -3]); for (let i = 8; i < 16; i++) if (L[i]) L[i] = { ...L[i], n: inRange(deg(scale, semiToDeg(L[i].n, scale) + k), -5, 26) }; }
    // Пробежка по ладу в конце восьми тактов
    if (end8 && ch(0.55)) {
      let k = 11;
      while (k >= 0 && !L[k]) k--;
      const d0 = k >= 0 ? semiToDeg(L[k].n, scale) : 0, dir = pk([1, -1]);
      trimBefore(L, 12);
      for (let i = 12; i < 16; i++) L[i] = { n: inRange(deg(scale, d0 + dir * (i - 11)), -5, 26), len: 1 };
    }
  }
  // Живая динамика: хэты и перкуссия никогда не бьют одинаково
  for (const id of ['hat', 'ohat', 'perc']) if (steps[id]) steps[id] = steps[id].map(v => (v && v < 1 ? Math.min(1, v * (0.78 + 0.36 * R())) : v));
  // Раз в четыре такта перкуссия сдвигается — ритм «спотыкается» и возвращается
  if (!skip.perc && steps.perc && end4 && ch(0.35 * hot)) { const r = pk([1, 2, 3]), p = steps.perc; steps.perc = p.map((_, i) => p[(i - r + 16) % 16]); }
}

// Рисунок дорожки в такте bar: выбранный вариант (A/B/C); полиметр продолжается через такты.
// Шаги рисунка в петле: A — сама дорожка, B и C — из трека (state.bank).
export function loopSteps(state, id, bar) {
  const T = state.tracks[id], b = state.bank, alt = b && state.song && state.song.alt && state.song.alt[id];
  if (!alt || !alt[b - 1]) return T.steps;
  return source(state, id, b, bar) || T.steps.map(() => (TRACK[id].kind === 'drum' ? 0 : null));
}

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
  const shiftAt = s => harmShift(sec.prog, sec.per, j, s);
  const pats = sec.pat || {}, enter = sec.enter || {}, perf = sec.perf || {}, oct = sec.oct || {};
  const hero = song.hero && song.hero.id !== 'none' ? song.hero : null;
  const steps = {}, gain = {}, cut = {};
  for (const id of LANES) {
    const l = sec.lv[id] || 0;
    gain[id] = 1;
    cut[id] = 1;
    const pf = l && perf[id];
    // Кнопки A/B/C в режиме трека: выбранный рисунок вместо того, что решила аранжировка
    const pi = state.bank != null ? state.bank : pats[id] || 0;
    const src = pf ? pf[j % pf.length] : l ? source(state, id, pi, bar) : null;
    if (!src || (enter[id] && j < Math.floor(n * enter[id]))) { steps[id] = null; continue; }
    if (drum(id)) { steps[id] = l === 1 ? thin(id, src) : l === 3 ? thick(id, src) : src.slice(); continue; }
    const s = src.map((x, k) => {
      if (!x) return x;
      const d = shiftAt(k);
      return { ...x, n: (d ? shiftNote(x.n, d, state.scale) : x.n) + (oct[id] || 0) };
    });
    if (id === 'bass' && groove && l >= 2 && j % 4 === 3) {
      // Разворот в конце каждых 4 тактов: последняя нота баса — на октаву выше
      const k = s.map((x, i) => (x ? i : -1)).filter(i => i > 0).pop();
      if (k != null && s[k].n < 12) s[k] = { ...s[k], n: s[k].n + 12 };
    }
    steps[id] = s;
    if (l === 1) { gain[id] = 0.6; cut[id] = 0.5; } else if (l === 3) cut[id] = 1.35;
  }
  if (sec.bassF) { const [a, b] = sec.bassF; cut.bass *= a + (b - a) * (n > 1 ? j / (n - 1) : 1); }
  // Голос: адлибы этого такта
  if (sec.vox) {
    const v = Array(16).fill(null);
    for (const [jj, st, a, fx, c] of sec.vox) if (jj === j) v[st] = { a, ...(fx ? { fx } : {}), ...(c != null ? { c, len: 2 } : {}) };
    if (v.some(Boolean)) steps.vox = v;
  }
  improvise(steps, sec, j, bar, song, state.scale, shiftAt, perf);
  // Руки на ручках: фильтр баса, аккордов и мелодии медленно «гуляет» — у каждого варианта по-своему
  ['bass', 'stab', 'lead'].forEach((id, k) => {
    if (!steps[id]) return;
    const h = hash(song.seed || 1, k, 31), per = [8, 12, 16, 24, 32][h % 5], ph = (((h >>> 8) % 1000) / 1000) * 6.283;
    const depth = id === 'bass' ? (song.genre === 'acid' ? 0.55 : 0.25) : 0.35;
    cut[id] *= 1 + depth * Math.sin((6.283 * bar) / per + ph);
  });
  // Подъём: фильтр синтов открывается к дропу
  if (sec.type === 'rise') for (const id of ['bass', 'stab', 'lead']) cut[id] *= 0.45 + (1.4 * (j + 1)) / n;
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
  else if (groove && !last && (j + 1) % 8 === 0) fill(steps, ((j + 1) / 8) % 2 ? 'snare' : 'skip');
  const fl = song.flfx;
  if (fl) {
    // Удар FL в начале дропа, спуск — после него; «прикол» — на стыке, где музыка замирает, и иногда в начале брейка
    if (j === 0 && sec.type === 'drop' && fl.impact) fx.push({ type: 'flfx', id: fl.impact, vol: 0.75 });
    if (j === 0 && sec.in === 'down' && fl.down) fx.push({ type: 'flfx', id: fl.down, vol: 0.6 });
    const ear = fl.ear || [];
    if (ear.length && last && ['gap', 'stop', 'swell', 'wash', 'delay'].includes(sec.out) && hash(song.seed || 1, L.i, 5) % 3 === 0) fx.push({ type: 'flfx', id: ear[L.i % ear.length], at: 12, vol: 0.55 });
    if (ear.length && j === 0 && sec.type === 'break' && hash(song.seed || 1, L.i, 9) % 2 === 0) fx.push({ type: 'flfx', id: ear[(L.i + 1) % ear.length], vol: 0.5 });
  }
  if (sec.out === 'rise') {
    const R = Math.min(8, n);
    if (j === n - R) { fx.push({ type: 'riser', bars: R }); if (fl && fl.riser) fx.push({ type: 'flfx', id: fl.riser, end: R, vol: 0.7 }); }
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
  return { i: L.i, j, n, type: sec.type, steps, gain, cut, fx, lp, hp };
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
