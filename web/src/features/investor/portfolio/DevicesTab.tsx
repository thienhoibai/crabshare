/* Mục Thiết bị của một Lô tôi đã góp: ảnh hộp do camera gửi (GET /api/batches/{code}/device-images?slotCode=, tệp ở /api/device-images/{id}/file)
   và chỉ số nước của đợt lưu nuôi (GET /api/batches/{code}/water-readings?from=). Chỉ số nước chỉ vẽ biểu đồ, không dùng để phân hạng (BR-115).
   Ảnh thiết bị không phải bằng chứng đã thẩm định; bằng chứng nằm ở mục Nhật trình. */
import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DeviceImageResponse, WaterReadingResponse } from '../../../shared/api/api.gen'
import {
  AuthImage, OpBadge, OpBtn, OpEmpty, OpPanel, OpTabs, QueryView, Select, formatDateTime, useGet,
} from '../../../shared/ui/console'
import { batchApi } from '../investorShared'
import '../investorPages.css'

type Range = '7' | '30'
type Point = { t: number; temperatureC: number | null; salinityPpt: number | null; ph: number | null }

const METRICS = [
  { key: 'temperatureC', label: 'Nhiệt độ nước', unit: ' °C', color: 'var(--accent)' },
  { key: 'salinityPpt', label: 'Độ mặn', unit: ' ‰', color: 'var(--info)' },
  { key: 'ph', label: 'pH', unit: '', color: 'var(--ok)' },
] as const

const PAGE = 12
const tick = (t: number) => new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })

function WaterCharts({ rows }: { rows: WaterReadingResponse[] }) {
  const points: Point[] = rows.map((r) => ({ t: Date.parse(r.measuredAt), temperatureC: r.temperatureC, salinityPpt: r.salinityPpt, ph: r.ph }))
  const doubtful = rows.filter((r) => r.quality !== 'Calibrated').length
  return (
    <>
      <div className="op-grid">
        {METRICS.map((m) => (
          <div key={m.key} className="op-span-4 op-stack">
            <p className="rd-eyebrow">{m.label}</p>
            <div className="inv-chart" role="img" aria-label={`Biểu đồ ${m.label.toLowerCase()} theo thời gian`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} width={52} />
                  <Tooltip
                    labelFormatter={(t) => formatDateTime(new Date(Number(t)).toISOString())}
                    formatter={(value) => [`${String(value)}${m.unit}`, m.label]}
                    contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 13 }}
                  />
                  <Line type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
      <div className="op-inline">
        <OpBadge>{rows.length} lượt đo · gần nhất {formatDateTime(rows[rows.length - 1].measuredAt)}</OpBadge>
        {doubtful > 0 && <OpBadge tone="warn">{doubtful} lượt chưa hiệu chuẩn hoặc nghi sai</OpBadge>}
      </div>
    </>
  )
}

function ImageGrid({ images }: { images: DeviceImageResponse[] }) {
  return (
    <div className="op-thumbs">
      {images.map((i) => (
        <figure key={i.deviceImageId}>
          <AuthImage path={`/api/device-images/${i.deviceImageId}/file`} alt={`Ảnh hộp ${i.slotCode} lúc ${formatDateTime(i.capturedAt)}`} />
          <figcaption>
            <b>Hộp {i.slotCode}</b> · {formatDateTime(i.capturedAt)}{i.crabDetected === false ? ' · không thấy cua' : ''}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

export function DevicesTab({ code }: { code: string }) {
  const [range, setRange] = useState<Range>('7')
  const [slot, setSlot] = useState('')
  const [shown, setShown] = useState(PAGE)
  // Mốc bắt đầu tính một lần cho mỗi lựa chọn để khoá truy vấn không đổi theo từng lần vẽ.
  const from = useMemo(() => (range === '30' ? new Date(Date.now() - 30 * 86_400_000).toISOString() : undefined), [range])
  const water = useGet<WaterReadingResponse[]>(batchApi(code, 'water-readings'), { from }, { retry: false })
  const images = useGet<DeviceImageResponse[]>(batchApi(code, 'device-images'), undefined, { retry: false })
  const history = useGet<DeviceImageResponse[]>(slot ? batchApi(code, 'device-images') : null, { slotCode: slot }, { retry: false })

  return (
    <>
      <OpPanel
        title="Chỉ số nước"
        action={<OpTabs<Range> items={[{ key: '7', label: '7 ngày' }, { key: '30', label: '30 ngày' }]} value={range} onChange={setRange} label="Khoảng thời gian" />}
      >
        <QueryView query={water}>
          {(rows) => (rows.length === 0 ? <p className="rd-muted">Chưa có lượt đo nào trong khoảng này.</p> : <WaterCharts rows={rows} />)}
        </QueryView>
      </OpPanel>

      <OpPanel
        title="Ảnh hộp"
        subtitle="Ảnh camera tự chụp để theo dõi, chưa qua thẩm định. Bằng chứng đã thẩm định ở mục Nhật trình."
        action={images.data && images.data.length > 0 ? (
          <Select sm value={slot} aria-label="Chọn hộp" onChange={(e) => setSlot(e.target.value)}>
            <option value="">Ảnh mới nhất mỗi hộp</option>
            {[...new Set(images.data.map((i) => i.slotCode))].sort().map((s) => <option key={s} value={s}>Hộp {s}</option>)}
          </Select>
        ) : undefined}
      >
        {slot ? (
          <QueryView query={history}>
            {(rows) => (rows.length === 0 ? <p className="rd-muted">Hộp {slot} chưa có ảnh.</p> : <ImageGrid images={rows.slice(0, 24)} />)}
          </QueryView>
        ) : (
          <QueryView query={images}>
            {(rows) => {
              // Danh sách đã xếp ảnh mới trước: giữ ảnh đầu tiên của mỗi hộp.
              const latest = rows.filter((i, index) => rows.findIndex((x) => x.slotCode === i.slotCode) === index)
              if (latest.length === 0) return <OpEmpty title="Lô chưa có ảnh từ thiết bị" />
              return (
                <>
                  <ImageGrid images={latest.slice(0, shown)} />
                  {latest.length > shown && (
                    <div className="op-formfoot" style={{ justifyContent: 'center' }}>
                      <OpBtn variant="ghost" onClick={() => setShown(shown + PAGE)}>Xem thêm {Math.min(PAGE, latest.length - shown)} hộp</OpBtn>
                    </div>
                  )}
                </>
              )
            }}
          </QueryView>
        )}
      </OpPanel>
    </>
  )
}
