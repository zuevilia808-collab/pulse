// Аранжировка: как из одного такта сделать трек на 1–5 минут.
// SCRIPTS — сценарии жанров, по ним «Пульс» сам строит трек. То же самое словами — в ARRANGEMENT.md.
import { TRACK, isEmpty, deg, semiToDeg } from './music.js';

export const LANES = ['kick', 'clap', 'hat', 'ohat', 'perc', 'bass', 'stab', 'lead'];

// Типы частей трека.
export const PART = {
  intro: { name: 'Интро', color: '#5ce1ff', hint: 'вход: бит без баса, фильтр открывается' },
  build: { name: 'Набор', color: '#8fa2ff', hint: 'инструменты входят по одному' },
  main: { name: 'Грув', color: '#d4ff3a', hint: 'основная часть, всё качает' },
  break: { name: 'Брейк', color: '#b67cff', hint: 'бочка уходит, звучат аккорды и мелодия' },
  pit: { name: 'Яма', color: '#7d6aa6', hint: 'почти тишина перед ударом' },
  rise: { name: 'Подъём', color: '#ffb547', hint: 'шум растёт, дробь, срез низа' },
  drop: { name: 'Дроп', color: '#ff5c8a', hint: 'пик энергии, всё вместе' },
  down: { name: 'Спад', color: '#4dffb8', hint: 'энергия уходит, остаётся грув' },
  outro: { name: 'Аутро', color: '#8b9480', hint: 'выход: бит, фильтр закрывается' },
};

export const INS = { none: 'Нет', impact: 'Удар', crash: 'Тарелка', down: 'Спуск' };
export const OUTS = { none: 'Нет', fill: 'Сбивка', swell: 'Свуш', rise: 'Нарастание', gap: 'Яма' };
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

// ——— Сценарии ———
// Часть: [тип, длина в тактах при треке ~5 минут, уровни дорожек, настройки].
// Уровни — 8 цифр: бочка, клэп, хэт, откр. хэт, перкуссия, бас, аккорды, мелодия.
//   0 — молчит, 1 — легко (прорежено, тише и темнее), 2 — полностью, 3 — плотнее и ярче.
// in — переход в начале части, out — в конце, filter — движение фильтра, prog — гармония,
// bassF — фильтр баса от и до (для эсида), opt — часть есть, только если трек не короче стольких тактов.
export const SCRIPTS = {
  techno: {
    name: 'Техно', idea: 'Энергия растёт волнами: интро → грув → брейк без бочки → подъём → дроп → спад → аутро.',
    progs: ['none', 'none', 'i-VII-VI-VII'],
    parts: [
      ['intro', 16, '20101000', { out: 'fill', filter: 'rise' }],
      ['build', 16, '22201100', { out: 'swell', opt: 56 }],
      ['main', 32, '22222210', { in: 'crash', out: 'fill' }],
      ['break', 16, '00101021', { in: 'down', filter: 'dark', prog: 'i-VII-VI-VII' }],
      ['rise', 8, '00200122', { out: 'rise', filter: 'hp' }],
      ['drop', 32, '22322322', { in: 'impact' }],
      ['break', 8, '00100020', { in: 'down', filter: 'dark', opt: 170 }],
      ['rise', 8, '10200120', { out: 'rise', filter: 'hp', opt: 170 }],
      ['drop', 16, '22332322', { in: 'impact', opt: 170 }],
      ['down', 16, '22202200', { out: 'fill', opt: 72 }],
      ['outro', 16, '20101000', { filter: 'fall' }],
    ],
  },
  acid: {
    name: 'Эсид', idea: 'Кислотная линия 303 живёт весь трек: фильтр баса открывается к дропу и закрывается к концу.',
    parts: [
      ['intro', 16, '20201200', { out: 'fill', filter: 'rise', bassF: [0.35, 0.6] }],
      ['build', 16, '22201200', { out: 'swell', bassF: [0.6, 0.9], opt: 56 }],
      ['main', 32, '22222200', { in: 'crash', out: 'fill', bassF: [0.9, 1.4] }],
      ['break', 16, '00201200', { in: 'down', bassF: [0.5, 0.7] }],
      ['rise', 8, '00300300', { out: 'rise', filter: 'hp', bassF: [0.7, 2.2] }],
      ['drop', 32, '22323310', { in: 'impact', bassF: [1.3, 2] }],
      ['down', 16, '22202200', { out: 'fill', bassF: [1.2, 0.7], opt: 72 }],
      ['outro', 16, '20201100', { filter: 'fall', bassF: [0.7, 0.35] }],
    ],
  },
  minimal: {
    name: 'Минимал', idea: 'Без больших взрывов: элементы входят по одному, короткие брейки, тонкие сбивки.',
    parts: [
      ['intro', 16, '20100000', { out: 'swell' }],
      ['build', 16, '20201100', { out: 'fill' }],
      ['main', 32, '21212210', { in: 'crash', out: 'fill' }],
      ['break', 8, '00101110', { filter: 'dark', out: 'gap' }],
      ['main', 32, '22222210', { in: 'crash', out: 'fill' }],
      ['main', 16, '22322220', { opt: 120 }],
      ['down', 16, '21201200', { out: 'swell', opt: 64 }],
      ['outro', 16, '20100000', { filter: 'fall' }],
    ],
  },
  dub: {
    name: 'Даб-техно', idea: 'Долгое интро из аккордов в эхе, бочка входит мягко, брейк тонет в реверберации.',
    parts: [
      ['intro', 16, '00000021', { filter: 'rise', out: 'swell' }],
      ['build', 16, '20100121', { out: 'fill' }],
      ['main', 32, '21212220', { in: 'crash' }],
      ['break', 16, '00100021', { filter: 'dark', in: 'down' }],
      ['main', 32, '22212221', { out: 'fill' }],
      ['outro', 16, '20100020', { filter: 'fall' }],
    ],
  },
  detroit: {
    name: 'Детройт', idea: 'Аккорды ведут трек: гармония движется по кругу, брейк держится на клавишах.',
    progs: ['i-VI-III-VII', 'i-VII-VI-VII', 'i-iv-VI-v'],
    parts: [
      ['intro', 16, '20201010', { out: 'fill', filter: 'rise' }],
      ['main', 32, '22222220', { in: 'crash', out: 'fill', prog: 'i-VI-III-VII' }],
      ['break', 16, '00100022', { in: 'down', prog: 'i-VI-III-VII' }],
      ['rise', 8, '00200122', { out: 'rise', filter: 'hp' }],
      ['drop', 32, '22322222', { in: 'impact', prog: 'i-VI-III-VII' }],
      ['outro', 16, '20201000', { filter: 'fall' }],
    ],
  },
  melodic: {
    name: 'Мелодик-техно', idea: 'Большой эмоциональный брейк с мелодией и сменой аккордов, длинный подъём, дроп со всем сразу.',
    progs: ['i-iv-VI-v', 'i-VI-III-VII'],
    parts: [
      ['intro', 16, '20101010', { filter: 'rise', out: 'fill' }],
      ['build', 16, '22201110', { out: 'swell', opt: 56 }],
      ['main', 32, '22222211', { in: 'crash', out: 'fill' }],
      ['break', 24, '00000022', { in: 'down', prog: 'i-iv-VI-v' }],
      ['rise', 8, '10200122', { out: 'rise', filter: 'hp', prog: 'i-iv-VI-v' }],
      ['drop', 32, '22322323', { in: 'impact', prog: 'i-iv-VI-v' }],
      ['outro', 16, '20201010', { filter: 'fall' }],
    ],
  },
  hypnotic: {
    name: 'Гипнотик', idea: 'Длинные однообразные волны с румблом: перемены едва заметны, один короткий провал.',
    parts: [
      ['intro', 16, '20101000', { filter: 'rise', out: 'swell' }],
      ['main', 32, '21212200', { in: 'crash', out: 'fill' }],
      ['main', 32, '22322200', { out: 'fill' }],
      ['pit', 8, '00201000', { in: 'down', out: 'gap' }],
      ['main', 32, '22323210', { in: 'impact' }],
      ['outro', 16, '20101000', { filter: 'fall' }],
    ],
  },
  industrial: {
    name: 'Индастриал', idea: 'Жёстко с первых тактов, ямы тишины перед ударами, второй дроп ещё плотнее.',
    parts: [
      ['intro', 8, '20001000', { out: 'swell' }],
      ['build', 16, '22202100', { out: 'fill' }],
      ['main', 32, '22322300', { in: 'crash', out: 'gap' }],
      ['break', 8, '00101020', { in: 'down', filter: 'dark' }],
      ['rise', 8, '00300100', { out: 'rise', filter: 'hp' }],
      ['drop', 32, '23333320', { in: 'impact' }],
      ['break', 8, '00100000', { in: 'down', filter: 'dark', opt: 160 }],
      ['rise', 8, '00300100', { out: 'rise', filter: 'hp', opt: 160 }],
      ['drop', 16, '23333320', { in: 'impact', opt: 160 }],
      ['outro', 16, '20201000', { filter: 'fall' }],
    ],
  },
  hard: {
    name: 'Хард-техно', idea: 'Короткое интро и сразу дроп, потом серия брейков и подъёмов — каждый дроп сильнее.',
    parts: [
      ['intro', 8, '20200000', { out: 'fill' }],
      ['build', 8, '22201200', { out: 'rise', filter: 'hp' }],
      ['drop', 32, '22322300', { in: 'impact', out: 'gap' }],
      ['break', 8, '00100021', { in: 'down', filter: 'dark' }],
      ['rise', 8, '00300100', { out: 'rise', filter: 'hp' }],
      ['drop', 32, '23332322', { in: 'impact' }],
      ['break', 8, '00100020', { in: 'down', filter: 'dark', opt: 140 }],
      ['rise', 8, '00300100', { out: 'rise', filter: 'hp', opt: 140 }],
      ['drop', 32, '23333322', { in: 'impact', opt: 140 }],
      ['outro', 8, '20200000', { filter: 'fall' }],
    ],
  },
  witch: {
    name: 'Witch House', idea: 'Мрачное интро из хора и призрачной мелодии, тяжёлый халфтайм-бит с 808, яма из одних пэдов, обвал.',
    progs: ['i-VI', 'i-II', 'i-VII-VI-VII'],
    parts: [
      ['intro', 8, '00000122', { filter: 'rise', out: 'swell' }],
      ['main', 16, '22201220', { in: 'impact', out: 'fill', prog: 'i-VI' }],
      ['main', 16, '22312221', { out: 'gap', prog: 'i-VI' }],
      ['pit', 8, '00001021', { in: 'down', filter: 'dark' }],
      ['rise', 4, '10200120', { out: 'rise', filter: 'hp' }],
      ['drop', 16, '22322322', { in: 'impact', prog: 'i-VI' }],
      ['main', 16, '22302221', { out: 'fill', opt: 120, prog: 'i-VI' }],
      ['outro', 8, '00000121', { filter: 'fall' }],
    ],
  },
};

const SCRIPT_OF = { peak: 'techno', acid: 'acid', minimal: 'minimal', dub: 'dub', detroit: 'detroit', melodic: 'melodic', hypnotic: 'hypnotic', industrial: 'industrial', hard: 'hard', witch: 'witch' };
export const scriptFor = genre => SCRIPT_OF[genre] || 'techno';

const lv = s => Object.fromEntries(LANES.map((id, i) => [id, +s[i] || 0]));
const rnd = Math.random;
const pick = a => a[Math.floor(rnd() * a.length)];

export const songBars = song => (song ? song.sections.reduce((a, s) => a + s.bars, 0) : 0);
export const barSec = bpm => 240 / bpm;

// Сочинить трек нужной длины по сценарию жанра.
export function writeSong(state, minutes, genre) {
  const sid = scriptFor(genre), sc = SCRIPTS[sid];
  const T = Math.max(16, Math.round((minutes * 60) / barSec(state.bpm)));
  const parts = sc.parts.filter(p => !(p[3] && p[3].opt && T < p[3].opt));
  const q = T >= 96 ? 8 : 4;
  const W = parts.reduce((a, p) => a + p[1], 0);
  const bars = parts.map(([type, w]) => Math.max(type === 'rise' || type === 'pit' ? 4 : q, Math.round((w * T) / W / q) * q));
  // Подгоняем под длину за счёт основных частей.
  const flex = parts.map((p, i) => i).filter(i => ['main', 'drop', 'break', 'build'].includes(parts[i][0]));
  let diff = T - bars.reduce((a, b) => a + b, 0), turn = 0;
  for (let g = 0; Math.abs(diff) >= q && g < 400; g++) {
    if (diff > 0) {
      const i = flex[turn++ % flex.length];
      bars[i] += q;
      diff -= q;
    } else {
      const i = flex.filter(x => bars[x] > q * 2).sort((a, b) => bars[b] - bars[a])[0];
      if (i == null) break;
      bars[i] -= q;
      diff += q;
    }
  }
  const prog = sc.progs ? pick(sc.progs) : null;
  const sections = parts.map(([type, , levels, o = {}], i) => {
    const sec = {
      type, bars: bars[i], lv: lv(levels),
      in: o.in || 'none', out: o.out || 'none', filter: o.filter || 'none',
      prog: o.prog ? prog || o.prog : 'none', bassF: o.bassF || null,
    };
    // Немного случайности, чтобы каждый трек был своим.
    if (sec.out === 'fill' && rnd() < 0.35) sec.out = 'swell';
    if (['main', 'drop', 'build'].includes(type)) {
      if (rnd() < 0.3) sec.lv.perc = sec.lv.perc ? 0 : 1;
      if (rnd() < 0.25) sec.lv.ohat = sec.lv.ohat ? 0 : 1;
    }
    return sec;
  });
  return { genre: sid, sections };
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

const drum = id => TRACK[id].kind === 'drum';

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

// Сбивка в конце фразы.
function fill(steps, kind) {
  const need = id => steps[id] || (steps[id] = Array(16).fill(0));
  if (kind === 'end') {
    if (steps.kick) for (let i = 12; i < 16; i++) steps.kick[i] = 0;
    const c = need('clap');
    [0.45, 0.6, 0.75, 0.95].forEach((v, i) => { c[12 + i] = v; });
  } else if (kind === 'snare') {
    const c = need('clap');
    c[14] = Math.max(c[14], 0.55);
    c[15] = Math.max(c[15], 0.85);
    if (steps.kick) steps.kick[14] = 0;
  } else {
    if (steps.hat) for (let i = 12; i < 16; i++) steps.hat[i] = Math.max(steps.hat[i], 0.7);
    need('ohat')[14] = 0.85;
  }
}

// Яма: тишина на последней доле (у бочки и баса — на последних двух).
function gap(steps, big) {
  for (const id of LANES) {
    const s = steps[id];
    if (!s) continue;
    for (let i = big && (id === 'kick' || id === 'bass') ? 8 : 12; i < 16; i++) s[i] = drum(id) ? 0 : null;
  }
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
  const steps = {}, gain = {}, cut = {};
  for (const id of LANES) {
    const l = sec.lv[id] || 0, tr = state.tracks[id];
    gain[id] = 1;
    cut[id] = 1;
    if (!l || isEmpty(tr)) { steps[id] = null; continue; }
    if (drum(id)) { steps[id] = l === 1 ? thin(id, tr.steps) : l === 3 ? thick(id, tr.steps) : tr.steps.slice(); continue; }
    const s = tr.steps.map(x => x && { ...x, n: shift ? shiftNote(x.n, shift, state.scale) : x.n });
    if (id === 'bass' && groove && l >= 2 && j % 4 === 3) {
      // Разворот в конце каждых 4 тактов: последняя нота баса — на октаву выше.
      const k = s.map((x, i) => (x ? i : -1)).filter(i => i > 0).pop();
      if (k != null && s[k].n < 12) s[k] = { ...s[k], n: s[k].n + 12 };
    }
    steps[id] = s;
    if (l === 1) { gain[id] = 0.6; cut[id] = 0.5; } else if (l === 3) cut[id] = 1.35;
  }
  if (sec.bassF) { const [a, b] = sec.bassF; cut.bass *= a + (b - a) * (n > 1 ? j / (n - 1) : 1); }

  const fx = [];
  if (j === 0 && sec.in !== 'none') fx.push({ type: sec.in });
  else if (groove && j > 0 && j % 16 === 0) fx.push({ type: 'crash' });
  if (last && sec.out === 'fill') fill(steps, 'end');
  else if (groove && !last && (j + 1) % 8 === 0) fill(steps, ((j + 1) / 8) % 2 ? 'snare' : 'hats');
  let roll = null;
  if (sec.out === 'rise') {
    const R = Math.min(8, n), rr = Math.min(4, n);
    if (j === n - R) fx.push({ type: 'riser', bars: R });
    if (j >= n - rr) roll = [(j - (n - rr)) / rr, (j - (n - rr) + 1) / rr];
    if (last) gap(steps, true);
  }
  if (last && sec.out === 'gap') gap(steps, false);
  if (last && sec.out === 'swell') fx.push({ type: 'swell' });

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
    if (!isEmpty(state.tracks[id])) e += EW[id] * Math.min(3, sec.lv[id] || 0);
  }
  const v = Math.min(1, e / (m * 0.8));
  if (sec.out === 'rise') return [v, Math.min(1, v + 0.35)];
  if (sec.filter === 'rise') return [v * 0.45, v];
  if (sec.filter === 'fall') return [v, v * 0.4];
  if (sec.filter === 'dark') return [v * 0.8, v * 0.8];
  return [v, v];
}
