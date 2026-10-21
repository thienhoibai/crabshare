import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, BadgeCheck, Calculator, Megaphone, MessagesSquare, Send, TimerOff } from 'lucide-react'
import AdminLayout from './AdminLayout'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime } from '../../shared/lib/format'
import { SettlementFeedbackList } from '../../shared/settlement/SettlementFeedbackList'
import { SettlementStatement } from '../../shared/settlement/SettlementStatement'
import {
  settlementStatuses, useAdminSettlement, useApproveSettlement, useCalculateSettlement, useEndFeedbackWindowForDemo, useProposeSettlement,
  useSendSettlementPayouts,
} from '../../shared/settlement/settlementApi'

/** Bảng quyết toán của một lô: tính / tính lại (TH-12), công bố + trả lời góp ý (TH-13), duyệt + chi trả + đóng lô (TH-14). */
export default function AdminSettlementDetail() {
  const [params, setParams] = useSearchParams()
  const id = Number(params.get('id')) || null
  const code = params.get('code') ?? ''
  const query = useAdminSettlement(id)
  const calculate = useCalculateSettlement()
  const propose = useProposeSettlement()
  const approve = useApproveSettlement()
  const sendPayouts = useSendSettlementPayouts()
  const endWindow = useEndFeedbackWindowForDemo()
  const [taxPct, setTaxPct] = useState('0')
  const [days, setDays] = useState('7')
  const s = query.data
  const batchCode = s?.batchCode ?? code
  const editable = !s || ['Draft', 'Proposed', 'Disputed'].includes(s.status)
  const windowOver = !!s?.feedbackDeadline && Date.parse(s.feedbackDeadline) <= Date.now()
  const openFeedback = s?.feedback.filter(f => f.status === 'Open').length ?? 0

  const run = async (e: FormEvent) => {
    e.preventDefault()
    if (!batchCode || calculate.isPending) return
    try {
      const result = await calculate.mutateAsync({ code: batchCode, taxWithholdingPct: Number(taxPct) || 0 })
      setParams({ id: String(result.settlementId) }, { replace: true })
    } catch { /* lỗi hiện bên dưới form */ }
  }

  return (
    <AdminLayout activeTab="finance">
      <Link to="/admin/finance?tab=settlement" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Quay lại Quyết toán
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Quyết toán lô {batchCode || '—'}</h1>
        {s && <p className="text-sm text-slate-500 mt-1">{s.batchTitle} · {s.operatorName} · <strong>{settlementStatuses[s.status]}</strong> · lần tính {s.revisionNo} lúc {formatDateTime(s.updatedAt)}</p>}
      </header>
      {!id && !code && <p role="alert">Thiếu mã lô hoặc mã bảng quyết toán trên đường dẫn.</p>}
      {query.isPending && id && <p role="status">Đang tải bảng quyết toán…</p>}
      {query.isError && <p role="alert">{errorMessage(query.error)}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-w-0">
          {s ? <SettlementStatement s={s} /> : <p className="text-sm text-slate-500">Chưa tính quyết toán cho lô này. Nhập tỷ lệ khấu trừ thuế người nuôi đã khai (nếu có) rồi bấm Tính quyết toán.</p>}
        </section>
        <aside className="space-y-6">
          {editable && batchCode && <form className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3" onSubmit={e => void run(e)}>
            <h2 className="font-bold flex gap-2"><Calculator size={18} /> {s ? 'Tính lại bảng nháp' : 'Tính quyết toán'}</h2>
            <p className="text-sm text-slate-500">Doanh thu lấy từ đơn đã hoàn tất, chi phí là bảng chi phí chuẩn đã khoá, chia theo vốn đã chốt. {s && 'Tính lại sẽ tạo lần tính mới và đưa bảng về nháp; cần công bố lại.'}</p>
            <label className="block text-sm">Tỷ lệ khấu trừ thuế người nuôi khai (%)
              <input className="w-full border border-slate-300 rounded-lg p-2 mt-1" type="number" min={0} max={35} step={0.5} value={taxPct} onChange={e => setTaxPct(e.target.value)} />
            </label>
            <p className="text-xs text-slate-500">Để 0 nếu người nuôi chưa khai báo. Nền tảng không tự khấu trừ (TL-07).</p>
            {calculate.isError && <p className="text-sm text-red-700" role="alert">{errorMessage(calculate.error)}</p>}
            <button className="w-full bg-red-600 text-white rounded-lg p-2.5 font-bold disabled:opacity-50" disabled={calculate.isPending}>
              {calculate.isPending ? 'Đang tính…' : s ? 'Tính lại' : 'Tính quyết toán'}
            </button>
          </form>}
          {s && !editable && <p className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-sm">Bảng đã duyệt lúc {formatDateTime(s.approvedAt)} nên không tính lại được (BR-30).</p>}
          {s?.status === 'Draft' && <form className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3"
            onSubmit={e => { e.preventDefault(); propose.mutate({ id: s.settlementId, feedbackDays: Number(days) || 7 }) }}>
            <h2 className="font-bold flex gap-2"><Megaphone size={18} /> Công bố bảng quyết toán</h2>
            <p className="text-sm text-slate-500">Nhà đầu tư của lô và người nuôi xem được bảng; nhà đầu tư góp ý trong hạn trước khi duyệt (TL-14).</p>
            <label className="block text-sm">Số ngày nhận góp ý
              <input className="w-full border border-slate-300 rounded-lg p-2 mt-1" type="number" min={7} max={14} value={days} onChange={e => setDays(e.target.value)} />
            </label>
            {propose.isError && <p className="text-sm text-red-700" role="alert">{errorMessage(propose.error)}</p>}
            <button className="w-full bg-slate-900 text-white rounded-lg p-2.5 font-bold disabled:opacity-50" disabled={propose.isPending}>{propose.isPending ? 'Đang công bố…' : 'Công bố'}</button>
          </form>}
          {s && (s.status === 'Proposed' || s.status === 'Disputed') && <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h2 className="font-bold flex gap-2"><BadgeCheck size={18} /> Duyệt và chi trả</h2>
            <p className="text-sm text-slate-500">Duyệt được khi đã hết hạn góp ý và không còn góp ý chờ trả lời. Duyệt xong số liệu bị khoá; hệ thống lập lệnh chi: thuế người nuôi khai thay, thù lao + khấu hao cho người nuôi, từng nhà đầu tư.</p>
            {!windowOver && <p className="text-sm text-amber-700">Còn trong hạn góp ý tới {formatDateTime(s.feedbackDeadline)}.</p>}
            {openFeedback > 0 && <p className="text-sm text-amber-700">Còn {openFeedback} góp ý chờ trả lời.</p>}
            {approve.isError && <p className="text-sm text-red-700" role="alert">{errorMessage(approve.error)}</p>}
            <button className="w-full bg-emerald-600 text-white rounded-lg p-2.5 font-bold disabled:opacity-50" disabled={approve.isPending || !windowOver || openFeedback > 0}
              onClick={() => approve.mutate(s.settlementId)}>{approve.isPending ? 'Đang duyệt…' : 'Duyệt quyết toán'}</button>
            {import.meta.env.DEV && !windowOver && <button className="w-full border border-dashed border-slate-400 rounded-lg p-2 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              disabled={endWindow.isPending} onClick={() => endWindow.mutate(s.settlementId)}><TimerOff size={16} /> Chỉ khi chạy dev: kết thúc hạn góp ý để demo</button>}
            {endWindow.isError && <p className="text-sm text-red-700" role="alert">{errorMessage(endWindow.error)}</p>}
          </section>}
          {s?.status === 'Approved' && <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h2 className="font-bold flex gap-2"><Send size={18} /> Gửi lệnh chi trả</h2>
            <p className="text-sm text-slate-500">Gửi mọi lệnh chi còn chờ của lô qua tổ chức trung gian. Khi mọi nhà đầu tư đã nhận đủ, bảng chuyển "Đã chi trả xong" và lô được đóng (dòng thuế không chặn việc đóng lô).</p>
            {sendPayouts.isError && <p className="text-sm text-red-700" role="alert">{errorMessage(sendPayouts.error)}</p>}
            <button className="w-full bg-slate-900 text-white rounded-lg p-2.5 font-bold disabled:opacity-50" disabled={sendPayouts.isPending}
              onClick={() => sendPayouts.mutate(s.settlementId)}>{sendPayouts.isPending ? 'Đang gửi…' : 'Gửi lệnh chi trả'}</button>
          </section>}
          {s?.status === 'Closed' && <p className="bg-emerald-50 text-emerald-800 p-6 rounded-xl border border-emerald-200 text-sm">Đã chi trả xong cho mọi nhà đầu tư. Lô {s.batchCode} đã đóng.</p>}
          {s && s.status !== 'Draft' && <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h2 className="font-bold flex gap-2"><MessagesSquare size={18} /> Góp ý của nhà đầu tư</h2>
            {s.feedbackDeadline && <p className="text-sm text-slate-500">Công bố {formatDateTime(s.proposedAt)} · hạn góp ý {formatDateTime(s.feedbackDeadline)}</p>}
            <SettlementFeedbackList s={s} canAnswer />
          </section>}
        </aside>
      </div>
    </AdminLayout>
  )
}
