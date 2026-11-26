import type { SessionMeasurementsResponse, SessionResponse } from '../../../shared/api/api.gen'
import { formatDateTime, label } from '../../../shared/ui/console'
import { StationResultEvidence } from './StationResultEvidence'

const gradeName = (value: string | null) => value == null ? 'Chưa có' :
  ({ SPECIAL: 'Đặc cấp', G1: 'Cấp 1', BELOW: 'Dưới chuẩn', OUT: 'Ngoài quy cách' }[value] ?? value)
const number = (value: number | null | undefined, digits = 2) =>
  value == null ? '—' : value.toLocaleString('vi-VN', { maximumFractionDigits: digits })

export function StationGrading({ session, activeOpen, data, error, onRetry, onDetails, inPopup = false }: {
  session?: SessionResponse
  activeOpen?: SessionResponse
  data?: SessionMeasurementsResponse
  error: boolean
  onRetry: () => void
  onDetails: () => void
  inPopup?: boolean
}) {
  // Keep every result tied to its saved session, including during query changes.
  const saved = data?.session.sessionNo === session?.sessionNo && data?.session.crabCode === session?.crabCode
    && data?.session.batchCode === session?.batchCode ? data : undefined
  const candidate = saved?.decision
  const decision = candidate?.sessionNo === session?.sessionNo && candidate?.crabCode === session?.crabCode
    && candidate?.batchCode === session?.batchCode ? candidate : undefined
  const previous = activeOpen && activeOpen.sessionNo !== session?.sessionNo
  const approved = decision?.status === 'Approved' && decision.isCurrent
  const held = !!decision && (decision.status === 'Hold' || decision.holdReasons.length > 0)
  const state = !session ? 'Chờ lượt đo' : error ? 'Không tải được kết quả' : !saved ? 'Đang tải kết quả' :
    !decision ? 'Chưa có đề xuất' : !decision.isCurrent ? 'Kết quả lịch sử' : approved ? 'QC đã duyệt' :
    decision.status === 'Rejected' ? 'QC đã loại' : held ? 'Cần kiểm tra lại' : 'Đề xuất · Chờ QC'
  const blocked = decision?.holdReasons.some(r => ['ImageQuality', 'LowConfidence', 'CaliperRequired'].includes(r))
  const proposed = decision?.isCurrent && (decision.status === 'Draft' || decision.status === 'Hold')
    && !blocked && !decision.proposedSensory && decision.proposedSize !== 'OUT' ? decision.proposedGrade : null

  return (
    <section className={inPopup ? 'ga-grading ga-grading--popup' : 'ga-card ga-grading'}
      aria-label="Đánh giá phân hạng cua" aria-busy={!!session && !saved && !error}>
      <div className="ga-grading-head">
        <h2>Đánh giá phân hạng cua</h2>
        <span className={`ga-tag ${approved ? 'ga-tag--good' : ''}`}>{state}</span>
      </div>
      {session ? <>
        {!inPopup && <p className="ga-grading-identity"><strong>{session.gradeAiTag ?? session.crabCode}</strong> · Lô {session.batchCode}
          <br /><small>Lượt {session.sessionNo} · {formatDateTime(session.capturedAt ?? session.openedAt)}</small></p>}
        {previous && <p className="ga-grading-notice">Đây là kết quả lượt trước. Lượt đang mở: {activeOpen.gradeAiTag ?? activeOpen.crabCode}. Kết quả mới xuất hiện khi đã nhận số đo.</p>}
        {error ? <p role="alert">Chưa tải được đánh giá. <button type="button" className="ga-link-accent" onClick={onRetry}>Thử lại</button></p> : !saved ?
          <p role="status">Đang nhận số đo và đề xuất của lượt này…</p> : <>
          <div className="ga-grading-grid">
            <div><span>Phân cỡ đề xuất</span><strong>{decision?.proposedSize === 'OUT' ? 'Ngoài quy cách' : decision?.proposedSize ?? 'Chưa có'}</strong></div>
            <div><span>Độ đầy thịt · Ước tính</span><strong>{blocked ? 'Cần đo lại' : gradeName(decision?.proposedCLevel ?? null)}</strong><small className="ga-grading-index">Chỉ số C: {number(decision?.cIndex, 4)}</small></div>
            <div><span>{proposed ? 'Hạng đề xuất' : 'Kết luận kiểm phẩm'}</span><strong>{approved ? gradeName(decision.finalGrade) : decision?.status === 'Rejected' ? 'Đã loại' : proposed ? gradeName(proposed) : 'Chưa duyệt'}</strong><small>{approved ? `Cỡ ${decision.finalSize ?? '—'} · ${formatDateTime(decision.decidedAt)}` : 'QC kiểm cảm quan và quyết định hạng cuối'}</small></div>
          </div>
          {!decision && <p className="ga-grading-notice">Lượt này chưa có đề xuất phân hạng. Kiểm tra trạng thái nhận dữ liệu và xử lý ảnh trong chi tiết lượt đo.</p>}
          {decision?.proposedSize === 'OUT' && <p className="ga-grading-notice">Khối lượng ngoài quy cách của lô. Chờ QC xác nhận.</p>}
          {decision && !decision.proposedCLevel && !blocked && <p className="ga-grading-notice">Chưa có mức độ đầy thịt từ bộ quy tắc của lô. Cần kiểm tra số đo và cấu hình quy tắc trước khi kết luận.</p>}
          {decision && decision.holdReasons.length > 0 && <div className="ga-grading-notice"><strong>Cần QC kiểm tra:</strong><ul>{decision.holdReasons.map(reason => <li key={reason}>{label('holdReason', reason)}</li>)}</ul></div>}
          {decision?.reason && <p>Ghi chú QC: {decision.reason}</p>}
        </>}
        {(session.weightG != null || session.hasWhiteImage || session.hasRedImage) &&
          <StationResultEvidence session={saved?.session ?? session} data={saved}
            gradingLength={decision?.carapaceLengthCm} zoom={!inPopup} />}
        {decision && <p className="ga-grading-basis">
          {decision.cIndex != null && <>Số dùng tính C · {number(decision.weightG, 1)} g · Dài mai {number(decision.carapaceLengthCm)} cm. </>}
          Bộ quy tắc v{decision.ruleSetVersion} · Quyết định {decision.decisionNo}, lần {decision.versionNo}.
        </p>}
      </> : <p>Hoàn thành một lượt cân và chụp ảnh để xem đánh giá. Có thể chọn lượt cũ trong lịch sử lô.</p>}
      {session && <p className="ga-grading-footnote">C = khối lượng (g) / chiều dài mai (cm)³. Đây là chỉ số hình thái thử nghiệm, chưa xác nhận độ chắc thịt hoặc phần trăm thịt.</p>}
      {session && <button type="button" className="ga-link-accent" onClick={onDetails}>Xem số đo và hồ sơ kiểm phẩm →</button>}
    </section>
  )
}
