import { Search, Filter, PlayCircle, Clock, CheckCircle2 } from 'lucide-react';
import AdminLayout from './AdminLayout';

const mockBatches = [
  { id: 'BATCH-2026-11A', name: 'Lô Cua Lột 11A', operator: 'Trại Cần Giờ 01', type: 'Cua Lột', funding: '75,000,000 ₫', status: 'farming' },
  { id: 'BATCH-2026-10B', name: 'Lô Cua Gạch 10B', operator: 'Trại Cần Giờ 02', type: 'Cua Gạch', funding: '120,000,000 ₫', status: 'harvested' },
  { id: 'BATCH-2026-12C', name: 'Lô Cua Thịt Sinh Thái 12C', operator: 'Trại Cà Mau 01', type: 'Cua Thịt', funding: '250,000,000 ₫', status: 'pending' },
];

export default function AdminBatches() {
  return (
    <AdminLayout activeTab="batches">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Kiểm duyệt Dự án / Lô nuôi</h1>
        <p className="text-sm text-slate-500 mt-1">Quản lý các chiến dịch gọi vốn và giám sát tiến độ chăn nuôi của các Trại.</p>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Tìm ID Lô, Tên trại..." className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          </div>
          <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors w-full sm:w-auto justify-center">
            <Filter className="w-4 h-4" /> Lọc dự án
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="p-4 font-bold">Mã Lô</th>
                <th className="p-4 font-bold">Tên Dự án</th>
                <th className="p-4 font-bold">Operator</th>
                <th className="p-4 font-bold">Mục tiêu gọi vốn</th>
                <th className="p-4 font-bold">Trạng thái</th>
                <th className="p-4 font-bold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mockBatches.map(batch => (
                <tr key={batch.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-semibold text-slate-900">{batch.id}</td>
                  <td className="p-4 font-bold text-slate-700">{batch.name}</td>
                  <td className="p-4 text-slate-600">{batch.operator}</td>
                  <td className="p-4 font-mono font-medium text-slate-900">{batch.funding}</td>
                  <td className="p-4">
                    {batch.status === 'pending' && (
                      <span className="flex items-center gap-1.5 text-amber-600 text-xs font-bold bg-amber-50 px-2.5 py-1 rounded-full w-fit">
                        <Clock className="w-3.5 h-3.5" /> Chờ duyệt Gọi vốn
                      </span>
                    )}
                    {batch.status === 'farming' && (
                      <span className="flex items-center gap-1.5 text-blue-600 text-xs font-bold bg-blue-50 px-2.5 py-1 rounded-full w-fit">
                        <PlayCircle className="w-3.5 h-3.5" /> Đang nuôi
                      </span>
                    )}
                    {batch.status === 'harvested' && (
                      <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold bg-emerald-50 px-2.5 py-1 rounded-full w-fit">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã thu hoạch
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <a href={`/admin/batches/detail?id=${batch.id}`} className="text-red-600 font-bold hover:text-red-700 text-xs uppercase tracking-wide">
                      Xét duyệt
                    </a>
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
