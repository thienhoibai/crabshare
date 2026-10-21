import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { FileSignature, Upload } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { ContractViewer } from '../../shared/contracts/ContractViewer'
import { contractStatuses, useBatchContracts, useContract, useUploadOfflineContract } from '../../shared/contracts/contractsApi'
import { formatDateTime, formatVnd } from '../../shared/lib/format'
import { listFundingBatches } from './financeApi'

/**
 * TH-09 — kho hợp đồng theo lô (tab Hợp đồng của AdminFinance): admin chọn lô, xem, tải PDF, và tải lên bản ký ngoài hệ thống
 * (UC15) khi ký số gặp sự cố. Gợi ý mã lô lấy từ bảng vốn vào theo lô; gõ mã khác cũng được.
 */
export default function AdminBatchContracts() {
  const [params, setParams] = useSearchParams()
  const code = params.get('batch') ?? ''
  const [draftCode, setDraftCode] = useState(code)
  const batches = useQuery({ queryKey: ['admin-funding', 'codes'], queryFn: ({ signal }) => listFundingBatches(signal), retry: false })
  const list = useBatchContracts(code)
  const [selected, setSelected] = useState<number | null>(null)
  const contract = useContract(selected)
  const upload = useUploadOfflineContract()
  const [file, setFile] = useState<File | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const c = contract.data

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!c || !file || !confirmed || upload.isPending) return
    try {
      await upload.mutateAsync({ contractId: c.contractId, file })
      setFile(null); setConfirmed(false)
    } catch { /* lỗi hiện bên dưới form */ }
  }

  return <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-w-0">
    <h2 className="font-bold mb-1 flex gap-2"><FileSignature size={18} /> Hợp đồng góp vốn</h2>
    <p className="text-sm text-slate-500 mb-4">Mỗi khoản góp một hợp đồng; người nuôi ký trước, nhà đầu tư ký sau. Bản cuối lưu nguyên vẹn kèm mã băm SHA-256.</p>
    <form className="flex flex-wrap items-end gap-3 mb-4" onSubmit={e => { e.preventDefault(); setSelected(null); setParams({ tab: 'contracts', batch: draftCode.trim() }, { replace: true }) }}>
      <label className="text-sm">Mã lô<input className="block border border-slate-300 rounded-lg p-2 mt-1 w-48" list="admin-contract-batches" required
        value={draftCode} onChange={e => setDraftCode(e.target.value)} placeholder="CS-2610-02" /></label>
      <datalist id="admin-contract-batches">{batches.data?.map(b => <option key={b.batchCode} value={b.batchCode}>{b.title}</option>)}</datalist>
      <button className="border border-slate-300 rounded-lg px-4 py-2 font-bold">Xem hợp đồng</button>
    </form>
    {!code && <p className="text-sm text-slate-500">Nhập hoặc chọn mã lô để xem kho hợp đồng của lô đó.</p>}
    {code && list.isPending && <p role="status">Đang tải hợp đồng…</p>}
    {list.isError && <p role="alert">{errorMessage(list.error)}</p>}
    {list.data?.length === 0 && <p className="text-sm text-slate-500">Lô chưa có hợp đồng nào.</p>}
    {list.data && list.data.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr>{['Số hợp đồng', 'Nhà đầu tư', 'Vốn góp', 'Trạng thái', 'Cách ký', ''].map(h => <th key={h} scope="col" className="p-2 whitespace-nowrap">{h}</th>)}</tr></thead>
      <tbody>{list.data.map(row => <tr key={row.contractId} className={`border-t border-slate-100 ${row.contractId === selected ? 'bg-slate-50' : ''}`}>
        <td className="p-2 font-semibold whitespace-nowrap">{row.contractNo}</td>
        <td className="p-2">{row.investorName}</td>
        <td className="p-2 whitespace-nowrap">{formatVnd(row.amount)}</td>
        <td className="p-2 whitespace-nowrap">{contractStatuses[row.status]}{row.fullySignedAt && <div className="text-xs text-slate-500">{formatDateTime(row.fullySignedAt)}</div>}</td>
        <td className="p-2 whitespace-nowrap">{row.signingMethod === 'OfflineUpload' ? 'Bản scan' : 'Ký số'}</td>
        <td className="p-2"><button className="text-red-600 font-bold underline" onClick={() => { setSelected(row.contractId); upload.reset() }}>Xem</button></td>
      </tr>)}</tbody>
    </table></div>}

    {c && <div className="mt-6 border-t pt-6 space-y-4">
      <ContractViewer contract={c} pdfHeight={520} />
      {(c.status === 'Draft' || c.status === 'OperatorSigned') && <form className="space-y-3 border border-slate-200 rounded-lg p-4" onSubmit={e => void submit(e)}>
        <h3 className="font-bold flex gap-2"><Upload size={16} /> Tải bản đã ký ngoài hệ thống</h3>
        <p className="text-sm text-slate-500">Chỉ dùng khi dịch vụ ký số gặp sự cố hoặc người ký chưa có chứng thư. File PDF tối đa 10 MB, lưu nguyên byte, hợp đồng chuyển sang "Đã đủ hai chữ ký".</p>
        <input type="file" accept="application/pdf" aria-label="File PDF hợp đồng đã ký" onChange={e => setFile(e.target.files?.[0] ?? null)} disabled={upload.isPending} />
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={upload.isPending} />
          Tôi đã đối chiếu: bản này có đủ chữ ký của hai bên. Hệ thống không tự kiểm tra chữ ký tay trong bản scan.</label>
        {upload.isError && <p className="text-sm text-red-700" role="alert">{errorMessage(upload.error)}</p>}
        <button className="bg-red-600 text-white rounded-lg px-4 py-2 font-bold disabled:opacity-50" disabled={!file || !confirmed || upload.isPending}>
          {upload.isPending ? 'Đang tải lên…' : 'Lưu bản đã ký'}
        </button>
      </form>}
    </div>}
  </section>
}
