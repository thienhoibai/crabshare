import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { Download, Expand, ImageOff } from 'lucide-react'
import { ActionDialog } from '../../shared/ui/ActionDialog'
import { timelineFile, type TimelineItem } from './timelineApi'

/** Same authenticated Blob/object-URL mechanism as the existing evidence review UI. */
export function EvidenceMedia({ code, item, onDenied }: { code: string; item: TimelineItem; onDenied: () => void }) {
  const evidence = item.evidence!
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const denied = useRef(onDenied)
  denied.current = onDenied
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '300px' })
    if (host.current) observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    let objectUrl = ''
    setUrl(''); setError('')
    void timelineFile(code, item.sourceId, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl)
    }).catch(failure => {
      if (controller.signal.aborted) return
      if (axios.isAxiosError(failure) && failure.response?.status === 403) denied.current()
      setError('Bằng chứng tạm thời không xem được hoặc không còn được phép công bố.')
    })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [visible, code, item.sourceId, attempt])
  const alt = `Bằng chứng${evidence.slotCode ? ` hộp ${evidence.slotCode}` : ` ${item.sourceId}`}`
  return <div ref={host} className="tl-media">
    {error ? <div className="tl-media-error" role="status"><ImageOff size={24} /><p>{error}</p><button className="tl-button" onClick={() => setAttempt(a => a + 1)}>Tải lại bằng chứng</button></div>
      : !url ? <div className="tl-media-loading" role="status">Đang tải bằng chứng…</div>
        : evidence.mediaType === 'Photo' ? <button className="tl-photo" onClick={() => setExpanded(true)} aria-label={`Xem ảnh bằng chứng ${item.sourceId}`}>
          <img src={url} alt={alt} onError={() => setError('Không đọc được ảnh bằng chứng.')} />
          <span><Expand size={16} /> Xem ảnh đầy đủ</span>
        </button>
          : <a className="tl-button" href={url} download={`bang-chung-${item.sourceId}`}><Download size={18} /> Tải {evidence.mediaType === 'Video' ? 'video' : 'chứng từ'}</a>}
    {expanded && url && <ActionDialog title={alt} onClose={() => setExpanded(false)}><img className="tl-full-photo" src={url} alt={alt} /></ActionDialog>}
  </div>
}
