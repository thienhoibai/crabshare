/* Tab Thiết bị của một Lô: chỉ số nước từ cảm biến (GET /api/batches/{code}/water-readings, BR-115), ảnh hộp do camera gửi
   (GET …/device-images, tệp ở /api/device-images/{id}/file) và thiết bị gắn với Lô kèm thao tác ra lệnh, ghi hiệu chuẩn.
   Ảnh thiết bị để theo dõi hộp, không phải ảnh bằng chứng do người nuôi chụp. */
import { useState } from 'react'
import type { BoxStateResponse, DeviceImageResponse, DeviceResponse, HoldingResponse, WaterReadingResponse } from '../../../../shared/api/api.gen'
import { AuthImage, OpFacts, OpNote, OpPanel, OpTabs, QueryView, Select, formatDateTime, label, useGet } from '../../../../shared/ui/console'
import DeviceList from '../../DeviceList'
import { dayMonth, hourMinute, num } from '../../opA'
import TrendChart from '../../TrendChart'
import type { BatchTabProps } from '../types'

type Range = '1' | '7' | '30'
const RANGES: { key: Range; label: string }[] = [{ key: '1', label: '24 giờ' }, { key: '7', label: '7 ngày' }, { key: '30', label: '30 ngày' }]

/** Mốc bắt đầu của khoảng xem, làm tròn tới giờ để truy vấn không đổi liên tục. */
const since = (days: number) => {
  const d = new Date(Date.now() - days * 86_400_000)
  d.setMinutes(0, 0, 0)
  return d.toISOString()
}

export default function DevicesTab({ code }: BatchTabProps) {
  const api = `/api/batches/${encodeURIComponent(code)}`
  const [range, setRange] = useState<Range>('7')
  const [slotCode, setSlotCode] = useState('')
  const boxes = useGet<BoxStateResponse[]>(`${api}/boxes`)
  const holding = useGet<HoldingResponse>(`${api}/holding`, undefined, { retry: false })
  const devices = useGet<DeviceResponse[]>('/api/operators/me/devices')
  const images = useGet<DeviceImageResponse[]>(`${api}/device-images`, { slotCode })
  const readings = useGet<WaterReadingResponse[]>(`${api}/water-readings`, { from: since(Number(range)) })

  const slotCodes = (boxes.data ?? []).map((b) => b.slotCode)
  const racks = new Set((boxes.data ?? []).filter((b) => b.rackNo).map((b) => `R${String(b.rackNo).padStart(2, '0')}`))
  // Thiết bị của Lô: cảm biến của đợt lưu nuôi, camera của dàn hoặc hộp có cua của Lô, và trạm đo của trại.
  const mine = (devices.data ?? []).filter((d) =>
    d.scopeType === 'QcStation'
    || (d.scopeType === 'Holding' && d.scope === holding.data?.holdingCode)
    || (d.scopeType === 'Rack' && racks.has(d.scope))
    || (d.scopeType === 'Slot' && slotCodes.includes(d.scope)))
  const rows = readings.data ?? []
  const last = rows.length ? rows[rows.length - 1] : null
  const shots = images.data ?? []

  return (
    <>
      <OpPanel title="Chỉ số nước" action={<OpTabs<Range> value={range} onChange={setRange} items={RANGES} label="Khoảng thời gian" />}>
        <QueryView query={readings}>
          {(data) => !last ? <p className="rd-muted">Chưa có số đo trong khoảng này.</p> : (
            <>
              <OpFacts items={[
                { label: 'pH', value: num(last.ph) },
                { label: 'Nhiệt độ', value: num(last.temperatureC, ' °C') },
                { label: 'Độ mặn', value: num(last.salinityPpt, ' ‰') },
                { label: 'Đo lúc', value: formatDateTime(last.measuredAt) },
              ]} />
              {last.quality !== 'Calibrated' && <OpNote tone="danger">Số đo gần nhất: {label('readingQuality', last.quality).toLowerCase()}. Hiệu chuẩn lại cảm biến.</OpNote>}
              <TrendChart
                data={data}
                xKey="measuredAt"
                formatX={(v) => (range === '1' ? hourMinute(v) : `${dayMonth(v)} ${hourMinute(v)}`)}
                label="Biểu đồ pH, nhiệt độ và độ mặn theo thời gian"
                series={[
                  { key: 'ph', name: 'pH', color: 'var(--info)' },
                  { key: 'temperatureC', name: 'Nhiệt độ (°C)', color: 'var(--accent)', right: true },
                  { key: 'salinityPpt', name: 'Độ mặn (‰)', color: 'var(--ok)', right: true },
                ]}
              />
            </>
          )}
        </QueryView>
      </OpPanel>

      {(shots.length > 0 || slotCode) && (
        <OpPanel
          title="Ảnh hộp từ camera"
          action={
            <Select sm value={slotCode} onChange={(e) => setSlotCode(e.target.value)} aria-label="Lọc theo hộp" style={{ width: 'auto' }}>
              <option value="">Mọi hộp</option>
              {slotCodes.map((c) => <option key={c} value={c}>Hộp {c}</option>)}
            </Select>
          }
        >
          {shots.length === 0 ? <p className="rd-muted">Hộp {slotCode} chưa có ảnh.</p> : (
            <div className="op-thumbs">
              {shots.map((img) => (
                <figure key={img.deviceImageId} style={{ margin: 0 }}>
                  <AuthImage path={`/api/device-images/${img.deviceImageId}/file`} alt={`Hộp ${img.slotCode}${img.crabCode ? ` · ${img.crabCode}` : ''} · ${formatDateTime(img.capturedAt)} · ${img.deviceCode}`} />
                  <figcaption>
                    <b>Hộp {img.slotCode}</b> · {formatDateTime(img.capturedAt)}
                    {img.crabDetected !== null && <><br />{img.crabDetected ? <span className="op-ok">Thấy cua</span> : <span className="op-danger">Không thấy cua</span>}</>}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </OpPanel>
      )}

      <OpPanel title="Thiết bị của Lô" action={<a className="op-link" href="/operator/devices">Tất cả thiết bị</a>}>
        <QueryView query={devices}>
          {() => <DeviceList devices={mine} boxCodes={slotCodes} empty="Chưa có thiết bị nào gắn với Lô này" />}
        </QueryView>
      </OpPanel>
    </>
  )
}
