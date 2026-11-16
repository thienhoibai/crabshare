/* /nha-dau-tu/lo/:code — Một Lô đang gọi vốn: số liệu gọi vốn, điều kiện của tôi, khoản tôi đang giữ chỗ (GET /api/funding/batches/{code})
   và thông tin công khai của Lô kèm chi phí chuẩn theo nhóm (GET /api/batches/{code}). Việc chính của trang: nút góp vốn. */
import { useParams } from 'react-router'
import { ArrowLeft, HandCoins } from 'lucide-react'
import type { ExploreBatchResponse, FundingBatchResponse } from '../../shared/api/api.gen'
import {
  OpAside, OpBack, OpDl, OpFacts, OpFlow, OpHeading, OpKv, OpMeter, OpMore, OpNote, OpPanel, QueryView, StatusBadge, formatDate, formatDateTime,
  formatVnd, label, useGet,
} from '../../shared/ui/console'
import { contributeHref, enc } from './investorShared'

/** Nhà đầu tư nhận bản công khai của Lô; vai trò khác nhận kiểu khác nên kiểm tra trước khi dùng. */
const isExplore = (data: unknown): data is ExploreBatchResponse => !!data && typeof data === 'object' && 'costByCategory' in data

const BASIS: Record<string, string> = { StandardCost: 'Theo chi phí chuẩn', ActualCost: 'Theo chi phí thực tế có chứng từ' }

export default function FundingDetailPage() {
  const { code = '' } = useParams()
  const funding = useGet<FundingBatchResponse>(`/api/funding/batches/${enc(code)}`, undefined, { retry: false })
  const info = useGet<unknown>(`/api/batches/${enc(code)}`, undefined, { retry: false })
  const batch = isExplore(info.data) ? info.data : null

  return (
    <QueryView query={funding}>
      {(f) => {
        const reservation = f.myActiveReservation
        return (
          <>
            <OpHeading
              crumb={<OpBack href="/nha-dau-tu/lo"><ArrowLeft size={16} /> Lô đang gọi vốn</OpBack>}
              eyebrow={`${f.batchCode} · ${label('crabType', f.crabType)} · ${f.operatorName}`}
              title={f.title}
              action={<StatusBadge kind="batch" value={f.status} />}
            />

            <div className="op-split">
              <div>
                <OpPanel title="Gọi vốn" subtitle={`Tới hạn mà chưa đủ ${formatVnd(f.minViableCapital)} thì Lô huỷ và hoàn toàn bộ khoản đã góp.`}>
                  <OpMeter label={`${f.investorCount} nhà đầu tư đã góp`} value={f.confirmedCapital} max={f.targetCapital}
                    display={`${formatVnd(f.confirmedCapital)} / ${formatVnd(f.targetCapital)}`} />
                  <OpFacts items={[
                    { label: 'Còn nhận', value: formatVnd(f.remainingCapacity), tone: 'info' },
                    { label: 'Góp tối thiểu', value: formatVnd(f.minContribution) },
                    { label: 'Hạn góp vốn', value: formatDate(f.fundingDeadline) || '—' },
                  ]} />
                  <OpMore label="Chi tiết gọi vốn">
                    <OpKv items={[
                      { label: 'Đang giữ chỗ', value: formatVnd(f.reservedCapital) },
                      { label: 'Vốn tối thiểu để Lô chạy', value: formatVnd(f.minViableCapital) },
                      { label: 'Trần vốn', value: formatVnd(f.maxCapital) },
                      { label: 'Mở gọi vốn', value: formatDateTime(f.fundingOpenAt) },
                      { label: 'Hạn góp vốn', value: formatDateTime(f.fundingDeadline) },
                    ]} />
                  </OpMore>
                </OpPanel>

                {batch?.costByCategory && batch.costByCategory.length > 0 && (
                  <OpPanel title="Chi phí chuẩn" action={<b className="rd-num">{formatVnd(batch.standardCostTotal)}</b>}>
                    <div className="op-stack">
                      {batch.costByCategory.map((c) => (
                        <OpMeter key={c.category} label={label('costCategory', c.category)} value={c.amount} max={batch.standardCostTotal} display={formatVnd(c.amount)} />
                      ))}
                    </div>
                    <OpMore label="Thông tin Lô">
                      <OpKv items={[
                        { label: 'Số cua dự kiến', value: `${batch.plannedQuantity} con` },
                        { label: 'Lưu nuôi', value: batch.hasHolding ? `${batch.holdingDays ?? '?'} ngày` : 'Không lưu nuôi' },
                        { label: 'Chi phí chuẩn mỗi con', value: batch.standardCostPerCrab ? formatVnd(batch.standardCostPerCrab) : null },
                        { label: 'Ngày nhận cua dự kiến', value: formatDate(batch.expectedReceiptDate) },
                        { label: 'Bên cam kết thu mua', value: batch.offtakeBuyerName },
                        { label: 'Giá sàn đơn hàng cuối', value: batch.floorPricePerKg ? `${formatVnd(batch.floorPricePerKg)} / kg` : null },
                        { label: 'Phí nền tảng', value: batch.platformFeeRatePct !== null ? `${batch.platformFeeRatePct}% doanh thu` : null },
                        { label: 'Trừ chi phí khi quyết toán', value: BASIS[batch.settlementBasis] ?? batch.settlementBasis },
                      ]} />
                    </OpMore>
                  </OpPanel>
                )}
              </div>

              <OpAside>
                <OpFlow steps={[
                  { title: 'Xác minh danh tính', state: f.me.kycVerified ? 'done' : 'now' },
                  { title: 'Xác nhận công bố rủi ro', state: f.me.riskAcknowledged ? 'done' : f.me.kycVerified ? 'now' : 'todo' },
                  { title: 'Giữ chỗ và chuyển khoản', sub: reservation ? `Đang giữ ${formatVnd(reservation.amount)}` : undefined, state: reservation ? 'now' : 'todo' },
                  { title: 'Ký hợp đồng' },
                ]} />

                {reservation && (
                  <OpDl items={[{ label: 'Hết hạn giữ chỗ', value: formatDateTime(reservation.expiresAt) }]} />
                )}

                {f.isOpen || reservation ? (
                  <a className="rd-btn rd-btn--primary rd-btn--block" href={contributeHref(f.batchCode)}>
                    <HandCoins size={17} /> {reservation ? 'Tiếp tục chuyển khoản' : 'Góp vốn vào Lô'}
                  </a>
                ) : (
                  <OpNote tone="info">Lô đã hết hạn hoặc đã chốt vốn.</OpNote>
                )}
                <p className="rd-muted" style={{ fontSize: 13 }}>Bạn có thể mất toàn bộ số tiền đã góp.</p>
                <a className="op-link" href={`/lo/${enc(f.batchCode)}`}>Trang công khai của Lô</a>
              </OpAside>
            </div>
          </>
        )
      }}
    </QueryView>
  )
}
