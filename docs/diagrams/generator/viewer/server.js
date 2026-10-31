'use strict';
// Máy chủ tĩnh nhỏ để xem các file .drawio sinh ra bằng embed.diagrams.net (chỉ dùng khi kiểm tra).
const http = require('http');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'out');
const PORT = 5188;
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res); }
  if (url === '/list') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(fs.readdirSync(OUT).filter(f => f.endsWith('.drawio')))); }
  const file = path.join(OUT, path.basename(url));
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`viewer at http://localhost:${PORT}`));
