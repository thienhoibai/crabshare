import { useEffect, useRef, useState } from 'react'
import { Bell, Check, RefreshCw, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '../../../shared/auth/authStore'
import { errorMessage } from '../../../shared/api/http'
import { formatDateTime } from '../../../shared/lib/format'
import { isUnread, loadMarker, markerKey, markAll, useNotifications, type ReadMarker } from './notificationsApi'
import './notifications.css'

export default function NotificationBell() {
  const user = useAuthStore((s) => s.user)
  return user?.roles.includes('Investor') ? <AccountBell key={user.userId} userId={user.userId} /> : null
}
function AccountBell({ userId }: { userId: number }) {
  const query = useNotifications(); const navigate = useNavigate()
  const [open, setOpen] = useState(false); const [marker, setMarker] = useState(() => loadMarker(userId)); const [saveError, setSaveError] = useState('')
  const root = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null)
  const items = query.data ?? []; const count = items.filter((n) => isUnread(n, marker)).length
  useEffect(() => {
    const storage = (e: StorageEvent) => { if (e.key === markerKey(userId) || e.key == null) setMarker(loadMarker(userId)) }
    window.addEventListener('storage', storage); return () => window.removeEventListener('storage', storage)
  }, [userId])
  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  function save(next: ReadMarker) {
    try { localStorage.setItem(markerKey(userId), JSON.stringify(next)); setMarker(next); setSaveError('') }
    catch { setSaveError('Không lưu được mốc đã đọc trên thiết bị này.') }
  }
  return <div className="nf" ref={root}>
    <button ref={trigger} type="button" className="rd-iconbtn nf-trigger" aria-label={count ? `Thông báo, ${count} chưa đọc` : 'Thông báo'} aria-expanded={open} aria-controls="investor-notifications" onClick={() => setOpen(!open)}>
      <Bell size={18} />{count > 0 && <span className="nf-count">{count > 99 ? '99+' : count}</span>}
    </button>
    {open && <section className="nf-panel iv-card" id="investor-notifications" aria-label="Danh sách thông báo">
      <div className="nf-head"><h2 className="rd-h3">Thông báo</h2><button className="rd-iconbtn" aria-label="Đóng thông báo" onClick={() => { setOpen(false); trigger.current?.focus() }}><X size={18} /></button></div>
      <div className="nf-head"><span className="rd-muted">{query.isError ? 'Chưa cập nhật được' : query.isPending ? 'Đang cập nhật…' : `${count} chưa đọc`}</span><div className="nf-actions"><button className="rd-btn rd-btn--ghost rd-btn--sm" aria-label="Làm mới thông báo" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={14} /></button><button className="rd-btn rd-btn--ghost rd-btn--sm" disabled={query.isPending || query.isError || !count} onClick={() => save(markAll(items, marker))}><Check size={14} />Đọc tất cả</button></div></div>
      {saveError && <p role="alert" className="nf-error">{saveError}</p>}
      {query.isPending ? <p role="status">Đang tải thông báo…</p> : query.isError ? <div role="alert" className="nf-error"><p>{errorMessage(query.error)}</p><button className="rd-btn rd-btn--ghost" onClick={() => void query.refetch()}>Thử lại</button></div> : items.length === 0 ? <p className="nf-empty">Chưa có thông báo.</p> : <div className="nf-list">{items.map((n) => <article className={`nf-item${isUnread(n, marker) ? ' is-unread' : ''}`} key={n.id} data-testid={`notification-${n.id}`}>
        <div className="nf-item__title"><Bell size={16} /><strong>{n.title}</strong>{isUnread(n, marker) && <span className="nf-dot" aria-label="Chưa đọc" />}</div>
        <p>{n.body}</p><time dateTime={n.at}>{formatDateTime(n.at)}</time>
        <div className="nf-actions">{n.canOpenPortfolio && <button className="iv-link" onClick={() => { save({ ...marker, itemIds: [...new Set([...marker.itemIds, n.id])] }); setOpen(false); navigate(`/nha-dau-tu/danh-muc/${encodeURIComponent(n.batchCode)}`) }}>Xem lô {n.batchCode}</button>}{isUnread(n, marker) && <button className="iv-link" aria-label={`Đánh dấu đã đọc: ${n.title}`} onClick={() => save({ ...marker, itemIds: [...new Set([...marker.itemIds, n.id])] })}>Đã đọc</button>}</div>
      </article>)}</div>}
      <p className="rd-note">Mốc đã đọc được lưu riêng cho tài khoản trên thiết bị này.</p>
    </section>}
  </div>
}
