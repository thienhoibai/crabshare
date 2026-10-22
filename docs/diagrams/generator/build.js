'use strict';
// Sinh toàn bộ sơ đồ vào out/, kiểm tra XML, và (với --deploy) chép vào thư mục tài liệu của dự án, lưu bản cũ vào _phien-ban-cu.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const GENS = ['gen-context', 'gen-usecase', 'gen-erd', 'gen-architecture', 'gen-state', 'gen-activity', 'gen-class', 'gen-sequence', 'gen-screenflow'];

function generate() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const g of GENS) require(path.join(__dirname, g + '.js')).run(OUT);
}

function validate() {
  let ok = true;
  for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.drawio'))) {
    const x = fs.readFileSync(path.join(OUT, f), 'utf8');
    const pages = (x.match(/<diagram /g) || []).length;
    const cells = (x.match(/<mxCell /g) || []).length;
    const badAmp = (x.match(/&(?!(amp|lt|gt|quot|apos|#\d+);)/g) || []).length;
    const rawLt = (x.match(/value="[^"]*<[^"]*"/g) || []).length; // '<' chưa escape trong thuộc tính
    // id trùng trong cùng một trang
    let dup = 0;
    for (const page of x.split('<diagram ').slice(1)) { const ids = page.match(/<mxCell id="([^"]+)"/g) || []; if (new Set(ids).size !== ids.length) dup++; }
    const good = badAmp === 0 && rawLt === 0 && dup === 0;
    ok = ok && good;
    console.log(`${good ? 'OK ' : 'BAD'} ${f.padEnd(44)} pages=${String(pages).padStart(2)} cells=${String(cells).padStart(5)} size=${(x.length / 1024).toFixed(0).padStart(5)} KB${badAmp ? ' badAmp=' + badAmp : ''}${rawLt ? ' rawLt=' + rawLt : ''}${dup ? ' dupIds=' + dup : ''}`);
  }
  if (!ok) throw new Error('validation failed');
}

function deploy(root) {
  const stamp = '2026-10-22_ve-lai-theo-phieu-v1.3-va-code';
  const old = path.join(root, '_phien-ban-cu', stamp);
  const moves = [
    ['CrabShare_Business_Context_Diagram.drawio', 'CrabShare_Business_Context_Diagram.drawio'],
    [path.join('Diagram', 'CrabShare_Use_Case_Diagrams.drawio'), path.join('Diagram', 'CrabShare_Use_Case_Diagrams.drawio')],
    [path.join('Database', 'CrabShare_Conceptual_ERD.drawio'), path.join('Database', 'CrabShare_Conceptual_ERD.drawio')],
    [path.join('Database', 'CrabShare_Physical_ERD.drawio'), path.join('Database', 'CrabShare_Physical_ERD.drawio')],
  ];
  for (const [from, to] of moves) {
    const src = path.join(root, from);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(old, to);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.renameSync(src, dst);
    console.log('archived', from, '→', path.relative(root, dst));
  }
  const targets = {
    'CrabShare_Conceptual_ERD.drawio': 'Database', 'CrabShare_Logical_ERD.drawio': 'Database', 'CrabShare_Physical_ERD.drawio': 'Database',
  };
  for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.drawio'))) {
    const dir = path.join(root, targets[f] ?? 'Diagram');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(OUT, f), path.join(dir, f));
    console.log('deployed', path.relative(root, path.join(dir, f)));
  }
  // bộ sinh + dump lược đồ để nhóm sinh lại được bằng `node build.js`
  const gen = path.join(root, 'Diagram', '_sinh-tu-dong');
  fs.mkdirSync(path.join(gen, 'schema17'), { recursive: true });
  for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.js'))) fs.copyFileSync(path.join(__dirname, f), path.join(gen, f));
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'schema17'))) fs.copyFileSync(path.join(__dirname, '..', 'schema17', f), path.join(gen, 'schema17', f));
  fs.mkdirSync(path.join(gen, 'viewer'), { recursive: true });
  for (const f of fs.readdirSync(path.join(__dirname, 'viewer'))) fs.copyFileSync(path.join(__dirname, 'viewer', f), path.join(gen, 'viewer', f));
  console.log('generator copied to', path.relative(root, gen));
}

/** Chép các file .drawio vừa sinh đè lên thư mục đích (dùng trong repo: docs/diagrams), không lưu bản cũ vì git đã giữ lịch sử. */
function copyTo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.drawio'))) { fs.copyFileSync(path.join(OUT, f), path.join(dir, f)); console.log('copied', path.join(dir, f)); }
}

if (require.main === module) {
  generate();
  validate();
  const i = process.argv.indexOf('--deploy');
  if (i > 0) deploy(process.argv[i + 1]);
  const j = process.argv.indexOf('--copy');
  if (j > 0) copyTo(process.argv[j + 1]);
}
module.exports = { generate, validate, deploy, copyTo };
