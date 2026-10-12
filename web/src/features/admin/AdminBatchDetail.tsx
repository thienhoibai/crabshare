import { ArrowLeft, CheckCircle, FileText, AlertCircle } from 'lucide-react';
import AdminLayout from './AdminLayout';

export default function AdminBatchDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const batchId = urlParams.get('id') || 'BATCH-2026-12C';

  return (
    <AdminLayout activeTab="batches">
      <div className="mb-6">
        <a href="/admin/batches" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách Lô
        </a>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Hồ sơ Dự án: {batchId}</h1>
            <p className="text-sm text-slate-500 mt-1">Trại đề xuất: <strong className="text-slate-900">Trại Cà Mau 01 (Lê Văn C)</strong></p>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">
              Yêu cầu bổ sung
            </button>
            <button onClick={() => { alert('Dự án đã được duyệt và mở gọi vốn trên nền tảng!'); window.location.href='/admin/batches'; }} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">
              <CheckCircle className="w-4 h-4" /> Duyệt & Mở Gọi Vốn
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Kế hoạch Tài chính</h3>
            <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
              <div><span className="block text-slate-500 mb-1">Tổng Vốn Cần Gọi</span><strong className="text-2xl text-slate-900">250.000.000 ₫</strong></div>
              <div><span className="block text-slate-500 mb-1">Thời gian nuôi dự kiến</span><strong className="text-slate-900">3.5 tháng</strong></div>
              <div><span className="block text-slate-500 mb-1">Sản lượng dự kiến</span><strong className="text-slate-900">1,200 kg Cua Thịt</strong></div>
              <div><span className="block text-slate-500 mb-1">Tỷ suất lợi nhuận (ROI) ước tính</span><strong className="text-emerald-600 text-lg">15% - 20% / vụ</strong></div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" /> Hồ sơ năng lực Trại
            </h3>
            <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
              <p><strong>Cơ sở vật chất:</strong> 2.000 hộp nuôi đơn, công suất ô đã duyệt 2.000.</p>
              <p><strong>Lịch sử tín nhiệm:</strong> Đã thực hiện thành công 2 vụ nuôi trên nền tảng CrabShare, tỷ lệ cua sống (survival rate) đạt 82%. Không có lịch sử vi phạm hợp đồng.</p>
              <p><strong>Bao tiêu (Offtake):</strong> Có 1 đối tác nhà hàng (CrabHouse) đã ký cam kết mua 50% sản lượng lô này với giá cố định 350.000đ/kg.</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4">Quy trình Phê duyệt</h3>
            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-6 h-6 rounded-full border border-white bg-emerald-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                  <CheckCircle className="w-3 h-3" />
                </div>
                <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] p-3 rounded border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between space-x-2 mb-1">
                    <div className="font-bold text-slate-900 text-xs">Operator nộp hồ sơ</div>
                  </div>
                  <div className="text-[10px] text-slate-500">Hoàn tất ngày 05/10/2026</div>
                </div>
              </div>
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-6 h-6 rounded-full border border-white bg-amber-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                  <AlertCircle className="w-3 h-3" />
                </div>
                <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] p-3 rounded border border-amber-200 bg-amber-50 shadow-sm">
                  <div className="flex items-center justify-between space-x-2 mb-1">
                    <div className="font-bold text-amber-900 text-xs">Admin Thẩm định</div>
                  </div>
                  <div className="text-[10px] text-amber-700">Đang chờ bạn phê duyệt</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
