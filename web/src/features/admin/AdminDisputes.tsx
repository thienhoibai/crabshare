import { useState, useId } from 'react'
import {
  MessageSquareWarning,
  Image as ImageIcon,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ExternalLink,
  RefreshCw,
  Search,
  DollarSign,
  User,
  Store,
  ShieldAlert,
} from 'lucide-react'
import AdminLayout from './AdminLayout'
import { formatDateTime, formatVnd } from '../../shared/lib/format'
import { errorMessage } from '../../shared/api/http'
import {
  COMPLAINT_TYPE_LABELS,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_RESOLUTION_LABELS,
  useAdminComplaints,
  useAdminComplaintDetail,
  useResolveAdminComplaint,
  type ComplaintStatus,
  type ComplaintSummary,
} from '../orders/complaintsApi'

function statusBadge(status: ComplaintStatus) {
  switch (status) {
    case 'Open':
      return <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> Chờ hộ nuôi</span>
    case 'OperatorResponded':
      return <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Store className="w-3 h-3" /> Hộ nuôi đã phản hồi</span>
    case 'Escalated':
      return <span className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Quá hạn 24h (Escalated)</span>
    case 'Resolved':
      return <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Đã giải quyết</span>
    case 'Rejected':
      return <span className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1"><XCircle className="w-3 h-3" /> Đã bác bỏ</span>
    default:
      return <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{status}</span>
  }
}

export default function AdminDisputes() {
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedComplaintId, setSelectedComplaintId] = useState<number | null>(null)
  const [page, setPage] = useState<number>(1)
  const [searchKeyword, setSearchKeyword] = useState<string>('')

  // Modal giải quyết
  const [resolveAction, setResolveAction] = useState<'Refund' | 'Rejected' | null>(null)
  const [refundAmount, setRefundAmount] = useState<string>('')
  const [adminNotes, setAdminNotes] = useState<string>('')
  const [resolveError, setResolveError] = useState<string | null>(null)

  const refundInputId = useId()
  const refundPercentId = useId()
  const notesInputId = useId()

  const { data: pagedData, isLoading, isError, error, refetch, isFetching } = useAdminComplaints(selectedStatus, page, 20)
  const complaints = pagedData?.items ?? []

  // Nếu chưa chọn complaint nào và có danh sách, tự chọn complaint đầu tiên
  const currentComplaintId = selectedComplaintId ?? (complaints.length > 0 ? complaints[0].complaintId : null)

  const { data: detail, isLoading: isLoadingDetail, refetch: refetchDetail } = useAdminComplaintDetail(currentComplaintId ?? undefined)
  const resolveMutation = useResolveAdminComplaint(currentComplaintId ?? 0)

  const handleSelectComplaint = (id: number) => {
    setSelectedComplaintId(id)
    setResolveAction(null)
    setResolveError(null)
  }

  const openRefundModal = () => {
    if (!detail) return
    setResolveAction('Refund')
    setRefundAmount(String(detail.totalAmount))
    setAdminNotes('')
    setResolveError(null)
  }

  const openRejectModal = () => {
    setResolveAction('Rejected')
    setRefundAmount('')
    setAdminNotes('')
    setResolveError(null)
  }

  const handleConfirmResolve = async () => {
    if (!detail || !currentComplaintId) return
    setResolveError(null)

    try {
      if (resolveAction === 'Refund') {
        const amount = Number(refundAmount)
        if (isNaN(amount) || amount <= 0 || amount > detail.totalAmount) {
          setResolveError(`Số tiền hoàn phải lớn hơn 0 và không quá ${formatVnd(detail.totalAmount)}.`)
          return
        }
        await resolveMutation.mutateAsync({
          resolution: 'Refund',
          refundAmount: amount,
          adminNotes: adminNotes.trim() || undefined,
        })
      } else if (resolveAction === 'Rejected') {
        if (!adminNotes.trim()) {
          setResolveError('Vui lòng nêu rõ lý do bác bỏ khiếu nại.')
          return
        }
        await resolveMutation.mutateAsync({
          resolution: 'Rejected',
          refundAmount: null,
          adminNotes: adminNotes.trim(),
        })
      }

      setResolveAction(null)
      await Promise.all([refetch(), refetchDetail()])
    } catch (err: unknown) {
      setResolveError(errorMessage(err))
    }
  }

  const filteredComplaints = complaints.filter((c: ComplaintSummary) => {
    if (!searchKeyword.trim()) return true
    const q = searchKeyword.toLowerCase()
    return c.orderNo.toLowerCase().includes(q) ||
      c.customerName.toLowerCase().includes(q) ||
      c.farmName.toLowerCase().includes(q) ||
      String(c.complaintId).includes(q)
  })

  return (
    <AdminLayout activeTab="disputes">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-red-600" />
            Khiếu nại & Giải quyết tranh chấp (Disputes)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            UC31 + UC32: Xử lý khiếu nại khách hàng, giám sát giải trình hộ nuôi và phân xử hoàn tiền/bác bỏ.
          </p>
        </div>
        <button
          onClick={() => { refetch(); if (currentComplaintId) refetchDetail(); }}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm self-start md:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-blue-600' : ''}`} />
          Làm mới
        </button>
      </header>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-slate-200 pb-3">
        {[
          { key: 'all', label: 'Tất cả' },
          { key: 'Escalated', label: 'Cần phân xử (Escalated 24h)' },
          { key: 'OperatorResponded', label: 'Hộ nuôi đã phản hồi' },
          { key: 'Open', label: 'Chờ hộ nuôi' },
          { key: 'Resolved', label: 'Đã hoàn tiền / xong' },
          { key: 'Rejected', label: 'Đã bác bỏ' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setSelectedStatus(tab.key); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedStatus === tab.key
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CỘT TRÁI: Danh sách khiếu nại */}
        <div className="lg:col-span-5 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo mã đơn, khách, hộ nuôi..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 shadow-sm"
            />
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-500" />
              Đang tải danh sách khiếu nại...
            </div>
          ) : isError ? (
            <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-sm">
              Lỗi tải dữ liệu: {errorMessage(error)}
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
              Không có khiếu nại nào phù hợp.
            </div>
          ) : (
            <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
              {filteredComplaints.map((c: ComplaintSummary) => {
                const isSelected = c.complaintId === currentComplaintId
                return (
                  <div
                    key={c.complaintId}
                    onClick={() => handleSelectComplaint(c.complaintId)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden text-left ${
                      isSelected
                        ? 'bg-red-50/70 border-red-500 shadow-md ring-1 ring-red-500'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <span className="text-red-600">#{c.complaintId}</span>
                        <span>· Đơn {c.orderNo}</span>
                      </span>
                      {statusBadge(c.status)}
                    </div>

                    <p className="text-xs text-slate-700 font-medium line-clamp-1 mb-2">
                      <strong className="text-slate-900">[{COMPLAINT_TYPE_LABELS[c.complaintType] ?? c.complaintType}]</strong>
                    </p>

                    <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-2">
                      <span className="flex items-center gap-1 truncate max-w-[180px]">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {c.customerName}
                      </span>
                      <strong className="text-slate-900 font-bold shrink-0">{formatVnd(c.totalAmount)}</strong>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                      <span>{c.farmName}</span>
                      <span>{formatDateTime(c.openedAt)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* CỘT PHẢI: Chi tiết khiếu nại & Form phân xử */}
        <div className="lg:col-span-7">
          {isLoadingDetail ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-red-500" />
              Đang tải chi tiết khiếu nại...
            </div>
          ) : !detail ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-400">
              Chọn một khiếu nại bên danh sách để xem chi tiết và xử lý phân xử.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[680px]">
              {/* Header chi tiết */}
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                    <MessageSquareWarning className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-extrabold text-slate-900 text-base">Khiếu nại #{detail.complaintId}</h2>
                      {statusBadge(detail.status)}
                    </div>
                    <p className="text-xs text-slate-500">
                      Đơn hàng <strong className="text-slate-800">{detail.orderNo}</strong> (lô {detail.batchCode}) · Trại: <strong>{detail.farmName}</strong>
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500">Giá trị đơn</div>
                  <div className="text-base font-extrabold text-red-600">{formatVnd(detail.totalAmount)}</div>
                </div>
              </div>

              {/* Body thông tin */}
              <div className="flex-1 p-5 overflow-y-auto space-y-5">
                {/* Thông tin đơn và khách */}
                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <span className="text-slate-500 block">Khách hàng</span>
                    <strong className="text-slate-900">{detail.customerName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Email khách</span>
                    <strong className="text-slate-900 truncate block">{detail.customerEmail}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Thời gian khiếu nại</span>
                    <strong className="text-slate-900">{formatDateTime(detail.openedAt)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Loại vi phạm</span>
                    <strong className="text-red-700">{COMPLAINT_TYPE_LABELS[detail.complaintType] ?? detail.complaintType}</strong>
                  </div>
                </div>

                {/* Khung 1: Khách hàng khiếu nại */}
                <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <strong className="text-amber-900 flex items-center gap-1.5 font-bold">
                      <User className="w-4 h-4 text-amber-700" />
                      Khách hàng phản ánh:
                    </strong>
                    <span className="text-xs text-amber-700">{formatDateTime(detail.openedAt)}</span>
                  </div>
                  <p className="text-amber-900 whitespace-pre-line leading-relaxed bg-white/60 p-3 rounded-lg border border-amber-100">
                    "{detail.description}"
                  </p>
                  {detail.evidenceUri && (
                    <div className="mt-3">
                      <span className="text-xs font-semibold text-amber-800 block mb-1">Bằng chứng hình ảnh/video của khách:</span>
                      <a
                        href={detail.evidenceUri}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold transition-colors"
                      >
                        <ImageIcon className="w-4 h-4" />
                        Xem link bằng chứng bóc hàng
                        <ExternalLink className="w-3 h-3 ml-0.5" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Khung 2: Hộ nuôi giải trình */}
                <div className={`p-4 rounded-xl border text-sm ${
                  detail.operatorResponse ? 'bg-blue-50/70 border-blue-200' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <strong className="text-slate-900 flex items-center gap-1.5 font-bold">
                      <Store className="w-4 h-4 text-blue-600" />
                      Hộ nuôi giải trình:
                    </strong>
                    {detail.respondedAt && (
                      <span className="text-xs text-blue-700">{formatDateTime(detail.respondedAt)}</span>
                    )}
                  </div>

                  {detail.operatorResponse ? (
                    <>
                      <p className="text-blue-900 whitespace-pre-line leading-relaxed bg-white/70 p-3 rounded-lg border border-blue-100">
                        "{detail.operatorResponse}"
                      </p>
                      {detail.operatorEvidenceUri && (
                        <div className="mt-3">
                          <span className="text-xs font-semibold text-blue-800 block mb-1">Bằng chứng đóng gói của hộ nuôi:</span>
                          <a
                            href={detail.operatorEvidenceUri}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-lg text-xs font-bold transition-colors"
                          >
                            <ImageIcon className="w-4 h-4" />
                            Xem tư liệu đóng gói / đối chứng
                            <ExternalLink className="w-3 h-3 ml-0.5" />
                          </a>
                        </div>
                      )}
                    </>
                  ) : detail.status === 'Escalated' ? (
                    <div className="p-3 bg-red-50 text-red-800 rounded-lg text-xs flex items-center gap-2 border border-red-200">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <div>
                        <strong>Đã quá hạn 24 giờ phản hồi!</strong> Hệ thống đã tự động chuyển khiếu nại lên cho Admin phân xử.
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic bg-white p-3 rounded-lg border border-slate-200">
                      Hộ nuôi chưa gửi giải trình. Hạn chót phản hồi là 24 giờ kể từ thời điểm mở khiếu nại.
                    </p>
                  )}
                </div>

                {/* Khung 3: Kết quả phân xử (nếu đã xong) */}
                {(detail.status === 'Resolved' || detail.status === 'Rejected') && (
                  <div className={`p-4 rounded-xl border text-sm ${
                    detail.status === 'Resolved' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-100 border-slate-300'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <strong className="flex items-center gap-1.5 font-bold text-slate-900">
                        {detail.status === 'Resolved' ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-slate-600" />
                        )}
                        Kết quả phân xử của Admin ({detail.resolvedByName ?? 'Ban quản trị'}):
                      </strong>
                      {detail.resolvedAt && (
                        <span className="text-xs text-slate-500">{formatDateTime(detail.resolvedAt)}</span>
                      )}
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-700 bg-white/80 p-3 rounded-lg border border-slate-200">
                      <div>
                        <strong>Phán quyết: </strong>
                        <span className="font-semibold text-slate-900">
                          {detail.resolution ? (COMPLAINT_RESOLUTION_LABELS[detail.resolution] ?? detail.resolution) : detail.status}
                        </span>
                      </div>
                      {detail.refundAmount !== null && detail.refundAmount !== undefined && (
                        <div>
                          <strong>Số tiền hoàn: </strong>
                          <span className="font-bold text-red-600 text-sm">{formatVnd(detail.refundAmount)}</span>
                          <span className="text-slate-500 ml-1">(Lệnh hoàn tiền qua BatchAccount đã được tạo tự động)</span>
                        </div>
                      )}
                      {detail.adminNotes && (
                        <div>
                          <strong>Ghi chú phân xử: </strong>
                          <span className="italic">"{detail.adminNotes}"</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Form thao tác khi đang phân xử */}
                {resolveAction && (
                  <div className="p-4 bg-slate-900 text-white rounded-xl shadow-lg border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm flex items-center gap-2">
                        {resolveAction === 'Refund' ? (
                          <><DollarSign className="w-4 h-4 text-emerald-400" /> Phân xử: Hoàn tiền cho Khách hàng</>
                        ) : (
                          <><XCircle className="w-4 h-4 text-red-400" /> Phân xử: Bác bỏ khiếu nại</>
                        )}
                      </h3>
                      <button onClick={() => setResolveAction(null)} className="text-xs text-slate-400 hover:text-white">Huỷ bỏ</button>
                    </div>

                    {resolveAction === 'Refund' && (
                      <div>
                        <label htmlFor={refundInputId} className="block text-xs text-slate-300 mb-1">
                          Số tiền hoàn lại cho khách (VNĐ):
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            id={refundInputId}
                            type="number"
                            value={refundAmount}
                            onChange={(e) => setRefundAmount(e.target.value)}
                            max={detail.totalAmount}
                            min={1}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            id={refundPercentId}
                            onClick={() => setRefundAmount(String(detail.totalAmount))}
                            className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-bold rounded-lg border border-slate-700 shrink-0"
                          >
                            100%
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Tối đa: <strong>{formatVnd(detail.totalAmount)}</strong>. Tiền sẽ được hoàn từ tài khoản lô nuôi của Hộ nuôi.
                        </p>
                      </div>
                    )}

                    <div>
                      <label htmlFor={notesInputId} className="block text-xs text-slate-300 mb-1">
                        {resolveAction === 'Refund' ? 'Ghi chú phân xử (tuỳ chọn):' : 'Lý do bác bỏ khiếu nại (bắt buộc):'}
                      </label>
                      <textarea
                        id={notesInputId}
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder={resolveAction === 'Refund' ? 'Ví dụ: Cua giao chết do lỗi vận chuyển, chấp thuận hoàn 100%.' : 'Ví dụ: Hộ nuôi đã cung cấp video đóng hàng đạt chuẩn, khiếu nại không hợp lệ.'}
                        rows={3}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>

                    {resolveError && (
                      <p className="text-xs text-red-400 bg-red-950/60 p-2 rounded border border-red-800">
                        {resolveError}
                      </p>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => setResolveAction(null)}
                        disabled={resolveMutation.isPending}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                      >
                        Đóng
                      </button>
                      <button
                        onClick={handleConfirmResolve}
                        disabled={resolveMutation.isPending}
                        className={`px-4 py-1.5 text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 ${
                          resolveAction === 'Refund'
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-red-600 hover:bg-red-500 text-white'
                        }`}
                      >
                        {resolveMutation.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        {resolveAction === 'Refund' ? 'Xác nhận Hoàn tiền' : 'Xác nhận Bác bỏ'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer thanh thao tác phân xử (chỉ hiện khi chưa phân xử) */}
              {detail.status !== 'Resolved' && detail.status !== 'Rejected' && !resolveAction && (
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    Trạng thái: <strong className="text-slate-800">{COMPLAINT_STATUS_LABELS[detail.status] ?? detail.status}</strong>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={openRejectModal}
                      className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-100 shadow-sm transition-colors"
                    >
                      <XCircle className="w-4 h-4 text-slate-500" /> Bác bỏ khiếu nại
                    </button>
                    <button
                      onClick={openRefundModal}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-lg hover:bg-emerald-700 shadow-sm transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" /> Hoàn tiền (Refund)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
