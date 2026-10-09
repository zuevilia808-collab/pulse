// Звуки из FL Studio — только когда «Пульс» запущен на этом компьютере.
// tools/fl_import.py складывает их в local/fl (на GitHub и сайт эта папка не попадает), здесь — каталог и подбор.
import { SOUNDS } from './sounds.js?v=5';

export const FL = { ready: false, items: [], byId: new Map(), cats: {} };
let initP = null;
export function flInit() {
  if (!initP) {
    initP = fetch('local/fl/index.json').then(r => (r.ok ? r.json() : null)).then(d => {
      if (d && Array.isArray(d.items) && d.items.length) {
        FL.items = d.items;
        FL.byId = new Map(d.items.map(i => [i.id, i]));
        FL.cats = d.cats || {};
        FL.ready = true;
      }
      return FL.ready;
    }).catch(() => false);
  }
  return initP;
}
export const flUrl = id => { const it = FL.byId.get(id); return it ? 'local/fl/' + it.file : null; };

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
