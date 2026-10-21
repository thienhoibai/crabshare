import { useState, type FormEvent } from 'react'
import { errorMessage } from '../../../shared/api/http'
import { formatDateTime, formatVnd } from '../../../shared/lib/format'
import { SettlementFeedbackList } from '../../../shared/settlement/SettlementFeedbackList'
import { SettlementStatement } from '../../../shared/settlement/SettlementStatement'
import { settlementStatuses, useMySettlements, useSendFeedback, useSettlement } from '../../../shared/settlement/settlementApi'

/**
 * Tab Quyết toán của cổng nhà đầu tư (TH-13, UC35–36): sao kê các lô đã công bố — tổng của lô và đúng dòng của tôi —
 * và góp ý trong hạn. Chỉ ghi số tiền thật, không có lợi suất (BR-49).
 */
export default function InvestorSettlements() {
  const list = useMySettlements()
  const [picked, setPicked] = useState<number | null>(null)
  const selected = picked ?? list.data?.find(s => s.feedbackOpen)?.settlementId ?? list.data?.[0]?.settlementId ?? null
  const detail = useSettlement(selected)
  const send = useSendFeedback()
  const [content, setContent] = useState('')
  const s = detail.data
  const open = !!s && (s.status === 'Proposed' || s.status === 'Disputed') && !!s.feedbackDeadline && Date.parse(s.feedbackDeadline) > Date.now()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!s || send.isPending) return
    try { await send.mutateAsync({ id: s.settlementId, content }); setContent('') } catch { /* hiện lỗi bên dưới */ }
  }

  return (
    <div className="iv-contracts-grid">
      <section className="iv-card">
        <h3 className="rd-h3">Bảng quyết toán</h3>
        {list.isPending && <p className="rd-muted">Đang tải…</p>}
        {list.isError && <p className="st-error">{errorMessage(list.error)}</p>}
        {list.data?.length === 0 && <p className="rd-muted">Chưa có lô nào công bố quyết toán.</p>}
        <ul className="iv-contracts">
          {list.data?.map(x => (
            <li key={x.settlementId}>
              <button type="button" className={x.settlementId === selected ? 'is-on' : ''} onClick={() => { setPicked(x.settlementId); send.reset() }}>
                <b>{x.batchCode}{x.myNetPayout !== null && ` · nhận ${formatVnd(x.myNetPayout)}`}</b>
                <small>{settlementStatuses[x.status]}</small>
                {x.feedbackOpen && <em>Góp ý tới {formatDateTime(x.feedbackDeadline)}</em>}
              </button>
            </li>
          ))}
        </ul>
      </section>
      {s && (
        <section className="iv-card">
          <h3 className="rd-h3">{s.batchTitle}</h3>
          <SettlementStatement s={s} />
          <h3 className="rd-h3">Góp ý của tôi</h3>
          <SettlementFeedbackList s={s} />
          {open ? (
            <form className="st-feedback__form" onSubmit={e => void submit(e)}>
              <textarea required minLength={10} maxLength={1000} value={content} onChange={e => setContent(e.target.value)} aria-label="Nội dung góp ý"
                placeholder="Nêu căn cứ: giao dịch bán hàng chưa được ghi nhận, chứng từ chi phí không hợp lệ, hoặc khoản chia tính sai" />
              {send.isError && <span className="st-error" role="alert">{errorMessage(send.error)}</span>}
              <button className="rd-btn rd-btn--primary" disabled={send.isPending}>{send.isPending ? 'Đang gửi…' : 'Gửi góp ý'}</button>
              <span className="st-note">Hạn góp ý: {formatDateTime(s.feedbackDeadline)}. Hết hạn mà không còn góp ý treo thì bảng được chốt và chi trả.</span>
            </form>
          ) : <p className="st-note">{s.status === 'Proposed' || s.status === 'Disputed' ? 'Đã hết hạn góp ý.' : 'Bảng đã chốt, không nhận góp ý nữa.'}</p>}
        </section>
      )}
    </div>
  )
}
