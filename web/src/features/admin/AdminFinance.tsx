import { CheckCircle2, AlertTriangle, ArrowRightLeft, DollarSign } from 'lucide-react';
import AdminLayout from './AdminLayout';

const pendingSettlements = [
  { id: 'BATCH-2026-10B', name: 'Lô Cua Gạch 10B', revenue: '150,000,000 ₫', status: 'ready', date: '25/09/2026' },
  { id: 'BATCH-2026-09A', name: 'Lô Cua Lột 09A', revenue: '85,000,000 ₫', status: 'processing', date: '22/09/2026' },
];

const withdrawalRequests = [
  { id: 'WD-001', user: 'Trần Thị B', role: 'Investor', amount: '25,000,000 ₫', bank: 'Vietcombank', status: 'pending' },
  { id: 'WD-002', user: 'Trại Cần Giờ 01', role: 'Operator', amount: '60,000,000 ₫', bank: 'MB Bank', status: 'pending' },
];

export default function AdminFinance() {
  return (
    <AdminLayout activeTab="finance">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Đối soát & Tài chính</h1>
        <p className="text-sm text-slate-500 mt-1">Quản lý chia sẻ doanh thu (Revenue Pool) và xử lý giao dịch Rút/Nạp.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Ví Nền tảng (Platform Pool)</p>
            <h3 className="text-3xl font-extrabold text-slate-900">4,250,000,000 <span className="text-sm font-medium text-slate-500">₫</span></h3>
          </div>
          <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Doanh thu chờ đối soát</p>
            <h3 className="text-3xl font-extrabold text-slate-900">235,000,000 <span className="text-sm font-medium text-slate-500">₫</span></h3>
          </div>
          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Settlement Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="font-bold text-slate-900">1. Các Lô chờ Đối soát Doanh thu (Settlement)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white border-b border-slate-100 text-slate-500">
                <tr>
                  <th className="p-4 font-bold">Mã Lô</th>
                  <th className="p-4 font-bold">Tên Dự án</th>
                  <th className="p-4 font-bold">Tổng Doanh thu</th>
                  <th className="p-4 font-bold">Ngày kết thúc</th>
                  <th className="p-4 font-bold">Trạng thái</th>
                  <th className="p-4 font-bold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingSettlements.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-semibold text-slate-900">{item.id}</td>
                    <td className="p-4 font-bold text-slate-700">{item.name}</td>
                    <td className="p-4 font-mono font-medium text-emerald-600">{item.revenue}</td>
                    <td className="p-4 text-slate-600">{item.date}</td>
                    <td className="p-4">
                      {item.status === 'ready' ? (
                        <span className="flex items-center gap-1.5 text-blue-600 text-xs font-bold bg-blue-50 px-2.5 py-1 rounded-full w-fit">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Sẵn sàng đối soát
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-amber-600 text-xs font-bold bg-amber-50 px-2.5 py-1 rounded-full w-fit">
                          <AlertTriangle className="w-3.5 h-3.5" /> Đang chốt sổ
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {item.status === 'ready' && (
                        <a href={`/admin/finance/settlement?id=${item.id}`} className="text-red-600 font-bold hover:text-red-700 text-xs uppercase tracking-wide">
                          Thực thi
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Withdrawal Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="font-bold text-slate-900">2. Yêu cầu Rút tiền (Withdrawals)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white border-b border-slate-100 text-slate-500">
                <tr>
                  <th className="p-4 font-bold">Mã GD</th>
                  <th className="p-4 font-bold">Người yêu cầu</th>
                  <th className="p-4 font-bold">Số tiền rút</th>
                  <th className="p-4 font-bold">Ngân hàng thụ hưởng</th>
                  <th className="p-4 font-bold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {withdrawalRequests.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-semibold text-slate-900">{item.id}</td>
                    <td className="p-4">
                      <div className="font-bold text-slate-700">{item.user}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{item.role}</div>
                    </td>
                    <td className="p-4 font-mono font-medium text-slate-900">{item.amount}</td>
                    <td className="p-4 text-slate-600">{item.bank}</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded transition-colors">Từ chối</button>
                        <button onClick={() => alert('Đã duyệt chuyển khoản!')} className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-colors">Duyệt chi</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
