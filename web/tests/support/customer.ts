/* Dữ liệu giả lập của cổng khách hàng: /khach, /khach/dat-truoc/:code, /khach/don/:orderNo. */
import type {
  DepositPaymentResponse, OrderDeliveriesResponse, PagedResultOfPreorderResponse, PartySiteResponse, PaymentRequestResponse, PreorderResponse, ShipmentResponse,
} from '../../src/shared/api/api.gen'
import { dateFromNow, daysFromNow, type Api, type PageUnderTest } from './app'
import { batchP, batchT, mockPublic, trace } from './public'

const site = (siteId: number, name: string, addressLine: string, extra: Partial<PartySiteResponse> = {}): PartySiteResponse => ({
  siteId, siteCode: `DA-${siteId}`, siteType: 'DeliveryAddress', name, addressLine, province: 'TP. Hồ Chí Minh', latitude: 10.77, longitude: 106.7,
  contactName: null, contactPhone: null, isDefault: false, status: 'Active', ...extra,
})

export const sites: PartySiteResponse[] = [
  site(11, 'Nhà hàng Biển Xanh', '12 Lê Lợi, Quận 1', { isDefault: true }),
  site(12, 'Bếp trung tâm Quận 7', '45 Nguyễn Thị Thập, Quận 7'),
  site(13, 'Kho Thủ Đức', '8 Võ Văn Ngân, Thủ Đức', { latitude: null, longitude: null }),
]

/* ---------- đơn vừa đặt ở Lô P, chờ chuyển cọc ---------- */

export const deposit: DepositPaymentResponse = {
  paymentRequestId: 901, referenceCode: 'CSD4M8T2', amount: 2_685_600, qrContent: 'VIETQR|SANDBOX|CSD4M8T2|2685600',
  expiresAt: daysFromNow(0.02), batchAccountNo: '9704000000456', status: 'Pending',
}

/** 30 con Cua gạch L (12,6 kg × 520.000 đ) và 5 kg Cua gạch M (× 480.000 đ): 8.952.000 đ, cọc 30% là 2.685.600 đ. */
export const orderPending: PreorderResponse = {
  orderNo: 'PO2611000045', batchCode: batchP.batchCode, batchMode: 'P', status: 'PendingDeposit', estimatedValue: 8_952_000, depositRatePct: 30, depositAmount: 2_685_600,
  convertedCrabs: 44, placedAt: daysFromNow(0), holdExpiresAt: deposit.expiresAt, depositedAt: null, confirmedAt: null,
  deliveryAddress: 'Bếp trung tâm Quận 7, 45 Nguyễn Thị Thập, Quận 7', deliveryDistanceKm: 312.5,
  lines: [
    { lineId: 1, specCode: 'RC-L-A', specName: 'Cua gạch L hạng A', mode: 'ByCount', qtyCrabs: 30, qtyKg: null, convertedCrabs: 30, pricePerKg: 520_000, conversionWeightG: 420, minGrade: null, estimatedKg: 12.6, estimatedValue: 6_552_000 },
    { lineId: 2, specCode: 'RC-M-A', specName: 'Cua gạch M hạng A', mode: 'ByKg', qtyCrabs: null, qtyKg: 5, convertedCrabs: 14, pricePerKg: 480_000, conversionWeightG: 380, minGrade: null, estimatedKg: 5, estimatedValue: 2_400_000 },
  ],
  tranches: [{
    trancheId: 451, seq: 1, dueDate: dateFromNow(21), status: 'Planned',
    lines: [{ specCode: 'RC-L-A', qtyCrabs: 30, qtyKg: null, convertedCrabs: 30 }, { specCode: 'RC-M-A', qtyCrabs: null, qtyKg: 5, convertedCrabs: 14 }],
  }],
  deposit, cancelReason: null,
}

/** Cùng đơn sau khi tiền cọc đã về. */
export const orderDeposited: PreorderResponse = { ...orderPending, status: 'Deposited', depositedAt: daysFromNow(0), holdExpiresAt: null, deposit: null }

export const depositRequest: PaymentRequestResponse = {
  paymentRequestId: deposit.paymentRequestId, purpose: 'PreOrderDeposit', status: 'Pending', batchCode: batchP.batchCode, referenceCode: deposit.referenceCode,
  amount: deposit.amount, qrContent: deposit.qrContent, expiresAt: deposit.expiresAt, providerName: 'Ngân hàng thử nghiệm', accountNo: deposit.batchAccountNo,
}

/* ---------- đơn ở Lô T đang giao theo đợt, đợt 1 chờ khách nghiệm thu ---------- */

/** 60 con Cua thịt L (21 kg × 360.000 đ): 7.560.000 đ, cọc 30% là 2.268.000 đ. */
export const orderDelivering: PreorderResponse = {
  orderNo: 'PO2611000031', batchCode: batchT.batchCode, batchMode: 'T', status: 'Delivering', estimatedValue: 7_560_000, depositRatePct: 30, depositAmount: 2_268_000,
  convertedCrabs: 60, placedAt: daysFromNow(-9), holdExpiresAt: null, depositedAt: daysFromNow(-9), confirmedAt: daysFromNow(-8),
  deliveryAddress: 'Nhà hàng Biển Xanh, 12 Lê Lợi, Quận 1', deliveryDistanceKm: 298,
  lines: [{ lineId: 7, specCode: 'FM-L-A', specName: 'Cua thịt L hạng A', mode: 'ByCount', qtyCrabs: 60, qtyKg: null, convertedCrabs: 60, pricePerKg: 360_000, conversionWeightG: 350, minGrade: null, estimatedKg: 21, estimatedValue: 7_560_000 }],
  tranches: [
    { trancheId: 311, seq: 1, dueDate: dateFromNow(0), status: 'Dispatched', lines: [{ specCode: 'FM-L-A', qtyCrabs: 30, qtyKg: null, convertedCrabs: 30 }] },
    { trancheId: 312, seq: 2, dueDate: dateFromNow(7), status: 'Planned', lines: [{ specCode: 'FM-L-A', qtyCrabs: 30, qtyKg: null, convertedCrabs: 30 }] },
  ],
  deposit: null, cancelReason: null,
}

/** Người nuôi đã cân lần hai: nhận 30 con, nghiệm thu 29 con 10,1 kg (3.636.000 đ), từ chối 1 con. */
export const shipmentToAccept: ShipmentResponse = {
  shipmentNo: 'SH2611000007', orderNo: orderDelivering.orderNo, trancheSeq: 1, status: 'Dispatched',
  scheduledAt: daysFromNow(-0.3), dispatchedAt: daysFromNow(-0.2), deliveredAt: null, returnWindowEndsAt: null, transportCondition: 'Xe lạnh 18°C',
  lines: [{
    lineId: 71, specCode: 'FM-L-A', pricePerKg: 360_000, dispatchedCrabs: 30, dispatchedKg: 10.6, receivedCrabs: 30, receivedKg: 10.4,
    acceptedCrabs: 29, acceptedKg: 10.1, rejectedCrabs: 1, transportLossKg: 0.2, goodsValue: 3_636_000,
  }],
  acceptance: {
    status: 'Pending', acceptedCrabs: 29, acceptedKg: 10.1, rejectedCrabs: 1, discrepancyReason: 'Một con yếu khi nhận', operatorRecordedAt: daysFromNow(-0.05),
    customerConfirmedAt: null, goodsValue: null, depositApplied: null, balanceDue: null, balanceDueAt: null, balancePaidAt: null,
  },
  balance: null, traceCode: trace.traceCode,
}

export const deliveriesToAccept: OrderDeliveriesResponse = {
  orderNo: orderDelivering.orderNo, status: 'Delivering', depositAmount: 2_268_000, depositApplied: 0, traceCode: trace.traceCode,
  shipments: [shipmentToAccept], invoices: [], returnWindowEndsAt: null,
}

/** Sau khi khách xác nhận: tiền hàng 3.636.000 đ, trừ hết cọc 2.268.000 đ, còn phải trả 1.368.000 đ qua VietQR, có hoá đơn đợt 1. */
export const shipmentAccepted: ShipmentResponse = {
  ...shipmentToAccept, status: 'Accepted', deliveredAt: daysFromNow(0), returnWindowEndsAt: daysFromNow(1),
  acceptance: {
    ...shipmentToAccept.acceptance!, status: 'Confirmed', customerConfirmedAt: daysFromNow(0),
    goodsValue: 3_636_000, depositApplied: 2_268_000, balanceDue: 1_368_000, balanceDueAt: daysFromNow(2), balancePaidAt: null,
  },
  balance: {
    paymentRequestId: 902, referenceCode: 'CSB7Q2K9', amount: 1_368_000, qrContent: 'VIETQR|SANDBOX|CSB7Q2K9|1368000',
    expiresAt: daysFromNow(2), accountNo: '9704000000789', status: 'Pending',
  },
}

export const deliveriesAccepted: OrderDeliveriesResponse = {
  ...deliveriesToAccept, depositApplied: 2_268_000, shipments: [shipmentAccepted], returnWindowEndsAt: shipmentAccepted.returnWindowEndsAt,
  invoices: [{ invoiceNo: 'INV-2611-0007', trancheSeq: 1, amount: 3_636_000, sellerName: 'Trại cua Tư Bền', buyerName: 'Nhà hàng Biển Xanh', status: 'Active', issuedAt: daysFromNow(0) }],
}

export const balanceRequest: PaymentRequestResponse = {
  paymentRequestId: 902, purpose: 'PreOrderBalance', status: 'Pending', batchCode: batchT.batchCode, referenceCode: 'CSB7Q2K9',
  amount: 1_368_000, qrContent: 'VIETQR|SANDBOX|CSB7Q2K9|1368000', expiresAt: shipmentAccepted.balance!.expiresAt, providerName: 'Ngân hàng thử nghiệm', accountNo: '9704000000789',
}

export const noDeliveries = (order: PreorderResponse): OrderDeliveriesResponse => ({
  orderNo: order.orderNo, status: order.status, depositAmount: order.depositAmount, depositApplied: 0, traceCode: null, shipments: [], invoices: [], returnWindowEndsAt: null,
})

export const ordersPage = (items: PreorderResponse[]): PagedResultOfPreorderResponse => ({ items, page: 1, pageSize: 100, total: items.length })

/** Giả lập mặc định cho mọi trang trong CUSTOMER_PAGES (kèm các endpoint công khai của Lô). */
export function mockCustomer(api: Api) {
  mockPublic(api)
  api.get('/api/me/sites', sites)
  api.get('/api/preorders', ordersPage([orderPending, orderDelivering]))
  api.get(`/api/preorders/${orderPending.orderNo}`, orderPending)
  api.get(`/api/preorders/${orderPending.orderNo}/deliveries`, noDeliveries(orderPending))
  api.get(`/api/preorders/${orderDelivering.orderNo}`, orderDelivering)
  api.get(`/api/preorders/${orderDelivering.orderNo}/deliveries`, deliveriesToAccept)
  api.get(`/api/payment-requests/${depositRequest.paymentRequestId}`, depositRequest)
  api.get(`/api/payment-requests/${balanceRequest.paymentRequestId}`, balanceRequest)
}

export const CUSTOMER_PAGES: PageUnderTest[] = [
  { role: 'Customer', path: '/khach', ready: 'Việc cần làm' },
  { role: 'Customer', path: `/khach/dat-truoc/${batchP.batchCode}`, ready: 'Quy cách và số lượng' },
  { role: 'Customer', path: `/khach/don/${orderPending.orderNo}`, ready: 'Chuyển cọc để giữ đơn' },
  { role: 'Customer', path: `/khach/don/${orderDelivering.orderNo}`, ready: `Nghiệm thu chuyến ${shipmentToAccept.shipmentNo}` },
  { role: 'Customer', path: '/khach/giao-hang', ready: 'Chờ bạn xác nhận nghiệm thu' },
  { role: 'Customer', path: '/khach/dia-diem', ready: 'Bếp trung tâm Quận 7' },
]
