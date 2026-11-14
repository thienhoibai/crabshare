/* /admin/tranches — Duyệt giải ngân theo mốc (GET /api/admin/tranches): duyệt, yêu cầu giải trình trong 72 giờ, hoặc dừng chi.
   Duyệt thì máy chủ kiểm tra lại điều kiện mốc và lập lệnh chi; tiền chỉ đi khi lệnh chi được gửi ở /admin/finance. */
import { useState } from 'react'
import { Ban, CheckCircle2, MessageCircleQuestion } from 'lucide-react'
import type { TrancheDecisionRequest } from '../../../shared/api/api.gen'
import {
  Field, Money, OpBadge, OpBtn, OpConfirm, OpDl, OpFacts, OpHeading, OpNote, OpPanel, OpTable, OpTabs, QueryView, StatusBadge, TextArea,
  formatDate, formatDateTime, formatVnd, label, useGet, useSend,
} from '../../../shared/ui/console'
import { Cell, isPast } from '../quality/shared'
import { canSend, sum, type DisbursementTranche } from './financeModel'

type Tab = 'pending' | 'Released' | 'Blocked' | 'Planned' | 'Stopped'
type Action = 'release' | 'need-explanation' | 'block'

const EMPTY: Record<Tab, string> = {
  pending: 'Không có mốc giải ngân nào chờ duyệt',
  Released: 'Chưa có mốc nào được giải ngân',
  Blocked: 'Không có mốc nào bị dừng chi',
  Planned: 'Không có mốc nào đang chờ người nuôi xin',
  Stopped: 'Không có mốc nào dừng do thanh lý sớm',
}

const ACTIONS: Record<Action, { title: string; confirm: string; variant: 'primary' | 'danger'; done: string; field?: string; effect: string }> = {
  release: { title: 'Duyệt giải ngân', confirm: 'Duyệt giải ngân', variant: 'primary', done: 'Đã duyệt giải ngân và lập lệnh chi.', effect: 'Lệnh chi được lập. Tiền chỉ đi khi bạn gửi lệnh chi.' },
  'need-explanation': { title: 'Yêu cầu giải trình', confirm: 'Gửi yêu cầu', variant: 'primary', done: 'Đã yêu cầu người nuôi giải trình.', field: 'Cần giải trình điều gì', effect: 'Người nuôi có 72 giờ để bổ sung rồi xin lại.' },
  block: { title: 'Dừng chi', confirm: 'Dừng chi', variant: 'danger', done: 'Đã dừng chi mốc giải ngân.', field: 'Lý do dừng chi', effect: 'Người nuôi không xin lại được mốc này.' },
}

function DecisionDialog({ tranche, action, onClose }: { tranche: DisbursementTranche; action: Action; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const spec = ACTIONS[action]
  const base = `/api/admin/tranches/${tranche.trancheId}`
  const options = { quietError: true, success: spec.done, onSuccess: onClose }
  const release = useSend<DisbursementTranche, void>('post', `${base}/release`, options)
  const decide = useSend<DisbursementTranche, TrancheDecisionRequest>('post', `${base}/${action}`, options)
  const text = reason.trim()

  return (
    <OpConfirm
      title={`${spec.title} · mốc ${tranche.trancheNo}`}
      sub={`${tranche.batchCode} · ${tranche.operatorName}`}
      confirmLabel={spec.confirm}
      variant={spec.variant}
      pending={release.isPending || decide.isPending}
      error={release.error ?? decide.error}
      disabled={!!spec.field && (text.length < 5 || text.length > 300)}
      onClose={onClose}
      onConfirm={() => (spec.field ? decide.mutate({ reason: text }) : release.mutate())}
    >
      <OpDl items={[
        { label: 'Điều kiện mở mốc', value: tranche.unlockCondition },
        { label: 'Số tiền của mốc', value: formatVnd(tranche.plannedAmount), total: true },
      ]} />
      {spec.field && (
        <Field label={spec.field} required hint="Từ 5 ký tự.">
          <TextArea rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      <OpNote tone={action === 'block' ? 'danger' : 'info'}>{spec.effect}</OpNote>
    </OpConfirm>
  )
}

export default function TranchesPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [target, setTarget] = useState<{ tranche: DisbursementTranche; action: Action } | null>(null)
  // Không gửi status thì máy chủ trả các mốc đang chờ xử lý: đã xin giải ngân và cần giải trình.
  const tranches = useGet<DisbursementTranche[]>('/api/admin/tranches', { status: tab === 'pending' ? undefined : tab })

  return (
    <>
      <OpHeading eyebrow="Tiền" title="Duyệt giải ngân" />
      <OpTabs
        value={tab}
        onChange={setTab}
        items={[
          { key: 'pending', label: 'Chờ xử lý', count: tab === 'pending' ? tranches.data?.length : undefined },
          { key: 'Released', label: 'Đã giải ngân' },
          { key: 'Blocked', label: 'Bị dừng chi' },
          { key: 'Planned', label: 'Chưa tới mốc' },
          { key: 'Stopped', label: 'Dừng do thanh lý' },
        ]}
      />
      <QueryView query={tranches}>
        {(list) => {
          const requested = list.filter((t) => t.status === 'Requested')
          return (
            <>
              {tab === 'pending' && list.length > 0 && (
                <OpFacts items={[
                  { label: 'Chờ duyệt', value: requested.length, tone: requested.length ? 'warn' : undefined },
                  { label: 'Tiền chờ duyệt', value: formatVnd(sum(requested.map((t) => t.plannedAmount))) },
                  { label: 'Chờ giải trình', value: list.length - requested.length },
                ]} />
              )}
              <OpPanel>
                <OpTable
                  rows={list}
                  rowKey={(t) => t.trancheId}
                  empty={EMPTY[tab]}
                  columns={[
                    { key: 'batch', header: 'Lô', cell: (t) => <Cell main={<b>{t.batchCode}</b>} sub={t.operatorName} /> },
                    { key: 'no', header: 'Mốc', cell: (t) => <Cell main={`Mốc ${t.trancheNo}`} sub={t.unlockCondition} /> },
                    { key: 'amount', header: 'Số tiền', num: true, cell: (t) => <Money value={t.plannedAmount} /> },
                    {
                      key: 'progress', header: 'Tiến trình',
                      cell: (t) => (
                        <Cell
                          main={t.releasedAt ? `Giải ngân ${formatDateTime(t.releasedAt)}` : t.requestedAt ? `Xin ${formatDateTime(t.requestedAt)}` : `Dự kiến ${formatDate(t.plannedDate) || 'chưa có'}`}
                          sub={t.status === 'NeedsExplanation' && t.explanationDeadline ? `Hạn giải trình ${formatDateTime(t.explanationDeadline)}` : t.status === 'Planned' ? t.blockedReason : undefined}
                        />
                      ),
                    },
                    {
                      key: 'status', header: 'Trạng thái',
                      cell: (t) => (
                        <Cell
                          main={
                            <span className="op-inline">
                              <StatusBadge kind="tranche" value={t.status} />
                              {t.status === 'NeedsExplanation' && isPast(t.explanationDeadline) && <OpBadge tone="danger">Quá hạn</OpBadge>}
                            </span>
                          }
                          sub={t.instructionStatus ? `Lệnh chi ${label('instruction', t.instructionStatus).toLowerCase()}` : undefined}
                        />
                      ),
                    },
                    {
                      key: 'actions', header: '',
                      cell: (t) => (
                        <span className="op-inline">
                          {t.status === 'Requested' && (
                            <>
                              <OpBtn sm onClick={() => setTarget({ tranche: t, action: 'release' })}><CheckCircle2 size={15} /> Duyệt</OpBtn>
                              <OpBtn sm variant="ghost" onClick={() => setTarget({ tranche: t, action: 'need-explanation' })}><MessageCircleQuestion size={15} /> Giải trình</OpBtn>
                            </>
                          )}
                          {(t.status === 'Requested' || t.status === 'NeedsExplanation') && (
                            <OpBtn sm variant="danger" onClick={() => setTarget({ tranche: t, action: 'block' })}><Ban size={15} /> Dừng chi</OpBtn>
                          )}
                          {t.status === 'Released' && t.instructionStatus && canSend(t.instructionStatus) && (
                            <a className="rd-btn rd-btn--primary rd-btn--sm" href={`/admin/finance?type=Disbursement&batch=${encodeURIComponent(t.batchCode)}`}>Gửi lệnh chi</a>
                          )}
                        </span>
                      ),
                    },
                  ]}
                />
              </OpPanel>
            </>
          )
        }}
      </QueryView>
      {target && <DecisionDialog tranche={target.tranche} action={target.action} onClose={() => setTarget(null)} />}
    </>
  )
}
