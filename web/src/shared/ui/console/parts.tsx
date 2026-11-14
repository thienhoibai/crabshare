/* Thành phần bổ sung cho BR v1.5: form, tab, bảng, trạng thái tải, ảnh chụp, ảnh cần đăng nhập, hộp xác nhận.
   Cùng lớp op-* với ui.tsx. Ví dụ dùng ở cuối README.md cùng thư mục. */
import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Camera, ImageOff, Inbox, RefreshCw } from 'lucide-react'
import { errorMessage } from '../../api/http'
import { useBlobUrl } from '../../api/hooks'
import { formatVnd } from '../../lib/format'
import { Bar } from '../kit/kit'
import { label as statusLabel, tone as statusTone, type StatusKind } from './status'
import { OpBadge, OpBtn, OpModal, OpNote } from './ui'

/* ---------- form ---------- */

/** Nhãn + ô nhập + gợi ý hoặc lỗi. Bọc quanh Input, Select, TextArea, MoneyInput, OpPhoto. */
export function Field({ label, hint, error, required, children, className = '' }: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`op-field ${error ? 'is-error' : ''} ${className}`}>
      <span className="op-label">{label}{required && <b className="op-danger" aria-hidden="true">*</b>}</span>
      {children}
      {error ? <span className="op-field__error">{error}</span> : hint ? <span className="op-field__hint">{hint}</span> : null}
    </label>
  )
}

export function Input({ className = '', sm, ...props }: InputHTMLAttributes<HTMLInputElement> & { sm?: boolean }) {
  return <input className={`op-input ${sm ? 'op-input--sm' : ''} ${className}`} {...props} />
}

export function Select({ className = '', sm, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { sm?: boolean }) {
  return <select className={`op-select ${sm ? 'op-select--sm' : ''} ${className}`} {...props}>{children}</select>
}

export function TextArea({ className = '', rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`op-textarea ${className}`} rows={rows} {...props} />
}

const digits = (text: string) => text.replace(/\D/g, '')

/** Ô nhập số nguyên có dấu chấm ngăn hàng nghìn và đơn vị ở cuối (mặc định "đ"). value = null khi để trống. */
export function NumberInput({ value, onChange, unit, max, className = '', sm, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'max'> & {
  value: number | null
  onChange: (value: number | null) => void
  unit?: string
  max?: number
  sm?: boolean
}) {
  const shown = value === null || Number.isNaN(value) ? '' : new Intl.NumberFormat('vi-VN').format(value)
  const input = (
    <input
      className={`op-input ${sm ? 'op-input--sm' : ''} ${className}`}
      inputMode="numeric"
      value={shown}
      onChange={(e) => {
        const raw = digits(e.target.value)
        if (!raw) return onChange(null)
        const n = Number(raw)
        onChange(max !== undefined ? Math.min(n, max) : n)
      }}
      {...props}
    />
  )
  return unit ? <span className="op-affix">{input}<span>{unit}</span></span> : input
}

/** Ô nhập tiền là số nguyên đồng. */
export function MoneyInput(props: Omit<Parameters<typeof NumberInput>[0], 'unit'>) {
  return <NumberInput unit="đ" {...props} />
}

/** Ô nhập số thập phân (kg, °C, pH). Giữ chuỗi người dùng gõ, trả số qua onChange (null khi trống hoặc chưa hợp lệ). */
export function DecimalInput({ value, onChange, unit, className = '', sm, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | null
  onChange: (value: number | null) => void
  unit?: string
  sm?: boolean
}) {
  const [text, setText] = useState(value === null ? '' : String(value).replace('.', ','))
  useEffect(() => {
    const parsed = text === '' ? null : Number(text.replace(',', '.'))
    if (parsed !== value && !(Number.isNaN(parsed) && value === null)) setText(value === null ? '' : String(value).replace('.', ','))
    // chỉ đồng bộ khi giá trị bên ngoài đổi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const input = (
    <input
      className={`op-input ${sm ? 'op-input--sm' : ''} ${className}`}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const next = e.target.value.replace(/[^\d.,-]/g, '')
        setText(next)
        const n = next === '' ? null : Number(next.replace(',', '.'))
        onChange(n === null || Number.isNaN(n) ? null : n)
      }}
      {...props}
    />
  )
  return unit ? <span className="op-affix">{input}<span>{unit}</span></span> : input
}

/** Nhóm lựa chọn dạng thẻ (một trong nhiều). */
export function RadioCards<T extends string>({ name, value, onChange, options }: {
  name?: string
  value: T | null
  onChange: (value: T) => void
  options: { value: T; label: string; hint?: string; disabled?: boolean }[]
}) {
  const auto = useId()
  return (
    <div className="op-radio" role="radiogroup">
      {options.map((o) => (
        <label key={o.value}>
          <input type="radio" name={name ?? auto} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} />
          <b>{o.label}</b>
          {o.hint && <small>{o.hint}</small>}
        </label>
      ))}
    </div>
  )
}

/** Ô đánh dấu có nhãn. */
export function Checkbox({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className="op-check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

/**
 * Ảnh chụp trong app. Trên điện thoại mở thẳng camera sau; trên máy tính mở hộp chọn tệp ảnh.
 * Các quy tắc BR yêu cầu ảnh chụp tại chỗ (ảnh hộp, ảnh cua chết, ảnh kiểm phẩm) dùng thành phần này.
 */
export function OpPhoto({ value, onChange, label = 'Chụp ảnh', hint, capture = 'environment' }: {
  value: File | null
  onChange: (file: File | null) => void
  label?: string
  hint?: string
  /** Camera mở trên điện thoại: sau (mặc định) hoặc trước (ảnh chân dung khi xác minh danh tính). */
  capture?: 'environment' | 'user'
}) {
  const [preview, setPreview] = useState('')
  useEffect(() => {
    if (!value) return setPreview('')
    const url = URL.createObjectURL(value)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [value])
  return (
    <span className={`op-photo ${value ? 'has-file' : ''}`}>
      <input type="file" accept="image/*" capture={capture} aria-label={label} onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      {preview ? (
        <>
          <img src={preview} alt="Ảnh vừa chụp" />
          <span className="op-photo__bar"><span>{value?.name}</span><span>Bấm để chụp lại</span></span>
        </>
      ) : (
        <>
          <Camera size={24} />
          <b>{label}</b>
          {hint && <small>{hint}</small>}
        </>
      )}
    </span>
  )
}

/* ---------- tab ---------- */

export type TabItem<T extends string> = { key: T; label: string; count?: number }

export function OpTabs<T extends string>({ items, value, onChange, label = 'Chuyển mục' }: { items: readonly TabItem<T>[]; value: T; onChange: (key: T) => void; label?: string }) {
  return (
    <div className="op-tabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key} className={value === t.key ? 'is-on' : ''} onClick={() => onChange(t.key)}>
          {t.label}{t.count ? <i>{t.count}</i> : null}
        </button>
      ))}
    </div>
  )
}

/* ---------- trạng thái tải ---------- */

export function OpLoading({ label = 'Đang tải…' }: { label?: string }) {
  return <div className="op-state" role="status"><span className="op-spin" />{label}</div>
}

export function OpError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="op-state" role="alert">
      <b>Không tải được dữ liệu</b>
      <span>{errorMessage(error)}</span>
      {onRetry && <OpBtn variant="ghost" sm onClick={onRetry}><RefreshCw size={15} /> Thử lại</OpBtn>}
    </div>
  )
}

export function OpEmpty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="op-empty">
      {icon ?? <Inbox size={30} />}
      <b>{title}</b>
      {children && <span>{children}</span>}
    </div>
  )
}

/**
 * Hiện vòng quay khi đang tải, lỗi kèm nút thử lại, hoặc nội dung khi đã có dữ liệu.
 * <QueryView query={batches} empty="Chưa có Lô nào">{(rows) => ...}</QueryView>
 */
export function QueryView<T>({ query, children, empty, emptyHint }: {
  query: UseQueryResult<T>
  children: (data: T) => ReactNode
  /** Tiêu đề khi dữ liệu là mảng rỗng. */
  empty?: string
  emptyHint?: ReactNode
}) {
  if (query.isPending) return <OpLoading />
  if (query.isError) return <OpError error={query.error} onRetry={() => void query.refetch()} />
  if (empty && Array.isArray(query.data) && query.data.length === 0) return <OpEmpty title={empty}>{emptyHint}</OpEmpty>
  return <>{children(query.data)}</>
}

/* ---------- bảng ---------- */

export type Column<T> = {
  key: string
  header: ReactNode
  cell: (row: T, index: number) => ReactNode
  /** Căn phải cho cột số. */
  num?: boolean
  width?: number | string
}

export function OpTable<T>({ columns, rows, rowKey, empty = 'Chưa có dữ liệu', onRowClick, foot }: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string | number
  empty?: string
  onRowClick?: (row: T) => void
  foot?: ReactNode
}) {
  if (rows.length === 0) return <OpEmpty title={empty} />
  return (
    <div className="op-tablewrap">
      <table className="op-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.num ? 'is-num' : ''} style={c.width ? { width: c.width } : undefined}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} onClick={onRowClick ? () => onRowClick(row) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
              {columns.map((c) => <td key={c.key} className={c.num ? 'is-num' : ''}>{c.cell(row, i)}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && <tfoot>{foot}</tfoot>}
      </table>
    </div>
  )
}

/* ---------- mảnh hiển thị ---------- */

/** Chip trạng thái có nhãn tiếng Việt lấy từ status.ts. */
export function StatusBadge({ kind, value }: { kind: StatusKind; value: string | null | undefined }) {
  if (!value) return null
  return <OpBadge tone={statusTone(kind, value)}>{statusLabel(kind, value)}</OpBadge>
}

/** Số tiền nguyên đồng; null thì hiện gạch. */
export function Money({ value }: { value: number | null | undefined }) {
  return <span className="rd-num">{value === null || value === undefined ? '—' : formatVnd(value)}</span>
}

export type KvItem = { label: string; value: ReactNode }

/** Lưới nhãn và giá trị không viền, cho phần thông tin chung của một hồ sơ. */
export function OpKv({ items }: { items: KvItem[] }) {
  return (
    <dl className="op-kv">
      {items.map((i) => <div key={i.label}><dt>{i.label}</dt><dd>{i.value === null || i.value === undefined || i.value === '' ? '—' : i.value}</dd></div>)}
    </dl>
  )
}

/** Danh sách hai cột nhãn trái, số phải; dòng total in đậm có gạch trên. */
export function OpDl({ items }: { items: (KvItem & { total?: boolean })[] }) {
  return (
    <dl className="op-dl">
      {items.map((i) => (
        <div key={i.label} className="contents">
          <dt className={i.total ? 'is-total' : ''}>{i.label}</dt>
          <dd className={i.total ? 'is-total' : ''}>{i.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Thanh tiến độ có nhãn và số ở trên. */
export function OpMeter({ label, value, max, display, tone }: { label: string; value: number; max: number; display?: ReactNode; tone?: string }) {
  return (
    <div className="op-meter">
      <div className="op-meter__top"><span>{label}</span><b>{display ?? `${value} / ${max}`}</b></div>
      <Bar value={value} max={max > 0 ? max : 1} tone={tone} />
    </div>
  )
}

export type FlowStep = { title: ReactNode; sub?: ReactNode; state?: 'done' | 'now' | 'bad' | 'todo' }

/** Các bước xếp dọc có chấm trạng thái (điều kiện quyết toán, tiến trình đơn, mốc giải ngân). */
export function OpFlow({ steps }: { steps: FlowStep[] }) {
  return (
    <ol className="op-flow">
      {steps.map((s, i) => (
        <li key={i} className={s.state && s.state !== 'todo' ? `is-${s.state}` : ''}>
          <span className="op-flow__dot">{s.state === 'done' ? '✓' : s.state === 'bad' ? '!' : i + 1}</span>
          <div><b>{s.title}</b>{s.sub && <small>{s.sub}</small>}</div>
        </li>
      ))}
    </ol>
  )
}

/** Thẻ trong lưới .op-cards: ảnh, chip, tên, mô tả, chân thẻ. */
export function OpCard({ href, onClick, image, badge, title, sub, children, foot }: {
  href?: string
  onClick?: () => void
  image?: string
  badge?: ReactNode
  title: ReactNode
  sub?: ReactNode
  children?: ReactNode
  foot?: ReactNode
}) {
  const body = (
    <>
      {image && <span className="op-card__media"><img src={image} alt="" loading="lazy" />{badge}</span>}
      <span className="op-card__body">
        {!image && badge}
        <b className="op-card__title">{title}</b>
        {sub && <span className="op-card__sub">{sub}</span>}
        {children}
        {foot && <span className="op-card__foot">{foot}</span>}
      </span>
    </>
  )
  if (href) return <a className="op-card" href={href}>{body}</a>
  if (onClick) return <button type="button" className="op-card" onClick={onClick}>{body}</button>
  return <div className="op-card">{body}</div>
}

/* ---------- ảnh cần đăng nhập ---------- */

/**
 * Ảnh lấy từ endpoint cần JWT (ảnh hộp, ảnh lượt đo, ảnh khiếu nại, ảnh quyết định phân hạng).
 * path là đường dẫn API, ví dụ `/api/device-images/12/file`. Bấm vào để xem lớn.
 */
export function AuthImage({ path, alt, square = false, zoom = true }: { path: string | null | undefined; alt: string; square?: boolean; zoom?: boolean }) {
  const { url, error, loading } = useBlobUrl(path)
  const [open, setOpen] = useState(false)
  const cls = `op-thumb ${square ? 'op-thumb--square' : ''}`
  if (!path) return <span className={cls}><ImageOff size={20} /></span>
  if (loading) return <span className={cls}><span className="op-spin" /></span>
  if (error || !url) return <span className={cls}><span><ImageOff size={20} /><br />Không xem được ảnh</span></span>
  if (!zoom) return <span className={cls}><img src={url} alt={alt} /></span>
  return (
    <>
      <button type="button" className={cls} onClick={() => setOpen(true)} aria-label={`Xem lớn: ${alt}`}><img src={url} alt={alt} /></button>
      {open && <OpModal title={alt} onClose={() => setOpen(false)} wide><img className="op-fullimg" src={url} alt={alt} /></OpModal>}
    </>
  )
}

/* ---------- hộp xác nhận ---------- */

/**
 * Hộp thoại xác nhận một thao tác ghi. children là phần form (lý do, số liệu). Lỗi của mutation hiện ngay trong hộp.
 * <OpConfirm title="Từ chối Lô" confirmLabel="Từ chối" variant="danger" pending={m.isPending} error={m.error}
 *   disabled={!reason.trim()} onConfirm={() => m.mutate({ reason })} onClose={close}>…</OpConfirm>
 */
export function OpConfirm({ title, sub, children, confirmLabel = 'Xác nhận', variant = 'primary', pending, error, disabled, onConfirm, onClose, wide }: {
  title: string
  sub?: string
  children?: ReactNode
  confirmLabel?: string
  variant?: 'primary' | 'ink' | 'danger'
  pending?: boolean
  error?: unknown
  disabled?: boolean
  onConfirm: () => void
  onClose: () => void
  wide?: boolean
}) {
  return (
    <OpModal title={title} sub={sub} onClose={onClose} wide={wide}>
      <form className="op-form" onSubmit={(e) => { e.preventDefault(); if (!pending && !disabled) onConfirm() }}>
        {children}
        {error ? <OpNote tone="danger">{errorMessage(error)}</OpNote> : null}
        <div className="op-modal__foot">
          <OpBtn type="button" variant="ghost" onClick={onClose}>Đóng</OpBtn>
          <OpBtn type="submit" variant={variant} disabled={pending || disabled}>{pending ? 'Đang gửi…' : confirmLabel}</OpBtn>
        </div>
      </form>
    </OpModal>
  )
}
