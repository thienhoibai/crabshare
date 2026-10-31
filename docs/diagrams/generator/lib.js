'use strict';
// Bộ sinh file draw.io (mxGraph XML không nén) cho các sơ đồ UML 2.5 / ERD của CrabShare.
// Mỗi Diagram là một trang; File gom nhiều trang thành một .drawio.
const fs = require('fs');
const path = require('path');

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
// Nhãn HTML (html=1): draw.io lưu HTML trong thuộc tính XML nên mọi ký tự < > & " đều phải escape;
// sau khi parse XML, chuỗi trở lại thành HTML và được hiển thị đúng (kể cả &lt; viết trong văn bản).
const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FONT = 'fontFamily=Segoe UI;';

class Diagram {
  constructor(name) {
    this.name = name;
    this.cells = [];
    this.n = 2;
    this.ids = new Map();
  }
  id(key) {
    if (!key) return String(this.n++);
    if (!this.ids.has(key)) this.ids.set(key, 'c' + (this.n++));
    return this.ids.get(key);
  }
  /** Thêm đỉnh. opts: {key, parent, html(bool, mặc định true), raw(bool: value đã là HTML)} */
  vertex(value, style, x, y, w, h, opts = {}) {
    const id = this.id(opts.key);
    const parent = opts.parent ? this.id(opts.parent) : '1';
    const v = opts.raw ? escHtml(value) : esc(value);
    this.cells.push(`<mxCell id="${id}" value="${v}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
    return id;
  }
  /** Thêm cạnh nối hai đỉnh (theo key hoặc id). opts: {label, points:[[x,y]], parent, raw} */
  edge(src, dst, style, opts = {}) {
    const id = this.id(opts.key);
    const parent = opts.parent ? this.id(opts.parent) : '1';
    const s = this.ids.get(src) ?? src, t = this.ids.get(dst) ?? dst;
    const v = opts.raw ? escHtml(opts.label ?? '') : esc(opts.label ?? '');
    const pts = (opts.points ?? []).map(([x, y]) => `<mxPoint x="${x}" y="${y}"/>`).join('');
    const geo = pts ? `<mxGeometry relative="1" as="geometry"><Array as="points">${pts}</Array></mxGeometry>` : `<mxGeometry relative="1" as="geometry"/>`;
    this.cells.push(`<mxCell id="${id}" value="${v}" style="${style}" edge="1" parent="${parent}" source="${s}" target="${t}">${geo}</mxCell>`);
    return id;
  }
  /** Cạnh tự do theo toạ độ (dùng cho sequence diagram). */
  freeEdge(x1, y1, x2, y2, style, opts = {}) {
    const id = this.id(opts.key);
    const v = opts.raw ? escHtml(opts.label ?? '') : esc(opts.label ?? '');
    const pts = (opts.points ?? []).map(([x, y]) => `<mxPoint x="${x}" y="${y}"/>`).join('');
    const arr = pts ? `<Array as="points">${pts}</Array>` : '';
    this.cells.push(`<mxCell id="${id}" value="${v}" style="${style}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${x1}" y="${y1}" as="sourcePoint"/><mxPoint x="${x2}" y="${y2}" as="targetPoint"/>${arr}</mxGeometry></mxCell>`);
    return id;
  }
  /** Nhãn rời (chú thích, tiêu đề). */
  text(value, x, y, w, h, extra = '', opts = {}) {
    return this.vertex(value, `text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;overflow=hidden;${FONT}${extra}`, x, y, w, h, { ...opts, raw: true });
  }
  /** Tiêu đề trang theo quy ước "Figure x.y – Loại sơ đồ: Tên · phiên bản · ngày". */
  caption(figure, title, meta) {
    return this.text(`<b>${figure} – ${title}</b><br><font style="font-size:10px" color="#64748b">${meta}</font>`, 20, 10, 900, 40, 'fontSize=14;');
  }
  toXml() {
    return `<diagram name="${esc(this.name)}" id="${esc(this.name).replace(/[^A-Za-z0-9]/g, '_')}"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${this.cells.join('')}</root></mxGraphModel></diagram>`;
  }
}

class DrawioFile {
  constructor() { this.diagrams = []; }
  page(name) { const d = new Diagram(name); this.diagrams.push(d); return d; }
  write(file) {
    const xml = `<mxfile host="CrabShare-generator" modified="${new Date().toISOString()}" agent="crabshare-drawio-gen" version="24.7.17" type="device">${this.diagrams.map(d => d.toXml()).join('')}</mxfile>`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, xml, 'utf8');
    return file;
  }
}

// ---------- Kiểu dáng dùng chung ----------
const S = {
  actor: `shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;${FONT}`,
  extActor: `rounded=0;whiteSpace=wrap;html=1;dashed=0;fillColor=#f8fafc;strokeColor=#475569;${FONT}`,
  usecase: `ellipse;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#1e293b;fontSize=11;${FONT}`,
  boundary: `rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#1e293b;strokeWidth=1.5;align=left;verticalAlign=top;spacingLeft=8;spacingTop=4;fontStyle=1;${FONT}`,
  assoc: `endArrow=none;html=1;strokeColor=#334155;edgeStyle=none;${FONT}`,
  include: `endArrow=open;endFill=0;dashed=1;html=1;strokeColor=#334155;edgeStyle=none;fontSize=10;${FONT}`,
  general: `endArrow=block;endFill=0;html=1;strokeColor=#334155;edgeStyle=none;endSize=12;${FONT}`,
  note: `shape=note;whiteSpace=wrap;html=1;size=14;fillColor=#fffbeb;strokeColor=#d97706;align=left;verticalAlign=top;spacing=6;fontSize=10;${FONT}`,
  // State machine
  state: `rounded=1;whiteSpace=wrap;html=1;arcSize=25;fillColor=#eef2ff;strokeColor=#3730a3;fontSize=12;${FONT}`,
  stateFinalLike: `rounded=1;whiteSpace=wrap;html=1;arcSize=25;fillColor=#f1f5f9;strokeColor=#64748b;fontSize=12;${FONT}`,
  start: `ellipse;html=1;shape=startState;fillColor=#000000;strokeColor=#000000;`,
  end: `ellipse;html=1;shape=endState;fillColor=#000000;strokeColor=#000000;`,
  choice: `rhombus;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#1e293b;${FONT}`,
  trans: `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#334155;fontSize=10;${FONT}`,
  transStraight: `rounded=1;html=1;endArrow=block;endFill=1;strokeColor=#334155;fontSize=10;edgeStyle=none;${FONT}`,
  // Activity
  lane: `swimlane;html=1;startSize=30;horizontal=1;fillColor=#f8fafc;strokeColor=#64748b;fontStyle=1;swimlaneFillColor=#ffffff;${FONT}`,
  action: `rounded=1;whiteSpace=wrap;html=1;arcSize=30;fillColor=#ecfdf5;strokeColor=#047857;fontSize=11;${FONT}`,
  sysAction: `rounded=1;whiteSpace=wrap;html=1;arcSize=30;fillColor=#eff6ff;strokeColor=#1d4ed8;fontSize=11;${FONT}`,
  decision: `rhombus;whiteSpace=wrap;html=1;fillColor=#fffbeb;strokeColor=#b45309;fontSize=10;${FONT}`,
  merge: `rhombus;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#1e293b;`,
  forkJoin: `line;strokeWidth=6;html=1;strokeColor=#1e293b;`,
  objectNode: `rounded=0;whiteSpace=wrap;html=1;fillColor=#fff7ed;strokeColor=#c2410c;fontSize=10;${FONT}`,
  timeEvent: `shape=hourglass;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#1e293b;fontSize=10;verticalLabelPosition=bottom;verticalAlign=top;${FONT}`,
  flow: `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endArrow=open;endFill=0;strokeColor=#334155;fontSize=10;${FONT}`,
  // ERD
  entity: (fill, stroke) => `swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;html=1;fillColor=${fill};strokeColor=${stroke};swimlaneFillColor=#ffffff;fontSize=12;${FONT}`,
  attr: `text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontSize=10;html=1;whiteSpace=wrap;${FONT}`,
  attrSep: `line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;strokeColor=#94a3b8;`,
  erEdge: (startArrow, endArrow, extra = '') => `edgeStyle=entityRelationEdgeStyle;html=1;endArrow=${endArrow};startArrow=${startArrow};endFill=0;startFill=0;strokeColor=#334155;fontSize=10;${FONT}${extra}`,
  // Class
  cls: `swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;html=1;fillColor=#f8fafc;strokeColor=#1e293b;swimlaneFillColor=#ffffff;fontSize=12;${FONT}`,
  member: `text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontSize=10;html=1;whiteSpace=wrap;${FONT}`,
  dep: `endArrow=open;endFill=0;dashed=1;html=1;strokeColor=#334155;edgeStyle=orthogonalEdgeStyle;rounded=1;fontSize=10;${FONT}`,
  assocNav: `endArrow=open;endFill=0;html=1;strokeColor=#334155;edgeStyle=orthogonalEdgeStyle;rounded=1;fontSize=10;${FONT}`,
  realize: `endArrow=block;endFill=0;dashed=1;html=1;strokeColor=#334155;edgeStyle=orthogonalEdgeStyle;rounded=1;endSize=12;${FONT}`,
  compos: `endArrow=diamondThin;endFill=1;endSize=14;html=1;strokeColor=#334155;edgeStyle=orthogonalEdgeStyle;rounded=1;fontSize=10;${FONT}`,
  // Sequence
  lifeline: `shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;collapsible=0;recursiveResize=0;outlineConnect=0;fillColor=#f8fafc;strokeColor=#1e293b;size=40;fontSize=11;${FONT}`,
  lifelineActor: `shape=umlLifeline;participant=umlActor;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;collapsible=0;recursiveResize=0;verticalAlign=top;spacingTop=36;outlineConnect=0;fontSize=11;${FONT}`,
  activation: `html=1;points=[];perimeter=orthogonalPerimeter;outlineConnect=0;fillColor=#e2e8f0;strokeColor=#1e293b;`,
  msgSync: `html=1;verticalAlign=bottom;endArrow=block;endFill=1;strokeColor=#1e293b;fontSize=10;edgeStyle=none;${FONT}`,
  msgAsync: `html=1;verticalAlign=bottom;endArrow=open;endFill=0;strokeColor=#1e293b;fontSize=10;edgeStyle=none;${FONT}`,
  msgReturn: `html=1;verticalAlign=bottom;endArrow=open;endFill=0;dashed=1;strokeColor=#475569;fontSize=10;edgeStyle=none;${FONT}`,
  frame: `shape=umlFrame;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#1e293b;width=60;height=24;align=left;verticalAlign=top;fontSize=10;fontStyle=1;${FONT}`,
  // Component / deployment / package
  component: `shape=component;jettyWidth=8;jettyHeight=4;whiteSpace=wrap;html=1;fillColor=#eff6ff;strokeColor=#1d4ed8;fontSize=11;align=center;${FONT}`,
  subsystem: `rounded=0;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#1e293b;strokeWidth=1.5;align=left;verticalAlign=top;spacingLeft=8;spacingTop=4;fontStyle=1;dashed=0;${FONT}`,
  external: `shape=component;jettyWidth=8;jettyHeight=4;whiteSpace=wrap;html=1;fillColor=#fef3c7;strokeColor=#b45309;fontSize=11;${FONT}`,
  dbShape: `shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=12;fillColor=#f1f5f9;strokeColor=#1e293b;fontSize=11;${FONT}`,
  iface: `ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#ffffff;strokeColor=#1e293b;fontSize=9;labelPosition=right;verticalLabelPosition=middle;align=left;verticalAlign=middle;${FONT}`,
  connector: `endArrow=open;endFill=0;html=1;strokeColor=#334155;edgeStyle=orthogonalEdgeStyle;rounded=1;fontSize=9;${FONT}`,
  node3d: `shape=cube;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;darkOpacity=0.05;darkOpacity2=0.1;size=16;fillColor=#f8fafc;strokeColor=#1e293b;align=left;verticalAlign=top;spacingLeft=20;spacingTop=10;fontSize=11;${FONT}`,
  artifact: `rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#1e293b;fontSize=10;${FONT}`,
  pkg: `shape=folder;fontStyle=1;spacingTop=10;tabWidth=60;tabHeight=16;tabPosition=left;html=1;whiteSpace=wrap;fillColor=#f8fafc;strokeColor=#1e293b;align=left;verticalAlign=top;spacingLeft=6;fontSize=11;${FONT}`,
  screen: `rounded=1;whiteSpace=wrap;html=1;arcSize=10;fillColor=#ffffff;strokeColor=#1e293b;fontSize=10;${FONT}`,
  group: `rounded=1;whiteSpace=wrap;html=1;arcSize=6;fillColor=#f8fafc;strokeColor=#94a3b8;dashed=1;align=left;verticalAlign=top;spacingLeft=8;spacingTop=4;fontStyle=1;fontSize=11;${FONT}`,
  legend: `rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#94a3b8;align=left;verticalAlign=top;spacing=6;fontSize=10;${FONT}`,
};

// ---------- Trợ giúp bố cục ----------
/** Hộp stack (entity / class): header + các dòng; trả về id của container. rows: [{text, raw, sep}] */
function stackBox(d, key, title, rows, x, y, w, style, rowH = 18, opts = {}) {
  const headerH = opts.headerH ?? 26;
  const total = headerH + rows.reduce((a, r) => a + (r.sep ? 8 : rowH), 0) + (opts.pad ?? 4);
  const id = d.vertex(title, style, x, y, w, total, { key, raw: true });
  let yy = headerH;
  for (const r of rows) {
    if (r.sep) { d.vertex('', S.attrSep, 0, yy, w, 8, { parent: key }); yy += 8; continue; }
    d.vertex(r.text, (r.style ?? S.attr), 0, yy, w, rowH, { parent: key, raw: true, key: r.key });
    yy += rowH;
  }
  return { id, h: total };
}

module.exports = { Diagram, DrawioFile, S, FONT, stackBox, esc, escHtml };
