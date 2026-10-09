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
