import { Link } from 'react-router'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime, formatVnd } from '../../shared/lib/format'
import { settlementStatuses, useAdminSettlements } from '../../shared/settlement/settlementApi'

/** Tab Quyết toán của AdminFinance (TH-12): lô đang thu hoạch / chờ quyết toán / đã đóng và bảng quyết toán của từng lô. */
export default function AdminSettlementsPanel() {
  const query = useAdminSettlements()
  return <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="p-4 border-b border-slate-200 bg-slate-50">
      <h2 className="font-bold text-slate-900">Quyết toán theo lô</h2>
      <p className="text-xs text-slate-500 mt-0.5">Revenue Pool = doanh thu thực thu − chi phí chuẩn đã khoá (TL-12). Công bố bảng thì nhà đầu tư có 7 ngày góp ý trước khi duyệt.</p>
    </div>
    {query.isPending && <p className="p-4" role="status">Đang tải…</p>}
    {query.isError && <div className="p-4" role="alert">{errorMessage(query.error)} <button className="underline" onClick={() => void query.refetch()}>Thử lại</button></div>}
    {query.data && <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="bg-white border-b border-slate-100 text-slate-500"><tr>
        {['Lô', 'Trạng thái lô', 'Doanh thu thực thu', 'Revenue Pool', 'Bảng quyết toán', 'Hạn góp ý', ''].map(h => <th key={h} scope="col" className="p-4 font-bold whitespace-nowrap">{h}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-slate-100">{query.data.map(r => <tr key={r.batchCode} className="hover:bg-slate-50">
        <td className="p-4 min-w-56"><div className="font-semibold whitespace-nowrap">{r.batchCode}</div><div className="text-xs text-slate-500">{r.batchTitle} · {r.operatorName}</div></td>
        <td className="p-4 whitespace-nowrap">{r.batchStatus}</td>
        <td className="p-4 font-mono whitespace-nowrap">{r.actualRevenue === null ? '—' : formatVnd(r.actualRevenue)}</td>
        <td className={`p-4 font-mono whitespace-nowrap ${(r.revenuePool ?? 0) < 0 ? 'text-red-700' : ''}`}>{r.revenuePool === null ? '—' : formatVnd(r.revenuePool)}</td>
        <td className="p-4 whitespace-nowrap">{r.status ? `${settlementStatuses[r.status]} · lần ${r.revisionNo}` : 'Chưa tính'}{r.openFeedback > 0 && <div className="text-xs text-amber-700">{r.openFeedback} góp ý chờ trả lời</div>}</td>
        <td className="p-4 whitespace-nowrap text-xs">{formatDateTime(r.feedbackDeadline) || '—'}</td>
        <td className="p-4 text-right whitespace-nowrap">
          <Link className="text-red-600 font-bold text-xs uppercase tracking-wide" to={r.settlementId ? `/admin/finance/settlement?id=${r.settlementId}` : `/admin/finance/settlement?code=${encodeURIComponent(r.batchCode)}`}>
            {r.settlementId ? 'Mở bảng' : 'Tính quyết toán'}
          </Link>
        </td>
      </tr>)}</tbody>
    </table>
      {query.data.length === 0 && <p className="p-4 text-sm text-slate-500">Chưa có lô nào tới giai đoạn thu hoạch.</p>}
    </div>}
  </section>
}
