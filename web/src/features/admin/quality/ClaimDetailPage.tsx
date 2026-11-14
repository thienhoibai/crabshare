/* /admin/claims/:claimNo — Hồ sơ một khiếu nại: khách báo gì (kèm ảnh), người nuôi phản hồi, khách trả lời, và quyết định cuối của Admin (BR-174).
   Cột phải cho biết khiếu nại đang ở bước nào và, khi tới lượt Admin, form quyết định. */
import { useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import type { ClaimResponse, ShipmentResponse } from '../../../shared/api/api.gen'
import {
  AuthImage, Money, OpAside, OpBack, OpBadge, OpDl, OpFlow, OpHeading, OpKv, OpMore, OpPanel, QueryView, StatusBadge,
  formatDateTime, formatVnd, label, useGet, type FlowStep,
} from '../../../shared/ui/console'
import ClaimDecisionForm from './ClaimDecisionForm'
import { formatKg, isPast, needsAdmin } from './shared'

function steps(c: ClaimResponse): FlowStep[] {
  const overdue = c.status === 'Open' && isPast(c.responseDueAt)
  const closed = c.status === 'Accepted' || c.status === 'Rejected'
  return [
    { title: 'Khách gửi khiếu nại', sub: formatDateTime(c.createdAt), state: 'done' },
    c.operatorRespondedAt
      ? { title: 'Người nuôi đã phản hồi', sub: formatDateTime(c.operatorRespondedAt), state: 'done' }
      : overdue || c.status === 'Escalated'
        ? { title: 'Người nuôi quá hạn phản hồi', sub: `Hạn ${formatDateTime(c.responseDueAt)}`, state: 'bad' }
        : { title: 'Chờ người nuôi phản hồi', sub: `Hạn ${formatDateTime(c.responseDueAt)}`, state: closed ? 'todo' : 'now' },
    c.customerAgreed === true
      ? { title: 'Khách đồng ý', state: 'done' }
      : c.customerAgreed === false
        ? { title: 'Khách không đồng ý', state: 'bad' }
        : { title: 'Khách trả lời', state: c.operatorRespondedAt && !closed ? 'now' : 'todo' },
    closed
      ? { title: label('claim', c.status), sub: formatDateTime(c.decidedAt), state: 'done' }
      : { title: 'Admin quyết định', state: needsAdmin(c) ? 'now' : 'todo' },
  ]
}

export default function ClaimDetailPage() {
  const { claimNo = '' } = useParams()
  const claim = useGet<ClaimResponse>(`/api/claims/${encodeURIComponent(claimNo)}`)
  const shipmentNo = claim.data?.shipmentNo
  const shipment = useGet<ShipmentResponse>(shipmentNo ? `/api/shipments/${encodeURIComponent(shipmentNo)}` : null)

  return (
    <QueryView query={claim}>
      {(c) => {
        const line = shipment.data?.lines.find((l) => l.specCode === c.specCode) ?? null
        const closed = c.status === 'Accepted' || c.status === 'Rejected'
        const flow = <OpFlow steps={steps(c)} />
        const info = (
          <OpMore label="Thông tin đơn">
            <OpDl items={[
              { label: 'Đơn đặt trước', value: c.orderNo },
              { label: 'Chuyến giao', value: c.shipmentNo },
              { label: 'Quy cách', value: c.specCode },
              ...(line ? [
                { label: 'Giá mỗi kg', value: formatVnd(line.pricePerKg) },
                { label: 'Đã nghiệm thu', value: `${line.acceptedCrabs ?? 0} con · ${formatKg(line.acceptedKg ?? 0)}` },
              ] : []),
            ]} />
          </OpMore>
        )
        return (
          <>
            <OpHeading
              crumb={<OpBack href="/admin/claims"><ArrowLeft size={16} /> Khiếu nại</OpBack>}
              eyebrow={`${label('claimType', c.claimType)} · đơn ${c.orderNo}`}
              title={`Khiếu nại ${c.claimNo}`}
              action={
                <>
                  <StatusBadge kind="claim" value={c.status} />
                  {c.status === 'Open' && isPast(c.responseDueAt) && <OpBadge tone="danger">Quá hạn phản hồi</OpBadge>}
                </>
              }
            />
            <div className="op-split">
              <div>
                <OpPanel title="Khách hàng báo">
                  <OpKv items={[
                    { label: 'Vấn đề', value: label('issueType', c.issueType) },
                    { label: 'Bị ảnh hưởng', value: [c.affectedCrabs !== null ? `${c.affectedCrabs} con` : null, c.affectedKg !== null ? formatKg(c.affectedKg) : null].filter(Boolean).join(' · ') },
                    { label: 'Quy cách', value: c.specCode },
                  ]} />
                  <p className="ab-quote">{c.description}</p>
                  <div className="op-thumbs">
                    <AuthImage path={`/api/claims/${encodeURIComponent(c.claimNo)}/photo`} alt={`Ảnh khách chụp cho khiếu nại ${c.claimNo}`} />
                  </div>
                </OpPanel>
                {c.operatorResponse && (
                  <OpPanel
                    title="Người nuôi phản hồi"
                    action={c.customerAgreed === null ? undefined : <OpBadge tone={c.customerAgreed ? 'ok' : 'danger'}>{c.customerAgreed ? 'Khách đồng ý' : 'Khách không đồng ý'}</OpBadge>}
                  >
                    <p className="ab-quote">{c.operatorResponse}</p>
                    {c.status === 'OperatorAccepted' && c.refundKg !== null && <small className="op-muted">Đề nghị hoàn {formatKg(c.refundKg)}</small>}
                  </OpPanel>
                )}
                {closed && (
                  <OpPanel title="Kết quả" accent>
                    {c.adminDecision && <p className="ab-quote">{c.adminDecision}</p>}
                    {c.status === 'Accepted' && (
                      <OpDl items={[
                        { label: 'Kg được hoàn', value: formatKg(c.refundKg) },
                        { label: 'Tiền hoàn cho khách', value: <Money value={c.refundAmount} />, total: true },
                      ]} />
                    )}
                    {c.status === 'Accepted' && !!c.refundAmount && <a className="op-link" href="/admin/finance?type=Refund">Xem lệnh hoàn tiền</a>}
                    {c.status === 'Rejected' && !c.adminDecision && <small className="op-muted">Khách đồng ý với phản hồi của người nuôi.</small>}
                  </OpPanel>
                )}
              </div>
              {needsAdmin(c)
                ? <ClaimDecisionForm claim={c} line={line} flow={flow}>{info}</ClaimDecisionForm>
                : <OpAside>{flow}{info}</OpAside>}
            </div>
          </>
        )
      }}
    </QueryView>
  )
}
