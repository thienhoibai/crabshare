/* /operator/batches/new và /operator/batches/:code/edit — Soạn một Lô P (WF-02) qua bốn bước ngắn:
   Lô → Giá và vốn (POST /api/batches hoặc PUT /api/batches/{code}) → Chi phí (PUT …/cost-plan) → Gửi duyệt (POST …/submit) hoặc huỷ (POST …/cancel). */
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, Ban, Send } from 'lucide-react'
import type { BatchResponse, CancelBatchRequest, OperatorResponse } from '../../shared/api/api.gen'
import {
  Field, OpAside, OpBack, OpBtn, OpConfirm, OpDl, OpError, OpFlow, OpHeading, OpLoading, OpNote, OpPanel, StatusBadge, TextArea, formatVnd, label, useGet, useSend,
  type FlowStep,
} from '../../shared/ui/console'
import BatchTermsForm, { type TermsPart } from './BatchTermsForm'
import CostPlanEditor from './CostPlanEditor'

type Step = 'lo' | 'gia' | 'chi-phi' | 'gui-duyet'
const STEPS: { key: Step; label: string }[] = [
  { key: 'lo', label: '1. Lô' },
  { key: 'gia', label: '2. Giá và vốn' },
  { key: 'chi-phi', label: '3. Chi phí' },
  { key: 'gui-duyet', label: '4. Gửi duyệt' },
]
const isStep = (value: string | null): value is Step => STEPS.some((s) => s.key === value)

function StepNav({ step, saved, onChange }: { step: Step; saved: boolean; onChange: (next: Step) => void }) {
  return (
    <nav className="op-tabs" aria-label="Các bước soạn Lô">
      {STEPS.map((s) => {
        // Hai bước sau cần Lô đã được lưu.
        const locked = !saved && (s.key === 'chi-phi' || s.key === 'gui-duyet')
        return (
          <button key={s.key} type="button" className={s.key === step ? 'is-on' : ''} aria-current={s.key === step ? 'step' : undefined} disabled={locked}
            style={locked ? { opacity: 0.45, cursor: 'not-allowed' } : undefined} onClick={() => onChange(s.key)}>
            {s.label}
          </button>
        )
      })}
    </nav>
  )
}

function SubmitStep({ batch }: { batch: BatchResponse }) {
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'submit' | 'cancel' | null>(null)
  const [reason, setReason] = useState('')
  const base = `/api/batches/${encodeURIComponent(batch.batchCode)}`
  const workspace = `/operator/batches/${encodeURIComponent(batch.batchCode)}`
  const submit = useSend<BatchResponse, void>('post', `${base}/submit`, { success: 'Đã gửi Lô cho Admin duyệt.', onSuccess: () => navigate(workspace), quietError: true })
  const cancel = useSend<BatchResponse, CancelBatchRequest>('post', `${base}/cancel`, { success: 'Đã huỷ Lô.', onSuccess: () => navigate(workspace), quietError: true })
  const plan = batch.costPlan
  const planReady = !!plan && plan.status === 'Draft' && plan.items.length > 0
  const checks: FlowStep[] = [
    { title: 'Thông tin Lô', sub: `${batch.plannedQuantity} con · ${batch.hasHolding ? `nuôi ${batch.holdingDays} ngày` : 'không lưu nuôi'}`, state: 'done' },
    {
      title: 'Giá bán và bên thu mua',
      sub: batch.offers.length && batch.offtakeBuyer ? `${batch.offers.length} quy cách · ${batch.offtakeBuyer.legalName}` : 'Chưa đủ',
      state: batch.offers.length && batch.offtakeBuyer ? 'done' : 'bad',
    },
    {
      title: 'Chi phí và mốc giải ngân',
      sub: !plan ? 'Chưa lưu' : plan.status !== 'Draft' ? 'Cần lưu lại ở bước 3' : `${plan.items.length} khoản · ${plan.milestones.length} mốc · ${formatVnd(plan.total)}`,
      state: planReady ? 'done' : 'bad',
    },
    {
      title: 'Vốn tối thiểu không quá vốn mục tiêu',
      sub: `${formatVnd(batch.minViableCapital)} / ${formatVnd(batch.targetCapital)}`,
      state: !planReady ? 'todo' : batch.minViableCapital <= batch.targetCapital ? 'done' : 'bad',
    },
  ]
  const ready = checks.every((c) => c.state === 'done')

  return (
    <div className="op-split">
      <div>
        <OpPanel title="Kiểm tra trước khi gửi">
          <OpFlow steps={checks} />
        </OpPanel>
      </div>
      <OpAside>
        <OpDl items={[
          { label: 'Chi phí chuẩn mỗi con', value: plan ? formatVnd(plan.costPerCrab) : '—' },
          { label: 'Vốn mục tiêu', value: plan ? formatVnd(batch.targetCapital) : '—' },
          { label: 'Thù lao người nuôi', value: batch.baseRemunerationPct === null ? '—' : `${batch.baseRemunerationPct}%` },
        ]} />
        {batch.canSubmit && <OpBtn full disabled={!ready} onClick={() => setDialog('submit')}><Send size={16} /> Gửi Admin duyệt</OpBtn>}
        {batch.canCancel && <OpBtn full variant="danger" onClick={() => setDialog('cancel')}><Ban size={16} /> Huỷ Lô</OpBtn>}
      </OpAside>

      {dialog === 'submit' && (
        <OpConfirm title="Gửi Lô cho Admin duyệt" sub={batch.title} confirmLabel="Gửi duyệt" pending={submit.isPending} error={submit.error}
          onConfirm={() => submit.mutate()} onClose={() => setDialog(null)}>
          <p className="rd-muted">Trong lúc chờ duyệt Lô không sửa được.</p>
        </OpConfirm>
      )}
      {dialog === 'cancel' && (
        <OpConfirm title="Huỷ Lô" sub={batch.title} confirmLabel="Huỷ Lô" variant="danger" pending={cancel.isPending} error={cancel.error}
          disabled={!reason.trim()} onConfirm={() => cancel.mutate({ reason: reason.trim() })} onClose={() => setDialog(null)}>
          <Field label="Lý do huỷ" required>
            <TextArea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </OpConfirm>
      )}
    </div>
  )
}

export default function OperatorBatchForm() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [draftPart, setDraftPart] = useState<TermsPart>('lo')
  const batch = useGet<BatchResponse>(code ? `/api/operators/me/batches/${encodeURIComponent(code)}` : null)
  const operator = useGet<OperatorResponse>(code ? null : '/api/operators/me', undefined, { retry: false })
  const wanted = params.get('buoc')
  const step: Step = !code ? draftPart : isStep(wanted) ? wanted : 'lo'
  const go = (next: Step) => (code ? setParams({ buoc: next }, { replace: true }) : setDraftPart(next === 'gia' ? 'gia' : 'lo'))
  const b = batch.data

  const heading = (
    <OpHeading
      crumb={<OpBack href={code ? `/operator/batches/${encodeURIComponent(code)}` : '/operator/batches'}><ArrowLeft size={16} /> {code ? 'Về trang của Lô' : 'Lô của tôi'}</OpBack>}
      eyebrow={b ? `${b.batchCode} · ${label('crabType', b.crabType)}` : 'Lô P · góp vốn'}
      title={b ? b.title : 'Tạo Lô P'}
      action={b ? <StatusBadge kind="batch" value={b.status} /> : undefined}
    />
  )

  if (!code) {
    const blocked = operator.data && (operator.data.status !== 'Approved' || operator.data.memberRole !== 'Owner')
    return (
      <>
        {heading}
        {blocked && <OpNote tone="danger">Hồ sơ hộ nuôi chưa được duyệt nên chưa tạo được Lô. <a className="op-link" href="/operator/register">Xem hồ sơ</a></OpNote>}
        <StepNav step={step} saved={false} onChange={go} />
        <BatchTermsForm batch={null} part={draftPart} onPart={setDraftPart}
          onSaved={(saved) => navigate(`/operator/batches/${encodeURIComponent(saved.batchCode)}/edit?buoc=chi-phi`, { replace: true })} />
      </>
    )
  }

  if (batch.isPending) return <OpLoading />
  if (batch.isError || !b) return <OpError error={batch.error} onRetry={() => void batch.refetch()} />

  if (b.batchMode !== 'P' || !b.canEdit) {
    return (
      <>
        {heading}
        <OpNote tone="info">
          {b.batchMode !== 'P' ? `Lô ${b.batchMode} do Admin soạn.` : `Lô ${label('batch', b.status).toLowerCase()} nên không sửa được.`}{' '}
          <a className="op-link" href={`/operator/batches/${encodeURIComponent(b.batchCode)}`}>Về trang của Lô</a>
        </OpNote>
      </>
    )
  }

  const onTerms = step === 'lo' || step === 'gia'
  return (
    <>
      {heading}
      {b.rejectionReason && <OpNote tone="danger"><b>Admin yêu cầu sửa:</b> {b.rejectionReason}</OpNote>}
      <StepNav step={step} saved onChange={go} />
      {/* Giữ form điều khoản trong cây khi sang bước khác để số đang sửa dở không mất. */}
      <div hidden={!onTerms}>
        <BatchTermsForm key={b.batchCode} batch={b} part={step === 'gia' ? 'gia' : 'lo'} onPart={go} onSaved={() => go('chi-phi')} />
      </div>
      {step === 'chi-phi' && (
        <>
          <CostPlanEditor key={`${b.batchCode}-${b.costPlan?.versionNo ?? 0}`} batch={b} />
          {b.costPlan?.status === 'Draft' && (
            <div className="op-formfoot">
              <OpBtn variant="ghost" onClick={() => go('gui-duyet')}>Sang bước gửi duyệt</OpBtn>
            </div>
          )}
        </>
      )}
      {step === 'gui-duyet' && <SubmitStep batch={b} />}
    </>
  )
}
