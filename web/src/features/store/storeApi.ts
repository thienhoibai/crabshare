import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { http } from '../../shared/api/http'
import { IMG, type Product } from '../../shared/ui/kit/mock-data'
import { CRAB_TYPE_LABELS, listingImageSrc, type PriceRevision, type StorageType } from '../operator/listingsApi'

/** Gọi API cửa hàng công khai của Features/Catalog (UC25). */
export type StoreSort = 'Newest' | 'PriceAsc' | 'PriceDesc'
export type CrabType = 'FatteningMudCrab' | 'RoeCrab' | 'SoftShellCrab'

export interface StoreListing {
  listingId: number
  title: string
  status: 'Published' | 'SoldOut'
  crabType: string
  gradeCode: string
  gradeName: string
  minWeightG: number | null
  maxWeightG: number | null
  storageType: StorageType
  batchCode: string
  farmName: string
  harvestedAt: string | null
  pricePerKg: number
  availableQtyKg: number
  inStock: boolean
  imageUrl: string | null
  publishedAt: string | null
}

export interface PublicPriceRevision {
  pricePerKg: number
  previousPricePerKg: number | null
  reason: PriceRevision['reason']
  effectiveFrom: string
  flaggedAbnormal: boolean
}

export interface StoreListingDetail {
  listing: StoreListing
  batchTitle: string
  frozenAt: string | null
  sellUntil: string | null
  traceTagCode: string | null
  priceHistory: PublicPriceRevision[]
}

export interface Paged<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface StoreQuery {
  crabType?: CrabType
  grade?: string
  storage?: StorageType
  /** Mã lô nguồn, khớp đúng cả mã. */
  batch?: string
  /** VND/kg, tính cả hai đầu. */
  minPrice?: number
  maxPrice?: number
  sort: StoreSort
  page: number
  pageSize?: number
}

export const storeApi = {
  browse: (q: StoreQuery) => http.get<Paged<StoreListing>>('/api/listings', { params: q }).then((r) => r.data),
  get: (id: number) => http.get<StoreListingDetail>(`/api/listings/${id}`).then((r) => r.data),
}

export const useStoreListings = (q: StoreQuery) =>
  useQuery({ queryKey: ['store', 'listings', q], queryFn: () => storeApi.browse(q), placeholderData: keepPreviousData })

export const useStoreListing = (id: number | null) =>
  useQuery({ queryKey: ['store', 'listing', id], queryFn: () => storeApi.get(id!), enabled: id !== null })

const FALLBACK_IMG: Record<string, string> = {
  FatteningMudCrab: IMG.thit,
  RoeCrab: IMG.gach,
  SoftShellCrab: IMG.com,
}

const kg = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })
export const formatKg = (v: number) => kg.format(v)
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('vi-VN')

const sizeLabel = (l: StoreListing) => `${l.gradeName} · ${l.storageType === 'Frozen' ? 'cấp đông' : 'tươi'}`

export const GRADES = [
  { code: 'L1', label: 'Loại 1 (từ 500 g)' },
  { code: 'L2', label: 'Loại 2 (350–499 g)' },
  { code: 'L3', label: 'Loại 3 (250–349 g)' },
  { code: 'L4', label: 'Loại 4 (dưới 250 g)' },
  { code: 'SOFT', label: 'Cua lột' },
] as const

/** Đổi niêm yết từ API sang kiểu Product để dùng lại thẻ, trang xem sản phẩm và giỏ hàng của UI kit. */
export function toProduct(l: StoreListing, detail?: StoreListingDetail): Product {
  const kind = (CRAB_TYPE_LABELS[l.crabType] ?? 'Cua thịt') as Product['kind']
  const img = listingImageSrc(l) ?? FALLBACK_IMG[l.crabType] ?? IMG.thit
  return {
    id: `L${l.listingId}`,
    listingId: l.listingId,
    name: l.title,
    kind,
    unit: 'kg',
    sizes: [{ label: sizeLabel(l), price: l.pricePerKg }],
    lot: l.batchCode,
    img,
    gallery: [img, IMG.sorter, IMG.qr],
    stock: l.availableQtyKg,
    soldOut: !l.inStock,
    harvest: l.harvestedAt ? formatDate(l.harvestedAt) : '—',
    farm: l.farmName,
    crab: kind,
    traceTag: detail?.traceTagCode ?? null,
  }
}
