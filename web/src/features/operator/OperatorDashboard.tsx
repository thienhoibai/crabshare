import { useState, type CSSProperties } from 'react'
import { PlusCircle } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import OperatorLayout from './OperatorLayout'
import { OpBtn, OpFacts, OpHeading, OpPanel, OpSplit, OpStat, OpTodo } from './operatorUi'

/** Recharts cần mã màu thật, không đọc được biến CSS. */
const CHART = { ph: '#3b8fd9', temp: '#ec5a1f', grid: 'rgba(21, 19, 15, 0.08)', tick: '#6b655a' }

const mockChartData = [
  { time: '08:00', ph: 7.2, temp: 28 },
  { time: '10:00', ph: 7.3, temp: 28.5 },
  { time: '12:00', ph: 7.4, temp: 29 },
  { time: '14:00', ph: 7.3, temp: 29.2 },
  { time: '16:00', ph: 7.2, temp: 28.8 },
  { time: '18:00', ph: 7.1, temp: 28.2 },
]

const recentLogs = [
  { id: 1, time: '10:30', action: 'Cho ăn (cám viên)', user: 'Nguyễn Văn A' },
  { id: 2, time: '09:15', action: 'Kiểm tra độ mặn (15ppt)', user: 'Trần Thị B' },
  { id: 3, time: '08:00', action: 'Xả cặn hồ sinh học', user: 'Nguyễn Văn A' },
]

const batchesAlive = [
  { id: 'BATCH-2026-11A', label: 'Cua lột 11A', crabs: 1240, alerts: 2, harvest: 450, tone: 'var(--accent)' },
  { id: 'BATCH-2026-10B', label: 'Cua gạch 10B', crabs: 2260, alerts: 0, harvest: 750, tone: 'var(--ok)' },
]

export default function OperatorDashboard() {
  const [selectedBatch, setSelectedBatch] = useState('ALL')
  const shown = selectedBatch === 'ALL' ? batchesAlive : batchesAlive.filter((b) => b.id === selectedBatch)
  const crabs = shown.reduce((s, b) => s + b.crabs, 0)
  const alerts = shown.reduce((s, b) => s + b.alerts, 0)
  const harvest = shown.reduce((s, b) => s + b.harvest, 0)

  return (
    <OperatorLayout activeTab="dashboard">
      <OpHeading
        eyebrow="Hôm nay"
        title="Chào Trại Cần Giờ 01"
        description="Cua đang nuôi, việc cần làm và môi trường nước trong ngày."
        action={
          <>
            <select className="op-select op-select--pill" value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)} aria-label="Lọc theo lô">
              <option value="ALL">Tất cả lô đang nuôi</option>
              {batchesAlive.map((b) => <option key={b.id} value={b.id}>{b.label} · {b.id}</option>)}
            </select>
            <OpBtn variant="ink" onClick={() => { window.location.href = '/operator/log' }}>
              <PlusCircle size={16} /> Ghi nhật ký
            </OpBtn>
          </>
        }
      />

      <div className="op-grid">
        <OpStat className="op-span-7" label="Cua đang nuôi" value={crabs.toLocaleString('vi-VN')} unit="con">
          <OpSplit parts={shown.map((b) => ({ label: b.label, value: b.crabs, display: b.crabs.toLocaleString('vi-VN'), tone: b.tone }))} />
        </OpStat>

        <OpPanel className="op-span-5" title="Việc cần làm">
          <OpTodo
            items={[
              ...(alerts > 0 ? [{ title: `${alerts} cảnh báo chưa xử lý`, sub: 'pH tăng tại ô S-54, thiếu nhật ký ô S-102', href: '/operator/alerts', tone: 'danger' as const }] : []),
              { title: 'Ghi nhật ký chiều nay', sub: 'pH, nhiệt độ, lượng cám', href: '/operator/log', tone: 'gold' },
              { title: 'Xác nhận quyết toán 09A', sub: 'Bảng kê đã sẵn sàng', href: '/operator/settlement?batchId=BATCH-2026-09A', tone: 'ok' },
            ]}
          />
        </OpPanel>

        <div className="op-span-12">
          <OpFacts
            items={[
              { label: 'Cảnh báo', value: `${alerts} cần xử lý`, tone: alerts > 0 ? 'danger' : 'ok' },
              { label: 'Dự kiến thu hoạch', value: `${harvest.toLocaleString('vi-VN')} kg` },
              { label: 'pH trung bình', value: '7,25' },
              { label: 'Nhiệt độ nước', value: '28,6 °C' },
            ]}
          />
        </div>

        <OpPanel
          className="op-span-8"
          title="Môi trường nước hôm nay"
          action={
            <span className="op-legend">
              <span className="op-badge" style={{ '--tone': CHART.ph } as CSSProperties}><i />pH</span>
              <span className="op-badge" style={{ '--tone': CHART.temp } as CSSProperties}><i />Nhiệt độ</span>
            </span>
          }
        >
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: CHART.tick, fontSize: 12 }} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: CHART.tick, fontSize: 12 }} domain={[6, 9]} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: CHART.tick, fontSize: 12 }} domain={[25, 35]} />
                <Tooltip contentStyle={{ borderRadius: 14, border: `1px solid ${CHART.grid}`, fontSize: 13 }} />
                <Line yAxisId="left" type="monotone" dataKey="ph" stroke={CHART.ph} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="temp" stroke={CHART.temp} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </OpPanel>

        <OpPanel className="op-span-4" title="Nhật ký mới nhất">
          <ul className="op-feed">
            {recentLogs.map((log) => (
              <li key={log.id}><b>{log.action}</b><small>{log.time} · {log.user}</small></li>
            ))}
          </ul>
          <a className="op-link" href="/operator/log">Ghi log mới →</a>
        </OpPanel>
      </div>
    </OperatorLayout>
  )
}
