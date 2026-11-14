'use strict';
// Sinh lại toàn bộ sơ đồ v3.2 (Phiếu v1.4) vào out/, kiểm tra XML, và (với --copy <thư mục docs/diagrams>) chép bản nguồn vào repo.
//   node docs/diagrams/generator/build.js                      → sinh vào docs/diagrams/generator/out/
//   node docs/diagrams/generator/build.js --copy docs/diagrams → sinh rồi chép 11 file chi tiết, bộ khái quát và Mermaid
// Bản gộp (CrabShare_Grouped.drawio) chỉ sinh trong out/, không chép vào repo.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, 'out');
const DETAIL = [
  ['gen-context-dfd', 'CrabShare_Business_Context_DFD.drawio'],
  ['gen-usecase', 'CrabShare_Use_Case_Diagrams.drawio'],
  ['gen-screenflow', 'CrabShare_Screen_Flow.drawio'],
  ['gen-architecture', 'CrabShare_Architecture.drawio'],
  ['gen-erd', 'CrabShare_Conceptual_ERD.drawio'], // cùng bộ sinh ra Logical và Physical
  ['gen-state', 'CrabShare_State_Machines.drawio'],
  ['gen-activity', 'CrabShare_Activity_Diagrams.drawio'],
  ['gen-sequence', 'CrabShare_Sequence_Diagrams.drawio'],
  ['gen-class', 'CrabShare_Class_Diagrams.drawio'],
];
const ERD_EXTRA = ['CrabShare_Logical_ERD.drawio', 'CrabShare_Physical_ERD.drawio'];
const OVERVIEW = 'CrabShare_Overview_Diagrams.drawio';

function generate() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [g] of DETAIL) require(path.join(__dirname, g + '.js')).run(OUT);
  require(path.join(__dirname, 'gen-activity.js')).writeMermaid(path.join(OUT, 'Mermaid', 'activity'));
  require(path.join(__dirname, 'gen-overview.js')).run(OUT);
  execFileSync(process.execPath, [path.join(__dirname, 'group.js'), OUT], { stdio: 'inherit' });
}

function validate() {
  let ok = true;
  for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.drawio'))) {
    const x = fs.readFileSync(path.join(OUT, f), 'utf8');
    const pages = (x.match(/<diagram /g) || []).length;
    const badAmp = (x.match(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g) || []).length;
    const rawLt = (x.match(/value="[^"]*<[^"]*"/g) || []).length; // '<' chưa escape trong thuộc tính
    let dup = 0;
    for (const page of x.split('<diagram ').slice(1)) { const ids = page.match(/<mxCell id="([^"]+)"/g) || []; if (new Set(ids).size !== ids.length) dup++; }
    const good = badAmp === 0 && rawLt === 0 && dup === 0;
    ok = ok && good;
    console.log(`${good ? 'OK ' : 'BAD'} ${f.padEnd(42)} pages=${String(pages).padStart(3)} size=${(x.length / 1024).toFixed(0).padStart(5)} KB${badAmp ? ' badAmp=' + badAmp : ''}${rawLt ? ' rawLt=' + rawLt : ''}${dup ? ' dupIdPages=' + dup : ''}`);
  }
  if (!ok) throw new Error('validation failed');
}

function copyTo(dest) {
  const cp = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
  for (const f of [...DETAIL.map(d => d[1]), ...ERD_EXTRA]) cp(path.join(OUT, f), path.join(dest, f));
  cp(path.join(OUT, OVERVIEW), path.join(dest, 'overview', OVERVIEW));
  const mm = path.join(dest, 'mermaid');
  for (const sub of ['activity', 'state']) {
    const src = path.join(OUT, 'Mermaid', sub);
    for (const f of fs.readdirSync(src).filter(f => f.endsWith('.mmd') || (sub === 'state' && f === 'README.md'))) cp(path.join(src, f), path.join(mm, sub, f));
  }
  cp(path.join(OUT, 'Component.mmd'), path.join(mm, 'overview', 'Component.mmd'));
  cp(path.join(OUT, 'Deployment.mmd'), path.join(mm, 'overview', 'Deployment.mmd'));
  cp(path.join(OUT, 'Logical_ERD.mmd'), path.join(mm, 'erd', 'Logical_ERD.mmd'));
  console.log('copied to', dest);
}

generate();
validate();
const i = process.argv.indexOf('--copy');
if (i > 0) copyTo(path.resolve(process.argv[i + 1] || path.join(__dirname, '..')));
