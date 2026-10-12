import { DollarSign, CheckCircle, PieChart, TrendingUp, ArrowLeft, ArrowRight, FileCheck } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpBack, OpBadge, OpBtn, OpHeading, OpPanel } from './operatorUi'

export default function OperatorSettlement() {
  const params = new URLSearchParams(window.location.search)
  const batchId = params.get('batchId')

  if (!batchId) {
    const settlementBatches = [
      { id: 'BATCH-2026-09A', name: 'Lô cua lột 09A', totalRev: '125.500.000', cost: '50.000.000', profit: '75.500.000', status: 'Chờ bạn xác nhận', action: true },
      { id: 'BATCH-2026-08B', name: 'Lô cua gạch 08B', totalRev: '90.200.000', cost: '40.000.000', profit: '50.200.000', status: 'Đã nhận tiền', action: false },
    ]

    return (
      <OperatorLayout activeTab="settlement">
        <OpHeading
          eyebrow="UC-11 · Đối soát"
          title="Đối soát & quyết toán"
          description="Chọn lô đã xuất bán xong để xác nhận bảng kê và rút tiền về ví."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {settlementBatches.map((b) => (
            <article key={b.id} onClick={() => { window.location.href = `/operator/settlement?batchId=${b.id}` }} className="op-panel cursor-pointer hover:border-[#7d4b1a] relative overflow-hidden">
              {b.action && <div className="absolute top-0 right-0 bg-[#b42318] text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">CẦN XỬ LÝ</div>}
              <div className="flex justify-between items-start mb-4 pb-4 border-b border-[#f0e8dc]">
                <div>
                  <h2 className="text-lg font-extrabold text-[#7d4b1a]">{b.id}</h2>
                  <p className="text-sm text-[#6f675e]">{b.name}</p>
                </div>
                <OpBadge tone={b.action ? 'gold' : 'mute'}>{b.status}</OpBadge>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-[10px] font-bold uppercase text-[#9a8f84]">Doanh thu</p><p className="font-extrabold text-lg text-[#15803d]">{b.totalRev} ₫</p></div>
                <div><p className="text-[10px] font-bold uppercase text-[#9a8f84]">Chi phí</p><p className="font-extrabold text-lg text-[#b42318]">-{b.cost} ₫</p></div>
                <div className="col-span-2 bg-[#f4efe8] p-3 rounded-xl flex justify-between border border-[#f0e8dc]">
                  <span className="text-xs font-bold uppercase text-[#6f675e]">Lợi nhuận gộp</span>
                  <strong>{b.profit} ₫</strong>
                </div>
              </div>
              <OpBtn variant={b.action ? 'ink' : 'outline'} full className="mt-5">
                <FileCheck className="w-4 h-4" /> Xem bảng đối soát <ArrowRight className="w-4 h-4" />
              </OpBtn>
            </article>
          ))}
        </div>
      </OperatorLayout>
    )
  }

  return (
    <OperatorLayout activeTab="settlement">
      <OpHeading
        eyebrow={`Lô ${batchId}`}
        title="Chi tiết đối soát doanh thu"
        description="Trạng thái: đã tất toán · chia 60/40 theo hợp đồng."
        crumb={
          <OpBack href="/operator/settlement">
            <ArrowLeft className="w-4 h-4" /> Quay lại danh sách lô
          </OpBack>
        }
      />

      <div className="op-stats cols-3">
        <div className="op-stat ok">
          <div><span>Doanh thu bán ra</span><strong className="text-[#15803d] text-2xl">125.500.000 ₫</strong></div>
          <div className="op-icon-pill" style={{ background: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}><TrendingUp className="w-5 h-5" /></div>
        </div>
        <div className="op-stat danger">
          <div><span>Chi phí đã ứng</span><strong className="text-[#b42318] text-2xl">-50.000.000 ₫</strong></div>
          <div className="op-icon-pill" style={{ background: '#fef2f2', color: '#b42318', borderColor: '#fca5a5' }}><DollarSign className="w-5 h-5" /></div>
        </div>
        <div className="op-stat gold">
          <div><span>Lợi nhuận gộp</span><strong className="text-[#7d4b1a] text-2xl">75.500.000 ₫</strong></div>
          <div className="op-icon-pill"><PieChart className="w-5 h-5" /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <OpPanel title="Phân bổ doanh thu (60/40)">
          <div className="space-y-4 text-sm">
            <div className="flex justify-between items-center bg-[#f4efe8] p-3 rounded-xl border border-[#f0e8dc]">
              <span>Nhà đầu tư & nền tảng (40%)</span>
              <strong>30.200.000 ₫</strong>
            </div>
            <div className="flex justify-between items-center py-4 border-y border-dashed border-[#e8dccb]">
              <span className="text-[#7d4b1a] font-extrabold">Thực nhận của trại (60%)</span>
              <span className="font-extrabold text-xl text-[#15803d]">45.300.000 ₫</span>
            </div>
            <div className="op-note info">
              <div>
                <strong>Vietcombank · 0123456789</strong>
                <p>NGUYEN VAN A · Auto-payout</p>
              </div>
            </div>
          </div>
        </OpPanel>

        <OpPanel className="flex flex-col justify-center text-center">
          <div className="w-16 h-16 bg-[#f0fdf4] border border-[#bbf7d0] rounded-full grid place-items-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-[#15803d]" />
          </div>
          <h3 className="font-extrabold text-xl">Lô đã bán xong toàn bộ</h3>
          <p className="text-sm text-[#6f675e] mt-3 max-w-md mx-auto">Nền tảng đã thu tiền. Xác nhận báo cáo để hệ thống chuyển khoản doanh thu.</p>
          <OpBtn
            variant="ink"
            full
            className="mt-6"
            onClick={() => {
              window.alert('Xác nhận thành công! Tiền sẽ được chuyển về tài khoản trong 2 giờ.')
              window.location.href = '/operator/settlement'
            }}
          >
            Xác nhận đối soát & rút tiền
          </OpBtn>
        </OpPanel>
      </div>
    </OperatorLayout>
  )
}
