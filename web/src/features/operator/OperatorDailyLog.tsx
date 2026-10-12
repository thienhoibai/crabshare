import { useState } from 'react'
import { QrCode, Save, UploadCloud } from 'lucide-react'
import { Tabs } from '../../shared/ui/kit/kit'
import OperatorLayout from './OperatorLayout'
import { OpAside, OpBtn, OpHeading, OpNote, OpPanel } from './operatorUi'

const MODES = ['Khai báo cho ăn', 'Ảnh hộp cua', 'Quét QR ngày'] as const
type Mode = (typeof MODES)[number]

const todayLogs = [
  { time: '10:30', what: 'Cho ăn cám viên', who: 'Nguyễn Văn A' },
  { time: '09:15', what: 'Độ mặn 15 ppt', who: 'Trần Thị B' },
  { time: '08:00', what: 'Xả cặn hồ sinh học', who: 'Nguyễn Văn A' },
]

export default function OperatorDailyLog() {
  const box = new URLSearchParams(window.location.search).get('box')
  const [mode, setMode] = useState<Mode>(box ? 'Ảnh hộp cua' : 'Khai báo cho ăn')

  return (
    <OperatorLayout activeTab="log">
      <OpHeading
        eyebrow="Nhật ký nuôi"
        title="Ghi nhật ký hàng ngày"
        description={box ? `Khắc phục cảnh báo tại ô ${box} · BATCH-2026-11A` : 'Cập nhật chỉ số nước, cho ăn và ảnh hộp cho BATCH-2026-11A.'}
      />

      <div className="op-split">
        <div>
          {box && (
            <OpNote tone="danger">Đang ghi log xử lý cho ô <b>{box}</b>. Ảnh và ghi chú sẽ gắn vào phiếu cảnh báo.</OpNote>
          )}
          <Tabs items={MODES} value={mode} onChange={setMode} className="justify-self-start" />
          <OpPanel>
            <form className="op-form" onSubmit={(e) => e.preventDefault()}>
              {mode === 'Khai báo cho ăn' && (
                <>
                  <div className="op-form__row">
                    <div className="op-field">
                      <label htmlFor="lg-ph">Độ pH</label>
                      <input id="lg-ph" className="op-input" type="number" step="0.1" defaultValue="7.5" />
                    </div>
                    <div className="op-field">
                      <label htmlFor="lg-t">Nhiệt độ (°C)</label>
                      <input id="lg-t" className="op-input" type="number" step="0.5" defaultValue="28.5" />
                    </div>
                    <div className="op-field">
                      <label htmlFor="lg-s">Độ mặn (ppt)</label>
                      <input id="lg-s" className="op-input" type="number" step="1" defaultValue="15" />
                    </div>
                  </div>
                  <div className="op-field">
                    <label htmlFor="lg-n">Ghi chú thức ăn / hoạt động</label>
                    <textarea id="lg-n" className="op-textarea" rows={3} placeholder="VD: Cho ăn cám viên, tôm nhỏ..." defaultValue="Cho ăn cám viên 18 g/ô · kiểm tra lột" />
                  </div>
                </>
              )}

              {mode === 'Ảnh hộp cua' && (
                <div className="op-field">
                  <span className="op-label">Ảnh hộp cua (minh chứng)</span>
                  <div className="op-drop is-accent">
                    <UploadCloud size={32} />
                    Chụp hoặc kéo thả ảnh hộp RAS vào đây
                  </div>
                </div>
              )}

              {mode === 'Quét QR ngày' && (
                <div className="op-hero" style={{ justifyItems: 'center', textAlign: 'center' }}>
                  <QrCode size={56} />
                  <b style={{ fontSize: 22, letterSpacing: '-0.02em' }}>Khung quét QR (demo)</b>
                  <p className="op-hero__sub">Đưa camera vào tem hộp · mã mẫu</p>
                  <span className="op-mono">S-54 · BATCH-2026-11A</span>
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
                <Save size={16} /> Lưu nhật ký
              </OpBtn>
            </form>
          </OpPanel>
        </div>

        <OpAside>
          <p className="rd-eyebrow">Đã ghi hôm nay</p>
          <p className="op-big">{todayLogs.length} <small>mục</small></p>
          <ul className="op-feed">
            {todayLogs.map((l) => <li key={l.time}><b>{l.what}</b><small>{l.time} · {l.who}</small></li>)}
          </ul>
          <p className="rd-note">Thiếu nhật ký trong ngày sẽ sinh cảnh báo cho lô và hiện với nhà đầu tư.</p>
        </OpAside>
      </div>
    </OperatorLayout>
  )
}
