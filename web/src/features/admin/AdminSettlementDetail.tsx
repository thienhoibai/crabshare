import { ArrowLeft, CheckCircle, SplitSquareVertical, DollarSign, Calculator } from 'lucide-react';
import AdminLayout from './AdminLayout';

export default function AdminSettlementDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const batchId = urlParams.get('id') || 'BATCH-2026-10B';

  return (
    <AdminLayout activeTab="finance">
      <div className="mb-6">
        <a href="/admin/finance" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Quay lại Đối soát
        </a>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Thực thi Đối soát (Settlement)</h1>
            <p className="text-sm text-slate-500 mt-1">Lô cua: <strong className="text-slate-900">{batchId}</strong></p>
          </div>
          <button onClick={() => { alert('Đã phân bổ doanh thu thành công vào ví các bên (Platform, Operator, Investors)!'); window.location.href='/admin/finance'; }} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm">
            <Calculator className="w-4 h-4" /> Xác nhận Chia tiền
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-6 border-b border-slate-100 pb-2 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" /> Bảng phân bổ Doanh thu (Revenue Pool)
            </h3>
            
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-6 mb-8 text-center">
              <p className="text-sm font-bold text-emerald-800 mb-1 uppercase tracking-wider">Tổng Doanh thu Bán hàng thực tế</p>
              <h2 className="text-4xl font-extrabold text-emerald-700 font-mono">150.000.000 ₫</h2>
              <p className="text-xs text-emerald-600 mt-2">Dữ liệu doanh thu được tổng hợp từ 24 đơn hàng bán lẻ và 1 đơn sỉ Offtake.</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center font-bold text-slate-600">5%</div>
                  <div>
                    <h4 className="font-bold text-slate-900">Phí Nền tảng (Platform Fee)</h4>
                    <p className="text-xs text-slate-500">Chi phí vận hành hệ thống CrabShare</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-slate-900 text-lg">7.500.000 ₫</div>
                  <div className="text-xs text-slate-500">Chuyển vào Ví Admin</div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-200 rounded flex items-center justify-center font-bold text-blue-700">60%</div>
                  <div>
                    <h4 className="font-bold text-slate-900">Phần của Operator (Bên nuôi)</h4>
                    <p className="text-xs text-slate-500">Trại Cần Giờ 02</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-slate-900 text-lg">85.500.000 ₫</div>
                  <div className="text-xs text-slate-500">Chuyển vào Ví Operator</div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-200 rounded flex items-center justify-center font-bold text-amber-700">35%</div>
                  <div>
                    <h4 className="font-bold text-slate-900">Phần của Nhà Đầu Tư (Investors)</h4>
                    <p className="text-xs text-slate-500">Chia theo tỷ lệ cổ phần sở hữu (xem bảng phụ)</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-slate-900 text-lg">49.875.000 ₫</div>
                  <div className="text-xs text-slate-500">Phân bổ cho 3 nhà đầu tư</div>
                </div>
              </div>
              <p className="text-xs italic text-slate-500 text-right mt-2">* Tỷ lệ 60/40 được tính sau khi đã trừ 5% phí nền tảng.</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <SplitSquareVertical className="w-4 h-4 text-slate-400" /> Bảng phụ: Chia tiền Investor
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div>
                  <div className="font-bold text-slate-700">Trần Trọng A</div>
                  <div className="text-xs text-slate-500">Chiếm 30% quỹ NĐT</div>
                </div>
                <div className="font-mono font-bold text-slate-900">14.962.500 ₫</div>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div>
                  <div className="font-bold text-slate-700">Lê Thị B</div>
                  <div className="text-xs text-slate-500">Chiếm 50% quỹ NĐT</div>
                </div>
                <div className="font-mono font-bold text-slate-900">24.937.500 ₫</div>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div>
                  <div className="font-bold text-slate-700">Phạm Văn C</div>
                  <div className="text-xs text-slate-500">Chiếm 20% quỹ NĐT</div>
                </div>
                <div className="font-mono font-bold text-slate-900">9.975.000 ₫</div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">Kiểm tra hợp lệ</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Tổng chi và tổng thu khớp 100%. Các ví nhận tiền đã được xác thực (eKYC). Bạn có thể tiến hành giải ngân.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
