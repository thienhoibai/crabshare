'use strict';
// Business Context Diagram kiểu DFD mức 0 (một tiến trình hình tròn ở giữa), giữ bố cục bản vẽ tay của nhóm:
// Investor trên trái, Platform Administrator trên phải, Operator trái, Customer phải, 4 hệ thống ngoài ở dưới.
// v3.1 (05/11/2026) theo Phiếu đăng ký v1.4 và góp ý duyệt đợt 1 (BC-01…05, ND-30, G-01, G-02):
//  - gom luồng thành gói thông tin mức nghiệp vụ (2–6 gói mỗi chiều); nội dung từng gói ghi trong Notes, bảng đầy đủ để trong SRS;
//  - chữ luồng 12 px, tên thực thể 15 px; không ghi mã commit, không nhắc API;
//  - luồng nét đứt xám #64748b kèm «planned» = có trong phiếu v1.4 nhưng code chưa có; luồng có một phần planned ghi "(… «planned»)";
//  - Customer có luồng hoàn cọc / mất cọc; thiết bị và camera của trại (giả lập) thay cho Farm Management System.
// v3.2 (05/11/2026) theo quyết định đợt 2 (brief mục 10): hàng hộp thuộc Lô nằm trong Batch Proposal (D2, ND-13);
//  "Invoiced Sale Record (low-grade or resold crabs, final order)" (D8); hoàn cọc / mất cọc theo D3 trong Notes.
// Không có đường nào cắt nhau: các luồng cùng một phía lồng nhau theo hình chữ L.
// Chạy: node gen-context-dfd.js <thư-mục-ra>            → <thư-mục-ra>/CrabShare_Business_Context_DFD.drawio
//       node gen-context-dfd.js <file.drawio> [...]     → ghi đúng các file đó
//       require('./gen-context-dfd.js').run(outDir)     (giống các gen-*.js khác)
const fs = require('fs');
const path = require('path');

const FILE = 'CrabShare_Business_Context_DFD.drawio';
const META = 'v3.2 · 05/11/2026 · Register v1.4';
const GREY = '#64748b';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const html = (s) => String(s).replace(/&(?![a-z]+;|#\d+;)/g, '&amp;'); // nhãn html=1: & phải là thực thể HTML
const r2 = (v) => Math.round(v * 100) / 100;

function build() {
  const OY = 50; // dịch toàn bộ hình xuống để có chỗ cho caption
  const C = { cx: 760, cy: 700 + OY, r: 210 };
  const cells = [];
  const BOX = {};
  let n = 0;
  const Y = (y) => y + OY;

  function vertex(key, label, style, x, y, w, h) {
    BOX[key] = { x, y: Y(y), w, h };
    cells.push(`<mxCell id="${key}" value="${esc(label)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${Y(y)}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
  }
  // toạ độ thiết kế (chưa dịch OY) → điểm thật
  const onCircle = (deg) => { const t = deg * Math.PI / 180; return [C.cx + C.r * Math.cos(t), C.cy - C.r * Math.sin(t) - OY]; };
  const belowCircle = (x) => [x, C.cy - OY + Math.sqrt(C.r * C.r - (x - C.cx) ** 2)];
  const rel = (key, [px, py]) => { const b = BOX[key]; return [(px - b.x) / b.w, (py - b.y) / b.h]; };

  /** Luồng thông tin. pts (toạ độ thiết kế): từ điểm trên thực thể → các điểm gấp → điểm trên hình tròn.
   *  dir 'in' = vào hệ thống, 'out' = ra khỏi hệ thống. planned = nét đứt xám, nhãn kèm «planned». */
  function flow(entity, label, dir, ptsDesign, planned = false) {
    const pts = ptsDesign.map(([x, y]) => [x, Y(y)]);
    let p = pts, src = entity, tgt = 'sys';
    if (dir === 'out') { p = pts.slice().reverse(); src = 'sys'; tgt = entity; }
    const [sx, sy] = rel(src, p[0]), [tx, ty] = rel(tgt, p[p.length - 1]);
    // nhãn đặt giữa đoạn nằm ngang dài nhất (như bản gốc)
    let total = 0, best = null;
    for (let i = 0; i < p.length - 1; i++) {
      const len = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
      if (Math.abs(p[i + 1][1] - p[i][1]) < 0.5 && (!best || len > best.len)) best = { len, s: total + len / 2 };
      total += len;
    }
    const gx = best ? (best.s / total) * 2 - 1 : 0;
    const text = planned && !/«planned»/.test(label) ? `${label} «planned»` : label;
    const color = planned ? `strokeColor=${GREY};fontColor=${GREY};dashed=1;dashPattern=6 4;` : 'strokeColor=#000000;fontColor=#000000;';
    const style = `edgeStyle=none;html=1;rounded=0;endArrow=block;endFill=1;${color}fontSize=12;fontFamily=Segoe UI;labelBackgroundColor=#ffffff;`
      + `exitX=${sx.toFixed(4)};exitY=${sy.toFixed(4)};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${tx.toFixed(4)};entryY=${ty.toFixed(4)};entryDx=0;entryDy=0;entryPerimeter=0;`;
    const mid = p.slice(1, -1).map(([x, y]) => `<mxPoint x="${r2(x)}" y="${r2(y)}"/>`).join('');
    cells.push(`<mxCell id="f${++n}" value="${esc(html(text))}" style="${style}" edge="1" parent="1" source="${src}" target="${tgt}"><mxGeometry x="${gx.toFixed(4)}" relative="1" as="geometry">${mid ? `<Array as="points">${mid}</Array>` : ''}</mxGeometry></mxCell>`);
  }

  // ---------------- Caption ----------------
  cells.push(`<mxCell id="caption" value="${esc(`<b>Figure 1.1 – Business Context Diagram: CrabShare System and its environment</b><br><font style="font-size:12px" color="${GREY}">${META}</font>`)}" style="text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;overflow=hidden;fontFamily=Segoe UI;fontSize=16;" vertex="1" parent="1"><mxGeometry x="30" y="6" width="1300" height="44" as="geometry"/></mxCell>`);

  // ---------------- Hình và thực thể (vị trí theo bản vẽ tay) ----------------
  const ENT = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;fontColor=#000000;fontStyle=1;fontSize=15;fontFamily=Segoe UI;';
  const ENT_PLANNED = `rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=${GREY};fontColor=${GREY};fontStyle=1;fontSize=15;fontFamily=Segoe UI;dashed=1;dashPattern=6 4;`;
  const sub = (t) => `<br><span style="font-weight:normal;font-size:12px">${t}</span>`;
  vertex('sys', 'CrabShare System', 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#ffffff;strokeColor=#000000;fontColor=#000000;fontSize=28;fontFamily=Segoe UI;', C.cx - C.r, C.cy - C.r - OY, 2 * C.r, 2 * C.r);
  vertex('investor', 'Investor' + sub('(Financial; may also pre-order as a Customer)'), ENT, 30, 40, 610, 64);
  vertex('admin', 'Platform Administrator' + sub('(incl. Evidence Reviewer)'), ENT, 1100, 130, 240, 270);
  vertex('operator', 'Operator', ENT, 20, 470, 200, 560);
  vertex('customer', 'Customer' + sub('(bulk buyer: restaurant,<br>small trader)'), ENT, 1290, 660, 200, 220);
  vertex('ekyc', 'eKYC Provider', ENT, 290, 1100, 190, 64);
  vertex('dss', 'Digital Signature Service' + sub('(Viettel)'), ENT, 500, 1100, 210, 64);
  vertex('psp', 'Payment Service Provider' + sub('(payment intermediary)'), ENT, 940, 1100, 240, 64);
  vertex('dev', 'Farm Devices &amp; Cameras (simulated)' + sub('«planned» · a simulator stands in for the hardware'), ENT_PLANNED, 1200, 1100, 290, 64);

  // ---------------- Investor: phía trên, đi xuống rồi vào đỉnh hình tròn ----------------
  const INV_Y = 104;
  [ // vào hệ thống: cột trái của Investor; đường càng bên trái càng xuống thấp và vào hình tròn càng xa đỉnh
    ['KYC Profile'], ['Capital Commitment (box rows «planned»)'], ['Contract Signature'], ['Settlement Feedback'],
  ].forEach(([label, planned], i) => {
    const ex = 70 + 40 * i, lv = 330 - 30 * i, c = onCircle(145 - 7 * i);
    flow('investor', label, 'in', [[ex, INV_Y], [ex, lv], [c[0], lv], c], planned);
  });
  [ // ra khỏi hệ thống: cột phải của Investor (nhãn dài ở đoạn dài)
    ['Production Timeline (own rows «planned»)'], ['Payment Request & Investment Contract'], ['Statement, Payout & Refund Advice'], ['Batch Offering'],
  ].forEach(([label, planned], i) => {
    const ex = 280 + 70 * i, lv = 215 - 30 * i, c = onCircle(114 - 8 * i);
    flow('investor', label, 'out', [[ex, INV_Y], [ex, lv], [c[0], lv], c], planned);
  });

  // ---------------- Platform Administrator: phía trên bên phải ----------------
  [ // vào: từ cạnh trái của Admin sang trái rồi xuống
    ['Settlement Approval & Instruction Release'], ['Platform Parameters (limits «planned»)'], ['Approval Decisions (tiers «planned»)'],
    ['Price Dataset (assumed)', true], ['Evidence Review Decision'],
  ].forEach(([label, planned], i) => {
    const ey = 160 + 30 * i, c = onCircle(80 - 7 * i);
    flow('admin', label, 'in', [[1100, ey], [c[0], ey], c], planned);
  });
  [ // ra: từ cạnh phải hình tròn sang phải rồi lên đáy Admin
    'Approval Dossiers', 'Flagged Evidence & Escalated Alerts', 'Settlement Draft & Reconciliation Report', 'Operational Reports & Audit Log Extract',
  ].forEach((label, i) => {
    const c = onCircle(40 - 8 * i), ex = 1150 + 50 * i;
    flow('admin', label, 'out', [[ex, 400], [ex, c[1]], c]);
  });

  // ---------------- Operator: bên trái ----------------
  [ // gói cuối nhãn hai dòng nên đặt thấp hơn một chút để có chỗ (góc 197°)
    ['Harvest, Delivery & Returns (weighed kg «planned»)'], ['Batch Proposal (rows, prices, tiers «planned»)'], ['Operator Dossier & Box List'],
    ['Contract Signature & Tranche Request'], ['Production & Evidence Data'], ['Invoiced Sale Record «planned»<br>(low-grade or resold crabs, final order)', true],
  ].forEach(([label, planned], i) => { const c = onCircle(i < 5 ? 150 + 8 * i : 197); flow('operator', label, 'in', [[220, c[1]], c], planned); });
  [
    ['Approval Results & Investment Contract'], ['Alerts, Capture Requests & Evidence Notices'], ['Sale Price Range Suggestion', true], ['Pre-order Book & Statements'],
  ].forEach(([label, planned], i) => { const c = onCircle(205 + 10 * i), lv = 900 + 28 * i; flow('operator', label, 'out', [[220, lv], [c[0], lv], c], planned); });

  // ---------------- Customer: bên phải, đường thẳng ngang ----------------
  [['Bulk Pre-order & Address (crab count «planned»)'], ['Receipt, Return, Complaint & Rating'], ['Order QR Code', true]]
    .forEach(([label, planned], i) => { const c = onCircle(8 - 7 * i); flow('customer', label, 'in', [[1290, c[1]], c], planned); });
  [['Farm & Batch Map', true], ['Payment Request (deposit, balance)'], ['Order Status'], ['Deposit Refund & Forfeit Advice', true], ['Traceability Record', true]]
    .forEach(([label, planned], i) => { const c = onCircle(-14 - 8 * i); flow('customer', label, 'out', [[1290, c[1]], c], planned); });

  // ---------------- Hệ thống ngoài: phía dưới ----------------
  const BOT = 1100;
  [ // [thực thể, nhãn, chiều, x trên hình tròn, mức ngang, x trên thực thể, planned]
    ['ekyc', 'Identity Evidence', 'out', 680, 1010, 330], ['ekyc', 'Identity Verification Result', 'in', 698, 1032, 420],
    ['dss', 'Contract Document', 'out', 716, 1054, 545], ['dss', 'Signed Contract', 'in', 734, 1076, 625],
    ['psp', 'Batch Account & Payment Requests', 'out', 770, 1076, 990], ['psp', 'Transaction & Payout Results', 'in', 788, 1054, 1060],
    ['psp', 'Disbursement, Payout & Refund Instructions', 'out', 806, 1032, 1130],
    ['dev', 'Box Photos, Feeding & Box Events', 'in', 824, 1010, 1260, true],
  ].forEach(([ent, label, dir, x, lv, ex, planned]) => { const c = belowCircle(x); flow(ent, label, dir, [[ex, BOT], [ex, lv], [x, lv], c], planned); });

  // ---------------- Chú giải ----------------
  const legend = '<b>Notes</b> — DFD level 0, drawn as in the team\'s hand drawing. Solid arrow: information package handled by the current code. Dashed grey arrow or box with «planned»: in Register v1.4, not built yet; "(… «planned»)" marks the part of a package that is not built yet. '
    + 'Each arrow is one direction and one information package; packages never connect two external entities. '
    + '<b>Packages</b>: Production &amp; Evidence Data = daily logs, box events, live photos, explanations · Approval Decisions = operator, Batch (Standard Cost, floor price, remuneration tiers), KYC exception, milestone tranche · '
    + 'Alerts, Capture Requests &amp; Evidence Notices = production alerts, random capture requests, flagged-evidence notices · Pre-order Book &amp; Statements = bulk pre-orders to deliver, disbursement and settlement statements · '
    + 'Receipt, Return, Complaint &amp; Rating = receipt confirmation, return request, complaint, order rating · Batch Proposal = Standard Cost, box rows of the Batch (grouped by the boxes\' row codes, one investor per row), price per kg, floor price, survival threshold with remuneration tiers, delivery radius · Deposit Refund &amp; Forfeit Advice = every deposit refunded when the Batch does not open; a deposit forfeited when the Customer cancelled after paying and the Batch opened, or refuses delivery or does not pay the balance. The full Entity – Information Sent – Information Received table is in the SRS. '
    + 'The farm devices and cameras are simulated and post their data through one common data channel; there is no per-farm software integration. '
    + 'The Price Dataset (interviewed farm, dated press reports, simulated data) feeds the price module, which shows the Operator a price range with a warning and never an expected return; who loads it is assumed (Platform Administrator) and needs confirmation. '
    + 'Farmers, carriers and the committed buyer of the final order exchange nothing directly with CrabShare, so they are not drawn.'
    + '<br><b>Removed in v1.4 (still in code)</b>: Offtake Commitment, Offtake Claim, Product Listing, Product Catalogue, retail Order, Tag Scan and tag-scan packing; the Farm Management System is replaced by the simulated devices.'
    + '<br>Design decisions of 05/11/2026 applied here were confirmed by the lead.';
  // chiều cao ô ghi chú theo độ dài chữ (12 px ≈ 5,9 px/ký tự, dòng 15 px)
  const legendLines = legend.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').split('\n')
    .reduce((k, l) => k + Math.max(1, Math.ceil(l.length / Math.floor((1470 - 16) / 5.7))), 0);
  const legendH = legendLines * 15 + 24;
  cells.push(`<mxCell id="legend" value="${esc(legend)}" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#94a3b8;align=left;verticalAlign=top;spacing=8;fontSize=12;fontFamily=Segoe UI;" vertex="1" parent="1"><mxGeometry x="20" y="${Y(1176)}" width="1470" height="${legendH}" as="geometry"/></mxCell>`);

  const xml = `<mxfile host="app.diagrams.net" agent="crabshare-context-dfd" version="24.7.17" type="device"><diagram name="Business Context Diagram" id="context-dfd"><mxGraphModel dx="1600" dy="1300" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1520" pageHeight="${Math.max(Y(1380), Math.ceil((Y(1176) + legendH + 30) / 10) * 10)}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel></diagram></mxfile>`;
  return { xml, flows: n };
}

function write(file) {
  const { xml, flows } = build();
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, xml, 'utf8');
  console.log('wrote', file, `(${flows} flows)`);
}

/** Như các gen-*.js khác: ghi vào thư mục ra. */
function run(outDir) { write(path.join(outDir ?? path.join(__dirname, 'out'), FILE)); console.log('Business context DFD done'); }

if (require.main === module) {
  const outs = process.argv.slice(2);
  if (!outs.length) run(path.join(__dirname, 'out'));
  else for (const o of outs) o.toLowerCase().endsWith('.drawio') ? write(o) : run(o);
}
module.exports = { run, build, FILE };
