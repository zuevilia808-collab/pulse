// Музыкальная часть «Пульса»: лады, дорожки, паттерны, генераторы и жанры.
import { SOUNDS, KITS } from './sounds.js?v=5';
import { STYLES, voxDefaults, voxPattern, genreVox } from './vox.js?v=5';
import { FL, flCandidates, flSound } from './fl.js?v=5';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTE_RU = ['До', 'До-диез', 'Ре', 'Ми-бемоль', 'Ми', 'Фа', 'Фа-диез', 'Соль', 'Соль-диез', 'Ля', 'Си-бемоль', 'Си'];
export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
};
export const SCALE_RU = { minor: 'минор', phrygian: 'фригийский', dorian: 'дорийский', major: 'мажор' };
export const keyLabel = (key, scale) => `${NOTE_RU[key]} ${SCALE_RU[scale] || ''}`.trim();
export const mtof = m => 440 * 2 ** ((m - 69) / 12);

// Ступень лада (0 — тоника, 7 — октава выше, -1 — септима ниже) → полутоны от тоники.
export function deg(scale, d) {
  const sc = SCALES[scale] || SCALES.minor;
  const o = Math.floor(d / 7);
  return o * 12 + sc[d - o * 7];
}

// Полутоны от тоники → ближайшая ступень лада.
export function semiToDeg(n, scale) {
  const sc = SCALES[scale] || SCALES.minor;
  const o = Math.floor(n / 12), pc = n - o * 12;
  let best = 0, bd = 99;
  sc.forEach((v, i) => { const d = Math.abs(v - pc); if (d < bd) { bd = d; best = i; } });
  if (12 - pc < bd) return (o + 1) * 7;
  return o * 7 + best;
}

export const snap = (n, scale) => deg(scale, semiToDeg(n, scale));
export const noteName = (key, n) => NOTE_NAMES[(((key + n) % 12) + 12) % 12];
const NOTE_SHORT = ['До', 'До♯', 'Ре', 'Ми♭', 'Ми', 'Фа', 'Фа♯', 'Соль', 'Ля♭', 'Ля', 'Си♭', 'Си'];

// ——— Гармония ———
// Аккорд — ступень лада, на которую сдвигаются бас, аккорды и мелодия: 0 — тоника, -2 — шестая ступень снизу, 3 — четвёртая сверху.
// Ступени выбраны так, чтобы бас ходил рядом с тоникой, а не прыгал через октаву. per — тактов на аккорд по умолчанию.
export const PROGS = {
  none: { name: 'На месте', d: [0] },
  'i-VI': { name: 'i–VI', d: [0, -2], per: 2 },
  'i-VII': { name: 'i–VII', d: [0, -1], per: 2 },
  'i-iv': { name: 'i–iv', d: [0, 3], per: 2 },
  'i-v': { name: 'i–v', d: [0, -3], per: 2 },
  'i-II': { name: 'i–II', d: [0, 1], per: 2 },
  'i-VI-III-VII': { name: 'i–VI–III–VII', d: [0, -2, 2, -1] },
  'i-iv-VI-v': { name: 'i–iv–VI–v', d: [0, 3, -2, -3] },
  'i-VII-VI-VII': { name: 'i–VII–VI–VII', d: [0, -1, -2, -1] },
  'i-VII-VI-v': { name: 'i–VII–VI–v', d: [0, -1, -2, -3] },
  'i-i-VI-VII': { name: 'i–i–VI–VII', d: [0, 0, -2, -1] },
  'VI-VII-i-i': { name: 'VI–VII–i–i', d: [-2, -1, 0, 0] },
  'i-III-VII-iv': { name: 'i–III–VII–iv', d: [0, 2, -1, 3] },
  'i-iv-VII-III': { name: 'i–iv–VII–III', d: [0, 3, -1, 2] },
  'i-VI-iv-VII': { name: 'i–VI–iv–VII', d: [0, -2, 3, -1] },
  'i-II-i-VII': { name: 'i–II–i–VII', d: [0, 1, 0, -1] },
  'i-iv-i-v': { name: 'i–iv–i–v', d: [0, 3, 0, -3] },
  'i-v-VI-III': { name: 'i–v–VI–III', d: [0, -3, -2, 2] },
  'i-VI-III-VII-8': { name: 'i–VI–III–VII · i–VI–iv–v', d: [0, -2, 2, -1, 0, -2, 3, -3] },
  'i-v-VI-III-8': { name: 'i–v–VI–III · iv–i–iv–v', d: [0, -3, -2, 2, 3, 0, 3, -3] },
  climb: { name: 'Лестница вверх', d: [0, 1, 2, 3] },
};
export const PERS = { 0.5: '½ такта', 1: '1 такт', 2: '2 такта', 4: '4 такта' };

// Круги аккордов, которые подходят жанру (по ним сочиняется трек и выбирается «другая прогрессия»).
export const GENRE_PROGS = {
  techno: ['i-VI', 'i-VII', 'i-VI-III-VII', 'i-VII-VI-VII', 'i-i-VI-VII', 'i-VII-VI-v', 'i-iv', 'i-III-VII-iv', 'i-VI-iv-VII'],
  acid: ['i-VII', 'i-iv', 'i-II', 'i-VII-VI-VII', 'i-i-VI-VII', 'i-II-i-VII', 'i-v'],
  minimal: ['none', 'i-VII', 'i-iv', 'i-v', 'i-II'],
  dub: ['i-iv', 'i-VII', 'i-v', 'i-iv-i-v', 'i-VI'],
  detroit: ['i-VI-III-VII', 'i-iv-VII-III', 'i-iv-VI-v', 'i-VII-VI-VII', 'i-VI-III-VII-8', 'i-III-VII-iv'],
  melodic: ['i-VI-III-VII', 'i-iv-VI-v', 'i-VI-iv-VII', 'i-VII-VI-v', 'VI-VII-i-i', 'i-VI-III-VII-8', 'i-v-VI-III-8', 'i-v-VI-III'],
  hypnotic: ['none', 'i-VII', 'i-II', 'i-VI', 'i-II-i-VII'],
  industrial: ['i-II', 'i-VII', 'i-II-i-VII', 'i-VI', 'i-v'],
  hard: ['i-VI', 'i-VII-VI-v', 'i-II-i-VII', 'i-i-VI-VII', 'VI-VII-i-i', 'i-VI-III-VII'],
  witch: ['i-VI', 'i-II', 'i-VII-VI-VII', 'i-II-i-VII', 'i-VII-VI-v'],
  house: ['i-iv', 'i-VII-VI-VII', 'i-iv-VII-III', 'i-VI-III-VII', 'i-v-VI-III', 'i-iv-i-v', 'i-VI-iv-VII'],
};
GENRE_PROGS.peak = GENRE_PROGS.techno;

// Названия аккордов нотами: «Ля – Фа – До – Соль».
export const progChords = (id, key, scale) => (PROGS[id] || PROGS.none).d.map(d => NOTE_SHORT[(((key + deg(scale, d)) % 12) + 12) % 12]);

// На сколько ступеней сдвинуты ноты в шаге s такта bar (такт считается от начала части или петли).
export function harmShift(prog, per, bar, s) {
  const pr = PROGS[prog];
  if (!pr || pr.d.length < 2) return 0;
  return pr.d[Math.floor((bar * 16 + s) / ((per || pr.per || 1) * 16)) % pr.d.length];
}
// Номер аккорда, который звучит в шаге s такта bar.
export function harmIndex(prog, per, bar, s) {
  const pr = PROGS[prog];
  if (!pr || pr.d.length < 2) return 0;
  return Math.floor((bar * 16 + s) / ((per || pr.per || 1) * 16)) % pr.d.length;
}

// Тоника дорожки в MIDI: бас около C2, аккорды и мелодия на две октавы выше.
export function baseMidi(key, id) {
  const b = 36 + ((key + 6) % 12) - 6;
  return id === 'bass' ? b : b + 24;
}

export const TRACKS = [
  { id: 'kick', name: 'Бочка', kind: 'drum', color: '#d4ff3a' },
  { id: 'clap', name: 'Клэп', kind: 'drum', color: '#ff5c8a' },
  { id: 'hat', name: 'Хэт', kind: 'drum', color: '#5ce1ff' },
  { id: 'ohat', name: 'Откр. хэт', kind: 'drum', color: '#8fa2ff' },
  { id: 'perc', name: 'Перкуссия', kind: 'drum', color: '#ffb547' },
  { id: 'bass', name: 'Бас', kind: 'synth', color: '#b67cff' },
  { id: 'stab', name: 'Аккорды', kind: 'synth', color: '#4dffb8' },
  { id: 'lead', name: 'Мелодия', kind: 'synth', color: '#ff8a4d' },
  { id: 'vox', name: 'Голос', kind: 'vox', color: '#ffe14d' },
];
export const TRACK = Object.fromEntries(TRACKS.map(t => [t.id, t]));

// Громкость и посылы на эффекты; тембр берётся из звука (sounds.js), по умолчанию — из набора «Техно 909».
const MIX = {
  kick: { vol: 0, rev: 0, dly: 0, grit: 0, tone: 20000 },
  clap: { vol: -2, rev: 0.22, dly: 0 },
  hat: { vol: -4, rev: 0.04, dly: 0 },
  ohat: { vol: -6, rev: 0.08, dly: 0 },
  perc: { vol: -5, rev: 0.15, dly: 0.2 },
  bass: { vol: -2, rev: 0, dly: 0 },
  stab: { vol: -5, rev: 0.3, dly: 0.4 },
  lead: { vol: -6, rev: 0.2, dly: 0.3 },
  vox: { vol: -3, rev: 0.16, dly: 0.1 },
};
export const DEFAULT_SOUND = { ...KITS.techno.s };
export const DEFAULT_PARAMS = Object.fromEntries(Object.keys(MIX).map(id => [id, { ...MIX[id], ...SOUNDS[id][DEFAULT_SOUND[id]].p }]));

// Параметры дорожки после смены звука: громкость и эффекты остаются, тембр — от нового звука.
export function soundParams(id, sound, prev) {
  const keep = prev ? { vol: prev.vol, rev: prev.rev, dly: prev.dly } : {};
  return { ...structuredClone(DEFAULT_PARAMS[id]), ...keep, ...structuredClone(SOUNDS[id][sound].p) };
}

export const emptySteps = id => Array(16).fill(TRACK[id].kind === 'drum' ? 0 : null);
export const isEmpty = tr => !tr.steps.some(Boolean);

export function emptyState() {
  const tracks = {};
  for (const t of TRACKS) tracks[t.id] = { steps: emptySteps(t.id), mute: false, solo: false, variant: null, sound: DEFAULT_SOUND[t.id], p: structuredClone(DEFAULT_PARAMS[t.id]) };
  tracks.vox.vox = voxDefaults(); // язык, пол и диктор, как часто звучит, из каких фраз меняется
  return {
    v: 1, bpm: 130, swing: 0, key: 9, scale: 'minor', genre: null, metronome: false,
    master: { vol: 0, cut: 20000, rumble: 0, delay: 0.55, reverb: 0.55 },
    tracks,
    mode: 'loop', song: null, songMin: 3,
    harm: { prog: 'none', per: 1, auto: true }, // гармония петли; auto — выбрана жанром, а не человеком
  };
}

// Проверка и дополнение сохранённого состояния.
export function fixState(s) {
  const base = emptyState();
  if (!s || typeof s !== 'object' || s.v !== 1) return base;
  const out = { ...base, ...s, master: { ...base.master, ...(s.master || {}) }, tracks: {} };
  if (!SCALES[out.scale]) out.scale = 'minor';
  for (const t of TRACKS) {
    const src = (s.tracks && s.tracks[t.id]) || {};
    const steps = Array.isArray(src.steps) && src.steps.length === 16 ? src.steps : base.tracks[t.id].steps;
    const kit = KITS[GENRES[out.genre]?.kit];
    const sound = SOUNDS[t.id][src.sound] ? src.sound : kit ? kit.s[t.id] : DEFAULT_SOUND[t.id];
    out.tracks[t.id] = { steps, mute: !!src.mute, solo: !!src.solo, variant: src.variant || null, sound, p: { ...soundParams(t.id, sound), ...(src.p || {}) }, ...(src.hand ? { hand: true } : {}) };
  }
  const vx = out.tracks.vox;
  vx.vox = { ...voxDefaults(), ...((s.tracks && s.tracks.vox && s.tracks.vox.vox) || {}) };
  vx.steps = vx.steps.map(x => (x && typeof x === 'object' && x.a ? x : null));
  if (!out.song || !Array.isArray(out.song.sections) || !out.song.sections.length) out.song = null;
  if (out.mode !== 'song' || !out.song) out.mode = 'loop';
  const h = s.harm || {};
  out.harm = { prog: PROGS[h.prog] ? h.prog : 'none', per: PERS[h.per] ? +h.per : 1, auto: h.auto !== false };
  out.bank = [0, 1, 2].includes(s.bank) ? s.bank : null; // A/B/C вручную или null — «Авто»
  out.songMin = Math.min(5, Math.max(1, Math.round((+out.songMin || 3) * 2) / 2));
  return out;
}

const rnd = () => Math.random(); // через функцию — чтобы сочинение с номером варианта могло подменить случайность
export const pick = a => a[Math.floor(rnd() * a.length)];
function wpick(list) {
  let sum = 0;
  for (const [, w] of list) sum += w;
  let r = rnd() * sum;
  for (const [v, w] of list) if ((r -= w) <= 0) return v;
  return list[0][0];
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const VEL = { '.': 0, o: 0.55, x: 0.85, X: 1 };
export const pat = s => [...s].map(c => VEL[c] ?? 0);

const DRUMS = {
  kick: {
    four: ['X...X...X...X...', 'X...X...X...X...', 'X...X...X...X..x', 'X...X...X..xX...', 'X...X..xX...X...', 'X...X...X...X.x.'],
    broken: ['X..x..X...X..x..', 'X...X..x..X.x...', 'X..X..X...X.....', 'X...X...X..x.x..'],
    half: ['X.......X.......', 'X.........X.....'],
    gallop: ['X..xX...X..xX...', 'X...X..xX...X..x'],
    trap: ['X.........X.....', 'X......X..X.....', 'X.........Xx....', 'X.....X...X..X..'],
  },
  clap: {
    back: ['....X.......X...'],
    every: ['X...X...X...X...'],
    sync: ['....X.......X..o', '....X..o....X...', '.......X....X...', '....X.....o.X...'],
    sparse: ['............X...'],
    slow: ['........X.......', '........X......o', '........X..o....'],
  },
  hat: {
    off: ['..X...X...X...X.'],
    eight: ['x.X.x.X.x.X.x.X.'],
    six: ['oxXxoxXxoxXxoxXx', 'xoXoxoXoxoXoxoXx', 'ooXoooXoooXoooXo'],
    gallop: ['..Xx..Xx..Xx..Xx'],
    sparse: ['..x.......x.....'],
    trap: ['x.x.x.x.x.ooo.x.', 'x.x.x.oox.x.x.oo', 'x.x.x.x.x.x.oooo', 'x.ooo.x.x.x.x.x.'],
  },
  ohat: {
    off: ['..X...X...X...X.'],
    sparse: ['......X.......X.', '..x.......X.....'],
  },
};

export const VARIANT_RU = {
  four: 'ровная 4×4', broken: 'ломаная', half: 'через долю', gallop: 'галоп',
  back: 'на 2 и 4', every: 'на каждую долю', sync: 'синкопы', sparse: 'редкий рисунок',
  off: 'на офбит', eight: 'восьмые', six: 'шестнадцатые', three: 'гипнотичная тройка', gen: 'новый рисунок',
  acid: 'кислотный 303', rolling: 'катящийся', deep: 'глубокий', offbeat: 'на офбит',
  dub: 'даб с эхом', chords: 'ритмичные', arp: 'арпеджио', melody: 'новая линия',
  trap: 'трэп-халфтайм', slow: 'медленная, на третью долю', 808: 'гудящий 808 с глайдами', pad: 'длинные мрачные аккорды',
  house: 'хаус-бас с октавами',
  ...Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, v.name.toLowerCase()])),
};

export const VARIANTS = {
  kick: ['four', 'broken', 'half', 'gallop', 'trap'],
  clap: ['back', 'every', 'sync', 'sparse', 'slow'],
  hat: ['off', 'eight', 'six', 'gallop', 'sparse', 'trap'],
  ohat: ['off', 'sparse'],
  perc: ['three', 'sync', 'sparse'],
  bass: ['acid', 'rolling', 'deep', 'offbeat', '808', 'house'],
  stab: ['dub', 'chords', 'sparse', 'pad'],
  lead: ['arp', 'melody', 'slow'],
  vox: Object.keys(STYLES),
};

export function defaultVariant(id, genre) {
  if (id === 'vox') return genreVox(genre).style;
  if (genre === 'witch') return { kick: 'trap', clap: 'slow', hat: 'trap', ohat: 'sparse', perc: 'sparse', bass: '808', stab: 'pad', lead: 'slow' }[id];
  if (id === 'bass') return genre === 'acid' ? 'acid' : genre === 'dub' || genre === 'minimal' ? 'deep' : genre === 'house' ? 'house' : 'rolling';
  if (id === 'stab') return genre === 'detroit' || genre === 'house' ? 'chords' : genre === 'melodic' ? 'pad' : 'dub';
  if (id === 'lead') return genre === 'melodic' ? 'melody' : 'arp';
  return { kick: 'four', clap: 'back', hat: 'off', ohat: 'off', perc: 'gen' }[id];
}

function genPerc(v) {
  if (!v || v === 'gen') v = pick(['three', 'sync', 'sync', 'sparse']);
  if (v === 'three') return pat('...x..o..x..o..x');
  if (v === 'sparse') return pat(pick(['......x.......o.', '...x.......x....', '..........x..x..']));
  const s = Array(16).fill(0);
  shuffle([3, 5, 7, 10, 11, 13, 14, 15]).slice(0, 4 + Math.floor(rnd() * 2)).forEach(i => { s[i] = pick([0.55, 0.85, 1]); });
  return s;
}

const N = (n, o = {}) => ({ n, len: 1, ...o });

function genBass(v, scale) {
  const s = Array(16).fill(null);
  if (v === 'acid') {
    for (let i = 0; i < 16; i++) {
      if (i && rnd() > 0.66) continue;
      let n = deg(scale, wpick([[0, 6], [7, 2.5], [4, 2], [2, 1.5], [6, 1.2], [3, 0.8], [-1, 1], [1, 0.5], [5, 0.4]]));
      if (rnd() < 0.2 && n < 12) n += 12;
      s[i] = N(n, { acc: rnd() < 0.3, slide: i > 0 && !!s[i - 1] && rnd() < 0.3 });
    }
    s[0] = N(0, { acc: true });
  } else if (v === 'rolling') {
    // Катящийся бас: своя группировка шестнадцатых между ударами бочки и свой мелодический ход
    const grid = pick([
      [2, 3, 6, 7, 10, 11, 14, 15], [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15], [1, 3, 5, 7, 9, 11, 13, 15],
      [2, 3, 5, 6, 7, 10, 11, 13, 14, 15], [1, 2, 5, 6, 9, 10, 13, 14], [2, 3, 7, 10, 11, 15], [3, 6, 7, 10, 14, 15],
      [2, 3, 6, 7, 9, 10, 11, 14, 15], [1, 2, 3, 6, 7, 9, 10, 11, 14],
    ]);
    const shape = pick(['pedal', 'oct', 'fifth', 'walk', 'answer', 'zigzag', 'pedal']);
    const walk = pick([[0, 0, 2, 0, 4, 0, 2, -1], [0, 2, 3, 4, 3, 2, 0, -1], [0, 0, -1, 0, -3, 0, -1, 0], [0, 4, 0, 6, 0, 4, 2, 0]]);
    const ans = pick([2, 4, -1, 5, 3]);
    grid.forEach((i, k) => {
      const d = shape === 'oct' ? (k % 2 ? 7 : 0) : shape === 'fifth' ? (k % 3 === 2 ? 4 : 0) : shape === 'walk' ? walk[k % 8]
        : shape === 'answer' ? (i >= 12 ? ans : 0) : shape === 'zigzag' ? [0, 7, 4, 7][k % 4] : 0;
      s[i] = N(deg(scale, d), { acc: i % 4 === 2 || rnd() < 0.12 });
    });
    // И ещё пара отступлений: октава, квинта, септима
    if (shape === 'pedal' || rnd() < 0.4) {
      for (const i of shuffle(grid.filter(i => i % 4 === 3)).slice(0, 1 + Math.floor(rnd() * 3))) s[i] = N(deg(scale, pick([7, 7, 4, -1, 2, -3])));
    }
  } else if (v === 'house') {
    // Хаус: офбиты с прыжками на октаву и подходом к следующей доле
    const shape = pick([
      [[2, 0], [3, 7], [6, 0], [10, 0], [11, 7], [14, 4]],
      [[2, 0], [6, 7], [10, 0], [13, 2], [14, 4]],
      [[2, 0], [5, 0], [6, 7], [10, 0], [14, 6], [15, 7]],
      [[0, 0], [2, 7], [6, 0], [8, 0], [10, 7], [13, 4], [14, 6]],
    ]);
    for (const [i, d] of shape) s[i] = N(deg(scale, d), { acc: i % 4 === 2 });
  } else if (v === 'deep') {
    // Глубокий: длинные мягкие ноты, у каждого варианта свой ритм и ход
    const shape = pick([
      [[2, 2], [6, 2], [10, 2], [14, 2]], [[0, 3], [6, 2], [10, 4]], [[2, 3], [8, 2], [10, 4]], [[2, 2], [7, 1], [10, 2], [14, 2]],
      [[2, 4], [10, 2], [13, 3]], [[3, 2], [6, 3], [11, 2], [14, 2]], [[2, 2], [6, 2], [9, 2], [12, 3]],
    ]);
    const moves = pick([[0, 0, 0, 0], [0, 0, 0, 4], [0, 0, -3, 0], [0, 2, 0, -1], [0, 0, 4, 2], [0, -1, 0, 0]]);
    shape.forEach(([i, len], k) => { s[i] = N(deg(scale, moves[k % 4]), { len }); });
  } else if (v === '808') {
    // Длинные гудящие ноты с глайдами — как в трэпе и витч-хаусе.
    const motif = pick([
      [[0, 0, 6], [6, -2, 4, true], [10, 0, 6]],
      [[0, 0, 7], [7, 3, 3, true], [10, 0, 6]],
      [[0, 0, 4], [6, 0, 2], [10, -2, 3, true], [13, -1, 3, true]],
      [[0, 0, 10], [10, 4, 3, true], [13, 0, 3]],
    ]);
    for (const [i, d, len, slide] of motif) s[i] = N(deg(scale, d), { len, slide: !!slide });
  } else {
    // Офбит: на «и» каждой доли, иногда с подхватом и прыжками
    const at = pick([[2, 6, 10, 14], [2, 6, 10, 13, 14], [2, 5, 6, 10, 14], [2, 6, 7, 10, 14, 15], [2, 6, 10, 11, 14], [2, 3, 6, 10, 14]]);
    const cont = pick([[0, 0, 0, 0], [0, 7, 0, 7], [0, 0, 7, 4], [0, 0, 0, -1], [0, 4, 0, 6], [0, 0, 2, 4], [0, 0, 7, 0]]);
    for (const i of at) s[i] = N(deg(scale, i % 4 === 2 ? cont[i >> 2] : pick([0, 7, 4])), { acc: i === 2 });
  }
  return s;
}

function genStab(v, scale) {
  const lib = {
    dub: ['..x.......x.....', '...x......x.....', '..x...x...x...x.', '...x..x.......x.'],
    chords: ['..x..x....x..x..', 'x..x..x...x..x..', '..x..x..x.....x.'],
    sparse: ['..........x.....', '...x............'],
  };
  if (v === 'pad') {
    const s = Array(16).fill(null);
    s[0] = N(0, { len: 8 });
    s[8] = N(pick([deg(scale, -2), deg(scale, 3), deg(scale, 1), deg(scale, -3)]), { len: 8 });
    return s;
  }
  const p = pick(lib[v] || lib.dub), s = Array(16).fill(null);
  const alt = pick([deg(scale, 3), deg(scale, -2), deg(scale, 4) - 12]);
  let k = 0;
  [...p].forEach((c, i) => {
    if (c !== 'x') return;
    s[i] = N(k > 0 && k % 3 === 2 && rnd() < 0.7 ? alt : 0);
    k++;
  });
  return s;
}

function genLead(v, scale) {
  const s = Array(16).fill(null);
  if (v === 'slow') {
    // Редкая жутковатая линия: длинные ноты высоко, с полутоном сверху.
    const line = pick([[[0, 7, 3], [4, 8, 2], [8, 4, 4], [12, 7, 3]], [[0, 4, 4], [6, 5, 2], [8, 3, 6]], [[2, 7, 2], [4, 8, 4], [10, 7, 2], [12, 4, 4]]]);
    for (const [i, d, len] of line) s[i] = N(deg(scale, d), { len });
    return s;
  }
  if (v === 'melody') {
    let d = 0;
    for (let i = 0; i < 16; i++) {
      if (i && (i % 2 ? rnd() < 0.7 : rnd() < 0.2)) continue;
      if (i) d = Math.max(-2, Math.min(9, d + pick([-2, -1, -1, 0, 1, 1, 2, 3])));
      s[i] = N(deg(scale, d));
    }
    for (let i = 0; i < 16; i++) if (s[i] && i + 1 < 16 && !s[i + 1] && rnd() < 0.6) s[i].len = 2;
    return s;
  }
  const tones = [0, 2, 4, 7].map(d => deg(scale, d));
  const shape = pick(['up', 'updown', 'down', 'rand']);
  const seq = shape === 'up' ? [0, 1, 2, 3] : shape === 'down' ? [3, 2, 1, 0] : shape === 'updown' ? [0, 1, 2, 3, 2, 1]
    : Array.from({ length: 8 }, () => Math.floor(rnd() * 4));
  const rate = pick([1, 2, 2]);
  const hi = rnd() < 0.5;
  let k = 0;
  for (let i = 0; i < 16; i += rate) {
    s[i] = N(tones[seq[k % seq.length]] + (hi && Math.floor(k / seq.length) % 2 ? 12 : 0));
    k++;
  }
  return s;
}

export function makePattern(id, variant, scale = 'minor') {
  const v = variant || defaultVariant(id);
  if (id === 'perc') return genPerc(v);
  if (id === 'vox') return voxPattern(v, voxDefaults()).steps;
  if (TRACK[id].kind === 'drum') {
    const lib = DRUMS[id][v] || DRUMS[id][defaultVariant(id)];
    return pat(pick(lib));
  }
  if (id === 'bass') return genBass(v, scale);
  if (id === 'stab') return genStab(v, scale);
  return genLead(v, scale);
}

// Шаг i перекрыт длинной нотой, начатой раньше.
export function covered(steps, i) {
  for (let j = 0; j < i; j++) { const n = steps[j]; if (n && j + (n.len || 1) > i) return true; }
  return false;
}

export function denser(id, steps) {
  const s = steps.slice();
  if (TRACK[id].kind === 'drum') {
    if (id === 'hat') return pat(s.filter(Boolean).length < 6 ? 'x.X.x.X.x.X.x.X.' : pick(DRUMS.hat.six));
    shuffle(s.map((v, i) => (v ? -1 : i)).filter(i => i % 2 === 1)).slice(0, 2).forEach(i => { s[i] = 0.55; });
    return s;
  }
  const notes = s.filter(Boolean);
  if (!notes.length) return s;
  let added = 0;
  for (const i of shuffle([...Array(16).keys()])) {
    if (added >= 3) break;
    if (s[i] || covered(s, i)) continue;
    const src = pick(notes);
    s[i] = { n: src.n, len: 1 };
    added++;
  }
  return s;
}

export function sparser(id, steps) {
  const s = steps.slice();
  const on = s.map((v, i) => (v ? i : -1)).filter(i => i >= 0);
  if (on.length <= 1) return s;
  const off = TRACK[id].kind === 'drum' ? 0 : null;
  const keep = i => (id === 'kick' ? i % 4 === 0 : id === 'hat' ? i % 4 === 2 : i === on[0]);
  let removable = on.filter(i => !keep(i));
  if (!removable.length && id === 'kick') removable = on.filter(i => i % 8 === 4);
  shuffle(removable).slice(0, Math.max(1, Math.round(removable.length * 0.5))).forEach(i => { s[i] = off; });
  if (!s.some(Boolean)) s[on[0]] = steps[on[0]];
  return s;
}

export const GENRES = {
  peak: {
    name: 'Пик-тайм техно', bpm: 132, rumble: 0.35, kit: 'techno',
    pat: { kick: 'four', clap: 'back', hat: 'off', perc: 'sync', bass: 'rolling' },
    p: { kick: { drive: 0.35 } },
  },
  acid: {
    name: 'Эсид-техно', bpm: 136, rumble: 0.2, kit: 'acid',
    pat: { kick: 'four', clap: 'back', hat: 'six', ohat: 'off', bass: 'acid' },
    p: { bass: { cutoff: 360, res: 15, env: 0.8, drive: 0.5 }, ohat: { vol: -10 } },
  },
  minimal: {
    name: 'Минимал', bpm: 126, swing: 0.2, kit: 'minimal',
    pat: { kick: 'four', hat: 'six', perc: 'sync', bass: 'deep', stab: 'sparse' },
    p: { hat: { vol: -10 }, bass: { cutoff: 240, res: 2, env: 0.15 } },
  },
  industrial: {
    name: 'Индастриал', bpm: 142, rumble: 0.8, kit: 'industrial',
    pat: { kick: 'four', clap: 'back', hat: 'six', perc: 'three' },
    p: { perc: { dly: 0.3 } },
  },
  dub: {
    name: 'Даб-техно', bpm: 122, swing: 0.06, rumble: 0.2, kit: 'dub',
    pat: { kick: 'four', hat: 'off', stab: 'dub', bass: 'deep' },
    p: { kick: { decay: 0.38 }, hat: { vol: -9 }, stab: { dly: 0.65, rev: 0.55, cutoff: 1200, decay: 0.18 } },
  },
  detroit: {
    name: 'Детройт', bpm: 128, swing: 0.14, kit: 'detroit',
    pat: { kick: 'four', clap: 'back', hat: 'six', ohat: 'off', bass: 'rolling', stab: 'chords' },
    p: { stab: { dly: 0.25 }, ohat: { vol: -10 } },
  },
  melodic: {
    name: 'Мелодик-техно', bpm: 124, rumble: 0.15, kit: 'melodic',
    pat: { kick: 'four', clap: 'back', hat: 'off', ohat: 'sparse', bass: 'rolling', stab: 'pad', lead: 'arp' },
    p: { lead: { dly: 0.45, rev: 0.45 }, stab: { rev: 0.5, vol: -9 }, bass: { cutoff: 280, res: 3, env: 0.25 } },
  },
  hypnotic: {
    name: 'Гипнотик', bpm: 130, rumble: 0.75, kit: 'hypnotic',
    pat: { kick: 'four', hat: 'six', perc: 'three', ohat: 'sparse' },
    p: { perc: { dly: 0.4, rev: 0.3 }, hat: { vol: -8 } },
  },
  house: {
    name: 'Хаус', bpm: 124, swing: 0.1, kit: 'house', feel: 'тёплые аккорды и шейкер',
    pat: { kick: 'four', clap: 'back', hat: 'six', ohat: 'off', perc: 'sync', bass: 'house', stab: 'chords' },
    p: { hat: { vol: -9 }, ohat: { vol: -8 }, stab: { dly: 0.22, rev: 0.3, vol: -6 } },
  },
  hard: {
    name: 'Хард-техно', bpm: 150, rumble: 0.5, kit: 'hard',
    pat: { kick: 'four', clap: 'back', hat: 'six', ohat: 'off', bass: 'rolling' },
    p: { clap: { rev: 0.35 } },
  },
  witch: {
    name: 'Witch House', bpm: 140, rumble: 0.1, kit: 'witch', reverb: 0.95, delay: 0.7, feel: 'халфтайм, ощущается как 70',
    pat: { kick: 'trap', clap: 'slow', hat: 'trap', ohat: 'sparse', perc: 'sparse', bass: '808', stab: 'pad', lead: 'slow' },
    p: { hat: { vol: -7 }, ohat: { vol: -10 }, perc: { dly: 0.45, vol: -8 }, bass: { vol: 0 }, stab: { rev: 0.6, dly: 0.25, vol: -7 }, lead: { rev: 0.65, dly: 0.45, vol: -8 } },
  },
};
export const GENRE_IDS = Object.keys(GENRES);

// Из чего жанр собирает партии: рисунки (с весами) и звуки. Каждый новый бит и каждый вариант трека
// берут отсюда своё — поэтому бочка, бас, хэты и аккорды не одни и те же каждый раз.
const T909 = { kick: ['k909', 'k909', 'kpunch', 'kdeep', 'khard'], clap: ['c909', 'c909', 'crim', 'csnap', 'c808'], hat: ['h909', 'h909', 'hnoise', 'h808', 'hmetal'], ohat: ['o909', 'oride', 'onoise'], perc: ['ptom', 'pblip', 'pconga', 'pcow', 'pmetal'], bass: ['broll', 'broll', 'bsquare', 'breese', 'bsub', 'b303q'], stab: ['sdub', 'spluck', 'sorgan', 'srave', 'spad'], lead: ['lsaw', 'lsquare', 'lpluck', 'lbell', 'lsine'] };
const POOL = {
  peak: { pat: { kick: { four: 5, gallop: 1, broken: 1 }, clap: { back: 4, sync: 2, sparse: 1 }, hat: { off: 4, six: 2, eight: 1, gallop: 1 }, ohat: { off: 3, sparse: 1 }, perc: { gen: 1 }, bass: { rolling: 4, offbeat: 2, deep: 1, acid: 1 }, stab: { dub: 3, sparse: 1, chords: 1 }, lead: { arp: 2, melody: 1 } }, snd: T909 },
  acid: { pat: { kick: { four: 5, gallop: 1, broken: 1 }, clap: { back: 3, sync: 2 }, hat: { six: 3, off: 2, eight: 1 }, ohat: { off: 3, sparse: 1 }, perc: { gen: 1 }, bass: { acid: 1 }, stab: { sparse: 1, dub: 1 }, lead: { arp: 1, melody: 1 } },
    snd: { ...T909, kick: ['k909', 'k909', 'kpunch', 'khard'], bass: ['b303', 'b303', 'b303q'], perc: ['pblip', 'pcow', 'ptom'], stab: ['spluck', 'sdub', 'srave'] } },
  minimal: { pat: { kick: { four: 4, broken: 1 }, clap: { sparse: 2, sync: 1 }, hat: { six: 2, off: 2, sparse: 1 }, ohat: { sparse: 1 }, perc: { gen: 1 }, bass: { deep: 3, offbeat: 2, rolling: 1 }, stab: { sparse: 3, dub: 1 }, lead: { arp: 1 } },
    snd: { ...T909, kick: ['kdeep', 'kdeep', 'kpunch', 'k909'], clap: ['crim', 'csnap', 'crim'], hat: ['hnoise', 'h909', 'hshaker'], bass: ['bsquare', 'bsub', 'b303q', 'bsquare'], stab: ['spluck', 'sdub'], lead: ['lsine', 'lpluck'] } },
  industrial: { pat: { kick: { four: 4, gallop: 2, broken: 1 }, clap: { back: 3, sync: 2 }, hat: { six: 3, eight: 1, gallop: 1 }, ohat: { off: 2, sparse: 1 }, perc: { gen: 1 }, bass: { rolling: 3, offbeat: 1 }, stab: { sparse: 1, dub: 1 }, lead: { arp: 1, slow: 1 } },
    snd: { ...T909, kick: ['kind', 'kind', 'khard', 'kpunch'], clap: ['cind', 'cind', 'c909', 'csnare'], hat: ['hmetal', 'hmetal', 'hnoise'], ohat: ['oride', 'onoise'], perc: ['pmetal', 'pmetal', 'ptom'], bass: ['breese', 'broll', 'breese'], stab: ['srave', 'sdub'] } },
  dub: { pat: { kick: { four: 1 }, clap: { sparse: 1, back: 1 }, hat: { off: 3, six: 1, sparse: 1 }, ohat: { sparse: 1, off: 1 }, perc: { gen: 1 }, bass: { deep: 3, offbeat: 1 }, stab: { dub: 1 }, lead: { slow: 1, arp: 1 } },
    snd: { ...T909, kick: ['kdeep', 'kdeep', 'k909'], clap: ['csnap', 'crim'], hat: ['hshaker', 'hnoise', 'h909'], ohat: ['onoise', 'oride'], perc: ['pconga', 'pblip'], bass: ['bsub', 'bsub', 'bsquare'], stab: ['sdub', 'sdub', 'spad'], lead: ['lsine', 'lbell'] } },
  detroit: { pat: { kick: { four: 4, broken: 1 }, clap: { back: 3, sync: 1 }, hat: { six: 2, off: 2, eight: 1 }, ohat: { off: 1 }, perc: { gen: 1 }, bass: { rolling: 2, offbeat: 2, house: 1 }, stab: { chords: 3, dub: 1 }, lead: { melody: 1, arp: 1 } },
    snd: { ...T909, kick: ['k909', 'k909', 'kpunch'], clap: ['c909', 'c808', 'csnap'], perc: ['pcow', 'pconga', 'ptom'], bass: ['bsquare', 'broll', 'b303q'], stab: ['sorgan', 'sorgan', 'skeys', 'spad'], lead: ['lsquare', 'lbell', 'lsaw'] } },
  melodic: { pat: { kick: { four: 1 }, clap: { back: 3, sparse: 1 }, hat: { off: 3, six: 1 }, ohat: { sparse: 2, off: 1 }, perc: { gen: 1 }, bass: { rolling: 3, deep: 1, offbeat: 1 }, stab: { pad: 3, chords: 1 }, lead: { arp: 2, melody: 2 } },
    snd: { ...T909, kick: ['kpunch', 'k909', 'kdeep'], clap: ['c808', 'c909', 'csnap'], bass: ['broll', 'bsub', 'breese'], stab: ['spad', 'spad', 'schoir', 'spluck'], lead: ['lbell', 'lpluck', 'lsine', 'lsaw'] } },
  hypnotic: { pat: { kick: { four: 4, broken: 1 }, clap: { sparse: 1, sync: 1 }, hat: { six: 3, off: 1 }, ohat: { sparse: 2, off: 1 }, perc: { three: 2, gen: 2 }, bass: { rolling: 2, deep: 2, offbeat: 1 }, stab: { dub: 2, sparse: 1 }, lead: { arp: 1, slow: 1 } },
    snd: { ...T909, kick: ['kpunch', 'kdeep', 'khard'], clap: ['crim', 'csnap'], hat: ['hnoise', 'h909', 'hmetal'], ohat: ['oride', 'onoise'], perc: ['pconga', 'ptom', 'pblip', 'pmetal'], bass: ['bsub', 'broll', 'bsquare'], stab: ['sdub', 'spluck'], lead: ['lpluck', 'lsine'] } },
  house: { pat: { kick: { four: 1 }, clap: { back: 4, sync: 1 }, hat: { six: 2, off: 2, eight: 1 }, ohat: { off: 3, sparse: 1 }, perc: { gen: 1 }, bass: { house: 4, offbeat: 1 }, stab: { chords: 3, dub: 1 }, lead: { melody: 1, arp: 1 } },
    snd: { ...T909, kick: ['khouse', 'khouse', 'k909'], clap: ['c909', 'csnap', 'c808'], hat: ['hshaker', 'hshaker', 'h909'], ohat: ['o909', 'o808'], perc: ['pconga', 'pconga', 'pcow', 'ptom'], bass: ['bhouse', 'bhouse', 'bsquare', 'b303q'], stab: ['skeys', 'skeys', 'sorgan', 'spluck'], lead: ['lbell', 'lsine', 'lpluck'] } },
  hard: { pat: { kick: { four: 4, gallop: 2 }, clap: { back: 3, every: 1, sync: 1 }, hat: { six: 3, off: 1, gallop: 1 }, ohat: { off: 3 }, perc: { gen: 1 }, bass: { rolling: 4, offbeat: 1 }, stab: { sparse: 1, chords: 1 }, lead: { arp: 1 } },
    snd: { ...T909, kick: ['khard', 'khard', 'kind', 'kpunch'], clap: ['c909', 'cind', 'csnare'], hat: ['hmetal', 'h909'], ohat: ['o909', 'oride'], bass: ['breese', 'breese', 'broll'], stab: ['srave', 'srave', 'spluck'], lead: ['lsaw', 'lsquare'] } },
  witch: { pat: { kick: { trap: 3, half: 1 }, clap: { slow: 1 }, hat: { trap: 1 }, ohat: { sparse: 1 }, perc: { sparse: 1 }, bass: { 808: 1 }, stab: { pad: 1 }, lead: { slow: 1 } },
    snd: { kick: ['kboom', 'kboom', 'k808'], clap: ['ctrap', 'ctrap', 'c808'], hat: ['htrap', 'htrap', 'h808'], ohat: ['o808', 'onoise'], perc: ['pchime', 'pchime', 'pblip'], bass: ['b808', 'b808', 'bsub'], stab: ['schoir', 'schoir', 'spad'], lead: ['lghost', 'lghost', 'lbell'] } },
};
POOL.techno = POOL.peak;
const wp = o => { const e = Object.entries(o); let x = rnd() * e.reduce((a, [, w]) => a + w, 0); for (const [k, w] of e) if ((x -= w) < 0) return k; return e[0][0]; };

// Свежие партии и звуки под жанр. ids — какие дорожки (по умолчанию все непустые).
// Не трогает то, что человек напел или поправил руками.
export function freshParts(st, genre, ids = null) {
  const P = POOL[genre] || POOL.peak;
  for (const t of TRACKS) {
    const tr = st.tracks[t.id];
    if (t.id === 'vox' || (ids ? !ids.includes(t.id) : isEmpty(tr)) || tr.hand || tr.variant === 'voice') continue;
    const v = P.pat[t.id] ? wp(P.pat[t.id]) : tr.variant || defaultVariant(t.id, genre);
    tr.steps = makePattern(t.id, v, st.scale);
    tr.variant = v;
    const sl = P.snd[t.id];
    let sid = sl ? pick(sl) : null;
    // Живые ударные из FL Studio (если «Пульс» запущен на компьютере с FL) — примерно в трети случаев
    if (FL.ready && rnd() < 0.35) { const c = flCandidates(t.id, genre); if (c.length) sid = flSound(t.id, pick(c).id) || sid; }
    if (sid) { tr.sound = sid; tr.p = soundParams(t.id, sid, tr.p); }
  }
  // Характер в пределах звука: бочка чуть выше или ниже, короче или длиннее; бас ярче или темнее
  const k = st.tracks.kick.p, b = st.tracks.bass.p, r = (a, z) => a + (z - a) * rnd();
  if (k.tune) k.tune = Math.round(k.tune * r(0.9, 1.12));
  if (k.decay) k.decay = +(k.decay * r(0.85, 1.2)).toFixed(3);
  if (b.cutoff) b.cutoff = Math.round(b.cutoff * r(0.8, 1.25));
  return st;
}

export function genreState(state, id) {
  const g = GENRES[id];
  const st = structuredClone(state);
  st.bpm = g.bpm;
  st.swing = g.swing || 0;
  st.genre = id;
  st.master.rumble = g.rumble || 0;
  st.master.cut = 20000;
  st.master.reverb = g.reverb ?? 0.55;
  st.master.delay = g.delay ?? 0.55;
  const kit = KITS[g.kit || 'techno'];
  for (const t of TRACKS) {
    const tr = st.tracks[t.id];
    tr.sound = kit.s[t.id];
    tr.p = { ...soundParams(t.id, tr.sound), ...structuredClone((g.p && g.p[t.id]) || {}) };
    tr.mute = false;
    tr.solo = false;
    const v = g.pat[t.id];
    tr.steps = v ? makePattern(t.id, v, st.scale) : emptySteps(t.id);
    tr.variant = v || null;
    delete tr.hand;
  }
  // Каждый раз свой бит: рисунки и звуки из того, что подходит жанру
  freshParts(st, id, Object.keys(g.pat));
  for (const t of TRACKS) if (g.p && g.p[t.id]) Object.assign(st.tracks[t.id].p, structuredClone(g.p[t.id]));
  // Гармония жанра: бас, аккорды и мелодия сразу ходят по аккордам
  const prog = pick(GENRE_PROGS[id] || ['none']);
  st.harm = { prog, per: PROGS[prog].d.length === 2 ? pick([1, 2]) : pick([1, 1, 2]), auto: true };
  return st;
}
