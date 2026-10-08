// Музыкальная часть «Пульса»: лады, дорожки, паттерны, генераторы и жанры.

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
];
export const TRACK = Object.fromEntries(TRACKS.map(t => [t.id, t]));

export const DEFAULT_PARAMS = {
  kick: { vol: 0, tune: 46, decay: 0.42, drive: 0.25, click: 0.5 },
  clap: { vol: -2, tone: 1200, decay: 0.22, rev: 0.22, dly: 0 },
  hat: { vol: -4, tone: 8000, decay: 0.045, rev: 0.04, dly: 0 },
  ohat: { vol: -6, tone: 7500, decay: 0.28, rev: 0.08, dly: 0 },
  perc: { vol: -5, tune: 520, decay: 0.1, rev: 0.15, dly: 0.2 },
  bass: { vol: -2, wave: 'sawtooth', cutoff: 420, res: 8, env: 0.5, decay: 0.22, drive: 0.35, rev: 0, dly: 0 },
  stab: { vol: -5, cutoff: 1700, res: 2, decay: 0.22, rev: 0.3, dly: 0.4 },
  lead: { vol: -6, wave: 'sawtooth', cutoff: 2400, res: 3, decay: 0.28, rev: 0.2, dly: 0.3 },
};

export const emptySteps = id => Array(16).fill(TRACK[id].kind === 'drum' ? 0 : null);
export const isEmpty = tr => !tr.steps.some(Boolean);

export function emptyState() {
  const tracks = {};
  for (const t of TRACKS) tracks[t.id] = { steps: emptySteps(t.id), mute: false, solo: false, variant: null, p: { ...DEFAULT_PARAMS[t.id] } };
  return {
    v: 1, bpm: 130, swing: 0, key: 9, scale: 'minor', genre: null, metronome: false,
    master: { vol: 0, cut: 20000, rumble: 0, delay: 0.55, reverb: 0.55 },
    tracks,
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
    out.tracks[t.id] = { steps, mute: !!src.mute, solo: !!src.solo, variant: src.variant || null, p: { ...DEFAULT_PARAMS[t.id], ...(src.p || {}) } };
  }
  return out;
}

const rnd = Math.random;
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
    four: ['X...X...X...X...'],
    broken: ['X..x..X...X..x..', 'X...X..x..X.x...', 'X..X..X...X.....', 'X...X...X..x.x..'],
    half: ['X.......X.......', 'X.........X.....'],
    gallop: ['X..xX...X..xX...', 'X...X..xX...X..x'],
  },
  clap: {
    back: ['....X.......X...'],
    every: ['X...X...X...X...'],
    sync: ['....X.......X..o', '....X..o....X...', '.......X....X...', '....X.....o.X...'],
    sparse: ['............X...'],
  },
  hat: {
    off: ['..X...X...X...X.'],
    eight: ['x.X.x.X.x.X.x.X.'],
    six: ['oxXxoxXxoxXxoxXx', 'xoXoxoXoxoXoxoXx', 'ooXoooXoooXoooXo'],
    gallop: ['..Xx..Xx..Xx..Xx'],
    sparse: ['..x.......x.....'],
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
};

export const VARIANTS = {
  kick: ['four', 'broken', 'half', 'gallop'],
  clap: ['back', 'every', 'sync', 'sparse'],
  hat: ['off', 'eight', 'six', 'gallop', 'sparse'],
  ohat: ['off', 'sparse'],
  perc: ['three', 'sync', 'sparse'],
  bass: ['acid', 'rolling', 'deep', 'offbeat'],
  stab: ['dub', 'chords', 'sparse'],
  lead: ['arp', 'melody'],
};

export function defaultVariant(id, genre) {
  if (id === 'bass') return genre === 'acid' ? 'acid' : genre === 'dub' || genre === 'minimal' ? 'deep' : 'rolling';
  if (id === 'stab') return genre === 'detroit' ? 'chords' : 'dub';
  if (id === 'lead') return 'arp';
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
    for (const i of [2, 3, 6, 7, 10, 11, 14, 15]) s[i] = N(0, { acc: i % 4 === 2 });
    if (rnd() < 0.7) s[15] = N(pick([deg(scale, 4), 12, deg(scale, -1)]));
    if (rnd() < 0.4) s[11] = N(pick([12, deg(scale, 2)]));
  } else if (v === 'deep') {
    for (const i of [2, 6, 10, 14]) s[i] = N(0, { len: 2 });
    if (rnd() < 0.6) s[14] = N(deg(scale, pick([4, -3, 2])), { len: 2 });
  } else {
    for (const i of [2, 6, 10, 14]) s[i] = N(0);
    if (rnd() < 0.5) s[10] = N(12);
  }
  return s;
}

function genStab(v, scale) {
  const lib = {
    dub: ['..x.......x.....', '...x......x.....', '..x...x...x...x.', '...x..x.......x.'],
    chords: ['..x..x....x..x..', 'x..x..x...x..x..', '..x..x..x.....x.'],
    sparse: ['..........x.....', '...x............'],
  };
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
    name: 'Пик-тайм техно', bpm: 132, rumble: 0.35,
    pat: { kick: 'four', clap: 'back', hat: 'off', perc: 'sync', bass: 'rolling' },
    p: { kick: { drive: 0.35 }, bass: { wave: 'sawtooth', cutoff: 320, res: 4, env: 0.3, decay: 0.12, drive: 0.35 } },
  },
  acid: {
    name: 'Эсид-техно', bpm: 136, rumble: 0.2,
    pat: { kick: 'four', clap: 'back', hat: 'six', ohat: 'off', bass: 'acid' },
    p: { bass: { wave: 'sawtooth', cutoff: 360, res: 15, env: 0.8, decay: 0.22, drive: 0.5 }, ohat: { vol: -10 } },
  },
  minimal: {
    name: 'Минимал', bpm: 126, swing: 0.2,
    pat: { kick: 'four', hat: 'six', perc: 'sync', bass: 'deep', stab: 'sparse' },
    p: { kick: { decay: 0.3, drive: 0.1 }, hat: { vol: -10, decay: 0.03 }, bass: { wave: 'square', cutoff: 240, res: 2, env: 0.15 } },
  },
  industrial: {
    name: 'Индастриал', bpm: 142, rumble: 0.8,
    pat: { kick: 'four', clap: 'back', hat: 'six', perc: 'three' },
    p: { kick: { drive: 0.9, decay: 0.5, tune: 44, click: 0.8 }, clap: { rev: 0.5, tone: 1500 }, perc: { dly: 0.3, tune: 900 } },
  },
  dub: {
    name: 'Даб-техно', bpm: 122, swing: 0.06, rumble: 0.2,
    pat: { kick: 'four', hat: 'off', stab: 'dub', bass: 'deep' },
    p: { kick: { drive: 0.12, decay: 0.38 }, hat: { vol: -9 }, stab: { dly: 0.65, rev: 0.55, cutoff: 1200, decay: 0.18 }, bass: { wave: 'sine', cutoff: 220, res: 1, env: 0.1 } },
  },
  detroit: {
    name: 'Детройт', bpm: 128, swing: 0.14,
    pat: { kick: 'four', clap: 'back', hat: 'six', ohat: 'off', bass: 'rolling', stab: 'chords' },
    p: { stab: { cutoff: 2200, dly: 0.25 }, ohat: { vol: -10 } },
  },
  melodic: {
    name: 'Мелодик-техно', bpm: 124, rumble: 0.15,
    pat: { kick: 'four', clap: 'back', hat: 'off', ohat: 'sparse', bass: 'rolling', lead: 'arp' },
    p: { lead: { dly: 0.45, rev: 0.45, cutoff: 3000 }, bass: { cutoff: 280, res: 3, env: 0.25 } },
  },
  hypnotic: {
    name: 'Гипнотик', bpm: 130, rumble: 0.75,
    pat: { kick: 'four', hat: 'six', perc: 'three', ohat: 'sparse' },
    p: { perc: { dly: 0.4, rev: 0.3, tune: 700 }, hat: { vol: -8 } },
  },
  hard: {
    name: 'Хард-техно', bpm: 150, rumble: 0.5,
    pat: { kick: 'four', clap: 'back', hat: 'six', ohat: 'off', bass: 'rolling' },
    p: { kick: { drive: 1, decay: 0.34 }, clap: { rev: 0.35 }, bass: { drive: 0.6 } },
  },
};
export const GENRE_IDS = Object.keys(GENRES);

export function genreState(state, id) {
  const g = GENRES[id];
  const st = structuredClone(state);
  st.bpm = g.bpm;
  st.swing = g.swing || 0;
  st.genre = id;
  st.master.rumble = g.rumble || 0;
  st.master.cut = 20000;
  for (const t of TRACKS) {
    const tr = st.tracks[t.id];
    tr.p = { ...DEFAULT_PARAMS[t.id], ...((g.p && g.p[t.id]) || {}) };
    tr.mute = false;
    tr.solo = false;
    const v = g.pat[t.id];
    tr.steps = v ? makePattern(t.id, v, st.scale) : emptySteps(t.id);
    tr.variant = v || null;
  }
  return st;
}
