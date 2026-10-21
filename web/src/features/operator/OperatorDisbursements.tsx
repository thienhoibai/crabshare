import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HandCoins } from 'lucide-react'
import { http, errorMessage } from '../../shared/api/http'
import { formatDate, formatDateTime, formatVnd } from '../../shared/lib/format'
import { instructionStatuses, trancheStatuses, type Tranche, type TrancheStatus } from '../admin/financeApi'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpHeading, OpNote, OpPanel, type Tone } from './operatorUi'

const tone: Record<TrancheStatus, Tone> = { Planned: 'mute', Requested: 'info', NeedsExplanation: 'warn', Released: 'ok', Blocked: 'danger' }

/** UC18 phía người nuôi (TH-10): xin giải ngân từng đợt khi điều kiện mốc đạt (TL-03); trang tự nói vì sao chưa xin được. */
export default function OperatorDisbursements() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['operator-tranches'], queryFn: async () => (await http.get<Tranche[]>('/api/operator/tranches')).data })
  const request = useMutation({
    mutationFn: async (t: Tranche) => (await http.post<Tranche>(`/api/batches/${encodeURIComponent(t.batchCode)}/tranches/${t.trancheNo}/request`)).data,
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['operator-tranches'] }) },
  })
  const batches = [...new Set((list.data ?? []).map(t => t.batchCode))]

  return (
    <OperatorLayout activeTab="disbursements">
      <OpHeading
        eyebrow="Giải ngân theo mốc (TL-03)"
        title="Xin giải ngân"
        description="Mỗi lô chia đợt theo chi phí chuẩn đã khoá. Đợt 1 mở khi lô chốt đủ vốn và đủ chữ ký hợp đồng; các đợt sau cần bằng chứng nuôi đạt. Chỉ chủ hộ nuôi xin được."
      />
      {list.isPending && <p className="rd-muted">Đang tải các đợt giải ngân…</p>}
      {list.isError && <OpNote tone="danger">{errorMessage(list.error)}</OpNote>}
      {request.isError && <OpNote tone="danger">{errorMessage(request.error)}</OpNote>}
      {list.data?.length === 0 && <OpNote>Chưa có lô nào có lịch giải ngân. Lịch được tạo khi quản trị viên duyệt lô.</OpNote>}
      <div style={{ display: 'grid', gap: 16 }}>
        {batches.map(code => {
          const rows = list.data!.filter(t => t.batchCode === code)
          return (
            <OpPanel key={code} title={`${code} · ${rows[0].batchTitle}`}>
              <div className="op-tablewrap">
                <table className="op-table">
                  <thead><tr><th>Đợt</th><th className="is-num">Số tiền</th><th>Ngày dự kiến</th><th>Điều kiện mở</th><th>Trạng thái</th><th /></tr></thead>
                  <tbody>{rows.map(t => (
                    <tr key={t.trancheId}>
                      <td>Đợt {t.trancheNo}</td>
                      <td className="is-num">{formatVnd(t.plannedAmount)}</td>
                      <td>{t.plannedDate ? formatDate(t.plannedDate) : 'Chờ mốc thực tế'}</td>
                      <td style={{ minWidth: 220 }}>{t.unlockCondition}{!t.canRequest && t.status === 'Planned' && t.blockedReason && <div className="rd-muted" style={{ fontSize: 12 }}>Chưa xin được: {t.blockedReason}</div>}</td>
                      <td>
                        <OpBadge tone={tone[t.status]}>{trancheStatuses[t.status]}</OpBadge>
                        {t.status === 'NeedsExplanation' && t.explanationDeadline && <div className="rd-muted" style={{ fontSize: 12 }}>Giải trình trước {formatDateTime(t.explanationDeadline)}</div>}
                        {t.instructionStatus && <div className="rd-muted" style={{ fontSize: 12 }}>Lệnh chi: {instructionStatuses[t.instructionStatus]}</div>}
                      </td>
                      <td>{t.canRequest && (
                        <OpBtn sm disabled={request.isPending} onClick={() => request.mutate(t)}>
                          <HandCoins size={14} /> {t.status === 'NeedsExplanation' ? 'Xin lại sau khi bổ sung' : 'Xin giải ngân'}
                        </OpBtn>
                      )}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </OpPanel>
          )
        })}
      </div>
    </OperatorLayout>
  )
}
