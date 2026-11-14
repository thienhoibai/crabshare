/* Tab "Tiến độ" của trang chi tiết Lô (Lô đã được duyệt):
   GET /api/batches/{code}/progress (BR-143), GET /api/batches/{code}/money-summary (BR-232),
   GET /api/batches/{code}/settlement-readiness (BR-183). Chỉ đọc; việc quyết toán làm ở /admin/settlements. */
import type { BatchProgressResponse, MoneySummaryResponse, SettlementReadinessResponse } from '../../shared/api/api.gen'
import { OpBadge, OpFacts, OpFlow, OpKv, OpMore, OpPanel, QueryView, formatVnd, useGet, type FlowStep } from '../../shared/ui/console'

export default function AdminBatchOps({ code }: { code: string }) {
  const path = `/api/batches/${encodeURIComponent(code)}`
  const progress = useGet<BatchProgressResponse>(`${path}/progress`, undefined, { retry: false })
  const money = useGet<MoneySummaryResponse>(`${path}/money-summary`)
  const readiness = useGet<SettlementReadinessResponse>(`${path}/settlement-readiness`)

  return (
    <>
      {!progress.isError && (
        <OpPanel title="Tiến độ">
          <QueryView query={progress}>
            {(p) => (
              <>
                <OpFacts items={[
                  { label: 'Cua đang nuôi', value: `${p.crabsAlive} con`, tone: 'ok' },
                  { label: 'Số ngày nuôi', value: p.daysRaised ?? '—' },
                  { label: 'Đã chết', value: p.deadCrabs ?? 0, tone: p.deadCrabs ? 'danger' : undefined },
                  { label: 'Đã giao hoặc bán', value: p.deliveredOrSoldCrabs ?? 0 },
                ]} />
                {(p.restockedCrabs || p.gradedCrabs) ? (
                  <OpMore label="Chi tiết">
                    <OpKv items={[
                      { label: 'Đã thả bù', value: `${p.restockedCrabs ?? 0} con` },
                      { label: 'Đã phân hạng', value: `${p.gradedCrabs ?? 0} con` },
                    ]} />
                  </OpMore>
                ) : null}
              </>
            )}
          </QueryView>
        </OpPanel>
      )}

      <OpPanel title="Tiền của Lô" subtitle="Số dư tài khoản của Lô gồm cả tiền cọc và tiền hàng của khách.">
        <QueryView query={money}>
          {(m) => (
            <OpFacts items={[
              { label: 'Vốn đã góp', value: formatVnd(m.batch.contributed) },
              { label: 'Đã giải ngân theo mốc', value: formatVnd(m.batch.disbursed), tone: 'info' },
              { label: 'Còn giữ trong tài khoản', value: formatVnd(m.batch.heldInAccount), tone: 'ok' },
            ]} />
          )}
        </QueryView>
      </OpPanel>

      <OpPanel
        title="Điều kiện quyết toán"
        action={readiness.data ? <OpBadge tone={readiness.data.ready ? 'ok' : 'warn'}>{readiness.data.ready ? 'Đủ điều kiện' : 'Còn thiếu'}</OpBadge> : undefined}
      >
        <QueryView query={readiness}>
          {(r) => {
            const step = (c: SettlementReadinessResponse['conditions'][number]): FlowStep => ({
              title: c.description,
              sub: c.met ? undefined : `Còn ${c.pending} mục`,
              state: c.met ? 'done' : 'bad',
            })
            const unmet = r.conditions.filter((c) => !c.met)
            const met = r.conditions.filter((c) => c.met)
            return (
              <>
                {unmet.length > 0 && <OpFlow steps={unmet.map(step)} />}
                {met.length > 0 && <OpMore label="Điều kiện đã đạt" count={met.length}><OpFlow steps={met.map(step)} /></OpMore>}
              </>
            )
          }}
        </QueryView>
      </OpPanel>
    </>
  )
}
