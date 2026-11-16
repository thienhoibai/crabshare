/* Các tab nhóm A của trang làm việc một Lô: tổng quan, chi phí, nguồn cua, lưu nuôi, nhật ký, thiết bị.
   Tab chỉ hiện khi trạng thái của Lô dùng tới; tab đầu tiên (Tổng quan) là tab mặc định. */
import { lazy } from 'react'
import type { BatchResponse } from '../../../shared/api/api.gen'
import type { BatchTab } from './types'

const OverviewTab = lazy(() => import('./tabs/OverviewTab'))
const CostTab = lazy(() => import('./tabs/CostTab'))
const SourcingTab = lazy(() => import('./tabs/SourcingTab'))
const HoldingTab = lazy(() => import('./tabs/HoldingTab'))
const LogTab = lazy(() => import('./tabs/LogTab'))
const DevicesTab = lazy(() => import('./tabs/DevicesTab'))

/** Từ lúc Lô mở để mua nguồn (lô P sau khi chốt vốn, lô T và A sau khi được duyệt) cho tới khi đóng. */
const SOURCED = ['Sourcing', 'Stocked', 'InProduction', 'Harvesting', 'Selling', 'Liquidating', 'AwaitingSettlement', 'Settling', 'Settlement', 'Closed']
/** Từ lúc có đợt lưu nuôi (thả con đầu tiên) cho tới khi đóng. */
const RAISED = SOURCED.filter((s) => s !== 'Sourcing')

const sourced = (b: BatchResponse) => SOURCED.includes(b.status)

export const tabsA: BatchTab[] = [
  { key: 'tong-quan', label: 'Tổng quan', Component: OverviewTab },
  { key: 'chi-phi', label: 'Chi phí', Component: CostTab },
  { key: 'nguon-cua', label: 'Nguồn cua', show: sourced, Component: SourcingTab },
  { key: 'luu-nuoi', label: 'Lưu nuôi', show: (b) => b.hasHolding && sourced(b), Component: HoldingTab },
  { key: 'nhat-ky', label: 'Nhật ký', show: (b) => b.hasHolding && RAISED.includes(b.status), Component: LogTab },
  { key: 'thiet-bi', label: 'Thiết bị', show: (b) => b.hasHolding && RAISED.includes(b.status), Component: DevicesTab },
]
