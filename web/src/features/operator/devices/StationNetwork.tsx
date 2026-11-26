import { useState } from 'react'
import { Cable, ChevronDown, Wifi, WifiOff } from 'lucide-react'
import { OpBtn, OpModal, useGet } from '../../../shared/ui/console'
import { StationConnection } from './StationConnection'
import type { RuntimeResponse } from './StationRuntime'
import { StationWifi } from './StationWifi'

export function StationNetwork({ code }: { code: string }) {
  const [open, setOpen] = useState(false)
  const [changing, setChanging] = useState(false)
  // StationRuntime polls this same query while this station is selected.
  const runtime = useGet<RuntimeResponse>(`/api/operators/me/devices/${encodeURIComponent(code)}/station-state`,
    undefined, { retry: false })
  const state = runtime.data?.state
  const online = !runtime.isError && !!(runtime.data?.fresh && state?.hardwareOnline)
  const kind = state?.connectionType
  const tone = runtime.isPending ? 'neutral' : !online ? 'offline' : kind === 'ethernet' ? 'lan' : 'online'
  const title = runtime.isPending ? 'Đang kiểm tra…' : !online ? 'Mất kết nối'
    : kind === 'ethernet' ? 'LAN' : kind === 'wifi' ? state?.networkSsid || 'Wi-Fi' : 'Đã kết nối'
  const Icon = online ? kind === 'ethernet' ? Cable : Wifi : WifiOff

  function close() {
    setChanging(false)
    setOpen(false)
  }

  return <>
    <button type="button" className={`ga-network-button ga-network-button--${tone}`}
      aria-label={`Kết nối mạng · ${title}`} title={title}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <Icon size={15} aria-hidden="true" />
      <span>{title}</span>
      <ChevronDown size={13} aria-hidden="true" />
    </button>
    {open && <OpModal title="Kết nối mạng của Pi" sub={code} onClose={close} wide>
      <div className="ga-network-details">
        <StationConnection code={code} report={runtime.data} loading={runtime.isPending}
          error={runtime.isError} fetching={runtime.isFetching} retry={() => void runtime.refetch()} />
        <OpBtn type="button" variant="ghost" aria-expanded={changing}
          onClick={() => setChanging(value => !value)}>
          {changing ? 'Ẩn biểu mẫu' : 'Đổi Wi-Fi'}
        </OpBtn>
        {changing && <StationWifi code={code} runtime={runtime.data} embedded />}
      </div>
    </OpModal>}
  </>
}
