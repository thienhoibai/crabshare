import { useQuery } from '@tanstack/react-query'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { formatDateTime, formatVnd } from '../../shared/lib/format'
import { listUnmatchedTransactions } from './financeApi'

/** UC40 — tiền vào tài khoản lô chưa khớp khoản thu nào, hoặc đến sau hạn (đã tự lập lệnh hoàn, TL-10 §5). */
export default function AdminUnmatchedPanel() {
  const userId = useAuthStore(s => s.user?.userId)
  const query = useQuery({ queryKey: ['admin-unmatched', userId], queryFn: ({ signal }) => listUnmatchedTransactions(signal), retry: false })
  return <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="p-4 border-b border-slate-200 bg-slate-50">
      <h2 className="font-bold text-slate-900">Giao dịch chờ đối soát</h2>
      <p className="text-xs text-slate-500 mt-0.5">Không khớp: không có mã đối chiếu, sai tài khoản lô hoặc sai số tiền — kiểm tra tay. Trả trễ: tiền đến khi mã đã hết hạn, hệ thống đã lập lệnh hoàn.</p>
    </div>
    {query.isPending && <p className="p-4" role="status">Đang tải giao dịch…</p>}
    {query.isError && <div className="p-4" role="alert">{errorMessage(query.error)} <button className="underline" onClick={() => void query.refetch()}>Thử lại</button></div>}
    {query.data && <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="bg-white border-b border-slate-100 text-slate-500"><tr>
        {['Mã giao dịch', 'Lô', 'Số tiền', 'Nội dung chuyển khoản', 'Kết quả', 'Khoản thu gần khớp', 'Thời điểm'].map(h => <th key={h} scope="col" className="p-4 font-bold whitespace-nowrap">{h}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-slate-100">{query.data.map(t => <tr key={t.transactionId}>
        <td className="p-4 font-mono text-xs whitespace-nowrap">{t.providerTxnId}</td>
        <td className="p-4 font-semibold whitespace-nowrap">{t.batchCode}</td>
        <td className="p-4 font-mono whitespace-nowrap">{formatVnd(t.amount)}</td>
        <td className="p-4 text-xs min-w-48">{t.content ?? '—'}</td>
        <td className="p-4 whitespace-nowrap"><span className={`text-xs font-bold px-2.5 py-1 rounded-full ${t.matchStatus === 'LatePayment' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
          {t.matchStatus === 'LatePayment' ? 'Trả trễ, đã lập lệnh hoàn' : 'Không khớp'}</span></td>
        <td className="p-4 text-xs whitespace-nowrap">{t.paymentRequestReference ? `${t.paymentRequestReference} · ${formatVnd(t.paymentRequestAmount ?? 0)} · ${t.paymentRequestStatus}` : '—'}</td>
        <td className="p-4 text-xs whitespace-nowrap">{formatDateTime(t.occurredAt)}</td>
      </tr>)}</tbody>
    </table>
      {query.data.length === 0 && <p className="p-4 text-sm text-slate-500">Không có giao dịch nào chờ đối soát.</p>}
    </div>}
  </section>
}
