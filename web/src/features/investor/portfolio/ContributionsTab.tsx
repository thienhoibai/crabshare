/* Mục Khoản góp của một Lô tôi đã góp: các khoản góp và hợp đồng của tôi (từ GET /api/investor/portfolio/{code}).
   Phần ít dùng gấp lại: tiền của cả Lô (GET /api/batches/{code}/money-summary), thông tin Lô và số tiến độ còn lại
   (GET /api/batches/{code}/progress), nhật ký chăm sóc gần nhất, diễn biến gần đây. */
import type { BatchProgressResponse, MoneySummaryResponse, PortfolioContribution, PortfolioDetail } from '../../../shared/api/api.gen'
import {
  Money, OpFacts, OpKv, OpMore, OpPanel, OpTable, StatusBadge, formatDate, formatDateTime, formatVnd, useGet, type Column,
} from '../../../shared/ui/console'
import { MoneyFacts, batchApi, contributeHref, isFrozen } from '../investorShared'

const num = (n: number | null, unit: string) => (n === null ? '—' : `${n.toLocaleString('vi-VN', { maximumFractionDigits: 3 })}${unit}`)

export function ContributionsTab({ detail }: { detail: PortfolioDetail }) {
  const { position, contributions, timeline, latestProduction: log } = detail
  const b = position.batch
  const columns: Column<PortfolioContribution>[] = [
    { key: 'amount', header: 'Số tiền', cell: (c) => <b><Money value={c.amount} /></b> },
    { key: 'status', header: 'Trạng thái', cell: (c) => <StatusBadge kind="contribution" value={c.status} /> },
    { key: 'confirmed', header: 'Tiền về lúc', cell: (c) => formatDateTime(c.confirmedAt) || '—' },
    {
      key: 'contract', header: 'Hợp đồng', cell: (c) => (c.contractNo
        ? <span className="op-inline"><span className="op-mono">{c.contractNo}</span><StatusBadge kind="contract" value={c.contractStatus} /></span>
        // Hợp đồng chỉ lập được khi Lô còn gọi vốn: lúc đó dẫn về bước hợp đồng của luồng góp vốn.
        : b.status === 'Funding' ? <a className="op-link" href={`${contributeHref(b.code)}?buoc=hop-dong`}>Lập hợp đồng</a> : <span className="rd-muted">Chưa lập</span>),
    },
  ]
  // Hai truy vấn này đã được phần đầu trang gọi nên lấy từ bộ nhớ đệm.
  const money = useGet<MoneySummaryResponse>(isFrozen(position) ? batchApi(b.code, 'money-summary') : null, undefined, { retry: false })
  const progress = useGet<BatchProgressResponse>(batchApi(b.code, 'progress'), undefined, { retry: false })

  return (
    <OpPanel title="Khoản góp của tôi">
      <OpTable columns={columns} rows={contributions} rowKey={(c) => c.id} empty="Chưa có khoản góp nào" />

      {money.data && (
        <OpMore label="Tiền của cả Lô">
          <MoneyFacts figures={money.data.batch} heldLabel="Số dư tài khoản của Lô" />
          <p className="rd-muted" style={{ fontSize: 13 }}>{money.data.note}</p>
        </OpMore>
      )}

      <OpMore label="Thông tin Lô">
        <OpKv items={[
          { label: 'Vốn của Lô', value: `${formatVnd(b.raisedCapital)} / ${formatVnd(b.targetCapital)}` },
          { label: 'Số cua theo kế hoạch', value: `${b.seedQuantity} con` },
          { label: 'Ngày thả cua', value: formatDate(b.stockedAt) },
          { label: 'Ngày nuôi', value: b.dayOfCycle !== null ? `${b.dayOfCycle} / ${b.cycleDays}` : null },
          { label: 'Thu hoạch theo kế hoạch', value: formatDate(b.expectedHarvestDate) },
          { label: 'Đã thả bù', value: progress.data?.restockedCrabs },
          { label: 'Đã phân hạng', value: progress.data?.gradedCrabs },
        ]} />
      </OpMore>

      {log && (
        <OpMore label={`Nhật ký chăm sóc ngày ${formatDate(log.logDate)}`}>
          <OpFacts items={[
            { label: 'pH', value: num(log.ph, '') },
            { label: 'Nhiệt độ nước', value: num(log.waterTempC, ' °C') },
            { label: 'Độ mặn', value: num(log.salinityPpt, ' ‰') },
            { label: 'Thức ăn', value: num(log.feedKg, ' kg') },
          ]} />
        </OpMore>
      )}

      {timeline.length > 0 && (
        <OpMore label="Diễn biến gần đây" count={timeline.length}>
          <ul className="op-feed">
            {timeline.map((e, i) => <li key={`${e.type}-${e.at}-${i}`}><b>{e.label}</b><small>{formatDateTime(e.at)}</small></li>)}
          </ul>
        </OpMore>
      )}
    </OpPanel>
  )
}
