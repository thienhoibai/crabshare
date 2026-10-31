'use strict';
// Use Case Diagrams (SRS 2.2.1): LV0 tổng quan + 5 sơ đồ phân hệ. Giữ mã UC01–UC48 đã dùng trong feature-map và Jira.
const path = require('path');
const { DrawioFile, S } = require('./lib');

const META = 'Version 2.0 · 22/10/2026 · Register v1.3 (15/10/2026) · UML 2.5 · association = participation';

// Actor: con người = hình que; hệ thống ngoài = hình chữ nhật «actor». gen = kế thừa actor khác.
const ACTORS = {
  investor: { name: 'Investor', long: 'Investor (Financial)' },
  offtake: { name: 'Offtake Investor', gen: 'investor' },
  operator: { name: 'Operator' },
  customer: { name: 'Customer' },
  admin: { name: 'Platform Administrator' },
  reviewer: { name: 'Evidence Reviewer', gen: 'admin' },
  ekyc: { name: 'eKYC Provider', ext: true },
  sign: { name: 'Digital Signature Service (Viettel)', ext: true },
  psp: { name: 'Payment Service Provider (VietQR intermediary)', ext: true },
  farm: { name: 'Farm Management System', ext: true },
};

// Phân hệ và use case. col/row = vị trí trong ranh giới hệ thống; actors = association.
const SUBSYSTEMS = [
  {
    key: 'SD1', name: 'Identity & Onboarding', range: 'UC01–UC06', fig: 'Figure 2.2',
    ucs: [
      { id: 'UC01', name: 'Register Account', actors: ['investor', 'customer', 'operator'], col: 0, row: 0 },
      { id: 'UC02', name: 'Complete Identity Verification (eKYC)', actors: ['investor', 'operator', 'ekyc'], col: 1, row: 0 },
      { id: 'UC03', name: 'Maintain Payout Account', actors: ['investor', 'operator'], col: 0, row: 1 },
      { id: 'UC04', name: 'Submit Operator Application', actors: ['operator'], col: 0, row: 2 },
      { id: 'UC05', name: 'Review Operator Application', actors: ['admin'], col: 1, row: 2 },
      { id: 'UC06', name: 'Authorise Identity Verification Exception', actors: ['admin'], col: 1, row: 1 },
    ],
    rels: [['UC06', 'extend', 'UC02']],
    notes: 'UC02 stores only the verification result; ID images never persist (TL-06). UC06 is the manual exception path for a failed or unavailable eKYC check.',
  },
  {
    key: 'SD2', name: 'Batch & Investment', range: 'UC07–UC16', fig: 'Figure 2.3',
    ucs: [
      { id: 'UC07', name: 'Create Batch and Define Standard Cost', actors: ['operator'], col: 0, row: 0 },
      { id: 'UC08', name: 'Review and Approve Batch', actors: ['admin'], col: 2, row: 0 },
      { id: 'UC09', name: 'Explore Batch Offerings', actors: ['investor'], col: 0, row: 1 },
      { id: 'UC10', name: 'Commit Capital to Batch', actors: ['investor'], col: 1, row: 1 },
      { id: 'UC11', name: 'Acknowledge Investment Risk', actors: [], col: 1, row: 0 },
      { id: 'UC12', name: 'Make Payment (VietQR)', actors: ['psp'], col: 2, row: 1 },
      { id: 'UC13', name: 'Register Offtake Commitment', actors: ['offtake'], col: 1, row: 2 },
      { id: 'UC14', name: 'Sign Investment Contract', actors: ['investor', 'operator', 'sign'], col: 0, row: 3 },
      { id: 'UC15', name: 'Upload Offline-Signed Contract', actors: ['admin'], col: 2, row: 3 },
      { id: 'UC16', name: 'Track Investment Portfolio', actors: ['investor'], col: 0, row: 2 },
    ],
    rels: [['UC10', 'include', 'UC11'], ['UC10', 'include', 'UC12'], ['UC13', 'extend', 'UC10'], ['UC15', 'extend', 'UC14']],
    notes: 'UC08 locks the Standard Cost when funding opens (TL-11). UC10 holds a reservation for 15 minutes; UC12 reconciles the VietQR transfer through the provider webhook, idempotent per transaction id (TL-10). UC14: Operator signs first, then the Investor (TL-19).',
  },
  {
    key: 'SD3', name: 'Production, Evidence & Harvest', range: 'UC17–UC23, UC44–UC48', fig: 'Figure 2.4',
    ucs: [
      { id: 'UC44', name: 'Register Boxes', actors: ['operator'], col: 0, row: 0 },
      { id: 'UC17', name: 'Record Production Logs and Box Events', actors: ['operator', 'farm'], col: 1, row: 0 },
      { id: 'UC21', name: 'View Production Timeline', actors: ['investor', 'operator'], col: 2, row: 0 },
      { id: 'UC45', name: 'Capture Production Evidence', actors: ['operator'], col: 0, row: 1 },
      { id: 'UC47', name: 'Review Flagged Evidence', actors: ['reviewer'], col: 2, row: 1 },
      { id: 'UC48', name: 'Submit Evidence Explanation', actors: ['operator'], col: 1, row: 1 },
      { id: 'UC19', name: 'Acknowledge Operations Alert', actors: ['operator'], col: 0, row: 2 },
      { id: 'UC20', name: 'Monitor Escalated Alerts', actors: ['admin'], col: 2, row: 2 },
      { id: 'UC18', name: 'Request Milestone Disbursement', actors: ['operator'], col: 1, row: 2 },
      { id: 'UC22', name: 'Declare Harvest', actors: ['operator'], col: 0, row: 3 },
      { id: 'UC46', name: 'Print and Activate Crab Tag', actors: ['operator'], col: 1, row: 3 },
      { id: 'UC23', name: 'Claim Priority Offtake Volume', actors: ['offtake'], col: 2, row: 3 },
    ],
    rels: [['UC48', 'extend', 'UC45'], ['UC46', 'include', 'UC45']],
    notes: 'UC45: live in-app photo with server time, location, box number and SHA-256; the crab-detection component scores the photo and may route it to UC47, never rejecting alone (Register v1.3 §3.2b). UC17 via the Farm Management System = ingestion API, planned in the Production module (not on develop yet). UC46 activates a tag with one confirmation photo.',
  },
  {
    key: 'SD4', name: 'Sales & Orders', range: 'UC24–UC34', fig: 'Figure 2.5',
    ucs: [
      { id: 'UC24', name: 'Publish Product Listings', actors: ['operator', 'admin'], col: 0, row: 0 },
      { id: 'UC25', name: 'Browse Product Catalogue', actors: ['customer'], col: 1, row: 0 },
      { id: 'UC26', name: 'Place Order', actors: ['customer'], col: 1, row: 1 },
      { id: 'UC27', name: 'Place Pre-order (deposit)', actors: ['customer'], col: 2, row: 0 },
      { id: 'UC12b', ref: 'UC12', name: 'Make Payment (VietQR)', actors: ['psp'], col: 2, row: 1 },
      { id: 'UC28', name: 'Track Order Status', actors: ['customer'], col: 1, row: 2 },
      { id: 'UC29', name: 'Fulfil Order by Tag Scan', actors: ['operator'], col: 0, row: 1 },
      { id: 'UC30', name: 'Confirm Order Receipt', actors: ['customer'], col: 2, row: 2 },
      { id: 'UC31', name: 'Submit Order Complaint', actors: ['customer'], col: 1, row: 3 },
      { id: 'UC32', name: 'Resolve Order Dispute', actors: ['admin', 'operator'], col: 0, row: 3 },
      { id: 'UC33', name: 'Trace Crab by Tag Scan', actors: ['customer'], col: 2, row: 3 },
      { id: 'UC34', name: 'Rate Purchase', actors: ['customer'], col: 1, row: 4 },
    ],
    rels: [['UC26', 'include', 'UC12b'], ['UC27', 'extend', 'UC26'], ['UC31', 'extend', 'UC30'], ['UC34', 'extend', 'UC30']],
    notes: 'UC26: cart split per Batch, atomic stock reservation (no overselling under 50 concurrent checkouts), one VietQR per order. UC29: packing by scanning each crab tag links crabs to the order line. UC33 is public (no login). Admin participates in UC24 as listing moderation.',
  },
  {
    key: 'SD5', name: 'Settlement & Oversight', range: 'UC35–UC43', fig: 'Figure 2.6',
    ucs: [
      { id: 'UC38', name: 'Calculate Settlement', actors: ['admin'], col: 2, row: 0 },
      { id: 'UC37', name: 'Publish Settlement Proposal', actors: ['admin'], col: 1, row: 0 },
      { id: 'UC35', name: 'Review Settlement Statement', actors: ['investor', 'operator'], col: 0, row: 0 },
      { id: 'UC36', name: 'Submit Settlement Feedback', actors: ['investor'], col: 0, row: 1 },
      { id: 'UC39', name: 'Approve Settlement and Issue Payouts', actors: ['admin', 'psp'], col: 1, row: 1 },
      { id: 'UC40', name: 'Monitor Payout Reconciliation', actors: ['admin', 'psp'], col: 2, row: 1 },
      { id: 'UC41', name: 'Configure Platform Fees', actors: ['admin'], col: 2, row: 2 },
      { id: 'UC42', name: 'View Dashboard and Reports', actors: ['admin', 'operator'], col: 0, row: 2 },
      { id: 'UC43', name: 'Export Audit Log', actors: ['admin'], col: 1, row: 2 },
    ],
    rels: [['UC36', 'extend', 'UC35'], ['UC39', 'include', 'UC40']],
    notes: 'UC38: Revenue Pool = fulfilled-order revenue − locked Standard Cost; largest-remainder rounding; loss capped at capital (TL-12/13). UC37 opens a 7–14 day feedback window; UC39 is allowed only after the window closes with no open feedback and locks the statement (BR-30). UC43 exports the hash-chained audit log (TL-08).',
  },
];

function humanOrder(keys) { // thứ tự actor cố định để các trang giống nhau
  const order = ['investor', 'offtake', 'operator', 'customer', 'admin', 'reviewer'];
  return order.filter(k => keys.includes(k));
}

function drawActor(d, key, x, y) {
  const a = ACTORS[key];
  if (a.ext) return d.vertex(`«actor»<br><b>${a.name}</b>`, S.extActor, x - 70, y, 140, 46, { key, raw: true });
  return d.vertex(a.long ?? a.name, S.actor, x - 20, y, 40, 70, { key });
}

function subsystemPage(f, sd) {
  const d = f.page(`${sd.key} – ${sd.name}`);
  d.caption(sd.fig, `Use Case Diagram – ${sd.key} ${sd.name} (${sd.range})`, META);
  const colW = 260, rowH = 95, bx = 330, by = 90;
  const rows = Math.max(...sd.ucs.map(u => u.row)) + 1, cols = Math.max(...sd.ucs.map(u => u.col)) + 1;
  const bw = cols * colW + 40, bh = rows * rowH + 60;
  d.vertex(`CrabShare System · ${sd.key} ${sd.name}`, S.boundary, bx, by, bw, bh, { key: 'boundary' });
  for (const u of sd.ucs) {
    const label = u.ref ? `<b>${u.ref}</b><br>${u.name}<br><font style="font-size:9px" color="#64748b">(shared with SD2)</font>` : `<b>${u.id}</b><br>${u.name}`;
    d.vertex(label, S.usecase + (u.ref ? 'dashed=1;' : ''), bx + 30 + u.col * colW, by + 45 + u.row * rowH, 200, 64, { key: u.id, raw: true });
  }
  // actor con người bên trái, hệ thống ngoài bên phải
  const humans = humanOrder([...new Set(sd.ucs.flatMap(u => u.actors))].filter(k => !ACTORS[k].ext));
  const exts = [...new Set(sd.ucs.flatMap(u => u.actors))].filter(k => ACTORS[k].ext);
  const spreadY = (n, i) => by + 30 + (bh - 60) * (n === 1 ? 0.5 : i / (n - 1));
  humans.forEach((k, i) => drawActor(d, k, 120, spreadY(humans.length, i) - 35));
  exts.forEach((k, i) => drawActor(d, k, bx + bw + 150, spreadY(exts.length, i) - 23));
  for (const u of sd.ucs) for (const a of u.actors) d.edge(a, u.id, S.assoc);
  for (const [from, kind, to] of sd.rels) d.edge(from, to, S.include, { label: `«${kind}»` });
  // kế thừa actor nếu cả cha và con đều có mặt
  for (const k of humans) if (ACTORS[k].gen && humans.includes(ACTORS[k].gen)) d.edge(k, ACTORS[k].gen, S.general);
  d.vertex(sd.notes, S.note, bx, by + bh + 20, bw, 70, { raw: true });
}

function overviewPage(f) {
  const d = f.page('LV0 – Overview');
  d.caption('Figure 2.1', 'Use Case Diagram – LV0 system overview (48 use cases in 5 subsystems)', META);
  const bx = 330, by = 90, bw = 820, bh = 600;
  d.vertex('CrabShare System', S.boundary, bx, by, bw, bh, { key: 'boundary' });
  const slots = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]];
  SUBSYSTEMS.forEach((sd, i) => {
    const [c, r] = slots[i];
    const ids = sd.ucs.filter(u => !u.ref).map(u => u.id);
    d.vertex(`<b>${sd.key} · ${sd.name}</b><br><font style="font-size:10px">${sd.range} · ${ids.length} use cases</font>`, S.pkg + 'fontSize=12;', bx + 30 + c * 265, by + 50 + r * 230, 235, 190, { key: sd.key, raw: true });
    // liệt kê use case bên trong gói
    d.text(`<font style="font-size:9px">${sd.ucs.filter(u => !u.ref).map(u => `${u.id} ${u.name}`).join('<br>')}</font>`, bx + 36 + c * 265, by + 80 + r * 230, 225, 160);
  });
  // ghi chú chỗ trống ở ô thứ 6
  d.vertex('Actors: 4 primary roles per Register v1.3 §3.2c — Investor (with Offtake Investor as a specialisation), Operator, Customer, Platform Administrator (Evidence Reviewer is a separate permission modelled as a specialisation). Background jobs (reservation expiry, funding close, alerts, capture requests, order completion, settlement) are system behaviour, not actors.', S.note, bx + 30 + 2 * 265, by + 50 + 230, 235, 190, { raw: true });
  const humans = ['investor', 'offtake', 'operator', 'customer', 'admin', 'reviewer'];
  const exts = ['ekyc', 'sign', 'psp', 'farm'];
  humans.forEach((k, i) => drawActor(d, k, 120, by + 5 + i * 100));
  exts.forEach((k, i) => drawActor(d, k, bx + bw + 160, by + 60 + i * 130));
  const part = {};
  for (const sd of SUBSYSTEMS) for (const u of sd.ucs) for (const a of u.actors) (part[a] ??= new Set()).add(sd.key);
  for (const [a, sds] of Object.entries(part)) for (const sd of sds) d.edge(a, sd, S.assoc);
  d.edge('offtake', 'investor', S.general); d.edge('reviewer', 'admin', S.general);
}

function run(out) {
  const f = new DrawioFile();
  overviewPage(f);
  for (const sd of SUBSYSTEMS) subsystemPage(f, sd);
  f.write(path.join(out, 'CrabShare_Use_Case_Diagrams.drawio'));
  console.log('Use case diagrams done');
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run, ACTORS, SUBSYSTEMS };
