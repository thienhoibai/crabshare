import { useQuery } from '@tanstack/react-query'
import { http } from '../../../shared/api/http'
import { useAuthStore } from '../../../shared/auth/authStore'

export interface InvestorNotification {
  id: string; type: string; title: string; body: string; at: string; batchCode: string; canOpenPortfolio: boolean; amount: number | null
}
interface NotificationPage { items: InvestorNotification[]; page: number; pageSize: number; total: number; asOf: string }
export const notificationKeys = { root: ['investor-notifications'] as const }
export function useNotifications() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: [...notificationKeys.root, user?.userId], enabled: !!user?.roles.includes('Investor'),
    retry: false, staleTime: 0, refetchInterval: 30_000, refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      const items: InvestorNotification[] = []; let until: string | undefined
      for (let page = 1; ; page++) {
        const { data } = await http.get<NotificationPage>('/api/me/notifications', { signal, params: { page, pageSize: 100, until } })
        if (!data || !Array.isArray(data.items) || !Number.isInteger(data.total) || !Number.isFinite(Date.parse(data.asOf))) throw new Error('Invalid notifications response')
        until ??= data.asOf
        items.push(...data.items)
        if (!data.items.length || page * 100 >= data.total) break
      }
      return items
    },
  })
}

export interface ReadMarker { through: string | null; boundaryIds: string[]; itemIds: string[] }
export const emptyMarker = (): ReadMarker => ({ through: null, boundaryIds: [], itemIds: [] })
export const markerKey = (id: number) => `crabshare-notification-read:${id}`
export function loadMarker(id: number): ReadMarker {
  try {
    const data = JSON.parse(localStorage.getItem(markerKey(id)) ?? 'null') as ReadMarker | null
    if (!data || (data.through != null && !Number.isFinite(Date.parse(data.through))) || !Array.isArray(data.boundaryIds) || !Array.isArray(data.itemIds)
      || ![...data.boundaryIds, ...data.itemIds].every((v) => typeof v === 'string')) return emptyMarker()
    return data
  } catch { return emptyMarker() }
}
export function isUnread(n: InvestorNotification, marker: ReadMarker) {
  if (marker.itemIds.includes(n.id)) return false
  if (marker.through == null) return true
  const delta = Date.parse(n.at) - Date.parse(marker.through)
  return delta > 0 || (delta === 0 && !marker.boundaryIds.includes(n.id))
}
export function markAll(items: InvestorNotification[], previous: ReadMarker): ReadMarker {
  if (!items.length) return previous
  const latest = items.reduce((a, b) => Date.parse(a.at) >= Date.parse(b.at) ? a : b).at
  const delta = previous.through == null ? 1 : Date.parse(latest) - Date.parse(previous.through)
  if (delta < 0) return previous
  return { through: latest, boundaryIds: [...new Set([...(delta === 0 ? previous.boundaryIds : []), ...items.filter((n) => Date.parse(n.at) === Date.parse(latest)).map((n) => n.id)])], itemIds: previous.itemIds.filter((id) => !items.some((n) => n.id === id)) }
}
