import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_URL, http } from '../../shared/api/http'

/** Gọi API của Features/Catalog (UC24 Niêm yết) bên backend. */
export type StorageType = 'Fresh' | 'Frozen'
export type ListingStatus = 'Draft' | 'Published' | 'SoldOut' | 'Closed'
export type PriceChangeReason = 'Market' | 'Promotion' | 'Clearance' | 'Correction' | 'Other'

export interface PriceCheck {
  hasEnoughData: boolean
  isFlagged: boolean
  sampleCount: number
  operatorCount: number
  windowDays: number
  medianPricePerKg: number | null
  score: number | null
  threshold: number | null
  method: 'None' | 'ModifiedZ' | 'PercentFromMedian'
  algorithmVersion: string
}

export interface PriceRevision {
  priceHistoryId: number
  pricePerKg: number
  previousPricePerKg: number | null
  reason: 'Initial' | PriceChangeReason
  note: string | null
  effectiveFrom: string
  changedBy: string
  flaggedAbnormal: boolean
  check: PriceCheck | null
}

export interface Listing {
  listingId: number
  title: string
  status: ListingStatus
  batchCode: string
  batchTitle: string
  crabType: string
  farmName: string
  gradeCode: string
  gradeName: string
  minWeightG: number | null
  maxWeightG: number | null
  storageType: StorageType
  frozenAt: string | null
  sellUntil: string | null
  harvestedAt: string | null
  pricePerKg: number
  stockQtyKg: number
  reservedQtyKg: number
  availableQtyKg: number
  imageUrl: string | null
  publishedAt: string | null
  updatedAt: string
  hiddenAt: string | null
  hiddenReason: string | null
  priceHistory: PriceRevision[]
}

export interface ListingOption {
  batchCode: string
  batchTitle: string
  crabType: string
  gradeCode: string
  gradeName: string
  inStockCount: number
  inStockKg: number
  existingListingId: number | null
  batchStatus?: string
}

export interface CreateListingInput {
  batchCode: string
  gradeCode: string
  storageType: StorageType
  frozenAt?: string
  title?: string
  pricePerKg: number
}

export interface ChangePriceInput { pricePerKg: number; reason: PriceChangeReason; note?: string }

export const REASON_LABELS: Record<PriceRevision['reason'], string> = {
  Initial: 'Giá khởi điểm',
  Market: 'Theo giá thị trường',
  Promotion: 'Khuyến mãi',
  Clearance: 'Xả tồn',
  Correction: 'Đính chính (nhập nhầm)',
  Other: 'Khác',
}

export const STATUS_LABELS: Record<ListingStatus, string> = {
  Draft: 'Bản nháp',
  Published: 'Đang bán',
  SoldOut: 'Hết hàng',
  Closed: 'Ngừng bán',
}

export const CRAB_TYPE_LABELS: Record<string, string> = {
  FatteningMudCrab: 'Cua thịt',
  RoeCrab: 'Cua gạch',
  SoftShellCrab: 'Cua lột',
}

/** imageUrl từ API là đường dẫn tương đối, cần ghép địa chỉ API. */
export const listingImageSrc = (l: Pick<Listing, 'imageUrl'>) => (l.imageUrl ? `${API_URL}${l.imageUrl}` : null)

export const listingsApi = {
  mine: () => http.get<Listing[]>('/api/operators/me/listings').then((r) => r.data),
  options: () => http.get<ListingOption[]>('/api/operators/me/listings/options').then((r) => r.data),
  create: (body: CreateListingInput) => http.post<Listing>('/api/listings', body).then((r) => r.data),
  previewPrice: (id: number, pricePerKg: number) =>
    http.get<PriceCheck>(`/api/listings/${id}/price-check`, { params: { pricePerKg } }).then((r) => r.data),
  changePrice: (id: number, body: ChangePriceInput) => http.patch<Listing>(`/api/listings/${id}/price`, body).then((r) => r.data),
  publish: (id: number) => http.post<Listing>(`/api/listings/${id}/publish`).then((r) => r.data),
  close: (id: number) => http.post<Listing>(`/api/listings/${id}/close`).then((r) => r.data),
  refreshStock: (id: number) => http.post<Listing>(`/api/listings/${id}/refresh-stock`).then((r) => r.data),
  uploadImage: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http.post<Listing>(`/api/listings/${id}/image`, form).then((r) => r.data)
  },
}

const keys = {
  mine: ['listings', 'mine'] as const,
  options: ['listings', 'options'] as const,
}

export const useMyListings = () => useQuery({ queryKey: keys.mine, queryFn: listingsApi.mine })
export const useListingOptions = () => useQuery({ queryKey: keys.options, queryFn: listingsApi.options })

/** Mọi thao tác ghi đều làm mới danh sách niêm yết và danh sách hạng còn tồn. */
function useListingMutation<TVars>(fn: (vars: TVars) => Promise<Listing>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.mine })
      qc.invalidateQueries({ queryKey: keys.options })
    },
  })
}

export const useCreateListing = () => useListingMutation(listingsApi.create)
export const useChangePrice = () => useListingMutation(({ id, ...body }: ChangePriceInput & { id: number }) => listingsApi.changePrice(id, body))
export const usePublishListing = () => useListingMutation(listingsApi.publish)
export const useCloseListing = () => useListingMutation(listingsApi.close)
export const useRefreshStock = () => useListingMutation(listingsApi.refreshStock)
export const useUploadListingImage = () => useListingMutation(({ id, file }: { id: number; file: File }) => listingsApi.uploadImage(id, file))
