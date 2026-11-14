/* Tab Chi phí của một Lô: bốn số chính, từng khoản so với chi phí thực tế đã ghi, mốc giải ngân (BR-030…036, BR-145),
   và ghi chi phí thực tế kèm số chứng từ (POST /api/batches/{code}/actual-costs, BR-037). */
import { useState } from 'react'
import { Pencil, ReceiptText } from 'lucide-react'
import type { CostActualRequest, CostItemResponse } from '../../../../shared/api/api.gen'
import {
  Field, Input, Money, MoneyInput, OpBadge, OpBtn, OpConfirm, OpEmpty, OpFacts, OpFlow, OpMeter, OpMore, OpPanel, OpTable, Select, TextArea, formatVnd, label,
  options, useSend,
} from '../../../../shared/ui/console'
import { costBearerLabel, costPlanStatusLabel, num, todayIso } from '../../opA'
import type { BatchTabProps } from '../types'

const NO_ACTUALS = ['Draft', 'PendingApproval', 'NeedsRevision', 'Rejected', 'Cancelled', 'Closed']

function ActualCostDialog({ code, items, preset, onClose }: { code: string; items: CostItemResponse[]; preset: number | null; onClose: () => void }) {
  const [costItemId, setCostItemId] = useState(String(preset ?? items[0]?.costItemId ?? ''))
  const [amount, setAmount] = useState<number | null>(null)
  const [incurredOn, setIncurredOn] = useState(todayIso())
  const [documentRef, setDocumentRef] = useState('')
  const [note, setNote] = useState('')
  const record = useSend<{ costActualId: number }, CostActualRequest>('post', `/api/batches/${encodeURIComponent(code)}/actual-costs`, {
    success: 'Đã ghi chi phí thực tế.', onSuccess: onClose, quietError: true,
  })
  return (
    <OpConfirm
      title="Ghi chi phí thực tế"
      confirmLabel="Ghi"
      pending={record.isPending}
      error={record.error}
      disabled={!costItemId || !amount || !incurredOn || !documentRef.trim()}
      onClose={onClose}
      onConfirm={() => record.mutate({ costItemId: Number(costItemId), amount: amount ?? 0, incurredOn, documentRef: documentRef.trim(), note: note.trim() || null })}
    >
      <Field label="Khoản chi" required>
        <Select value={costItemId} onChange={(e) => setCostItemId(e.target.value)}>
          {items.map((i) => <option key={i.costItemId} value={i.costItemId}>{i.description}</option>)}
        </Select>
      </Field>
      <div className="op-form__row">
        <Field label="Số tiền" required>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Ngày chi" required>
          <Input type="date" max={todayIso()} value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} />
        </Field>
      </div>
      <Field label="Số chứng từ" required hint="Số hoá đơn hoặc mã chuyển khoản">
        <Input value={documentRef} maxLength={100} onChange={(e) => setDocumentRef(e.target.value)} />
      </Field>
      <OpMore label="Ghi chú">
        <TextArea rows={2} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label="Ghi chú" />
      </OpMore>
    </OpConfirm>
  )
}

export default function CostTab({ code, batch: b }: BatchTabProps) {
  const [recording, setRecording] = useState<{ preset: number | null } | null>(null)
  const plan = b.costPlan
  const editHref = `/operator/batches/${encodeURIComponent(code)}/edit?buoc=chi-phi`

  if (!plan) {
    return (
      <OpEmpty title="Lô chưa có kế hoạch chi phí" icon={<ReceiptText size={30} />}>
        {b.canEdit && <a className="op-link" href={editHref}>Khai các khoản chi</a>}
      </OpEmpty>
    )
  }

  const canRecord = plan.status === 'Locked' && !NO_ACTUALS.includes(b.status)
  const byBatch = plan.items.filter((i) => !i.costBearer || i.costBearer === 'Batch')
  const actualTotal = plan.items.reduce((sum, i) => sum + i.actualAmount, 0)
  const categories = options('costCategory')
    .map((c) => ({ ...c, amount: byBatch.filter((i) => i.category === c.value).reduce((sum, i) => sum + i.amount, 0) }))
    .filter((c) => c.amount > 0)

  return (
    <>
      <OpFacts items={[
        { label: 'Tổng Chi phí chuẩn', value: formatVnd(plan.total) },
        { label: 'Mỗi con', value: formatVnd(plan.costPerCrab) },
        { label: b.batchMode === 'P' ? 'Vốn mục tiêu' : 'Theo số con kế hoạch', value: formatVnd(plan.lockedTotal), tone: 'info' },
        { label: 'Thực tế đã ghi', value: formatVnd(actualTotal), tone: actualTotal > plan.total ? 'danger' : undefined },
      ]} />

      <OpPanel
        title="Các khoản chi"
        action={
          <span className="op-inline">
            <OpBadge tone={plan.status === 'Locked' ? 'ok' : 'warn'}>{costPlanStatusLabel(plan.status)}</OpBadge>
            {canRecord && <OpBtn sm onClick={() => setRecording({ preset: null })}><ReceiptText size={15} /> Ghi chi phí thực tế</OpBtn>}
            {!plan.lockedAt && b.canEdit && <a className="rd-btn rd-btn--ghost rd-btn--sm" href={editHref}><Pencil size={14} /> Sửa</a>}
          </span>
        }
      >
        <OpTable
          rows={plan.items}
          rowKey={(i) => i.costItemId}
          onRowClick={canRecord ? (i) => setRecording({ preset: i.costItemId }) : undefined}
          columns={[
            {
              key: 'item', header: 'Khoản chi', cell: (i) => (
                <>
                  <b>{i.description}</b><br />
                  <small className="rd-muted">
                    {label('costCategory', i.category)} · {num(i.quantity)} {i.unit} × {formatVnd(i.unitPrice)}
                    {i.costBearer && i.costBearer !== 'Batch' ? ` · ${costBearerLabel(i.costBearer)}` : ''}
                  </small>
                </>
              ),
            },
            { key: 'amount', header: 'Kế hoạch', num: true, cell: (i) => <Money value={i.amount} /> },
            { key: 'actual', header: 'Thực tế', num: true, cell: (i) => (i.actualAmount > 0 ? <b className={i.actualAmount > i.amount ? 'op-danger' : ''}><Money value={i.actualAmount} /></b> : '—') },
          ]}
        />
      </OpPanel>

      <OpPanel title="Mốc giải ngân" action={b.batchMode === 'P' ? <a className="op-link" href="/operator/disbursements">Xin giải ngân</a> : undefined}>
        {plan.milestones.length === 0 ? <p className="rd-muted">Lô chưa khai mốc giải ngân.</p> : (
          <OpFlow steps={plan.milestones.map((m) => ({
            title: <>{m.name} · {m.pct}%{m.plannedAmount !== null && <> · <span className="rd-num">{formatVnd(m.plannedAmount)}</span></>}</>,
            sub: m.unlockCondition,
          }))} />
        )}
        <OpMore label="Chi phí theo nhóm">
          {categories.map((c) => <OpMeter key={c.value} label={c.label} value={c.amount} max={plan.total} display={formatVnd(c.amount)} />)}
        </OpMore>
      </OpPanel>

      {recording && <ActualCostDialog code={code} items={plan.items} preset={recording.preset} onClose={() => setRecording(null)} />}
    </>
  )
}
