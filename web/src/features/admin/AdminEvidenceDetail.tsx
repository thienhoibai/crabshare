import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { ActionDialog } from '../../shared/ui/ActionDialog'
import AdminLayout from './AdminLayout'
import { AdminStatusBadge, adminButton, adminField } from './adminAccountUi'
import { evidenceDetail, evidenceImage, evidenceStatuses, evidenceVerdicts, submitEvidenceVerdict, type EvidenceDetail, type EvidenceVerdict } from './evidenceReviewApi'

const date = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa có'
function PrivateImage({ id, userId }: { id: number; userId: number }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    setUrl(''); setError('')
    void evidenceImage(id, controller.signal).then(blob => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) } }).catch(failure => { if (!controller.signal.aborted) setError(errorMessage(failure)) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [id, userId, attempt])
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-4">{url ? <img src={url} alt={`Ảnh bằng chứng ${id}`} className="max-h-[600px] max-w-full rounded-lg object-contain" /> : error ? <div role="alert" className="text-center"><p className="text-sm text-red-700">{error}</p><button className={adminButton + ' mt-3'} onClick={() => setAttempt(a => a + 1)}>Tải lại ảnh</button></div> : <p role="status" className="text-sm text-slate-500">Đang tải ảnh…</p>}</div>
}
function VerdictDialog({ detail, verdict, onClose, onDone }: { detail: EvidenceDetail; verdict: EvidenceVerdict; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const busy = useRef(false)
  const client = useQueryClient()
  const mutation = useMutation({ mutationFn: () => submitEvidenceVerdict(detail.evidence.id, verdict, note.trim()), onSuccess: onDone })
  return <ActionDialog title={evidenceVerdicts[verdict]} onClose={onClose} busy={mutation.isPending}>
    <p className="mb-4 rounded-lg bg-slate-50 p-4 text-sm font-semibold">Bằng chứng #{detail.evidence.id} · {detail.evidence.batchCode} · Hộp {detail.evidence.slotCode ?? '—'}</p>
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); if (busy.current || !note.trim()) return
      busy.current = true; setError('')
      try { await mutation.mutateAsync() }
      catch (failure) { setError(errorMessage(failure)); void client.invalidateQueries({ queryKey: ['review-evidence-detail'] }); void client.invalidateQueries({ queryKey: ['review-evidence'] }) }
      finally { busy.current = false }
    }}>
      <label className="grid gap-2 text-sm font-bold">Ghi chú thẩm định<textarea className={adminField} rows={4} maxLength={500} required value={note} onChange={e => setNote(e.target.value)} disabled={mutation.isPending} /></label>
      <p className="text-sm text-slate-600">{verdict === 'NeedMoreEvidence' ? 'Bằng chứng tiếp tục chờ bổ sung. Bạn có thể thẩm định lại sau khi có giải trình mới.' : 'Phán quyết và ghi chú được lưu vào hồ sơ thẩm định.'}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3"><button className={adminButton} type="button" disabled={mutation.isPending} onClick={onClose}>Hủy</button><button className={adminButton + ' border-red-600! bg-red-600! text-white'} type="submit" disabled={mutation.isPending || !note.trim()}>{mutation.isPending ? 'Đang lưu…' : 'Lưu phán quyết'}</button></div>
    </form>
  </ActionDialog>
}
export default function AdminEvidenceDetail() {
  const { id: value } = useParams()
  const id = Number(value)
  const userId = useAuthStore(s => s.user?.userId)
  const [verdict, setVerdict] = useState<EvidenceVerdict | null>(null)
  const [notice, setNotice] = useState('')
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['review-evidence-detail', userId, id], queryFn: ({ signal }) => evidenceDetail(id, signal), enabled: !!userId && Number.isSafeInteger(id) && id > 0, retry: false })
  useEffect(() => { setVerdict(null); setNotice('') }, [id, userId])
  const detail = query.data
  return <AdminLayout activeTab="evidence">
    <Link to="/admin/evidence" className="mb-4 inline-block text-sm font-semibold text-slate-600">← Danh sách bằng chứng</Link>
    <h1 className="mb-5 text-2xl font-extrabold text-slate-900">Bằng chứng #{value}</h1>
    {notice && <p role="status" className="mb-4 text-sm text-emerald-700">{notice}</p>}
    {!Number.isSafeInteger(id) || id <= 0 ? <p role="alert">Mã bằng chứng không hợp lệ.</p> : query.isPending ? <p role="status">Đang tải hồ sơ…</p> : query.isError ? <div role="alert" className="rounded-xl border border-red-200 bg-white p-6"><p className="text-red-700">{errorMessage(query.error)}</p><button className={adminButton + ' mt-3'} onClick={() => { void query.refetch() }}>Thử lại</button></div> : detail && <>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>{detail.evidence.mediaType === 'Photo' && userId ? <PrivateImage key={`${userId}-${id}`} id={id} userId={userId} /> : <p className="rounded-xl border bg-white p-6 text-sm">Bằng chứng này không phải ảnh chụp.</p>}
          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-bold">Giải trình của hộ nuôi</h2><p className="whitespace-pre-wrap break-words text-sm text-slate-600">{detail.explanation || 'Chưa có giải trình.'}</p>{detail.explainedAt && <p className="mt-2 text-xs text-slate-500">Gửi lúc {date(detail.explainedAt)}</p>}</section>
        </div>
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-4 flex flex-wrap justify-between gap-2"><h2 className="font-bold">Thông tin bằng chứng</h2><AdminStatusBadge value={detail.evidence.reviewStatus} label={evidenceStatuses[detail.evidence.reviewStatus] ?? detail.evidence.reviewStatus} /></div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">{[
              ['Lô', detail.evidence.batchCode], ['Hộ nuôi', detail.evidence.farmName], ['Hộp', detail.evidence.slotCode ?? '—'], ['Nguồn', detail.source], ['Giờ chụp', date(detail.capturedAt)], ['Giờ máy chủ nhận', date(detail.evidence.receivedAt)],
              ['Vị trí', detail.latitude == null || detail.longitude == null ? 'Chưa có' : `${detail.latitude}, ${detail.longitude}`], ['Điểm rủi ro', detail.evidence.riskScore == null ? 'Chưa có' : `${detail.evidence.riskScore}/100`], ['SHA-256', detail.sha256], ['dHash', detail.perceptualHash ?? 'Chưa có'],
            ].map(([label, text]) => <div className="contents" key={label}><dt className="text-slate-500">{label}</dt><dd className="min-w-0 break-all font-medium">{text}</dd></div>)}</dl>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-bold">Kết quả nhận diện</h2>{detail.detections.length === 0 ? <p className="text-sm text-slate-500">Chưa có kết quả mô hình.</p> : detail.detections.map((d, index) => <div key={index} className="mb-3 text-sm text-slate-600"><p className="font-semibold">{d.crabDetected == null ? 'Chưa có kết luận nhận diện cua' : d.crabDetected ? 'Mô hình phát hiện cua' : 'Mô hình không phát hiện cua'}</p><p>Độ tin cậy: {d.confidence == null ? 'Chưa có' : `${(d.confidence * 100).toFixed(1)}%`} · Mô hình: {d.modelVersion}</p><p className="text-xs">{date(d.detectedAt)}</p>{d.bboxJson && <pre className="mt-2 whitespace-pre-wrap break-all text-xs">{d.bboxJson}</pre>}</div>)}<p className="text-xs text-slate-500">Kết quả mô hình là một tín hiệu hỗ trợ thẩm định.</p></section>
          <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-bold">Phán quyết</h2>{detail.canReview ? <div className="flex flex-wrap gap-2">{(Object.keys(evidenceVerdicts) as EvidenceVerdict[]).map(v => <button key={v} className={adminButton} onClick={() => { setNotice(''); setVerdict(v) }}>{evidenceVerdicts[v]}</button>)}</div> : <p className="text-sm text-slate-500">Bằng chứng đã được xử lý hoặc đang chờ giải trình mới.</p>}</section>
        </div>
      </div>
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-4 font-bold">Lịch sử thẩm định</h2>{detail.reviews.length === 0 ? <p className="text-sm text-slate-500">Chưa có phán quyết.</p> : detail.reviews.map(r => <article key={r.id} className="border-b border-slate-100 py-3 last:border-0"><p className="text-sm font-semibold">{evidenceVerdicts[r.verdict]} · {r.reviewerName}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{r.note}</p><p className="mt-1 text-xs text-slate-500">{date(r.reviewedAt)}</p></article>)}</section>
      {verdict && <VerdictDialog key={`${id}-${userId}`} detail={detail} verdict={verdict} onClose={() => setVerdict(null)} onDone={() => { setVerdict(null); setNotice('Đã lưu phán quyết.'); void client.invalidateQueries({ queryKey: ['review-evidence'] }); void client.invalidateQueries({ queryKey: ['review-evidence-detail'] }) }} />}
    </>}
  </AdminLayout>
}
