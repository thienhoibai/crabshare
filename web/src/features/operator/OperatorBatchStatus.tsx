import { Package, DollarSign, Users, Bell } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpHeading } from './operatorUi'

export default function OperatorBatchStatus() {
  const batches = [
    { id: 'BATCH-2026-11A', type: 'Cua lột (SoftShell)', status: 'Đang sản xuất', tone: 'info' as const, step: 3, total: 1500, cap: '75.000.000 ₫', investor: '12 NĐT · góp 100%', alerts: 2 },
    { id: 'BATCH-2026-12C', type: 'Cua thịt (Fattening)', status: 'Đang gọi vốn', tone: 'warn' as const, step: 1, total: 2000, cap: '100.000.000 ₫', investor: 'Đang mở bán 45%', alerts: 0 },
    { id: 'BATCH-2026-10B', type: 'Cua gạch (RoeCrab)', status: 'Đang thu hoạch', tone: 'ok' as const, step: 4, total: 800, cap: '40.000.000 ₫', investor: 'Hải sản Biển Đông (bao tiêu)', alerts: 0 },
    { id: 'BATCH-2026-09A', type: 'Cua lột (SoftShell)', status: 'Đã tất toán', tone: 'mute' as const, step: 5, total: 1000, cap: '50.000.000 ₫', investor: '8 NĐT · hoàn tất', alerts: 0 },
  ]

  return (
    <OperatorLayout activeTab="batch">
      <OpHeading
        eyebrow="UC-01 · Quản lý lô"
        title="Quản lý lô nuôi"
        description="Danh sách các mẻ cua đang gọi vốn, đang nuôi hoặc đã thu hoạch."
        action={<OpBtn variant="ink" onClick={() => { window.location.href = '/operator/create-batch' }}>+ Mở lô nuôi mới</OpBtn>}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {batches.map((b) => (
          <article
            key={b.id}
            onClick={() => { window.location.href = '/operator/batch/detail' }}
            className="op-panel relative cursor-pointer hover:border-[#7d4b1a] transition-all"
          >
            {b.alerts > 0 && (
              <div className="absolute -top-2 -right-2 bg-[#b42318] text-white text-xs font-extrabold w-8 h-8 grid place-items-center rounded-full shadow-lg border-2 border-white">
                <Bell className="w-3 h-3 absolute opacity-30" />
                {b.alerts}
              </div>
            )}
            <div className="flex justify-between items-start gap-3 mb-4">
              <div>
                <h2 className="text-lg font-extrabold text-[#7d4b1a]">{b.id}</h2>
                <p className="text-sm text-[#6f675e] mt-0.5">{b.type}</p>
              </div>
              <OpBadge tone={b.tone}>{b.status}</OpBadge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm border-b border-[#f0e8dc] pb-4 mb-4">
              <p className="flex items-center gap-2"><Package className="w-4 h-4 text-[#9c815f]" /> {b.total.toLocaleString('vi-VN')} con giống</p>
              <p className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-[#9c815f]" /> {b.cap}</p>
            </div>
            <div className="flex items-center justify-between bg-[#fff8ef] px-3 py-2 rounded-xl mb-5 border border-[#f4cf9c]">
              <span className="flex items-center gap-2 text-[#7d4b1a] text-xs font-bold uppercase tracking-wide"><Users className="w-4 h-4" /> Nguồn vốn</span>
              <span className="text-sm font-extrabold">{b.investor}</span>
            </div>
            <div className="op-bar"><i style={{ width: `${(b.step / 5) * 100}%` }} /></div>
            <div className="op-stepper">
              {['Gọi vốn', 'Thả giống', 'Đang nuôi', 'Thu hoạch', 'Tất toán'].map((label, i) => (
                <span key={label} className={b.step >= i + 1 ? 'done' : ''}>{label}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </OperatorLayout>
  )
}
