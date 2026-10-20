import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../../shared/auth/authStore'
import { errorMessage } from '../../shared/api/http'
import { formatVnd } from '../../shared/lib/format'
import OperatorLayout from './OperatorLayout'
import { OpBack, OpBadge, OpBtn, OpFacts, OpHeading, OpNote, OpPanel } from './operatorUi'
import { batchStatuses, crabTypes, getBatch, type StockingResult } from './batchesApi'
import { useOperatorApplication } from './operatorsApi'
import StockingDialog from './StockingDialog'

export default function OperatorBatchDetail() {
  const [params] = useSearchParams()
  const code = params.get('code')
  const userId = useAuthStore(s => s.user?.userId)
  const profile = useOperatorApplication()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [stocking, setStocking] = useState(false)
  const [notice, setNotice] = useState('')
  const query = useQuery({
    queryKey: ['operator-batch', userId, code], enabled: !!code, retry: false,
    queryFn: ({ signal }) => getBatch(code!, signal),
  })
  const batch = query.data
  async function stocked(result: StockingResult) {
    setNotice(`Đã tạo ${result.createdCrabs.toLocaleString('vi-VN')} con cua và ghi nhận thả giống cho lô ${result.batchCode}.`)
    setStocking(false)
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['operator-batch', userId] }),
      qc.invalidateQueries({ queryKey: ['operator-batches', userId] }),
      qc.invalidateQueries({ queryKey: ['boxes', userId] }),
    ])
  }
  return <OperatorLayout activeTab="batch">
    <OpHeading eyebrow="Chi tiết lô" title={batch?.title ?? 'Chi tiết lô nuôi'}
      crumb={<OpBack href="/operator/batch"><ArrowLeft size={16} /> Quay lại danh sách lô</OpBack>}
      description={batch ? `${batch.batchCode} · ${crabTypes[batch.crabType]}` : undefined}
      action={batch?.canStock && profile.data?.memberRole === 'Owner' && profile.data.status === 'Approved'
        ? <OpBtn onClick={() => { setNotice(''); setStocking(true) }}>Thả giống</OpBtn> : undefined} />
    {!code ? <p role="alert">Chưa chọn lô. Hãy quay lại danh sách và chọn một lô nuôi.</p> :
      query.isPending ? <p role="status">Đang tải chi tiết lô…</p> :
        query.isError ? <div role="alert"><OpNote tone="danger">{errorMessage(query.error)}</OpNote><OpBtn onClick={() => void query.refetch()}>Thử lại</OpBtn></div> :
          batch && <div className="grid gap-5">
            {notice && <div role="status"><OpNote tone="ok">{notice}</OpNote></div>}
            <OpPanel title="Thông tin lô" action={<OpBadge tone={batch.status === 'InProduction' ? 'ok' : 'info'}>{batchStatuses[batch.status]}</OpBadge>}>
              <OpFacts items={[
                { label: 'Số cua giống', value: `${batch.seedQuantity.toLocaleString('vi-VN')} con` },
                { label: 'Chu kỳ', value: `${batch.cycleDays} ngày` },
                { label: 'Sản lượng dự kiến', value: `${batch.expectedOutputKg.toLocaleString('vi-VN')} kg` },
                { label: 'Vốn mục tiêu', value: formatVnd(batch.targetCapital) },
              ]} />
              {batch.stockedAt && <p>Đã thả giống lúc {new Date(batch.stockedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.</p>}
              {batch.status === 'Funding' && !batch.canStock && batch.stockingBlockedReason && <OpNote>{batch.stockingBlockedReason}</OpNote>}
            </OpPanel>
            <OpPanel title="Chi phí chuẩn">
              {batch.standardCost ? <p>Phiên bản {batch.standardCost.versionNo} · {batch.standardCost.status} · Tổng {formatVnd(batch.standardCost.total)}</p> : <p>Chưa có chi phí chuẩn.</p>}
              <div className="flex flex-wrap gap-3 mt-4">
                <OpBtn variant="ghost" onClick={() => navigate(`/operator/create-batch?code=${encodeURIComponent(batch.batchCode)}`)}>{batch.canEdit ? 'Chỉnh sửa hồ sơ lô' : 'Xem hồ sơ và chi phí chuẩn'}</OpBtn>
                <OpBtn variant="ghost" onClick={() => navigate('/operator/boxes')}>Xem hộp nuôi</OpBtn>
              </div>
            </OpPanel>
            {stocking && <StockingDialog key={batch.batchCode} batch={batch} onClose={() => setStocking(false)} onStocked={stocked} />}
          </div>}
  </OperatorLayout>
}
