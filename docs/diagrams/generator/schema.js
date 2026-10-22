'use strict';
// Đọc lược đồ vật lý (dump từ LocalDB sau V001–V017) và khai báo phân vùng nghiệp vụ, tên thực thể cho 3 mức ERD.
const fs = require('fs');
const path = require('path');

// Bản dump lược đồ: ưu tiên thư mục schema17 nằm cạnh bộ sinh (bản chép theo dự án), nếu không có thì dùng bản trong scratchpad.
const DUMP = fs.existsSync(path.join(__dirname, 'schema17')) ? path.join(__dirname, 'schema17') : path.join(__dirname, '..', 'schema17');

function loadSchema() {
  const tables = {};
  for (const line of fs.readFileSync(path.join(DUMP, 'columns.txt'), 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [t, ord, col, type, maxLen, prec, scale, nullable, identity, pk, fk, uq, def] = line.split('|');
    tables[t] ??= { name: t, cols: [], pk: [], fks: [], uniques: [] };
    tables[t].cols.push({ name: col, type, maxLen: +maxLen, prec: +prec, scale: +scale, nullable: nullable === '1', identity: identity === '1', pk: pk === '1', fk: fk === '1', uq: uq === '1', def: (def || '').trim() });
    if (pk === '1') tables[t].pk.push(col);
  }
  const fks = [];
  const byName = new Map();
  for (const line of fs.readFileSync(path.join(DUMP, 'fks.txt'), 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [name, child, childCol, parent, parentCol, del] = line.split('|');
    if (!byName.has(name)) { const f = { name, child, parent, cols: [], del }; byName.set(name, f); fks.push(f); tables[child]?.fks.push(f); }
    byName.get(name).cols.push([childCol, parentCol]);
  }
  for (const line of fs.readFileSync(path.join(DUMP, 'indexes.txt'), 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [t, idx, uq, cols] = line.split('|');
    if (uq === '1' && tables[t]) tables[t].uniques.push({ name: idx, cols: cols.split(',') });
  }
  return { tables, fks };
}

/** Kiểu SQL hiển thị ở mức vật lý. */
function sqlType(c) {
  const t = c.type;
  if (['nvarchar', 'varchar', 'char', 'nchar'].includes(t)) {
    if (c.maxLen === -1) return `${t}(max)`;
    const n = t.startsWith('n') ? c.maxLen / 2 : c.maxLen;
    return `${t}(${n})`;
  }
  if (t === 'decimal' || t === 'numeric') return `decimal(${c.prec},${c.scale})`;
  if (t === 'datetimeoffset') return 'datetimeoffset(3)';
  return t;
}

/** Tên EF entity / thuộc tính PascalCase từ snake_case (giống scaffold của EF Core). */
const pascal = (s) => s.split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join('');

// Phân vùng nghiệp vụ dùng cho các trang ERD (thứ tự bảng = thứ tự xếp trong trang)
const AREAS = [
  { key: 'A1', title: 'Identity, accounts & farm', fill: '#dbeafe', stroke: '#1d4ed8', tables: ['app_user', 'app_user_role', 'investor', 'customer', 'customer_address', 'kyc_check', 'payout_account', 'operator', 'operator_member', 'physical_slot', 'slot_allocation'] },
  { key: 'A2', title: 'Batch, Standard Cost, funding & contracts', fill: '#fef3c7', stroke: '#b45309', tables: ['batch', 'fee_tier', 'standard_cost_version', 'standard_cost_item', 'standard_cost_tranche_plan', 'disbursement_tranche', 'batch_account', 'batch_offtake_price', 'risk_disclosure', 'risk_acknowledgement', 'contribution', 'capital_share', 'contract_template', 'investment_contract', 'contract_signature', 'offtake_commitment'] },
  { key: 'A3', title: 'Production, evidence & alerts', fill: '#e0f2fe', stroke: '#0369a1', tables: ['production_log', 'production_threshold_version', 'slot_event', 'slot_event_detail', 'slot_event_policy_version', 'crab_item', 'crab_item_event', 'evidence', 'evidence_detection', 'evidence_review', 'capture_request', 'alert'] },
  { key: 'A4', title: 'Harvest, tags, catalogue & traceability', fill: '#ccfbf1', stroke: '#0f766e', tables: ['harvest', 'harvest_start_request', 'harvest_record', 'crab_tag', 'tag_scan', 'product_grade', 'product_listing', 'price_history', 'price_check'] },
  { key: 'A5', title: 'Orders, complaints & ratings', fill: '#ffedd5', stroke: '#c2410c', tables: ['sales_order', 'order_line', 'stock_reservation', 'complaint', 'product_rating'] },
  { key: 'A6', title: 'Payments, settlement & audit', fill: '#fee2e2', stroke: '#b91c1c', tables: ['payment_request', 'provider_transaction', 'payment_instruction', 'settlement', 'settlement_line', 'settlement_feedback', 'audit_log'] },
];
const areaOf = {};
for (const a of AREAS) for (const t of a.tables) areaOf[t] = a;

// Thực thể mức Conceptual: tên nghiệp vụ, mô tả tiếng Việt, vài thuộc tính nhận diện. Bảng kỹ thuật (idempotency, kết quả thuật toán, chi tiết kỹ thuật) không đưa vào.
const CONCEPT = {
  app_user: { name: 'User', vi: 'Người dùng', attrs: ['email', 'full name', 'roles'] },
  investor: { name: 'Investor', vi: 'Nhà đầu tư', attrs: ['investor kind', 'verification status'] },
  customer: { name: 'Customer', vi: 'Khách hàng', attrs: ['display name'] },
  customer_address: { name: 'DeliveryAddress', vi: 'Địa chỉ giao hàng', attrs: ['recipient', 'address'] },
  kyc_check: { name: 'IdentityCheck', vi: 'Lần xác minh eKYC', attrs: ['check type', 'result'] },
  payout_account: { name: 'PayoutAccount', vi: 'Tài khoản nhận tiền', attrs: ['bank', 'holder name', 'name match'] },
  operator: { name: 'Operator', vi: 'Hộ nuôi (tổ chức)', attrs: ['legal name', 'tax code', 'status'] },
  operator_member: { name: 'OperatorMember', vi: 'Thành viên hộ nuôi', attrs: ['member role'] },
  physical_slot: { name: 'Box', vi: 'Hộp nuôi (ô)', attrs: ['box code', 'status'] },
  slot_allocation: { name: 'BoxAllocation', vi: 'Gán hộp cho lô', attrs: ['allocated at', 'released at'] },
  batch: { name: 'Batch', vi: 'Lô nuôi', attrs: ['batch code', 'seed quantity', 'capital range', 'status'] },
  fee_tier: { name: 'FeeTier', vi: 'Bậc phí nền tảng', attrs: ['tier code', 'fee amount'] },
  standard_cost_version: { name: 'StandardCostVersion', vi: 'Phiên bản chi phí chuẩn', attrs: ['version no', 'status', 'locked at'] },
  standard_cost_item: { name: 'StandardCostItem', vi: 'Hạng mục chi phí', attrs: ['category', 'quantity', 'unit price'] },
  standard_cost_tranche_plan: { name: 'TranchePlan', vi: 'Kế hoạch đợt giải ngân', attrs: ['tranche no', 'unlock condition'] },
  disbursement_tranche: { name: 'DisbursementTranche', vi: 'Đợt giải ngân', attrs: ['tranche no', 'planned amount', 'status'] },
  batch_account: { name: 'BatchAccount', vi: 'Tài khoản chuyên dùng của lô', attrs: ['provider account no', 'status'] },
  risk_disclosure: { name: 'RiskDisclosure', vi: 'Bản công bố rủi ro', attrs: ['version code', 'content hash'] },
  contribution: { name: 'Contribution', vi: 'Khoản góp vốn', attrs: ['amount', 'status', 'expires at'] },
  contract_template: { name: 'ContractTemplate', vi: 'Mẫu hợp đồng', attrs: ['version code', 'content hash'] },
  investment_contract: { name: 'InvestmentContract', vi: 'Hợp đồng hợp tác', attrs: ['contract no', 'status', 'final hash'] },
  contract_signature: { name: 'ContractSignature', vi: 'Chữ ký hợp đồng', attrs: ['signer role', 'signing order', 'signed hash'] },
  offtake_commitment: { name: 'OfftakeCommitment', vi: 'Cam kết bao tiêu', attrs: ['committed qty', 'fixed price', 'deposit status', 'status'] },
  production_log: { name: 'ProductionLog', vi: 'Nhật ký nuôi hằng ngày', attrs: ['log date', 'water temp', 'pH', 'feed'] },
  production_threshold_version: { name: 'ProductionThreshold', vi: 'Ngưỡng môi trường của lô', attrs: ['version no', 'pH / temp / salinity range'] },
  slot_event: { name: 'BoxEvent', vi: 'Sự kiện hộp nuôi', attrs: ['event type', 'occurred at', 'source'] },
  slot_event_policy_version: { name: 'BoxEventPolicy', vi: 'Quy tắc sự kiện hộp', attrs: ['restock cutoff', 'mortality threshold'] },
  crab_item: { name: 'Crab', vi: 'Từng con cua', attrs: ['item uuid', 'weight', 'status'] },
  crab_item_event: { name: 'CrabHistory', vi: 'Lịch sử từng con cua', attrs: ['event type', 'occurred at'] },
  evidence: { name: 'Evidence', vi: 'Bằng chứng (ảnh trực tiếp)', attrs: ['sha256', 'captured at', 'location', 'risk score', 'review status'] },
  evidence_detection: { name: 'CrabDetection', vi: 'Kết quả nhận diện cua', attrs: ['model version', 'crab detected', 'confidence'] },
  evidence_review: { name: 'EvidenceReview', vi: 'Kết luận kiểm định viên', attrs: ['verdict', 'note'] },
  capture_request: { name: 'CaptureRequest', vi: 'Yêu cầu chụp ngẫu nhiên', attrs: ['due at', 'status'] },
  alert: { name: 'Alert', vi: 'Cảnh báo vận hành', attrs: ['alert type', 'severity', 'status'] },
  harvest: { name: 'Harvest', vi: 'Đợt thu hoạch', attrs: ['harvested at', 'count', 'total weight'] },
  harvest_record: { name: 'HarvestRecord', vi: 'Hồ sơ thu hoạch từng con', attrs: ['weight', 'grade', 'tag code'] },
  crab_tag: { name: 'CrabTag', vi: 'Tem truy xuất', attrs: ['tag code', 'status', 'activated at'] },
  tag_scan: { name: 'TagScan', vi: 'Lượt quét tem', attrs: ['scanned at', 'is order owner'] },
  product_grade: { name: 'ProductGrade', vi: 'Phân hạng sản phẩm', attrs: ['grade code', 'weight range'] },
  product_listing: { name: 'ProductListing', vi: 'Mặt hàng niêm yết', attrs: ['title', 'price per kg', 'stock', 'status'] },
  price_history: { name: 'PriceHistory', vi: 'Lịch sử giá', attrs: ['price per kg', 'effective from', 'reason'] },
  sales_order: { name: 'SalesOrder', vi: 'Đơn hàng', attrs: ['order no', 'order type', 'total amount', 'status'] },
  order_line: { name: 'OrderLine', vi: 'Dòng hàng', attrs: ['quantity', 'unit price'] },
  stock_reservation: { name: 'StockReservation', vi: 'Giữ tồn kho', attrs: ['quantity', 'expires at', 'status'] },
  complaint: { name: 'Complaint', vi: 'Khiếu nại đơn hàng', attrs: ['complaint type', 'resolution', 'status'] },
  product_rating: { name: 'ProductRating', vi: 'Đánh giá đơn hàng', attrs: ['stars', 'comment'] },
  payment_request: { name: 'PaymentRequest', vi: 'Yêu cầu thu tiền (VietQR)', attrs: ['reference code', 'purpose', 'amount', 'status'] },
  provider_transaction: { name: 'ProviderTransaction', vi: 'Giao dịch tại trung gian', attrs: ['provider txn id', 'direction', 'amount', 'match status'] },
  payment_instruction: { name: 'PaymentInstruction', vi: 'Lệnh chi', attrs: ['instruction type', 'amount', 'status'] },
  settlement: { name: 'Settlement', vi: 'Bảng quyết toán', attrs: ['revision no', 'revenue pool', 'status'] },
  settlement_line: { name: 'SettlementLine', vi: 'Dòng quyết toán', attrs: ['capital return', 'profit share', 'net payout'] },
  settlement_feedback: { name: 'SettlementFeedback', vi: 'Góp ý quyết toán', attrs: ['content', 'status', 'response'] },
  audit_log: { name: 'AuditRecord', vi: 'Nhật ký kiểm toán (chuỗi băm)', attrs: ['entity', 'action', 'prev hash', 'row hash'] },
};
// Bảng chỉ xuất hiện từ mức Logical trở đi (kỹ thuật hoặc được gộp vào thực thể khác ở mức Conceptual)
const LOGICAL_ONLY = new Set(['app_user_role', 'risk_acknowledgement', 'capital_share', 'batch_offtake_price', 'slot_event_detail', 'harvest_start_request', 'price_check']);

// Quan hệ mức Conceptual (hand-curated): [thực thể A, động từ, thực thể B, bản số A, bản số B]
// Bản số: '1' (đúng một), '0..1', '0..N', '1..N'
const CONCEPT_RELS = [
  ['User', 'is registered as', 'Investor', '1', '0..1'],
  ['User', 'is registered as', 'Customer', '1', '0..1'],
  ['User', 'belongs to farm as', 'OperatorMember', '1', '0..1'],
  ['OperatorMember', 'works for', 'Operator', '1..N', '1'],
  ['User', 'undergoes', 'IdentityCheck', '1', '0..N'],
  ['User', 'owns', 'PayoutAccount', '1', '0..N'],
  ['Operator', 'owns', 'PayoutAccount', '1', '0..N'],
  ['Customer', 'keeps', 'DeliveryAddress', '1', '0..N'],
  ['Investor', 'acknowledges', 'RiskDisclosure', '0..N', '0..N'],
  ['Operator', 'numbers', 'Box', '1', '0..N'],
  ['Operator', 'proposes', 'Batch', '1', '0..N'],
  ['Batch', 'is allocated', 'BoxAllocation', '1', '0..N'],
  ['Box', 'is assigned through', 'BoxAllocation', '1', '0..N'],
  ['FeeTier', 'applies to', 'Batch', '0..1', '0..N'],
  ['Batch', 'has', 'StandardCostVersion', '1', '1..N'],
  ['StandardCostVersion', 'consists of', 'StandardCostItem', '1', '1..N'],
  ['StandardCostVersion', 'schedules', 'TranchePlan', '1', '0..N'],
  ['Batch', 'is disbursed by', 'DisbursementTranche', '1', '0..N'],
  ['Batch', 'collects money in', 'BatchAccount', '1', '0..1'],
  ['Batch', 'sets offtake price per', 'ProductGrade', '0..N', '0..N'],
  ['Investor', 'makes', 'Contribution', '1', '0..N'],
  ['Batch', 'receives', 'Contribution', '1', '0..N'],
  ['Batch', 'snapshots capital share of', 'Investor', '0..N', '0..N'],
  ['Contribution', 'is formalised by', 'InvestmentContract', '1', '0..1'],
  ['ContractTemplate', 'is template of', 'InvestmentContract', '1', '0..N'],
  ['InvestmentContract', 'is signed by', 'ContractSignature', '1', '0..2'],
  ['User', 'signs', 'ContractSignature', '1', '0..N'],
  ['Contribution', 'extends to', 'OfftakeCommitment', '1', '0..1'],
  ['ProductGrade', 'is committed in', 'OfftakeCommitment', '1', '0..N'],
  ['Batch', 'records', 'ProductionLog', '1', '0..N'],
  ['Batch', 'is checked against', 'ProductionThreshold', '1', '0..N'],
  ['BoxAllocation', 'generates', 'BoxEvent', '1', '0..N'],
  ['Batch', 'follows', 'BoxEventPolicy', '1', '0..N'],
  ['BoxAllocation', 'houses', 'Crab', '1', '0..N'],
  ['Batch', 'stocks', 'Crab', '1', '0..N'],
  ['Crab', 'replaces', 'Crab', '0..1', '0..1'],
  ['Crab', 'has', 'CrabHistory', '1', '0..N'],
  ['Batch', 'is evidenced by', 'Evidence', '1', '0..N'],
  ['Box', 'is photographed in', 'Evidence', '0..1', '0..N'],
  ['BoxEvent', 'is proven by', 'Evidence', '0..1', '0..N'],
  ['DisbursementTranche', 'is justified by', 'Evidence', '0..1', '0..N'],
  ['Crab', 'appears in', 'Evidence', '0..1', '0..N'],
  ['Evidence', 'is analysed by', 'CrabDetection', '1', '0..1'],
  ['Evidence', 'is judged in', 'EvidenceReview', '1', '0..N'],
  ['User', 'judges as reviewer', 'EvidenceReview', '1', '0..N'],
  ['CaptureRequest', 'is fulfilled by', 'Evidence', '1', '0..1'],
  ['Box', 'is targeted by', 'CaptureRequest', '1', '0..N'],
  ['Batch', 'raises', 'Alert', '1', '0..N'],
  ['Batch', 'is harvested in', 'Harvest', '1', '0..N'],
  ['Harvest', 'produces', 'HarvestRecord', '1', '0..N'],
  ['Crab', 'is recorded by', 'HarvestRecord', '1', '0..1'],
  ['Crab', 'carries', 'CrabTag', '1', '0..N'],
  ['Evidence', 'activates', 'CrabTag', '0..1', '0..1'],
  ['CrabTag', 'is scanned in', 'TagScan', '1', '0..N'],
  ['Batch', 'lists', 'ProductListing', '1', '0..N'],
  ['ProductGrade', 'classifies', 'ProductListing', '1', '0..N'],
  ['ProductGrade', 'grades', 'Crab', '0..1', '0..N'],
  ['ProductListing', 'keeps', 'PriceHistory', '1', '1..N'],
  ['Customer', 'places', 'SalesOrder', '1', '0..N'],
  ['Batch', 'sells through', 'SalesOrder', '1', '0..N'],
  ['OfftakeCommitment', 'is claimed by', 'SalesOrder', '0..1', '0..N'],
  ['SalesOrder', 'contains', 'OrderLine', '1', '1..N'],
  ['ProductListing', 'is ordered in', 'OrderLine', '1', '0..N'],
  ['OrderLine', 'holds', 'StockReservation', '1', '0..1'],
  ['OrderLine', 'is packed with', 'Crab', '0..1', '0..N'],
  ['SalesOrder', 'is disputed by', 'Complaint', '1', '0..N'],
  ['SalesOrder', 'is rated by', 'ProductRating', '1', '0..1'],
  ['BatchAccount', 'collects via', 'PaymentRequest', '1', '0..N'],
  ['Contribution', 'is paid through', 'PaymentRequest', '1', '0..N'],
  ['SalesOrder', 'is paid through', 'PaymentRequest', '1', '0..N'],
  ['OfftakeCommitment', 'deposits through', 'PaymentRequest', '1', '0..N'],
  ['BatchAccount', 'records', 'ProviderTransaction', '1', '0..N'],
  ['PaymentRequest', 'is matched by', 'ProviderTransaction', '0..1', '0..N'],
  ['PaymentInstruction', 'is executed as', 'ProviderTransaction', '0..1', '0..N'],
  ['BatchAccount', 'pays out via', 'PaymentInstruction', '1', '0..N'],
  ['PayoutAccount', 'receives', 'PaymentInstruction', '0..1', '0..N'],
  ['DisbursementTranche', 'is released by', 'PaymentInstruction', '0..1', '0..1'],
  ['Contribution', 'is refunded by', 'PaymentInstruction', '0..1', '0..N'],
  ['SalesOrder', 'is refunded by', 'PaymentInstruction', '0..1', '0..N'],
  ['Batch', 'is settled by', 'Settlement', '1', '0..1'],
  ['Settlement', 'allocates', 'SettlementLine', '1', '0..N'],
  ['Investor', 'is paid by', 'SettlementLine', '1', '0..N'],
  ['SettlementLine', 'is paid out by', 'PaymentInstruction', '1', '0..1'],
  ['Settlement', 'receives', 'SettlementFeedback', '1', '0..N'],
  ['User', 'writes', 'SettlementFeedback', '1', '0..N'],
  ['User', 'causes', 'AuditRecord', '0..1', '0..N'],
];

module.exports = { loadSchema, sqlType, pascal, AREAS, areaOf, CONCEPT, LOGICAL_ONLY, CONCEPT_RELS };
