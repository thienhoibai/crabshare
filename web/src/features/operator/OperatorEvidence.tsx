import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { Flag, RefreshCw } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { formatDateTime } from '../../shared/lib/format'
import OperatorLayout from './OperatorLayout'
import { OpBack, OpBadge, OpBtn, OpHeading, OpNote, OpPanel } from './operatorUi'
import { explainEvidence, operatorEvidence, operatorEvidenceDetail, operatorEvidenceImage, type OperatorEvidence as EvidenceItem } from './evidenceExplanationApi'

const statuses: Record<string, string> = { Flagged: 'Chờ thẩm định', Accepted: 'Đã chấp nhận', Watch: 'Theo dõi', Rejected: 'Đã từ chối' }
const date = (value: string | null) => value ? formatDateTime(value) : 'Chưa có'

function EvidencePhoto({ id, userId }: { id: number; userId: number }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    setUrl(''); setError('')
    void operatorEvidenceImage(id, controller.signal).then(blob => {
      if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) }
    }).catch(failure => { if (!controller.signal.aborted) setError(errorMessage(failure)) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [id, userId, attempt])
  return <div className="flex min-h-64 items-center justify-center rounded-2xl bg-stone-100 p-4">
    {url ? <img src={url} alt={`Ảnh bằng chứng ${id}`} className="max-h-[480px] max-w-full rounded-xl object-contain" /> : error ? <div role="alert"><p>{error}</p><OpBtn className="mt-3" onClick={() => setAttempt(a => a + 1)}>Tải lại ảnh</OpBtn></div> : <p role="status">Đang tải ảnh…</p>}
  </div>
}

function ExplanationForm({ item, userId }: { item: EvidenceItem; userId: number }) {
  const [text, setText] = useState(item.explanation ?? '')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const busy = useRef(false)
  const client = useQueryClient()
  const mutation = useMutation({ mutationFn: () => explainEvidence(item.id, text.trim()) })
  const disabled = mutation.isPending || !item.canExplain
  return <form className="op-form" onSubmit={async event => {
    event.preventDefault()
    if (busy.current || !item.canExplain || !text.trim() || text.trim() === item.explanation) return
    busy.current = true; setError(''); setNotice('')
    try {
      const saved = await mutation.mutateAsync()
      if (useAuthStore.getState().user?.userId !== userId) return
      client.setQueryData(['operator-evidence-detail', userId, item.id], saved)
      void client.invalidateQueries({ queryKey: ['operator-evidence'] })
      setText(saved.explanation ?? ''); setNotice('Đã gửi giải trình. Bằng chứng đang chờ thẩm định.')
    } catch (failure) {
      setError(errorMessage(failure))
      void client.invalidateQueries({ queryKey: ['operator-evidence-detail', userId, item.id] })
      void client.invalidateQueries({ queryKey: ['operator-evidence'] })
    } finally { busy.current = false }
  }}>
    <div className="grid gap-2"><label className="font-bold" htmlFor={`explanation-${item.id}`}>Nội dung giải trình</label><textarea id={`explanation-${item.id}`} className="op-textarea" rows={5} required maxLength={1000} disabled={disabled} value={text} onChange={e => setText(e.target.value)} /></div>
    <p className="op-muted text-sm">Nêu lý do ảnh bị gắn cờ và thông tin cần đối chiếu. Nếu đã gửi, bổ sung nội dung mới trước khi gửi lại.</p>
    {!item.canExplain && <OpNote>Bằng chứng không còn chờ thẩm định; không thể gửi thêm giải trình.</OpNote>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {notice && <p role="status" className="text-green-700">{notice}</p>}
    <div className="flex justify-end"><OpBtn type="submit" variant="ink" disabled={disabled || !text.trim() || text.trim() === item.explanation}>{mutation.isPending ? 'Đang gửi…' : 'Gửi giải trình'}</OpBtn></div>
  </form>
}

function EvidenceDetail({ id, userId }: { id: number; userId: number }) {
  const query = useQuery({ queryKey: ['operator-evidence-detail', userId, id], queryFn: ({ signal }) => operatorEvidenceDetail(id, signal), enabled: Number.isSafeInteger(id) && id > 0, retry: false })
  const item = query.data
  return <>
    <OpHeading eyebrow="Bằng chứng" title={`Giải trình bằng chứng #${id}`} crumb={<OpBack href="/operator/evidence">← Danh sách bằng chứng</OpBack>} />
    {!Number.isSafeInteger(id) || id <= 0 ? <p role="alert">Mã bằng chứng không hợp lệ.</p> : query.isPending ? <p role="status" className="op-panel p-6">Đang tải bằng chứng…</p> : query.isError ? <div role="alert" className="op-panel p-6"><p>{errorMessage(query.error)}</p><OpBtn className="mt-3" onClick={() => void query.refetch()}>Thử lại</OpBtn></div> : item && <div className="grid gap-5 lg:grid-cols-2">
      <OpPanel title="Ảnh và dữ liệu chụp" className="p-5">
        {item.mediaType === 'Photo' && <EvidencePhoto key={`${userId}-${id}`} id={id} userId={userId} />}
        <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">{[
          ['Lô / Hộp', `${item.batchCode} / ${item.slotCode ?? '—'}`], ['Trạng thái', statuses[item.reviewStatus] ?? item.reviewStatus],
          ['Giờ chụp', date(item.capturedAt)], ['Máy chủ nhận', date(item.receivedAt)], ['Vị trí', item.latitude == null || item.longitude == null ? 'Chưa có' : `${item.latitude}, ${item.longitude}`], ['Điểm rủi ro', item.riskScore == null ? 'Chưa có' : `${item.riskScore}/100`],
        ].map(([label, value]) => <div className="contents" key={label}><dt className="op-muted">{label}</dt><dd className="min-w-0 break-words font-semibold">{value}</dd></div>)}</dl>
      </OpPanel>
      <div className="grid content-start gap-5">
        {item.latestReview && <OpPanel title="Phản hồi thẩm định" className="p-5"><p className="whitespace-pre-wrap break-words">{item.latestReview.note ?? 'Chưa có ghi chú.'}</p><p className="op-muted mt-2 text-sm">{date(item.latestReview.reviewedAt)}</p></OpPanel>}
        {item.explanation && <OpPanel title="Giải trình đã gửi" className="p-5"><p className="whitespace-pre-wrap break-words">{item.explanation}</p><p className="op-muted mt-2 text-sm">Gửi lúc {date(item.explainedAt)} · {statuses[item.reviewStatus] ?? item.reviewStatus}</p></OpPanel>}
        <OpPanel title="Gửi giải trình" className="p-5"><ExplanationForm key={`${userId}-${id}`} item={item} userId={userId} /></OpPanel>
      </div>
    </div>}
  </>
}

function EvidenceList({ userId }: { userId: number }) {
  const [status, setStatus] = useState('Flagged')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['operator-evidence', userId, status, q, page], queryFn: ({ signal }) => operatorEvidence(status, q, page, signal), retry: false })
  return <>
    <OpHeading eyebrow="Bằng chứng" title="Bằng chứng bị gắn cờ" description="Xem ảnh và phản hồi thẩm định, gửi giải trình cho bằng chứng của hộ nuôi." />
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="grid min-w-0 flex-1 gap-1"><label htmlFor="evidence-search" className="font-bold">Tìm bằng chứng</label><input id="evidence-search" className="op-input" type="search" maxLength={100} placeholder="Mã bằng chứng, lô hoặc hộp…" value={q} onChange={e => { setQ(e.target.value); setPage(1) }} /></div>
      <div className="grid gap-1"><label htmlFor="evidence-status" className="font-bold">Trạng thái</label><select id="evidence-status" className="op-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <OpBtn variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={16} /> Làm mới</OpBtn>
    </div>
    {query.isPending ? <p role="status" className="op-panel p-6">Đang tải bằng chứng…</p> : query.isError ? <div role="alert" className="op-panel p-6"><p>{errorMessage(query.error)}</p><OpBtn className="mt-3" onClick={() => void query.refetch()}>Thử lại</OpBtn></div> : <>
      <div className="op-panel op-list">{query.data.items.map(item => <article className="op-row flex-wrap" key={item.id}>
        <Flag className="shrink-0 text-orange-600" size={24} />
        <div className="min-w-0 flex-1"><b>#{item.id} · {item.batchCode} · Hộp {item.slotCode ?? '—'}</b><p className="op-muted mt-1 text-sm">Nhận lúc {date(item.receivedAt)}</p><div className="mt-2 flex flex-wrap gap-2"><OpBadge tone={item.reviewStatus === 'Flagged' ? 'warn' : 'mute'}>{statuses[item.reviewStatus]}</OpBadge>{item.explanation && <OpBadge tone="info">Đã có giải trình</OpBadge>}</div></div>
        <Link className="rd-btn rd-btn--dark rd-btn--sm" to={`/operator/evidence/${item.id}`}>Xem và giải trình<span className="sr-only"> {item.id}</span></Link>
      </article>)}{query.data.items.length === 0 && <div className="op-empty"><Flag size={28} /><b>Không có bằng chứng phù hợp</b><span>Bằng chứng bị gắn cờ sẽ xuất hiện tại đây.</span></div>}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="op-muted text-sm">Trang {page} · {query.data.total} bằng chứng</span><div className="flex gap-2"><OpBtn variant="outline" disabled={page <= 1 || query.isFetching} onClick={() => setPage(p => p - 1)}>Trước</OpBtn><OpBtn variant="outline" disabled={page * 10 >= query.data.total || query.isFetching} onClick={() => setPage(p => p + 1)}>Sau</OpBtn></div></div>
    </>}
  </>
}

export default function OperatorEvidence() {
  const { id } = useParams()
  const userId = useAuthStore(s => s.user?.userId)
  return <OperatorLayout activeTab="evidence">{userId && (id ? <EvidenceDetail key={`${userId}-${id}`} id={Number(id)} userId={userId} /> : <EvidenceList key={userId} userId={userId} />)}</OperatorLayout>
}
