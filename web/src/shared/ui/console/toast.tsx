/* Thông báo nổi ở góc màn hình. Gọi toast('Đã lưu.') ở bất kỳ đâu; <ToastHost /> đặt một lần trong khung gốc. */
import { useSyncExternalStore } from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'

export type ToastTone = 'ok' | 'danger' | 'info'
type Item = { id: number; text: string; tone: ToastTone }

let items: Item[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(text: string, tone: ToastTone = 'ok') {
  const id = nextId++
  items = [...items.slice(-3), { id, text, tone }]
  emit()
  window.setTimeout(() => {
    items = items.filter((i) => i.id !== id)
    emit()
  }, tone === 'danger' ? 7000 : 4000)
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function ToastHost() {
  const list = useSyncExternalStore(subscribe, () => items)
  return (
    <div className="op-toasts" aria-live="polite">
      {list.map((t) => {
        const Icon = t.tone === 'danger' ? AlertTriangle : t.tone === 'info' ? Info : CheckCircle2
        return (
          <div key={t.id} className={`op-toast ${t.tone === 'ok' ? '' : `is-${t.tone}`}`} role={t.tone === 'danger' ? 'alert' : 'status'}>
            <Icon size={18} />
            <span>{t.text}</span>
          </div>
        )
      })}
    </div>
  )
}
