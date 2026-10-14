/** Match decimal quantity(12,3) × integer VND, midpoint away from zero. */
export function costAmount(quantity: number, unitPrice: number): number {
  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isSafeInteger(unitPrice) || unitPrice < 0) return 0
  const thousandths = Math.round(quantity * 1000)
  if (!Number.isSafeInteger(thousandths)) return 0
  return Number((BigInt(thousandths) * BigInt(unitPrice) + 500n) / 1000n)
}
