/* Mục Quyết toán của một Lô tôi đã góp: sáu điều kiện chờ quyết toán với trạng thái đạt hay chưa
   (GET /api/batches/{code}/settlement-readiness, BR-183; nhà đầu tư có vốn ở Lô được xem) và bảng quyết toán đã công bố của Lô
   (GET /api/me/settlements), kèm số đã duyệt của tôi nếu có. */
import axios from 'axios'
import { Receipt } from 'lucide-react'
import type { PortfolioDetail, SettlementReadinessResponse, SettlementSummary } from '../../../shared/api/api.gen'
import { OpBadge, OpDl, OpError, OpFlow, OpLoading, OpPanel, StatusBadge, formatDateTime, formatVnd, useGet } from '../../../shared/ui/console'
import { batchApi } from '../investorShared'

/** Nội dung sáu điều kiện, chỉ dùng khi API từ chối (403) nên không có trạng thái từng điều kiện. */
const CONDITIONS = [
  'Mọi con cua đã được giao, bán, ghi chết hoặc huỷ',
  'Mọi đơn đặt trước ở trạng thái cuối',
  'Đơn có hoá đơn và đơn hàng cuối đã thu đủ tiền',
  'Mọi lệnh hoàn tiền cho khách đã thành công',
  'Hết hạn đổi trả, không còn khiếu nại mở',
  'Không còn giao dịch tiền chưa khớp',
]

export function SettlementTab({ detail }: { detail: PortfolioDetail }) {
  const { batch, settlement: approved } = detail.position
  const readiness = useGet<SettlementReadinessResponse>(batchApi(batch.code, 'settlement-readiness'), undefined, { retry: false })
  const statements = useGet<SettlementSummary[]>('/api/me/settlements')
  const statement = statements.data?.find((s) => s.batchCode === batch.code)
  const missing = readiness.data?.conditions.filter((c) => !c.met).length ?? 0
  const refused = axios.isAxiosError(readiness.error) && readiness.error.response?.status === 403

  return (
    <div className="op-grid">
      <OpPanel
        className={statement || approved ? 'op-span-7' : ''}
        title="Điều kiện quyết toán"
        action={readiness.data
          ? <OpBadge tone={readiness.data.ready ? 'ok' : 'warn'}>{readiness.data.ready ? 'Đủ 6 điều kiện' : `Còn ${missing} điều kiện`}</OpBadge>
          : refused ? <OpBadge>Chưa xem được trạng thái</OpBadge> : undefined}
      >
        {readiness.isPending ? <OpLoading />
          : readiness.data ? (
            <OpFlow steps={readiness.data.conditions.map((c) => ({
              title: c.description,
              sub: c.met ? undefined : `Còn ${c.pending} mục`,
              state: c.met ? 'done' : 'now',
            }))} />
          ) : refused ? <OpFlow steps={CONDITIONS.map((title) => ({ title }))} />
            : <OpError error={readiness.error} onRetry={() => void readiness.refetch()} />}
        {!statement && !approved && !statements.isPending && <p className="rd-muted">Bảng quyết toán chưa được công bố.</p>}
      </OpPanel>

      {(statement || approved) && (
        <OpPanel className="op-span-5" title="Bảng quyết toán" action={statement ? <StatusBadge kind="settlement" value={statement.status} /> : undefined}>
          {approved ? (
            <OpDl items={[
              { label: 'Vốn hoàn', value: formatVnd(approved.capitalReturn) },
              { label: 'Phần chia', value: formatVnd(approved.profitShare) },
              ...(approved.taxWithheld > 0 ? [{ label: 'Khấu trừ thuế', value: formatVnd(-approved.taxWithheld) }] : []),
              ...(approved.inKindQtyKg > 0 ? [{ label: 'Nhận bằng hiện vật', value: `${approved.inKindQtyKg.toLocaleString('vi-VN')} kg` }] : []),
              { label: 'Tôi thực nhận', value: formatVnd(approved.netPayout), total: true },
            ]} />
          ) : statement && (
            <OpDl items={[
              { label: 'Tôi thực nhận theo bảng', value: statement.myNetPayout !== null ? formatVnd(statement.myNetPayout) : '—' },
              ...(statement.feedbackOpen ? [{ label: 'Góp ý tới', value: formatDateTime(statement.feedbackDeadline) }] : []),
            ]} />
          )}
          {statement && (
            <a className="rd-btn rd-btn--primary rd-btn--block" href={`/nha-dau-tu/quyet-toan/${statement.settlementId}`}><Receipt size={17} /> Mở bảng quyết toán</a>
          )}
        </OpPanel>
      )}
    </div>
  )
}
