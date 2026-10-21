import { useState } from 'react'
import { errorMessage } from '../api/http'
import { formatDateTime } from '../lib/format'
import { useAnswerFeedback, type Settlement } from './settlementApi'

const statusLabel = { Open: 'Chờ trả lời', Answered: 'Đã trả lời', Withdrawn: 'Đã rút', Unresolved: 'Chưa thống nhất' } as const

/** Góp ý của nhà đầu tư trên bảng quyết toán (TL-14 Bước 4). `canAnswer`: admin trả lời ngay tại chỗ. */
export function SettlementFeedbackList({ s, canAnswer = false }: { s: Settlement; canAnswer?: boolean }) {
  const answer = useAnswerFeedback()
  const [openFor, setOpenFor] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [unresolved, setUnresolved] = useState(false)
  if (s.feedback.length === 0) return <p className="st-note">Chưa có góp ý nào.</p>
  return (
    <ul className="st-feedback">
      {s.feedback.map(f => (
        <li key={f.feedbackId}>
          <div className="st-feedback__head"><b>{f.authorName}{f.isMine && ' (bạn)'}</b><span>{formatDateTime(f.createdAt)} · {statusLabel[f.status]}</span></div>
          <p>{f.content}</p>
          {f.response && <p className="st-feedback__reply">Trả lời: {f.response}</p>}
          {canAnswer && f.status === 'Open' && (openFor === f.feedbackId
            ? <form className="st-feedback__form" onSubmit={e => { e.preventDefault(); answer.mutate({ feedbackId: f.feedbackId, response: text, unresolved }, { onSuccess: () => { setOpenFor(null); setText('') } }) }}>
                <textarea required minLength={5} maxLength={1000} value={text} onChange={e => setText(e.target.value)} aria-label="Nội dung trả lời" placeholder="Căn cứ dữ liệu, giao dịch hoặc chứng từ" />
                <label><input type="checkbox" checked={unresolved} onChange={e => setUnresolved(e.target.checked)} /> Hai bên chưa thống nhất (vẫn chốt được, kèm ghi chú công khai)</label>
                {answer.isError && <span className="st-error" role="alert">{errorMessage(answer.error)}</span>}
                <div><button disabled={answer.isPending}>{answer.isPending ? 'Đang gửi…' : 'Gửi trả lời'}</button> <button type="button" onClick={() => setOpenFor(null)}>Huỷ</button></div>
              </form>
            : <button type="button" className="st-link" onClick={() => { setOpenFor(f.feedbackId); setText(''); setUnresolved(false); answer.reset() }}>Trả lời</button>)}
        </li>
      ))}
    </ul>
  )
}
