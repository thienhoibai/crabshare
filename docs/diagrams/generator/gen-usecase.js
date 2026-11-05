'use strict';
// Use Case Diagrams (SRS 2.2.1): LV0 tổng quan + sơ đồ phân hệ SD1, SD2, SD3, SD4a, SD4b, SD5.
// v3.1 (05/11/2026) theo Phiếu đăng ký v1.4, bảng tên dùng chung (brief 7.1) và góp ý duyệt đợt 1:
//  - giữ dạng mã UC01 (Jira, feature-map); UC bị bỏ không vẽ, chỉ liệt kê "Removed in v1.4 (still in code)" ở Notes của LV0;
//  - UC mới UC49–UC53 và UC54 Forfeit Deposit (extension mất cọc, «extend» UC27 và UC30) ghi «planned»;
//  - include/extend chỉ giữ chỗ đúng nghĩa: UC12 dùng chung cho UC10/UC27/UC30; UC06, UC15, UC36, UC54 là extend có điều kiện;
//  - Investor đặt trước như Customer (association tới UC27); 4 actor người + 4 hệ thống ngoài;
//  - chữ use case 12 px; SD4 tách hai trang để mỗi trang ≤ 12 use case và ≤ 5 quan hệ.
// v3.2 (05/11/2026) theo quyết định đợt 2 (brief mục 10): D1 điều kiện mở Lô, D2 hàng hộp thuộc Lô (ND-13), D3 mất cọc (UC54),
//  D5 tiền còn lại, D8 UC50 Record Invoiced Sale và RevenueLine InvoicedSale; D4, D6 ghi ở SD5.
// Bố cục: actor bên trái nối vào điểm trái của elip, actor bên phải nối vào điểm phải, nên đường không xuyên qua use case khác;
// SD1–SD5 không có đường cắt nhau; LV0 có số chỗ cắt tối thiểu về mặt hình học (giải thích trong Notes).
const path = require('path');
const { DrawioFile, S } = require('./lib');

const META = 'v3.2 · 05/11/2026 · Register v1.4';
const PENDING = 'Design decisions of 05/11/2026 applied here were confirmed by the lead.';
const GREY = '#64748b';
const PLANNED = `dashed=1;dashPattern=6 4;strokeColor=${GREY};fontColor=${GREY};`;
const UCW = 262, UCH = 88;

// Actor: con người = hình que; hệ thống ngoài = hình chữ nhật «actor».
const ACTORS = {
  investor: { name: 'Investor' },
  operator: { name: 'Operator' },
  customer: { name: 'Customer' },
  admin: { name: 'Platform Administrator' },
  ekyc: { name: 'eKYC Provider', ext: true },
  sign: { name: 'Digital Signature Service (Viettel)', ext: true },
  psp: { name: 'Payment Service Provider (payment intermediary)', ext: true },
  sim: { name: 'Farm Devices &amp; Cameras (simulated)', ext: true, planned: true },
};

// Danh mục use case v1.4. delta = phần v1.4 thêm vào mà code chưa có; planned = cả use case chưa có trong code.
const UC = {
  UC01: { name: 'Register Account' },
  UC02: { name: 'Complete Identity Verification (eKYC)' },
  UC03: { name: 'Maintain Payout Account' },
  UC04: { name: 'Submit Operator Application' },
  UC05: { name: 'Review Operator Application' },
  UC06: { name: 'Authorise Identity Verification Exception' },
  UC07: { name: 'Create Batch by Box Rows and Define Standard Cost', delta: 'rows, prices, tiers, radius' },
  UC08: { name: 'Review and Approve Batch', delta: 'floor price, tiers' },
  UC09: { name: 'Explore Batch Offerings' },
  UC10: { name: 'Reserve Box Rows and Commit Capital', delta: 'box-row choice' },
  UC11: { name: 'Acknowledge Investment Risk' },
  UC12: { name: 'Make Payment (VietQR)' },
  UC14: { name: 'Sign Investment Contract' },
  UC15: { name: 'Upload Offline-Signed Contract' },
  UC16: { name: 'Track Investment Portfolio' },
  UC17: { name: 'Record Production Logs and Box Events' },
  UC18: { name: 'Request Milestone Disbursement' },
  UC19: { name: 'Acknowledge Operations Alert' },
  UC20: { name: 'Monitor Escalated Alerts' },
  UC21: { name: 'View Production Timeline' },
  UC22: { name: 'Record Harvest per Box' },
  UC25: { name: 'Find Farms and Batches on Map', planned: true },
  UC27: { name: 'Place Bulk Pre-order with Deposit', delta: 'crab count, minimum qty, while funding, no listing' },
  UC28: { name: 'Track Order Status' },
  UC29: { name: 'Deliver Order and Record Weighed Quantity', delta: 'weighed kg, transit loss' },
  UC30: { name: 'Confirm Receipt and Pay Balance', delta: 'balance on weighed kg' },
  UC31: { name: 'Submit Return or Complaint' },
  UC32: { name: 'Resolve Order Complaint' },
  UC33: { name: 'Trace Order by QR Code', planned: true },
  UC34: { name: 'Rate Order' },
  UC35: { name: 'Review Settlement Statement' },
  UC36: { name: 'Submit Settlement Feedback' },
  UC37: { name: 'Publish Settlement Proposal' },
  UC38: { name: 'Run Settlement Calculation', delta: 'revenue types, tiers' },
  UC39: { name: 'Approve Settlement and Issue Payouts' },
  UC40: { name: 'Monitor Payout Reconciliation' },
  UC41: { name: 'Configure Platform Parameters', delta: 'deposit ratio, minimums, hold time, limits' },
  UC42: { name: 'Monitor Platform Reports' },
  UC43: { name: 'Export Audit Log' },
  UC44: { name: 'Register Boxes and Box Rows' },
  UC45: { name: 'Capture Production Evidence' },
  UC47: { name: 'Review Flagged Evidence' },
  UC48: { name: 'Submit Evidence Explanation' },
  UC49: { name: 'Get Sale Price Range Suggestion', planned: true },
  UC50: { name: 'Record Invoiced Sale', planned: true },
  UC51: { name: 'Record Final Order at Floor Price', planned: true },
  UC52: { name: 'Submit Farm Device and Camera Data', planned: true },
  UC53: { name: 'View Box Details of Own Rows', planned: true },
  UC54: { name: 'Forfeit Deposit', planned: true },
  UC55: { name: 'Cancel Bulk Pre-order', delta: 'forfeit once the Batch opens' },
};

// Bỏ trong v1.4: không vẽ, không dùng lại mã (brief 7.1).
const REMOVED = [
  ['UC13', 'Register Offtake Commitment', 'investor offtake removed'],
  ['UC23', 'Claim Priority Offtake Volume', 'priority offtake window removed'],
  ['UC24', 'Publish Product Listings', 'listings removed'],
  ['UC26', 'Place Order', 'retail sales and cart removed'],
  ['UC46', 'Print and Activate Crab Tag', 'per-crab tags removed; harvest per box and order QR instead'],
];

// Bố cục mỗi trang phân hệ: cols = x các cột elip, y0 = tâm hàng đầu, dy = khoảng cách hàng, rightX = x của actor bên phải.
// ucs: [id, cột, hàng, actors[], {ref, ports}] ; actors: {key: ['L'|'R', hàng]} ; rels: [from, kind, to]
// ports (tuỳ chọn) = {actor: [entryX, entryY]} để một đường đi phía trên/dưới use case bên cạnh.
const SUBSYSTEMS = [
  {
    key: 'SD1', name: 'Identity & Onboarding', range: 'UC01–UC06', fig: 'Figure 2.2',
    cols: [560, 880], y0: 200, dy: 125, rightX: 1200,
    ucs: [
      ['UC01', 0, 0, ['customer', 'investor', 'operator']],
      ['UC03', 0, 1, ['investor', 'operator']],
      ['UC02', 0, 2, ['investor', 'operator', 'ekyc']],
      ['UC06', 0, 3, ['admin']],
      ['UC05', 0, 4, ['admin']],
      ['UC04', 1, 0, ['operator']],
    ],
    actors: { customer: ['L', -0.22], investor: ['L', 1.22], admin: ['L', 3.6], operator: ['R', 2], ekyc: ['R', 2.95] },
    rels: [],
    notes: 'UC02 stores only the verification result; ID images never persist. UC06 is the Platform Administrator\'s own goal — precondition: {the eKYC check failed or the provider is unavailable}; the Administrator records the manual exception. Customers register (UC01) but need no eKYC or payout account in Register v1.4.',
  },
  {
    key: 'SD2', name: 'Batch & Investment', range: 'UC07–UC16, UC49', fig: 'Figure 2.3',
    cols: [560, 900], y0: 195, dy: 118, rightX: 1240,
    ucs: [
      ['UC09', 0, 0, ['investor']],
      ['UC16', 0, 1, ['investor']],
      ['UC11', 0, 2, ['investor']],
      ['UC10', 0, 3, ['investor']],
      ['UC14', 0, 4, ['investor', 'operator', 'sign']],
      ['UC07', 0, 5, ['operator']],
      ['UC49', 0, 6, ['operator']],
      ['UC12', 1, 3, ['psp']],
      ['UC15', 1, 5, ['admin']],
      ['UC08', 1, 6, ['admin']],
    ],
    actors: { investor: ['L', 1.9], operator: ['L', 5.35], psp: ['R', 3], sign: ['R', 4], admin: ['R', 5.5] },
    rels: [['UC10', 'include', 'UC12']],
    notes: 'UC07 groups the Batch\'s boxes into box rows by their row code (a BoxRow belongs to the Batch; each row\'s capital is at least the platform minimum contribution) and locks, at funding open, the Standard Cost with the price per kg and the floor price; UC49 is used while setting the price per kg and shows a range with a warning, never an expected return. UC08 also approves the floor price and the remuneration tiers. UC11 is a precondition of UC10 (risk disclosure accepted). UC10: the investor picks free box rows, each row going to one investor only; the amount is the sum of the chosen rows\' capital (boxes × Standard Cost per box), so the minimum contribution is one row; it is paid once in full (UC12, VietQR) and the rows are held 30 minutes, never past the funding deadline. The Batch opens when the minimum viable capital is reached AND the pre-order ratio ≥ the minimum; otherwise it is cancelled and investors and depositing Customers are refunded; between the minimum and the target only the boxes of funded rows are stocked and capital that cannot become boxes is refunded. UC14: Operator signs first, then the Investor (Viettel); signing and paying can happen in either order. UC15 is the Platform Administrator\'s own goal — precondition: {the contract was signed on paper}. ' + PENDING,
  },
  {
    key: 'SD3', name: 'Production, Evidence & Harvest', range: 'UC17–UC22, UC44–UC48, UC52–UC53', fig: 'Figure 2.4',
    cols: [560, 920], y0: 200, dy: 110, rightX: 1270,
    ucs: [
      ['UC44', 0, 0, ['operator']],
      ['UC17', 0, 1, ['operator']],
      ['UC45', 0, 2, ['operator']],
      ['UC48', 0, 3, ['operator']],
      ['UC19', 0, 4, ['operator']],
      ['UC18', 0, 5, ['operator', 'admin']],
      ['UC21', 0, 6, ['operator', 'admin', 'investor']],
      ['UC22', 0, 7, ['operator']],
      ['UC52', 1, 1, ['sim']],
      ['UC47', 1, 3, ['admin']],
      ['UC20', 1, 4, ['admin']],
      ['UC53', 1, 7, ['investor']],
    ],
    actors: { operator: ['L', 3.5], sim: ['R', 1], admin: ['R', 4], investor: ['R', 7] },
    rels: [],
    notes: 'UC44 registers boxes with their row code and number; the box rows of a Batch are formed from these codes in UC07 (a BoxRow belongs to the Batch). UC45: live in-app photo with server time, location, box number and SHA-256 hash; the crab-detection module («planned», the code uses a no-op detector) only checks that a crab is present and adds to the risk score, never rejecting alone; doubtful evidence goes to UC47 (Evidence Reviewer permission, never on own investments). UC48 precondition: {evidence Flagged}. UC52: the simulated farm devices and cameras send photos, feeding records, box events and logs through one common data channel. UC53: an investor sees box details only for own rows; others see Batch-level figures in UC21, which the Platform Administrator also follows. UC18: the Platform Administrator releases, asks for an explanation or blocks the tranche. UC22 records harvest per box; per-crab tags are dropped. ' + PENDING,
  },
  {
    key: 'SD4a', name: 'Sales — Pre-order, Payment & Receipt', range: 'UC25, UC27, UC28, UC30, UC54, UC55', fig: 'Figure 2.5a',
    cols: [560, 900], y0: 205, dy: 120, rightX: 1240,
    ucs: [
      ['UC27', 0, 0, ['customer']],
      ['UC55', 0, 1, ['customer']],
      ['UC54', 0, 2, []],
      ['UC25', 0, 4, ['customer']],
      ['UC28', 0, 5, ['customer']],
      ['UC12', 1, 0, ['psp'], { ref: 'SD2' }],
      ['UC30', 1, 2.6, ['customer']],
    ],
    actors: { investor: ['L', 2.9, 66], customer: ['L', 2.9], psp: ['R', 0] },
    gens: [['investor', 'customer']],
    rels: [['UC27', 'include', 'UC12'], ['UC30', 'include', 'UC12'], ['UC54', 'extend', 'UC55'], ['UC54', 'extend', 'UC30']],
    notes: 'The Investor inherits every Customer use case (generalization) {not the Batch\'s Operator or its related parties}. UC27: bulk pre-order by number of crabs (or kg) from the minimum quantity, deposit by VietQR while the Batch is funding; no overselling of the crabs open for pre-order. UC55: cancelling before the deposit is paid costs nothing (as when the 15-minute QR expires); a pre-order cancelled after the deposit is refunded if the Batch does not open. UC30: the Customer checks the crabs and pays the balance = weighed kg × price per kg − deposit, where weighed kg is the live crabs received (dead or spoiled crabs excluded, the transit loss only recorded); a negative balance is refunded. UC54 Forfeit Deposit «extend» UC55 — extension point: cancellation after the deposit; condition: {the Batch opened}; «extend» UC30 — extension point: delivery; condition: {the Customer refuses delivery or does not pay the balance}. The deposit becomes Batch revenue (ForfeitedDeposit) and, in the UC30 case, the crabs are resold through UC50 (InvoicedSale, Figure 2.5b). When the Batch does not open every deposit is refunded, cancelled orders included. ' + PENDING,
  },
  {
    key: 'SD4b', name: 'Sales — Delivery, Returns & Invoiced Orders', range: 'UC29, UC31–UC34, UC50–UC51', fig: 'Figure 2.5b',
    cols: [560, 900], y0: 205, dy: 120, rightX: 1240,
    ucs: [
      ['UC31', 0, 0, ['customer']],
      ['UC34', 0, 1, ['customer']],
      ['UC33', 0, 2, ['customer']],
      ['UC29', 1, 0, ['operator']],
      ['UC50', 1, 1, ['operator']],
      ['UC51', 1, 2, ['operator']],
      ['UC32', 1, 3, ['operator', 'admin']],
    ],
    actors: { investor: ['L', 1, 66], customer: ['L', 1], operator: ['R', 1.2], admin: ['R', 2.9] },
    gens: [['investor', 'customer']],
    rels: [],
    notes: 'The Investor inherits the Customer use cases (generalization) {not the Batch\'s Operator or its related parties}. UC29: delivery with the crabs weighed at the door; the transit loss is recorded, not charged and not deducted again. UC31 precondition: {order Delivered, within the return window}; it covers return requests and complaints, which the Operator answers and UC32 resolves. UC34 precondition: {order Completed}. UC33: the QR code printed on the delivery note opens the farm, Batch and harvest record, without login. UC50 Record Invoiced Sale: one invoiced order type (InvoicedSale) for low-grade crabs and for crabs resold after a forfeited order. UC51: leftover stock goes to the committed buyer (outside the system) through one final order (FinalOrder), never below the floor price. Every delivered order (bulk pre-order, invoiced sale, final order) has an invoice. ' + PENDING,
  },
  {
    key: 'SD5', name: 'Settlement & Oversight', range: 'UC35–UC43', fig: 'Figure 2.6',
    cols: [560, 900, 1240], y0: 195, dy: 118, rightX: 1560, extraBottom: 60,
    ucs: [
      ['UC36', 0, 0, ['investor']],
      ['UC35', 0, 1, ['investor', 'operator']],
      ['UC42', 0, 4, ['operator', 'admin']],
      ['UC39', 1, 5, ['admin', 'psp'], { ports: { admin: [0.5, 0], psp: [0.5, 1] } }],
      ['UC38', 2, 0, ['admin']],
      ['UC37', 2, 1, ['admin']],
      ['UC41', 2, 2, ['admin']],
      ['UC43', 2, 3, ['admin']],
      ['UC40', 2, 5, ['admin', 'psp']],
    ],
    actors: { investor: ['L', 0.4], operator: ['L', 2.7], admin: ['R', 4], psp: ['R', 6.05] },
    rels: [['UC36', 'extend', 'UC35']],
    notes: 'UC38: the Platform Administrator starts the calculation and the settlement engine computes it. Actual revenue = revenue lines DeliveredOrder (past the return window), InvoicedSale, ForfeitedDeposit and FinalOrder; Revenue Pool = revenue − the locked Standard Cost of the funded boxes (unused cost stays with the Operator); Operator remuneration = floor(Pool × rate), only when Pool > 0, cut by tier when survival (1 − deaths ÷ crabs stocked in funded boxes) is below the threshold; the rest pro rata with largest-remainder rounding; loss capped at each investor\'s capital, any excess borne by the Operator. UC37 opens a 7–14 day feedback window; UC36 «extend» UC35 — condition: {investor disputes own line}; UC39 only after the window closes, then the statement is locked (BR-30). UC40 follows the payout instructions at the payment intermediary. UC41: fees, minimum contribution (the floor for a row\'s capital), reservation hold time, deposit ratio, minimum order quantity, minimum pre-order ratio; the code configures fee tiers only (minimum contribution and deposit ratio are set per Batch, the hold time in settings). UC43 exports the hash-chained audit log. ' + PENDING,
  },
];

// ---------------- vẽ ----------------
function ucLabel(id, opts = {}) {
  const u = UC[id];
  let s = `<b>${id}</b><br>${u.name}`;
  if (u.planned) s += `<br><font style="font-size:11px" color="${GREY}">«planned»</font>`;
  else if (u.delta) s += `<br><font style="font-size:11px" color="${GREY}">v1.4: ${u.delta} «planned»</font>`;
  if (opts.ref) s += `<br><font style="font-size:11px" color="${GREY}">(defined in ${opts.ref})</font>`;
  return s;
}
function ucStyle(id, opts = {}) {
  const u = UC[id];
  let st = S.usecase + 'fontSize=12;spacing=3;';
  if (u.planned) st += PLANNED;
  if (opts.ref) st += 'fillColor=#f1f5f9;';
  return st;
}

function drawActor(d, key, x, y, w = 190) {
  const a = ACTORS[key];
  if (a.ext) {
    const label = `«actor»<br><b>${a.name}</b>${a.planned ? '<br>«planned»' : ''}`;
    const h = a.planned ? 70 : 62;
    return d.vertex(label, S.extActor + 'fontSize=12;' + (a.planned ? PLANNED : ''), x - w / 2, y - h / 2, w, h, { key, raw: true });
  }
  return d.vertex(a.name, S.actor + 'fontSize=13;', x - 20, y - 35, 40, 70, { key });
}

/** Chia điểm nối trên cạnh trái/phải của elip khi nhiều actor cùng phía nối vào một use case. */
function ports(n) { return n === 1 ? [0.5] : n === 2 ? [0.38, 0.62] : [0.3, 0.5, 0.7]; }
/** Chiều cao ô ghi chú theo độ dài chữ (cỡ 12, Segoe UI ≈ 5,6–5,9 px/ký tự; lấy 5,9 để còn dư một chút). */
function noteHeight(html, width, px = 5.9, lineH = 15) {
  const text = html.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  const cpl = Math.floor((width - 20) / px);
  const lines = text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / cpl)), 0);
  return lines * lineH + 22;
}

const LEGEND = '<b>Legend</b> (UML 2.5) — ellipse = use case (code + name); dashed grey with «planned» = in Register v1.4, not yet on develop @ 420a379; grey line "v1.4: … «planned»" = the use case exists, the v1.4 additions do not; grey fill = use case defined in another subsystem. Solid line = association (the actor takes part); hollow-triangle arrow = generalization (the child actor can do what the parent does); dashed arrow = «include» (base → included) or «extend» (extension → base, extension point and condition in the notes).';

/** Tiêu đề trang (G-01: dòng phiên bản 11 px thay cho 10 px của lib.caption; lib.js giữ nguyên). */
function caption(d, figure, title) {
  return d.text(`<b>${figure} – ${title}</b><br><font style="font-size:11px" color="${GREY}">${META}</font>`, 20, 10, 1200, 46, 'fontSize=15;');
}

function subsystemPage(f, sd) {
  const d = f.page(`${sd.key} – ${sd.name}`);
  caption(d, sd.fig, `Use Case Diagram: ${sd.key} ${sd.name} (${sd.range})`);
  const X = (c) => sd.cols[c], Y = (r) => sd.y0 + r * sd.dy;
  const maxRow = Math.max(...sd.ucs.map(u => u[2]));
  const bx = 410, by = 100, bw = Math.max(...sd.cols) + UCW / 2 + 35 - bx, bh = Y(maxRow) + UCH / 2 + 30 + (sd.extraBottom ?? 0) - by;
  d.vertex(`CrabShare System · ${sd.key} ${sd.name}`, S.boundary + 'fontSize=13;', bx, by, bw, bh, { key: 'boundary' });
  for (const [id, c, r, , opts = {}] of sd.ucs) d.vertex(ucLabel(id, opts), ucStyle(id, opts), X(c) - UCW / 2, Y(r) - UCH / 2, UCW, UCH, { key: id, raw: true });
  // actor: [L|R, hàng, x riêng (tuỳ chọn)]; generalization giữa hai actor cùng hàng vẽ ngang (tam giác rỗng ở actor cha)
  const apos = Object.fromEntries(Object.entries(sd.actors).map(([k, [side, r, x]]) => [k, [x ?? (side === 'L' ? 160 : sd.rightX), Y(r)]]));
  for (const [k, [x, y]] of Object.entries(apos)) drawActor(d, k, x, y);
  for (const [child, parent] of sd.gens ?? []) {
    const right = apos[parent][0] > apos[child][0];
    d.edge(child, parent, S.general + `exitX=${right ? 1 : 0};exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;entryX=${right ? 0 : 1};entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;`);
  }
  // association: actor trái → điểm trái của elip, actor phải → điểm phải (trừ khi khai báo ports riêng)
  const usage = {};
  for (const [id, c, , actors, opts = {}] of sd.ucs) for (const a of actors) {
    if (opts.ports?.[a]) continue;
    const side = apos[a][0] < X(c) ? 'L' : 'R';
    (usage[id + side] ??= []).push(a);
  }
  for (const [id, c, , actors, opts = {}] of sd.ucs) for (const a of actors) {
    let ex, ey;
    if (opts.ports?.[a]) [ex, ey] = opts.ports[a];
    else {
      const side = apos[a][0] < X(c) ? 'L' : 'R';
      const list = usage[id + side].slice().sort((p, q) => apos[p][1] - apos[q][1]);
      ex = side === 'L' ? 0 : 1; ey = ports(list.length)[list.indexOf(a)];
    }
    d.edge(a, id, S.assoc + `entryX=${ex};entryY=${ey};entryDx=0;entryDy=0;`);
  }
  for (const [from, kind, to] of sd.rels) {
    const planned = UC[from].planned || UC[to].planned;
    d.edge(from, to, S.include + 'fontSize=12;labelBackgroundColor=#ffffff;' + (planned ? `strokeColor=${GREY};fontColor=${GREY};` : ''), { label: `«${kind}»` });
  }
  const note = `<b>Notes</b> — ${sd.notes}<br>${LEGEND}`, nw = Math.max(bw, 940);
  d.vertex(note, S.note + 'fontSize=12;', bx, by + bh + 20, nw, noteHeight(note, nw), { raw: true });
  const bottom = by + bh + 20 + noteHeight(note, nw) + 30;
  const right = Math.max(sd.rightX + 120, bx + nw + 30);
  const toXml = d.toXml.bind(d);
  d.toXml = () => cleanStyles(toXml().replace('pageWidth="1654"', `pageWidth="${Math.max(1654, right)}"`).replace('pageHeight="1169"', `pageHeight="${Math.max(1169, bottom)}"`));
}

/** Gộp khoá trùng trong style (khoá sau thắng, như draw.io áp dụng), để XML chỉ còn một cỡ chữ cho mỗi ô (G-01 đo cỡ chữ từ XML). */
function cleanStyles(xml) {
  return xml.replace(/style="([^"]*)"/g, (m, st) => {
    const bare = [], keys = new Map();
    for (const tok of st.split(';').filter(Boolean)) {
      const i = tok.indexOf('=');
      if (i < 0) { if (!bare.includes(tok)) bare.push(tok); } else keys.set(tok.slice(0, i), tok.slice(i + 1));
    }
    return `style="${[...bare, ...[...keys].map(([k, v]) => `${k}=${v}`)].join(';')};"`;
  });
}

function overviewPage(f) {
  const d = f.page('LV0 – Overview');
  const nUc = Object.keys(UC).length;
  caption(d, 'Figure 2.1', `Use Case Diagram: LV0 system overview (${nUc} use cases in 5 subsystems, Register v1.4)`);
  // Gói xếp thành cột theo thứ tự SD1, SD4, SD5, SD2, SD3: Operator nối mọi gói từ trái, Platform Administrator từ phải.
  // Investor cũng dùng cả 5 gói nên phải cắt 4 đường (đồ thị chứa K3,5: tối thiểu 4 chỗ cắt); PSP cắt 1 đường.
  const bx = 480, bw = 480, px = 560, pw = 340, GAP = 74, LINE = 16;
  const order = ['SD1', 'SD4', 'SD5', 'SD2', 'SD3'];
  const parts = { SD4: ['SD4a', 'SD4b'] };
  const codesOf = (key) => (parts[key] ?? [key]).flatMap(k => SUBSYSTEMS.find(s => s.key === k).ucs.filter(u => !u[4]?.ref).map(u => u[0])).sort();
  const nameOf = { SD1: 'Identity & Onboarding', SD2: 'Batch & Investment', SD3: 'Production, Evidence & Harvest', SD4: 'Sales & Orders', SD5: 'Settlement & Oversight' };
  const rangeOf = { SD1: 'UC01–UC06', SD2: 'UC07–UC16, UC49', SD3: 'UC17–UC22, UC44–UC48, UC52–UC53', SD4: 'UC25–UC34, UC50–UC51, UC54–UC55', SD5: 'UC35–UC43' };
  const figOf = { SD1: 'Figure 2.2', SD2: 'Figure 2.3', SD3: 'Figure 2.4', SD4: 'Figures 2.5a–2.5b', SD5: 'Figure 2.6' };
  const PK = {};
  let y = 120;
  for (const key of order) {
    const ids = codesOf(key);
    const text = ids.map(id => UC[id].planned ? `<font color="${GREY}">${id} «planned»</font>` : id).join(' · ');
    const plain = ids.map(id => UC[id].planned ? `${id} «planned»` : id).join(' · ');
    const lines = Math.ceil(plain.length / 46);
    const h = Math.round(16 + 12 + 19 + LINE * (lines + 1) + 14);
    PK[key] = { y, h, ids, text };
    y += h + GAP;
  }
  const bottom = y - GAP + 34;
  d.vertex('CrabShare System', S.boundary + 'fontSize=13;', bx, 86, bw, bottom - 86, { key: 'boundary' });
  for (const key of order) {
    const { y: py, h, ids, text } = PK[key];
    d.vertex(`<b>${key} · ${nameOf[key]}</b><br><font style="font-size:11px">${rangeOf[key]} · ${ids.length} UCs · ${figOf[key]}</font><br><font style="font-size:11px">${text}</font>`,
      S.pkg + 'fontSize=13;verticalAlign=top;spacingTop=14;', px, py, pw, h, { key, raw: true });
  }
  // Operator nối mọi gói từ trái, Platform Administrator từ phải. Các actor khác đứng trong "khe" giữa hai đường liền nhau
  // của Operator (Customer, Investor) hoặc của Admin (4 hệ thống ngoài): toạ độ y tính từ hai đường giới hạn khe.
  const midY = Math.round((120 + bottom) / 2);
  const O = [90, midY], A = [1590, midY];
  const portY = (key, fy) => PK[key].y + PK[key].h * fy;
  const OPORT = { SD1: 0.5, SD4: 0.5, SD5: 0.5, SD2: 0.5, SD3: 0.5 }, APORT = { SD1: 0.4, SD4: 0.3, SD5: 0.72, SD2: 0.3, SD3: 0.62 };
  const lineAt = (from, toX, toY, x) => from[1] + (toY - from[1]) * (x - from[0]) / (toX - from[0]);
  const wedge = (from, edgeX, k1, f1, k2, f2, xL, xR, top, below) => { // y của actor nằm giữa hai đường, có lề
    const up = k1 ? Math.max(lineAt(from, edgeX, portY(k1, f1), xL), lineAt(from, edgeX, portY(k1, f1), xR)) : -1e9;
    const lo = k2 ? Math.min(lineAt(from, edgeX, portY(k2, f2), xL), lineAt(from, edgeX, portY(k2, f2), xR)) : 1e9;
    if (k1 && k2 && lo - up < top + below + 16) console.warn(`LV0: wedge ${k1}|${k2} too narrow (${(lo - up).toFixed(0)} px)`);
    if (!k1) return Math.round(lo - below - 20);
    if (!k2) return Math.round(up + top + 20);
    return Math.round((up + top + lo - below) / 2);
  };
  const L = (k1, k2) => wedge(O, px, k1, OPORT[k1], k2, OPORT[k2], 420, 460, 35, 56); // hình que 70 + nhãn
  const R = (k1, k2, h) => wedge(A, px + pw, k1, k1 && APORT[k1], k2, k2 && APORT[k2], 990, 1170, h / 2, h / 2);
  const actors = {
    operator: O, admin: A,
    customer: [440, L('SD1', 'SD4')], investor: [440, L('SD5', 'SD2')],
    ekyc: [1080, R(null, 'SD1', 62)], psp: [1080, R('SD4', 'SD5', 62)], sign: [1080, R('SD2', 'SD3', 62)], sim: [1080, R('SD3', null, 70)],
  };
  // khung gom 4 hệ thống ngoài (chỉ để đọc nhanh; không phải phần tử UML)
  const extTop = actors.ekyc[1] - 31 - 40, extBottom = actors.sim[1] + 35 + 14;
  d.vertex('<b>External systems</b> (sandbox or simulated)', S.group + 'fontSize=12;fillColor=none;', 978, extTop, 204, extBottom - extTop, { key: 'extframe', raw: true });
  for (const [k, [x, ay]] of Object.entries(actors)) drawActor(d, k, x, ay, 180);
  // [actor, gói, cạnh L/R, vị trí dọc trên cạnh 0..1]
  const links = [
    ...order.map(k => ['operator', k, 'L', OPORT[k]]), ...order.map(k => ['admin', k, 'R', APORT[k]]),
    ['customer', 'SD1', 'L', 0.84], ['customer', 'SD4', 'L', 0.16],
    ['investor', 'SD1', 'L', 0.93], ['investor', 'SD4', 'L', 0.86], ['investor', 'SD5', 'L', 0.84], ['investor', 'SD2', 'L', 0.16], ['investor', 'SD3', 'L', 0.12],
    ['ekyc', 'SD1', 'R', 0.15],
    ['psp', 'SD4', 'R', 0.85], ['psp', 'SD5', 'R', 0.12], ['psp', 'SD2', 'R', 0.2],
    ['sign', 'SD2', 'R', 0.82],
    ['sim', 'SD3', 'R', 0.82],
  ];
  for (const [a, p, side, fy] of links) d.edge(a, p, S.assoc + `entryX=${side === 'L' ? 0 : 1};entryY=${fy};entryDx=0;entryDy=0;entryPerimeter=0;`);
  const removed = REMOVED.map(([id, name, why]) => `${id} ${name} (${why})`).join('; ');
  const note = `<b>Notes</b> — Actors as in the Business Context Diagram: 4 human roles (Investor, Operator, Customer, Platform Administrator; the Administrator also holds the separate Evidence Reviewer permission used in UC47) and 4 external systems (eKYC Provider, Viettel signing, payment intermediary, simulated farm devices and cameras). An Investor may act as a Customer (generalization in SD4a and SD4b). Codes keep the UC01 form used in Jira and the feature map. `
    + `<b>Subsystems and Register v1.4 components</b>: SD1 ↔ identity (eKYC, roles); SD2 ↔ Batch funding with a locked Standard Cost (UC49 price suggestion is used when the Operator sets the price); SD3 ↔ production tracking and evidence verification, plus harvest per box; SD4 ↔ bulk pre-sales and delivery; SD5 ↔ settlement, with audit and reporting (UC42, UC43). `
    + `<b>Background jobs</b> are system behaviour, not actors; their triggers go to the Precondition/Trigger column of the Use Case List: reservation expiry (30 minutes after reserving), funding close (funding deadline or maximum capital), refunds (Batch cancelled), alert escalation (acknowledgement deadline), random capture request (schedule), final-order reminder (sales window closes), order completion (return window ends). `
    + `The Investor is linked to all five subsystems, like the Operator and the Administrator, so four crossings are unavoidable (the graph contains K3,5); the payment intermediary and the Customer add one each (keeping the four external systems in one frame).`
    + `<br><b>Removed in v1.4 (still in code)</b>, codes not reused: ${removed}.<br><b>New in v1.4 («planned»)</b>: UC49 Get Sale Price Range Suggestion, UC50 Record Invoiced Sale, UC51 Record Final Order at Floor Price, UC52 Submit Farm Device and Camera Data, UC53 View Box Details of Own Rows, UC54 Forfeit Deposit («extend» UC55, UC30). UC55 Cancel Bulk Pre-order exists in code; its v1.4 forfeit rule is «planned».<br>${PENDING}<br>${LEGEND}`;
  const nh = noteHeight(note, 1600);
  d.vertex(note, S.note + 'fontSize=12;', 40, bottom + 20, 1600, nh, { raw: true });
  const pageH = bottom + 20 + nh + 30;
  const toXml = d.toXml.bind(d);
  d.toXml = () => cleanStyles(toXml().replace('pageWidth="1654"', 'pageWidth="1700"').replace('pageHeight="1169"', `pageHeight="${Math.max(1169, Math.ceil(pageH / 10) * 10)}"`));
}

function run(out) {
  const f = new DrawioFile();
  overviewPage(f);
  for (const sd of SUBSYSTEMS) subsystemPage(f, sd);
  f.write(path.join(out, 'CrabShare_Use_Case_Diagrams.drawio'));
  console.log('Use case diagrams done');
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run, ACTORS, SUBSYSTEMS, UC, REMOVED };
