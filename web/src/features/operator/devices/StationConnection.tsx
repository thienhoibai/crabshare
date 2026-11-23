import { useEffect, useState } from 'react'
import { Cable, LoaderCircle, Wifi } from 'lucide-react'
import { formatDateTime } from '../../../shared/ui/console'
import type { RuntimeResponse } from './StationRuntime'

export function StationConnection({ code, report, loading, error, fetching, retry }: {
  code: string
  report?: RuntimeResponse
  loading: boolean
  error: boolean
  fetching: boolean
  retry: () => void
}) {
  const online = !error && !loading && !!(report?.fresh && report.state?.hardwareOnline)
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    setSeconds(0)
    if (online) return
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [online, code])
  const state = report?.state
  const kind = state?.connectionType
  const network = kind === 'wifi' ? 'Wi-Fi' : kind === 'ethernet' ? 'LAN (dây mạng)' : 'Chưa xác định LAN / Wi-Fi'
  const title = error ? 'Chưa liên lạc được với máy chủ'
    : online ? 'Thiết bị đã kết nối'
      : seconds >= 30 ? 'Kết nối lâu hơn dự kiến' : 'Đang chờ Pi kết nối…'
  return (
    <section className={`ga-connection ${online ? 'is-online' : 'is-waiting'}`} aria-label="Kết nối thiết bị" aria-busy={!online}>
      <span className="ga-connection-icon" aria-hidden="true">
        {online ? kind === 'wifi' ? <Wifi size={22} /> : <Cable size={22} /> : <LoaderCircle className="ga-connect-spinner" size={24} />}
      </span>
      <div className="ga-connection-copy">
        <div role="status" aria-live="polite"><strong>{title}</strong></div>
        <p>{online ? `Trạm ${code} · Điều khiển trên web đã sẵn sàng.`
          : error ? 'Kiểm tra BE đang chạy và kết nối mạng của laptop. Web sẽ tự thử lại.'
            : seconds >= 30 ? 'Kiểm tra nguồn Pi, mạng và địa chỉ máy chủ. Web vẫn đang tự kiểm tra, không cần tải lại trang.'
              : 'Giữ Pi bật nguồn và kết nối mạng. Web tự kiểm tra mỗi 1,5 giây.'}</p>
        {state && <div className="ga-connection-network" aria-label="Đường truyền của Pi">
          <b>{online ? 'Đường truyền' : 'Đường truyền lần gần nhất'}: {network}</b>
          {state.networkInterface && <span>{state.networkInterface}</span>}
          {state.networkIp && <span>IP Pi: {state.networkIp}</span>}
        </div>}
        {!online && report?.receivedAt && <small>Tín hiệu gần nhất: {formatDateTime(report.receivedAt)}</small>}
        <small>SSH: truy cập quản trị khi cần hỗ trợ. Dữ liệu cân truyền qua mạng đến web.</small>
      </div>
      {!online && <div className="ga-connection-actions">
        <span aria-hidden="true">Đã chờ {seconds} giây</span>
        <button type="button" className="op-link" disabled={fetching} onClick={retry}>Kiểm tra lại kết nối</button>
      </div>}
    </section>
  )
}
