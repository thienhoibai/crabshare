/* /admin/evidence/:id — Hồ sơ một bằng chứng và phán quyết của người thẩm định (GET /api/review/evidence/{id}, POST …/verdict).
   Ảnh và giải trình ở giữa, ba nút phán quyết ở cột phải; kết quả mô hình, lịch sử và số liệu kỹ thuật gấp lại. */
import { useState } from 'react'
import { useParams } from 'react-router'
import { ArrowLeft, CheckCircle2, MessageSquarePlus, XCircle } from 'lucide-react'
import type { EvidenceVerdictRequest, ReviewEvidenceDetail } from '../../../shared/api/api.gen'
import {
  AuthImage, Field, OpAside, OpBack, OpBtn, OpConfirm, OpDl, OpEmpty, OpHeading, OpMore, OpNote, OpPanel, OpTable, QueryView, StatusBadge, TextArea,
  formatDateTime, useGet, useSend,
} from '../../../shared/ui/console'
import { extraLabel, formatNumber, riskText } from './shared'

type Verdict = 'Pass' | 'Fail' | 'NeedMoreEvidence'

const VERDICTS: Record<Verdict, { title: string; effect: string; variant: 'primary' | 'ink' | 'danger' }> = {
  Pass: { title: 'Chấp nhận bằng chứng', effect: 'Bằng chứng được tính là hợp lệ cho Lô.', variant: 'primary' },
  Fail: { title: 'Không chấp nhận bằng chứng', effect: 'Bằng chứng không được tính cho Lô.', variant: 'danger' },
  NeedMoreEvidence: { title: 'Yêu cầu bổ sung', effect: 'Bằng chứng vẫn bị gắn cờ, chờ người nuôi giải trình thêm.', variant: 'primary' },
}

const crumb = <OpBack href="/admin/evidence"><ArrowLeft size={16} /> Thẩm định bằng chứng</OpBack>

function VerdictDialog({ id, verdict, onClose }: { id: number; verdict: Verdict; onClose: () => void }) {
  const [note, setNote] = useState('')
  const send = useSend<ReviewEvidenceDetail, EvidenceVerdictRequest>('post', `/api/review/evidence/${id}/verdict`, {
    quietError: true,
    success: 'Đã lưu phán quyết.',
    onSuccess: onClose,
  })
  const spec = VERDICTS[verdict]
  return (
    <OpConfirm
      title={spec.title}
      sub={spec.effect}
      confirmLabel="Lưu phán quyết"
      variant={spec.variant}
      pending={send.isPending}
      error={send.error}
      disabled={!note.trim()}
      onClose={onClose}
      onConfirm={() => send.mutate({ verdict, note: note.trim() })}
    >
      <Field label="Ghi chú thẩm định" required hint="Nêu căn cứ. Người nuôi đọc được.">
        <TextArea rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </OpConfirm>
  )
}

export default function EvidenceDetailPage() {
  const { id = '' } = useParams()
  const valid = /^\d+$/.test(id) && Number(id) > 0
  const detail = useGet<ReviewEvidenceDetail>(valid ? `/api/review/evidence/${id}` : null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)

  if (!valid) {
    return (
      <>
        <OpHeading crumb={crumb} eyebrow="Chất lượng" title="Không tìm thấy bằng chứng" />
        <OpEmpty title="Mã bằng chứng không hợp lệ" />
      </>
    )
  }

  return (
    <QueryView query={detail}>
      {(d) => (
        <>
          <OpHeading
            crumb={crumb}
            eyebrow={`${d.evidence.batchCode} · ${d.evidence.farmName}`}
            title={`Bằng chứng #${d.evidence.id}`}
            action={<StatusBadge kind="evidence" value={d.evidence.reviewStatus} />}
          />
          <div className="op-split">
            <div>
              <OpPanel>
                {d.evidence.mediaType === 'Photo'
                  ? <AuthImage path={`/api/review/evidence/${d.evidence.id}/image`} alt={`Ảnh bằng chứng số ${d.evidence.id}`} />
                  : <p className="op-muted">Bằng chứng này là {extraLabel('mediaType', d.evidence.mediaType).toLowerCase()}, không có ảnh.</p>}
                {d.detections.length > 0 && (
                  <OpMore label="Kết quả nhận diện của mô hình" count={d.detections.length}>
                    <OpTable
                      rows={d.detections}
                      rowKey={(_, i) => i}
                      columns={[
                        { key: 'crab', header: 'Kết quả', cell: (x) => (x.crabDetected === null ? 'Không xác định' : x.crabDetected ? 'Thấy cua' : 'Không thấy cua') },
                        { key: 'confidence', header: 'Độ tin cậy', num: true, cell: (x) => (x.confidence === null ? '—' : `${formatNumber(Math.round(x.confidence * 1000) / 10)}%`) },
                        { key: 'model', header: 'Mô hình', cell: (x) => x.modelVersion },
                        { key: 'at', header: 'Chạy lúc', cell: (x) => formatDateTime(x.detectedAt) },
                      ]}
                    />
                  </OpMore>
                )}
              </OpPanel>
              {d.explanation && (
                <OpPanel title="Giải trình của người nuôi">
                  <p className="ab-quote">{d.explanation}</p>
                  {d.explainedAt && <small className="op-muted">{formatDateTime(d.explainedAt)}</small>}
                </OpPanel>
              )}
              {d.reviews.length > 0 && (
                <OpPanel title="Phán quyết đã có">
                  <ul className="op-feed">
                    {d.reviews.map((r) => (
                      <li key={r.id}>
                        <b>{extraLabel('verdict', r.verdict)} · {r.reviewerName}</b>
                        <small>{formatDateTime(r.reviewedAt)}</small>
                        {r.note && <p className="ab-quote">{r.note}</p>}
                      </li>
                    ))}
                  </ul>
                </OpPanel>
              )}
            </div>
            <OpAside>
              {d.canReview ? (
                <>
                  <OpBtn full onClick={() => setVerdict('Pass')}><CheckCircle2 size={17} /> Chấp nhận</OpBtn>
                  <OpBtn full variant="ghost" onClick={() => setVerdict('NeedMoreEvidence')}><MessageSquarePlus size={17} /> Yêu cầu bổ sung</OpBtn>
                  <OpBtn full variant="danger" onClick={() => setVerdict('Fail')}><XCircle size={17} /> Không chấp nhận</OpBtn>
                </>
              ) : d.evidence.reviewStatus === 'Flagged' && (
                <OpNote>Đang chờ người nuôi giải trình thêm.</OpNote>
              )}
              <OpDl items={[
                { label: 'Hộp', value: d.evidence.slotCode ?? '—' },
                { label: 'Giờ chụp', value: d.capturedAt ? formatDateTime(d.capturedAt) : 'Không có' },
                { label: 'Điểm rủi ro', value: riskText(d.evidence.riskScore) },
                { label: 'Giải trình', value: d.explanation ? 'Đã gửi' : 'Chưa có' },
              ]} />
              <OpMore label="Chi tiết kỹ thuật">
                <OpDl items={[
                  { label: 'Nguồn', value: extraLabel('evidenceSource', d.source) },
                  { label: 'Máy chủ nhận', value: formatDateTime(d.evidence.receivedAt) },
                  { label: 'Vị trí', value: d.latitude === null || d.longitude === null ? 'Không có' : `${d.latitude}, ${d.longitude}` },
                ]} />
                <small className="op-muted ab-wrap">SHA-256: <span className="op-mono">{d.sha256}</span></small>
                {d.perceptualHash && <small className="op-muted ab-wrap">Mã băm cảm nhận: <span className="op-mono">{d.perceptualHash}</span></small>}
              </OpMore>
            </OpAside>
          </div>
          {verdict && <VerdictDialog id={d.evidence.id} verdict={verdict} onClose={() => setVerdict(null)} />}
        </>
      )}
    </QueryView>
  )
}
