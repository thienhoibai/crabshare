/* Cột phải của trang quyết toán: bảng đang ở bước nào (OpFlow) và đúng một nút cho việc kế tiếp
   (công bố → trả lời góp ý → duyệt → gửi lệnh chi). Tính lại và công cụ khi chạy dev nằm trong "Thao tác khác".
   Quy tắc: Lô P phải công bố, hết hạn góp ý và không còn góp ý mở mới duyệt được (BR-202); duyệt xong số liệu bị khoá (BR-206);
   máy chủ chỉ duyệt khi số dư tài khoản của Lô khớp tổng cần chi (BR-205); mọi lệnh chi thành công thì Lô đóng (BR-209). */
import { useState } from 'react'
import { BadgeCheck, Calculator, Megaphone, MessagesSquare, Send, TimerOff } from 'lucide-react'
import type { CalculateSettlementRequest, ProposeSettlementRequest, SettlementResponse } from '../../../shared/api/api.gen'
import {
  Field, NumberInput, OpAside, OpBtn, OpConfirm, OpDl, OpFlow, OpMore, OpNote,
  formatDateTime, formatVnd, useSend, type FlowStep, type KvItem,
} from '../../../shared/ui/console'
import { demoTools } from '../../../shared/demoTools'
import { isPast } from '../quality/shared'
import { isLocked, operatorPayout, requiredPayout } from './financeModel'

type Action = 'recalculate' | 'propose' | 'approve' | 'send'

/** Các khoản sẽ chi khi duyệt, theo phương thức của Lô. */
function payoutItems(s: SettlementResponse): (KvItem & { total?: boolean })[] {
  const b = s.breakdown
  if (b.mode === 'P') {
    return [
      { label: 'Phí nền tảng', value: formatVnd(b.platformFee) },
      { label: 'Người nuôi', value: formatVnd(operatorPayout(s)) },
      { label: `${s.investorCount} nhà đầu tư`, value: formatVnd(s.totalNetPayout) },
      { label: 'Tổng cần chi', value: formatVnd(requiredPayout(s)), total: true },
    ]
  }
  if (b.mode === 'A') {
    return [
      { label: 'Hoa hồng của nền tảng', value: formatVnd(b.commissionAmount) },
      { label: 'Trả nhà cung cấp', value: formatVnd(b.supplierPayout) },
      { label: 'Tổng cần chi', value: formatVnd(requiredPayout(s)), total: true },
    ]
  }
  return []
}

export default function SettlementActions({ s, onShowFeedback }: { s: SettlementResponse; onShowFeedback: () => void }) {
  const [action, setAction] = useState<Action | null>(null)
  const [days, setDays] = useState<number | null>(7)
  const close = () => setAction(null)
  const base = `/api/admin/settlements/${s.settlementId}`

  const recalculate = useSend<SettlementResponse, CalculateSettlementRequest>('post', `/api/admin/batches/${encodeURIComponent(s.batchCode)}/settlements`, {
    quietError: true, success: 'Đã tính lại bảng quyết toán.', onSuccess: close,
  })
  const propose = useSend<SettlementResponse, ProposeSettlementRequest>('post', `${base}/propose`, { quietError: true, success: 'Đã công bố bảng quyết toán.', onSuccess: close })
  const approve = useSend<SettlementResponse, void>('post', `${base}/approve`, { quietError: true, success: 'Đã duyệt bảng quyết toán.', onSuccess: close })
  const send = useSend<SettlementResponse, void>('post', `${base}/send-payouts`, {
    quietError: true,
    success: (res) => (res.status === 'Closed' ? 'Đã chi xong mọi lệnh. Lô đã đóng.' : 'Đã gửi. Lệnh bị từ chối thì gửi lại ở mục Lệnh chi.'),
    onSuccess: close,
  })
  const endWindow = useSend<SettlementResponse, void>('post', `/api/dev/settlements/${s.settlementId}/end-feedback-window`, { success: 'Đã kết thúc hạn góp ý.' })

  const mode = s.breakdown.mode
  const isP = mode === 'P'
  const locked = isLocked(s.status)
  const published = s.status === 'Proposed' || s.status === 'Disputed'
  const windowOver = isPast(s.feedbackDeadline)
  const openFeedback = s.feedback.filter((f) => f.status === 'Open').length
  const paid = s.status === 'PaidOut' || s.status === 'Closed'
  const daysOk = days !== null && days >= 7 && days <= 14

  // Đúng một việc kế tiếp; null là đang chờ hết hạn góp ý hoặc đã xong.
  const next: Action | 'feedback' | null = locked
    ? (s.status === 'Approved' && mode !== 'T' ? 'send' : null)
    : !isP ? 'approve'
      : s.status === 'Draft' ? 'propose'
        : openFeedback > 0 ? 'feedback'
          : windowOver ? 'approve' : null

  const steps: FlowStep[] = [
    { title: 'Tính bảng nháp', sub: `Lần tính ${s.revisionNo}`, state: 'done' },
    ...(isP ? [{
      title: 'Công bố, lấy góp ý',
      sub: openFeedback > 0 ? `${openFeedback} góp ý chờ trả lời` : s.feedbackDeadline ? `Hạn góp ý ${formatDateTime(s.feedbackDeadline)}` : undefined,
      state: locked || (published && windowOver && openFeedback === 0) ? 'done' : openFeedback > 0 ? 'bad' : 'now',
    } satisfies FlowStep] : []),
    { title: 'Duyệt', sub: s.approvedAt ? formatDateTime(s.approvedAt) : undefined, state: locked ? 'done' : next === 'approve' ? 'now' : 'todo' },
    ...(mode !== 'T' ? [{ title: 'Gửi lệnh chi', state: paid ? 'done' : next === 'send' ? 'now' : 'todo' } satisfies FlowStep] : []),
    { title: 'Lô đóng', state: s.status === 'Closed' ? 'done' : 'todo' },
  ]
  const devTool = demoTools && published && !windowOver

  // Các hộp xác nhận nằm ngoài cột dính để phủ kín cả màn hình.
  return (
    <>
      <OpAside>
        <OpFlow steps={steps} />
        {next === 'propose' && <OpBtn full onClick={() => { propose.reset(); setAction('propose') }}><Megaphone size={17} /> Công bố bảng</OpBtn>}
        {next === 'feedback' && <OpBtn full onClick={onShowFeedback}><MessagesSquare size={17} /> Trả lời góp ý</OpBtn>}
        {next === 'approve' && <OpBtn full onClick={() => { approve.reset(); setAction('approve') }}><BadgeCheck size={17} /> Duyệt quyết toán</OpBtn>}
        {next === 'send' && <OpBtn full onClick={() => { send.reset(); setAction('send') }}><Send size={17} /> Gửi lệnh chi trả</OpBtn>}
        {(!locked || devTool) && (
          <OpMore label="Thao tác khác">
            {!locked && <OpBtn full variant="ghost" onClick={() => { recalculate.reset(); setAction('recalculate') }}><Calculator size={17} /> Tính lại</OpBtn>}
            {devTool && (
              <OpBtn full variant="ghost" disabled={endWindow.isPending} onClick={() => endWindow.mutate()}>
                <TimerOff size={17} /> Kết thúc hạn góp ý (dev)
              </OpBtn>
            )}
          </OpMore>
        )}
      </OpAside>

      {action === 'recalculate' && (
        <OpConfirm
          title="Tính lại bảng quyết toán"
          sub={`Lô ${s.batchCode}`}
          confirmLabel="Tính lại"
          pending={recalculate.isPending}
          error={recalculate.error}
          onClose={close}
          onConfirm={() => recalculate.mutate({ taxWithholdingPct: 0 })}
        >
          {published
            ? <OpNote tone="danger">Bảng trở về bản nháp và phải công bố lại.</OpNote>
            : <p>Tính lại từ dữ liệu hiện có của Lô.</p>}
        </OpConfirm>
      )}
      {action === 'propose' && (
        <OpConfirm
          title="Công bố bảng quyết toán"
          sub="Nhà đầu tư và người nuôi sẽ xem được bảng."
          confirmLabel="Công bố"
          pending={propose.isPending}
          error={propose.error}
          disabled={!daysOk}
          onClose={close}
          onConfirm={() => propose.mutate({ feedbackDays: days ?? 7 })}
        >
          <Field label="Số ngày nhận góp ý" required error={daysOk ? undefined : 'Từ 7 đến 14 ngày.'}>
            <NumberInput value={days} onChange={setDays} unit="ngày" />
          </Field>
        </OpConfirm>
      )}
      {action === 'approve' && (
        <OpConfirm
          title="Duyệt bảng quyết toán"
          sub={`Lô ${s.batchCode} · lần tính ${s.revisionNo}`}
          confirmLabel="Duyệt và khoá số liệu"
          pending={approve.isPending}
          error={approve.error}
          onClose={close}
          onConfirm={() => approve.mutate()}
        >
          {mode !== 'T' && <OpDl items={payoutItems(s)} />}
          <OpNote tone="danger">
            Duyệt xong không tính lại được.{mode === 'T' ? ' Lô T không có lệnh chi nên đóng ngay.' : ''}
          </OpNote>
        </OpConfirm>
      )}
      {action === 'send' && (
        <OpConfirm
          title="Gửi lệnh chi trả quyết toán"
          sub="Mọi lệnh thành công thì Lô đóng."
          confirmLabel="Gửi mọi lệnh còn chờ"
          pending={send.isPending}
          error={send.error}
          onClose={close}
          onConfirm={() => send.mutate()}
        >
          <OpDl items={payoutItems(s)} />
        </OpConfirm>
      )}
    </>
  )
}
