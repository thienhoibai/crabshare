/* Các mốc giải ngân của một Lô xếp thành chuỗi bước: mốc đã chi, mốc kế tiếp kèm điều còn thiếu, và nút xin giải ngân (BR-144, BR-145).
   Dùng ở trang /operator/disbursements và ở mục "Giải ngân và quyết toán" của trang làm việc Lô. */
import { useState } from 'react'
import { HandCoins } from 'lucide-react'
import { Money, OpBtn, OpConfirm, OpFlow, formatDate, formatDateTime, formatVnd, label, useSend, type FlowStep } from '../../../shared/ui/console'
import { dueText, enc, type MilestoneTranche } from './common'

const DONE = ['Released']
const DEAD = ['Blocked', 'Stopped']

/** Mốc kế tiếp cần làm: mốc đầu tiên chưa giải ngân và chưa bị dừng. */
export const nextMilestone = (rows: MilestoneTranche[]) => rows.find((t) => !DONE.includes(t.status) && !DEAD.includes(t.status))

/** Mốc đang có việc cho người nuôi: xin được ngay hoặc phải giải trình. */
export const needsAction = (t: MilestoneTranche) => t.canRequest || t.status === 'NeedsExplanation'

function step(t: MilestoneTranche, isNext: boolean, name?: string): FlowStep {
  const title = `Mốc ${t.trancheNo}${name ? ` · ${name}` : ''} · ${formatVnd(t.plannedAmount)}`
  if (t.status === 'Released') return { title, sub: `Đã giải ngân ${formatDate(t.releasedAt)}`, state: 'done' }
  if (DEAD.includes(t.status)) return { title, sub: label('tranche', t.status), state: 'bad' }
  if (t.status === 'Requested') return { title, sub: 'Chờ Admin duyệt', state: 'now' }
  if (t.status === 'NeedsExplanation') {
    const due = dueText(t.explanationDeadline)
    return { title, sub: `Cần giải trình trước ${formatDateTime(t.explanationDeadline)}${due ? ` (${due.text})` : ''}${t.blockedReason ? `. ${t.blockedReason}` : ''}`, state: 'bad' }
  }
  if (!isNext) return { title, state: 'todo' }
  return { title, sub: t.canRequest ? 'Đủ điều kiện xin giải ngân' : `Còn thiếu: ${t.blockedReason ?? t.unlockCondition}`, state: 'now' }
}

export function MilestoneFlow({ rows, owner, names }: {
  rows: MilestoneTranche[]
  /** Chỉ chủ hộ nuôi xin giải ngân được. */
  owner: boolean
  /** Tên mốc theo số thứ tự, lấy từ kế hoạch chi phí của Lô (nếu có). */
  names?: Record<number, string>
}) {
  const [target, setTarget] = useState<MilestoneTranche | null>(null)
  const request = useSend<MilestoneTranche, MilestoneTranche>(
    'post',
    (t) => `/api/batches/${enc(t.batchCode)}/tranches/${t.trancheNo}/request`,
    { success: (t) => `Đã gửi yêu cầu giải ngân mốc ${t.trancheNo}.`, quietError: true, onSuccess: () => setTarget(null) },
  )
  const next = nextMilestone(rows)
  const ready = rows.find((t) => t.canRequest)

  return (
    <>
      <OpFlow steps={rows.map((t) => step(t, t === next, names?.[t.trancheNo]))} />
      {ready && (owner
        ? <div><OpBtn onClick={() => { request.reset(); setTarget(ready) }}><HandCoins size={17} /> {ready.status === 'NeedsExplanation' ? 'Xin lại' : 'Xin giải ngân'} mốc {ready.trancheNo}</OpBtn></div>
        : <small className="rd-muted">Chủ hộ nuôi mới gửi được yêu cầu giải ngân.</small>)}

      {target && (
        <OpConfirm
          title={`Xin giải ngân mốc ${target.trancheNo}`}
          sub={`Lô ${target.batchCode}`}
          confirmLabel="Gửi yêu cầu"
          pending={request.isPending}
          error={request.error}
          onConfirm={() => request.mutate(target)}
          onClose={() => setTarget(null)}
        >
          <p>Gửi Admin duyệt chi <b><Money value={target.plannedAmount} /></b> về tài khoản nhận tiền của hộ nuôi.</p>
        </OpConfirm>
      )}
    </>
  )
}
