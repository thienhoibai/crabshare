import { Save, Settings2, FileSignature } from 'lucide-react';
import AdminLayout from './AdminLayout';
import FeeTierEditor from './FeeTierEditor';

export default function AdminSettings() {
  return (
    <AdminLayout activeTab="settings">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Cài đặt Hệ thống & Pháp lý</h1>
        <p className="text-sm text-slate-500 mt-1">Cấu hình các tham số cốt lõi và quản lý phôi Hợp đồng điện tử.</p>
      </header>

      <FeeTierEditor />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Platform Config */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-blue-600" /> Cấu hình Nền tảng (Platform Rules)
          </h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Số ngày tối đa xử lý cảnh báo</label>
              <div className="flex items-center gap-3">
                <input type="number" defaultValue={1} className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                <span className="text-sm text-slate-500">ngày. Nếu Operator lơ, tự động leo thang lên Admin.</span>
              </div>
            </div>

            <button onClick={() => alert('Đã lưu cấu hình Hệ thống!')} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">
              <Save className="w-4 h-4" /> Lưu cấu hình
            </button>
          </div>
        </div>

        {/* Contract Templates */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-emerald-600" /> Quản lý Phôi Hợp Đồng (Viettel-CA)
          </h2>
          
          <div className="space-y-4">
            <div className="p-4 border border-emerald-200 bg-emerald-50 rounded-lg flex justify-between items-center">
              <div>
                <p className="font-bold text-emerald-900 text-sm">Hợp đồng Hợp tác Kinh doanh (Bản Operator)</p>
                <p className="text-xs text-emerald-700 mt-1">Version: 1.2 • Cập nhật: 10/09/2026</p>
              </div>
              <button className="px-3 py-1.5 bg-white border border-emerald-300 text-emerald-700 rounded text-xs font-bold hover:bg-emerald-100">
                Cập nhật File PDF
              </button>
            </div>

            <div className="p-4 border border-slate-200 bg-slate-50 rounded-lg flex justify-between items-center">
              <div>
                <p className="font-bold text-slate-900 text-sm">Hợp đồng Góp Vốn (Bản Investor)</p>
                <p className="text-xs text-slate-500 mt-1">Version: 1.0 • Cập nhật: 01/01/2026</p>
              </div>
              <button className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-100">
                Cập nhật File PDF
              </button>
            </div>
            
            <p className="text-xs italic text-slate-500">Các phôi PDF này sẽ được sử dụng để ghép chữ ký số Viettel-CA Cloud khi các bên xác nhận ký kết.</p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
