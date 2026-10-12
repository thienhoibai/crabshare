import { useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { AlertTriangle, EyeOff, RefreshCw, Store } from 'lucide-react'
import axios from 'axios'
import AdminLayout from './AdminLayout'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime, formatVnd } from '../../shared/lib/format'
import { ActionDialog } from '../../shared/ui/ActionDialog'
import { CRAB_TYPE_LABELS, REASON_LABELS, STATUS_LABELS } from '../operator/listingsApi'
import { ADMIN_LISTINGS_PAGE_SIZE, useAdminListings, useHideListing, type AdminListing } from './adminListingsApi'

const button = 'relative inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50'
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm'
const kg = (value: number) => `${value.toLocaleString('vi-VN', { maximumFractionDigits: 3 })} kg`

/** Giá trị bộ lọc trên URL: "yes" | "no" | "all". */
const parseTri = (raw: string | null, fallback: boolean | null) =>
  raw === 'yes' ? true : raw === 'no' ? false : raw === 'all' ? null : fallback
const toTri = (value: boolean | null) => (value === null ? 'all' : value ? 'yes' : 'no')

export default function AdminStorefront() {
  const [params, setParams] = useSearchParams()
  const flagged = parseTri(params.get('flagged'), true)
  const hidden = parseTri(params.get('hidden'), false)
  const rawPage = Number(params.get('page') || 1)
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const query = useAdminListings({ flagged, hidden, page })
  const mutation = useHideListing()
  const lock = useRef(false)
  const [selection, setSelection] = useState<AdminListing | null>(null)
  const [notice, setNotice] = useState('')
  const [localError, setLocalError] = useState('')

  const navigate = (next: { flagged?: boolean | null; hidden?: boolean | null; page?: number }) => setParams(previous => {
    const p = new URLSearchParams(previous)
    p.set('flagged', toTri(next.flagged === undefined ? flagged : next.flagged))
    p.set('hidden', toTri(next.hidden === undefined ? hidden : next.hidden))
    p.set('page', String(next.page ?? 1))
    return p
  })
  const open = (listing: AdminListing) => { mutation.reset(); setLocalError(''); setNotice(''); setSelection(listing) }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selection || lock.current) return
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim()
    if (!reason) { setLocalError('Vui lòng nhập lý do, không chỉ nhập khoảng trắng.'); return }
    setLocalError(''); lock.current = true
    try {
      await mutation.mutateAsync({ listingId: selection.listingId, reason })
      setNotice(`Đã ẩn niêm yết "${selection.title}". Khách không còn thấy và không đặt được.`)
      setSelection(null)
      if (query.data?.items.length === 1 && page > 1) navigate({ page: page - 1 })
    } catch (error) {
      if (axios.isAxiosError(error) && [403, 404, 409].includes(error.response?.status ?? 0)) void query.refetch()
    } finally { lock.current = false }
  }

  return (
    <AdminLayout activeTab="storefront">
      <section className="space-y-4" aria-label="Kiểm duyệt niêm yết">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Kiểm duyệt niêm yết</h1>
            <p className="mt-1 text-sm text-slate-500">Hộ nuôi tự đặt giá và đăng bán (TL-27). Rà các lần đổi giá bị gắn cờ bất thường và ẩn niêm yết vi phạm khỏi cửa hàng.</p>
          </div>
          <button className={button} disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} />Làm mới</button>
        </div>
        {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="listing-flagged" className="text-sm font-semibold text-slate-700">Giá</label>
              <select id="listing-flagged" className={field + ' w-auto!'} value={toTri(flagged)} onChange={e => navigate({ flagged: parseTri(e.target.value, null) })}>
                <option value="yes">Bị gắn cờ bất thường</option>
                <option value="no">Bình thường</option>
                <option value="all">Tất cả</option>
              </select>
              <label htmlFor="listing-hidden" className="text-sm font-semibold text-slate-700">Hiển thị</label>
              <select id="listing-hidden" className={field + ' w-auto!'} value={toTri(hidden)} onChange={e => navigate({ hidden: parseTri(e.target.value, null) })}>
                <option value="no">Đang hiện</option>
                <option value="yes">Đã ẩn</option>
                <option value="all">Tất cả</option>
              </select>
            </div>
            <p className="text-sm text-slate-500" role="status">{query.data ? `${query.data.total} niêm yết` : 'Danh sách niêm yết'}</p>
          </div>

          {query.isPending ? <p className="p-8 text-center text-sm text-slate-500" role="status">Đang tải niêm yết…</p> : query.isError ?
            <div className="p-6"><p role="alert" className="mb-3 text-sm text-red-700">{errorMessage(query.error)}</p><button className={button} disabled={query.isFetching} onClick={() => void query.refetch()}>Thử lại</button></div> : !query.data.items.length ?
            <div className="px-6 py-12 text-center"><Store className="mx-auto mb-3 text-slate-400" size={28} /><h3 className="font-bold text-slate-800">Không có niêm yết nào khớp bộ lọc</h3><p className="mt-2 text-sm text-slate-500">Thử đổi bộ lọc hoặc làm mới danh sách.</p>{page > 1 && <button className={button + ' mt-4'} onClick={() => navigate({ page: 1 })}>Về trang đầu</button>}</div> : <>
            <div className="relative overflow-x-auto" aria-busy={query.isFetching}>
              <table className="w-full min-w-[900px] text-left text-sm"><caption className="sr-only">Niêm yết và kết quả so giá của lần đổi giá gần nhất</caption>
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{['Niêm yết', 'Lô / Hộ nuôi', 'Giá hiện tại', 'So giá lần gần nhất', 'Trạng thái', 'Thao tác'].map(title => <th scope="col" className="p-4 font-bold" key={title}>{title}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{query.data.items.map(l => <ListingRow key={l.listingId} listing={l} onHide={() => open(l)} />)}</tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 text-sm text-slate-600"><span>Trang {page} / {Math.max(1, Math.ceil(query.data.total / ADMIN_LISTINGS_PAGE_SIZE))}</span><div className="flex gap-2"><button className={button} disabled={page === 1 || query.isFetching} onClick={() => navigate({ page: page - 1 })}>Trước</button><button className={button} disabled={page * ADMIN_LISTINGS_PAGE_SIZE >= query.data.total || query.isFetching} onClick={() => navigate({ page: page + 1 })}>Sau</button></div></div>
          </>}
        </div>

        {selection && <ActionDialog title="Ẩn niêm yết khỏi cửa hàng" busy={mutation.isPending} onClose={() => setSelection(null)}>
          <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm"><p className="font-bold">{selection.title}</p><p className="mt-1 text-slate-600">Lô {selection.batchCode} · {selection.farmName}</p><p className="mt-2 text-slate-600">{formatVnd(selection.pricePerKg)} / kg · còn {kg(selection.availableQtyKg)}</p></div>
          <form onSubmit={submit} className="space-y-5">
            <div><label htmlFor="hide-reason" className="mb-2 block text-sm font-bold">Lý do ẩn (hộ nuôi sẽ thấy)</label><textarea autoFocus id="hide-reason" name="reason" required maxLength={300} rows={4} className={field} disabled={mutation.isPending} /></div>
            <p className="text-sm leading-6 text-slate-600">Niêm yết sẽ biến mất khỏi cửa hàng và khách không đặt thêm được. Các đơn đã đặt trước đó không bị hủy.</p>
            {(localError || mutation.isError) && <p role="alert" className="text-sm text-red-700">{localError || errorMessage(mutation.error)}</p>}
            <div className="flex flex-wrap justify-end gap-3"><button className={button} type="button" disabled={mutation.isPending} onClick={() => setSelection(null)}>Hủy</button><button className={button + ' border-red-600! bg-red-600! text-white hover:bg-red-700!'} disabled={mutation.isPending}>{mutation.isPending ? 'Đang xử lý…' : 'Ẩn niêm yết'}</button></div>
          </form>
        </ActionDialog>}
      </section>
    </AdminLayout>
  )
}

function ListingRow({ listing: l, onHide }: { listing: AdminListing; onHide: () => void }) {
  const price = l.latestPrice
  const check = price?.check
  return <tr className="align-top hover:bg-slate-50/60">
    <td className="max-w-64 p-4"><span className="text-xs font-medium text-slate-500">NY-{l.listingId}</span><p className="mt-1 break-words font-bold text-slate-900">{l.title}</p><p className="mt-1 text-xs text-slate-500">{CRAB_TYPE_LABELS[l.crabType] ?? l.crabType} · {l.gradeName} · {l.storageType === 'Frozen' ? 'Cấp đông' : 'Tươi sống'}</p></td>
    <td className="p-4 text-slate-600"><p className="font-semibold text-slate-800">{l.batchCode}</p><p className="mt-1 text-xs">{l.farmName}</p></td>
    <td className="whitespace-nowrap p-4"><p className="font-mono font-bold text-slate-900">{formatVnd(l.pricePerKg)}</p>{price?.previousPricePerKg != null && <p className="mt-1 text-xs text-slate-500">Trước: {formatVnd(price.previousPricePerKg)}</p>}<p className="mt-1 text-xs text-slate-500">Còn {kg(l.availableQtyKg)}</p></td>
    <td className="max-w-72 p-4 text-xs text-slate-600">{!price ? 'Chưa có lịch sử giá' : <>
      {price.flaggedAbnormal && <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-bold text-amber-800"><AlertTriangle size={13} />Giá bất thường</span>}
      <p>{REASON_LABELS[price.reason]}{price.note ? `: ${price.note}` : ''}</p>
      <p className="mt-1">{price.changedBy} · {formatDateTime(price.effectiveFrom)}</p>
      {check && (check.hasEnoughData
        ? <p className="mt-1">Trung vị {check.medianPricePerKg != null ? formatVnd(check.medianPricePerKg) : '—'} · điểm {check.score ?? '—'} / ngưỡng {check.threshold ?? '—'} ({check.sampleCount} giao dịch, {check.operatorCount} hộ, {check.windowDays} ngày)</p>
        : <p className="mt-1">Chưa đủ dữ liệu so giá ({check.sampleCount} giao dịch, {check.operatorCount} hộ)</p>)}
    </>}</td>
    <td className="p-4"><span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{STATUS_LABELS[l.status]}</span>{l.hiddenAt && <p className="mt-2 text-xs text-red-700">Đã ẩn {formatDateTime(l.hiddenAt)}{l.hiddenBy ? ` bởi ${l.hiddenBy}` : ''}: {l.hiddenReason}</p>}</td>
    <td className="p-4">{l.hiddenAt ? <span className="text-xs text-slate-500">Không có thao tác</span> : <button className={button + ' text-red-700'} onClick={onHide}><EyeOff size={15} />Ẩn<span className="sr-only"> {l.title}</span></button>}</td>
  </tr>
}
