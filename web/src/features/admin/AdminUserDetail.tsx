import { ArrowLeft, CheckCircle, XCircle, FileText, Image as ImageIcon } from 'lucide-react';
import AdminLayout from './AdminLayout';

export default function AdminUserDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const userId = urlParams.get('id') || 'USR-802';

  return (
    <AdminLayout activeTab="users">
      <div className="mb-6">
        <a href="/admin/users" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
        </a>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Chi tiết Hồ sơ: {userId}</h1>
            <p className="text-sm text-slate-500 mt-1">Vai trò đăng ký: <strong className="text-amber-600">Operator (Chủ trại)</strong></p>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">
              <XCircle className="w-4 h-4" /> Từ chối eKYC
            </button>
            <button onClick={() => { alert('Đã duyệt hồ sơ thành công!'); window.location.href='/admin/users'; }} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">
              <CheckCircle className="w-4 h-4" /> Phê duyệt
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Thông tin Cá nhân</h3>
            <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
              <div><span className="block text-slate-500 mb-1">Họ và Tên</span><strong className="text-slate-900">Nguyễn Văn A</strong></div>
              <div><span className="block text-slate-500 mb-1">Số điện thoại</span><strong className="text-slate-900">090 123 4567</strong></div>
              <div><span className="block text-slate-500 mb-1">Email</span><strong className="text-slate-900">nguyenvana@gmail.com</strong></div>
              <div><span className="block text-slate-500 mb-1">Ngày sinh</span><strong className="text-slate-900">12/05/1985</strong></div>
              <div className="col-span-2"><span className="block text-slate-500 mb-1">Địa chỉ thường trú</span><strong className="text-slate-900">123 Đường Rừng Sác, Xã Bình Khánh, Huyện Cần Giờ, TP.HCM</strong></div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" /> Tài liệu Đối chiếu (CCCD)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
                <p className="text-xs font-bold text-slate-500 text-center mb-2">Mặt trước CCCD</p>
                <div className="w-full h-40 bg-slate-200 rounded flex items-center justify-center text-slate-400">
                  <ImageIcon className="w-8 h-8" />
                </div>
              </div>
              <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
                <p className="text-xs font-bold text-slate-500 text-center mb-2">Mặt sau CCCD</p>
                <div className="w-full h-40 bg-slate-200 rounded flex items-center justify-center text-slate-400">
                  <ImageIcon className="w-8 h-8" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-amber-50 p-6 rounded-xl border border-amber-200 shadow-sm">
            <h3 className="font-bold text-amber-900 mb-2">Trạng thái Xác thực</h3>
            <p className="text-sm text-amber-700 leading-relaxed mb-4">
              Hệ thống AI đã quét và khớp thông tin text với hình ảnh CCCD (Độ chính xác 98%). Vui lòng kiểm tra lại hình ảnh chân dung để ra quyết định cuối cùng.
            </p>
            <div className="space-y-2 text-sm text-amber-800">
              <div className="flex justify-between border-b border-amber-200/50 pb-1">
                <span>Số CCCD</span><strong className="font-mono">079200123456</strong>
              </div>
              <div className="flex justify-between border-b border-amber-200/50 pb-1">
                <span>Điểm FaceMatch</span><strong>95%</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
