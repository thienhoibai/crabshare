'use strict';
// Bộ sơ đồ TỔNG QUÁT v3.2 (05/11/2026, đồng bộ lần cuối với bộ chi tiết bản cuối): theo Phiếu đăng ký v1.4 và bảng tên dùng chung.
// Mỗi trang một sơ đồ, chỉ giữ các khối chính (nhãn ngắn, chữ ≥ 11 px) để trình bày và đọc nhanh.
//   - Trang có áp dụng quyết định thiết kế ngày 05/11/2026 ghi câu PENDING (đã được trưởng nhóm xác nhận) ở chú thích;
//     trên sơ đồ không ghi mã nội bộ của quá trình duyệt (mã quyết định, mã phát hiện, mục của brief).
//   - «planned» (v1.4 có, code develop @ 420a379 chưa có): nét đứt xám #64748b kèm nhãn «planned» (G-02).
//   - Phần code còn mà v1.4 đã bỏ (niêm yết/giỏ hàng, bao tiêu, tem từng con): không vẽ, chỉ ghi ở chú thích (G-02).
//   - Thứ tự góp vốn lấy từ code: Features/Funding (FundingController, FundingService), web ContributePage (STEPS),
//     Features/Contracts (ContractService), Batches/FundingReadiness; ký hợp đồng và trả VietQR chạy song song.
// Trang đánh số liên tục O1–O28, gom theo loại (bảng PG): O1 Business Context · O2 Use Case · O3 Conceptual ERD ·
//   O4 Screen Flow · O5 Component · O6 Logical ERD · O7 Physical data areas · O8 Deployment · O9 Package ·
//   O10–O16 State (Batch, Contribution, Contract, DisbursementTranche, Settlement, BulkPreOrder, Evidence) ·
//   O17 Activity tổng quát · O18–O22 Activity WF-01…WF-05 · O23–O26 Sequence · O27–O28 Class.
// Chạy: node gen-overview.js [outDir]  →  CrabShare_Overview_Diagrams.drawio
// Bộ kiểm tra bố cục (in "LAYOUT WARNINGS"): đường thẳng cắt qua khối, khối chồng nhau, chữ tràn khối,
// nhãn đường nối đè lên khối hoặc đè lên nhãn khác, điểm gãy nằm trong khối, khoá trùng, đường nối tới khoá không có.
// REVIEW=1 node gen-overview.js …  in thêm (không phải lỗi): chữ rời đè lên khối, hai đường đi chung một đoạn.
const path = require('path');
const { DrawioFile, S, FONT, stackBox, escHtml } = require('./lib');
const { loadSchema, AREAS, areaOf } = require('./schema');

const META = 'v3.2 · 05/11/2026 · Register v1.4';
// Câu đánh dấu quyết định đã xác nhận, ghi ở chú thích của mọi trang có áp dụng quyết định thiết kế ngày 05/11/2026 (như bộ chi tiết)
const PENDING = 'Design decisions of 05/11/2026 applied here were confirmed by the lead.';
// Danh mục trang: [số, tên trang ngắn, loại sơ đồ, tên sơ đồ]. Caption = "Figure O.n – Loại: Tên" (brief §5).
const PG = {
  context: [1, 'Business Context', 'Business Context Diagram', 'CrabShare System and its environment'],
  usecase: [2, 'Use Case', 'Use Case Diagram', 'system overview, 5 subsystems with representative use cases'],
  concept: [3, 'Conceptual ERD', 'Conceptual ERD', '20 core business entities of Register v1.4, no attributes'],
  screen: [4, 'Screen Flow', 'Screen Flow', 'main navigation per role, web and mobile'],
  component: [5, 'Component', 'Component Diagram', 'system overview, sub-systems, external systems, interfaces and protocols'],
  logical: [6, 'Logical ERD', 'Logical ERD', 'Register v1.4 entities by data area, keys, n–n links resolved'],
  physical: [7, 'Physical Data Areas', 'Physical Data Model', '6 data areas of migrations V001–V017 and the foreign keys between them'],
  deployment: [8, 'Deployment', 'Deployment Diagram', 'local, preview (develop) and production environments with CI/CD'],
  package: [9, 'Package', 'Package Diagram', 'sub-systems, v1.4 feature groups and the real dependencies between them'],
  smBatch: [10, 'State – Batch', 'State Machine Diagram', 'Batch lifecycle (batch.status)'],
  smContribution: [11, 'State – Contribution', 'State Machine Diagram', 'capital contribution and reservation (contribution.status) + RowAllocation «planned»'],
  smContract: [12, 'State – Contract', 'State Machine Diagram', 'investment contract (investment_contract.status)'],
  smTranche: [13, 'State – DisbursementTranche', 'State Machine Diagram', 'milestone disbursement tranche (disbursement_tranche.status)'],
  smSettlement: [14, 'State – Settlement', 'State Machine Diagram', 'settlement (settlement.status)'],
  smOrder: [15, 'State – BulkPreOrder', 'State Machine Diagram', 'bulk pre-order (sales_order.status, order type BulkPreOrder)'],
  smEvidence: [16, 'State – Evidence', 'State Machine Diagram', 'production evidence review (evidence.review_status)'],
  actAll: [17, 'Activity – End to end', 'Activity Diagram', 'one batch from proposal to close (WF-01 … WF-05)'],
  wf1: [18, 'Activity – WF-01', 'Activity Diagram', 'WF-01 Create a batch by box rows, price it and open funding (Operator, Platform Administrator)'],
  wf2: [19, 'Activity – WF-02', 'Activity Diagram', 'WF-02 Pick box rows, pay, sign and close funding (Investor, Operator, Payment Service Provider, Platform Administrator)'],
  wf3: [20, 'Activity – WF-03', 'Activity Diagram', 'WF-03 Production data, alerts and evidence review (Operator, farm devices, Platform Administrator, Investor)'],
  wf4: [21, 'Activity – WF-04', 'Activity Diagram', 'WF-04 Bulk pre-order, weighed delivery, invoiced and final orders (Customer, Operator, Platform Administrator)'],
  wf5: [22, 'Activity – WF-05', 'Activity Diagram', 'WF-05 Settlement, feedback and payout (Platform Administrator, Investor, Operator)'],
  seqFunding: [23, 'Sequence – Contribute', 'Sequence Diagram', 'reserve, sign and pay a contribution (UC11, UC10, UC14, UC12)'],
  seqSettlement: [24, 'Sequence – Settlement', 'Sequence Diagram', 'settle a batch and pay out (UC38, UC37, UC35, UC39, UC40)'],
  seqOrder: [25, 'Sequence – Bulk pre-order', 'Sequence Diagram', 'bulk pre-order, weighed delivery and balance (UC25, UC27, UC29, UC30, UC54, UC33)'],
  seqEvidence: [26, 'Sequence – Evidence', 'Sequence Diagram', 'device data, live evidence capture and review (UC52, UC45, UC47, UC48)'],
  classPattern: [27, 'Class – Slice pattern', 'Class Diagram', 'the pattern every backend module follows'],
  classMoney: [28, 'Class – Collaboration', 'Class Diagram', 'how modules collaborate through Payments'],
};
const OF = (k) => `Figure O.${PG[k][0]}`;
const OFS = (a, b) => `Figures O.${PG[a][0]}–O.${PG[b][0]}`;
// Số hình của bộ chi tiết bản cuối v3.2 (05/11/2026). Nếu bộ chi tiết đánh số lại thì chỉ sửa ở đây.
const DET = {
  context: 'Figure 1.1', usecase: 'Figures 2.1–2.6', concept: 'Figure 3.3', conceptAreas: '3.3.1–3.3.6',
  screen: 'Figure 3.1a (part 1 of 2: public and Customer; part 2 of 2: Investor portal), Figure 3.1b (Operator workspace), Figure 3.1c (Admin console) and Figure 3.2 (mobile app)',
  component: 'Figure 4.1 (1/2, 2/2)', componentTable: 'Table 4.1', logical: 'Figure 4.2', logicalTable: 'Table 4.2', physical: 'Figure 4.3', physicalTable: 'Table 4.3',
  deployment: 'Figure 4.4', deploymentTable: 'Table 4.4', packages: 'Figures 4.5–4.7', pkgBackend: 'Figure 4.5', pkgTable: 'Table 4.5 (2/2)',
  smBatch: 'Figure 4.8', smContribution: 'Figure 4.9', smContract: 'Figure 4.10', smTranche: 'Figure 4.13', smSettlement: 'Figure 4.14',
  smOrder: 'Figure 4.17', smInvoiced: 'Figure 4.18', smComplaint: 'Figure 4.19', smEvidence: 'Figure 4.28',
  wf: ['Figure 4.31', 'Figure 4.32', 'Figure 4.33', 'Figure 4.34', 'Figure 4.35'], wfParts: [2, 3, 3, 5, 3], wfAll: 'Figures 4.31–4.35',
  seqFunding: 'Figures 4.36–4.38', seqDisburse: 'Figure 4.39', seqSettlement: 'Figures 4.39–4.42',
  seqOrder: 'Figures 4.52–4.53, 4.55–4.58', seqForfeit: 'Figure 4.58', seqEvidence: 'Figures 4.49, 4.66–4.67',
  classAll: 'Figures 4.71–4.87', classMoney: 'Figures 4.71, 4.73–4.74, 4.81, 4.83',
};

const O = {
  role: `rounded=1;whiteSpace=wrap;html=1;fillColor=#ecfdf5;strokeColor=#047857;fontStyle=1;fontSize=13;${FONT}`,
  ext: `rounded=0;whiteSpace=wrap;html=1;fillColor=#fef3c7;strokeColor=#b45309;fontSize=12;${FONT}`,
  planned: 'dashed=1;strokeColor=#64748b;fontColor=#64748b;',
  plannedEdge: 'dashed=1;strokeColor=#64748b;fontColor=#64748b;',
  system: `rounded=1;whiteSpace=wrap;html=1;arcSize=4;fillColor=#eef2ff;strokeColor=#3730a3;strokeWidth=2;fontSize=16;verticalAlign=top;spacingTop=12;${FONT}`,
  box: `rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#334155;fontSize=12;${FONT}`,
  boxBlue: `rounded=1;whiteSpace=wrap;html=1;fillColor=#eff6ff;strokeColor=#1d4ed8;fontSize=12;${FONT}`,
  group: `rounded=1;whiteSpace=wrap;html=1;arcSize=4;fillColor=#f8fafc;strokeColor=#94a3b8;dashed=1;align=left;verticalAlign=top;spacingLeft=10;spacingTop=6;fontStyle=1;fontSize=13;${FONT}`,
  boundary: `rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#1e293b;strokeWidth=1.5;align=left;verticalAlign=top;spacingLeft=10;spacingTop=6;fontStyle=1;fontSize=14;${FONT}`,
  uc: `ellipse;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#1e293b;fontSize=12;${FONT}`,
  actor: `shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fontSize=13;fontStyle=1;${FONT}`,
  entity: `rounded=0;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#1e293b;fontStyle=1;fontSize=13;${FONT}`,
  state: `rounded=1;whiteSpace=wrap;html=1;arcSize=30;fillColor=#eef2ff;strokeColor=#3730a3;fontSize=13;${FONT}`,
  stateEnd: `rounded=1;whiteSpace=wrap;html=1;arcSize=30;fillColor=#f1f5f9;strokeColor=#64748b;fontSize=13;${FONT}`,
  start: 'ellipse;html=1;shape=startState;fillColor=#000000;strokeColor=#000000;',
  end: 'ellipse;html=1;shape=endState;fillColor=#000000;strokeColor=#000000;',
  flowEnd: 'shape=mxgraph.flowchart.or;html=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;',
  bar: 'rounded=0;html=1;fillColor=#1e293b;strokeColor=#1e293b;',
  action: `rounded=1;whiteSpace=wrap;html=1;arcSize=35;fillColor=#ecfdf5;strokeColor=#047857;fontSize=12;${FONT}`,
  sysAction: `rounded=1;whiteSpace=wrap;html=1;arcSize=35;fillColor=#eff6ff;strokeColor=#1d4ed8;fontSize=12;${FONT}`,
  extAction: `rounded=1;whiteSpace=wrap;html=1;arcSize=35;fillColor=#fef3c7;strokeColor=#b45309;fontSize=12;${FONT}`,
  decision: `rhombus;whiteSpace=wrap;html=1;fillColor=#fffbeb;strokeColor=#b45309;fontSize=11;${FONT}`,
  objectNode: `rounded=0;whiteSpace=wrap;html=1;fillColor=#fff7ed;strokeColor=#c2410c;fontSize=11;${FONT}`,
  timeEvent: `shape=collate;whiteSpace=nowrap;html=1;fillColor=#ffffff;strokeColor=#1e293b;fontSize=11;labelPosition=right;verticalLabelPosition=middle;align=left;verticalAlign=middle;spacingLeft=4;${FONT}`,
  lane: `swimlane;html=1;whiteSpace=wrap;startSize=36;horizontal=1;fillColor=#f1f5f9;strokeColor=#64748b;fontStyle=1;fontSize=13;swimlaneFillColor=#ffffff;${FONT}`,
  arrow: `html=1;endArrow=block;endFill=1;strokeColor=#334155;fontSize=11;edgeStyle=none;${FONT}`,
  trans: `rounded=1;html=1;endArrow=block;endFill=1;strokeColor=#334155;fontSize=11;edgeStyle=none;labelBackgroundColor=#ffffff;${FONT}`,
  flow: `html=1;endArrow=open;endFill=0;strokeColor=#334155;fontSize=11;edgeStyle=none;rounded=0;labelBackgroundColor=#ffffff;${FONT}`,
  assoc: `endArrow=none;html=1;strokeColor=#334155;edgeStyle=none;fontSize=11;labelBackgroundColor=#ffffff;${FONT}`,
  include: `endArrow=open;endFill=0;dashed=1;html=1;strokeColor=#334155;edgeStyle=none;fontSize=11;labelBackgroundColor=#ffffff;${FONT}`,
  dep: `endArrow=open;endFill=0;dashed=1;html=1;strokeColor=#334155;edgeStyle=none;fontSize=11;labelBackgroundColor=#ffffff;${FONT}`,
  realize: `endArrow=block;endFill=0;dashed=1;html=1;strokeColor=#334155;edgeStyle=none;endSize=12;${FONT}`,
  conn: `endArrow=open;endFill=0;html=1;strokeColor=#334155;edgeStyle=none;fontSize=11;labelBackgroundColor=#ffffff;${FONT}`,
  er: (a, b) => `edgeStyle=none;html=1;startArrow=${a};endArrow=${b};startFill=0;endFill=0;strokeColor=#334155;fontSize=11;labelBackgroundColor=#ffffff;${FONT}`,
  legend: S.legend + 'fontSize=11;',
  note: S.note + 'fontSize=11;',
  cls: `swimlane;fontStyle=0;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=44;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;html=1;fillColor=#f8fafc;strokeColor=#1e293b;swimlaneFillColor=#ffffff;fontSize=12;${FONT}`,
  clsName: `rounded=0;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#1e293b;fontSize=12;${FONT}`,
  comp: `shape=component;jettyWidth=10;jettyHeight=5;whiteSpace=wrap;html=1;fillColor=#eff6ff;strokeColor=#1d4ed8;fontSize=12;${FONT}`,
  compExt: `shape=component;jettyWidth=10;jettyHeight=5;whiteSpace=wrap;html=1;fillColor=#fef3c7;strokeColor=#b45309;fontSize=12;${FONT}`,
  db: `shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=12;fillColor=#f1f5f9;strokeColor=#1e293b;fontSize=12;${FONT}`,
  iface: `ellipse;html=1;aspect=fixed;fillColor=#ffffff;strokeColor=#1e293b;`,
  node: `shape=cube;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;darkOpacity=0.05;darkOpacity2=0.1;size=14;fillColor=#f8fafc;strokeColor=#1e293b;fontSize=12;align=left;verticalAlign=top;spacingLeft=18;spacingTop=8;${FONT}`,
  pkg: `shape=folder;fontStyle=1;spacingTop=10;tabWidth=70;tabHeight=16;tabPosition=left;html=1;whiteSpace=wrap;fillColor=#f8fafc;strokeColor=#1e293b;align=left;verticalAlign=top;spacingLeft=8;fontSize=12;${FONT}`,
};
const card = (c) => ({ '1': 'ERmandOne', '0..1': 'ERzeroToOne', '0..N': 'ERzeroToMany', '1..N': 'ERoneToMany' }[c]);
const small = (t, color = '#475569') => `<font style="font-size:11px" color="${color}">${t}</font>`;
const tiny = small; // chữ nhỏ nhất của bộ khái quát là 11 px (G-01)
const ROW11 = S.attr.replace('fontSize=10;', 'fontSize=11;'); // dòng thuộc tính / thành viên của stackBox ở 11 px
const PL = '<font color="#64748b"><i>«planned»</i></font>';

// ---------- Ước lượng kích thước chữ (Segoe UI) để phát hiện chữ tràn khối ----------
function charW(ch) {
  if (/[A-Z]/.test(ch)) return /[MW]/.test(ch) ? 0.85 : /[I]/.test(ch) ? 0.3 : 0.64;
  if (/[a-z]/.test(ch)) return /[mw]/.test(ch) ? 0.78 : /[iljI.,:;|!']/.test(ch) ? 0.26 : /[frt]/.test(ch) ? 0.36 : 0.52;
  if (/[0-9]/.test(ch)) return 0.56;
  if (ch === ' ') return 0.28;
  if (/[«»→←↔⇄–—·]/.test(ch)) return 0.6;
  if (/[①-⑳]/.test(ch)) return 0.95;
  return 0.5;
}
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&#10;/g, '\n').replace(/&amp;/g, '&');
/** Tách HTML nhãn thành các dòng, mỗi dòng gồm các đoạn {text, size, bold}. */
function htmlRuns(html, size, bold) {
  const lines = [[]], stack = [{ size, bold }];
  const re = /<\s*(\/?)\s*([a-zA-Z]+)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      const cur = stack[stack.length - 1];
      decode(m[4]).split('\n').forEach((p, i) => { if (i > 0) lines.push([]); if (p) lines[lines.length - 1].push({ text: p, size: cur.size, bold: cur.bold }); });
      continue;
    }
    const tag = m[2].toLowerCase();
    if (tag === 'br') { lines.push([]); continue; }
    if (!['b', 'font', 'i', 'span', 'u', 's', 'strike', 'sup', 'sub'].includes(tag)) continue;
    if (m[1] === '/') { if (stack.length > 1) stack.pop(); continue; }
    const cur = { ...stack[stack.length - 1] };
    if (tag === 'b') cur.bold = true;
    const fm = m[3].match(/font-size:\s*(\d+)px/);
    if (fm) cur.size = +fm[1];
    stack.push(cur);
  }
  return lines;
}
/** Chiều cao cần (px) và chữ dài nhất khi gói trong bề rộng aw. */
function measure(html, size, bold, aw) {
  let height = 0, widest = 0;
  for (const runs of htmlRuns(html, size, bold)) {
    const words = [];
    for (const r of runs) for (const [i, wd] of r.text.split(' ').entries()) {
      if (i > 0 || /^ /.test(r.text)) words.push({ space: true, size: r.size });
      if (wd) words.push({ w: [...wd].reduce((a, ch) => a + charW(ch), 0) * r.size * (r.bold ? 1.07 : 1), size: r.size });
    }
    let lineW = 0, lineSize = runs.reduce((a, r) => Math.max(a, r.size), size), lines = 1, pendingSpace = 0;
    for (const wd of words) {
      if (wd.space) { pendingSpace = wd.size * 0.28; continue; }
      widest = Math.max(widest, wd.w);
      if (lineW > 0 && lineW + pendingSpace + wd.w > aw) { lines++; lineW = wd.w; } else lineW += (lineW > 0 ? pendingSpace : 0) + wd.w;
      pendingSpace = 0;
    }
    height += lines * lineSize * 1.25;
  }
  return { height, widest };
}
// giá trị cuối cùng của khoá trong style thắng (như draw.io khi một khoá được ghi đè ở cuối chuỗi)
function styleNum(style, k, d) { const all = [...style.matchAll(new RegExp('(?:^|;)' + k + '=(-?[\\d.]+)', 'g'))]; return all.length ? +all[all.length - 1][1] : d; }

// ---------- Trang có kiểm tra bố cục ----------
const WARN = [];
const INFO = [];
function page(f, name, fig, title) {
  const d = f.page(name);
  // caption theo brief §5: "Figure O.n – Loại: Tên" + dòng phiên bản 11 px (không dùng d.caption của lib vì dòng đó 10 px)
  d.text(`<b>${fig} – ${title}</b><br><font style="font-size:11px" color="#64748b">${META}</font>`, 20, 10, 1500, 42, 'fontSize=14;');
  const geo = {}, edges = [], child = new Set(), free = [];
  const v = d.vertex.bind(d), e = d.edge.bind(d);
  d.vertex = (value, style, x, y, w, h, opts = {}) => {
    if (opts.key && geo[opts.key]) WARN.push(`${name}: duplicate key ${opts.key}`);
    const id = v(value, style, x, y, w, h, opts);
    if (opts.key && opts.parent) child.add(opts.key);
    if (opts.key && !opts.parent) geo[opts.key] = { x, y, w, h, container: !!opts.container, ellipse: /^ellipse|rhombus/.test(style) };
    else if (!opts.parent && y > 50) free.push({ x, y, w, h, value: String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) });
    if (!opts.parent && !opts.noFit) fit(opts.key ?? `"${String(value).replace(/<[^>]+>/g, ' ').slice(0, 30).trim()}"`, opts.raw ? value : escHtml(value), style, w, h);
    return id;
  };
  // opts.labelPos: vị trí nhãn dọc theo cạnh (−1 = đầu nguồn, 0 = giữa, 1 = đầu đích), ghi vào mxGeometry x
  d.edge = (a, b, style, opts = {}) => {
    if (!/orthogonalEdgeStyle/.test(style)) edges.push({ a, b, style, pts: opts.points ?? [], label: opts.label ?? '', raw: !!opts.raw, pos: opts.labelPos ?? 0 });
    const id = e(a, b, style, opts);
    if (opts.labelPos !== undefined) {
      const i = d.cells.length - 1;
      d.cells[i] = d.cells[i].replace('<mxGeometry relative="1"', `<mxGeometry x="${opts.labelPos}" relative="1"`);
    }
    return id;
  };
  function fit(key, html, style, w, h) {
    if (!html || /shape=(umlActor|startState|endState|umlLifeline|umlFrame|collate|mxgraph\.flowchart\.or)|^line;|swimlane|verticalLabelPosition=bottom/.test(style)) return;
    const size = styleNum(style, 'fontSize', 11), bold = /fontStyle=1/.test(style), sp = styleNum(style, 'spacing', 2);
    let aw = w - 2 * sp - styleNum(style, 'spacingLeft', 0) - styleNum(style, 'spacingRight', 0) - 4;
    let ah = h - 2 * sp - styleNum(style, 'spacingTop', 0) - styleNum(style, 'spacingBottom', 0) - 2;
    if (/^ellipse/.test(style)) { aw = w * 0.74 - 4; ah = h * 0.78; }
    if (/rhombus/.test(style)) { aw = w * 0.56; ah = h * 0.6; }
    if (/shape=cube/.test(style)) { aw -= styleNum(style, 'size', 20); ah -= 2 * styleNum(style, 'size', 20); }
    if (/shape=component/.test(style)) aw -= 2 * styleNum(style, 'jettyWidth', 20);
    if (/shape=cylinder3/.test(style)) ah -= 2 * styleNum(style, 'size', 15);
    if (/shape=folder/.test(style)) ah -= styleNum(style, 'tabHeight', 20);
    const { height, widest } = measure(html, size, bold, aw);
    if (height > ah + 3) WARN.push(`${name}: text of ${key} needs ~${Math.round(height)} px height, box has ${Math.round(ah)}`);
    if (widest > aw + 3) WARN.push(`${name}: a word in ${key} is ~${Math.round(widest)} px wide, box has ${Math.round(aw)}`);
  }
  const endPoint = (g, style, kind) => {
    const ex = styleNum(style, kind + 'X', null), ey = styleNum(style, kind + 'Y', null);
    return ex !== null && ey !== null ? [g.x + g.w * ex, g.y + g.h * ey] : [g.x + g.w / 2, g.y + g.h / 2];
  };
  // điểm đi ra khỏi hình chữ nhật của khối (để tính tâm nhãn của đường nối)
  const clip = (g, [x1, y1], [x2, y2]) => {
    let t = 1; const dx = x2 - x1, dy = y2 - y1;
    if (dx) for (const xx of [g.x, g.x + g.w]) { const tt = (xx - x1) / dx; if (tt > 0 && tt < t && Math.abs(y1 + dy * tt - (g.y + g.h / 2)) <= g.h / 2) t = tt; }
    if (dy) for (const yy of [g.y, g.y + g.h]) { const tt = (yy - y1) / dy; if (tt > 0 && tt < t && Math.abs(x1 + dx * tt - (g.x + g.w / 2)) <= g.w / 2) t = tt; }
    return t < 1 ? [x1 + dx * t, y1 + dy * t] : [x1, y1];
  };
  d.check = () => {
    const solid = Object.entries(geo).filter(([, g]) => !g.container);
    const inside = (g, x, y, m = 3) => g.ellipse
      ? ((x - g.x - g.w / 2) / (g.w / 2 - m)) ** 2 + ((y - g.y - g.h / 2) / (g.h / 2 - m)) ** 2 < 1
      : x > g.x + m && x < g.x + g.w - m && y > g.y + m && y < g.y + g.h - m;
    let crossings = 0;
    const segs = [], labelRects = [];
    for (const { a, b, style, pts, label, raw, pos } of edges) {
      const ga = geo[a], gb = geo[b];
      if (!ga && !child.has(a)) WARN.push(`${name}: edge from unknown key ${a}`);
      if (!gb && !child.has(b)) WARN.push(`${name}: edge to unknown key ${b}`);
      if (!ga || !gb) continue;
      const P = [endPoint(ga, style, 'exit'), ...pts, endPoint(gb, style, 'entry')];
      const hit = new Set();
      for (let i = 0; i < P.length - 1; i++) {
        const [x1, y1] = P[i], [x2, y2] = P[i + 1];
        segs.push({ a, b, p: P[i], q: P[i + 1] });
        const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4);
        for (let k = 0; k <= n; k++) {
          const x = x1 + (x2 - x1) * k / n, y = y1 + (y2 - y1) * k / n;
          for (const [key, g] of solid) if (key !== a && key !== b && inside(g, x, y)) hit.add(key);
        }
      }
      if (hit.size) WARN.push(`${name}: edge ${a} → ${b} crosses ${[...hit].join(', ')}`);
      if (!label) continue;
      // nhãn nằm ở vị trí pos dọc theo đoạn đã cắt theo biên hai khối (điểm nối cố định exit/entry thì không cắt)
      const Q = P.slice();
      if (Q.length >= 2) {
        if (styleNum(style, 'exitX', null) === null) Q[0] = clip(ga, Q[0], Q[1]);
        if (styleNum(style, 'entryX', null) === null) Q[Q.length - 1] = clip(gb, Q[Q.length - 1], Q[Q.length - 2]);
      }
      const lens = Q.slice(1).map((p, i) => Math.hypot(p[0] - Q[i][0], p[1] - Q[i][1]));
      let half = lens.reduce((s, l) => s + l, 0) * (1 + pos) / 2, mx = Q[0][0], my = Q[0][1];
      for (let i = 0; i < lens.length; i++) { if (half <= lens[i]) { const t = lens[i] ? half / lens[i] : 0; mx = Q[i][0] + (Q[i + 1][0] - Q[i][0]) * t; my = Q[i][1] + (Q[i + 1][1] - Q[i][1]) * t; break; } half -= lens[i]; }
      const size = styleNum(style, 'fontSize', 11);
      const runs = htmlRuns(raw ? label : escHtml(label), size, false);
      const lw = Math.max(...runs.map(r => r.reduce((s, x) => s + [...x.text].reduce((a, ch) => a + charW(ch), 0) * x.size, 0))) + 6, lh = runs.length * size * 1.25 + 2;
      // align / verticalAlign của nhãn cạnh: left = chữ nằm bên phải điểm nhãn, bottom = chữ nằm phía trên
      const al = (style.match(/(?:^|;)align=(\w+)/) ?? [])[1], va = (style.match(/(?:^|;)verticalAlign=(\w+)/) ?? [])[1];
      const sl = styleNum(style, 'spacingLeft', 0), sr = styleNum(style, 'spacingRight', 0);
      const R = {
        x: al === 'left' ? mx + sl : al === 'right' ? mx - lw - sr : mx - lw / 2,
        y: va === 'bottom' ? my - lh - 2 : va === 'top' ? my + 2 : my - lh / 2, w: lw, h: lh,
        t: String(label).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24),
      };
      for (const [key, g] of solid) {
        const ox = Math.min(R.x + R.w, g.x + g.w) - Math.max(R.x, g.x), oy = Math.min(R.y + R.h, g.y + g.h) - Math.max(R.y, g.y);
        if (!(ox > 3 && oy > 3)) continue;
        // khối elip: chỉ báo khi một điểm của nhãn nằm hẳn trong elip
        if (g.ellipse) { let hitE = false; for (let ix = 0; ix <= 6 && !hitE; ix++) for (let iy = 0; iy <= 2 && !hitE; iy++) hitE = inside(g, R.x + R.w * ix / 6, R.y + R.h * iy / 2, 1); if (!hitE) continue; }
        WARN.push(`${name}: label "${R.t}" of ${a} → ${b} overlaps ${key}`);
      }
      // nhãn của hai cạnh khác nhau đè lên nhau (lỗi kiểu "isis paid byy")
      for (const o of labelRects) if (Math.min(R.x + R.w, o.x + o.w) - Math.max(R.x, o.x) > 2 && Math.min(R.y + R.h, o.y + o.h) - Math.max(R.y, o.y) > 2) WARN.push(`${name}: labels "${R.t}" and "${o.t}" overlap`);
      labelRects.push(R);
    }
    // đường thẳng cắt nhau (chỉ để thống kê)
    const cross = (p1, p2, p3, p4) => {
      const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
      return o(p1, p2, p3) * o(p1, p2, p4) < 0 && o(p3, p4, p1) * o(p3, p4, p2) < 0;
    };
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if (cross(segs[i].p, segs[i].q, segs[j].p, segs[j].q)) {
      crossings++;
      if (process.env.REVIEW) INFO.push(`REVIEW ${name}: ${segs[i].a}→${segs[i].b} crosses ${segs[j].a}→${segs[j].b}`);
    }
    if (crossings) INFO.push(`${name}: ${crossings} line crossing(s)`);
    // điểm gãy nằm trong chính khối nguồn / đích làm draw.io vẽ lệch đầu mũi tên
    for (const { a, b, pts } of edges) {
      const ga = geo[a], gb = geo[b];
      if (!ga || !gb || !pts.length) continue;
      const inRect = (g, [x, y]) => x > g.x + 1 && x < g.x + g.w - 1 && y > g.y + 1 && y < g.y + g.h - 1;
      if (inRect(ga, pts[0])) WARN.push(`${name}: first waypoint of ${a} → ${b} lies inside ${a}`);
      if (inRect(gb, pts[pts.length - 1])) WARN.push(`${name}: last waypoint of ${a} → ${b} lies inside ${b}`);
    }
    // hai đường nối khác nhau chạy chồng lên nhau trên cùng một đoạn ngang / dọc
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const s1 = segs[i], s2 = segs[j];
      if (s1.a === s2.a && s1.b === s2.b) continue;
      const vert = (s) => Math.abs(s.p[0] - s.q[0]) < 0.5, horz = (s) => Math.abs(s.p[1] - s.q[1]) < 0.5;
      const ov = (u1, u2, v1, v2) => Math.min(Math.max(u1, u2), Math.max(v1, v2)) - Math.max(Math.min(u1, u2), Math.min(v1, v2));
      const same = (vert(s1) && vert(s2) && Math.abs(s1.p[0] - s2.p[0]) < 2 && ov(s1.p[1], s1.q[1], s2.p[1], s2.q[1]) > 8)
        || (horz(s1) && horz(s2) && Math.abs(s1.p[1] - s2.p[1]) < 2 && ov(s1.p[0], s1.q[0], s2.p[0], s2.q[0]) > 8);
      // chỉ in khi REVIEW=1: đường gom kiểu bus (O3, O20) là cố ý
      if (process.env.REVIEW && same && !(s1.b === s2.b && /^m\d|^j\d/.test(s1.b))) INFO.push(`REVIEW ${name}: edges ${s1.a}→${s1.b} and ${s2.a}→${s2.b} share a segment`);
    }
    // chữ rời (không có khoá) đè lên khối có khoá: chỉ in ra khi đặt REVIEW=1
    if (process.env.REVIEW) for (const t of free) for (const [key, g] of solid) {
      const ox = Math.min(t.x + t.w, g.x + g.w) - Math.max(t.x, g.x), oy = Math.min(t.y + t.h, g.y + g.h) - Math.max(t.y, g.y);
      if (ox > 2 && oy > 2) INFO.push(`REVIEW ${name}: free "${t.value}" overlaps ${key}`);
    }
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
      const [ka, A] = solid[i], [kb, B] = solid[j];
      if (A.x < B.x + B.w - 1 && B.x < A.x + A.w - 1 && A.y < B.y + B.h - 1 && B.y < A.y + A.h - 1) WARN.push(`${name}: ${ka} overlaps ${kb}`);
    }
  };
  return d;
}

/** Mở trang theo danh mục PG: tên trang "O<n> …", caption "Figure O.n – Loại: Tên". */
function openPage(f, k) { const [n, short, type, name] = PG[k]; return page(f, `O${n} ${short}`, `Figure O.${n}`, `${type}: ${name}`); }

// Ô chú thích nhiều dòng: [tiêu đề, nội dung]; trả về chiều cao đã dùng
function explain(d, key, title, items, x, y, w, perCol = items.length, colW = w) {
  const cols = Math.ceil(items.length / perCol);
  const lineH = 15;
  let maxH = 0;
  for (let c = 0; c < cols; c++) {
    const part = items.slice(c * perCol, (c + 1) * perCol);
    const html = part.map(([t, body]) => `<b>${t}</b> — ${body}`).join('<br>');
    const { height } = measure(html, 11, false, colW - 20);
    maxH = Math.max(maxH, height);
    d.vertex(html, O.legend + 'spacing=8;', x + c * colW, y + 26, colW - (c < cols - 1 ? 10 : 0), Math.ceil(height + 22), { key: `${key}_${c}`, raw: true });
  }
  d.text(`<b>${title}</b>`, x, y, w, 24, 'fontSize=13;verticalAlign=middle;');
  return 26 + Math.ceil(maxH + 22);
}
// Chiều cao ô chú thích O.legend (spacing 6, chữ 11 px) vừa đủ cho nội dung, không nhỏ hơn min
const legendH = (html, w, min = 0) => Math.max(min, Math.ceil(measure(html, 11, false, w - 16).height + 18));

// =====================================================================================================
// O.1 Business Context — như Figure 1.1: hệ thống là một hình tròn "CrabShare System" (hộp đen), 4 vai trò bên trái,
// 4 hệ thống ngoài bên phải; mỗi chiều một mũi tên gắn source/target, nhãn là cụm danh từ Title Case gom các gói tin của 1.1
function contextPage(f) {
  const d = openPage(f, 'context');
  const cx = 827, cy = 430, r = 290;
  d.vertex(`<font style="font-size:26px">CrabShare System</font><br>${small('B2B platform connecting crab farms, investors<br>and bulk buyers; it holds no money', '#475569')}`, `ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;fontSize=12;${FONT}`, cx - r, cy - r, 2 * r, 2 * r, { key: 'sys', raw: true });
  const P = (t) => ` <font color="#64748b"><i>«planned»</i></font>${t ?? ''}`;
  // [khoá, tên, nhãn vào hệ thống, nhãn ra khỏi hệ thống, planned] — tên gói theo Figure 1.1
  const left = [
    ['investor', 'Investor<br>' + small('may also pre-order as a Customer'), 'KYC Profile, Capital Commitment,<br>Contract Signature, Settlement Feedback', 'Batch Offering, Payment Request &amp; Contract,<br>Production Timeline, Statement, Payout<br>&amp; Refund Advice'],
    ['operator', 'Operator<br>' + small('farm owner and staff'), 'Operator Dossier &amp; Box List,<br>Batch Proposal, Contract Signature<br>&amp; Tranche Request, Production<br>&amp; Evidence Data, Harvest &amp; Delivery,<br>Invoiced Sale Record' + P(), 'Approval Results &amp; Investment Contract,<br>Alerts &amp; Capture Requests,<br>Pre-order Book &amp; Statements,<br>Price Range Suggestion' + P()],
    ['customer', 'Customer<br>' + small('bulk buyer: restaurant, small trader'), 'Bulk Pre-order &amp; Address, Receipt,<br>Return, Complaint &amp; Rating,<br>Order QR Code' + P(), 'Farm &amp; Batch Map' + P(',') + '<br>Payment Request, Order Status,<br>Deposit Refund &amp; Forfeit Advice' + P(',') + '<br>Traceability Record' + P()],
    ['admin', 'Platform Administrator<br>' + small('incl. Evidence Reviewer'), 'Approval Decisions, Evidence Review Decision,<br>Platform Parameters, Settlement Approval,<br>Price Dataset (assumed)' + P(), 'Approval Dossiers, Flagged Evidence &amp; Alerts,<br>Settlement Draft &amp; Reconciliation Report,<br>Operational Reports &amp; Audit Log Extract'],
  ];
  const right = [
    ['ekyc', '<b>eKYC Provider</b>', 'Identity Verification Result', 'Identity Evidence'],
    ['sign', '<b>Digital Signature Service</b><br>' + small('Viettel'), 'Signed Contract', 'Contract Document'],
    ['psp', '<b>Payment Service Provider</b><br>' + small('payment intermediary, batch accounts'), 'Transaction &amp; Payout Results', 'Batch Account &amp; Payment Requests,<br>Disbursement, Payout &amp; Refund<br>Instructions'],
    ['dev', '<b>Farm Devices &amp; Cameras (simulated)</b>' + P(), 'Box Photos, Feeding &amp; Box Events' + P(), null, true],
  ];
  const ys = [192, 352, 512, 672], EH = 76, GAP = 14;
  // điểm trên đường tròn ở độ cao y, phía trái (side −1) hoặc phải (+1), ghi dạng entry/exit tương đối
  const onC = (y, side) => { const dx = Math.sqrt(r * r - (y - cy) ** 2); return [(((cx + side * dx) - (cx - r)) / (2 * r)).toFixed(4), ((y - (cy - r)) / (2 * r)).toFixed(4)]; };
  const ARROW = `html=1;endArrow=block;endFill=1;strokeColor=#1e293b;fontSize=11;edgeStyle=none;labelBackgroundColor=none;${FONT}`;
  const flows = (k, side, ey, inn, out, planned) => {
    const yIn = ey + EH / 2 - GAP, yOut = ey + EH / 2 + GAP, st = ARROW + (planned ? O.plannedEdge : '');
    const [ix, iy] = onC(yIn, side), [ox, oy] = onC(yOut, side);
    const eIn = ((yIn - ey) / EH).toFixed(4), eOut = ((yOut - ey) / EH).toFixed(4), ex = side < 0 ? 1 : 0;
    // nhãn vào: phía trên mũi tên trên; nhãn ra: phía dưới mũi tên dưới
    if (inn) d.edge(k, 'sys', st + `exitX=${ex};exitY=${eIn};entryX=${ix};entryY=${iy};verticalAlign=bottom;`, { label: inn, raw: true });
    if (out) d.edge('sys', k, st + `exitX=${ox};exitY=${oy};entryX=${ex};entryY=${eOut};verticalAlign=top;`, { label: out, raw: true });
  };
  const ENT = `rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;fontSize=13;${FONT}`;
  left.forEach(([k, name, inn, out], i) => {
    d.vertex(name, ENT + 'fontStyle=1;', 40, ys[i] - EH / 2, 230, EH, { key: k, raw: true });
    flows(k, -1, ys[i] - EH / 2, inn, out);
  });
  right.forEach(([k, name, inn, out, planned], i) => {
    d.vertex(name, ENT + (planned ? O.planned : ''), 1384, ys[i] - EH / 2, 230, EH, { key: k, raw: true });
    flows(k, 1, ys[i] - EH / 2, inn, out, planned);
  });
  const leg1 = `<b>Legend</b> — circle: CrabShare System as one process (black box) · rectangle: external entity, human role on the left, external system on the right (sandbox or simulated in the demo) · dashed grey or «planned»: in Register v1.4, not built yet. Upper arrow of a pair = information into the system, lower arrow = information out. Each label groups the information packages of ${DET.context} under the same Title Case names; the parts of a package that are planned are marked there. Money moves only between payers, the batch account at the payment provider and payees. Farmers, carriers, the committed buyer of the final order and the banks behind the provider exchange nothing with the system directly, so they are not drawn. ${PENDING}`;
  d.vertex(leg1, O.legend, 40, 790, 1574, legendH(leg1, 1574, 64), { raw: true });
  d.check();
}

// =====================================================================================================
// O.2 Use Case — như Figure 2.1 (LV0): 5 phân hệ là package xếp dọc SD1, SD4, SD5, SD2, SD3; Operator nối mọi gói từ trái,
// Platform Administrator từ phải; Customer, Investor và 4 hệ thống ngoài đứng trong "khe" giữa hai đường liền nhau.
// Mỗi gói vẽ 2–4 use case tiêu biểu (tổng 13); UC12 và UC40 không gộp (OV-04). Như bản chi tiết cuối (Figure 2.5a): UC54 «extend» UC55
// và UC30, điều kiện ghi ở Notes; Investor kế thừa Customer (generalization), ràng buộc {…} ghi ở Notes như bản chi tiết.
function useCasePage(f) {
  const d = openPage(f, 'usecase');
  const GREY = '#64748b';
  // CG: khe giữa hai cột use case, đủ cho nhãn «extend» nằm ngang giữa UC54 và UC55
  const UW = 244, UH = 60, PX = 520, CG = 56, PW = 16 + UW + CG + UW + 16, HEAD = 58, RGAP = 40, PGAP = 30, TOP = 116;
  const colX = [PX + 16 + UW / 2, PX + 16 + UW + CG + UW / 2];
  // [tên, phần v1.4 chưa có, cả use case «planned»] — tên như gen-usecase.js (Figures 2.2–2.6)
  const UCN = {
    UC01: ['Register Account'], UC02: ['Complete Identity Verification (eKYC)'],
    UC27: ['Place Bulk Pre-order with Deposit', 'crab count'], UC30: ['Confirm Receipt and Pay Balance', 'weighed kg'],
    UC55: ['Cancel Bulk Pre-order', 'forfeit once the Batch opens'], UC54: ['Forfeit Deposit', null, true],
    UC35: ['Review Settlement Statement'], UC39: ['Approve Settlement and Issue Payouts'],
    UC07: ['Create Batch by Box Rows and Define Standard Cost', 'rows, prices'], UC10: ['Reserve Box Rows and Commit Capital', 'box-row choice'], UC12: ['Make Payment (VietQR)'],
    UC45: ['Capture Production Evidence'], UC47: ['Review Flagged Evidence'],
  };
  // gói: [khoá, tên, dải mã, hình chi tiết, hàng use case: [[mã, cột hoặc 'mid'], …]]
  const PKGS = [
    ['SD1', 'Identity &amp; Onboarding', 'UC01–UC06', 'Figure 2.2', [[['UC01', 0], ['UC02', 1]]]],
    ['SD4', 'Sales &amp; Orders', 'UC25–UC34, UC50–UC51, UC54–UC55', 'Figures 2.5a–2.5b', [[['UC27', 0], ['UC30', 1]], [['UC55', 0], ['UC54', 1]]]],
    ['SD5', 'Settlement &amp; Oversight', 'UC35–UC43', 'Figure 2.6', [[['UC35', 0], ['UC39', 1]]]],
    ['SD2', 'Batch &amp; Investment', 'UC07–UC16, UC49', 'Figure 2.3', [[['UC07', 0], ['UC10', 1]], [['UC12', 1]]]],
    ['SD3', 'Production, Evidence &amp; Harvest', 'UC17–UC22, UC44–UC48, UC52–UC53', 'Figure 2.4', [[['UC45', 0], ['UC47', 1]]]],
  ];
  const PK = {};
  let y = TOP;
  for (const [k, , , , rows] of PKGS) { const h = HEAD + rows.length * UH + (rows.length - 1) * RGAP + 10; PK[k] = { y, h }; y += h + PGAP; }
  const bottom = y - PGAP;
  d.vertex('CrabShare System', O.boundary, PX - 20, 70, PW + 40, bottom - 70 + 16, { key: 'boundary', container: true });
  for (const [k, name, range, fig, rows] of PKGS) {
    const { y: py, h } = PK[k];
    d.vertex(`<b>${k} · ${name}</b><br><font style="font-size:11px" color="#475569">${range} · ${fig}</font>`, O.pkg + 'fontSize=13;fillColor=#f8fafc;spacingTop=12;', PX, py, PW, h, { key: k, raw: true, container: true });
    rows.forEach((row, ri) => row.forEach(([id, col]) => {
      const [nm, delta, planned] = UCN[id];
      const cxu = col === 'mid' ? (colX[0] + colX[1]) / 2 : colX[col], yy = py + HEAD + ri * (UH + RGAP);
      const extra = planned ? `<br><font color="${GREY}"><i>«planned»</i></font>` : delta ? `<br><font color="${GREY}">(${delta} <i>«planned»</i>)</font>` : '';
      d.vertex(`<b>${id}</b> ${nm}${extra}`, O.uc + 'fontSize=11;' + (planned ? O.planned : ''), cxu - UW / 2, yy, UW, UH, { key: id, raw: true });
    }));
  }
  d.edge('UC10', 'UC12', O.include + 'align=left;spacingLeft=6;', { label: '«include»' });
  // UC54 «extend» UC55 (ngang, nhãn phía trên đường) và «extend» UC30 (dọc, nhãn bên phải)
  d.edge('UC54', 'UC55', O.include + O.plannedEdge + 'verticalAlign=bottom;', { label: '«extend»' });
  d.edge('UC54', 'UC30', O.include + O.plannedEdge + 'align=left;spacingLeft=6;', { label: '«extend»' });
  // actor và đường nối gói (như Figure 2.1); actor trong khe: y tính từ hai đường giới hạn khe
  const midY = Math.round((TOP + bottom) / 2), OPP = [90, midY], ADM = [1598, midY], RIGHT = PX + PW;
  const OPORT = { SD1: 0.5, SD4: 0.5, SD5: 0.5, SD2: 0.5, SD3: 0.5 }, APORT = { SD1: 0.4, SD4: 0.3, SD5: 0.72, SD2: 0.3, SD3: 0.62 };
  const portY = (k, fy) => PK[k].y + PK[k].h * fy;
  const lineAt = (from, toX, toY, x) => from[1] + (toY - from[1]) * (x - from[0]) / (toX - from[0]);
  const wedge = (from, edgeX, k1, f1, k2, f2, xL, xR, top, below) => {
    const up = k1 ? Math.max(lineAt(from, edgeX, portY(k1, f1), xL), lineAt(from, edgeX, portY(k1, f1), xR)) : -1e9;
    const lo = k2 ? Math.min(lineAt(from, edgeX, portY(k2, f2), xL), lineAt(from, edgeX, portY(k2, f2), xR)) : 1e9;
    if (k1 && k2 && lo - up < top + below + 12) WARN.push(`${d.name}: wedge ${k1}|${k2} too narrow (${Math.round(lo - up)} px)`);
    if (!k1) return Math.round(lo - below - 12);
    if (!k2) return Math.round(up + top + 12);
    return Math.round((up + top + lo - below) / 2);
  };
  const AX = 400, XW = 160, XX = 1144;
  const L = (k1, k2) => wedge(OPP, PX, k1, OPORT[k1], k2, OPORT[k2], AX - 20, AX + 20, 35, 53);
  const Rw = (k1, k2, h) => wedge(ADM, RIGHT, k1, k1 && APORT[k1], k2, k2 && APORT[k2], XX, XX + XW, h / 2, h / 2);
  const actor = (k, name, x, ay) => d.vertex(name, O.actor, x - 20, ay - 35, 40, 70, { key: k, raw: true });
  actor('a_op', 'Operator', OPP[0], OPP[1]);
  actor('a_adm', 'Platform<br>Administrator', ADM[0], ADM[1]);
  const cusY = L('SD1', 'SD4'), invY = L('SD5', 'SD2');
  actor('a_cus', 'Customer', AX, cusY);
  actor('a_inv', 'Investor', AX, invY);
  // generalization Investor → Customer (tam giác rỗng ở Customer): đi vòng bên trái hai actor, ra / vào ở đầu tay (1/3 chiều cao)
  const arm = (ay) => ay - 35 + 70 / 3, GX = AX - 50;
  d.edge('a_inv', 'a_cus', S.general + 'exitX=0;exitY=0.3333;exitPerimeter=0;entryX=0;entryY=0.3333;entryPerimeter=0;', { points: [[GX, arm(invY)], [GX, arm(cusY)]] });
  const ext = { x_ekyc: Rw(null, 'SD1', 62), x_psp: Rw('SD4', 'SD5', 62), x_sign: Rw('SD2', 'SD3', 62), x_sim: Rw('SD3', null, 70) };
  const frameTop = ext.x_ekyc - 31 - 50, frameBottom = ext.x_sim + 35 + 12;
  d.vertex('<b>External systems</b><br><font style="font-size:11px">(sandbox or simulated)</font>', O.group + 'fillColor=none;fontStyle=0;align=center;', XX - 12, frameTop, XW + 24, frameBottom - frameTop, { key: 'extframe', raw: true, container: true });
  const XN = { x_ekyc: 'eKYC Provider', x_psp: 'Payment Service Provider', x_sign: 'Digital Signature Service (Viettel)', x_sim: 'Farm Devices &amp; Cameras (simulated)' };
  for (const [k, ay] of Object.entries(ext)) {
    const planned = k === 'x_sim', h = planned ? 70 : 62;
    d.vertex(`«actor»<br><b>${XN[k]}</b>${planned ? '<br>' + PL : ''}`, O.ext + 'fontSize=11;' + (planned ? O.planned : ''), XX, ay - h / 2, XW, h, { key: k, raw: true });
  }
  // [actor, gói, cạnh trái/phải, vị trí dọc trên cạnh] — như Figure 2.1
  const links = [
    ...PKGS.map(([k]) => ['a_op', k, 'L', OPORT[k]]), ...PKGS.map(([k]) => ['a_adm', k, 'R', APORT[k]]),
    ['a_cus', 'SD1', 'L', 0.84], ['a_cus', 'SD4', 'L', 0.16],
    ['a_inv', 'SD1', 'L', 0.93], ['a_inv', 'SD4', 'L', 0.86], ['a_inv', 'SD5', 'L', 0.84], ['a_inv', 'SD2', 'L', 0.16], ['a_inv', 'SD3', 'L', 0.12],
    ['x_ekyc', 'SD1', 'R', 0.15], ['x_psp', 'SD4', 'R', 0.85], ['x_psp', 'SD5', 'R', 0.12], ['x_psp', 'SD2', 'R', 0.2], ['x_sign', 'SD2', 'R', 0.82], ['x_sim', 'SD3', 'R', 0.82],
  ];
  for (const [a, p, side, fy] of links) d.edge(a, p, O.assoc + (a === 'x_sim' ? O.plannedEdge : '') + `entryX=${side === 'L' ? 0 : 1};entryY=${fy};entryPerimeter=0;`);
  const leg2 = `<b>Notes</b> — Level 0 as in Figure 2.1: a line joins an actor to a subsystem it uses; each package shows 2–4 representative use cases of its range (55 codes in all, 50 in use; the full lists are in ${DET.usecase}). The Investor inherits the Customer use cases (generalization, hollow triangle at Customer) {not the Batch's Operator or its related parties}. UC10, UC27 and UC30 include UC12 Make Payment (only UC10 → UC12 drawn); UC40 Monitor Payout Reconciliation is a separate Administrator use case in SD5. UC54 Forfeit Deposit «extend» UC55 Cancel Bulk Pre-order {the Batch opened} and «extend» UC30 {the Customer refuses delivery or does not pay the balance}; in the UC30 case UC50 Record Invoiced Sale resells the crabs. UC21 View Production Timeline (SD3) is used by the Operator, the Investor and the Administrator. Background jobs are system behaviour, not actors. Dashed grey or «planned» = in Register v1.4, not on develop yet; "(… «planned»)" = the v1.4 part of an existing use case. Removed in v1.4, codes not reused: UC13, UC23, UC24, UC26, UC46.<br>${PENDING}`;
  d.vertex(leg2, O.legend, 40, bottom + 30, 1574, legendH(leg2, 1574, 64), { raw: true });
  d.check();
}

// =====================================================================================================
// O.4 Screen Flow — màn chính theo vai trò (web + mobile) và 1–2 luồng chính mỗi vai trò, nhãn là thao tác điều hướng (SF-01);
// màn không có mũi tên vào được từ menu của vai trò (ghi trên tiêu đề khung). Bỏ cửa hàng, giỏ hàng, tem (chỉ ghi ở chú thích).
function screenFlowPage(f) {
  const d = openPage(f, 'screen');
  const SW = 180, SH = 60, X0 = 330, PITCH = 250, GX = 310, GW = 1240;
  const cx = (c) => X0 + c * PITCH;
  const G = (k, title, y, h) => d.vertex(title, O.group + 'fontSize=12;', GX, y, GW, h, { key: k, raw: true, container: true });
  const SC = (k, c, y, text, opts = {}) => {
    const sub = opts.sub ? `<br><font color="#64748b">${opts.sub}</font>` : '';
    d.vertex(`${text}${opts.planned ? ' ' + PL : ''}${sub}`, O.box + 'fontSize=11;' + (opts.planned ? O.planned : ''), cx(c), y, SW, SH, { key: k, raw: true });
  };
  const F = (a, b, label = '', opts = {}) => d.edge(a, b, O.trans + (opts.planned ? O.plannedEdge : '') + (opts.style ?? ''), { label, raw: true, points: opts.points, labelPos: opts.labelPos });
  const pl = '<i>«planned»</i>';
  // ----- Public -----
  G('g_pub', '<b>Public</b> — no login', 80, 116);
  SC('landing', 0, 120, '<b>Landing</b>');
  SC('map', 1, 120, '<b>Farm &amp; batch map</b>', { planned: true, sub: 'farms delivering to an address' });
  SC('qrtrace', 3, 120, '<b>Order trace by QR</b>', { planned: true, sub: 'opened from the delivery-note QR' });
  // ----- Customer -----
  G('g_cus', '<b>Customer area</b> (Customer | Investor) — web<br><font style="font-size:11px">the menu reaches every screen</font>', 232, 132);
  SC('history', 0, 272, '<b>Order history</b>');
  SC('bulk', 1, 272, '<b>Bulk pre-order</b>', { planned: true, sub: 'crab count or kg, minimum quantity' });
  SC('preconfirm', 2, 272, '<b>Pre-order confirmation</b><br>deposit VietQR');
  SC('tracking', 3, 272, '<b>Order tracking</b> · receive · pay balance · return · complaint', { sub: `(balance on weighed kg ${pl})` });
  SC('rate', 4, 272, '<b>Rate order</b>');
  F('map', 'bulk', 'pre-order', { planned: true, style: 'exitX=0.8;exitY=1;entryX=0.8;entryY=0;align=left;spacingLeft=6;', labelPos: -0.4 });
  F('bulk', 'preconfirm', 'deposit', { planned: true });
  F('preconfirm', 'tracking', 'paid');
  F('tracking', 'rate', 'completed');
  F('history', 'tracking', 'open order', { style: 'exitX=0.5;exitY=1;entryX=0.5;entryY=1;', points: [[cx(0) + SW / 2, 346], [cx(3) + SW / 2, 346]] });
  // ----- Investor -----
  G('g_inv', '<b>Investor portal</b> (Investor) — web and mobile<br><font style="font-size:11px">the menu reaches every screen</font>', 384, 210);
  SC('explore', 0, 424, '<b>Explore offerings</b><br>Batch-level figures');
  SC('lot', 1, 424, '<b>Batch detail</b> · timeline · alerts');
  SC('rows', 2, 424, '<b>Box-row picker</b>', { planned: true, sub: 'one investor per row' });
  SC('contribute', 3, 424, '<b>Contribute</b>: disclosure → amount → contract → VietQR');
  SC('contracts', 4, 424, '<b>Contracts</b> (view, sign)');
  SC('portfolio', 0, 518, '<b>Portfolio</b>');
  SC('position', 1, 518, '<b>Position detail</b>');
  SC('ownboxes', 2, 518, '<b>Box details of own rows</b>', { planned: true });
  SC('settle', 3, 518, '<b>Settlement statements</b> · feedback');
  SC('profile', 4, 518, '<b>Profile</b> · eKYC · payout account');
  F('explore', 'lot', 'open');
  F('lot', 'rows', 'reserve', { planned: true });
  F('rows', 'contribute', '', { planned: true });
  F('lot', 'contribute', 'contribute (today)', { style: 'exitX=0.5;exitY=1;entryX=0.5;entryY=1;', points: [[cx(1) + SW / 2, 501], [cx(3) + SW / 2, 501]] });
  F('contribute', 'contracts', 'sign');
  F('portfolio', 'position', 'open');
  F('position', 'ownboxes', 'own rows', { planned: true });
  // ----- Operator -----
  G('g_op', '<b>Operator workspace</b> (OperatorMember) — web and mobile<br><font style="font-size:11px">the sidebar reaches every screen</font>', 614, 210);
  SC('oboxes', 0, 654, '<b>Boxes</b> · numbers, row codes');
  SC('ocreate', 1, 654, '<b>Create batch</b> · Standard Cost', { sub: `(box rows, prices, tiers ${pl})` });
  SC('oprice', 2, 654, '<b>Price range suggestion</b>', { planned: true });
  SC('obatch', 3, 654, '<b>Batch detail</b> · timeline · stocking');
  SC('olog', 4, 654, '<b>Daily log</b> · box events');
  SC('ocapture', 0, 748, '<b>Evidence capture</b><br>mobile, camera only');
  SC('oevidence', 1, 748, '<b>Flagged evidence</b> · explanation');
  SC('oharvest', 2, 748, '<b>Harvest per box</b>');
  SC('oorders', 3, 748, '<b>Orders</b> · deliver · returns', { sub: `(weighed kg, delivery-note QR ${pl})` });
  SC('oinvoice', 4, 748, '<b>Invoiced sales</b> (low-grade, resold) · final order', { planned: true });
  F('oboxes', 'ocreate', 'new batch');
  F('ocreate', 'oprice', 'price/kg', { planned: true });
  F('obatch', 'olog', 'log');
  F('oharvest', 'oorders', 'deliver');
  F('oorders', 'oinvoice', 'invoice', { planned: true });
  // ----- Admin -----
  G('g_adm', '<b>Admin console</b> (PlatformAdmin | EvidenceReviewer) — web<br><font style="font-size:11px">the sidebar reaches every screen</font>', 844, 116);
  SC('abatches', 0, 884, '<b>Batches to review</b>');
  SC('abatch', 1, 884, '<b>Batch detail</b> · approve', { sub: `(floor price, tiers ${pl})` });
  SC('aevidence', 2, 884, '<b>Evidence review queue</b>');
  SC('aevdetail', 3, 884, '<b>Evidence detail</b> · verdict');
  SC('afinance', 4, 884, '<b>Finance</b> · tranches · settlement · payouts');
  F('abatches', 'abatch', 'review');
  F('aevidence', 'aevdetail', 'open');
  // ----- Login -----
  d.vertex('<b>Login / Register</b><br>' + small('JWT · routed by role'), O.boxBlue, 40, 488, 210, 64, { key: 'login', raw: true });
  F('landing', 'login', 'sign in', { style: 'exitX=0;exitY=0.5;entryX=0.5;entryY=0;align=left;spacingLeft=6;', points: [[145, 150]] });
  for (const [first, y] of [['history', 302], ['explore', 454], ['oboxes', 684], ['abatches', 914]]) F('login', first, '', { style: 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;', points: [[290, 520], [290, y]] });
  const leg4 = `<b>Notes</b> — boxes are screens; an arrow is a navigation with its user action; every other screen of an area is reached from its menu. Mobile app (Flutter): Investor tabs home · batches · portfolio (own rows ${PL}) · eKYC · notifications; Operator tabs today · daily logs · box events · camera-only capture · harvest per box · deliveries; scanning an order QR opens the public trace page without login. Dashed grey or «planned» = in Register v1.4, not on develop; "(… «planned»)" = the v1.4 part of an existing screen. Removed in v1.4 (still in code, not drawn): store and listing pages, cart, checkout, pre-order by listing, tag pages and tag scanning. Detailed screens and routes: ${DET.screen}.<br>${PENDING}`;
  d.vertex(leg4, O.legend, GX, 980, GW, legendH(leg4, GW, 64), { raw: true });
  d.check();
}

// =====================================================================================================
// O.3 Conceptual ERD (v1.4) — 20 thực thể lõi, crow's foot, không thuộc tính; «planned» = nét đứt xám
// ProductionLog thuộc Batch; BoxRow thuộc Batch, gom các hộp được cấp theo row code, mỗi hàng một nhà đầu tư, như Figure 3.3
const CX = [60, 330, 600, 870, 1140, 1410], CY = [100, 240, 380, 520, 660, 800];
function conceptualPage(f) {
  const d = openPage(f, 'concept');
  const E = (k, name, c, r, planned = false) => d.vertex(planned ? `${name}<br>${PL}` : name, O.entity + (planned ? O.planned : ''), CX[c], CY[r], 190, 56, { key: k, raw: true });
  E('User', 'User', 0, 0); E('Operator', 'Operator', 1, 0); E('Box', 'Box', 2, 0); E('Evidence', 'Evidence', 3, 0);
  E('Investor', 'Investor', 0, 1); E('Contract', 'InvestmentContract', 1, 1); E('BoxRow', 'BoxRow', 2, 1, true); E('RemTier', 'RemunerationTier', 3, 1, true); E('Harvest', 'HarvestRecord', 4, 1);
  E('Contribution', 'Contribution', 1, 2); E('Batch', 'Batch', 2, 2); E('StandardCost', 'StandardCost', 3, 2);
  E('Settlement', 'Settlement', 0, 3); E('Payment', 'Payment', 1, 3); E('ProductionLog', 'ProductionLog', 2, 3); E('SalesOrder', 'SalesOrder', 3, 3); E('Invoice', 'Invoice', 4, 3, true);
  E('Tranche', 'DisbursementTranche', 1, 4); E('Customer', 'Customer', 3, 4); E('Qr', 'OrderQrCode', 4, 4, true);
  const R = (a, verb, b, ca, cb, pts, labelPos) => d.edge(a, b, O.er(card(ca), card(cb)), { label: verb, points: pts, labelPos });
  R('User', 'is', 'Investor', '1', '0..1');
  R('User', 'is', 'Customer', '1', '0..1', [[30, 128], [30, 758], [965, 758]]);
  R('Operator', 'is staffed by', 'User', '1', '1..N');
  R('Operator', 'numbers', 'Box', '1', '0..N');
  R('BoxRow', 'groups', 'Box', '0..N', '1..N');
  R('Box', 'is shown in', 'Evidence', '1', '0..N');
  R('Batch', 'records', 'ProductionLog', '1', '0..N');
  R('Box', 'is harvested in', 'Harvest', '1', '0..N');
  R('Operator', 'proposes', 'Batch', '1', '0..N', null, 0.5);
  R('Batch', 'is organised in', 'BoxRow', '1', '1..N');
  R('Contribution', 'reserves', 'BoxRow', '0..1', '1..N', null, -0.5);
  R('Investor', 'makes', 'Contribution', '1', '0..N');
  R('Contribution', 'is formalised by', 'Contract', '1', '0..1');
  R('Batch', 'receives', 'Contribution', '1', '0..N');
  R('Batch', 'is costed by', 'StandardCost', '1', '1..N');
  R('Batch', 'defines', 'RemTier', '1', '1..N');
  R('Batch', 'releases', 'Tranche', '1', '0..N');
  R('Batch', 'sells through', 'SalesOrder', '1', '0..N');
  R('Batch', 'is settled by', 'Settlement', '1', '0..1', null, 0.45);
  R('Settlement', 'pays out to', 'Investor', '0..N', '1..N');
  R('Settlement', 'issues', 'Payment', '1', '0..N');
  R('Contribution', 'is paid by', 'Payment', '1', '0..N');
  R('Tranche', 'is paid by', 'Payment', '1', '0..1');
  R('SalesOrder', 'is paid by', 'Payment', '1', '0..N', [[830, 600], [470, 600]]);
  R('Settlement', 'counts revenue of', 'SalesOrder', '0..1', '0..N', [[155, 630], [850, 630]]);
  R('Customer', 'places', 'SalesOrder', '0..1', '0..N');
  R('SalesOrder', 'is invoiced by', 'Invoice', '1', '0..1');
  R('SalesOrder', 'carries', 'Qr', '1', '0..1');
  R('Harvest', 'is delivered in', 'SalesOrder', '0..N', '0..1');
  const leg3 = `<b>Simplified view</b> — crow's foot notation, attributes omitted; dashed grey or «planned» = in Register v1.4, no table on develop. A BoxRow belongs to the Batch: it groups the boxes allocated to the Batch by their row code, and once confirmed it belongs to exactly one investor (one active RowAllocation: Held → Allocated → Released); a contribution's amount is the capital of its rows. SalesOrder.orderType is BulkPreOrder, InvoicedSale (saleReason LowGrade or ForfeitResale) or FinalOrder; every delivered order carries one Invoice; an invoiced order may go to an outside buyer, so Customer is optional. Payment groups PaymentRequest (VietQR money in: capital, deposit, balance, invoiced orders) and PaymentInstruction (refunds, tranche releases, payouts). StandardCost = locked cost version with line items and tranche plan. ProductionLog belongs to the Batch. Supporting v1.4 entities in the logical overview (${OF('logical')}): BoxAllocation, RowAllocation, BoxEvent, PreOrderQuota, PreOrderHold, RevenueLine, PriceObservation, PriceSuggestion, IngestionMessage. Removed in v1.4 (still in code, not drawn): ProductListing, Cart, OfftakeCommitment, CrabTag, water-quality thresholds. Full model: ${DET.concept} (areas ${DET.conceptAreas}).<br>${PENDING}`;
  d.vertex(leg3, O.legend, 60, 800, 1560, legendH(leg3, 1560, 84), { raw: true });
  d.check();
}

// =====================================================================================================
// O.7 Physical data areas — đúng V001–V017 (schema17); bảng của tính năng đã bỏ trong v1.4 chỉ ghi ở chú thích (G-02)
const REMOVED_TABLES = { A2: ['offtake_commitment', 'batch_offtake_price'], A3: ['production_threshold_version'], A4: ['crab_tag', 'tag_scan', 'product_listing', 'price_history', 'price_check'], A5: ['order_line', 'stock_reservation'] };
function physicalAreasPage(f) {
  const d = openPage(f, 'physical');
  const { tables, fks } = loadSchema();
  const missing = Object.keys(tables).filter(t => !areaOf[t]);
  if (missing.length) WARN.push('Data areas: tables outside any area: ' + missing.join(', '));
  const KEY = {
    A1: 'app_user · investor · customer · operator · physical_slot (row_code) · payout_account',
    A2: 'batch · standard_cost_version · contribution · investment_contract · disbursement_tranche · batch_account',
    A3: 'production_log · slot_event · crab_item · evidence · capture_request · alert',
    A4: 'harvest · harvest_record · product_grade',
    A5: 'sales_order · complaint · product_rating',
    A6: 'payment_request · provider_transaction · payment_instruction · settlement · settlement_line · audit_log',
  };
  for (const [a, list] of Object.entries(REMOVED_TABLES)) for (const t of list) if (!tables[t]) WARN.push(`Data areas: removed table ${t} (${a}) is not in the schema`);
  for (const t of ['batch_account', 'product_grade']) if (!tables[t]) WARN.push(`Data areas: key table ${t} is not in the schema`);
  const ROW = ['A2', 'A3', 'A4', 'A5', 'A6'], BW = 230, GAP = 90, X0 = 60, RY = 400, RH = 170;
  const POS = { A1: [X0, 120, ROW.length * BW + (ROW.length - 1) * GAP, 130] };
  ROW.forEach((k, i) => { POS[k] = [X0 + i * (BW + GAP), RY, BW, RH]; });
  for (const a of AREAS) {
    const n = a.tables.filter(t => tables[t]).length;
    const [x, y, w, h] = POS[a.key];
    d.vertex(`<b>${a.key} · ${a.title}</b><br><font style="font-size:12px">${n} tables</font><br>${small(KEY[a.key])}`, `rounded=1;whiteSpace=wrap;html=1;arcSize=6;fillColor=${a.fill};strokeColor=${a.stroke};fontSize=13;verticalAlign=top;spacingTop=8;spacing=8;${FONT}`, x, y, w, h, { key: a.key, raw: true });
  }
  const pair = {};
  for (const fk of fks) {
    const ca = areaOf[fk.child]?.key, pa = areaOf[fk.parent]?.key;
    if (!ca || !pa || ca === pa) continue;
    (pair[[ca, pa].sort().join('-')] ??= []).push(`${fk.child} → ${fk.parent}`);
  }
  const cx = (k) => POS[k][0] + POS[k][2] / 2;
  const lab = (k) => `${pair[k].length} FK${pair[k].length > 1 ? 's' : ''}`;
  const line = O.assoc + 'strokeWidth=1.5;fontSize=11;labelBackgroundColor=#ffffff;';
  const drawn = new Set();
  for (const k of ROW) {
    const p = ['A1', k].sort().join('-'); if (!pair[p]) continue;
    const ex = (cx(k) - POS.A1[0]) / POS.A1[2];
    d.edge('A1', k, line + `exitX=${ex.toFixed(4)};exitY=1;entryX=0.5;entryY=0;`, { label: lab(p) }); drawn.add(p);
  }
  for (let i = 0; i < ROW.length - 1; i++) {
    const p = [ROW[i], ROW[i + 1]].sort().join('-'); if (!pair[p]) continue;
    d.edge(ROW[i], ROW[i + 1], line + 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;', { label: lab(p) }); drawn.add(p);
  }
  const arcs = Object.keys(pair).filter(p => !drawn.has(p)).map(p => { const [u, v] = p.split('-').sort((x, y) => ROW.indexOf(x) - ROW.indexOf(y)); return { p, u, v, span: ROW.indexOf(v) - ROW.indexOf(u) }; })
    .sort((x, y) => x.span - y.span || ROW.indexOf(x.u) - ROW.indexOf(y.u));
  const outs = {}, ins = {};
  for (const r of arcs) { (outs[r.u] ??= []).push(r); (ins[r.v] ??= []).push(r); }
  const exitX = (r) => { const l = outs[r.u].slice().sort((x, y) => y.span - x.span); return (l.indexOf(r) + 1) / (l.length + 1); };
  const entryX = (r) => { const l = ins[r.v].slice().sort((x, y) => x.span - y.span); return (l.indexOf(r) + 1) / (l.length + 1); };
  arcs.forEach((r, i) => {
    const yd = RY + RH + 40 + i * 42;
    const x1 = POS[r.u][0] + POS[r.u][2] * exitX(r), x2 = POS[r.v][0] + POS[r.v][2] * entryX(r);
    d.edge(r.u, r.v, line + `exitX=${exitX(r).toFixed(3)};exitY=1;entryX=${entryX(r).toFixed(3)};entryY=1;`, { label: lab(r.p), points: [[x1, yd], [x2, yd]] });
  });
  const legendY = RY + RH + 60 + arcs.length * 42;
  const total = AREAS.reduce((s, a) => s + a.tables.filter(t => tables[t]).length, 0);
  const cross = Object.values(pair).reduce((s, l) => s + l.length, 0);
  const removed = Object.entries(REMOVED_TABLES).map(([a, l]) => `${l.join(', ')} (${a})`).join('; ');
  const leg7 = `<b>Reading the figure</b> — the database as built: ${total} tables of migrations V001–V017 grouped in 6 areas, with the main tables of each area; a line carries the number of foreign keys between two areas (${cross} of ${fks.length} FKs cross an area boundary). Batch (A2) is the hub every other area refers to. Tables of features removed in Register v1.4 (catalogue listing, retail cart, offtake window, per-crab tag, water-quality thresholds) are counted above and stay in the database script until the code changes, but are not listed: ${removed}. v1.4 entities with no table yet (BoxRow, RowAllocation, RemunerationTier, Invoice, OrderQrCode, RevenueLine, PriceObservation, PriceSuggestion, IngestionMessage) appear only in the logical overview, ${OF('logical')}. Full detail: ${DET.physical} and ${DET.physicalTable} (physical), ${DET.logical} and ${DET.logicalTable} (logical).`;
  d.vertex(leg7, O.legend, 60, legendY, 1520, legendH(leg7, 1520, 76), { raw: true });
  d.check();
  return pair;
}

// =====================================================================================================
// O.5 Component (System Overview) — rút gọn của Figure 4.1, cùng mã khối [C…], [X…], [D…], [I…], [M…]; giao thức ghi trên
// mọi connector như Figure 4.1 (AR-03); mỗi khối có giải thích
function componentPage(f) {
  const d = openPage(f, 'component');
  const B = (code) => `<b>[${code}]</b>`;
  const ball = (k, cx, cy, code, lx, ly) => { d.vertex('', O.iface, cx - 7, cy - 7, 14, 14, { key: k }); d.text(tiny(code, '#1e293b'), lx, ly, 30, 20, 'fontSize=11;'); };
  const AX = 500, AW = 680; // khung API: x 500 → 1180
  // ----- khách, simulator và dịch vụ phía trình duyệt -----
  d.vertex(`«external system» ${B('X7')} <b>Static web resources</b><br>${small('Google Fonts · landing-page photos')}`, O.compExt, 40, 80, 260, 52, { key: 'x7', raw: true });
  d.vertex(`«subsystem» ${B('C1')} Web App — React SPA on Vercel`, O.group, 40, 170, 260, 222, { key: 'web', raw: true, container: true });
  d.vertex(`<b>[C1.1, C1.2, C1.4–C1.7]</b><br>${small('auth · customer orders · investor portal · operator workspace · admin console · public trace page')}`, O.comp, 56, 216, 228, 100, { key: 'c1x', raw: true });
  d.vertex(`${B('C1.3')} <b>Farm map</b> ${PL}`, O.comp + O.planned, 56, 328, 228, 48, { key: 'c13', raw: true });
  d.vertex(`«external system» ${B('X6')} <b>Map tile service</b> ${PL}`, O.compExt + O.planned, 40, 442, 260, 50, { key: 'x6', raw: true });
  d.vertex(`«subsystem» ${B('C2')} <b>Mobile App</b> — Flutter<br>${small('investor tabs · operator tabs with live evidence · QR scan')}`, O.comp, 40, 512, 260, 84, { key: 'mob', raw: true });
  d.vertex(`«external system» ${B('X5')} <b>Device &amp; Camera Simulator</b> ${PL}`, O.compExt + O.planned, 40, 614, 260, 64, { key: 'sim', raw: true });
  // ----- API -----
  d.vertex(`«subsystem» ${B('C3')} CrabShare API — ASP.NET Core (.NET 10), modular monolith`, O.group, AX, 90, AW, 580, { key: 'api', raw: true, container: true });
  ball('i_rest', AX, 266, 'I1', AX - 30, 240);
  ball('i_ing', AX, 646, 'I2', AX - 30, 620);
  ball('i_hook', AX + AW, 150, 'I3', AX + AW + 6, 124);
  d.vertex(`${B('C3.1')} <b>REST controllers</b> (51 classes, 49 files)<br>${small('role policies · validation · CORS · errors')}`, O.comp, 530, 120, 400, 56, { key: 'c31', raw: true });
  d.vertex(`${B('C3.7')} <b>Dev-only endpoints</b><br>${small('/api/dev/* · OpenAPI')}`, O.comp, 950, 120, 210, 56, { key: 'c37', raw: true });
  d.vertex(`${B('C3.2')} <b>Feature modules</b> — 17 kept by v1.4<br>${small('Auth · Accounts · Operators · Boxes · Batches · Funding · Contracts · Payments · Settlement · Portfolio · Production · Evidence · Alerts · Harvest · Orders · Admin · Health')}`, O.comp, 530, 206, 400, 100, { key: 'c32', raw: true });
  d.vertex(`<b>Price Module</b> ${PL}`, O.comp + O.planned, 950, 206, 210, 30, { key: 'price', raw: true });
  d.vertex(`<b>Ingestion</b> ${PL}`, O.comp + O.planned, 950, 241, 210, 30, { key: 'ingest', raw: true });
  d.vertex(`<b>Farm Map query</b> ${PL}`, O.comp + O.planned, 950, 276, 210, 30, { key: 'farmq', raw: true });
  d.vertex(`${B('C3.3')} <b>Background jobs</b><br>${small('8 hosted jobs (v1.4)')}`, O.comp, 570, 336, 180, 70, { key: 'c33', raw: true });
  d.vertex(`${B('C3.4')} <b>Common</b><br>${small('auth · audit hash chain')}`, O.comp, 770, 336, 190, 70, { key: 'c34', raw: true });
  d.vertex(`${B('C3.5')} <b>Settlement engine</b><br>${small('pure library')}`, O.comp, 980, 336, 180, 70, { key: 'c35', raw: true });
  d.vertex(`${B('C3.6')} <b>Infrastructure adapters</b><br>${small('persistence (EF Core) · storage · payments · signing · eKYC · crab detection (no-op today) · security; providers run as in-process Fake adapters')}`, O.comp, 530, 436, 630, 124, { key: 'c36', raw: true });
  // ----- dữ liệu và hệ thống ngoài -----
  const EXX = 1380, EXW = 240;
  d.vertex(`${B('D1')} <b>SQL Server</b><br>${small('Azure SQL · LocalDB · 60 tables')}`, O.db, 525, 720, 220, 84, { key: 'd1', raw: true });
  d.vertex(`${B('D2')} <b>File storage</b><br>${small('/home/data/storage')}`, O.db, 760, 720, 220, 84, { key: 'd2', raw: true });
  d.vertex(`«external system» ${B('X4')} <b>Cloudinary</b><br>${small('evidence images')}`, O.compExt, 994, 726, 200, 70, { key: 'x4', raw: true });
  d.vertex(`«external system» ${B('X1')} <b>Payment intermediary</b><br>${small('VietQR · batch accounts · payouts · refunds (simulated)')}`, O.compExt, EXX, 430, EXW, 76, { key: 'x1', raw: true });
  d.vertex(`«external system» ${B('X2')} <b>Viettel digital signing</b><br>${small('simulated')}`, O.compExt, EXX, 522, EXW, 56, { key: 'x2', raw: true });
  d.vertex(`«external system» ${B('X3')} <b>eKYC provider</b><br>${small('simulated')}`, O.compExt, EXX, 594, EXW, 56, { key: 'x3', raw: true });
  d.vertex(`«artifact» ${B('M1')} <b>Crab detection model</b> ${PL}`, O.box + O.planned, EXX, 666, EXW, 56, { key: 'm1', raw: true });
  // ----- kết nối: giao thức trên đường liền (communication path), phụ thuộc nét đứt -----
  const RIGHTL = 'align=left;spacingLeft=6;';
  d.edge('c1x', 'i_rest', O.conn + 'exitX=1;exitY=0.5;', { label: 'HTTPS · JSON · Bearer JWT' });
  d.edge('mob', 'i_rest', O.conn + 'exitX=1;exitY=0.3;', { label: 'HTTPS · JSON · Bearer JWT', points: [[470, 537], [470, 272]], labelPos: -0.634 });
  d.edge('sim', 'i_ing', O.conn + O.plannedEdge + 'exitX=1;exitY=0.5;', { label: 'HTTPS POST · X-Api-Key «planned»' });
  d.edge('c13', 'x6', O.conn + O.plannedEdge + RIGHTL + 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;', { label: 'HTTPS tiles «planned»' });
  d.edge('web', 'x7', O.conn + RIGHTL + 'exitX=0.5;exitY=0;entryX=0.5;entryY=1;', { label: 'HTTPS GET' });
  d.edge('x1', 'i_hook', O.conn + 'exitX=0.85;exitY=0;', { label: 'HTTPS POST · HMAC-SHA256', points: [[EXX + EXW * 0.85, 150]] });
  d.edge('c31', 'c32', O.dep, { label: 'calls' });
  d.edge('c33', 'c32', O.dep + 'exitX=0.5;exitY=0;entryX=0.35;entryY=1;');
  d.edge('c32', 'c34', O.dep + 'exitX=0.7;exitY=1;entryX=0.5;entryY=0;');
  d.edge('c32', 'c35', O.dep + 'exitX=0.95;exitY=1;entryX=0.3;entryY=0;');
  d.edge('c32', 'c36', O.dep + 'exitX=0.03;exitY=1;entryX=0.019;entryY=0;', { label: 'use ports' });
  d.edge('c36', 'd1', O.conn + 'exitX=0.1667;exitY=1;entryX=0.5;entryY=0;', { label: 'TDS 1433 · TLS · Managed Identity', labelPos: -0.3 });
  d.edge('c36', 'd2', O.conn + 'exitX=0.5397;exitY=1;entryX=0.5;entryY=0;', { label: 'file I/O', labelPos: -0.3 });
  d.edge('c36', 'x4', O.conn + 'exitX=0.8952;exitY=1;entryX=0.5;entryY=0;', { label: 'HTTPS Upload API · signed URL', labelPos: -0.3 });
  d.edge('c36', 'x1', O.conn + 'exitX=1;exitY=0.15;entryX=0;entryY=0.5;', { label: 'REST/HTTPS (sandbox)', labelPos: 0.3 });
  d.edge('c36', 'x2', O.conn + 'exitX=1;exitY=0.4;entryX=0;entryY=0.5;', { label: 'REST/HTTPS (sandbox)', labelPos: 0.3 });
  d.edge('c36', 'x3', O.conn + 'exitX=1;exitY=0.65;entryX=0;entryY=0.5;', { label: 'REST/HTTPS (sandbox)', labelPos: 0.3 });
  d.edge('c36', 'm1', O.dep + O.plannedEdge + 'exitX=1;exitY=0.9;entryX=0;entryY=0.5;', { label: 'loads in-process «planned»', labelPos: 0.3 });
  d.vertex(`<b>Legend</b> — blue: CrabShare component · yellow: external system · cylinder: data store · ○ provided interface on the API border · dashed grey or «planned»: Register v1.4, not in code yet. Solid arrow = communication path, labelled with its protocol; dashed arrow = dependency or use. "Sandbox": the payment, signing and eKYC adapters run in-process as Fake adapters today. Codes are those of ${DET.component} and ${DET.componentTable}; the Farm Management System is no longer drawn (farm systems are represented by the simulator through the one Ingestion API).`, O.legend, 40, 702, 450, 120, { raw: true });
  explain(d, 'ex', `What each block does (codes as in ${DET.component} and ${DET.componentTable})`, [
    ['C1 Web App', 'React 19 + Vite single-page app on Vercel for all four roles; calls the API only through the shared HTTP client with the JWT.'],
    ['C1.3 Farm map', 'planned: the Customer picks on a map a farm whose delivery radius covers the address (UC25).'],
    ['C2 Mobile App', 'Flutter app for Investor and Operator: camera-only evidence with GPS, harvest per box, QR scan.'],
    ['X5 Device &amp; Camera Simulator', 'planned: posts photos, feeding, box events and logs through the Ingestion API in place of hardware (UC52).'],
    ['X6 Map tile service', 'planned: base map tiles for the farm map, loaded by the browser; provider not chosen.'],
    ['X7 Static web resources', 'Google Fonts and landing-page photos loaded directly by the browser; no user data is sent.'],
    ['I1 REST API', 'HTTPS, JSON, Bearer JWT with role policies; trace and health endpoints are anonymous.'],
    ['I2 Ingestion API', 'planned: POST /api/ingest/v1/* with an API key, idempotent by message id (IngestionMessage).'],
    ['I3 Payment webhook', 'signed (HMAC) transaction notice from the intermediary; each bank transaction is recorded once.'],
    ['C3.1 REST controllers', '51 controller classes in 49 files: input validation, role and Batch-scoped checks, errors as ProblemDetails.'],
    ['C3.2 Feature modules', 'vertical slices kept by v1.4; Price Module (range by season and holidays, MAPE, never a return), Ingestion and Farm Map query are planned.'],
    ['C3.3 Background jobs', 'eight hosted jobs kept by v1.4: reservation expiry, funding close with refunds, tranche schedule, order completion, complaint escalation, capture requests, alerts, audit-chain check; the final-order reminder is planned. The pre-order balance job is removed in v1.4 (still in code).'],
    ['C3.4 Common', 'JWT auth and policies, current user, append-only hash-chained audit log, alert port, errors, paging, exports.'],
    ['C3.5 Settlement engine', 'pure library: Revenue Pool, remuneration, largest-remainder payouts, loss cap; the tier cut is planned.'],
    ['C3.6 Infrastructure', 'ports and adapters: EF Core persistence, storage, payment, signing, eKYC, crab detection (no-op until the model exists), security.'],
    ['C3.7 Dev-only endpoints', 'simulated bank transfer, demo pre-orders and settlement helpers, OpenAPI; 404 outside Development.'],
    ['D1 SQL Server', 'Azure SQL in production, LocalDB in development; schema V001–V017 by DbMigrator.'],
    ['D2 File storage', 'App Service disk for contract PDFs and older uploads.'],
    ['X1 Payment intermediary', 'holds each Batch\'s account, VietQR collection, refunds and payouts; CrabShare never holds money; simulated.'],
    ['X2, X3 Viettel signing, eKYC', 'sequential contract signing and identity check (only the result is kept); both simulated.'],
    ['X4 Cloudinary', 'real image storage account for evidence photos, read back through short-lived signed URLs.'],
    ['M1 Crab detection model', 'planned: trained on labelled box photos, loaded in-process; it only says whether a crab is present and never rejects evidence alone.'],
  ], 40, 830, 1580, 11, 790);
  d.check();
}

// =====================================================================================================
// O.8 Deployment — rút gọn của Figure 4.4: ba môi trường local, preview (develop), production + CI/CD; cùng mã node [N…].
// Node đặt thấp hơn tiêu đề khung (AR-04); mọi communication path có nhãn giao thức như Figure 4.4.
function deploymentPage(f) {
  const d = openPage(f, 'deployment');
  const B = (code) => `<b>[${code}]</b>`;
  const N = (k, html, x, y, w, h, extra = '') => d.vertex(html, O.node + extra, x, y, w, h, { key: k, raw: true });
  const G = (k, title, x, y, w, h) => d.vertex(title, O.group, x, y, w, h, { key: k, raw: true, container: true });
  const EXTN = 'fillColor=#fef3c7;strokeColor=#b45309;';
  const RIGHTL = 'align=left;spacingLeft=6;', LEFTL = 'align=right;spacingRight=6;';
  // thiết bị người dùng
  N('n1', `${B('N1')} «device» <b>User PC</b><br>${small('browser runs the web SPA')}`, 40, 120, 260, 80);
  N('n14', `${B('N14')} <b>Map tile service</b> ${PL}`, 40, 232, 260, 60, EXTN + O.planned);
  N('n2', `${B('N2')} «device» <b>Android phone</b><br>${small('CrabShare APK · camera · GPS')}`, 40, 330, 260, 80);
  N('n3', `${B('N3')} «device» <b>demo machine</b> ${PL}<br>${small('Device &amp; Camera Simulator')}`, 40, 446, 260, 88, O.planned);
  // preview và production
  G('g_prev', 'Preview / staging (develop) — web only', 520, 90, 420, 130);
  N('n8', `${B('N8')} «cloud» <b>Vercel Preview</b><br>${small('develop alias · one URL per pull request')}`, 540, 132, 380, 72);
  G('g_prod', 'Production — Azure East Asia, crabshare-rg', 520, 240, 420, 380);
  N('n4', `${B('N4')} «cloud» <b>Vercel Production</b> — crabshare.vercel.app<br>${small('built from main')}`, 540, 282, 380, 72);
  N('n5', `${B('N5')} «cloud» <b>App Service crabshare-api</b><br>${small('Linux B1 · .NET 10 · HTTPS only · deployed from develop<br>API + jobs · /home/data (PDFs, keys) · Fake providers')}`, 540, 378, 380, 120);
  N('n6', `${B('N6')} «cloud» <b>Azure SQL crabshare</b><br>${small('Basic · V001–V017')}`, 540, 528, 380, 72);
  G('g_ext', 'External services', 520, 640, 420, 150);
  N('n7', `${B('N7')} «cloud» <b>Cloudinary</b>`, 540, 682, 150, 88, EXTN);
  N('n13', `${B('N13')} <b>Sandbox providers</b><br>${small('VietQR · Viettel · eKYC, simulated inside N5')}`, 710, 682, 210, 88, EXTN);
  // CI/CD
  G('g_ci', 'CI/CD — GitHub', 1120, 90, 420, 440);
  N('n9', `${B('N9')} «cloud» <b>GitHub repository</b><br>${small('main · develop · feature branches → pull request')}`, 1140, 132, 380, 70);
  N('n10', `${B('N10')} «executionEnvironment» <b>GitHub Actions</b><br>${small('ci.yml · deploy-backend.yml · deploy-web.yml (Vercel CLI) · release-mobile.yml · acceptance-tools.yml')}`, 1140, 250, 380, 150);
  N('n11', `${B('N11')} «cloud» <b>GitHub Releases</b><br>${small('draft demo APK')}`, 1140, 440, 380, 72);
  // local
  G('g_dev', 'Local development — each member\'s PC', 40, 810, 1500, 112);
  N('n12', `${B('N12')} «device» <b>Developer PC</b> — ${small('Vite :5173 · dotnet run :5233 (Development: demo seed, Fake providers) · LocalDB · Flutter emulator · optional Docker SQL · User Secrets')}`, 60, 852, 1460, 60);
  // đường truyền (nhãn như Figure 4.4)
  d.edge('n1', 'n8', O.conn + 'exitX=1;exitY=0.25;entryX=0;entryY=0.5;', { label: 'HTTPS GET (preview)' });
  d.edge('n1', 'n4', O.conn + 'exitX=1;exitY=0.55;entryX=0;entryY=0.5;', { label: 'HTTPS GET static · CDN' });
  d.edge('n1', 'n5', O.conn + 'exitX=1;exitY=0.85;entryX=0;entryY=0.2;', { label: 'HTTPS · JSON · Bearer JWT (CORS)' });
  d.edge('n1', 'n14', O.conn + O.plannedEdge + RIGHTL + 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;', { label: 'HTTPS tiles «planned»' });
  d.edge('n2', 'n5', O.conn + 'exitX=1;exitY=0.5;entryX=0;entryY=0.45;', { label: 'HTTPS · JSON · Bearer JWT' });
  d.edge('n3', 'n5', O.conn + O.plannedEdge + 'exitX=1;exitY=0.5;entryX=0;entryY=0.75;', { label: 'HTTPS POST /api/ingest/v1<br>«planned»', raw: true });
  d.edge('n5', 'n6', O.conn + 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;', { label: 'TDS 1433 · TLS · Managed Identity' });
  d.edge('n5', 'n7', O.conn + LEFTL + 'exitX=0;exitY=0.92;entryX=0;entryY=0.5;', { label: 'HTTPS Upload API · signed URL', points: [[505, 488.4], [505, 726]], labelPos: 0.35 });
  d.edge('n9', 'n10', O.conn + 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;', { label: 'push / pull_request triggers' });
  d.edge('n10', 'n8', O.conn + 'exitX=0;exitY=0.12;entryX=1;entryY=0.5;', { label: 'Vercel CLI preview · alias' });
  d.edge('n10', 'n4', O.conn + 'exitX=0;exitY=0.38;entryX=1;entryY=0.5;', { label: 'Vercel CLI --prod' });
  d.edge('n10', 'n5', O.conn + 'exitX=0;exitY=0.65;entryX=1;entryY=0.3;', { label: 'OIDC · zip deploy · smoke test' });
  d.edge('n10', 'n6', O.conn + 'exitX=0;exitY=0.9;entryX=1;entryY=0.5;', { label: 'DbMigrator · TDS/TLS' });
  d.edge('n10', 'n11', O.conn + 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;', { label: 'gh release create --draft' });
  d.edge('n12', 'n9', O.conn + 'exitX=1;exitY=0.5;entryX=1;entryY=0.5;', { label: 'git push · pull request', points: [[1560, 882], [1560, 167]], labelPos: -0.44 });
  explain(d, 'ex', `Environments and nodes (codes as in ${DET.deployment} and ${DET.deploymentTable})`, [
    ['Local / development', 'N12 on each PC: Vite dev server, the API in Development (demo seed, Fake providers, /scalar, /api/dev), LocalDB (DbMigrator --reset allowed only there), Flutter emulator. Deployed manually.'],
    ['Preview / staging (develop)', 'N8 only: deploy-web.yml on push to develop (fixed alias crabshare-develop-nguyn1hien.vercel.app) and on pull requests touching web/ (link in a PR comment). No separate staging API or database: previews call the production API N5.'],
    ['Production', 'N4 web from main (deploy-web.yml --prod); N5 API and N6 database from develop (deploy-backend.yml). Vercel\'s own Git integration is off (web/vercel.json).'],
    ['N1 User PC', 'downloads the SPA from Vercel, calls the API directly (CORS: production site and the preview pattern); planned map tiles from N14.'],
    ['N2 Android phone', 'release APK from N11 with API_URL and WEB_URL; camera and GPS for live evidence.'],
    ['N3 demo machine', 'planned: runs the Device &amp; Camera Simulator that posts to the Ingestion API of N5.'],
    ['N5 App Service', 'single API instance for production and previews; Always On for jobs; persistent /home/data; managed identity for SQL; payment, signing and eKYC are in-process Fake adapters (N13).'],
    ['N6 Azure SQL', 'Basic tier; the API reads and writes as [crabshare-api]; migrations only move forward, never --reset.'],
    ['N7, N13', 'Cloudinary stores evidence images (signed URLs); sandbox providers have no production accounts and are simulated inside N5.'],
    ['N9–N11 GitHub', 'PRs into develop must pass ci.yml; deploy-backend.yml logs in by OIDC, stops the app, runs DbMigrator, deploys, smoke-tests; release-mobile.yml makes a draft prerelease with the APK.'],
  ], 40, 940, 1580, 5, 790);
  d.check();
}

// =====================================================================================================
// State machine (chỉ trạng thái chính), cùng tên trạng thái với bộ chi tiết 4.8–4.28.
// «planned»: trạng thái / chuyển nét đứt xám kèm nhãn «planned» (G-02). Initial transition chỉ ghi "/ effect" (SM-04);
// điều kiện tạo ghi ở ghi chú. Phần v1.4 đã bỏ (ví dụ giá trị Paid của đơn đặt trước) chỉ ghi ở ghi chú.
const SM_LEGEND = '<br><i>Legend</i> — rounded box: state (grey fill: final-like state) · ● initial · ◉ final · label: trigger [guard] / effect · dashed grey with «planned»: Register v1.4, not in code yet. An initial transition carries only its effect; the creation conditions are written above.';
function statePage(f, m) {
  const d = openPage(f, m.pg);
  const W = m.w ?? 190, H = m.h ?? 56;
  const pos = {};
  // vùng: một máy trạng thái «planned» khác vẽ chung trang (như Figure 4.9 vẽ RowAllocation cạnh Contribution)
  for (const r of m.regions ?? []) d.vertex(r.title, O.state + O.planned + 'fillColor=none;arcSize=6;verticalAlign=top;align=left;spacingLeft=10;spacingTop=6;fontStyle=1;', r.x, r.y, r.w, r.h, { key: r.key, raw: true, container: true });
  for (const s of m.states) {
    const w = s.kind === 'choice' ? 130 : s.w ?? W, h = s.kind === 'choice' ? 72 : s.h ?? H;
    pos[s.id] = { x: s.x, y: s.y, w, h };
    const label = (s.label ?? s.id) + (s.code ? `<br>${tiny(s.code)}` : '') + (s.planned ? `<br>${PL}` : '');
    const style = s.kind === 'choice' ? O.decision : (s.final ? O.stateEnd : O.state) + (s.planned ? O.planned : '');
    d.vertex(label, style, s.x, s.y, w, h, { key: s.id, raw: true });
  }
  let n = 0;
  for (const t of m.trans) {
    const style = O.trans + (t.planned ? O.plannedEdge : '') + (t.style ?? '');
    const l = t.planned ? `«planned» ${t.l ?? ''}` : t.l ?? '';
    if (t.f === '[*]') {
      const k = 'ini' + n++;
      d.vertex('', O.start, t.x, t.y, 26, 26, { key: k });
      d.edge(k, t.t, style, { label: l, raw: true, points: t.pts, labelPos: t.lp });
    } else if (t.t === '[*]') {
      const k = 'fin' + n++;
      d.vertex('', O.end, t.x, t.y, 26, 26, { key: k });
      d.edge(t.f, k, style, { label: l, raw: true, points: t.pts, labelPos: t.lp });
    } else if (t.f === t.t) {
      const p = pos[t.f], top = (t.loop ?? 'top') === 'top', yy = top ? p.y - 40 : p.y + p.h + 40, ey = top ? 0 : 1;
      d.edge(t.f, t.t, style + `exitX=0.3;exitY=${ey};entryX=0.7;entryY=${ey};`, { label: l, raw: true, points: [[p.x + p.w * 0.3, yy], [p.x + p.w * 0.7, yy]] });
    } else d.edge(t.f, t.t, style, { label: l, raw: true, points: t.pts, labelPos: t.lp });
  }
  if (m.note) {
    const note = m.note + (m.pending ? '<br>' + PENDING : '') + SM_LEGEND, nw = m.noteW ?? 1300;
    d.vertex(note, O.note, m.noteX ?? 60, m.noteY, nw, Math.ceil(measure(note, 11, false, nw - 12 - 20).height + 22), { raw: true });
  }
  d.check();
}

const XS = [80, 440, 800, 1160];
const MACHINES = [
  {
    pg: 'smBatch', pending: true,
    states: [
      { id: 'Draft', x: XS[0], y: 300 }, { id: 'PendingApproval', x: XS[1], y: 300 }, { id: 'Funding', x: XS[2], y: 300 }, { id: 'InProduction', x: XS[3], y: 300 },
      { id: 'Rejected', x: XS[1], y: 130, final: true }, { id: 'Cancelled', x: XS[2], y: 130, final: true },
      { id: 'Harvesting', x: XS[3], y: 500 }, { id: 'Settlement', x: XS[2], y: 500 }, { id: 'Closed', x: XS[1], y: 500, final: true },
    ],
    trans: [
      { f: '[*]', t: 'Draft', x: 162, y: 170, l: '/ create batch' },
      { f: 'Draft', t: 'PendingApproval', l: 'submit' },
      { f: 'PendingApproval', t: 'Draft', l: 'return for revision', pts: [[535, 410], [175, 410]] },
      { f: 'PendingApproval', t: 'Rejected', l: 'reject' },
      { f: 'PendingApproval', t: 'Funding', l: 'approve / lock cost,<br>price, floor price' },
      { f: 'Funding', t: 'Cancelled', l: 'funding close [min viable capital<br>not reached or pre-order ratio<br>below the minimum ²] / refund<br>contributions and every deposit' },
      { f: 'Funding', t: 'InProduction', l: 'stocking<br>recorded ¹' },
      { f: 'InProduction', t: 'Harvesting', l: 'start harvest' },
      { f: 'Harvesting', t: 'Settlement', l: 'run settlement<br>calculation<br>[sales closed] ²' },
      { f: 'Settlement', t: 'Closed', l: 'all payouts<br>done' },
      { f: 'Rejected', t: '[*]', x: 700, y: 144 }, { f: 'Cancelled', t: '[*]', x: 1060, y: 144 }, { f: 'Closed', t: '[*]', x: 300, y: 514 },
    ],
    note: `Creation (UC07): an Approved Operator creates the batch on its boxes, grouped into box rows of the batch by their row code (box rows «planned»), with a Standard Cost. ¹ Stocked is transient: recording stocking moves Funding → Stocked → InProduction in one transaction; it needs capital closed and every contract fully signed, and only the boxes of funded rows are stocked (planned). ² Funding close (job): the batch opens when the confirmed capital reaches the minimum viable capital (as in code) and the pre-order ratio reaches the minimum set by the Administrator (planned); otherwise it is cancelled and contributions and every customer deposit are refunded (deposits planned). If capital closes between the minimum and the target, capital that cannot become boxes is refunded and settlement deducts the locked Standard Cost of the funded boxes only. Price per kg, floor price, survival threshold, remuneration tiers, delivery radius and sales window are approved and locked with the Standard Cost (planned); settlement starts after the sales window closes and the final order. Code today: capital closes at min_viable_capital with no pre-order check; pre-orders are taken only in InProduction. Rules live in the services; the database checks only the value list. Guards and effects: ${DET.smBatch}.`,
    noteY: 620,
  },
  {
    pg: 'smContribution', pending: true,
    regions: [{ key: 'rg_row', title: 'RowAllocation «planned» — one per picked box row', x: 1130, y: 120, w: 490, h: 440 }],
    states: [
      { id: 'Reserved', x: 300, y: 260 }, { id: 'Confirmed', x: 720, y: 260 }, { id: 'Expired', x: 300, y: 470, final: true }, { id: 'Refunded', x: 720, y: 470, final: true },
      { id: 'Held', x: 1305, y: 220, w: 140, h: 50, planned: true }, { id: 'Allocated', x: 1150, y: 400, w: 140, h: 50, planned: true }, { id: 'Released', x: 1460, y: 400, w: 140, h: 50, planned: true, final: true },
    ],
    trans: [
      { f: '[*]', t: 'Reserved', x: 382, y: 130, l: '/ reserve' },
      { f: 'Reserved', t: 'Confirmed', l: 'payment matched<br>(webhook)' },
      { f: 'Reserved', t: 'Expired', l: '30-min hold ends<br>or cancel' },
      { f: 'Confirmed', t: 'Refunded', l: 'batch does not<br>open / refund' },
      { f: 'Confirmed', t: '[*]', x: 1060, y: 274, l: 'batch<br>closed' },
      { f: 'Expired', t: '[*]', x: 382, y: 600 }, { f: 'Refunded', t: '[*]', x: 802, y: 600 },
      { f: '[*]', t: 'Held', x: 1362, y: 158 },
      { f: 'Held', t: 'Allocated', l: 'contribution<br>Confirmed', planned: true },
      { f: 'Held', t: 'Released', l: 'contribution<br>Expired', planned: true },
      { f: 'Allocated', t: 'Released', l: 'batch not<br>opened / refund<br>created', planned: true },
      { f: 'Allocated', t: '[*]', x: 1207, y: 506, l: 'batch Closed', planned: true, style: 'align=left;spacingLeft=6;' },
      { f: 'Released', t: '[*]', x: 1517, y: 506 },
    ],
    note: `Creation (UC10): a reservation is made only by an eKYC-verified investor who has acknowledged the risk disclosure (UC11), within the batch limits. Order in the code (web wizard): read the risk disclosure → amount and reserve → contract → VietQR → done; contract and payment do not block each other. The hold lasts 30 minutes (Funding:ReservationMinutes), capped at the funding deadline, one open hold per investor and batch, checked under a row lock so the cap is never exceeded. A payment that arrives after expiry is booked as a late payment and refunded automatically. Confirmed contributions are snapshotted into capital shares when capital closes. Box rows (planned): a BoxRow belongs to the batch (its boxes grouped by row code); the investor picks free rows, the amount is their capital (boxes × Standard Cost per box) and the minimum contribution is one row. RowAllocation, drawn on the right as in ${DET.smContribution}: each picked row is Held during the reservation, Allocated when the contribution is Confirmed (a confirmed row belongs to exactly one investor, at most one active allocation per row) and Released when the contribution expires or the batch does not open; today a reservation holds only an amount and there is no table.`,
    noteY: 650, noteW: 1560,
  },
  {
    pg: 'smContract',
    states: [{ id: 'Draft', x: 260, y: 300 }, { id: 'OperatorSigned', x: 640, y: 300 }, { id: 'FullySigned', x: 1020, y: 300, final: true }, { id: 'Void', x: 450, y: 500, final: true }],
    trans: [
      { f: '[*]', t: 'Draft', x: 100, y: 314, l: '/ create ¹' },
      { f: 'Draft', t: 'OperatorSigned', l: 'Operator signs<br>(Viettel)' },
      { f: 'OperatorSigned', t: 'FullySigned', l: 'Investor signs' },
      { f: 'Draft', t: 'FullySigned', l: 'offline upload (Admin)', pts: [[355, 210], [1115, 210]] },
      { f: 'Draft', t: 'Void', l: 'voided ²' },
      { f: 'OperatorSigned', t: 'Void', l: 'voided ²' },
      { f: 'FullySigned', t: '[*]', x: 1102, y: 440 }, { f: 'Void', t: '[*]', x: 720, y: 514 },
    ],
    note: `¹ Created from the active template when the investor reaches the contract step, while the hold is valid or after payment (contribution Reserved or Confirmed); signing does not block payment. ² Voided when the hold expires or is cancelled, or when the batch is cancelled; a FullySigned contract is kept as a record. Signing order is fixed: Operator first, then Investor (wrong order → 422). Stocking needs every Confirmed contribution FullySigned. Register v1.4: the loss rule, floor price and remuneration tiers go into the template before funding opens (planned). Details: ${DET.smContract}.`,
    noteY: 620, noteW: 1100,
  },
  {
    // khớp Figure 4.13 và DisbursementService.cs: release chỉ từ Requested; NeedsExplanation → Requested (xin lại); không có tự chặn
    pg: 'smTranche',
    states: [{ id: 'Planned', x: 100, y: 300 }, { id: 'Requested', x: 480, y: 300 }, { id: 'Released', x: 860, y: 300, final: true }, { id: 'NeedsExplanation', x: 480, y: 520 }, { id: 'Blocked', x: 1240, y: 520, final: true }],
    trans: [
      { f: '[*]', t: 'Planned', x: 182, y: 170, l: '/ created on batch approval,<br>one per planned tranche' },
      { f: 'Planned', t: 'Requested', l: 'request (Operator)<br>[milestone gate passes]' },
      { f: 'Requested', t: 'Released', l: 'release (Admin)<br>[gate re-checked]<br>/ disbursement instruction' },
      { f: 'Requested', t: 'NeedsExplanation', l: 'need explanation (Admin)<br>[reason] / deadline +72 h', style: 'exitX=0.3;exitY=1;entryX=0.3;entryY=0;align=right;spacingRight=6;' },
      { f: 'NeedsExplanation', t: 'Requested', l: 'request again (Operator)<br>[gate passes]', style: 'exitX=0.7;exitY=0;entryX=0.7;entryY=1;align=left;spacingLeft=6;' },
      { f: 'Requested', t: 'Blocked', l: 'block (Admin) [reason]', pts: [[575, 230], [1335, 230]] },
      { f: 'NeedsExplanation', t: 'Blocked', l: 'block (Admin) [reason]' },
      { f: 'Released', t: '[*]', x: 1110, y: 315 }, { f: 'Blocked', t: '[*]', x: 1500, y: 535 },
    ],
    note: `Gate for a request: the previous tranche is Released and its planned date is reached; tranche 1 needs capital closed and contracts signed; later tranches need stocking, Accepted or Watch evidence since the last tranche and nothing Flagged; tranche 3 onwards needs the harvest date declared. Release needs Requested: after an explanation the Operator requests again; there is no direct NeedsExplanation → Released. The 72-hour deadline is informational: no job blocks a tranche automatically. Release creates a disbursement payment instruction within the confirmed capital. A Blocked tranche stops the later ones; unblocking has no API. TrancheScheduleJob resolves the planned date from anchors (funding ready, stocked + offset days) without changing the status. Unchanged by Register v1.4. Details: ${DET.smTranche}; sequence ${DET.seqDisburse}.`,
    noteY: 650, noteW: 1440,
  },
  {
    pg: 'smSettlement', pending: true,
    w: 170,
    states: [
      { id: 'Draft', x: 200, y: 300 }, { id: 'Proposed', x: 500, y: 300 }, { id: 'Approved', x: 800, y: 300 }, { id: 'PaidOut', x: 1100, y: 300 }, { id: 'Closed', x: 1400, y: 300, final: true },
      { id: 'Disputed', x: 500, y: 490 },
    ],
    trans: [
      { f: '[*]', t: 'Draft', x: 70, y: 314, l: '/ run<br>calculation' },
      { f: 'Draft', t: 'Draft', l: 'recalculate' },
      { f: 'Draft', t: 'Proposed', l: 'publish<br>(7–14 days)' },
      { f: 'Proposed', t: 'Disputed', l: 'investor<br>feedback', pts: [[540, 420]] },
      { f: 'Disputed', t: 'Proposed', l: 'Admin<br>answers', pts: [[630, 420]] },
      { f: 'Proposed', t: 'Approved', l: 'approve after<br>window ends' },
      { f: 'Approved', t: 'PaidOut', l: 'all payouts<br>succeeded' },
      { f: 'PaidOut', t: 'Closed', l: '/ batch<br>Closed' },
      { f: 'Closed', t: '[*]', x: 1472, y: 440 },
    ],
    note: `Creation (UC38 Run Settlement Calculation): the Administrator runs the calculation once the sales window has closed; the settlement engine computes the Pool and the lines. Revenue (Register v1.4) = revenue lines DeliveredOrder (past the return window), InvoicedSale (low-grade or resold crabs), ForfeitedDeposit (counted once) and FinalOrder (≥ floor price); the code counts completed orders + forfeited offtake deposits − refunds, so the new revenue types are planned. Revenue Pool = revenue − locked Standard Cost of the funded boxes; savings, including an unused mortality reserve, stay with the Operator and never enter the Pool. Survival rate = 1 − deaths during farming ÷ crabs first stocked in the funded boxes (restocked crabs that die count; deaths in transit only lower revenue). Operator remuneration = floor(Pool × rate) only when Pool > 0, cut by tier when survival falls below the threshold (tiers planned; the code uses a fixed %). The rest is split pro rata to capital with largest-remainder rounding; a negative Pool is shared pro rata, each loss capped at the capital. Approval locks the statement (database trigger) and creates the payout instructions; closing also closes the batch. Details: ${DET.smSettlement}.`,
    noteY: 640,
  },
  {
    // khớp Figure 4.17 đợt 2: tên giá trị đúng, Cancelled không còn là trạng thái cuối (cọc đã trả thì hoàn hoặc mất), không có CancelRequested
    pg: 'smOrder', pending: true,
    w: 170,
    states: [
      { id: 'PendingPayment', x: 50, y: 300 }, { id: 'DepositPaid', x: 330, y: 300 }, { id: 'Confirmed', x: 610, y: 300, planned: true }, { id: 'Packed', x: 890, y: 300 }, { id: 'Shipping', x: 1170, y: 300 }, { id: 'Delivered', x: 1450, y: 300 },
      { id: 'Cancelled', x: 50, y: 540 }, { id: 'Refunded', x: 400, y: 540, final: true, planned: true }, { id: 'Forfeited', x: 890, y: 540, final: true, planned: true }, { id: 'Returned', x: 1170, y: 540, final: true }, { id: 'Completed', x: 1450, y: 540, final: true },
    ],
    trans: [
      { f: '[*]', t: 'PendingPayment', x: 122, y: 170, l: '/ place bulk pre-order' },
      { f: 'PendingPayment', t: 'DepositPaid', l: 'deposit<br>webhook' },
      { f: 'PendingPayment', t: 'Cancelled', l: 'after(15 min) or cancel<br>/ hold released' },
      { f: 'DepositPaid', t: 'Confirmed', l: '<br>batch opens', planned: true },
      { f: 'DepositPaid', t: 'Cancelled', l: 'cancel [batch still<br>Funding] / deposit kept', planned: true, lp: -0.3 },
      { f: 'DepositPaid', t: 'Refunded', l: 'batch Cancelled<br>/ deposit refunded', planned: true },
      { f: 'Cancelled', t: 'Refunded', l: 'batch Cancelled<br>[deposit paid]<br>/ refunded', planned: true, style: 'exitX=1;exitY=0.3;entryX=0;entryY=0.3;' },
      { f: 'Cancelled', t: 'Forfeited', l: 'batch opens [deposit paid] / deposit forfeited', planned: true, style: 'exitX=1;exitY=0.85;entryX=0.25;entryY=1;', pts: [[250, 587.6], [250, 632], [932.5, 632]] },
      { f: 'Cancelled', t: '[*]', x: 122, y: 680, l: '[no deposit paid] «planned»', style: 'fontColor=#64748b;align=left;spacingLeft=6;' },
      { f: 'Confirmed', t: 'Packed', l: 'prepare<br>delivery note<br>/ order QR', planned: true },
      { f: 'Confirmed', t: 'Forfeited', l: 'cancel<br>[batch opened]<br>/ deposit forfeited', planned: true },
      { f: 'Packed', t: 'Shipping', l: 'ship [ETA<br>within 7 days]' },
      { f: 'Shipping', t: 'Shipping', l: 'record weighedKg / balance QR', planned: true },
      { f: 'Shipping', t: 'Delivered', l: 'deliver or<br>receive' },
      { f: 'Shipping', t: 'Forfeited', l: 'refuse delivery<br>or no balance<br>/ deposit forfeited', planned: true },
      { f: 'Delivered', t: 'Completed', l: 'after(return window)<br>[no active complaint]' },
      { f: 'Delivered', t: 'Returned', l: 'return in window or full<br>complaint refund / refund' },
      { f: 'Refunded', t: '[*]', x: 600, y: 555, style: 'exitX=1;exitY=0.5;' }, { f: 'Forfeited', t: '[*]', x: 962, y: 680 },
      { f: 'Returned', t: '[*]', x: 1242, y: 680 }, { f: 'Completed', t: '[*]', x: 1522, y: 680 },
    ],
    note: `Same state names as ${DET.smOrder} (sales_order.status, order type BulkPreOrder); there is no CancelRequested state. Creation (UC27): a Customer, or an Investor who is not the batch's Operator or one of its members, places the order while enough crabs are left on the batch capacity, so the batch is never oversold (PendingPayment holds the crabs, PreOrderHold planned); Register v1.4 adds (planned): only while the batch is funding, by crab count (or kg) from the minimum quantity, with an address within the farm's delivery radius. Deposit rules (UC55, UC54, ${DET.seqForfeit}): (a) a Customer who cancels after paying while the batch is Funding goes to Cancelled and the deposit is kept; it is forfeited when the batch opens, and a cancel after the batch opened forfeits it at once; (b) if the batch does not open, every paid deposit is refunded, cancelled orders included; (c) refusing the delivery or not paying the balance forfeits the deposit and the crabs are resold through an InvoicedSale (saleReason ForfeitResale, ${DET.smInvoiced}); (d) cancelling before the deposit is paid costs nothing. A forfeited deposit counts once as batch revenue (ForfeitedDeposit). The order QR code is issued when the Operator prepares the delivery note. Balance = weighedKg × price per kg − deposit; weighedKg counts the live crabs the Customer accepts, transitLossKg is only recorded, and a negative balance is refunded. InvoicedSale and FinalOrder orders go PendingPayment → Completed (${DET.smInvoiced}). A complaint is a separate record (${DET.smComplaint}); an active complaint blocks completion and returns. Removed in v1.4 (still in code, not drawn): order type PreOrder on a listing while the batch is InProduction, the Paid value (DepositPaid → Paid → Packed, balance asked for when harvesting starts) and tag-scan packing.`,
    noteX: 50, noteY: 730, noteW: 1570,
  },
  {
    pg: 'smEvidence',
    states: [
      { id: 'risk', kind: 'choice', label: 'risk score', x: 250, y: 288 },
      { id: 'Accepted', x: 560, y: 130, final: true }, { id: 'Watch', x: 560, y: 296 }, { id: 'Flagged', x: 560, y: 462 }, { id: 'Rejected', x: 980, y: 380, final: true },
    ],
    trans: [
      { f: '[*]', t: 'risk', x: 110, y: 311, l: '/ upload<br>photo' },
      { f: 'risk', t: 'Accepted', l: '[&lt; 20]' },
      { f: 'risk', t: 'Watch', l: '[20–69]' },
      { f: 'risk', t: 'Flagged', l: '[≥ 70]' },
      { f: 'Watch', t: 'Accepted', l: 'Pass' },
      { f: 'Watch', t: 'Flagged', l: 'need more<br>evidence' },
      { f: 'Watch', t: 'Rejected', l: 'Fail' },
      { f: 'Flagged', t: 'Rejected', l: 'Fail' },
      { f: 'Flagged', t: 'Accepted', l: 'Pass', pts: [[820, 490], [820, 158]] },
      { f: 'Flagged', t: 'Flagged', l: 'Operator explains', loop: 'bottom' },
      { f: 'Accepted', t: '[*]', x: 642, y: 40 }, { f: 'Rejected', t: '[*]', x: 1250, y: 395 },
    ],
    note: `Creation (UC45): a live photo taken in the app (server time, place, box number), or sent by the simulated farm devices and cameras through the common data channel (planned). Risk score from an exact or similar reused photo (perceptual hash), a stale capture time and the crab detection module (planned; it only says whether a crab is present and never rejects a photo on its own). Watch and Flagged go to a person, the Platform Administrator with the Evidence Reviewer permission, never on a batch they invested in. Accepted evidence feeds the box timeline and the tranche gate; Flagged evidence blocks tranche release. Details: ${DET.smEvidence}.`,
    noteY: 620, noteW: 1100,
  },
];
// =====================================================================================================
// Activity có swimlane — mọi luồng là đường thẳng có điểm gãy (được bộ kiểm tra soát), mức nghiệp vụ
// node: [key, lane, row, kind, text, opts]; kind: start end flowEnd action sys ext decision merge object time fork join
// edge: [from, to, label, route ('hv' mặc định khi khác làn, 'vh', 'straight' hoặc mảng điểm)]
function activity(d, A) {
  const widths = A.widths ?? A.lanes.map(() => A.laneW ?? 240);
  const x0 = A.x0 ?? 40, top = A.top ?? 66, headH = 36, rowH = A.rowH ?? 58;
  const lx = widths.map((_, i) => x0 + widths.slice(0, i).reduce((s, w) => s + w, 0));
  const rows = Math.max(...A.nodes.map(n => n[2])) + 1;
  // A.rowGaps: các hàng (thường là hàng có quyết định rẽ thẳng xuống) được thêm khoảng trống phía dưới để đặt nhãn guard
  const extra = (r) => (A.rowGaps ?? []).filter(g => g < r).length * 0.45 * rowH;
  const laneH = headH + rows * rowH + extra(rows) + 16;
  A.lanes.forEach((n, i) => d.vertex(n, O.lane, lx[i], top, widths[i], laneH, { key: 'lane' + i, raw: true, container: true }));
  const cxL = (l) => lx[l] + widths[l] / 2;
  const cyR = (r) => top + headH + 10 + r * rowH + extra(r) + 24;
  const G = {};
  for (const [k, lane, r, kind, text = '', o = {}] of A.nodes) {
    let w = o.w ?? widths[lane] - 40, h = o.h ?? 48, style = { sys: O.sysAction, ext: O.extAction }[kind] ?? O.action, val = text;
    if (kind === 'start' || kind === 'end' || kind === 'flowEnd') { w = h = 26; style = { start: O.start, end: O.end, flowEnd: O.flowEnd }[kind]; val = ''; }
    if (kind === 'decision') { w = o.w ?? 160; h = o.h ?? 56; style = O.decision; }
    if (kind === 'merge') { w = h = 30; style = O.decision; val = ''; }
    if (kind === 'object') { w = o.w ?? widths[lane] - 50; h = o.h ?? 40; style = O.objectNode; }
    if (kind === 'time') { w = 26; h = 34; style = O.timeEvent; }
    if (kind === 'fork' || kind === 'join') { h = 6; style = O.bar; val = ''; }
    if (o.planned) { style += O.planned; if (val) val += ` ${PL}`; }
    let x = cxL(lane) - w / 2 + (o.dx ?? 0), y = cyR(r) - h / 2;
    if (kind === 'fork' || kind === 'join') { const [l1, l2] = o.span; x = cxL(l1) - 60; w = cxL(l2) - cxL(l1) + 120; }
    d.vertex(val, style, x, y, w, h, { key: k, raw: true });
    G[k] = { x, y, w, h, cx: x + w / 2, cy: y + h / 2, kind, planned: !!o.planned };
  }
  // phần tử thứ 5 (tuỳ chọn) của cạnh: { lp } = vị trí nhãn dọc theo cạnh (−1 … 1)
  for (const [a, b, label = '', route, eo = {}] of A.edges) {
    const P = G[a], Q = G[b];
    if (!P || !Q) { WARN.push(`${d.name}: activity edge ${a} → ${b} has an unknown node`); continue; }
    let style = O.flow + (P.planned || Q.planned ? O.plannedEdge : ''), points;
    if (P.kind === 'fork' || P.kind === 'join') style += `exitX=${((Q.cx - P.x) / P.w).toFixed(4)};exitY=1;entryX=0.5;entryY=0;`;
    else if (Q.kind === 'fork' || Q.kind === 'join') style += `exitX=0.5;exitY=1;entryX=${((P.cx - Q.x) / Q.w).toFixed(4)};entryY=0;`;
    else if (route === 'down') style += `exitX=0.5;exitY=1;entryX=${((P.cx - Q.x) / Q.w).toFixed(4)};entryY=0;`;
    else if (typeof route === 'function') points = route(G, { cxL, cyR, lx, widths });
    else if (Array.isArray(route)) points = route;
    else if (Math.abs(P.cx - Q.cx) > 1 && Math.abs(P.cy - Q.cy) > 1 && route !== 'straight') points = route === 'vh' ? [[P.cx, Q.cy]] : [[Q.cx, P.cy]];
    d.edge(a, b, style, { label, raw: true, points, labelPos: eo.lp });
  }
  return { G, cxL, cyR, lx, widths, bottom: top + laneH, right: lx[lx.length - 1] + widths[widths.length - 1] };
}
// Cột ghi chú bên phải trang activity: truy vết + chỗ lệch code / Phiếu v1.4
function activityNotes(d, x, y, w, notes, gaps) {
  const hOf = (html) => Math.ceil(measure(html, 11, false, w - 24).height + 26); // spacing 8 hai phía + lề, như bộ kiểm tra chữ
  const n1 = hOf(notes);
  d.vertex(notes, O.legend + 'spacing=8;', x, y, w, n1, { key: 'notes', raw: true });
  const n2 = hOf(gaps);
  d.vertex(gaps, O.note + 'spacing=8;', x, y + n1 + 16, w, n2, { key: 'gaps', raw: true });
  const leg = '<b>Legend</b> — green: human action · blue: system action · yellow: external system · diamond: decision with guards, or merge · bar: fork / join · orange box: object with state · hourglass (collate) shape: time event · ◉ activity final · ⊗ flow final · dashed grey with «planned»: Register v1.4, not in code yet.';
  d.vertex(leg, O.legend + 'spacing=8;', x, y + n1 + n2 + 32, w, hOf(leg), { key: 'legend', raw: true });
}

// =====================================================================================================
// O.17 Activity tổng quát — một lô từ đề xuất đến đóng (gộp WF-01 … WF-05), đúng thứ tự góp vốn trong code
function activityOverviewPage(f) {
  const d = openPage(f, 'actAll');
  const A = activity(d, {
    lanes: ['Operator', 'Platform Administrator', 'CrabShare System', 'Investor', 'Customer'], laneW: 230, x0: 170, rowH: 56, rowGaps: [10],
    nodes: [
      ['s', 0, 0, 'start'],
      ['a1', 0, 1, 'action', 'Register farm and numbered boxes (row codes)'],
      ['a2', 1, 2, 'action', 'Approve operator'],
      ['a3', 0, 3, 'action', 'Create batch by box rows; cost, price, floor price, tiers'],
      ['a4', 1, 4, 'action', 'Approve batch, floor price and tiers'],
      ['a5', 2, 5, 'sys', 'Lock Standard Cost and prices; open funding'],
      ['f1', 2, 6, 'fork', '', { span: [2, 4] }],
      ['i1', 3, 7, 'action', 'eKYC, risk acknowledgement, pick box rows, reserve'],
      ['c1', 4, 7, 'action', 'Find a farm on the map; pre-order by crab count'],
      ['i2', 3, 8, 'action', 'Sign the contract and pay by VietQR (either order)'],
      ['c2', 4, 8, 'action', 'Pay the deposit by VietQR'],
      ['j1', 2, 9, 'join', '', { span: [2, 4] }],
      ['d1', 2, 10, 'decision', 'min viable capital<br>and pre-order<br>ratio ≥ min?', { w: 200, h: 70 }],
      ['a6', 0, 11, 'action', 'Stock the funded boxes; daily logs; live evidence'],
      ['x1', 2, 11, 'sys', 'Cancel; refund contributions and every deposit'],
      ['e1', 2, 12, 'end'],
      ['a7', 2, 13, 'sys', 'Score evidence; alerts, capture requests'],
      ['a8', 1, 14, 'action', 'Review flagged evidence; release tranches'],
      ['a9', 0, 15, 'action', 'Record harvest per box; deliver and weigh'],
      ['a10', 4, 16, 'action', 'Check crabs, pay the balance, scan the QR'],
      ['a11', 0, 17, 'action', 'Invoiced sales (low-grade, resold); final order ≥ floor price', { planned: true }],
      ['a12', 1, 18, 'action', 'Calculate and publish the settlement'],
      ['a13', 3, 19, 'action', 'Review the statement; optional feedback'],
      ['a14', 1, 20, 'action', 'Approve and pay out'],
      ['a15', 2, 21, 'sys', 'Close the batch'],
      ['e2', 2, 22, 'end'],
    ],
    edges: [
      ['s', 'a1'], ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a4'], ['a4', 'a5'], ['a5', 'f1'], ['f1', 'i1'], ['f1', 'c1'], ['i1', 'i2'], ['c1', 'c2'], ['i2', 'j1'], ['c2', 'j1'], ['j1', 'd1'],
      ['d1', 'a6', '[yes]'], ['d1', 'x1', '[no]'], ['x1', 'e1'], ['a6', 'a7', '', 'vh'], ['a7', 'a8', '', 'vh'], ['a8', 'a9'], ['a9', 'a10'], ['a10', 'a11'], ['a11', 'a12'], ['a12', 'a13'], ['a13', 'a14'], ['a14', 'a15'], ['a15', 'e2'],
    ],
  });
  const phases = [['1 · Prepare', 1, 5], ['2 · Fund and pre-sell', 6, 12], ['3 · Produce', 13, 14], ['4 · Harvest and sell', 15, 17], ['5 · Settle', 18, 22]];
  for (const [name, r0, r1] of phases) {
    const y0 = A.cyR(r0) - 30, y1 = A.cyR(r1) + 28;
    d.vertex(`<b>${name}</b>`, `text;html=1;align=center;verticalAlign=middle;whiteSpace=wrap;fontSize=13;fillColor=#f1f5f9;strokeColor=#94a3b8;rounded=1;${FONT}`, 20, y0 + 3, 130, y1 - y0 - 6, { raw: true });
    if (r0 > 1) d.freeEdge(170, y0, A.right, y0, 'endArrow=none;dashed=1;strokeColor=#94a3b8;html=1;');
  }
  const leg17 = `<b>Simplified view</b> — the five demo workflows in one flow; each lane is an actor. Funding order follows the code: eKYC → risk acknowledgement → amount (box rows planned) and 30-minute reservation → contract (Operator signs first) and VietQR payment, which do not block each other → funding close: the batch opens when the minimum viable capital is reached and the pre-order ratio is at least the minimum (ratio planned); otherwise contributions and every deposit are refunded, and between the minimum and the target only the funded boxes are stocked. Phase 3 repeats daily until harvest. Money never passes through CrabShare: payments and payouts go through the batch account at the payment provider. Dashed grey or «planned» = in Register v1.4, not in code yet. Detailed workflows: ${OFS('wf1', 'wf5')} and ${DET.wfAll}.<br>${PENDING}`;
  d.vertex(leg17, O.legend, 170, A.bottom + 20, A.right - 170, legendH(leg17, A.right - 170, 84), { raw: true });
  d.check();
}

// O.18–O.22 Activity cho từng main workflow (mức nghiệp vụ, swimlane theo actor)
const WF_PAGES = [
  {
    pg: 'wf1', owner: 'Viên',
    lanes: ['Operator', 'CrabShare System', 'Platform Administrator'], laneW: 300, actionW: 240,
    nodes: [
      ['s', 0, 0, 'start'],
      ['a1', 0, 1, 'action', 'Register boxes with their row code and box number'],
      ['a2', 0, 2, 'action', 'Create a batch on chosen box rows'],
      ['m1', 0, 3, 'merge'],
      ['a3', 0, 4, 'action', 'Author the Standard Cost (items, mortality reserve, tranche plan)'],
      ['c1', 1, 4, 'sys', 'Suggest a price range by season and holidays', { planned: true }],
      ['a4', 0, 5, 'action', 'Set price per kg, floor price, survival tiers, delivery radius', { planned: true }],
      ['a5', 0, 6, 'action', 'Submit the batch for approval'],
      ['c2', 1, 6, 'sys', 'Check that the dossier is complete'],
      ['m2', 0, 7, 'merge'],
      ['d1', 1, 7, 'decision', 'complete?'],
      ['o1', 1, 8, 'object', 'Batch [PendingApproval]'],
      ['b1', 2, 8, 'action', 'Review batch, Standard Cost, floor price and tiers'],
      ['c3', 1, 9, 'sys', 'Return the batch to Draft with the reason'],
      ['d2', 2, 9, 'decision', 'decision'],
      ['c4', 1, 10, 'sys', 'Record the rejection; notify the operator'],
      ['e1', 1, 11, 'flowEnd'],
      ['c5', 1, 12, 'sys', 'Lock Standard Cost, price and floor price; open the batch account; plan tranches'],
      ['o2', 1, 13, 'object', 'Batch [Funding]'],
      ['e2', 1, 14, 'end'],
    ],
    edges: [
      ['s', 'a1'], ['a1', 'a2'], ['a2', 'm1'], ['m1', 'a3'], ['a3', 'c1'], ['c1', 'a4', '', 'vh'], ['a4', 'a5'], ['a5', 'c2'], ['c2', 'd1'],
      ['d1', 'm2', '[no]'], ['m2', 'm1', '', (G) => [[54, G.m2.cy], [54, G.m1.cy]]], ['d1', 'o1', '[yes]'], ['o1', 'b1'], ['b1', 'd2'],
      ['d2', 'c3', '[revise]'], ['c3', 'm2'], ['d2', 'c4', '[reject]', 'vh'], ['c4', 'e1'],
      ['d2', 'c5', '[approve]', (G, H) => [[H.lx[2] + H.widths[2] - 16, G.d2.cy], [H.lx[2] + H.widths[2] - 16, G.c5.cy]]], ['c5', 'o2'], ['o2', 'e2'],
    ],
    notes: `<b>WF-01 · owner Viên</b> — UC44, UC07, UC49, UC08 (UC04/UC05 before: operator approved).<br>Precondition: operator Approved, boxes registered.<br>Exception branches: dossier incomplete; Admin returns the batch for revision; Admin rejects.<br>States: batch Draft → PendingApproval → Draft / Rejected / Funding; Standard Cost version Draft → Submitted → Locked.`,
    gaps: `<b>Register v1.4 vs code</b> — planned: box rows of the batch, formed from the boxes' row codes, one investor per row, each row's capital at least the platform minimum contribution (today only a row code on each box); the price suggestion module, price per kg, floor price, survival threshold and remuneration tiers, delivery radius, minimum pre-order ratio and sales window. Code today asks for a capital range, an offtake price per grade and a fixed remuneration %, and locks the Standard Cost on approval.`,
  },
  {
    // Figure 4.32 bản cuối: Lô không mở → huỷ, hệ thống tạo lệnh hoàn tiền, Platform Administrator gửi lệnh rồi PSP mới chi (làn mới bên phải)
    pg: 'wf2', owner: 'Thiện',
    lanes: ['Investor', 'CrabShare System', 'Payment Service Provider', 'Operator', 'Platform Administrator'], widths: [240, 240, 240, 240, 200], rowGaps: [14],
    nodes: [
      ['s', 0, 0, 'start'],
      ['a1', 0, 1, 'action', 'Complete eKYC (only the result is kept)'],
      ['a2', 0, 2, 'action', 'Explore the batch: Batch-level figures, locked cost'],
      ['a3', 0, 3, 'action', 'Read and acknowledge the risk disclosure'],
      ['a4', 0, 4, 'action', `Pick free box rows ${PL}; reserve their capital`, { w: 220 }],
      ['c2', 1, 5, 'sys', 'Check limits; hold the rows 30 min (≤ funding deadline)', { w: 220 }],
      ['f1', 1, 6, 'fork', '', { span: [0, 3] }],
      ['a5', 0, 7, 'action', 'Pay by VietQR within the hold'],
      ['c3', 1, 7, 'sys', 'Draft the contract from the active template'],
      ['b1', 3, 8, 'action', 'Sign first (Operator owner, Viettel)'],
      ['p1', 2, 9, 'ext', 'Credit the batch account; send the notification'],
      ['c4', 1, 10, 'sys', 'Match the payment once; confirm the contribution'],
      ['a6', 0, 11, 'action', 'Sign second (Investor)'],
      ['j1', 1, 12, 'join', '', { span: [0, 1] }],
      ['t1', 1, 13, 'time', 'deadline or cap reached'],
      ['d1', 1, 14, 'decision', 'min viable capital<br>and pre-order<br>ratio ≥ min?', { w: 200, h: 70 }],
      ['c6', 1, 15, 'sys', `Close capital; snapshot shares (funded boxes only ${PL})`, { h: 56 }],
      ['e2', 1, 16, 'end'],
      ['c7', 1, 17, 'sys', 'Cancel the batch; void contracts; create refunds for contributions and every deposit', { h: 56 }],
      ['a7', 4, 18, 'action', 'Send the refund instructions', { w: 180 }],
      ['p2', 2, 19, 'ext', 'Execute the refunds'],
      ['e3', 2, 20, 'end'],
    ],
    edges: [
      ['s', 'a1'], ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a4'], ['a4', 'c2'], ['c2', 'f1'], ['f1', 'a5'], ['f1', 'c3'], ['c3', 'b1'], ['a5', 'p1', '', 'vh'], ['p1', 'c4', '', 'vh'], ['b1', 'a6', '', 'vh'],
      ['a6', 'j1'], ['c4', 'j1'], ['j1', 't1'], ['t1', 'd1'], ['d1', 'c6', '[yes]'], ['c6', 'e2'],
      ['d1', 'c7', '[no]', (G, H) => [[H.cxL(2), G.d1.cy], [H.cxL(2), G.c7.cy]]], ['c7', 'a7', '', 'vh'], ['a7', 'p2', '', 'vh'], ['p2', 'e3'],
    ],
    notes: `<b>WF-02 · owner Thiện</b> — UC02, UC09, UC10, UC11, UC14, UC12; funding close.<br>Order taken from the code: risk disclosure → amount and reservation → contract → VietQR → done (web wizard steps). The contract may be drafted while the hold is valid; the Operator signs first, then the Investor; signing does not block payment, so the two run in parallel and both must finish before stocking.<br>Exception branches: minimum viable capital not reached or pre-order ratio below the minimum → batch cancelled, contracts voided and refunds created for contributions and every customer deposit; the Platform Administrator sends the refund instructions and the payment provider executes them; hold expiry → reservation Expired, rows Released, unsigned contract Void.<br>States: contribution Reserved → Confirmed / Expired / Refunded; row allocation Held → Allocated / Released «planned»; contract Draft → OperatorSigned → FullySigned / Void; payment request Pending → Paid.`,
    gaps: `<b>Register v1.4 vs code</b> — the register lists "reserve, pay by VietQR and sign the contract"; the code's wizard puts the contract step before the payment step but does not enforce either order. The batch opens when the minimum viable capital is reached (as in code) and the pre-order ratio reaches the minimum set by the Administrator; between the minimum and the target only the boxes of funded rows are stocked and capital that cannot become boxes is refunded. Planned: picking box rows (one investor per row, the amount is their capital), the pre-order ratio and refunds of customer deposits. Code today closes capital at min_viable_capital with no pre-order check and refunds only investors.`,
  },
  {
    // Figure 4.33 bản cuối: nguồn dữ liệu là decision/merge (không fork/join); Investor xem hộp của hàng mình là luồng riêng có
    // initial và flow final riêng; làn người duyệt "Platform Administrator (Evidence Reviewer)"; merge m3 trước "Review the evidence"
    pg: 'wf3', owner: 'Khôi',
    lanes: [`Farm Devices &amp; Cameras (simulated) ${PL}`, 'CrabShare System', 'Platform Administrator<br>(Evidence Reviewer)', 'Operator', 'Investor'], laneW: 220, rowGaps: [7, 14, 17],
    nodes: [
      ['s', 3, 0, 'start'],
      ['a1', 3, 1, 'action', 'Stock crabs in the funded box rows'],
      ['c1', 1, 2, 'sys', 'Batch InProduction; box timelines open', { w: 200 }],
      ['d0', 1, 3, 'decision', 'data source?'],
      ['x1', 0, 4, 'ext', 'Post box photos, feeding records, box events and logs through the common data channel', { planned: true, w: 200, h: 68 }],
      ['a2', 3, 4, 'action', 'Record daily logs and box events in the app'],
      ['mD', 1, 5, 'merge'],
      ['c2', 1, 6, 'sys', 'Record the data per box; check mortality against the policy'],
      ['d1', 1, 7, 'decision', 'mortality over<br>the limit?'],
      ['c3', 1, 8, 'sys', 'Raise an alert with a deadline'],
      ['a3', 3, 9, 'action', 'Acknowledge the alert'],
      ['m1', 1, 10, 'merge'],
      ['c4', 1, 11, 'sys', 'Random capture request: one box, 2 hours'],
      ['a4', 3, 12, 'action', 'Capture a live photo in the app (server time, place, box)'],
      ['c5', 1, 13, 'sys', 'Hash, reuse check, crab detection, risk score'],
      ['d2', 1, 14, 'decision', 'risk score?'],
      ['m3', 2, 15, 'merge'],
      ['r1', 2, 16, 'action', 'Review the evidence (never own investments)'],
      ['m2', 1, 17, 'merge'],
      ['d3', 2, 17, 'decision', 'verdict'],
      ['a5', 3, 17, 'action', 'Submit an explanation for the flagged evidence'],
      ['o1', 1, 18, 'object', 'Evidence [Accepted]'],
      ['o2', 2, 18, 'object', 'Evidence [Rejected]'],
      ['e1', 2, 19, 'flowEnd'],
      ['e2', 1, 19, 'end'],
      // luồng riêng của Investor (không rẽ ra từ luồng chính)
      ['si', 4, 0, 'start'],
      ['i1', 4, 1, 'action', 'View box details of own rows', { planned: true }],
      ['e3', 4, 2, 'flowEnd'],
    ],
    edges: [
      ['s', 'a1'], ['a1', 'c1'], ['c1', 'd0'], ['d0', 'x1', '[farm devices]'], ['d0', 'a2', '[Operator, in the app]', undefined, { lp: -0.1 }], ['x1', 'mD', '', 'vh'], ['a2', 'mD', '', 'vh'],
      ['mD', 'c2'], ['c2', 'd1'], ['d1', 'c3', '[yes]'], ['c3', 'a3'], ['a3', 'm1'],
      ['d1', 'm1', '[no]', (G, H) => [[H.cxL(0), G.d1.cy], [H.cxL(0), G.m1.cy]]], ['m1', 'c4'], ['c4', 'a4'], ['a4', 'c5'], ['c5', 'd2'],
      ['d2', 'm3', '[watch / flagged]'], ['m3', 'r1'], ['d2', 'm2', '[low]'], ['r1', 'd3'], ['d3', 'm2', '[pass]'], ['d3', 'a5', '[more]'], ['a5', 'm3', '', (G) => [[G.a5.cx, G.m3.cy]]],
      ['m2', 'o1'], ['d3', 'o2', '[fail]'], ['o2', 'e1'], ['o1', 'e2'],
      ['si', 'i1'], ['i1', 'e3'],
    ],
    notes: `<b>WF-03 · owner Khôi</b> — UC17, UC52, UC19, UC20, UC45, UC47, UC48, UC21, UC53 (stocking from WF-02; the milestone tranches of ${DET.wf[2]} are summarised in ${OF('smTranche')}).<br>Each day's data comes either from the Operator in the app or, planned, from the simulated farm devices and cameras through one common data channel (a decision with a merge, not a fork). Alerts in v1.4: Mortality, MilestoneDelay, DataSilence and EvidenceFlag. A background job issues one random capture request per batch and day. The detection module only says whether a crab is present and adds to the risk score; a person decides: the Platform Administrator holding the Evidence Reviewer permission, never on a batch they invested in. An Investor viewing the box details of own rows is a separate flow with its own start.<br>Exception branches: alert; flagged evidence with the explanation loop (the merge before the review takes both the first review and the review after an explanation); rejected evidence.<br>States: evidence Accepted / Watch / Flagged / Rejected; capture request Open → Fulfilled / Expired; alert Open → Acknowledged / Escalated → Resolved.`,
    gaps: `<b>Register v1.4 vs code</b> — planned: the common data channel and the simulator (no ingestion endpoint on develop), a real detection module (develop has a no-op detector behind the detection port), row-scoped box details for investors (develop shows a batch timeline to every investor of the batch). Removed in v1.4 (still in code, not drawn): WaterQuality alerts, the water thresholds (ProductionThresholdVersion) and the temperature, salinity and pH readings of daily logs.`,
  },
  {
    // Figure 4.34 bản cuối (5 phần): luồng của từng đơn đặt trước kết thúc ở flow final riêng; phần bán của Lô là luồng riêng của
    // Operator, chạy một lần mỗi Lô: thu hoạch theo hộp → time event "sales window closed" → InvoicedSale → đơn cuối ≥ giá sàn (V2-02).
    // Mọi khoản hoàn: hệ thống tạo lệnh, Platform Administrator gửi lệnh, PSP chi (V2-12c). Làn xếp như bản chi tiết, bỏ làn PSP cho gọn.
    pg: 'wf4', owner: 'Nhân',
    lanes: ['Customer', 'CrabShare System', 'Platform Administrator', 'Operator'], laneW: 240, rowH: 56, rowGaps: [4, 6, 7, 8, 11, 14, 15],
    nodes: [
      // luồng của từng đơn đặt trước
      ['s', 0, 0, 'start'],
      ['u1', 0, 1, 'action', 'Find farms that deliver to the address; open a funding batch', { planned: true }],
      ['u2', 0, 2, 'action', 'Pre-order by crab count (or kg) from the minimum quantity'],
      ['c1', 1, 3, 'sys', 'Hold the crabs (no overselling); issue the VietQR deposit (15 min)'],
      ['dP', 0, 4, 'decision', 'pays the deposit?'],
      ['u3', 0, 5, 'action', 'Pay the deposit by VietQR'],
      ['cX', 1, 5, 'sys', 'Cancelled: hold released, nothing lost', { w: 150, dx: -28, h: 50 }],
      ['eX', 1, 5, 'flowEnd', '', { dx: 88 }],
      ['c2', 1, 6, 'sys', 'Deposit confirmed; crabs held until funding close'],
      ['d1', 1, 7, 'decision', 'batch opens?'],
      ['c3', 2, 7, 'action', 'Send the deposit refund', { w: 150, dx: -28, planned: true }],
      ['e1', 2, 7, 'flowEnd', '', { dx: 84 }],
      ['dC', 1, 8, 'decision', 'cancelled after<br>paying (UC55)?'],
      ['cF', 1, 9, 'sys', 'Forfeit the deposit (ForfeitedDeposit)', { w: 150, dx: -28, h: 50, planned: true }],
      ['eF', 1, 9, 'flowEnd', '', { dx: 88 }],
      ['a1b', 3, 9, 'action', 'Prepare the delivery note; the order QR code is issued', { planned: true }],
      ['a2', 3, 10, 'action', 'Deliver and weigh the crabs at the door'],
      ['d2', 0, 11, 'decision', 'accept and pay<br>the balance?'],
      ['u4', 0, 12, 'action', 'Pay the balance = weighed kg × price − deposit'],
      ['c4', 1, 12, 'sys', 'Forfeit the deposit; crabs back to stock', { w: 150, dx: -28, h: 56, planned: true }],
      ['e2', 1, 12, 'flowEnd', '', { dx: 88 }],
      ['u5', 0, 13, 'action', 'Scan the QR: farm, batch, harvest record', { planned: true }],
      ['d3', 0, 14, 'decision', 'problem in the<br>return window?'],
      ['u6', 0, 15, 'action', 'Return or complain', { w: 140, dx: 40 }],
      ['d8', 1, 15, 'decision', 'request type?'],
      ['b1', 2, 15, 'action', 'Resolve the complaint with the Operator\'s answer', { w: 170 }],
      ['mR', 1, 16, 'merge'],
      ['d4', 2, 16, 'decision', 'outcome?'],
      ['c7', 1, 17, 'sys', 'Order Returned; create the refund instruction'],
      ['c8', 2, 17, 'action', 'Send the refund instruction', { w: 150, dx: -28 }],
      ['e4', 2, 17, 'flowEnd', '', { dx: 84 }],
      ['m1', 1, 18, 'merge'],
      ['t1', 1, 19, 'time', 'return window ends'],
      ['c6', 1, 20, 'sys', 'Order Completed: revenue counts for settlement', { w: 150, dx: -28, h: 56 }],
      ['e5', 1, 20, 'flowEnd', '', { dx: 88 }],
      // luồng của Lô (một lần mỗi Lô), ở đầu làn Operator
      ['sB', 3, 0, 'start'],
      ['h1', 3, 1, 'action', 'Record the harvest per box (weight, grade)'],
      ['t2', 3, 2, 'time', 'sales window closed'],
      ['a4', 3, 3, 'action', 'Record invoiced sales (InvoicedSale): low-grade crabs and crabs of forfeited orders', { h: 64, planned: true }],
      ['mF', 3, 4, 'merge'],
      ['a5', 3, 5, 'action', 'Record the final order of the leftover crabs to the committed buyer', { w: 190, h: 56, planned: true }],
      ['d5', 3, 6, 'decision', 'price ≥<br>floor price?', { h: 48 }],
      ['ob3', 3, 7, 'object', 'FinalOrder [PendingPayment], one per Batch', { w: 180, dx: -18, planned: true }],
      ['eB', 3, 7, 'flowEnd', '', { dx: 100 }],
    ],
    edges: [
      ['s', 'u1'], ['u1', 'u2'], ['u2', 'c1'], ['c1', 'dP'], ['dP', 'u3', '[pays]'], ['dP', 'cX', '[cancels or 15 min pass]'], ['cX', 'eX'],
      ['u3', 'c2', '', 'vh'], ['c2', 'd1'], ['d1', 'dC', '[yes]'], ['d1', 'c3', '[no]'], ['c3', 'e1'],
      ['dC', 'cF', '[yes]', 'down'], ['cF', 'eF'], ['dC', 'a1b', '[no]'], ['a1b', 'a2'], ['a2', 'd2'],
      ['d2', 'u4', '[yes]'], ['d2', 'c4', '[no: refuses or does not pay]'], ['c4', 'e2'], ['u4', 'u5'], ['u5', 'd3'],
      ['d3', 'u6', '[yes]', 'down'], ['d3', 'm1', '[no]', (G) => [[52, G.d3.cy], [52, G.m1.cy]]], ['u6', 'd8'],
      ['d8', 'b1', '[complaint]'], ['d8', 'mR', '[return in window]'], ['b1', 'd4'], ['d4', 'mR', '[full refund]'],
      ['mR', 'c7'], ['c7', 'c8'], ['c8', 'e4'],
      ['d4', 'm1', '[else]', (G, H) => [[H.lx[2] + H.widths[2] - 12, G.d4.cy], [H.lx[2] + H.widths[2] - 12, G.m1.cy]]],
      ['m1', 't1'], ['t1', 'c6', '', 'down'], ['c6', 'e5'],
      ['sB', 'h1'], ['h1', 't2'], ['t2', 'a4'], ['a4', 'mF'], ['mF', 'a5'], ['a5', 'd5'], ['d5', 'ob3', '[yes]', 'down'], ['ob3', 'eB'],
      ['d5', 'mF', '[no: revise]', (G, H) => [[H.lx[3] + H.widths[3] - 12, G.d5.cy], [H.lx[3] + H.widths[3] - 12, G.mF.cy]], { lp: 0.6 }],
    ],
    notes: `<b>WF-04 · owner Nhân</b> — UC25, UC27, UC55, UC12, UC40, UC22, UC29, UC30, UC54, UC33, UC31, UC32, UC50, UC51.<br>Two flows. Each pre-order (from the start on the left) ends at its own flow final. The Batch flow (top of the Operator lane) runs once per Batch: the harvest per box, then, after the sales window closes, the invoiced sales of low-grade crabs and of crabs from forfeited orders (saleReason LowGrade, ForfeitResale) and one final order to the committed buyer, never below the floor price.<br>Deposit (UC55 Cancel Bulk Pre-order; UC54 Forfeit Deposit «extend» UC55 and UC30): (a) cancelled after paying and the batch opens → forfeited (ForfeitedDeposit, counted once); (b) the batch does not open → every deposit refunded, cancelled orders included; (c) delivery refused or balance not paid → forfeited, the crabs go back to stock for the Batch's invoiced sale; (d) cancelled or unpaid before the deposit (15-minute hold) → nothing lost.<br>Balance = weighed kg × price per kg locked before funding − deposit; weighed kg counts the live crabs received, transit loss is only recorded, a negative balance is refunded; delivery within the farm's radius is included. The order QR code is issued when the Operator prepares the delivery note; every delivered order has an invoice. A return in the window returns the order; a complaint is resolved by the Administrator with the Operator's answer: a full refund returns it, otherwise the order completes after the return window. Every refund: the system creates the instruction, the Administrator sends it and the payment provider executes it.<br>States: BulkPreOrder PendingPayment → DepositPaid → Confirmed «planned» → Packed → Shipping → Delivered → Completed, or Cancelled, Refunded «planned», Forfeited «planned», Returned (${OF('smOrder')}); InvoicedSale and FinalOrder PendingPayment → Completed (${DET.smInvoiced}).`,
    gaps: `<b>Register v1.4 vs code</b> — develop still sells through listings: pre-orders on a listing only while the batch is InProduction, the balance asked for when harvesting starts, packing by scanning per-crab tags, retail cart and checkout, and the offtake window (all removed in v1.4, still in code). Planned for v1.4: farm map and delivery radius, ordering by crab count with a minimum while funding, the forfeit rule on cancellation, refunds and forfeits of Customer deposits, the delivery note with the order QR code, weighing at the door and the balance on weighed kg, invoiced sales of low-grade or resold crabs and the final order at the floor price.`,
  },
  {
    // Figure 4.35 bản cuối: guard ra cạnh (V2-12a) — "[sales closed, return windows over]" vào bước bắt đầu tính; sau join là time event
    // "feedback window ends" rồi "[no open feedback]" mới tới bước duyệt
    pg: 'wf5', owner: 'Thiện',
    lanes: ['Platform Administrator', 'CrabShare System', 'Investor', 'Operator'], widths: [230, 440, 230, 230], rowGaps: [0, 11, 16],
    nodes: [
      ['s', 0, 0, 'start'],
      ['b1', 0, 1, 'action', 'Start the settlement calculation'],
      ['c1', 1, 2, 'sys', 'Actual revenue = delivered orders + invoiced sales + forfeited deposits + final order', { w: 400, h: 52 }],
      ['c2', 1, 3, 'sys', 'Revenue Pool = actual revenue − locked Standard Cost of the funded boxes', { w: 400, h: 52 }],
      ['d1', 1, 4, 'decision', 'Pool &gt; 0?'],
      ['c3', 1, 5, 'sys', 'Remuneration = floor(Pool × rate), cut by tier below the survival threshold; rest pro rata', { w: 204, dx: -108, h: 56 }],
      ['c4', 1, 5, 'sys', 'No remuneration; loss pro rata, capped at capital; overrun with the Operator', { w: 204, dx: 108, h: 56 }],
      ['m1', 1, 6, 'merge'],
      ['o1', 1, 7, 'object', 'Settlement [Draft], one line per investor', { w: 300 }],
      ['b2', 0, 8, 'action', 'Publish the proposal (7–14-day window)'],
      ['f1', 0, 9, 'fork', '', { span: [0, 3] }],
      ['i1', 2, 10, 'action', 'Review own statement line'],
      ['p1', 3, 10, 'action', 'Review the full statement'],
      ['d2', 2, 11, 'decision', 'feedback?'],
      ['i2', 2, 12, 'action', 'Submit feedback with grounds'],
      ['b3', 0, 13, 'action', 'Answer the feedback'],
      ['m2', 2, 14, 'merge'],
      ['j1', 0, 15, 'join', '', { span: [0, 3] }],
      ['t1', 0, 16, 'time', 'feedback window ends', { dx: -40 }],
      ['b4', 0, 17, 'action', 'Approve the settlement'],
      ['c5', 1, 18, 'sys', 'Lock the statement; create payout and remuneration instructions', { w: 400 }],
      ['b5', 0, 19, 'action', 'Send the instructions via the payment intermediary'],
      ['c6', 1, 20, 'sys', 'All payouts succeeded: close the settlement and the batch', { w: 400 }],
      ['e1', 1, 21, 'end'],
    ],
    edges: [
      ['s', 'b1', '[sales closed, return windows over]'], ['b1', 'c1'], ['c1', 'c2'], ['c2', 'd1'], ['d1', 'c3', '[yes]'], ['d1', 'c4', '[no: loss]'], ['c3', 'm1', '', 'vh'], ['c4', 'm1', '', 'vh'], ['m1', 'o1'], ['o1', 'b2'], ['b2', 'f1'],
      ['f1', 'i1'], ['f1', 'p1'], ['i1', 'd2'], ['d2', 'i2', '[yes]'], ['i2', 'b3'], ['b3', 'm2', '', 'vh'],
      ['d2', 'm2', '[no]', (G, H) => [[H.lx[2] + H.widths[2] - 12, G.d2.cy], [H.lx[2] + H.widths[2] - 12, G.m2.cy]]],
      ['m2', 'j1'], ['p1', 'j1'], ['j1', 't1'], ['t1', 'b4', '[no open feedback]', 'down'], ['b4', 'c5'], ['c5', 'b5'], ['b5', 'c6'], ['c6', 'e1'],
    ],
    notes: `<b>WF-05 · owner Thiện</b> — UC38, UC37, UC35, UC36, UC39, UC40 (UC43 for the audit anchors).<br>The calculation starts once sales have closed and the return windows are over; approval waits until the feedback window ends with no open feedback.<br>Revenue Pool and payouts in integer VND; payouts plus remuneration equal the revenue; largest-remainder rounding. Worked example (Register v1.4): Standard Cost 100,000,000 VND, revenue 300,000,000 VND, Pool 200,000,000 VND; at 90 % survival (threshold 85 %) the 10 % remuneration is 20,000,000 VND; at 80 % survival it is halved.<br>Survival rate = 1 − deaths during farming ÷ crabs first stocked in the funded boxes (restocked crabs that die count; deaths in transit only lower revenue). Unused Standard Cost, including an unused mortality reserve, stays with the Operator; only an early liquidation returns unspent capital.<br>Exception branches: negative Pool (loss capped at capital); unresolved feedback; failed payout resent with the same reference.<br>States: settlement Draft → Proposed ⇄ Disputed → Approved → PaidOut → Closed; payment instruction Created → Succeeded / Failed, a failed one resent (the Sent value is allowed by the database but never written by code).`,
    gaps: `<b>Register v1.4 vs code</b> — the settlement engine and approval flow exist; remuneration on develop is a fixed operator_share_pct, so the tier cut by survival rate is planned, as are the revenue lines InvoicedSale (low-grade or resold crabs), ForfeitedDeposit of pre-orders and FinalOrder. Develop's revenue = completed orders + forfeited offtake deposits − refunds.`,
  },
];
function workflowPage(f, w) {
  const d = openPage(f, w.pg);
  const widths = w.widths ?? w.lanes.map(() => w.laneW ?? 240);
  const nodes = w.nodes.map(n => (w.actionW && ['action', 'sys', 'ext'].includes(n[3]) && !(n[5] && n[5].w)) ? [n[0], n[1], n[2], n[3], n[4], { ...(n[5] ?? {}), w: w.actionW }] : n);
  const A = activity(d, { lanes: w.lanes, widths, nodes, edges: w.edges, x0: 40, rowH: w.rowH ?? 58, rowGaps: w.rowGaps });
  const i = Number(w.pg.slice(2)) - 1;
  activityNotes(d, A.right + 30, 66, Math.min(640, 1620 - A.right - 30), w.notes + `<br>Overview of all five: ${OF('actAll')} · detailed: ${DET.wf[i]} (${DET.wfParts[i]} parts).<br>${PENDING}`, w.gaps);
  d.check();
}

// =====================================================================================================
// O.23–O.26 Sequence (người tham gia gộp: App, API, CSDL, bên ngoài); khối alt / opt / loop / par, toán hạng tách bằng else.
// SQ-03: thanh kích hoạt trên lifeline API (và thư viện); alt một nhánh → opt; par không mang guard (giải thích bằng note).
function parseStep(s) {
  let m;
  if ((m = s.match(/^(\w+)(->>|-->|->)(\w+):\s*(.*)$/))) return { kind: 'msg', from: m[1], to: m[3], arrow: m[2], text: m[4] };
  if ((m = s.match(/^(alt|opt|loop|par)\s*(.*)$/))) return { kind: 'open', op: m[1], guard: m[2] };
  if ((m = s.match(/^else\s*(.*)$/))) return { kind: 'else', guard: m[1] };
  if (s === 'end') return { kind: 'close' };
  if ((m = s.match(/^note:\s*(.*)$/))) return { kind: 'note', text: m[1] };
  throw new Error('bad step: ' + s);
}
function sequencePage(f, q) {
  const d = openPage(f, q.pg);
  const ids = q.lifelines.map(l => l[0]);
  const colW = q.colW ?? 210, x0 = 40, top = 80, headH = q.headH ?? 50, rowH = 38;
  const xc = (id) => x0 + ids.indexOf(id) * colW + 85;
  const xl = x0 + 6, xr = x0 + ids.length * colW - 44;
  const noteW = xr - xl - 120;
  let y = top + headH + 30;
  const frames = [], stack = [], items = [];
  for (const s of q.steps.map(parseStep)) {
    if (s.kind === 'open') {
      if (s.op === 'par' && s.guard) WARN.push(`${d.name}: par fragment carries a guard (${s.guard})`);
      stack.push({ op: s.op, guard: s.guard, y0: y, elses: [] }); y += rowH - 4; continue;
    }
    if (s.kind === 'else') { stack[stack.length - 1].elses.push({ y: y - 8, guard: s.guard }); y += rowH - 8; continue; }
    if (s.kind === 'close') {
      const fr = stack.pop(); fr.y1 = y - 6; frames.push(fr); y += 14;
      if (fr.op === 'alt' && !fr.elses.length) WARN.push(`${d.name}: alt with one operand (use opt)`);
      continue;
    }
    if (s.kind === 'note') { const h = Math.ceil(measure(s.text, 11, false, noteW - 16).height + 18); items.push({ ...s, y, h }); y += h + 12; continue; }
    if (!ids.includes(s.from) || !ids.includes(s.to)) WARN.push(`${d.name}: message ${s.from} → ${s.to} uses an unknown lifeline`);
    items.push({ ...s, y }); y += rowH;
  }
  const total = y - top + 30;
  q.lifelines.forEach(([id, name, kind, planned], i) => {
    const fill = { ui: '#ecfdf5', api: '#e0f2fe', db: '#f1f5f9', ext: '#fef3c7', lib: '#ede9fe' }[kind] ?? '#f8fafc';
    const style = kind === 'actor' ? S.lifelineActor + 'fontSize=13;fontStyle=1;' : S.lifeline + `size=${headH};fontSize=12;fillColor=${fill};` + (planned ? 'dashed=1;strokeColor=#64748b;' : '');
    const label = kind === 'actor' ? name : `${kind === 'ext' ? '«external»<br>' : ''}<b>${name}</b>${planned ? '<br>' + PL : ''}`;
    if (kind === 'actor') d.vertex(label, style + 'whiteSpace=nowrap;size=46;spacingTop=44;', x0 + i * colW + 65, top, 40, total, { key: 'll_' + id, raw: true });
    else d.vertex(label, style, x0 + i * colW, top, 170, total, { key: 'll_' + id, raw: true });
  });
  // thanh kích hoạt: mỗi chuỗi message liên tiếp chạm lifeline API / thư viện là một thanh
  const spans = {};
  for (const [id, , kind] of q.lifelines) {
    if (!['api', 'lib'].includes(kind)) continue;
    const runs = [];
    let broken = true; // một ghi chú giữa hai message = khoảng thời gian dài: thanh kích hoạt dừng ở đó
    for (const it of items) {
      if (it.kind === 'note') { broken = true; continue; }
      if (it.kind !== 'msg' || (it.from !== id && it.to !== id)) continue;
      const r = runs[runs.length - 1];
      if (r && !broken && it.y - r[1] <= rowH * 2.6) r[1] = it.y; else runs.push([it.y, it.y]);
      broken = false;
    }
    spans[id] = runs.map(([a, b]) => [a - 10, b + 12]);
  }
  const active = (id, yy) => (spans[id] ?? []).some(([a, b]) => yy >= a && yy <= b);
  for (const [id, runs] of Object.entries(spans)) for (const [a, b] of runs) d.vertex('', S.activation, xc(id) - 6, a, 12, b - a);
  for (const fr of frames) {
    d.vertex(`<b>${fr.op}</b>`, S.frame + 'fillColor=none;fontSize=11;', xl, fr.y0 - 4, xr - xl, fr.y1 - fr.y0 + 4, { raw: true });
    if (fr.guard) d.text(`<font style="font-size:11px">${fr.guard}</font>`, xl + 66, fr.y0 - 4, 480, 24, 'verticalAlign=middle;');
    for (const el of fr.elses) {
      d.freeEdge(xl, el.y, xr, el.y, 'endArrow=none;dashed=1;html=1;strokeColor=#1e293b;');
      if (el.guard) d.text(`<font style="font-size:11px">${el.guard}</font>`, xl + 10, el.y + 1, 480, 22, 'verticalAlign=middle;');
    }
  }
  for (const it of items) {
    if (it.kind === 'note') { d.vertex(it.text, O.note, xl + 60, it.y - 6, noteW, it.h, { raw: true }); continue; }
    const dir = Math.sign(xc(it.to) - xc(it.from)) || 1;
    const x1 = xc(it.from) + (active(it.from, it.y) ? 6 * dir : 0), x2 = xc(it.to) - (active(it.to, it.y) ? 6 * dir : 0);
    const style = (it.arrow === '-->' ? S.msgReturn : it.arrow === '->>' ? S.msgAsync : S.msgSync) + 'fontSize=11;labelBackgroundColor=#ffffff;';
    const lw = [...decode(it.text.replace(/<[^>]+>/g, ''))].reduce((a, ch) => a + charW(ch) * 11, 0);
    if (it.from === it.to) {
      const xs = xc(it.from) + (active(it.from, it.y) ? 6 : 0);
      d.freeEdge(xs, it.y - 8, xs, it.y + 12, style + 'edgeStyle=orthogonalEdgeStyle;', { label: it.text, points: [[xs + 45, it.y - 8], [xs + 45, it.y + 12]], raw: true });
      continue;
    }
    if (lw > Math.abs(x2 - x1) + colW * 0.9) WARN.push(`${d.name}: message label "${it.text.replace(/<[^>]+>/g, '').slice(0, 30)}" (~${Math.round(lw)} px) is much longer than its arrow`);
    d.freeEdge(x1, it.y, x2, it.y, style, { label: it.text, raw: true });
  }
  const leg = '<b>Legend</b> — filled arrow: request · open arrow: asynchronous message · dashed: reply · narrow bar: activation of the API or library while it handles the messages · dashed participant or «planned»: not on develop yet. Participants are grouped (one box for the whole API); the detailed diagrams show controllers, services and ports: ' + q.detail + '.' + (q.pending ? '<br>' + PENDING : '');
  const legW = Math.max(900, ids.length * colW - 40);
  d.vertex(leg, O.legend, x0, top + total + 16, legW, legendH(leg, legW, 44), { raw: true });
  d.check();
}
const SEQS = [
  {
    pg: 'seqFunding', detail: DET.seqFunding, colW: 190, pending: true,
    lifelines: [['inv', 'Investor', 'actor'], ['app', 'Web app', 'ui'], ['api', 'CrabShare API', 'api'], ['db', 'Database', 'db'], ['sign', 'Viettel signing', 'ext'], ['psp', 'Payment provider', 'ext'], ['op', 'Operator', 'actor']],
    steps: [
      'inv->app: read the risk disclosure to the end',
      'app->api: save the risk acknowledgement (UC11)',
      `inv->app: pick free box rows ${PL} (amount = their capital)`,
      'app->api: reserve the contribution (UC10)',
      'api->db: check eKYC, risk ack., limits (row lock)',
      `api->db: Reserved, rows Held ${PL}; 30-min hold`,
      'api-->app: reservation and countdown',
      'app->api: open the contract step (UC14)',
      'api->db: contract Draft from the template',
      'note: The two operands below run in parallel: signing does not block payment and payment does not block signing; stocking needs both.',
      'par',
      'op->api: Operator (owner) signs first',
      'api->sign: sign the current file (sandbox)',
      'inv->api: Investor signs second',
      'api->db: FullySigned + final hash',
      'else',
      'app->api: request the VietQR code (UC12)',
      'api->psp: payment request on the batch account',
      'api-->app: VietQR code, expires with the hold',
      'inv->psp: transfer with a banking app',
      'psp->>api: payment webhook (signed)',
      `api->db: match once; Confirmed; rows Allocated ${PL}`,
      'end',
      'note: Order taken from the code: Features/Funding and the web wizard (risk → amount → contract → VietQR → done). The Register lists "reserve, pay by VietQR and sign"; the code allows either order, and stocking needs every Confirmed contribution with a FullySigned contract. If the hold expires unpaid, the reservation expires and the unsigned contract is voided; a late payment is refunded automatically. CrabShare never holds the money.',
    ],
  },
  {
    pg: 'seqSettlement', detail: DET.seqSettlement, colW: 200, pending: true,
    lifelines: [['adm', 'Platform Administrator', 'actor'], ['app', 'Web app', 'ui'], ['api', 'CrabShare API', 'api'], ['eng', 'Settlement engine', 'lib'], ['db', 'Database', 'db'], ['inv', 'Investor', 'actor'], ['psp', 'Payment provider', 'ext']],
    steps: [
      'adm->app: calculate the settlement',
      'app->api: calculate (UC38)',
      'api->db: revenue lines, locked cost, capital shares',
      'api->eng: Pool, remuneration, largest remainder',
      'api->db: save settlement Draft + lines',
      'adm->api: publish the proposal, 7–14 days (UC37)',
      'inv->api: review the statement; optional feedback',
      'adm->api: approve after the window (UC39)',
      'api->db: lock the settlement (trigger)',
      'api->psp: payout instruction per investor',
      'psp->>api: payout results',
      'api->db: PaidOut, Closed; batch Closed',
      'note: Register v1.4 (planned): revenue lines DeliveredOrder (past the return window), InvoicedSale (low-grade or resold crabs), ForfeitedDeposit and FinalOrder (≥ floor price); the locked Standard Cost of the funded boxes only; a remuneration rate cut by tier when survival (1 − deaths ÷ crabs stocked in the funded boxes) is below the threshold. Develop reads completed orders, forfeited offtake deposits and refunds, with a fixed rate. Money is integer VND; payouts plus remuneration equal the revenue.',
    ],
  },
  {
    pg: 'seqOrder', detail: DET.seqOrder, colW: 210, pending: true,
    lifelines: [['cus', 'Customer', 'actor'], ['app', 'Web app', 'ui'], ['api', 'CrabShare API', 'api'], ['db', 'Database', 'db'], ['psp', 'Payment provider', 'ext'], ['op', 'Operator', 'actor']],
    steps: [
      `cus->app: find farms that deliver to me ${PL}`,
      `app->api: farms and funding batches in radius ${PL}`,
      'cus->app: pre-order a crab count (or kg) ≥ minimum',
      'app->api: place the bulk pre-order (UC27)',
      'api->db: hold crabs available for pre-order',
      'api->psp: VietQR deposit request',
      'api-->app: deposit QR code',
      'cus->psp: pay the deposit',
      'psp->>api: payment webhook',
      'api->db: order DepositPaid',
      `note: At funding close the batch opens and the order becomes Confirmed ${PL}; otherwise every paid deposit is refunded, cancelled orders included. A Customer who cancels after paying (UC55) loses the deposit once the batch opens (UC54, ${DET.seqForfeit}). Removed in v1.4 (still on develop): pre-orders on a listing while the batch is InProduction, with the balance asked for when harvesting starts.`,
      'op->api: record harvest per box (UC22)',
      `op->api: prepare the delivery note ${PL}`,
      `api->db: Packed; order QR code issued ${PL}`,
      `op->api: deliver; record the weighed kg ${PL}`,
      `api->db: balance = weighedKg × price − deposit ${PL}`,
      'alt [Customer accepts the crabs]',
      'api->psp: VietQR balance request',
      'cus->psp: pay the balance (UC30)',
      'psp->>api: payment webhook',
      'api->db: Delivered; return window starts',
      'else [refuses delivery or does not pay]',
      `api->db: deposit Forfeited; crabs to the invoiced sale ${PL}`,
      'end',
      `cus->api: scan the order QR (UC33) ${PL}`,
      'api-->cus: farm, batch and harvest record',
    ],
  },
  {
    pg: 'seqEvidence', detail: DET.seqEvidence, colW: 190, headH: 66,
    lifelines: [['op', 'Operator', 'actor'], ['mob', 'Mobile app', 'ui'], ['sim', 'Device &amp; Camera Simulator', 'ext', true], ['api', 'CrabShare API', 'api'], ['sto', 'File storage', 'db'], ['det', 'Crab detection', 'lib', true], ['db', 'Database', 'db'], ['rev', 'Platform Administrator<br>(Evidence Reviewer)', 'actor']],
    steps: [
      `opt [device and camera data ${PL}]`,
      'sim->api: feeding, box events, photos (API key)',
      'api->db: store on the box timeline',
      'end',
      'op->mob: take a live photo of a box',
      'mob->api: photo, server time, location, box no.',
      'api->sto: store the image; SHA-256',
      `api->det: is a crab present? ${PL}`,
      'api->db: save evidence + risk score',
      'api-->mob: Accepted, Watch or Flagged',
      'opt [Watch or Flagged]',
      'rev->api: open the review queue',
      'rev->api: verdict: Pass, Fail or more',
      'api->db: update status; notify Operator',
      'op->api: send an explanation (if asked)',
      'end',
      'note: Camera-only capture in the app; random capture requests come from a background job. The detection module only says whether a crab is present and adds to the risk score; it never rejects a photo alone, and reviewers never judge their own investments.',
    ],
  },
];
// =====================================================================================================
// O.27 Class – khuôn mẫu lát cắt dọc mà mọi module backend theo
function classPatternPage(f) {
  const d = openPage(f, 'classPattern');
  const C = (k, stereo, name, rows, x, y, w = 240, planned = false) => stackBox(d, k, `«${stereo}»<br><b>${name}</b>${planned ? ' ' + PL : ''}`, rows.map(t => ({ text: t, raw: true, style: ROW11 })), x, y, w, O.cls + (planned ? O.planned : ''), 20, { headerH: 44 });
  C('job', 'background job', 'XxxJob : RecurringJob', ['+ RunAsync()'], 620, 70, 260);
  C('client', 'boundary', 'Web / Mobile client', ['HTTPS · JSON · JWT'], 40, 230, 200);
  C('ctrl', 'controller', 'XxxController', ['+ HTTP endpoints', '[Authorize(Roles)]'], 300, 230, 240);
  C('svc', 'service', 'XxxService', ['+ business operations', '(rules, transactions)'], 620, 230, 260);
  C('db', 'persistence', 'AppDbContext', ['+ DbSet&lt;Entity&gt; × 69'], 960, 230, 220);
  C('ent', 'entity', 'Entities', ['generated from schema', '(database-first)'], 1260, 230, 220);
  C('dto', 'record', 'XxxDtos', ['request / response', '+ validation attributes'], 300, 460, 240);
  C('ports', 'interface', 'Infrastructure ports', ['IPaymentGateway · IFileStorage', 'IDigitalSigningService', 'IEkycProvider · ICrabDetector'], 620, 460, 260);
  C('common', 'interface', 'ICurrentUser · IAuditLog', ['who is calling', 'hash-chained audit log'], 960, 460, 220);
  C('err', 'exception', 'AppException', ['→ ProblemDetails (code)'], 1260, 460, 220);
  C('fake', 'adapter', 'Fake… / real adapters', ['chosen by configuration'], 620, 680, 260);
  d.edge('client', 'ctrl', O.conn, { label: 'calls' });
  d.edge('ctrl', 'svc', O.dep, { label: 'calls' });
  d.edge('job', 'svc', O.dep, { label: 'calls' });
  d.edge('svc', 'db', O.dep, { label: 'queries' });
  d.edge('db', 'ent', O.dep, { label: 'maps' });
  d.edge('ctrl', 'dto', O.dep, { label: 'uses' });
  d.edge('svc', 'dto', O.dep);
  d.edge('svc', 'ports', O.dep, { label: 'uses' });
  d.edge('svc', 'common', O.dep);
  d.edge('svc', 'err', O.dep, { label: 'throws' });
  d.edge('fake', 'ports', O.realize);
  const leg27 = `<b>Vertical slice</b> — each module in Features/ has its own Controller, Service and Dtos; services use AppDbContext directly (no repository layer). Program.cs only wires things together; services are registered in FeatureRegistry. Concrete examples: FundingController → FundingService, PreordersController → PreorderService. The v1.4 parts still to come (price suggestion, ingestion, InvoicedSale and the final order, box rows with RowAllocation, pre-order quota and holds, remuneration tiers) follow the same pattern; Catalog and Offtake stay in the code but are removed from the v1.4 design. ICrabDetector is the port of the planned detection module (no-op on develop). Detailed class diagrams per module: ${DET.classAll}.<br>${PENDING}`;
  d.vertex(leg27, O.legend, 40, 800, 1440, legendH(leg27, 1440, 64), { raw: true });
  d.check();
}

// O.28 Class – các module phối hợp qua Payments (tên lớp thật trên develop; «planned» = chưa có)
function classCollabPage(f) {
  const d = openPage(f, 'classMoney');
  const K = (k, name, x, y, w = 300, stereo, planned = false) => d.vertex(`${stereo ? `«${stereo}»<br>` : ''}<b>${name}</b>${planned ? ' ' + PL : ''}`, O.clsName + (stereo === 'interface' ? 'fillColor=#fef3c7;' : stereo === 'library' ? 'fillColor=#ede9fe;' : '') + (planned ? O.planned : ''), x, y, w, stereo ? 52 : 44, { key: k, raw: true });
  const G = (k, name, x, y, w, h) => d.vertex(name, O.group, x, y, w, h, { key: k, raw: true, container: true });
  G('g_infra', 'Infrastructure (ports and adapters)', 520, 70, 560, 106);
  K('ipg', 'IPaymentGateway', 540, 108, 230, 'interface'); K('fake', 'FakePaymentGateway', 830, 108, 230, 'adapter');
  G('g_pay', 'Payments', 520, 200, 560, 520);
  K('prs', 'PaymentRequestService', 540, 250, 230); K('payout', 'PayoutSendService', 830, 250, 230);
  K('refund', 'RefundService', 540, 400, 230); K('disb', 'DisbursementService', 830, 400, 230);
  K('ipph', 'IPaymentPurposeHandler', 540, 630, 230, 'interface'); K('hook', 'PaymentWebhookService', 830, 634, 230);
  G('g_fund', 'Funding', 40, 200, 400, 200);
  K('fs', 'FundingService', 60, 240, 360); K('cph', 'ContributionPaymentHandler', 60, 290, 360); K('fcs', 'FundingCloseService', 60, 340, 360);
  G('g_ord', 'Orders', 40, 430, 400, 350);
  K('ps', 'PreorderService', 60, 470, 360); K('pdh', 'PreOrderDepositHandler', 60, 520, 360); K('pbh', 'PreOrderBalanceHandler', 60, 570, 360); K('ocs', 'OrderCancellationService', 60, 620, 360);
  K('inv', 'InvoicedSaleService', 60, 670, 360, null, true);
  K('ish', 'InvoicedSalePaymentHandler', 60, 720, 360, null, true);
  G('g_set', 'Settlement', 1160, 200, 380, 210);
  K('sps', 'SettlementPayoutService', 1180, 250, 340); K('ss', 'SettlementService', 1180, 340, 340);
  G('g_eng', 'CrabShare.SettlementEngine', 1160, 450, 380, 110);
  K('calc', 'SettlementCalculator', 1180, 490, 340, 'library');
  // mỗi đích một kênh dọc trong khe giữa hai cột (x = 460 / 480 / 500), đi ra từ mép phải của lớp nguồn
  const route = [['fs', 'prs', O.dep, 460, 0.3], ['ps', 'prs', O.dep, 460, 0.3], ['inv', 'prs', O.dep + O.plannedEdge, 460, 0.3],
    ['fcs', 'refund', O.dep, 480, 0.5], ['ocs', 'refund', O.dep, 480, 0.5],
    ['cph', 'ipph', O.realize, 500, 0.5], ['pdh', 'ipph', O.realize, 500, 0.5], ['pbh', 'ipph', O.realize, 500, 0.5], ['ish', 'ipph', O.realize + O.plannedEdge, 500, 0.5]];
  const yOf = { fs: 262, cph: 312, fcs: 362, ps: 492, pdh: 542, pbh: 592, ocs: 642, inv: 692, ish: 742 };
  const yIn = { prs: 250 + 44 * 0.3, refund: 400 + 44 * 0.5, ipph: 630 + 52 * 0.5 };
  for (const [a, b, st, ch, ey] of route) d.edge(a, b, st + 'exitX=1;exitY=0.5;entryX=0;entryY=' + ey + ';', { points: [[ch, yOf[a]], [ch, yIn[b]]] });
  d.edge('prs', 'ipg', O.dep, { label: 'VietQR' });
  d.edge('payout', 'ipg', O.dep, { label: 'payouts' });
  d.edge('fake', 'ipg', O.realize);
  d.edge('hook', 'ipph', O.dep, { label: 'dispatch by<br>purpose', raw: true });
  d.edge('hook', 'refund', O.dep, { label: 'late payment' });
  d.edge('sps', 'payout', O.dep);
  d.edge('sps', 'ss', O.dep);
  d.edge('ss', 'calc', O.dep, { label: 'Calculate()' });
  const leg28 = `<b>Payments is the hub</b> — modules ask PaymentRequestService for a VietQR code on the batch account; the provider webhook (PaymentWebhookService) is dispatched back to the owning module through IPaymentPurposeHandler, one handler per purpose (contribution, pre-order deposit, pre-order balance). Refunds, tranche releases (DisbursementService) and payouts leave as payment instructions. Names are the real classes on develop; the retail OrderPaymentHandler and the Offtake module remain in the code but are removed from the v1.4 design; InvoicedSaleService (invoiced sales of low-grade or resold crabs and the final order) and InvoicedSalePaymentHandler (purpose OrderPayment) are planned. Funding also calls Contracts directly (voiding unsigned contracts). Details: ${DET.classMoney}.<br>${PENDING}`;
  d.vertex(leg28, O.legend, 520, 750, 1020, legendH(leg28, 1020, 90), { raw: true });
  d.check();
}

// =====================================================================================================
// O.9 Package (overview) — rút gọn của Figure 4.5–4.7: sub-system, nhóm module v1.4 và phụ thuộc thật trên develop
// (số trên mũi tên = dòng của bảng phụ thuộc trong Figure 4.5; đỏ = vòng phụ thuộc hoặc vi phạm tầng). Catalog, Offtake (đã bỏ
// trong v1.4, còn trong code) và các dòng 4–10 của bảng không vẽ, chỉ ghi ở chú thích (G-02).
function packagePage(f) {
  const d = openPage(f, 'package');
  const P = (k, html, x, y, w, h, opts = {}) => d.vertex(html, O.pkg + (opts.planned ? O.planned : ''), x, y, w, h, { key: k, raw: true, container: !!opts.container });
  const RED = 'strokeColor=#b91c1c;fontColor=#b91c1c;';
  const dep = (a, b, style, label) => d.edge(a, b, O.dep + style, { label: label ?? '', raw: true });
  // Web (Figure 4.6) và Mobile (Figure 4.7)
  P('web', '«subsystem» <b>Web app</b> — web/src', 40, 90, 300, 300, { container: true });
  P('w_app', 'app<br>' + small('router, role guards'), 60, 140, 120, 70);
  P('w_shared', 'shared<br>' + small('api client, ui kit'), 200, 140, 120, 70);
  P('w_feat', 'features<br>' + small('investor · operator · admin · orders · trace · accounts · farm map «planned»'), 60, 240, 260, 120);
  P('mob', '«subsystem» <b>Mobile app</b> — mobile/lib', 40, 420, 300, 250, { container: true });
  P('m_app', 'app · core · shared<br>' + small('router, API client, widgets'), 60, 470, 260, 64);
  P('m_feat', 'features<br>' + small('investor · operator · trace · delivery «planned» (repository + mock / API)'), 60, 560, 260, 90);
  P('sim', `«tool» <b>Device &amp; Camera Simulator</b> ${PL}<br>` + small('posts to the ingestion API'), 40, 690, 300, 80, { planned: true });
  // Backend (Figure 4.5)
  P('api', '«subsystem» <b>CrabShare.Api</b> — ASP.NET Core (.NET 10)', 380, 90, 920, 710, { container: true });
  P('prog', 'Program · FeatureRegistry<br>' + small('composition root'), 400, 130, 260, 64);
  P('feat', 'Features — vertical slices, grouped by v1.4 sub-system', 400, 220, 880, 445, { container: true });
  P('g_id', 'Identity &amp; admin<br>' + small('Auth · Accounts · Admin · Health'), 420, 260, 250, 110);
  P('g_fund', 'Funding &amp; money<br>' + small('Funding · Contracts · Payments · Portfolio (Funding → Payments 1, → Contracts 2)'), 710, 260, 250, 110);
  P('g_set', 'Settlement<br>' + small('statement, approval, payout; tier cut «planned»'), 1000, 260, 250, 110);
  P('g_farm', 'Farms &amp; batches<br>' + small('Operators · Boxes (numbering) · Batches (box rows, farm map query «planned») · Price Module «planned»'), 420, 400, 250, 110);
  P('g_sale', 'Sales &amp; delivery<br>' + small('Harvest (per box, trace) · Orders (bulk pre-orders; quota and holds, invoiced sales, order QR «planned»)'), 710, 400, 250, 110);
  P('g_prod', 'Production &amp; evidence<br>' + small('Production · Evidence · Alerts (6, 8, 9) · Ingestion «planned» (P1 → Production)'), 710, 540, 250, 110);
  P('common', 'Common<br>' + small('auth policies · audit hash chain · alert port · errors · jobs · paging · exports'), 400, 690, 400, 90);
  P('infra', 'Infrastructure<br>' + small('persistence (EF Core, scaffolded) · payments · signing · eKYC · detection · storage · security'), 840, 690, 400, 90);
  P('engine', '«library» <b>CrabShare.SettlementEngine</b><br>' + small('calculator, largest remainder · no database'), 1320, 262, 320, 100);
  P('tests', '«package» <b>tests</b><br>' + small('API tests · engine property tests'), 1320, 400, 320, 90);
  P('migr', '«tool» <b>CrabShare.DbMigrator</b><br>' + small('database/migrations V001–V017 (DbUp)'), 1320, 530, 320, 90);
  P('load', '«tool» <b>CrabShare.Load</b><br>' + small('concurrent API and settlement runner'), 1320, 650, 320, 80);
  // phụ thuộc giữa các sub-system
  dep('web', 'api', 'exitX=1;exitY=0.3;entryX=0;entryY=0.1268;', 'HTTPS');
  dep('mob', 'api', 'exitX=1;exitY=0.5;entryX=0;entryY=0.6408;', 'HTTPS');
  dep('sim', 'api', O.plannedEdge + 'exitX=1;exitY=0.5;entryX=0;entryY=0.9014;');
  dep('prog', 'feat', 'exitX=0.5;exitY=1;entryX=0.1477;entryY=0;', '«import»');
  dep('feat', 'common', 'exitX=0.1136;exitY=1;entryX=0.25;entryY=0;');
  dep('feat', 'infra', 'exitX=0.7955;exitY=1;entryX=0.65;entryY=0;');
  // phụ thuộc giữa các nhóm module (số = dòng bảng Figure 4.5)
  dep('g_sale', 'g_fund', '', '3');
  dep('g_fund', 'g_farm', 'exitX=0.15;exitY=1;entryX=0.85;entryY=0;', '10');
  dep('g_fund', 'g_set', RED + 'exitX=1;exitY=0.35;entryX=0;entryY=0.35;', '11');
  dep('g_set', 'g_fund', RED + 'exitX=0;exitY=0.65;entryX=1;entryY=0.65;', '12');
  dep('g_sale', 'g_farm', '', '4');
  dep('g_prod', 'g_farm', 'exitX=0.15;exitY=0;entryX=0.85;entryY=1;', '5, 7');
  dep('g_sale', 'g_prod', O.plannedEdge + 'exitX=0.7;exitY=1;entryX=0.7;entryY=0;align=left;spacingLeft=6;', 'P2 «planned»');
  dep('common', 'g_prod', RED + 'exitX=0.9;exitY=0;entryX=0.2;entryY=1;', '13');
  dep('infra', 'g_prod', RED + 'exitX=0.1;exitY=0;entryX=0.4;entryY=1;', '14');
  dep('infra', 'common', 'exitX=0;exitY=0.3;entryX=1;entryY=0.3;', '15');
  dep('common', 'infra', 'exitX=1;exitY=0.7;entryX=0;entryY=0.7;', '15');
  dep('g_set', 'engine', '', '«import»');
  dep('tests', 'engine', '');
  dep('tests', 'api', 'exitX=0;exitY=0.5;entryX=1;entryY=0.5;');
  const leg9 = `<b>Reading the figure</b> — folder = package; dashed arrow = dependency; number = row of ${DET.pkgTable}, part (b), as on the arrows of ${DET.pkgBackend}; red = cycle (Payments ⇄ Settlement, 11 and 12) or layer breach (Common → Alerts 13, Infrastructure → Alerts and Evidence 14); Common ⇄ Infrastructure (15) is mutual; dashed grey folder or «planned» = Register v1.4, not in code yet. Features do call each other's services: FundingService, OrderService and PreorderService call PaymentRequestService; SettlementPayoutService calls PayoutSendService. Payment confirmations come back through IPaymentPurposeHandler, so Payments does not depend on its callers. Web and mobile features also import each other (${DET.packages}). Planned dependencies (grey dashed): P1 Ingestion → Production, P2 Orders → Alerts (final-order reminder). <b>Removed in v1.4, still in code (not drawn)</b>: the Catalog module (listings, price history, cart, checkout, retail orders) and the Offtake module (commitments, priority window) with their dependencies (Orders ⇄ Catalog, Catalog → Alerts, Offtake → Payments, Orders and Funding, Harvest → Catalog); tags in Harvest; PreorderBalanceJob and PreorderBalanceService in Orders.<br>${PENDING}`;
  d.vertex(leg9, O.legend, 380, 820, 1260, legendH(leg9, 1260, 80), { raw: true });
  d.check();
}

// =====================================================================================================
// O.6 Logical ERD (overview) — thực thể v1.4 theo vùng dữ liệu, khoá nghiệp vụ, quan hệ n–n đã phân rã; * = planned, / = dẫn xuất.
// Tên thuộc tính PascalCase như Figure 4.2; dòng 11 px. BoxRow thuộc Batch, RowAllocation Held/Allocated/Released.
// Truy vết QR qua Crab.OrderId* (như 4.2.3); HarvestRecord không mang OrderId (như 4.2.4).
function logicalPage(f) {
  const d = openPage(f, 'logical');
  const RH = 18, HH = 24;
  const Ecard = (k, name, rows, x, y, w = 230, planned = false) => stackBox(d, k, `<b>${name}</b>${planned ? ' ' + PL : ''}`, rows.map(t => ({ text: t, raw: true, style: ROW11 })), x, y, w, S.entity(planned ? '#f8fafc' : '#eef2ff', planned ? '#64748b' : '#3730a3') + 'fontStyle=0;fontSize=12;' + (planned ? 'dashed=1;' : ''), RH, { headerH: HH });
  const cardH = (n) => HH + n * RH + 4;
  const area = (k, title, x, y, w, h) => d.vertex(`<b>${title}</b>`, O.group, x, y, w, h, { key: k, raw: true, container: true });
  const R = (a, b, ca, cb, style = '', pts, label) => d.edge(a, b, O.er(card(ca), card(cb)) + style, { points: pts, label });
  const fy = (cardY, n, targetCy) => ((targetCy - cardY) / cardH(n)).toFixed(4); // điểm ra trên cạnh phải của thẻ, thẳng hàng với tâm thẻ đích
  // ----- A1 -----
  area('A1', 'A1 · Identity, accounts, farm &amp; boxes', 30, 66, 520, 470);
  Ecard('User', 'User', ['PK UserId', 'Email (unique) · FullName', 'Roles · Status'], 50, 106);
  Ecard('Operator', 'Operator', ['PK OperatorId · Status', 'LegalName · TaxCode (unique)', 'staff: User (OperatorMember)'], 300, 106);
  Ecard('Investor', 'Investor', ['PK, FK UserId → User', 'VerificationStatus'], 50, 250);
  Ecard('Box', 'Box', ['PK BoxId · Status', 'FK OperatorId · BoxCode (unique)', 'RowCode'], 300, 250);
  Ecard('Customer', 'Customer', ['PK, FK UserId → User', 'DisplayName · Address'], 50, 400);
  Ecard('BoxRow', 'BoxRow', ['PK BoxRowId · RowCode', 'FK BatchId → Batch', '/BoxCount · /CapitalVnd'], 300, 400, 230, true);
  R('User', 'Investor', '1', '0..1'); R('User', 'Customer', '1', '0..1', '', [[40, 106 + cardH(3) / 2], [40, 400 + cardH(2) / 2]]); R('Operator', 'User', '1', '1..N');
  R('Operator', 'Box', '1', '0..N');
  // ----- A2 -----
  area('A2', 'A2 · Batch, cost &amp; funding', 570, 66, 540, 470);
  Ecard('Batch', 'Batch', ['PK BatchId · BatchCode · Status', 'FK OperatorId → Operator', 'PricePerKgVnd* · FloorPriceVnd*', 'SurvivalThresholdPct*', 'DeliveryRadiusKm* · SalesWindowDays*', 'MinViableCapital · MinPreOrderRatioPct*'], 590, 106, 250);
  Ecard('Cost', 'StandardCostVersion', ['FK BatchId · VersionNo', 'Status · LockedAt'], 860, 106);
  Ecard('Tier', 'RemunerationTier', ['FK BatchId · TierNo', 'MinSurvivalPct → RemunerationPct'], 860, 184, 230, true);
  Ecard('Tranche', 'DisbursementTranche', ['FK BatchId · TrancheNo', 'PlannedAmountVnd · Status'], 860, 262);
  Ecard('Contribution', 'Contribution', ['PK ContributionId · Status', 'FK BatchId, InvestorId → Investor', 'AmountVnd (Σ row capital*) · ExpiresAt'], 590, 290, 250);
  Ecard('BoxAlloc', 'BoxAllocation', ['FK BatchId, BoxId → Box', 'FK BoxRowId* → BoxRow', 'resolves Batch ⟷ Box'], 860, 352);
  Ecard('RowAlloc', 'RowAllocation', ['PK RowAllocationId', 'FK ContributionId, BoxRowId → BoxRow', 'Status: Held, Allocated, Released'], 860, 446, 230, true);
  Ecard('Contract', 'InvestmentContract', ['ContractNo · FK ContributionId', 'Status · FinalHash'], 590, 444, 250);
  R('Batch', 'Cost', '1', '1..N', `exitX=1;exitY=${fy(106, 6, 106 + cardH(2) / 2)};entryX=0;entryY=0.5;`);
  R('Batch', 'Tier', '1', '1..N', `exitX=1;exitY=${fy(106, 6, 184 + cardH(2) / 2)};entryX=0;entryY=0.5;`);
  R('Batch', 'Tranche', '1', '0..N', 'exitX=0.995;exitY=1;entryX=0;entryY=0.5;'); R('Batch', 'Contribution', '1', '0..N');
  R('Batch', 'BoxAlloc', '1', '1..N', 'exitX=0.96;exitY=1;entryX=0;entryY=0.3;'); R('Contribution', 'RowAlloc', '1', '1..N', 'exitX=1;exitY=0.85;entryX=0;entryY=0.5;'); R('Contribution', 'Contract', '1', '0..1');
  // ----- A3 -----
  area('A3', 'A3 · Production &amp; evidence', 1130, 66, 490, 470);
  Ecard('Log', 'ProductionLog', ['FK BatchId · LogDate', 'FeedKg · HealthNote · Source'], 1150, 106, 220);
  Ecard('Ingest', 'IngestionMessage', ['PK IngestionMessageId', 'FK OperatorId · ClientMessageId', 'MessageType · ReceivedAt · Status'], 1390, 106, 220, true);
  Ecard('Event', 'BoxEvent', ['FK BoxAllocationId', 'EventType · OccurredAt', 'Source (App or Ingestion*)'], 1150, 260, 220);
  Ecard('Evidence', 'Evidence', ['Sha256 (unique)', 'FK BoxId, BatchId', 'CapturedAt · Location', 'RiskScore · ReviewStatus'], 1390, 260, 220);
  R('Ingest', 'Event', '1', '0..N', 'dashed=1;', null, 'creates');
  Ecard('Crab', 'Crab', ['PK CrabId · Status · WeightG', 'FK BoxAllocationId → BoxAllocation', 'FK OrderId* → SalesOrder (0..1)'], 1150, 380, 220);
  // ----- A4 -----
  area('A4', 'A4 · Harvest, pricing &amp; traceability', 30, 556, 520, 360);
  Ecard('Harvest', 'HarvestRecord', ['PK, FK BoxEventId', 'FK CrabId (unique) · FK HarvestId', '/BoxCode · WeightG · /GradeCode'], 50, 596);
  Ecard('Qr', 'OrderQrCode', ['PK OrderQrCodeId · QrToken', 'FK OrderId (unique)'], 300, 596, 230, true);
  Ecard('PriceObs', 'PriceObservation', ['ObservedOn · Source', 'CrabType · Grade', 'PriceVndPerKg'], 50, 746, 230, true);
  Ecard('PriceSug', 'PriceSuggestion', ['FK BatchId · TargetFrom–To', 'Low · Mid · HighVndPerKg', 'MapePct · ModelVersion'], 300, 746, 230, true);
  // ----- A5 -----
  area('A5', 'A5 · Bulk orders, invoices &amp; complaints', 570, 556, 540, 360);
  Ecard('Order', 'SalesOrder', ['PK OrderId · OrderNo · Status', 'FK BatchId, CustomerId*', 'OrderType* · SaleReason*', 'CrabCount* · EstimatedKg*', 'DepositAmount · WeighedKg*', 'TransitLossKg* · /BalanceVnd*'], 590, 596, 240);
  Ecard('Invoice', 'Invoice', ['PK InvoiceId · InvoiceNo', 'FK OrderId (unique)', 'AmountVnd · IssuedAt'], 860, 596, 230, true);
  Ecard('Complaint', 'Complaint', ['FK OrderId', 'Type · Resolution · Status'], 860, 700);
  Ecard('Hold', 'PreOrderHold', ['FK BatchId, OrderId (unique)', 'CrabCount · Status · ExpiresAt'], 590, 766, 240, true);
  Ecard('Quota', 'PreOrderQuota', ['PK, FK BatchId → Batch', 'MaxCrabCount · /Held · /Deposited'], 860, 798, 230, true);
  R('Order', 'Invoice', '1', '0..1', `exitX=1;exitY=${fy(596, 6, 596 + cardH(3) / 2)};entryX=0;entryY=0.5;`);
  R('Order', 'Complaint', '1', '0..N', 'exitX=1;exitY=0.9;entryX=0;entryY=0.5;');
  R('Order', 'Hold', '1', '0..1'); R('Quota', 'Hold', '1', '0..N', `exitX=0;exitY=0.5;entryX=1;entryY=${fy(766, 2, 798 + cardH(2) / 2)};`);
  // ----- A6 -----
  area('A6', 'A6 · Payments &amp; settlement', 1130, 556, 490, 360);
  Ecard('Settle', 'Settlement', ['FK BatchId (unique) · Status', '/RevenuePool · /SurvivalRatePct*', 'FK AppliedTierId* → RemunerationTier'], 1150, 596, 220);
  Ecard('SLine', 'SettlementLine', ['FK SettlementId, InvestorId', 'resolves Settlement ⟷ Investor', '/NetPayout'], 1390, 596, 220);
  Ecard('RevLine', 'RevenueLine', ['FK SettlementId · LineType*', 'FK OrderId · AmountVnd'], 1150, 716, 220, true);
  Ecard('PayReq', 'PaymentRequest', ['ReferenceCode · Purpose', 'FK ContributionId | OrderId'], 1150, 816, 220);
  Ecard('PayIns', 'PaymentInstruction', ['Type · AmountVnd · Status', 'FK TrancheId | LineId'], 1390, 746, 220);
  R('Settle', 'SLine', '1', '1..N'); R('Settle', 'RevLine', '1', '1..N', 'dashed=1;'); R('SLine', 'PayIns', '1', '0..1');
  const leg6 = `<b>Reading the figure</b> — the Register v1.4 logical model, independent of SQL Server: one card per entity with its key and main business attributes in PascalCase as in ${DET.logical} (areas 4.2.1–4.2.6); crow's foot lines inside an area, cross-area links written as FK → parent. Dashed grey card or * = planned (no table or column in V001–V017 yet); / = derived. Box rows: a BoxRow belongs to the Batch (unique BatchId + RowCode) and groups the boxes allocated to it; at most one Held or Allocated RowAllocation per BoxRow, so a confirmed row has one investor, and Contribution.AmountVnd is the capital of its rows. Many-to-many links are resolved by RowAllocation (Contribution ⟷ BoxRow), BoxAllocation (Batch ⟷ Box) and SettlementLine (Settlement ⟷ Investor). SalesOrder.OrderType ∈ BulkPreOrder, InvoicedSale (SaleReason LowGrade or ForfeitResale), FinalOrder; every delivered order has one Invoice; BalanceVnd = WeighedKg × price per kg − DepositAmount; RevenueLine.LineType ∈ DeliveredOrder, InvoicedSale, ForfeitedDeposit, FinalOrder; PreOrderQuota and PreOrderHold (15 minutes) keep a batch from being oversold. The order QR code traces an order back through Crab.OrderId* (the crabs delivered in it) and HarvestRecord.CrabId to its box and Batch. Production logs, box events and evidence may come from an IngestionMessage*. Money is integer VND. Removed in v1.4 and kept only in the physical model (${OF('physical')}), not drawn: ProductListing, cart lines, OfftakeCommitment, CrabTag, water-quality thresholds and readings. Full model: ${DET.logical} and ${DET.logicalTable}.<br>${PENDING}`;
  d.vertex(leg6, O.legend, 30, 936, 1590, legendH(leg6, 1590, 96), { raw: true });
  d.check();
}

// Thứ tự trang = thứ tự số O1 … O28 của danh mục PG (gom theo loại, theo thứ tự hình của bộ chi tiết)
const PAGE_FN = {
  context: contextPage, usecase: useCasePage, concept: conceptualPage, screen: screenFlowPage, component: componentPage,
  logical: logicalPage, physical: physicalAreasPage, deployment: deploymentPage, package: packagePage,
  actAll: activityOverviewPage, classPattern: classPatternPage, classMoney: classCollabPage,
};
for (const m of MACHINES) PAGE_FN[m.pg] = (f) => statePage(f, m);
for (const w of WF_PAGES) PAGE_FN[w.pg] = (f) => workflowPage(f, w);
for (const q of SEQS) PAGE_FN[q.pg] = (f) => sequencePage(f, q);
const PAGES = Object.keys(PG).sort((x, y) => PG[x][0] - PG[y][0]).map(k => {
  if (!PAGE_FN[k]) throw new Error('no page function for ' + k);
  return PAGE_FN[k];
});
if (Object.keys(PAGE_FN).length !== Object.keys(PG).length) throw new Error('page catalogue and page functions differ');

function run(out) {
  const f = new DrawioFile();
  for (const p of PAGES) p(f);
  const file = f.write(path.join(out, 'CrabShare_Overview_Diagrams.drawio'));
  console.log(`Overview diagrams done: ${f.diagrams.length} pages → ${file}`);
  if (INFO.length) console.log('Info: ' + INFO.join(' · '));
  if (WARN.length) { console.log(`LAYOUT WARNINGS (${WARN.length}):`); for (const w of WARN) console.log('  ' + w); }
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run, measure };
