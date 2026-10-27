// Раздел «Сет»: живой диджей (играть, следующий трек, стоп, запись), список сохранённых сетов.
import { DJ, MIXES } from './dj.js?v=5';
import { MOODS, planSet, renderSetAudio } from './set.js?v=5';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = sec => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = String(sec % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`; };
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

export function initSetView({ engine, toast }) {
  let mood = 'night', minutes = 60, dj = null, rec = null, chunks = [];
  try { mood = localStorage.getItem('pulse.mood') || mood; minutes = +(localStorage.getItem('pulse.setmin') ?? minutes); } catch { /* нет хранилища */ }

  // Настроение и длина
  const moods = $('#moodSeg');
  moods.innerHTML = Object.entries(MOODS).map(([k, M]) => `<button data-m="${k}"><b>${M.name}</b><small>${M.bpm[0]}→${Math.max(...M.bpm)} BPM</small></button>`).join('');
  const paint = () => {
    moods.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === mood));
    $('#setLen').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.m === minutes));
  };
  moods.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; mood = b.dataset.m; try { localStorage.setItem('pulse.mood', mood); } catch { /* */ } paint(); });
  $('#setLen').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; minutes = +b.dataset.m; try { localStorage.setItem('pulse.setmin', minutes); } catch { /* */ } paint(); });
  paint();

  // Живой сет
  const live = $('#djLive'), btn = $('#setBtn');
  const setBtn = on => {
    btn.querySelector('span').textContent = on ? 'Стоп' : 'Играть сет';
    btn.querySelector('use').setAttribute('href', on ? '#i-stop' : '#i-play');
    btn.classList.toggle('on', on);
    live.hidden = !on;
    $('#djSkip').disabled = !on;
  };
  btn.addEventListener('click', async () => {
    if (dj && dj.on) { stopSet(); return; }
    await engine.init();
    engine.stop();
    dj = dj || new DJ(engine.ctx);
    if (window.pulse) window.pulse.dj = dj; // для отладки из консоли
    dj.onChange = ev => { if (ev === 'stop') { setBtn(false); finishRec(); } };
    setBtn(true);
    $('#djNow').textContent = 'Сочиняю первый трек…';
    await dj.start({ mood, minutes });
    if ($('#djRec').checked) startRec();
  });
  const stopSet = () => { if (dj) dj.stop(); setBtn(false); };
  $('#djSkip').addEventListener('click', () => {
    if (!dj || !dj.on) return;
    toast(dj.skip() ? 'Сведу в следующий трек на ближайшей фразе' : 'Следующий трек ещё сочиняется — секунду');
  });

  // Запись живого сета в файл (то, что слышно)
  function startRec() {
    if (!dj || rec) return;
    chunks = [];
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    rec = new MediaRecorder(dj.stream.stream, { mimeType: type, audioBitsPerSecond: 256000 });
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.start(10000);
  }
  function finishRec() {
    if (!rec) return;
    const r = rec;
    rec = null;
    r.onstop = () => {
      const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pulse-set-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.webm`;
      a.click();
      toast('Запись сета сохранена в «Загрузки»', 'ok');
    };
    r.stop();
  }
  $('#djRec').addEventListener('change', e => { if (dj && dj.on) { if (e.target.checked) startRec(); else finishRec(); } });

  // Табло «Сейчас играет»
  setInterval(() => {
    const s = dj && dj.status();
    if (!s) return;
    $('#djNow').innerHTML = `<b>${esc(s.name)}</b> · ${s.bpm} BPM · ${esc(s.part)}`;
    $('#djTime').textContent = `${fmt(s.elapsed)}${minutes ? ' из ' + fmt(minutes * 60) : ''} · трек ${s.n}`;
    $('#djBar').style.setProperty('--p', `${(100 * (s.bar + 1)) / s.bars}%`);
    $('#djNext').innerHTML = s.mixing ? `Сводит: <b>${esc(s.mixing)}</b>`
      : s.next ? `Дальше: <b>${esc(s.next.name)}</b> · ${s.next.bpm} BPM${s.toMix != null ? ` · переход через ${fmt(s.toMix)}` : ''}`
      : s.last ? 'Последний трек сета' : 'Сочиняю следующий трек…';
  }, 250);

  // Сохранить сет файлом заранее (быстрее реального времени, сводит FFmpeg на компьютере)
  $('#setFile').hidden = !LOCAL;
  $('#setFile').addEventListener('click', async () => {
    const prog = $('#setProg');
    prog.hidden = false;
    const bar = prog.querySelector('.bar i'), msg = prog.querySelector('.msg');
    const name = 'set_' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    try {
      await renderSetAudio(planSet({ minutes: minutes || 60, mood }), name, (p, m) => { bar.style.width = `${Math.round(p * 100)}%`; msg.textContent = m; });
      toast('Сет сохранён', 'ok');
      loadSets();
    } catch (e) { msg.textContent = 'Не получилось: ' + e.message; }
    setTimeout(() => { prog.hidden = true; }, 4000);
  });

  // Мои сеты (только на компьютере)
  $('#setsCard').hidden = !LOCAL;
  async function loadSets() {
    if (!LOCAL) return;
    const list = await fetch('/api/sets').then(r => r.json()).catch(() => []);
    $('#setsSub').textContent = list.length ? `${list.length} — лежат в techno/local/renders` : '';
    $('#setList').innerHTML = list.map(s => `<div class="setitem">
      <div class="si-h"><b>${esc(s.title)}</b><span>${new Date(s.created).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="si-path">${(s.tracks || []).map(esc).join(' → ')}</div>
      ${s.mp3 ? `<audio controls preload="none" src="local/renders/${esc(s.mp3)}"></audio>` : ''}
      <div class="si-a">${s.mp3 ? `<a class="btn" href="local/renders/${esc(s.mp3)}" download><svg><use href="#i-save"/></svg><span>MP3</span></a>` : ''}<a class="btn ghost" href="local/renders/${esc(s.wav)}" download><span>WAV</span></a></div>
    </div>`).join('') || '<div class="empty-hint">Пока пусто. «Сохранить файлом» соберёт сет заранее — быстрее, чем слушать его вживую.</div>';
  }
  loadSets();
  return { stop: stopSet, playing: () => !!(dj && dj.on), mixes: MIXES };
}
