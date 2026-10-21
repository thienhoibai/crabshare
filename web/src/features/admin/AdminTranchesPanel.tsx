import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { formatDate, formatDateTime, formatVnd } from '../../shared/lib/format'
import { askTrancheExplanation, blockTranche, instructionStatuses, listAdminTranches, releaseTranche, trancheStatuses, type Tranche } from './financeApi'

type Action = { id: number; kind: 'release' | 'explain' | 'block'; reason: string }

/** TH-10 — đợt giải ngân người nuôi đang xin: duyệt (lập lệnh chi), yêu cầu giải trình 72 giờ, hoặc dừng chi (TL-03 §6.4). */
export default function AdminTranchesPanel() {
  const userId = useAuthStore(s => s.user?.userId)
  const qc = useQueryClient()
  const [status, setStatus] = useState('')
  const [reasonFor, setReasonFor] = useState<{ id: number; kind: 'explain' | 'block' } | null>(null)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')
  const query = useQuery({ queryKey: ['admin-tranches', userId, status], queryFn: ({ signal }) => listAdminTranches(status, signal), retry: false })
  const act = useMutation({
    mutationFn: (a: Action) => a.kind === 'release' ? releaseTranche(a.id) : a.kind === 'explain' ? askTrancheExplanation(a.id, a.reason) : blockTranche(a.id, a.reason),
    onSuccess: async (t: Tranche, a) => {
      setNotice(a.kind === 'release' ? `Đã duyệt đợt ${t.trancheNo} lô ${t.batchCode}; lệnh chi #${t.instructionId} chờ gửi ở tab Lệnh chi.`
        : a.kind === 'explain' ? `Đã yêu cầu giải trình đợt ${t.trancheNo} lô ${t.batchCode}, hạn ${formatDateTime(t.explanationDeadline)}.`
          : `Đã dừng chi đợt ${t.trancheNo} lô ${t.batchCode}.`)
      setReasonFor(null); setReason('')
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin-tranches'] }), qc.invalidateQueries({ queryKey: ['admin-instructions'] })])
    },
  })

  return <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-end gap-4">
      <div className="mr-auto">
        <h2 className="font-bold text-slate-900">Giải ngân theo mốc</h2>
        <p className="text-xs text-slate-500 mt-0.5">Hệ thống chỉ cho xin khi điều kiện mốc đạt (TL-03); duyệt lại kiểm tra lần nữa trước khi lập lệnh chi.</p>
      </div>
      <label className="text-sm">Trạng thái<select className="block border border-slate-300 rounded-lg p-2 mt-1" value={status} onChange={e => setStatus(e.target.value)}>
        <option value="">Đang chờ xử lý</option>{Object.entries(trancheStatuses).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select></label>
    </div>
    {notice && <p className="p-4 text-sm text-emerald-700 bg-emerald-50 border-b border-emerald-100" role="status">{notice}</p>}
    {act.isError && <p className="p-4 text-sm text-red-700" role="alert">{errorMessage(act.error)}</p>}
    {query.isPending && <p className="p-4" role="status">Đang tải đợt giải ngân…</p>}
    {query.isError && <div className="p-4" role="alert">{errorMessage(query.error)} <button className="underline" onClick={() => void query.refetch()}>Thử lại</button></div>}
    {query.data && <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="bg-white border-b border-slate-100 text-slate-500"><tr>
        {['Lô · đợt', 'Số tiền', 'Ngày dự kiến', 'Điều kiện mở', 'Trạng thái', 'Thao tác'].map(h => <th key={h} scope="col" className="p-4 font-bold whitespace-nowrap">{h}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-slate-100">{query.data.map(t => <tr key={t.trancheId} className="align-top">
        <td className="p-4 min-w-48"><div className="font-semibold whitespace-nowrap">{t.batchCode} · đợt {t.trancheNo}</div><div className="text-xs text-slate-500">{t.operatorName}</div></td>
        <td className="p-4 font-mono whitespace-nowrap">{formatVnd(t.plannedAmount)}</td>
        <td className="p-4 whitespace-nowrap">{t.plannedDate ? formatDate(t.plannedDate) : '—'}</td>
        <td className="p-4 text-xs text-slate-600 min-w-56">{t.unlockCondition}{t.status === 'Requested' && t.blockedReason && <div className="text-red-700 mt-1">Hiện chưa đạt: {t.blockedReason}</div>}</td>
        <td className="p-4 whitespace-nowrap">{trancheStatuses[t.status]}
          {t.requestedAt && <div className="text-xs text-slate-500">Xin lúc {formatDateTime(t.requestedAt)}</div>}
          {t.explanationDeadline && t.status === 'NeedsExplanation' && <div className="text-xs text-amber-700">Hạn giải trình {formatDateTime(t.explanationDeadline)}</div>}
          {t.instructionStatus && <div className="text-xs text-slate-500">Lệnh chi #{t.instructionId}: {instructionStatuses[t.instructionStatus]}</div>}
        </td>
        <td className="p-4 min-w-64">
          {t.status === 'Requested' && <div className="flex flex-wrap gap-2">
            <button className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded disabled:opacity-50" disabled={act.isPending}
              onClick={() => { setNotice(''); act.mutate({ id: t.trancheId, kind: 'release', reason: '' }) }}>Duyệt giải ngân</button>
            <button className="px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 rounded" onClick={() => { setReasonFor({ id: t.trancheId, kind: 'explain' }); setReason('') }}>Yêu cầu giải trình</button>
          </div>}
          {(t.status === 'Requested' || t.status === 'NeedsExplanation') &&
            <button className="mt-2 px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 rounded" onClick={() => { setReasonFor({ id: t.trancheId, kind: 'block' }); setReason('') }}>Dừng chi</button>}
          {reasonFor?.id === t.trancheId && <form className="mt-2 space-y-2" onSubmit={e => { e.preventDefault(); setNotice(''); act.mutate({ id: t.trancheId, kind: reasonFor.kind, reason }) }}>
            <textarea className="w-full border border-slate-300 rounded-lg p-2 text-sm" required minLength={5} maxLength={300} value={reason} onChange={e => setReason(e.target.value)}
              placeholder={reasonFor.kind === 'explain' ? 'Cần bổ sung gì, ví dụ ảnh hộp nuôi tuần này' : 'Lý do dừng chi'} aria-label="Lý do" />
            <div className="flex gap-2"><button className="px-3 py-1.5 text-xs font-bold text-white bg-slate-900 rounded disabled:opacity-50" disabled={act.isPending}>Xác nhận</button>
              <button type="button" className="px-3 py-1.5 text-xs" onClick={() => setReasonFor(null)}>Huỷ</button></div>
          </form>}
        </td>
      </tr>)}</tbody>
    </table>
      {query.data.length === 0 && <p className="p-4 text-sm text-slate-500">Không có đợt giải ngân nào ở trạng thái này.</p>}
    </div>}
  </section>
}
