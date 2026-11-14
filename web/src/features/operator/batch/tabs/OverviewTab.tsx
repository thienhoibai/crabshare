/* Tab Tổng quan của một Lô: việc tiếp theo theo trạng thái, bốn số tiến độ (GET /api/batches/{code}/progress, BR-143),
   ba số tiền của Lô P (GET /api/batches/{code}/money-summary, BR-232). Thông tin Lô, bảng chào giá, thù lao nằm trong khối gấp.
   Huỷ Lô trước khi mở qua POST /api/batches/{code}/cancel (BR-054). */
import { useState } from 'react'
import { Ban, ExternalLink, Pencil } from 'lucide-react'
import type { BatchProgressResponse, BatchResponse, CancelBatchRequest, MoneySummaryResponse } from '../../../../shared/api/api.gen'
import {
  Field, Money, OpAside, OpBtn, OpConfirm, OpDl, OpFacts, OpKv, OpMore, OpNote, OpPanel, OpSteps, OpTable, TextArea, formatDate, formatDateTime, formatVnd,
  label, useGet, useSend,
} from '../../../../shared/ui/console'
import { settlementBasisLabel } from '../../opA'
import type { BatchTabProps } from '../types'

const BEFORE_OPEN = ['Draft', 'PendingApproval', 'NeedsRevision', 'Rejected']
type Next = { title: string; stage: number; links: { tab: string; text: string }[] }

/** Việc tiếp theo của Lô: một câu ngắn, giai đoạn hiện tại (1–5) và các tab cần mở. */
function nextStep(b: BatchResponse): Next {
  switch (b.status) {
    case 'Draft':
    case 'NeedsRevision': return { title: 'Hoàn tất Lô và gửi Admin duyệt', stage: 1, links: [] }
    case 'PendingApproval': return { title: 'Chờ Admin duyệt', stage: 1, links: [] }
    case 'Funding': return { title: b.fundingDeadline ? `Đang gọi vốn tới ${formatDate(b.fundingDeadline)}` : 'Đang gọi vốn', stage: 2, links: [{ tab: 'tien', text: 'Tiền của Lô' }] }
    case 'Sourcing': return b.hasHolding
      ? { title: 'Nhận cua và xếp vào hộp', stage: 3, links: [{ tab: 'nguon-cua', text: 'Nguồn cua' }, { tab: 'luu-nuoi', text: 'Lưu nuôi' }] }
      : { title: 'Nhận cua, phân hạng rồi giao', stage: 3, links: [{ tab: 'nguon-cua', text: 'Nguồn cua' }, { tab: 'thu-hoach', text: 'Phân hạng' }] }
    case 'Stocked':
    case 'InProduction': return { title: 'Chăm sóc và ghi nhật ký mỗi ngày', stage: 3, links: [{ tab: 'nhat-ky', text: 'Nhật ký' }, { tab: 'luu-nuoi', text: 'Lưu nuôi' }] }
    case 'Harvesting': return { title: 'Đo và phân hạng từng con', stage: 4, links: [{ tab: 'thu-hoach', text: 'Thu hoạch' }, { tab: 'giao-hang', text: 'Giao hàng' }] }
    case 'Selling':
    case 'Liquidating': return { title: 'Bán và giao hàng', stage: 4, links: [{ tab: 'giao-hang', text: 'Giao hàng' }, { tab: 'ban-hang', text: 'Bán có hoá đơn' }] }
    case 'Closed': return { title: 'Lô đã đóng', stage: 5, links: [{ tab: 'tien', text: 'Quyết toán' }] }
    case 'Cancelled': return { title: 'Lô đã huỷ', stage: 0, links: [] }
    case 'Rejected': return { title: 'Lô bị Admin từ chối', stage: 0, links: [] }
    default: return { title: 'Chờ quyết toán', stage: 5, links: [{ tab: 'tien', text: 'Quyết toán' }] }
  }
}

export default function OverviewTab({ code, batch: b }: BatchTabProps) {
  const base = `/operator/batches/${encodeURIComponent(code)}`
  const api = `/api/batches/${encodeURIComponent(code)}`
  const opened = !BEFORE_OPEN.includes(b.status)
  const progress = useGet<BatchProgressResponse>(opened ? `${api}/progress` : null, undefined, { retry: false })
  const money = useGet<MoneySummaryResponse>(opened && b.batchMode === 'P' ? `${api}/money-summary` : null, undefined, { retry: false })
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const cancel = useSend<BatchResponse, CancelBatchRequest>('post', `${api}/cancel`, { success: 'Đã huỷ Lô.', onSuccess: () => setCancelling(false), quietError: true })
  const p = progress.data
  const plan = b.costPlan
  const next = nextStep(b)
  const problem = b.status === 'Cancelled' ? b.cancelReason : b.status === 'NeedsRevision' || b.status === 'Rejected' ? b.rejectionReason : null

  return (
    <div className="op-split">
      <div>
        <OpPanel title={next.title} lead={problem ? undefined : `Giai đoạn ${Math.max(next.stage, 1)} trên 5`}>
          {next.stage > 0 && <OpSteps step={next.stage} />}
          {problem && <OpNote tone="danger">{problem}</OpNote>}
          {(b.canEdit || next.links.length > 0) && (
            <div className="op-actions">
              {b.canEdit && <a className="rd-btn rd-btn--primary" href={`${base}/edit`}><Pencil size={16} /> Sửa Lô</a>}
              {b.canEdit && plan && <a className="rd-btn rd-btn--ghost" href={`${base}/edit?buoc=gui-duyet`}>Gửi duyệt</a>}
              {next.links.map((l, i) => <a key={l.tab} className={`rd-btn ${i === 0 && !b.canEdit ? 'rd-btn--primary' : 'rd-btn--ghost'}`} href={`${base}/${l.tab}`}>{l.text}</a>)}
            </div>
          )}
        </OpPanel>

        {p && (
          <OpFacts items={[
            { label: 'Cua đang ở trại', value: `${p.crabsAlive} con`, tone: 'ok' },
            { label: 'Ngày nuôi', value: p.daysRaised ?? '—' },
            { label: 'Đã chết', value: p.deadCrabs ?? 0, tone: p.deadCrabs ? 'danger' : undefined },
            { label: 'Đã duyệt hạng', value: p.gradedCrabs ?? 0, tone: 'info' },
          ]} />
        )}

        {money.data && (
          <OpPanel title="Tiền của Lô" subtitle="Số dư tài khoản của Lô gồm cả tiền cọc và tiền hàng của khách.">
            <OpFacts items={[
              { label: 'Đã góp', value: formatVnd(money.data.batch.contributed) },
              { label: 'Đã giải ngân', value: formatVnd(money.data.batch.disbursed), tone: 'info' },
              { label: 'Còn giữ ở tài khoản Lô', value: formatVnd(money.data.batch.heldInAccount) },
            ]} />
          </OpPanel>
        )}

        <OpPanel title="Chi tiết Lô">
          <OpMore label="Thông tin Lô">
            <OpKv items={[
              { label: 'Phương thức', value: label('batchMode', b.batchMode) },
              { label: 'Đơn vị thực hiện', value: b.executor?.legalName },
              { label: 'Số con kế hoạch', value: `${b.plannedQuantity} con` },
              { label: 'Số con được cấp vốn', value: b.fundedQuantity === null ? null : `${b.fundedQuantity} con` },
              { label: 'Lưu nuôi', value: b.hasHolding ? `${b.holdingDays ?? '?'} ngày` : 'Không' },
              { label: 'Hạn thả bù', value: b.hasHolding ? `${b.restockCutoffDays} ngày đầu` : null },
              { label: 'Đã thả bù', value: p?.restockedCrabs },
              { label: 'Đã giao hoặc bán', value: p?.deliveredOrSoldCrabs },
              { label: 'Số ngày bán', value: b.saleDays ? `${b.saleDays} ngày` : null },
              { label: 'Khối lượng trung bình', value: b.expectedAvgWeightG ? `${b.expectedAvgWeightG} g` : null },
              { label: 'Hạng dự kiến', value: b.expectedGrade },
              { label: 'Ngày nhận cua', value: formatDate(b.expectedReceiptDate) },
              { label: 'Bán kính giao', value: b.deliveryRadiusKm ? `${b.deliveryRadiusKm} km` : null },
              { label: 'Nơi xuất hàng', value: b.dispatchSite?.name },
              { label: 'Cơ sở quyết toán', value: settlementBasisLabel(b.settlementBasis) },
              { label: 'Bên cam kết thu mua', value: b.offtakeBuyer?.legalName },
              { label: 'Giá sàn', value: b.floorPricePerKg ? `${formatVnd(b.floorPricePerKg)} / kg` : null },
              { label: 'Phí nền tảng', value: b.platformFeeRatePct === null ? null : `${b.platformFeeRatePct}%` },
              { label: 'Hạn đặt trước', value: formatDateTime(b.preorderDeadline) },
            ]} />
          </OpMore>
          {b.offers.length > 0 && (
            <OpMore label="Bảng chào giá" count={b.offers.length}>
              <OpTable
                rows={b.offers}
                rowKey={(o) => o.offerId}
                columns={[
                  { key: 'spec', header: 'Quy cách', cell: (o) => <b>{o.specName}</b> },
                  { key: 'price', header: 'Giá mỗi kg', num: true, cell: (o) => <Money value={o.pricePerKg} /> },
                  { key: 'weight', header: 'Mỗi con', num: true, cell: (o) => `${o.conversionWeightG} g` },
                  { key: 'qty', header: 'Chào bán', num: true, cell: (o) => `${o.offeredQuantity} con` },
                ]}
              />
            </OpMore>
          )}
        </OpPanel>
      </div>

      <OpAside>
        {b.batchMode === 'P' && (
          <>
            <OpDl items={[
              { label: 'Vốn mục tiêu', value: plan ? formatVnd(b.targetCapital) : '—' },
              { label: 'Chi phí chuẩn mỗi con', value: plan ? formatVnd(plan.costPerCrab) : '—' },
              { label: 'Góp tối thiểu', value: formatVnd(b.minContribution) },
              { label: 'Hạn góp vốn', value: formatDateTime(b.fundingDeadline) || '—' },
            ]} />
            <OpMore label="Vốn và thù lao">
              <OpDl items={[
                { label: 'Vốn tối thiểu khả thi', value: b.minViableCapital > 1 ? formatVnd(b.minViableCapital) : '—' },
                { label: 'Mở gọi vốn', value: formatDateTime(b.fundingOpenAt) || '—' },
                ...(b.remunerationTiers.length
                  ? b.remunerationTiers.map((t) => ({ label: `Thù lao khi sống ${t.survivalFromPct}–${t.survivalToPct}%`, value: `${t.ratePct}%` }))
                  : b.baseRemunerationPct !== null ? [{ label: 'Thù lao người nuôi', value: `${b.baseRemunerationPct}%` }] : []),
              ]} />
              {b.minViableBasis && <small className="rd-muted">{b.minViableBasis}</small>}
            </OpMore>
          </>
        )}
        {opened && b.status !== 'Cancelled' && <a className="rd-btn rd-btn--ghost rd-btn--block" href={`/lo/${encodeURIComponent(code)}`}><ExternalLink size={16} /> Trang công khai</a>}
        {b.canCancel && <OpBtn variant="danger" full onClick={() => setCancelling(true)}><Ban size={16} /> Huỷ Lô</OpBtn>}
      </OpAside>

      {cancelling && (
        <OpConfirm title="Huỷ Lô" sub={b.title} confirmLabel="Huỷ Lô" variant="danger" pending={cancel.isPending} error={cancel.error}
          disabled={!reason.trim()} onConfirm={() => cancel.mutate({ reason: reason.trim() })} onClose={() => setCancelling(false)}>
          <Field label="Lý do huỷ" required>
            <TextArea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <p className="rd-muted">Khoản giữ chỗ và tiền cọc đặt trước được hoàn.</p>
        </OpConfirm>
      )}
    </div>
  )
}
