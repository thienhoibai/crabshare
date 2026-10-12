/* Máy tính quyết toán — hàm thuần, tính bằng số nguyên đồng (BigInt).
   Cùng luật với engine .NET (Phiếu v1.1, BR-01/03/17/28/30/39):
   Revenue Pool = Doanh thu thực thu − (Standard Cost đã khoá − dự phòng hao hụt không dùng)
   Thù lao Operator = pct% × Pool nếu Pool > 0, ngược lại 0
   Phần còn lại chia theo tỷ lệ vốn đã xác nhận, largest-remainder, tie-break: vốn lớn hơn → id nhỏ hơn
   Lỗ chia theo tỷ lệ vốn, trần lỗ = vốn đã góp. */

export type Contribution = { id: number; name: string; amount: bigint }

export type SettlementInput = {
  revenue: bigint
  lockedStandardCost: bigint
  reserveTotal: bigint
  reserveUsed: bigint
  operatorPct: number
  contributions: Contribution[]
}

export type SettlementLine = {
  id: number
  name: string
  capital: bigint
  share: bigint // + lãi nhận thêm / − phần lỗ chịu
  payout: bigint // vốn + share, không âm
  pctBps: number // tỷ lệ vốn, basis points (1/100 của 1%)
}

export type SettlementResult = {
  reserveUnused: bigint
  costDeducted: bigint
  pool: bigint
  remuneration: bigint
  distributable: bigint
  lines: SettlementLine[]
  totalPayout: bigint
  /** Tiền còn trong tài khoản lô sau khi chi: phải bằng 0 */
  residual: bigint
}

const max0 = (v: bigint) => (v < 0n ? 0n : v)

export function settle(input: SettlementInput): SettlementResult {
  const { revenue, lockedStandardCost, reserveTotal, reserveUsed, operatorPct, contributions } = input
  const reserveUnused = max0(reserveTotal - reserveUsed)
  const costDeducted = lockedStandardCost - reserveUnused
  const pool = revenue - costDeducted
  const remuneration = pool > 0n ? (pool * BigInt(operatorPct)) / 100n : 0n
  const distributable = pool > 0n ? pool - remuneration : pool

  const totalCapital = contributions.reduce((s, c) => s + c.amount, 0n)
  const abs = distributable < 0n ? -distributable : distributable

  // largest-remainder
  const floors = contributions.map((c) => (totalCapital === 0n ? 0n : (abs * c.amount) / totalCapital))
  const remainders = contributions.map((c, k) => abs * c.amount - floors[k] * totalCapital)
  let leftover = abs - floors.reduce((s, v) => s + v, 0n)
  const order = contributions
    .map((c, k) => ({ k, r: remainders[k], amount: c.amount, id: c.id }))
    .sort((a, b) => {
      if (a.r !== b.r) return a.r > b.r ? -1 : 1
      if (a.amount !== b.amount) return a.amount > b.amount ? -1 : 1
      return a.id - b.id
    })
  for (const o of order) {
    if (leftover <= 0n) break
    floors[o.k] += 1n
    leftover -= 1n
  }

  const lines: SettlementLine[] = contributions.map((c, k) => {
    let share = distributable < 0n ? -floors[k] : floors[k]
    if (share < -c.amount) share = -c.amount // trần lỗ = vốn góp
    const payout = max0(c.amount + share)
    const pctBps = totalCapital === 0n ? 0 : Number((c.amount * 10000n) / totalCapital)
    return { id: c.id, name: c.name, capital: c.amount, share, payout, pctBps }
  })

  const totalPayout = lines.reduce((s, l) => s + l.payout, 0n)
  // Tiền có trong TK lô = vốn góp − chi phí đã thực chi (cost − reserveUnused) + doanh thu
  const cash = totalCapital - costDeducted + revenue
  const residual = cash - totalPayout - remuneration
  return { reserveUnused, costDeducted, pool, remuneration, distributable, lines, totalPayout, residual }
}

/* ---- ví dụ minh hoạ theo do-an.md mục 4.4 (Dữ liệu mô phỏng) ---- */
export const exampleContributions: Contribution[] = [
  { id: 3, name: 'Nhà đầu tư A', amount: 50_000_000n },
  { id: 4, name: 'Nhà đầu tư B', amount: 30_000_000n },
  { id: 5, name: 'Nhà đầu tư C', amount: 20_000_000n },
]

export type ScenarioKey = 'profit' | 'even' | 'loss'
export const scenarios: Record<ScenarioKey, { label: string; revenue: bigint; reserveUsed: bigint; note: string }> = {
  profit: { label: 'Lãi', revenue: 126_000_000n, reserveUsed: 10_000_000n, note: 'Bán được 126 triệu, dự phòng chỉ dùng 10 trong 15 triệu.' },
  even: { label: 'Hoà', revenue: 100_000_000n, reserveUsed: 15_000_000n, note: 'Doanh thu đúng bằng chi phí đã khoá, dự phòng dùng hết.' },
  loss: { label: 'Lỗ', revenue: 70_000_000n, reserveUsed: 15_000_000n, note: 'Doanh thu 70 triệu, thiếu 30 triệu so với chi phí đã khoá.' },
}

export function exampleInput(key: ScenarioKey): SettlementInput {
  const s = scenarios[key]
  return {
    revenue: s.revenue,
    lockedStandardCost: 100_000_000n,
    reserveTotal: 15_000_000n,
    reserveUsed: s.reserveUsed,
    operatorPct: 7,
    contributions: exampleContributions,
  }
}

const vnd = new Intl.NumberFormat('vi-VN')
export function formatVND(v: bigint | number, withUnit = true): string {
  const s = vnd.format(typeof v === 'bigint' ? v : Math.round(v))
  return withUnit ? `${s} đ` : s
}
export function formatSigned(v: bigint): string {
  if (v === 0n) return '0 đ'
  return (v > 0n ? '+' : '−') + formatVND(v < 0n ? -v : v)
}
export function formatPct(bps: number): string {
  return (bps / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + '%'
}
