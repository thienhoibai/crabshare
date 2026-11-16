/* /nha-dau-tu — Tổng quan của nhà đầu tư: đầu trang chỉ có ba số tiền thật trên các Lô đã chốt vốn (BR-232) và việc cần làm; dưới là các Lô đã góp.
   GET /api/investor/portfolio, /api/batches/{code}/money-summary, /api/batches/{code}/decisions, /api/me/contracts, /api/me/settlements,
   /api/me/contributions, /api/me/kyc. Không có số dự kiến hay ước tính nào (BR-219). */
import { Sprout } from 'lucide-react'
import type {
  ContractSummary, ContributionResponse, DecisionResponse, KycStatusResponse, MoneySummaryResponse, SettlementSummary,
} from '../../shared/api/api.gen'
import { useAuthStore } from '../../shared/auth/authStore'
import {
  OpBadge, OpEmpty, OpHeading, OpLoading, OpNote, OpPanel, OpRow, OpTodo, QueryView, StatusBadge, crabImg, formatDateTime, formatVnd, label, useGet,
  type Todo,
} from '../../shared/ui/console'
import { MoneyStat, batchApi, contributeHref, isFrozen, portfolioHref, ratioText, sumFigures, useGetMany, usePortfolio } from './investorShared'

export default function OverviewPage() {
  const user = useAuthStore((s) => s.user)
  const portfolio = usePortfolio()
  const items = portfolio.data?.items ?? []
  const frozen = items.filter(isFrozen)
  const money = useGetMany<MoneySummaryResponse>(frozen.map((p) => batchApi(p.batch.code, 'money-summary')))
  const decisions = useGetMany<DecisionResponse[]>(frozen.map((p) => batchApi(p.batch.code, 'decisions')))
  const contracts = useGet<ContractSummary[]>('/api/me/contracts')
  const settlements = useGet<SettlementSummary[]>('/api/me/settlements')
  const contributions = useGet<ContributionResponse[]>('/api/me/contributions')
  const kyc = useGet<KycStatusResponse>('/api/me/kyc')

  const mine = money.flatMap((q) => (q.data?.mine ? [q.data.mine] : []))
  const moneyMissing = money.filter((q) => q.isError).length
  const waiting = items.filter((p) => !isFrozen(p)).reduce((sum, p) => sum + p.confirmedAmount, 0)

  const todos: Todo[] = [
    ...(kyc.data && kyc.data.verificationStatus !== 'Verified'
      ? [{ title: 'Xác minh danh tính', sub: 'Cần có trước khi góp vốn', href: '/nha-dau-tu/ho-so', tone: 'danger' as const }]
      : []),
    ...(contributions.data ?? [])
      .filter((c) => c.status === 'Reserved' && Date.parse(c.expiresAt) > Date.now())
      .map((c) => ({ title: `Chuyển khoản cho Lô ${c.batchCode}`, sub: `${formatVnd(c.amount)} · giữ chỗ tới ${formatDateTime(c.expiresAt)}`, href: contributeHref(c.batchCode), tone: 'warn' as const })),
    ...(contracts.data ?? [])
      .filter((c) => c.nextSigner === 'Investor' && c.status !== 'Void')
      .map((c) => ({ title: `Ký hợp đồng ${c.contractNo}`, sub: `Lô ${c.batchCode} · ${formatVnd(c.amount)}`, href: `/nha-dau-tu/hop-dong?id=${c.contractId}`, tone: 'gold' as const })),
    ...decisions
      .flatMap((q) => q.data ?? [])
      .filter((d) => d.canVote)
      .map((d) => ({ title: `Biểu quyết ${d.decisionNo}: ${label('decisionKind', d.kind)}`, sub: `Lô ${d.batchCode} · hạn ${formatDateTime(d.closesAt)}`, href: '/nha-dau-tu/bieu-quyet', tone: 'gold' as const })),
    ...(settlements.data ?? [])
      .filter((s) => s.feedbackOpen)
      .map((s) => ({ title: `Xem bảng quyết toán Lô ${s.batchCode}`, sub: `Góp ý tới ${formatDateTime(s.feedbackDeadline)}`, href: `/nha-dau-tu/quyet-toan/${s.settlementId}`, tone: 'info' as const })),
  ]

  return (
    <>
      <OpHeading
        eyebrow="Nhà đầu tư"
        title={`Chào ${user?.fullName ?? 'bạn'}`}
        action={<a className="rd-btn rd-btn--primary" href="/nha-dau-tu/lo"><Sprout size={17} /> Lô đang gọi vốn</a>}
      />

      <QueryView query={portfolio}>
        {(page) => (
          <>
            <div className="op-grid">
              <div className="op-span-7 op-stack">
                {money.some((q) => q.isPending)
                  ? <OpPanel><OpLoading /></OpPanel>
                  : <MoneyStat title="Tôi đã góp" figures={sumFigures(mine)}
                      sub={`${mine.length} Lô đã chốt vốn${waiting > 0 ? ` · thêm ${formatVnd(waiting)} chờ chốt vốn` : ''}`} />}
                {moneyMissing > 0 && <OpNote tone="danger">Chưa lấy được số tiền của {moneyMissing} Lô.</OpNote>}
              </div>
              <OpPanel className="op-span-5" title="Việc cần làm">
                {todos.length > 0 ? <OpTodo items={todos} /> : <p className="rd-muted">Không có việc nào đang chờ.</p>}
              </OpPanel>
            </div>

            {page.items.length === 0 ? (
              <OpEmpty title="Bạn chưa góp vốn vào Lô nào">Chọn một Lô đang gọi vốn để bắt đầu.</OpEmpty>
            ) : (
              <OpPanel title="Lô tôi đã góp" action={<a className="op-link" href="/nha-dau-tu/danh-muc">Xem tất cả</a>}>
                <div>
                  {page.items.map((p) => (
                    <OpRow
                      key={p.batch.code}
                      href={portfolioHref(p.batch.code)}
                      media={crabImg(p.batch.crabType)}
                      title={p.batch.title}
                      sub={p.batch.code}
                      mid={
                        <span className="op-inline">
                          <StatusBadge kind="batch" value={p.batch.status} />
                          {p.batch.openAlerts > 0 && <OpBadge tone="danger">{p.batch.openAlerts} cảnh báo</OpBadge>}
                        </span>
                      }
                      end={<><b>{formatVnd(p.confirmedAmount)}</b><small>{ratioText(p.capitalRatio)} vốn của Lô</small></>}
                    />
                  ))}
                </div>
              </OpPanel>
            )}
          </>
        )}
      </QueryView>
    </>
  )
}
