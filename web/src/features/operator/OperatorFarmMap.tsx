import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpFacts, OpHeading, OpModal, OpPanel } from './operatorUi'

type BoxStatus = 'occupied' | 'alert' | 'empty'
type FarmBox = { id: string; status: BoxStatus; weight: string }

const mockBatches = [
  { id: 'BATCH-2026-11A', name: 'Lô cua lột 11A', totalBoxes: 125, ph: '7,5', temp: '28,5 °C' },
  { id: 'BATCH-2026-10B', name: 'Lô cua gạch 10B', totalBoxes: 30, ph: '7,8', temp: '29,0 °C' },
]

const STATUS_LABEL: Record<BoxStatus, string> = { occupied: 'Đang nuôi', alert: 'Cảnh báo', empty: 'Ô trống' }
const BOXES_PER_PAGE = 50

export default function OperatorFarmMap() {
  const [selectedBatch, setSelectedBatch] = useState(mockBatches[0].id)
  const [page, setPage] = useState(1)
  const [selectedBox, setSelectedBox] = useState<FarmBox | null>(null)

  const currentBatch = mockBatches.find((b) => b.id === selectedBatch)!
  const totalPages = Math.ceil(currentBatch.totalBoxes / BOXES_PER_PAGE)

  const allBoxes: FarmBox[] = Array.from({ length: currentBatch.totalBoxes }, (_, i) => {
    let status: BoxStatus = 'occupied'
    if (selectedBatch === 'BATCH-2026-11A' && (i % 12 === 0 || i === 44)) status = 'alert'
    if (selectedBatch === 'BATCH-2026-11A' && i % 25 === 0) status = 'empty'
    if (selectedBatch === 'BATCH-2026-10B' && i % 8 === 0) status = 'alert'
    return { id: `S-${i + 1}`, status, weight: status === 'empty' ? '—' : `${200 + (i % 5) * 5} g` }
  })

  const displayedBoxes = allBoxes.slice((page - 1) * BOXES_PER_PAGE, page * BOXES_PER_PAGE)
  const count = (s: BoxStatus) => allBoxes.filter((b) => b.status === s).length

  return (
    <OperatorLayout activeTab="map">
      <OpHeading
        eyebrow="Hộp RAS"
        title="Sơ đồ trại"
        description="Mỗi ô là một hộp nuôi. Chạm vào ô để xem nhật ký gần nhất."
        action={
          <select
            className="op-select op-select--pill"
            value={selectedBatch}
            onChange={(e) => { setSelectedBatch(e.target.value); setPage(1) }}
            aria-label="Chọn lô"
          >
            {mockBatches.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.totalBoxes} ô</option>)}
          </select>
        }
      />

      <OpFacts
        items={[
          { label: 'Đang nuôi', value: count('occupied'), tone: 'ok' },
          { label: 'Cảnh báo', value: count('alert'), tone: 'danger' },
          { label: 'Ô trống', value: count('empty') },
          { label: 'pH', value: currentBatch.ph, tone: 'info' },
          { label: 'Nhiệt độ nước', value: currentBatch.temp },
        ]}
      />

      <OpPanel
        title={currentBatch.name}
        action={
          <span className="op-legend">
            <OpBadge tone="ok">Đang nuôi</OpBadge>
            <OpBadge tone="danger">Cảnh báo</OpBadge>
            <OpBadge tone="mute">Ô trống</OpBadge>
          </span>
        }
      >
        <div className="op-slots">
          {displayedBoxes.map((slot) => (
            <button type="button" key={slot.id} className={`op-slot is-${slot.status}`} onClick={() => setSelectedBox(slot)} aria-label={`Ô ${slot.id}, ${STATUS_LABEL[slot.status]}`}>
              <b>{slot.id}</b>
              {slot.status !== 'empty' && <small>{slot.weight}</small>}
            </button>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="op-pager">
            <span>Ô {(page - 1) * BOXES_PER_PAGE + 1}–{Math.min(page * BOXES_PER_PAGE, currentBatch.totalBoxes)} / {currentBatch.totalBoxes}</span>
            <div>
              <button type="button" className="rd-iconbtn" disabled={page === 1} onClick={() => setPage((p) => p - 1)} aria-label="Trang trước"><ChevronLeft size={18} /></button>
              <span>{page} / {totalPages}</span>
              <button type="button" className="rd-iconbtn" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Trang sau"><ChevronRight size={18} /></button>
            </div>
          </div>
        )}
      </OpPanel>

      {selectedBox && (
        <OpModal title={`Ô nuôi ${selectedBox.id}`} sub={currentBatch.name} onClose={() => setSelectedBox(null)}>
          <div className="flex items-center gap-4">
            <span className={`op-slot is-${selectedBox.status}`} style={{ width: 72 }}><b>{selectedBox.weight}</b></span>
            <div className="grid gap-1 justify-items-start">
              <span className="op-muted text-sm">Trạng thái hiện tại</span>
              <OpBadge tone={selectedBox.status === 'alert' ? 'danger' : selectedBox.status === 'empty' ? 'mute' : 'ok'}>
                {selectedBox.status === 'alert' ? 'Cảnh báo bất thường' : selectedBox.status === 'empty' ? 'Ô trống' : 'Phát triển bình thường'}
              </OpBadge>
            </div>
          </div>
          <div className="grid gap-3">
            <p className="rd-eyebrow">Nhật ký gần nhất</p>
            <ul className="op-feed">
              <li><b>Hôm nay 08:00</b><small>pH {currentBatch.ph} · {currentBatch.temp}</small></li>
              <li><b>Hôm qua 17:30</b><small>Cho ăn cám viên 15 g</small></li>
            </ul>
          </div>
          <div className="flex gap-2">
            {selectedBox.status === 'alert' && (
              <OpBtn onClick={() => { window.location.href = `/operator/log?box=${selectedBox.id}` }}>Ghi log xử lý</OpBtn>
            )}
            <OpBtn variant="ghost" onClick={() => setSelectedBox(null)}>Đóng</OpBtn>
          </div>
        </OpModal>
      )}
    </OperatorLayout>
  )
}
