import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * TanStack Query lo việc gọi API: cache, tải lại, trạng thái đang tải/lỗi.
 * Mỗi feature viết hook useXxx() trong file *Api.ts, trang chỉ gọi hook.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

export function AppProviders({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
