import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useSearchParams } from 'react-router';
import AdminLayout from './AdminLayout';
import AdminFundingPanel from './AdminFundingPanel';
import AdminInstructionsPanel from './AdminInstructionsPanel';
import AdminBatchContracts from './AdminBatchContracts';

// Bảng quyết toán còn là dữ liệu mẫu: làm thật ở TH-12 / TH-13 / TH-14.
const pendingSettlements = [
  { id: 'BATCH-2026-10B', name: 'Lô Cua Gạch 10B', revenue: '150,000,000 ₫', status: 'ready', date: '25/09/2026' },
  { id: 'BATCH-2026-09A', name: 'Lô Cua Lột 09A', revenue: '85,000,000 ₫', status: 'processing', date: '22/09/2026' },
];

const tabs = [
  { id: 'funding', label: 'Gọi vốn' },
  { id: 'instructions', label: 'Lệnh chi' },
  { id: 'contracts', label: 'Hợp đồng' },
  { id: 'settlement', label: 'Quyết toán' },
] as const;
type Tab = typeof tabs[number]['id'];

export default function AdminFinance() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = tabs.some(t => t.id === params.get('tab')) ? params.get('tab') as Tab : 'funding';

  return (
    <AdminLayout activeTab="finance">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Đối soát & Tài chính</h1>
        <p className="text-sm text-slate-500 mt-1">Tiền nằm ở tài khoản chuyên dùng của từng lô do trung gian thanh toán giữ; nền tảng chỉ phát lệnh chi và đối soát.</p>
      </header>

      <div role="tablist" aria-label="Mục tài chính" className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px ${tab === t.id ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'funding' && <AdminFundingPanel />}
      {tab === 'instructions' && <AdminInstructionsPanel />}
      {tab === 'contracts' && <AdminBatchContracts />}
      {tab === 'settlement' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="font-bold text-slate-900">Các Lô chờ Đối soát Doanh thu (Settlement)</h2>
            <p className="text-xs text-slate-500 mt-0.5">Dữ liệu mẫu, chưa nối API.</p>
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
      )}
    </AdminLayout>
  );
}
