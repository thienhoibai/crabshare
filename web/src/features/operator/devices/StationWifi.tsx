import { useState } from 'react'
import { errorMessage } from '../../../shared/api/http'
import { Field, Input, OpBtn, OpMore, OpNote, useGet, useSend } from '../../../shared/ui/console'
import type { RuntimeResponse } from './StationRuntime'

interface WifiStatus { id: number; status: string; message: string | null }

export function StationWifi({ code, runtime }: { code: string; runtime?: RuntimeResponse }) {
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const path = `/api/operators/me/devices/${encodeURIComponent(code)}/wifi`
  const report = useGet<RuntimeResponse>(`/api/operators/me/devices/${encodeURIComponent(code)}/station-state`, undefined,
    { refetchInterval: 4000, retry: false, enabled: !runtime })
  const latest = useGet<WifiStatus | null>(path, undefined, { refetchInterval: 4000, retry: false })
  const send = useSend<WifiStatus, { ssid: string; password: string }>('post', path, {
    quietError: true, onSuccess: () => setPassword(''),
  })
  const job = latest.data ?? send.data
  const waiting = job?.status === 'Pending' || job?.status === 'Claimed'
  const current = runtime ?? report.data
  const ready = !!(current?.fresh && current.state?.hardwareOnline && current.state?.wifiConfigReady)
  const note = send.isError ? errorMessage(send.error)
    : job?.status === 'Accepted' ? job.message || 'Đã kết nối Wi-Fi mới.'
    : job?.status === 'Rejected' ? job.message || 'Đổi mạng thất bại. Kiểm tra mạng cũ.'
    : job?.status === 'Expired' || job?.status === 'Cancelled' ? 'Yêu cầu hết hạn. Kết nối lại trạm rồi thử lại.'
    : waiting ? 'Đã gửi. Trạm có thể tạm mất kết nối trong khi đổi mạng.'
    : !ready ? 'Trạm cần online và hoàn tất hoặc hủy lượt đo trước khi đổi Wi-Fi.'
    : 'Nhập mạng đang phủ sóng tại Pi. Hỗ trợ WPA2 và chế độ WPA2/WPA3 hỗn hợp.'
  return (
    <OpMore label="Đổi Wi-Fi của thiết bị">
      <form autoComplete="off" onSubmit={event => {
        event.preventDefault()
        if (ready && !waiting && !send.isPending) send.mutate({ ssid, password })
      }}>
        <Field label="Tên Wi-Fi (SSID)"><Input value={ssid} maxLength={32} required onChange={e => setSsid(e.target.value)} /></Field>
        <Field label="Mật khẩu Wi-Fi"><Input type="password" value={password} minLength={8} maxLength={63} required
          autoComplete="new-password" onChange={e => setPassword(e.target.value)} /></Field>
        <OpBtn type="submit" disabled={!ready || waiting || send.isPending || !ssid || password.length < 8}>
          {send.isPending ? 'Đang gửi…' : 'Lưu và kết nối Wi-Fi'}
        </OpBtn>
        <div role="status"><OpNote tone={send.isError || job?.status === 'Rejected' ? 'danger' : undefined}>{note}</OpNote></div>
      </form>
    </OpMore>
  )
}
