'use strict';
// Sinh 3 file ERD v3.0 (04/11/2026, Phiếu v1.4), cùng ký hiệu crow's foot:
//  - Conceptual (SRS 3.1.5): trang tổng (chỉ tên thực thể và quan hệ chính) + 6 trang vùng A1–A6 (thuộc tính định danh,
//    quan hệ có tên, bản số hai đầu). Thực thể / thuộc tính v1.4 mà code chưa có ghi «planned» (nét đứt xám #64748b).
//  - Logical (Report 4 mục 2): dựng từ schema17 (V001–V017) rồi áp thay đổi v1.4; n–n đã phân rã, khoá nghiệp vụ (BK),
//    kiểu dữ liệu chung, 3NF. Trang tổng chỉ có tên thực thể; 6 trang vùng đủ thuộc tính; trang truy vết C → L → P (+ lớp code).
//  - Physical: đúng code (schema17), trang tổng chỉ có tên bảng, 6 trang vùng đủ cột; thay đổi v1.4 nằm ở Logical.
// Phần v1.4 đã bỏ chỉ ghi trong Notes (riêng Physical vẫn vẽ đúng code).
// Mọi trang dùng bộ xếp hình arrange(): thực thể xếp cột theo BFS nên mỗi quan hệ chỉ nối hai cột kề nhau, có làn dọc riêng,
// không đường nào cắt qua thực thể; Logical/Physical gắn đầu đường vào đúng dòng khoá ngoại nên không cần nhãn vai trò.
// run() ghi thêm Logical_ERD.mmd (Mermaid erDiagram) vào cùng thư mục ra.
const fs = require('fs');
const path = require('path');
const { DrawioFile, S, FONT, stackBox, escHtml } = require('./lib');
const { loadSchema, sqlType, pascal, AREAS } = require('./schema');

const VER = 'v3.2 · 05/11/2026 · Register v1.4';
const META = (v) => `${VER} · crow's foot · ${v}`;
// Cột "dấu vết người thao tác" trỏ về app_user: không vẽ trên trang tổng và trang vùng (cột vẫn có cờ FK trong hộp)
const STAMP_COLS = new Set(['approved_by', 'created_by', 'actor_id', 'actor_user_id', 'reviewed_by', 'resolved_by', 'recorded_by', 'printed_by', 'scanned_by', 'changed_by', 'hidden_by', 'declared_by', 'completed_by', 'acknowledged_by']);
// Unique index có điều kiện (WHERE trạng thái …) trong V001/V004/V016: không làm quan hệ thành 1–1 (kiểm trong database/migrations).
const FILTERED_UNIQUE = new Set(['ux_customer_address_default', 'ux_slot_active', 'ux_cost_version_locked', 'ux_crab_item_growing_slot', 'ux_crab_tag_active', 'ux_crab_tag_non_void', 'ux_harvest_open_batch', 'ux_payout_active_user', 'ux_payout_active_operator']);
const GREY = '#64748b', AMBER = '#b45309';
const PL = `<font color="${GREY}"><i>«planned»</i></font>`;
const PLANNED_BOX = `dashed=1;dashPattern=6 4;strokeColor=${GREY};fillColor=#f8fafc;fontColor=#475569;`;
const PLANNED_EDGE = `dashed=1;dashPattern=6 4;strokeColor=${GREY};`;
const FS_TITLE = 13, FS_ATTR = 12, FS_LABEL = 11, ROW = 20, HEAD = 28;
const ATTR = S.attr + `fontSize=${FS_ATTR};`;

const card = (c) => ({ '1': 'ERmandOne', '0..1': 'ERzeroToOne', '0..N': 'ERzeroToMany', '1..N': 'ERoneToMany', '0..2': 'ERzeroToMany' }[c] ?? 'ERmandOne');
const AREA = Object.fromEntries(AREAS.map(a => [a.key, a]));
// Tiêu đề vùng theo v1.4 (cùng khoá và màu với AREAS của schema.js, vốn theo code)
const AREA14 = {
  A1: 'Identity, accounts, farm and boxes', A2: 'Batch, Standard Cost, funding and contracts', A3: 'Production, evidence and alerts',
  A4: 'Harvest, traceability and pricing', A5: 'Bulk orders, invoices and complaints', A6: 'Payments, settlement and audit',
};
function legend(d, x, y, lines, w = 1100) {
  const per = Math.floor((w - 14) / 5.5); // ~5,5 px mỗi ký tự ở cỡ 11
  const n = lines.reduce((t, l) => t + Math.max(1, Math.ceil(String(l).replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, 'x').length / per)), 0);
  const h = 24 + n * 15;
  d.vertex(`<b>Legend</b><br>${lines.join('<br>')}`, S.legend + 'fontSize=11;', x, y, w, h, { raw: true });
  return y + h;
}
/** Caption trang (chữ phụ 11 px theo brief 9.5); bề rộng ước theo độ dài chữ để không nới rộng trang. */
function cap(d, fig, title, meta) {
  const plain = (t) => String(t).replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, 'x');
  const w = Math.max(600, Math.min(1800, Math.ceil(Math.max(plain(`${fig} – ${title}`).length * 8.2, plain(meta).length * 6.1)) + 20));
  d.text(`<b>${fig} – ${title}</b><br><font style="font-size:11px" color="#64748b">${meta}</font>`, 20, 10, w, 46, 'fontSize=14;overflow=visible;');
}
// Trang áp quyết định thiết kế 05/11/2026 (đã được trưởng nhóm xác nhận): một dòng Notes thống nhất (brief mục 11.2)
const PENDING = 'Design decisions of 05/11/2026 applied here were confirmed by the lead';
const PEND_C = { A1: 'box rows', A2: 'Batch opening condition, box rows and row allocation', A5: 'InvoicedSale with sale reason, one Invoice per delivered order, forfeited deposits', A6: 'revenue line types, survival rate, Standard Cost of the funded boxes' };
const PEND_L = { A1: 'box rows', 'A2-1': 'Batch opening condition, minimum contribution = capital of one box row', 'A2-2': 'row allocation statuses, contribution = capital of its box rows', A5: 'InvoicedSale with SaleReason, one Invoice per delivered order, balance on the weighed kg, forfeited deposits', A6: 'revenue line types, survival rate, Standard Cost of the funded boxes' };
function pendingNote(d, x, y, w, what) {
  const text = `<b>Notes</b> — ${PENDING} (${what}).`;
  const lines = Math.max(1, Math.ceil(text.replace(/<[^>]+>/g, '').length / Math.floor((w - 14) / 5.5)));
  d.vertex(text, S.note + 'fontSize=11;', x, y, w, 20 + lines * 15, { raw: true });
}
function note(d, x, y, w, h, html) { d.vertex(html, S.note + 'fontSize=11;', x, y, w, h, { raw: true }); return y + h; }
const textW = (s, px) => String(s).replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, 'x').length * px * 0.55 + 6;

// =====================================================================================================
// Mô hình v1.4: tên thực thể, bảng bị bỏ, thay đổi trên bảng còn giữ, thực thể mới «planned»
const NAME = {
  app_user: 'User', app_user_role: 'UserRole', investor: 'Investor', customer: 'Customer', customer_address: 'DeliveryAddress',
  kyc_check: 'IdentityCheck', payout_account: 'PayoutAccount', operator: 'Operator', operator_member: 'OperatorMember',
  physical_slot: 'Box', slot_allocation: 'BoxAllocation',
  batch: 'Batch', fee_tier: 'FeeTier', standard_cost_version: 'StandardCostVersion', standard_cost_item: 'StandardCostItem',
  standard_cost_tranche_plan: 'TranchePlan', disbursement_tranche: 'DisbursementTranche', batch_account: 'BatchAccount',
  risk_disclosure: 'RiskDisclosure', risk_acknowledgement: 'RiskAcknowledgement', contribution: 'Contribution', capital_share: 'CapitalShare',
  contract_template: 'ContractTemplate', investment_contract: 'InvestmentContract', contract_signature: 'ContractSignature',
  production_log: 'ProductionLog', slot_event: 'BoxEvent', slot_event_detail: 'BoxEventDetail',
  slot_event_policy_version: 'BoxEventPolicy', crab_item: 'Crab', crab_item_event: 'CrabHistory', evidence: 'Evidence',
  evidence_detection: 'CrabDetection', evidence_review: 'EvidenceReview', capture_request: 'CaptureRequest', alert: 'Alert',
  harvest: 'Harvest', harvest_start_request: 'HarvestStartRequest', harvest_record: 'HarvestRecord', product_grade: 'ProductGrade',
  sales_order: 'SalesOrder', complaint: 'Complaint', product_rating: 'ProductRating',
  payment_request: 'PaymentRequest', provider_transaction: 'ProviderTransaction', payment_instruction: 'PaymentInstruction',
  settlement: 'Settlement', settlement_line: 'SettlementLine', settlement_feedback: 'SettlementFeedback', audit_log: 'AuditRecord',
};
// Tên lớp entity trong code (EF scaffold = PascalCase của tên bảng, trừ lớp viết tay) — cột "Class" của Table 4.2 (G-03)
const CLASS_OF = (t) => ({ harvest_start_request: 'HarvestStartRequestLog' }[t] ?? pascal(t));
// Bảng code còn dùng nhưng v1.4 đã bỏ khỏi mô hình nghiệp vụ: chỉ ghi trong Notes, chỉ còn vẽ ở Physical ERD
const REMOVED = {
  product_listing: 'Listing / Catalog', price_history: 'Listing / Catalog (listing price history)', price_check: 'Listing / Catalog (price anomaly check)',
  order_line: 'Cart / checkout (retail line per listing)', stock_reservation: 'Cart / checkout (listing stock hold)',
  offtake_commitment: 'Offtake window (investor offtake)', batch_offtake_price: 'Offtake window (offtake price per grade)',
  crab_tag: 'CrabTag (printed per-crab tag)', tag_scan: 'CrabTag (tag scans)',
  production_threshold_version: 'water-quality thresholds (temperature, salinity and pH are not needed in v1.4)',
};
// Thay đổi v1.4 trên bảng còn giữ. drop = cột v1.4 bỏ (ghi trong Notes) · rename = đổi tên thuộc tính · add = thuộc tính «planned»
// opt = thành tuỳ chọn · change = đổi nghĩa / miền giá trị («changed») · derived = dẫn xuất hoặc bản chụp lưu một lần (dấu /)
const V14 = {
  operator: { add: [['FarmLatitude', 'Decimal', { opt: true }], ['FarmLongitude', 'Decimal', { opt: true }]] },
  customer_address: { add: [['Latitude', 'Decimal', { opt: true }], ['Longitude', 'Decimal', { opt: true }]] },
  slot_allocation: { add: [['BoxRowId', 'Integer', { fk: 'BoxRow' }]] },
  batch: {
    rename: { offtake_preorder_cap_pct: 'PreOrderCapPct', offtake_deposit_pct: 'DepositPct' },
    change: { offtake_preorder_cap_pct: 'share of crabs open to pre-order (offtake part removed)', offtake_deposit_pct: 'deposit ratio of bulk pre-orders (already used by PreorderService), copied from the platform parameter', min_contribution: 'capital of one BoxRow; the platform minimum contribution only floors the row capital' },
    add: [['PricePerKgVnd', 'Money'], ['FloorPriceVnd', 'Money'], ['SurvivalThresholdPct', 'Decimal'], ['DeliveryRadiusKm', 'Decimal'], ['MinPreOrderRatioPct', 'Decimal'], ['SalesWindowDays', 'Integer']],
    derived: ['total_confirmed_capital', 'platform_fee_amount', 'min_contribution'],
    rule: 'opens when confirmed capital ≥\nMinViableCapital and pre-order ratio\n≥ MinPreOrderRatioPct; else refund all\n(confirmed by the lead)',
  },
  contribution: { change: { amount: 'sum of the capital of its BoxRows' }, rule: 'Amount = Σ CapitalVnd of its BoxRows\n(confirmed by the lead)' },
  sales_order: {
    drop: ['offtake_id'], opt: ['customer_id'],
    change: { order_type: 'BulkPreOrder | InvoicedSale | FinalOrder', customer_id: 'optional: an invoiced order may go to an outside buyer', status: 'adds Confirmed, Refunded, Forfeited (Figures 4.17, 4.18)' },
    add: [['CrabCount', 'Integer', { opt: true }], ['EstimatedKg', 'Decimal', { opt: true }], ['WeighedKg', 'Decimal', { opt: true }], ['TransitLossKg', 'Decimal', { opt: true }], ['BalanceVnd', 'Money', { opt: true, derived: true }], ['ForfeitedAt', 'DateTime', { opt: true }], ['SaleReason', 'Text', { opt: true }]],
    derived: ['recipient_name', 'recipient_phone', 'shipping_address'],
    rule: 'SaleReason only for InvoicedSale\n(confirmed by the lead)',
  },
  payment_request: { drop: ['offtake_id'], change: { purpose: 'Contribution | PreOrderDeposit | PreOrderBalance | OrderPayment (invoiced orders)' } },
  crab_item: { drop: ['order_line_id'], add: [['OrderId', 'Integer', { fk: 'SalesOrder', opt: true }]] },
  crab_item_event: { drop: ['tag_id'] },
  harvest: { derived: ['harvested_count', 'total_weight_kg'] },
  harvest_record: { drop: ['tag_id', 'tag_code', 'tag_status'], derived: ['slot_code', 'grade_code', 'grade_name', 'harvested_count', 'total_weight_kg'] },
  production_log: { drop: ['water_temp_c', 'salinity_ppt', 'ph', 'threshold_version_id'], add: [['IngestionMessageId', 'Integer', { fk: 'IngestionMessage', opt: true, uq: true }]] },
  slot_event: { add: [['IngestionMessageId', 'Integer', { fk: 'IngestionMessage', opt: true, uq: true }]] },
  evidence: { add: [['IngestionMessageId', 'Integer', { fk: 'IngestionMessage', opt: true, uq: true }]] },
  settlement: {
    add: [['SurvivalRatePct', 'Decimal', { derived: true }], ['AppliedTierId', 'Integer', { fk: 'RemunerationTier', opt: true }]],
    change: { operator_share_pct: 'remuneration % applied after the survival tier' }, derived: ['actual_revenue', 'locked_standard_cost', 'revenue_pool', 'operator_remuneration'],
  },
  settlement_line: { derived: ['net_payout'] },
};
// Thực thể v1.4 chưa có bảng (brief mục 7.2). Thuộc tính: [tên, kiểu, {pk, fk, opt, uq}]. Tên dùng chung với Class/Sequence (G-03, ND-24, ND-25, ND-26).
const NEW = [
  { name: 'BoxRow', area: 'A1', attrs: [['BoxRowId', 'Integer', { pk: true }], ['BatchId', 'Integer', { fk: 'Batch' }], ['RowCode', 'Text'], ['BoxCount', 'Integer', { derived: true }], ['CapitalVnd', 'Money', { derived: true }]], bk: [['BatchId', 'RowCode']],
    rule: 'groups allocated boxes by Box.RowCode;\nCapitalVnd = BoxCount × cost per box,\nnot below the platform minimum\n(confirmed by the lead)' },
  { name: 'RowAllocation', area: 'A2', attrs: [['RowAllocationId', 'Integer', { pk: true }], ['ContributionId', 'Integer', { fk: 'Contribution' }], ['BoxRowId', 'Integer', { fk: 'BoxRow' }], ['Status', 'Text']], rule: 'at most one Held or Allocated\nallocation per BoxRow\n(confirmed by the lead)' },
  { name: 'RemunerationTier', area: 'A2', attrs: [['RemunerationTierId', 'Integer', { pk: true }], ['BatchId', 'Integer', { fk: 'Batch' }], ['TierNo', 'Integer'], ['MinSurvivalPct', 'Decimal'], ['MaxSurvivalPct', 'Decimal', { opt: true }], ['RemunerationPct', 'Decimal']], bk: [['BatchId', 'TierNo']] },
  { name: 'IngestionMessage', area: 'A3', attrs: [['IngestionMessageId', 'Integer', { pk: true }], ['OperatorId', 'Integer', { fk: 'Operator' }], ['ClientMessageId', 'Text'], ['MessageType', 'Text'], ['BatchCode', 'Text'], ['BoxCode', 'Text', { opt: true }], ['OccurredAt', 'DateTime'], ['PayloadJson', 'Text'], ['ReceivedAt', 'DateTime'], ['Status', 'Text'], ['RejectReason', 'Text', { opt: true }]], bk: [['OperatorId', 'ClientMessageId']], rule: 'BatchCode, BoxCode as received' },
  { name: 'PriceObservation', area: 'A4', attrs: [['PriceObservationId', 'Integer', { pk: true }], ['ObservedOn', 'Date'], ['Source', 'Text'], ['SourceRef', 'Text', { opt: true }], ['CrabType', 'Text'], ['GradeId', 'Integer', { fk: 'ProductGrade', opt: true }], ['PriceVndPerKg', 'Money']], bk: [['ObservedOn', 'Source', 'CrabType', 'GradeId']] },
  { name: 'PriceSuggestion', area: 'A4', attrs: [['PriceSuggestionId', 'Integer', { pk: true }], ['BatchId', 'Integer', { fk: 'Batch', opt: true }], ['CrabType', 'Text'], ['TargetFrom', 'Date'], ['TargetTo', 'Date'], ['LowVndPerKg', 'Money'], ['MidVndPerKg', 'Money'], ['HighVndPerKg', 'Money'], ['MapePct', 'Decimal'], ['DataFrom', 'Date'], ['DataTo', 'Date'], ['GeneratedAt', 'DateTime']], rule: 'BatchId set when the Batch is saved;\nshown as a range with a warning' },
  { name: 'Invoice', area: 'A5', attrs: [['InvoiceId', 'Integer', { pk: true }], ['OrderId', 'Integer', { fk: 'SalesOrder', uq: true }], ['InvoiceNo', 'Text', { uq: true }], ['BuyerName', 'Text'], ['BuyerTaxCode', 'Text', { opt: true }], ['AmountVnd', 'Money'], ['IssuedAt', 'DateTime']], rule: 'one per delivered order (BulkPreOrder,\nInvoicedSale or FinalOrder)\n(confirmed by the lead)' },
  { name: 'PreOrderQuota', area: 'A5', attrs: [['BatchId', 'Integer', { pk: true, fk: 'Batch', uq: true }], ['MaxCrabCount', 'Integer'], ['HeldCrabCount', 'Integer', { derived: true }], ['DepositedCrabCount', 'Integer', { derived: true }]],
    rule: 'HeldCrabCount + DepositedCrabCount\n≤ MaxCrabCount (no overselling)' },
  { name: 'PreOrderHold', area: 'A5', attrs: [['PreOrderHoldId', 'Integer', { pk: true }], ['BatchId', 'Integer', { fk: 'PreOrderQuota' }], ['OrderId', 'Integer', { fk: 'SalesOrder', uq: true }], ['CrabCount', 'Integer'], ['Status', 'Text'], ['ExpiresAt', 'DateTime']],
    rule: 'one per order; Active until ExpiresAt\n(Orders:ReservationMinutes = 15)' },
  { name: 'OrderQrCode', area: 'A5', attrs: [['OrderQrCodeId', 'Integer', { pk: true }], ['OrderId', 'Integer', { fk: 'SalesOrder', uq: true }], ['QrToken', 'Text', { uq: true }], ['IssuedAt', 'DateTime'], ['RevokedAt', 'DateTime', { opt: true }]] },
  { name: 'RevenueLine', area: 'A6', attrs: [['RevenueLineId', 'Integer', { pk: true }], ['SettlementId', 'Integer', { fk: 'Settlement' }], ['OrderId', 'Integer', { fk: 'SalesOrder' }], ['LineType', 'Text'], ['AmountVnd', 'Money'], ['RecognisedAt', 'DateTime']], bk: [['SettlementId', 'OrderId', 'LineType']] },
];
// Khoá nghiệp vụ (business key) của các bảng còn giữ, theo unique index trong V001–V017 (bỏ index chỉ phục vụ FK ghép)
const BK = {
  User: [['Email'], ['Phone']], Operator: [['TaxCode']], Box: [['OperatorId', 'BoxCode']], PayoutAccount: [['AccountNoDigest']],
  Batch: [['BatchCode']], FeeTier: [['TierCode']], StandardCostVersion: [['BatchId', 'VersionNo']], DisbursementTranche: [['BatchId', 'TrancheNo']],
  BatchAccount: [['ProviderAccountNo'], ['BatchId']], RiskDisclosure: [['VersionCode']], ContractTemplate: [['VersionCode']],
  InvestmentContract: [['ContractNo'], ['ContributionId']], ContractSignature: [['ContractId', 'SignerRole'], ['ContractId', 'SigningOrder']],
  ProductionLog: [['BatchId', 'LogDate', 'Source']], BoxEventPolicy: [['BatchId', 'VersionNo']],
  BoxEventDetail: [['BatchId', 'RequestId']], Crab: [['CrabUuid']], CrabDetection: [['EvidenceId', 'ModelVersion']], EvidenceReview: [['EvidenceId', 'ReviewerId']],
  HarvestRecord: [['CrabId']], ProductGrade: [['GradeCode']], SalesOrder: [['OrderNo']], ProductRating: [['OrderId']],
  PaymentRequest: [['ReferenceCode']], ProviderTransaction: [['ProviderTxnId']], Settlement: [['BatchId']], SettlementLine: [['SettlementId', 'InvestorId']],
};
// Quan hệ có bản số tối thiểu 1 ở phía con (luật nghiệp vụ, CSDL không ép được): "Con.FK"
const MIN_ONE = new Set(['StandardCostItem.CostVersionId', 'StandardCostVersion.BatchId', 'OperatorMember.OperatorId', 'BoxRow.BatchId', 'BoxAllocation.BoxRowId', 'RowAllocation.ContributionId', 'RemunerationTier.BatchId']);

// Tên thuộc tính mức Logical: PascalCase như EF scaffold, đổi theo tên nghiệp vụ (Slot → Box, CrabItem → Crab)
const attrName = (col) => col === 'item_uuid' ? 'CrabUuid' : pascal(col).replace(/Slot/g, 'Box').replace(/CrabItem/g, 'Crab');
function genType(c) {
  const t = c.type;
  if (['bigint', 'int', 'smallint', 'tinyint'].includes(t)) return 'Integer';
  if (t === 'decimal' || t === 'numeric') return c.scale === 0 ? (c.prec >= 18 ? 'Money' : 'Integer') : 'Decimal';
  if (t === 'bit') return 'Boolean';
  if (t === 'date') return 'Date';
  if (t.startsWith('datetime')) return 'DateTime';
  if (t === 'uniqueidentifier') return 'UUID';
  if (t.includes('binary')) return 'Binary';
  return 'Text';
}

/** Dựng mô hình Logical v1.4 từ lược đồ vật lý (schema17) + V14 + NEW. */
function logicalModel(schema) {
  const { tables, fks } = schema;
  const ents = [];
  const byName = {};
  const areaOfTable = {};
  for (const a of AREAS) for (const t of a.tables) areaOfTable[t] = a.key;
  // cột phụ của FK ghép (vd. batch_id trong (harvest_id, batch_id)): giữ để hai dòng chắc chắn cùng một Lô
  const composite = new Set();
  for (const fk of fks) {
    if (fk.cols.length < 2 || REMOVED[fk.parent] || REMOVED[fk.child] || (V14[fk.child]?.drop ?? []).includes(fk.cols[0][0])) continue;
    for (const [c] of fk.cols) if (c === 'batch_id') composite.add(`${fk.child}.${c}`); // cột "cùng Lô" của FK ghép
  }
  for (const t of Object.keys(tables)) {
    if (REMOVED[t]) continue;
    if (!NAME[t]) throw new Error('logical: no business name for table ' + t);
    const v = V14[t] ?? {};
    const tb = tables[t];
    const attrs = [];
    for (const c of tb.cols) {
      if (['created_at', 'updated_at'].includes(c.name) || (v.drop ?? []).includes(c.name)) continue;
      const fk = tb.fks.find(f => f.cols[0][0] === c.name);
      if (fk && REMOVED[fk.parent]) throw new Error(`logical: ${t}.${c.name} references removed table ${fk.parent} but is not dropped`);
      attrs.push({
        name: v.rename?.[c.name] ?? attrName(c.name), col: c.name, type: genType(c), pk: c.pk, fk: !!c.fk, composite: composite.has(`${t}.${c.name}`),
        opt: c.nullable || (v.opt ?? []).includes(c.name), derived: (v.derived ?? []).includes(c.name),
        status: v.change?.[c.name] || v.rename?.[c.name] || (v.opt ?? []).includes(c.name) ? 'changed' : 'code', why: v.change?.[c.name],
      });
    }
    for (const [name, type, o = {}] of v.add ?? []) attrs.push({ name, type, pk: false, fk: !!o.fk, ref: o.fk, opt: !!o.opt, uq: !!o.uq, derived: !!o.derived, status: 'planned' });
    const e = { name: NAME[t], table: t, cls: CLASS_OF(t), area: areaOfTable[t], attrs, planned: false, dropped: v.drop ?? [], bk: BK[NAME[t]] ?? [], rule: v.rule };
    ents.push(e); byName[e.name] = e;
  }
  for (const n of NEW) {
    const e = { name: n.name, table: null, cls: n.name, area: n.area, planned: true, dropped: [], bk: n.bk ?? [], rule: n.rule,
      attrs: n.attrs.map(([name, type, o = {}]) => ({ name, type, pk: !!o.pk, fk: !!o.fk, ref: o.fk, opt: !!o.opt, uq: !!o.uq, derived: !!o.derived, status: 'planned' })) };
    ents.push(e); byName[e.name] = e;
  }
  for (const e of ents) for (const k of e.bk) {
    for (const a of k) if (!e.attrs.some(x => x.name === a)) throw new Error(`logical: BK ${e.name}.${a} not found`);
    if (k.length === 1) e.attrs.find(x => x.name === k[0]).uq = true;
  }
  const rels = [];
  const seen = new Set();
  for (const fk of fks) {
    if (REMOVED[fk.child] || REMOVED[fk.parent]) continue;
    if ((V14[fk.child]?.drop ?? []).includes(fk.cols[0][0])) continue;
    const child = byName[NAME[fk.child]], parent = byName[NAME[fk.parent]];
    const a = child.attrs.find(x => x.col === fk.cols[0][0]);
    const key = `${child.name}>${parent.name}:${a.name}`;
    if (seen.has(key)) continue; seen.add(key);
    const tb = schema.tables[fk.child];
    const unique = tb.uniques.some(u => !FILTERED_UNIQUE.has(u.name) && u.cols.length === 1 && u.cols[0] === a.col) || (tb.pk.length === 1 && tb.pk[0] === a.col);
    rels.push({ child: child.name, parent: parent.name, attr: a.name, opt: a.opt, unique, planned: false, stamp: STAMP_COLS.has(a.col) && fk.parent === 'app_user' });
  }
  for (const e of ents) for (const a of e.attrs) if (a.ref) {
    if (!byName[a.ref]) throw new Error('logical: unknown planned FK target ' + a.ref);
    rels.push({ child: e.name, parent: a.ref, attr: a.name, opt: a.opt, unique: !!a.uq, planned: true, stamp: false });
  }
  for (const r of rels) r.min1 = MIN_ONE.has(`${r.child}.${r.attr}`);
  return { ents, byName, rels };
}

// =====================================================================================================
// Conceptual v1.4 — thực thể nghiệp vụ và vài thuộc tính định danh / nghiệp vụ (ER-03). Thuộc tính '+' = «planned».
// Phần tử thứ hai (nghĩa tiếng Việt) chỉ để nhóm Report chép vào bảng Entities Description, không vẽ lên hình (ER-02).
// Nhật ký kỹ thuật (IngestionMessage, AuditRecord, CrabHistory) chỉ có từ mức Logical (ER-03).
const CONCEPT14 = {
  A1: [
    ['User', 'Người dùng', ['email (unique)', 'full name', 'roles']],
    ['Investor', 'Nhà đầu tư', ['investor kind', 'verification status']],
    ['Customer', 'Khách mua sỉ', ['business name']],
    ['DeliveryAddress', 'Địa chỉ giao hàng', ['address', '+location']],
    ['IdentityCheck', 'Lần xác minh eKYC', ['check type', 'result']],
    ['PayoutAccount', 'Tài khoản nhận tiền', ['bank', 'holder name']],
    ['Operator', 'Hộ nuôi (trại)', ['tax code (unique)', 'legal name', '+farm location']],
    ['OperatorMember', 'Thành viên hộ nuôi', ['member role']],
    ['Box', 'Hộp nuôi', ['box code', 'row code']],
    ['BoxRow', 'Hàng hộp của Lô', ['row code', 'box count', 'row capital'], true],
    ['BoxAllocation', 'Gán hộp cho Lô', ['allocated at', 'released at']],
  ],
  A2: [
    ['Batch', 'Lô nuôi', ['batch code (unique)', 'min viable capital', 'status', '+price per kg', '+floor price', '+survival threshold', '+delivery radius', '+min pre-order ratio', '+sales window'], false,
      'opens when capital reaches\nthe min viable capital and the\nmin pre-order ratio\n(confirmed by the lead)'],
    ['RemunerationTier', 'Bậc thù lao theo tỷ lệ sống', ['survival band', 'remuneration %'], true],
    ['FeeTier', 'Bậc phí nền tảng', ['tier code', 'fee amount']],
    ['StandardCostVersion', 'Phiên bản chi phí chuẩn', ['version no', 'status']],
    ['StandardCostItem', 'Hạng mục chi phí', ['category', 'amount']],
    ['TranchePlan', 'Kế hoạch đợt giải ngân', ['tranche no', 'unlock condition']],
    ['DisbursementTranche', 'Đợt giải ngân', ['tranche no', 'status']],
    ['BatchAccount', 'Tài khoản chuyên dùng của Lô', ['account no', 'status']],
    ['RiskDisclosure', 'Bản công bố rủi ro', ['version code']],
    ['Contribution', 'Khoản góp vốn', ['amount', 'status']],
    ['RowAllocation', 'Phần góp gắn hàng hộp', ['status'], true],
    ['ContractTemplate', 'Mẫu hợp đồng', ['version code']],
    ['InvestmentContract', 'Hợp đồng hợp tác', ['contract no', 'status']],
    ['ContractSignature', 'Chữ ký hợp đồng', ['signer role', 'signing order']],
  ],
  A3: [
    ['ProductionLog', 'Nhật ký nuôi hằng ngày', ['log date', 'feed']],
    ['BoxEvent', 'Sự kiện hộp', ['event type', 'occurred at']],
    ['BoxEventPolicy', 'Quy tắc sự kiện hộp', ['restock cutoff', 'mortality threshold']],
    ['Crab', 'Con cua trong hộp', ['weight', 'status']],
    ['Evidence', 'Bằng chứng (ảnh trực tiếp)', ['captured at', 'location', 'risk score']],
    ['CrabDetection', 'Kết quả nhận diện cua', ['crab present', 'confidence']],
    ['EvidenceReview', 'Kết luận người thẩm định', ['verdict']],
    ['CaptureRequest', 'Yêu cầu chụp ngẫu nhiên', ['due at', 'status']],
    ['Alert', 'Cảnh báo vận hành', ['alert type', 'status']],
  ],
  A4: [
    ['Harvest', 'Đợt thu hoạch', ['harvested at', 'total weight']],
    ['HarvestRecord', 'Ghi nhận thu hoạch theo hộp', ['box code', 'weight', 'grade']],
    ['ProductGrade', 'Phân hạng cua', ['grade code']],
    ['PriceObservation', 'Giá cua quan sát', ['date', 'source', 'price per kg'], true],
    ['PriceSuggestion', 'Khoảng giá gợi ý', ['low · mid · high per kg', 'MAPE'], true],
  ],
  A5: [
    ['SalesOrder', 'Đơn hàng', ['order no (unique)', 'order type', 'status', '+sale reason', '+crab count', '+weighed kg']],
    ['PreOrderQuota', 'Hạn mức đặt trước của Lô', ['max crab count', 'held · deposited counts'], true],
    ['PreOrderHold', 'Giữ suất đặt trước 15 phút', ['crab count', 'status', 'expires at'], true],
    ['Invoice', 'Hoá đơn của đơn', ['invoice no', 'amount'], true],
    ['OrderQrCode', 'Mã QR của đơn giao', ['QR token'], true],
    ['Complaint', 'Khiếu nại đơn hàng', ['complaint type', 'status']],
    ['ProductRating', 'Đánh giá đơn hàng', ['stars']],
  ],
  A6: [
    ['PaymentRequest', 'Yêu cầu thu tiền (VietQR)', ['reference code', 'purpose', 'amount']],
    ['ProviderTransaction', 'Giao dịch tại trung gian', ['provider txn id', 'amount']],
    ['PaymentInstruction', 'Lệnh chi', ['instruction type', 'amount', 'status']],
    ['Settlement', 'Bảng quyết toán', ['revenue pool', 'status', '+survival rate']],
    ['RevenueLine', 'Dòng doanh thu của quyết toán', ['type', 'amount'], true],
    ['SettlementLine', 'Dòng chia của nhà đầu tư', ['net payout']],
    ['SettlementFeedback', 'Góp ý quyết toán', ['status']],
  ],
};
// Quan hệ Conceptual v1.4: [A, động từ, B, bản số phía A, bản số phía B, planned?]. Đọc từ A sang B.
const CREL14 = [
  ['User', 'is registered as', 'Investor', '1', '0..1'],
  ['User', 'is registered as', 'Customer', '1', '0..1'],
  ['User', 'belongs to farm as', 'OperatorMember', '1', '0..1'],
  ['Operator', 'is staffed by', 'OperatorMember', '1', '1..N'],
  ['User', 'undergoes', 'IdentityCheck', '1', '0..N'],
  ['User', 'owns', 'PayoutAccount', '0..1', '0..N'],
  ['Operator', 'owns', 'PayoutAccount', '0..1', '0..N'],
  ['Customer', 'keeps', 'DeliveryAddress', '1', '0..N'],
  ['Investor', 'acknowledges', 'RiskDisclosure', '0..N', '0..N'],
  ['Operator', 'numbers', 'Box', '1', '0..N'],
  ['Operator', 'proposes', 'Batch', '1', '0..N'],
  ['Batch', 'is organised in', 'BoxRow', '1', '1..N', true],
  ['BoxRow', 'groups', 'BoxAllocation', '1', '1..N', true],
  ['Batch', 'is allocated', 'BoxAllocation', '1', '0..N'],
  ['Box', 'is assigned through', 'BoxAllocation', '1', '0..N'],
  ['FeeTier', 'applies to', 'Batch', '0..1', '0..N'],
  ['Batch', 'defines', 'RemunerationTier', '1', '1..N', true],
  ['Batch', 'has', 'StandardCostVersion', '1', '1..N'],
  ['StandardCostVersion', 'consists of', 'StandardCostItem', '1', '1..N'],
  ['StandardCostVersion', 'schedules', 'TranchePlan', '1', '0..N'],
  ['Batch', 'is disbursed by', 'DisbursementTranche', '1', '0..N'],
  ['Batch', 'collects money in', 'BatchAccount', '1', '0..1'],
  ['Investor', 'makes', 'Contribution', '1', '0..N'],
  ['Batch', 'receives', 'Contribution', '1', '0..N'],
  ['Contribution', 'is split into', 'RowAllocation', '1', '1..N', true],
  ['BoxRow', 'is reserved by', 'RowAllocation', '1', '0..N', true],
  ['Batch', 'holds capital share of', 'Investor', '0..N', '0..N'],
  ['Contribution', 'is formalised by', 'InvestmentContract', '1', '0..1'],
  ['ContractTemplate', 'is template of', 'InvestmentContract', '1', '0..N'],
  ['InvestmentContract', 'is signed by', 'ContractSignature', '1', '0..2'],
  ['User', 'signs', 'ContractSignature', '1', '0..N'],
  ['Batch', 'records', 'ProductionLog', '1', '0..N'],
  ['BoxAllocation', 'generates', 'BoxEvent', '1', '0..N'],
  ['Batch', 'follows', 'BoxEventPolicy', '1', '0..N'],
  ['BoxAllocation', 'houses', 'Crab', '1', '0..N'],
  ['Batch', 'stocks', 'Crab', '1', '0..N'],
  ['Crab', 'replaces', 'Crab', '0..1', '0..1'],
  ['Batch', 'is evidenced by', 'Evidence', '1', '0..N'],
  ['Box', 'is photographed in', 'Evidence', '0..1', '0..N'],
  ['BoxEvent', 'is proven by', 'Evidence', '0..1', '0..N'],
  ['DisbursementTranche', 'is justified by', 'Evidence', '0..1', '0..N'],
  ['Crab', 'appears in', 'Evidence', '0..1', '0..N'],
  ['Evidence', 'is analysed by', 'CrabDetection', '1', '0..N'],
  ['Evidence', 'is judged in', 'EvidenceReview', '1', '0..N'],
  ['User', 'judges as reviewer', 'EvidenceReview', '1', '0..N'],
  ['CaptureRequest', 'is fulfilled by', 'Evidence', '1', '0..1'],
  ['Box', 'is targeted by', 'CaptureRequest', '1', '0..N'],
  ['Batch', 'raises', 'Alert', '1', '0..N'],
  ['Batch', 'is harvested in', 'Harvest', '1', '0..N'],
  ['Harvest', 'produces', 'HarvestRecord', '1', '0..N'],
  ['BoxEvent', 'is weighed in', 'HarvestRecord', '1', '0..1'],
  ['Crab', 'is recorded by', 'HarvestRecord', '1', '0..1'],
  ['ProductGrade', 'grades', 'Crab', '0..1', '0..N'],
  ['ProductGrade', 'classifies', 'PriceObservation', '0..1', '0..N', true],
  ['Batch', 'is priced from', 'PriceSuggestion', '0..1', '0..N', true],
  ['Customer', 'places', 'SalesOrder', '0..1', '0..N'],
  ['Batch', 'sells through', 'SalesOrder', '1', '0..N'],
  ['SalesOrder', 'is invoiced by', 'Invoice', '1', '0..1', true],
  ['Batch', 'offers', 'PreOrderQuota', '1', '0..1', true],
  ['PreOrderQuota', 'is held by', 'PreOrderHold', '1', '0..N', true],
  ['SalesOrder', 'holds', 'PreOrderHold', '1', '0..1', true],
  ['SalesOrder', 'is traced by', 'OrderQrCode', '1', '0..1', true],
  ['SalesOrder', 'delivers', 'Crab', '0..1', '0..N', true],
  ['SalesOrder', 'is disputed by', 'Complaint', '1', '0..N'],
  ['SalesOrder', 'is rated by', 'ProductRating', '1', '0..1'],
  ['BatchAccount', 'collects via', 'PaymentRequest', '1', '0..N'],
  ['Contribution', 'is paid through', 'PaymentRequest', '0..1', '0..N'],
  ['SalesOrder', 'is paid through', 'PaymentRequest', '0..1', '0..N'],
  ['BatchAccount', 'records', 'ProviderTransaction', '1', '0..N'],
  ['PaymentRequest', 'is matched by', 'ProviderTransaction', '0..1', '0..N'],
  ['PaymentInstruction', 'is executed as', 'ProviderTransaction', '0..1', '0..N'],
  ['BatchAccount', 'pays out via', 'PaymentInstruction', '1', '0..N'],
  ['PayoutAccount', 'receives', 'PaymentInstruction', '0..1', '0..N'],
  ['DisbursementTranche', 'is released by', 'PaymentInstruction', '0..1', '0..N'],
  ['Contribution', 'is refunded by', 'PaymentInstruction', '0..1', '0..N'],
  ['SalesOrder', 'is refunded by', 'PaymentInstruction', '0..1', '0..N'],
  ['Batch', 'is settled by', 'Settlement', '1', '0..1'],
  ['Settlement', 'aggregates', 'RevenueLine', '1', '0..N', true],
  ['SalesOrder', 'contributes', 'RevenueLine', '1', '0..N', true],
  ['RemunerationTier', 'is applied in', 'Settlement', '0..1', '0..N', true],
  ['Settlement', 'allocates', 'SettlementLine', '1', '0..N'],
  ['Investor', 'is paid by', 'SettlementLine', '1', '0..N'],
  ['SettlementLine', 'is paid out by', 'PaymentInstruction', '0..1', '0..N'],
  ['Settlement', 'receives', 'SettlementFeedback', '1', '0..N'],
  ['User', 'writes', 'SettlementFeedback', '1', '0..N'],
];
// Quan hệ chỉ ghi người thao tác: không vẽ ở trang tổng Conceptual (vẫn vẽ ở trang vùng)
const ACTOR_RELS = new Set(['User signs ContractSignature', 'User judges as reviewer EvidenceReview', 'User writes SettlementFeedback']);
// Tham chiếu phụ (liên kết bằng chứng, hoàn tiền, đối soát giao dịch, bản chụp tỷ lệ vốn…): chỉ vẽ ở trang vùng
const MINOR_RELS = new Set(['Batch is allocated BoxAllocation', 'Batch stocks Crab', 'Crab replaces Crab', 'Box is photographed in Evidence', 'BoxEvent is proven by Evidence',
  'DisbursementTranche is justified by Evidence', 'Crab appears in Evidence', 'BoxEvent is weighed in HarvestRecord', 'BatchAccount records ProviderTransaction',
  'PaymentInstruction is executed as ProviderTransaction', 'PayoutAccount receives PaymentInstruction', 'DisbursementTranche is released by PaymentInstruction',
  'Contribution is refunded by PaymentInstruction', 'SalesOrder is refunded by PaymentInstruction', 'Operator owns PayoutAccount', 'Batch holds capital share of Investor']);
const MANY = (c) => /N|2/.test(c);

// =====================================================================================================
// Bộ xếp hình không để đường cắt qua khối.
// 1) Cột theo BFS hai phía từ nút có nhiều quan hệ nhất: hai đầu mọi quan hệ cách nhau tối đa một mức, nên mỗi đường chỉ
//    đi trong khe giữa hai cột kề nhau (cùng cột thì vòng ra khe bên cạnh). Các nhóm nối với gốc được chia sang hai bên.
// 2) Thứ tự trong cột theo trọng tâm (barycenter) để ít đường chéo nhau; sau đó dời nút xuống gần các nút láng giềng.
// 3) Mỗi đường có một làn dọc riêng trong khe; thứ tự làn chọn để ít giao nhau nhất. Đầu đường gắn đúng dòng (row) nếu có,
//    còn lại chia đều trên cạnh hộp. Bề rộng khe = 2 dải nhãn + số làn × khoảng làn.
function arrange(nodes, edges, o) {
  const N = new Map(nodes.map(n => [n.key, n]));
  const adj = new Map(nodes.map(n => [n.key, new Set()]));
  for (const e of edges) {
    if (!N.has(e.a) || !N.has(e.b)) throw new Error(`arrange: unknown node in edge ${e.a} → ${e.b}`);
    if (e.a !== e.b) { adj.get(e.a).add(e.b); adj.get(e.b).add(e.a); }
  }
  const hOf = (k) => N.get(k).h + o.gapY;
  // Gán cột cho từng thành phần liên thông: thử nhiều gốc BFS (một phía và hai phía), rồi dời từng nút sang cột kề nếu mọi
  // quan hệ của nó vẫn chỉ cách một cột và trang in vừa A4 ngang to hơn; giữ phương án có cỡ in lớn nhất.
  const laneOf = (c, a, b) => { const ka = c.get(a), kb = c.get(b); return ka === kb ? ka : Math.min(ka, kb); };
  const evalCols = (c, keys, edgesIn) => {
    const ks = [...new Set(keys.map(v => c.get(v)))].sort((x, y) => x - y);
    let W = 0, H = 0, same = 0;
    const lanes = new Map();
    for (const e of edgesIn) { const g = laneOf(c, e.a, e.b); lanes.set(g, (lanes.get(g) ?? 0) + 1); if (c.get(e.a) === c.get(e.b)) same++; }
    for (const k of ks) {
      const ns = keys.filter(v => c.get(v) === k);
      W += Math.max(...ns.map(v => N.get(v).w));
      H = Math.max(H, ns.reduce((t, v) => t + hOf(v), 0));
    }
    for (let i = 0; i + 1 < ks.length; i++) W += Math.max(o.minGap, 2 * o.band + (lanes.get(ks[i]) ?? 0) * o.laneGap);
    const scale = Math.max(W / 1123, H / 794); // thu vừa A4 ngang (brief mục 10)
    return scale + 0.015 * same;
  };
  const col = new Map();
  let offset = 0;
  const byDeg = nodes.map(n => n.key).sort((x, y) => adj.get(y).size - adj.get(x).size);
  for (const r0 of byDeg) {
    if (col.has(r0) || adj.get(r0).size === 0) continue;
    // thành phần liên thông chứa r0
    const comp = [], st0 = [r0], seen0 = new Set([r0]);
    while (st0.length) { const v = st0.pop(); comp.push(v); for (const u of adj.get(v)) if (!seen0.has(u)) { seen0.add(u); st0.push(u); } }
    const compSet = new Set(comp);
    const edgesIn = edges.filter(e => compSet.has(e.a) && compSet.has(e.b) && e.a !== e.b);
    const roots = comp.slice().sort((x, y) => adj.get(y).size - adj.get(x).size).slice(0, 4);
    let best = null, bestCost = Infinity;
    for (const r of roots) for (const twoSided of [true, false]) {
      const lvl = new Map([[r, 0]]), q = [r];
      while (q.length) { const v = q.shift(); for (const u of adj.get(v)) if (!lvl.has(u)) { lvl.set(u, lvl.get(v) + 1); q.push(u); } }
      const gOf = new Map(), groups = [];
      for (const v of lvl.keys()) {
        if (v === r || gOf.has(v)) continue;
        const g = [], st = [v]; gOf.set(v, groups.length);
        while (st.length) { const x = st.pop(); g.push(x); for (const u of adj.get(x)) if (u !== r && !gOf.has(u)) { gOf.set(u, groups.length); st.push(u); } }
        groups.push(g);
      }
      const w = (g) => g.reduce((t, v) => t + hOf(v) * (lvl.get(v) === 1 ? 1 : 0.5), 0);
      groups.sort((a, b) => w(b) - w(a));
      const c = new Map([[r, 0]]);
      let wl = 0, wr = 0;
      for (const g of groups) { const sd = !twoSided || wr <= wl ? 1 : -1; for (const v of g) c.set(v, sd * lvl.get(v)); if (sd > 0) wr += w(g); else wl += w(g); }
      const lo = Math.min(...c.values()), hi = Math.max(...c.values());
      let cost = evalCols(c, comp, edgesIn);
      for (let it = 0; it < 80; it++) {
        let moved = false;
        for (const v of comp) {
          const cur = c.get(v);
          for (const nk of [cur - 1, cur + 1]) {
            if (nk < lo || nk > hi || [...adj.get(v)].some(u => Math.abs(c.get(u) - nk) > 1)) continue;
            c.set(v, nk);
            const nc = evalCols(c, comp, edgesIn);
            if (nc < cost - 1e-6) { cost = nc; moved = true; break; }
            c.set(v, cur);
          }
        }
        if (!moved) break;
      }
      if (cost < bestCost) { bestCost = cost; best = new Map(c); }
    }
    // bỏ cột rỗng (không quan hệ nào bắc qua cột rỗng nên dồn cột vẫn đúng)
    const ks = [...new Set(best.values())].sort((x, y) => x - y);
    const idx = new Map(ks.map((k, i) => [k, i]));
    for (const [v, k] of best) col.set(v, offset + idx.get(k));
    offset += ks.length;
  }
  for (const n of nodes) if (!col.has(n.key)) { // nút không có quan hệ: cột thấp nhất (hoặc cột mới khi chưa có cột)
    const hs = Array.from({ length: Math.max(offset, 1) }, (_, k) => [...col].filter(([, kk]) => kk === k).reduce((t, [v]) => t + hOf(v), 0));
    const k = hs.indexOf(Math.min(...hs)); col.set(n.key, k); offset = Math.max(offset, k + 1);
  }
  const K = offset;
  const cols = Array.from({ length: K }, () => []);
  for (const [v, k] of col) cols[k].push(v);
  const y = new Map();
  const stackCol = (k) => { let yy = o.y0; for (const v of cols[k]) { y.set(v, yy); yy += hOf(v); } };
  cols.forEach((_, k) => stackCol(k));
  const cy = (v) => y.get(v) + N.get(v).h / 2;
  for (let s = 0; s < 16; s++) {
    const seq = s % 2 ? [...cols.keys()].reverse() : [...cols.keys()];
    for (const k of seq) {
      const bary = new Map(cols[k].map(v => { const nb = [...adj.get(v)]; return [v, nb.length ? nb.reduce((t, u) => t + cy(u), 0) / nb.length : cy(v)]; }));
      cols[k].sort((a, b) => bary.get(a) - bary.get(b));
      stackCol(k);
    }
  }
  const colH = cols.map(arr => arr.reduce((s, v) => s + hOf(v), 0));
  const H = Math.max(...colH);
  for (let pass = 0; pass < 3; pass++) for (let k = 0; k < K; k++) {
    let slack = H - colH[k], yy = o.y0;
    for (const v of cols[k]) {
      const nb = [...adj.get(v)].filter(u => col.get(u) !== k);
      const want = nb.length ? nb.reduce((t, u) => t + cy(u), 0) / nb.length - N.get(v).h / 2 : yy;
      const shift = Math.max(0, Math.min(slack, want - yy));
      y.set(v, yy + shift); slack -= shift; yy += shift + hOf(v);
    }
  }
  // khe g ở giữa cột g và g+1; g = -1 là lề trái cột 0
  const routes = edges.map((e, i) => {
    const ka = col.get(e.a), kb = col.get(e.b);
    let sa, sb, gap;
    if (ka < kb) { sa = 'R'; sb = 'L'; gap = ka; }
    else if (ka > kb) { sa = 'L'; sb = 'R'; gap = kb; }
    else { const right = ka < K - 1 || K === 1; sa = sb = right ? 'R' : 'L'; gap = right ? ka : ka - 1; }
    return { e, i, sa, sb, gap };
  });
  const inGap = new Map();
  for (const r of routes) { if (!inGap.has(r.gap)) inGap.set(r.gap, []); inGap.get(r.gap).push(r); }
  const colW = cols.map(arr => Math.max(...arr.map(v => N.get(v).w)));
  const gapW = (g) => Math.max(o.minGap, 2 * o.band + (inGap.get(g)?.length ?? 0) * o.laneGap);
  const xCol = [];
  let xx = o.x0 + (inGap.has(-1) ? gapW(-1) : 0);
  for (let k = 0; k < K; k++) { xCol[k] = xx; xx += colW[k] + (k < K - 1 || inGap.has(K - 1) ? gapW(k) : 0); }
  const pos = {};
  for (const [v, k] of col) pos[v] = { x: xCol[k], y: y.get(v), w: N.get(v).w, h: N.get(v).h, col: k };
  // điểm gắn: dòng khoá ngoại nếu có, còn lại chia đều trên cạnh
  const at = new Map();
  const rowDup = new Map();
  for (const r of routes) if (r.e.aRow != null) {
    const k = `${r.e.a}|${r.e.aRow}|${r.sa}`; const n = rowDup.get(k) ?? 0; rowDup.set(k, n + 1);
    at.set(r.i + ':a', pos[r.e.a].y + r.e.aRow + (n === 0 ? 0 : (n % 2 ? 5 : -5) * Math.ceil(n / 2)));
  }
  const ends = new Map();
  const push = (k, v) => { if (!ends.has(k)) ends.set(k, []); ends.get(k).push(v); };
  for (const r of routes) { if (r.e.aRow == null) push(`${r.e.a}|${r.sa}`, { r, end: 'a' }); push(`${r.e.b}|${r.sb}`, { r, end: 'b' }); }
  for (const [k, list] of ends) {
    const v = k.slice(0, k.lastIndexOf('|'));
    const other = (x) => x.end === 'a' ? cy(x.r.e.b) : (at.get(x.r.i + ':a') ?? cy(x.r.e.a));
    list.sort((p, q) => other(p) - other(q));
    const nd = N.get(v), minSp = o.minSpacing ?? 6;
    const top = pos[v].y + (nd.attach?.top ?? o.attachTop ?? 6);
    let bottom = pos[v].y + (nd.attach?.bottom ?? pos[v].h - 6);
    if (bottom - top < (list.length + 1) * minSp) bottom = Math.min(pos[v].y + pos[v].h - 4, top + (list.length + 1) * minSp);
    list.forEach((x, j) => at.set(x.r.i + ':' + x.end, top + (bottom - top) * (j + 1) / (list.length + 1)));
  }
  for (const r of routes) {
    r.ya = at.get(r.i + ':a'); r.yb = at.get(r.i + ':b');
    r.xa = r.sa === 'R' ? pos[r.e.a].x + pos[r.e.a].w : pos[r.e.a].x;
    r.xb = r.sb === 'R' ? pos[r.e.b].x + pos[r.e.b].w : pos[r.e.b].x;
  }
  // làn: thứ tự ít giao nhau nhất
  for (const [g, list] of inGap) {
    const xL = g >= 0 ? xCol[g] + colW[g] : o.x0;
    const xR = g + 1 < K ? xCol[g + 1] : xL + gapW(g);
    const i0 = xL + o.band, i1 = xR - o.band;
    const ends2 = (r) => { // y của các đầu chạm cột trái (L) và cột phải (R) của khe
      const L = [], R = [];
      const put = (side, yv, k) => (side === 'R' && pos[k].col === g ? L : R).push(yv);
      put(r.sa, r.ya, r.e.a); put(r.sb, r.yb, r.e.b);
      return { L, R, lo: Math.min(r.ya, r.yb), hi: Math.max(r.ya, r.yb) };
    };
    const info = new Map(list.map(r => [r, ends2(r)]));
    const crossings = (order) => {
      let n = 0;
      for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
        const p = info.get(order[i]), q = info.get(order[j]);
        for (const yv of p.R) if (yv > q.lo + 0.5 && yv < q.hi - 0.5) n++;
        for (const yv of q.L) if (yv > p.lo + 0.5 && yv < p.hi - 0.5) n++;
        for (const yv of p.R) for (const yq of q.L) if (Math.abs(yv - yq) < 4) n += 20; // hai đoạn ngang chồng lên nhau
      }
      return n;
    };
    const keys = [(r) => info.get(r).lo, (r) => info.get(r).hi, (r) => info.get(r).lo + info.get(r).hi, (r) => info.get(r).hi - info.get(r).lo, (r) => info.get(r).lo - info.get(r).hi,
      (r) => (info.get(r).L[0] ?? 1e9), (r) => -(info.get(r).R[0] ?? -1e9)];
    let best = null, bestN = Infinity;
    for (const kf of keys) { const ord = [...list].sort((a, b) => kf(a) - kf(b)); const n = crossings(ord); if (n < bestN) { best = ord; bestN = n; } }
    for (let pass = 0; pass < 6 && bestN > 0; pass++) {
      let imp = false;
      for (let i = 0; i + 1 < best.length; i++) { const t = [...best]; [t[i], t[i + 1]] = [t[i + 1], t[i]]; const n = crossings(t); if (n < bestN) { best = t; bestN = n; imp = true; } }
      if (!imp) break;
    }
    best.forEach((r, i) => { r.lane = Math.round(i0 + (i + 0.5) * (i1 - i0) / best.length); });
  }
  // dời nhẹ các đầu chia đều khi hai đoạn ngang của hai đường trùng nhau: thử ±4, ±8, ±12 px, chọn vị trí không trùng đoạn nào
  {
    const segs = routes.flatMap(r => [{ r, end: 'a', node: r.e.a, x1: Math.min(r.xa, r.lane), x2: Math.max(r.xa, r.lane), movable: r.e.aRow == null }, { r, end: 'b', node: r.e.b, x1: Math.min(r.xb, r.lane), x2: Math.max(r.xb, r.lane), movable: true }]);
    const yOf = (sg) => sg.end === 'a' ? sg.r.ya : sg.r.yb;
    const clash = (sg, yv) => segs.some(t => t !== sg && t.r !== sg.r && Math.abs(yOf(t) - yv) < 3 && Math.min(t.x2, sg.x2) - Math.max(t.x1, sg.x1) > 4);
    for (const sg of segs) {
      if (!sg.movable || !clash(sg, yOf(sg))) continue;
      const bx = pos[sg.node], y0 = yOf(sg);
      for (const dy of [4, -4, 8, -8, 12, -12, 16, -16]) {
        const ny = y0 + dy;
        if (ny > bx.y + bx.h - 3 || ny < bx.y + (o.attachTop ?? 6)) continue;
        if (!clash(sg, ny)) { if (sg.end === 'a') sg.r.ya = ny; else sg.r.yb = ny; break; }
      }
    }
  }
  const width = xx + o.x0, height = o.y0 + H;
  return { pos, routes, width, height, K };
}

/** Chạy arrange() rồi nới chiều cao hộp cho đủ chỗ gắn các đầu đường (mỗi đầu cách nhau `spacing`), chạy lại tới khi ổn định. */
function arrangeFit(nodes, edges, o, spacing) {
  for (const n of nodes) n.h0 ??= n.h;
  let L;
  for (let pass = 0; pass < 4; pass++) {
    L = arrange(nodes, edges, o);
    const cnt = new Map();
    const inc = (k) => cnt.set(k, (cnt.get(k) ?? 0) + 1);
    for (const r of L.routes) { if (r.e.aRow == null) inc(`${r.e.a}|${r.sa}`); inc(`${r.e.b}|${r.sb}`); }
    let changed = false;
    for (const n of nodes) {
      const need = Math.max(cnt.get(`${n.key}|L`) ?? 0, cnt.get(`${n.key}|R`) ?? 0);
      const h = n.attach ? n.h0 : Math.max(n.h0, (o.attachTop ?? 6) + 6 + (need + 1) * spacing);
      if (h > n.h + 0.5) { n.h = h; changed = true; }
    }
    if (!changed) break;
  }
  return L;
}

/** Kiểm tra: đoạn đường không cắt hộp nào ngoài hai đầu; nhãn không đè hộp hay nhãn khác. */
function checkLayout(name, L, labels = []) {
  const warn = [];
  const boxes = Object.entries(L.pos);
  const inside = (b, x, y, m = 1.5) => x > b.x + m && x < b.x + b.w - m && y > b.y + m && y < b.y + b.h - m;
  for (const r of L.routes) {
    const P = [[r.xa, r.ya], [r.lane, r.ya], [r.lane, r.yb], [r.xb, r.yb]];
    for (let i = 0; i < 3; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3));
      for (let k = 0; k <= n; k++) {
        const x = x1 + (x2 - x1) * k / n, yy = y1 + (y2 - y1) * k / n;
        for (const [key, b] of boxes) if (key !== r.e.a && key !== r.e.b && inside(b, x, yy)) { warn.push(`${name}: ${r.e.a} → ${r.e.b} crosses ${key}`); k = n + 1; break; }
      }
    }
  }
  const hs = L.routes.flatMap(r => [{ r, y: r.ya, x1: Math.min(r.xa, r.lane), x2: Math.max(r.xa, r.lane) }, { r, y: r.yb, x1: Math.min(r.xb, r.lane), x2: Math.max(r.xb, r.lane) }]);
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
    const p = hs[i], q = hs[j];
    if (p.r !== q.r && Math.abs(p.y - q.y) < 3 && Math.min(p.x2, q.x2) - Math.max(p.x1, q.x1) > 4) warn.push(`${name}: ${p.r.e.a} → ${p.r.e.b} overlaps ${q.r.e.a} → ${q.r.e.b} at y=${Math.round(p.y)}`);
  }
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (let i = 0; i < labels.length; i++) {
    for (const [key, b] of boxes) if (hit(labels[i], b)) warn.push(`${name}: label "${labels[i].text}" on ${key}`);
    for (let j = i + 1; j < labels.length; j++) if (hit(labels[i], labels[j])) warn.push(`${name}: labels "${labels[i].text}" / "${labels[j].text}" overlap`);
  }
  return warn;
}

/** Vẽ đường theo kết quả arrange(); style(e) trả về kiểu mũi tên và màu. Đầu gắn dòng dùng toạ độ tương đối theo dòng. */
function drawRoutes(d, L, style) {
  const f = (v) => Math.round(v * 1000) / 1000;
  for (const r of L.routes) {
    const e = r.e, A = L.pos[e.a], B = L.pos[e.b];
    const exitY = e.aRow != null ? 0.5 + (r.ya - (A.y + e.aRow)) / ROW : (r.ya - A.y) / A.h;
    const entryY = (r.yb - B.y) / B.h;
    const geo = `exitX=${r.sa === 'R' ? 1 : 0};exitY=${f(exitY)};exitDx=0;exitDy=0;entryX=${r.sb === 'R' ? 1 : 0};entryY=${f(entryY)};entryDx=0;entryDy=0;`;
    d.edge(e.aKey ?? e.a, e.b, `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;html=1;startFill=0;endFill=0;${FONT}${style(e)}${geo}`, { points: [[r.lane, r.ya], [r.lane, r.yb]] });
  }
}

/** Đặt nhãn quan hệ (Conceptual): cạnh đầu A, cạnh đầu B, hoặc giữa làn; tránh hộp, nhãn khác và đoạn ngang của đường khác. */
function placeLabels(d, L, o) {
  const boxes = Object.values(L.pos);
  const segH = L.routes.flatMap(r => [{ r, x1: Math.min(r.xa, r.lane), x2: Math.max(r.xa, r.lane), y: r.ya }, { r, x1: Math.min(r.xb, r.lane), x2: Math.max(r.xb, r.lane), y: r.yb }]);
  const segV = L.routes.map(r => ({ r, x: r.lane, y1: Math.min(r.ya, r.yb), y2: Math.max(r.ya, r.yb) }));
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const placed = [];
  const lh = FS_LABEL + 3;
  for (const r of L.routes) {
    const text = r.e.label; if (!text) continue;
    const maxW = o.band - 16;
    const words = text.split(' '); const lines = [];
    for (const wd of words) { const last = lines[lines.length - 1]; if (last && textW(last + ' ' + wd, FS_LABEL) <= maxW) lines[lines.length - 1] = last + ' ' + wd; else lines.push(wd); }
    const w = Math.min(maxW, Math.max(...lines.map(l => textW(l, FS_LABEL)))), h = lines.length * lh + 2;
    const cand = [];
    for (const [end, side, xs, ys] of [['a', r.sa, r.xa, r.ya], ['b', r.sb, r.xb, r.yb]]) {
      const x = side === 'R' ? xs + 12 : xs - 12 - w;
      cand.push({ x, y: ys - h - 1 }, { x, y: ys + 2 });
    }
    if (Math.abs(r.yb - r.ya) > h + 12) cand.push({ x: r.lane - w / 2, y: (r.ya + r.yb) / 2 - h / 2 });
    let best = null, bestScore = Infinity;
    cand.forEach((c, idx) => {
      const R = { x: c.x, y: c.y, w, h };
      let hard = 0, soft = 0;
      for (const b of boxes) if (hit(R, b)) hard++;
      for (const p of placed) if (hit(R, p)) hard++;
      for (const s of segH) if (s.r !== r && s.y > R.y && s.y < R.y + R.h && s.x2 > R.x && s.x1 < R.x + R.w) hard++;
      for (const s of segV) if (s.r !== r && s.x > R.x && s.x < R.x + R.w && s.y2 > R.y && s.y1 < R.y + R.h) soft++;
      const score = hard * 1000 + soft * 3 + idx;
      if (score < bestScore) { bestScore = score; best = R; }
    });
    best.text = text;
    placed.push(best);
    d.vertex(lines.join('<br>'), `text;html=1;fontSize=${FS_LABEL};fillColor=#ffffff;strokeColor=none;align=center;verticalAlign=middle;spacing=0;whiteSpace=nowrap;fontColor=${r.e.planned ? '#475569' : '#1e293b'};${FONT}`, Math.round(best.x), Math.round(best.y), Math.round(w), Math.round(h), { raw: true });
  }
  return placed;
}

// =====================================================================================================
// Conceptual: trang tổng + 6 trang vùng
function conceptual(out) {
  const f = new DrawioFile();
  const ents = {};
  for (const a of AREAS) for (const [name, , attrs, planned, rule] of CONCEPT14[a.key]) ents[name] = { name, attrs, planned: !!planned, area: a.key, rule };
  const rels = CREL14.map(([A, verb, B, ca, cb, planned]) => {
    if (!ents[A] || !ents[B]) throw new Error(`conceptual: unknown entity in ${A} ${verb} ${B}`);
    const childA = MANY(ca) && !MANY(cb), nn = MANY(ca) && MANY(cb);
    const owners = nn ? [ents[A].area, ents[B].area] : [childA ? ents[A].area : ents[B].area];
    return { A, B, ca, cb, verb, planned: !!planned, owners: [...new Set(owners)], actor: ACTOR_RELS.has(`${A} ${verb} ${B}`), minor: MINOR_RELS.has(`${A} ${verb} ${B}`) };
  });
  const nAll = Object.keys(ents).length, nPl = Object.values(ents).filter(e => e.planned).length;
  const warn = [];
  const relStyle = (e) => `startArrow=${card(e.ca)};endArrow=${card(e.cb)};strokeColor=#334155;` + (e.planned ? PLANNED_EDGE : '');

  // --- trang tổng: chỉ tên thực thể và quan hệ chính (bỏ quan hệ chỉ ghi người thao tác) ---
  {
    const d = f.page('Conceptual ERD – overview');
    cap(d, 'Figure 3.3', 'Conceptual ERD: overview for orientation only – business entities and main relationships (Register v1.4)', META(`SRS 3.1.5 · ${nAll} entities (${nPl} «planned») · names only; read the area pages, Figures 3.3.1–3.3.6, for attributes and relationship names`));
    const nodes = Object.values(ents).map(e => ({ key: e.name, w: 170, h: 30, e }));
    const edges = rels.filter(r => !r.actor && !r.minor).map(r => ({ a: r.A, b: r.B, ca: r.ca, cb: r.cb, planned: r.planned }));
    const L = arrangeFit(nodes, edges, { x0: 20, y0: 80, gapY: 12, band: 14, laneGap: 7, minGap: 50, samePenalty: 3000, attachTop: 4 }, 8);
    for (const n of nodes) {
      const a = AREA[n.e.area], p = L.pos[n.key];
      d.vertex(`<b>${n.key}</b>${n.e.planned ? ' ' + PL : ''}`, `rounded=0;whiteSpace=wrap;html=1;fillColor=${a.fill};strokeColor=${a.stroke};fontSize=${FS_ATTR};${FONT}` + (n.e.planned ? PLANNED_BOX : ''), p.x, p.y, p.w, p.h, { key: n.key, raw: true });
    }
    drawRoutes(d, L, relStyle);
    warn.push(...checkLayout('Conceptual overview', L));
    const yL = legend(d, 20, L.height + 30, [
      `Areas: ${AREAS.map(a => `<font color="${a.stroke}">■</font> ${a.key} ${AREA14[a.key]}`).join(' · ')}.`,
      'Crow\'s foot at both ends: | one · O zero · &lt; many. Grey dashed box or line = «planned» (Register v1.4, not in code yet).',
      'Main relationships only: actor links (User signs, judges, writes) and secondary references (evidence links, refunds, payment matching, capital-share snapshot, crab replacement) are drawn with their names on the area pages 3.3.1–3.3.6.',
    ], Math.max(640, L.width - 40));
    note(d, 20, yL + 12, Math.max(640, L.width - 40), 132, '<b>Notes – Register v1.4</b><br>'
      + '• Removed from the business model (tables still used by code, so they stay in the Physical ERD, Figure 4.3): ProductListing, PriceHistory (Listing / Catalog); OrderLine, StockReservation (Cart / retail checkout); OfftakeCommitment (Offtake window); CrabTag, TagScan (printed per-crab tag); ProductionThreshold (water-quality thresholds: temperature, salinity and pH are not needed in v1.4).<br>'
      + '• Technical logs appear only from the Logical level: IngestionMessage «planned» (simulator data), AuditRecord (hash-chained audit log), CrabHistory (per-crab event log).<br>'
      + '• Traceability Conceptual → Logical → Physical and the code class of each entity: Table 4.2 in the Logical ERD file.<br>'
      + `• ${PENDING} (Batch opening condition, box rows, forfeited deposits, survival rate, weighed-kg balance, unused Standard Cost, InvoicedSale).`);
  }

  // --- trang vùng: thực thể của vùng (đủ thuộc tính) + thực thể vùng khác có quan hệ (chỉ tên) ---
  for (const a of AREAS) {
    const d = f.page(`${a.key} · ${AREA14[a.key]}`);
    const mine = Object.values(ents).filter(e => e.area === a.key);
    const pageRels = rels.filter(r => r.owners.includes(a.key));
    const ext = new Set();
    for (const r of pageRels) for (const k of [r.A, r.B]) if (ents[k].area !== a.key) ext.add(k);
    cap(d, `Figure 3.3.${a.key.slice(1)}`, `Conceptual ERD: ${AREA14[a.key]} (Register v1.4)`, META(`${mine.length} entities of ${a.key}${ext.size ? ` + ${ext.size} related entities of other areas (white boxes)` : ''} · ${pageRels.length} relationships`));
    const sideCount = new Map(); // ước lượng số đầu đường mỗi thực thể để hộp đủ cao cho nhãn
    for (const r of pageRels) for (const k of [r.A, r.B]) sideCount.set(k, (sideCount.get(k) ?? 0) + 1);
    const nodes = [];
    for (const e of mine) {
      const rows = e.attrs.map(x => x.startsWith('+') ? { text: `${x.slice(1)} ${PL}`, style: ATTR + `fontColor=${GREY};` } : { text: x, style: ATTR });
      if (e.rule) e.rule.split('\n').forEach((t, i) => rows.push({ text: `<i>${i ? '' : 'rule: '}${t}</i>`, style: ATTR + `fontColor=${GREY};` }));
      const content = HEAD + rows.length * ROW + 6;
      const need = Math.ceil((sideCount.get(e.name) ?? 0) / 2 + 1) * 30;
      nodes.push({ key: e.name, w: 210, h: Math.max(content, need), h0: content, e, rows, full: true });
    }
    for (const k of ext) nodes.push({ key: k, w: 210, h: 34, h0: 34, e: ents[k], full: false });
    const edges = pageRels.map(r => ({ a: r.A, b: r.B, ca: r.ca, cb: r.cb, planned: r.planned, label: r.verb }));
    const L = arrangeFit(nodes, edges, { x0: 20, y0: 80, gapY: 26, band: 104, laneGap: 10, minGap: 230, samePenalty: 40000, attachTop: 8 }, 30);
    for (const n of nodes) {
      const p = L.pos[n.key], ar = AREA[n.e.area];
      if (n.full) {
        const title = `<b>${n.key}</b>${n.e.planned ? ' ' + PL : ''}`;
        const style = S.entity(ar.fill, ar.stroke) + `startSize=${HEAD};fontSize=${FS_TITLE};` + (n.e.planned ? PLANNED_BOX : '');
        stackBox(d, n.key, title, n.rows, p.x, p.y, p.w, style, ROW, { headerH: HEAD, pad: p.h - HEAD - n.rows.length * ROW });
      } else {
        d.vertex(`<b>${n.key}</b> <font style="font-size:${FS_LABEL}px" color="#475569">(${n.e.area})</font>${n.e.planned ? ' ' + PL : ''}`, `rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=${ar.stroke};fontSize=${FS_TITLE};${FONT}` + (n.e.planned ? PLANNED_BOX.replace('fillColor=#f8fafc;', '') : ''), p.x, p.y, p.w, p.h, { key: n.key, raw: true });
      }
    }
    drawRoutes(d, L, relStyle);
    const labels = placeLabels(d, L, { band: 104 });
    warn.push(...checkLayout(`Conceptual ${a.key}`, L, labels));
    const yLeg = legend(d, 20, L.height + 30, [
      'Coloured box = entity of this area with its identifying and key attributes and business rules; white box = related entity of another area (its own page has the details).',
      'Relationship name is read from the first entity to the second; crow\'s foot at both ends: | one · O zero · &lt; many.',
      'Grey dashed box, line or attribute «planned» = in Register v1.4, not in code yet (develop @ 420a379, V001–V017). Removed items: Notes of Figure 3.3.',
    ], Math.max(640, L.width - 40));
    if (PEND_C[a.key]) pendingNote(d, 20, yLeg + 10, Math.max(640, L.width - 40), PEND_C[a.key]);
  }
  f.write(path.join(out, 'CrabShare_Conceptual_ERD.drawio'));
  return { count: nAll, planned: nPl, rels: rels.length, warn };
}

// =====================================================================================================
// Logical / Physical: trang tổng chỉ có tên; trang vùng đủ thuộc tính, đường gắn vào đúng dòng khoá ngoại.
// Vùng quá dày để in A4 ngang ở chữ 11–12 px thì tách thành hai phần (1/2), (2/2), giữ số hình (brief mục 10).
const PARTS_L = {
  A2: [['Batch, Standard Cost and disbursement', ['Batch', 'FeeTier', 'StandardCostVersion', 'StandardCostItem', 'TranchePlan', 'DisbursementTranche', 'BatchAccount', 'RemunerationTier']],
    ['Funding and contracts', ['RiskDisclosure', 'RiskAcknowledgement', 'Contribution', 'CapitalShare', 'RowAllocation', 'ContractTemplate', 'InvestmentContract', 'ContractSignature']]],
  A3: [['Production logs, box events and crabs', ['ProductionLog', 'BoxEvent', 'BoxEventDetail', 'BoxEventPolicy', 'Crab', 'CrabHistory', 'IngestionMessage']],
    ['Evidence and alerts', ['Evidence', 'CrabDetection', 'EvidenceReview', 'CaptureRequest', 'Alert']]],
};
const PARTS_P = {
  A2: [['Batch, Standard Cost and disbursement', ['batch', 'fee_tier', 'standard_cost_version', 'standard_cost_item', 'standard_cost_tranche_plan', 'disbursement_tranche', 'batch_account', 'batch_offtake_price']],
    ['Funding and contracts', ['risk_disclosure', 'risk_acknowledgement', 'contribution', 'capital_share', 'contract_template', 'investment_contract', 'contract_signature', 'offtake_commitment']]],
  A3: [['Production logs, box events and crabs', ['production_log', 'production_threshold_version', 'slot_event', 'slot_event_detail', 'slot_event_policy_version', 'crab_item', 'crab_item_event']],
    ['Evidence and alerts', ['evidence', 'evidence_detection', 'evidence_review', 'capture_request', 'alert']]],
};
/** Chia danh sách của một vùng theo PARTS; kiểm mỗi phần tử nằm đúng một phần. */
function partsOf(cfg, key, names) {
  const parts = cfg[key] ?? [[null, names]];
  const all = parts.flatMap(p => p[1]);
  for (const n of names) if (all.filter(x => x === n).length !== 1) throw new Error(`parts ${key}: ${n} must be in exactly one part`);
  for (const n of all) if (!names.includes(n)) throw new Error(`parts ${key}: unknown ${n}`);
  return parts.map(([title, list], i) => ({ title, list, tag: parts.length > 1 ? ` (${i + 1}/${parts.length})` : '', ptag: parts.length > 1 ? ` (${i + 1} of ${parts.length})` : '' }));
}
function logicalRows(e, inPlannedEntity) {
  return e.attrs.map(a => {
    const tags = [];
    if (a.pk) tags.push('PK'); if (a.fk) tags.push(a.composite ? 'FK*' : 'FK'); if (a.uq && !a.pk) tags.push('U');
    const tag = tags.length ? `<font color="#b91c1c"><b>${tags.join(',')}</b></font> ` : '';
    const mark = a.status === 'planned' ? (inPlannedEntity ? '' : ` ${PL}`) : a.status === 'changed' ? ` <font color="${AMBER}"><i>«changed»</i></font>` : '';
    return { key: `${e.name}.${a.name}`, name: a.name, text: `${tag}${a.derived ? '/' : ''}${a.name}: ${a.type}${a.opt ? ' [0..1]' : ''}${mark}`, style: ATTR + (a.pk ? 'fontStyle=1;' : '') + (a.status === 'planned' ? `fontColor=${GREY};` : '') };
  });
}
function logical(schema, model, out) {
  const f = new DrawioFile();
  const warn = [];
  const n = model.ents.length, np = model.ents.filter(e => e.planned).length;
  const relStyle = (r) => `startArrow=${r.unique ? 'ERzeroToOne' : r.min1 ? 'ERoneToMany' : 'ERzeroToMany'};endArrow=${r.opt ? 'ERzeroToOne' : 'ERmandOne'};strokeColor=#334155;` + (r.planned ? PLANNED_EDGE : '');

  // --- trang tổng ---
  {
    const d = f.page(`Logical – overview of all ${n} entities`);
    cap(d, 'Figure 4.2', 'Logical ERD: overview of all entities, for orientation only (Register v1.4, 3NF, many-to-many decomposed)', META(`${n} entities: ${n - np} from V001–V017 + ${np} «planned» · names only; read the area pages, Figures 4.2.1–4.2.6, for attributes and keys`));
    const nodes = model.ents.map(e => ({ key: e.name, w: 180, h: 30, e }));
    const edges = model.rels.filter(r => !r.stamp).map(r => ({ ...r, a: r.child, b: r.parent }));
    const L = arrangeFit(nodes, edges, { x0: 20, y0: 80, gapY: 12, band: 14, laneGap: 6, minGap: 50, samePenalty: 3000, attachTop: 4 }, 7);
    for (const nd of nodes) {
      const a = AREA[nd.e.area], p = L.pos[nd.key];
      d.vertex(`<b>${nd.key}</b>${nd.e.planned ? ' ' + PL : ''}`, `rounded=0;whiteSpace=wrap;html=1;fillColor=${a.fill};strokeColor=${a.stroke};fontSize=${FS_ATTR};${FONT}` + (nd.e.planned ? PLANNED_BOX : ''), p.x, p.y, p.w, p.h, { key: nd.key, raw: true });
    }
    drawRoutes(d, L, relStyle);
    warn.push(...checkLayout('Logical overview', L));
    const W = Math.max(760, L.width - 40);
    let y = legend(d, 20, L.height + 30, [
      `Areas: ${AREAS.map(a => `<font color="${a.stroke}">■</font> ${a.key} ${AREA14[a.key]}`).join(' · ')}.`,
      'Each line is one foreign key: crow\'s foot at the child end (O&lt; many, O| one-to-one), bar at the parent end (| required, O| optional). Audit references to User (ApprovedBy, CreatedBy, ReviewedBy…) are not drawn.',
      'Grey dashed box or line = «planned» (Register v1.4, not in code yet). Types, keys and attributes: area pages 4.2.1–4.2.6.',
    ], W);
    note(d, 20, y + 12, W, 196, '<b>Notes – Register v1.4</b><br>'
      + '• Removed from the business model but still used by code (tables stay in the Physical ERD, Figure 4.3): ProductListing, PriceHistory, PriceCheck (Listing / Catalog); OrderLine, StockReservation (Cart / retail checkout); OfftakeCommitment, BatchOfftakePrice (Offtake window); CrabTag, TagScan (printed tag); ProductionThreshold (water-quality thresholds). Attributes removed with them: SalesOrder.OfftakeId, PaymentRequest.OfftakeId, Crab.OrderLineId, CrabHistory.TagId, HarvestRecord.TagId / TagCode / TagStatus, ProductionLog.WaterTempC / SalinityPpt / Ph / ThresholdVersionId.<br>'
      + '• Many-to-many decomposed: User × role → UserRole; Investor × RiskDisclosure → RiskAcknowledgement; Batch × Investor → CapitalShare; Contribution × BoxRow → RowAllocation «planned» (a BoxRow belongs to one Batch and, once allocated, to one Investor).<br>'
      + '• 3NF: attributes marked / are derived values or copies stored once as snapshots and never edited — settlement money (ActualRevenue, LockedStandardCost of the boxes actually funded, RevenuePool, OperatorRemuneration, NetPayout, SurvivalRatePct), Batch.TotalConfirmedCapital, PlatformFeeAmount (fee at approval) and MinContribution (capital of one BoxRow), BoxRow.BoxCount and CapitalVnd, the PreOrderQuota counters kept under a row lock, SalesOrder.BalanceVnd and the delivery details copied at order time (RecipientName, RecipientPhone, ShippingAddress), HarvestRecord copies of BoxCode, GradeCode, GradeName and running totals (append-only weighing record, V016 trigger). FK* = the column is also part of a composite foreign key that keeps both rows in the same Batch (for example SettlementLine.BatchId with InvestorId → CapitalShare).<br>'
      + '• SalesOrder.CustomerId references User so that an Investor can also pre-order (Register v1.4, section 3.2c). SalesOrder subtypes (BulkPreOrder, InvoicedSale, FinalOrder) are one table with OrderType; SaleReason (LowGrade, ForfeitResale) applies to InvoicedSale; CrabCount, EstimatedKg, DepositAmount, WeighedKg, TransitLossKg, BalanceVnd and ForfeitedAt apply to BulkPreOrder. Every delivered order has one Invoice; the FinalOrder is never below Batch.FloorPriceVnd. PreOrderQuota and PreOrderHold (15-minute hold per order) stop overselling of bulk pre-orders (TL-28).<br>'
      + `• ${PENDING} (Batch opening condition, box rows, forfeited deposits, survival rate, weighed-kg balance, unused Standard Cost, InvoicedSale).`);
  }

  // --- trang vùng (vùng dày tách hai phần) ---
  const W = 300;
  for (const a of AREAS) for (const part of partsOf(PARTS_L, a.key, model.ents.filter(e => e.area === a.key).map(e => e.name))) {
    const d = f.page(`${a.key}${part.ptag} · ${part.title ?? AREA14[a.key]}`);
    const mine = model.ents.filter(e => part.list.includes(e.name));
    const names = new Set(mine.map(e => e.name));
    const pageRels = model.rels.filter(r => names.has(r.child) && !r.stamp);
    const ext = new Set(pageRels.map(r => r.parent).filter(p => !names.has(p)));
    cap(d, `Figure 4.2.${a.key.slice(1)}${part.tag}`, `Logical ERD: ${AREA14[a.key]}${part.title ? ' — ' + part.title : ''} (Register v1.4)`, META(`${mine.length} entities${ext.size ? ` + ${ext.size} parent entities of other areas or parts (white, key only)` : ''} · lines start at the foreign-key row`));
    const nodes = [];
    for (const e of mine) {
      const rows = logicalRows(e, e.planned);
      for (const k of e.bk) if (k.length > 1) rows.push({ text: `<i>BK (${k.join(', ')})</i>`, style: ATTR + 'fontColor=#b91c1c;' });
      if (e.rule) e.rule.split('\n').forEach((t, i) => rows.push({ text: `<i>${i ? '' : 'rule: '}${t}</i>`, style: ATTR + `fontColor=${GREY};` }));
      const nPk = e.attrs.filter(x => x.pk).length;
      nodes.push({ key: e.name, w: W, h: HEAD + rows.length * ROW + 4, e, rows, full: true, attach: { top: 4, bottom: HEAD + nPk * ROW - 2 } });
    }
    for (const k of ext) {
      const e = model.byName[k];
      const rows = logicalRows(e, e.planned).filter(r => e.attrs.find(x => x.name === r.name)?.pk);
      nodes.push({ key: k, w: W, h: HEAD + rows.length * ROW + 4, e, rows, full: false });
    }
    const rowOf = (ent, attr) => { const nd = nodes.find(x => x.key === ent); const i = nd.rows.findIndex(r => r.name === attr); return HEAD + i * ROW + ROW / 2; };
    const edges = pageRels.map(r => ({ ...r, a: r.child, b: r.parent, aRow: rowOf(r.child, r.attr), aKey: `${r.child}.${r.attr}` }));
    const L = arrangeFit(nodes, edges, { x0: 20, y0: 80, gapY: 30, band: 18, laneGap: 10, minGap: 70, samePenalty: 60000, attachTop: HEAD, minSpacing: 6 }, 10);
    for (const nd of nodes) {
      const p = L.pos[nd.key], ar = AREA[nd.e.area];
      const title = nd.full ? `<b>${nd.key}</b>${nd.e.planned ? ' ' + PL : ''}` : `<b>${nd.key}</b> <font style="font-size:${FS_LABEL}px" color="#475569">(${nd.e.area})</font>${nd.e.planned ? ' ' + PL : ''}`;
      const style = S.entity(nd.full ? ar.fill : '#ffffff', ar.stroke) + `startSize=${HEAD};fontSize=${FS_TITLE};` + (nd.e.planned ? PLANNED_BOX : '');
      stackBox(d, nd.key, title, nd.rows, p.x, p.y, p.w, style, ROW, { headerH: HEAD, pad: p.h - HEAD - nd.rows.length * ROW });
    }
    drawRoutes(d, L, relStyle);
    warn.push(...checkLayout(`Logical ${a.key}`, L));
    const yLeg = legend(d, 20, L.height + 30, [
      'PK identifier · FK reference (the line starts at this row) · FK* also part of a composite FK that keeps both rows in the same Batch · U single-attribute business key · BK (…) composite business key · [0..1] optional · / derived or snapshot value.',
      `Types are DBMS-independent: Integer, Money (integer VND), Decimal, Text, Date, DateTime, Boolean, UUID. Crow's foot: child end O&lt; (many), | &lt; (one or more) or O| (one-to-one); parent end | (required) or O| (optional).`,
      `Grey dashed = «planned» (Register v1.4, not in code); amber «changed» = meaning or values change in v1.4. White box = parent entity of another area or part, key only. Audit references to User are not drawn. Removed items: Notes of Figure 4.2.`,
    ], Math.max(640, L.width - 40));
    const pkey = a.key + (part.tag ? '-' + part.tag.match(/\d/)[0] : '');
    if (PEND_L[pkey]) pendingNote(d, 20, yLeg + 10, Math.max(640, L.width - 40), PEND_L[pkey]);
  }
  tracePage(f, schema, model);
  f.write(path.join(out, 'CrabShare_Logical_ERD.drawio'));
  return { count: n, planned: np, rels: model.rels.length, warn };
}

// ---------- Table 4.2: truy vết Conceptual → Logical → Physical (+ lớp code) ----------
const TABLE_STYLE = `text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;overflow=visible;spacing=0;fontSize=11;${FONT}`;
function htmlTable(cols, rows) {
  const th = cols.map(([t, w]) => `<th style="border:1px solid #94a3b8;background:#e2e8f0;padding:2px 4px;text-align:left;width:${w}px;">${t}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map(c => `<td style="border:1px solid #cbd5e1;padding:2px 4px;vertical-align:top;">${c}</td>`).join('')}</tr>`).join('');
  return `<table style="border-collapse:collapse;width:100%;font-size:11px;"><tr>${th}</tr>${body}</table>`;
}
function tableHeight(cols, rows, px = 11) {
  const plain = (s) => String(s).replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, 'x');
  let h = 24;
  for (const r of rows) {
    let lines = 1;
    r.forEach((c, i) => { const per = Math.max(6, Math.floor((cols[i][1] - 8) / (px * 0.5))); lines = Math.max(lines, plain(c).split('\n').reduce((s, p) => s + Math.max(1, Math.ceil(p.length / per)), 0)); });
    h += lines * Math.ceil(px * 1.25) + 5;
  }
  return h;
}
function tracePage(f, schema, model) {
  const TT = 'Traceability: Conceptual ERD (Figure 3.3) → Logical ERD (Figure 4.2) → physical table (Figure 4.3, V001–V017) → code class';
  const TM = `${VER} · every Conceptual entity is found in the Logical ERD; «planned» entities have no table or class in code yet`;
  let d = f.page('Table 4.2 (1 of 3) Traceability C-L-P');
  cap(d, 'Table 4.2 (1/3)', TT, TM);
  const concept = new Set(Object.values(CONCEPT14).flat().map(x => x[0]));
  const ROLE = { UserRole: 'User.roles (multi-valued attribute)', RiskAcknowledgement: 'Investor acknowledges RiskDisclosure (n–n)', CapitalShare: 'Batch holds capital share of Investor (n–n)', BoxEventDetail: 'part of BoxEvent (technical detail)', HarvestStartRequest: 'part of Harvest (idempotent start request)', IngestionMessage: 'technical log of simulator data', AuditRecord: 'technical log (hash-chained audit)', CrabHistory: 'technical log of Crab events' };
  const C = { code: '<font color="#047857">code</font>', planned: PL, removed: '<font color="#6b7280">removed in v1.4 (code only)</font>' };
  const rows = [];
  for (const a of AREAS) {
    for (const e of model.ents.filter(x => x.area === a.key)) {
      const ch = e.attrs.filter(x => x.status !== 'code');
      let status;
      if (e.planned) status = C.planned;
      else if (ch.length || e.dropped.length) {
        const parts = [];
        const add = ch.filter(x => x.status === 'planned').map(x => x.name), mod = ch.filter(x => x.status === 'changed').map(x => x.name);
        if (add.length) parts.push(`+ ${add.join(', ')} ${PL}`);
        if (mod.length) parts.push(`<font color="${AMBER}">changed: ${mod.join(', ')}</font>`);
        if (e.dropped.length) parts.push(`<font color="#6b7280">− ${e.dropped.map(attrName).join(', ')}</font>`);
        status = `${C.code}; ${parts.join('; ')}`;
      } else status = C.code;
      rows.push([a.key, concept.has(e.name) ? e.name : `<font color="#475569">— ${ROLE[e.name] ?? ''}</font>`, e.name, e.table ?? `<font color="${GREY}">— (no table yet)</font>`, e.planned ? `<font color="${GREY}">${e.cls} «planned»</font>` : e.cls, status]);
    }
    for (const t of a.tables.filter(t => REMOVED[t])) rows.push([a.key, `<font color="#6b7280">— (${REMOVED[t]})</font>`, '<font color="#6b7280">—</font>', t, CLASS_OF(t), C.removed]);
  }
  const missing = [...concept].filter(c => !model.byName[c]);
  if (missing.length) throw new Error('trace: conceptual entities missing in logical: ' + missing.join(', '));
  const cols = [['Area', 34], ['Conceptual entity', 210], ['Logical entity', 140], ['Physical table', 170], ['Code class', 170], ['Status in v1.4', 380]];
  const w = cols.reduce((s, c) => s + c[1], 0);
  const half = Math.ceil(rows.length / 2);
  const h1 = tableHeight(cols, rows.slice(0, half)), h2 = tableHeight(cols, rows.slice(half));
  d.vertex(htmlTable(cols, rows.slice(0, half)), TABLE_STYLE, 20, 70, w, h1, { raw: true });
  d = f.page('Table 4.2 (2 of 3) Traceability C-L-P');
  cap(d, 'Table 4.2 (2/3)', TT, TM);
  d.vertex(htmlTable(cols, rows.slice(half)), TABLE_STYLE, 20, 70, w, h2, { raw: true });
  d = f.page('Table 4.2 (3 of 3) Value domains');
  cap(d, 'Table 4.2 (3/3)', 'Traceability: value domains that change in Register v1.4', TM);
  let y = 70;
  const NOTW = '<font color="#c2410c"><i>(not written by code)</i></font>'; // giá trị CHECK cho phép mà code không ghi (G-02)
  const dom = [['Attribute', 230], ['Values in Register v1.4', 560], ['Allowed today by CHECK (V001–V017)', 314]];
  const domRows = [
    ['SalesOrder.OrderType', 'BulkPreOrder · InvoicedSale · FinalOrder', 'Retail · PreOrder · Offtake ' + NOTW],
    ['SalesOrder.SaleReason', 'LowGrade · ForfeitResale (InvoicedSale only) «planned»', '—'],
    ['SalesOrder.Status', 'BulkPreOrder (Figure 4.17): PendingPayment · DepositPaid · Confirmed «planned» · Packed · Shipping · Delivered · Completed · Returned · Cancelled · Refunded «planned» · Forfeited «planned». InvoicedSale and FinalOrder (Figure 4.18): PendingPayment → Completed only; a cancel or expiry path is still an open point', 'PendingPayment · DepositPaid · Paid · Packed · Shipping · Delivered · Completed · Cancelled · Returned'],
    ['PaymentRequest.Purpose', 'Contribution · PreOrderDeposit · PreOrderBalance · OrderPayment, reused for InvoicedSale and FinalOrder «planned»', 'Contribution · OrderPayment · PreOrderDeposit · PreOrderBalance · OfftakeDeposit · OfftakePayment ' + NOTW],
    ['RevenueLine.LineType', 'DeliveredOrder · InvoicedSale · ForfeitedDeposit · FinalOrder (each forfeited deposit counted once)', '— (revenue read from view v_batch_actual_revenue)'],
    ['RowAllocation.Status', 'Held (30-minute reservation) · Allocated (contribution Confirmed) · Released (expired or refunded)', '—'],
    ['PreOrderHold.Status', 'Active (holding crabs on the quota) · Deposited (deposit paid) · Released (expired or cancelled)', '—'],
    ['IngestionMessage.MessageType / Status', 'DailyLog · Feeding · Health · BoxEvent · Photo / Received · Accepted · Rejected · Duplicate', '— (source FarmApi already allowed on ProductionLog, BoxEvent, Evidence)'],
    ['PriceObservation.Source', 'FarmInterview · Press (dated report) · Simulated', '—'],
    ['Settlement.OperatorSharePct', 'remuneration % after the survival tier (RemunerationTier.RemunerationPct, never higher when survival is lower)', 'fixed Batch.OperatorSharePct'],
  ];
  d.text('<b>Value domains that change in Register v1.4</b>', 20, y, 900, 20, 'fontSize=12;');
  const hd = tableHeight(dom, domRows);
  d.vertex(htmlTable(dom, domRows), TABLE_STYLE, 20, y + 22, dom.reduce((s, c) => s + c[1], 0), hd, { raw: true });
  y += 22 + hd + 16;
  const nPlanned = model.ents.filter(e => e.planned).length;
  note(d, 20, y, w, 112, `<b>Reading the table</b> — ${concept.size} Conceptual entities → ${model.ents.length} Logical entities (${nPlanned} «planned», no table yet) → ${Object.keys(schema.tables).length} physical tables, of which ${Object.keys(REMOVED).length} are removed from the v1.4 business model but kept by code. Logical-only entities come from decomposing many-to-many relationships, from technical detail tables or from technical logs. The Code class column is the C# entity class (EF scaffold), so Class Diagrams that use code names (PhysicalSlot, SlotAllocation, CrabItem, KycCheck, AuditLog…) map to the business names here. Where code and Register v1.4 differ the Logical ERD follows v1.4 and the Physical ERD follows code; the differences are the "Known Gaps" of the Design Brief. ${PENDING} (row allocation statuses, InvoicedSale with SaleReason, revenue line types).`);
}

// ---------- Vai trò ngắn của 60 bảng (Table 4.3) ----------
const ROLE_P = {
  app_user: 'Login account of every user (investor, customer, farm member, administrator)',
  app_user_role: 'Roles held by an account; one account can hold several',
  investor: 'Investor profile (subtype of app_user): kind and identity verification status',
  customer: 'Customer profile (subtype of app_user): bulk buyer such as a restaurant or trader',
  customer_address: 'Delivery addresses of a customer',
  kyc_check: 'Each eKYC check of a user and its result',
  payout_account: 'Bank account that receives payouts (user or farm); the account number is protected',
  operator: 'Farm (Operator): legal data, approved box capacity, review status',
  operator_member: 'Users who work for a farm and their member role',
  physical_slot: 'Numbered box of a farm: box code, row code, rack, tier, column',
  slot_allocation: 'A box assigned to a Batch (allocated, released)',
  batch: 'Batch: capital targets, operator share, platform fee, status and key dates',
  fee_tier: 'Platform fee tiers by capital range',
  standard_cost_version: 'Versions of a Batch\'s Standard Cost; the approved one is locked',
  standard_cost_item: 'Cost lines of a Standard Cost version',
  standard_cost_tranche_plan: 'Planned disbursement tranches of a Standard Cost version',
  disbursement_tranche: 'Disbursement tranches of a Batch and their unlock status',
  batch_account: 'Dedicated account of a Batch at the payment intermediary',
  batch_offtake_price: 'Offtake price per grade of a Batch',
  risk_disclosure: 'Versions of the risk disclosure text',
  risk_acknowledgement: 'An investor\'s acknowledgement of a risk disclosure version',
  contribution: 'An investor\'s reservation and contribution to a Batch',
  capital_share: 'Confirmed capital of each investor in a Batch, fixed at funding close',
  contract_template: 'Versions of the investment contract template',
  investment_contract: 'Investment contract of a contribution: draft, signed file, hashes',
  contract_signature: 'Signatures of a contract in signing order',
  offtake_commitment: 'Investor offtake commitment',
  production_log: 'Daily production log of a Batch: feed, notes, source',
  production_threshold_version: 'Water-quality thresholds of a Batch',
  slot_event: 'Box event of a Batch: stocking, mortality, restock, move',
  slot_event_detail: 'Idempotent detail of a box event: request, crab, destination box, alive count',
  slot_event_policy_version: 'Box event rules of a Batch: restock cutoff, mortality threshold',
  crab_item: 'One stocked crab: box, status, weight, grade, harvest',
  crab_item_event: 'History of a crab (append-only)',
  evidence: 'Live photo evidence: time, location, risk score, review status',
  evidence_detection: 'Result of the crab detection module on an evidence photo',
  evidence_review: 'Reviewer\'s verdict on flagged evidence',
  capture_request: 'Random capture request sent to a farm and its fulfilment',
  alert: 'Operational alert with acknowledgement deadline and escalation',
  harvest: 'Harvest round of a Batch and its totals',
  harvest_start_request: 'Idempotent request that starts a harvest round',
  harvest_record: 'Weighing record per box during harvest (append-only)',
  crab_tag: 'Printed per-crab tag',
  tag_scan: 'Scans of crab tags',
  product_grade: 'Crab grades by weight',
  product_listing: 'Retail listing of a Batch',
  price_history: 'Price history of a listing',
  price_check: 'Price anomaly check of a listing price',
  sales_order: 'Customer order (pre-order in code): amounts, delivery data, status dates',
  order_line: 'Retail order line per listing',
  stock_reservation: 'Listing stock hold during checkout',
  complaint: 'Complaint or return request on an order and its resolution',
  product_rating: 'Customer\'s rating of a completed order',
  payment_request: 'VietQR payment request: contribution, deposit, balance or order payment',
  provider_transaction: 'Transaction reported by the payment intermediary (webhook), unique per provider id',
  payment_instruction: 'Payout, refund, disbursement or tax instruction from a Batch account',
  settlement: 'Settlement of a Batch: revenue, locked cost, Revenue Pool, remuneration, status',
  settlement_line: 'An investor\'s line of a settlement: pro-rata payout and tax',
  settlement_feedback: 'Investor feedback on a proposed settlement',
  audit_log: 'Append-only, hash-chained audit log',
};

// ---------- Physical (đúng code V001–V017) ----------
function physical(schema, out) {
  const f = new DrawioFile();
  const { tables, fks } = schema;
  const warn = [];
  const areaKey = {}; for (const a of AREAS) for (const t of a.tables) areaKey[t] = a.key;
  const rowsOf = (t, pkOnly) => tables[t].cols.filter(c => !pkOnly || c.pk).map(c => {
    const tags = [];
    if (c.pk) tags.push('PK'); if (c.fk) tags.push('FK'); if (c.uq && !c.pk) tags.push('U');
    const tag = tags.length ? `<font color="#b91c1c"><b>${tags.join(',')}</b></font> ` : '';
    return { key: `${t}.${c.name}`, name: c.name, text: `${tag}${c.name}: ${sqlType(c)}${c.nullable ? '' : ' <font color="#64748b">NOT NULL</font>'}`, style: ATTR + (c.pk ? 'fontStyle=1;' : '') };
  });
  const fkList = [];
  const seen = new Set();
  for (const fk of fks) {
    const key = `${fk.child}>${fk.parent}:${fk.cols.map(c => c[0]).join('+')}`;
    if (seen.has(key)) continue; seen.add(key);
    const childCol = tables[fk.child].cols.find(c => c.name === fk.cols[0][0]);
    const unique = tables[fk.child].uniques.some(u => !FILTERED_UNIQUE.has(u.name) && u.cols.length === 1 && u.cols[0] === childCol.name) || (tables[fk.child].pk.length === 1 && tables[fk.child].pk[0] === childCol.name);
    fkList.push({ child: fk.child, parent: fk.parent, col: childCol.name, opt: childCol.nullable, unique, stamp: STAMP_COLS.has(childCol.name) && fk.parent === 'app_user' });
  }
  const fkStyle = (r) => `startArrow=${r.unique ? 'ERzeroToOne' : 'ERzeroToMany'};endArrow=${r.opt ? 'ERzeroToOne' : 'ERmandOne'};strokeColor=#334155;`;
  const n = Object.keys(tables).length;

  {
    const d = f.page(`Physical – overview of all ${n} tables`);
    cap(d, 'Figure 4.3', 'Physical Database Design: overview of all tables, for orientation only (SQL Server, = code V001–V017)', META(`${n} tables, ${fkList.length} FKs · table names only; read the area pages, Figures 4.3.1–4.3.6, for columns, types and constraints`));
    const nodes = Object.keys(tables).map(t => ({ key: t, w: 200, h: 30 }));
    const edges = fkList.filter(r => !r.stamp).map(r => ({ ...r, a: r.child, b: r.parent }));
    const L = arrangeFit(nodes, edges, { x0: 20, y0: 80, gapY: 12, band: 14, laneGap: 6, minGap: 50, samePenalty: 3000, attachTop: 4 }, 7);
    for (const nd of nodes) {
      const a = AREA[areaKey[nd.key]], p = L.pos[nd.key];
      d.vertex(`<b>${nd.key}</b>`, `rounded=0;whiteSpace=wrap;html=1;fillColor=${a.fill};strokeColor=${a.stroke};fontSize=${FS_ATTR};${FONT}`, p.x, p.y, p.w, p.h, { key: nd.key, raw: true });
    }
    drawRoutes(d, L, fkStyle);
    warn.push(...checkLayout('Physical overview', L));
    const W = Math.max(760, L.width - 40);
    const y = legend(d, 20, L.height + 30, [
      `Areas: ${AREAS.map(a => `<font color="${a.stroke}">■</font> ${a.key} ${a.title}`).join(' · ')}.`,
      'Each line is one foreign key; crow\'s foot: child end O&lt; or O| (unique FK = one-to-one; a filtered unique index such as "one active row" does not make it one-to-one); parent end | (NOT NULL) or O| (nullable).',
      'Audit columns pointing to app_user (approved_by, created_by, reviewed_by…) are not drawn here; they are listed with their FK flag on the area pages.',
    ], W);
    note(d, 20, y + 12, W, 112, '<b>Notes</b><br>'
      + '• This Physical ERD shows the database exactly as the code builds it on develop @ 420a379 (migrations V001–V017, 60 tables, 131 foreign keys). Register v1.4 changes are «planned» and drawn in the Logical ERD (Figure 4.2); traceability and code classes are in Table 4.2; the role of each table is in Table 4.3.<br>'
      + `• Removed from the v1.4 business model but still used by code, so drawn here like every other table: ${Object.keys(REMOVED).join(', ')}.<br>`
      + '• Not drawn: 9 views (v_batch_funding_progress, v_batch_actual_revenue, v_investor_portfolio, v_traceability, v_crab_count_reconciliation, v_batch_commitment_cap, v_settlement_reconciliation, v_operator_reputation, v_overdue_alerts) and the triggers that keep audit, price, cost-lock, harvest and settlement rows append-only or locked.');
  }

  const W = 320;
  for (const a of AREAS) for (const part of partsOf(PARTS_P, a.key, a.tables.filter(t => tables[t]))) {
    const d = f.page(`${a.key}${part.ptag} · ${part.title ?? a.title}`);
    const mine = part.list;
    const set = new Set(mine);
    const pageFks = fkList.filter(r => set.has(r.child) && !r.stamp);
    const ext = new Set(pageFks.map(r => r.parent).filter(p => !set.has(p)));
    cap(d, `Figure 4.3.${a.key.slice(1)}${part.tag}`, `Physical Database Design: ${a.title}${part.title ? ' — ' + part.title : ''}`, META(`${mine.length} tables${ext.size ? ` + ${ext.size} parent tables of other areas or parts (white, key only)` : ''} · lines start at the foreign-key column`));
    const nodes = [];
    for (const t of mine) { const rows = rowsOf(t, false); nodes.push({ key: t, w: W, h: HEAD + rows.length * ROW + 4, rows, full: true, attach: { top: 4, bottom: HEAD + tables[t].pk.length * ROW - 2 } }); }
    for (const t of ext) { const rows = rowsOf(t, true); nodes.push({ key: t, w: W, h: HEAD + rows.length * ROW + 4, rows, full: false }); }
    const rowOf = (t, c) => { const nd = nodes.find(x => x.key === t); return HEAD + nd.rows.findIndex(r => r.name === c) * ROW + ROW / 2; };
    const edges = pageFks.map(r => ({ ...r, a: r.child, b: r.parent, aRow: rowOf(r.child, r.col), aKey: `${r.child}.${r.col}` }));
    const L = arrangeFit(nodes, edges, { x0: 20, y0: 80, gapY: 30, band: 18, laneGap: 10, minGap: 70, samePenalty: 60000, attachTop: HEAD, minSpacing: 6 }, 10);
    for (const nd of nodes) {
      const p = L.pos[nd.key], ar = AREA[areaKey[nd.key]];
      const title = nd.full ? `<b>${nd.key}</b>` : `<b>${nd.key}</b> <font style="font-size:${FS_LABEL}px" color="#475569">(${areaKey[nd.key]})</font>`;
      stackBox(d, nd.key, title, nd.rows, p.x, p.y, p.w, S.entity(nd.full ? ar.fill : '#ffffff', ar.stroke) + `startSize=${HEAD};fontSize=${FS_TITLE};`, ROW, { headerH: HEAD, pad: p.h - HEAD - nd.rows.length * ROW });
    }
    drawRoutes(d, L, fkStyle);
    warn.push(...checkLayout(`Physical ${a.key}`, L));
    legend(d, 20, L.height + 30, [
      'PK primary key · FK foreign key (the line starts at this column) · U column in a unique index · NOT NULL as in the V001–V017 scripts. White box = parent table of another area or part, key only.',
      'Crow\'s foot: child end O&lt; or O| (unique FK = one-to-one); parent end | (NOT NULL FK) or O| (nullable FK). Audit columns pointing to app_user are not drawn.',
    ], Math.max(640, L.width - 40));
  }
  // ---------- Table 4.3: 60 bảng theo vùng (tên bảng, vai trò ngắn, thực thể Logical) — hai phần để in A4 ngang ≥ 5 pt ----------
  const cols3 = [['Area', 44], ['Table', 230], ['Role', 640], ['Logical entity (Figure 4.2)', 230]];
  const w3 = cols3.reduce((t, c) => t + c[1], 0);
  for (const t of Object.keys(tables)) if (!ROLE_P[t]) throw new Error('Table 4.3: no role for ' + t);
  [['A1', 'A2', 'A3'], ['A4', 'A5', 'A6']].forEach((keys, i) => {
    const d = f.page(`Table 4.3 (${i + 1} of 2) Tables by area`);
    cap(d, `Table 4.3 (${i + 1}/2)`, 'Physical Database Design: the 60 tables by area (Figure 4.3)', `${VER} · SQL Server, = code V001–V017 · areas ${keys.join(', ')}`);
    const rows = AREAS.filter(a => keys.includes(a.key)).flatMap(a => a.tables.map(t => [a.key, `<b>${t}</b>`, ROLE_P[t], REMOVED[t] ? '<font color="#6b7280">— removed in v1.4 (code only)</font>' : NAME[t]]));
    const h = tableHeight(cols3, rows);
    d.vertex(htmlTable(cols3, rows), TABLE_STYLE, 20, 70, w3, h, { raw: true });
    d.text(AREAS.filter(a => keys.includes(a.key)).map(a => `${a.key} ${a.title}`).join(' · ') + '. Columns, types and constraints of every table: Figures 4.3.1–4.3.6.', 20, 70 + h + 12, w3, 34, 'fontSize=11;fontColor=#475569;');
  });
  f.write(path.join(out, 'CrabShare_Physical_ERD.drawio'));
  return { warn };
}

// ---------- Mermaid erDiagram của Logical ERD ----------
function mermaidLogical(model) {
  const L = [];
  L.push(`%% CrabShare – Logical ERD (Figure 4.2) · ${VER}`);
  L.push('%% Built from database/migrations V001–V017 (develop @ 420a379) plus the Register v1.4 changes.');
  L.push('%% Types are DBMS-independent: Integer, Money (integer VND), Decimal, Text, Date, DateTime, Boolean, UUID.');
  L.push('%% "planned" = in Register v1.4 but not in code yet; "changed" = meaning or values change in v1.4; "derived" = derived value or snapshot stored once; "composite FK" = BatchId is also part of a composite foreign key that keeps both rows in the same Batch.');
  L.push('%% Removed from the v1.4 model (kept only in the Physical ERD): ProductListing, PriceHistory, PriceCheck, OrderLine, StockReservation, OfftakeCommitment, BatchOfftakePrice, CrabTag, TagScan, ProductionThreshold.');
  L.push(`%% ${PENDING} (Batch opening condition, box rows, forfeited deposits, survival rate, weighed-kg balance, unused Standard Cost, InvoicedSale); the affected rules end with (confirmed by the lead).`);
  L.push('erDiagram');
  for (const a of AREAS) {
    L.push(`    %% ===== ${a.key} · ${AREA14[a.key]}`);
    for (const e of model.ents.filter(x => x.area === a.key)) {
      if (e.planned) L.push(`    %% «planned» entity ${e.name}: no table yet`);
      L.push(`    ${e.name} {`);
      for (const at of e.attrs) {
        const keys = [at.pk && 'PK', at.fk && 'FK', at.uq && !at.pk && 'UK'].filter(Boolean).join(', ');
        const notes = [at.status === 'planned' && 'planned', at.status === 'changed' && 'changed', at.derived && 'derived', at.composite && 'composite FK', at.opt && 'optional'].filter(Boolean).join(', ');
        L.push(`        ${at.type} ${at.name}${keys ? ' ' + keys : ''}${notes ? ` "${notes}"` : ''}`);
      }
      L.push('    }');
      for (const k of e.bk) if (k.length > 1) L.push(`    %% BK ${e.name} (${k.join(', ')})`);
      if (e.rule) L.push(`    %% rule ${e.name}: ${e.rule.replace(/\n/g, ' ')}`);
    }
  }
  L.push('    %% ===== Relationships: parent (left) to child (right), label = foreign key');
  for (const r of model.rels) {
    const left = r.opt ? '|o' : '||';
    const right = r.unique ? 'o|' : r.min1 ? '|{' : 'o{';
    if (r.planned) L.push('    %% planned');
    L.push(`    ${r.parent} ${left}--${right} ${r.child} : "${r.attr}${r.planned ? ' (planned)' : ''}"`);
  }
  return L.join('\n') + '\n';
}

function run(out) {
  const schema = loadSchema();
  const model = logicalModel(schema);
  const c = conceptual(out);
  const l = logical(schema, model, out);
  const p = physical(schema, out);
  fs.writeFileSync(path.join(out, 'Logical_ERD.mmd'), mermaidLogical(model), 'utf8');
  const warn = [...c.warn, ...l.warn, ...p.warn];
  if (warn.length) console.warn('LAYOUT WARNINGS (ERD):\n  ' + warn.join('\n  '));
  console.log(`ERD done: conceptual ${c.count} entities (${c.planned} planned, ${c.rels} relationships), logical ${l.count} entities (${l.planned} planned, ${l.rels} relationships), physical ${Object.keys(schema.tables).length} tables, ${schema.fks.length} FKs`);
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run };
