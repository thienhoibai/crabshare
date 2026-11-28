import { useEffect, useRef, useState } from 'react'
import { TermsBody, TERMS_UPDATED } from '../public/TermsPage'

/** Cửa sổ nổi đọc điều khoản. Chỉ bật nút xác nhận khi đã cuộn tới cuối. */
export default function TermsDialog({ open, onClose, onRead }: { open: boolean; onClose: () => void; onRead: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [atEnd, setAtEnd] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) { setAtEnd(false); d.showModal() }
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={ref} className="terms-dialog" aria-labelledby="terms-dialog-title" onClose={onClose}>
      <header className="terms-dialog__head">
        <h2 id="terms-dialog-title">Điều khoản sử dụng</h2>
        <p>Cập nhật {TERMS_UPDATED}. Cuộn hết để xác nhận đã đọc.</p>
      </header>
      <div
        className="terms-dialog__body"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 8) setAtEnd(true)
        }}
      >
        {open && <TermsBody />}
      </div>
      <footer className="terms-dialog__foot">
        <button type="button" className="terms-dialog__btn" onClick={onClose}>Đóng</button>
        <button type="button" className="terms-dialog__btn terms-dialog__btn--primary" disabled={!atEnd} onClick={onRead}>
          {atEnd ? 'Tôi đã đọc xong' : 'Cuộn xuống cuối để tiếp tục'}
        </button>
      </footer>
    </dialog>
  )
}

