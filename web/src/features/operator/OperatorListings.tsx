import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, ImagePlus, Plus, RefreshCw, Store, X } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { formatDate, formatDateTime, formatVnd, moneyToWords } from '../../shared/lib/format'
import { Breadcrumbs } from '../../shared/ui/Breadcrumbs'
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
  const [displayPrice, setDisplayPrice] = useState('')
  const numericPrice = Number(displayPrice.replace(/\D/g, ''))

  useEffect(() => {
    if (!choice && free.length > 0) setChoice(`${free[0].batchCode}|${free[0].gradeCode}`)
  }, [choice, free])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (numericPrice < 1000) return
    const [batchCode, gradeCode] = choice.split('|')
    create.mutate(
      {
        batchCode,
        gradeCode,
        storageType: storage,
        frozenAt: storage === 'Frozen' && frozenAt ? new Date(`${frozenAt}T00:00:00+07:00`).toISOString() : undefined,
        title: title.trim() || undefined,
        pricePerKg: numericPrice,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <OpPanel title="Tạo niêm yết" subtitle="Lô đang thu hoạch lấy tồn đã cân; lô đang nuôi (đặt trước) tồn 0, trần kg do hệ thống giữ." accent>
      {isLoading ? (
        <p className="op-muted">Đang tải…</p>
      ) : free.length === 0 ? (
        <>
          <OpNote>Không còn hạng nào của lô đang thu hoạch chưa có niêm yết. Kể cả lô đang nuôi (đặt trước) nếu chưa niêm yết hạng đó.</OpNote>
          <OpBtn type="button" variant="ghost" sm onClick={onDone} className="justify-self-start">Đóng</OpBtn>
        </>
      ) : (
        <form onSubmit={submit} className="op-form">
          <div className="op-field">
            <label htmlFor="ls-choice">Lô + hạng</label>
            <select id="ls-choice" className="op-select" value={choice} onChange={(e) => setChoice(e.target.value)}>
              {free.map((o) => (
                <option key={`${o.batchCode}|${o.gradeCode}`} value={`${o.batchCode}|${o.gradeCode}`}>
                  {o.batchCode} · {CRAB_TYPE_LABELS[o.crabType] ?? o.crabType} · {o.gradeName}
                  {o.batchStatus === 'InProduction'
                    ? ' — Đặt trước · đang nuôi'
                    : ` — ${o.inStockCount} con, ${kg(o.inStockKg)}`}
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
              <input
                id="ls-price"
                type="text"
                inputMode="numeric"
                required
                className="op-input"
                placeholder="Ví dụ: 520.000"
                value={displayPrice}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '')
                  if (!raw) {
                    setDisplayPrice('')
                    return
                  }
                  setDisplayPrice(new Intl.NumberFormat('vi-VN').format(Number(raw)))
                }}
              />
              {numericPrice > 0 && (
                <p className="text-xs text-orange-600 font-medium mt-1">
                  Bằng chữ: {moneyToWords(numericPrice)} / kg
                </p>
              )}
            </div>
          </div>
          <div className="op-field">
            <label htmlFor="ls-title">Tên hiển thị (trống để hệ thống đặt theo loại cua, hạng, lô)</label>
            <input id="ls-title" className="op-input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {create.error && <OpNote tone="danger">{errorMessage(create.error)}</OpNote>}
          <div className="flex flex-wrap gap-2">
            <OpBtn type="submit" disabled={create.isPending || !choice || numericPrice < 1000}>Lưu bản nháp</OpBtn>
            <OpBtn type="button" variant="ghost" onClick={onDone}>Huỷ</OpBtn>
          </div>
        </form>
      )}
    </OpPanel>
  )
}

function ChangePriceForm({ listing, onDone }: { listing: Listing; onDone: () => void }) {
  const change = useChangePrice()
  const [displayPrice, setDisplayPrice] = useState(
    new Intl.NumberFormat('vi-VN').format(listing.pricePerKg),
  )
  const [reason, setReason] = useState<PriceChangeReason>('Market')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<PriceCheck | null>(null)

  const value = Number(displayPrice.replace(/\D/g, ''))
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
    if (value < 1000) return
    change.mutate({ id: listing.listingId, pricePerKg: value, reason, note: note.trim() || undefined }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} className="op-subform">
      <div className="op-field">
        <label htmlFor={`pr-${listing.listingId}`}>Giá mới (đồng/kg)</label>
        <input
          id={`pr-${listing.listingId}`}
          type="text"
          inputMode="numeric"
          required
          className="op-input"
          placeholder="Ví dụ: 520.000"
          value={displayPrice}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '')
            if (!raw) {
              setDisplayPrice('')
              return
            }
            setDisplayPrice(new Intl.NumberFormat('vi-VN').format(Number(raw)))
          }}
        />
        {value > 0 && (
          <p className="text-xs text-orange-600 font-medium mt-1">
            Bằng chữ: {moneyToWords(value)} / kg
          </p>
        )}
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
            {listing.hiddenAt && <OpBadge tone="danger">Bị ẩn khỏi cửa hàng</OpBadge>}
          </div>
          <h3 className="rd-h3">{listing.title}</h3>
          {listing.hiddenAt && (
            <OpNote tone="danger">
              Quản trị đã ẩn niêm yết này lúc {formatDateTime(listing.hiddenAt)}: {listing.hiddenReason}. Khách không còn thấy và không đặt được.
            </OpNote>
          )}
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

interface BatchGroup {
  batchCode: string
  batchTitle: string
  crabType: string
  harvestedAt: string | null
  farmName: string
  listings: Listing[]
  availableKg: number
  stockKg: number
}

function BatchCard({
  batch,
  onSelect,
}: {
  batch: BatchGroup
  onSelect: () => void
}) {
  return (
    <OpPanel accent>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <OpBadge tone="gold">Lô {batch.batchCode}</OpBadge>
            <OpBadge tone="info">{CRAB_TYPE_LABELS[batch.crabType] ?? batch.crabType}</OpBadge>
            {batch.harvestedAt && (
              <span className="text-xs op-muted">Thu hoạch {formatDate(batch.harvestedAt)}</span>
            )}
          </div>
          <h3 className="rd-h3">{batch.batchTitle}</h3>
          <p className="text-sm op-muted mt-1">{batch.farmName}</p>
        </div>

        <div className="flex items-center gap-5 flex-wrap">
          <div className="text-right">
            <p className="text-xs op-muted">Các hạng đang bán</p>
            <p className="text-lg font-bold text-slate-900">{batch.listings.length} hạng</p>
          </div>
          <div className="text-right">
            <p className="text-xs op-muted">Còn bán được</p>
            <p className="text-lg font-bold text-emerald-600">{kg(batch.availableKg)}</p>
          </div>
          <OpBtn sm onClick={onSelect} className="whitespace-nowrap">
            Xem các hạng <ArrowRight size={14} className="ml-1" />
          </OpBtn>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap gap-2">
        {batch.listings.map((l) => (
          <span
            key={l.listingId}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 text-xs font-medium text-slate-700"
          >
            <span>{l.gradeName}</span>
            <b className="text-slate-900">{formatVnd(l.pricePerKg)}</b>
            <small className="op-muted">({kg(l.availableQtyKg)})</small>
          </span>
        ))}
      </div>
    </OpPanel>
  )
}

function BatchListingRow({
  listing,
  onOpenDetail,
}: {
  listing: Listing
  onOpenDetail: () => void
}) {
  const img = listingImageSrc(listing)
  const isFlagged = listing.priceHistory[0]?.flaggedAbnormal

  return (
    <OpPanel>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-200">
            {img ? <img src={img} alt={listing.title} className="w-full h-full object-cover" /> : <Store size={24} className="text-slate-400" />}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <OpBadge tone={STATUS_TONE[listing.status]}>{STATUS_LABELS[listing.status]}</OpBadge>
              <OpBadge>{listing.gradeName}</OpBadge>
              <OpBadge tone="info">{listing.storageType === 'Frozen' ? 'Cấp đông' : 'Tươi sống'}</OpBadge>
              {isFlagged && <OpBadge tone="danger">Lệch bất thường</OpBadge>}
            </div>
            <h4 className="font-bold text-slate-900">{listing.title}</h4>
            <p className="text-lg font-bold text-orange-600 mt-0.5">
              {formatVnd(listing.pricePerKg)} <small className="text-xs text-slate-500 font-normal">/ kg</small>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs op-muted">Còn bán</p>
            <p className="font-bold text-emerald-600">{kg(listing.availableQtyKg)}</p>
          </div>
          <OpBtn sm onClick={onOpenDetail}>
            Chi tiết & Đổi giá <ArrowRight size={14} className="ml-1" />
          </OpBtn>
        </div>
      </div>
    </OpPanel>
  )
}

export default function OperatorListings() {
  const { data: listings = [], isLoading, error } = useMyListings()
  const [creating, setCreating] = useState(false)
  const [selectedBatchCode, setSelectedBatchCode] = useState<string | null>(null)
  const [selectedListingId, setSelectedListingId] = useState<number | null>(null)

  const selling = listings.filter((l) => l.status === 'Published')

  // Gom nhóm danh sách niêm yết theo Lô
  const batches = listings.reduce<BatchGroup[]>((acc, l) => {
    let b = acc.find((item) => item.batchCode === l.batchCode)
    if (!b) {
      b = {
        batchCode: l.batchCode,
        batchTitle: l.batchTitle,
        crabType: l.crabType,
        harvestedAt: l.harvestedAt,
        farmName: l.farmName,
        listings: [],
        availableKg: 0,
        stockKg: 0,
      }
      acc.push(b)
    }
    b.listings.push(l)
    b.availableKg += l.availableQtyKg
    b.stockKg += l.stockQtyKg
    return acc
  }, [])

  const currentBatch = selectedBatchCode ? batches.find((b) => b.batchCode === selectedBatchCode) : null
  const currentListing = selectedListingId ? listings.find((l) => l.listingId === selectedListingId) : null

  // Điều hướng Breadcrumbs theo cấp độ
  const breadcrumbItems = !selectedBatchCode
    ? [{ label: 'Quản lý lô' }]
    : !selectedListingId
      ? [
          { label: 'Quản lý lô', onClick: () => { setSelectedBatchCode(null); setSelectedListingId(null) } },
          { label: `Lô ${selectedBatchCode}` },
        ]
      : [
          { label: 'Quản lý lô', onClick: () => { setSelectedBatchCode(null); setSelectedListingId(null) } },
          { label: `Lô ${selectedBatchCode}`, onClick: () => setSelectedListingId(null) },
          { label: currentListing?.title ?? 'Chi tiết' },
        ]

  const handleBack = () => {
    if (selectedListingId !== null) {
      setSelectedListingId(null)
    } else if (selectedBatchCode !== null) {
      setSelectedBatchCode(null)
    } else {
      window.location.href = '/operator'
    }
  }

  return (
    <OperatorLayout activeTab="listings">
      <Breadcrumbs items={breadcrumbItems} onBack={handleBack} fallbackHref="/operator" />

      {/* Cấp 1: Tổng quan tất cả các lô */}
      {!selectedBatchCode && (
        <>
          <OpHeading
            eyebrow="Cửa hàng"
            title="Quản lý niêm yết theo Lô"
            description="Quản lý giá và sản lượng theo từng lô thu hoạch. Chọn một lô bên dưới để xem và điều chỉnh các hạng cua của lô đó."
            action={!creating && <OpBtn onClick={() => setCreating(true)}><Plus size={16} /> Tạo niêm yết mới</OpBtn>}
          />

          {listings.length > 0 && (
            <OpFacts
              items={[
                { label: 'Số lô đang bán', value: batches.length, tone: 'ok' },
                { label: 'Tổng mặt hàng', value: selling.length },
                { label: 'Bản nháp', value: listings.filter((l) => l.status === 'Draft').length },
                { label: 'Còn bán được', value: kg(selling.reduce((s, l) => s + l.availableQtyKg, 0)) },
              ]}
            />
          )}

          <div className="op-stack">
            {creating && <CreateListingForm onDone={() => setCreating(false)} />}
            {isLoading && <p className="op-muted">Đang tải…</p>}
            {error && <OpNote tone="danger">{errorMessage(error)}</OpNote>}
            {!isLoading && !error && batches.length === 0 && !creating && (
              <div className="op-panel op-empty">
                <Store size={44} />
                <b>Chưa có niêm yết nào</b>
                <span>Sau khi cân và xếp hạng cua thu hoạch, tạo niêm yết để đưa lên cửa hàng.</span>
              </div>
            )}
            {batches.map((b) => (
              <BatchCard key={b.batchCode} batch={b} onSelect={() => setSelectedBatchCode(b.batchCode)} />
            ))}
          </div>
        </>
      )}

      {/* Cấp 2: Danh sách các hạng cua trong Lô được chọn */}
      {selectedBatchCode && !selectedListingId && (
        <>
          <OpHeading
            eyebrow={`Lô ${selectedBatchCode}`}
            title={`Danh sách các hạng của Lô ${selectedBatchCode}`}
            description={currentBatch?.batchTitle ?? 'Các sản phẩm niêm yết thuộc lô thu hoạch này.'}
            action={!creating && <OpBtn onClick={() => setCreating(true)}><Plus size={16} /> Thêm hạng niêm yết</OpBtn>}
          />

          {currentBatch && (
            <OpFacts
              items={[
                { label: 'Số hạng cua', value: currentBatch.listings.length, tone: 'ok' },
                { label: 'Tổng tồn kho', value: kg(currentBatch.stockKg) },
                { label: 'Còn bán được', value: kg(currentBatch.availableKg), tone: currentBatch.availableKg > 0 ? 'ok' : 'warn' },
                { label: 'Loại cua', value: CRAB_TYPE_LABELS[currentBatch.crabType] ?? currentBatch.crabType },
              ]}
            />
          )}

          <div className="op-stack">
            {creating && <CreateListingForm onDone={() => setCreating(false)} />}
            {currentBatch?.listings.map((l) => (
              <BatchListingRow key={l.listingId} listing={l} onOpenDetail={() => setSelectedListingId(l.listingId)} />
            ))}
          </div>
        </>
      )}

      {/* Cấp 3: Chi tiết & Đổi giá của 1 Hạng cụ thể */}
      {selectedListingId && currentListing && (
        <div className="op-stack">
          <ListingCard listing={currentListing} />
        </div>
      )}
    </OperatorLayout>
  )
}
