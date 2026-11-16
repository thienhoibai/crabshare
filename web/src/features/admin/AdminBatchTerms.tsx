/* Ba tab hồ sơ của trang chi tiết Lô, dữ liệu từ GET /api/admin/batches/{code}:
   AdminBatchTerms (điều khoản, vốn và thù lao), BatchOffersPanel (chào giá theo quy cách), BatchCostPanel (kế hoạch chi phí, mốc giải ngân). */
import type { BatchResponse, CostItemResponse } from '../../shared/api/api.gen'
import {
  Money, OpEmpty, OpFacts, OpKv, OpMore, OpPanel, OpTable, StatusBadge, formatDate, formatDateTime, formatVnd, label, type KvItem,
} from '../../shared/ui/console'
import { CostPlanStatusBadge, costBearerLabel, formatNumber, milestoneKindLabel, settlementBasisLabel, type AdminBatch } from './adminPartA'

const partyLink = (party: { partyId: number; legalName: string } | null) =>
  party ? <a className="op-link" href={`/admin/parties/${party.partyId}`}>{party.legalName}</a> : null
const filled = (items: KvItem[]) => items.filter((i) => i.value !== null && i.value !== undefined && i.value !== '')

export default function AdminBatchTerms({ detail }: { detail: AdminBatch }) {
  const b = detail.batch
  const isP = b.batchMode === 'P'
  const more = filled([
    { label: 'Số con được cấp vốn', value: b.fundedQuantity !== null ? `${b.fundedQuantity} con` : null },
    { label: 'Hạng dự kiến', value: b.expectedGrade },
    { label: 'Số ngày bán', value: b.saleDays ? `${b.saleDays} ngày` : null },
    { label: 'Bán kính giao', value: b.deliveryRadiusKm ? `${formatNumber(b.deliveryRadiusKm)} km` : null },
    { label: 'Địa điểm xuất hàng', value: b.dispatchSite ? `${b.dispatchSite.name}, ${b.dispatchSite.addressLine}` : null },
    { label: 'Cơ sở quyết toán', value: settlementBasisLabel(b.settlementBasis) },
    { label: 'Mở gọi vốn', value: formatDateTime(b.fundingOpenAt) },
  ])

  return (
    <>
      <OpPanel title="Kế hoạch">
        <OpKv items={filled([
          { label: 'Hộ nuôi vận hành', value: <>{detail.operatorName} {detail.operatorStatus !== 'Approved' && <StatusBadge kind="operator" value={detail.operatorStatus} />}</> },
          { label: 'Đơn vị thực hiện', value: partyLink(b.executor) },
          { label: 'Bên cam kết thu mua', value: partyLink(b.offtakeBuyer) },
          { label: 'Giá sàn đơn hàng cuối', value: b.floorPricePerKg ? `${formatVnd(b.floorPricePerKg)} / kg` : null },
          { label: 'Lưu nuôi', value: b.hasHolding ? `${b.holdingDays ?? '?'} ngày` : 'Không lưu nuôi' },
          { label: 'Khối lượng trung bình', value: b.expectedAvgWeightG ? `${b.expectedAvgWeightG} g` : null },
          { label: isP ? 'Hạn gọi vốn' : 'Hạn đặt trước', value: formatDateTime(isP ? b.fundingDeadline : b.preorderDeadline) },
        ])} />
        {more.length > 0 && <OpMore label="Chi tiết khác"><OpKv items={more} /></OpMore>}
      </OpPanel>

      {isP && (
        <OpPanel title="Vốn và thù lao người nuôi">
          <OpFacts items={[
            { label: 'Vốn mục tiêu', value: formatVnd(b.targetCapital) },
            { label: 'Vốn tối thiểu khả thi', value: formatVnd(b.minViableCapital), tone: b.minViableCapital > b.targetCapital ? 'danger' : undefined },
            { label: 'Góp tối thiểu', value: formatVnd(b.minContribution) },
            { label: 'Phí nền tảng', value: b.platformFeeRatePct !== null ? `${formatNumber(b.platformFeeRatePct)}% doanh thu` : 'Chốt khi duyệt' },
          ]} />
          {b.remunerationTiers.length > 0 && (
            <OpMore label="Bậc thù lao" count={b.remunerationTiers.length}>
              <OpKv items={filled([
                { label: 'Ngưỡng tỷ lệ sống', value: b.survivalThresholdPct !== null ? `${formatNumber(b.survivalThresholdPct)}%` : null },
                { label: 'Thù lao cơ sở', value: b.baseRemunerationPct !== null ? `${formatNumber(b.baseRemunerationPct)}%` : null },
                { label: 'Căn cứ vốn tối thiểu', value: b.minViableBasis },
              ])} />
              <OpTable
                rows={b.remunerationTiers}
                rowKey={(t) => t.tierNo}
                columns={[
                  { key: 'range', header: 'Tỷ lệ sống', cell: (t) => `${formatNumber(t.survivalFromPct)}% – ${formatNumber(t.survivalToPct)}%` },
                  { key: 'rate', header: 'Thù lao', num: true, cell: (t) => `${formatNumber(t.ratePct)}%` },
                ]}
              />
            </OpMore>
          )}
        </OpPanel>
      )}
    </>
  )
}

export function BatchOffersPanel({ batch: b }: { batch: BatchResponse }) {
  return (
    <OpPanel title="Chào giá theo quy cách" subtitle="Giá tính theo kg nghiệm thu khi giao.">
      <OpTable
        rows={b.offers}
        rowKey={(o) => o.offerId}
        empty="Lô chưa có chào giá nào"
        columns={[
          { key: 'spec', header: 'Quy cách', cell: (o) => <b>{o.specName}</b> },
          { key: 'price', header: 'Giá mỗi kg', num: true, cell: (o) => <Money value={o.pricePerKg} /> },
          { key: 'weight', header: 'Mỗi con', num: true, cell: (o) => `${o.conversionWeightG} g` },
          { key: 'qty', header: 'Chào bán', num: true, cell: (o) => `${o.offeredQuantity} con` },
        ]}
        foot={b.offers.length > 1 ? (
          <tr>
            <td colSpan={3}>Tổng</td>
            <td className="is-num"><b>{b.offers.reduce((n, o) => n + o.offeredQuantity, 0)} con</b></td>
          </tr>
        ) : undefined}
      />
    </OpPanel>
  )
}

export function BatchCostPanel({ detail }: { detail: AdminBatch }) {
  const plan = detail.batch.costPlan
  if (!plan) return detail.batch.canEdit ? null : <OpPanel><OpEmpty title="Lô chưa có kế hoạch chi phí" /></OpPanel>
  const hasActual = plan.items.some((i) => i.actualAmount > 0)
  const milestones = plan.milestones

  return (
    <>
      <OpPanel title="Kế hoạch chi phí" action={<CostPlanStatusBadge status={plan.status} />}>
        <OpFacts items={[
          { label: 'Tổng chi phí Lô chịu', value: formatVnd(plan.total) },
          { label: 'Chi phí chuẩn mỗi con', value: formatVnd(plan.costPerCrab) },
          { label: 'Phiên bản', value: `${plan.versionNo}${plan.lockedAt ? ` · khoá ${formatDate(plan.lockedAt)}` : ''}` },
        ]} />
        <OpTable
          rows={plan.items}
          rowKey={(i) => i.costItemId}
          empty="Kế hoạch chi phí chưa có khoản nào"
          columns={[
            {
              key: 'desc', header: 'Khoản chi',
              cell: (i) => (
                <>
                  <b>{i.description}</b>
                  <br />
                  <small className="rd-muted">
                    {[label('costCategory', i.category), i.costBearer && i.costBearer !== 'Batch' ? costBearerLabel(i.costBearer) : null, i.basis].filter(Boolean).join(' · ')}
                  </small>
                </>
              ),
            },
            { key: 'qty', header: 'Số lượng', num: true, cell: (i) => `${formatNumber(i.quantity)} ${i.unit}` },
            { key: 'price', header: 'Đơn giá', num: true, cell: (i) => <Money value={i.unitPrice} /> },
            { key: 'amount', header: 'Thành tiền', num: true, cell: (i) => <Money value={i.amount} /> },
            ...(hasActual ? [{ key: 'actual', header: 'Thực chi', num: true, cell: (i: CostItemResponse) => (i.actualAmount > 0 ? <Money value={i.actualAmount} /> : '—') }] : []),
          ]}
        />
      </OpPanel>

      {detail.tranches.length > 0 ? (
        <OpPanel title="Mốc giải ngân" action={<a className="op-link" href="/admin/tranches">Duyệt giải ngân</a>}>
          <OpTable
            rows={detail.tranches}
            rowKey={(t) => t.no}
            columns={[
              { key: 'no', header: 'Mốc', cell: (t) => <><b>{t.no}. {t.name ?? milestoneKindLabel(t.kind)}</b><br /><small className="rd-muted">{t.unlockCondition}</small></> },
              { key: 'pct', header: 'Tỷ lệ', num: true, cell: (t) => (t.pct !== null ? `${formatNumber(t.pct)}%` : '—') },
              { key: 'amount', header: 'Số tiền', num: true, cell: (t) => <Money value={t.plannedAmount} /> },
              { key: 'status', header: 'Trạng thái', cell: (t) => <StatusBadge kind="tranche" value={t.status} /> },
            ]}
          />
        </OpPanel>
      ) : milestones.length > 0 && (
        <OpPanel title="Mốc giải ngân">
          <OpTable
            rows={milestones}
            rowKey={(m) => m.no}
            columns={[
              { key: 'no', header: 'Mốc', cell: (m) => <><b>{m.no}. {m.name}</b><br /><small className="rd-muted">{m.unlockCondition}</small></> },
              { key: 'pct', header: 'Tỷ lệ', num: true, cell: (m) => `${formatNumber(m.pct)}%` },
              { key: 'amount', header: 'Số tiền dự tính', num: true, cell: (m) => <Money value={m.plannedAmount} /> },
            ]}
          />
        </OpPanel>
      )}
    </>
  )
}
