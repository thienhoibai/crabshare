'use strict';
// Kiểm tra file gộp: mọi cell cấp cao nhất của sơ đồ k phải nằm trong khung frame k; id duy nhất; không còn ký tự & chưa escape.
const fs = require('fs');
const path = require('path');
const x = fs.readFileSync(process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'out', 'CrabShare_Grouped.drawio'), 'utf8');
const attr = (tag, name) => { const m = tag.match(new RegExp('\\s' + name + '="([^"]*)"')); return m ? m[1] : null; };
let bad = 0;
for (const page of x.match(/<diagram\b[\s\S]*?<\/diagram>/g)) {
  const name = attr(page.match(/<diagram\b[^>]*>/)[0], 'name');
  const cells = page.match(/<mxCell\b[^>]*\/>|<mxCell\b[^>]*>[\s\S]*?<\/mxCell>/g);
  const frames = {}; const ids = new Set(); let dup = 0, outside = 0, edges = 0, verts = 0;
  for (const c of cells) {
    const open = c.match(/<mxCell\b[^>]*>/)[0]; const id = attr(open, 'id');
    if (ids.has(id)) dup++; ids.add(id);
    const fm = id.match(/^frame(\d+)$/);
    if (fm) { const g = c.match(/<mxGeometry\b[^>]*>/)[0]; frames[fm[1]] = { x: +attr(g, 'x'), y: +attr(g, 'y'), w: +attr(g, 'width'), h: +attr(g, 'height') }; }
  }
  for (const c of cells) {
    const open = c.match(/<mxCell\b[^>]*>/)[0]; const id = attr(open, 'id'); const pm = id.match(/^p(\d+)_/);
    if (!pm || attr(open, 'parent') !== '1') continue;
    const f = frames[pm[1]]; const inside = (px, py) => px >= f.x - 1 && py >= f.y - 1 && px <= f.x + f.w + 1 && py <= f.y + f.h + 1;
    if (/\svertex="1"/.test(open)) { verts++; const g = c.match(/<mxGeometry\b[^>]*>/)[0]; const gx = +(attr(g, 'x') ?? 0), gy = +(attr(g, 'y') ?? 0), gw = +(attr(g, 'width') ?? 0), gh = +(attr(g, 'height') ?? 0); if (!inside(gx, gy) || !inside(gx + gw, gy + gh)) outside++; }
    else { edges++; for (const p of c.match(/<mxPoint\b[^>]*>/g) || []) if (!inside(+attr(p, 'x'), +attr(p, 'y'))) outside++; }
  }
  const badAmp = (page.match(/&(?!(amp|lt|gt|quot|apos|#\d+);)/g) || []).length;
  const ok = dup === 0 && outside === 0 && badAmp === 0; if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'BAD'} ${name.padEnd(22)} frames=${String(Object.keys(frames).length).padStart(2)} topVertices=${String(verts).padStart(4)} topEdges=${String(edges).padStart(4)} outside=${outside} dupIds=${dup} badAmp=${badAmp}`);
}
console.log(bad ? 'FAILED' : 'ALL OK');
