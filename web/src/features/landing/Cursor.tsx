/* Con trỏ tuỳ biến: chấm + vòng trễ nhẹ.
   Chế độ theo phần tử đang rê:
   - a / button            → vòng nở to
   - data-cursor="Chữ"     → vòng đặc có nhãn
   - data-cursor="scan"    → khung quét QR, nhãn lấy từ data-cursor-label
   - data-cursor="hide"    → ẩn (dùng con trỏ hệ thống, ví dụ thanh kéo)
   Chỉ bật với chuột (hover + pointer fine). Cập nhật DOM trực tiếp, không render lại React. */
import { useEffect, useRef, useState } from 'react'

const QUERY = '(hover: hover) and (pointer: fine)'

export default function Cursor() {
  const [enabled, setEnabled] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches)
  const rootRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const on = () => setEnabled(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const root = rootRef.current
    const dot = dotRef.current
    const ring = ringRef.current
    const label = labelRef.current
    if (!root || !dot || !ring || !label) return
    const host = root.closest('.cse')
    host?.classList.add('has-cursor')

    let x = -100, y = -100, rx = -100, ry = -100, raf = 0, seen = false, last = ''
    const setMode = (mode: string, text: string) => {
      const key = `${mode}|${text}`
      if (key === last) return
      last = key
      root.dataset.mode = mode
      label.textContent = text
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== 'mouse') return
      x = e.clientX
      y = e.clientY
      if (!seen) {
        seen = true
        rx = x
        ry = y
        root.classList.remove('is-out')
      }
    }
    const onOver = (e: Event) => {
      const t = e.target as Element | null
      const el = t && typeof t.closest === 'function' ? t.closest<HTMLElement>('[data-cursor], a, button, input, [role="tab"]') : null
      if (!el) return setMode('', '')
      const c = el.getAttribute('data-cursor')
      if (c === 'scan') return setMode('scan', el.getAttribute('data-cursor-label') ?? '')
      if (c === 'hide') return setMode('hide', '')
      if (c) return setMode('label', c)
      if (el.tagName === 'INPUT') return setMode('hide', '')
      setMode('link', '')
    }
    const onLeave = () => {
      seen = false
      root.classList.add('is-out')
    }
    const onDown = () => root.classList.add('is-down')
    const onUp = () => root.classList.remove('is-down')
    const loop = () => {
      rx += (x - rx) * 0.2
      ry += (y - ry) * 0.2
      dot.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
      ring.style.transform = `translate3d(${rx.toFixed(2)}px, ${ry.toFixed(2)}px, 0) translate(-50%, -50%)`
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerover', onOver, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      host?.classList.remove('has-cursor')
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerover', onOver)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
    }
  }, [enabled])

  if (!enabled) return null
  return (
    <div ref={rootRef} className="cse-cursor is-out" data-mode="" aria-hidden="true">
      <div ref={ringRef} className="cse-cursor__ring">
        <i className="cse-cursor__c c1" />
        <i className="cse-cursor__c c2" />
        <i className="cse-cursor__c c3" />
        <i className="cse-cursor__c c4" />
        <b className="cse-cursor__scan" />
        <span ref={labelRef} className="cse-cursor__label" />
      </div>
      <div ref={dotRef} className="cse-cursor__dot" />
    </div>
  )
}
