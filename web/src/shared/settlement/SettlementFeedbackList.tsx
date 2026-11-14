import { useState } from 'react'
import type { SettlementResponse } from '../api/api.gen'
import { errorMessage } from '../api/http'
import { formatDateTime } from '../lib/format'
import { Checkbox, Field, OpBtn, OpNote, StatusBadge, TextArea } from '../ui/console'
import { useAnswerFeedback } from './settlementApi'

/**
 * Góp ý của nhà đầu tư trên bảng quyết toán. `canAnswer`: Admin trả lời ngay tại chỗ; đánh dấu "chưa thống nhất" thì bảng vẫn chốt được
 * kèm ghi chú công khai. Không có khung bao: đặt trong OpPanel.
 */
export function SettlementFeedbackList({ s, canAnswer = false }: { s: SettlementResponse; canAnswer?: boolean }) {
  const answer = useAnswerFeedback()
  const [openFor, setOpenFor] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [unresolved, setUnresolved] = useState(false)

  if (s.feedback.length === 0) return <p className="rd-muted">Chưa có góp ý nào.</p>

  const start = (feedbackId: number) => {
    setOpenFor(feedbackId)
    setText('')
    setUnresolved(false)
    answer.reset()
  }

  return (
    <div className="op-stack">
      {s.feedback.map((f) => (
        <div key={f.feedbackId} className="op-subform">
          <div className="op-between is-wide">
            <b>{f.authorName}{f.isMine ? ' (bạn)' : ''}</b>
            <span className="op-inline"><small className="rd-muted">{formatDateTime(f.createdAt)}</small><StatusBadge kind="feedback" value={f.status} /></span>
          </div>
          <p className="is-wide" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{f.content}</p>
          {f.response && (
            <OpNote tone={f.status === 'Unresolved' ? 'danger' : 'ok'} className="is-wide">
              <b>Trả lời{f.respondedAt ? ` lúc ${formatDateTime(f.respondedAt)}` : ''}:</b> {f.response}
            </OpNote>
          )}
          {canAnswer && f.status === 'Open' && (openFor === f.feedbackId ? (
            <form
              className="op-form is-wide"
              onSubmit={(e) => {
                e.preventDefault()
                if (text.trim().length < 5 || answer.isPending) return
                answer.mutate({ feedbackId: f.feedbackId, response: text.trim(), unresolved }, { onSuccess: () => setOpenFor(null) })
              }}
            >
              <Field label="Nội dung trả lời" hint="Từ 5 ký tự, nêu căn cứ.">
                <TextArea value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
              </Field>
              <Checkbox checked={unresolved} onChange={setUnresolved}>Hai bên chưa thống nhất</Checkbox>
              {answer.isError && <OpNote tone="danger">{errorMessage(answer.error)}</OpNote>}
              <div className="op-formfoot">
                <OpBtn type="button" variant="ghost" sm onClick={() => setOpenFor(null)}>Đóng</OpBtn>
                <OpBtn type="submit" sm disabled={text.trim().length < 5 || answer.isPending}>{answer.isPending ? 'Đang gửi…' : 'Gửi trả lời'}</OpBtn>
              </div>
            </form>
          ) : (
            <div className="is-wide"><OpBtn variant="ghost" sm onClick={() => start(f.feedbackId)}>Trả lời góp ý</OpBtn></div>
          ))}
        </div>
      ))}
    </div>
  )
}
