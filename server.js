// Мини-сервер «Пульса»: отдаёт файлы приложения на http://127.0.0.1:7870 и открывает Chrome.
// Нужен потому, что Chrome запоминает разрешение на микрофон только для адреса, а не для файла.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const PORT = 7870;
const HOST = '127.0.0.1';
const ROOT = __dirname;
const URL_ = `http://${HOST}:${PORT}/`;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};
const SERVED = new Set(['.html', '.js', '.css', '.svg', '.png', '.ico', '.json', '.wav', '.mp3']);

function openBrowser() {
  if (process.argv.includes('--no-browser')) return;
  const env = process.env;
  const chrome = [
    path.join(env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  ].find(p => p && fs.existsSync(p));
  if (chrome) spawn(chrome, [URL_], { detached: true, stdio: 'ignore' }).unref();
  else exec(`start "" "${URL_}"`);
}

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, URL_).pathname); } catch { res.writeHead(400).end(); return; }
  // Сохранить отрендеренный трек в local/renders (для замеров звука и стрима). Только со страниц самого «Пульса».
  if (req.method === 'POST' && p === '/api/render') {
    const origin = req.headers.origin || '';
    if (origin && !/^http:\/\/(127\.0\.0\.1|localhost):7870$/.test(origin)) { res.writeHead(403).end(); return; }
    const name = (new URL(req.url, URL_).searchParams.get('name') || 'track').replace(/[^a-z0-9_-]/gi, '').slice(0, 60) || 'track';
    const dir = path.join(ROOT, 'local', 'renders');
    fs.mkdirSync(dir, { recursive: true });
    const chunks = [];
    let size = 0;
    req.on('data', c => { size += c.length; if (size > 400e6) req.destroy(); else chunks.push(c); });
    // append=1 — дописать кусок в конец (длинные треки приходят частями, чтобы браузер не упирался в память)
    const append = new URL(req.url, URL_).searchParams.get('append') === '1';
    req.on('end', () => {
      const file = path.join(dir, name + '.wav');
      (append ? fs.appendFile : fs.writeFile)(file, Buffer.concat(chunks), err => {
        res.writeHead(err ? 500 : 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(err ? { error: String(err) } : { file }));
      });
    });
    return;
  }
  // Свести диджей-сет из отрендеренных треков: наплывы, басовый своп (срез низа до/после своп-момента), общий лимитер
  if (req.method === 'POST' && p === '/api/set-mix') {
    const origin = req.headers.origin || '';
    if (origin && !/^http:\/\/(127\.0\.0\.1|localhost):7870$/.test(origin)) { res.writeHead(403).end(); return; }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let job;
      try { job = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
      const dir = path.join(ROOT, 'local', 'renders');
      const name = String(job.name || 'set').replace(/[^a-z0-9_-]/gi, '').slice(0, 60) || 'set';
      const parts = (job.parts || []).filter(x => /^[a-z0-9_-]+\.wav$/i.test(x.file) && fs.existsSync(path.join(dir, x.file)));
      if (!parts.length) { res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'нет треков' })); return; }
      const n = v => Number(v).toFixed(3);
      const args = ['-y', '-hide_banner', '-v', 'error'];
      parts.forEach(x => args.push('-i', path.join(dir, x.file)));
      const chains = parts.map((x, i) => {
        const f = ['aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo'];
        // Входящий трек — без низа до свопа, уходящий — без низа после свопа (24 дБ/окт)
        if (x.hpUntil != null) f.push(`highpass=f=180:p=2:enable='lt(t,${n(x.hpUntil)})'`, `highpass=f=180:p=2:enable='lt(t,${n(x.hpUntil)})'`);
        if (x.hpFrom != null) f.push(`highpass=f=180:p=2:enable='gte(t,${n(x.hpFrom)})'`, `highpass=f=180:p=2:enable='gte(t,${n(x.hpFrom)})'`);
        if (x.fadeIn) f.push(`afade=t=in:st=0:d=${n(x.fadeIn)}:curve=qsin`);
        if (x.fadeOut) f.push(`afade=t=out:st=${n(x.fadeOut[0])}:d=${n(x.fadeOut[1])}:curve=qsin`);
        const ms = Math.round(x.start * 1000);
        f.push(`adelay=${ms}|${ms}`);
        return `[${i}:a]${f.join(',')}[a${i}]`;
      });
      const graph = chains.join(';') + ';' + parts.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${parts.length}:normalize=0:dropout_transition=0,alimiter=limit=0.89:level=false[out]`;
      const wav = path.join(dir, name + '.wav');
      args.push('-filter_complex', graph, '-map', '[out]', '-ar', '44100', '-c:a', 'pcm_s16le', wav);
      const ffmpeg = [path.join(ROOT, '..', 'data', 'bin', 'ffmpeg.exe'), 'ffmpeg'].find(f => f === 'ffmpeg' || fs.existsSync(f));
      const pr = spawn(ffmpeg, args, { windowsHide: true });
      let err = '';
      pr.stderr.on('data', d => { err += d; });
      pr.on('close', code => {
        res.writeHead(code ? 500 : 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(code ? { error: err.slice(-800) } : { file: wav }));
      });
    });
    return;
  }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  const ext = path.extname(file).toLowerCase();
  if (!file.startsWith(ROOT + path.sep) || !SERVED.has(ext) || path.basename(file) === 'server.js') {
    res.writeHead(404).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log('Pulse is already running - opening the browser.');
    openBrowser();
    setTimeout(() => process.exit(0), 300);
  } else {
    console.error(e);
    process.exit(1);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Pulse - techno by voice: ${URL_}`);
  console.log('Close this window to stop the app.');
  openBrowser();
});
