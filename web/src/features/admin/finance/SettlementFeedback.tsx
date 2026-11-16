/* Góp ý của nhà đầu tư trên bảng quyết toán và câu trả lời của Admin (POST /api/admin/settlement-feedback/{id}/answer).
   Đánh dấu "chưa thống nhất" thì bảng vẫn duyệt được, góp ý được ghi công khai là chưa thống nhất. */
import { useState } from 'react'
import { Reply } from 'lucide-react'
import type { AnswerFeedbackRequest, SettlementFeedbackResponse, SettlementResponse } from '../../../shared/api/api.gen'
import { Checkbox, Field, OpBtn, OpConfirm, OpEmpty, OpPanel, StatusBadge, TextArea, formatDateTime, useSend } from '../../../shared/ui/console'

function AnswerDialog({ feedback, onClose }: { feedback: SettlementFeedbackResponse; onClose: () => void }) {
  const [response, setResponse] = useState('')
  const [unresolved, setUnresolved] = useState(false)
  const answer = useSend<SettlementResponse, AnswerFeedbackRequest>('post', `/api/admin/settlement-feedback/${feedback.feedbackId}/answer`, {
    quietError: true,
    success: 'Đã trả lời góp ý.',
    onSuccess: onClose,
  })
  const text = response.trim()
  return (
    <OpConfirm
      wide
      title="Trả lời góp ý"
      sub={feedback.authorName}
      confirmLabel="Gửi trả lời"
      pending={answer.isPending}
      error={answer.error}
      disabled={text.length < 5 || text.length > 1000}
      onClose={onClose}
      onConfirm={() => answer.mutate({ response: text, unresolved })}
    >
      <p className="ab-quote">{feedback.content}</p>
      <Field label="Câu trả lời" required hint="Nêu căn cứ: dữ liệu, giao dịch, chứng từ.">
        <TextArea rows={4} maxLength={1000} value={response} onChange={(e) => setResponse(e.target.value)} />
      </Field>
      <Checkbox checked={unresolved} onChange={setUnresolved}>Hai bên chưa thống nhất (bảng vẫn duyệt được)</Checkbox>
    </OpConfirm>
  )
}

export default function SettlementFeedback({ s }: { s: SettlementResponse }) {
  const [answering, setAnswering] = useState<SettlementFeedbackResponse | null>(null)
  return (
    <OpPanel>
      {s.feedback.length === 0 ? <OpEmpty title="Chưa có góp ý nào" /> : (
        <ul className="op-feed">
          {s.feedback.map((f) => (
            <li key={f.feedbackId}>
              <span className="op-between">
                <b>{f.authorName}</b>
                <StatusBadge kind="feedback" value={f.status} />
              </span>
              <small>{formatDateTime(f.createdAt)}</small>
              <p className="ab-quote">{f.content}</p>
              {f.response && <p className="ab-quote op-muted">Trả lời: {f.response}</p>}
              {f.status === 'Open' && (
                <span><OpBtn sm onClick={() => setAnswering(f)}><Reply size={15} /> Trả lời</OpBtn></span>
              )}
            </li>
          ))}
        </ul>
      )}
      {answering && <AnswerDialog feedback={answering} onClose={() => setAnswering(null)} />}
    </OpPanel>
  )
}
