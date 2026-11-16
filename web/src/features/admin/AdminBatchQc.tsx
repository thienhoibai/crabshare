/* Tab "Kiểm phẩm" của trang chi tiết Lô.
   Phân hạng: GET /api/batches/{code}/grading; POST /api/admin/batches/{code}/grading-qc phân ngẫu nhiên người duyệt (BR-017).
   Thăm trại giữa vụ (BR-233): POST /api/admin/batches/{code}/site-visits phân ngẫu nhiên; GET /api/batches/{code}/site-visits liệt kê biên bản.
   Nút phân công chỉ hiện khi làm được: có quyết định chờ duyệt; Lô P đang lưu nuôi hoặc đang thu hoạch. */
import { useState } from 'react'
import { MapPin, Shuffle } from 'lucide-react'
import type { BatchGradingSummary, BatchResponse, QcInspectorResponse, QcTaskResponse, SiteVisitReportResponse } from '../../shared/api/api.gen'
import {
  OpBtn, OpConfirm, OpFacts, OpKv, OpMore, OpPanel, OpTable, QueryView, formatDateTime, label, useGet, useSend,
} from '../../shared/ui/console'

export default function AdminBatchQc({ batch }: { batch: BatchResponse }) {
  const code = encodeURIComponent(batch.batchCode)
  const grading = useGet<BatchGradingSummary>(`/api/batches/${code}/grading`)
  const visits = useGet<SiteVisitReportResponse[]>(`/api/batches/${code}/site-visits`)
  const pool = useGet<QcInspectorResponse[]>('/api/admin/qc-inspectors')
  const qcName = (userId: number | null | undefined) =>
    userId == null ? null : pool.data?.find((q) => q.userId === userId)?.fullName ?? `Tài khoản #${userId}`

  const [dialog, setDialog] = useState<'grading' | 'visit' | null>(null)
  const close = () => setDialog(null)
  const assignGrading = useSend<BatchGradingSummary, void>('post', `/api/admin/batches/${code}/grading-qc`, {
    success: (s) => `Đã phân công ${qcName(s.assignedQcUserId) ?? 'Nhân viên kiểm phẩm'}.`, quietError: true, onSuccess: close,
  })
  const assignVisit = useSend<QcTaskResponse, void>('post', `/api/admin/batches/${code}/site-visits`, {
    success: 'Đã phân công thăm trại.', quietError: true, onSuccess: close,
  })

  const visitAllowed = batch.batchMode === 'P' && (batch.status === 'InProduction' || batch.status === 'Harvesting')
  const waiting = (grading.data?.draft ?? 0) + (grading.data?.hold ?? 0)

  return (
    <>
      <OpPanel
        title="Phân hạng"
        action={waiting > 0
          ? <OpBtn sm variant="ghost" onClick={() => { assignGrading.reset(); setDialog('grading') }}><Shuffle size={15} /> Phân công người duyệt</OpBtn>
          : undefined}
      >
        <QueryView query={grading}>
          {(g) => (
            <>
              <OpFacts items={[
                { label: 'Chờ duyệt hạng', value: g.draft, tone: g.draft ? 'warn' : undefined },
                { label: 'Giữ lại kiểm thêm', value: g.hold, tone: g.hold ? 'warn' : undefined },
                { label: 'Đã duyệt hạng', value: g.approved, tone: 'ok' },
                { label: 'Người duyệt', value: qcName(g.assignedQcUserId) ?? 'Chưa phân', tone: waiting > 0 && g.assignedQcUserId === null ? 'danger' : undefined },
              ]} />
              <OpMore label="Chi tiết">
                <OpKv items={[
                  { label: 'Cua đã nhận', value: g.received },
                  { label: 'Chưa đo', value: g.notMeasured },
                  { label: 'Loại bỏ', value: g.rejected },
                  { label: 'Dưới chuẩn', value: g.substandard },
                  { label: 'Bộ quy tắc phân hạng', value: g.ruleSetVersion !== null ? `Phiên bản ${g.ruleSetVersion}` : null },
                ]} />
                {g.bySpec.length > 0 && (
                  <OpTable
                    rows={g.bySpec}
                    rowKey={(s) => s.specCode}
                    columns={[
                      { key: 'size', header: 'Size', cell: (s) => label('sizeCode', s.size) },
                      { key: 'grade', header: 'Hạng', cell: (s) => label('gradeCode', s.grade) },
                      { key: 'count', header: 'Số con', num: true, cell: (s) => s.count },
                    ]}
                  />
                )}
              </OpMore>
            </>
          )}
        </QueryView>
      </OpPanel>

      {(visitAllowed || (visits.data?.length ?? 0) > 0) && (
        <OpPanel
          title="Thăm trại giữa vụ"
          subtitle="Biên bản thăm trại là bằng chứng của mốc giải ngân giữa vụ."
          action={visitAllowed
            ? <OpBtn sm variant="ghost" onClick={() => { assignVisit.reset(); setDialog('visit') }}><MapPin size={15} /> Phân công thăm trại</OpBtn>
            : undefined}
        >
          <QueryView query={visits}>
            {(rows) => (
              <OpTable
                rows={rows}
                rowKey={(v) => v.reportNo}
                empty="Chưa có biên bản thăm trại"
                columns={[
                  { key: 'no', header: 'Biên bản', cell: (v) => <><b>{formatDateTime(v.visitedAt)}</b><br /><small className="op-mono rd-muted">{v.reportNo}</small></> },
                  { key: 'qc', header: 'Người thăm', cell: (v) => qcName(v.qcUserId) },
                  {
                    key: 'seen', header: 'Đã xem',
                    cell: (v) => <>{v.boxCodes.length} hộp, {v.crabsSeen} cua<br /><small className="rd-muted">{v.distanceToFarmM !== null ? `Cách trại ${v.distanceToFarmM} m · ` : ''}{v.boxCodes.join(', ')}</small></>,
                  },
                  { key: 'findings', header: 'Ghi nhận', cell: (v) => v.findings },
                ]}
              />
            )}
          </QueryView>
        </OpPanel>
      )}

      {dialog === 'grading' && (
        <OpConfirm
          title="Phân công người duyệt phân hạng"
          sub={`${batch.batchCode} · ${waiting} quyết định đang chờ`}
          confirmLabel="Phân công ngẫu nhiên"
          pending={assignGrading.isPending}
          error={assignGrading.error}
          onConfirm={() => assignGrading.mutate()}
          onClose={close}
        />
      )}

      {dialog === 'visit' && (
        <OpConfirm
          title="Phân công thăm trại giữa vụ"
          sub={`${batch.batchCode} · chọn ngẫu nhiên một Nhân viên kiểm phẩm`}
          confirmLabel="Phân công ngẫu nhiên"
          pending={assignVisit.isPending}
          error={assignVisit.error}
          onConfirm={() => assignVisit.mutate()}
          onClose={close}
        />
      )}
    </>
  )
}
