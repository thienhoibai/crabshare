import { useState } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  EyeOff,
  History,
  Info,
  ShoppingBag,
  User,
  X,
} from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime, formatVnd } from '../../shared/lib/format'
import { CRAB_TYPE_LABELS, REASON_LABELS, STATUS_LABELS } from '../operator/listingsApi'
import { useListingAudit, type AdminListing } from './adminListingsApi'

const kg = (value: number) => `${value.toLocaleString('vi-VN', { maximumFractionDigits: 3 })} kg`

export function ListingAuditModal({
  listingId,
  onClose,
  onOpenHide,
}: {
  listingId: number | null
  onClose: () => void
  onOpenHide: (listing: AdminListing) => void
}) {
  const [tab, setTab] = useState<'timeline' | 'orders'>('timeline')
  const { data: audit, isLoading, isError, error } = useListingAudit(listingId)

  if (listingId === null) return null

  const listing = audit?.listing
  const metrics = audit?.riskMetrics

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-slate-200 bg-slate-50/80">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-md bg-slate-200 text-xs font-mono font-bold text-slate-700">
                NY-{listingId}
              </span>
              {listing && (
                <>
                  <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-xs font-bold text-amber-900">
                    Lô {listing.batchCode}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-xs font-medium text-slate-700">
                    {CRAB_TYPE_LABELS[listing.crabType] ?? listing.crabType} · {listing.gradeName}
                  </span>
                  {listing.hiddenAt ? (
                    <span className="px-2.5 py-0.5 rounded-md bg-rose-100 text-xs font-bold text-rose-800">
                      Đã bị ẩn
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-xs font-bold text-emerald-800">
                      {STATUS_LABELS[listing.status] ?? listing.status}
                    </span>
                  )}
                </>
              )}
            </div>
            <h2 id="audit-modal-title" className="text-xl font-extrabold text-slate-900">
              {listing?.title ?? `Hồ sơ kiểm toán niêm yết NY-${listingId}`}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {listing?.farmName} · Rà soát biến động giá, đối chiếu đơn hàng và phòng chống gian lận thương mại.
            </p>
          </div>

          <button
            type="button"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {isLoading && (
            <div className="py-16 text-center text-slate-500 text-sm animate-pulse">
              Đang tải dữ liệu hồ sơ kiểm toán và dòng thời gian...
            </div>
          )}

          {isError && (
            <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-sm">
              {errorMessage(error)}
            </div>
          )}

          {audit && metrics && (
            <>
              {/* Thẻ Chỉ số Rủi ro (Risk Summary Grid) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Số lần đổi giá</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">
                    {metrics.totalPriceChanges}{' '}
                    <span className="text-xs font-normal text-slate-500">lần</span>
                  </p>
                  <p className="text-xs mt-1 text-slate-600">
                    {metrics.flaggedChangesCount > 0 ? (
                      <span className="text-amber-700 font-semibold inline-flex items-center gap-1">
                        <AlertTriangle size={12} /> {metrics.flaggedChangesCount} lần bất thường
                      </span>
                    ) : (
                      'Tất cả bình thường'
                    )}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Biên độ giá</p>
                  <p className="text-xl font-bold text-slate-900 mt-1 font-mono">
                    {metrics.priceFluctuationRatio}x
                  </p>
                  <p className="text-xs mt-1 text-slate-600 truncate" title={`${formatVnd(metrics.minPricePerKg)} - ${formatVnd(metrics.maxPricePerKg)}`}>
                    {formatVnd(metrics.minPricePerKg)} → {formatVnd(metrics.maxPricePerKg)}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Đơn hàng đã đặt</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">
                    {metrics.totalOrdersCount}{' '}
                    <span className="text-xs font-normal text-slate-500">đơn</span>
                  </p>
                  <p className="text-xs mt-1 text-slate-600 font-medium">
                    {kg(metrics.totalSoldKg)} · {formatVnd(metrics.totalRevenue)}
                  </p>
                </div>

                <div
                  className={`p-4 rounded-xl border ${
                    metrics.suspiciousOrdersCount > 0
                      ? 'border-rose-300 bg-rose-50/80 text-rose-900'
                      : 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide">Đơn lúc giá lệch</p>
                  <p className="text-xl font-bold mt-1">
                    {metrics.suspiciousOrdersCount}{' '}
                    <span className="text-xs font-normal">đơn</span>
                  </p>
                  <p className="text-xs mt-1 font-medium">
                    {metrics.suspiciousOrdersCount > 0 ? '⚠️ Khả nghi gian lận!' : '✅ An toàn'}
                  </p>
                </div>
              </div>

              {/* Banner cảnh báo đặc biệt nếu phát hiện đơn hàng khớp lúc giá bị gắn cờ */}
              {metrics.suspiciousOrdersCount > 0 ? (
                <div className="p-4 rounded-xl border border-rose-300 bg-rose-50 flex items-start gap-3">
                  <AlertOctagon className="text-rose-600 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <h4 className="font-bold text-rose-900 text-sm">
                      Cảnh báo rủi ro cao: Phát hiện {metrics.suspiciousOrdersCount} đơn hàng được đặt vào thời điểm giá bị gắn cờ bất thường!
                    </h4>
                    <p className="text-xs text-rose-700 mt-1">
                      Cần rà soát danh sách đơn hàng bên dưới để xác minh xem có hành vi tẩu tán sản lượng với giá rẻ hoặc mua ảo nhằm trục lợi hay không.
                    </p>
                  </div>
                </div>
              ) : metrics.flaggedChangesCount > 0 ? (
                <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 flex items-start gap-3">
                  <Info className="text-amber-700 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <h4 className="font-bold text-amber-900 text-sm">
                      Niêm yết từng bị gắn cờ giá bất thường, nhưng chưa có đơn hàng nào khớp vào thời điểm đó.
                    </h4>
                    <p className="text-xs text-amber-800 mt-1">
                      Quỹ đầu tư chưa bị ảnh hưởng về mặt tài chính. Quản trị viên có thể tiếp tục theo dõi hoặc ẩn niêm yết nếu vi phạm quy chế định giá.
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Tabs chuyển đổi giữa Timeline và Orders */}
              <div className="border-b border-slate-200 flex items-center gap-4">
                <button
                  type="button"
                  className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${
                    tab === 'timeline'
                      ? 'border-orange-500 text-orange-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                  onClick={() => setTab('timeline')}
                >
                  <History size={16} /> Dòng thời gian đổi giá ({audit.priceTimeline.length})
                </button>
                <button
                  type="button"
                  className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${
                    tab === 'orders'
                      ? 'border-orange-500 text-orange-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                  onClick={() => setTab('orders')}
                >
                  <ShoppingBag size={16} /> Đơn hàng đã đặt ({audit.orders.length})
                  {metrics.suspiciousOrdersCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-[10px] text-white font-bold">
                      {metrics.suspiciousOrdersCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Tab 1: Timeline đổi giá */}
              {tab === 'timeline' && (
                <div className="relative pl-6 border-l-2 border-slate-200 space-y-6 my-2">
                  {audit.priceTimeline.map((item) => {
                    const isFlagged = item.flaggedAbnormal
                    const check = item.check

                    return (
                      <div key={item.priceHistoryId} className="relative group">
                        {/* Dot trên timeline */}
                        <div
                          className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 border-white shadow-xs ${
                            isFlagged ? 'bg-amber-500 ring-4 ring-amber-100' : 'bg-slate-400'
                          }`}
                        />

                        <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-shadow shadow-2xs">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {item.previousPricePerKg != null && (
                                <span className="text-sm text-slate-400 line-through font-mono">
                                  {formatVnd(item.previousPricePerKg)}
                                </span>
                              )}
                              <ArrowRight size={14} className="text-slate-400" />
                              <span className="text-lg font-bold text-slate-900 font-mono">
                                {formatVnd(item.pricePerKg)}
                              </span>
                              <span className="text-xs text-slate-500">/ kg</span>

                              {isFlagged && (
                                <span className="ml-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-xs font-bold text-amber-800">
                                  <AlertTriangle size={12} /> Lệch bất thường
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-slate-500 flex items-center gap-1.5">
                              <Clock size={13} />
                              {formatDateTime(item.effectiveFrom)}
                            </div>
                          </div>

                          <div className="mt-2 text-xs text-slate-600 flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                              <User size={13} className="text-slate-400" /> {item.changedBy}
                            </span>
                            <span>·</span>
                            <span>
                              Lý do: <b>{REASON_LABELS[item.reason] ?? item.reason}</b>
                              {item.note ? ` — "${item.note}"` : ''}
                            </span>
                          </div>

                          {/* So sánh giá thị trường nếu có */}
                          {check && (
                            <div className="mt-2.5 pt-2.5 border-t border-slate-100 text-xs text-slate-500">
                              {check.hasEnoughData ? (
                                <p>
                                  Trung vị nội bộ: <b>{check.medianPricePerKg ? formatVnd(check.medianPricePerKg) : '—'}</b> ·{' '}
                                  Điểm lệch: <b>{check.score ?? '—'}</b> (Ngưỡng {check.threshold ?? '—'}) ·{' '}
                                  Dữ liệu: {check.sampleCount} giao dịch, {check.operatorCount} hộ trong {check.windowDays} ngày.
                                </p>
                              ) : (
                                <p className="italic">
                                  Chưa đủ dữ liệu so sánh ({check.sampleCount} giao dịch, {check.operatorCount} hộ; cần ≥ 20 và ≥ 3).
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Tab 2: Danh sách đơn hàng đã đặt */}
              {tab === 'orders' && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  {audit.orders.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-sm">
                      <ShoppingBag size={28} className="mx-auto mb-2 text-slate-400" />
                      Chưa có đơn hàng nào được đặt cho niêm yết này.
                    </div>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="p-3.5">Mã đơn</th>
                          <th className="p-3.5">Khách hàng</th>
                          <th className="p-3.5 text-right">Số lượng</th>
                          <th className="p-3.5 text-right">Giá đặt</th>
                          <th className="p-3.5 text-right">Thành tiền</th>
                          <th className="p-3.5">Trạng thái</th>
                          <th className="p-3.5">Thời điểm</th>
                          <th className="p-3.5">Đánh giá rủi ro</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {audit.orders.map((o) => (
                          <tr
                            key={o.orderId}
                            className={`hover:bg-slate-50/80 ${
                              o.wasPriceFlagged ? 'bg-rose-50/40' : ''
                            }`}
                          >
                            <td className="p-3.5 font-mono font-bold text-slate-900">
                              {o.orderNo}
                            </td>
                            <td className="p-3.5">
                              <p className="font-semibold text-slate-800">{o.customerName}</p>
                              <p className="text-xs text-slate-500">{o.customerPhone}</p>
                            </td>
                            <td className="p-3.5 text-right font-medium text-slate-700">
                              {kg(o.quantityKg)}
                            </td>
                            <td className="p-3.5 text-right font-mono text-slate-700">
                              {formatVnd(o.unitPrice)}
                            </td>
                            <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                              {formatVnd(o.lineTotal)}
                            </td>
                            <td className="p-3.5">
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                                {o.orderStatus}
                              </span>
                            </td>
                            <td className="p-3.5 text-xs text-slate-500 whitespace-nowrap">
                              {formatDateTime(o.placedAt)}
                            </td>
                            <td className="p-3.5">
                              {o.wasPriceFlagged ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-xs font-bold text-rose-800">
                                  <AlertOctagon size={12} /> Giá bất thường
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                                  <CheckCircle2 size={13} /> Bình thường
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-100 transition-colors"
            onClick={onClose}
          >
            Đóng
          </button>

          {listing && !listing.hiddenAt && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-xs transition-colors"
              onClick={() => {
                onClose()
                onOpenHide(listing)
              }}
            >
              <EyeOff size={16} /> Ẩn niêm yết vi phạm này
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
