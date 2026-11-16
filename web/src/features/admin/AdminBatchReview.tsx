/* Khối đầu trang chi tiết Lô: bốn con số tóm tắt và quyết định cần làm.
   Lô chờ duyệt: POST /api/admin/batches/{code}/approve (ApproveBatchRequest) | request-revision | reject (RejectBatchRequest).
   Lô T, A do Quản trị soạn: POST /api/batches/{code}/submit, POST /api/batches/{code}/cancel (CancelBatchRequest). */
import { useState } from 'react'
import { Ban, Check, PencilLine, Send, X } from 'lucide-react'
import type { ApproveBatchRequest, BatchResponse, CancelBatchRequest, RejectBatchRequest } from '../../shared/api/api.gen'
import { Field, Input, OpBtn, OpConfirm, OpFacts, OpNote, OpPanel, formatDate, formatVnd, useSend } from '../../shared/ui/console'
import { ReasonField, localToIso, toLocalInput, type AdminBatch } from './adminPartA'

type Dialog = 'approve' | 'reject' | 'revise' | 'submit' | 'cancel'

export default function AdminBatchReview({ detail }: { detail: AdminBatch }) {
  const b = detail.batch
  const isP = b.batchMode === 'P'
  const adminPath = `/api/admin/batches/${encodeURIComponent(b.batchCode)}`
  const batchPath = `/api/batches/${encodeURIComponent(b.batchCode)}`

  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [reason, setReason] = useState('')
  const [openAt, setOpenAt] = useState('')
  const [deadline, setDeadline] = useState('')
  const [preorderDeadline, setPreorderDeadline] = useState('')
  const close = () => setDialog(null)

  const approve = useSend<AdminBatch, ApproveBatchRequest>('post', `${adminPath}/approve`, { success: 'Đã duyệt Lô.', quietError: true, onSuccess: close })
  const reject = useSend<AdminBatch, RejectBatchRequest>('post', `${adminPath}/reject`, { success: 'Đã từ chối Lô.', quietError: true, onSuccess: close })
  const revise = useSend<AdminBatch, RejectBatchRequest>('post', `${adminPath}/request-revision`, { success: 'Đã yêu cầu sửa lại Lô.', quietError: true, onSuccess: close })
  const submit = useSend<BatchResponse, void>('post', `${batchPath}/submit`, { success: 'Đã gửi Lô đi duyệt.', quietError: true, onSuccess: close })
  const cancel = useSend<BatchResponse, CancelBatchRequest>('post', `${batchPath}/cancel`, { success: 'Đã huỷ Lô.', quietError: true, onSuccess: close })

  const open = (next: Dialog) => {
    for (const m of [approve, reject, revise, submit, cancel]) m.reset()
    setReason('')
    if (next === 'approve' && !openAt) setOpenAt(toLocalInput(new Date()))
    setDialog(next)
  }

  const pending = b.status === 'PendingApproval'
  const approved = detail.approvedAt !== null
  const plan = b.costPlan
  const receipt = formatDate(b.expectedReceiptDate)
  // Điều kiện mà backend kiểm khi duyệt; thiếu điều kiện nào thì nêu đúng điều kiện đó.
  const missing = [
    detail.operatorStatus !== 'Approved' && 'hộ nuôi chưa được duyệt',
    plan === null && 'kế hoạch chi phí',
    b.offers.length === 0 && 'chào giá',
    !b.offtakeBuyer && 'bên cam kết thu mua',
  ].filter((m): m is string => !!m)
  const approveReady = isP ? !!openAt && !!deadline && openAt < deadline : !!preorderDeadline

  return (
    <OpPanel
      accent={pending || b.canSubmit}
      title={pending ? 'Chờ quyết định duyệt' : b.canSubmit ? 'Lô nháp, chưa gửi duyệt' : undefined}
    >
      <OpFacts items={[
        { label: 'Số cua kế hoạch', value: `${b.plannedQuantity} con` },
        isP
          ? { label: 'Vốn mục tiêu', value: formatVnd(b.targetCapital) }
          : { label: 'Giá sàn mỗi kg', value: b.floorPricePerKg ? formatVnd(b.floorPricePerKg) : '—' },
        { label: 'Chi phí chuẩn mỗi con', value: plan ? formatVnd(plan.costPerCrab) : 'Chưa có', tone: plan ? undefined : 'warn' },
        { label: 'Nhận cua dự kiến', value: receipt || '—' },
      ]} />

      {pending && missing.length > 0 && <OpNote tone="danger">Chưa duyệt được, còn thiếu: {missing.join(', ')}.</OpNote>}
      {!pending && b.canSubmit && plan === null && <OpNote tone="info">Lưu kế hoạch chi phí ở tab Chi phí rồi gửi duyệt.</OpNote>}

      {(pending || b.canSubmit || b.canCancel) && (
        <div className="op-inline">
          {pending && <OpBtn disabled={missing.length > 0} onClick={() => open('approve')}><Check size={17} /> Duyệt</OpBtn>}
          {pending && <OpBtn variant="ghost" onClick={() => open('revise')}><PencilLine size={17} /> Yêu cầu sửa lại</OpBtn>}
          {pending && <OpBtn variant="danger" onClick={() => open('reject')}><X size={17} /> Từ chối</OpBtn>}
          {!pending && b.canSubmit && <OpBtn disabled={plan === null} onClick={() => open('submit')}><Send size={17} /> Gửi duyệt</OpBtn>}
          {b.canCancel && <OpBtn variant="danger" onClick={() => open('cancel')}><Ban size={17} /> Huỷ Lô</OpBtn>}
        </div>
      )}

      {approved && (
        <div className="op-inline">
          <a className="op-link" href={`/lo/${encodeURIComponent(b.batchCode)}`}>Trang công khai</a>
          {isP && <a className="op-link" href="/admin/funding">Gọi vốn</a>}
          {isP && <a className="op-link" href="/admin/tranches">Giải ngân</a>}
          <a className="op-link" href="/admin/finance">Lệnh chi</a>
          <a className="op-link" href="/admin/settlements">Quyết toán</a>
        </div>
      )}

      {dialog === 'approve' && (
        <OpConfirm
          title="Duyệt Lô"
          sub={`${b.batchCode} · ${b.title}`}
          confirmLabel="Duyệt"
          pending={approve.isPending}
          error={approve.error}
          disabled={!approveReady}
          onConfirm={() => approve.mutate(isP
            ? { fundingOpenAt: localToIso(openAt), fundingDeadline: localToIso(deadline) }
            : { preorderDeadline: localToIso(preorderDeadline) })}
          onClose={close}
        >
          {isP ? (
            <div className="op-form__row">
              <Field label="Mở gọi vốn lúc" required>
                <Input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />
              </Field>
              <Field label="Hạn gọi vốn" required hint={receipt ? `Trước ngày nhận cua ${receipt}` : undefined}
                error={openAt && deadline && openAt >= deadline ? 'Hạn gọi vốn phải sau giờ mở.' : undefined}>
                <Input type="datetime-local" value={deadline} min={openAt} onChange={(e) => setDeadline(e.target.value)} />
              </Field>
            </div>
          ) : (
            <Field label="Hạn nhận đặt trước" required hint={receipt ? `Trước ngày nhận cua ${receipt}` : undefined}>
              <Input type="datetime-local" value={preorderDeadline} onChange={(e) => setPreorderDeadline(e.target.value)} />
            </Field>
          )}
          <OpNote tone="info">Duyệt xong, chi phí, sản lượng, chào giá và giá sàn bị khoá.</OpNote>
        </OpConfirm>
      )}

      {(dialog === 'reject' || dialog === 'revise') && (
        <OpConfirm
          title={dialog === 'reject' ? 'Từ chối Lô' : 'Yêu cầu sửa lại Lô'}
          sub={`${b.batchCode} · ${b.title}`}
          confirmLabel={dialog === 'reject' ? 'Từ chối' : 'Gửi yêu cầu sửa'}
          variant={dialog === 'reject' ? 'danger' : 'primary'}
          pending={dialog === 'reject' ? reject.isPending : revise.isPending}
          error={dialog === 'reject' ? reject.error : revise.error}
          disabled={!reason.trim()}
          onConfirm={() => (dialog === 'reject' ? reject : revise).mutate({ reason: reason.trim() })}
          onClose={close}
        >
          <ReasonField value={reason} onChange={setReason} label={dialog === 'reject' ? 'Lý do từ chối' : 'Nội dung cần sửa'} />
          {dialog === 'reject' && <OpNote tone="danger">Lô bị từ chối không mở lại được.</OpNote>}
        </OpConfirm>
      )}

      {dialog === 'submit' && (
        <OpConfirm
          title="Gửi Lô đi duyệt"
          sub={`${b.batchCode} · ${b.title}`}
          confirmLabel="Gửi duyệt"
          pending={submit.isPending}
          error={submit.error}
          onConfirm={() => submit.mutate()}
          onClose={close}
        />
      )}

      {dialog === 'cancel' && (
        <OpConfirm
          title="Huỷ Lô"
          sub={`${b.batchCode} · ${b.title}`}
          confirmLabel="Huỷ Lô"
          variant="danger"
          pending={cancel.isPending}
          error={cancel.error}
          disabled={!reason.trim()}
          onConfirm={() => cancel.mutate({ reason: reason.trim() })}
          onClose={close}
        >
          <ReasonField value={reason} onChange={setReason} label="Lý do huỷ" />
          <OpNote tone="danger">Cọc đặt trước đã trả sẽ được hoàn. Không hoàn tác được.</OpNote>
        </OpConfirm>
      )}
    </OpPanel>
  )
}
