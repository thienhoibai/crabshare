import { useEffect, useState, type FormEvent } from 'react'
import { ImagePlus, Plus, RefreshCw, Store, X } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { formatDate, formatDateTime, formatVnd } from '../../shared/lib/format'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpFacts, OpHeading, OpNote, OpPanel } from './operatorUi'
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
      <span className="text-xs op-muted">
        Chưa đủ dữ liệu so sánh ({check.sampleCount} giao dịch, {check.operatorCount} hộ nuôi trong {check.windowDays} ngày; cần ≥ 20 và ≥ 3).
      </span>
    )
  return (
    <span className={`text-xs ${check.isFlagged ? 'op-danger font-semibold' : 'op-muted'}`}>
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
        <p className="op-muted">Đang tải…</p>
      ) : free.length === 0 ? (
        <>
          <OpNote>Không còn hạng nào của lô đang thu hoạch chưa có niêm yết. Cân và xếp hạng cua ở trang Thu hoạch trước.</OpNote>
          <OpBtn type="button" variant="ghost" sm onClick={onDone} className="justify-self-start">Đóng</OpBtn>
        </>
      ) : (
        <form onSubmit={submit} className="op-form">
          <div className="op-field">
            <label htmlFor="ls-choice">Lô + hạng</label>
            <select id="ls-choice" className="op-select" value={choice} onChange={(e) => setChoice(e.target.value)}>
              {free.map((o) => (
                <option key={`${o.batchCode}|${o.gradeCode}`} value={`${o.batchCode}|${o.gradeCode}`}>
                  {o.batchCode} · {CRAB_TYPE_LABELS[o.crabType] ?? o.crabType} · {o.gradeName} — {o.inStockCount} con, {kg(o.inStockKg)}
                </option>
              ))}
            </select>
          </div>
          <div className="op-form__row">
            <div className="op-field">
              <label htmlFor="ls-storage">Bảo quản</label>
              <select id="ls-storage" className="op-select" value={storage} onChange={(e) => setStorage(e.target.value as StorageType)}>
                <option value="Fresh">Tươi sống</option>
                <option value="Frozen">Cấp đông</option>
              </select>
            </div>
            {storage === 'Frozen' && (
              <div className="op-field">
                <label htmlFor="ls-frozen">Ngày cấp đông (trống = hôm nay)</label>
                <input id="ls-frozen" type="date" className="op-input" value={frozenAt} onChange={(e) => setFrozenAt(e.target.value)} />
              </div>
            )}
            <div className="op-field">
              <label htmlFor="ls-price">Giá bán (đồng/kg)</label>
              <input id="ls-price" type="number" min={1000} step={1000} required className="op-input" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="op-field">
            <label htmlFor="ls-title">Tên hiển thị (trống để hệ thống đặt theo loại cua, hạng, lô)</label>
            <input id="ls-title" className="op-input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {create.error && <OpNote tone="danger">{errorMessage(create.error)}</OpNote>}
          <div className="flex flex-wrap gap-2">
            <OpBtn type="submit" disabled={create.isPending || !choice || !price}>Lưu bản nháp</OpBtn>
            <OpBtn type="button" variant="ghost" onClick={onDone}>Huỷ</OpBtn>
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
    <form onSubmit={submit} className="op-subform">
      <div className="op-field">
        <label htmlFor={`pr-${listing.listingId}`}>Giá mới (đồng/kg)</label>
        <input id={`pr-${listing.listingId}`} type="number" min={1000} step={1000} required className="op-input" value={price} onChange={(e) => setPrice(e.target.value)} />
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
      <div className="is-wide">
        {preview?.isFlagged ? (
          <OpNote tone="danger">
            Giá này lệch đáng kể so với giao dịch tương đồng. Bạn vẫn lưu được; nhà đầu tư của lô sẽ thấy cờ này cùng lý do bạn chọn.
          </OpNote>
        ) : (
          <PriceCheckLine check={preview} />
        )}
      </div>
      {change.error && <div className="is-wide"><OpNote tone="danger">{errorMessage(change.error)}</OpNote></div>}
      <div className="is-wide flex flex-wrap gap-2">
        <OpBtn type="submit" sm disabled={change.isPending || !value || value === listing.pricePerKg}>Lưu giá mới</OpBtn>
        <OpBtn type="button" sm variant="ghost" onClick={onDone}>Huỷ</OpBtn>
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
      <div className="op-listing">
        <div className="op-listing__media">
          <div className="op-listing__img">
            {img ? <img src={img} alt={listing.title} /> : <Store size={40} />}
          </div>
          {!closed && (
            <label className="rd-btn rd-btn--ghost rd-btn--sm rd-btn--block cursor-pointer">
              <ImagePlus size={16} /> {img ? 'Đổi ảnh' : 'Tải ảnh'}
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

        <div className="op-listing__body">
          <div className="op-listing__tags">
            <OpBadge tone={STATUS_TONE[listing.status]}>{STATUS_LABELS[listing.status]}</OpBadge>
            <OpBadge tone="gold">Lô {listing.batchCode}</OpBadge>
            <OpBadge>{listing.gradeName}</OpBadge>
            <OpBadge tone="info">{listing.storageType === 'Frozen' ? 'Cấp đông' : 'Tươi sống'}</OpBadge>
          </div>
          <h3 className="rd-h3">{listing.title}</h3>
          <p className="op-big">{formatVnd(listing.pricePerKg)} <small>/ kg</small></p>
          <OpFacts
            items={[
              { label: 'Tồn kho', value: kg(listing.stockQtyKg) },
              { label: 'Đang giữ cho đơn', value: kg(listing.reservedQtyKg) },
              { label: 'Còn bán được', value: kg(listing.availableQtyKg), tone: listing.availableQtyKg > 0 ? 'ok' : 'warn' },
            ]}
          />
          <p className="op-listing__meta">
            {listing.harvestedAt && <>Thu hoạch {formatDate(listing.harvestedAt)} · </>}
            {listing.frozenAt && <>Cấp đông {formatDate(listing.frozenAt)} · </>}
            {listing.sellUntil && <>Bán tới {formatDate(listing.sellUntil)} · </>}
            {listing.farmName}
          </p>

          {!closed && (
            <div className="flex flex-wrap gap-2">
              {listing.status === 'Draft' && (
                <OpBtn sm onClick={() => publish.mutate(listing.listingId)} disabled={publish.isPending}>Đăng bán</OpBtn>
              )}
              <OpBtn sm variant="ink" onClick={() => setEditingPrice((v) => !v)}>Đổi giá</OpBtn>
              <OpBtn sm variant="ghost" onClick={() => refresh.mutate(listing.listingId)} disabled={refresh.isPending}>
                <RefreshCw size={14} /> Cập nhật tồn
              </OpBtn>
              <OpBtn
                sm
                variant="ghost"
                onClick={() => { if (window.confirm('Ngừng bán niêm yết này? Không mở lại được.')) close.mutate(listing.listingId) }}
                disabled={close.isPending}
              >
                <X size={14} /> Ngừng bán
              </OpBtn>
            </div>
          )}
          {error && <OpNote tone="danger">{errorMessage(error)}</OpNote>}
          {editingPrice && <ChangePriceForm listing={listing} onDone={() => setEditingPrice(false)} />}
        </div>
      </div>

      <div className="op-tablewrap">
        <table className="op-table">
          <thead>
            <tr><th>Thời điểm</th><th>Giá</th><th>Lý do</th><th>Người đổi</th><th>So sánh</th></tr>
          </thead>
          <tbody>
            {listing.priceHistory.map((h) => (
              <tr key={h.priceHistoryId}>
                <td className="whitespace-nowrap op-muted">{formatDateTime(h.effectiveFrom)}</td>
                <td className="whitespace-nowrap">
                  {h.previousPricePerKg !== null && <span className="op-muted line-through mr-2">{formatVnd(h.previousPricePerKg)}</span>}
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
  const selling = listings.filter((l) => l.status === 'Published')

  return (
    <OperatorLayout activeTab="listings">
      <OpHeading
        eyebrow="Cửa hàng"
        title="Niêm yết sản phẩm"
        description="Bạn tự đặt và đổi giá. Mọi lần đổi giá được lưu công khai cho nhà đầu tư của lô; giá lệch nhiều so với giao dịch tương đồng chỉ bị gắn cờ, không bị chặn."
        action={!creating && <OpBtn onClick={() => setCreating(true)}><Plus size={16} /> Tạo niêm yết</OpBtn>}
      />

      {listings.length > 0 && (
        <OpFacts
          items={[
            { label: 'Đang bán', value: selling.length, tone: 'ok' },
            { label: 'Bản nháp', value: listings.filter((l) => l.status === 'Draft').length },
            { label: 'Hết hàng', value: listings.filter((l) => l.status === 'SoldOut').length, tone: 'warn' },
            { label: 'Còn bán được', value: kg(selling.reduce((s, l) => s + l.availableQtyKg, 0)) },
          ]}
        />
      )}

      <div className="op-stack">
        {creating && <CreateListingForm onDone={() => setCreating(false)} />}
        {isLoading && <p className="op-muted">Đang tải…</p>}
        {error && <OpNote tone="danger">{errorMessage(error)}</OpNote>}
        {!isLoading && !error && listings.length === 0 && !creating && (
          <div className="op-panel op-empty">
            <Store size={44} />
            <b>Chưa có niêm yết</b>
            <span>Sau khi cân và xếp hạng cua thu hoạch, tạo niêm yết để đưa lên cửa hàng.</span>
          </div>
        )}
        {listings.map((l) => <ListingCard key={l.listingId} listing={l} />)}
      </div>
    </OperatorLayout>
  )
}
