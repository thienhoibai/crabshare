/* Các tab nhóm B của trang làm việc một Lô: thu hoạch và phân hạng, đặt trước và giao hàng, bán có hoá đơn, giải ngân và quyết toán.
   Mỗi tab chỉ hiện khi trạng thái hoặc phương thức của Lô dùng tới. */
import { lazy } from 'react'
import type { BatchResponse } from '../../../shared/api/api.gen'
import type { BatchTab } from './types'

const HarvestTab = lazy(() => import('./tabs/HarvestTab'))
const DeliveryTab = lazy(() => import('./tabs/DeliveryTab'))
const SalesTab = lazy(() => import('./tabs/SalesTab'))
const MoneyTab = lazy(() => import('./tabs/MoneyTab'))

/** Lô đã được duyệt và mở (gọi vốn với lô P, mua nguồn với lô T và A) cho tới khi đóng. */
const OPENED = ['Funding', 'Sourcing', 'Stocked', 'InProduction', 'Harvesting', 'Selling', 'Liquidating', 'AwaitingSettlement', 'Settling', 'Settlement', 'Closed']
/** Từ lúc có cua để đo: Lô có lưu nuôi đo khi thu hoạch, Lô không lưu nuôi đo ngay sau khi nhận (BR-150, BR-151). */
const GRADING = ['InProduction', 'Harvesting', 'Selling', 'Liquidating', 'AwaitingSettlement', 'Settling', 'Settlement', 'Closed']
/** Từ lúc có cua đã duyệt hạng để bán qua đơn có hoá đơn (BR-177, BR-210) cho tới khi đóng Lô. */
const SELLING = ['Harvesting', 'Selling', 'Liquidating', 'AwaitingSettlement', 'Settling', 'Settlement', 'Closed']

const inStage = (stages: string[]) => (b: BatchResponse) => stages.includes(b.status)
/** Lô không lưu nuôi đo và bán ngay trong lúc mua nguồn. */
const sourcingWithoutHolding = (b: BatchResponse) => !b.hasHolding && b.status === 'Sourcing'

export const tabsB: BatchTab[] = [
  { key: 'thu-hoach', label: 'Thu hoạch và phân hạng', show: (b) => GRADING.includes(b.status) || sourcingWithoutHolding(b), Component: HarvestTab },
  { key: 'giao-hang', label: 'Đặt trước và giao hàng', show: inStage(OPENED), Component: DeliveryTab },
  { key: 'ban-hang', label: 'Bán có hoá đơn', show: (b) => SELLING.includes(b.status) || sourcingWithoutHolding(b), Component: SalesTab },
  { key: 'tien', label: 'Giải ngân và quyết toán', show: inStage(OPENED), Component: MoneyTab },
]
