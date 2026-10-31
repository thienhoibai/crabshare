'use strict';
// Business Context Diagram (Report 1 / SRS 1 Product Overview): hệ thống, 4 vai trò, 4 hệ thống ngoài, luồng thông tin.
const path = require('path');
const { DrawioFile, S } = require('./lib');

const META = 'Version 2.0 · 22/10/2026 · Register v1.3 (15/10/2026) · not UML: data-flow context diagram';

const PARTIES = [
  // key, name, side, in (party → system), out (system → party)
  { key: 'investor', name: 'Investor<br><font style="font-size:9px;font-weight:normal">Financial · Offtake extension</font>', side: 'L',
    in: ['eKYC consent', 'Risk acknowledgement', 'Capital reservation', 'Contract signature', 'Offtake commitment & claim', 'Settlement feedback'],
    out: ['Batch offering with published Standard Cost', 'VietQR payment instruction', 'Investment contract', 'Production timeline, evidence & alerts', 'Settlement statement & payout notice'] },
  { key: 'operator', name: 'Operator<br><font style="font-size:9px;font-weight:normal">owner + staff</font>', side: 'L',
    in: ['Registration dossier & box register', 'Batch proposal + Standard Cost', 'Production logs & box events', 'Live evidence photos & explanations', 'Disbursement request', 'Harvest record (tag + photo)', 'Product listing & tag-scan fulfilment', 'Complaint response'],
    out: ['Approval decisions', 'Capture requests & evidence flags', 'Production alerts', 'Contract to sign', 'Disbursement notice', 'Tag print job', 'Customer orders', 'Settlement statement'] },
  { key: 'customer', name: 'Customer', side: 'L',
    in: ['Order / pre-order with deposit', 'Order complaint', 'Product rating', 'Tag scan'],
    out: ['Product catalogue', 'VietQR payment instruction', 'Order status', 'Crab traceability record'] },
  { key: 'admin', name: 'Platform Administrator<br><font style="font-size:9px;font-weight:normal">Evidence Reviewer permission</font>', side: 'L',
    in: ['Operator & batch review decisions', 'KYC exception', 'Fee configuration', 'Tranche release / block', 'Evidence review decision', 'Dispute resolution', 'Settlement publication & approval'],
    out: ['Review queues (dossiers, flagged evidence, escalated alerts, disputes)', 'Reconciliation & unmatched payments', 'Dashboards & audit log export'] },
  { key: 'ekyc', name: '«external system»<br>eKYC Provider', side: 'R',
    in: ['Identity verification result'], out: ['Identity evidence (ID card + face, not stored)'] },
  { key: 'sign', name: '«external system»<br>Digital Signature Service (Viettel)', side: 'R',
    in: ['Signed document'], out: ['Contract document (hash) to sign'] },
  { key: 'psp', name: '«external system»<br>Payment Service Provider<br><font style="font-size:9px;font-weight:normal">VietQR · batch accounts</font>', side: 'R',
    in: ['Transaction notification (webhook)', 'Payout / refund result'], out: ['Batch account request', 'VietQR payment request', 'Payment instruction (payout, refund)'] },
  { key: 'farm', name: '«external system»<br>Farm Management System<br><font style="font-size:9px;font-weight:normal">optional · ingestion API planned</font>', side: 'R',
    in: ['Production logs & box events (ingestion API, planned)'], out: ['Acknowledgement / validation result'] },
];

function run(out) {
  const f = new DrawioFile();
  const d = f.page('Business Context Diagram');
  d.caption('Figure 1.1', 'Business Context Diagram – CrabShare', META);
  const sx = 560, sy = 120, sw = 360, sh = 1000;
  d.vertex('<b>CrabShare System</b><br><font style="font-size:10px;font-weight:normal">Web (React) · Mobile (Flutter) · API (ASP.NET Core) · SQL Server<br>coordination & reconciliation tool — holds no money (TL-02)</font>', `rounded=1;whiteSpace=wrap;html=1;arcSize=6;fillColor=#eef2ff;strokeColor=#3730a3;strokeWidth=2;fontSize=14;verticalAlign=top;spacingTop=10;`, sx, sy, sw, sh, { key: 'sys', raw: true });
  // các khối chức năng bên trong hệ thống (để người đọc thấy phạm vi)
  const mods = ['Identity & accounts', 'Batch & Standard Cost', 'Funding & contracts', 'Production & evidence', 'Harvest, tags & catalogue', 'Orders & complaints', 'Settlement & payouts', 'Audit log & reports'];
  mods.forEach((m, i) => d.vertex(m, `rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#6366f1;fontSize=10;`, sx + 20 + (i % 2) * 165, sy + 80 + Math.floor(i / 2) * 44, 155, 32));
  const left = PARTIES.filter(p => p.side === 'L'), right = PARTIES.filter(p => p.side === 'R');
  const place = (list, x) => list.forEach((p, i) => {
    const slot = (sh - 60) / list.length;                 // mỗi bên tối đa 4 bên liên quan → ~235 px một ô
    const y = sy + 100 + i * slot;
    const h = 56;
    const style = p.side === 'L' ? `rounded=1;whiteSpace=wrap;html=1;fillColor=#ecfdf5;strokeColor=#047857;fontStyle=1;fontSize=11;` : S.extActor + 'fontStyle=1;fontSize=11;';
    d.vertex(p.name, style, x, y, 190, h, { key: p.key, raw: true });
    const yin = y + 14, yout = y + 42; // hai cạnh song song: vào hệ thống (trên), ra khỏi hệ thống (dưới)
    const x1 = p.side === 'L' ? x + 190 : x, x2 = p.side === 'L' ? sx : sx + sw;
    const gx = Math.min(x1, x2) + 6, gw = Math.abs(x2 - x1) - 12;
    const es = `html=1;endArrow=block;endFill=1;strokeColor=#334155;edgeStyle=none;`;
    const inLabel = `<font color="#065f46">${p.in.join('<br>')}</font>`;
    const outLabel = `<font color="#1e3a8a">${p.out.join('<br>')}</font>`;
    // nhãn đặt thành hộp chữ riêng: luồng vào ở trên mũi tên, luồng ra ở dưới mũi tên
    d.text(inLabel, gx, yin - 92, gw, 88, 'fontSize=9;align=center;verticalAlign=bottom;');
    d.text(outLabel, gx, yout + 6, gw, 88, 'fontSize=9;align=center;verticalAlign=top;');
    if (p.side === 'L') { d.freeEdge(x1, yin, x2, yin, es); d.freeEdge(x2, yout, x1, yout, es); }
    else { d.freeEdge(x1, yin, x2, yin, es); d.freeEdge(x2, yout, x1, yout, es); }
  });
  place(left, 40); place(right, sx + sw + 330);
  d.vertex('<b>Legend</b><br>Green boxes = human roles (Register v1.3 §3.2c); «external system» = sandbox or simulated integration (§4).<br>Arrow label = information flow in the arrow direction; upper arrow into the system, lower arrow out of it.<br>Money moves only between payers, the batch account at the payment intermediary and payees; CrabShare issues instructions and reads notifications.', S.legend, 40, sy + sh + 30, 880, 70, { raw: true });
  f.write(path.join(out, 'CrabShare_Business_Context_Diagram.drawio'));
  console.log('Context diagram done');
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run };
