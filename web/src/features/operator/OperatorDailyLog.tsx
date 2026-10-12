import { useState } from 'react'
import { UploadCloud, Save, Camera, Utensils, QrCode } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpBtn, OpHeading, OpNote, OpPanel } from './operatorUi'

const modes = [
  { id: 'photo', label: 'Ảnh hộp cua', icon: Camera },
  { id: 'feed', label: 'Khai báo cho ăn', icon: Utensils },
  { id: 'qr', label: 'Quét QR ngày', icon: QrCode },
] as const

export default function OperatorDailyLog() {
  const params = new URLSearchParams(window.location.search)
  const box = params.get('box')
  const [mode, setMode] = useState<(typeof modes)[number]['id']>(box ? 'photo' : 'feed')

  return (
    <OperatorLayout activeTab="log">
      <OpHeading
        eyebrow="UC-05 · Nhật ký nuôi"
        title="Ghi nhật ký hàng ngày"
        description={box ? `Khắc phục cảnh báo tại ô ${box} · BATCH-2026-11A` : 'Cập nhật ảnh hộp, cho ăn và quét QR cho BATCH-2026-11A.'}
      />

      <OpPanel className="max-w-2xl">
        {box && (
          <OpNote tone="danger" className="mb-5">
            Đang ghi log xử lý cho ô <strong>{box}</strong>. Ảnh và ghi chú sẽ gắn vào phiếu cảnh báo.
          </OpNote>
        )}
        <div className="op-chips mb-6">
          {modes.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} type="button" className={`op-chip ${mode === item.id ? 'is-on' : ''}`} onClick={() => setMode(item.id)}>
                <span className="inline-flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {item.label}</span>
              </button>
            )
          })}
        </div>

        <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
          {mode === 'feed' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="op-field">
                  <label>Độ pH</label>
                  <input className="op-input" type="number" step="0.1" defaultValue="7.5" />
                </div>
                <div className="op-field">
                  <label>Nhiệt độ (°C)</label>
                  <input className="op-input" type="number" step="0.5" defaultValue="28.5" />
                </div>
              </div>
              <div className="op-field">
                <label>Ghi chú thức ăn / hoạt động</label>
                <textarea className="op-textarea" rows={3} placeholder="VD: Cho ăn cám viên, tôm nhỏ..." defaultValue="Cho ăn cám viên 18g/ô · kiểm tra lột" />
              </div>
            </>
          )}

          {mode === 'photo' && (
            <div className="op-field">
              <label>Ảnh hộp cua (minh chứng)</label>
              <div className="op-drop is-accent">
                <UploadCloud className="w-8 h-8" />
                Chụp hoặc kéo thả ảnh hộp RAS vào đây
              </div>
            </div>
          )}

          {mode === 'qr' && (
            <div className="rounded-2xl border border-[#e8dccb] bg-[#171717] text-white p-8 text-center">
              <QrCode className="w-16 h-16 mx-auto mb-3 text-[#f4cf9c]" />
              <p className="font-extrabold">Khung quét QR (demo)</p>
              <p className="text-sm text-white/70 mt-2">Đưa camera vào tem hộp · mã mẫu S-54-BATCH-11A</p>
              <p className="mt-4 font-mono text-[#f4cf9c] text-sm">S-54 · BATCH-2026-11A</p>
            </div>
          )}

          <OpBtn
            variant="ink"
            full
            onClick={() => {
              alert('Đã lưu nhật ký!')
              window.location.href = '/operator'
            }}
          >
            <Save className="w-4 h-4" /> Lưu nhật ký
          </OpBtn>
        </form>
      </OpPanel>
    </OperatorLayout>
  )
}
