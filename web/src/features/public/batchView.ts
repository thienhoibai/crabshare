/* Phần dùng chung của trang danh sách và trang chi tiết Lô công khai. */
import type { AvailabilityResponse, ExploreBatchResponse } from '../../shared/api/api.gen'
import { formatVnd } from '../../shared/lib/format'

/** Lô P đang nhận góp vốn. */
export const isFunding = (b: Pick<ExploreBatchResponse, 'status' | 'batchMode'>) => b.batchMode === 'P' && b.status === 'Funding'

/** Lô có bảng chào giá và còn trong hạn đặt trước. */
export const takesPreorders = (b: Pick<ExploreBatchResponse, 'offers' | 'preorderDeadline' | 'status'>) =>
  b.offers.length > 0 && !['Closed', 'Cancelled', 'Settlement', 'Settling', 'AwaitingSettlement', 'Liquidating'].includes(b.status) &&
  (!b.preorderDeadline || Date.parse(b.preorderDeadline) > Date.now())

/** Số con còn đặt được bị giới hạn bởi tồn của cả lô và tồn theo từng quy cách. */
export const preorderRemaining = (a: AvailabilityResponse) =>
  Math.min(a.remainingCrabs, a.specs.reduce((sum, spec) => sum + spec.remaining, 0))

/** Tình trạng đặt trước theo số lượng còn lại mới nhất, dùng chung cho chi tiết lô và form đặt trước. */
export function preorderUnavailable(a: AvailabilityResponse): string | null {
  if (!a.acceptingPreorders) return 'Lô này hiện không nhận đặt trước.'
  if (a.specs.length === 0) return 'Lô chưa có bảng chào giá.'
  const remaining = preorderRemaining(a)
  if (remaining <= 0) return 'Lô đã hết số lượng có thể đặt trước.'
  return remaining < a.minOrderCrabs ? `Số lượng còn lại chưa đủ cho đơn tối thiểu ${a.minOrderCrabs} con.` : null
}

/** "380.000 đ – 520.000 đ / kg" từ bảng chào giá. */
export function priceRange(offers: { pricePerKg: number }[]): string | null {
  if (offers.length === 0) return null
  const prices = offers.map((o) => o.pricePerKg)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? `${formatVnd(min)} / kg` : `${formatVnd(min)} – ${formatVnd(max)} / kg`
}

/** Giải thích ngắn về phương thức của Lô, dùng lời của BR v1.5. */
export const MODE_NOTE: Record<string, string> = {
  P: 'Lô P: nhà đầu tư góp vốn, người nuôi lưu nuôi và bán. Sau khi bán xong, phần còn lại chia theo tỷ lệ vốn góp sau khi trừ chi phí chuẩn, phí nền tảng và thù lao người nuôi.',
  T: 'Lô T: nền tảng bỏ vốn thu mua và bán lại cho khách đặt trước. Không gọi vốn từ nhà đầu tư.',
  A: 'Lô A: nền tảng bán hộ người nuôi và nhận hoa hồng theo hợp đồng đại lý. Không gọi vốn từ nhà đầu tư.',
}
