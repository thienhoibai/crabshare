import type { PreorderResponse } from '../../shared/api/api.gen'
import { OpError, OpLoading, OpMore, OpPanel, OpTodo, formatDateTime, formatVnd, type Todo } from '../../shared/ui/console'
import { DELIVERY_ORDER, depositHoldExpired, orderHref, shipmentStage, useDeliveriesOf } from './customerData'

type CustomerTask = Todo & { dueAt?: string | null }
const deadline = (task: CustomerTask) => (task.dueAt && Date.parse(task.dueAt)) || Number.MAX_SAFE_INTEGER

/** Việc của khách lấy từ trạng thái đơn và chuyến giao, không dùng thông báo góp vốn. */
export function CustomerTasks({ orders, showEmpty = false }: { orders: PreorderResponse[]; showEmpty?: boolean }) {
  const deliveries = useDeliveriesOf(orders.filter((order) => DELIVERY_ORDER.includes(order.status)).map((order) => order.orderNo))
  const shipments = deliveries.flatMap((query) => query.data?.shipments ?? [])
  const waiting = deliveries.some((query) => query.isPending)
  const failed = deliveries.filter((query) => query.isError)
  const now = Date.now()
  const tasks: CustomerTask[] = [
    ...orders.filter((order) => order.status === 'PendingDeposit' && !depositHoldExpired(order, now)).map((order) => ({
      title: `Đặt cọc đơn ${order.orderNo}`,
      sub: `${formatVnd(order.depositAmount)}${order.holdExpiresAt ? `, giữ đơn tới ${formatDateTime(order.holdExpiresAt)}` : ''}`,
      href: orderHref(order.orderNo, 'coc'),
      dueAt: order.holdExpiresAt,
      tone: 'warn' as const,
    })),
    ...shipments.filter((shipment) => shipmentStage(shipment) === 'accept').map((shipment) => ({
      title: `Nghiệm thu chuyến ${shipment.shipmentNo}`,
      sub: `Đơn ${shipment.orderNo}, đợt ${shipment.trancheSeq}`,
      href: orderHref(shipment.orderNo, `chuyen-${shipment.shipmentNo}`),
      tone: 'gold' as const,
    })),
    ...shipments.filter((shipment) => shipmentStage(shipment) === 'pay').map((shipment) => ({
      title: `Trả phần còn lại của chuyến ${shipment.shipmentNo}`,
      sub: `${formatVnd(shipment.acceptance?.balanceDue ?? 0)}${shipment.acceptance?.balanceDueAt ? `, hạn ${formatDateTime(shipment.acceptance.balanceDueAt)}` : ''}`,
      href: orderHref(shipment.orderNo, `chuyen-${shipment.shipmentNo}`),
      dueAt: shipment.acceptance?.balanceDueAt,
      tone: 'danger' as const,
    })),
  ].sort((a, b) => deadline(a) - deadline(b))

  if (!tasks.length && !waiting && !failed.length && !showEmpty) return null

  return (
    <OpPanel title="Việc cần làm" className="customer-task-panel">
      {tasks.length > 0 && <OpTodo items={tasks.slice(0, 3)} />}
      {tasks.length > 3 && <OpMore label="Xem thêm việc cần làm" count={tasks.length - 3}><OpTodo items={tasks.slice(3)} /></OpMore>}
      {waiting && tasks.length === 0 && <OpLoading label="Đang kiểm tra chuyến giao…" />}
      {failed.length > 0 && <OpError error={failed[0].error} onRetry={() => failed.forEach((query) => void query.refetch())} />}
      {tasks.length === 0 && !waiting && failed.length === 0 && (
        <div className="customer-task-empty">
          <p className="rd-muted">Hiện chưa có việc cần xử lý.</p>
          <a className="op-link" href="/khach">Xem đơn của tôi</a>
        </div>
      )}
    </OpPanel>
  )
}
