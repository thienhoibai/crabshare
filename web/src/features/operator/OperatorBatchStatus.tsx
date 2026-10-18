import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { formatVnd } from '../../shared/lib/format'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpHeading, OpNote, OpRow, crabImg, type Tone } from './operatorUi'
import { useOperatorApplication } from './operatorsApi'
import { batchStatuses, crabTypes, listBatches } from './batchesApi'

const tones: Partial<Record<keyof typeof batchStatuses, Tone>> = { Draft: 'mute', PendingApproval: 'warn', Rejected: 'danger', Funding: 'gold', Closed: 'ok', Cancelled: 'danger' }
export default function OperatorBatchStatus() {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const userId = useAuthStore(s => s.user?.userId)
  const profile = useOperatorApplication()
  const query = useQuery({ queryKey: ['operator-batches', userId, status, page], retry: false,
    refetchInterval: 4_000,
    queryFn: ({ signal }) => listBatches(status, page, signal) })
  return <OperatorLayout activeTab="batch">
    <OpHeading eyebrow="Lô nuôi" title="Quản lý lô nuôi" description="Danh sách lô của hộ nuôi, bao gồm bản nháp và lô đang chờ duyệt."
      action={profile.data?.memberRole === 'Owner' && profile.data.status === 'Approved' ? <OpBtn onClick={() => navigate('/operator/create-batch')}><Plus size={16} /> Mở lô nuôi mới</OpBtn> : undefined} />
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc trạng thái lô">
        {Object.entries({ '': 'Tất cả', ...batchStatuses }).map(([value, label]) => <OpBtn key={value} sm variant={status === value ? 'ink' : 'outline'} aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1) }}>{label}</OpBtn>)}
      </div>
      {query.isPending ? <p role="status">Đang tải danh sách lô…</p> : query.isError ?
        <div><div role="alert"><OpNote tone="danger">{errorMessage(query.error)}</OpNote></div><OpBtn disabled={query.isFetching} onClick={() => void query.refetch()}>Thử lại</OpBtn></div> : <>
          <div className="op-panel op-list w-full">
            {query.data.items.map(batch => <OpRow key={batch.batchCode} href={`/operator/create-batch?code=${encodeURIComponent(batch.batchCode)}`}
              media={crabImg(batch.crabType)} title={batch.title} sub={`${batch.batchCode} · ${crabTypes[batch.crabType]} · ${batch.seedQuantity.toLocaleString('vi-VN')} con giống`}
              mid={<small>Chu kỳ {batch.cycleDays} ngày · Thù lao {batch.operatorSharePct}%</small>}
              end={<><OpBadge tone={tones[batch.status] ?? 'info'}>{batchStatuses[batch.status] ?? batch.status}</OpBadge><small>Vốn {formatVnd(batch.targetCapital)}</small></>} />)}
            {!query.data.items.length && <p className="op-empty">Không có lô nào ở trạng thái này.</p>}
          </div>
          <div className="flex flex-wrap justify-between items-center gap-3"><span className="text-sm">{query.data.total} lô · Trang {page}</span><div className="flex gap-2"><OpBtn sm variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Trước</OpBtn><OpBtn sm variant="outline" disabled={page * query.data.pageSize >= query.data.total} onClick={() => setPage(page + 1)}>Sau</OpBtn></div></div>
        </>}
    </div>
  </OperatorLayout>
}
