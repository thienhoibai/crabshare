/** Định dạng tiền VND: 1500000 → "1.500.000 đ". Tiền trong hệ thống luôn là số nguyên đồng. */
export const formatVnd = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))} đ`

/** Định dạng ngày giờ theo múi giờ Việt Nam: "13/10/2026 09:30". */
export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso))

/** Định dạng ngày: "13/10/2026". */
export const formatDate = (iso: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso))
