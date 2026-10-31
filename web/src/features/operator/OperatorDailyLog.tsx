import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpHeading, OpNote, OpPanel } from './operatorUi'
import { batchStatuses } from './batchesApi'
import {
  productionBatches,
  productionThresholds,
  type ProductionBatch,
  type ThresholdVersion
} from './productionApi'
import ProductionThresholds from './ProductionThresholds'
import ProductionLogForm from './ProductionLogForm'
import ProductionLogHistory from './ProductionLogHistory'
import './productionLogs.css'

function BatchDailyLog({
  batch,
  accountKey,
  onBusy
}: {
  batch: ProductionBatch
  accountKey: readonly unknown[]
  onBusy: (busy: boolean) => void
}) {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const key = [...accountKey, 'thresholds', batch.batchCode]
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => productionThresholds(batch.batchCode, signal),
    retry: false,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true
  })
  const setWorking = (value: boolean) => {
    setBusy(value)
    onBusy(value)
  }
  const refresh = () => {
    void client.invalidateQueries({ queryKey: [...accountKey, 'logs', batch.batchCode] })
    void client.invalidateQueries({ queryKey: [...accountKey, 'batches'] })
    void client.invalidateQueries({ queryKey: key })
  }
  const savedThresholds = (current: ThresholdVersion) => {
    client.setQueryData(key, query.data ? { ...query.data, current } : undefined)
    refresh()
  }
  return (
    <>
      {query.isError && query.data && (
        <OpPanel>
          <div role="alert">
            <OpNote tone="danger">
              {errorMessage(query.error)} Bản nhập được giữ lại; cấu hình đang hiển thị là lần tải gần nhất.
            </OpNote>
          </div>
          <OpBtn
            disabled={busy || query.isFetching}
            onClick={() => {
              void query.refetch()
            }}
          >
            Thử lại cấu hình
          </OpBtn>
        </OpPanel>
      )}
      {query.isPending ? (
        <OpPanel>
          <p role="status" aria-busy="true">
            Đang tải cấu hình lô…
          </p>
        </OpPanel>
      ) : !query.data ? (
        <OpPanel>
          <div role="alert">
            <OpNote tone="danger">{errorMessage(query.error)}</OpNote>
          </div>
          <OpBtn
            onClick={() => {
              void query.refetch()
            }}
          >
            Thử lại cấu hình
          </OpBtn>
        </OpPanel>
      ) : (
        <div className="production-workspace">
          <ProductionLogForm
            batch={batch}
            state={query.data}
            busy={busy}
            onBusy={setWorking}
            onRefresh={refresh}
            onSaved={() => {
              refresh()
              void client.invalidateQueries({ queryKey: ['operator-alerts'] })
            }}
          />
          <ProductionThresholds
            code={batch.batchCode}
            state={query.data}
            busy={busy}
            onBusy={setWorking}
            onSaved={savedThresholds}
            onReload={async () => {
              const current = await productionThresholds(batch.batchCode)
              client.setQueryData(key, current)
              return current
            }}
          />
        </div>
      )}
      <ProductionLogHistory code={batch.batchCode} accountKey={accountKey} />
    </>
  )
}

function DailyLogWorkspace({ userId, operatorId }: { userId: number; operatorId: number | null }) {
  const accountKey = ['production', userId, operatorId] as const
  const [selectedCode, setSelectedCode] = useState(
    () => new URLSearchParams(window.location.search).get('code') ?? ''
  )
  const [busy, setBusy] = useState(false)
  const batches = useQuery({
    queryKey: [...accountKey, 'batches'],
    queryFn: ({ signal }) => productionBatches(signal),
    retry: false
  })
  const batch = batches.data?.find((item) => item.batchCode === selectedCode) ?? batches.data?.[0]
  return (
    <OperatorLayout activeTab="log">
      <OpHeading
        eyebrow="Nhật ký nuôi"
        title="Ghi nhật ký hàng ngày"
        description="Ghi chỉ số nước và lượng thức ăn thực tế cho từng lô đang chăm sóc."
        action={
          <OpBtn
            variant="outline"
            disabled={busy || batches.isFetching}
            onClick={() => {
              void batches.refetch()
            }}
          >
            <RefreshCw size={16} />
            Làm mới lô
          </OpBtn>
        }
      />
      {batches.isError && batches.data && (
        <div role="alert">
          <OpNote tone="danger">
            {errorMessage(batches.error)} Bản nhập được giữ lại. Chọn Làm mới lô để thử lại.
          </OpNote>
        </div>
      )}
      {batches.isPending ? (
        <OpPanel>
          <p role="status" aria-busy="true">
            Đang tải lô nuôi…
          </p>
        </OpPanel>
      ) : batches.isError && !batches.data ? (
        <OpPanel>
          <div role="alert">
            <OpNote tone="danger">{errorMessage(batches.error)}</OpNote>
          </div>
          <OpBtn
            onClick={() => {
              void batches.refetch()
            }}
          >
            Thử lại
          </OpBtn>
        </OpPanel>
      ) : !batch ? (
        <OpPanel>
          <div className="op-empty">
            <b>Chưa có lô đang chăm sóc</b>
            <span>
              Nhật ký dành cho lô đang sản xuất hoặc đang thu hoạch. Lô đã thả giống có thể xem lịch sử và cấu
              hình.
            </span>
          </div>
        </OpPanel>
      ) : (
        <>
          <OpPanel>
            <div className="op-field">
              <label htmlFor="production-batch">Lô nuôi</label>
              <select
                id="production-batch"
                className="op-select"
                value={batch.batchCode}
                disabled={busy}
                onChange={(event) => setSelectedCode(event.target.value)}
              >
                {batches.data?.map((item) => (
                  <option key={item.batchCode} value={item.batchCode}>
                    {item.batchCode} · {item.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="production-batch-meta">
              <OpBadge tone={batch.status === 'Stocked' ? 'info' : 'ok'}>
                {batchStatuses[batch.status]}
              </OpBadge>
              <span>
                {batch.aliveCount}/{batch.seedQuantity} cua đang nuôi
              </span>
              {batch.dayOfCycle !== null && (
                <span>
                  Ngày {batch.dayOfCycle}/{batch.cycleDays} của chu kỳ
                </span>
              )}
            </div>
          </OpPanel>
          <BatchDailyLog key={batch.batchCode} batch={batch} accountKey={accountKey} onBusy={setBusy} />
        </>
      )}
    </OperatorLayout>
  )
}

export default function OperatorDailyLog() {
  const user = useAuthStore((state) => state.user)
  const token = useAuthStore((state) => state.token)
  if (!user) return null
  // Reset drafts and selection immediately when the authenticated account changes.
  return (
    <DailyLogWorkspace
      key={`${user.userId}:${user.operatorId}:${token}`}
      userId={user.userId}
      operatorId={user.operatorId}
    />
  )
}
