/* /khach/giao-hang — Giao hàng và nghiệm thu: các chuyến giao của mọi đơn đang chạy, gom theo việc khách cần làm.
   Lấy từ GET /api/preorders rồi GET /api/preorders/{orderNo}/deliveries của từng đơn đã xác nhận, đang giao hoặc vừa giao xong. */
import { useState } from 'react'
import { PackageCheck, Truck, Wallet } from 'lucide-react'
import type { PreorderResponse, ShipmentResponse } from '../../shared/api/api.gen'
import {
  OpEmpty, OpError, OpHeading, OpIcon, OpLoading, OpPanel, OpRow, OpTabs, QueryView, StatusBadge, formatDateTime, formatVnd, type Tone,
} from '../../shared/ui/console'
import { DELIVERY_ORDER, fmtKg, inReturnWindow, orderHref, shipmentStage, useDeliveriesOf, useMyOrders, type ShipmentStage } from './customerData'

type Tab = 'todo' | 'moving' | 'done'

const STAGE: Record<ShipmentStage, { text: string; tone: Tone }> = {
  accept: { text: 'Chờ bạn xác nhận nghiệm thu', tone: 'gold' },
  pay: { text: 'Chờ trả phần còn lại', tone: 'danger' },
  transit: { text: 'Hàng đang trên đường', tone: 'info' },
  scheduled: { text: 'Đã lên lịch, chưa xuất', tone: 'mute' },
  done: { text: 'Đã nghiệm thu', tone: 'ok' },
  closed: { text: 'Đã đóng', tone: 'mute' },
}

function ShipmentRow({ s }: { s: ShipmentResponse }) {
  const stage = shipmentStage(s)
  const a = s.acceptance
  const crabs = s.lines.reduce((sum, l) => sum + (l.acceptedCrabs ?? l.dispatchedCrabs ?? 0), 0)
  const kg = s.lines.reduce((sum, l) => sum + (l.acceptedKg ?? l.dispatchedKg ?? 0), 0)
  const Icon = stage === 'pay' ? Wallet : stage === 'accept' || stage === 'done' ? PackageCheck : Truck
  return (
    <OpRow
      href={orderHref(s.orderNo, `chuyen-${s.shipmentNo}`)}
      media={<OpIcon tone={STAGE[stage].tone}><Icon size={22} /></OpIcon>}
      title={`Chuyến ${s.shipmentNo}`}
      sub={`Đơn ${s.orderNo} · đợt ${s.trancheSeq}`}
      mid={
        <>
          <span>{STAGE[stage].text}</span>
          <small>
            {stage === 'pay' ? `Hạn trả ${formatDateTime(a?.balanceDueAt)}`
              : stage === 'done' && inReturnWindow(s) ? `Còn gửi được khiếu nại tới ${formatDateTime(s.returnWindowEndsAt)}`
                : s.dispatchedAt ? `Xuất hàng ${formatDateTime(s.dispatchedAt)}` : `Hẹn giao ${formatDateTime(s.scheduledAt)}`}
          </small>
        </>
      }
      end={
        <>
          <StatusBadge kind="shipment" value={s.status} />
          <small>{stage === 'pay' ? `Còn phải trả ${formatVnd(a?.balanceDue ?? 0)}` : crabs > 0 ? `${crabs} con · ${fmtKg(kg)}` : 'Chưa cân'}</small>
        </>
      }
    />
  )
}

function Shipments({ orders }: { orders: PreorderResponse[] }) {
  const [tab, setTab] = useState<Tab>('todo')
  const queries = useDeliveriesOf(orders.map((o) => o.orderNo))
  if (queries.some((q) => q.isPending)) return <OpLoading label="Đang tải chuyến giao…" />
  const failed = queries.find((q) => q.isError)
  if (failed) return <OpError error={failed.error} onRetry={() => queries.forEach((q) => void q.refetch())} />

  const shipments = queries.flatMap((q) => q.data?.shipments ?? [])
  const groups: Record<Tab, ShipmentResponse[]> = {
    todo: shipments.filter((s) => ['accept', 'pay'].includes(shipmentStage(s))),
    moving: shipments.filter((s) => ['transit', 'scheduled'].includes(shipmentStage(s))),
    done: shipments.filter((s) => shipmentStage(s) === 'done'),
  }
  const empty: Record<Tab, string> = {
    todo: 'Không có chuyến nào chờ bạn xử lý',
    moving: 'Không có chuyến nào đang giao',
    done: 'Chưa có chuyến nào đã nghiệm thu',
  }
  return (
    <>
      <OpTabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { key: 'todo', label: 'Cần tôi xử lý', count: groups.todo.length },
          { key: 'moving', label: 'Đang giao', count: groups.moving.length },
          { key: 'done', label: 'Đã nghiệm thu' },
        ]}
      />
      {groups[tab].length === 0 ? (
        <OpPanel><OpEmpty title={empty[tab]} /></OpPanel>
      ) : (
        <OpPanel className="op-list">{groups[tab].map((s) => <ShipmentRow key={s.shipmentNo} s={s} />)}</OpPanel>
      )}
    </>
  )
}

export default function DeliveriesPage() {
  const orders = useMyOrders()
  return (
    <>
      <OpHeading
        eyebrow="Khách hàng"
        title="Giao hàng và nghiệm thu"
      />
      <QueryView query={orders}>
        {(page) => {
          const active = page.items.filter((o) => DELIVERY_ORDER.includes(o.status))
          if (active.length === 0) {
            return (
              <OpPanel>
                <OpEmpty title="Chưa có đơn nào tới bước giao hàng">
                  <a className="rd-btn rd-btn--ghost" href="/khach">Xem đơn của tôi</a>
                </OpEmpty>
              </OpPanel>
            )
          }
          return <Shipments orders={active} />
        }}
      </QueryView>
    </>
  )
}
