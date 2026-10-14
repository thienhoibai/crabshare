/** Định dạng tiền VND: 1500000 → "1.500.000 đ". Tiền trong hệ thống luôn là số nguyên đồng. */
export const formatVnd = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))} đ`

/** Định dạng ngày giờ theo múi giờ Việt Nam: "13/10/2026 09:30". */
export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso))

/** Định dạng ngày: "13/10/2026". */
export const formatDate = (iso: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso))

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
const TIERS = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ']

function readThreeDigits(n: number, isHead: boolean): string {
  const hundreds = Math.floor(n / 100)
  const tens = Math.floor((n % 100) / 10)
  const units = n % 10
  const parts: string[] = []

  if (hundreds > 0 || !isHead) {
    parts.push(`${DIGITS[hundreds]} trăm`)
  }

  if (tens === 0) {
    if (units > 0 && (hundreds > 0 || !isHead)) {
      parts.push('linh')
      parts.push(DIGITS[units])
    } else if (units > 0) {
      parts.push(DIGITS[units])
    }
  } else if (tens === 1) {
    parts.push('mười')
    if (units === 1) parts.push('một')
    else if (units === 5) parts.push('lăm')
    else if (units > 0) parts.push(DIGITS[units])
  } else {
    parts.push(`${DIGITS[tens]} mươi`)
    if (units === 1) parts.push('mốt')
    else if (units === 4) parts.push('tư')
    else if (units === 5) parts.push('lăm')
    else if (units > 0) parts.push(DIGITS[units])
  }

  return parts.join(' ')
}

/** Đọc số tiền thành chữ tiếng Việt (chuẩn tài chính/ngân hàng). */
export function moneyToWords(amount: number): string {
  const num = Math.round(Math.abs(amount))
  if (num === 0) return 'Không đồng'

  const groups: number[] = []
  let temp = num
  while (temp > 0) {
    groups.push(temp % 1000)
    temp = Math.floor(temp / 1000)
  }

  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (g > 0) {
      const isHead = i === groups.length - 1
      const words = readThreeDigits(g, isHead)
      const tier = TIERS[i] ? ` ${TIERS[i]}` : ''
      parts.push(`${words}${tier}`)
    }
  }

  const result = parts.join(' ').replace(/\s+/g, ' ').trim()
  if (!result) return 'Không đồng'
  const capitalized = result.charAt(0).toUpperCase() + result.slice(1)
  return `${capitalized} đồng`
}
