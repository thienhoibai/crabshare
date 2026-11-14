'use strict';
// Activity Diagrams có swimlane cho 5 main workflow (Report 4, bổ sung Review 2). Mức nghiệp vụ hoàn thành: không API, không hàm, không bảng.
// Theo Phiếu đăng ký v1.4, các vòng duyệt và các quyết định thiết kế ngày 05/11/2026 (đã được trưởng nhóm xác nhận):
//  - join chỉ nhận một luồng mỗi nhánh của fork; action có nhiều luồng vào thì có merge đứng trước; trạng thái vẽ thành object node;
//  - không có fork nào thiếu join: luồng độc lập (Investor xem hộp, phần bán của cả Lô) bắt đầu bằng nút đầu riêng;
//  - WF-04: luồng của từng đơn (phần 1–4) kết thúc ở flow final của đơn; thu hoạch, bán có hoá đơn và đơn cuối chạy một lần cho Lô (phần 5);
//  - in A4 ngang chữ ≥ 5 pt: ghi chú và chú giải đặt ở cột bên phải, sơ đồ dài tách nhiều phần (part) nối bằng connector UML (vòng tròn có chữ);
//  - «planned» xám #64748b.
// Bố cục: làn dọc theo actor; nút đặt theo (làn, hàng); chiều cao hàng tính theo nút cao nhất; mọi đường đi ngang/dọc với điểm gấp tính sẵn,
// nên không có đường cắt nhau và không đường nào xuyên qua nút (kiểm tra bằng check.js của nhánh).
const path = require('path');
const { DrawioFile, S, escHtml } = require('./lib');

const META = 'v3.2 · 05/11/2026 · Register v1.4';
const PENDING = 'Design decisions of 05/11/2026 applied here were confirmed by the lead.';
const X0 = 20, TOPY = 76, GAP = 24, AW = 210, NOTE_W = 420;
const GREY = '#64748b';
const PLANNED = `dashed=1;dashPattern=6 4;strokeColor=${GREY};fontColor=${GREY};fillColor=#f8fafc;`;
const FLOW = 'edgeStyle=none;rounded=1;html=1;endArrow=open;endFill=0;strokeColor=#334155;fontSize=11;labelBackgroundColor=#ffffff;fontFamily=Segoe UI;';
const LANE = {
  inv: 'Investor', op: 'Operator', sys: 'CrabShare System', adm: 'Platform Administrator', rev: 'Platform Administrator (Evidence Reviewer)',
  psp: 'Payment Service Provider', cus: 'Customer', dev: 'Farm Devices & Cameras (simulated) «planned»',
};

// part: { label, lanes: [[key, rộng, [tâm cột con]?]], nodes, edges, notes?, pending? }
// node: [id, làn, hàng, loại, nhãn, {sub, dx, planned, part, q (L|R), span:[[làn,sub],[làn,sub]], x1, x2}]
// edge: [from, to, guard, route]; route: 'v' | 'h' | 'hv' | {t:'hv', from:'L'} | 'vh' | {t:'ch', out, x, in} | {t:'pts', ex, en, pts} | {t:'v', x}
// loại: action, object, decision, merge, fork, join, start, end (activity final), flowEnd (flow final), time (accept time event), conn (connector)
const WORKFLOWS = [
  {
    key: 'WF-01', page: 'WF-01 Batch setup and approval', fig: 'Figure 4.31',
    title: 'WF-01 Create a Batch by box rows, price it and open funding',
    parts: [{
      label: 'Batch dossier and pricing', pending: true,
      lanes: [['op', 260], ['sys', 260]],
      nodes: [
        ['s', 0, 0, 'start'],
        ['a1', 0, 1, 'action', 'Register boxes with their row code and box number'],
        ['a2', 0, 2, 'action', 'Create the Batch on chosen box rows: crab type, seed quantity, cycle, capital range', { part: 'box rows' }],
        ['m1', 0, 3, 'merge'],
        ['a3', 0, 4, 'action', 'Author the Standard Cost: line items, mortality reserve, milestone tranches'],
        ['a4', 0, 5, 'action', 'Ask for a sale price range', { planned: true }],
        ['s1', 1, 5, 'action', 'Suggest a price range per kg (season, holidays, last 2–3 years) with a warning', { planned: true }],
        ['a5', 0, 6, 'action', 'Set price per kg, floor price, survival threshold with remuneration tiers, delivery radius', { planned: true }],
        ['a6', 0, 7, 'action', 'Submit the Batch for approval'],
        ['s2', 1, 8, 'action', 'Validate the dossier: cost lines, reserve, tranche plan, row capital, price ≥ floor price', { part: 'row and price checks' }],
        ['d1', 1, 9, 'decision', 'dossier valid?', { q: 'R' }],
        ['cB', 0, 10, 'conn', 'B', { dx: -62 }],
        ['mA', 0, 10, 'merge'],
        ['o1', 1, 10, 'object', 'Batch [PendingApproval]'],
        ['a7', 0, 11, 'action', 'Correct the dossier (errors or revision reasons shown)'],
        ['cA', 1, 11, 'conn', 'A'],
      ],
      edges: [
        ['s', 'a1'], ['a1', 'a2'], ['a2', 'm1'], ['m1', 'a3'], ['a3', 'a4'], ['a4', 's1', '', 'h'], ['s1', 'a5', '', 'vh'], ['a5', 'a6'],
        ['a6', 's2', '', 'hv'], ['s2', 'd1'], ['d1', 'o1', '[valid]'], ['d1', 'mA', '[invalid]', { t: 'hv', from: 'L' }],
        ['cB', 'mA', '', 'h'], ['mA', 'a7'], ['a7', 'm1', '', { t: 'ch', out: 'L', x: 'L0+14', in: 'L' }], ['o1', 'cA'],
      ],
      notes: 'The Operator prepares the dossier; connector A leads to the review on part 2, and a requested revision comes back through connector B.',
    }, {
      label: 'review and approval', pending: true,
      lanes: [['sys', 260], ['adm', 260]],
      nodes: [
        ['cA', 0, 0, 'conn', 'A'],
        ['b1', 1, 1, 'action', 'Review the dossier: Standard Cost, floor price, remuneration tiers', { part: 'floor price, tiers' }],
        ['d2', 1, 2, 'decision', 'decision on the Batch?', { q: 'R' }],
        ['cB', 0, 2, 'conn', 'B', { dx: 60 }],
        ['s4', 0, 3, 'action', 'Lock the Standard Cost and prices; open the Batch account and the funding window', { part: 'price per kg, floor price' }],
        ['b3', 1, 4, 'action', 'Reject with the reason; notify the Operator'],
        ['o2', 0, 4, 'object', 'Batch [Funding], visible to investors and bulk buyers'],
        ['ff', 1, 5, 'flowEnd'],
        ['e', 0, 5, 'end'],
      ],
      edges: [
        ['cA', 'b1', '', 'hv'], ['b1', 'd2'],
        ['d2', 'cB', '[request revision]', 'h'],
        ['d2', 's4', '[approve]', 'vh'],
        ['d2', 'b3', '[reject]', { t: 'ch', out: 'R', x: 'R1-14', in: 'R' }],
        ['b3', 'ff'], ['s4', 'o2'], ['o2', 'e'],
      ],
    }],
    notes: 'Traceability: UC44, UC07, UC49, UC08 (TP2 Viên). Precondition: the Operator is approved (UC04, UC05). Exception branches: invalid dossier and revision requested (both corrected through one merge), rejection. «planned» in v1.4 (not on develop): box rows of the Batch, grouped by the row codes of the boxes, one investor per row, each row\'s capital at least the platform minimum contribution; the price module (a range per kg by season and Tet with a warning, never an expected return), price per kg, a floor price committed by the buyer, survival threshold with remuneration tiers, delivery radius, and locking price per kg and floor price with the Standard Cost. States: Batch Draft → PendingApproval → Draft (revision) / Rejected / Funding (Figure 4.8); Standard Cost Draft → Submitted → Locked (Figure 4.22).',
  },
  {
    key: 'WF-02', page: 'WF-02 Funding and contracts', fig: 'Figure 4.32',
    title: 'WF-02 Pick box rows, pay, sign and close funding',
    parts: [{
      label: 'identity and reservation', pending: true,
      lanes: [['inv', 280], ['sys', 260]],
      nodes: [
        ['s', 0, 0, 'start'],
        ['i1', 0, 1, 'action', 'Complete eKYC: ID card, selfie, consent'],
        ['s1', 1, 2, 'action', 'Verify identity through the eKYC provider; keep only the result'],
        ['d1', 1, 3, 'decision', 'verified?', { q: 'R' }],
        ['i2', 0, 4, 'action', 'Explore the offering: Standard Cost, price per kg, floor price, free box rows', { part: 'prices, box rows' }],
        ['ff1', 1, 4, 'flowEnd'],
        ['i3', 0, 5, 'action', 'Accept the risk disclosure; pick free box rows (the amount is their total capital)', { part: 'box rows' }],
        ['s2', 1, 6, 'action', 'Check limits; hold the rows 30 minutes (≤ funding deadline); issue the VietQR', { part: 'row hold' }],
        ['cA', 1, 7, 'conn', 'A'],
      ],
      edges: [
        ['s', 'i1'], ['i1', 's1', '', 'hv'], ['s1', 'd1'],
        ['d1', 'i2', '[verified]', { t: 'hv', from: 'L' }], ['d1', 'ff1', '[rejected: retry or admin exception]'],
        ['i2', 'i3'], ['i3', 's2', '', 'hv'], ['s2', 'cA'],
      ],
      notes: 'Each box row goes to one investor; the amount is the total capital of the chosen rows (boxes × Standard Cost per box), so the minimum contribution is one row. Connector A continues on part 2.',
    }, {
      label: 'payment and contract in parallel', pending: true,
      lanes: [['inv', 280], ['psp', 230], ['sys', 260], ['op', 260]],
      nodes: [
        ['cA', 2, 0, 'conn', 'A'],
        ['f1', 2, 1, 'fork', '', { x1: 'L0+8', x2: 'C2+50' }],
        ['s5', 2, 2, 'action', 'Prepare the investment contract'],
        ['o1', 3, 3, 'action', 'Sign first through the Viettel signing service'],
        ['i6', 0, 4, 'action', 'Sign second through the Viettel signing service'],
        ['ob1', 2, 5, 'object', 'InvestmentContract [FullySigned]'],
        ['cB', 2, 6, 'conn', 'B'],
        ['i5', 0, 6, 'action', 'Pay the full amount once by VietQR'],
        ['p1', 1, 7, 'action', 'Credit the Batch account; notify the transaction'],
        ['d2', 2, 8, 'decision', 'paid before the hold expired?', { q: 'L' }],
        ['cC', 2, 8, 'conn', 'C', { dx: 100 }],
        ['s3', 2, 9, 'action', 'Expire the reservation; release the rows; void the contract; refund the late transfer'],
        ['cD', 3, 9, 'conn', 'D'],
      ],
      edges: [
        ['cA', 'f1'],
        ['f1', 's5', '', { t: 'v', x: 's5' }],
        ['f1', 'i5', '', { t: 'pts', ex: 'Bx', en: 'L', pts: [['L0+14', 'i5.cy']] }],
        ['s5', 'o1', '', 'hv'], ['o1', 'i6', '', { t: 'hv', from: 'L' }], ['i6', 'ob1', '', 'hv'], ['ob1', 'cB'],
        ['i5', 'p1', '', 'hv'], ['p1', 'd2', '', 'hv'],
        ['d2', 'cC', '[yes]', 'h'], ['d2', 's3', '[no: hold expired]'], ['s3', 'cD', '', 'h'],
      ],
      notes: 'The fork runs payment and contract in parallel, as in code: the wizard goes disclosure → amount → contract → VietQR → done, the contract can be drafted while the reservation holds, and signing does not block payment; the join is on part 3. Connectors B (contract fully signed), C (payment received in time) and D (late transfer to refund) continue on part 3. An unpaid reservation simply expires after 30 minutes (expiry job): rows released, contract voided.',
    }, {
      label: 'funding close, opening or refunds', pending: true,
      lanes: [['psp', 230], ['sys', 510, [140, 380]], ['adm', 260]],
      nodes: [
        ['cC', 1, 0, 'conn', 'C', { sub: 0 }],
        ['cB', 1, 0, 'conn', 'B', { sub: 1 }],
        ['cD', 2, 0, 'conn', 'D'],
        ['s4', 1, 1, 'action', 'Confirm the payment; the contribution counts toward the capital', { sub: 0 }],
        ['t1', 1, 2, 'time', 'funding deadline or maximum capital reached', { sub: 0, q: 'R' }],
        ['d3', 1, 3, 'decision', 'minimum viable capital reached AND pre-order ratio ≥ minimum?', { sub: 0, q: 'R' }],
        ['s6', 1, 4, 'action', 'Close the capital; snapshot capital shares', { sub: 0 }],
        ['s6b', 1, 5, 'action', 'Keep only the boxes of funded rows; refund capital that cannot become boxes', { sub: 0, planned: true }],
        ['j1', 1, 6, 'join', '', { span: [[1, 0], [1, 1]] }],
        ['ob2', 1, 7, 'object', 'Batch [Funding], capital closed: ready for stocking (WF-03)', { sub: 0 }],
        ['e1', 1, 8, 'end', '', { sub: 0 }],
        ['s7', 1, 9, 'action', 'Cancel the Batch; void contracts; create refunds for investors and every Customer deposit', { sub: 0, part: 'Customer deposits' }],
        ['mR', 2, 9, 'merge'],
        ['a1', 2, 10, 'action', 'Send the refund instructions'],
        ['p2', 0, 11, 'action', 'Execute the refunds'],
        ['e2', 0, 12, 'end'],
      ],
      edges: [
        ['cC', 's4'], ['s4', 't1'], ['t1', 'd3'], ['d3', 's6', '[yes]'], ['d3', 's7', '[no]', { t: 'ch', out: 'L', x: 'L1+14', in: 'L' }],
        ['s6', 's6b'], ['s6b', 'j1', '', { t: 'v', x: 's6b' }], ['cB', 'j1', '', { t: 'v', x: 'cB' }], ['j1', 'ob2', '', { t: 'v', x: 'ob2' }], ['ob2', 'e1'],
        ['s7', 'mR', '', 'h'], ['cD', 'mR'], ['mR', 'a1'], ['a1', 'p2', '', { t: 'hv', from: 'L' }], ['p2', 'e2'],
      ],
      notes: 'The Batch opens when the minimum viable capital is reached AND the pre-order ratio is at least the minimum set by the Administrator; otherwise it is cancelled and investors and every depositing Customer are refunded, cancelled pre-orders included. Between the minimum and the target only the boxes of funded rows are stocked, and settlement deducts the locked Standard Cost of those boxes only. The join waits for both branches of part 2: stocking needs the capital closed and every contract FullySigned (Figure 4.8). Both refund paths end the activity, so a contract still waiting at the join is voided.',
    }],
    notes: 'Traceability: UC02, UC09, UC11, UC10, UC14, UC12, UC40, funding close job (TP1 Thiện). Exception branches: eKYC rejected; transfer after the 30-minute hold (refunded); minimum viable capital not reached or pre-orders below the minimum ratio → Batch cancelled, refunds. «planned» in v1.4: box-row choice and row hold (one investor per row), keeping only the boxes of funded rows, price per kg and floor price on the offering, the minimum pre-order ratio in the funding-close condition (the code closes on minimum viable capital only) and refunds of Customer deposits. One payment per contribution, no instalments; UC15 Upload Offline-Signed Contract (Administrator) replaces the two e-signatures for paper signing (not drawn). Removed in v1.4 (still in code): UC13 Register Offtake Commitment. States: contribution Reserved → Confirmed / Expired / Refunded (Figure 4.9); row allocation Held → Allocated / Released «planned»; contract Draft → OperatorSigned → FullySigned / Void (4.10); payment request Pending → Paid / Expired (4.11); refund instruction Created → Succeeded / Failed (4.12); Batch Funding → capital closed / Cancelled (4.8).',
  },
  {
    key: 'WF-03', page: 'WF-03 Production and evidence', fig: 'Figure 4.33',
    title: 'WF-03 Production data, alerts, evidence review and milestone disbursement',
    parts: [{
      label: 'stocking, production data and alerts', pending: true,
      lanes: [['op', 260], ['adm', 260], ['sys', 260], ['dev', 260]],
      nodes: [
        ['s', 0, 0, 'start'],
        ['o1', 0, 1, 'action', 'Stock one crab per box in the funded box rows', { part: 'box rows' }],
        ['s1', 2, 2, 'action', 'Register the crabs per box'],
        ['ob0', 2, 3, 'object', 'Batch [InProduction]'],
        ['d0', 2, 4, 'decision', 'data source?', { q: 'R' }],
        ['o2', 0, 5, 'action', 'Record the daily log and box events in the app (feeding, health, mortality, molting)'],
        ['m1', 3, 5, 'action', 'Post box photos, feeding records, box events and logs through the common data channel', { planned: true }],
        ['mD', 2, 6, 'merge'],
        ['s2', 2, 7, 'action', 'Record the data per box; check mortality against the policy', { part: 'device data' }],
        ['d1', 2, 8, 'decision', 'mortality over the limit?', { q: 'L' }],
        ['s3', 2, 9, 'action', 'Raise an alert with a deadline to acknowledge'],
        ['o3', 0, 10, 'action', 'Acknowledge the alert with a response note'],
        ['d2', 2, 11, 'decision', 'acknowledged in time?', { q: 'L' }],
        ['a1', 1, 12, 'action', 'Monitor and resolve the escalated alert'],
        ['m2', 2, 12, 'merge'],
        ['s5', 2, 13, 'action', 'Issue a random capture request (one box, time window)'],
        ['cA', 2, 14, 'conn', 'A'],
      ],
      edges: [
        ['s', 'o1'], ['o1', 's1', '', 'hv'], ['s1', 'ob0'], ['ob0', 'd0'],
        ['d0', 'o2', '[Operator, in the app]', { t: 'hv', from: 'L' }], ['d0', 'm1', '[farm devices]', { t: 'hv', from: 'R' }],
        ['o2', 'mD', '', 'vh'], ['m1', 'mD', '', 'vh'], ['mD', 's2'], ['s2', 'd1'],
        ['d1', 's3', '[yes]'], ['d1', 'm2', '[no]', { t: 'ch', out: 'R', x: 'R2-14', in: 'R' }],
        ['s3', 'o3', '', { t: 'hv', from: 'L' }], ['o3', 'd2', '', 'hv'], ['d2', 'm2', '[yes]'], ['d2', 'a1', '[no: escalated]', { t: 'hv', from: 'L' }], ['a1', 'm2', '', 'h'],
        ['m2', 's5'], ['s5', 'cA'],
      ],
      notes: 'Data come either from the Operator in the app or, «planned», from the simulated farm devices and cameras through one common data channel (no hardware). Alerts in v1.4: Mortality from box events, MilestoneDelay and DataSilence from the alert job, EvidenceFlag from an expired capture request. The cycle repeats every day until harvest (WF-04). Connector A continues on part 2.',
    }, {
      label: 'capture request and evidence review',
      lanes: [['op', 260], ['rev', 270], ['sys', 260], ['inv', 260]],
      nodes: [
        ['cA', 2, 0, 'conn', 'A'],
        ['o4', 0, 1, 'action', 'Capture a live photo of the box in the app: server time, location, box number'],
        ['s6', 2, 2, 'action', 'Check the photo is genuine and score its risk', { part: 'crab detection' }],
        ['d3', 2, 3, 'decision', 'risk score?', { q: 'R' }],
        ['mF', 0, 4, 'merge'],
        ['dX', 0, 5, 'decision', 'explain?', { q: 'R' }],
        ['o5', 0, 6, 'action', 'Submit an explanation for the flagged evidence'],
        ['mV', 1, 7, 'merge'],
        ['a2', 1, 8, 'action', 'Review the evidence (never on a Batch they invested in)'],
        ['d4', 1, 9, 'decision', 'verdict?', { q: 'R' }],
        ['si', 3, 9, 'start'],
        ['mK', 2, 10, 'merge'],
        ['ob2', 1, 10, 'object', 'Evidence [Rejected]'],
        ['i1', 3, 10, 'action', 'View box details of own rows: photos, feeding, health (others see Batch-level figures)', { planned: true }],
        ['ob1', 2, 11, 'object', 'Evidence [Accepted] on the investor timeline'],
        ['ff1', 1, 11, 'flowEnd'],
        ['ff2', 3, 11, 'flowEnd'],
        ['cB', 2, 12, 'conn', 'B'],
      ],
      edges: [
        ['cA', 'o4', '', { t: 'hv', from: 'L' }], ['o4', 's6', '', 'hv'], ['s6', 'd3'],
        ['d3', 'mF', '[risk ≥ 70: flagged]', { t: 'hv', from: 'L' }],
        ['d3', 'mV', '[20 ≤ risk < 70: watch]', 'vh'],
        ['d3', 'mK', '[risk < 20]', { t: 'ch', out: 'R', x: 'R2-14', in: 'R' }],
        ['mF', 'dX'], ['dX', 'o5', '[yes]'], ['dX', 'mV', '[no]', 'hv'], ['o5', 'mV', '', 'vh'],
        ['mV', 'a2'], ['a2', 'd4'],
        ['d4', 'mK', '[pass]', 'hv'], ['d4', 'ob2', '[fail]'], ['ob2', 'ff1'],
        ['d4', 'mF', '[need more evidence]', { t: 'ch', out: 'L', x: 'L0+14', in: 'L' }],
        ['mK', 'ob1'], ['ob1', 'cB'],
        ['si', 'i1'], ['i1', 'ff2'],
      ],
      notes: 'Evidence states (Figure 4.28): risk < 20 Accepted; Watch goes straight to the Evidence Reviewer; Flagged evidence may get the Operator\'s explanation first; a NeedMoreEvidence verdict makes it Flagged again. The crab detection module only checks that a crab is present and adds to the risk score (develop runs a no-op detector); a person decides. Rejected evidence notifies the Operator. The Investor\'s view of own box details is a separate flow: it reads the accepted evidence and box data at any time. Connector B continues on part 3.',
    }, {
      label: 'milestone disbursement', pending: true,
      lanes: [['op', 260], ['adm', 260], ['sys', 260], ['psp', 260]],
      nodes: [
        ['cB', 0, 0, 'conn', 'B'],
        ['mQ', 0, 1, 'merge'],
        ['o6', 0, 2, 'action', 'Request the next milestone tranche'],
        ['s7', 2, 3, 'action', 'Check the milestone gate: previous tranche released, accepted evidence, none flagged'],
        ['d5', 2, 4, 'decision', 'gate passes?', { q: 'R' }],
        ['a3', 1, 5, 'action', 'Review the request; re-check the gate'],
        ['ff3', 2, 5, 'flowEnd'],
        ['d6', 1, 6, 'decision', 'decision?', { q: 'R' }],
        ['o7', 0, 7, 'action', 'Submit the explanation'],
        ['ob3', 1, 7, 'object', 'DisbursementTranche [Blocked]'],
        ['s8', 2, 7, 'action', 'Create the disbursement instruction'],
        ['ff4', 1, 8, 'flowEnd'],
        ['a4', 1, 9, 'action', 'Send the disbursement instruction'],
        ['p1', 3, 10, 'action', 'Pay the tranche to the Operator\'s payout account'],
        ['e', 3, 11, 'end'],
      ],
      edges: [
        ['cB', 'mQ'], ['mQ', 'o6'], ['o6', 's7', '', 'hv'], ['s7', 'd5'],
        ['d5', 'ff3', '[no: request refused]'], ['d5', 'a3', '[yes]', { t: 'hv', from: 'L' }], ['a3', 'd6'],
        ['d6', 'o7', '[need explanation]', { t: 'hv', from: 'L' }], ['d6', 'ob3', '[block]'], ['d6', 's8', '[release]', 'hv'],
        ['ob3', 'ff4'], ['o7', 'mQ', '', { t: 'ch', out: 'L', x: 'L0+14', in: 'L' }],
        ['s8', 'a4', '', 'vh'], ['a4', 'p1', '', 'vh'], ['p1', 'e'],
      ],
      notes: 'Milestone gate (Figure 4.13): tranche 1 needs the capital closed and contracts signed; later tranches need stocking and accepted evidence since the last tranche with none flagged; tranche 3 or later needs a declared harvest date. Release creates a disbursement instruction (Figure 4.12) that the Administrator sends; after an explanation the Operator requests the tranche again (no direct release); a blocked tranche stops the later ones.',
    }],
    notes: 'Traceability: UC17, UC52, UC19, UC20, UC45, UC47, UC48, UC21, UC53, UC18, UC40 (TP4 Khôi; ingestion and simulator TP2 Viên; disbursement TP1 Thiện). Precondition: capital closed and every contract FullySigned (WF-02); only the boxes of funded rows are stocked. Exception branches: mortality over the limit, alert not acknowledged in time (escalated), watch or flagged evidence reviewed by a person, rejected evidence, more evidence requested, tranche request refused, explanation requested, tranche blocked. «planned» in v1.4: the simulated farm devices and cameras with one common data channel, the trained crab detection module, box rows and row-scoped box details for investors. Removed in v1.4 (still in code): per-crab tags and tag photos; WaterQuality alerts with the water thresholds and readings of daily logs (pH, temperature, salinity). States: Batch Stocked → InProduction (Figure 4.8); alert Open → Acknowledged / Escalated → Resolved (4.30); capture request Open → Fulfilled / Expired (4.29); evidence Accepted / Watch / Flagged / Rejected (4.28); tranche Planned → Requested → Released / NeedsExplanation / Blocked (4.13).',
  },
  {
    key: 'WF-04', page: 'WF-04 Bulk pre-sale and delivery', fig: 'Figure 4.34',
    title: 'WF-04 Bulk pre-order, weighed delivery, invoiced and final orders',
    parts: [{
      label: 'pre-order and deposit (each pre-order)', pending: true,
      lanes: [['cus', 260], ['psp', 230], ['sys', 260]],
      nodes: [
        ['s', 0, 0, 'start'],
        ['c1', 0, 1, 'action', 'Find farms on the map that deliver to the address; choose a Batch open for pre-order', { planned: true }],
        ['c2', 0, 2, 'action', 'Pre-order by number of crabs (or kg) from the minimum quantity', { part: 'crab count, minimum' }],
        ['s1', 2, 3, 'action', 'Check stock (no overselling) and the minimum; hold the crabs; issue the deposit VietQR', { part: 'while funding, minimum' }],
        ['dP', 0, 4, 'decision', 'pays the deposit?', { q: 'L' }],
        ['c3', 0, 5, 'action', 'Pay the deposit by VietQR'],
        ['obX', 2, 5, 'object', 'BulkPreOrder [Cancelled]: hold released, nothing lost'],
        ['p1', 1, 6, 'action', 'Notify the transaction'],
        ['ffX', 2, 6, 'flowEnd'],
        ['s2', 2, 7, 'action', 'Confirm the deposit'],
        ['ob1', 2, 8, 'object', 'BulkPreOrder [DepositPaid]'],
        ['cA', 2, 9, 'conn', 'A'],
      ],
      edges: [
        ['s', 'c1'], ['c1', 'c2'], ['c2', 's1', '', 'hv'], ['s1', 'dP', '', { t: 'hv', from: 'L' }],
        ['dP', 'c3', '[pays]'], ['dP', 'obX', '[cancels or 15 minutes pass]', 'hv'], ['obX', 'ffX'],
        ['c3', 'p1', '', 'hv'], ['p1', 's2', '', 'vh'], ['s2', 'ob1'], ['ob1', 'cA'],
      ],
      notes: 'An Investor may pre-order like a Customer (not the Batch\'s Operator or its members). Cancelling before paying (UC55) or letting the 15-minute QR expire costs nothing. Connector A continues on part 2.',
    }, {
      label: 'cancellation and Batch outcome (each pre-order)', pending: true,
      lanes: [['cus', 260], ['psp', 230], ['sys', 260], ['adm', 260]],
      nodes: [
        ['cA', 2, 0, 'conn', 'A'],
        ['dK', 0, 1, 'decision', 'keeps the pre-order?', { q: 'L' }],
        ['cX', 0, 2, 'action', 'Cancel the pre-order after paying the deposit'],
        ['mK', 2, 3, 'merge'],
        ['d1', 2, 4, 'decision', 'Batch opened? (WF‑02)', { q: 'L' }], // gạch nối không ngắt dòng (U+2011)
        ['dC', 2, 5, 'decision', 'cancelled by the Customer?', { q: 'L' }],
        ['cB', 2, 5, 'conn', 'B', { dx: 100 }],
        ['a1', 3, 5, 'action', 'Send the deposit refund (cancelled pre-orders included)', { planned: true }],
        ['s4', 2, 6, 'action', 'Forfeit the deposit as Batch revenue (ForfeitedDeposit)', { planned: true }],
        ['obF', 2, 7, 'object', 'BulkPreOrder [Forfeited]', { planned: true }],
        ['ffF', 2, 8, 'flowEnd'],
        ['p2', 1, 9, 'action', 'Execute the refund'],
        ['ffR', 1, 10, 'flowEnd'],
      ],
      edges: [
        ['cA', 'dK', '', { t: 'hv', from: 'L' }],
        ['dK', 'cX', '[no: cancels]'], ['dK', 'mK', '[yes]', 'hv'], ['cX', 'mK', '', 'vh'],
        ['mK', 'd1'], ['d1', 'dC', '[yes]'], ['d1', 'a1', '[no]', 'hv'],
        ['dC', 's4', '[yes]'], ['dC', 'cB', '[no]', 'h'], ['s4', 'obF'], ['obF', 'ffF'],
        ['a1', 'p2', '', 'vh'], ['p2', 'ffR'],
      ],
      notes: 'Cancellation after the deposit (UC55): when the Batch does not open every deposit is refunded, cancelled pre-orders included; when it opens, a pre-order cancelled after paying forfeits the deposit, which becomes Batch revenue (UC54). Connector B continues the kept pre-order on part 3.',
    }, {
      label: 'delivery and balance (each pre-order)', pending: true,
      lanes: [['cus', 260], ['psp', 230], ['sys', 260], ['op', 260]],
      nodes: [
        ['cB', 3, 0, 'conn', 'B'],
        ['o2', 3, 1, 'action', 'Prepare the delivery note: assign crabs of harvested boxes to the order; print the order QR', { planned: true }],
        ['o3', 3, 2, 'action', 'Deliver; weigh the crabs at the door; record transit losses', { part: 'weighing' }],
        ['c4a', 0, 3, 'action', 'Check the crabs at the door'],
        ['d2', 0, 4, 'decision', 'accept and pay the balance?', { q: 'L' }],
        ['c4', 0, 5, 'action', 'Pay the balance = weighed kg × price per kg − deposit (weighed kg = live crabs received)', { part: 'weighed kg' }],
        ['s5', 2, 5, 'action', 'Forfeit the deposit as Batch revenue; return the crabs to stock for the Batch\'s invoiced sale', { planned: true }],
        ['p3', 1, 6, 'action', 'Notify the balance payment'],
        ['ob4', 2, 6, 'object', 'BulkPreOrder [Forfeited]', { planned: true }],
        ['ff1', 2, 7, 'flowEnd'],
        ['s6', 2, 8, 'action', 'Record the delivery; start the 72-hour return window'],
        ['ob2', 2, 9, 'object', 'BulkPreOrder [Delivered]'],
        ['cC', 2, 10, 'conn', 'C'],
      ],
      edges: [
        ['cB', 'o2'], ['o2', 'o3'], ['o3', 'c4a', '', { t: 'hv', from: 'L' }], ['c4a', 'd2'],
        ['d2', 'c4', '[yes]'], ['d2', 's5', '[no: refuses or does not pay]', 'hv'], ['s5', 'ob4'], ['ob4', 'ff1'],
        ['c4', 'p3', '', 'hv'], ['p3', 's6', '', 'vh'], ['s6', 'ob2'], ['ob2', 'cC'],
      ],
      notes: 'Delivery starts once the boxes are harvested (part 5). A refused delivery or an unpaid balance forfeits the deposit (Batch revenue ForfeitedDeposit) and ends this pre-order; its crabs go back to stock for the Batch\'s invoiced sale on part 5. Balance = weighed kg × price per kg − deposit, where weighed kg counts the live crabs received; the transit loss is only recorded, not deducted again, and a negative balance is refunded. Connector C continues on part 4.',
    }, {
      label: 'order QR, returns, complaints and completion (each pre-order)',
      lanes: [['cus', 260], ['psp', 230], ['sys', 260], ['adm', 260], ['op', 260]],
      nodes: [
        ['cC', 0, 0, 'conn', 'C'],
        ['c5', 0, 1, 'action', 'Scan the order QR: farm, Batch, harvest record', { planned: true }],
        ['d3', 0, 2, 'decision', 'problem within the return window?', { q: 'R' }],
        ['c6', 0, 3, 'action', 'Request a return or submit a complaint'],
        ['d8', 2, 4, 'decision', 'request type?', { q: 'L' }],
        ['o4', 4, 5, 'action', 'Answer the complaint with evidence'],
        ['a2', 3, 6, 'action', 'Resolve the complaint: refund, compensation, replacement or reject'],
        ['d7', 3, 7, 'decision', 'outcome?', { q: 'R' }],
        ['mRf', 2, 8, 'merge'],
        ['s9', 2, 9, 'action', 'Create the refund instruction'],
        ['ob5', 2, 10, 'object', 'BulkPreOrder [Returned]'],
        ['a3', 3, 11, 'action', 'Send the refund instruction'],
        ['p4', 1, 12, 'action', 'Execute the refund'],
        ['ff3', 2, 12, 'flowEnd', '', { dx: -60 }],
        ['m5', 2, 13, 'merge'],
        ['t1', 2, 14, 'time', 'return window ends', { q: 'R' }],
        ['ob6', 2, 15, 'object', 'BulkPreOrder [Completed]: its revenue counts for settlement'],
        ['ff4', 3, 15, 'flowEnd'],
      ],
      edges: [
        ['cC', 'c5'], ['c5', 'd3'], ['d3', 'c6', '[yes]'],
        ['d3', 'm5', '[no]', { t: 'pts', ex: 'L', en: 'L', pts: [['L0+14', 'd3.cy'], ['L0+14', 'm5.cy']] }],
        ['c6', 'd8', '', 'hv'],
        ['d8', 'mRf', '[return in the window]'], ['d8', 'o4', '[complaint]', { t: 'hv', from: 'R' }],
        ['o4', 'a2', '', { t: 'hv', from: 'L' }], ['a2', 'd7'],
        ['d7', 'mRf', '[full refund]', 'vh'],
        ['d7', 'm5', '[else]', { t: 'pts', ex: 'R', en: 'R', pts: [['R3-14', 'd7.cy'], ['R3-14', 'm5.cy']] }],
        ['mRf', 's9'], ['s9', 'ob5'], ['ob5', 'a3', '', 'hv'], ['a3', 'p4', '', { t: 'hv', from: 'L' }], ['p4', 'ff3', '', 'h'],
        ['m5', 't1'], ['t1', 'ob6'], ['ob6', 'ff4', '', 'h'],
      ],
      notes: 'A return in the window (Customer, or approved by the Operator) or a complaint resolved with a full refund returns the order; compensation, replacement or rejection keeps it Delivered until the return window ends (a partial refund also creates a refund instruction, not drawn). An active complaint blocks completion. Each pre-order ends at its own flow final.',
    }, {
      label: 'harvest, invoiced sales and final order (once per Batch)', pending: true,
      lanes: [['op', 260], ['sys', 260]],
      nodes: [
        ['sB', 0, 0, 'start'],
        ['h1', 0, 1, 'action', 'Record the harvest per box: weight, grade'],
        ['t2', 0, 2, 'time', 'sales window closed', { q: 'R' }],
        ['o5', 0, 3, 'action', 'Record the invoiced sales of low-grade crabs and of crabs from forfeited pre-orders (InvoicedSale)', { planned: true }],
        ['mF', 0, 4, 'merge'],
        ['o6', 0, 5, 'action', 'Record the final order for the leftover crabs to the committed buyer', { planned: true }],
        ['d5', 0, 6, 'decision', 'price ≥ floor price?', { q: 'R' }],
        ['ob3', 1, 7, 'object', 'FinalOrder [PendingPayment] with its invoice, one per Batch', { planned: true }],
        ['ffB', 1, 8, 'flowEnd'],
      ],
      edges: [
        ['sB', 'h1'], ['h1', 't2'], ['t2', 'o5'], ['o5', 'mF'], ['mF', 'o6'], ['o6', 'd5'],
        ['d5', 'ob3', '[yes]', 'hv'], ['d5', 'mF', '[no: revise]', { t: 'ch', out: 'L', x: 'L0+14', in: 'L' }], ['ob3', 'ffB'],
      ],
      notes: 'This flow runs once per Batch, separately from the flows of each pre-order (parts 1–4): the harvest per box, then, after the sales window closes, the invoiced sales (low-grade crabs and crabs of forfeited pre-orders, reasons LowGrade and ForfeitResale) and one final order to the committed buyer, never below the floor price.',
    }],
    notes: 'Traceability: UC25, UC27, UC55, UC12, UC40, UC22, UC29, UC30, UC54, UC33, UC31, UC32, UC50, UC51 (TP3 Nhân). Exception branches: pre-order cancelled or unpaid before the deposit → nothing lost; Batch not opened → every deposit refunded, cancelled pre-orders included; cancelled after paying and the Batch opened, delivery refused or balance unpaid → deposit forfeited (UC54), and in the last two cases the crabs are resold through an invoiced sale; final-order price below the floor price → revised; return or complaint → refund, or the order completes after the return window. «planned» in v1.4: farm map with delivery radius, pre-order by crab count from a minimum while the Batch is funding (the code pre-orders by kg on a listing while InProduction), the forfeit rule on cancellation, the delivery note with the order QR, weighing at the door and the balance on weighed kg, forfeited Customer deposits, invoiced sales of low-grade or resold crabs (InvoicedSale) and the final order at the floor price; every delivered order has an invoice. Removed in v1.4 (still in code): product listings, retail cart and checkout, priority offtake claims, per-crab tags and tag-scan packing, the balance before packing (PreorderBalanceJob). States: BulkPreOrder PendingPayment (crabs held) → DepositPaid → Confirmed «planned» → Packed → Shipping → Delivered → Completed, or Cancelled, Returned, Refunded «planned», Forfeited «planned» (Figure 4.17); InvoicedSale | FinalOrder recorded with its invoice (crabs Sold), PendingPayment → Completed when the OrderPayment is paid «planned» (4.18; cancellation or expiry is an open point); complaint Open → OperatorResponded / Escalated → Resolved / Rejected (4.19).',
  },
  {
    key: 'WF-05', page: 'WF-05 Settlement and payout', fig: 'Figure 4.35',
    title: 'WF-05 Settlement, tiered remuneration, payout and loss case',
    parts: [{
      label: 'calculation and draft statement', pending: true,
      lanes: [['adm', 260], ['sys', 510, [140, 380]]],
      nodes: [
        ['s', 0, 0, 'start'],
        ['a1', 0, 1, 'action', 'Start the settlement calculation'],
        ['mS', 1, 2, 'merge', '', { sub: 0 }],
        ['s1', 1, 3, 'action', 'Sum the revenue lines: delivered orders, invoiced sales, forfeited deposits, final order', { sub: 0, part: 'new revenue types' }],
        ['s2', 1, 4, 'action', 'Compute the Revenue Pool = actual revenue − locked Standard Cost of the funded boxes', { sub: 0 }],
        ['d1', 1, 5, 'decision', 'Pool > 0?', { sub: 0, q: 'L' }],
        ['s3', 1, 6, 'action', 'Compute the remuneration: floor(Pool × rate), cut by tier below the survival threshold', { sub: 0, part: 'tiers' }],
        ['s4', 1, 6, 'action', 'Allocate the loss pro rata, each capped at its capital; no remuneration; the Operator bears any excess', { sub: 1 }],
        ['s5', 1, 7, 'action', 'Split the rest pro rata by capital, largest-remainder rounding', { sub: 0 }],
        ['m1', 1, 8, 'merge', '', { sub: 0 }],
        ['ob1', 1, 9, 'object', 'Settlement [Draft], one line per investor', { sub: 0 }],
        ['a2', 0, 10, 'action', 'Review the draft statement'],
        ['d2', 0, 11, 'decision', 'recalculate?', { q: 'R' }],
        ['a3', 0, 12, 'action', 'Propose the statement with a 7–14 day feedback window'],
        ['cA', 0, 13, 'conn', 'A'],
      ],
      edges: [
        ['s', 'a1', '[sales closed, return windows over]'], ['a1', 'mS', '', 'hv'], ['mS', 's1'], ['s1', 's2'], ['s2', 'd1'],
        ['d1', 's3', '[yes]'], ['d1', 's4', '[no: loss]', 'hv'], ['s3', 's5'], ['s5', 'm1'], ['s4', 'm1', '', 'vh'], ['m1', 'ob1'],
        ['ob1', 'a2', '', { t: 'hv', from: 'L' }], ['a2', 'd2'],
        ['d2', 'mS', '[yes]', { t: 'pts', ex: 'L', en: 'L', pts: [['L0+14', 'd2.cy'], ['L0+14', 'mS.cy']] }],
        ['d2', 'a3', '[no]'], ['a3', 'cA'],
      ],
      notes: 'The Administrator starts the calculation; the settlement engine computes it (UC38). Customer refunds are settled before the Pool is computed. Connector A continues on part 2.',
    }, {
      label: 'review and feedback',
      lanes: [['adm', 260], ['sys', 260], ['inv', 260], ['op', 260]],
      nodes: [
        ['cA', 0, 0, 'conn', 'A'],
        ['f1', 2, 1, 'fork', '', { span: [[2], [3]] }],
        ['i1', 2, 2, 'action', 'Review own line: capital, share, net payout'],
        ['o1', 3, 2, 'action', 'Review the full statement and the remuneration tier'],
        ['d3', 2, 3, 'decision', 'disagree?', { q: 'L' }],
        ['i2', 2, 4, 'action', 'Submit feedback with grounds'],
        ['a4', 0, 5, 'action', 'Answer the feedback (answered or unresolved)'],
        ['mJ', 2, 6, 'merge'],
        ['j1', 2, 7, 'join', '', { span: [[2], [3]] }],
        ['t1', 1, 8, 'time', 'feedback window ends', { q: 'R' }],
        ['a5', 0, 9, 'action', 'Approve the settlement'],
        ['cB', 0, 10, 'conn', 'B'],
      ],
      edges: [
        ['cA', 'f1', '', { t: 'pts', ex: 'R', en: 'Tx', pts: [['f1.x+16', 'cA.cy']] }],
        ['f1', 'i1', '', { t: 'v', x: 'i1' }], ['f1', 'o1', '', { t: 'v', x: 'o1' }],
        ['i1', 'd3'], ['d3', 'i2', '[yes]'],
        ['d3', 'mJ', '[no]', { t: 'pts', ex: 'R', en: 'R', pts: [['R2-14', 'd3.cy'], ['R2-14', 'mJ.cy']] }],
        ['i2', 'a4', '', { t: 'hv', from: 'L' }], ['a4', 'mJ', '', 'hv'],
        ['o1', 'j1', '', { t: 'v', x: 'o1' }], ['mJ', 'j1', '', { t: 'v', x: 'mJ' }],
        ['j1', 't1', '', { t: 'pts', ex: 'Bx', en: 'T', pts: [['j1.x+20', 'j1.b+16'], ['t1.cx', 'j1.b+16']] }],
        ['t1', 'a5', '[no open feedback]', { t: 'hv', from: 'L' }], ['a5', 'cB'],
      ],
      notes: 'Investor and Operator review in parallel; the merge joins the two outcomes of the Investor\'s branch before the join. Feedback moves the settlement to Disputed until the Administrator answers it (Figure 4.15). Connector B continues on part 3.',
    }, {
      label: 'payment instructions and payout', pending: true,
      lanes: [['adm', 260], ['sys', 260], ['psp', 260]],
      nodes: [
        ['cB', 0, 0, 'conn', 'B'],
        ['s7', 1, 1, 'action', 'Lock the statement; create the payment instructions (remuneration, payouts)'],
        ['a6', 0, 2, 'action', 'Send the payment instructions'],
        ['mP', 2, 3, 'merge'],
        ['p1', 2, 4, 'action', 'Pay out from the Batch account; report each result'],
        ['d4', 1, 5, 'decision', 'all payouts succeeded?', { q: 'R' }],
        ['s8', 1, 6, 'action', 'Close the settlement and the Batch'],
        ['a7', 0, 6, 'action', 'Resend the failed instruction'],
        ['e', 1, 7, 'end'],
      ],
      edges: [
        ['cB', 's7', '', 'hv'], ['s7', 'a6', '', { t: 'hv', from: 'L' }], ['a6', 'mP', '', 'hv'], ['mP', 'p1'], ['p1', 'd4', '', { t: 'hv', from: 'L' }],
        ['d4', 's8', '[yes]'], ['d4', 'a7', '[no]', { t: 'hv', from: 'L' }], ['s8', 'e'],
        ['a7', 'mP', '', { t: 'pts', ex: 'L', en: 'L', pts: [['L0+14', 'a7.cy'], ['L0+14', 'mP.cy']] }],
      ],
      notes: 'Approval locks the statement and creates one payment instruction per payee (Figure 4.12); the sandbox gateway answers at once (Created → Succeeded or Failed). The last successful payout closes the settlement and the Batch.',
    }],
    notes: 'Traceability: UC38, UC37, UC35, UC36, UC39, UC40 (TP1 Thiện). Worked example (Register v1.4): Standard Cost 100,000,000 VND; revenue 300,000,000 VND → Pool 200,000,000 VND; survival 90% above an 85% threshold → remuneration 10% = 20,000,000 VND; A receives 15,000,000 + 27,000,000 = 42,000,000 VND, B the same, C 196,000,000 VND, so payouts plus remuneration equal the revenue; at 80% survival the remuneration halves. Exception branches: negative Revenue Pool (loss capped at capital, no capital call, no carry-over), recalculation, investor feedback, failed payout resent. «planned» in v1.4: revenue lines InvoicedSale (low-grade or resold crabs), ForfeitedDeposit and FinalOrder (the code counts completed orders and offtake forfeits), remuneration tiers by survival rate (the code uses one fixed percentage). Survival = 1 − deaths ÷ crabs stocked in the funded boxes; restocked crabs that die count, deaths in transit only lower revenue. Unused Standard Cost, including an unused mortality reserve, stays with the Operator; only an early liquidation returns unspent capital. Removed in v1.4 (still in code): offtake forfeits as revenue. States: settlement Draft → Proposed ⇄ Disputed → Approved → PaidOut → Closed (Figure 4.14); payment instruction Created → Succeeded / Failed (4.12); Batch Settlement → Closed (4.8).',
  },
];

// ---------------- hình học ----------------
const SIZE = { action: [AW, 44], object: [AW, 36], decision: [30, 30], merge: [26, 26], start: [24, 24], end: [24, 24], flowEnd: [24, 24], time: [22, 30], conn: [28, 28] };
const CPL = 30, CPL_SMALL = 33; // ký tự mỗi dòng trong hộp 210 px: chữ 12 px và chữ 11 px

function subText(o) { return o.planned ? '«planned»' : o.part ? `(${o.part} «planned»)` : ''; }
/** Chiều cao hộp hành động/đối tượng theo số dòng chữ 12 px, cộng dòng xám 11 px cho «planned» hoặc "(… «planned»)". */
function boxH(kind, label, o) {
  const lines = Math.ceil(label.length / CPL), sub = subText(o), subLines = sub ? Math.ceil(sub.length / CPL_SMALL) : 0;
  return Math.max(SIZE[kind][1], 16 + lines * 15 + subLines * 14);
}

function geometry(part) {
  let x = X0;
  const lanes = part.lanes.map(([key, width, subs]) => { const L = { key, name: LANE[key], x, w: width, subs: subs ?? [width / 2] }; x += width; return L; });
  const cxOf = (lane, sub = 0) => lanes[lane].x + lanes[lane].subs[sub];
  const hdr = lanes.some(L => L.name.length * 7.8 > L.w - 16) ? 48 : 32; // tên làn dài thì xuống dòng, cả trang dùng đầu làn cao hơn
  const N = {};
  for (const [id, lane, row, kind, label = '', o = {}] of part.nodes) {
    if (N[id]) throw new Error('duplicate node ' + id);
    let w = 0, h = 6;
    if (kind !== 'fork' && kind !== 'join') { [w, h] = SIZE[kind]; if (kind === 'action' || kind === 'object') h = boxH(kind, label, o); }
    const n = { id, lane, row, kind, label, o, w, h, cx: cxOf(lane, o.sub ?? 0) + (o.dx ?? 0) };
    // chữ của decision (phía trên, lệch trái/phải) và của time event (bên cạnh): bề rộng tới cột con kế bên hoặc mép làn
    if ((kind === 'decision' || kind === 'time') && label) {
      const L = lanes[lane], s = o.sub ?? 0, R = (o.q ?? 'R') === 'R', half = w / 2 + 4;
      const limit = R ? (s + 1 < L.subs.length ? L.x + L.subs[s + 1] - 14 : L.x + L.w - 6) : (s > 0 ? L.x + L.subs[s - 1] + 14 : L.x + 6);
      n.tw = Math.min(150, Math.abs(limit - (n.cx + (R ? half : -half))));
      const cpl = Math.floor((n.tw - 4) / 6.0);
      n.th = Math.ceil(label.length / cpl) * 14 + 4;
    }
    N[id] = n;
  }
  const maxRow = Math.max(...part.nodes.map(n => n[2]));
  const up = Array(maxRow + 1).fill(10), down = Array(maxRow + 1).fill(10);
  for (const n of Object.values(N)) {
    let u = n.h / 2, d = n.h / 2;
    if (n.kind === 'decision' && n.label) u = Math.max(u, 9 + n.th);
    if (n.kind === 'time' && n.label) { u = Math.max(u, n.th / 2); d = Math.max(d, n.th / 2); }
    up[n.row] = Math.max(up[n.row], u); down[n.row] = Math.max(down[n.row], d);
  }
  const CY = [];
  let y = TOPY + hdr + 16;
  for (let r = 0; r <= maxRow; r++) { y += up[r]; CY[r] = y; y += down[r] + GAP; }
  const cy = (r) => {
    if (Number.isInteger(r) && r <= maxRow) return CY[r];
    const f = Math.floor(r), t = r - f;
    if (f >= maxRow) return CY[maxRow] + down[maxRow] + (r - maxRow) * 50;
    return CY[f] + t * (CY[f + 1] - CY[f]);
  };
  const G = { lanes, cxOf, cy, N, maxRow, hdr };
  for (const n of Object.values(N)) {
    n.cy = CY[n.row];
    if (n.kind === 'fork' || n.kind === 'join') {
      const [[l1, s1 = 0], [l2, s2 = 0]] = n.o.span ?? [[n.lane], [n.lane]];
      const x1 = n.o.x1 ? resolve(G, n.o.x1, 'x') : cxOf(l1, s1) - 60, x2 = n.o.x2 ? resolve(G, n.o.x2, 'x') : cxOf(l2, s2) + 60;
      n.x = x1; n.w = x2 - x1; n.cx = (x1 + x2) / 2;
    } else n.x = n.cx - n.w / 2;
    n.y = n.cy - n.h / 2;
  }
  return G;
}

// toạ độ ký hiệu trong route: 'L2+14' = mép trái làn 2 + 14; 'R2-14' = mép phải làn 2 − 14; 'C2' = tâm làn 2 (cột con 0); 'S2.1' = tâm cột con 1 của làn 2;
// 'r9' = tâm hàng 9 (có thể lẻ: 'r7.6'); 'id.x|r|t|b|cx|cy±n' = mép trái/phải/trên/dưới hay tâm của nút; id trơn = tâm (x) hoặc đỉnh (y) nút đó
function resolve(G, v, axis) {
  if (typeof v === 'number') return v;
  let m;
  if ((m = v.match(/^L(\d)([+-]\d+)?$/))) return G.lanes[+m[1]].x + (+m[2] || 0);
  if ((m = v.match(/^R(\d)([+-]\d+)?$/))) return G.lanes[+m[1]].x + G.lanes[+m[1]].w + (+m[2] || 0);
  if ((m = v.match(/^C(\d)([+-]\d+)?$/))) return G.cxOf(+m[1]) + (+m[2] || 0);
  if ((m = v.match(/^S(\d)\.(\d)([+-]\d+)?$/))) return G.cxOf(+m[1], +m[2]) + (+m[3] || 0);
  if ((m = v.match(/^r(\d+(?:\.\d+)?)$/))) return G.cy(+m[1]);
  if ((m = v.match(/^(\w+)\.(x|r|t|b|cx|cy)([+-]\d+)?$/)) && G.N[m[1]]) {
    const n = G.N[m[1]], off = +m[3] || 0;
    return { x: n.x, r: n.x + n.w, t: n.y, b: n.y + n.h, cx: n.cx, cy: n.cy }[m[2]] + off;
  }
  if (G.N[v]) return axis === 'x' ? G.N[v].cx : G.N[v].y;
  throw new Error('bad coordinate ' + v);
}

const side = (s) => ({ T: [0.5, 0], B: [0.5, 1], L: [0, 0.5], R: [1, 0.5] }[s]);
/** Tính cổng ra/vào (tỉ lệ) và điểm gấp cho một cạnh. */
function route(G, e) {
  const [a, b, , r0 = 'auto'] = e;
  const s = G.N[a], t = G.N[b];
  if (!s || !t) throw new Error(`edge ${a}->${b}: unknown node`);
  const r = typeof r0 === 'string' ? { t: r0 } : r0;
  const down = t.cy > s.cy;
  if (r.t === 'auto' || r.t === 'v') {
    const x = r.x ? resolve(G, r.x, 'x') : s.cx;
    const fx = (n) => (x - n.x) / n.w;
    if (Math.abs(x - t.cx) > 0.5 && !(t.kind === 'fork' || t.kind === 'join')) throw new Error(`v-route not aligned ${a}->${b}`);
    if (Math.abs(x - s.cx) > 0.5 && !(s.kind === 'fork' || s.kind === 'join')) throw new Error(`v-route not aligned at source ${a}->${b}`);
    return { ex: [fx(s), down ? 1 : 0], en: [fx(t), down ? 0 : 1], pts: [] };
  }
  if (r.t === 'h') {
    if (Math.abs(s.cy - t.cy) > 0.5) throw new Error(`h-route not level ${a}->${b}`);
    const right = t.cx > s.cx; return { ex: side(right ? 'R' : 'L'), en: side(right ? 'L' : 'R'), pts: [] };
  }
  if (r.t === 'hv') {
    const from = r.from ?? (t.cx > s.cx ? 'R' : 'L');
    return { ex: side(from), en: side(down ? 'T' : 'B'), pts: [[t.cx, s.cy]] };
  }
  if (r.t === 'vh') {
    const into = t.cx > s.cx ? 'L' : 'R';
    return { ex: side(down ? 'B' : 'T'), en: side(into), pts: [[s.cx, t.cy]] };
  }
  if (r.t === 'ch') {
    const x = resolve(G, r.x, 'x');
    return { ex: side(r.out), en: side(r.in), pts: [[x, s.cy], [x, t.cy]] };
  }
  if (r.t === 'pts') {
    const pts = r.pts.map(([x, y]) => [resolve(G, x, 'x'), resolve(G, y, 'y')]);
    const port = (n, p, ref) => {
      if (Array.isArray(p)) return p;
      if (p === 'Tx' || p === 'Bx') return [(ref[0] - n.x) / n.w, p === 'Tx' ? 0 : 1];
      return side(p);
    };
    return { ex: port(s, r.ex, pts[0]), en: port(t, r.en, pts[pts.length - 1]), pts };
  }
  throw new Error('route ' + r.t);
}

function nodeStyle(n) {
  const planned = n.o.planned ? PLANNED : '';
  switch (n.kind) {
    case 'action': return S.action.replace('fontSize=11;', 'fontSize=12;') + planned;
    case 'object': return S.objectNode.replace('fontSize=10;', 'fontSize=12;') + planned;
    case 'decision': return S.decision + 'fontSize=11;';
    case 'merge': return S.merge;
    case 'fork': case 'join': return 'rounded=0;html=1;fillColor=#1e293b;strokeColor=#1e293b;';
    case 'start': return S.start;
    case 'end': return S.end;
    case 'flowEnd': return 'shape=mxgraph.flowchart.or;html=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;';
    case 'time': return 'shape=collate;html=1;fillColor=#ffffff;strokeColor=#1e293b;';
    case 'conn': return 'ellipse;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#1e293b;strokeWidth=1.5;fontStyle=1;fontSize=13;fontFamily=Segoe UI;';
  }
  throw new Error(n.kind);
}
function nodeLabel(n) {
  if (n.kind === 'conn') return escHtml(n.label);
  if (!['action', 'object'].includes(n.kind)) return '';
  let s = escHtml(n.label);
  if (n.o.planned) s = `<font style="font-size:11px" color="${GREY}">«planned»</font><br>${s}`;
  else if (n.o.part) s += `<br><font style="font-size:11px" color="${GREY}">(${escHtml(n.o.part)} «planned»)</font>`;
  return s;
}

/** Kiểm tra ngữ nghĩa UML trên mỗi phần: action/decision/fork chỉ một luồng vào, join/merge ≥ 2 luồng vào, guard trên mọi nhánh decision,
 *  mỗi fork có join (trên cùng phần hoặc qua connector), mỗi connector có đúng một phần vào và một phần ra (có thể quay lại phần trước). */
function lint(w) {
  const conns = {};
  let forks = 0, joins = 0;
  w.parts.forEach((p, pi) => {
    const inc = {}, out = {};
    for (const [a, b, g = ''] of p.edges) { (out[a] ??= []).push(g); (inc[b] ??= []).push(a); }
    for (const [id, , , kind] of p.nodes) {
      const i = (inc[id] ?? []).length, o = (out[id] ?? []).length, where = `${w.key} part ${pi + 1} ${id}`;
      if (kind === 'conn') { const c = (conns[id] ??= { in: [], out: [] }); if (i) c.in.push(pi); if (o) c.out.push(pi); if (i + o !== 1) throw new Error(`${where}: connector needs one flow`); continue; }
      if (kind === 'start' && (i || o !== 1)) throw new Error(`${where}: start`);
      if (['end', 'flowEnd'].includes(kind) && (o || i !== 1)) throw new Error(`${where}: final node`);
      if (['action', 'object', 'decision', 'fork', 'time'].includes(kind) && i !== 1) throw new Error(`${where}: ${i} incoming flows (put a merge before it)`);
      if (['merge', 'join'].includes(kind) && (i < 2 || o !== 1)) throw new Error(`${where}: ${kind} with ${i} in / ${o} out`);
      if (kind === 'decision' && (o < 2 || out[id].some(g => !g))) throw new Error(`${where}: decision branches need guards`);
      if (kind === 'fork') { forks++; if (o < 2) throw new Error(`${where}: fork`); }
      if (kind === 'join') joins++;
      if (['action', 'object', 'time'].includes(kind) && o !== 1) throw new Error(`${where}: ${o} outgoing flows`);
    }
  });
  if (forks !== joins) throw new Error(`${w.key}: ${forks} fork(s) but ${joins} join(s)`);
  for (const [id, c] of Object.entries(conns)) if (c.in.length !== 1 || c.out.length !== 1 || c.in[0] === c.out[0]) throw new Error(`${w.key} connector ${id}: in ${c.in} out ${c.out}`);
}

const LEGEND = '<b>Legend</b> (UML 2.5 activity with partitions, business level) — green rounded box = action (verb + object); orange box = object node [state]; small diamond = decision (guards in brackets) or merge; black bar = fork or join; hourglass = time event; circle with a letter = connector to another part of the same figure; filled dot = start; ringed dot = activity final; circle with a cross = flow final. Dashed grey with «planned» = in Register v1.4, not yet on develop @ 420a379; "(… «planned»)" = the step exists, that part does not.';

function drawPart(f, w, part, pi) {
  const n = w.parts.length;
  const d = f.page(n > 1 ? `${w.page} (${pi + 1} of ${n})` : w.page);
  const G = geometry(part);
  const width = G.lanes.reduce((a, L) => a + L.w, 0);
  const sub = n > 1 ? `<br><font style="font-size:13px">Part ${pi + 1} of ${n}: ${escHtml(part.label)}</font>` : '';
  d.text(`<b>${w.fig} – Activity Diagram: ${escHtml(w.title)}</b>${sub}<br><font style="font-size:11px" color="${GREY}">${META}</font>`, X0, 8, width + 24 + NOTE_W, TOPY - 14, 'fontSize=15;');
  // các cạnh trước (để biết đáy làn), rồi làn, nút, cạnh
  const edges = part.edges.map(e => {
    const [a, b, guard = ''] = e;
    const s = G.N[a], t = G.N[b];
    const r = route(G, e);
    const P = [[s.x + s.w * r.ex[0], s.y + s.h * r.ex[1]], ...r.pts, [t.x + t.w * r.en[0], t.y + t.h * r.en[1]]];
    return { a, b, guard, s, t, r, P };
  });
  let laneBottom = Math.max(...Object.values(G.N).map(n => n.y + n.h), ...edges.flatMap(e => e.P.map(p => p[1])));
  laneBottom += 26;
  const laneH = laneBottom - TOPY;
  G.lanes.forEach((L, i) => d.vertex(escHtml(L.name), S.lane.replace('startSize=30;', `startSize=${G.hdr};`) + 'fontSize=13;whiteSpace=wrap;' + (L.key === 'dev' ? `fontColor=${GREY};dashed=1;dashPattern=6 4;` : ''), L.x, TOPY, L.w, laneH, { key: 'lane' + i, raw: true }));
  for (const nd of Object.values(G.N)) {
    d.vertex(nodeLabel(nd), nodeStyle(nd), nd.x, nd.y, nd.w, nd.h, { key: nd.id, raw: true });
    if ((nd.kind === 'decision' || nd.kind === 'time') && nd.label) {
      const R = (nd.o.q ?? 'R') === 'R', half = nd.w / 2 + 4;
      const tx = R ? nd.cx + half : nd.cx - half - nd.tw, ty = nd.kind === 'time' ? nd.cy - nd.th / 2 : nd.cy - 9 - nd.th;
      d.text(`<font style="font-size:11px" color="#334155">${escHtml(nd.label)}</font>`, tx, ty, nd.tw, nd.th, `align=${R ? 'left' : 'right'};verticalAlign=${nd.kind === 'time' ? 'middle' : 'bottom'};spacing=0;`, { key: nd.id + '_q' });
    }
  }
  for (const { a, b, guard, s, t, r, P } of edges) {
    const lens = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1]));
    const total = lens.reduce((x, y) => x + y, 0);
    // nhãn guard: gần điểm ra (sau ~ nửa bề rộng nhãn + 10 px), không vượt quá giữa đoạn đầu
    const at = Math.min(lens[0] / 2, guard.length * 3.1 + 10);
    const gx = total ? (2 * Math.max(at, 6) / total - 1).toFixed(4) : 0;
    const planned = s.o.planned || t.o.planned;
    const style = FLOW + (planned ? `dashed=1;dashPattern=6 4;strokeColor=${GREY};fontColor=${GREY};` : '')
      + `exitX=${+r.ex[0].toFixed(4)};exitY=${r.ex[1]};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${+r.en[0].toFixed(4)};entryY=${r.en[1]};entryDx=0;entryDy=0;entryPerimeter=0;`;
    const pts = r.pts.map(([x, y]) => `<mxPoint x="${Math.round(x * 100) / 100}" y="${Math.round(y * 100) / 100}"/>`).join('');
    d.cells.push(`<mxCell id="${d.id()}" value="${escHtml(guard)}" style="${style}" edge="1" parent="1" source="${d.id(a)}" target="${d.id(b)}"><mxGeometry x="${guard ? gx : 0}" relative="1" as="geometry">${pts ? `<Array as="points">${pts}</Array>` : ''}</mxGeometry></mxCell>`);
  }
  // ghi chú và chú giải ở cột bên phải (trang ngang, in A4 ngang): ghi chú riêng của phần + (phần cuối) ghi chú chung + dòng "pending"
  const last = pi === n - 1;
  const text = [part.notes, last ? w.notes : n > 1 ? 'Traceability, exception branches, «planned» items and states: see the notes on the last part.' : '', part.pending ? PENDING : ''].filter(Boolean).join('<br>');
  const nx = X0 + width + 24;
  let y = TOPY;
  const nh = noteHeight(text, NOTE_W, 12);
  d.vertex(`<b>Notes</b> — ${text}`, S.note.replace('fontSize=10;', 'fontSize=12;'), nx, y, NOTE_W, nh, { raw: true });
  y += nh + 10;
  const lh = noteHeight(LEGEND.replace(/<[^>]+>/g, ''), NOTE_W, 11);
  d.vertex(LEGEND, S.legend.replace('fontSize=10;', 'fontSize=11;'), nx, y, NOTE_W, lh, { raw: true });
  const pageW = nx + NOTE_W + 20, pageH = Math.max(laneBottom, y + lh) + 30;
  const toXml = d.toXml.bind(d);
  d.toXml = () => cleanStyles(toXml().replace('pageWidth="1654"', `pageWidth="${Math.ceil(pageW / 10) * 10}"`).replace('pageHeight="1169"', `pageHeight="${Math.ceil(pageH / 10) * 10}"`));
}

/** Gộp khoá trùng trong style (khoá sau thắng, như draw.io áp dụng), để XML chỉ còn một cỡ chữ cho mỗi ô. */
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

function noteHeight(text, width, fs) {
  const plain = text.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '');
  const cpl = Math.floor((width - 20) / (fs * 0.47));
  const lines = plain.split('\n').reduce((k, l) => k + Math.max(1, Math.ceil((l.length + 10) / cpl)), 0);
  return lines * Math.round(fs * 1.25) + 22;
}

function run(out) {
  const f = new DrawioFile();
  let pages = 0;
  for (const w of WORKFLOWS) { lint(w); w.parts.forEach((p, i) => { drawPart(f, w, p, i); pages++; }); }
  f.write(path.join(out, 'CrabShare_Activity_Diagrams.drawio'));
  console.log('Activity diagrams done:', WORKFLOWS.length, 'workflows,', pages, 'pages');
}

// ---------------- Mermaid (cùng dữ liệu với bản draw.io) ----------------
// Mỗi làn là một subgraph (hợp các làn của mọi phần); connector là nút chung nằm ngoài subgraph, nên các phần nối liền thành một luồng.
// «planned» = nét đứt; thanh fork/join = ô đen nhỏ; nhãn luôn trong ngoặc kép.
const mq = (t) => `"${String(t).replace(/"/g, '#quot;').replace(/&/g, '#amp;')}"`;
function mermaidOf(w) {
  const L = [];
  const parts = w.parts.length;
  L.push(`%% ${w.fig} – Activity Diagram: ${w.title}`);
  L.push(`%% ${META}`);
  L.push(`%% Business level; generated from gen-activity.js with the same nodes and flows as CrabShare_Activity_Diagrams.drawio.`);
  L.push(`%% Lanes = subgraphs (one per actor). «planned» = in Register v1.4, not yet on develop @ 420a379 (dashed).`);
  if (parts > 1) L.push(`%% draw.io splits this figure into ${parts} parts; the connectors (${[...new Set(w.parts.flatMap(p => p.nodes.filter(n => n[3] === 'conn').map(n => n[4])))].join(', ')}) join them here into one flow.`);
  L.push('flowchart TB');
  const nodes = new Map(), laneOrder = [];
  w.parts.forEach(p => {
    for (const [id, lane, , kind, label = '', o = {}] of p.nodes) {
      const key = p.lanes[lane][0];
      if (!laneOrder.includes(key)) laneOrder.push(key);
      if (nodes.has(id)) { if (kind !== 'conn') throw new Error(`${w.key}: node id ${id} used in two parts`); continue; }
      nodes.set(id, { id, key, kind, label, o });
    }
  });
  const planned = [], bars = [], starts = [], objects = [], conns = [];
  const decl = (n) => {
    const text = (n.o.planned ? '«planned» ' : '') + n.label + (n.o.part ? ` (${n.o.part} «planned»)` : '');
    switch (n.kind) {
      case 'start': starts.push(n.id); return `${n.id}((" "))`;
      case 'end': return `${n.id}((("end")))`;
      case 'flowEnd': return `${n.id}(("✕"))`;
      case 'decision': return `${n.id}{${mq(n.label)}}`;
      case 'merge': return `${n.id}{" "}`;
      case 'fork': case 'join': bars.push(n.id); return `${n.id}[" "]`;
      case 'time': return `${n.id}>${mq('⌛ ' + n.label)}]`;
      case 'object': objects.push(n.id); return `${n.id}[${mq(text)}]`;
      case 'conn': conns.push(n.id); return `${n.id}((${mq(n.label)}))`;
      default: return `${n.id}(${mq(text)})`;
    }
  };
  for (const n of nodes.values()) if (n.o.planned) planned.push(n.id);
  for (const key of laneOrder) {
    L.push(`  subgraph LANE_${key}[${mq(LANE[key])}]`);
    L.push('    direction TB');
    for (const n of nodes.values()) if (n.key === key && n.kind !== 'conn') L.push(`    ${decl(n)}`);
    L.push('  end');
  }
  for (const n of nodes.values()) if (n.kind === 'conn') L.push(`  ${decl(n)}`);
  const P = new Set(planned);
  for (const p of w.parts) for (const [a, b, guard = ''] of p.edges) {
    const arrow = P.has(a) || P.has(b) ? '-.->' : '-->';
    L.push(`  ${a} ${arrow}${guard ? `|${mq(guard)}|` : ''} ${b}`);
  }
  L.push('  classDef planned stroke-dasharray:5 5,color:#64748b,stroke:#64748b,fill:#f8fafc');
  L.push('  classDef bar fill:#1e293b,stroke:#1e293b,color:#1e293b');
  L.push('  classDef startNode fill:#111111,stroke:#111111,color:#111111');
  L.push('  classDef object fill:#fff7ed,stroke:#c2410c');
  L.push('  classDef conn fill:#ffffff,stroke:#1e293b,stroke-width:2px');
  if (planned.length) L.push(`  class ${planned.join(',')} planned`);
  if (bars.length) L.push(`  class ${bars.join(',')} bar`);
  if (starts.length) L.push(`  class ${starts.join(',')} startNode`);
  const objs = objects.filter(id => !P.has(id));
  if (objs.length) L.push(`  class ${objs.join(',')} object`);
  if (conns.length) L.push(`  class ${conns.join(',')} conn`);
  L.push('');
  const notes = [...w.parts.map(p => p.notes).filter(Boolean), w.notes, w.parts.some(p => p.pending) ? PENDING : ''].filter(Boolean).join(' ');
  L.push(...notes.match(/.{1,150}(\s|$)/g).map(s => `%% ${s.trim()}`));
  return L.join('\n') + '\n';
}
function writeMermaid(dir) {
  const fs = require('fs');
  fs.mkdirSync(dir, { recursive: true });
  WORKFLOWS.forEach((w, i) => {
    lint(w);
    const file = path.join(dir, `WF-0${i + 1}.mmd`);
    fs.writeFileSync(file, mermaidOf(w), 'utf8');
    console.log('wrote', file);
  });
}

if (require.main === module) {
  const i = process.argv.indexOf('--mermaid');
  if (i > 0) writeMermaid(process.argv[i + 1]);
  else run(process.argv[2] ?? path.join(__dirname, 'out'));
}
module.exports = { run, WORKFLOWS, writeMermaid, mermaidOf };
