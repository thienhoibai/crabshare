import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Số món trong giỏ hiển thị trên header (tạm thời). Task Orders thay bằng giỏ hàng thật lấy từ API. */
export const useCartCount = create<{ count: number; add: () => void; clear: () => void }>()(
  persist((set) => ({ count: 0, add: () => set((s) => ({ count: s.count + 1 })), clear: () => set({ count: 0 }) }), { name: 'crabshare-cart-count' }),
)
