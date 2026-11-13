/* Bảng các lần kiểm tra danh tính, dùng ở tab "Kiểm tra eKYC" và ở trang chi tiết người dùng.
   Duyệt ngoại lệ (UC06): POST /api/admin/kyc-checks/{id}/approve-exception, lý do bắt buộc.
   Chỉ lần eKYC giấy tờ và khuôn mặt không đạt, mới nhất, đã có đồng ý của nhà đầu tư mới duyệt ngoại lệ được (canApproveException).
   Bấm một dòng để xem mã tham chiếu, thời điểm đồng ý và người duyệt. */
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { AdminAccountDecisionRequest, AdminKycResponse } from '../../shared/api/api.gen'
import { OpBtn, OpConfirm, OpKv, OpModal, OpTable, StatusBadge, formatDateTime, useSend, type Column } from '../../shared/ui/console'
import { ReasonField, kycTypeLabel } from './adminPartA'

export default function AdminKycTable({ rows, showUser = true, empty }: { rows: AdminKycResponse[]; showUser?: boolean; empty: string }) {
  const [target, setTarget] = useState<AdminKycResponse | null>(null)
  const [viewing, setViewing] = useState<AdminKycResponse | null>(null)
  const [reason, setReason] = useState('')
  const approve = useSend<AdminKycResponse, AdminAccountDecisionRequest>(
    'post',
    () => `/api/admin/kyc-checks/${target?.id}/approve-exception`,
    { success: 'Đã duyệt ngoại lệ. Nhà đầu tư được xác minh.', quietError: true, onSuccess: () => setTarget(null) },
  )

  const columns: Column<AdminKycResponse>[] = [
    ...(showUser ? [{
      key: 'user', header: 'Người dùng',
      cell: (c: AdminKycResponse) => <><b>{c.fullName}</b><br /><small className="rd-muted">{c.email}</small></>,
    }] : []),
    { key: 'type', header: 'Loại kiểm tra', cell: (c) => kycTypeLabel(c.checkType) },
    { key: 'result', header: 'Kết quả', cell: (c) => <><StatusBadge kind="kyc" value={c.result} />{c.failureReason ? <><br /><small className="op-danger">{c.failureReason}</small></> : null}</> },
    { key: 'at', header: 'Kiểm tra lúc', cell: (c) => formatDateTime(c.checkedAt) },
    {
      key: 'act', header: '',
      cell: (c) => c.canApproveException && (
        <OpBtn sm variant="ink" onClick={(e) => { e.stopPropagation(); approve.reset(); setReason(''); setTarget(c) }}><ShieldCheck size={15} /> Duyệt ngoại lệ</OpBtn>
      ),
    },
  ]

  return (
    <>
      <OpTable rows={rows} rowKey={(c) => c.id} empty={empty} columns={columns} onRowClick={setViewing} />

      {viewing && (
        <OpModal title="Lần kiểm tra danh tính" sub={`${viewing.fullName} · ${kycTypeLabel(viewing.checkType)}`} onClose={() => setViewing(null)}>
          <OpKv items={[
            { label: 'Kết quả', value: <StatusBadge kind="kyc" value={viewing.result} /> },
            { label: 'Lý do không đạt', value: viewing.failureReason },
            { label: 'Kiểm tra lúc', value: formatDateTime(viewing.checkedAt) },
            { label: 'Đồng ý xử lý dữ liệu', value: formatDateTime(viewing.consentAt) },
            { label: 'Mã tham chiếu', value: viewing.providerReference ? <span className="op-mono">{viewing.providerReference}</span> : null },
            { label: 'Người duyệt', value: viewing.reviewedBy ? <a className="op-link" href={`/admin/users/${viewing.reviewedBy}`}>Tài khoản #{viewing.reviewedBy}</a> : null },
          ]} />
          {showUser && <a className="op-link" href={`/admin/users/${viewing.userId}`}>Mở tài khoản của người dùng</a>}
        </OpModal>
      )}

      {target && (
        <OpConfirm
          title="Duyệt ngoại lệ xác minh danh tính"
          sub={`${target.fullName} · sẽ được coi là đã xác minh`}
          confirmLabel="Duyệt ngoại lệ"
          pending={approve.isPending}
          error={approve.error}
          disabled={!reason.trim()}
          onConfirm={() => approve.mutate({ reason: reason.trim() })}
          onClose={() => setTarget(null)}
        >
          <ReasonField value={reason} onChange={setReason} label="Căn cứ duyệt ngoại lệ" />
        </OpConfirm>
      )}
    </>
  )
}
