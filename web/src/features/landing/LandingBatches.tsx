/* One shared, paginated public list query. No private/participant endpoints.
   Missing fields stay unknown; only complete lists produce aggregate figures. */
import { useQueries, useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { API_URL, http } from '../../shared/api/http'
import { LandingFarmProfiles } from './LandingFarmProfiles'
import { formatVnd } from '../../shared/lib/format'
import WholesaleBoard from './WholesaleBoard'
import { InvestmentShowcase } from './InvestmentShowcase'
import './batches.css'
import './visuals.css'


type Row = Record<string, unknown>
const row = (value: unknown): Row | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : null
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)
const nonnegative = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
const positive = (value: unknown): number | null => {
  const n = nonnegative(value)
  return n !== null && n > 0 ? n : null
}
const count = (value: unknown): number | null => {
  const n = nonnegative(value)
  return n !== null && Number.isSafeInteger(n) ? n : null
}
const date = (value: unknown): string | null => {
  const s = text(value)
  return s && Number.isFinite(Date.parse(s)) ? s : null
}
const CRAB_TYPES: Record<string, string> = {
  FatteningMudCrab: 'Cua thịt vỗ béo',
  RoeCrab: 'Cua gạch',
  YoungFemaleCrab: 'Cua cái non',
  OilRoeCrab: 'Cua gạch dầu',
}
const PRODUCTION_STATUSES = new Set(['InProduction', 'Harvesting'])
const PUBLISHED_STATUSES = new Set([
  'Funding',
  'Sourcing',
  'InProduction',
  'Harvesting',
  'Selling',
  'Settlement',
  'Closed',
])
const ACTIVE_STATUSES = new Set(['Funding', 'Sourcing', 'InProduction', 'Harvesting', 'Selling'])

/** Explicit opt-in public farm data, never inferred from a party's legal/person name. */
export interface LandingPublicFarm {
  id: string
  name: string
  commune?: string
  district?: string
  province?: string
  latitude?: number
  longitude?: number
  photoUrl?: string
  rackCount?: number
  boxCount?: number
  liveCrabCount?: number
  completedBatchCount?: number
  ratingAverage?: number
  ratingCount?: number
  /** Họ tên chủ trại, chỉ có khi chủ trại đồng ý công khai. */
  ownerName?: string
  /** Ảnh đại diện của chủ trại, chỉ có khi đã công khai họ tên. */
  ownerPhotoUrl?: string
  /** Số kg khách đã nghiệm thu từ các lô của trại. */
  deliveredKg?: number
}

/** Chỉ nhận ảnh trong web (/...) hoặc https. */
const safeImage = (url: string | null) =>
  url && (/^https:\/\//i.test(url) || (/^\//.test(url) && !/^\/\//.test(url))) ? url : undefined

function parsePublicFarm(value: unknown): LandingPublicFarm | null {
  const f = row(value)
  if (!f) return null
  const id = text(f.id),
    name = text(f.name)
  if (!id || !name) return null
  const lat =
    typeof f.latitude === 'number' && Number.isFinite(f.latitude) && Math.abs(f.latitude) <= 90 ? f.latitude : undefined
  const lng =
    typeof f.longitude === 'number' && Number.isFinite(f.longitude) && Math.abs(f.longitude) <= 180
      ? f.longitude
      : undefined
  const photo = text(f.photoUrl)
  const ratingCount = count(f.ratingCount)
  const ratingAverage = positive(f.ratingAverage)
  return {
    id,
    name,
    commune: text(f.commune) ?? undefined,
    district: text(f.district) ?? undefined,
    province: text(f.province) ?? undefined,
    latitude: lat,
    longitude: lng,
    photoUrl: photo && (/^https:\/\//i.test(photo) || (/^\//.test(photo) && !/^\/\//.test(photo))) ? photo : undefined,
    rackCount: count(f.rackCount) ?? undefined,
    boxCount: count(f.boxCount) ?? undefined,
    liveCrabCount: count(f.liveCrabCount) ?? undefined,
    completedBatchCount: count(f.completedBatchCount) ?? undefined,
    ratingCount: ratingCount ?? undefined,
    ratingAverage: ratingCount !== null && ratingCount > 0 && ratingAverage !== null && ratingAverage <= 5 ? ratingAverage : undefined,
    ownerName: text(f.ownerName) ?? undefined,
    ownerPhotoUrl: safeImage(text(f.ownerName) ? text(f.ownerPhotoUrl) : null),
    deliveredKg: nonnegative(f.deliveredKg) ?? undefined,
  }
}

export interface LandingOffer {
  specCode: string
  specName: string
  sizeCode: string | null
  gradeCode: string | null
  pricePerKg: number
}

export interface LandingBatch {
  batchCode: string
  title: string
  status: string
  crabType: string | null
  plannedQuantity: number | null
  expectedAvgWeightG: number | null
  holdingDays: number | null
  /** Ngày dự kiến nhận cua vào nuôi (chưa cộng số ngày nuôi). */
  expectedReceiptDate: string | null
  targetCapital: number | null
  confirmedCapital: number | null
  remainingCapital: number | null
  minContribution: number | null
  investorCount: number | null
  fundingOpenAt: string | null
  fundingDeadline: string | null
  offers: LandingOffer[]
  publicFarm: LandingPublicFarm | null
  publicOperatorName: string | null
}

interface LandingPage {
  batches: LandingBatch[]
  complete: boolean
}

/** Missing optional values stay unknown. In particular null money/counts never become zero. */
export function parseLandingPage(value: unknown): LandingPage {
  const page = row(value)
  if (!page || !Array.isArray(page.items)) throw new Error('Invalid public batch response')
  const batches: LandingBatch[] = []
  const seen = new Set<string>()
  for (const item of page.items) {
    const b = row(item)
    if (!b || b.batchMode !== 'P') continue
    const batchCode = text(b.batchCode),
      title = text(b.title),
      status = text(b.status)
    if (!batchCode || !title || !status || !PUBLISHED_STATUSES.has(status) || seen.has(batchCode)) continue
    seen.add(batchCode)
    const offers: LandingOffer[] = []
    const seenSpecs = new Set<string>()
    for (const rawOffer of Array.isArray(b.offers) ? b.offers : []) {
      const o = row(rawOffer)
      if (!o) continue
      const specCode = text(o.specCode),
        specName = text(o.specName),
        pricePerKg = positive(o.pricePerKg)
      if (!specCode || !specName || pricePerKg === null || seenSpecs.has(specCode)) continue
      seenSpecs.add(specCode)
      offers.push({ specCode, specName, pricePerKg, sizeCode: text(o.sizeCode), gradeCode: text(o.gradeCode) })
    }
    batches.push({
      batchCode,
      title,
      status,
      crabType: text(b.crabType),
      plannedQuantity: count(b.plannedQuantity),
      expectedAvgWeightG: positive(b.expectedAvgWeightG),
      holdingDays: positive(b.holdingDays),
      expectedReceiptDate: date(b.expectedReceiptDate),
      targetCapital: positive(b.targetCapital),
      confirmedCapital: nonnegative(b.confirmedCapital),
      remainingCapital: nonnegative(b.remainingCapital),
      minContribution: positive(b.minContribution),
      investorCount: count(b.investorCount),
      fundingOpenAt: date(b.fundingOpenAt),
      fundingDeadline: date(b.fundingDeadline),
      offers,
      publicFarm: parsePublicFarm(b.publicFarm),
      // A public corporate/co-op name is an operator label, never a physical farm identity or location.
      publicOperatorName: typeof b.executorName === 'string' && /^(HTX\s|Hợp tác xã\s|Công ty\s)/iu.test(b.executorName.trim()) ? b.executorName.trim() : null,
    })
  }
  // Omitted, malformed, duplicate, or unexpected records prevent global totals.
  const total = count(page.total)
  return {
    batches,
    complete: page.page === 1 && total !== null && total === page.items.length && batches.length === page.items.length,
  }
}

export interface LandingBatchesData {
  loading: boolean
  failed: boolean
  retry: () => void
  funding: LandingBatch[]
  production: LandingBatch[]
  wholesale: LandingWholesaleRow[]
  farms: { farm: LandingPublicFarm; batches: LandingBatch[] }[]
  publicOperators: { name: string; batches: LandingBatch[] }[]
  catalogueComplete: boolean
  productionLiveCount: number | null
  productionGroups: LandingProductionGroup[]
  minimumContribution: number | null
  /** Số lô đang nhận vốn và tổng số nhà đầu tư của các lô đó; null khi danh mục chưa đủ để tính chắc. */
  fundingCount: number | null
  fundingInvestors: number | null
  minimumContributionFaq: string | null
  productionProjectionKg: number | null
  closedCount: number | null
}

export interface LandingProductionGroup {
  key: string
  farm: LandingPublicFarm | null
  batches: LandingBatch[]
  plannedQuantity: number | null
  projectedKg: number | null
  operatorName: string | null
  liveCrabCount: number | null
}

/** daysRaised: số ngày đã nuôi công khai (BR-142); null khi lô chưa thả nuôi. */
export interface LandingProgress { batchCode: string; crabsAlive: number; daysRaised: number | null }

export function parseLandingProgress(value: unknown, batchCode: string): LandingProgress {
  const progress = row(value)
  const crabsAlive = count(progress?.crabsAlive)
  if (!progress || progress.batchCode !== batchCode || crabsAlive === null) throw new Error('Invalid public progress response')
  return { batchCode, crabsAlive, daysRaised: count(progress.daysRaised) }
}

export interface LandingWholesaleRow {
  batch: LandingBatch
  offer: LandingOffer
  acceptingPreorders: boolean
  remaining: number | null
  depositRatePct: number | null
  /** Số ngày đã nuôi lấy từ tiến độ công khai; null khi chưa biết. */
  daysRaised: number | null
  /** Ngày dự kiến đủ ngày nuôi: từ tiến độ thật nếu có, nếu không thì ngày nhận cua dự kiến cộng số ngày nuôi. */
  readyDate: string | null
}

const DAY_MS = 86_400_000
function readyDateOf(batch: LandingBatch, daysRaised: number | null, now: number): string | null {
  if (daysRaised !== null && batch.holdingDays !== null)
    return new Date(now + Math.max(0, batch.holdingDays - daysRaised) * DAY_MS).toISOString()
  if (batch.expectedReceiptDate)
    return new Date(Date.parse(batch.expectedReceiptDate) + (batch.holdingDays ?? 0) * DAY_MS).toISOString()
  return null
}

interface LandingAvailability {
  acceptingPreorders: boolean
  depositRatePct: number | null
  specs: { specCode: string; pricePerKg: number; remaining: number | null }[]
}

export function parseLandingAvailability(value: unknown, batchCode: string): LandingAvailability {
  const a = row(value)
  if (!a || a.batchCode !== batchCode || typeof a.acceptingPreorders !== 'boolean' || !Array.isArray(a.specs))
    throw new Error('Invalid public availability response')
  const rate = nonnegative(a.depositRatePct)
  return {
    acceptingPreorders: a.acceptingPreorders,
    depositRatePct: rate !== null && rate <= 100 ? rate : null,
    specs: a.specs.flatMap((value) => {
      const s = row(value)
      if (!s) return []
      const specCode = text(s.specCode),
        pricePerKg = positive(s.pricePerKg)
      return specCode && pricePerKg !== null ? [{ specCode, pricePerKg, remaining: count(s.remaining) }] : []
    }),
  }
}

export function deriveLandingBatches(
  page: LandingPage | undefined,
  now = Date.now(),
  availability = new Map<string, LandingAvailability>(),
  progress = new Map<string, LandingProgress>(),
): Omit<LandingBatchesData, 'loading' | 'failed' | 'retry'> {
  const batches = page?.batches ?? []
  // Scope=all includes future/expired Funding records. Status alone is not enough.
  const fundingWindow = batches.filter(
    (b) =>
      b.status === 'Funding' &&
      b.fundingOpenAt &&
      b.fundingDeadline &&
      Date.parse(b.fundingOpenAt) <= now &&
      Date.parse(b.fundingDeadline) > now &&
      b.remainingCapital !== 0 &&
      (b.remainingCapital === null || b.minContribution === null || b.remainingCapital >= b.minContribution),
  )
  const eligibleFunding = fundingWindow
    .filter(
      (b) =>
        b.targetCapital !== null &&
        b.confirmedCapital !== null &&
        b.remainingCapital !== null &&
        b.minContribution !== null &&
        b.remainingCapital >= b.minContribution,
    )
    .sort((a, b) => Date.parse(a.fundingDeadline!) - Date.parse(b.fundingDeadline!))
  const funding = eligibleFunding.slice(0, 3)
  const minimums = eligibleFunding.flatMap((b) => (b.minContribution === null ? [] : [b.minContribution]))
  const minimumContribution =
    page?.complete && fundingWindow.length === eligibleFunding.length && minimums.length ? Math.min(...minimums) : null
  const fundingKnown = !!page?.complete && fundingWindow.length === eligibleFunding.length
  const fundingCount = fundingKnown ? eligibleFunding.length : null
  const fundingInvestors =
    fundingKnown && eligibleFunding.every((b) => b.investorCount !== null)
      ? eligibleFunding.reduce((sum, b) => sum + b.investorCount!, 0)
      : null
  const production = batches.filter((b) => PRODUCTION_STATUSES.has(b.status))
  const productionProjectionKg =
    page?.complete &&
    production.length &&
    production.every((b) => b.plannedQuantity !== null && b.expectedAvgWeightG !== null)
      ? production.reduce((sum, b) => sum + (b.plannedQuantity! * b.expectedAvgWeightG!) / 1000, 0)
      : null
  // Price is published independently of orderability. Current per-SKU remaining
  // MUST come from availability, which also subtracts unexpired temporary holds.
  const wholesale = batches
    .filter((b) => ACTIVE_STATUSES.has(b.status))
    .flatMap((batch): LandingWholesaleRow[] => {
      const current = availability.get(batch.batchCode)
      if (!current) return []
      const daysRaised = progress.get(batch.batchCode)?.daysRaised ?? null
      const readyDate = readyDateOf(batch, daysRaised, now)
      return batch.offers.flatMap((offer) => {
        const spec = current.specs.find((s) => s.specCode === offer.specCode)
        return spec
          ? [
              {
                batch,
                offer: { ...offer, pricePerKg: spec.pricePerKg },
                acceptingPreorders: current.acceptingPreorders,
                remaining: current.acceptingPreorders ? spec.remaining : null,
                depositRatePct: current.depositRatePct,
                daysRaised,
                readyDate,
              },
            ]
          : []
      })
    })
    .sort(
      (a, b) =>
        (CRAB_TYPES[a.batch.crabType ?? ''] ?? '').localeCompare(CRAB_TYPES[b.batch.crabType ?? ''] ?? '', 'vi') ||
        (a.offer.sizeCode ?? '').localeCompare(b.offer.sizeCode ?? '', 'vi', { numeric: true }) ||
        (a.offer.gradeCode ?? '').localeCompare(b.offer.gradeCode ?? '', 'vi') ||
        a.batch.batchCode.localeCompare(b.batch.batchCode),
    )
  const farms = new Map<string, { farm: LandingPublicFarm; batches: LandingBatch[] }>()
  for (const batch of batches) {
    if (!batch.publicFarm || !ACTIVE_STATUSES.has(batch.status)) continue
    const existing = farms.get(batch.publicFarm.id)
    if (existing) existing.batches.push(batch)
    else farms.set(batch.publicFarm.id, { farm: batch.publicFarm, batches: [batch] })
  }
  const publicOperators = new Map<string, { name: string; batches: LandingBatch[] }>()
  for (const batch of batches) {
    if (batch.publicFarm || !batch.publicOperatorName || !ACTIVE_STATUSES.has(batch.status)) continue
    const existing = publicOperators.get(batch.publicOperatorName)
    if (existing) existing.batches.push(batch)
    else publicOperators.set(batch.publicOperatorName, { name: batch.publicOperatorName, batches: [batch] })
  }
  const groupedProduction = new Map<string, { farm: LandingPublicFarm | null; operatorName: string | null; batches: LandingBatch[] }>()
  for (const batch of production) {
    const key = batch.publicFarm ? `farm:${batch.publicFarm.id}` : batch.publicOperatorName ? `operator:${batch.publicOperatorName}` : 'unassigned'
    const existing = groupedProduction.get(key)
    if (existing) existing.batches.push(batch)
    else groupedProduction.set(key, { farm: batch.publicFarm, operatorName: batch.publicOperatorName, batches: [batch] })
  }
  const productionGroups = [...groupedProduction.entries()].map(
    ([key, group]): LandingProductionGroup => ({
      key,
      ...group,
      plannedQuantity: group.batches.every((b) => b.plannedQuantity !== null)
        ? group.batches.reduce((sum, b) => sum + b.plannedQuantity!, 0)
        : null,
      projectedKg: group.batches.every((b) => b.plannedQuantity !== null && b.expectedAvgWeightG !== null)
        ? group.batches.reduce((sum, b) => sum + (b.plannedQuantity! * b.expectedAvgWeightG!) / 1000, 0)
        : null,
      liveCrabCount: group.batches.every((b) => progress.has(b.batchCode)) ? group.batches.reduce((sum, b) => sum + progress.get(b.batchCode)!.crabsAlive, 0) : null,
    }),
  )
  return {
    funding,
    production,
    productionGroups,
    wholesale,
    farms: [...farms.values()],
    publicOperators: [...publicOperators.values()],
    catalogueComplete: page?.complete ?? false,
    productionLiveCount: page?.complete && production.length && production.every((b) => progress.has(b.batchCode)) ? production.reduce((sum, b) => sum + progress.get(b.batchCode)!.crabsAlive, 0) : null,
    minimumContribution,
    fundingCount,
    fundingInvestors,
    minimumContributionFaq:
      minimumContribution === null
        ? null
        : `Mỗi lô có mức góp riêng. Các lô đang mở nhận góp từ ${formatVnd(minimumContribution)}. Xem điều khoản của lô trước khi góp vốn.`,
    productionProjectionKg,
    closedCount: page?.complete ? batches.filter((b) => b.status === 'Closed').length : null,
  }
}

async function fetchPublicBatches(signal: AbortSignal): Promise<LandingPage> {
  const items: unknown[] = []
  let requestedPage = 1
  let expectedTotal: number | null = null
  while (true) {
    const response = row(
      (
        await http.get<unknown>('/api/batches', {
          params: { scope: 'all', batchMode: 'P', page: requestedPage, pageSize: 100 },
          signal,
        })
      ).data,
    )
    const total = count(response?.total)
    if (
      !response ||
      !Array.isArray(response.items) ||
      response.page !== requestedPage ||
      total === null ||
      (expectedTotal !== null && total !== expectedTotal)
    )
      throw new Error('Invalid public batch page')
    expectedTotal = total
    items.push(...response.items)
    if (items.length >= total) break
    if (!response.items.length) throw new Error('Incomplete public batch pages')
    requestedPage += 1
  }
  return parseLandingPage({ items, total: expectedTotal, page: 1 })
}

export function useLandingBatches(): LandingBatchesData {
  const query = useQuery({
    queryKey: ['landing-public-batches', { scope: 'all', batchMode: 'P', page: 1, pageSize: 100 }],
    queryFn: ({ signal }) => fetchPublicBatches(signal),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const batches = query.isSuccess ? query.data.batches : []
  const offerBatches = batches.filter((b) => ACTIVE_STATUSES.has(b.status) && b.offers.length > 0)
  const availabilityQueries = useQueries({
    queries: offerBatches.map((b) => ({
      queryKey: ['landing-availability', b.batchCode],
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        parseLandingAvailability(
          (await http.get<unknown>(`/api/batches/${encodeURIComponent(b.batchCode)}/availability`, { signal })).data,
          b.batchCode,
        ),
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  })
  const availability = new Map<string, LandingAvailability>()
  availabilityQueries.forEach((result, index) => {
    if (result.isSuccess) availability.set(offerBatches[index].batchCode, result.data)
  })
  const productionBatches = batches.filter((batch) => PRODUCTION_STATUSES.has(batch.status))
  const progressQueries = useQueries({
    queries: productionBatches.map((batch) => ({
      queryKey: ['landing-public-progress', batch.batchCode],
      queryFn: async ({ signal }: { signal: AbortSignal }) => parseLandingProgress(
        // Do not attach the signed-in user's token: only the anonymous public count is needed here.
        (await axios.get<unknown>(`/api/batches/${encodeURIComponent(batch.batchCode)}/progress`, { baseURL: API_URL, signal, timeout: 20_000 })).data,
        batch.batchCode,
      ),
      retry: false, staleTime: 60_000, refetchOnWindowFocus: false,
    })),
  })
  const progress = new Map<string, LandingProgress>()
  progressQueries.forEach((result, index) => {
    if (result.isSuccess) progress.set(productionBatches[index].batchCode, result.data)
  })
  // A failed refresh must not leave apparently current funding/price data on screen.
  return {
    loading: query.isPending,
    failed: query.isError,
    retry: () => {
      void query.refetch()
    },
    ...deriveLandingBatches(query.isSuccess ? query.data : undefined, Date.now(), availability, progress),
  }
}

export function LandingInvestmentSection({ data }: { data: LandingBatchesData }) {
  return <InvestmentShowcase data={data} />
}

/** Farm and production share a single profile section below. */
export function LandingFarmsSection({ data }: { data: LandingBatchesData }) {
  void data
  return null
}

export function LandingProductionSection({ data }: { data: LandingBatchesData }) {
  return <LandingFarmProfiles data={data} />
}

export function LandingWholesaleSection({ data }: { data: LandingBatchesData }) {
  return <WholesaleBoard rows={data.wholesale} />
}
export function LandingBatchSections({ data }: { data: LandingBatchesData }) {
  return (
    <>
      <LandingInvestmentSection data={data} />
      <LandingFarmsSection data={data} />
      <LandingProductionSection data={data} />
      <LandingWholesaleSection data={data} />
    </>
  )
}
