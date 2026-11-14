/* Phần dùng chung của trang danh sách và trang chi tiết Lô công khai. */
import type { ExploreBatchResponse } from '../../shared/api/api.gen'
import { formatVnd } from '../../shared/lib/format'

/** Lô P đang nhận góp vốn. */
export const isFunding = (b: Pick<ExploreBatchResponse, 'status' | 'batchMode'>) => b.batchMode === 'P' && b.status === 'Funding'

/** Lô có bảng chào giá và còn trong hạn đặt trước. */
export const takesPreorders = (b: Pick<ExploreBatchResponse, 'offers' | 'preorderDeadline' | 'status'>) =>
  b.offers.length > 0 && !['Closed', 'Cancelled', 'Settlement', 'Settling', 'AwaitingSettlement', 'Liquidating'].includes(b.status) &&
  (!b.preorderDeadline || Date.parse(b.preorderDeadline) > Date.now())

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
