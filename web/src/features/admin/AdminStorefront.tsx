import { Search, Filter, Store, CheckCircle, XCircle } from 'lucide-react';
import AdminLayout from './AdminLayout';

const mockRequests = [
  { id: 'REQ-509', batch: 'BATCH-2026-10B', operator: 'Trại Cần Giờ 02', type: 'Cua Lột', proposedPrice: '850,000 ₫', marketPrice: '800,000 ₫', status: 'pending', date: '27/09/2026' },
  { id: 'REQ-510', batch: 'BATCH-2026-09A', operator: 'Trại Cà Mau 01', type: 'Cua Thịt Sinh Thái', proposedPrice: '450,000 ₫', marketPrice: '450,000 ₫', status: 'approved', date: '26/09/2026' },
];

export default function AdminStorefront() {
  return (
    <AdminLayout activeTab="storefront">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Duyệt Sản Phẩm (Storefront)</h1>
        <p className="text-sm text-slate-500 mt-1">Kiểm duyệt giá bán và chất lượng trước khi cho phép Cua lên kệ bán lẻ (Customer Storefront).</p>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Tìm ID Yêu cầu, Lô cua..." className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
          </div>
          <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors w-full sm:w-auto justify-center">
            <Filter className="w-4 h-4" /> Lọc trạng thái
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="p-4 font-bold">Mã YC</th>
                <th className="p-4 font-bold">Lô Nuôi / Trại</th>
                <th className="p-4 font-bold">Loại Sản phẩm</th>
                <th className="p-4 font-bold">Giá Operator Đề xuất</th>
                <th className="p-4 font-bold">Giá Thị trường</th>
                <th className="p-4 font-bold">Trạng thái</th>
                <th className="p-4 font-bold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mockRequests.map(req => (
                <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-semibold text-slate-900">{req.id}</td>
                  <td className="p-4">
                    <div className="text-slate-900 font-bold">{req.batch}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{req.operator}</div>
                  </td>
                  <td className="p-4 font-medium text-slate-700">{req.type}</td>
                  <td className="p-4 font-mono font-bold text-slate-900">
                    {req.proposedPrice}
                    {req.proposedPrice !== req.marketPrice && (
                      <span className="block text-[10px] text-amber-600 font-normal mt-0.5">Cao hơn 50k</span>
                    )}
                  </td>
                  <td className="p-4 font-mono text-slate-500">{req.marketPrice}</td>
                  <td className="p-4">
                    {req.status === 'pending' ? (
                      <span className="flex items-center gap-1.5 text-amber-600 text-xs font-bold bg-amber-50 px-2.5 py-1 rounded-full w-fit">
                        Chờ duyệt lên kệ
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold bg-emerald-50 px-2.5 py-1 rounded-full w-fit">
                        Đang bán trên Store
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    {req.status === 'pending' ? (
                      <div className="flex justify-end gap-2">
                        <button className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors" title="Từ chối / Yêu cầu đổi giá">
                          <XCircle className="w-5 h-5" />
                        </button>
                        <button onClick={() => alert('Đã duyệt! Sản phẩm hiện đã có mặt trên trang Cửa hàng (Storefront) để khách hàng mua.')} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Duyệt lên kệ">
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <button className="text-blue-600 font-bold hover:text-blue-700 text-xs uppercase tracking-wide flex justify-end items-center gap-1 w-full">
                        <Store className="w-4 h-4" /> Xem hiển thị
                      </button>
                    )}
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
