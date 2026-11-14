/* Mục "Giải ngân và quyết toán" của một Lô. Đầu trang là mốc giải ngân kế tiếp và điều còn thiếu (BR-144, BR-145), rồi ba số tiền (BR-232).
   Biên bản thăm trại (BR-233), biểu quyết (BR-182, BR-210, BR-211) và sáu điều kiện chờ quyết toán (BR-183) gấp lại khi chưa có việc cần làm. */
import { useState } from 'react'
import { Vote } from 'lucide-react'
import type {
  DecisionResponse, MoneySummaryResponse, ProposeDecisionRequest, SettlementReadinessResponse, SettlementSummary, SiteVisitReportResponse,
} from '../../../../shared/api/api.gen'
import {
  Field, NumberInput, OpBtn, OpConfirm, OpError, OpFacts, OpFlow, OpLoading, OpMeter, OpMore, OpPanel, OpTable, RadioCards, StatusBadge, TextArea,
  formatDateTime, formatVnd, useGet, useSend,
} from '../../../../shared/ui/console'
import { MilestoneFlow } from '../../sales/MilestoneFlow'
import { dueText, enc, fmtNum, useIsOwner, type MilestoneTranche } from '../../sales/common'
import '../../sales/sales.css'
import type { BatchTabProps } from '../types'

const LIQUIDATION_STAGES = ['Sourcing', 'InProduction', 'Harvesting', 'Selling']
/** Giai đoạn mà sáu điều kiện chờ quyết toán là việc cần theo dõi. */
const CLOSING_STAGES = ['Selling', 'Liquidating']

export default function MoneyTab({ code, batch }: BatchTabProps) {
  const base = `/api/batches/${enc(code)}`
  const isP = batch.batchMode === 'P'
  const { owner } = useIsOwner()
  const money = useGet<MoneySummaryResponse>(`${base}/money-summary`)
  const tranches = useGet<MilestoneTranche[]>(isP ? '/api/operator/tranches' : null)
  const visits = useGet<SiteVisitReportResponse[]>(isP ? `${base}/site-visits` : null)
  const decisions = useGet<DecisionResponse[]>(isP ? `${base}/decisions` : null)
  const readiness = useGet<SettlementReadinessResponse>(`${base}/settlement-readiness`)
  const settlements = useGet<SettlementSummary[]>('/api/operator/settlements')
  const [propose, setPropose] = useState(false)

  const published = settlements.data?.find((s) => s.batchCode === code)
  const milestones = (tranches.data ?? []).filter((t) => t.batchCode === code)
  const names = Object.fromEntries((batch.costPlan?.milestones ?? []).map((m) => [m.no, m.name]))
  const openVotes = (decisions.data ?? []).filter((d) => d.status === 'Open')
  const pastVotes = (decisions.data ?? []).filter((d) => d.status !== 'Open')
  const conditions = readiness.data?.conditions ?? []
  const unmet = conditions.filter((c) => !c.met)
  const closing = CLOSING_STAGES.includes(batch.status)
  const conditionSteps = (list: typeof conditions) => list.map((c) => ({
    title: c.description,
    sub: c.met ? undefined : `Còn ${c.pending} mục`,
    state: c.met ? 'done' as const : 'bad' as const,
  }))

  const failed = [money, tranches, readiness].find((q) => q.isError)

  if (money.isPending) return <OpLoading />
  return (
    <>
      {failed && <OpError error={failed.error} onRetry={() => void failed.refetch()} />}
      {published && (
        <div className="os-item">
          <div className="op-between">
            <span className="op-inline"><b>Bảng quyết toán</b><StatusBadge kind="settlement" value={published.status} /></span>
            <a className="rd-btn rd-btn--dark rd-btn--sm" href={`/operator/settlement?bang=${published.settlementId}`}>Xem bảng quyết toán</a>
          </div>
        </div>
      )}

      {milestones.length > 0 && (
        <OpPanel accent title="Mốc giải ngân" action={<a className="op-link" href="/operator/disbursements">Mọi Lô</a>}>
          <MilestoneFlow rows={milestones} owner={owner} names={names} />
        </OpPanel>
      )}

      {money.data && (
        <OpFacts items={[
          { label: 'Nhà đầu tư đã góp', value: formatVnd(money.data.batch.contributed) },
          { label: 'Đã giải ngân', value: formatVnd(money.data.batch.disbursed), tone: 'ok' },
          { label: 'Còn trong tài khoản của Lô', value: formatVnd(money.data.batch.heldInAccount), tone: 'info' },
        ]} />
      )}

      {openVotes.length > 0 && (
        <OpPanel title="Đang biểu quyết">
          {openVotes.map((d) => <DecisionCard key={d.decisionNo} d={d} />)}
        </OpPanel>
      )}

      {closing && conditions.length > 0 && (
        <OpPanel title="Chờ quyết toán" subtitle="Đủ cả sáu điều kiện thì Lô chuyển sang chờ quyết toán.">
          <OpMeter label="Điều kiện đã đạt" value={conditions.length - unmet.length} max={conditions.length} />
          {unmet.length > 0 && <OpFlow steps={conditionSteps(unmet)} />}
        </OpPanel>
      )}

      {(visits.data?.length ?? 0) > 0 && (
        <OpMore label="Biên bản thăm trại" count={visits.data?.length}>
          <OpTable
            rows={visits.data ?? []}
            rowKey={(v) => v.reportNo}
            columns={[
              { key: 'no', header: 'Biên bản', cell: (v) => <><b>{formatDateTime(v.visitedAt)}</b><span className="os-sub op-mono">{v.reportNo}{v.distanceToFarmM === null ? '' : ` · cách trại ${fmtNum(v.distanceToFarmM)} m`}</span></> },
              { key: 'boxes', header: 'Hộp đã xem', cell: (v) => <span className="op-mono">{v.boxCodes.join(', ')}</span> },
              { key: 'seen', header: 'Số cua', num: true, cell: (v) => v.crabsSeen },
              { key: 'findings', header: 'Ghi nhận', cell: (v) => v.findings },
            ]}
          />
        </OpMore>
      )}

      {isP && (pastVotes.length > 0 || owner) && (
        <OpMore label="Biểu quyết của nhà đầu tư" count={pastVotes.length}>
          <div className="op-stack">
            {pastVotes.map((d) => <DecisionCard key={d.decisionNo} d={d} />)}
            {owner && <div><OpBtn sm variant="ghost" onClick={() => setPropose(true)}><Vote size={15} /> Mở biểu quyết</OpBtn></div>}
          </div>
        </OpMore>
      )}

      {!closing && conditions.length > 0 && (
        <OpMore label="Sáu điều kiện chờ quyết toán" count={unmet.length}>
          <OpFlow steps={conditionSteps(conditions)} />
        </OpMore>
      )}

      {propose && <ProposeDialog code={code} status={batch.status} onClose={() => setPropose(false)} />}
    </>
  )
}

function DecisionCard({ d }: { d: DecisionResponse }) {
  const due = d.status === 'Open' ? dueText(d.closesAt) : null
  return (
    <div className="os-item">
      <div className="op-between">
        <StatusBadge kind="decisionKind" value={d.kind} />
        <StatusBadge kind="decision" value={d.status} />
      </div>
      <p>{d.proposal}</p>
      <OpMeter label="Đồng ý" value={d.yesCapital} max={d.eligibleCapital} display={`${fmtNum(d.yesPct)}%`} />
      <OpMeter label="Không đồng ý" value={d.noCapital} max={d.eligibleCapital} display={`${fmtNum(d.noPct)}%`} tone="var(--danger)" />
      <small className="rd-muted">
        {d.decidedAt ? `Kết thúc ${formatDateTime(d.decidedAt)}` : `Hạn ${formatDateTime(d.closesAt)}${due ? ` (${due.text})` : ''}`} · vốn biểu quyết {formatVnd(d.eligibleCapital)}
      </small>
    </div>
  )
}

function ProposeDialog({ code, status, onClose }: { code: string; status: string; onClose: () => void }) {
  const [kind, setKind] = useState<'EarlyLiquidation' | 'SurplusSale' | null>(null)
  const [proposal, setProposal] = useState('')
  const [hours, setHours] = useState<number | null>(72)
  const send = useSend<DecisionResponse, ProposeDecisionRequest>('post', `/api/batches/${enc(code)}/decisions`, {
    success: (d) => `Đã mở biểu quyết ${d.decisionNo}.`,
    quietError: true,
    onSuccess: onClose,
  })
  const valid = !!kind && proposal.trim().length >= 10 && hours !== null && hours >= 1 && hours <= 336

  return (
    <OpConfirm
      title="Mở biểu quyết"
      sub={`Lô ${code}`}
      confirmLabel="Mở biểu quyết"
      variant={kind === 'EarlyLiquidation' ? 'danger' : 'primary'}
      pending={send.isPending}
      error={send.error}
      disabled={!valid}
      onConfirm={() => send.mutate({ kind: kind!, proposal: proposal.trim(), votingHours: hours ?? 72 })}
      onClose={onClose}
    >
      <RadioCards
        value={kind}
        onChange={setKind}
        options={[
          { value: 'EarlyLiquidation', label: 'Thanh lý sớm', hint: 'Dừng các mốc, bán hết cua còn lại', disabled: !LIQUIDATION_STAGES.includes(status) },
          { value: 'SurplusSale', label: 'Bán phần dư', hint: 'Khi bên cam kết không mua' },
        ]}
      />
      <Field label="Nội dung đề xuất" required hint="Ít nhất 10 ký tự">
        <TextArea rows={4} value={proposal} onChange={(e) => setProposal(e.target.value)} maxLength={1000} required />
      </Field>
      <OpMore label="Tuỳ chọn thêm">
        <Field label="Thời gian biểu quyết">
          <NumberInput value={hours} onChange={setHours} unit="giờ" max={336} />
        </Field>
      </OpMore>
    </OpConfirm>
  )
}
