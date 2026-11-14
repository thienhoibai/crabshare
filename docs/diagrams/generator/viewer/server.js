'use strict';
// Máy chủ tĩnh nhỏ để xem các file .drawio sinh ra bằng embed.diagrams.net (chỉ dùng khi kiểm tra).
// /export?f=<file> xuất từng trang ra PNG bằng chính draw.io rồi lưu vào out/png/<file>/NN <tên trang>.png
const http = require('http');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'out');
const PORT = 5188;
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const q = new URLSearchParams(req.url.split('?')[1] ?? '');
  if (url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res); }
  if (url === '/export') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return fs.createReadStream(path.join(__dirname, 'export.html')).pipe(res); }
  if (url === '/list') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(fs.readdirSync(OUT).filter(f => f.endsWith('.drawio')))); }
  if (url === '/save' && req.method === 'POST') {
    const dir = path.join(OUT, 'png', path.basename(q.get('f') ?? 'unknown', '.drawio'));
    const name = path.basename(q.get('name') ?? 'page').replace(/[<>:"/\|?*]/g, '_') + '.png';
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const b64 = body.slice(body.indexOf(',') + 1);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), Buffer.from(b64, 'base64'));
      res.end('ok');
    });
    return;
  }
  const file = path.join(OUT, path.basename(url));
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`viewer at http://localhost:${PORT}`));
