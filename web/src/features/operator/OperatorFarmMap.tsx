import { useState } from 'react'
import { ChevronRight, ChevronLeft, X, Activity, Droplets, Thermometer } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpHeading, OpPanel } from './operatorUi'

type BoxStatus = 'occupied' | 'alert' | 'empty'
type FarmBox = { id: string; status: BoxStatus; weight: string }

const mockBatches = [
  { id: 'BATCH-2026-11A', name: 'Lô cua lột 11A', totalBoxes: 125, ph: '7.5', temp: '28.5°C' },
  { id: 'BATCH-2026-10B', name: 'Lô cua gạch 10B', totalBoxes: 30, ph: '7.8', temp: '29.0°C' },
]

export default function OperatorFarmMap() {
  const [selectedBatch, setSelectedBatch] = useState(mockBatches[0].id)
  const [page, setPage] = useState(1)
  const [selectedBox, setSelectedBox] = useState<FarmBox | null>(null)
  const BOXES_PER_PAGE = 50

  const currentBatch = mockBatches.find((b) => b.id === selectedBatch)!
  const totalPages = Math.ceil(currentBatch.totalBoxes / BOXES_PER_PAGE)

  const allBoxes: FarmBox[] = Array.from({ length: currentBatch.totalBoxes }, (_, i) => {
    let status: BoxStatus = 'occupied'
    if (selectedBatch === 'BATCH-2026-11A' && (i % 12 === 0 || i === 44)) status = 'alert'
    if (selectedBatch === 'BATCH-2026-11A' && i % 25 === 0) status = 'empty'
    if (selectedBatch === 'BATCH-2026-10B' && i % 8 === 0) status = 'alert'
    return { id: `S-${i + 1}`, status, weight: status === 'empty' ? '-' : `${200 + (i % 5) * 5}g` }
  })

  const displayedBoxes = allBoxes.slice((page - 1) * BOXES_PER_PAGE, page * BOXES_PER_PAGE)
  const stats = {
    occupied: allBoxes.filter((b) => b.status === 'occupied').length,
    alert: allBoxes.filter((b) => b.status === 'alert').length,
    empty: allBoxes.filter((b) => b.status === 'empty').length,
  }

  return (
    <OperatorLayout activeTab="map">
      <OpHeading
        eyebrow="RAS Map"
        title="Sơ đồ trại"
        description="Ô cam đang nuôi · ô đỏ có cảnh báo."
        action={
          <select
            className="op-select"
            style={{ width: 'auto', fontWeight: 800, color: '#7d4b1a' }}
            value={selectedBatch}
            onChange={(e) => { setSelectedBatch(e.target.value); setPage(1) }}
          >
            {mockBatches.map((b) => (
              <option key={b.id} value={b.id}>{b.id} · {b.name} ({b.totalBoxes} ô)</option>
            ))}
          </select>
        }
      />

      <div className="flex flex-wrap gap-3 mb-5 text-xs font-bold text-[#6f675e]">
        <span className="flex items-center gap-2 op-panel py-2 px-3"><i className="w-3 h-3 rounded bg-[#f4cf9c] border border-[#7d4b1a]" /> Đang nuôi</span>
        <span className="flex items-center gap-2 op-panel py-2 px-3"><i className="w-3 h-3 rounded bg-[#fca5a5] border border-[#b42318]" /> Cảnh báo</span>
        <span className="flex items-center gap-2 op-panel py-2 px-3"><i className="w-3 h-3 rounded border border-gray-300 bg-[repeating-linear-gradient(45deg,#f9fafb,#f9fafb_2px,#e5e7eb_2px,#e5e7eb_4px)]" /> Trống</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
        <div className="op-stat col-span-2">
          <div><span>Trạng thái chung</span><strong className="text-lg">Tốt / ổn định</strong></div>
          <Activity className="text-green-600 w-8 h-8 opacity-50" />
        </div>
        <div className="op-stat"><div><span>Đang nuôi</span><strong className="text-xl text-[#7d4b1a]">{stats.occupied}</strong></div></div>
        <div className="op-stat danger"><div><span>Cảnh báo</span><strong className="text-xl text-[#b42318]">{stats.alert}</strong></div></div>
        <div className="op-stat"><div><span>Ô trống</span><strong className="text-xl">{stats.empty}</strong></div></div>
        <div className="op-stat">
          <div>
            <span>Môi trường</span>
            <strong className="text-sm flex items-center gap-2 mt-2">
              <Droplets className="w-3 h-3 text-blue-500" />{currentBatch.ph}
              <Thermometer className="w-3 h-3 text-red-500" />{currentBatch.temp}
            </strong>
          </div>
        </div>
      </div>

      <OpPanel>
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 mb-6">
          {displayedBoxes.map((slot) => (
            <button
              type="button"
              key={slot.id}
              onClick={() => setSelectedBox(slot)}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center border-2 transition-transform hover:scale-105
                ${slot.status === 'alert' ? 'bg-[#fca5a5] border-[#991b1b] text-[#7f1d1d]' :
                  slot.status === 'empty' ? 'border-gray-300 text-gray-400' : 'bg-[#f4cf9c] border-[#7d4b1a] text-[#5c3716]'}`}
              style={slot.status === 'empty' ? { backgroundImage: 'repeating-linear-gradient(45deg,#ffffff,#ffffff 4px,#e5e7eb 4px,#e5e7eb 8px)' } : undefined}
            >
              <span className="text-[11px] font-extrabold">{slot.id}</span>
              {slot.status !== 'empty' && <span className="text-[10px] font-bold mt-0.5">{slot.weight}</span>}
            </button>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#f0e8dc] pt-5">
            <span className="text-sm text-[#6f675e]">
              Ô <strong>{(page - 1) * BOXES_PER_PAGE + 1}</strong>–<strong>{Math.min(page * BOXES_PER_PAGE, currentBatch.totalBoxes)}</strong> / {currentBatch.totalBoxes}
            </span>
            <div className="flex items-center gap-3">
              <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded-lg border border-[#e8dccb] disabled:opacity-30">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-extrabold text-[#7d4b1a]">{page} / {totalPages}</span>
              <button type="button" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded-lg border border-[#e8dccb] disabled:opacity-30">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </OpPanel>

      {selectedBox && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[#faf6f0] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="bg-[#171717] text-white p-4 flex justify-between items-start">
              <div>
                <h3 className="font-extrabold text-lg">Ô nuôi {selectedBox.id}</h3>
                <p className="text-xs text-white/60">{currentBatch.name}</p>
              </div>
              <button type="button" onClick={() => setSelectedBox(null)}><X className="w-6 h-6" /></button>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-6 pb-5 border-b border-[#f0e8dc]">
                <div className={`w-16 h-16 rounded-full grid place-items-center border-4 font-extrabold ${selectedBox.status === 'alert' ? 'border-[#991b1b] bg-[#fca5a5]' : selectedBox.status === 'empty' ? 'border-[#e8dccb] bg-gray-100' : 'border-[#7d4b1a] bg-[#f4cf9c]'}`}>
                  {selectedBox.weight}
                </div>
                <div>
                  <p className="font-bold">Trạng thái hiện tại</p>
                  <OpBadge tone={selectedBox.status === 'alert' ? 'danger' : selectedBox.status === 'empty' ? 'mute' : 'ok'}>
                    {selectedBox.status === 'alert' ? 'Cảnh báo bất thường' : selectedBox.status === 'empty' ? 'Ô trống' : 'Phát triển bình thường'}
                  </OpBadge>
                </div>
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#6f675e] mb-3">Nhật ký gần nhất</p>
              <div className="space-y-4 text-sm">
                <p><strong>Hôm nay 08:00</strong> · pH {currentBatch.ph} · {currentBatch.temp}</p>
                <p><strong>Hôm qua 17:30</strong> · Cho ăn cám viên 15g</p>
              </div>
              <OpBtn variant="ink" full className="mt-6" onClick={() => setSelectedBox(null)}>Đóng</OpBtn>
            </div>
          </div>
        </div>
      )}
    </OperatorLayout>
  )
}
