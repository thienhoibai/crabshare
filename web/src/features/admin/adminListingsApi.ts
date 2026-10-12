import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import type { ListingStatus, PriceRevision, StorageType } from '../operator/listingsApi'

/** Gọi API kiểm duyệt niêm yết (UC24 phía quản trị) của Features/Catalog. */
export interface AdminListing {
  listingId: number
  title: string
  status: ListingStatus
  batchCode: string
  farmName: string
  crabType: string
  gradeCode: string
  gradeName: string
  storageType: StorageType
  pricePerKg: number
  availableQtyKg: number
  imageUrl: string | null
  publishedAt: string | null
  latestPrice: PriceRevision | null
  hiddenAt: string | null
  hiddenBy: string | null
  hiddenReason: string | null
}

export interface AdminListingFilter {
  flagged: boolean | null
  hidden: boolean | null
  page: number
}

type AdminListingPage = { items: AdminListing[]; page: number; pageSize: number; total: number }

export const ADMIN_LISTINGS_PAGE_SIZE = 10

export function useAdminListings({ flagged, hidden, page }: AdminListingFilter) {
  const userId = useAuthStore(s => s.user?.userId)
  return useQuery({
    queryKey: ['admin', 'listings', userId, flagged, hidden, page], retry: false,
    queryFn: async () => (await http.get<AdminListingPage>('/api/admin/listings', {
      params: { flagged: flagged ?? undefined, hidden: hidden ?? undefined, page, pageSize: ADMIN_LISTINGS_PAGE_SIZE },
    })).data,
  })
}

export function useHideListing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ listingId, reason }: { listingId: number; reason: string }) =>
      (await http.post<AdminListing>(`/api/admin/listings/${listingId}/hide`, { reason })).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'listings'] })
      void qc.invalidateQueries({ queryKey: ['store'] })
    },
  })
}
