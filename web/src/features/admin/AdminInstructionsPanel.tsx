import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { formatDateTime, formatVnd } from '../../shared/lib/format'
import { instructionStatuses, instructionTypes, listPaymentInstructions, type InstructionStatus, type PaymentInstruction } from './financeApi'

const statusStyle: Record<InstructionStatus, string> = {
  Created: 'bg-amber-50 text-amber-700', Sent: 'bg-blue-50 text-blue-700', Succeeded: 'bg-emerald-50 text-emerald-700',
  Failed: 'bg-red-50 text-red-700', Disputed: 'bg-red-50 text-red-700',
}

/**
 * UC40 — lệnh chi theo loại và trạng thái (hoàn tiền của TH-07, giải ngân và gửi lệnh của TH-10).
 * `actions` vẽ thêm nút thao tác cho từng dòng (ví dụ "Gửi lệnh").
 */
export default function AdminInstructionsPanel({ defaultType = '', actions }: { defaultType?: string; actions?: (i: PaymentInstruction) => ReactNode }) {
  const userId = useAuthStore(s => s.user?.userId)
  const [type, setType] = useState(defaultType)
  const [status, setStatus] = useState('')
  const [batchCode, setBatchCode] = useState('')
  const query = useQuery({
    queryKey: ['admin-instructions', userId, type, status, batchCode],
    queryFn: ({ signal }) => listPaymentInstructions({ type, status, batchCode: batchCode.trim() }, signal), retry: false,
  })

  return <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-end gap-4">
      <h2 className="font-bold text-slate-900 mr-auto">Lệnh chi từ tài khoản lô</h2>
      <label className="text-sm">Loại<select className="block border border-slate-300 rounded-lg p-2 mt-1" value={type} onChange={e => setType(e.target.value)}>
        <option value="">Tất cả</option>{Object.entries(instructionTypes).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select></label>
      <label className="text-sm">Trạng thái<select className="block border border-slate-300 rounded-lg p-2 mt-1" value={status} onChange={e => setStatus(e.target.value)}>
        <option value="">Tất cả</option>{Object.entries(instructionStatuses).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select></label>
      <label className="text-sm">Mã lô<input className="block border border-slate-300 rounded-lg p-2 mt-1 w-40" value={batchCode} onChange={e => setBatchCode(e.target.value)} placeholder="Tất cả lô" /></label>
    </div>
    {query.isPending && <p className="p-4" role="status">Đang tải lệnh chi…</p>}
    {query.isError && <div className="p-4" role="alert">{errorMessage(query.error)} <button className="underline" onClick={() => void query.refetch()}>Thử lại</button></div>}
    {query.data && <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="bg-white border-b border-slate-100 text-slate-500"><tr>
        {['#', 'Loại', 'Lô', 'Người nhận', 'Số tiền', 'Trạng thái', 'Ghi chú', 'Tạo lúc', ...(actions ? [''] : [])].map((h, n) => <th key={n} scope="col" className="p-4 font-bold whitespace-nowrap">{h}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-slate-100">{query.data.map(i => <tr key={i.instructionId} className="hover:bg-slate-50">
        <td className="p-4 font-mono text-slate-500">{i.instructionId}</td>
        <td className="p-4 whitespace-nowrap">{instructionTypes[i.type]}{i.trancheNo !== null && ` đợt ${i.trancheNo}`}</td>
        <td className="p-4 font-semibold whitespace-nowrap">{i.batchCode}</td>
        <td className="p-4 min-w-40">{i.beneficiary ?? '—'}</td>
        <td className="p-4 font-mono whitespace-nowrap">{formatVnd(i.amount)}</td>
        <td className="p-4"><span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${statusStyle[i.status]}`}>{instructionStatuses[i.status]}</span></td>
        <td className="p-4 text-xs text-slate-500 min-w-56 max-w-xs">{i.note}</td>
        <td className="p-4 whitespace-nowrap text-xs">{formatDateTime(i.createdAt)}{i.completedAt && <div className="text-slate-500">Xong: {formatDateTime(i.completedAt)}</div>}</td>
        {actions && <td className="p-4 text-right">{actions(i)}</td>}
      </tr>)}</tbody>
    </table>
      {query.data.length === 0 && <p className="p-4 text-sm text-slate-500">Không có lệnh chi nào khớp bộ lọc.</p>}
    </div>}
  </section>
}
