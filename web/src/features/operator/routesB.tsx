/* Route nhóm B của cổng người nuôi: đơn đặt trước, giao hàng, khiếu nại, giải ngân theo mốc, hợp đồng góp vốn, quyết toán.
   Các mục thu hoạch, giao hàng, bán có hoá đơn và tiền của từng Lô nằm ở batch/tabsB.tsx. */
import { lazy } from 'react'
import type { RouteObject } from 'react-router'

const PreordersPage = lazy(() => import('./sales/PreordersPage'))
const DeliveriesPage = lazy(() => import('./sales/DeliveriesPage'))
const ShipmentPage = lazy(() => import('./sales/ShipmentPage'))
const ClaimsPage = lazy(() => import('./sales/ClaimsPage'))
const DisbursementsPage = lazy(() => import('./sales/DisbursementsPage'))
const ContractsPage = lazy(() => import('./sales/ContractsPage'))
const SettlementPage = lazy(() => import('./sales/SettlementPage'))

export const operatorRoutesB: RouteObject[] = [
  { path: '/operator/preorders', element: <PreordersPage /> },
  { path: '/operator/deliveries', element: <DeliveriesPage /> },
  { path: '/operator/deliveries/:shipmentNo', element: <ShipmentPage /> },
  { path: '/operator/claims', element: <ClaimsPage /> },
  { path: '/operator/disbursements', element: <DisbursementsPage /> },
  { path: '/operator/contract', element: <ContractsPage /> },
  { path: '/operator/settlement', element: <SettlementPage /> },
]
