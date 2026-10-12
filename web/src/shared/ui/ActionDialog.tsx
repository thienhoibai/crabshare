import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import './action-dialog.css'

/** Native modal: focus trapping, Escape, and background inertness supplied by the browser. */
export function ActionDialog({ title, children, onClose, busy = false, theme = 'admin' }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean; theme?: 'admin' | 'operator'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    dialog.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled])')?.focus()
    return () => { dialog.close(); previous?.focus() }
  }, [])
  return <dialog ref={ref} className={`action-dialog action-dialog-${theme}`} aria-labelledby={titleId}
    aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="action-dialog-head">
      <h2 id={titleId}>{title}</h2>
      <button type="button" aria-label="Đóng hộp thoại" disabled={busy} onClick={onClose}><X size={20} /></button>
    </div>
    {children}
  </dialog>
}
