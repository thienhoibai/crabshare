'use strict';
// Activity Diagrams có swimlane cho 5 Demo Workflow (Report 4, bổ sung Review 2). Mức nghiệp vụ: không API, không hàm.
const path = require('path');
const { DrawioFile, S } = require('./lib');

const META = 'Version 2.0 · 22/10/2026 · UML 2.5 activity with partitions · business level · one diagram per demo workflow';

// node: [id, lane, row, kind, label]; kind ∈ start end flowEnd action sys decision merge fork join object time note
// edge: [from, to, label?, points?]
const WORKFLOWS = [
  {
    page: 'WF-01 Open batch for funding', fig: 'Figure 4.35', title: 'WF-01 Open a batch for funding (Operator → Platform Administrator)',
    lanes: ['Operator (Owner)', 'CrabShare System', 'Platform Administrator'],
    nodes: [
      ['s', 0, 0, 'start'],
      ['a1', 0, 1, 'action', 'Register operator profile (legal name, tax code, registration no, farm address) and submit'],
      ['b1', 2, 2, 'action', 'Review operator dossier'],
      ['d1', 2, 3, 'decision', 'decision'],
      ['b2', 1, 4, 'sys', 'Record rejection with reason and notify the operator'],
      ['e1', 1, 5, 'flowEnd'],
      ['b3', 1, 3, 'sys', 'Record approval with box capacity; grant Approved status'],
      ['a2', 0, 4, 'action', 'Number the boxes (within approved capacity)'],
      ['a3', 0, 5, 'action', 'Create batch: crab type, seed quantity, cycle, capital range, offtake price per grade'],
      ['a4', 0, 6, 'action', 'Author Standard Cost: line items, mortality reserve, depreciation, tranche plan'],
      ['a5', 0, 7, 'action', 'Submit batch for approval'],
      ['c1', 1, 8, 'sys', 'Validate dossier (cost complete, reserve present, schedule, offtake price)'],
      ['d2', 1, 9, 'decision', 'valid?'],
      ['m1', 0, 9, 'merge'],
      ['o1', 1, 10, 'object', 'Batch [PendingApproval]'],
      ['b4', 2, 11, 'action', 'Review batch dossier and Standard Cost'],
      ['d3', 2, 12, 'decision', 'decision'],
      ['c2', 1, 13, 'sys', 'Return batch to Draft with reason'],
      ['c3', 1, 14, 'sys', 'Mark batch Rejected and notify'],
      ['e2', 1, 15, 'flowEnd'],
      ['c4', 1, 16, 'sys', 'Lock Standard Cost, apply fee tier, open dedicated batch account, plan tranches'],
      ['o2', 1, 17, 'object', 'Batch [Funding] — offering visible to investors'],
      ['e3', 1, 18, 'end'],
    ],
    edges: [
      ['s', 'a1'], ['a1', 'b1'], ['b1', 'd1'], ['d1', 'b2', '[reject]'], ['b2', 'e1'], ['d1', 'b3', '[approve]'], ['b3', 'a2'], ['a2', 'a3'], ['a3', 'm1'], ['m1', 'a4'], ['a4', 'a5'], ['a5', 'c1'], ['c1', 'd2'],
      ['d2', 'm1', '[invalid: show errors]'], ['d2', 'o1', '[valid]'], ['o1', 'b4'], ['b4', 'd3'],
      ['d3', 'c2', '[request revision]'], ['c2', 'm1', ''], ['d3', 'c3', '[reject]'], ['c3', 'e2'], ['d3', 'c4', '[approve: funding window set]'], ['c4', 'o2'], ['o2', 'e3'],
    ],
    notes: 'Traceability: UC04, UC05, UC44, UC07, UC08. Exception branch demoed at Committee 1.1: admin returns the batch for revision. States touched: operator Draft → Submitted → Approved; batch Draft → PendingApproval → Draft/Rejected/Funding; standard_cost_version Draft → Submitted → Locked.',
  },
  {
    page: 'WF-02 Contribute and sign', fig: 'Figure 4.36', title: 'WF-02 Contribute capital and sign the contract (Investor, Payment Service Provider, Operator)',
    lanes: ['Investor', 'CrabShare System', 'Payment Service Provider', 'Operator (Owner)'],
    nodes: [
      ['s', 0, 0, 'start'],
      ['a1', 0, 1, 'action', 'Complete eKYC (ID card + selfie, consent)'],
      ['c1', 1, 2, 'sys', 'Verify identity through the eKYC provider; store only the result'],
      ['d1', 1, 3, 'decision', 'verified?'],
      ['e0', 1, 4, 'flowEnd'],
      ['a2', 0, 4, 'action', 'Browse batch offering with published Standard Cost'],
      ['a3', 0, 5, 'action', 'Read and acknowledge the risk disclosure'],
      ['a4', 0, 6, 'action', 'Reserve a contribution amount'],
      ['c2', 1, 7, 'sys', 'Check limits (min, remaining cap), hold the reservation for 15 minutes, issue VietQR'],
      ['a5', 0, 8, 'action', 'Transfer the amount with the bank app (VietQR)'],
      ['p1', 2, 9, 'action', 'Credit the batch account and send the transaction notification'],
      ['c3', 1, 10, 'sys', 'Match transaction to reservation (idempotent per transaction id); confirm contribution'],
      ['t1', 1, 8, 'time', 'after 15 min unpaid'],
      ['c4', 1, 9, 'sys', 'Expire reservation and QR'],
      ['e1', 1, 11, 'flowEnd'],
      ['a6', 0, 11, 'action', 'Create the investment contract from the template'],
      ['c5', 1, 12, 'sys', 'Fill contract, render PDF, record draft hash'],
      ['b1', 3, 13, 'action', 'Sign the contract first (Operator Owner)'],
      ['a7', 0, 14, 'action', 'Sign the contract second (Investor)'],
      ['o1', 1, 15, 'object', 'InvestmentContract [FullySigned] — final hash stored'],
      ['t2', 1, 16, 'time', 'funding deadline or max capital reached'],
      ['d2', 1, 17, 'decision', 'confirmed capital ≥ minimum viable?'],
      ['c6', 1, 18, 'sys', 'Snapshot capital shares per investor; close capital'],
      ['e2', 1, 19, 'end'],
      ['c7', 1, 20, 'sys', 'Cancel batch; refund every confirmed contribution; void unsigned contracts'],
      ['p2', 2, 21, 'action', 'Execute refund instructions'],
      ['e3', 1, 22, 'end'],
    ],
    edges: [
      ['s', 'a1'], ['a1', 'c1'], ['c1', 'd1'], ['d1', 'e0', '[rejected: retry or admin exception]'], ['d1', 'a2', '[verified]'], ['a2', 'a3'], ['a3', 'a4'], ['a4', 'c2'], ['c2', 'a5'], ['a5', 'p1'], ['p1', 'c3'],
      ['c2', 't1', ''], ['t1', 'c4'], ['c4', 'e1'],
      ['c3', 'a6'], ['a6', 'c5'], ['c5', 'b1'], ['b1', 'a7'], ['a7', 'o1'], ['o1', 't2'], ['t2', 'd2'], ['d2', 'c6', '[yes]'], ['c6', 'e2'], ['d2', 'c7', '[no]'], ['c7', 'p2'], ['p2', 'e3'],
    ],
    notes: 'Traceability: UC02, UC09, UC10, UC11, UC12, UC14, funding close (TL-17). Exception branches: reservation timeout; under-subscribed batch refund. States: investor Unverified → Verified; contribution Reserved → Confirmed/Expired/Refunded; payment_request Pending → Paid/Expired; investment_contract Draft → OperatorSigned → FullySigned/Void; batch Funding → Cancelled.',
  },
  {
    page: 'WF-03 Produce, evidence, disburse', fig: 'Figure 4.37', title: 'WF-03 Production, evidence verification and milestone disbursement (Operator, Evidence Reviewer, Administrator)',
    lanes: ['Operator (Owner / Staff)', 'CrabShare System', 'Evidence Reviewer', 'Platform Administrator'],
    nodes: [
      ['s', 0, 0, 'start'],
      ['a1', 0, 1, 'action', 'Stock one crab per box [capital closed, contracts signed, count = seed quantity]'],
      ['c1', 1, 2, 'sys', 'Register crabs per box; batch InProduction'],
      ['a2', 0, 3, 'action', 'Record daily log (pH, temperature, salinity, feed) and box events (molt, mortality, restock, relocation)'],
      ['c2', 1, 4, 'sys', 'Check thresholds and mortality policy'],
      ['d1', 1, 5, 'decision', 'out of range?'],
      ['c3', 1, 6, 'sys', 'Raise alert with acknowledgement deadline'],
      ['a3', 0, 7, 'action', 'Acknowledge alert with response note'],
      ['t1', 1, 7, 'time', 'deadline passed'],
      ['c4', 1, 8, 'sys', 'Escalate alert'],
      ['b4', 3, 9, 'action', 'Monitor escalated alerts; resolve'],
      ['m1', 1, 9, 'merge'],
      ['c5', 1, 10, 'sys', 'Issue a random capture request (one box, 2-hour window)'],
      ['a4', 0, 11, 'action', 'Capture a live photo of the box in the app (server time, location, box number)'],
      ['c6', 1, 12, 'sys', 'Hash photo, check duplicates, run crab detection, compute risk score'],
      ['d2', 1, 13, 'decision', 'risk score?'],
      ['o1', 1, 14, 'object', 'Evidence [Accepted] → investor timeline'],
      ['a5', 0, 15, 'action', 'Submit explanation for flagged evidence'],
      ['r1', 2, 16, 'action', 'Review flagged evidence (never on own investments)'],
      ['d3', 2, 17, 'decision', 'verdict'],
      ['o2', 1, 18, 'object', 'Evidence [Rejected]'],
      ['m2', 1, 19, 'merge'],
      ['a6', 0, 20, 'action', 'Request milestone tranche N'],
      ['c7', 1, 21, 'sys', 'Check gate: previous tranche released, planned date reached, evidence accepted, nothing flagged'],
      ['d4', 1, 22, 'decision', 'eligible?'],
      ['e1', 1, 23, 'flowEnd'],
      ['b1', 3, 23, 'action', 'Review disbursement request'],
      ['d5', 3, 24, 'decision', 'decision'],
      ['b2', 3, 25, 'action', 'Ask for explanation (72 h) or block the tranche'],
      ['c8', 1, 25, 'sys', 'Create disbursement instruction; release within locked capital'],
      ['b3', 3, 26, 'action', 'Send the instruction to the payment intermediary'],
      ['e2', 1, 27, 'end'],
    ],
    edges: [
      ['s', 'a1'], ['a1', 'c1'], ['c1', 'a2'], ['a2', 'c2'], ['c2', 'd1'], ['d1', 'c3', '[yes]'], ['d1', 'm1', '[no]'], ['c3', 'a3'], ['a3', 'm1'], ['c3', 't1', ''], ['t1', 'c4'], ['c4', 'b4'], ['b4', 'm1'],
      ['m1', 'c5'], ['c5', 'a4'], ['a4', 'c6'], ['c6', 'd2'], ['d2', 'o1', '[< 20 Accepted]'], ['d2', 'r1', '[20–69 Watch]'], ['d2', 'a5', '[≥ 70 Flagged]'], ['a5', 'r1'], ['r1', 'd3'],
      ['d3', 'o1', '[pass]'], ['d3', 'o2', '[fail]'], ['d3', 'a5', '[need more evidence]'], ['o1', 'm2'], ['o2', 'm2'],
      ['m2', 'a6'], ['a6', 'c7'], ['c7', 'd4'], ['d4', 'e1', '[not eligible: reason shown]'], ['d4', 'b1', '[eligible]'], ['b1', 'd5'], ['d5', 'b2', '[explain / block]'], ['b2', 'e1', ''], ['d5', 'c8', '[release]'], ['c8', 'b3'], ['b3', 'e2'],
    ],
    notes: 'Traceability: UC17, UC45, UC47, UC48, UC19, UC20, UC18 (and UC44 stocking). AI component: crab detection contributes to the risk score only; a human reviewer decides (Register v1.3 §3.2b). Exception branches: flagged evidence with explanation loop; escalated alert; tranche not eligible / blocked. States: evidence review_status; capture_request; alert; disbursement_tranche; crab_item Growing/Dead.',
  },
  {
    page: 'WF-04 Harvest, sell, deliver', fig: 'Figure 4.38', title: 'WF-04 Harvest, tag, sell and deliver (Operator, Customer, Offtake Investor, Administrator)',
    lanes: ['Operator', 'CrabShare System', 'Customer', 'Investor (Offtake)', 'Platform Administrator'],
    nodes: [
      ['s', 0, 0, 'start'],
      ['a1', 0, 1, 'action', 'Start harvest session'],
      ['a2', 0, 2, 'action', 'Weigh and grade each crab; print its tag'],
      ['a3', 0, 3, 'action', 'Activate tag with one confirmation photo of the crab'],
      ['a4', 0, 4, 'action', 'Complete harvest'],
      ['c1', 1, 5, 'sys', 'Sync listing stock per grade; price anomaly check on publish'],
      ['a5', 0, 6, 'action', 'Publish product listings'],
      ['f1', 1, 7, 'fork'],
      ['u1', 2, 8, 'action', 'Browse catalogue, add to cart, check out'],
      ['c2', 1, 9, 'sys', 'Reserve stock atomically (15 min), one order per batch, VietQR per order'],
      ['u2', 2, 10, 'action', 'Pay by VietQR'],
      ['c3', 1, 11, 'sys', 'Confirm payment (webhook); order Paid'],
      ['t1', 1, 10, 'time', 'after 15 min unpaid'],
      ['c4', 1, 12, 'sys', 'Cancel order, release stock'],
      ['e1', 1, 13, 'flowEnd'],
      ['i1', 3, 8, 'action', 'Claim committed volume inside the 48-hour priority window'],
      ['c5', 1, 8, 'sys', 'Create offtake order at the fixed price; balance QR'],
      ['i2', 3, 10, 'action', 'Pay the balance'],
      ['j1', 1, 14, 'join'],
      ['a6', 0, 15, 'action', 'Pack the order by scanning each crab tag'],
      ['a7', 0, 16, 'action', 'Hand to carrier (ship) and mark delivered'],
      ['u3', 2, 17, 'action', 'Confirm receipt; scan the tag to trace the crab'],
      ['d1', 1, 18, 'decision', 'complaint within 72 h?'],
      ['u4', 2, 19, 'action', 'Submit complaint (late, wrong grade, damaged, not received)'],
      ['a8', 0, 20, 'action', 'Respond to the complaint with evidence'],
      ['b1', 4, 21, 'action', 'Resolve dispute: refund, compensation, replacement or reject'],
      ['e2', 1, 22, 'end'],
      ['t2', 1, 19, 'time', 'return window ends'],
      ['c6', 1, 20, 'sys', 'Complete order — revenue counts for settlement'],
      ['u5', 2, 21, 'action', 'Rate the purchase'],
      ['e3', 1, 23, 'end'],
    ],
    edges: [
      ['s', 'a1'], ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a4'], ['a4', 'c1'], ['c1', 'a5'], ['a5', 'f1'],
      ['f1', 'u1', 'retail'], ['u1', 'c2'], ['c2', 'u2'], ['u2', 'c3'], ['c2', 't1', ''], ['t1', 'c4'], ['c4', 'e1'], ['c3', 'j1'],
      ['f1', 'i1', 'offtake (CS-75)'], ['i1', 'c5'], ['c5', 'i2'], ['i2', 'c3'],
      ['j1', 'a6'], ['a6', 'a7'], ['a7', 'u3'], ['u3', 'd1'], ['d1', 'u4', '[yes]'], ['u4', 'a8'], ['a8', 'b1'], ['b1', 'e2'],
      ['d1', 't2', '[no]'], ['t2', 'c6'], ['c6', 'u5'], ['u5', 'e3'],
    ],
    notes: 'Traceability: UC22, UC46, UC24, UC25, UC26, UC12, UC23 (PR #72), UC29, UC30, UC33, UC31, UC32, UC34. Exception branches: payment timeout; complaint and dispute. States: crab_item Growing → InStock → Packed → Sold; crab_tag Printed → Active; product_listing; sales_order PendingPayment → Paid → Packed → Shipping → Delivered → Completed/Returned; complaint.',
  },
  {
    page: 'WF-05 Settle and close', fig: 'Figure 4.39', title: 'WF-05 Settlement, feedback, payout and batch close (Administrator, Investor, Operator)',
    lanes: ['Platform Administrator', 'CrabShare System', 'Investor', 'Operator'],
    nodes: [
      ['s', 0, 0, 'start'],
      ['b1', 0, 1, 'action', 'Calculate settlement for the batch [Harvesting, sales done]'],
      ['c1', 1, 2, 'sys', 'Actual revenue = completed orders + forfeited deposits − refunds; Revenue Pool = revenue − locked Standard Cost'],
      ['d1', 1, 3, 'decision', 'Pool > 0?'],
      ['c2', 1, 4, 'sys', 'Operator remuneration (%); split the rest pro rata by capital, largest-remainder rounding; tax shown per line'],
      ['c3', 1, 5, 'sys', 'No remuneration; allocate loss pro rata, each capped at the investor\'s capital; excess loss stays with the Operator'],
      ['m1', 1, 6, 'merge'],
      ['o1', 1, 7, 'object', 'Settlement [Draft] with one line per investor'],
      ['b2', 0, 8, 'action', 'Review draft statement'],
      ['d2', 0, 9, 'decision', 'recalculate?'],
      ['b3', 0, 10, 'action', 'Publish proposal with a 7–14 day feedback window'],
      ['i1', 2, 11, 'action', 'Review own statement line (capital, share, tax, net payout)'],
      ['p1', 3, 11, 'action', 'Review full statement (all lines, remuneration)'],
      ['d3', 2, 12, 'decision', 'feedback?'],
      ['i2', 2, 13, 'action', 'Submit feedback with grounds'],
      ['b4', 0, 14, 'action', 'Answer feedback (answered / unresolved)'],
      ['m2', 1, 15, 'merge'],
      ['t1', 1, 16, 'time', 'feedback window ends'],
      ['b5', 0, 17, 'action', 'Approve settlement [no open feedback]'],
      ['c4', 1, 18, 'sys', 'Lock statement (immutable); create instructions: tax withheld, operator remuneration + depreciation, investor payouts'],
      ['b6', 0, 19, 'action', 'Send payout instructions'],
      ['c5', 1, 20, 'sys', 'Send through the payment intermediary (idempotent reference per instruction)'],
      ['d4', 1, 21, 'decision', 'all investor payouts succeeded?'],
      ['b7', 0, 22, 'action', 'Resend failed instruction'],
      ['c6', 1, 23, 'sys', 'Batch Closed; settlement Closed; audit anchors (capital close, approval, close) on the statement'],
      ['e1', 1, 24, 'end'],
    ],
    edges: [
      ['s', 'b1'], ['b1', 'c1'], ['c1', 'd1'], ['d1', 'c2', '[yes]'], ['d1', 'c3', '[no: loss]'], ['c2', 'm1'], ['c3', 'm1'], ['m1', 'o1'], ['o1', 'b2'], ['b2', 'd2'], ['d2', 'b1', '[yes]'], ['d2', 'b3', '[no]'],
      ['b3', 'i1'], ['b3', 'p1'], ['i1', 'd3'], ['d3', 'i2', '[yes]'], ['i2', 'b4'], ['b4', 'm2'], ['d3', 'm2', '[no]'], ['p1', 'm2'], ['m2', 't1'], ['t1', 'b5'], ['b5', 'c4'], ['c4', 'b6'], ['b6', 'c5'], ['c5', 'd4'],
      ['d4', 'b7', '[no]'], ['b7', 'c5'], ['d4', 'c6', '[yes]'], ['c6', 'e1'],
    ],
    notes: 'Traceability: UC38, UC37, UC35, UC36, UC39, UC40 (and UC43 audit anchors). Exception branches demoed: negative Revenue Pool (loss capped at capital, Register v1.3 §3.2b); unresolved feedback. States: settlement Draft → Proposed ⇄ Disputed → Approved → PaidOut → Closed; payment_instruction Created → Sent → Succeeded/Failed; batch Settlement → Closed.',
  },
];

function drawWorkflow(f, w) {
  const d = f.page(w.page);
  d.caption(w.fig, `Activity Diagram – ${w.title}`, META);
  const laneW = 260, x0 = 30, y0 = 70, rowH = 82;
  const maxRow = Math.max(...w.nodes.map(n => n[2]));
  const laneH = 60 + (maxRow + 1) * rowH;
  w.lanes.forEach((name, i) => d.vertex(name, S.lane, x0 + i * laneW, y0, laneW, laneH, { key: 'lane' + i }));
  const size = { action: [200, 54], sys: [200, 54], decision: [170, 56], merge: [28, 28], fork: [200, 8], join: [200, 8], start: [24, 24], end: [24, 24], flowEnd: [24, 24], object: [200, 40], time: [36, 40] };
  const style = { action: S.action, sys: S.sysAction, decision: S.decision, merge: S.merge, fork: S.forkJoin, join: S.forkJoin, start: S.start, end: S.end, flowEnd: `ellipse;html=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=2;fontSize=14;fontStyle=1;`, object: S.objectNode, time: S.timeEvent };
  for (const [id, lane, row, kind, label] of w.nodes) {
    const [ww, hh] = size[kind];
    const x = x0 + lane * laneW + (laneW - ww) / 2, y = y0 + 50 + row * rowH + (54 - hh) / 2;
    d.vertex(kind === 'flowEnd' ? '✕' : kind === 'decision' && !label ? '' : (label ?? ''), style[kind] + (kind === 'decision' ? 'verticalLabelPosition=bottom;verticalAlign=top;labelPosition=center;align=center;fontSize=10;' : '') + (kind === 'time' ? '' : ''), x, y, ww, hh, { key: id, raw: true });
  }
  for (const [a, b, label, pts] of w.edges) d.edge(a, b, S.flow, { label: label ?? '', points: pts, raw: true });
  d.vertex(`<b>Notes</b><br>${w.notes}`, S.note, x0, y0 + laneH + 20, w.lanes.length * laneW, 70, { raw: true });
  d.vertex('<b>Legend</b><br>Green = human action · Blue = system action · Diamond = decision with guards (incl. [else]) · Bar = fork/join · Orange box = object node with state · Hourglass = time event · ⊙ = activity final · ✕ = flow final', S.legend, x0 + w.lanes.length * laneW + 20, y0, 260, 130, { raw: true });
}

function run(out) {
  const f = new DrawioFile();
  for (const w of WORKFLOWS) drawWorkflow(f, w);
  f.write(path.join(out, 'CrabShare_Activity_Diagrams.drawio'));
  console.log('Activity diagrams done:', WORKFLOWS.length);
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run, WORKFLOWS };
