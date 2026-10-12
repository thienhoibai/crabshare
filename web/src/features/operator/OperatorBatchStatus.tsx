import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Tabs } from '../../shared/ui/kit/kit'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpFacts, OpHeading, OpRow, OpSteps, crabImg, type Tone } from './operatorUi'

const STEPS = ['Gọi vốn', 'Thả giống', 'Đang nuôi', 'Thu hoạch', 'Tất toán']

const batches: { id: string; type: string; status: string; tone: Tone; step: number; total: number; cap: string; investor: string; alerts: number }[] = [
  { id: 'BATCH-2026-11A', type: 'Cua lột', status: 'Đang sản xuất', tone: 'info', step: 3, total: 1500, cap: '75.000.000 ₫', investor: '12 nhà đầu tư · đủ 100%', alerts: 2 },
  { id: 'BATCH-2026-12C', type: 'Cua thịt', status: 'Đang gọi vốn', tone: 'warn', step: 1, total: 2000, cap: '100.000.000 ₫', investor: 'Đã góp 45%', alerts: 0 },
  { id: 'BATCH-2026-10B', type: 'Cua gạch', status: 'Đang thu hoạch', tone: 'ok', step: 4, total: 800, cap: '40.000.000 ₫', investor: 'Hải sản Biển Đông bao tiêu', alerts: 0 },
  { id: 'BATCH-2026-09A', type: 'Cua lột', status: 'Đã tất toán', tone: 'mute', step: 5, total: 1000, cap: '50.000.000 ₫', investor: '8 nhà đầu tư · đã chia xong', alerts: 0 },
]

const FILTERS = ['Tất cả', 'Đang gọi vốn', 'Đang sản xuất', 'Đang thu hoạch', 'Đã tất toán'] as const
type Filter = (typeof FILTERS)[number]

export default function OperatorBatchStatus() {
  const [filter, setFilter] = useState<Filter>('Tất cả')
  const list = batches.filter((b) => filter === 'Tất cả' || b.status === filter)

  return (
    <OperatorLayout activeTab="batch">
      <OpHeading
        eyebrow="Lô nuôi"
        title="Quản lý lô nuôi"
        description="Các lô đang gọi vốn, đang nuôi hoặc đã thu hoạch của trại."
        action={<OpBtn onClick={() => { window.location.href = '/operator/create-batch' }}><Plus size={16} /> Mở lô nuôi mới</OpBtn>}
      />

      <OpFacts
        items={[
          { label: 'Lô đang chạy', value: batches.filter((b) => b.step < 5).length },
          { label: 'Con giống đang nuôi', value: batches.filter((b) => b.step > 1 && b.step < 5).reduce((s, b) => s + b.total, 0).toLocaleString('vi-VN') },
          { label: 'Cảnh báo mở', value: batches.reduce((s, b) => s + b.alerts, 0), tone: 'danger' },
          { label: 'Đã tất toán', value: batches.filter((b) => b.step === 5).length },
        ]}
      />

      <div className="grid gap-4 justify-items-start">
        <Tabs items={FILTERS} value={filter} onChange={setFilter} />
        <div className="op-panel op-list w-full">
          {list.map((b) => (
            <OpRow
              key={b.id}
              href="/operator/batch/detail"
              media={crabImg(b.type)}
              title={b.id}
              sub={`${b.type} · ${b.total.toLocaleString('vi-VN')} con giống`}
              mid={<><OpSteps step={b.step} /><small>{STEPS[b.step - 1]} · {b.investor}</small></>}
              end={
                <>
                  <span className="flex gap-2 flex-wrap justify-end">
                    {b.alerts > 0 && <OpBadge tone="danger">{b.alerts} cảnh báo</OpBadge>}
                    <OpBadge tone={b.tone}>{b.status}</OpBadge>
                  </span>
                  <small>Vốn {b.cap}</small>
                </>
              }
            />
          ))}
          {list.length === 0 && <p className="op-empty">Không có lô nào ở trạng thái này.</p>}
        </div>
      </div>
    </OperatorLayout>
  )
}
