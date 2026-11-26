import { errorMessage } from '../../../shared/api/http'
import { OpBtn, OpNote, useGet, useSend } from '../../../shared/ui/console'
import type { RuntimeResponse } from './StationRuntime'

interface StartStatus {
  id: number
  status: 'Pending' | 'Claimed' | 'Accepted' | 'Rejected' | 'Expired'
  message: string | null
}

export function StationStart({ code, sessionNo, tag, runtime }: {
  code: string
  sessionNo: string
  tag: string
  runtime?: RuntimeResponse
}) {
  const path = `/api/operators/me/devices/${encodeURIComponent(code)}/measurement-sessions/${encodeURIComponent(sessionNo)}/start`
  const status = useGet<StartStatus | null>(path, undefined, { refetchInterval: 2000, retry: false })
  const start = useSend<StartStatus>('post', path, { quietError: true })
  const pending = status.data ?? (status.data === undefined ? start.data : null)
  const station = runtime?.state
  const fresh = !!(runtime?.fresh && station?.hardwareOnline)
  const selected = station?.sessionNo === sessionNo && station?.crabTag === tag
  const waiting = pending?.status === 'Pending' || pending?.status === 'Claimed'
  const ready = fresh && selected && !!station?.webStartReady && !station.busy
  const showHint = start.isError || status.isError || start.isPending || waiting
    || pending?.status === 'Rejected' || pending?.status === 'Expired'
    || (fresh && !selected)
  const hint = start.isError ? errorMessage(start.error)
    : status.isError ? 'Không tải được trạng thái lệnh. Thử làm mới trang.'
    : start.isPending ? 'Đang gửi lệnh…'
    : pending?.status === 'Pending' ? 'Đã gửi lệnh. Đang chờ Pi nhận.'
    : pending?.status === 'Claimed' ? 'Pi đang xác nhận điều kiện bắt đầu.'
    : pending?.status === 'Rejected' ? pending.message || 'Pi từ chối lệnh. Kiểm tra trạng thái trạm.'
    : pending?.status === 'Expired' ? 'Lệnh đã hết hạn. Bấm lại nếu trạm còn sẵn sàng.'
    : `Chờ Pi nhận lượt đo của cua ${tag}.`

  return (
    <div className="ga-station-start">
      <OpBtn type="button" disabled={!ready || waiting || start.isPending || status.isError} onClick={() => start.mutate()}>
        Bắt đầu cân {tag}
      </OpBtn>
      {showHint && <div role="status"><OpNote tone={start.isError || status.isError || pending?.status === 'Rejected' ? 'danger' : undefined}>{hint}</OpNote></div>}
    </div>
  )
}
