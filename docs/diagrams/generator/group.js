'use strict';
// Gộp các trang cùng loại sơ đồ vào MỘT trang (xếp lưới, mỗi sơ đồ có khung đứt) → file 11 trang, dễ lướt hơn bản 111 trang.
// Dùng: node group.js [thư mục chứa bộ chi tiết]  → <thư mục đó>/CrabShare_Grouped.drawio
const fs = require('fs'); const path = require('path');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'out'); // thư mục chứa các file .drawio của bộ chi tiết
const GROUPS = [
  ['01 Business Context', 'CrabShare_Business_Context_DFD', 'Figure 1.1'],
  ['02 Use Case Diagrams', 'CrabShare_Use_Case_Diagrams', 'Figures 2.1–2.6'],
  ['03 Conceptual ERD', 'CrabShare_Conceptual_ERD', 'Figure 3.3 (3.3.1–3.3.6)'],
  ['04 Screen Flow', 'CrabShare_Screen_Flow', 'Figures 3.1a–c (web), 3.2 (mobile)'],
  ['05 Architecture', 'CrabShare_Architecture', 'Figures 4.1, 4.4–4.7 + Tables 4.1, 4.4–4.7'],
  ['06 Logical ERD', 'CrabShare_Logical_ERD', 'Figure 4.2 + area views + Table 4.2'],
  ['07 Physical ERD', 'CrabShare_Physical_ERD', 'Figure 4.3 + area views + Table 4.3'],
  ['08 State Machines', 'CrabShare_State_Machines', 'Figures 4.8–4.30'],
  ['09 Activity Diagrams', 'CrabShare_Activity_Diagrams', 'Figures 4.31–4.35'],
  ['10 Sequence Diagrams', 'CrabShare_Sequence_Diagrams', 'Figures 4.36–4.70'],
  ['11 Class Diagrams', 'CrabShare_Class_Diagrams', 'Figures 4.71–4.87'],
];
const GAP = 160, PAD = 40, TOP = 130; // khoảng cách giữa các khung, lề trong khung, chỗ cho tiêu đề trang
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (tag, name) => { const m = tag.match(new RegExp('\\s' + name + '="([^"]*)"')); return m ? m[1] : null; };
const num = v => parseFloat(v);
const r2 = v => Math.round(v * 100) / 100;

function parsePage(diagramXml) {
  const name = attr(diagramXml.match(/<diagram\b[^>]*>/)[0], 'name');
  const cells = diagramXml.match(/<mxCell\b[^>]*\/>|<mxCell\b[^>]*>[\s\S]*?<\/mxCell>/g) || [];
  const out = []; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cells) {
    const open = c.match(/<mxCell\b[^>]*>/)[0];
    const id = attr(open, 'id'), parent = attr(open, 'parent');
    if (id === '0' || id === '1') continue;
    if (parent === '0') throw new Error(`extra layer ${id} in page ${name}`);
    const top = parent === '1';
    if (top) {
      if (/\svertex="1"/.test(open)) {
        const g = c.match(/<mxGeometry\b[^>]*>/)[0];
        const x = num(attr(g, 'x') ?? 0), y = num(attr(g, 'y') ?? 0), w = num(attr(g, 'width') ?? 0), h = num(attr(g, 'height') ?? 0);
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
      }
      for (const p of c.match(/<mxPoint\b[^>]*>/g) || []) {
        const x = num(attr(p, 'x') ?? 0), y = num(attr(p, 'y') ?? 0);
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
    out.push({ xml: c, id, parent, top });
  }
  return { name, cells: out, minX, minY, w: maxX - minX, h: maxY - minY };
}

/** Dời cell cấp cao nhất (toạ độ tuyệt đối) đi (dx, dy): x/y của mxGeometry và mọi mxPoint (waypoint, source/targetPoint). */
function shiftCell(xml, dx, dy) {
  xml = xml.replace(/<mxGeometry\b[^>]*>/, g => g.replace(/\sx="([^"]*)"/, (m, v) => ` x="${r2(num(v) + dx)}"`).replace(/\sy="([^"]*)"/, (m, v) => ` y="${r2(num(v) + dy)}"`));
  return xml.replace(/<mxPoint\b[^>]*>/g, p => p.replace(/\sx="([^"]*)"/, (m, v) => ` x="${r2(num(v) + dx)}"`).replace(/\sy="([^"]*)"/, (m, v) => ` y="${r2(num(v) + dy)}"`));
}
function prefixIds(xml, pre) {
  const map = v => (v === '0' || v === '1') ? v : pre + v;
  return xml.replace(/<mxCell\b[^>]*>/, open => open.replace(/\s(id|parent|source|target)="([^"]*)"/g, (m, k, v) => ` ${k}="${map(v)}"`));
}
/** Xếp kệ (shelf packing) theo thứ tự, bề rộng mục tiêu ~ sqrt(diện tích × 1.5) để trang có tỉ lệ ngang. */
function layout(pages) {
  const A = pages.reduce((a, p) => a + (p.w + 2 * PAD + GAP) * (p.h + 2 * PAD + GAP), 0);
  const maxW = Math.max(...pages.map(p => p.w + 2 * PAD));
  const W = Math.max(maxW, Math.ceil(Math.sqrt(A * 1.5)));
  let x = 0, y = TOP, rowH = 0, rows = 1; const pos = [];
  for (const p of pages) {
    const bw = p.w + 2 * PAD, bh = p.h + 2 * PAD;
    if (x > 0 && x + bw > W) { x = 0; y += rowH + GAP; rowH = 0; rows++; }
    pos.push({ x, y, bw, bh }); x += bw + GAP; rowH = Math.max(rowH, bh);
  }
  return { pos, W, H: y + rowH, rows };
}

function run() {
  const stamp = new Date().toISOString().slice(0, 10);
  const diagrams = []; const report = [];
  GROUPS.forEach(([title, file, figures], gi) => {
    const xml = fs.readFileSync(path.join(OUT, file + '.drawio'), 'utf8');
    const pages = (xml.match(/<diagram\b[\s\S]*?<\/diagram>/g) || []).map(parsePage);
    const { pos, W, H, rows } = layout(pages);
    const cells = [];
    const heading = title.replace(/^(\d+) /, '$1 · ');
    const sub = `${pages.length} diagram${pages.length > 1 ? 's' : ''} · ${figures} · merged from ${file}.drawio (v3.2 · 05/11/2026 · Register v1.4) on ${stamp} · each dashed frame is one original page`;
    cells.push(`<mxCell id="title" value="${esc(`<b style="font-size:30px">${heading}</b><br><font style="font-size:14px" color="#64748b">${sub}</font>`)}" style="text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;overflow=hidden;fontFamily=Segoe UI;" vertex="1" parent="1"><mxGeometry x="0" y="10" width="${Math.max(1200, W)}" height="90" as="geometry"/></mxCell>`);
    pages.forEach((p, k) => {
      const { x, y, bw, bh } = pos[k];
      cells.push(`<mxCell id="frame${k}" value="" style="rounded=1;arcSize=2;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#94a3b8;dashed=1;dashPattern=8 6;strokeWidth=1.5;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${bw}" height="${bh}" as="geometry"/></mxCell>`);
      const dx = x + PAD - p.minX, dy = y + PAD - p.minY, pre = `p${k}_`;
      for (const c of p.cells) cells.push(prefixIds(c.top ? shiftCell(c.xml, dx, dy) : c.xml, pre));
    });
    const ids = cells.map(c => attr(c.match(/<mxCell\b[^>]*>/)[0], 'id'));
    if (new Set(ids).size !== ids.length) throw new Error('duplicate ids in ' + title);
    diagrams.push(`<diagram name="${esc(title)}" id="g${String(gi + 1).padStart(2, '0')}"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel></diagram>`);
    report.push(`${title.padEnd(22)} ${String(pages.length).padStart(2)} diagrams  ${String(rows).padStart(2)} rows  ${String(W).padStart(5)} x ${String(H).padStart(5)} px  ${String(cells.length).padStart(5)} cells`);
  });
  const out = `<mxfile host="CrabShare-generator" modified="${new Date().toISOString()}" agent="crabshare-drawio-gen" version="24.7.17" type="device">${diagrams.join('')}</mxfile>`;
  fs.writeFileSync(path.join(OUT, 'CrabShare_Grouped.drawio'), out, 'utf8');
  console.log(report.join('\n'));
  console.log(`CrabShare_Grouped.drawio: ${diagrams.length} pages, ${(out.length / 1024).toFixed(0)} KB`);
}
if (require.main === module) run();
module.exports = { run };
