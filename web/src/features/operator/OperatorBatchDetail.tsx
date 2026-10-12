import { Briefcase, FileText, Users, ExternalLink, AlertTriangle, ArrowRight, ArrowLeft } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpBack, OpBadge, OpBtn, OpHeading, OpNote, OpPanel } from './operatorUi'

export default function OperatorBatchDetail() {
  const investors = [
    { name: 'Trần Trọng A', role: 'Nhà đầu tư cá nhân', amount: '22.500.000 ₫', percent: '30%', status: 'Đã giải ngân' },
    { name: 'Lê Thị B', role: 'Nhà đầu tư cá nhân', amount: '37.500.000 ₫', percent: '50%', status: 'Đã giải ngân' },
    { name: 'Phạm Văn C', role: 'Nhà đầu tư cá nhân', amount: '15.000.000 ₫', percent: '20%', status: 'Đã giải ngân' },
  ]

  return (
    <OperatorLayout activeTab="batch">
      <OpHeading
        eyebrow="Chi tiết lô · BATCH-2026-11A"
        title="Nguồn vốn & bao tiêu"
        description="Tài chính, nhà đầu tư và hồ sơ pháp lý của mẻ cua lột 11A."
        crumb={
          <OpBack href="/operator/batch">
            <ArrowLeft className="w-4 h-4" /> Quay lại danh sách lô
          </OpBack>
        }
      />

      <OpNote tone="danger" className="">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-[#b42318] text-white rounded-full grid place-items-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <strong>Lô này đang có 2 cảnh báo cần xử lý.</strong>
              <p>Bất thường tại ô <u>S-54</u> và <u>S-102</u> (pH tăng cao).</p>
            </div>
          </div>
          <OpBtn variant="danger" sm onClick={() => { window.location.href = '/operator/alerts' }}>
            Xử lý cảnh báo <ArrowRight className="w-4 h-4" />
          </OpBtn>
        </div>
      </OpNote>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
        <div className="lg:col-span-2 space-y-5">
          <OpPanel accent title="Đối tác bao tiêu" action={<div className="op-icon-pill"><Briefcase className="w-4 h-4" /></div>}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><p className="text-[11px] font-bold uppercase text-[#6f675e] mb-1">Đơn vị mua</p><p className="font-extrabold">Chuỗi nhà hàng Biển Đông</p></div>
              <div><p className="text-[11px] font-bold uppercase text-[#6f675e] mb-1">Giá chốt</p><p className="font-extrabold text-[#15803d]">350.000 ₫/kg</p></div>
              <div><p className="text-[11px] font-bold uppercase text-[#6f675e] mb-1">Cam kết</p><p className="font-extrabold">100% sản lượng</p></div>
              <div><p className="text-[11px] font-bold uppercase text-[#6f675e] mb-1">Trạng thái</p><OpBadge tone="ok">Đã ký HĐ</OpBadge></div>
            </div>
          </OpPanel>

          <OpPanel title="Danh sách nhà đầu tư" action={<span className="text-sm text-[#6f675e]">Tổng huy động <strong className="text-[#171717]">75.000.000 ₫</strong></span>}>
            <div className="overflow-x-auto">
              <table className="op-table">
                <thead>
                  <tr>
                    <th>Nhà đầu tư</th>
                    <th>Phân loại</th>
                    <th className="text-right">Số tiền góp</th>
                    <th className="text-right">Tỷ lệ</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {investors.map((inv) => (
                    <tr key={inv.name}>
                      <td className="font-extrabold text-[#7d4b1a]">{inv.name}</td>
                      <td>{inv.role}</td>
                      <td className="text-right font-bold">{inv.amount}</td>
                      <td className="text-right font-bold">{inv.percent}</td>
                      <td><OpBadge tone="ok">{inv.status}</OpBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </OpPanel>
        </div>

        <OpPanel title="Hồ sơ pháp lý lô nuôi" action={<Users className="w-4 h-4 text-[#9c815f]" />}>
          <button
            type="button"
            onClick={() => { window.location.href = '/operator/contract' }}
            className="w-full flex items-center justify-between p-3 border border-[#e8dccb] rounded-xl hover:border-[#7d4b1a] hover:bg-[#fff8ef] transition-all"
          >
            <div className="flex items-center gap-3 text-left">
              <FileText className="w-5 h-5 text-[#9c815f]" />
              <div>
                <p className="text-sm font-bold">Hợp đồng sản xuất</p>
                <p className="text-[11px] text-[#6f675e]">Ký giữa trại và CrabShare</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-[#c4b8a8]" />
          </button>
        </OpPanel>
      </div>
    </OperatorLayout>
  )
}
