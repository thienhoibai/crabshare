import { Search, Filter, CheckCircle2, Clock } from 'lucide-react';
import AdminLayout from './AdminLayout';

const mockUsers = [
  { id: 'USR-802', name: 'Nguyễn Văn A', role: 'Operator', status: 'pending', phone: '0901234567', date: '01/10/2026' },
  { id: 'USR-803', name: 'Trần Thị B', role: 'Investor', status: 'approved', phone: '0987654321', date: '30/09/2026' },
  { id: 'USR-804', name: 'Lê Văn C', role: 'Investor', status: 'pending', phone: '0912223334', date: '02/10/2026' },
  { id: 'USR-805', name: 'Phạm Thị D', role: 'Customer', status: 'approved', phone: '0977888999', date: '25/09/2026' },
];

export default function AdminUsers() {
  return (
    <AdminLayout activeTab="users">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Quản lý Người dùng & eKYC</h1>
        <p className="text-sm text-slate-500 mt-1">Duyệt hồ sơ định danh và cấp quyền truy cập nền tảng.</p>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Tìm ID, Tên, Số điện thoại..." className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          </div>
          <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors w-full sm:w-auto justify-center">
            <Filter className="w-4 h-4" /> Lọc trạng thái
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="p-4 font-bold">Mã User</th>
                <th className="p-4 font-bold">Họ và Tên</th>
                <th className="p-4 font-bold">Phân quyền</th>
                <th className="p-4 font-bold">Liên hệ</th>
                <th className="p-4 font-bold">Ngày đăng ký</th>
                <th className="p-4 font-bold">Trạng thái eKYC</th>
                <th className="p-4 font-bold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mockUsers.map(user => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-semibold text-slate-900">{user.id}</td>
                  <td className="p-4 font-bold text-slate-700">{user.name}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      user.role === 'Operator' ? 'bg-amber-100 text-amber-700' : 
                      user.role === 'Investor' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4 text-slate-600">{user.phone}</td>
                  <td className="p-4 text-slate-600">{user.date}</td>
                  <td className="p-4">
                    {user.status === 'pending' ? (
                      <span className="flex items-center gap-1.5 text-amber-600 text-xs font-bold bg-amber-50 px-2.5 py-1 rounded-full w-fit">
                        <Clock className="w-3.5 h-3.5" /> Chờ duyệt
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold bg-emerald-50 px-2.5 py-1 rounded-full w-fit">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã duyệt
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <a href={`/admin/users/detail?id=${user.id}`} className="text-red-600 font-bold hover:text-red-700 text-xs uppercase tracking-wide">
                      Xem hồ sơ
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
