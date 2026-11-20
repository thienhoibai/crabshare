'use strict';
// State Machine Diagrams (Report 4 – SDD, bổ sung theo Review 2): mỗi thực thể chính có cột status + CHECK một máy trạng thái.
// v3.0 vẽ theo Phiếu đăng ký v1.4. Trạng thái = đúng giá trị CHECK trong V001–V017 (develop @ 420a379).
// Ký hiệu chung (brief §9.4): «planned» = nét đứt xám #64748b kèm nhãn «planned»; giá trị CHECK cho phép nhưng code không ghi = nét đứt cam
// kèm "(not written by code)"; phần v1.4 đã bỏ thì không vẽ, chỉ ghi ở Notes hoặc trang Index.
// Nhãn chuyển: trigger [guard] / effect · mã UC (brief §7.1, §9.1). Chuyển ra từ initial chỉ có effect (UML 2.5.1), điều kiện tạo ghi ở Notes.
// Trong nhãn, đoạn {p}…{/p} là phần «planned» nằm giữa nhãn đã có (vẽ chữ xám); trường p là phần «planned» thêm ở cuối nhãn.
// Đầu ra: <out>/CrabShare_State_Machines.drawio (Index 2 phần + 23 máy) và <out>/Mermaid/state/<Entity>.mmd (stateDiagram-v2, mỗi máy một file).
//
// Nhật ký sửa
// - 22/10/2026 v2.0: 27 máy theo Phiếu v1.3 và code develop (V001–V017).
// - 04/11/2026 v3.0: theo Phiếu v1.4. Bỏ 5 máy (product_listing, stock_reservation, offtake_commitment ×2, crab_tag) – chỉ liệt kê ở Index;
//   thêm sales_order BulkPreOrder và đơn có hoá đơn («planned»); sửa batch, contribution, settlement, evidence, crab_item, harvest,
//   physical_slot, alert, payment_request theo v1.4; sửa cho khớp code (payment_instruction không ghi Sent, batch_account tạo thẳng Open…).
// - 05/11/2026 sửa đợt 1 (báo cáo duyệt R1/R2): ký hiệu G-02, chữ ≥ 11 px, mỗi vùng một initial, initial chỉ có effect, bỏ Legacy (NULL),
//   guard code mà v1.4 đã bỏ chuyển vào Notes, mã QR khi lập phiếu giao, UploadOfflineAsync, Index có Harvesting, nhãn Mermaid rút gọn.
// - 05/11/2026 sửa đợt 2 (brief §9, §10, quyết định D1–D8, đã được trưởng nhóm xác nhận):
//   · D1 (4.8): mở Lô khi [vốn ≥ min_viable_capital AND tỷ lệ đặt trước ≥ tối thiểu «planned»]; nhánh huỷ hoàn cả khoản góp lẫn cọc khách;
//     chỉ các hộp được cấp vốn mới vào nuôi, quyết toán trừ Standard Cost của số hộp đó.
//   · D2 (4.9): thêm khung UML "stm RowAllocation «planned»" (Held → Allocated → Released) trên cùng trang, là máy riêng đi kèm khoản góp
//     (không phải trạng thái của Contribution, nên không bị coi là không tới được); tiền góp = Σ(số hộp × chi phí mỗi hộp).
//   · D3 (4.17), khớp Sequence 4.38/4.57/4.58: (a) huỷ sau khi cọc lúc Lô còn Funding → Cancelled giữ cọc, Lô mở → Forfeited;
//     huỷ khi đã Confirmed → Forfeited; (b) Lô không mở → Refunded (cả đơn đã huỷ); (c) từ chối nhận / không trả phần còn lại → Forfeited,
//     cua về kho bán lại (ForfeitResale); (d) huỷ khi PendingPayment → Cancelled, không mất gì. Giá trị Paid: removed in v1.4 (Index).
//   · D4, D6 (4.14): định nghĩa tỷ lệ sống; Standard Cost dùng không hết thuộc người nuôi. D5 (4.17, 4.11): tiền còn lại theo weighedKg;
//     v1.4 chuyển Shipping → Delivered khi trả phần còn lại.
//   · D8 (4.18), khớp Sequence 4.59/4.60: InvoicedSale | FinalOrder, saleReason LowGrade | ForfeitResale; ghi đơn = phát hành Invoice,
//     cua Sold; trả tiền (OrderPayment, ND-26) → Completed. RevenueLine {DeliveredOrder, InvoicedSale, ForfeitedDeposit, FinalOrder}.
//     File Mermaid đổi tên InvoicedOrder.mmd → InvoicedSale.mmd. CrabItem 4.23 thêm InStock → Sold «planned».
//   · §9.1 UC54 Forfeit Deposit; §9.6 PreOrderHold, PreOrderQuota, Batch.SalesWindowDays.
//   · Bổ sung của nhánh chính: cảnh báo WaterQuality, ngưỡng nước (ProductionThresholdVersion) và số đo pH, nhiệt độ, độ mặn là
//     "removed in v1.4 (still in code)": bỏ khỏi nguồn và Notes của Alert 4.30, ghi ở Index; LowStock cũng vậy.
//   · §9.5 / §10 cỡ in: chữ 12 px (tên trạng thái 14 px); bộ tự kiểm ước lượng cỡ chữ khi thu vừa A4 ngang (như fontfit.js) và báo trang
//     dưới 5 pt; trang Index tách 2 phần "Index (1 of 2)", "(2 of 2)", chú thích "Figure 4.8–4.30 (1/2)", giữ số hình.
const fs = require('fs');
const path = require('path');
const { DrawioFile, S, FONT, escHtml } = require('./lib');

const VERSION = 'v3.2 · 05/11/2026 · Register v1.4';
// Dòng Notes cho trang áp dụng các quyết định thiết kế ngày 05/11/2026 (đã được trưởng nhóm xác nhận)
const PENDING = 'Design decisions of 05/11/2026 applied here were confirmed by the lead.';
const CODE = 'develop @ 420a379, V001–V017';
const META = `${VERSION} · UML 2.5.1 · states = CHECK values + «planned» · label: trigger [guard] / effect · UC`;
const PLAN = '#64748b';      // «planned»: nét đứt xám
const NOTW = '#9a3412';      // giá trị CHECK không được code ghi: nét đứt cam
const NW_TAG = 'not written by code';
const FS = { label: 12, small: 12, name: 14, title: 16 };
const A4 = { long: 9.7 * 96, short: 6.3 * 96 };   // vùng in A4 ngang (px @96 dpi), cùng cách tính với review/tools/fontfit.js

// Trạng thái: {id, x, y, w?, h?, label?, final?, planned?, reserved?, rtag?, derived?, act?: [...], composite?, separate?, sub?, parent?, kind?: 'choice'}
//   final = trạng thái kết thúc (có cạnh tới [*]); planned = giá trị/trạng thái mới theo v1.4; reserved = có trong CHECK nhưng code không ghi
//   (rtag thay chữ "not written by code" khi cần nói rõ hơn); derived = không phải giá trị status của cột này (composite gom nhóm, trạng thái
//   con, vùng của thực thể khác); separate = composite là một máy riêng đặt cùng trang (vùng RowAllocation trong 4.9).
// Chuyển: {f, t, l, p?, uc?, planned?, reserved?, rtag?, pre?, ppre?, mm?, pts?, s?, e?, loop?, wrap?, side?, exit?, entry?, vx?, hy?}
//   f/t = '[*]' là giả trạng thái đầu/cuối (s/e = góc trái trên của chấm tròn). Initial chỉ có effect: l bắt đầu bằng "/ ";
//   pre/ppre = điều kiện tạo (code / «planned») → sinh dòng Notes. p = phần guard/effect «planned» thêm ở cuối nhãn (chữ xám);
//   {p}…{/p} trong l = đoạn «planned» nằm giữa nhãn. mm = nhãn ngắn cho Mermaid.
//   exit/entry = điểm nối cố định [rx, ry]; vx = đường dọc tại x; hy = đường ngang tại y.
const MACHINES = [
  // =============================== Thiện + Viên: Batch ===============================
  {
    key: 'Batch', decisions: true, page: 'batch.status', fig: 'Figure 4.8', title: 'batch.status (Batch)', change: 'modified + «planned» (Register v1.4)',
    owner: 'Batches, Production, Harvest (Viên) · Funding, Settlement (Thiện)',
    source: 'BatchService.CreateAsync/SubmitAsync · BatchReviewService.ApproveAsync/RejectAsync/RequestRevisionAsync · FundingCloseJob → FundingCloseService.CloseBatchAsync · StockingService.StockAsync · HarvestService.StartAsync · SettlementService.CalculateAsync · SettlementClosing.CloseIfPaidAsync',
    check: ['Draft', 'PendingApproval', 'Rejected', 'Funding', 'Cancelled', 'Stocked', 'InProduction', 'Harvesting', 'Settlement', 'Closed'],
    states: [
      { id: 'Draft', x: 110, y: 220 },
      { id: 'PendingApproval', x: 400, y: 220 },
      { id: 'Rejected', x: 400, y: 470, final: true },
      { id: 'Funding', x: 690, y: 205, w: 300, act: ['do / reservations (UC10)', '«planned» do / bulk pre-orders (UC27)'] },
      { id: 'fundingClose', kind: 'choice', x: 863, y: 400 },
      { id: 'Cancelled', x: 790, y: 530, final: true },
      { id: 'Stocked', x: 1090, y: 220, act: ['transient'] },
      { id: 'InProduction', x: 1380, y: 220 },
      { id: 'Harvesting', composite: true, x: 560, y: 660, w: 1040, h: 210, sub: 'DB value · contains «planned» business phases derived from the order states (not status values)' },
      { id: 'Delivering', parent: 'Harvesting', planned: true, derived: true, phase: true, x: 640, y: 730, w: 320, act: ['do / harvest per box (UC22)', 'do / deliver, weigh, pay balance (UC29, UC30)', 'do / invoiced sales (UC50)'] },
      { id: 'FinalOrder', parent: 'Harvesting', planned: true, derived: true, phase: true, x: 1250, y: 735, w: 300, act: ['entry / final-order reminder (job)', 'do / final order ≥ floor price (UC51)'] },
      { id: 'Settlement', x: 240, y: 748 },
      { id: 'Closed', x: 20, y: 748, final: true },
    ],
    trans: [
      { f: '[*]', t: 'Draft', s: [44, 237], l: '/ created by create batch (Owner)', uc: 'UC07', pre: 'the Owner\'s operator is Approved', mm: '/ create batch', wrap: 16 },
      { f: 'Draft', t: 'PendingApproval', l: 'submit (Owner) [Standard Cost Draft with MortalityReserve, schedule complete] / cost version Submitted', p: '[price per kg (UC49 hint), floor price, survival threshold and tiers, delivery radius set]', uc: 'UC07', mm: 'submit [cost complete] / cost Submitted', wrap: 28 },
      { f: 'PendingApproval', t: 'Draft', l: 'request revision (Admin) [reason] / next save creates a new cost version', uc: 'UC08', pts: [[460, 160], [190, 160]], mm: 'request revision [reason]', wrap: 50 },
      { f: 'PendingApproval', t: 'Rejected', l: 'reject (Admin) [reason] / rejection_reason', uc: 'UC08', mm: 'reject [reason]', wrap: 18 },
      { f: 'PendingApproval', t: 'Funding', l: 'approve (Admin) [operator Approved, one Submitted cost version, fee tier matches] / lock Standard Cost, batch account Open, tranches Planned, funding window', p: 'also approve floor price and remuneration tiers; lock price per kg and floor price; snapshot the minimum pre-order ratio (UC41)', uc: 'UC08', mm: 'approve [one Submitted cost] / lock Standard Cost, open funding', wrap: 28 },
      { f: 'Funding', t: 'fundingClose', l: 'funding close (job) at deadline or max capital', uc: 'UC10', vx: 880, mm: 'funding close (job)', wrap: 20, side: 'left' },
      { f: 'fundingClose', t: 'Funding', l: '[confirmed ≥ min_viable_capital AND {p}pre-order ratio ≥ minimum «planned»{/p}] / capital_share snapshot, capital_closed_at', exit: [1, 0.5], pts: [[960, 417]], entry: [0.9, 1], mm: '[capital ≥ min viable AND pre-order ratio ≥ minimum «planned»] / capital_share', wrap: 24, side: 'right' },
      { f: 'fundingClose', t: 'Cancelled', l: '[else] / refund every Confirmed contribution {p}and every customer deposit «planned»{/p}, void unsigned contracts', mm: '[else] / refund contributions and deposits', wrap: 26 },
      { f: 'Funding', t: 'Stocked', l: 'record stocking (Owner) [capital closed, every contract FullySigned, boxes = seed_quantity, all Available] / boxes Occupied, crabs Growing', p: 'only the funded boxes are stocked', uc: 'UC17', mm: 'record stocking [capital closed, contracts signed] / boxes Occupied', wrap: 48, side: 'above' },
      { f: 'Stocked', t: 'InProduction', l: '/ same transaction', uc: 'UC17', mm: '/ same transaction', wrap: 12 },
      { f: 'InProduction', t: 'Harvesting', l: 'start harvest (Owner) [no Open harvest session] / harvest Open, harvest_started_at', uc: 'UC22', mm: 'start harvest / harvest Open', wrap: 24, vx: 1470 },
      { f: '[*]', t: 'Delivering', s: [584, 763], planned: true, l: '' },
      { f: 'Delivering', t: 'FinalOrder', planned: true, l: 'after(SalesWindowDays) [harvest Completed] / final-order reminder (job)', uc: 'UC51', mm: 'after(SalesWindowDays) / final-order reminder', wrap: 24 },
      { f: 'Harvesting', t: 'Settlement', l: 'run settlement calculation (Admin triggers, engine computes) [capital shares, Locked cost] / settlement Draft', p: '[final order recorded ∧ every order past its return window]', uc: 'UC38', mm: 'run settlement calculation / settlement Draft', wrap: 20 },
      { f: 'Settlement', t: 'Closed', l: 'last investor payout Succeeded / settlement PaidOut → Closed, closed_at', uc: 'UC39, UC40', mm: 'last payout Succeeded / closed_at', wrap: 20 },
      { f: 'Rejected', t: '[*]' }, { f: 'Cancelled', t: '[*]', e: [1030, 547] }, { f: 'Closed', t: '[*]' },
    ],
    notes: [
      'Rules live in the services (422 batch.invalid_transition); the database only checks the value list (ck_batch_status) — the architecture notes in the repository describe a DB trigger that does not exist.',
      'Funding closes when the minimum viable capital is reached (as in code) and, «planned», the minimum pre-order ratio; Funding keeps its value (capital_closed_at set). «planned» if capital closes between the minimum and the target, only the funded boxes go into production, capital that cannot be converted into boxes is refunded, and settlement deducts the locked Standard Cost of the funded boxes only.',
      'Today in code, submit and approve also need an offtake price per grade and pre-orders open only while InProduction from a Published listing; replaced in v1.4 by the price per kg, the floor price and bulk pre-orders while Funding. Stocking today needs boxes = seed_quantity.',
      'Settlement: the Admin triggers the calculation and the engine (SettlementCalculator) computes it. Delivering and FinalOrder are «planned» business phases inside Harvesting, derived from the order states; they are not status values and need no new CHECK value. Not implemented: early liquidation, Rejected → Draft resubmission.',
    ],
  },
  // =============================== Thiện: Funding, Contracts, Payments, Settlement ===============================
  {
    key: 'Contribution', decisions: true, page: 'contribution.status', fig: 'Figure 4.9', title: 'contribution.status (Contribution / reservation) + RowAllocation «planned»', change: 'modified + «planned» (box rows, RowAllocation)',
    owner: 'Funding (Thiện)',
    source: 'FundingController.Reserve/Cancel → FundingService.ReserveAsync/CancelAsync · ContributionPaymentHandler.OnPaidAsync · FundingCloseJob → FundingCloseService · PayoutSendService.SendAsync',
    check: ['Reserved', 'Confirmed', 'Expired', 'Refunded'],
    states: [
      { id: 'Reserved', x: 250, y: 260 }, { id: 'Confirmed', x: 690, y: 260 },
      { id: 'Expired', x: 250, y: 560, final: true }, { id: 'Refunded', x: 690, y: 560, final: true },
      { id: 'RowAllocation', composite: true, separate: true, planned: true, derived: true, x: 950, y: 150, w: 660, h: 520, sub: 'one RowAllocation per picked box row, following its contribution' },
      { id: 'Held', parent: 'RowAllocation', planned: true, derived: true, x: 1020, y: 270, w: 150 },
      { id: 'Allocated', parent: 'RowAllocation', planned: true, derived: true, x: 1380, y: 270, w: 150, final: true },
      { id: 'Released', parent: 'RowAllocation', planned: true, derived: true, x: 1200, y: 510, w: 150, final: true },
    ],
    trans: [
      { f: '[*]', t: 'Reserved', s: [40, 277], l: '/ created by reserve (Investor): expires_at = min(+30 min, funding deadline)', p: 'hold the picked box rows (RowAllocation Held)', uc: 'UC10, UC11', pre: 'eKYC Verified, risk disclosure acknowledged, batch Funding and window open, min_contribution ≤ amount ≤ remaining capital, no other active hold in the batch', ppre: 'the picked box rows are free; amount = Σ (boxes in each row × Standard Cost per box); the minimum is one row\'s capital (the admin minimum contribution stays as a floor for a row\'s capital)', mm: '/ reserve', wrap: 18 },
      { f: 'Reserved', t: 'Confirmed', l: 'payment webhook [request Pending, amount matches, before expiry] / confirmed_at', p: 'rows Allocated', uc: 'UC12', mm: 'payment webhook [amount matches] / confirmed_at', wrap: 26 },
      { f: 'Reserved', t: 'Expired', l: 'after(expires_at) or funding close (job) / QR Expired, void unsigned contract', p: 'rows Released', uc: 'UC10', vx: 305, mm: 'after(expires_at) / QR Expired', wrap: 20, side: 'left' },
      { f: 'Reserved', t: 'Expired', l: 'cancel (Investor) [not paid] / QR Cancelled, void unsigned contract', p: 'rows Released', uc: 'UC10', vx: 375, mm: 'cancel [not paid]', wrap: 20, side: 'right' },
      { f: 'Confirmed', t: 'Refunded', l: 'Refund instruction Succeeded [batch Cancelled, amount = contribution] / refunded_at', p: 'also when the batch does not open for a low pre-order ratio; rows Released', uc: 'UC40', mm: 'refund Succeeded [batch Cancelled] / refunded_at', wrap: 24 },
      { f: 'Confirmed', t: '[*]', e: [768, 130], l: 'batch Closed (capital returned through the settlement line)', uc: 'UC39', mm: 'batch Closed', wrap: 20, side: 'right' },
      { f: 'Expired', t: '[*]' }, { f: 'Refunded', t: '[*]' },
      { f: '[*]', t: 'Held', s: [984, 287], planned: true, l: '' },
      { f: 'Held', t: 'Allocated', planned: true, l: 'contribution Confirmed / the row belongs to this investor', uc: 'UC12', mm: 'contribution Confirmed', wrap: 20 },
      { f: 'Held', t: 'Released', planned: true, l: 'contribution Expired (timeout or cancel) / row free again', uc: 'UC10', mm: 'contribution Expired', wrap: 18 },
      { f: 'Allocated', t: 'Released', planned: true, l: 'batch not opened (funding close job) / contribution refund created', uc: 'UC10', mm: 'batch not opened / refund created', wrap: 18 },
      { f: 'Allocated', t: '[*]', e: [1443, 410], planned: true, l: 'batch Closed', mm: 'batch Closed', wrap: 14 },
      { f: 'Released', t: '[*]', e: [1263, 615], planned: true },
    ],
    notes: [
      'Capital close snapshots Confirmed contributions into capital_share (trigger trg_capital_share_immutable); the row itself stays Confirmed. Investors pay in full once before the batch opens, no instalments (Register v1.4) — as on develop.',
      'A webhook arriving after Expired is booked as LatePayment with an automatic Refund instruction (TL-10). Cancel = expire now (the CHECK has no Cancelled value).',
      '«planned» RowAllocation (status Held, Allocated, Released): a BoxRow belongs to the batch (its boxes grouped by physical_slot.row_code); each picked row is Held during the 30-minute reservation, Allocated when the contribution is Confirmed (a confirmed row belongs to exactly one investor; at most one active allocation per row) and Released when the contribution expires or is refunded. No table yet.',
    ],
  },
  {
    key: 'InvestmentContract', dy: -80, page: 'investment_contract.status', fig: 'Figure 4.10', title: 'investment_contract.status (Contract)', change: 'kept (template content «planned»)',
    owner: 'Contracts (Thiện)',
    source: 'ContractsController.Create/Sign/OfflineUpload → ContractService.CreateForContributionAsync/SignAsync/UploadOfflineAsync · ContractVoiding.VoidUnsignedAsync',
    check: ['Draft', 'OperatorSigned', 'FullySigned', 'Void'],
    states: [
      { id: 'Draft', x: 330, y: 320 }, { id: 'OperatorSigned', x: 780, y: 320 },
      { id: 'FullySigned', x: 1230, y: 320, final: true }, { id: 'Void', x: 780, y: 630, final: true },
    ],
    trans: [
      { f: '[*]', t: 'Draft', s: [80, 337], l: '/ created by create contract (Investor): fill CT-2026-01, render PDF, draft_hash', p: 'the template carries the loss rule, floor price and remuneration tiers', uc: 'UC14', pre: 'own contribution Reserved (not expired) or Confirmed — contract and VietQR payment run in parallel — batch Funding, an active contract template', mm: '/ create contract', wrap: 26 },
      { f: 'Draft', t: 'OperatorSigned', l: 'sign (Operator Owner) [contribution still active] / signature #1 (Viettel, sandbox), new file hash', uc: 'UC14', mm: 'sign (Operator Owner) / signature 1', wrap: 28 },
      { f: 'OperatorSigned', t: 'FullySigned', l: 'sign (Investor) [Operator signed first, else 422 contract.wrong_signing_order] / signature #2, final_hash, fully_signed_at', uc: 'UC14', mm: 'sign (Investor) [Operator signed] / final_hash', wrap: 28 },
      { f: 'Draft', t: 'FullySigned', l: 'offline upload (Admin) [PDF, confirmedBothSigned; also from OperatorSigned] / signing_method OfflineUpload, final_hash', uc: 'UC15', pts: [[420, 195], [1320, 195]], mm: 'offline upload (Admin) [both signed] / final_hash', wrap: 64 },
      { f: 'Draft', t: 'Void', l: 'reservation expired or cancelled, or batch Cancelled / ContractVoiding', uc: 'UC10', mm: 'reservation expired or cancelled, batch Cancelled', wrap: 22 },
      { f: 'OperatorSigned', t: 'Void', l: 'same causes', uc: 'UC10', mm: 'same causes', wrap: 20 },
      { f: 'FullySigned', t: '[*]', e: [1480, 337] }, { f: 'Void', t: '[*]' },
    ],
    notes: [
      'Every version is stored as contracts/{no}/{sha256}.pdf and re-hashed on download (contract.file_tampered). Void and FullySigned are terminal (contract.void, contract.already_signed). The batch is stocked only when the capital is closed and every contract is FullySigned.',
      'Unchanged by Register v1.4 (sequential signing through Viettel, sandbox). «planned» the loss rule, floor price and remuneration tiers go into the contract template before funding opens (Register v1.4, section 4).',
    ],
  },
  {
    key: 'PaymentRequest', decisions: true, dy: -80, page: 'payment_request.status', fig: 'Figure 4.11', title: 'payment_request.status (VietQR collection)', change: 'modified (purposes)',
    owner: 'Payments (Thiện)',
    source: 'PaymentRequestService.CreateAsync · PaymentWebhookService.ProcessAsync · FundingCloseService · ReservationExpiryService · FundingService.CancelAsync · OrderCancellationService',
    check: ['Pending', 'Paid', 'Expired', 'Cancelled'],
    states: [
      { id: 'Pending', x: 420, y: 320 }, { id: 'Paid', x: 960, y: 320, final: true },
      { id: 'Expired', x: 420, y: 630, final: true }, { id: 'Cancelled', x: 960, y: 630, final: true },
    ],
    trans: [
      { f: '[*]', t: 'Pending', s: [90, 337], l: '/ created by a payment request: VietQR via the payment intermediary, reference code, expires_at', p: 'PreOrderBalance = weighedKg × price per kg − deposit, issued at delivery', uc: 'UC12', pre: 'purpose Contribution, PreOrderDeposit, PreOrderBalance or OrderPayment (OfftakeDeposit and OfftakePayment are removed in v1.4)', ppre: 'OrderPayment is reused by invoiced sales and the final order instead of retail checkout', mm: '/ create VietQR', wrap: 28 },
      { f: 'Pending', t: 'Paid', l: 'webhook [provider_txn_id new, amount matches, before expires_at] / transaction Matched, purpose handler', uc: 'UC12', mm: 'webhook [new txn, amount matches] / Matched', wrap: 30 },
      { f: 'Pending', t: 'Expired', l: 'after(expires_at) (funding close / reservation expiry jobs) or late webhook / late money → Refund instruction', uc: 'UC12', mm: 'after(expires_at) or late webhook / refund late money', wrap: 24 },
      { f: 'Pending', t: 'Cancelled', l: 'contribution or order cancelled, or batch Cancelled', p: 'a pending balance request is cancelled when the order is forfeited', uc: 'UC10, UC54, UC55', mm: 'contribution or order cancelled, batch Cancelled', wrap: 22 },
      { f: 'Paid', t: '[*]', e: [1230, 337] }, { f: 'Expired', t: '[*]' }, { f: 'Cancelled', t: '[*]' },
    ],
    notes: [
      'Idempotency: provider_txn_id is UNIQUE; a repeated webhook is acknowledged without a second booking (TL-10). An amount mismatch keeps the request Pending and books the transaction Unmatched for manual reconciliation (UC40).',
      'Purposes OfftakeDeposit and OfftakePayment are removed in v1.4 (still in code and in ck_payment_request_purpose), so they are not drawn; OrderPayment stays, reused by invoiced sales (Figure 4.18) instead of retail checkout. Gap: no job expires PreOrderBalance requests (due after 48 h); only a late webhook moves them to Expired.',
    ],
  },
  {
    key: 'PaymentInstruction', decisions: true, page: 'payment_instruction.status', fig: 'Figure 4.12', title: 'payment_instruction.status (refund, disbursement, payout)', change: 'corrected to code (Sent not written)',
    owner: 'Payments (Thiện)',
    source: 'RefundService.CreateRefundAsync · DisbursementService.ReleaseAsync · SettlementPayoutService.ApproveAsync/SendPayoutsAsync · AdminPaymentsController.Send → PayoutSendService.SendAsync',
    check: ['Created', 'Sent', 'Succeeded', 'Failed', 'Disputed'],
    states: [
      { id: 'Created', x: 260, y: 340 }, { id: 'Sent', x: 700, y: 140, reserved: true },
      { id: 'Succeeded', x: 1140, y: 340, final: true }, { id: 'Failed', x: 700, y: 570 },
      { id: 'Disputed', x: 1140, y: 660, reserved: true },
    ],
    trans: [
      { f: '[*]', t: 'Created', s: [60, 357], l: '/ created by a refund, a tranche release or a settlement approval', p: 'Refund of customer deposits when the batch does not open, and of a negative delivery balance', uc: 'UC18, UC39', pre: 'type Refund, Disbursement, Payout or TaxPayment; amount > 0', mm: '/ create instruction', wrap: 18 },
      { f: 'Created', t: 'Succeeded', l: 'send (Admin) [batch account Open, payee resolved] / gateway accepted: provider_transaction Out, sent_at, completed_at', uc: 'UC40', mm: 'send [account Open] / accepted', wrap: 38 },
      { f: 'Created', t: 'Failed', l: 'send (Admin) / gateway rejected, sent_at', uc: 'UC40', mm: 'send / rejected', wrap: 18 },
      { f: 'Failed', t: 'Succeeded', l: 'resend (Admin) / same reference CHI{id}', uc: 'UC40', mm: 'resend / accepted', wrap: 18 },
      { f: 'Failed', t: 'Failed', loop: 'bottom', l: 'resend (Admin) / rejected again', uc: 'UC40', mm: 'resend / rejected', wrap: 30 },
      { f: 'Created', t: 'Sent', reserved: true, l: 'send (Admin) [asynchronous provider] / sent_at, wait for the callback', mm: 'send [async provider]', wrap: 22 },
      { f: 'Sent', t: 'Succeeded', reserved: true, l: 'provider callback [done] / completed_at', mm: 'callback [done]', wrap: 16 },
      { f: 'Sent', t: 'Failed', reserved: true, l: 'provider callback [failed]', mm: 'callback [failed]', wrap: 14 },
      { f: 'Succeeded', t: 'Disputed', reserved: true, l: 'dispute notice (provider)', vx: 1195, mm: 'dispute notice', wrap: 14, side: 'left' },
      { f: 'Disputed', t: 'Succeeded', reserved: true, l: 'dispute closed (provider)', vx: 1265, mm: 'dispute closed', wrap: 14, side: 'right' },
      { f: 'Succeeded', t: '[*]', e: [1420, 357] },
    ],
    notes: [
      'The sandbox gateway answers synchronously: code goes Created → Succeeded or Failed and only sets sent_at. Sent and Disputed are allowed by the CHECK but never written (a known gap).',
      'On Succeeded: a Refund of a cancelled batch\'s contribution sets it Refunded; the last investor Payout closes the settlement and the batch (SettlementClosing.CloseIfPaidAsync); an order refund changes only the instruction.',
    ],
  },
  {
    key: 'DisbursementTranche', dy: -70, page: 'disbursement_tranche.status', fig: 'Figure 4.13', title: 'disbursement_tranche.status (milestone disbursement)', change: 'corrected to code',
    owner: 'Payments (Thiện) · created by Batches (Viên)',
    source: 'BatchReviewService.ApproveAsync (create) · DisbursementsController → DisbursementService.RequestAsync/ReleaseAsync/RequestExplanationAsync/BlockAsync · TrancheScheduleJob',
    check: ['Planned', 'Requested', 'NeedsExplanation', 'Released', 'Blocked'],
    states: [
      { id: 'Planned', x: 220, y: 340 }, { id: 'Requested', x: 680, y: 340 },
      { id: 'Released', x: 1160, y: 340, final: true }, { id: 'NeedsExplanation', x: 680, y: 680 },
      { id: 'Blocked', x: 1160, y: 680, final: true },
    ],
    trans: [
      { f: '[*]', t: 'Planned', s: [60, 357], l: '/ created on batch approval: one row per tranche plan', uc: 'UC08', mm: '/ batch approved', wrap: 14 },
      { f: 'Planned', t: 'Requested', l: 'request (Owner) [previous tranche Released, planned date reached; T1: capital closed and contracts signed; T≥2: stocked, Accepted/Watch evidence since the last tranche, none Flagged; T≥3: harvest date declared] / requested_at', uc: 'UC18', mm: 'request (Owner) [milestone gate passes] / requested_at', wrap: 38 },
      { f: 'Requested', t: 'Released', l: 'release (Admin) [gate re-checked, released total ≤ confirmed capital, operator payout account Active] / Disbursement instruction Created, released_at', uc: 'UC18', mm: 'release (Admin) [gate re-checked] / Disbursement instruction', wrap: 32 },
      { f: 'Requested', t: 'NeedsExplanation', l: 'need explanation (Admin) [reason] / explanation_deadline = now + 72 h', uc: 'UC18', vx: 735, mm: 'need explanation [reason] / deadline +72 h', wrap: 20, side: 'left' },
      { f: 'NeedsExplanation', t: 'Requested', l: 'request again (Owner) [gate passes] / deadline cleared', uc: 'UC18', vx: 805, mm: 'request again [gate passes]', wrap: 18, side: 'right' },
      { f: 'Requested', t: 'Blocked', l: 'block (Admin) [reason]', uc: 'UC18', mm: 'block [reason]', wrap: 18 },
      { f: 'NeedsExplanation', t: 'Blocked', l: 'block (Admin) [reason]', uc: 'UC18', mm: 'block [reason]', wrap: 30 },
      { f: 'Released', t: '[*]', e: [1420, 357] }, { f: 'Blocked', t: '[*]', e: [1420, 697] },
    ],
    notes: [
      'TrancheScheduleJob resolves planned_date from anchors (FundingReady, Stocked + offset_days) without changing status; AlertJob raises MilestoneDelay for an overdue Planned tranche.',
      'Release needs Requested: after an explanation the Owner requests again (no direct NeedsExplanation → Released). The 72 h deadline is informational — no job blocks automatically (gap). A Blocked tranche stops later tranches; unblocking has no API. Unchanged by Register v1.4.',
    ],
  },
  {
    key: 'Settlement', decisions: true, dy: -60, page: 'settlement.status', fig: 'Figure 4.14', title: 'settlement.status (Settlement)', change: 'modified + «planned» (revenue lines, remuneration tiers)',
    owner: 'Settlement (Thiện)',
    source: 'AdminSettlementsController.Calculate/Approve/SendPayouts → SettlementService.CalculateAsync · SettlementPayoutService · SettlementsController.Propose/Feedback/Answer → SettlementReviewService · SettlementClosing',
    check: ['Draft', 'Proposed', 'Disputed', 'Approved', 'PaidOut', 'Closed'],
    states: [
      { id: 'Draft', x: 230, y: 370 }, { id: 'Proposed', x: 640, y: 370 }, { id: 'Disputed', x: 640, y: 690 },
      { id: 'Approved', x: 1040, y: 370 }, { id: 'PaidOut', x: 1400, y: 370 }, { id: 'Closed', x: 1400, y: 690, final: true },
    ],
    trans: [
      { f: '[*]', t: 'Draft', s: [60, 387], l: '/ created by run settlement calculation (Admin triggers, SettlementCalculator computes): Pool = revenue − locked Standard Cost; remuneration = floor(Pool × operator %) if Pool > 0; largest-remainder lines; loss capped at capital', p: 'revenue = Σ RevenueLine {DeliveredOrder, InvoicedSale, ForfeitedDeposit, FinalOrder}; locked cost of the funded boxes only; % from the survival-rate tier (RemunerationTier)', uc: 'UC38', pre: 'batch Harvesting or Settlement, capital shares exist, a Locked Standard Cost exists', mm: '/ run calculation (engine computes Pool and lines)', wrap: 30 },
      { f: 'Draft', t: 'Draft', loop: 'bottom', l: 'recalculate (Admin) / revision_no++, lines replaced', uc: 'UC38', mm: 'recalculate / lines replaced', wrap: 22 },
      { f: 'Draft', t: 'Proposed', l: 'propose (Admin) [7 ≤ feedbackDays ≤ 14] / proposed_at, feedback_deadline', uc: 'UC37', mm: 'propose [7 to 14 days] / feedback_deadline', wrap: 20 },
      { f: 'Proposed', t: 'Disputed', l: 'feedback (Investor) [now ≤ feedback_deadline] / feedback Open', uc: 'UC36', vx: 700, mm: 'feedback [before deadline]', wrap: 18, side: 'left' },
      { f: 'Disputed', t: 'Proposed', l: 'answer the last Open feedback (Admin) / Answered or Unresolved', uc: 'UC36', vx: 760, mm: 'answer last Open feedback', wrap: 18, side: 'right' },
      { f: 'Disputed', t: 'Disputed', loop: 'left', l: 'more feedback (Investor)', uc: 'UC36', mm: 'more feedback', wrap: 13 },
      { f: 'Proposed', t: 'Draft', l: 'recalculate (Admin) [not Approved; also from Disputed] / revision_no++, proposal cleared', uc: 'UC38', pts: [[700, 245], [300, 245]], mm: 'recalculate [not Approved]', wrap: 60 },
      { f: 'Proposed', t: 'Approved', l: 'approve (Admin) [deadline passed, no Open feedback, batch account Open] / lock (trg_settlement_locked); TaxPayment, operator Payout, investor Payouts Created', uc: 'UC39', mm: 'approve [deadline passed, no Open feedback] / lock, payouts', wrap: 26 },
      { f: 'Approved', t: 'PaidOut', l: 'last investor Payout Succeeded, or no positive line', uc: 'UC40', mm: 'last payout Succeeded', wrap: 18 },
      { f: 'PaidOut', t: 'Closed', l: '/ batch Closed, closed_at (same transaction)', uc: 'UC40', mm: '/ batch Closed', wrap: 18 },
      { f: 'Closed', t: '[*]' },
    ],
    notes: [
      'uq_settlement_batch_id: one settlement per batch, rewritten in place before approval. Approve is refused with settlement.not_proposed, settlement.open_feedback or settlement.window_open; afterwards the trigger blocks every update (409 settlement.locked).',
      'Code revenue = Completed orders + forfeited offtake deposits − resolved complaint refunds (v_batch_actual_revenue); remuneration uses a fixed operator_share_pct. «planned» four RevenueLine types; forfeited BulkPreOrder deposits counted once; customer refunds settled before the Pool; remuneration cut by survival tier (thresholds approved with the batch, UC08).',
      '«planned» survival rate = 1 − dead crabs during farming ÷ crabs first stocked in the funded boxes; a restocked crab that dies counts as dead; deaths in transit do not count (they lower revenue instead). The full locked Standard Cost of the funded boxes is always deducted: savings, including an unused mortality reserve, stay with the Operator and never enter the Pool; unspent capital is returned only after early liquidation.',
      'The Admin triggers the calculation and the engine computes it. Loss rule unchanged: each investor loses at most the capital contributed; a loss beyond that is borne by the Operator, never by the platform.',
    ],
  },
  {
    key: 'SettlementFeedback', dy: -90, page: 'settlement_feedback.status', fig: 'Figure 4.15', title: 'settlement_feedback.status (Investor feedback)', change: 'kept',
    owner: 'Settlement (Thiện)',
    source: 'SettlementsController.Feedback/Answer → SettlementReviewService.FeedbackAsync/AnswerAsync',
    check: ['Open', 'Answered', 'Withdrawn', 'Unresolved'],
    states: [
      { id: 'Open', x: 440, y: 340 }, { id: 'Answered', x: 960, y: 340, final: true },
      { id: 'Unresolved', x: 960, y: 640, final: true }, { id: 'Withdrawn', x: 440, y: 640, final: true, reserved: true },
    ],
    trans: [
      { f: '[*]', t: 'Open', s: [110, 357], l: '/ created by feedback (Investor): settlement → Disputed', uc: 'UC36', pre: 'settlement Proposed or Disputed, now ≤ feedback_deadline, the user is an investor of the batch', mm: '/ feedback', wrap: 24 },
      { f: 'Open', t: 'Answered', l: 'answer (Admin) [unresolved = false] / response, responded_at', uc: 'UC36', mm: 'answer [resolved] / response', wrap: 28 },
      { f: 'Open', t: 'Unresolved', l: 'answer (Admin) [unresolved = true] / disagreement kept on the statement', uc: 'UC36', mm: 'answer [unresolved]', wrap: 24 },
      { f: 'Open', t: 'Withdrawn', reserved: true, l: 'withdraw (Investor)', mm: 'withdraw', wrap: 18 },
      { f: 'Answered', t: '[*]', e: [1230, 357] }, { f: 'Unresolved', t: '[*]', e: [1230, 657] }, { f: 'Withdrawn', t: '[*]' },
    ],
    notes: ['When no feedback is Open the settlement returns to Proposed; Unresolved does not block approval but is shown on the statement (TL-14). Unchanged by Register v1.4.'],
  },
  {
    key: 'BatchAccount', page: 'batch_account.status', fig: 'Figure 4.16', title: 'batch_account.status (dedicated batch account)', change: 'corrected to code (created Open)',
    owner: 'Funding, Payments (Thiện)',
    source: 'BatchReviewService.ApproveAsync → IBatchAccountProvisioner.OpenBatchAccountAsync (sandbox gateway) · no later status writes on develop',
    check: ['Requested', 'Open', 'Frozen', 'Closed'],
    states: [
      { id: 'provider', kind: 'choice', x: 333, y: 403 },
      { id: 'Requested', x: 520, y: 170, reserved: true }, { id: 'Open', x: 720, y: 392 },
      { id: 'Frozen', x: 1180, y: 392, reserved: true }, { id: 'Closed', x: 1180, y: 690, final: true, reserved: true },
    ],
    trans: [
      { f: '[*]', t: 'provider', s: [90, 408], l: '/ created on batch approval (Admin)', uc: 'UC08', mm: '/ batch approved', wrap: 16 },
      { f: 'provider', t: 'Open', l: '[sandbox intermediary] / account opened at once: provider_account_no, opened_at', mm: '[sandbox] / opened at once', wrap: 22 },
      { f: 'provider', t: 'Requested', reserved: true, l: '[real intermediary] / account requested', mm: '[real intermediary] / requested', wrap: 20 },
      { f: 'Requested', t: 'Open', reserved: true, l: 'provider confirms the account / opened_at', mm: 'provider confirms', wrap: 18 },
      { f: 'Open', t: 'Frozen', reserved: true, l: 'freeze (provider or Admin) [dispute]', hy: 410, mm: 'freeze [dispute]', wrap: 34, side: 'above' },
      { f: 'Frozen', t: 'Open', reserved: true, l: 'lift the freeze', hy: 436, mm: 'lift freeze', wrap: 34, side: 'below' },
      { f: 'Open', t: 'Closed', reserved: true, l: 'close [batch Closed, balance zero] / closed_at', mm: 'close [batch Closed, balance zero]', wrap: 20 },
      { f: 'Closed', t: '[*]', e: [1440, 707] },
    ],
    notes: [
      'Code inserts the row directly as Open on approval (sandbox provisioner); Requested is only the column default, and Frozen and Closed have no code path.',
      'Every payment_request, provider_transaction and payment_instruction references this account; VietQR collection, deposits, disbursements, refunds and payouts require Open. The platform holds no money: the account sits at the payment intermediary (Register v1.4).',
    ],
  },
  // =============================== Nhân: Orders ===============================
  {
    key: 'BulkPreOrder', decisions: true, page: 'sales_order.status (BulkPreOrder)', fig: 'Figure 4.17', title: 'sales_order.status — BulkPreOrder (v1.4)', change: 'new v1.4 flow on the code\'s PreOrder states + «planned»',
    owner: 'Orders (Nhân) · Funding, Settlement (Thiện)',
    source: 'PreordersController → PreorderService.PlaceAsync · PreOrderDepositHandler · ReservationExpiryJob · OrderCancellationService · OrderFulfilmentService.ShipAsync/DeliverAsync/ReceiveAsync · OrderCompletionJob · OrderReturnService · ComplaintService.ResolveAsync',
    check: ['PendingPayment', 'DepositPaid', 'Paid', 'Packed', 'Shipping', 'Delivered', 'Completed', 'Cancelled', 'Returned'],
    checkGroup: 'sales_order', removed: ['Paid'],
    states: [
      { id: 'PendingPayment', x: 50, y: 250, w: 210, act: ['entry / hold crabs on the batch capacity (PreOrderHold «planned»)'] },
      { id: 'DepositPaid', x: 390, y: 258, w: 170 },
      { id: 'Confirmed', x: 690, y: 250, w: 170, planned: true },
      { id: 'Packed', x: 990, y: 258, w: 170 },
      { id: 'Shipping', x: 1280, y: 258, w: 170 },
      { id: 'Cancelled', x: 50, y: 480, w: 210 },
      { id: 'Refunded', x: 390, y: 640, w: 170, final: true, planned: true },
      { id: 'Forfeited', x: 760, y: 640, w: 170, final: true, planned: true },
      { id: 'Delivered', x: 1280, y: 520, w: 170, act: ['entry / return window = +72 h'] },
      { id: 'Returned', x: 1060, y: 760, w: 170, final: true },
      { id: 'Completed', x: 1310, y: 760, w: 170, final: true },
    ],
    trans: [
      { f: '[*]', t: 'PendingPayment', s: [143, 112], l: '/ created by place bulk pre-order (Customer or Investor): deposit = total × deposit ratio, VietQR (15 min)', uc: 'UC27', pre: 'the user is not the batch\'s Operator or one of its members; enough crabs left on the batch capacity (no overselling)', ppre: 'batch Funding, crab count (or kg) ≥ the minimum order quantity, address within the farm\'s delivery radius, crabs left in the batch\'s PreOrderQuota', mm: '/ place bulk pre-order', wrap: 40, side: 'right' },
      { f: 'PendingPayment', t: 'DepositPaid', l: 'deposit webhook [order PendingPayment]', p: 'PreOrderHold Converted', uc: 'UC12', mm: 'deposit webhook', wrap: 16 },
      { f: 'PendingPayment', t: 'Cancelled', l: 'after(15 min) (expiry job) or cancel (Customer or Investor) / QR Expired or Cancelled, hold released', p: 'also at funding close when the batch does not open (case d: nothing is lost)', uc: 'UC27, UC55', vx: 155, mm: 'after(15 min) or cancel / hold released', wrap: 30, side: 'right' },
      { f: 'DepositPaid', t: 'Confirmed', planned: true, l: 'batch opens (funding close job)', uc: 'WF-02', mm: 'batch opens', wrap: 16 },
      { f: 'DepositPaid', t: 'Cancelled', planned: true, l: 'cancel (Customer or Investor) [batch still Funding] / deposit kept until funding close, crab hold released', uc: 'UC55', exit: [0.176, 1], pts: [[420, 510]], entry: [1, 0.5], mm: 'cancel [batch still Funding] / deposit kept', wrap: 18 },
      { f: 'DepositPaid', t: 'Refunded', planned: true, l: 'batch Cancelled (funding close job) / Refund instruction for the deposit', uc: 'WF-02, UC40', vx: 520, mm: 'batch Cancelled / deposit refunded', wrap: 18, side: 'right' },
      { f: 'Cancelled', t: 'Refunded', planned: true, l: 'batch Cancelled (funding close job) [deposit paid] / Refund instruction for the deposit', uc: 'WF-02, UC40', exit: [1, 0.8], entry: [0, 0.5], mm: 'batch Cancelled [deposit paid] / refunded', wrap: 18 },
      { f: 'Cancelled', t: 'Forfeited', planned: true, l: 'batch opens (funding close job) [deposit paid] / deposit forfeited: RevenueLine ForfeitedDeposit', uc: 'UC54', exit: [0.75, 1], pts: [[208, 790], [845, 790]], entry: [0.5, 1], mm: 'batch opens [deposit paid] / deposit forfeited', wrap: 48 },
      { f: 'Cancelled', t: '[*]', exit: [0.105, 1], e: [60, 610], l: '', p: '[no deposit paid]', mm: '[no deposit paid] (planned guard)', wrap: 14 },
      { f: 'Confirmed', t: 'Packed', planned: true, l: 'prepare delivery note (Operator) [crabs of harvested boxes assigned] / order QR code issued', uc: 'UC29', mm: 'prepare delivery note / order QR', wrap: 16 },
      { f: 'Confirmed', t: 'Forfeited', planned: true, l: 'cancel (Customer or Investor) [batch opened] / deposit forfeited: RevenueLine ForfeitedDeposit', uc: 'UC54, UC55', vx: 820, mm: 'cancel [batch opened] / deposit forfeited', wrap: 20, side: 'right' },
      { f: 'Packed', t: 'Shipping', l: 'ship (Operator) [ETA within 7 days] / carrier, vehicle, driver (information only)', uc: 'UC29', mm: 'ship [ETA within 7 days]', wrap: 16 },
      { f: 'Shipping', t: 'Shipping', loop: 'top', planned: true, l: 'deliver: record weighedKg and transitLossKg (Operator) / balance QR = weighedKg × price per kg − deposit; if negative, refund the difference', uc: 'UC29', mm: 'record weighedKg / balance QR', wrap: 30 },
      { f: 'Shipping', t: 'Delivered', l: 'deliver (Operator) or receive (Customer) / delivered_at, crabs Sold (today in code)', p: 'v1.4: on the balance webhook [amount = balance] / paid_at, Invoice issued', uc: 'UC29, UC30', vx: 1365, mm: 'deliver or receive / delivered_at', wrap: 24, side: 'right' },
      { f: 'Shipping', t: 'Forfeited', planned: true, l: 'refuse delivery or not pay the balance (Customer) / deposit forfeited, balance QR Cancelled; crabs back to stock for an InvoicedSale (saleReason ForfeitResale)', uc: 'UC30, UC54', exit: [0.12, 1], entry: [1, 0.5], mm: 'refuse delivery or no balance / deposit forfeited', wrap: 30 },
      { f: 'Delivered', t: 'Completed', l: 'after(return window) [no active complaint] / completed_at, counts as revenue', p: 'RevenueLine DeliveredOrder', uc: 'UC30', mm: 'after(return window) [no active complaint]', wrap: 20 },
      { f: 'Delivered', t: 'Returned', l: 'return in window (Customer) or approved by the Operator, or complaint refund = total (Admin) [batch not settled] / Refund of everything paid', uc: 'UC31, UC32', mm: 'return in window or full complaint refund / refund', wrap: 24 },
      { f: 'Refunded', t: '[*]' }, { f: 'Forfeited', t: '[*]', e: [900, 752] },
      { f: 'Returned', t: '[*]', e: [1000, 777] }, { f: 'Completed', t: '[*]', e: [1530, 777] },
    ],
    notes: [
      'Deposit rules «planned» (UC55 Cancel Bulk Pre-order, UC54 Forfeit Deposit, Sequence 4.58): (a) a Customer who cancels after paying the deposit while the batch is Funding goes to Cancelled and the deposit is kept; it is forfeited if the batch opens, and a cancel after the batch opened (Confirmed) is forfeited at once; (b) if the batch does not open, every paid deposit is refunded, including those of cancelled orders; (c) refusing the delivery or not paying the balance forfeits the deposit and the crabs are resold through an InvoicedSale (ForfeitResale, Figure 4.18); (d) cancelling before paying the deposit (PendingPayment) costs nothing.',
      '«planned» v1.4: order_type BulkPreOrder by crab count (or kg) from a minimum quantity while the batch is Funding (no listing); price per kg locked at funding; delivery within the farm radius; the order QR code is issued when the Operator prepares the delivery note; deliver records weighedKg (live crabs the Customer accepts, dead or spoiled crabs left out) and transitLossKg (recorded only) and issues the balance QR; the balance payment moves the order to Delivered and issues its Invoice, receive then only records received_at (Sequence 4.57); a forfeited deposit becomes RevenueLine ForfeitedDeposit (counted once).',
      'Today in code (removed in v1.4, not drawn): order_type PreOrder from a Published listing while the batch is InProduction, by kg; the balance is issued when the batch is Harvesting and paid before packing (DepositPaid → Paid, the Paid value of ck_sales_order_status, also used by retail checkout); packing scans crab tags (Paid → Packed). Gaps: DepositPaid never expires and cannot be cancelled (422 order.cannot_cancel); forfeited pre-order deposits are not in v_batch_actual_revenue. An active complaint (Figure 4.19) blocks completion and returns.',
    ],
  },
  {
    key: 'InvoicedSale', decisions: true, dy: -80, page: 'sales_order.status (InvoicedSale | FinalOrder)', fig: 'Figure 4.18', title: 'sales_order.status — InvoicedSale | FinalOrder «planned»', change: 'new, «planned» (no code)',
    owner: 'Orders (Nhân) · Settlement (Thiện)',
    source: 'none on develop — planned InvoicedSalesController → InvoicedSaleService.RecordInvoicedSaleAsync/RecordFinalOrderAsync · InvoicedSalePaymentHandler.OnPaidAsync · FinalOrderReminderJob (Sequence 4.59, 4.60)',
    check: ['PendingPayment', 'DepositPaid', 'Paid', 'Packed', 'Shipping', 'Delivered', 'Completed', 'Cancelled', 'Returned'],
    checkGroup: 'sales_order', allPlanned: true,
    states: [
      { id: 'orderType', kind: 'choice', x: 303, y: 357 },
      { id: 'PendingPayment', x: 600, y: 340, w: 260, act: ['«planned» entry / Invoice issued, crabs Sold, VietQR (OrderPayment)'] },
      { id: 'Completed', x: 1160, y: 350, final: true },
    ],
    trans: [
      { f: '[*]', t: 'orderType', s: [70, 362], planned: true, l: '/ created by record invoiced sale (UC50) or record final order (UC51) (Operator)', uc: 'UC50, UC51', ppre: 'batch Harvesting; crabs InStock from harvested boxes and not on another order; LowGrade = weak, watery or frozen crabs; ForfeitResale = crabs released by a forfeited order (Figure 4.17); a final order only for leftover crabs and only once per batch', mm: '/ record invoiced sale or final order', wrap: 22 },
      { f: 'orderType', t: 'PendingPayment', planned: true, l: '[InvoicedSale: saleReason LowGrade or ForfeitResale]', uc: 'UC50', exit: [0.5, 0], pts: [[320, 225], [700, 225]], entry: [0.385, 0], mm: '[InvoicedSale: LowGrade or ForfeitResale]', wrap: 60 },
      { f: 'orderType', t: 'PendingPayment', planned: true, l: '[FinalOrder: sales window closed (SalesWindowDays), price per kg ≥ floor price, one per batch]', uc: 'UC51', exit: [0.5, 1], pts: [[320, 520], [700, 520]], entry: [0.385, 1], mm: '[FinalOrder, price ≥ floor price]', wrap: 50 },
      { f: 'PendingPayment', t: 'Completed', planned: true, l: 'buyer payment webhook (OrderPayment) [amount = invoice] / paid_at; RevenueLine InvoicedSale or FinalOrder', uc: 'UC50, UC51', mm: 'payment webhook [amount = invoice] / paid_at', wrap: 24 },
      { f: 'Completed', t: '[*]', e: [1410, 367], planned: true },
    ],
    notes: [
      'Whole machine «planned»: no invoiced sale, Invoice or final order on develop. It reuses values of ck_sales_order_status and the payment purpose OrderPayment; order_type BulkPreOrder, InvoicedSale and FinalOrder and the column saleReason (LowGrade, ForfeitResale) need new CHECK values (code: Retail, PreOrder, Offtake).',
      'Lifecycle as in Sequence 4.59 and 4.60: recording the sale issues the Invoice and marks the crabs Sold (Figure 4.23); the buyer pays into the batch account and the order becomes Completed, counted as RevenueLine InvoicedSale or FinalOrder. The final order is the only sale after the sales window and is never below the floor price published before funding (research invariant). The buyer and its resale channel are outside the system.',
      'Open point for Nhân and Thiện: the sequences define no cancel or expiry path, so an unpaid invoice stays PendingPayment (its VietQR request can expire, Figure 4.11) until it is settled by hand.',
    ],
  },
  {
    key: 'Complaint', page: 'complaint.status', fig: 'Figure 4.19', title: 'complaint.status (Order complaint)', change: 'kept (regrouped)',
    owner: 'Orders (Nhân)',
    source: 'ComplaintsController.Create/Respond → ComplaintService.SubmitAsync/RespondAsync · ComplaintEscalationJob → EscalateOverdueAsync · AdminComplaintsController.Resolve → ResolveAsync',
    check: ['Open', 'OperatorResponded', 'Escalated', 'Resolved', 'Rejected'],
    states: [
      { id: 'Active', composite: true, derived: true, x: 210, y: 150, w: 820, h: 510, sub: 'grouping, not a status value: an active complaint' },
      { id: 'Open', parent: 'Active', x: 300, y: 380 },
      { id: 'OperatorResponded', parent: 'Active', x: 740, y: 245, w: 200 },
      { id: 'Escalated', parent: 'Active', x: 740, y: 530, w: 200 },
      { id: 'Resolved', x: 1250, y: 275, final: true }, { id: 'Rejected', x: 1250, y: 525, final: true },
    ],
    trans: [
      { f: '[*]', t: 'Active', s: [70, 396], l: '/ created by submit return or complaint (Customer)', uc: 'UC31', pre: 'order Shipping, Delivered or Completed within the return window, no active complaint on the order', mm: '/ submit complaint', wrap: 14 },
      { f: '[*]', t: 'Open', s: [236, 397], l: '' },
      { f: 'Open', t: 'OperatorResponded', l: 'respond (Operator) / operator_response, evidence', uc: 'UC32', mm: 'respond (Operator)', wrap: 22 },
      { f: 'Open', t: 'Escalated', l: 'after(24 h) (escalation job) / escalated_at', uc: 'UC32', mm: 'after(24 h) / escalated_at', wrap: 20 },
      { f: 'Escalated', t: 'OperatorResponded', l: 'respond (Operator)', uc: 'UC32', mm: 'respond (Operator)', wrap: 18 },
      { f: 'Active', t: 'Resolved', l: 'resolve (Admin) [Refund, Compensation or Replacement] / Refund instruction; refund = total → order Returned', uc: 'UC32', mm: 'resolve [Refund, Compensation, Replacement]', wrap: 20 },
      { f: 'Active', t: 'Rejected', l: 'resolve (Admin) [Rejected or NoAction]', uc: 'UC32', mm: 'resolve [Rejected or NoAction]', wrap: 18 },
      { f: 'Resolved', t: '[*]', e: [1500, 292] }, { f: 'Rejected', t: '[*]', e: [1500, 542] },
    ],
    notes: [
      'Active groups Open, OperatorResponded and Escalated: an active complaint blocks automatic order completion and customer returns; resolve applies from any of them.',
      'Resolved refunds are deducted from the batch\'s actual revenue before the Revenue Pool is computed. Kept in Register v1.4 (complaints on delivered BulkPreOrders within the return window).',
    ],
  },
  // =============================== Viên: Operators, Boxes, Batches, Production, Harvest ===============================
  {
    key: 'Operator', dy: -90, page: 'operator.status', fig: 'Figure 4.20', title: 'operator.status (Farm operator)', change: 'kept',
    owner: 'Operators (Viên)',
    source: 'OperatorsController.Create/Update/Submit → OperatorService · AdminOperatorsController.Approve/Reject/Suspend → OperatorReviewService.DecideAsync',
    check: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Suspended'],
    states: [
      { id: 'Draft', x: 280, y: 360 }, { id: 'Submitted', x: 720, y: 360 }, { id: 'Approved', x: 1160, y: 360 },
      { id: 'Rejected', x: 720, y: 660, final: true }, { id: 'Suspended', x: 1160, y: 660, final: true },
    ],
    trans: [
      { f: '[*]', t: 'Draft', s: [80, 377], l: '/ created by create profile (Active user): operator_member Owner, role OperatorMember', uc: 'UC04', pre: 'the user is not yet a member of an operator', mm: '/ create profile', wrap: 20 },
      { f: 'Draft', t: 'Draft', loop: 'top', l: 'edit profile (Owner or Staff)', uc: 'UC04', mm: 'edit profile', wrap: 30 },
      { f: 'Draft', t: 'Submitted', l: 'submit (Owner) [legal name, tax code, registration no., farm address filled] / submitted_at', uc: 'UC04', mm: 'submit [profile complete] / submitted_at', wrap: 26 },
      { f: 'Submitted', t: 'Approved', l: 'approve (Admin) [approvedSlotCapacity ≥ 0] / approved_at, approved_by', uc: 'UC05', mm: 'approve [capacity ≥ 0]', wrap: 26 },
      { f: 'Submitted', t: 'Rejected', l: 'reject (Admin) [reason]', uc: 'UC05', mm: 'reject [reason]', wrap: 14 },
      { f: 'Rejected', t: 'Rejected', loop: 'left', l: 'edit profile (no resubmit path)', uc: 'UC04', mm: 'edit profile', wrap: 14 },
      { f: 'Approved', t: 'Suspended', l: 'suspend (Admin) [reason] / existing batches untouched', uc: 'UC05', mm: 'suspend [reason]', wrap: 18 },
      { f: 'Rejected', t: '[*]' }, { f: 'Suspended', t: '[*]' },
    ],
    notes: [
      'Approved is required by every write in Boxes, Batches (incl. admin approval), Stocking, Production logs, Box events, Harvest and Evidence upload.',
      'Gap: a Rejected operator can edit but not resubmit (SubmitAsync requires Draft). Register v1.4: the delivery radius is set per batch (UC07), not on the operator.',
    ],
  },
  {
    key: 'Box', decisions: true, dy: -90, page: 'physical_slot.status (Box)', fig: 'Figure 4.21', title: 'physical_slot.status (Box)', change: 'modified + «planned» (box rows, row-scoped view)',
    owner: 'Boxes (Viên) · Production, Harvest (Viên)',
    source: 'BoxesController.Create/Range/Update → BoxService · StockingService.StockAsync · SlotEventService.RecordAsync (ClaimAvailableAsync / ReleaseSlotAsync) · HarvestService.RecordAsync',
    check: ['Available', 'Occupied', 'Maintenance'],
    states: [
      { id: 'Available', x: 420, y: 360 },
      { id: 'Occupied', x: 980, y: 336, w: 320, act: ['«planned» do / box details shown only to the investor of its row (UC53)', '«planned» do / device and camera data per box via the ingestion API (UC52)'] },
      { id: 'Maintenance', x: 420, y: 680 },
    ],
    trans: [
      { f: '[*]', t: 'Available', s: [110, 377], l: '/ created by register boxes and box rows (Owner): numbered box with its row_code', uc: 'UC44', pre: 'operator Approved, box count ≤ approved_slot_capacity, box code unique', mm: '/ register boxes', wrap: 20 },
      { f: 'Available', t: 'Maintenance', l: 'set maintenance (Owner) [no open allocation]', uc: 'UC44', vx: 480, mm: 'set maintenance [no open allocation]', wrap: 18, side: 'left' },
      { f: 'Maintenance', t: 'Available', l: 'set available (Owner)', uc: 'UC44', vx: 540, mm: 'set available', wrap: 14, side: 'right' },
      { f: 'Available', t: 'Occupied', l: 'stocking, restock into the box or relocation target / slot_allocation opened', uc: 'UC17', hy: 376, mm: 'stocking, restock or relocation in / allocation opened', wrap: 38, side: 'above' },
      { f: 'Occupied', t: 'Available', l: 'mortality, relocation source or harvest of its crab / slot_allocation.released_at', uc: 'UC17, UC22', hy: 402, mm: 'mortality, relocation out or harvest / allocation released', wrap: 38, side: 'below' },
    ],
    notes: [
      'No final state by design: boxes are never deleted (a box out of use stays in Maintenance). Occupied → Maintenance is refused (422 box.in_use); every claim needs Available. Conditional UPDATEs guard races (409 slot_events.conflict, stocking.slot_conflict, harvest.concurrent_change).',
      '«planned» BoxRow belongs to a batch: the boxes allotted to the batch grouped by physical_slot.row_code (UC07, UC44); investors pick rows when reserving and a confirmed row belongs to exactly one investor (RowAllocation, Figure 4.9). Today row_code is only a layout label and there is no BoxRow table.',
    ],
  },
  {
    key: 'StandardCostVersion', decisions: true, dy: -60, page: 'standard_cost_version.status', fig: 'Figure 4.22', title: 'standard_cost_version.status (Standard Cost)', change: 'modified + «planned» (locked with price per kg and floor price)',
    owner: 'Batches (Viên)',
    source: 'BatchService.SaveCostAsync/SubmitAsync · BatchReviewService.ApproveAsync/RequestRevisionAsync · triggers tr_cost_version_locked, tr_cost_item_locked, tr_cost_plan_locked · DemoLifecycleSeeder',
    check: ['Draft', 'Submitted', 'Approved', 'Locked', 'Superseded'],
    states: [
      { id: 'Draft', x: 260, y: 370 }, { id: 'Submitted', x: 720, y: 370 },
      { id: 'Locked', x: 1180, y: 370, final: true }, { id: 'Superseded', x: 720, y: 680, final: true },
      { id: 'Approved', x: 1180, y: 680, reserved: true, rtag: 'not written by the API' },
    ],
    trans: [
      { f: '[*]', t: 'Draft', s: [80, 387], l: '/ created by save Standard Cost (Owner): version_no = latest + 1', uc: 'UC07', pre: 'batch Draft, no Locked version', mm: '/ save Standard Cost', wrap: 18 },
      { f: 'Draft', t: 'Draft', loop: 'top', l: 'save again (Owner) / items and tranche plan replaced', uc: 'UC07', mm: 'save again / items replaced', wrap: 30 },
      { f: 'Draft', t: 'Submitted', l: 'submit batch (Owner) [MortalityReserve item, complete schedule] / submitted_at', uc: 'UC07', mm: 'submit batch [MortalityReserve, schedule]', wrap: 24 },
      { f: 'Submitted', t: 'Locked', l: 'approve batch (Admin) / locked_at, approved_by; items and plan immutable (triggers)', p: 'locked together with the price per kg and the floor price', uc: 'UC08', mm: 'approve batch / locked_at', wrap: 26 },
      { f: 'Submitted', t: 'Superseded', l: 'save cost after request revision (Owner) / new Draft version in the same transaction', uc: 'UC07, UC08', mm: 'save after request revision / new Draft', wrap: 22 },
      { f: 'Submitted', t: '[*]', e: [798, 205], l: 'batch Rejected (version stays Submitted)', uc: 'UC08', mm: 'batch Rejected', wrap: 20 },
      { f: 'Submitted', t: 'Approved', reserved: true, rtag: 'not written by the API', l: 'approve (Admin)', mm: 'approve', wrap: 16 },
      { f: 'Approved', t: 'Locked', reserved: true, rtag: 'not written by the API', l: 'lock', mm: 'lock', wrap: 16 },
      { f: 'Locked', t: '[*]', e: [1440, 387] }, { f: 'Superseded', t: '[*]' },
    ],
    notes: [
      'A Locked version is the Standard Cost locked before funding (TL-11) and the settlement input (locked_standard_cost); triggers reject any change to it, its items or its tranche plan. «planned» settlement deducts the locked cost of the funded boxes only.',
      'Approved is never written by the API: only DemoLifecycleSeeder inserts Approved and then sets Locked, so that the triggers accept the items.',
    ],
  },
  {
    key: 'CrabItem', decisions: true, dy: -70, page: 'crab_item.status', fig: 'Figure 4.23', title: 'crab_item.status (Crab in a box)', change: 'modified + «planned» (no tags, transit loss, resale)',
    owner: 'Production, Harvest (Viên) · Orders (Nhân)',
    source: 'StockingService.StockAsync · SlotEventService.RecordAsync (Mortality, Restocked, Molted, Relocated) · HarvestService.RecordAsync · OrderPackingService.PackAsync · OrderFulfilmentService (MarkCrabsSoldAsync)',
    check: ['Growing', 'Dead', 'InStock', 'Packed', 'Sold', 'DeliveredInKind', 'Lost'],
    states: [
      { id: 'Growing', x: 160, y: 370 }, { id: 'InStock', x: 580, y: 370 }, { id: 'Packed', x: 1000, y: 370 },
      { id: 'Sold', x: 1400, y: 370, final: true },
      { id: 'Dead', x: 160, y: 700, final: true }, { id: 'DeliveredInKind', x: 580, y: 700, final: true, reserved: true },
      { id: 'Lost', x: 1000, y: 700, final: true, reserved: true },
    ],
    trans: [
      { f: '[*]', t: 'Growing', s: [238, 190], l: '/ created by stocking (Owner) or restock (Owner or Staff): event Stocked', uc: 'UC17', pre: 'a restock replaces a Dead crab in the same box, before the restock cutoff, with an evidence photo', mm: '/ stocking or restock', wrap: 28 },
      { f: 'Growing', t: 'Growing', loop: 'left', l: 'molted or relocated / event Molted or Relocated', uc: 'UC17', mm: 'molted or relocated', wrap: 12 },
      { f: 'Growing', t: 'Dead', l: 'mortality event (Owner or Staff) [evidence photo of the box] / box Available, event Died, alert by policy', uc: 'UC17', mm: 'mortality event [evidence photo] / box Available', wrap: 20 },
      { f: 'Growing', t: 'InStock', l: 'harvest record (Owner or Staff) [harvest Open] / weight_g, grade, harvest_record, box Available', p: 'recorded per box, no printed tag', uc: 'UC22', mm: 'harvest record [harvest Open] / weight, grade', wrap: 22 },
      { f: 'InStock', t: 'Packed', l: 'pack for an order (Operator) [grade matches the line] / order_line_id, event Packed (today in code)', p: 'replaced in v1.4 by Crab.OrderId: crabs of a box assigned on the delivery note, order QR code (no tag scan)', uc: 'UC29', mm: 'pack for an order (today in code)', wrap: 22 },
      { f: 'Packed', t: 'Sold', l: 'order delivered (Operator or Customer) / event Delivered', p: 'v1.4: when the balance is paid', uc: 'UC29, UC30', mm: 'order delivered', wrap: 20 },
      { f: 'InStock', t: 'Sold', planned: true, l: 'invoiced sale or final order recorded (Operator) / sold with an Invoice', uc: 'UC50, UC51', exit: [0.333, 0], pts: [[640, 250], [1460, 250]], entry: [0.333, 0], mm: 'invoiced sale or final order recorded', wrap: 80, side: 'above' },
      { f: 'Packed', t: 'InStock', planned: true, l: 'order Forfeited (delivery refused or balance unpaid) / back to stock for an InvoicedSale (ForfeitResale)', uc: 'UC50', exit: [0.25, 1], pts: [[1045, 530], [715, 530]], entry: [0.75, 1], mm: 'order Forfeited / back to stock', wrap: 44 },
      { f: 'Packed', t: 'Lost', planned: true, l: 'died or spoiled in transit / transit loss, not charged (assumed use of Lost)', uc: 'UC29', mm: 'died in transit / not charged', wrap: 20 },
      { f: 'InStock', t: 'DeliveredInKind', reserved: true, l: 'settle in kind', mm: 'settle in kind', wrap: 14 },
      { f: 'Dead', t: '[*]' }, { f: 'Sold', t: '[*]' }, { f: 'DeliveredInKind', t: '[*]' }, { f: 'Lost', t: '[*]' },
    ],
    notes: [
      'ck_crab_item_harvest_fields: Growing and Dead have no harvest; every other status needs harvest_id, grade_id and weight_g. One Growing crab per allocation; a crab is replaced at most once (ux_crab_item_replacement). «planned» survival rate counts every Dead crab of the funded boxes, restocked crabs included; a crab Lost in transit does not count (Figure 4.14).',
      'Today in code each harvested crab gets a printed tag (crab_tag) and packing scans an Active tag; removed in v1.4 (per-box harvest record and order QR code, UC33). Lost and DeliveredInKind are allowed by the CHECK but never written on develop; DeliveredInKind has no v1.4 use.',
    ],
  },
  {
    key: 'Harvest', dy: -90, page: 'harvest.lifecycle_status', fig: 'Figure 4.24', title: 'harvest.lifecycle_status (Harvest session)', change: 'modified + «planned» (per box, no tags)',
    owner: 'Harvest (Viên)',
    source: 'HarvestController.Start/Record/Complete → HarvestService.StartAsync/RecordAsync/CompleteAsync (V016)',
    check: ['Open', 'Completed'],
    states: [{ id: 'Open', x: 480, y: 380 }, { id: 'Completed', x: 1040, y: 380, final: true }],
    trans: [
      { f: '[*]', t: 'Open', s: [120, 397], l: '/ created by start harvest (Owner): batch → Harvesting, harvest_started_at', uc: 'UC22', pre: 'batch InProduction or Harvesting, no Open session (an Open session is reused)', mm: '/ start harvest', wrap: 22 },
      { f: 'Open', t: 'Open', loop: 'top', l: 'record a box (Owner or Staff) [crab Growing in this batch] / harvest_record snapshot, counts and weight', p: 'per box, without printing a crab tag', uc: 'UC22', mm: 'record a box [crab Growing] / harvest_record', wrap: 40 },
      { f: 'Open', t: 'Completed', l: 'complete (Owner) [expected revision] / completed_at, grade summaries', p: 'harvested crabs assigned to Confirmed pre-orders on their delivery notes', uc: 'UC22', mm: 'complete [expected revision] / completed_at', wrap: 28 },
      { f: 'Completed', t: '[*]', e: [1300, 397] },
    ],
    notes: [
      'One Open session per batch (ux_harvest_open_batch); start reuses it; requests are idempotent by request_id. harvest_record is append-only (trigger). Rows created before V016 have lifecycle_status NULL: read-only history, not a business state.',
      'Today in code each record prints a crab tag and completion syncs listing stock per grade; both removed in v1.4. «planned» each delivery order carries a QR code, issued when the Operator prepares the delivery note (assigning the crabs of the boxes to the order), that traces it to the batch and its boxes (OrderQrCode, UC33).',
    ],
  },
  // =============================== Khôi: Accounts, Evidence, Alerts ===============================
  {
    key: 'AppUser', dy: -90, page: 'app_user.status', fig: 'Figure 4.25', title: 'app_user.status (User account)', change: 'kept',
    owner: 'Auth (Thiện) · Accounts (Khôi)',
    source: 'AuthController.Register → AuthService.RegisterAsync · AdminAccountsController.Lock/Unlock → AdminAccountService.SetLockedAsync · JwtBearer OnTokenValidated',
    check: ['PendingVerification', 'Active', 'Locked'],
    states: [
      { id: 'Active', x: 420, y: 370 }, { id: 'Locked', x: 980, y: 370 },
      { id: 'PendingVerification', x: 420, y: 680, w: 200, reserved: true, rtag: 'column default, not created by code' },
    ],
    trans: [
      { f: '[*]', t: 'Active', s: [120, 387], l: '/ created by register (anonymous): roles Customer (+ Investor), JWT issued', uc: 'UC01', pre: 'email not taken', mm: '/ register', wrap: 20 },
      { f: 'Active', t: 'Locked', l: 'lock (Admin) [not self, reason] / existing JWTs rejected (401), login 403 auth.locked', hy: 387, mm: 'lock [not self, reason]', wrap: 40, side: 'above' },
      { f: 'Locked', t: 'Active', l: 'unlock (Admin) [reason]', hy: 413, mm: 'unlock [reason]', wrap: 40, side: 'below' },
      { f: 'PendingVerification', t: 'Locked', reserved: true, l: 'lock (Admin) [not self, reason]', exit: [1, 0.25], entry: [0.25, 1], mm: 'lock', wrap: 20, side: 'left' },
      { f: 'Locked', t: 'PendingVerification', reserved: true, l: 'unlock (Admin) [locked from PendingVerification]', exit: [0.6, 1], entry: [1, 0.75], mm: 'unlock [was PendingVerification]', wrap: 20, side: 'right' },
    ],
    notes: [
      'No final state by design: accounts are never deleted and a lock is reversible. Every service re-checks status = Active in the database, not only in the JWT. Lock and unlock belong to admin user management (no UC code).',
      'PendingVerification is the column default only: the lock and unlock code would handle such a user, but no code creates one. Unchanged by Register v1.4.',
    ],
  },
  {
    key: 'InvestorVerification', dy: -90, page: 'investor.verification_status', fig: 'Figure 4.26', title: 'investor.verification_status (eKYC)', change: 'kept',
    owner: 'Accounts (Khôi)',
    source: 'AccountsController.Verify → AccountService.VerifyIdentityAsync (IEkycProvider) · AdminAccountsController.ApproveException → AdminAccountService.ApproveExceptionAsync',
    check: ['Unverified', 'Verified', 'Rejected'],
    states: [
      { id: 'Unverified', x: 380, y: 370 }, { id: 'Verified', x: 940, y: 370, final: true }, { id: 'Rejected', x: 380, y: 680 },
    ],
    trans: [
      { f: '[*]', t: 'Unverified', s: [110, 387], l: '/ created by register with the role Investor', uc: 'UC01', mm: '/ register as Investor', wrap: 14 },
      { f: 'Unverified', t: 'Verified', l: 'eKYC passed (Investor) [consent, ID front and back + selfie ≤ 5 MB each, provider Passed] / kyc_check Passed, verified_at; images never stored', uc: 'UC02', mm: 'eKYC passed / kyc_check Passed', wrap: 30 },
      { f: 'Unverified', t: 'Rejected', l: 'eKYC failed / kyc_check Failed, failure_reason', uc: 'UC02', mm: 'eKYC failed', wrap: 18 },
      { f: 'Rejected', t: 'Rejected', loop: 'left', l: 'retry failed', uc: 'UC02', mm: 'retry failed', wrap: 12 },
      { f: 'Rejected', t: 'Verified', l: 'retry passed, or approve exception (Admin) [latest check Failed, consent given, not self] / kyc_check ExceptionApproved', uc: 'UC02, UC06', mm: 'retry passed or approve exception', wrap: 28 },
      { f: 'Verified', t: '[*]', e: [1210, 387] },
    ],
    notes: ['FundingService requires Verified before a reservation (UC10). Only the result and the provider reference are stored (TL-06). A locked user cannot verify. Unchanged by Register v1.4.'],
  },
  {
    key: 'PayoutAccount', page: 'payout_account.status', fig: 'Figure 4.27', title: 'payout_account.status (+ name_match_status)', change: 'kept (redrawn with a choice)',
    owner: 'Accounts (Khôi)',
    source: 'PaymentProfilesController.SavePayout → PaymentProfileService.SavePayoutAsync (IBankNameMatcher) · ux_payout_active_* (one Active account per owner) · account_no encrypted (V012)',
    check: ['Active', 'Locked', 'Closed'],
    states: [
      { id: 'nameMatch', kind: 'choice', x: 663, y: 233 },
      { id: 'Active', x: 210, y: 460, act: ['name_match Matched'] },
      { id: 'Locked', x: 1010, y: 460, w: 200, act: ['name_match Mismatched'] },
      { id: 'Closed', x: 590, y: 740 },
    ],
    trans: [
      { f: '[*]', t: 'nameMatch', s: [668, 100], l: '/ created by save account (Investor or Operator Owner): bank name match against the verified name; other accounts Closed', uc: 'UC03', pre: 'the bank account number is not registered to another owner and there is no admin lock', mm: '/ save account', wrap: 46 },
      { f: 'nameMatch', t: 'Active', l: '[holder name matches] / kyc_check BankNameMatch Passed', uc: 'UC03', mm: '[name matches]', wrap: 20 },
      { f: 'nameMatch', t: 'Locked', l: '[name does not match] / BankNameMatch Failed (HTTP 200)', uc: 'UC03', mm: '[name does not match]', wrap: 20 },
      { f: 'Active', t: 'nameMatch', l: 're-save the same bank and number [if the name changes: no payment instruction yet, else 409 payout.holder_immutable]', uc: 'UC03', pts: [[270, 250]], mm: 're-save same account', wrap: 26 },
      { f: 'Locked', t: 'nameMatch', l: 're-save with the corrected holder name', uc: 'UC03', pts: [[1100, 250]], mm: 're-save corrected name', wrap: 20 },
      { f: 'Closed', t: 'nameMatch', l: 'save the same bank and number again (row reused)', uc: 'UC03', mm: 'save same account again', wrap: 16 },
      { f: 'Active', t: 'Closed', l: 'owner saves a different account', uc: 'UC03', mm: 'different account saved', wrap: 16 },
      { f: 'Locked', t: 'Closed', l: 'owner saves a different account', uc: 'UC03', mm: 'different account saved', wrap: 16 },
    ],
    notes: [
      'No final state by design: a Closed account can be reused when the same bank and number are saved again. Only Active accounts receive instructions (PayoutSendService, DisbursementService, SettlementPayoutService resolve the active account at send time).',
      'Locked + Matched (an admin lock) blocks every save (403 payout.locked) but no endpoint produces it. Unchanged by Register v1.4.',
    ],
  },
  {
    key: 'Evidence', noteAnchor: 'Watch', dy: -50, page: 'evidence.review_status', fig: 'Figure 4.28', title: 'evidence.review_status (Production evidence)', change: 'modified + «planned» (simulator input, row-scoped view)',
    owner: 'Evidence (Khôi)',
    source: 'EvidenceController.Upload → EvidenceService.UploadAsync (EvidenceImageProcessor, crab detection module ICrabDetector) · EvidenceReviewController.Verdict → EvidenceReviewService.DecideAsync · EvidenceExplanationsController → EvidenceExplanationService',
    check: ['Accepted', 'Watch', 'Flagged', 'Rejected'],
    states: [
      { id: 'risk', kind: 'choice', x: 313, y: 413 },
      { id: 'Accepted', x: 640, y: 185, final: true },
      { id: 'Watch', x: 640, y: 402 },
      { id: 'Flagged', x: 1080, y: 402 },
      { id: 'Rejected', x: 1080, y: 670, final: true },
    ],
    trans: [
      { f: '[*]', t: 'risk', s: [60, 418], l: '/ created by upload (Operator, live in-app photo): SHA-256 + perceptual hash, crab detection, risk score', p: 'or submitted by the Device & Camera Simulator through the ingestion API (UC52, source FarmApi)', uc: 'UC45', pre: 'batch Stocked, InProduction or Harvesting; a box of the batch; GPS and capture time present', mm: '/ upload photo (or simulator «planned»)', wrap: 20 },
      { f: 'risk', t: 'Accepted', l: '[risk < 20]', mm: '[risk < 20]', wrap: 20 },
      { f: 'risk', t: 'Watch', l: '[20 ≤ risk < 70]', mm: '[20 ≤ risk < 70]', wrap: 20 },
      { f: 'risk', t: 'Flagged', l: '[risk ≥ 70] / linked capture request stays Open', pts: [[330, 570], [1020, 570]], mm: '[risk ≥ 70]', wrap: 54 },
      { f: 'Watch', t: 'Accepted', l: 'verdict Pass (Evidence Reviewer) [not an investor of the batch]', uc: 'UC47', mm: 'verdict Pass [not an investor]', wrap: 20 },
      { f: 'Watch', t: 'Flagged', l: 'verdict NeedMoreEvidence (Reviewer)', uc: 'UC47', mm: 'verdict NeedMoreEvidence', wrap: 18 },
      { f: 'Watch', t: 'Rejected', l: 'verdict Fail (Reviewer)', uc: 'UC47', mm: 'verdict Fail', wrap: 18 },
      { f: 'Flagged', t: 'Accepted', l: 'verdict Pass (Reviewer)', uc: 'UC47', mm: 'verdict Pass', wrap: 18 },
      { f: 'Flagged', t: 'Rejected', l: 'verdict Fail (Reviewer)', uc: 'UC47', mm: 'verdict Fail', wrap: 18 },
      { f: 'Flagged', t: 'Flagged', loop: 'right', l: 'explanation (Operator) / explained_at reopens review for the reviewer who asked', uc: 'UC48', mm: 'explanation / review reopened', wrap: 18 },
      { f: 'Accepted', t: '[*]', e: [918, 202] }, { f: 'Rejected', t: '[*]', e: [1340, 687] },
    ],
    notes: [
      'Risk: exact duplicate 100, similar photo 80, captured more than 24 h before receipt 40, crab detection "no crab" ≤ 15 (weak signal). Detection never rejects evidence alone: a human Evidence Reviewer decides, never on a batch they invested in.',
      'The crab detection module only checks whether a crab is in the box; develop runs a no-op detector (result unknown, adds no risk) until the trained module is integrated.',
      'Accepted evidence feeds the investor timeline and tranche gates; Flagged evidence blocks tranche release. «planned» investors see box details only for their own rows (UC53).',
    ],
  },
  {
    key: 'CaptureRequest', dy: -90, page: 'capture_request.status', fig: 'Figure 4.29', title: 'capture_request.status (Random capture request)', change: 'kept',
    owner: 'Evidence (Khôi)',
    source: 'CaptureRequestWorker (every 5 min) → CaptureRequestJob.RunAsync · EvidenceService.UploadAsync (captureRequestId) · AlertService.RaiseAsync on expiry',
    check: ['Open', 'Fulfilled', 'Expired'],
    states: [
      { id: 'Open', x: 480, y: 380 }, { id: 'Fulfilled', x: 1040, y: 380, final: true }, { id: 'Expired', x: 1040, y: 680, final: true },
    ],
    trans: [
      { f: '[*]', t: 'Open', s: [120, 397], l: '/ created by the capture request job: random occupied box, due_at = +120 min', uc: 'UC45', pre: 'local time ≥ 09:00, batch InProduction, operator Approved, no Open or same-day request, at least one occupied box', mm: '/ capture request job', wrap: 24 },
      { f: 'Open', t: 'Open', loop: 'top', l: 'Flagged upload linked / request stays Open', uc: 'UC45', mm: 'Flagged upload linked', wrap: 44 },
      { f: 'Open', t: 'Fulfilled', l: 'evidence upload with captureRequestId (Operator) [same box, captured within [requested_at, due_at], result not Flagged] / fulfilled_at', uc: 'UC45', mm: 'upload with captureRequestId [in time, not Flagged]', wrap: 28 },
      { f: 'Open', t: 'Expired', l: 'job [due_at < now] / EvidenceFlag alert (Medium, ack 2 h)', uc: 'UC45', mm: 'job [due_at passed] / alert', wrap: 22 },
      { f: 'Fulfilled', t: '[*]', e: [1300, 397] }, { f: 'Expired', t: '[*]', e: [1300, 697] },
    ],
    notes: ['Random capture requests are the anti-staging control of TL-04: one per eligible batch per day, two-hour response window. Kept in Register v1.4.'],
  },
  {
    key: 'Alert', noteAnchor: 'Unresolved', page: 'alert.status', fig: 'Figure 4.30', title: 'alert.status (Operations alert)', change: 'modified (alert types, regrouped)',
    owner: 'Alerts (Khôi)',
    source: 'AlertService.RaiseAsync (callers: AlertJob, SlotEventService, CaptureRequestJob) · AlertsController.Acknowledge · AlertJobWorker (15 min) → AlertJob.RunAsync · AdminAlertsController.Resolve',
    check: ['Open', 'Acknowledged', 'Escalated', 'Resolved'],
    states: [
      { id: 'Unresolved', composite: true, derived: true, x: 190, y: 150, w: 880, h: 580, sub: 'grouping, not a status value' },
      { id: 'Open', parent: 'Unresolved', x: 310, y: 380 },
      { id: 'Acknowledged', parent: 'Unresolved', x: 770, y: 380 },
      { id: 'Escalated', parent: 'Unresolved', x: 310, y: 620 },
      { id: 'Resolved', x: 1300, y: 420, final: true },
    ],
    trans: [
      { f: '[*]', t: 'Unresolved', s: [70, 428], l: '/ created by raise: ack_deadline = now + ackWithin', uc: 'UC19', pre: 'no Open or Escalated alert of the same batch and type (otherwise that alert is updated)', mm: '/ raise', wrap: 11 },
      { f: '[*]', t: 'Open', s: [238, 397], l: '' },
      { f: 'Open', t: 'Open', loop: 'top', l: 'raise again / message replaced, severity only raised, deadline only shortened', uc: 'UC19', mm: 'raise again / message replaced', wrap: 40 },
      { f: 'Open', t: 'Acknowledged', l: 'acknowledge (Operator) [before ack_deadline, note 1–300] / acknowledged_at', uc: 'UC19', mm: 'acknowledge [before ack_deadline]', wrap: 28 },
      { f: 'Open', t: 'Escalated', l: 'alert job [ack_deadline < now] or late acknowledge / escalated_at', uc: 'UC20', mm: 'alert job [deadline passed] / escalated_at', wrap: 24 },
      { f: 'Escalated', t: 'Escalated', loop: 'right', l: 'raise again, or acknowledge after escalation / message or note recorded, status unchanged', uc: 'UC19', mm: 'raise again or late acknowledge', wrap: 22 },
      { f: 'Unresolved', t: 'Resolved', l: 'resolve (Admin) [note] / kept in the audit log', uc: 'UC20', mm: 'resolve [note]', wrap: 18 },
      { f: 'Resolved', t: '[*]', e: [1560, 437] },
    ],
    notes: [
      'Types with this lifecycle: Mortality (box events, UC17), MilestoneDelay and DataSilence (alert job), EvidenceFlag (expired capture request). Removed in v1.4 (still in code and in the alert type CHECK), not drawn: WaterQuality, raised by ProductionLogService when the pH, temperature or salinity of a daily log breaks the ProductionThresholdVersion limits, and LowStock, raised by LowStockMonitor for listing stock.',
      '«planned» DataSilence also watches data submitted by the Device & Camera Simulator through the ingestion API (UC52); a new type FinalOrderDue reminds the Operator when the sales window closes (UC51). Acknowledged alerts are never escalated; a new occurrence after Acknowledged or Resolved opens a new row.',
    ],
  },
];

// Máy của thực thể đã bỏ khỏi nghiệp vụ theo v1.4: không vẽ nữa, chỉ liệt kê ở Index (code vẫn còn).
const REMOVED = [
  { old: 'Figure 4.17', col: 'product_listing.status', values: 'Draft, Published, SoldOut, Closed', why: 'Listing / Catalog: retail listings removed (UC24)' },
  { old: 'Figure 4.19', col: 'stock_reservation.status', values: 'Active, Committed, Released', why: 'Cart / checkout stock hold on a listing removed (UC26); v1.4 holds pre-ordered crabs with PreOrderHold «planned»' },
  { old: 'Figure 4.21', col: 'offtake_commitment.status', values: 'PendingHarvest, WindowOpen, Fulfilled, Expired, Cancelled', why: 'Offtake window removed (UC13, UC23)' },
  { old: 'Figure 4.22', col: 'offtake_commitment.deposit_status', values: 'Pending, Held, Applied, Forfeited, Refunded', why: 'Offtake deposit removed with the window' },
  { old: 'Figure 4.27', col: 'crab_tag.status', values: 'Printed, Active, Void', why: 'CrabTag: per-crab printed tags removed (UC46)' },
  { text: 'alert.alert_type values WaterQuality (pH, temperature and salinity of daily logs against ProductionThresholdVersion, the water-quality thresholds) and LowStock (listing stock): no longer raised in v1.4; the measurements and thresholds are removed too. Code, tables and the CHECK remain; the alert lifecycle (Figure 4.30) is unchanged for the other types.' },
  { text: 'sales_order.status value Paid (v2.0 Figures 4.18, 4.20): written today by retail checkout and by the pre-order balance paid before packing; v1.4 pays the balance at delivery (Shipping → Delivered, Figure 4.17) and invoiced sales go PendingPayment → Completed (Figure 4.18). The value stays in ck_sales_order_status and the code.' },
];
const OLD_FIG = { Batch: '4.8', Contribution: '4.9', InvestmentContract: '4.10', PaymentRequest: '4.11', PaymentInstruction: '4.12', DisbursementTranche: '4.13', Settlement: '4.14', SettlementFeedback: '4.15', BatchAccount: '4.16', BulkPreOrder: '4.18', InvoicedSale: '—', Complaint: '4.20', Operator: '4.23', Box: '4.24', StandardCostVersion: '4.25', CrabItem: '4.26', Harvest: '4.28', AppUser: '4.29', InvestorVerification: '4.30', PayoutAccount: '4.31', Evidence: '4.32', CaptureRequest: '4.33', Alert: '4.34' };

// ---------------------------------------------------------------------------------------------------------------
// Kiểu dáng (brief §9.4, §9.5): bỏ cỡ chữ mặc định của lib.js rồi đặt cỡ mới, để mỗi style chỉ có một fontSize
const noFs = (st) => st.replace(/fontSize=\d+;/g, '');
const E_PLAN = `dashed=1;strokeColor=${PLAN};fontColor=${PLAN};`;
const E_NOTW = `dashed=1;strokeColor=${NOTW};fontColor=${NOTW};`;
const ST = {
  normal: noFs(S.state) + `fontSize=${FS.name};`,
  final: noFs(S.stateFinalLike) + `fontSize=${FS.name};`,
  planned: noFs(S.state) + `dashed=1;strokeColor=${PLAN};fontColor=${PLAN};fillColor=#f8fafc;fontSize=${FS.name};`,
  reserved: noFs(S.stateFinalLike) + `dashed=1;strokeColor=${NOTW};fontSize=${FS.name};`,
  composite: `rounded=1;arcSize=3;whiteSpace=wrap;html=1;container=1;collapsible=0;fillColor=#f8fafc;strokeColor=#3730a3;align=left;verticalAlign=top;spacingLeft=10;spacingTop=4;fontSize=${FS.name};${FONT}`,
  compositePlanned: `rounded=1;arcSize=3;whiteSpace=wrap;html=1;container=1;collapsible=0;fillColor=#ffffff;strokeColor=${PLAN};dashed=1;fontColor=${PLAN};align=left;verticalAlign=top;spacingLeft=10;spacingTop=4;fontSize=${FS.name};${FONT}`,
  choice: S.choice,
  note: noFs(S.note) + `fontSize=${FS.small};`,
  legend: noFs(S.legend) + `fontSize=${FS.small};`,
};
const EDGE = noFs(S.transStraight) + `labelBackgroundColor=#ffffff;fontSize=${FS.label};`;
// Máy riêng đặt cùng trang (separate): khung UML "stm <Tên>" (diagram frame), không phải một trạng thái của máy chính
const frameTab = (s) => Math.ceil(textWidth(`stm ${s.id}${s.planned ? ' «planned»' : ''}`, FS.name) * 1.12) + 26;
const frameStyle = (s) => `shape=umlFrame;whiteSpace=wrap;html=1;container=1;collapsible=0;recursiveResize=0;pointerEvents=0;width=${frameTab(s)};height=28;`
  + (s.planned ? `dashed=1;strokeColor=${PLAN};fontColor=${PLAN};` : 'strokeColor=#3730a3;') + `fillColor=#f8fafc;align=left;spacingLeft=8;fontSize=${FS.name};${FONT}`;

// ---------------------------------------------------------------------------------------------------------------
// Chữ: escape HTML, đo độ rộng gần đúng (Segoe UI), tách từ có đánh dấu «planned» ({p}…{/p}), ngắt dòng theo số ký tự
const htmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const strip = (s) => String(s ?? '').replace(/\{\/?p\}/g, '');
function textWidth(s, size = FS.label) {
  let w = 0;
  for (const ch of strip(s)) {
    if (/[A-Z]/.test(ch)) w += 0.64;
    else if (/[ijlft]/.test(ch)) w += 0.3;
    else if (/[mw]/.test(ch)) w += 0.8;
    else if (/[a-z]/.test(ch)) w += 0.53;
    else if (/[0-9]/.test(ch)) w += 0.56;
    else if (ch === ' ') w += 0.27;
    else if (/[.,:;'|!]/.test(ch)) w += 0.27;
    else if (/[()[\]{}/\-]/.test(ch)) w += 0.34;
    else w += 0.64;
  }
  return w * size;
}
function tokens(s) {
  const out = []; let p = false, prevEnd = ' ';
  for (const part of String(s ?? '').split(/(\{p\}|\{\/p\})/)) {
    if (part === '{p}') { p = true; continue; }
    if (part === '{/p}') { p = false; continue; }
    if (!part) continue;
    const glueFirst = out.length > 0 && !/\s/.test(prevEnd) && !/^\s/.test(part);
    part.split(' ').forEach((w, i) => { if (w) out.push({ w, p, glue: i === 0 && glueFirst }); });
    prevEnd = part[part.length - 1];
  }
  return out;
}
function wrapTokens(toks, n) {
  const lines = []; let line = [], len = 0;
  for (const t of toks) {
    if (line.length && !t.glue && len + 1 + t.w.length > n) { lines.push(line); line = []; len = 0; }
    len += (line.length && !t.glue ? 1 : 0) + t.w.length; line.push(t);
  }
  if (line.length) lines.push(line);
  return lines;
}
const lineText = (line) => line.map((t, i) => (i && !t.glue ? ' ' : '') + t.w).join('');
function lineHtml(line, base) {
  let html = '', cur = null, buf = '';
  const flush = () => { if (cur === null) return; const c = cur ? PLAN : base; const txt = htmlEsc(buf); html += c ? `<font color="${c}">${txt}</font>` : txt; };
  line.forEach((t, i) => {
    const sep = i === 0 || t.glue ? '' : ' ';
    if (cur !== t.p) { flush(); html += sep; cur = t.p; buf = t.w; } else buf += sep + t.w;
  });
  flush();
  return html;
}
const tagOf = (x) => `(${x.rtag ?? NW_TAG})`;
// Nhãn đầy đủ (có thể còn dấu {p}) của một chuyển: phần chính
function mainText(t) {
  let main = t.l ?? '';
  if (t.planned && main) main = '«planned» ' + main;
  if (t.reserved && main) main = `${main} ${tagOf(t)}`;
  return main;
}
// Nhãn draw.io: phần chính (đen; xám nếu cả cạnh «planned»; cam nếu không được code ghi; đoạn {p} xám) + phần «planned» (xám) + mã UC
function labelOf(t) {
  const n = t.wrap ?? 34;
  const main = mainText(t);
  const uc = t.uc ? `· ${t.uc}` : '';
  const mainLines = main || uc ? wrapTokens(tokens([main, uc].filter(Boolean).join(' ')), n) : [];
  const pLines = t.p ? wrapTokens(tokens(`{p}«planned» ${t.p}{/p}`), n) : [];
  const base = t.planned ? PLAN : t.reserved ? NOTW : null;
  const all = [...mainLines, ...pLines];
  const html = all.map(l => lineHtml(l, base)).join('<br>');
  const lines = all.map(lineText);
  const w = lines.length ? Math.max(...lines.map(x => textWidth(x))) + 8 : 0;
  return { html, lines, w, h: lines.length ? Math.ceil(lines.length * FS.label * 1.2) + 4 : 0 };
}
// Nhãn trong ô trạng thái
function stateHtml(s) {
  const small = (t, c = '#475569') => `<font style="font-size:${FS.small}px" color="${c}">${htmlEsc(t)}</font>`;
  const parts = [];
  if (s.planned) parts.push(small('«planned»', PLAN));
  parts.push(htmlEsc(s.label ?? s.id));
  if (s.phase) parts.push(small('business phase, not a status value', PLAN));
  if (s.reserved) parts.push(small(tagOf(s), NOTW));
  for (const a of s.act ?? []) parts.push(a.includes('«planned»') ? small(a, PLAN) : small(a));
  return parts.join('<br>');
}
function stateHeight(s, w) {
  if (s.h) return s.h;
  let small = (s.planned ? 1 : 0) + (s.phase ? 1 : 0) + (s.reserved ? Math.ceil(textWidth(tagOf(s), FS.small) / (w - 16)) : 0);
  for (const a of s.act ?? []) small += Math.ceil(textWidth(a, FS.small) / (w - 16));
  return Math.max(60, Math.ceil(22 + FS.name * 1.25 + small * FS.small * 1.2));
}

// ---------------------------------------------------------------------------------------------------------------
// Hình học
const ctr = (g) => [g.x + g.w / 2, g.y + g.h / 2];
function perimeter(g, [px, py]) {
  const [cx, cy] = ctr(g);
  const dx = px - cx, dy = py - cy;
  if (!dx && !dy) return [cx, cy];
  let k;
  if (g.shape === 'ellipse') k = 1 / Math.sqrt((dx * dx) / ((g.w / 2) ** 2) + (dy * dy) / ((g.h / 2) ** 2));
  else if (g.shape === 'rhombus') k = 1 / (Math.abs(dx) / (g.w / 2) + Math.abs(dy) / (g.h / 2));
  else k = Math.min(dx ? (g.w / 2) / Math.abs(dx) : Infinity, dy ? (g.h / 2) / Math.abs(dy) : Infinity);
  return [cx + dx * k, cy + dy * k];
}
const plen = (P) => P.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - P[i][0], p[1] - P[i][1]), 0);
function pointAt(P, t) {
  let d = t * plen(P);
  for (let i = 1; i < P.length; i++) {
    const sx = P[i][0] - P[i - 1][0], sy = P[i][1] - P[i - 1][1], sl = Math.hypot(sx, sy);
    if (d <= sl || i === P.length - 1) {
      const f = sl ? Math.min(1, d / sl) : 0;
      return { x: P[i - 1][0] + sx * f, y: P[i - 1][1] + sy * f, ux: sl ? sx / sl : 1, uy: sl ? sy / sl : 0 };
    }
    d -= sl;
  }
  return { x: P[0][0], y: P[0][1], ux: 1, uy: 0 };
}
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const inside = (g, x, y, m = 2) => g.shape === 'ellipse'
  ? ((x - g.x - g.w / 2) / (g.w / 2 - m)) ** 2 + ((y - g.y - g.h / 2) / (g.h / 2 - m)) ** 2 < 1
  : x > g.x + m && x < g.x + g.w - m && y > g.y + m && y < g.y + g.h - m;
function segInRect(P, r) {
  let n = 0;
  for (let i = 1; i < P.length; i++) {
    const [x1, y1] = P[i - 1], [x2, y2] = P[i];
    const k = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3));
    for (let j = 0; j <= k; j++) { const x = x1 + (x2 - x1) * j / k, y = y1 + (y2 - y1) * j / k; if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) n++; }
  }
  return n * 3;
}
function loopPts(g, side = 'top') {
  const [cx, cy] = ctr(g), d = 36, s = 18;
  if (side === 'top') return [[cx - s, g.y - d], [cx + s, g.y - d]];
  if (side === 'bottom') return [[cx + s, g.y + g.h + d], [cx - s, g.y + g.h + d]];
  if (side === 'left') return [[g.x - d, cy + s], [g.x - d, cy - s]];
  return [[g.x + g.w + d, cy - s], [g.x + g.w + d, cy + s]];
}
const round3 = (v) => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------------------------------------------------------------
// Vẽ một máy trạng thái: tính hình học → đặt nhãn → ghi ô và cạnh → ghi chú → kiểm tra
const WARN = [];
const PAGE_W = 1654;
const TOP = 100;
function caption(d, fig, title, meta) {
  d.text(`<b>${htmlEsc(fig)} – ${htmlEsc(title)}</b><br><font style="font-size:${FS.small}px" color="#64748b">${htmlEsc(meta)}</font>`, 20, 10, 1600, 48, `fontSize=${FS.title};`);
}
// Cỡ chữ khi thu vừa vùng in A4 ngang (cùng công thức với review/tools/fontfit.js): khung bao mọi ô, chữ nhỏ nhất
function printedPt(minX, minY, maxX, maxY, minFont) {
  const W = maxX - minX, H = maxY - minY, land = W > H;
  const scale = Math.min(1, (land ? A4.long : A4.short) / W, (land ? A4.short : A4.long) / H);
  return minFont * scale * 0.75;
}
function drawMachine(f, m) {
  const d = f.page(m.page);
  caption(d, m.fig, `State Machine Diagram: ${m.title}`, `${META} · ${m.change}`);
  d.text(`<font style="font-size:${FS.small}px" color="#64748b"><b>Source (${htmlEsc(CODE)}):</b> ${htmlEsc(m.source)} · <b>Module:</b> ${htmlEsc(m.owner)}</font>`, 20, 58, 1600, 40, `fontSize=${FS.small};`);
  const warn = (msg) => WARN.push(`${m.page}: ${msg}`);

  // 1. Hình học ô trạng thái (toạ độ tuyệt đối); m.dy dời cả máy theo chiều dọc
  const DY = m.dy ?? 0;
  const G = {};
  for (const s of m.states) {
    if (s.kind === 'choice') { G[s.id] = { x: s.x, y: s.y + DY, w: 34, h: 34, shape: 'rhombus', s }; continue; }
    const w = s.w ?? 180;
    G[s.id] = { x: s.x, y: s.y + DY, w, h: s.composite ? s.h : stateHeight(s, w), s, composite: !!s.composite, parent: s.parent };
  }
  const ancestors = (k) => { const a = []; let p = G[k]?.parent; while (p) { a.push(p); p = G[p]?.parent; } return a; };

  // 2. Cạnh: giả trạng thái đầu/cuối, đường gấp khúc (điểm gấp + điểm trên chu vi hoặc điểm nối cố định)
  const E = [];
  let n = 0;
  for (const t of m.trans) {
    let src = t.f, dst = t.t;
    if (t.f === '[*]') {
      const g = G[t.t]; src = `start${n++}`;
      const [sx, sy] = t.s ? [t.s[0], t.s[1] + DY] : [g.x - 64, g.y + g.h / 2 - 12];
      // initial nằm cùng vùng với trạng thái đích: đích là composite thì initial ở vùng cha của composite, không nằm trong nó
      G[src] = { x: sx, y: sy, w: 24, h: 24, shape: 'ellipse', pseudo: 'start', parent: g.parent };
      if (t.s && g.parent && !(sx > G[g.parent].x && sx < G[g.parent].x + G[g.parent].w)) G[src].parent = undefined;
    }
    if (t.t === '[*]') {
      const g = G[t.f]; dst = `end${n++}`;
      const [ex, ey] = t.e ? [t.e[0], t.e[1] + DY] : [g.x + g.w / 2 - 12, g.y + g.h + 46];
      G[dst] = { x: ex, y: ey, w: 24, h: 24, shape: 'ellipse', pseudo: 'end', parent: g.parent };
    }
    const gs = G[src], gd = G[dst];
    // vx = đường dọc tại x; hy = đường ngang tại y (giữa hai ô đặt thẳng hàng) → quy ra exit/entry
    let exit = t.exit, entry = t.entry;
    if (t.vx !== undefined) {
      const down = ctr(gd)[1] > ctr(gs)[1];
      exit = [round3((t.vx - gs.x) / gs.w), down ? 1 : 0];
      entry = [round3((t.vx - gd.x) / gd.w), down ? 0 : 1];
    }
    if (t.hy !== undefined) {
      const right = ctr(gd)[0] > ctr(gs)[0];
      exit = [right ? 1 : 0, round3((t.hy + DY - gs.y) / gs.h)];
      entry = [right ? 0 : 1, round3((t.hy + DY - gd.y) / gd.h)];
    }
    const pts = t.f === t.t ? loopPts(gs, t.loop) : (t.pts ?? []).map(([x, y]) => [x, y + DY]);
    const fixed = (g, r) => [g.x + g.w * r[0], g.y + g.h * r[1]];
    const p0 = exit ? fixed(gs, exit) : perimeter(gs, pts[0] ?? (entry ? fixed(gd, entry) : ctr(gd)));
    const pn = entry ? fixed(gd, entry) : perimeter(gd, pts[pts.length - 1] ?? (exit ? fixed(gs, exit) : ctr(gs)));
    E.push({ t, src, dst, pts, exit, entry, P: [p0, ...pts, pn], lab: labelOf(t) });
  }

  // 3. Vật cản cho nhãn: ô trạng thái, giả trạng thái, đầu và viền của composite, vùng tiêu đề
  const obstacles = [{ x: 0, y: 0, w: PAGE_W, h: TOP }];
  for (const [k, g] of Object.entries(G)) {
    if (g.composite) {
      if (g.s.separate) obstacles.push({ x: g.x, y: g.y, w: Math.max(frameTab(g.s), textWidth(g.s.sub ?? '', FS.small) + 24), h: 58 });
      else obstacles.push({ x: g.x, y: g.y, w: Math.max(textWidth(g.s.id, FS.name), textWidth(g.s.sub ?? '', FS.small)) + 30, h: 42 });
      obstacles.push({ x: g.x - 3, y: g.y - 3, w: g.w + 6, h: 6 }, { x: g.x - 3, y: g.y + g.h - 3, w: g.w + 6, h: 6 },
        { x: g.x - 3, y: g.y - 3, w: 6, h: g.h + 6 }, { x: g.x + g.w - 3, y: g.y - 3, w: 6, h: g.h + 6 });
    } else obstacles.push({ x: g.x - 2, y: g.y - 2, w: g.w + 4, h: g.h + 4, key: k });
  }
  // 4. Đặt nhãn: nhãn lớn trước; thử nhiều vị trí dọc cạnh và lệch sang hai bên, chọn chỗ ít đè nhất
  const placed = [];
  for (const e of [...E].sort((a, b) => b.lab.w * b.lab.h - a.lab.w * a.lab.h)) {
    if (!e.lab.lines.length) continue;
    const { w, h } = e.lab;
    const ts = e.t.f === e.t.t ? [0.5, 0.35, 0.65] : [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82];
    let best = null;
    for (const tt of ts) {
      const p = pointAt(e.P, tt), nx = -p.uy, ny = p.ux;
      const a = (Math.abs(nx) * w + Math.abs(ny) * h) / 2 + 4;
      for (const m2 of [0, a, -a, a + 24, -(a + 24), a + 50, -(a + 50), a + 90, -(a + 90), a + 140, -(a + 140)]) {
        const cx = p.x + nx * m2, cy = p.y + ny * m2;
        const r = { x: cx - w / 2, y: cy - h / 2, w, h };
        let sc = Math.abs(tt - 0.5) * 30 + Math.abs(m2) * 0.25;
        const sd = e.t.side, dxs = cx - p.x, dys = cy - p.y;
        if (sd && ((sd === 'left' && dxs > -2) || (sd === 'right' && dxs < 2) || (sd === 'above' && dys > -2) || (sd === 'below' && dys < 2))) sc += m2 ? 300 : 60;
        if (r.x < 8 || r.x + r.w > PAGE_W - 8) sc += 1e6;
        for (const o of obstacles) sc += overlap(r, o) * 40;
        for (const q of placed) sc += overlap(r, q) * 40;
        for (const o of E) if (o !== e) sc += segInRect(o.P, r) * 6;
        if (m2 && segInRect(e.P, r) > 6) sc += 30; // nhãn lệch mà vẫn đè lên chính cạnh của nó: kém rõ
        if (!best || sc < best.sc) best = { sc, r, gx: 2 * tt - 1, dx: nx * m2, dy: ny * m2 };
      }
    }
    e.place = best; placed.push(best.r);
    if (best.sc >= 400) warn(`label of ${e.t.f} → ${e.t.t} overlaps (score ${Math.round(best.sc)})`);
    if (process.env.DEBUG_LABELS === m.key) console.log(`  [${m.key}] ${e.t.f} → ${e.t.t}: x=${Math.round(best.r.x)} y=${Math.round(best.r.y)} w=${Math.round(w)} h=${Math.round(h)} score=${Math.round(best.sc)}`);
  }

  // 5. Ghi ô: composite trước (nằm dưới), rồi các ô khác; con của composite dùng toạ độ tương đối
  const order = Object.keys(G).sort((a, b) => (G[b].composite ? 1 : 0) - (G[a].composite ? 1 : 0));
  for (const k of order) {
    const g = G[k];
    const parent = g.parent && G[g.parent]?.composite ? g.parent : undefined;
    const ox = parent ? G[parent].x : 0, oy = parent ? G[parent].y : 0;
    let style, value = '';
    if (g.pseudo) style = g.pseudo === 'start' ? S.start : S.end;
    else if (g.shape === 'rhombus') style = ST.choice;
    else if (g.composite && g.s.separate) {
      style = frameStyle(g.s);
      value = `<b>stm ${htmlEsc(g.s.id)}</b>${g.s.planned ? ' «planned»' : ''}`;
    } else if (g.composite) {
      style = g.s.planned ? ST.compositePlanned : ST.composite;
      value = `<b>${htmlEsc(g.s.id)}${g.s.planned ? ' «planned»' : ''}</b>${g.s.sub ? `<br><font style="font-size:${FS.small}px" color="#475569">${htmlEsc(g.s.sub)}</font>` : ''}`;
    } else {
      const s = g.s;
      style = s.planned ? ST.planned : s.reserved ? ST.reserved : s.final ? ST.final : ST.normal;
      value = stateHtml(s);
    }
    d.vertex(value, style, g.x - ox, g.y - oy, g.w, g.h, { key: k, raw: true, parent });
    if (g.composite && g.s.separate && g.s.sub)
      d.text(`<font color="${g.s.planned ? PLAN : '#475569'}">separate machine: ${htmlEsc(g.s.sub)}</font>`, 10, 34, g.w - 20, 22, `fontSize=${FS.small};`, { parent: k });
  }
  // 6. Ghi cạnh (tự ghi mxCell để đặt được vị trí nhãn)
  for (const e of E) {
    const style = EDGE + (e.t.planned ? E_PLAN : e.t.reserved ? E_NOTW : '')
      + (e.exit ? `exitX=${e.exit[0]};exitY=${e.exit[1]};exitDx=0;exitDy=0;exitPerimeter=0;` : '')
      + (e.entry ? `entryX=${e.entry[0]};entryY=${e.entry[1]};entryDx=0;entryDy=0;entryPerimeter=0;` : '');
    const pts = e.pts.length ? `<Array as="points">${e.pts.map(([x, y]) => `<mxPoint x="${Math.round(x)}" y="${Math.round(y)}"/>`).join('')}</Array>` : '';
    const pl = e.place;
    const geo = pl ? `<mxGeometry x="${pl.gx.toFixed(3)}" relative="1" as="geometry">${pts}<mxPoint x="${Math.round(pl.dx)}" y="${Math.round(pl.dy)}" as="offset"/></mxGeometry>`
      : `<mxGeometry relative="1" as="geometry">${pts}</mxGeometry>`;
    d.cells.push(`<mxCell id="${d.id()}" value="${escHtml(e.lab.html)}" style="${style}" edge="1" parent="1" source="${d.ids.get(e.src)}" target="${d.ids.get(e.dst)}">${geo}</mxCell>`);
  }

  // 7. Ghi chú (điều kiện tạo + ghi chú của máy + chú giải) ở dưới cùng
  let bottom = 0;
  for (const g of Object.values(G)) bottom = Math.max(bottom, g.y + g.h);
  for (const r of placed) bottom = Math.max(bottom, r.y + r.h);
  const items = [...creationNotes(m), ...(m.notes ?? []).map(strip), ...(m.decisions ? [PENDING] : []), LEGEND];
  const NW = 1560, LH = FS.small * 1.25;
  const noteLines = items.reduce((a, x) => a + Math.ceil(0.96 * textWidth('• ' + x, FS.small) / (NW - 24)), 0);
  const noteY = bottom + 26;
  const noteH = Math.ceil(30 + noteLines * LH);
  d.vertex(`<b>Notes</b><br>${items.map((x, i) => (i === items.length - 1 ? `<font color="#64748b">${htmlEsc(x)}</font>` : '• ' + htmlEsc(x))).join('<br>')}`, ST.note, 40, noteY, NW, noteH, { raw: true });

  // 8. Kiểm tra bố cục: cạnh cắt qua ô khác, ô chồng nhau, ra ngoài trang, cỡ chữ khi in A4
  for (const e of E) {
    const rel = new Set([e.src, e.dst, ...ancestors(e.src), ...ancestors(e.dst)]);
    const hit = new Set();
    for (const [k, g] of Object.entries(G)) {
      if (rel.has(k)) continue;
      for (let i = 1; i < e.P.length; i++) {
        const [x1, y1] = e.P[i - 1], [x2, y2] = e.P[i];
        const kk = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4));
        for (let j = 0; j <= kk; j++) if (inside(g, x1 + (x2 - x1) * j / kk, y1 + (y2 - y1) * j / kk)) hit.add(k);
      }
    }
    if (hit.size) warn(`edge ${e.t.f} → ${e.t.t} crosses ${[...hit].join(', ')}`);
    if (e.exit && e.exit.some(v => v < 0 || v > 1)) warn(`edge ${e.t.f} → ${e.t.t} exit point outside the source box`);
    if (e.entry && e.entry.some(v => v < 0 || v > 1)) warn(`edge ${e.t.f} → ${e.t.t} entry point outside the target box`);
  }
  const solid = Object.entries(G);
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const [ka, A] = solid[i], [kb, B] = solid[j];
    if (ancestors(ka).includes(kb) || ancestors(kb).includes(ka)) continue;
    if (overlap(A, B) > 1) warn(`${ka} overlaps ${kb}`);
  }
  for (const [k, g] of solid) if (g.x < 8 || g.x + g.w > PAGE_W - 8 || g.y < TOP) warn(`${k} outside the page area`);
  const pt = printedPt(20, 10, 1620, noteY + noteH, FS.small);
  if (pt < 5) warn(`text prints at ${pt.toFixed(1)} pt on A4 (< 5 pt): compact or split into parts`);
  checkStructure(m, warn);
}
const LEGEND = 'Legend: solid = implemented on develop · dashed grey «planned» = Register v1.4, not in code yet (grey text on a solid transition = planned guard or effect) · dashed orange "(not written by code)" = value allowed by the CHECK constraint but never written · parts removed in v1.4 are not drawn (see Notes and the Index).';
// Dòng Notes cho điều kiện tạo: chuyển ra từ initial không có trigger/guard (UML 2.5.1), nên điều kiện ghi ở đây
function creationNotes(m) {
  return m.trans.filter(t => t.f === '[*]' && (t.pre || t.ppre)).map(t => {
    const op = strip(t.l ?? '').replace(/^\/\s*created\s+(by|on)\s+/, '').split(':')[0].trim();
    return `Created by ${op} only if: ${[t.pre, t.ppre && `«planned» ${t.ppre}`].filter(Boolean).join('; ')}${t.uc ? ` (${t.uc})` : ''}.`;
  });
}

// Kiểm tra cấu trúc: đến được từ [*]; trạng thái không kết thúc có đường ra; trạng thái kết thúc có cạnh tới [*];
// mỗi vùng tối đa một initial, initial không có trigger/guard (SM-01, SM-04); khớp danh sách CHECK
function checkStructure(m, warn) {
  const byId = Object.fromEntries(m.states.map(s => [s.id, s]));
  const kids = (id) => m.states.filter(s => s.parent === id).map(s => s.id);
  const reach = new Set(), queue = [];
  const visit = (id) => {
    if (reach.has(id)) return; reach.add(id); queue.push(id);
    if (byId[id]?.parent) visit(byId[id].parent);
    if (byId[id]?.composite) for (const t of m.trans) if (t.f === '[*]' && byId[t.t]?.parent === id) visit(t.t);
  };
  for (const t of m.trans) if (t.f === '[*]' && !byId[t.t]?.parent) visit(t.t);
  // composite "separate" là một máy riêng đặt cùng trang: bắt đầu từ chính nó
  for (const s of m.states) if (s.separate) visit(s.id);
  for (const t of m.trans) if (t.f === '[*]' && byId[t.t]?.parent && reach.has(byId[t.t].parent)) visit(t.t);
  while (queue.length) {
    const id = queue.shift();
    const from = [id, ...(function up(x) { const p = byId[x]?.parent; return p ? [p, ...up(p)] : []; })(id)];
    for (const t of m.trans) if (from.includes(t.f) && t.t !== '[*]') visit(t.t);
    for (const t of m.trans) if (t.f === '[*]' && byId[t.t]?.parent === id) visit(t.t);
  }
  for (const s of m.states) {
    if (s.kind === 'choice') { if (!m.trans.some(t => t.f === s.id)) warn(`choice ${s.id} has no outgoing branch`); }
    if (!reach.has(s.id)) warn(`state ${s.id} is not reachable from the initial state`);
    const ups = [s.id, ...(function up(x) { const p = byId[x]?.parent; return p ? [p, ...up(p)] : []; })(s.id)];
    const exits = m.trans.filter(t => ups.includes(t.f) && t.t !== t.f);
    if (!s.final && !s.composite && exits.length === 0 && !(s.parent && kids(s.parent).length && m.trans.some(t => t.f === s.parent)))
      warn(`state ${s.id} has no exit`);
    if (s.final && !m.trans.some(t => t.f === s.id && t.t === '[*]')) warn(`final state ${s.id} has no transition to [*]`);
  }
  // SM-01: mỗi vùng (mức ngoài cùng hoặc một composite) tối đa một initial; SM-04: initial chỉ có effect
  const regionOf = (t) => (byId[t.t]?.parent ?? '(top)');
  const perRegion = {};
  for (const t of m.trans.filter(x => x.f === '[*]')) {
    perRegion[regionOf(t)] = (perRegion[regionOf(t)] ?? 0) + 1;
    if (t.l && (!/^\s*\//.test(t.l) || /\[/.test(t.l) || /\[/.test(t.p ?? ''))) warn(`initial transition to ${t.t} has a trigger or guard`);
  }
  for (const [r, c] of Object.entries(perRegion)) if (c > 1) warn(`region ${r} has ${c} initial pseudostates`);
  const values = m.states.filter(s => !s.kind && !s.derived && !s.planned).map(s => s.id);
  for (const v of values) if (!m.check.includes(v)) warn(`state ${v} is not in the CHECK list`);
  if (!m.checkGroup) for (const v of m.check) if (!values.includes(v) && !(m.removed ?? []).includes(v)) warn(`CHECK value ${v} has no state`);
  for (const v of m.removed ?? []) if (values.includes(v)) warn(`removed value ${v} is still drawn`);
  for (const s of m.states) if (s.planned && !s.derived && m.check.includes(s.id)) warn(`planned state ${s.id} already exists in the CHECK list`);
  for (const t of m.trans) if (/\{p\}/.test(t.l ?? '') && !/\{\/p\}/.test(t.l ?? '')) warn(`label ${t.f} → ${t.t} has an unclosed {p}`);
}
// Cột status dùng chung giữa nhiều máy (sales_order: BulkPreOrder + InvoicedSale | FinalOrder): hợp các trạng thái phải phủ đủ CHECK
function checkGroups() {
  const groups = {};
  for (const m of MACHINES.filter(x => x.checkGroup)) {
    groups[m.checkGroup] ??= { check: m.check, values: new Set() };
    m.states.filter(s => !s.kind && !s.derived && !s.planned).forEach(s => groups[m.checkGroup].values.add(s.id));
    (m.removed ?? []).forEach(v => groups[m.checkGroup].values.add(v));
  }
  for (const [g, { check, values }] of Object.entries(groups)) for (const v of check) if (!values.has(v)) WARN.push(`${g}: CHECK value ${v} has no state in any machine of the group`);
}

// ---------------------------------------------------------------------------------------------------------------
// Trang Index, tách 2 phần để chữ in A4 không dưới 5 pt (brief §10 "Cỡ in"), giữ số hình
const ucsOf = (m) => [...new Set(m.trans.flatMap(t => String(t.uc ?? '').match(/UC\d+/g) ?? []))].sort().join(', ');
function indexPages(f) {
  // phần 1: bảng các máy
  const d = f.page('Index (1 of 2)');
  caption(d, 'Index (1/2)', `State Machine Diagrams: one row per figure, Figure ${MACHINES[0].fig.replace('Figure ', '')} to Figure ${MACHINES[MACHINES.length - 1].fig.replace('Figure ', '')} (${MACHINES.length} diagrams)`, META);
  const td = (x, extra = '') => `<td style="padding:2px 6px;border-bottom:1px solid #e2e8f0;${extra}">${x}</td>`;
  // composite là giá trị CSDL (Harvesting) được liệt kê; composite gom nhóm và vùng của thực thể khác (derived) thì không
  const stateList = (m) => m.states.filter(s => !s.kind && !s.derived).map(s => {
    const name = htmlEsc(s.label ?? s.id);
    if (s.planned) return `<font color="${PLAN}">«${name}»</font>`;
    if (s.reserved) return `<font color="${NOTW}">${name}*</font>`;
    return name;
  }).concat(m.states.filter(s => s.planned && s.derived && !s.parent && !s.composite).map(s => `<font color="${PLAN}">«${htmlEsc(s.id)}»</font>`))
    .concat(m.states.filter(s => s.planned && s.derived && s.parent && !s.phase).map(s => `<font color="${PLAN}">«${htmlEsc(s.parent)}.${htmlEsc(s.id)}»</font>`))
    .concat([...new Set(m.states.filter(s => s.phase).map(s => s.parent))].map(p => `<font color="${PLAN}">phases of ${htmlEsc(p)}: ${m.states.filter(s => s.phase && s.parent === p).map(s => `«${htmlEsc(s.id)}»`).join(', ')} (not status values)</font>`))
    .concat((m.removed ?? []).map(v => `<font color="#94a3b8">${htmlEsc(v)} (removed in v1.4)</font>`)).join(', ');
  const rows = MACHINES.map(m => `<tr>${td(`<b>${m.fig.replace('Figure ', '')}</b>`)}${td(OLD_FIG[m.key] ?? '—', 'color:#64748b')}${td(htmlEsc(m.title))}${td(stateList(m))}${td(htmlEsc(m.change))}${td(ucsOf(m) || '—')}${td(`${m.key}.mmd`)}${td(htmlEsc(m.owner))}</tr>`).join('');
  const th = (x) => `<th align="left" style="padding:2px 6px;border-bottom:1px solid #64748b">${x}</th>`;
  const colW = [36, 36, 250, 470, 250, 200, 150, 240];
  const plain = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const rowLines = (m) => Math.max(...[m.fig.replace('Figure ', ''), '', m.title, plain(stateList(m)), m.change, ucsOf(m), `${m.key}.mmd`, m.owner]
    .map((x, i) => Math.ceil(0.92 * textWidth(x, FS.small) / (colW[i] - 12)) || 1));
  const tableH = Math.ceil(30 + MACHINES.reduce((a, m) => a + rowLines(m) * FS.small * 1.2 + 6, 0));
  d.text(`<table style="font-size:${FS.small}px;border-collapse:collapse"><tr>${th('Fig.')}${th('v2.0')}${th('Machine (entity.column)')}${th(`States: CHECK values, <font color="${PLAN}">«planned»</font>, <font color="${NOTW}">not written by code*</font>`)}${th('v1.4')}${th('Use cases')}${th('Mermaid')}${th('Module (owner)')}</tr>${rows}</table>`, 20, TOP, 1610, tableH, `fontSize=${FS.small};`);
  const pt1 = printedPt(20, 10, 1630, TOP + tableH, FS.small);
  if (pt1 < 5) WARN.push(`Index (1 of 2): text prints at ${pt1.toFixed(1)} pt on A4 (< 5 pt)`);
  // phần 2: các bảng phụ
  const d2 = f.page('Index (2 of 2)');
  caption(d2, 'Index (2/2)', 'State Machine Diagrams: removed machines, classifications, planned entities, legend', META);
  let y = TOP;
  const box = (html, lines) => { const h = Math.ceil(22 + lines * FS.small * 1.25); d2.vertex(html, ST.legend, 20, y, 1610, h, { raw: true }); y += h + 16; };
  const bul = (xs) => xs.map(x => '• ' + htmlEsc(x)).join('<br>');
  const linesOf = (xs) => xs.reduce((a, x) => a + Math.ceil(0.9 * textWidth('• ' + x, FS.small) / 1580), 0);
  const removed = REMOVED.map(r => r.text ?? `${r.col} (v2.0 ${r.old}): ${r.values} — ${r.why}. Table, CHECK and services remain in V001–V017 and develop; they stay in the physical ERD.`);
  box(`<b>Removed in v1.4 (still in code) — not drawn any more</b><br>${bul(removed)}`, 1 + linesOf(removed));
  const classes = [
    'provider_transaction.match_status: Matched, Unmatched, LatePayment — set once when the webhook is booked, never changes.',
    'contract_template.status, risk_disclosure.status: Draft, Active, Retired — document versioning by seed or admin data, no API transitions.',
    'payout_account.name_match_status: Pending, Matched, Mismatched — written together with payout_account.status (Figure 4.27).',
    'harvest_record.tag_status: immutable snapshot, always Printed at recording time (trigger tr_harvest_record_immutable); crab tags are removed in v1.4.',
    'harvest.lifecycle_status NULL: rows created before V016 (read-only history), not a business state (Figure 4.24).',
    'kyc_check.result: Pending, Passed, Failed, ExceptionApproved — one row per check; only Failed → ExceptionApproved changes (UC06).',
  ];
  box(`<b>Status columns or values without a diagram (classifications, not lifecycles)</b><br>${bul(classes)}`, 1 + linesOf(classes));
  const planned = [
    'RowAllocation.status ∈ {Held, Allocated, Released}: drawn as a separate «planned» machine (frame stm RowAllocation) on Figure 4.9 because it follows the contribution. BoxRow belongs to a batch (its boxes grouped by physical_slot.row_code); a confirmed row belongs to exactly one investor; Contribution 1–N RowAllocation, at most one active allocation per row.',
    'sales_order planned values: BulkPreOrder adds Confirmed, Refunded and Forfeited, and Cancelled keeps a paid deposit until funding closes (Figure 4.17, UC54); orderType ∈ {BulkPreOrder, InvoicedSale, FinalOrder}, InvoicedSale.saleReason ∈ {LowGrade, ForfeitResale} (Figure 4.18).',
    'PreOrderQuota (batch_preorder_quota) and PreOrderHold (preorder_hold): the batch\'s crabs open for pre-order and the hold of each order (Figure 4.17); Batch.SalesWindowDays closes the sales window (Figure 4.8).',
    'RemunerationTier: approved with the batch (UC08) and locked; Invoice: one per delivered order (BulkPreOrder, InvoicedSale, FinalOrder); OrderQrCode: issued when the Operator prepares the delivery note; RevenueLine.type ∈ {DeliveredOrder, InvoicedSale, ForfeitedDeposit, FinalOrder}, immutable lines of a settlement (Figure 4.14).',
    'PriceObservation, PriceSuggestion (UC49): data and computed ranges, no lifecycle. IngestionMessage (UC52): accepted or rejected once at receipt. HarvestRecord exists since V016 and is append-only.',
  ];
  box(`<b>«planned» v1.4 entities and values</b> (none exists in code yet)<br>${bul(planned)}`, 1 + linesOf(planned));
  const legend = [`${LEGEND} UC codes follow the v1.4 use case list (UC13, UC23, UC24, UC26, UC46 removed; UC49–UC55 new; UC54 = Forfeit Deposit, UC55 = Cancel Bulk Pre-order). Design decisions of 05/11/2026 were confirmed by the lead; they are applied on Figures ${MACHINES.filter(m => m.decisions).map(m => m.fig.replace('Figure ', '')).join(', ')}. Initial transitions carry only an effect ("/ created by …"); creation preconditions are listed in each page's Notes.`];
  box(`<font color="#64748b">${htmlEsc(legend[0])}</font>`, linesOf(legend));
  const pt2 = printedPt(20, 10, 1630, y, FS.small);
  if (pt2 < 5) WARN.push(`Index (2 of 2): text prints at ${pt2.toFixed(1)} pt on A4 (< 5 pt)`);
}

// ---------------------------------------------------------------------------------------------------------------
// Mermaid (stateDiagram-v2): cùng dữ liệu với bản draw.io; nhãn ngắn (mm), nhãn đầy đủ ở dòng %% ngay sau; phần «planned» ghi bằng note
// Đã thử với Mermaid 11.4.1: dấu ':' thứ hai trong nhãn gây lỗi cú pháp, ';' tách câu lệnh; '<' đứng trước chữ cái có thể bị coi là thẻ HTML.
const mmd = (s) => strip(s).replace(/:/g, ' -').replace(/;/g, ',').replace(/#/g, 'no.').replace(/[{]/g, '(').replace(/[}]/g, ')')
  .replace(/\|/g, '/').replace(/&/g, 'and').replace(/<(?=[A-Za-z/!])/g, '‹').replace(/(?<=[A-Za-z])>/g, '›').replace(/"/g, '\'').replace(/%/g, ' pct').replace(/\s+/g, ' ').trim();
const comment = (s) => strip(s).replace(/%/g, ' pct').replace(/\s+/g, ' ').trim();
function mermaidOf(m) {
  const byId = Object.fromEntries(m.states.map(s => [s.id, s]));
  const L = [
    `%% ${m.fig} – State Machine Diagram: ${comment(m.title)} · ${VERSION}`,
    `%% Same content as CrabShare_State_Machines.drawio, page "${m.page}" (generated by gen-state.js, do not edit by hand).`,
    `%% «planned» = Register v1.4, not in code (class planned, grey dashed) · (${NW_TAG}) = CHECK value never written (class notwritten, orange dashed).`,
    '%% Labels are short (trigger [guard] / effect); the full label of each transition is in the %% line under it.',
    ...(m.decisions ? [`%% ${PENDING}`] : []),
    'stateDiagram-v2',
  ];
  const decl = (s, ind) => {
    if (s.kind === 'choice') return `${ind}state ${s.id} <<choice>>`;
    const desc = (s.label ?? s.id) + (s.phase ? ' «planned» phase' : s.planned ? ' «planned»' : s.reserved ? ` ${tagOf(s)}` : '');
    return desc !== s.id ? `${ind}state "${mmd(desc)}" as ${s.id}` : null;
  };
  const shortOf = (t) => {
    let x = t.mm ?? t.l ?? '';
    if (!x) return '';
    if (t.planned) x = '«planned» ' + x;
    if (t.reserved) x += ` ${tagOf(t)}`;
    if (t.uc) x += ' · ' + t.uc;
    return ' : ' + mmd(x);
  };
  const fullOf = (t) => [mainText(t), t.uc ? `· ${t.uc}` : '', t.p ? `«planned» ${t.p}` : ''].filter(Boolean).join(' ');
  const end = (id) => (id === '[*]' ? '[*]' : id);
  const innerOf = (t) => {
    const a = t.f === '[*]' ? byId[t.t]?.parent : byId[t.f]?.parent;
    const b = t.t === '[*]' ? byId[t.f]?.parent : byId[t.t]?.parent;
    return a && a === b ? a : null;
  };
  const edge = (t, ind) => {
    const short = shortOf(t);
    L.push(`${ind}${end(t.f)} --> ${end(t.t)}${short}`);
    const full = fullOf(t);
    if (full && mmd(full) !== short.replace(/^ : /, '')) L.push(`${ind}%% ${comment(full)}`);
  };
  for (const s of m.states) if (!s.parent && !s.composite) { const x = decl(s, '  '); if (x) L.push(x); }
  for (const c of m.states.filter(s => s.composite)) {
    L.push(`  state ${c.id} {`);
    for (const s of m.states.filter(s => s.parent === c.id)) { const x = decl(s, '    '); if (x) L.push(x); }
    for (const t of m.trans) if (innerOf(t) === c.id) edge(t, '    ');
    L.push('  }');
  }
  for (const t of m.trans) if (!innerOf(t)) edge(t, '  ');
  // note cho phần «planned» và giá trị không được code ghi; note đặt ở choice thì chuyển sang trạng thái neo
  const notes = new Map();
  const firstState = m.noteAnchor ?? m.states.find(s => !s.kind && !s.parent && !s.composite)?.id;
  const anchorOf = (id) => (byId[id]?.kind === 'choice' ? firstState : (byId[id]?.parent ?? id));
  const add = (id, x) => { const a = anchorOf(id); if (!notes.has(a)) notes.set(a, []); notes.get(a).push(x); };
  for (const s of m.states) {
    if (s.composite && s.separate) add(s.id, `${s.id} is a separate${s.planned ? ' «planned»' : ''} state machine drawn on the same page - ${s.sub ?? ''}`);
    else if (s.composite && s.planned) add(s.id, `${s.id} is «planned» - ${s.sub ?? ''}`);
    else if (s.phase) add(s.id, `${s.id} is a «planned» business phase of ${s.parent}, not a status value${s.act?.length ? ' - ' + s.act.join(', ') : ''}`);
    else if (s.planned) add(s.id, `${s.id} is «planned» (Register v1.4, not in code)${s.act?.length ? ' - ' + s.act.join(', ') : ''}`);
    else for (const a of s.act ?? []) if (a.includes('«planned»')) add(s.id, `${s.id} - ${a}`);
    if (s.reserved) add(s.id, `${s.id} - CHECK value ${tagOf(s)}`);
  }
  const nm = (x, startEnd) => (x === '[*]' ? startEnd : x);
  for (const t of m.trans) {
    const anchor = t.f === '[*]' ? t.t : t.f;
    const arrow = `${nm(t.f, 'start')} → ${nm(t.t, 'end')}`;
    const inline = (strip(t.l).match(/[^\s].*?«planned»/) && /\{p\}/.test(t.l ?? '')) ? (t.l.match(/\{p\}([^{]*)\{\/p\}/g) ?? []).map(strip).join('; ') : '';
    if (t.p) add(anchor, `«planned» on ${arrow} - ${t.p}`);
    if (inline) add(anchor, `«planned» on ${arrow} - ${inline}`);
    else if (!t.p && t.planned && t.l) add(anchor, `«planned» ${arrow} - ${t.l}`);
    if (t.ppre) add(anchor, `«planned» precondition of ${arrow} - ${t.ppre}`);
  }
  if (m.allPlanned) add(firstState, 'whole machine «planned» - no code on develop');
  for (const x of m.notes ?? []) if (x.includes('«planned»')) add(firstState, x.slice(x.indexOf('«planned»')));
  for (const [id, xs] of notes) {
    L.push(`  note right of ${id}`);
    for (const x of [...new Set(xs)]) L.push(`    ${mmd(x)}`);
    L.push('  end note');
  }
  for (const n of [...creationNotes(m), ...(m.notes ?? [])]) L.push(`  %% ${comment(n)}`);
  L.push(`  classDef planned stroke-dasharray:5 5,stroke:${PLAN},color:${PLAN},fill:#f8fafc`);
  L.push(`  classDef notwritten stroke-dasharray:5 5,stroke:${NOTW},fill:#f1f5f9`);
  L.push('  classDef terminal fill:#f1f5f9,stroke:#64748b');
  const cls = (pred) => m.states.filter(s => !s.kind && !s.composite && pred(s)).map(s => s.id);
  for (const [name, ids] of [['planned', cls(s => s.planned)], ['notwritten', cls(s => s.reserved && !s.planned)], ['terminal', cls(s => s.final && !s.planned && !s.reserved)]])
    if (ids.length) L.push(`  class ${ids.join(', ')} ${name}`);
  return L.join('\n') + '\n';
}
function mermaidReadme() {
  const rows = MACHINES.map(m => `| \`${m.key}.mmd\` | ${m.fig} | ${m.title.replace(/\|/g, '/')} | ${m.change} |`).join('\n');
  return `# Mermaid – State Machine Diagrams (v3.2 · 05/11/2026 · Register v1.4)

Mỗi máy trạng thái một file \`stateDiagram-v2\`, cùng nội dung với \`../../CrabShare_State_Machines.drawio\` (trang Index 2 phần + ${MACHINES.length} máy).
Sinh tự động bằng bộ sinh \`gen-state.js\` (cùng dữ liệu với bản draw.io) — sửa dữ liệu trong file đó rồi sinh lại, không sửa tay.

Quy ước (giống bản draw.io): trạng thái = giá trị CHECK trong V001–V017 (develop @ 420a379); «planned» = có trong Phiếu v1.4 nhưng code chưa có
(class \`planned\`, nét đứt xám, kèm \`note\`); "(not written by code)" = CHECK cho phép nhưng code không ghi (class \`notwritten\`, nét đứt cam);
phần v1.4 đã bỏ thì không vẽ, chỉ ghi ở dòng \`%%\`. Nhãn chuyển ngắn \`trigger [guard] / effect · UC\`; nhãn đầy đủ nằm ở dòng \`%%\` ngay dưới cạnh.
Chuyển ra từ initial chỉ có effect ("/ …"), điều kiện tạo ghi ở dòng \`%% Created by …\`. \`Contribution.mmd\` có thêm composite «planned» RowAllocation
(Held → Allocated → Released) đi kèm khoản góp. \`InvoicedOrder.mmd\` cũ đổi tên thành \`InvoicedSale.mmd\` (quyết định thiết kế ngày 05/11/2026, đã được trưởng nhóm xác nhận).
Ký tự \`:\` \`;\` \`#\` \`|\` \`{}\` trong nhãn được thay để đúng cú pháp Mermaid. Cần Mermaid ≥ 10 (classDef trong state diagram).

| File | Hình | Máy | Thay đổi v1.4 |
|---|---|---|---|
${rows}

Máy đã bỏ (removed in v1.4, code vẫn còn, không có file): product_listing, stock_reservation, offtake_commitment (status, deposit_status), crab_tag.
`;
}

// ---------------------------------------------------------------------------------------------------------------
function run(out) {
  WARN.length = 0;
  const f = new DrawioFile();
  indexPages(f);
  for (const m of MACHINES) drawMachine(f, m);
  checkGroups();
  f.write(path.join(out, 'CrabShare_State_Machines.drawio'));
  const dir = path.join(out, 'Mermaid', 'state');
  fs.mkdirSync(dir, { recursive: true });
  for (const old of fs.readdirSync(dir)) if (old.endsWith('.mmd') && !MACHINES.some(m => `${m.key}.mmd` === old)) fs.unlinkSync(path.join(dir, old));
  for (const m of MACHINES) fs.writeFileSync(path.join(dir, `${m.key}.mmd`), mermaidOf(m), 'utf8');
  fs.writeFileSync(path.join(dir, 'README.md'), mermaidReadme(), 'utf8');
  console.log('State machines done:', MACHINES.length, '+ Index (2 parts);', MACHINES.length, 'Mermaid files');
  if (WARN.length) { console.log(`LAYOUT WARNINGS (${WARN.length}):`); for (const w of WARN) console.log('  ' + w); }
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run, MACHINES, REMOVED, mermaidOf };
