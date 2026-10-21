import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlayCircle } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { formatDateTime, formatVnd } from '../../shared/lib/format'
import { fundingStages, listFundingBatches, runFundingClose, type AdminFundingBatch, type FundingStage } from './financeApi'

const stageStyle: Record<FundingStage, string> = {
  Scheduled: 'bg-slate-100 text-slate-600', Open: 'bg-blue-50 text-blue-700', AwaitingClose: 'bg-amber-50 text-amber-700',
  CapitalClosed: 'bg-emerald-50 text-emerald-700', Cancelled: 'bg-red-50 text-red-700',
}

/** Thanh tiến độ: phần đã xác nhận (đậm) + phần đang giữ chỗ (nhạt) trên trần vốn; vạch đứng là vốn tối thiểu khả thi. */
function Progress({ b }: { b: AdminFundingBatch }) {
  const pct = (n: number) => `${Math.min(100, (n / b.maxCapital) * 100)}%`
  return <div className="relative h-2.5 w-40 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
    <div className="absolute inset-y-0 left-0 bg-emerald-200" style={{ width: pct(b.confirmedCapital + b.reservedCapital) }} />
    <div className="absolute inset-y-0 left-0 bg-emerald-600" style={{ width: pct(b.confirmedCapital) }} />
    <div className="absolute inset-y-0 w-0.5 bg-slate-700" style={{ left: pct(b.minViableCapital) }} />
  </div>
}

/** TH-07 — vốn vào theo lô: đã giữ chỗ / đã xác nhận / mục tiêu; chạy chốt vốn ngay thay vì chờ job mỗi phút. */
export default function AdminFundingPanel() {
  const userId = useAuthStore(s => s.user?.userId)
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['admin-funding', userId], queryFn: ({ signal }) => listFundingBatches(signal), retry: false })
  const [notice, setNotice] = useState('')
  const close = useMutation({
    mutationFn: runFundingClose,
    onSuccess: async r => {
      const closed = r.batches.filter(b => b.outcome === 'CapitalClosed').map(b => b.batchCode)
      const cancelled = r.batches.filter(b => b.outcome === 'Cancelled')
      setNotice([
        `Hết hạn ${r.expiredReservations} khoản giữ chỗ.`,
        closed.length ? `Chốt vốn: ${closed.join(', ')}.` : '',
        cancelled.length ? `Huỷ vì thiếu vốn: ${cancelled.map(b => `${b.batchCode} (${b.refundCount} lệnh hoàn)`).join(', ')}.` : '',
        r.batches.length === 0 ? 'Không có lô nào tới hạn.' : '',
      ].filter(Boolean).join(' '))
      await qc.invalidateQueries({ queryKey: ['admin-funding'] })
      await qc.invalidateQueries({ queryKey: ['admin-instructions'] })
    },
  })

  return <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-bold text-slate-900">Vốn vào theo lô</h2>
        <p className="text-xs text-slate-500 mt-0.5">Job tự chạy mỗi phút: hết hạn giữ chỗ; tới hạn gọi vốn thì đủ vốn tối thiểu → chốt vốn, thiếu → huỷ lô và lập lệnh hoàn 100%.</p>
      </div>
      <button className="flex items-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
        disabled={close.isPending} onClick={() => { setNotice(''); close.mutate() }}>
        <PlayCircle className="w-4 h-4" /> {close.isPending ? 'Đang chạy…' : 'Chạy chốt vốn ngay'}
      </button>
    </div>
    {notice && <p className="p-4 text-sm text-emerald-700 bg-emerald-50 border-b border-emerald-100" role="status">{notice}</p>}
    {close.isError && <p className="p-4 text-sm text-red-700" role="alert">{errorMessage(close.error)}</p>}
    {query.isPending && <p className="p-4" role="status">Đang tải số liệu gọi vốn…</p>}
    {query.isError && <div className="p-4" role="alert">{errorMessage(query.error)} <button className="underline" onClick={() => void query.refetch()}>Thử lại</button></div>}
    {query.data && <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="bg-white border-b border-slate-100 text-slate-500"><tr>
        {['Lô', 'Tiến độ', 'Đã xác nhận', 'Đang giữ chỗ', 'Tối thiểu / Mục tiêu / Trần', 'Hạn gọi vốn', 'Trạng thái', 'Lệnh hoàn'].map(h => <th key={h} scope="col" className="p-4 font-bold whitespace-nowrap">{h}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-slate-100">{query.data.map(b => <tr key={b.batchCode} className="hover:bg-slate-50">
        <td className="p-4 min-w-64"><div className="font-semibold text-slate-900 whitespace-nowrap">{b.batchCode}</div><div className="text-xs text-slate-500">{b.title} · {b.operatorName}</div></td>
        <td className="p-4"><Progress b={b} /><div className="text-xs text-slate-500 mt-1">{b.investorCount} nhà đầu tư</div></td>
        <td className="p-4 font-mono whitespace-nowrap">{formatVnd(b.totalConfirmedCapital ?? b.confirmedCapital)}</td>
        <td className="p-4 font-mono whitespace-nowrap text-slate-500">{formatVnd(b.reservedCapital)}</td>
        <td className="p-4 font-mono whitespace-nowrap text-xs">{formatVnd(b.minViableCapital)}<br />{formatVnd(b.targetCapital)}<br />{formatVnd(b.maxCapital)}</td>
        <td className="p-4 whitespace-nowrap">{formatDateTime(b.fundingDeadline)}{b.capitalClosedAt && <div className="text-xs text-slate-500">Chốt: {formatDateTime(b.capitalClosedAt)}</div>}</td>
        <td className="p-4"><span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${stageStyle[b.stage]}`}>{fundingStages[b.stage]}</span></td>
        <td className="p-4 whitespace-nowrap">{b.refundCount === 0 ? '—' : `${b.refundCount} lệnh · ${b.refundOpenCount} chưa xong`}</td>
      </tr>)}</tbody>
    </table>
      {query.data.length === 0 && <p className="p-4 text-sm text-slate-500">Chưa có lô nào đang gọi vốn hoặc vừa huỷ.</p>}
    </div>}
  </section>
}
