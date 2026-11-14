/* /lo/:code — Trang công khai của một Lô: thông tin, bảng chào giá theo quy cách, tiến độ, chi phí chuẩn.
   GET /api/batches/{code} (người nuôi và Admin nhận bản soạn thảo nên trang lấy thêm từ danh sách công khai),
   GET /api/batches/{code}/progress (BR-143), GET /api/batches/{code}/availability (BR-055, BR-089).
   Cổng khách hàng dùng lại nội dung (BatchDetail embedded) ở /khach/lo/:code để giữ menu trái.
   Nút đặt trước chỉ hiện khi Lô có bảng chào giá và còn số lượng; không thì nói rõ vì sao chưa đặt được. */
import { type ReactNode } from 'react'
import { useParams } from 'react-router'
import { ArrowLeft, HandCoins, ShoppingBag } from 'lucide-react'
import type { AvailabilityResponse, BatchProgressResponse, ExploreBatchResponse, PagedResultOfExploreBatchResponse } from '../../shared/api/api.gen'
import { useAuthStore } from '../../shared/auth/authStore'
import PublicShell from '../../shared/layout/SiteShell'
import {
  Money, OpAside, OpBack, OpBadge, OpDl, OpError, OpFacts, OpKv, OpLoading, OpMeter, OpMore, OpNote, OpPanel, OpTable, StatusBadge, crabImg, formatDate,
  formatVnd, label, useGet,
} from '../../shared/ui/console'
import { MODE_NOTE, isFunding, takesPreorders } from './batchView'

/** Khung rỗng khi nội dung nằm trong cổng có menu (đã có khung riêng). */
function Plain({ children }: { children: ReactNode; narrow?: boolean }) {
  return <>{children}</>
}

/** Người nuôi và Admin nhận BatchResponse (không có executorName) từ cùng đường dẫn. */
const isExplore = (data: unknown): data is ExploreBatchResponse => !!data && typeof data === 'object' && 'executorName' in data

export default function BatchPublicPage() {
  const { code = '' } = useParams()
  return <BatchDetail code={code} />
}

/** Nội dung trang một Lô. embedded = true: nằm trong cổng khách hàng, không bọc khung trang công khai. */
export function BatchDetail({ code, embedded = false }: { code: string; embedded?: boolean }) {
  const SiteShell = embedded ? Plain : PublicShell
  const listHref = embedded ? '/khach/lo' : '/lo'
  const user = useAuthStore((s) => s.user)
  const path = `/api/batches/${encodeURIComponent(code)}`
  const direct = useGet<unknown>(path)
  const needList = direct.isSuccess && !isExplore(direct.data)
  const list = useGet<PagedResultOfExploreBatchResponse>(needList ? '/api/batches' : null, { scope: 'all', pageSize: 100 })
  const progress = useGet<BatchProgressResponse>(`${path}/progress`, undefined, { retry: false })
  const availability = useGet<AvailabilityResponse>(`${path}/availability`, undefined, { retry: false })

  const batch = isExplore(direct.data) ? direct.data : list.data?.items.find((b) => b.batchCode === code)

  if (direct.isPending || (needList && list.isPending)) return <SiteShell><OpLoading /></SiteShell>
  if (direct.isError) return <SiteShell narrow><OpError error={direct.error} onRetry={() => void direct.refetch()} /></SiteShell>
  if (!batch) return <SiteShell narrow><OpNote tone="info">Lô {code} chưa được công bố. Người nuôi xem bản soạn thảo ở cổng người nuôi.</OpNote></SiteShell>

  const funding = isFunding(batch)
  // Lô có trạng thái nhận đặt trước nhưng chưa có bảng chào giá thì chưa đặt được (không dẫn khách vào trang trống).
  const accepting = availability.data?.acceptingPreorders ?? takesPreorders(batch)
  const preorder = accepting && batch.offers.length > 0
  const soldOut = preorder && availability.data !== undefined && availability.data.remainingCrabs <= 0
  const specs = availability.data?.specs
  const isInvestor = !!user?.roles.includes('Investor')
  const isCustomer = !!user?.roles.includes('Customer')
  const loginNext = (to: string) => (user ? to : `/dang-nhap?next=${encodeURIComponent(to)}`)

  return (
    <SiteShell>
      <OpBack href={listHref}><ArrowLeft size={16} /> {embedded ? 'Lô nhận đặt trước' : 'Các Lô đang mở'}</OpBack>

      <div className="op-cover">
        <img src={crabImg(batch.crabType, 1400)} alt="" />
        <StatusBadge kind="batch" value={batch.status} />
        <div className="op-cover__text">
          <small>{batch.batchCode} · {label('crabType', batch.crabType)}{batch.executorName ? ` · ${batch.executorName}` : ''}</small>
          <b>{batch.title}</b>
        </div>
      </div>

      <div className="op-split">
        <div>
          <OpPanel title="Thông tin Lô" subtitle={MODE_NOTE[batch.batchMode]}>
            <OpKv items={[
              { label: 'Số cua dự kiến', value: `${batch.plannedQuantity} con` },
              { label: 'Lưu nuôi', value: batch.hasHolding ? `${batch.holdingDays ?? '?'} ngày` : 'Không lưu nuôi' },
              { label: 'Khối lượng trung bình', value: batch.expectedAvgWeightG ? `${batch.expectedAvgWeightG} g` : null },
              { label: 'Hạng dự kiến', value: batch.expectedGrade },
              { label: 'Nhận cua dự kiến', value: formatDate(batch.expectedReceiptDate) },
              { label: 'Bán kính giao', value: batch.deliveryRadiusKm ? `${batch.deliveryRadiusKm} km` : null },
            ].filter((i) => i.value)} />
            {(batch.offtakeBuyerName || batch.saleDays) && (
              <OpMore label="Điều khoản bán hàng">
                <OpKv items={[
                  { label: 'Số ngày bán', value: batch.saleDays ? `${batch.saleDays} ngày` : null },
                  { label: 'Bên cam kết thu mua', value: batch.offtakeBuyerName },
                  { label: 'Giá sàn đơn hàng cuối', value: batch.floorPricePerKg ? `${formatVnd(batch.floorPricePerKg)} / kg` : null },
                ].filter((i) => i.value)} />
              </OpMore>
            )}
          </OpPanel>

          {(specs?.length || batch.offers.length > 0) && (
            <OpPanel title="Bảng giá theo quy cách" subtitle="Giá tính theo kg nghiệm thu khi giao.">
              <OpTable
                rows={specs ?? batch.offers.map((o) => ({ ...o, committed: 0, remaining: o.offeredQuantity }))}
                rowKey={(r) => r.specCode}
                columns={[
                  { key: 'spec', header: 'Quy cách', cell: (r) => <><b>{r.specName}</b><br /><small className="op-mono rd-muted">{r.specCode}</small></> },
                  { key: 'price', header: 'Giá mỗi kg', num: true, cell: (r) => <Money value={r.pricePerKg} /> },
                  { key: 'weight', header: 'Mỗi con khoảng', num: true, cell: (r) => `${r.conversionWeightG} g` },
                  { key: 'remaining', header: 'Còn đặt được', num: true, cell: (r) => <b>{specs ? r.remaining : r.offeredQuantity} con</b> },
                ]}
              />
            </OpPanel>
          )}

          {progress.data && (progress.data.crabsAlive > 0 || progress.data.daysRaised !== null) && (
            <OpPanel title="Tiến độ" subtitle="Người đã góp vốn hoặc đã đặt trước ở Lô này thấy thêm số chết, thả bù và đã phân hạng.">
              <OpFacts items={[
                { label: 'Cua đang nuôi', value: `${progress.data.crabsAlive} con`, tone: 'ok' },
                { label: 'Số ngày nuôi', value: progress.data.daysRaised ?? '—' },
                ...(progress.data.isParticipant ? [
                  { label: 'Đã chết', value: progress.data.deadCrabs ?? 0, tone: 'danger' as const },
                  { label: 'Đã phân hạng', value: progress.data.gradedCrabs ?? 0, tone: 'info' as const },
                ] : []),
              ]} />
            </OpPanel>
          )}

          {batch.costByCategory && batch.costByCategory.length > 0 && (
            <OpPanel title={`Chi phí chuẩn ${formatVnd(batch.standardCostTotal)}`}>
              <OpMore label="Xem theo nhóm chi phí">
                {batch.costByCategory.map((c) => (
                  <OpMeter key={c.category} label={label('costCategory', c.category)} value={c.amount} max={batch.standardCostTotal} display={formatVnd(c.amount)} />
                ))}
              </OpMore>
            </OpPanel>
          )}
        </div>

        <OpAside>
          <div className="op-inline">
            <OpBadge tone={batch.batchMode === 'P' ? 'gold' : 'info'}>{label('batchMode', batch.batchMode)}</OpBadge>
            {preorder && <OpBadge tone="ok">Nhận đặt trước</OpBadge>}
          </div>

          {funding && (
            <>
              <OpMeter label="Vốn đã xác nhận" value={batch.confirmedCapital} max={batch.targetCapital}
                display={`${formatVnd(batch.confirmedCapital)} / ${formatVnd(batch.targetCapital)}`} />
              <OpDl items={[
                { label: 'Còn nhận', value: formatVnd(batch.remainingCapital) },
                { label: 'Góp tối thiểu', value: formatVnd(batch.minContribution) },
                { label: 'Hạn góp vốn', value: formatDate(batch.fundingDeadline) || '—' },
              ]} />
              {(!user || isInvestor) && (
                <a className="rd-btn rd-btn--primary rd-btn--block" href={loginNext(`/nha-dau-tu/gop-von/${encodeURIComponent(batch.batchCode)}`)}><HandCoins size={17} /> Góp vốn</a>
              )}
              <p className="rd-muted" style={{ fontSize: 13 }}>Góp vốn có rủi ro, nền tảng không cam kết kết quả tài chính.</p>
            </>
          )}

          {preorder && (
            <>
              <OpDl items={[
                { label: 'Còn đặt được', value: availability.data ? `${availability.data.remainingCrabs} con` : '—' },
                { label: 'Đặt cọc', value: availability.data ? `${availability.data.depositRatePct}%` : '—' },
                { label: 'Hạn đặt trước', value: formatDate(batch.preorderDeadline) || '—' },
              ]} />
              {soldOut
                ? <OpNote tone="info">Đã hết số lượng nhận đặt trước của Lô này.</OpNote>
                : (!user || isCustomer) && (
                  <a className={`rd-btn ${funding ? 'rd-btn--dark' : 'rd-btn--primary'} rd-btn--block`} href={loginNext(`/khach/dat-truoc/${encodeURIComponent(batch.batchCode)}`)}><ShoppingBag size={17} /> Đặt trước</a>
                )}
            </>
          )}

          {accepting && !preorder && <OpNote tone="info">Lô chưa mở bảng chào giá nên chưa nhận đặt trước.</OpNote>}
          {!funding && !accepting && <OpNote tone="info">Lô này hiện không nhận góp vốn và đặt trước.</OpNote>}
          <a className="op-link" href="/chuan-phan-hang">Chuẩn phân hạng</a>
        </OpAside>
      </div>
    </SiteShell>
  )
}
