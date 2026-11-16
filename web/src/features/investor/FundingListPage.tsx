/* /nha-dau-tu/lo — Các Lô P đang mở gọi vốn (GET /api/funding/batches) và khoản tôi đang giữ chỗ (GET /api/me/contributions). */
import { CalendarClock } from 'lucide-react'
import type { ContributionResponse, FundingBatchSummary } from '../../shared/api/api.gen'
import {
  OpBadge, OpCard, OpEmpty, OpHeading, OpMeter, OpNote, QueryView, crabImg, formatDate, formatDateTime, formatVnd, label, useGet,
} from '../../shared/ui/console'
import { contributeHref, fundingHref } from './investorShared'

export default function FundingListPage() {
  const batches = useGet<FundingBatchSummary[]>('/api/funding/batches')
  const contributions = useGet<ContributionResponse[]>('/api/me/contributions')
  const reserved = (contributions.data ?? []).find((c) => c.status === 'Reserved' && Date.parse(c.expiresAt) > Date.now())

  return (
    <>
      <OpHeading eyebrow="Góp vốn" title="Lô đang gọi vốn" />

      {reserved && (
        <OpNote>
          Đang giữ chỗ <b>{formatVnd(reserved.amount)}</b> ở Lô {reserved.batchCode} tới {formatDateTime(reserved.expiresAt)}.{' '}
          <a className="op-link" href={contributeHref(reserved.batchCode)}>Chuyển khoản</a>
        </OpNote>
      )}

      <QueryView query={batches}>
        {(rows) => rows.length === 0 ? (
          <OpEmpty title="Chưa có Lô nào mở gọi vốn">Xem các Lô bạn đã góp ở mục Lô tôi đã góp.</OpEmpty>
        ) : (
          <div className="op-cards">
            {rows.map((b) => (
              <OpCard
                key={b.batchCode}
                href={fundingHref(b.batchCode)}
                image={crabImg(b.crabType, 640)}
                badge={<OpBadge tone="gold">Còn nhận {formatVnd(b.remainingCapacity)}</OpBadge>}
                title={b.title}
                sub={`${b.batchCode} · ${label('crabType', b.crabType)} · ${b.operatorName}`}
                foot={
                  <>
                    <span>Góp từ <b className="rd-num">{formatVnd(b.minContribution)}</b></span>
                    {b.fundingDeadline && <span className="op-inline rd-muted"><CalendarClock size={14} /> Hạn {formatDate(b.fundingDeadline)}</span>}
                  </>
                }
              >
                <OpMeter label="Đã xác nhận" value={b.confirmedCapital} max={b.targetCapital}
                  display={`${formatVnd(b.confirmedCapital)} / ${formatVnd(b.targetCapital)}`} />
              </OpCard>
            ))}
          </div>
        )}
      </QueryView>
    </>
  )
}
