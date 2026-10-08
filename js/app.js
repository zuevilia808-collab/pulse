// «Пульс» — техно голосом. Связывает голос, команды, движок и интерфейс.
import {
  TRACKS, TRACK, emptyState, fixState, keyLabel, noteName, isEmpty, makePattern, denser, sparser, genreState,
  GENRES, GENRE_IDS, defaultVariant, VARIANT_RU, VARIANTS, emptySteps, NOTE_RU, SCALE_RU, snap, covered, semiToDeg, deg, pick,
} from './music.js';
import { Engine } from './engine.js';
import { parse, normalize, QUICK } from './commands.js';
import { Voice } from './voice.js';
import { Mic, humToNotes, notesToSteps, beatboxToHits, hitsToPatterns } from './listen.js';
import { Viz } from './viz.js';

const STORE = 'pulse.state.v1';
const $ = s => document.querySelector(s);
const NAME = { kick: 'Бочка', clap: 'Клэп', hat: 'Хэт', ohat: 'Открытый хэт', perc: 'Перкуссия', bass: 'Бас', stab: 'Аккорды', lead: 'Мелодия', rumble: 'Румбл' };
const ACC = { kick: 'бочку', clap: 'клэп', hat: 'хэт', ohat: 'открытый хэт', perc: 'перкуссию', bass: 'бас', stab: 'аккорды', lead: 'мелодию', rumble: 'румбл' };
const OTHER = { kick: 'другую бочку', clap: 'другой клэп', hat: 'другие хэты', ohat: 'другой открытый хэт', perc: 'другую перкуссию', bass: 'новый бас', stab: 'другие аккорды', lead: 'новую мелодию' };
const DECAY = { kick: [0.15, 1.2], clap: [0.08, 0.8], hat: [0.02, 0.2], ohat: [0.1, 0.9], perc: [0.04, 0.6], bass: [0.05, 0.8], stab: [0.08, 1], lead: [0.08, 1] };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pct = v => Math.round(v * 100) + '%';
const hz = v => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + ' кГц' : Math.round(v) + ' Гц');
const dbs = v => (v > 0 ? '+' : '') + Math.round(v) + ' дБ';
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const names = ids => ids.map(i => NAME[i].toLowerCase()).join(', ');

let state = load();
const undoStack = [];
const engine = new Engine(() => state);
const mic = new Mic(engine);
let viz, voice;
let breakSet = null, breakRumble = 0;
let humTarget = 'bass';
let taking = null;
let recording = false, recStartedAt = 0;
const stepQ = [];
const rows = {};
let playhead = -1;
const pendingMute = new Set(); // «убери» ждёт начала доли; «верни» до этого момента его отменяет

// ——— Хранение и отмена ———
function load() {
  try { return fixState(JSON.parse(localStorage.getItem(STORE))); } catch { return emptyState(); }
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* память браузера недоступна */ } }, 300);
}
function pushUndo() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 80) undoStack.shift();
}
function undo() {
  const s = undoStack.pop();
  if (!s) return false;
  state = fixState(JSON.parse(s));
  breakSet = null;
  return true;
}

const isAllEmpty = () => TRACKS.every(t => isEmpty(state.tracks[t.id])) && !state.master.rumble;

async function ensureAudio() { await engine.init(); }
function play() { if (!engine.ctx) return; engine.start(); renderTransport(); }
function stop() {
  engine.stop();
  stepQ.length = 0;
  setPlayhead(-1);
  renderTransport();
}

// Изменение в начале следующей доли или такта, если музыка играет.
function at(unit, fn) {
  if (!engine.playing) { fn(engine.ctx ? engine.ctx.currentTime : 0); return; }
  engine.queue(unit, t => { fn(t); engine.applyParams(); save(); render(); });
}

const tl = ids => {
  const out = [];
  for (const id of ids || []) {
    if (id === 'drums') out.push('kick', 'clap', 'hat', 'ohat', 'perc');
    else out.push(id);
  }
  return [...new Set(out)];
};

function setPattern(id, variant) {
  const tr = state.tracks[id];
  tr.steps = makePattern(id, variant, state.scale);
  tr.variant = variant;
}

function ensureTrack(id) {
  const tr = state.tracks[id];
  if (!tr) return;
  if (isEmpty(tr)) setPattern(id, defaultVariant(id, state.genre));
  tr.mute = false;
  pendingMute.delete(id);
  play();
}

function stepsFrom(id, idx) {
  const s = emptySteps(id);
  for (const i of idx) s[i] = TRACK[id].kind === 'drum' ? (i % 4 === 0 ? 1 : 0.85) : { n: 0, len: 1 };
  return s;
}

function doDrop(t) {
  const T = state.tracks, ids = new Set(breakSet || []);
  for (const id of ['kick', 'bass']) if (!isEmpty(T[id])) ids.add(id);
  ids.forEach(id => { T[id].mute = false; });
  for (const tr of TRACKS) T[tr.id].solo = false;
  if (breakSet && breakRumble) state.master.rumble = breakRumble;
  breakSet = null;
  state.master.cut = 20000;
  engine.endBuild(t);
  engine.impact(t);
}

// ——— Выполнение действий ———
async function exec(a) {
  const T = state.tracks;
  switch (a.type) {
    case 'help': openHelp(); return 'Открыл список команд';
    case 'undo': return undo() ? 'Отменил последнее изменение' : 'Отменять нечего';
    case 'reset': {
      const { bpm, key, scale } = state;
      stop();
      state = emptyState();
      Object.assign(state, { bpm, key, scale });
      breakSet = null;
      return 'Чистый лист. Скажи «сделай техно» или «добавь бочку»';
    }
    case 'genre': {
      const id = a.id || pick(GENRE_IDS.filter(g => g !== state.genre));
      at('bar', () => { state = genreState(state, id); breakSet = null; });
      play();
      return `${GENRES[id].name} · ${GENRES[id].bpm} BPM`;
    }
    case 'play':
      if (engine.playing) return 'Уже играет';
      play();
      return isAllEmpty() ? 'Играю, но пока тишина — скажи «добавь бочку»' : 'Поехали';
    case 'stop':
      if (!engine.playing) return 'Уже стоит';
      stop();
      return 'Стоп';
    case 'tempo':
      state.bpm = clamp(Math.round(a.set != null ? a.set : state.bpm + a.delta), 60, 200);
      return `Темп ${state.bpm} BPM`;
    case 'key':
      if (a.key != null) state.key = a.key;
      if (a.scale) state.scale = a.scale;
      return `Тональность: ${keyLabel(state.key, state.scale)}`;
    case 'transpose': {
      if (Math.abs(a.delta) % 12 === 0) {
        for (const id of ['bass', 'stab', 'lead']) T[id].steps = T[id].steps.map(n => n && { ...n, n: clamp(n.n + a.delta, -12, 24) });
        return `Все партии на октаву ${a.delta > 0 ? 'выше' : 'ниже'}`;
      }
      state.key = (((state.key + a.delta) % 12) + 12) % 12;
      return `Тональность ${a.delta > 0 ? 'выше' : 'ниже'}: ${keyLabel(state.key, state.scale)}`;
    }
    case 'swing':
      state.swing = clamp(a.set != null ? a.set : state.swing + a.delta, 0, 0.6);
      return state.swing ? `Свинг ${pct(state.swing)}` : 'Свинг выключен — ровно';
    case 'fx': {
      const label = a.fx === 'rev' ? 'Реверб' : 'Эхо';
      if (a.track && a.track !== 'master' && T[a.track]) {
        if (!a.zero) ensureTrack(a.track);
        const p = T[a.track].p;
        p[a.fx] = clamp(a.zero ? 0 : (p[a.fx] || 0) + a.dir * 0.18, 0, 1);
        return `${label} на «${NAME[a.track]}»: ${pct(p[a.fx])}`;
      }
      const mk = a.fx === 'rev' ? 'reverb' : 'delay';
      state.master[mk] = clamp(a.zero ? 0 : state.master[mk] + a.dir * 0.2, 0, 1.2);
      if (a.dir > 0) for (const id of ['clap', 'perc', 'stab', 'lead']) if (!T[id].p[a.fx]) T[id].p[a.fx] = 0.2;
      return `${label}: ${pct(state.master[mk] / 1.2)}`;
    }
    case 'dry':
      state.master.reverb = 0.1;
      state.master.delay = 0;
      return 'Сухо — эффекты убраны';
    case 'acid': {
      const b = T.bass;
      if (a.dir > 0 && isEmpty(b)) {
        setPattern('bass', 'acid');
        Object.assign(b.p, { wave: 'sawtooth', res: 14, env: 0.75, cutoff: 380, decay: 0.22, drive: 0.45 });
        b.mute = false;
        play();
        return 'Кислотный бас 303';
      }
      b.mute = false;
      b.p.res = clamp(b.p.res + a.dir * 3.5, 1, 24);
      b.p.env = clamp(b.p.env + a.dir * 0.12, 0, 1);
      return `${a.dir > 0 ? 'Больше' : 'Меньше'} кислоты — резонанс ${Math.round(b.p.res)}`;
    }
    case 'drive': {
      let ids = tl(a.tracks).filter(id => id === 'kick' || id === 'bass');
      if (a.tracks && a.tracks.length && !ids.length) return 'Перегруз есть у бочки и баса';
      if (!ids.length) ids = ['kick', 'bass'].filter(id => !isEmpty(T[id]));
      if (!ids.length) ids = ['kick'];
      for (const id of ids) {
        ensureTrack(id);
        T[id].p.drive = clamp(T[id].p.drive + a.dir * 0.22, 0, 1);
      }
      return `${a.dir > 0 ? 'Жёстче' : 'Мягче'}: ${names(ids)} (${pct(T[ids[0]].p.drive)})`;
    }
    case 'filter': {
      let tgt = a.track;
      if (!tgt) tgt = !isEmpty(T.bass) && !T.bass.mute ? 'bass' : 'master';
      if (tgt === 'master' || tgt === 'drums' || tgt === 'rumble') {
        const m = state.master;
        m.cut = clamp(m.cut * (a.dir > 0 ? 2.8 : 1 / 2.8), 250, 20000);
        if (m.cut > 15000) m.cut = 20000;
        return m.cut >= 20000 ? 'Общий фильтр открыт' : `Общий фильтр: ${hz(m.cut)}`;
      }
      if (tgt === 'kick') return 'У бочки нет фильтра — скажи «бочка мягче» или «бочка жёстче»';
      ensureTrack(tgt);
      const p = T[tgt].p;
      if ('cutoff' in p) {
        p.cutoff = clamp(p.cutoff * (a.dir > 0 ? 1.7 : 1 / 1.7), 60, 9000);
        return `Фильтр «${NAME[tgt]}»: ${hz(p.cutoff)}`;
      }
      p.tone = clamp(p.tone * (a.dir > 0 ? 1.2 : 1 / 1.2), 300, 14000);
      return `${NAME[tgt]} ${a.dir > 0 ? 'ярче' : 'темнее'}`;
    }
    case 'vol': {
      const out = [];
      for (const id of tl(a.tracks)) {
        if (id === 'master') {
          state.master.vol = clamp(state.master.vol + a.delta, -30, 6);
          out.push(`Общая громкость ${dbs(state.master.vol)}`);
        } else if (id === 'rumble') {
          state.master.rumble = clamp(state.master.rumble + Math.sign(a.delta) * 0.15, 0, 1);
          out.push(`Румбл ${pct(state.master.rumble)}`);
        } else if (T[id]) {
          if (a.delta > 0) ensureTrack(id);
          T[id].p.vol = clamp(T[id].p.vol + a.delta, -30, 8);
          out.push(`${NAME[id]} ${dbs(T[id].p.vol)}`);
        }
      }
      return out.join(' · ');
    }
    case 'decay': {
      const out = [];
      for (const id of tl(a.tracks)) {
        if (!T[id]) continue;
        ensureTrack(id);
        const p = T[id].p;
        p.decay = clamp(p.decay * (a.dir > 0 ? 1.45 : 1 / 1.45), ...DECAY[id]);
        out.push(`${NAME[id]} ${a.dir > 0 ? 'длиннее' : 'короче'}`);
      }
      return out.join(' · ');
    }
    case 'pitch': {
      const out = [];
      for (const id of tl(a.tracks)) {
        if (!T[id]) continue;
        ensureTrack(id);
        const tr = T[id];
        if (TRACK[id].kind === 'drum') {
          const semis = a.delta != null ? a.delta : 2 * a.dir;
          if ('tune' in tr.p) tr.p.tune = clamp(tr.p.tune * 2 ** (semis / 12), id === 'kick' ? 30 : 150, id === 'kick' ? 90 : 2000);
          else tr.p.tone = clamp(tr.p.tone * 2 ** (semis / 12), 2000, 14000);
          out.push(`${NAME[id]} ${semis > 0 ? 'выше' : 'ниже'}`);
        } else {
          const d = a.delta != null ? a.delta : 12 * a.dir;
          tr.steps = tr.steps.map(n => n && { ...n, n: clamp(d % 12 ? snap(n.n + d, state.scale) : n.n + d, -12, 24) });
          out.push(`${NAME[id]} ${d > 0 ? 'выше' : 'ниже'} ${Math.abs(d) === 12 ? 'на октаву' : `на ${Math.abs(d)} пт.`}`);
        }
      }
      return out.join(' · ');
    }
    case 'solo': {
      const ids = tl(a.tracks).filter(id => T[id]);
      if (!ids.length) return '';
      ids.forEach(ensureTrack);
      at('beat', () => { for (const t of TRACKS) state.tracks[t.id].solo = ids.includes(t.id); });
      return `Только ${names(ids)}`;
    }
    case 'unmuteAll':
      pendingMute.clear();
      at('beat', () => {
        for (const t of TRACKS) { state.tracks[t.id].mute = false; state.tracks[t.id].solo = false; }
        if (breakSet && breakRumble) state.master.rumble = breakRumble;
        breakSet = null;
      });
      play();
      return 'Все инструменты снова играют';
    case 'clear': {
      const ids = tl(a.tracks);
      for (const id of ids) {
        if (id === 'rumble') state.master.rumble = 0;
        else if (T[id]) { T[id].steps = emptySteps(id); T[id].variant = null; }
        if (id === 'bass') engine.releaseBass();
      }
      return `Очистил: ${names(ids)}`;
    }
    case 'mute': {
      const ids = tl(a.tracks);
      ids.forEach(id => pendingMute.add(id));
      at('beat', () => {
        for (const id of ids) {
          if (!pendingMute.delete(id)) continue;
          if (id === 'rumble') {
            if (state.master.rumble) state.master.rumbleSaved = state.master.rumble;
            state.master.rumble = 0;
          } else if (state.tracks[id]) {
            state.tracks[id].mute = true;
            state.tracks[id].solo = false;
          }
          if (id === 'bass') engine.releaseBass();
        }
      });
      return `Выключил: ${names(ids)}`;
    }
    case 'regen': {
      const out = [];
      for (const id of tl(a.tracks)) {
        if (id === 'rumble' || !T[id]) continue;
        let v = a.variants && a.variants[id];
        if (!v) {
          const cur = T[id].variant;
          if (TRACK[id].kind === 'drum') v = id === 'perc' ? 'gen' : pick(VARIANTS[id].filter(x => x !== cur));
          else v = cur && cur !== 'voice' ? cur : defaultVariant(id, state.genre);
        }
        setPattern(id, v);
        T[id].mute = false;
        out.push(`${NAME[id]} — ${VARIANT_RU[v] || 'новый рисунок'}`);
      }
      play();
      return out.join(' · ');
    }
    case 'density': {
      const out = [];
      for (const id of tl(a.tracks)) {
        if (id === 'rumble') {
          state.master.rumble = clamp(state.master.rumble + a.dir * 0.15, 0, 1);
          out.push(`Румбл ${pct(state.master.rumble)}`);
          continue;
        }
        if (!T[id]) continue;
        if (isEmpty(T[id])) { ensureTrack(id); out.push(`${NAME[id]} добавлен`); continue; }
        T[id].steps = a.dir > 0 ? denser(id, T[id].steps) : sparser(id, T[id].steps);
        T[id].mute = false;
        out.push(`${NAME[id]} ${a.dir > 0 ? 'плотнее' : 'проще'}`);
      }
      play();
      return out.join(' · ');
    }
    case 'add': {
      let ids = tl(a.tracks);
      if (a.tracks.includes('drums')) ids = ['kick', 'clap', 'hat'];
      const out = [];
      for (const id of ids) {
        if (id === 'rumble') {
          state.master.rumble = Math.max(state.master.rumble, state.master.rumbleSaved || 0, 0.55);
          if (isEmpty(T.kick)) setPattern('kick', 'four');
          T.kick.mute = false;
          out.push('Румбл под бочкой');
          continue;
        }
        const tr = T[id];
        if (!tr) continue;
        const v = a.variants && a.variants[id];
        const wasMuted = tr.mute || pendingMute.delete(id);
        if (a.steps && a.steps.length) {
          tr.steps = stepsFrom(id, a.steps);
          tr.variant = null;
          out.push(a.steps.every(i => i % 4 === 0)
            ? `${NAME[id]} на ${a.steps.map(i => i / 4 + 1).join(' и ')} ${a.steps.length > 1 ? 'доли' : 'долю'}`
            : `${NAME[id]}: шаги ${a.steps.map(i => i + 1).join(', ')}`);
        } else if (v || isEmpty(tr)) {
          const vv = v || defaultVariant(id, state.genre);
          setPattern(id, vv);
          if (id === 'bass' && vv === 'acid') Object.assign(tr.p, { wave: 'sawtooth', res: Math.max(tr.p.res, 13), env: Math.max(tr.p.env, 0.7), drive: Math.max(tr.p.drive, 0.4) });
          if (id === 'bass' && vv === 'deep') Object.assign(tr.p, { res: Math.min(tr.p.res, 3), env: Math.min(tr.p.env, 0.2), cutoff: Math.min(tr.p.cutoff, 300) });
          out.push(`${NAME[id]} — ${VARIANT_RU[vv] || 'новый рисунок'}`);
        } else if (wasMuted) out.push(`${NAME[id]} снова играет`);
        else out.push(`${NAME[id]} уже играет — скажи «${OTHER[id]}», чтобы поменять`);
        tr.mute = false;
      }
      if (TRACKS.some(t => T[t.id].solo) && !ids.every(id => T[id] && T[id].solo)) for (const t of TRACKS) T[t.id].solo = false;
      play();
      return out.join(' · ');
    }
    case 'build':
      if (isAllEmpty()) return 'Сначала нужен бит — скажи «сделай техно»';
      play();
      at('bar', t => engine.startBuild(t, 2));
      return 'Нарастание 2 такта, потом дроп';
    case 'break':
      if (!engine.playing) return 'Брейк делается во время игры — скажи «поехали»';
      at('bar', () => {
        breakSet = ['kick', 'bass'].filter(id => !state.tracks[id].mute && !isEmpty(state.tracks[id]));
        breakSet.forEach(id => { state.tracks[id].mute = true; });
        engine.releaseBass();
        breakRumble = state.master.rumble;
        state.master.rumble = 0;
      });
      return 'Брейк: бочка и бас ушли. Скажи «дроп»';
    case 'drop':
      play();
      at('bar', t => doDrop(t));
      return 'Дроп!';
    case 'metro':
      state.metronome = a.on;
      return a.on ? 'Метроном включён' : 'Метроном выключен';
    case 'hum':
      takeVoice('hum', a.track || humTarget);
      return '';
    case 'beatbox':
      takeVoice('beatbox');
      return '';
    case 'recStart': return startRec();
    case 'recStop': return stopRec();
  }
  return '';
}

async function runText(raw, src = 'text', alts = null) {
  const cands = alts && alts.length ? alts : [raw];
  let parsed = null, used = cands[0];
  for (const c of cands) {
    const p = parse(c);
    if (p.actions.length) { parsed = p; used = c; break; }
  }
  showHeard(used);
  if (!parsed) {
    setDid(`Не понял «${used.trim()}». Скажи «что ты умеешь»`, true);
    if (src !== 'voice') log(used, 'не понял', false);
    return false;
  }
  await ensureAudio();
  const quiet = ['help', 'undo', 'play', 'stop', 'hum', 'beatbox', 'recStart', 'recStop', 'metro'];
  if (parsed.actions.some(a => !quiet.includes(a.type))) pushUndo();
  const out = [];
  for (const a of parsed.actions) {
    try {
      const r = await exec(a);
      if (r) out.push(r);
    } catch (e) {
      console.error(e);
      out.push('Ошибка: ' + e.message);
    }
  }
  engine.applyParams();
  save();
  render();
  const msg = out.join(' · ');
  if (msg) { setDid(msg); log(used, msg, true); }
  return true;
}

// ——— Голос → ноты ———
async function takeVoice(kind, target = 'bass') {
  if (taking) return;
  const ctl = { cancel: null };
  taking = ctl;
  let resumed = false;
  try {
    await ensureAudio();
    try {
      await mic.ensure();
    } catch {
      toast('Нет доступа к микрофону. Нажми на значок слева от адреса → Микрофон → Разрешить', 'err');
      return;
    }
    voice.pause();
    const ctx = engine.ctx;
    play();
    const sd = 60 / state.bpm / 4, bar = sd * 16;
    let c0 = engine.nextBarTime();
    if (c0 - ctx.currentTime < 0.25) c0 += bar;
    const r0 = c0 + bar, r1 = r0 + bar;
    const muteIds = kind === 'beatbox' ? ['kick', 'clap', 'hat', 'ohat'] : [target];
    engine.beginTake({ countStart: c0, recStart: r0, recEnd: r1, mute: muteIds, gate: !$('#phonesChk').checked });
    mic.begin();
    // Задержка петли «колонки → уши → голос → микрофон»; +20 мс — типичный буфер записи в Windows.
    const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0) + mic.inLatency + 0.02;
    const res = await takeOverlay(kind, target, c0, r0, r1, sd, lat, ctl);
    await mic.end();
    engine.endTake();
    if (res !== 'done') { hideTake(); return; }
    const pre = sd / 2, x = mic.slice(r0 + lat - pre, r1 + lat), sr = ctx.sampleRate;
    let msg;
    if (kind === 'hum') {
      const notes = humToNotes(x, sr, sd, 16, pre);
      if (!notes.length) { takeResult('Не расслышал мелодию. Пой громче и ближе к микрофону', false); return; }
      pushUndo();
      const tr = state.tracks[target];
      tr.steps = notesToSteps(notes, state.scale, target);
      tr.mute = false;
      tr.variant = 'voice';
      msg = `${NAME[target]} с голоса: ${notes.length} ${plural(notes.length, 'нота', 'ноты', 'нот')}`;
    } else {
      const hits = beatboxToHits(x, sr, pre);
      const pats = hitsToPatterns(hits, sd);
      const parts = [];
      const found = ['kick', 'clap', 'hat'].filter(id => pats[id].some(Boolean));
      if (!found.length) { takeResult('Не услышал ударов. Битбокси громче: «бум», «тс», «пщ»', false); return; }
      pushUndo();
      for (const id of found) {
        state.tracks[id].steps = pats[id];
        state.tracks[id].mute = false;
        state.tracks[id].variant = 'voice';
        parts.push(`${NAME[id].toLowerCase()} ×${pats[id].filter(Boolean).length}`);
      }
      msg = `Битбокс → ${parts.join(', ')}`;
    }
    engine.applyParams();
    save();
    render();
    takeResult(msg, true);
    setDid(msg);
    log(kind === 'hum' ? 'напето голосом' : 'битбокс', msg, true);
    voice.resume();
    resumed = true;
  } finally {
    taking = null;
    if (!resumed) voice.resume();
  }
}

function takeOverlay(kind, target, c0, r0, r1, sd, lat, ctl) {
  return new Promise(resolve => {
    const el = $('#take'), big = $('#takeBig'), lab = $('#takeLabel'), lvl = $('#takeLvl');
    el.hidden = false;
    el.className = 'take';
    $('#takeTitle').textContent = kind === 'hum' ? `Напой ${ACC[target]}` : 'Битбокс → барабаны';
    $('#takeHint').textContent = kind === 'hum'
      ? 'Мычи или пой «да-да-дам». Один такт — 16 шагов, следи за точками'
      : '«бум» — бочка · «тс» — хэт · «пщ» или «ка» — клэп';
    const stepsEl = $('#takeSteps');
    stepsEl.innerHTML = '<i></i>'.repeat(16);
    const dots = [...stepsEl.children];
    const ctx = engine.ctx;
    let fin = false;
    const done = r => { if (!fin) { fin = true; clearTimeout(timer); resolve(r); } };
    ctl.cancel = () => done('cancel');
    const timer = setTimeout(() => done('done'), (r1 + lat + 0.25 - ctx.currentTime) * 1000);
    (function loop() {
      if (fin) return;
      const now = ctx.currentTime;
      if (now < c0) { big.textContent = '·'; lab.textContent = 'Приготовься…'; }
      else if (now < r0) { big.textContent = String(4 - Math.floor((now - c0) / (sd * 4))); lab.textContent = 'Отсчёт'; }
      else if (now < r1) {
        const s = Math.floor((now - r0) / sd);
        big.textContent = String(Math.floor(s / 4) + 1);
        lab.textContent = kind === 'hum' ? 'Пой!' : 'Давай бит!';
        el.classList.add('rec');
        dots.forEach((d, i) => { d.className = i < s ? 'past' : i === s ? 'now' : ''; });
      } else {
        el.classList.remove('rec');
        big.textContent = '…';
        lab.textContent = 'Слушаю, что получилось';
        dots.forEach(d => { d.className = 'past'; });
      }
      lvl.style.transform = `scaleX(${Math.min(1, mic.level() * 7).toFixed(3)})`;
      requestAnimationFrame(loop);
    })();
  });
}

function takeResult(msg, ok) {
  const el = $('#take');
  el.className = 'take ' + (ok ? 'done' : 'fail');
  $('#takeBig').textContent = ok ? '✓' : '×';
  $('#takeLabel').textContent = msg;
  $('#takeHint').textContent = ok ? 'Можно поправить голосом: «бас выше», «новый бас», «отмени»' : '';
  clearTimeout(takeResult.t);
  takeResult.t = setTimeout(hideTake, ok ? 2200 : 3200);
  if (!ok) toast(msg, 'err');
}
function hideTake() { $('#take').hidden = true; }

// ——— Запись трека ———
async function startRec() {
  if (recording) return 'Запись уже идёт';
  await ensureAudio();
  await engine.recStart();
  recording = true;
  recStartedAt = performance.now();
  play();
  renderTransport();
  return 'Запись трека пошла. Скажи «сохрани», когда хватит';
}
async function stopRec() {
  if (!recording) return 'Запись не идёт. Скажи «начни запись»';
  recording = false;
  const res = await engine.recStop();
  renderTransport();
  if (!res || res.sec < 0.3) return 'Запись пустая';
  const d = new Date(), z = n => String(n).padStart(2, '0');
  const name = `pulse-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}.wav`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(res.blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`Сохранил ${name} в «Загрузки»`, 'ok');
  return `Сохранил ${fmtTime(res.sec)} в файл ${name}`;
}
const fmtTime = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// ——— Интерфейс ———
const KNOBS = [
  { label: 'Фильтр баса', get: () => state.tracks.bass.p.cutoff, set: v => { state.tracks.bass.p.cutoff = v; }, min: 60, max: 4000, log: true, fmt: hz },
  { label: 'Кислота', get: () => state.tracks.bass.p.res, set: v => { state.tracks.bass.p.res = v; }, min: 1, max: 24, fmt: v => String(Math.round(v)) },
  { label: 'Перегруз бочки', get: () => state.tracks.kick.p.drive, set: v => { state.tracks.kick.p.drive = v; }, min: 0, max: 1, fmt: pct },
  { label: 'Румбл', get: () => state.master.rumble, set: v => { state.master.rumble = v; }, min: 0, max: 1, fmt: pct },
  { label: 'Эхо', get: () => state.master.delay, set: v => { state.master.delay = v; }, min: 0, max: 1.2, fmt: v => pct(v / 1.2) },
  { label: 'Реверб', get: () => state.master.reverb, set: v => { state.master.reverb = v; }, min: 0, max: 1.2, fmt: v => pct(v / 1.2) },
  { label: 'Свинг', get: () => state.swing, set: v => { state.swing = v; }, min: 0, max: 0.6, fmt: pct },
  { label: 'Общий фильтр', get: () => state.master.cut, set: v => { state.master.cut = v; }, min: 250, max: 20000, log: true, fmt: v => (v >= 19500 ? 'открыт' : hz(v)) },
  { label: 'Громкость', get: () => state.master.vol, set: v => { state.master.vol = v; }, min: -30, max: 6, fmt: dbs },
];
const toPos = (k, v) => Math.round(1000 * (k.log ? Math.log(v / k.min) / Math.log(k.max / k.min) : (v - k.min) / (k.max - k.min)));
const fromPos = (k, p) => (k.log ? k.min * (k.max / k.min) ** (p / 1000) : k.min + ((k.max - k.min) * p) / 1000);

const EXAMPLES = [
  'сделай техно', 'добавь бочку', 'хэты на офбит', 'кислотный бас', 'клэп на 2 и 4', 'темп 134', 'больше кислоты',
  'открой фильтр', 'дабовые аккорды', 'нарастание', 'брейк', 'дроп', 'напою бас', 'битбокс', 'добавь румбл',
  'только бас', 'верни всё', 'сделай минимал', 'бочка жёстче', 'больше эха на аккордах', 'придумай мелодию',
  'добавь свинг', 'тональность ре минор', 'другие хэты', 'сделай эсид', 'частые хэты', 'добавь перкуссию',
];

const HELP = [
  ['Начать', ['сделай техно', 'сделай эсид', 'сделай минимал', 'сделай даб-техно', 'сделай индастриал', 'сделай гипнотик', 'хард-техно', 'детройт', 'поехали', 'стоп', 'новый трек']],
  ['Инструменты', ['добавь бочку', 'ломаная бочка', 'хэты на офбит', 'частые хэты', 'клэп на 2 и 4', 'добавь открытый хэт', 'добавь перкуссию', 'кислотный бас', 'глубокий бас', 'дабовые аккорды', 'придумай мелодию', 'добавь румбл']],
  ['Убрать и поменять', ['убери бочку', 'верни бочку', 'только бас', 'верни всё', 'убери всё кроме бочки', 'очисти хэты', 'новый бас', 'другие хэты', 'больше хэтов', 'проще бас']],
  ['Звук', ['темп 135', 'быстрее', 'громче бас', 'тише хэты', 'открой фильтр', 'закрой фильтр на всём', 'больше кислоты', 'бочка жёстче', 'бочку длиннее', 'больше эха на аккордах', 'больше реверба', 'сухо', 'добавь свинг', 'бас на октаву выше']],
  ['Тональность', ['тональность ре минор', 'в фа диез миноре', 'транспонируй на тон выше']],
  ['Шоу', ['нарастание', 'брейк', 'дроп']],
  ['Голос вместо нот', ['напою бас', 'напою мелодию', 'напою аккорды', 'битбокс']],
  ['Ещё', ['отмени', 'начни запись', 'сохрани', 'метроном', 'бочка и бас громче']],
];

function buildUI() {
  const grid = $('#grid');
  grid.innerHTML = '';
  for (const t of TRACKS) {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.id = t.id;
    row.style.setProperty('--c', t.color);
    row.innerHTML = `<div class="rh"><span class="dot"></span><span class="nm">${t.name}</span>`
      + '<button class="ms m" title="Выключить (mute)">M</button><button class="ms s" title="Только эта дорожка (соло)">S</button>'
      + '<input class="vol" type="range" min="-30" max="8" step="1" title="Громкость дорожки"></div>'
      + `<div class="cells">${'<button class="cell"></button>'.repeat(16)}</div>`;
    grid.append(row);
    rows[t.id] = { row, cells: [...row.querySelectorAll('.cell')], m: row.querySelector('.m'), s: row.querySelector('.s'), vol: row.querySelector('.vol') };
  }

  const knobs = $('#knobs');
  knobs.innerHTML = '';
  KNOBS.forEach(k => {
    const el = document.createElement('label');
    el.className = 'knob';
    el.innerHTML = `<span class="kl">${k.label}</span><output></output><input type="range" min="0" max="1000">`;
    const inp = el.querySelector('input');
    inp.addEventListener('pointerdown', () => pushUndo());
    inp.addEventListener('input', () => {
      k.set(fromPos(k, +inp.value));
      el.querySelector('output').textContent = k.fmt(k.get());
      engine.applyParams();
      save();
    });
    k.el = el;
    knobs.append(el);
  });

  const ks = $('#keySel'), ss = $('#scaleSel');
  ks.innerHTML = NOTE_RU.map((n, i) => `<option value="${i}">${n}</option>`).join('');
  ss.innerHTML = Object.entries(SCALE_RU).map(([v, n]) => `<option value="${v}">${n}</option>`).join('');

  const help = $('#helpBody');
  help.innerHTML = HELP.map(([h, list]) => `<section><h3>${h}</h3><div class="hchips">${list.map(p => `<button class="chip">${p}</button>`).join('')}</div></section>`).join('');
  refreshChips();
}

function refreshChips() {
  const pool = [...EXAMPLES].sort(() => Math.random() - 0.5);
  const first = isAllEmpty() ? ['сделай техно', 'добавь бочку'] : [];
  const list = [...new Set([...first, ...pool])].slice(0, 8);
  $('#chips').innerHTML = list.map(p => `<button class="chip">${p}</button>`).join('');
}

function render() {
  renderTransport();
  renderGrid();
  renderKnobs();
}

function renderTransport() {
  $('#bpmVal').textContent = state.bpm;
  document.body.classList.toggle('playing', engine.playing);
  const pb = $('#playBtn');
  pb.classList.toggle('on', engine.playing);
  pb.querySelector('use').setAttribute('href', engine.playing ? '#i-stop' : '#i-play');
  pb.querySelector('span').textContent = engine.playing ? 'Стоп' : 'Играть';
  if (document.activeElement !== $('#keySel')) $('#keySel').value = state.key;
  if (document.activeElement !== $('#scaleSel')) $('#scaleSel').value = state.scale;
  $('#recBtn').classList.toggle('on', recording);
  if (!recording) $('#recBtn .lbl').textContent = 'Запись трека';
}

function renderGrid() {
  const anySolo = TRACKS.some(t => state.tracks[t.id].solo);
  for (const t of TRACKS) {
    const tr = state.tracks[t.id], r = rows[t.id];
    r.row.classList.toggle('muted', tr.mute || (anySolo && !tr.solo));
    r.row.classList.toggle('empty', isEmpty(tr));
    r.m.classList.toggle('on', tr.mute);
    r.s.classList.toggle('on', tr.solo);
    if (document.activeElement !== r.vol) r.vol.value = tr.p.vol;
    if (t.kind === 'drum') {
      r.cells.forEach((c, i) => {
        const v = tr.steps[i];
        c.className = 'cell' + (v ? ' on' : '') + (v >= 1 ? ' acc' : '') + (v && v < 0.7 ? ' ghost' : '') + (i === playhead ? ' now' : '');
        c.textContent = '';
      });
    } else {
      r.cells.forEach((c, i) => {
        const n = tr.steps[i], tie = !n && covered(tr.steps, i);
        c.className = 'cell' + (n ? ' on' : '') + (tie ? ' tie' : '') + (n && n.acc ? ' acc' : '') + (n && n.slide ? ' sl' : '') + (i === playhead ? ' now' : '');
        c.textContent = n ? noteName(state.key, n.n) + (n.n >= 12 ? '↑' : n.n < 0 ? '↓' : '') : '';
      });
    }
  }
  $('#emptyHint').hidden = !isAllEmpty();
  $('#genreTag').textContent = state.genre ? GENRES[state.genre].name : '';
  $('#genreTag').hidden = !state.genre;
}

function renderKnobs() {
  for (const k of KNOBS) {
    const inp = k.el.querySelector('input');
    if (document.activeElement !== inp) inp.value = toPos(k, k.get());
    k.el.querySelector('output').textContent = k.fmt(k.get());
  }
}

function setPlayhead(s) {
  if (s === playhead) return;
  for (const t of TRACKS) {
    const r = rows[t.id];
    if (playhead >= 0) r.cells[playhead].classList.remove('now');
    if (s >= 0) {
      const c = r.cells[s];
      c.classList.add('now');
      if (c.classList.contains('on') && !r.row.classList.contains('muted')) c.animate([{ filter: 'brightness(1.9)', transform: 'scale(1.08)' }, { filter: 'brightness(1)', transform: 'scale(1)' }], 220);
    }
  }
  playhead = s;
}

function showHeard(text) {
  $('#heard .final').textContent = text ? `«${text.trim()}»` : '';
  $('#heard .interim').textContent = '';
}
function showInterim(text) { $('#heard .interim').textContent = text; $('#heard .final').textContent = ''; }
function setDid(msg, miss = false) {
  const el = $('#did');
  el.textContent = msg;
  el.classList.toggle('miss', miss);
  el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], 220);
}

function log(text, result, ok) {
  const li = document.createElement('li');
  li.className = ok ? '' : 'miss';
  li.innerHTML = '<q></q><span></span>';
  li.querySelector('q').textContent = text.trim();
  li.querySelector('span').textContent = result;
  const ol = $('#log');
  ol.prepend(li);
  while (ol.children.length > 40) ol.lastChild.remove();
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 4200);
}

const VSTATUS = {
  off: 'Нажми на микрофон и скажи, что сыграть',
  listening: 'Слушаю… говори команды',
  paused: 'Записываю голос — команды на паузе',
  retry: 'Нет связи с распознаванием (нужен интернет). Пробую снова…',
};
function setVoiceState(s) {
  $('#micBtn').classList.toggle('on', voice.want);
  $('#micBtn').classList.toggle('retry', s === 'retry');
  $('#vStatus').textContent = VSTATUS[s] || VSTATUS.off;
  if (!voice.want) $('#micBtn').style.setProperty('--lvl', 0);
}
function voiceError(err) {
  if (err === 'not-allowed' || err === 'service-not-allowed') {
    $('#vStatus').textContent = 'Микрофон запрещён. Нажми на значок слева от адреса → Микрофон → Разрешить';
    toast('Chrome не дал доступ к микрофону', 'err');
  } else if (err === 'audio-capture') {
    $('#vStatus').textContent = 'Микрофон не найден — проверь, что он подключён';
  } else if (err === 'network') {
    $('#vStatus').textContent = VSTATUS.retry;
  }
  setVoiceState(voice.want ? 'retry' : 'off');
}

function openHelp() { const d = $('#helpDlg'); if (!d.open) d.showModal(); }

function bind() {
  $('#micBtn').addEventListener('click', async () => {
    await ensureAudio();
    if (!voice.supported) {
      $('#vStatus').textContent = 'Голосовые команды работают в Google Chrome. Здесь можно писать команды в поле ниже';
      $('#typeIn').focus();
      return;
    }
    if (voice.want) { voice.stop(); return; }
    mic.ensure().catch(() => {});
    voice.start();
    setVoiceState('listening');
  });

  $('#typeForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#typeIn').value.trim();
    if (!v) return;
    $('#typeIn').value = '';
    runText(v, 'text');
  });

  document.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    if (chip.closest('#helpDlg')) $('#helpDlg').close();
    runText(chip.textContent, 'chip').then(() => { if (chip.closest('#chips')) refreshChips(); });
  });

  $('#playBtn').addEventListener('click', async () => {
    await ensureAudio();
    if (engine.playing) stop(); else play();
  });
  document.querySelectorAll('[data-bpm]').forEach(b => b.addEventListener('click', () => {
    state.bpm = clamp(state.bpm + +b.dataset.bpm, 60, 200);
    engine.applyParams(); save(); renderTransport();
  }));
  $('.bpm').addEventListener('wheel', e => {
    e.preventDefault();
    state.bpm = clamp(state.bpm + (e.deltaY < 0 ? 1 : -1), 60, 200);
    engine.applyParams(); save(); renderTransport();
  }, { passive: false });
  $('#keySel').addEventListener('change', e => { pushUndo(); state.key = +e.target.value; save(); render(); });
  $('#scaleSel').addEventListener('change', e => { pushUndo(); state.scale = e.target.value; save(); render(); });
  $('#undoBtn').addEventListener('click', () => { if (undo()) { engine.applyParams(); save(); render(); setDid('Отменил последнее изменение'); } });
  $('#helpBtn').addEventListener('click', openHelp);
  $('#helpClose').addEventListener('click', () => $('#helpDlg').close());
  $('#recBtn').addEventListener('click', async () => {
    const r = recording ? await stopRec() : await startRec();
    setDid(r);
  });

  $('#humSeg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    humTarget = b.dataset.t;
    $('#humSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });
  $('#humBtn').addEventListener('click', () => takeVoice('hum', humTarget));
  $('#bbxBtn').addEventListener('click', () => takeVoice('beatbox'));
  $('#takeCancel').addEventListener('click', () => { if (taking && taking.cancel) taking.cancel(); else hideTake(); });
  try { $('#phonesChk').checked = localStorage.getItem('pulse.phones') === '1'; } catch { /* нет хранилища */ }
  $('#phonesChk').addEventListener('change', e => { try { localStorage.setItem('pulse.phones', e.target.checked ? '1' : '0'); } catch { /* нет хранилища */ } });

  $('#grid').addEventListener('click', async e => {
    const row = e.target.closest('.row');
    if (!row) return;
    const id = row.dataset.id, tr = state.tracks[id];
    await ensureAudio();
    if (e.target.closest('.m')) { tr.mute = !tr.mute; if (id === 'bass' && tr.mute) engine.releaseBass(); }
    else if (e.target.closest('.s')) { const on = !tr.solo; for (const t of TRACKS) state.tracks[t.id].solo = false; tr.solo = on; }
    else if (e.target.closest('.cell')) {
      const i = rows[id].cells.indexOf(e.target.closest('.cell'));
      pushUndo();
      if (TRACK[id].kind === 'drum') {
        const v = tr.steps[i];
        tr.steps[i] = !v ? 0.85 : v < 1 ? 1 : 0;
      } else {
        const n = tr.steps[i];
        if (n && e.shiftKey) n.acc = !n.acc;
        else if (n && e.altKey) n.slide = !n.slide;
        else if (n) tr.steps[i] = null;
        else if (covered(tr.steps, i)) {
          for (let j = i - 1; j >= 0; j--) if (tr.steps[j]) { tr.steps[j].len = i - j; break; }
        } else tr.steps[i] = { n: 0, len: 1 };
      }
      tr.mute = false;
      if (!engine.playing && tr.steps.some(Boolean)) play();
    } else return;
    engine.applyParams(); save(); render();
  });
  $('#grid').addEventListener('wheel', e => {
    const cell = e.target.closest('.cell'), row = e.target.closest('.row');
    if (!cell || !row || TRACK[row.dataset.id].kind === 'drum') return;
    const n = state.tracks[row.dataset.id].steps[rows[row.dataset.id].cells.indexOf(cell)];
    if (!n) return;
    e.preventDefault();
    n.n = clamp(deg(state.scale, semiToDeg(n.n, state.scale) + (e.deltaY < 0 ? 1 : -1)), -12, 24);
    save(); renderGrid();
  }, { passive: false });
  $('#grid').addEventListener('input', e => {
    if (!e.target.classList.contains('vol')) return;
    state.tracks[e.target.closest('.row').dataset.id].p.vol = +e.target.value;
    engine.applyParams(); save();
  });

  document.addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      ensureAudio().then(() => (engine.playing ? stop() : play()));
    } else if (e.key === 'Escape' && taking && taking.cancel) taking.cancel();
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { if (undo()) { engine.applyParams(); save(); render(); } }
  });
}

function frame() {
  viz.draw();
  if (engine.ctx && engine.playing) {
    const ct = engine.ctx.currentTime;
    let s = null;
    while (stepQ.length && stepQ[0][0] <= ct) s = stepQ.shift()[1];
    if (s != null) setPlayhead(s);
  }
  if (voice.want && mic.analyser) $('#micBtn').style.setProperty('--lvl', Math.min(1, mic.level() * 9).toFixed(3));
  if (recording) $('#recBtn .lbl').textContent = fmtTime((performance.now() - recStartedAt) / 1000);
  requestAnimationFrame(frame);
}

function init() {
  buildUI();
  // Короткие команды («стоп», «дроп») выполняются, если промежуточный текст продержался 250 мс
  // и не вырос в длинную фразу — так «стоп бочку» не остановит весь трек.
  const fired = new Map();
  let quickTimer = 0;
  voice = new Voice({
    state: setVoiceState,
    interim: (txt, key) => {
      showInterim(txt);
      clearTimeout(quickTimer);
      const n = normalize(txt);
      if (QUICK.has(n) && !fired.has(key)) quickTimer = setTimeout(() => { fired.set(key, n); runText(n, 'voice'); }, 250);
    },
    final: (alts, key) => {
      clearTimeout(quickTimer);
      const done = fired.get(key);
      fired.delete(key);
      if (done && normalize(alts[0]) === done) { showHeard(alts[0]); return; }
      if (alts[0].trim().length < 2) return;
      runText(alts[0], 'voice', alts);
    },
    error: voiceError,
  });
  if (!voice.supported) $('#vStatus').textContent = 'Голосовые команды работают в Google Chrome. Здесь можно писать команды в поле ниже';
  engine.onStep = (s, t) => { stepQ.push([t, s]); if (stepQ.length > 64) stepQ.shift(); };
  engine.onBuildEnd = t => { doDrop(t); engine.applyParams(); save(); render(); setDid('Дроп!'); };
  viz = new Viz($('#viz'), engine, () => state);
  engine.onKick = t => viz.kick(t);
  bind();
  render();
  requestAnimationFrame(frame);
  window.pulse = { engine, mic, voice, run: runText, get state() { return state; } }; // для отладки из консоли
}

init();
