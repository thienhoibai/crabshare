/* Biểu đồ đường dùng chung của cổng người nuôi (chỉ số nước theo ngày, số đo của cảm biến). Màu lấy từ biến của bộ kit. */
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface TrendSeries {
  key: string
  name: string
  /** Biến màu của kit, ví dụ 'var(--info)'. */
  color: string
  /** Trục phải cho chuỗi có thang đo khác (nhiệt độ so với pH). */
  right?: boolean
}

export default function TrendChart<T extends object>({ data, xKey, series, formatX, label, height = 280 }: {
  data: T[]
  xKey: keyof T & string
  series: TrendSeries[]
  formatX: (value: string) => string
  /** Mô tả biểu đồ cho trình đọc màn hình. */
  label: string
  height?: number
}) {
  const hasRight = series.some((s) => s.right)
  const tick = { fill: 'var(--muted)', fontSize: 11 }
  return (
    <div style={{ width: '100%', height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: hasRight ? 0 : 12, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
          <XAxis dataKey={xKey as string} tickFormatter={(v) => formatX(String(v))} tick={tick} minTickGap={24} stroke="var(--line)" />
          <YAxis yAxisId="left" tick={tick} domain={['auto', 'auto']} stroke="var(--line)" />
          {hasRight && <YAxis yAxisId="right" orientation="right" tick={tick} domain={['auto', 'auto']} stroke="var(--line)" />}
          <Tooltip
            labelFormatter={(v) => formatX(String(v))}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, color: 'var(--fg)', fontSize: 13 }}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          {series.map((s) => (
            <Line key={s.key} yAxisId={s.right ? 'right' : 'left'} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
