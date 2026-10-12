import { Search, Filter, AlertTriangle, PhoneCall, ShieldAlert, Video } from 'lucide-react';
import AdminLayout from './AdminLayout';

const mockAlerts = [
  { id: 'ALT-101', batch: 'BATCH-2026-11A', farm: 'Trại Cần Giờ 01', type: 'Nhiệt độ nước quá ngưỡng (nhật ký)', level: 'high', date: '27/09/2026 14:30', status: 'escalated' },
  { id: 'ALT-102', batch: 'BATCH-2026-09C', farm: 'Trại Cà Mau 02', type: 'Thiếu Log thức ăn 2 ngày', level: 'medium', date: '26/09/2026 08:00', status: 'escalated' },
];

export default function AdminAlerts() {
  return (
    <AdminLayout activeTab="alerts">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Cảnh báo Trại (Leo thang)</h1>
        <p className="text-sm text-slate-500 mt-1">Giám sát rủi ro: Xử lý các cảnh báo mà Operator bỏ qua hoặc không khắc phục kịp thời (Theo UC-06).</p>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Tìm ID Cảnh báo, Trại..." className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          </div>
          <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors w-full sm:w-auto justify-center">
            <Filter className="w-4 h-4" /> Lọc mức độ
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="p-4 font-bold">Mã Lỗi</th>
                <th className="p-4 font-bold">Mức độ</th>
                <th className="p-4 font-bold">Lý do leo thang</th>
                <th className="p-4 font-bold">Lô / Trại</th>
                <th className="p-4 font-bold">Thời gian</th>
                <th className="p-4 font-bold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mockAlerts.map(alert => (
                <tr key={alert.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-semibold text-slate-900">{alert.id}</td>
                  <td className="p-4">
                    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold w-fit ${alert.level === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      <AlertTriangle className="w-3.5 h-3.5" /> {alert.level === 'high' ? 'Nghiêm trọng' : 'Cảnh cáo'}
                    </span>
                  </td>
                  <td className="p-4 font-medium text-slate-700">{alert.type}</td>
                  <td className="p-4">
                    <div className="text-slate-900 font-bold">{alert.batch}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{alert.farm}</div>
                  </td>
                  <td className="p-4 text-slate-600">{alert.date}</td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Xem Camera trại">
                        <Video className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Gọi Operator">
                        <PhoneCall className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors" title="Đóng băng Lô nuôi">
                        <ShieldAlert className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
