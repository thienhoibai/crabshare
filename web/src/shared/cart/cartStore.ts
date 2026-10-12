import type { SetStateAction } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartLine } from '../ui/kit/kit'

interface CartStore {
  lines: CartLine[]
  setLines: (next: SetStateAction<CartLine[]>) => void
  setQty: (id: string, size: number, qty: number) => void
  clear: () => void
}

/**
 * Giỏ hàng của khách, lưu trong localStorage để tải lại trang hay chuyển sang trang thanh toán không mất.
 * Chỉ là danh sách muốn mua: hàng chưa được giữ cho tới khi đặt hàng (POST /api/orders/checkout).
 */
export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      lines: [],
      setLines: (next) => set((s) => ({ lines: typeof next === 'function' ? next(s.lines) : next })),
      setQty: (id, size, qty) => set((s) => ({
        lines: qty <= 0
          ? s.lines.filter((l) => !(l.id === id && l.size === size))
          : s.lines.map((l) => (l.id === id && l.size === size ? { ...l, qty } : l)),
      })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'crabshare-cart' },
  ),
)

/** Số món trong giỏ (hiển thị trên header). */
export const useCartCount = () => useCartStore((s) => s.lines.reduce((n, l) => n + l.qty, 0))
