// Звуки из FL Studio — только когда «Пульс» запущен на этом компьютере.
// tools/fl_import.py складывает их в local/fl (на GitHub и сайт эта папка не попадает), здесь — каталог и подбор.
import { SOUNDS } from './sounds.js?v=5';

export const FL = { ready: false, items: [], byId: new Map(), cats: {}, inst: {}, instGain: {} };
let initP = null;
export function flInit() {
  // Звуки FL есть только у «Пульса», запущенного на компьютере, — на сайте их не ищем
  if (!initP && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) initP = Promise.resolve(false);
  if (!initP) {
    initP = fetch('local/fl/index.json').then(r => (r.ok ? r.json() : null)).then(d => {
      if (d && Array.isArray(d.items) && d.items.length) {
        FL.items = d.items;
        FL.byId = new Map(d.items.map(i => [i.id, i]));
        FL.cats = d.cats || {};
        FL.ready = true;
      }
      return FL.ready;
    }).then(async ok => {
      // Записанные инструменты FL (рояль, Rhodes, струнные, хор...) — для аккордов и мелодии
      if (ok) try {
        const inst = await fetch('local/fl/inst.json').then(r => (r.ok ? r.json() : {}));
        FL.instGain = inst._gain || {};
        for (const [k, v] of Object.entries(inst)) if (k !== '_gain' && !SKIP_INST.has(k) && v.length >= 4) FL.inst[k] = v;
        registerSamplers();
      } catch { /* инструментов нет */ }
      return ok;
    }).catch(() => false);
  }
  return initP;
}
export const flUrl = id => { const it = FL.byId.get(id); return it ? 'local/fl/' + it.file : null; };

// ——— Сэмплер: инструменты FL как звуки аккордов и мелодии ———
const SKIP_INST = new Set(['chord', 'Percs']); // там записаны готовые аккорды и удары, а не ноты
const SUSTAIN = /string|pad|choir|brass|woodwind|sax|trombone/i; // тянутся — для пэдов
const RU_INST = { 'Close Grand': 'Рояль близко', 'Stage Grand': 'Рояль на сцене', Grand: 'Рояль', 'Piano 1': 'Пиано 1', 'Piano 2': 'Пиано 2',
  Rhodes: 'Rhodes', Strings: 'Струнные', 'Strings Section': 'Струнная группа', 'Strings Solo': 'Скрипка соло', Pads: 'Пэды FL', Choirs: 'Хор',
  'Brass Section': 'Медь', 'Woodwind Section': 'Деревянные духовые', 'Tenor Sax': 'Тенор-сакс', Trombone: 'Тромбон', pluck: 'Плак FL', synth: 'Синт FL',
  lead: 'Лид FL', pad: 'Пэд FL', 'Electric Guitar 01': 'Электрогитара', Jazz: 'Джаз-гитара', Sauce: 'Sauce' };
export const instName = k => RU_INST[k] || k;
function registerSamplers() {
  for (const k of Object.keys(FL.inst)) {
    const long = SUSTAIN.test(k);
    for (const id of ['stab', 'lead']) {
      const base = SOUNDS[id][id === 'stab' ? (long ? 'spad' : 'skeys') : 'lsine'].p;
      SOUNDS[id]['fli:' + k] = {
        name: instName(k), desc: 'записанный инструмент · FL Studio', fl: true, sampler: true, v: id === 'stab' && long ? 'pad' : undefined,
        p: { ...base, sampler: k, attack: long ? 0.12 : 0.003, rel: long ? 0.6 : 0.35, cutoff: 9000, gain: 1, ...(id === 'stab' && long ? { hold: 99 } : {}) },
      };
    }
  }
}
// Инструменты под жанр (для новых вариантов трека)
const GENRE_INST = {
  stab: { house: ['Piano 1', 'Rhodes', 'Grand', 'Stage Grand', 'Piano 2'], detroit: ['Rhodes', 'Strings Section', 'Brass Section', 'Piano 2'],
    melodic: ['Strings', 'Pads', 'Choirs', 'Piano 1'], dub: ['Rhodes', 'Pads', 'Piano 2'], witch: ['Choirs', 'Pads', 'Strings'], minimal: ['Rhodes', 'pluck', 'Piano 2'],
    hypnotic: ['Pads', 'Strings'], acid: ['synth', 'pluck'], industrial: ['Brass Section', 'Strings'], hard: ['Strings', 'Brass Section', 'synth'], peak: ['Pads', 'Strings', 'synth', 'Rhodes'] },
  lead: { house: ['Piano 1', 'Tenor Sax', 'Rhodes'], detroit: ['Strings Solo', 'Trombone', 'Rhodes'], melodic: ['Strings Solo', 'Piano 1', 'Woodwind Section', 'pluck'],
    witch: ['Choirs', 'Strings Solo'], dub: ['Rhodes', 'Piano 2'], peak: ['pluck', 'lead', 'synth', 'Strings Solo'] },
};
export function flInstFor(id, genre) {
  const list = (GENRE_INST[id] && (GENRE_INST[id][genre] || GENRE_INST[id].peak)) || [];
  return list.filter(k => FL.inst[k]).map(k => 'fli:' + k);
}
// Все записи инструмента (чтобы заранее загрузить)
export const instIds = k => (FL.inst[k] || []).map(n => n[0]);

// Какие звуки FL подходят дорожке
const TRACK_CATS = { kick: ['kick'], clap: ['clap'], hat: ['hat'], ohat: ['ohat'], perc: ['perc'] };
export const FL_TRACKS = Object.keys(TRACK_CATS);
const STOCK = new Set(['FL', 'ModeAudio', 'Legacy']);
// В витч-хаусе и трэпе — скачанные наборы (там 808 и трэп-звуки), в остальном — родные паки FL
export function flCandidates(id, genre = null) {
  const cats = TRACK_CATS[id];
  if (!cats || !FL.ready) return [];
  const trap = genre === 'witch';
  const all = FL.items.filter(i => cats.includes(i.cat) || (trap && id === 'kick' && i.cat === '808'));
  if (!genre) return all;
  const pref = all.filter(i => (trap ? !STOCK.has(i.pack) : STOCK.has(i.pack)));
  return pref.length ? pref : all;
}

// Звук FL как обычный звук дорожки: синтез-параметры базового звука + сэмпл.
const BASE = { kick: 'k909', clap: 'c909', hat: 'h909', ohat: 'o909', perc: 'pblip' };
export function flSound(id, itemId) {
  const it = FL.byId.get(itemId);
  if (!it || !BASE[id]) return null;
  if (!SOUNDS[id][itemId]) {
    const p = SOUNDS[id][BASE[id]].p;
    SOUNDS[id][itemId] = { name: it.name.length > 22 ? it.name.slice(0, 21) + '…' : it.name, desc: `${it.pack} · из FL Studio`, fl: true, p: { ...p, sample: itemId, tune0: p.tune } };
  }
  return itemId;
}
