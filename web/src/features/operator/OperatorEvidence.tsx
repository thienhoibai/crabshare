/* /operator/evidence — Ảnh bằng chứng cần giải trình (GET /api/operators/me/evidence?status=&q=) và yêu cầu chụp hộp ngẫu nhiên
   (GET /api/operators/me/capture-requests). Chụp theo yêu cầu gửi qua POST /api/evidence kèm captureRequestId.
   Yêu cầu đang chờ hiện ở đầu trang; yêu cầu đã quá hạn nằm trong khối gấp. */
import { useState } from 'react'
import { Camera, Flag, ImageIcon } from 'lucide-react'
import type { CaptureRequestResponse, EvidenceResponse, PagedResultOfCaptureRequestResponse, PagedResultOfOperatorEvidenceItem } from '../../shared/api/api.gen'
import {
  Input, OpBadge, OpBtn, OpConfirm, OpEmpty, OpHeading, OpIcon, OpMore, OpNote, OpPanel, OpPhoto, OpRow, OpTable, OpTabs, QueryView, StatusBadge, formatDateTime,
  tone, useGet,
} from '../../shared/ui/console'
import { actionError, uploadBoxPhoto, useAction, verdictLabel } from './opA'
import Pager from './Pager'

type Status = 'Flagged' | 'Watch' | 'Accepted' | 'Rejected' | 'all'
const PAGE_SIZE = 20

function CaptureDialog({ request, onClose }: { request: CaptureRequestResponse; onClose: () => void }) {
  const [photo, setPhoto] = useState<File | null>(null)
  const [result, setResult] = useState<EvidenceResponse | null>(null)
  const capture = useAction(() => uploadBoxPhoto({ batchCode: request.batchCode, slotCode: request.slotCode, image: photo, captureRequestId: request.id }), { onSuccess: setResult })
  if (result) {
    return (
      <OpConfirm title="Đã gửi ảnh" sub={`Hộp ${request.slotCode}`} confirmLabel="Xong" onConfirm={onClose} onClose={onClose}>
        <div className="op-inline"><StatusBadge kind="evidence" value={result.reviewStatus} /></div>
        {result.reviewStatus === 'Flagged' && <OpNote tone="danger">Ảnh bị gắn cờ nên yêu cầu chưa xong. Chụp lại hoặc giải trình.</OpNote>}
      </OpConfirm>
    )
  }
  return (
    <OpConfirm
      title={`Chụp hộp ${request.slotCode}`}
      sub={`Lô ${request.batchCode} · hạn ${formatDateTime(request.dueAt)}`}
      confirmLabel="Gửi ảnh"
      pending={capture.isPending}
      disabled={!photo}
      onClose={onClose}
      onConfirm={() => capture.mutate()}
    >
      <OpPhoto value={photo} onChange={setPhoto} label="Chụp ảnh hộp" />
      {capture.isError && <OpNote tone="danger">{actionError(capture.error)}</OpNote>}
    </OpConfirm>
  )
}

function CaptureRequests() {
  const [capturing, setCapturing] = useState<CaptureRequestResponse | null>(null)
  const open = useGet<PagedResultOfCaptureRequestResponse>('/api/operators/me/capture-requests', { status: 'Open', pageSize: 50 })
  const expired = useGet<PagedResultOfCaptureRequestResponse>('/api/operators/me/capture-requests', { status: 'Expired', pageSize: 20 })
  const waiting = open.data?.items ?? []
  const late = expired.data?.items ?? []
  if (waiting.length === 0 && late.length === 0) return null
  return (
    <OpPanel title="Hộp cần chụp" subtitle="Mỗi ngày hệ thống chọn ngẫu nhiên vài hộp. Chụp đúng hộp trước hạn.">
      {waiting.length > 0 && (
        <OpTable
          rows={waiting}
          rowKey={(r) => r.id}
          columns={[
            { key: 'slot', header: 'Hộp', cell: (r) => <><b>{r.slotCode}</b><br /><small className="rd-muted">Lô {r.batchCode}</small></> },
            { key: 'due', header: 'Hạn chụp', cell: (r) => formatDateTime(r.dueAt) },
            { key: 'act', header: '', cell: (r) => <OpBtn sm variant={r.id === waiting[0].id ? 'primary' : 'ghost'} onClick={() => setCapturing(r)}><Camera size={14} /> Chụp</OpBtn> },
          ]}
        />
      )}
      {late.length > 0 && (
        <OpMore label="Yêu cầu đã quá hạn" count={expired.data?.total}>
          <OpTable
            rows={late}
            rowKey={(r) => r.id}
            columns={[
              { key: 'slot', header: 'Hộp', cell: (r) => <><b>{r.slotCode}</b><br /><small className="rd-muted">Lô {r.batchCode}</small></> },
              { key: 'due', header: 'Hạn chụp', cell: (r) => formatDateTime(r.dueAt) },
            ]}
          />
        </OpMore>
      )}
      {capturing && <CaptureDialog request={capturing} onClose={() => setCapturing(null)} />}
    </OpPanel>
  )
}

export default function OperatorEvidence() {
  const [status, setStatus] = useState<Status>('Flagged')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  // Bỏ trống status thì API mặc định lọc Flagged, nên mục "Tất cả" phải gửi status rỗng ngay trong đường dẫn.
  const url = status === 'all' ? '/api/operators/me/evidence?status=' : '/api/operators/me/evidence'
  const evidence = useGet<PagedResultOfOperatorEvidenceItem>(url, { status: status === 'all' ? undefined : status, q: q.trim(), page, pageSize: PAGE_SIZE })

  return (
    <>
      <OpHeading eyebrow="Vận hành" title="Bằng chứng cần giải trình" />

      <CaptureRequests />

      <div className="op-toolbar">
        <OpTabs<Status>
          value={status}
          onChange={(s) => { setStatus(s); setPage(1) }}
          items={[
            { key: 'Flagged', label: 'Cần giải trình' },
            { key: 'Watch', label: 'Theo dõi' },
            { key: 'Accepted', label: 'Chấp nhận' },
            { key: 'Rejected', label: 'Không chấp nhận' },
            { key: 'all', label: 'Tất cả' },
          ]}
        />
        <Input className="op-toolbar__grow" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Mã Lô hoặc số hộp" aria-label="Tìm ảnh bằng chứng" />
      </div>

      <QueryView query={evidence}>
        {(data) => data.items.length === 0 ? (
          <OpEmpty title={status === 'Flagged' ? 'Không có ảnh nào cần giải trình' : 'Không có ảnh ở mục này'} icon={<Flag size={30} />} />
        ) : (
          <OpPanel className="op-list">
            {data.items.map((e) => (
              <OpRow
                key={e.id}
                href={`/operator/evidence/${e.id}`}
                media={<OpIcon tone={tone('evidence', e.reviewStatus)}><ImageIcon size={22} /></OpIcon>}
                title={`Hộp ${e.slotCode ?? '—'}`}
                sub={`Lô ${e.batchCode} · ${formatDateTime(e.capturedAt ?? e.receivedAt)}`}
                mid={
                  <span className="op-inline">
                    <StatusBadge kind="evidence" value={e.reviewStatus} />
                    {e.latestReview && <OpBadge tone="info">Thẩm định: {verdictLabel(e.latestReview.verdict)}</OpBadge>}
                  </span>
                }
                end={e.explanation ? <b className="op-ok">Đã giải trình</b> : e.canExplain ? <b className="op-danger">Chờ giải trình</b> : null}
              />
            ))}
            <Pager page={data.page} pageSize={PAGE_SIZE} total={data.total} unit="ảnh" onChange={setPage} />
          </OpPanel>
        )}
      </QueryView>
    </>
  )
}
