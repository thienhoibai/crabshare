/* /operator/claims — Khiếu nại và trả hàng của các đơn thuộc Lô của tôi; người nuôi phản hồi trong hạn (mặc định 48 giờ).
   GET /api/operators/me/claims, GET /api/claims/{claimNo}, ảnh /api/claims/{claimNo}/photo, POST /api/claims/{claimNo}/respond (BR-172…174). */
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { MessageSquareWarning } from 'lucide-react'
import type { ClaimResponse, RespondClaimRequest } from '../../../shared/api/api.gen'
import {
  AuthImage, DecimalInput, Field, Money, OpAside, OpBadge, OpBtn, OpConfirm, OpDl, OpEmpty, OpHeading, OpIcon, OpPanel, OpRow, OpTabs, QueryView,
  RadioCards, StatusBadge, TextArea, formatDateTime, label, useGet, useSend,
} from '../../../shared/ui/console'
import { dueText, enc, fmtKg } from './common'
import './sales.css'

type Tab = 'open' | 'answered' | 'escalated' | 'closed' | 'all'

const FILTERS: Record<Tab, (c: ClaimResponse) => boolean> = {
  open: (c) => c.status === 'Open',
  answered: (c) => c.status === 'OperatorAccepted' || c.status === 'OperatorRejected',
  escalated: (c) => c.status === 'Escalated',
  closed: (c) => c.status === 'Accepted' || c.status === 'Rejected',
  all: () => true,
}

const affected = (c: ClaimResponse) => [c.affectedCrabs ? `${c.affectedCrabs} con` : null, c.affectedKg ? fmtKg(c.affectedKg) : null].filter(Boolean).join(' · ') || '—'

export default function ClaimsPage() {
  const [params, setParams] = useSearchParams()
  const [picked, setPicked] = useState<Tab | null>(null)
  const claims = useGet<ClaimResponse[]>('/api/operators/me/claims')

  return (
    <>
      <OpHeading eyebrow="Bán và giao" title="Khiếu nại, trả hàng" />
      <QueryView query={claims}>
        {(rows) => {
          if (rows.length === 0) return <OpEmpty title="Chưa có khiếu nại nào" />
          const count = (key: Tab) => rows.filter(FILTERS[key]).length
          const tab = picked ?? (count('open') > 0 ? 'open' : 'all')
          const shown = rows.filter(FILTERS[tab])
          // Chưa chọn thì mở sẵn khiếu nại đầu tiên đang chờ phản hồi.
          const selected = params.get('kn') ?? rows.find(FILTERS.open)?.claimNo ?? null
          return (
            <>
              <OpTabs<Tab>
                items={[
                  { key: 'open', label: 'Chờ tôi phản hồi', count: count('open') },
                  { key: 'answered', label: 'Chờ khách', count: count('answered') },
                  { key: 'escalated', label: 'Chuyển Admin', count: count('escalated') },
                  { key: 'closed', label: 'Đã chốt', count: count('closed') },
                  { key: 'all', label: 'Tất cả', count: rows.length },
                ]}
                value={tab}
                onChange={setPicked}
                label="Lọc khiếu nại"
              />
              <div className="op-split">
                <div>
                  <OpPanel className="op-list">
                    {shown.length === 0
                      ? <p className="rd-muted">Không có khiếu nại nào ở mục này.</p>
                      : shown.map((c) => {
                        const due = c.status === 'Open' ? dueText(c.responseDueAt) : null
                        return (
                          <OpRow
                            key={c.claimNo}
                            onClick={() => setParams({ kn: c.claimNo })}
                            media={<OpIcon tone={c.status === 'Open' ? 'warn' : 'mute'}><MessageSquareWarning size={20} /></OpIcon>}
                            title={`${label('issueType', c.issueType)} · ${affected(c)}`}
                            sub={`${label('claimType', c.claimType)} · đơn ${c.orderNo}`}
                            mid={due ? <span className={due.late ? 'op-danger' : 'op-warn'}>{due.late ? 'Quá hạn' : `Phản hồi ${due.text}`}</span> : null}
                            end={<StatusBadge kind="claim" value={c.status} />}
                          />
                        )
                      })}
                  </OpPanel>
                </div>
                {selected && <OpAside><ClaimDetail key={selected} claimNo={selected} /></OpAside>}
              </div>
            </>
          )
        }}
      </QueryView>
    </>
  )
}

function ClaimDetail({ claimNo }: { claimNo: string }) {
  const claim = useGet<ClaimResponse>(`/api/claims/${enc(claimNo)}`)
  const [answer, setAnswer] = useState(false)
  return (
    <QueryView query={claim}>
      {(c) => {
        const due = c.status === 'Open' ? dueText(c.responseDueAt) : null
        return (
          <>
            <div className="op-between">
              <span className="op-inline"><OpBadge tone="info">{label('claimType', c.claimType)}</OpBadge><OpBadge tone="warn">{label('issueType', c.issueType)}</OpBadge></span>
              <StatusBadge kind="claim" value={c.status} />
            </div>
            <AuthImage path={`/api/claims/${enc(c.claimNo)}/photo`} alt={`Ảnh khiếu nại ${c.claimNo}`} />
            <p>{c.description}</p>
            <OpDl items={[
              { label: 'Bị ảnh hưởng', value: affected(c) },
              { label: 'Quy cách', value: <span className="op-mono">{c.specCode}</span> },
              { label: 'Chuyến giao', value: <a className="op-link op-mono" href={`/operator/deliveries/${enc(c.shipmentNo)}`}>{c.shipmentNo}</a> },
              ...(due ? [{ label: 'Hạn phản hồi', value: <span className={due.late ? 'op-danger' : 'op-warn'}>{formatDateTime(c.responseDueAt)} ({due.text})</span> }] : []),
              ...(c.refundAmount !== null ? [{ label: `Hoàn cho khách (${fmtKg(c.refundKg)})`, value: <Money value={c.refundAmount} />, total: true }] : []),
            ]} />

            {due && !due.late && <OpBtn full onClick={() => setAnswer(true)}>Phản hồi khiếu nại</OpBtn>}

            {c.operatorResponse && (
              <div className="os-item">
                <b>Người nuôi {c.status === 'OperatorRejected' ? 'từ chối' : 'đã phản hồi'}</b>
                <p>{c.operatorResponse}</p>
                {c.customerAgreed !== null && <small className="rd-muted">Khách {c.customerAgreed ? 'đồng ý' : 'không đồng ý'}</small>}
              </div>
            )}
            {c.adminDecision && <div className="os-item"><b>Admin quyết định</b><p>{c.adminDecision}</p></div>}
            {answer && <RespondDialog claim={c} onClose={() => setAnswer(false)} />}
          </>
        )
      }}
    </QueryView>
  )
}

function RespondDialog({ claim, onClose }: { claim: ClaimResponse; onClose: () => void }) {
  const [choice, setChoice] = useState<'accept' | 'reject' | null>(null)
  const [note, setNote] = useState('')
  const [refundKg, setRefundKg] = useState<number | null>(claim.affectedKg)
  const respond = useSend<ClaimResponse, RespondClaimRequest>('post', `/api/claims/${enc(claim.claimNo)}/respond`, {
    success: 'Đã gửi phản hồi cho khách.',
    quietError: true,
    onSuccess: onClose,
  })
  return (
    <OpConfirm
      title="Phản hồi khiếu nại"
      sub={`${label('issueType', claim.issueType)} · ${affected(claim)}`}
      confirmLabel={choice === 'reject' ? 'Từ chối khiếu nại' : 'Chấp nhận khiếu nại'}
      variant={choice === 'reject' ? 'danger' : 'primary'}
      pending={respond.isPending}
      error={respond.error}
      disabled={!choice || note.trim().length < 3}
      onConfirm={() => respond.mutate({ accept: choice === 'accept', response: note.trim(), refundKg: choice === 'accept' ? refundKg : null })}
      onClose={onClose}
    >
      <RadioCards
        value={choice}
        onChange={setChoice}
        options={[
          { value: 'accept', label: 'Chấp nhận', hint: 'Hoàn tiền theo kg bị ảnh hưởng' },
          { value: 'reject', label: 'Từ chối', hint: 'Khách không đồng ý thì Admin quyết định' },
        ]}
      />
      {choice === 'accept' && (
        <Field label="Số kg hoàn" hint="Để trống: lấy số khách khai">
          <DecimalInput value={refundKg} onChange={setRefundKg} unit="kg" />
        </Field>
      )}
      <Field label="Nội dung phản hồi" required>
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} required />
      </Field>
    </OpConfirm>
  )
}
