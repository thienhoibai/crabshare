/* /nha-dau-tu/quyet-toan/:id — Sao kê quyết toán của một Lô (GET /api/settlements/{id}): bốn số của tôi ở đầu, rồi bảng của Lô, rồi góp ý của tôi.
   Góp ý trong hạn qua POST /api/settlements/{id}/feedback { content } (10 đến 1.000 ký tự, kèm căn cứ); gửi xong bảng chuyển sang chờ trả lời. */
import { useState } from 'react'
import { useParams } from 'react-router'
import { ArrowLeft, MessageSquarePlus } from 'lucide-react'
import type { SettlementFeedbackRequest, SettlementResponse } from '../../shared/api/api.gen'
import { SettlementFeedbackList } from '../../shared/settlement/SettlementFeedbackList'
import { SettlementStatement } from '../../shared/settlement/SettlementStatement'
import {
  Field, OpBack, OpBadge, OpBtn, OpConfirm, OpFacts, OpHeading, OpNote, OpPanel, QueryView, StatusBadge, TextArea, formatDateTime, formatVnd, label,
  useGet, useSend,
} from '../../shared/ui/console'

export default function SettlementDetailPage() {
  const { id = '' } = useParams()
  const settlement = useGet<SettlementResponse>(/^\d+$/.test(id) ? `/api/settlements/${id}` : null, undefined, { retry: false })
  const [writing, setWriting] = useState(false)
  const [content, setContent] = useState('')
  const send = useSend<SettlementResponse, SettlementFeedbackRequest>('post', `/api/settlements/${id}/feedback`, {
    success: 'Đã gửi góp ý.',
    quietError: true,
    onSuccess: () => { setWriting(false); setContent('') },
  })

  if (!/^\d+$/.test(id)) return <OpNote tone="danger">Đường dẫn bảng quyết toán không hợp lệ.</OpNote>

  return (
    <QueryView query={settlement}>
      {(s) => {
        const mine = s.lines.find((l) => l.isMine)
        const inWindow = (s.status === 'Proposed' || s.status === 'Disputed') && !!s.feedbackDeadline && Date.parse(s.feedbackDeadline) > Date.now()
        return (
          <>
            <OpHeading
              crumb={<OpBack href="/nha-dau-tu/quyet-toan"><ArrowLeft size={16} /> Quyết toán</OpBack>}
              eyebrow={`${s.batchCode} · lần tính ${s.revisionNo}`}
              title={s.batchTitle}
              action={
                <>
                  {inWindow && <OpBadge tone="gold">Góp ý tới {formatDateTime(s.feedbackDeadline)}</OpBadge>}
                  <StatusBadge kind="settlement" value={s.status} />
                </>
              }
            />

            {mine && (
              <OpFacts items={[
                { label: 'Vốn hoàn', value: formatVnd(mine.capitalReturn) },
                { label: 'Phần chia', value: formatVnd(mine.profitShare), tone: mine.profitShare < 0 ? 'danger' : undefined },
                { label: 'Tôi thực nhận', value: formatVnd(mine.netPayout), tone: 'ok' },
                { label: 'Chi trả', value: mine.payoutStatus ? label('instruction', mine.payoutStatus) : 'Chưa chi' },
              ]} />
            )}

            <OpPanel title="Bảng quyết toán của Lô">
              <SettlementStatement s={s} />
            </OpPanel>

            {(inWindow || s.feedback.length > 0) && (
              <OpPanel
                title="Góp ý của tôi"
                action={inWindow ? <OpBtn sm onClick={() => { send.reset(); setWriting(true) }}><MessageSquarePlus size={15} /> Gửi góp ý</OpBtn> : undefined}
              >
                <SettlementFeedbackList s={s} />
              </OpPanel>
            )}

            {writing && (
              <OpConfirm
                title="Gửi góp ý"
                sub={`Lô ${s.batchCode} · lần tính ${s.revisionNo}`}
                confirmLabel="Gửi góp ý"
                pending={send.isPending}
                error={send.error}
                disabled={content.trim().length < 10}
                onConfirm={() => send.mutate({ content: content.trim() })}
                onClose={() => setWriting(false)}
                wide
              >
                <Field label="Nội dung" required hint="Từ 10 ký tự, nêu rõ căn cứ.">
                  <TextArea rows={5} maxLength={1000} value={content} onChange={(e) => setContent(e.target.value)} />
                </Field>
                <p className="rd-muted">Bảng chưa được duyệt và chưa chi trả cho tới khi góp ý được trả lời.</p>
              </OpConfirm>
            )}
          </>
        )
      }}
    </QueryView>
  )
}
