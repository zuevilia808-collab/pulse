// «Пульс» — техно голосом. Связывает голос, команды, движок и интерфейс.
import {
  TRACKS, TRACK, emptyState, fixState, keyLabel, noteName, isEmpty, makePattern, denser, sparser, genreState,
  GENRES, GENRE_IDS, defaultVariant, VARIANT_RU, VARIANTS, emptySteps, NOTE_RU, SCALE_RU, snap, covered, semiToDeg, deg, pick, soundParams,
} from './music.js?v=3';
import { SOUNDS, KITS, KIT_IDS, kitOf } from './sounds.js?v=3';
import { PART, INS, OUTS, FILTERS, PROGS, HEADS, SHAPES, FORMS, LANES, compose, rerollSection, barData, songBars, locate, sectionStart, energy, barSec } from './arrange.js?v=3';
import { Engine, renderSong } from './engine.js?v=3';
import { parse, normalize, QUICK } from './commands.js?v=3';
import { Voice } from './voice.js?v=3';
import { Mic, humToNotes, notesToSteps, beatboxToHits, hitsToPatterns } from './listen.js?v=3';
import { Viz } from './viz.js?v=3';

const STORE = 'pulse.state.v1';
const $ = s => document.querySelector(s);
const NAME = { kick: 'Бочка', clap: 'Клэп', hat: 'Хэт', ohat: 'Открытый хэт', perc: 'Перкуссия', bass: 'Бас', stab: 'Аккорды', lead: 'Мелодия', rumble: 'Румбл' };
const ACC = { kick: 'бочку', clap: 'клэп', hat: 'хэт', ohat: 'открытый хэт', perc: 'перкуссию', bass: 'бас', stab: 'аккорды', lead: 'мелодию', rumble: 'румбл' };
const OTHER = { kick: 'другую бочку', clap: 'другой клэп', hat: 'другой хэт', ohat: 'другой открытый хэт', perc: 'другую перкуссию', bass: 'другой бас', stab: 'другие аккорды', lead: 'другой синт' };
const NEWPAT = { kick: 'новый ритм бочки', clap: 'новый ритм клэпа', hat: 'новый ритм хэтов', ohat: 'новый ритм открытого хэта', perc: 'новую перкуссию', bass: 'новый бас', stab: 'новые аккорды', lead: 'новую мелодию' };
const DECAY = { kick: [0.15, 1.8], clap: [0.04, 0.8], hat: [0.02, 0.2], ohat: [0.1, 1.2], perc: [0.04, 0.8], bass: [0.05, 0.8], stab: [0.05, 1.6], lead: [0.08, 1.2] };
const SHORT = { kick: 'Бочка', clap: 'Клэп', hat: 'Хэт', ohat: 'Откр. хэт', perc: 'Перк.', bass: 'Бас', stab: 'Аккорды', lead: 'Мелодия' };
const LENS = [1, 1.5, 2, 3, 4, 5];
const MOBILE = navigator.userAgentData?.mobile ?? (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pct = v => Math.round(v * 100) + '%';
const hz = v => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + ' кГц' : Math.round(v) + ' Гц');
const dbs = v => (v > 0 ? '+' : '') + Math.round(v) + ' дБ';
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const names = ids => ids.map(i => NAME[i].toLowerCase()).join(', ');
const fmtTime = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const fmtMin = m => `${String(m).replace('.', ',')} мин`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let state = load();
const undoStack = [];
const engine = new Engine(() => state);
const mic = new Mic(engine);
let viz, voice;
let breakSet = null, breakRumble = 0;
let humTarget = 'bass';
let taking = null;
let recording = false, recStartedAt = 0, rendering = false;
const stepQ = [], songQ = [];
const rows = {};
let playhead = -1, songAt = -1;
let bank = 0; // какой рисунок показывает секвенсор: 0 — A (основной), 1 — B, 2 — C
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
  engine.setMode(state.mode);
  breakSet = null;
  return true;
}
function commit() { engine.applyParams(); save(); render(); }

const isAllEmpty = () => TRACKS.every(t => isEmpty(state.tracks[t.id])) && !state.master.rumble;

async function ensureAudio() { await engine.init(); }
function play() { if (!engine.ctx) return; engine.start(); renderTransport(); }
function stop() {
  // В режиме трека следующий запуск начнётся с начала текущей части.
  if (state.song && state.mode === 'song' && songAt >= 0) {
    const L = locate(state.song, songAt);
    engine.songPos = L ? sectionStart(state.song, L.i) : 0;
  }
  engine.stop();
  stepQ.length = 0;
  songQ.length = 0;
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

function setSound(id, sid) {
  const tr = state.tracks[id];
  tr.sound = sid;
  tr.p = soundParams(id, sid, tr.p);
}

function applyKit(kid) {
  for (const id of LANES) setSound(id, KITS[kid].s[id]);
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

// ——— Трек целиком ———
function startSongAt(bar) {
  state.mode = 'song';
  engine.setMode('song');
  if (engine.playing) engine.seek(bar);
  else { engine.songPos = bar; engine.seekTo = null; play(); }
}

// Сочинить трек. Номер варианта (seed) определяет всё: с тем же номером получится тот же трек.
function composeSong(minutes, seed) {
  const min = clamp(minutes || state.songMin || 3, 1, 5);
  state.songMin = min;
  if (isAllEmpty()) state = genreState(state, state.genre || 'peak');
  const sd = seed || 1 + Math.floor(Math.random() * 99999);
  state.song = compose(state, min, state.genre, sd);
  for (const t of TRACKS) { state.tracks[t.id].mute = false; state.tracks[t.id].solo = false; }
  breakSet = null;
  bank = 0;
  startSongAt(0);
  const song = state.song, path = song.sections.map(x => PART[x.type].name.toLowerCase()).filter((x, i, a) => x !== a[i - 1]);
  return `Вариант №${sd} · форма «${FORMS[song.form].name}» · ${fmtTime(songBars(song) * barSec(state.bpm))}: ${path.join(' → ')}`;
}

const heroLabel = h => (h && h.id !== 'none' ? `${NAME[h.id]} · ${SHAPES[h.shape]}` : 'нет');
const stepsOf = id => (bank && state.song && state.song.alt && state.song.alt[id] && state.song.alt[id][bank - 1]) || state.tracks[id].steps;

function setMode(mode) {
  if (mode === 'song' && !state.song) return composeSong(state.songMin);
  if (mode === state.mode) return mode === 'song' ? 'Уже играю весь трек' : 'Уже играю петлю';
  if (mode === 'song') {
    startSongAt(0);
    return 'Играю весь трек по частям';
  }
  state.mode = 'loop';
  engine.setMode('loop');
  return 'Режим петли: один такт по кругу';
}

// Перейти к ближайшей части нужного типа (брейк, дроп…) в режиме трека.
function jumpTo(types) {
  const secs = state.song.sections, L = locate(state.song, Math.max(0, songAt));
  const from = L ? L.i + 1 : 0;
  let i = secs.findIndex((s, k) => k >= from && types.includes(s.type));
  if (i < 0) i = secs.findIndex(s => types.includes(s.type));
  if (i < 0) return null;
  startSongAt(sectionStart(state.song, i));
  return `Перехожу к части «${PART[secs[i].type].name}»`;
}

async function saveSongWav() {
  if (rendering) return 'Уже сохраняю трек';
  if (!state.song) return 'Сначала сочини трек — скажи «напиши трек на 3 минуты»';
  rendering = true;
  const snap = structuredClone(state), bars = songBars(snap.song), btn = $('#renderBtn'), lbl = btn.querySelector('span');
  btn.disabled = true;
  try {
    const res = await renderSong(snap, k => barData(snap, k), bars, p => { lbl.textContent = `Сохраняю… ${Math.round(p * 100)}%`; });
    const name = download(res.blob, 'pulse-track');
    toast(`Сохранил ${name} в «Загрузки»`, 'ok');
    return `Сохранил трек ${fmtTime(res.sec)} в файл ${name}`;
  } catch (e) {
    console.error(e);
    return 'Не получилось сохранить трек: ' + e.message;
  } finally {
    rendering = false;
    btn.disabled = false;
    lbl.textContent = 'Сохранить WAV';
  }
}

function download(blob, prefix) {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  const name = `${prefix}-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}.wav`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return name;
}

// ——— Выполнение действий ———
async function exec(a) {
  const T = state.tracks;
  const song = state.mode === 'song' && state.song;
  switch (a.type) {
    case 'help': openHelp(); return 'Открыл список команд';
    case 'undo': return undo() ? 'Отменил последнее изменение' : 'Отменять нечего';
    case 'reset': {
      const { bpm, key, scale } = state;
      stop();
      state = emptyState();
      Object.assign(state, { bpm, key, scale });
      engine.setMode('loop');
      breakSet = null;
      return 'Чистый лист. Скажи «сделай техно» или «добавь бочку»';
    }
    case 'genre': {
      const id = a.id || pick(GENRE_IDS.filter(g => g !== state.genre && g !== 'witch'));
      const g = GENRES[id];
      at('bar', () => { state = genreState(state, id); breakSet = null; });
      play();
      return `${g.name} · ${g.bpm} BPM${g.feel ? ` (${g.feel})` : ''} · звуки «${KITS[g.kit].name}»`;
    }
    case 'song': return composeSong(a.minutes, a.reroll ? null : a.seed);
    case 'mode': return setMode(a.mode);
    case 'seek':
      if (!state.song) return 'Трек ещё не сочинён — скажи «напиши трек»';
      startSongAt(a.bar || 0);
      return 'Играю трек с начала';
    case 'kit':
      applyKit(a.id);
      if (!engine.playing) setTimeout(() => engine.preview('kick'), 30);
      return `Набор «${KITS[a.id].name}» — ${KITS[a.id].desc}`;
    case 'sound': {
      const ids = tl(a.tracks).filter(id => SOUNDS[id]);
      const out = [];
      for (const id of ids) {
        const tr = T[id], list = Object.keys(SOUNDS[id]);
        const sid = a.name && SOUNDS[id][a.name] ? a.name : list[(list.indexOf(tr.sound) + 1) % list.length];
        setSound(id, sid);
        if (isEmpty(tr)) { setPattern(id, SOUNDS[id][sid].v || defaultVariant(id, state.genre)); tr.mute = false; play(); }
        out.push(`${NAME[id]}: звук «${SOUNDS[id][sid].name}» — ${SOUNDS[id][sid].desc}`);
      }
      if (ids.length === 1 && !engine.playing) setTimeout(() => engine.preview(ids[0]), 30);
      if (ids.length === 1) out.push(`рисунок поменяет «${NEWPAT[ids[0]]}»`);
      return out.join(' · ');
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
        setSound('bass', 'b303');
        setPattern('bass', 'acid');
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
      at('beat', () => {
        for (const t of TRACKS) {
          const tr = state.tracks[t.id];
          tr.solo = ids.includes(t.id) || (a.add && tr.solo);
        }
      });
      return a.add ? `Соло: ещё ${names(ids)}` : `Только ${names(ids)}`;
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
        if (isEmpty(T[id])) {
          if (a.dir < 0) { out.push(`${NAME[id]} и так молчит`); continue; }
          ensureTrack(id);
          out.push(`${NAME[id]} добавлен`);
          continue;
        }
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
          if (id === 'bass' && vv === 'acid' && !SOUNDS.bass[tr.sound].v) setSound('bass', 'b303');
          if (id === 'bass' && vv === '808') setSound('bass', 'b808');
          if (id === 'bass' && vv === 'deep') Object.assign(tr.p, { res: Math.min(tr.p.res, 3), env: Math.min(tr.p.env, 0.2), cutoff: Math.min(tr.p.cutoff, 300) });
          out.push(`${NAME[id]} — ${VARIANT_RU[vv] || 'новый рисунок'}`);
        } else if (wasMuted) out.push(`${NAME[id]} снова играет`);
        else out.push(`${NAME[id]} уже играет — скажи «${NEWPAT[id]}» или «${OTHER[id]}»`);
        tr.mute = false;
      }
      if (TRACKS.some(t => T[t.id].solo) && !ids.every(id => T[id] && T[id].solo)) for (const t of TRACKS) T[t.id].solo = false;
      play();
      return out.join(' · ');
    }
    case 'build':
      if (isAllEmpty()) return 'Сначала нужен бит — скажи «сделай техно»';
      if (song) return jumpTo(['rise']) || 'В треке нет подъёма';
      play();
      at('bar', t => engine.startBuild(t, 2));
      return 'Нарастание 2 такта, потом дроп';
    case 'break':
      if (song) return jumpTo(['break', 'pit']) || 'В треке нет брейка';
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
      if (song) return jumpTo(['drop']) || 'В треке нет дропа';
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
    case 'recStop': return !recording && state.song ? saveSongWav() : stopRec();
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
  const quiet = ['help', 'undo', 'play', 'stop', 'hum', 'beatbox', 'recStart', 'recStop', 'metro', 'seek'];
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
  commit();
  const msg = out.join(' · ');
  if (msg) { setDid(msg); if (src !== 'pair') log(used, msg, true); }
  return true;
}

// Действие из интерфейса (кнопки трека, звуков).
async function act(a, label) {
  await ensureAudio();
  pushUndo();
  const r = await exec(a);
  commit();
  if (r) { setDid(r); log(label, r, true); }
}

// ——— Голос → ноты ———
async function takeVoice(kind, target = 'bass') {
  if (taking) return;
  const ctl = { cancel: null };
  taking = ctl;
  let resumed = false;
  try {
    await ensureAudio();
    voice.pause(); // на телефоне микрофон нельзя делить с распознаванием речи
    try {
      await mic.ensure();
    } catch (e) {
      micDenied(e);
      toast('Нет доступа к микрофону — подробности под кнопкой микрофона', 'err');
      return;
    }
    if (state.mode === 'song') { state.mode = 'loop'; engine.setMode('loop'); renderSongCard(); }
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
    commit();
    takeResult(msg, true);
    setDid(msg);
    log(kind === 'hum' ? 'напето голосом' : 'битбокс', msg, true);
    if (MOBILE) mic.release();
    voice.resume();
    resumed = true;
  } finally {
    taking = null;
    if (!resumed) {
      if (MOBILE) mic.release();
      voice.resume();
    }
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

// ——— Запись того, что звучит ———
async function startRec() {
  if (recording) return 'Запись уже идёт';
  await ensureAudio();
  await engine.recStart();
  recording = true;
  recStartedAt = performance.now();
  play();
  renderTransport();
  return 'Запись пошла. Скажи «стоп запись», когда хватит';
}
async function stopRec() {
  if (!recording) return 'Запись не идёт. Скажи «начни запись»';
  recording = false;
  const res = await engine.recStop();
  renderTransport();
  if (!res || res.sec < 0.3) return 'Запись пустая';
  const name = download(res.blob, 'pulse');
  toast(`Сохранил ${name} в «Загрузки»`, 'ok');
  return `Сохранил ${fmtTime(res.sec)} в файл ${name}`;
}

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

// Двойные кнопки «− название +»: одна пара — оба направления.
const PAIRS = [
  { label: 'Темп', minus: 'медленнее', plus: 'быстрее', val: () => state.bpm },
  { label: 'Кислота', minus: 'меньше кислоты', plus: 'больше кислоты', val: () => Math.round(state.tracks.bass.p.res) },
  { label: 'Румбл', minus: 'меньше румбла', plus: 'больше румбла', val: () => pct(state.master.rumble) },
  { label: 'Фильтр', minus: 'закрой фильтр', plus: 'открой фильтр', val: () => (!isEmpty(state.tracks.bass) && !state.tracks.bass.mute ? hz(state.tracks.bass.p.cutoff) : state.master.cut >= 19500 ? 'открыт' : hz(state.master.cut)) },
  { label: 'Бочка', minus: 'бочка мягче', plus: 'бочка жёстче', val: () => pct(state.tracks.kick.p.drive) },
  { label: 'Хэты', minus: 'меньше хэтов', plus: 'больше хэтов', val: () => state.tracks.hat.steps.filter(Boolean).length },
  { label: 'Эхо', minus: 'меньше эха', plus: 'больше эха', val: () => pct(state.master.delay / 1.2) },
  { label: 'Реверб', minus: 'меньше реверба', plus: 'больше реверба', val: () => pct(state.master.reverb / 1.2) },
  { label: 'Свинг', minus: 'меньше свинга', plus: 'больше свинга', val: () => pct(state.swing) },
  { label: 'Громкость', minus: 'тише', plus: 'громче', val: () => dbs(state.master.vol) },
];

const EXAMPLES = [
  'сделай техно', 'сделай витч хаус', 'напиши трек на 3 минуты', 'добавь бочку', 'хэты на офбит', 'кислотный бас', 'клэп на 2 и 4',
  'бочка 808', 'набор витч хаус', 'звуки 808', 'набор эсид', 'новый бас', 'новый ритм хэтов', 'дабовые аккорды', 'нарастание', 'брейк', 'дроп',
  'напою бас', 'битбокс', 'добавь румбл', 'только бас', 'верни всё', 'сделай минимал', 'придумай мелодию', 'тональность ре минор',
  'сделай эсид', 'добавь перкуссию', 'хард-техно', 'играй весь трек', 'мрачные аккорды', 'хэты трэп', 'сочини мелодик-техно', 'другой вариант', 'сочини хард-техно',
];

const HELP = [
  ['Начать', ['сделай техно', 'сделай эсид', 'сделай витч хаус', 'сделай минимал', 'сделай даб-техно', 'сделай индастриал', 'сделай гипнотик', 'хард-техно', 'детройт', 'поехали', 'стоп', 'новый трек']],
  ['Трек целиком', ['напиши трек на 3 минуты', 'другой вариант', 'вариант 777', 'сочини витч хаус', 'сделай техно на 5 минут', 'трек на полторы минуты', 'играй весь трек', 'режим петли', 'с начала', 'брейк', 'дроп', 'сохрани']],
  ['Звуки', ['другая бочка', 'другой клэп', 'другой хэт', 'другой открытый хэт', 'другая перкуссия', 'другой бас', 'другие аккорды', 'другой синт', 'бочка 808', 'клэп 909', 'бас 303', 'звук клэпа снейр', 'набор витч хаус', 'звуки 808', 'набор эсид', 'набор индастриал']],
  ['Инструменты и рисунки', ['добавь бочку', 'ломаная бочка', 'хэты на офбит', 'частые хэты', 'хэты трэп', 'клэп на 2 и 4', 'добавь открытый хэт', 'добавь перкуссию', 'кислотный бас', 'глубокий бас', 'бас 808', 'дабовые аккорды', 'мрачные аккорды', 'придумай мелодию', 'добавь румбл', 'новый бас', 'новый ритм хэтов', 'новые аккорды']],
  ['Убрать и соло', ['убери бочку', 'верни бочку', 'только бас', 'только бочка и бас', 'соло хэт тоже', 'верни всё', 'убери всё кроме бочки', 'очисти хэты', 'больше хэтов', 'проще бас']],
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
    row.innerHTML = `<div class="rh"><span class="dot"></span><button class="nm" title="Выбрать звук"><span>${t.name}</span><small></small></button>`
      + '<button class="ms m" title="Выключить (mute)">M</button><button class="ms s" title="Соло — можно включить у нескольких">S</button>'
      + '<input class="vol" type="range" min="-30" max="8" step="1" title="Громкость дорожки"></div>'
      + `<div class="cells">${'<button class="cell"></button>'.repeat(16)}</div>`;
    grid.append(row);
    rows[t.id] = { row, cells: [...row.querySelectorAll('.cell')], m: row.querySelector('.m'), s: row.querySelector('.s'), vol: row.querySelector('.vol'), snd: row.querySelector('.nm small') };
  }

  $('#pairs').innerHTML = PAIRS.map((p, i) => `<div class="pair" data-i="${i}"><button class="pm" data-cmd="${p.minus}" aria-label="${p.minus}">−</button>`
    + `<div class="pl"><span>${p.label}</span><b></b></div><button class="pm" data-cmd="${p.plus}" aria-label="${p.plus}">+</button></div>`).join('');

  $('#kits').innerHTML = KIT_IDS.map(k => `<button class="kit" data-kit="${k}"><b>${KITS[k].name}</b><small>${KITS[k].desc}</small></button>`).join('');
  $('#voices').innerHTML = TRACKS.map(t => `<button class="vb" data-id="${t.id}" style="--c:${t.color}"><span class="dot"></span><span class="vt"><span class="vn">${t.name}</span><b></b></span><svg><use href="#i-down"/></svg></button>`).join('');

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
      renderPairs();
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
  const first = isAllEmpty() ? ['сделай техно', 'сделай витч хаус', 'напиши трек на 3 минуты'] : [];
  // «другой …» для того, что сейчас играет
  const playing = LANES.filter(id => !isEmpty(state.tracks[id])).sort(() => Math.random() - 0.5).slice(0, 3).map(id => OTHER[id]);
  const pool = [...EXAMPLES].sort(() => Math.random() - 0.5);
  const list = [...new Set([...first, ...playing, ...pool])].slice(0, 9);
  $('#chips').innerHTML = list.map(p => `<button class="chip">${p}</button>`).join('');
}

function render() {
  renderTransport();
  renderGrid();
  renderKnobs();
  renderPairs();
  renderSound();
  renderSongCard();
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
  if (!recording) $('#recBtn .lbl').textContent = 'Запись';
}

function renderGrid() {
  const anySolo = TRACKS.some(t => state.tracks[t.id].solo);
  const hasAlt = !!(state.song && state.song.alt);
  if (!hasAlt) bank = 0;
  $('#bankSeg').hidden = !hasAlt;
  document.querySelectorAll('#bankSeg button').forEach(b => b.classList.toggle('on', +b.dataset.b === bank));
  for (const t of TRACKS) {
    const tr = state.tracks[t.id], r = rows[t.id], steps = stepsOf(t.id), L = steps.length;
    r.row.classList.toggle('muted', tr.mute || (anySolo && !tr.solo));
    r.row.classList.toggle('empty', !steps.some(Boolean));
    r.m.classList.toggle('on', tr.mute);
    r.s.classList.toggle('on', tr.solo);
    r.snd.textContent = SOUNDS[t.id][tr.sound].name;
    if (document.activeElement !== r.vol) r.vol.value = tr.p.vol;
    if (t.kind === 'drum') {
      r.cells.forEach((c, i) => {
        const v = steps[i];
        c.className = 'cell' + (i >= L ? ' out' : '') + (v ? ' on' : '') + (v >= 1 ? ' acc' : '') + (v && v < 0.7 ? ' ghost' : '') + (i === playhead ? ' now' : '');
        c.textContent = '';
      });
    } else {
      r.cells.forEach((c, i) => {
        const n = steps[i], tie = !n && covered(steps, i);
        c.className = 'cell' + (i >= L ? ' out' : '') + (n ? ' on' : '') + (tie ? ' tie' : '') + (n && n.acc ? ' acc' : '') + (n && n.slide ? ' sl' : '') + (i === playhead ? ' now' : '');
        c.textContent = n ? noteName(state.key, n.n) + (n.n >= 12 ? '↑' : n.n < 0 ? '↓' : '') : '';
      });
    }
  }
  $('#emptyHint').hidden = !isAllEmpty();
  const g = state.genre && GENRES[state.genre];
  $('#genreTag').textContent = g ? g.name : '';
  $('#genreTag').hidden = !g;
  markSectionRows();
}

function renderKnobs() {
  for (const k of KNOBS) {
    const inp = k.el.querySelector('input');
    if (document.activeElement !== inp) inp.value = toPos(k, k.get());
    k.el.querySelector('output').textContent = k.fmt(k.get());
  }
}

function renderPairs() {
  document.querySelectorAll('#pairs .pair').forEach(el => { el.querySelector('b').textContent = PAIRS[+el.dataset.i].val(); });
}

function renderSound() {
  const kit = kitOf(state.tracks);
  $('#kitSub').textContent = kit ? `набор «${KITS[kit].name}»` : 'свой набор';
  document.querySelectorAll('#kits .kit').forEach(b => b.classList.toggle('on', b.dataset.kit === kit));
  document.querySelectorAll('#voices .vb').forEach(b => { b.querySelector('b').textContent = SOUNDS[b.dataset.id][state.tracks[b.dataset.id].sound].name; });
}

// ——— Трек: части, дорожки, энергия ———
const IN_ICON = { impact: '✸', crash: '◎', hit: '◉', down: '↘', fake: '✕' };
const OUT_ICON = { fill: '⋯', toms: '⁘', kickroll: '⁞', stutter: '≋', scoop: '◡', swell: '◢', delay: '⟳', wash: '≈', stop: '⏻', gap: '▢', rise: '↗' };
function renderSongCard() {
  const song = state.song, box = $('#songTl');
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === state.mode));
  $('#lenVal').textContent = fmtMin(state.songMin);
  $('#renderBtn').hidden = !song;
  $('#rerollBtn').hidden = !song;
  $('#heroBtn').hidden = !song;
  if (song) $('#heroBtn span').textContent = `Герой: ${heroLabel(song.hero)}`;
  $('#songEmpty').hidden = !!song;
  box.hidden = !song;
  if (!song) {
    $('#songSub').textContent = 'ещё не сочинён';
    box.innerHTML = '';
    return;
  }
  const total = songBars(song);
  $('#songSub').textContent = `${song.seed ? `вариант №${song.seed} · ` : ''}«${(FORMS[song.form] || {}).name || 'своя форма'}» · ${fmtTime(total * barSec(state.bpm))} · ${total} ${plural(total, 'такт', 'такта', 'тактов')}`;
  const cols = `var(--lw) ${song.sections.map(s => `minmax(38px, ${s.bars}fr)`).join(' ')}`;
  let h = `<div class="tl" style="grid-template-columns:${cols}"><div class="corner"><svg class="energy-lbl"><use href="#i-bolt"/></svg></div>`
    + `<div class="en" style="grid-column:2/-1"><svg id="energy" preserveAspectRatio="none"></svg></div><span></span>`;
  song.sections.forEach((s, i) => {
    const P = PART[s.type];
    const ic = (s.in && s.in !== 'none' ? `<i title="Вход: ${INS[s.in]}">${IN_ICON[s.in] || '•'}</i>` : '')
      + (s.head && s.head !== 'none' ? `<i title="Начало: ${HEADS[s.head]}">${s.head === 'scoop' ? '◡' : '·'}</i>` : '')
      + (s.out && s.out !== 'none' ? `<i title="Конец: ${OUTS[s.out]}">${OUT_ICON[s.out] || '•'}</i>` : '');
    h += `<button class="sec" data-i="${i}" style="--c:${P.color}" title="${P.hint}"><b>${P.name}</b><small>${s.bars} т.</small><span class="ic">${ic}</span></button>`;
  });
  for (const id of LANES) {
    const t = TRACK[id], emptyT = isEmpty(state.tracks[id]);
    h += `<span class="ln${emptyT ? ' empty' : ''}" style="--c:${t.color}">${SHORT[id]}</span>`;
    song.sections.forEach((s, i) => {
      const l = s.lv[id] || 0, pi = (s.pat && s.pat[id]) || 0, en = (s.enter && s.enter[id]) || 0;
      h += `<button class="lc l${l}${emptyT ? ' empty' : ''}${l && en ? ' late' : ''}" data-i="${i}" data-id="${id}" style="--c:${t.color}${en ? `;--e:${en * 100}%` : ''}" aria-label="${NAME[id]}, ${PART[s.type].name}">${l && pi ? 'ABC'[pi] : ''}</button>`;
    });
  }
  h += '<div class="sph" id="sph" hidden></div></div>';
  box.innerHTML = h;
  requestAnimationFrame(drawEnergy);
  if (popState && popState.kind === 'sec') reopenSecPop();
}

function drawEnergy() {
  const svg = $('#energy'), song = state.song;
  if (!svg || !song) return;
  const secs = [...document.querySelectorAll('#songTl .sec')], en = svg.parentElement;
  const W = en.clientWidth, H = en.clientHeight, x0 = en.offsetLeft;
  if (!W || !secs.length) return;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const y = v => H - 3 - v * (H - 6);
  let d = '';
  song.sections.forEach((s, i) => {
    const el = secs[i], a = el.offsetLeft - x0, b = a + el.offsetWidth, [e0, e1] = energy(state, s);
    d += `${i ? 'L' : 'M'}${a.toFixed(1)},${y(e0).toFixed(1)} L${b.toFixed(1)},${y(e1).toFixed(1)} `;
  });
  svg.innerHTML = '<defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4ff3a" stop-opacity=".35"/><stop offset="1" stop-color="#d4ff3a" stop-opacity="0"/></linearGradient></defs>'
    + `<path d="${d} L${W},${H} L0,${H} Z" fill="url(#eg)"/><path d="${d}" fill="none" stroke="#d4ff3a" stroke-width="1.6" stroke-linejoin="round"/>`;
}

function markSectionRows() {
  const L = state.mode === 'song' && state.song && engine.playing && songAt >= 0 ? locate(state.song, songAt) : null;
  for (const t of TRACKS) rows[t.id].row.classList.toggle('secoff', !!L && !L.s.lv[t.id]);
  document.querySelectorAll('#songTl .sec').forEach((el, i) => el.classList.toggle('cur', !!L && L.i === i));
}

function moveSongHead() {
  const ph = $('#sph');
  if (!ph) return;
  if (!(state.mode === 'song' && state.song && engine.playing && songAt >= 0)) { ph.hidden = true; return; }
  const L = locate(state.song, songAt);
  const el = L && document.querySelector(`#songTl .sec[data-i="${L.i}"]`);
  if (!el) { ph.hidden = true; return; }
  ph.hidden = false;
  const frac = (L.j + Math.max(0, playhead) / 16) / L.s.bars;
  ph.style.transform = `translateX(${(el.offsetLeft + el.offsetWidth * frac).toFixed(1)}px)`;
}

// ——— Всплывающие окошки (не закрывают экран) ———
let popEl = null, popState = null;
function closePop() {
  if (popEl) popEl.remove();
  popEl = null;
  popState = null;
}
function openPop(anchor, html, cls, st) {
  closePop();
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.innerHTML = html;
  document.body.append(el);
  popEl = el;
  popState = st;
  placePop(anchor);
  return el;
}
function placePop(anchor) {
  const el = popEl, r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  let x = r.left + r.width / 2 - w / 2;
  x = clamp(x, 8, vw - w - 8);
  let y = r.bottom + 8;
  if (y + h > vh - 8 && r.top - h - 8 > 8) y = r.top - h - 8;
  y = clamp(y, 8, Math.max(8, vh - h - 8));
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

// Долгое нажатие (на телефоне) или правая кнопка мыши.
function onHold(root, selector, fn) {
  let fired = false;
  root.addEventListener('pointerdown', e => {
    fired = false;
    const el = e.target.closest(selector);
    if (!el || e.button > 0) return;
    const x = e.clientX, y = e.clientY;
    const timer = setTimeout(() => { fired = true; navigator.vibrate?.(12); fn(el); }, 420);
    const off = () => { clearTimeout(timer); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', off); window.removeEventListener('pointercancel', off); };
    const move = ev => { if (Math.hypot(ev.clientX - x, ev.clientY - y) > 10) off(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', off);
    window.addEventListener('pointercancel', off);
  });
  root.addEventListener('contextmenu', e => {
    const el = e.target.closest(selector);
    if (!el) return;
    e.preventDefault();
    if (!fired) fn(el);
  });
  root.addEventListener('click', e => {
    if (fired && e.target.closest(selector)) { e.stopImmediatePropagation(); e.preventDefault(); fired = false; }
  }, true);
}

// Окошко выбора ноты: три октавы лада, акцент, глайд, длина.
function openNotePop(cell, id, i) {
  const html = noteHtml(id, i);
  openPop(cell, html, 'notepop', { kind: 'note', id, i, cell });
}
function noteHtml(id, i) {
  const n = stepsOf(id)[i], cur = n ? n.n : null, sc = state.scale;
  const ranges = [[7, '↑'], [0, ''], [-7, '↓']];
  let h = `<div class="ph"><b>${NAME[id]}</b><span>шаг ${i + 1}</span><button class="px" data-a="close" aria-label="Закрыть">×</button></div><div class="notes">`;
  for (const [d0, lab] of ranges) {
    h += `<span class="oct">${lab}</span>`;
    for (let d = d0; d < d0 + 7; d++) {
      const semis = deg(sc, d);
      if (semis > 24 || semis < -12) { h += '<span></span>'; continue; }
      h += `<button class="nt${semis === cur ? ' on' : ''}${d % 7 === 0 ? ' root' : ''}" data-a="note" data-n="${semis}">${noteName(state.key, semis)}</button>`;
    }
  }
  h += '</div><div class="pfoot">';
  h += `<button class="tg${n && n.acc ? ' on' : ''}" data-a="acc">Акцент</button>`;
  if (id === 'bass') h += `<button class="tg${n && n.slide ? ' on' : ''}" data-a="slide">Глайд</button>`;
  h += `<span class="lenl">Длина</span>${[1, 2, 4, 8].map(L => `<button class="tg lb${n && (n.len || 1) === L ? ' on' : ''}" data-a="len" data-v="${L}">${L}</button>`).join('')}`;
  h += `<button class="tg del" data-a="del"${n ? '' : ' disabled'}>Убрать</button></div>`;
  return h;
}
function noteAction(btn) {
  const { id, i } = popState, tr = state.tracks[id], a = btn.dataset.a, steps = stepsOf(id);
  if (a === 'close') { closePop(); return; }
  pushUndo();
  let n = steps[i];
  const make = () => { if (!n) { n = steps[i] = { n: 0, len: 1 }; } return n; };
  if (a === 'note') {
    make().n = +btn.dataset.n;
    tr.mute = false;
    ensureAudio().then(() => engine.preview(id, n.n));
    closePop();
  } else if (a === 'acc') make().acc = !n.acc;
  else if (a === 'slide') make().slide = !n.slide;
  else if (a === 'len') {
    const L = Math.min(+btn.dataset.v, steps.length - i);
    make().len = L;
    for (let k = i + 1; k < i + L; k++) steps[k] = null;
  } else if (a === 'del') { steps[i] = null; closePop(); }
  save();
  renderGrid();
  if (popEl && popState && popState.kind === 'note') { popEl.innerHTML = noteHtml(id, i); }
}

// Окошко выбора звука дорожки.
function openSoundPop(anchor, id) {
  openPop(anchor, soundHtml(id), 'sndpop', { kind: 'sound', id });
}
function soundHtml(id) {
  const cur = state.tracks[id].sound;
  return `<div class="ph"><b>${NAME[id]}</b><span>нажми — послушать и выбрать</span><button class="px" data-a="close" aria-label="Закрыть">×</button></div><div class="snds">`
    + Object.entries(SOUNDS[id]).map(([sid, S]) => `<button class="snd${sid === cur ? ' on' : ''}" data-s="${sid}"><b>${S.name}</b><small>${S.desc}</small></button>`).join('')
    + `</div><div class="pfoot"><button class="tg" data-a="pat">${NEWPAT[id][0].toUpperCase() + NEWPAT[id].slice(1)}</button></div>`;
}
async function soundAction(btn) {
  const { id } = popState;
  if (btn.dataset.a === 'close') { closePop(); return; }
  await ensureAudio();
  if (btn.dataset.a === 'pat') { closePop(); runText(NEWPAT[id], 'chip'); return; }
  const sid = btn.dataset.s;
  pushUndo();
  setSound(id, sid);
  if (isEmpty(state.tracks[id])) setPattern(id, SOUNDS[id][sid].v || defaultVariant(id, state.genre));
  state.tracks[id].mute = false;
  commit();
  engine.preview(id);
  setDid(`${NAME[id]}: звук «${SOUNDS[id][sid].name}»`);
  if (popEl) popEl.innerHTML = soundHtml(id);
}

// Окошко части трека.
function openSecPop(i) {
  const el = document.querySelector(`#songTl .sec[data-i="${i}"]`);
  if (!el) return;
  openPop(el, secHtml(i), 'secpop', { kind: 'sec', i });
}
function reopenSecPop() {
  const { i } = popState;
  const el = document.querySelector(`#songTl .sec[data-i="${i}"]`);
  if (!el || !state.song.sections[i]) { closePop(); return; }
  popEl.innerHTML = secHtml(i);
  placePop(el);
}
function secHtml(i) {
  const s = state.song.sections[i], n = state.song.sections.length;
  const opt = (act, dict, cur) => Object.entries(dict).map(([k, v]) => `<button class="tg${k === cur ? ' on' : ''}" data-a="${act}" data-v="${k}">${typeof v === 'string' ? v : v.name}</button>`).join('');
  return `<div class="ph"><b style="color:${PART[s.type].color}">${PART[s.type].name}</b><span>${s.bars} ${plural(s.bars, 'такт', 'такта', 'тактов')} · ${fmtTime(s.bars * barSec(state.bpm))}</span><button class="px" data-a="close" aria-label="Закрыть">×</button></div>`
    + `<div class="prow"><span>Часть</span><div class="opts">${opt('type', PART, s.type)}</div></div>`
    + `<div class="prow"><span>Длина</span><div class="opts"><button class="tg" data-a="len" data-v="-4">−4</button><button class="tg" data-a="len" data-v="-1">−1</button><b class="bars">${s.bars}</b><button class="tg" data-a="len" data-v="1">+1</button><button class="tg" data-a="len" data-v="4">+4</button></div></div>`
    + `<div class="prow"><span>Вход</span><div class="opts">${opt('in', INS, s.in)}</div></div>`
    + `<div class="prow"><span>Начало</span><div class="opts">${opt('head', HEADS, s.head || 'none')}</div></div>`
    + `<div class="prow"><span>Конец</span><div class="opts">${opt('out', OUTS, s.out)}</div></div>`
    + `<div class="prow"><span>Фильтр</span><div class="opts">${opt('filter', FILTERS, s.filter)}</div></div>`
    + `<div class="prow"><span>Гармония</span><div class="opts">${opt('prog', PROGS, s.prog)}</div></div>`
    + `<div class="pfoot"><button class="tg lime" data-a="play">▶ Играть отсюда</button><button class="tg" data-a="left"${i ? '' : ' disabled'}>←</button><button class="tg" data-a="right"${i < n - 1 ? '' : ' disabled'}>→</button>`
    + `<button class="tg" data-a="reroll">🎲 Пересочинить часть</button><button class="tg" data-a="dup">Копия</button><button class="tg del" data-a="del"${n > 1 ? '' : ' disabled'}>Удалить</button></div>`;
}
function secAction(btn) {
  const a = btn.dataset.a, v = btn.dataset.v, secs = state.song.sections;
  let { i } = popState;
  if (a === 'close') { closePop(); return; }
  if (a === 'play') { ensureAudio().then(() => { startSongAt(sectionStart(state.song, i)); commit(); setDid(`Играю с части «${PART[secs[i].type].name}»`); }); closePop(); return; }
  pushUndo();
  const s = secs[i];
  if (a === 'type') s.type = v;
  else if (a === 'len') s.bars = clamp(s.bars + +v, 1, 64);
  else if (a === 'in') s.in = v;
  else if (a === 'out') s.out = v;
  else if (a === 'filter') s.filter = v;
  else if (a === 'prog') s.prog = v;
  else if (a === 'head') s.head = v;
  else if (a === 'reroll') { rerollSection(state, i); setDid(`Часть «${PART[s.type].name}» пересочинена`); }
  else if (a === 'left' && i > 0) { [secs[i - 1], secs[i]] = [secs[i], secs[i - 1]]; i--; }
  else if (a === 'right' && i < secs.length - 1) { [secs[i + 1], secs[i]] = [secs[i], secs[i + 1]]; i++; }
  else if (a === 'dup') { secs.splice(i + 1, 0, structuredClone(s)); i++; }
  else if (a === 'del' && secs.length > 1) { secs.splice(i, 1); closePop(); save(); render(); return; }
  popState.i = i;
  save();
  render();
}

// Окошко уровня дорожки в части (долгое нажатие на клетку трека).
const LVL = ['Выкл', 'Легко', 'Полностью', 'Плотно'];
const ENTER = [[0, 'Сразу'], [0.25, 'С ¼'], [0.5, 'С середины'], [0.75, 'С ¾']];
function openLevelPop(cell) {
  const i = +cell.dataset.i, id = cell.dataset.id;
  openPop(cell, levelHtml(i, id), 'lvlpop', { kind: 'lvl', i, id });
}
function levelHtml(i, id) {
  const s = state.song.sections[i], cur = s.lv[id] || 0, pi = (s.pat && s.pat[id]) || 0, en = (s.enter && s.enter[id]) || 0;
  const alt = state.song.alt && state.song.alt[id];
  const btn = (a, v, label, on) => `<button class="tg${on ? ' on' : ''}" data-a="${a}" data-v="${v}">${label}</button>`;
  return `<div class="ph"><b>${NAME[id]}</b><span>${PART[s.type].name} · ${s.bars} т.</span><button class="px" data-a="close" aria-label="Закрыть">×</button></div>`
    + `<div class="prow"><span>Громкость</span><div class="opts">${LVL.map((l, k) => btn('lv', k, l, k === cur)).join('')}</div></div>`
    + (alt ? `<div class="prow"><span>Рисунок</span><div class="opts">${['A', 'B', 'C'].map((l, k) => btn('pat', k, l + (k && alt[k - 1].length !== 16 ? ` (${alt[k - 1].length})` : ''), k === pi)).join('')}</div></div>` : '')
    + `<div class="prow"><span>Вступает</span><div class="opts">${ENTER.map(([v, l]) => btn('enter', v, l, v === en)).join('')}</div></div>`;
}

// Окошко «главного героя»: какой инструмент разгорается через весь трек и как.
function openHeroPop(anchor) {
  openPop(anchor, heroHtml(), 'heropop', { kind: 'hero' });
}
function heroHtml() {
  const h = state.song.hero || { id: 'none', shape: 'arc' };
  const btn = (a, v, label, on) => `<button class="tg${on ? ' on' : ''}" data-a="${a}" data-v="${v}">${label}</button>`;
  return `<div class="ph"><b>Главный герой</b><span>разгорается и затухает через весь трек</span><button class="px" data-a="close" aria-label="Закрыть">×</button></div>`
    + `<div class="prow"><span>Кто</span><div class="opts">${btn('id', 'none', 'Нет', h.id === 'none')}${LANES.map(id => btn('id', id, NAME[id], h.id === id)).join('')}</div></div>`
    + `<div class="prow"><span>Как</span><div class="opts">${Object.entries(SHAPES).map(([k, v]) => btn('shape', k, v, h.shape === k)).join('')}</div></div>`;
}

// ——— Мелочи интерфейса ———
function setPlayhead(s) {
  if (s === playhead) return;
  for (const t of TRACKS) {
    const r = rows[t.id];
    if (playhead >= 0) r.cells[playhead].classList.remove('now');
    if (s >= 0) {
      const c = r.cells[s];
      c.classList.add('now');
      if (c.classList.contains('on') && !r.row.classList.contains('muted') && !r.row.classList.contains('secoff')) c.animate([{ filter: 'brightness(1.9)', transform: 'scale(1.08)' }, { filter: 'brightness(1)', transform: 'scale(1)' }], 220);
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

// ——— Микрофон и распознавание речи ———
const VSTATUS = {
  off: 'Нажми на микрофон и скажи, что сыграть',
  listening: 'Слушаю… говори команды',
  paused: 'Записываю голос — команды на паузе',
  retry: 'Нет связи с распознаванием (нужен интернет). Пробую снова…',
};
function vStatus(text, warn = false) {
  const el = $('#vStatus');
  el.textContent = text;
  el.classList.toggle('warn', warn);
}
function setVoiceState(s) {
  $('#micBtn').classList.toggle('on', voice.want);
  $('#micBtn').classList.toggle('retry', s === 'retry');
  vStatus(VSTATUS[s] || VSTATUS.off);
  if (!voice.want) $('#micBtn').style.setProperty('--lvl', 0);
}
const HOW_ALLOW = MOBILE
  ? 'Нажми на значок слева от адреса сайта → «Разрешения» → «Микрофон» → «Разрешить» и снова нажми на микрофон'
  : 'Нажми на значок слева от адреса сайта → «Микрофон» → «Разрешить» и снова нажми на микрофон';
function micDenied(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') vStatus('Микрофон запрещён для этого сайта. ' + HOW_ALLOW, true);
  else if (n === 'NotFoundError' || n === 'OverconstrainedError') vStatus('Микрофон не найден — проверь, что он подключён', true);
  else if (n === 'NotReadableError') vStatus('Микрофон занят другой программой (звонок, запись). Закрой её и нажми ещё раз', true);
  else vStatus('Не получилось включить микрофон: ' + ((e && e.message) || n || 'неизвестная ошибка'), true);
}
function voiceError(err) {
  if (err === 'not-allowed' || err === 'service-not-allowed') {
    if (voice.want) { vStatus('Запускаю распознавание ещё раз…'); return; }
    vStatus(`Распознавание речи не запустилось. ${MOBILE ? 'Открой сайт в Google Chrome' : 'Нужен Google Chrome'} и интернет. Команды можно нажимать и писать ниже`, true);
  } else if (err === 'audio-capture') vStatus('Микрофон не найден или занят — проверь его и нажми ещё раз', true);
  else if (err === 'network') vStatus(VSTATUS.retry);
  $('#micBtn').classList.toggle('on', voice.want);
  $('#micBtn').classList.toggle('retry', voice.want && err === 'network');
}
async function micClick() {
  await ensureAudio();
  if (!voice.supported) {
    vStatus('Голосовые команды работают в Google Chrome. Здесь можно писать команды в поле ниже', true);
    $('#typeIn').focus();
    return;
  }
  if (voice.want) { voice.stop(); return; }
  if (!window.isSecureContext) { vStatus('Микрофон работает только по защищённой ссылке (https://…) или на этом компьютере', true); return; }
  // Сначала одно разрешение на микрофон, потом распознавание — так браузер не путается в двух запросах сразу.
  vStatus('Включаю микрофон…');
  try {
    await mic.ensure();
  } catch (e) {
    micDenied(e);
    return;
  }
  if (MOBILE) mic.release();
  voice.start();
  setVoiceState('listening');
}

function openHelp() { const d = $('#helpDlg'); if (!d.open) d.showModal(); }

function bind() {
  $('#micBtn').addEventListener('click', micClick);

  $('#typeForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#typeIn').value.trim();
    if (!v) return;
    $('#typeIn').value = '';
    runText(v, 'text');
  });

  document.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) {
      if (chip.closest('#helpDlg')) $('#helpDlg').close();
      runText(chip.textContent, 'chip').then(() => { if (chip.closest('#chips')) refreshChips(); });
      return;
    }
    const pm = e.target.closest('.pm');
    if (pm) { runText(pm.dataset.cmd, 'pair'); return; }
  });

  // Окошки: клики внутри и закрытие снаружи
  document.addEventListener('click', e => {
    if (!popEl || !popEl.contains(e.target)) return;
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.a === 'close') { closePop(); return; }
    if (popState.kind === 'note') noteAction(b);
    else if (popState.kind === 'sound') soundAction(b);
    else if (popState.kind === 'sec') secAction(b);
    else if (popState.kind === 'lvl') {
      pushUndo();
      const sec = state.song.sections[popState.i], id = popState.id, v = +b.dataset.v;
      if (b.dataset.a === 'lv') sec.lv[id] = v;
      else if (b.dataset.a === 'pat') { sec.pat = sec.pat || {}; if (v) sec.pat[id] = v; else delete sec.pat[id]; }
      else if (b.dataset.a === 'enter') { sec.enter = sec.enter || {}; if (v) sec.enter[id] = v; else delete sec.enter[id]; }
      save();
      renderSongCard();
      const cell = document.querySelector(`#songTl .lc[data-i="${popState.i}"][data-id="${id}"]`);
      popEl.innerHTML = levelHtml(popState.i, id);
      if (cell) placePop(cell);
    } else if (popState.kind === 'hero') {
      pushUndo();
      const h = state.song.hero = state.song.hero || { id: 'none', shape: 'arc' };
      h[b.dataset.a] = b.dataset.v;
      save();
      renderSongCard();
      popEl.innerHTML = heroHtml();
    }
  });
  document.addEventListener('pointerdown', e => {
    if (popEl && !popEl.contains(e.target) && !e.target.closest?.('.sec, .nm, .vb, #heroBtn')) closePop();
  }, true);
  window.addEventListener('resize', () => { closePop(); drawEnergy(); });
  document.addEventListener('scroll', e => { if (popEl && !popEl.contains(e.target)) closePop(); }, true);

  $('#playBtn').addEventListener('click', async () => {
    await ensureAudio();
    if (engine.playing) stop(); else play();
  });
  document.querySelectorAll('[data-bpm]').forEach(b => b.addEventListener('click', () => {
    state.bpm = clamp(state.bpm + +b.dataset.bpm, 60, 200);
    engine.applyParams(); save(); renderTransport(); renderPairs(); renderSongCard();
  }));
  $('.bpm').addEventListener('wheel', e => {
    e.preventDefault();
    state.bpm = clamp(state.bpm + (e.deltaY < 0 ? 1 : -1), 60, 200);
    engine.applyParams(); save(); renderTransport(); renderPairs();
  }, { passive: false });
  $('#keySel').addEventListener('change', e => { pushUndo(); state.key = +e.target.value; save(); render(); });
  $('#scaleSel').addEventListener('change', e => { pushUndo(); state.scale = e.target.value; save(); render(); });
  $('#undoBtn').addEventListener('click', () => { if (undo()) { commit(); setDid('Отменил последнее изменение'); } });
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

  // Звуки: наборы и тембр каждого инструмента
  $('#kits').addEventListener('click', e => {
    const b = e.target.closest('.kit');
    if (b) act({ type: 'kit', id: b.dataset.kit }, `набор ${KITS[b.dataset.kit].name}`);
  });
  $('#voices').addEventListener('click', async e => {
    const b = e.target.closest('.vb');
    if (!b) return;
    if (popState && popState.kind === 'sound' && popState.id === b.dataset.id) { closePop(); return; }
    await ensureAudio();
    openSoundPop(b, b.dataset.id);
  });

  // Секвенсор
  $('#grid').addEventListener('click', async e => {
    const row = e.target.closest('.row');
    if (!row) return;
    const id = row.dataset.id, tr = state.tracks[id];
    await ensureAudio();
    if (e.target.closest('.nm')) {
      const nm = e.target.closest('.nm');
      if (popState && popState.kind === 'sound' && popState.id === id) closePop(); else openSoundPop(nm, id);
      return;
    }
    if (e.target.closest('.m')) { tr.mute = !tr.mute; if (id === 'bass' && tr.mute) engine.releaseBass(); }
    else if (e.target.closest('.s')) tr.solo = !tr.solo; // соло можно включить у нескольких дорожек
    else if (e.target.closest('.cell')) {
      const i = rows[id].cells.indexOf(e.target.closest('.cell')), steps = stepsOf(id);
      if (i >= steps.length) return; // за пределами полиметрической фразы
      pushUndo();
      if (TRACK[id].kind === 'drum') {
        const v = steps[i];
        steps[i] = !v ? 0.85 : v < 1 ? 1 : 0;
      } else {
        const n = steps[i];
        if (n && e.shiftKey) n.acc = !n.acc;
        else if (n && e.altKey) n.slide = !n.slide;
        else if (n) steps[i] = null;
        else if (covered(steps, i)) {
          for (let j = i - 1; j >= 0; j--) if (steps[j]) { steps[j].len = i - j; break; }
        } else steps[i] = { n: 0, len: 1 };
      }
      tr.mute = false;
      if (!engine.playing && steps.some(Boolean)) play();
    } else return;
    commit();
  });
  onHold($('#grid'), '.cell', cell => {
    const row = cell.closest('.row'), id = row.dataset.id;
    const i = rows[id].cells.indexOf(cell);
    if (TRACK[id].kind === 'drum' || i >= stepsOf(id).length) return;
    ensureAudio();
    openNotePop(cell, id, i);
  });
  $('#grid').addEventListener('wheel', e => {
    const cell = e.target.closest('.cell'), row = e.target.closest('.row');
    if (!cell || !row || TRACK[row.dataset.id].kind === 'drum') return;
    const n = stepsOf(row.dataset.id)[rows[row.dataset.id].cells.indexOf(cell)];
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

  // Трек: режим, длина, сочинить, сохранить, части и дорожки
  $('#modeSeg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) act({ type: 'mode', mode: b.dataset.m }, b.dataset.m === 'song' ? 'весь трек' : 'петля');
  });
  $('#lenSeg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const k = LENS.findIndex(x => x >= state.songMin);
    state.songMin = LENS[clamp((k < 0 ? LENS.length - 1 : k) + +b.dataset.d, 0, LENS.length - 1)];
    save();
    renderSongCard();
  });
  $('#rerollBtn').addEventListener('click', () => act({ type: 'song', minutes: state.songMin, reroll: true }, 'другой вариант трека'));
  $('#heroBtn').addEventListener('click', e => {
    if (popState && popState.kind === 'hero') { closePop(); return; }
    openHeroPop(e.currentTarget);
  });
  $('#bankSeg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    bank = +b.dataset.b;
    closePop();
    renderGrid();
    setDid(bank ? `Секвенсор показывает рисунок ${'ABC'[bank]} — его тоже можно править` : 'Секвенсор показывает основной рисунок A');
  });
  $('#writeBtn').addEventListener('click', () => act({ type: 'song', minutes: state.songMin }, `сочини трек на ${fmtMin(state.songMin)}`));
  $('#renderBtn').addEventListener('click', async () => { const r = await saveSongWav(); setDid(r); log('сохрани трек', r, true); });
  $('#songTl').addEventListener('click', e => {
    const sec = e.target.closest('.sec');
    if (sec) {
      if (popState && popState.kind === 'sec' && popState.i === +sec.dataset.i) closePop(); else openSecPop(+sec.dataset.i);
      return;
    }
    const lc = e.target.closest('.lc');
    if (lc) {
      pushUndo();
      const s = state.song.sections[+lc.dataset.i];
      s.lv[lc.dataset.id] = s.lv[lc.dataset.id] ? 0 : 2;
      save();
      renderSongCard();
    }
  });
  onHold($('#songTl'), '.lc', openLevelPop);
  new ResizeObserver(() => drawEnergy()).observe($('#songTl'));

  document.addEventListener('keydown', e => {
    if (e.target.closest?.('input, select, textarea')) return;
    if (e.key === 'Escape' && popEl) { closePop(); return; }
    if (e.code === 'Space') {
      e.preventDefault();
      ensureAudio().then(() => (engine.playing ? stop() : play()));
    } else if (e.key === 'Escape' && taking && taking.cancel) taking.cancel();
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { if (undo()) commit(); }
  });
}

let lastSongAt = -2;
function frame() {
  viz.draw();
  if (engine.ctx && engine.playing) {
    const ct = engine.ctx.currentTime;
    let s = null;
    while (stepQ.length && stepQ[0][0] <= ct) s = stepQ.shift()[1];
    if (s != null) setPlayhead(s);
    while (songQ.length && songQ[0][0] <= ct) songAt = songQ.shift()[1];
  } else songAt = -1;
  if (songAt !== lastSongAt) { lastSongAt = songAt; markSectionRows(); }
  moveSongHead();
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
  if (!voice.supported) vStatus('Голосовые команды работают в Google Chrome. Здесь можно писать команды в поле ниже');
  navigator.permissions?.query({ name: 'microphone' }).then(p => {
    if (p.state === 'denied') vStatus('Микрофон для этого сайта запрещён. ' + HOW_ALLOW, true);
  }).catch(() => {});
  engine.barFn = k => barData(state, k);
  engine.setMode(state.mode);
  engine.onStep = (s, t) => { stepQ.push([t, s]); if (stepQ.length > 64) stepQ.shift(); };
  engine.onSongBar = (bar, t) => { songQ.push([t, bar]); if (songQ.length > 16) songQ.shift(); };
  engine.onSongEnd = t => {
    setTimeout(() => {
      if (!engine.ended || state.mode !== 'song') return;
      stop();
      engine.songPos = 0;
      setDid('Трек закончился. Нажми «Играть», чтобы послушать снова');
    }, Math.max(0, (t - engine.ctx.currentTime) * 1000) + 2600);
  };
  engine.onBuildEnd = t => { doDrop(t); commit(); setDid('Дроп!'); };
  viz = new Viz($('#viz'), engine, () => state);
  engine.onKick = t => viz.kick(t);
  bind();
  render();
  requestAnimationFrame(frame);
  window.pulse = { engine, mic, voice, run: runText, get state() { return state; } }; // для отладки из консоли
}

init();
