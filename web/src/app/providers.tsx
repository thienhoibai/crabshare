import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '../shared/auth/authStore'

/**
 * TanStack Query lo việc gọi API: cache, tải lại, trạng thái đang tải/lỗi.
 * Mỗi feature viết hook useXxx() trong file *Api.ts, trang chỉ gọi hook.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

// Đổi phiên (đăng nhập, đăng xuất, token hết hạn): bỏ hết dữ liệu đã tải của phiên trước, để người đăng nhập sau
// trên cùng tab không thấy dữ liệu của người trước còn nằm trong bộ nhớ đệm.
useAuthStore.subscribe((state, previous) => {
  if (state.token !== previous.token) queryClient.clear()
})

export function AppProviders({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
