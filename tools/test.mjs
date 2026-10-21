// Проверка сочинения: все жанры × много вариантов — без ошибок, тот же номер → тот же трек, варианты разные.
// Запуск: node tools/test.mjs
import fs from 'fs';
const R = new URL('../js/', import.meta.url).href;
const M = await import(R + 'music.js?v=5'), A = await import(R + 'arrange.js?v=5'), V = await import(R + 'vox.js?v=5');
V.voxSetIndex(JSON.parse(fs.readFileSync(new URL('../vox/index.json', import.meta.url), 'utf8')));
let songs = 0, errors = 0, nondet = 0;
const sigs = new Set(), bass = {};
for (const g of M.GENRE_IDS) {
  bass[g] = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    try {
      const st = M.genreState(M.emptyState(), g);
      const song = A.compose(st, 3, g, seed, true);
      st.song = song;
      st.mode = 'song';
      for (let b = 0; b < A.songBars(song); b++) A.barData(st, b);
      const sig = JSON.stringify(song.sections.map(s => [s.type, s.bars, s.lv, s.vox]));
      sigs.add(g + sig);
      bass[g].add(JSON.stringify(st.tracks.bass.steps) + st.tracks.bass.sound);
      const st2 = M.genreState(M.emptyState(), g);
      if (JSON.stringify(A.compose(st2, 3, g, seed, true).sections.map(s => [s.type, s.bars, s.lv, s.vox])) !== sig) nondet++;
      songs++;
    } catch (e) { errors++; if (errors < 4) console.log(g, seed, e.stack); }
  }
}
console.log({ songs, unique: sigs.size, errors, nondet });
console.log('разных басов из 40:', Object.entries(bass).map(([g, s]) => `${g} ${s.size}`).join(', '));
process.exit(errors || nondet ? 1 : 0);
