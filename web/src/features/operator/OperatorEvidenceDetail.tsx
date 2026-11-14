/* /operator/evidence/:id — Một ảnh bằng chứng và giải trình của người nuôi (UC48).
   GET /api/operators/me/evidence/{id}, ảnh ở /api/operators/me/evidence/{id}/image, POST /api/evidence/{id}/explanation { text }.
   Sau khi giải trình ảnh vẫn ở trạng thái gắn cờ cho tới khi Người thẩm định kết luận. */
import { useState } from 'react'
import { useParams } from 'react-router'
import { ArrowLeft, Send } from 'lucide-react'
import type { EvidenceExplanationRequest, OperatorEvidenceItem } from '../../shared/api/api.gen'
import {
  AuthImage, OpAside, OpBack, OpBtn, OpHeading, OpKv, OpMore, OpNote, OpPanel, QueryView, StatusBadge, TextArea, errorMessage, formatDateTime, useGet, useSend,
} from '../../shared/ui/console'
import { verdictLabel } from './opA'

function ExplanationForm({ item }: { item: OperatorEvidenceItem }) {
  const [text, setText] = useState(item.explanation ?? '')
  const explain = useSend<OperatorEvidenceItem, EvidenceExplanationRequest>('post', `/api/evidence/${item.id}/explanation`, { success: 'Đã gửi giải trình.', quietError: true })
  const unchanged = text.trim() === (item.explanation ?? '').trim()
  return (
    <form className="op-form" onSubmit={(e) => { e.preventDefault(); if (text.trim() && !unchanged) explain.mutate({ text: text.trim() }) }}>
      <TextArea rows={5} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Vì sao ảnh bị gắn cờ và bạn đã làm gì" aria-label="Giải trình của người nuôi" />
      {explain.isError && <OpNote tone="danger">{errorMessage(explain.error)}</OpNote>}
      <OpBtn type="submit" full disabled={!text.trim() || unchanged || explain.isPending}><Send size={16} /> {explain.isPending ? 'Đang gửi…' : item.explanation ? 'Gửi lại' : 'Gửi giải trình'}</OpBtn>
    </form>
  )
}

export default function OperatorEvidenceDetail() {
  const { id = '' } = useParams()
  const valid = /^\d+$/.test(id)
  const evidence = useGet<OperatorEvidenceItem>(valid ? `/api/operators/me/evidence/${id}` : null)

  return (
    <>
      <OpHeading
        crumb={<OpBack href="/operator/evidence"><ArrowLeft size={16} /> Bằng chứng</OpBack>}
        title={evidence.data ? `Hộp ${evidence.data.slotCode ?? '—'} · Lô ${evidence.data.batchCode}` : 'Ảnh bằng chứng'}
        action={evidence.data ? <StatusBadge kind="evidence" value={evidence.data.reviewStatus} /> : undefined}
      />
      {!valid ? <OpNote tone="danger">Đường dẫn không đúng.</OpNote> : (
        <QueryView query={evidence}>
          {(e) => (
            <div className="op-split">
              <div>
                <OpPanel>
                  <AuthImage path={`/api/operators/me/evidence/${e.id}/image`} alt={`Ảnh hộp ${e.slotCode ?? ''} của Lô ${e.batchCode}`} />
                  <OpMore label="Thông tin ảnh">
                    <OpKv items={[
                      { label: 'Giờ chụp', value: formatDateTime(e.capturedAt) },
                      { label: 'Giờ máy chủ nhận', value: formatDateTime(e.receivedAt) },
                      { label: 'Vị trí lúc chụp', value: e.latitude !== null && e.longitude !== null ? `${e.latitude}, ${e.longitude}` : null },
                      { label: 'Điểm rủi ro', value: e.riskScore },
                    ]} />
                  </OpMore>
                </OpPanel>
              </div>

              <OpAside>
                {e.latestReview && (
                  <OpNote tone={e.latestReview.verdict === 'Pass' ? 'ok' : e.latestReview.verdict === 'Fail' ? 'danger' : 'info'}>
                    <b>Người thẩm định: {verdictLabel(e.latestReview.verdict)}</b><br />{e.latestReview.note}
                  </OpNote>
                )}
                <b>Giải trình</b>
                {e.canExplain ? <ExplanationForm key={e.explainedAt ?? 'new'} item={e} /> : <span className="rd-muted">{e.explanation ?? 'Ảnh này không cần giải trình.'}</span>}
                {e.explainedAt && <small className="rd-muted">Đã gửi lúc {formatDateTime(e.explainedAt)}</small>}
              </OpAside>
            </div>
          )}
        </QueryView>
      )}
    </>
  )
}
