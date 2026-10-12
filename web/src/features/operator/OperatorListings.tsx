import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, ImagePlus, Plus, RefreshCw, Store, X } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { formatDate, formatDateTime, formatVnd } from '../../shared/lib/format'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpHeading, OpNote, OpPanel } from './operatorUi'
import {
  CRAB_TYPE_LABELS,
  REASON_LABELS,
  STATUS_LABELS,
  listingImageSrc,
  listingsApi,
  useChangePrice,
  useCloseListing,
  useCreateListing,
  useListingOptions,
  useMyListings,
  usePublishListing,
  useRefreshStock,
  useUploadListingImage,
  type Listing,
  type ListingStatus,
  type PriceChangeReason,
  type PriceCheck,
  type StorageType,
} from './listingsApi'

const STATUS_TONE: Record<ListingStatus, 'mute' | 'ok' | 'warn' | 'danger'> = {
  Draft: 'mute',
  Published: 'ok',
  SoldOut: 'warn',
  Closed: 'danger',
}

const kg = (n: number) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(n)} kg`

/** Dòng giải thích kết quả so giá (TL-27): không đủ dữ liệu thì nói rõ, không tự tạo con số. */
function PriceCheckLine({ check }: { check: PriceCheck | null }) {
  if (!check) return null
  if (!check.hasEnoughData)
    return (
      <span className="text-xs text-[#6f675e]">
        Chưa đủ dữ liệu so sánh ({check.sampleCount} giao dịch, {check.operatorCount} hộ nuôi trong {check.windowDays} ngày; cần ≥ 20 và ≥ 3).
      </span>
    )
  return (
    <span className={`text-xs ${check.isFlagged ? 'text-[#b42318] font-bold' : 'text-[#6f675e]'}`}>
      {check.isFlagged ? 'Lệch đáng kể so với giao dịch tương đồng. ' : ''}
      Giá trung vị nội bộ {formatVnd(check.medianPricePerKg ?? 0)}/kg · {check.sampleCount} giao dịch, {check.windowDays} ngày.
    </span>
  )
}

function CreateListingForm({ onDone }: { onDone: () => void }) {
  const { data: options = [], isLoading } = useListingOptions()
  const create = useCreateListing()
  const free = options.filter((o) => o.existingListingId === null)
  const [choice, setChoice] = useState('')
  const [storage, setStorage] = useState<StorageType>('Fresh')
  const [frozenAt, setFrozenAt] = useState('')
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')

  useEffect(() => {
    if (!choice && free.length > 0) setChoice(`${free[0].batchCode}|${free[0].gradeCode}`)
  }, [choice, free])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const [batchCode, gradeCode] = choice.split('|')
    create.mutate(
      {
        batchCode,
        gradeCode,
        storageType: storage,
        frozenAt: storage === 'Frozen' && frozenAt ? new Date(`${frozenAt}T00:00:00+07:00`).toISOString() : undefined,
        title: title.trim() || undefined,
        pricePerKg: Number(price),
      },
      { onSuccess: onDone },
    )
  }

  return (
    <OpPanel title="Tạo niêm yết" subtitle="Tồn lấy từ số cua đã cân trong kho của lô + hạng; không nhập tay số kg." accent>
      {isLoading ? (
        <p className="text-sm text-[#6f675e]">Đang tải…</p>
      ) : free.length === 0 ? (
        <OpNote>Không còn hạng nào của lô đang thu hoạch chưa có niêm yết. Cân và xếp hạng cua ở trang Thu hoạch trước.</OpNote>
      ) : (
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <div className="op-field md:col-span-2">
            <label htmlFor="ls-choice">Lô + hạng</label>
            <select id="ls-choice" className="op-select" value={choice} onChange={(e) => setChoice(e.target.value)}>
              {free.map((o) => (
                <option key={`${o.batchCode}|${o.gradeCode}`} value={`${o.batchCode}|${o.gradeCode}`}>
                  {o.batchCode} · {CRAB_TYPE_LABELS[o.crabType] ?? o.crabType} · {o.gradeName} — {o.inStockCount} con, {kg(o.inStockKg)}
                </option>
              ))}
            </select>
          </div>
          <div className="op-field">
            <label htmlFor="ls-storage">Bảo quản</label>
            <select id="ls-storage" className="op-select" value={storage} onChange={(e) => setStorage(e.target.value as StorageType)}>
              <option value="Fresh">Tươi sống</option>
              <option value="Frozen">Cấp đông</option>
            </select>
          </div>
          {storage === 'Frozen' && (
            <div className="op-field">
              <label htmlFor="ls-frozen">Ngày cấp đông (bỏ trống = hôm nay)</label>
              <input id="ls-frozen" type="date" className="op-input" value={frozenAt} onChange={(e) => setFrozenAt(e.target.value)} />
            </div>
          )}
          <div className="op-field">
            <label htmlFor="ls-price">Giá bán (đồng/kg)</label>
            <input id="ls-price" type="number" min={1} step={1000} required className="op-input" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="op-field md:col-span-2">
            <label htmlFor="ls-title">Tên hiển thị (bỏ trống để hệ thống đặt theo loại cua, hạng, lô)</label>
            <input id="ls-title" className="op-input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {create.error && <OpNote tone="danger" className="md:col-span-2">{errorMessage(create.error)}</OpNote>}
          <div className="md:col-span-2 flex gap-2">
            <OpBtn type="submit" disabled={create.isPending || !choice || !price}>Lưu bản nháp</OpBtn>
            <OpBtn type="button" variant="outline" onClick={onDone}>Huỷ</OpBtn>
          </div>
        </form>
      )}
    </OpPanel>
  )
}

function ChangePriceForm({ listing, onDone }: { listing: Listing; onDone: () => void }) {
  const change = useChangePrice()
  const [price, setPrice] = useState(String(listing.pricePerKg))
  const [reason, setReason] = useState<PriceChangeReason>('Market')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<PriceCheck | null>(null)

  const value = Number(price)
  useEffect(() => {
    setPreview(null)
    if (!value || value === listing.pricePerKg) return
    const timer = setTimeout(() => {
      listingsApi.previewPrice(listing.listingId, value).then(setPreview).catch(() => setPreview(null))
    }, 400)
    return () => clearTimeout(timer)
  }, [value, listing.listingId, listing.pricePerKg])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    change.mutate({ id: listing.listingId, pricePerKg: value, reason, note: note.trim() || undefined }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-3 mt-4 p-4 rounded-2xl bg-[#fff8ef] border border-[#ead9c2]">
      <div className="op-field">
        <label htmlFor={`pr-${listing.listingId}`}>Giá mới (đồng/kg)</label>
        <input id={`pr-${listing.listingId}`} type="number" min={1} step={1000} required className="op-input" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="op-field">
        <label htmlFor={`rs-${listing.listingId}`}>Lý do</label>
        <select id={`rs-${listing.listingId}`} className="op-select" value={reason} onChange={(e) => setReason(e.target.value as PriceChangeReason)}>
          {(['Market', 'Promotion', 'Clearance', 'Correction', 'Other'] as const).map((r) => (
            <option key={r} value={r}>{REASON_LABELS[r]}</option>
          ))}
        </select>
      </div>
      <div className="op-field">
        <label htmlFor={`nt-${listing.listingId}`}>Ghi chú {reason === 'Other' ? '(bắt buộc)' : ''}</label>
        <input id={`nt-${listing.listingId}`} className="op-input" maxLength={300} required={reason === 'Other'} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="md:col-span-3">
        {preview?.isFlagged ? (
          <OpNote tone="danger">
            <AlertTriangle className="inline w-4 h-4 mr-1" />
            Giá này lệch đáng kể so với giao dịch tương đồng. Bạn vẫn lưu được; nhà đầu tư của lô sẽ thấy cờ này cùng lý do bạn chọn.
          </OpNote>
        ) : (
          <PriceCheckLine check={preview} />
        )}
      </div>
      {change.error && <OpNote tone="danger" className="md:col-span-3">{errorMessage(change.error)}</OpNote>}
      <div className="md:col-span-3 flex gap-2">
        <OpBtn type="submit" sm disabled={change.isPending || !value || value === listing.pricePerKg}>Lưu giá mới</OpBtn>
        <OpBtn type="button" sm variant="outline" onClick={onDone}>Huỷ</OpBtn>
      </div>
    </form>
  )
}

function ListingCard({ listing }: { listing: Listing }) {
  const [editingPrice, setEditingPrice] = useState(false)
  const publish = usePublishListing()
  const close = useCloseListing()
  const refresh = useRefreshStock()
  const upload = useUploadListingImage()
  const error = publish.error ?? close.error ?? refresh.error ?? upload.error
  const img = listingImageSrc(listing)
  const closed = listing.status === 'Closed'

  return (
    <OpPanel>
      <div className="flex flex-col md:flex-row gap-5">
        <div className="w-full md:w-48 shrink-0">
          <div className="aspect-square rounded-2xl overflow-hidden bg-[#f4efe8] border border-[#ead9c2] flex items-center justify-center">
            {img ? <img src={img} alt={listing.title} className="w-full h-full object-cover" /> : <Store className="w-10 h-10 text-[#c9b8a3]" />}
          </div>
          {!closed && (
            <label className="op-btn op-btn-outline op-btn-sm op-btn-full mt-2 cursor-pointer">
              <ImagePlus className="w-4 h-4" /> {img ? 'Đổi ảnh' : 'Tải ảnh'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) upload.mutate({ id: listing.listingId, file })
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-2 mb-2">
            <OpBadge tone={STATUS_TONE[listing.status]}>{STATUS_LABELS[listing.status]}</OpBadge>
            <OpBadge tone="gold">Lô {listing.batchCode}</OpBadge>
            <OpBadge tone="mute">{listing.gradeName}</OpBadge>
            <OpBadge tone="info">{listing.storageType === 'Frozen' ? 'Cấp đông' : 'Tươi sống'}</OpBadge>
          </div>
          <h3 className="font-extrabold text-lg">{listing.title}</h3>
          <p className="text-2xl font-extrabold mt-2">{formatVnd(listing.pricePerKg)}<span className="text-sm font-semibold text-[#6f675e]"> /kg</span></p>
          <p className="text-sm text-[#6f675e] mt-1">
            Tồn {kg(listing.stockQtyKg)} · đang giữ cho đơn {kg(listing.reservedQtyKg)} · còn bán được <b>{kg(listing.availableQtyKg)}</b>
          </p>
          <p className="text-xs text-[#9a8f84] mt-1">
            {listing.harvestedAt && <>Thu hoạch {formatDate(listing.harvestedAt)} · </>}
            {listing.frozenAt && <>Cấp đông {formatDate(listing.frozenAt)} · </>}
            {listing.sellUntil && <>Bán tới {formatDate(listing.sellUntil)} (trần TL-23) · </>}
            {listing.farmName}
          </p>

          {!closed && (
            <div className="flex flex-wrap gap-2 mt-4">
              {listing.status === 'Draft' && (
                <OpBtn sm onClick={() => publish.mutate(listing.listingId)} disabled={publish.isPending}>Đăng bán</OpBtn>
              )}
              <OpBtn sm variant="ink" onClick={() => setEditingPrice((v) => !v)}>Đổi giá</OpBtn>
              <OpBtn sm variant="outline" onClick={() => refresh.mutate(listing.listingId)} disabled={refresh.isPending}>
                <RefreshCw className="w-4 h-4" /> Cập nhật tồn
              </OpBtn>
              <OpBtn
                sm
                variant="ghost"
                onClick={() => { if (window.confirm('Ngừng bán niêm yết này? Không mở lại được.')) close.mutate(listing.listingId) }}
                disabled={close.isPending}
              >
                <X className="w-4 h-4" /> Ngừng bán
              </OpBtn>
            </div>
          )}
          {error && <OpNote tone="danger" className="mt-3">{errorMessage(error)}</OpNote>}
          {editingPrice && <ChangePriceForm listing={listing} onDone={() => setEditingPrice(false)} />}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="op-table">
          <thead>
            <tr><th>Thời điểm</th><th>Giá</th><th>Lý do</th><th>Người đổi</th><th>So sánh</th></tr>
          </thead>
          <tbody>
            {listing.priceHistory.map((h) => (
              <tr key={h.priceHistoryId}>
                <td className="whitespace-nowrap">{formatDateTime(h.effectiveFrom)}</td>
                <td className="whitespace-nowrap">
                  {h.previousPricePerKg !== null && <span className="text-[#9a8f84] line-through mr-1">{formatVnd(h.previousPricePerKg)}</span>}
                  <b>{formatVnd(h.pricePerKg)}</b>
                </td>
                <td>{REASON_LABELS[h.reason]}{h.note ? ` — ${h.note}` : ''}</td>
                <td>{h.changedBy}</td>
                <td>{h.flaggedAbnormal ? <OpBadge tone="danger">Lệch bất thường</OpBadge> : <PriceCheckLine check={h.check} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpPanel>
  )
}

export default function OperatorListings() {
  const { data: listings = [], isLoading, error } = useMyListings()
  const [creating, setCreating] = useState(false)

  return (
    <OperatorLayout activeTab="listings">
      <OpHeading
        eyebrow="UC24 · Niêm yết"
        title="Niêm yết sản phẩm"
        description="Bạn tự đặt và đổi giá. Mọi lần đổi giá được lưu công khai cho nhà đầu tư của lô; giá lệch nhiều so với giao dịch tương đồng chỉ bị gắn cờ, không bị chặn (TL-27)."
        action={!creating && <OpBtn onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> Tạo niêm yết</OpBtn>}
      />

      <div className="space-y-4 max-w-5xl">
        {creating && <CreateListingForm onDone={() => setCreating(false)} />}
        {isLoading && <p className="text-sm text-[#6f675e]">Đang tải…</p>}
        {error && <OpNote tone="danger">{errorMessage(error)}</OpNote>}
        {!isLoading && !error && listings.length === 0 && !creating && (
          <div className="op-panel text-center py-16">
            <Store className="w-12 h-12 text-[#c9b8a3] mx-auto mb-3" />
            <h3 className="font-bold text-lg">Chưa có niêm yết</h3>
            <p className="text-sm text-[#6f675e] mt-1">Sau khi cân và xếp hạng cua thu hoạch, tạo niêm yết để đưa lên cửa hàng.</p>
          </div>
        )}
        {listings.map((l) => <ListingCard key={l.listingId} listing={l} />)}
      </div>
    </OperatorLayout>
  )
}
