/* /nha-dau-tu — Tổng quan của nhà đầu tư: đầu trang chỉ có ba số tiền thật trên các Lô đã chốt vốn (BR-232) và việc cần làm; dưới là các Lô đã góp.
   GET /api/investor/portfolio, /api/batches/{code}/money-summary, /api/batches/{code}/decisions, /api/me/contracts, /api/me/settlements,
   /api/me/contributions, /api/me/kyc. Không có số dự kiến hay ước tính nào (BR-219). */
import { Sprout } from 'lucide-react'
import type {
  ContractSummary, ContributionResponse, DecisionResponse, KycStatusResponse, MoneySummaryResponse, SettlementSummary,
} from '../../shared/api/api.gen'
import { useAuthStore } from '../../shared/auth/authStore'
import {
  OpBadge, OpBtn, OpEmpty, OpHeading, OpLoading, OpNote, OpPanel, OpRow, OpTodo, QueryView, StatusBadge, crabImg, formatDateTime, formatVnd, label, useGet,
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
  const contracts = useGet<ContractSummary[]>('/api/me/contracts', undefined, { retry: false })
  const settlements = useGet<SettlementSummary[]>('/api/me/settlements', undefined, { retry: false })
  const contributions = useGet<ContributionResponse[]>('/api/me/contributions', undefined, { retry: false })
  const kyc = useGet<KycStatusResponse>('/api/me/kyc', undefined, { retry: false })

  const mine = money.flatMap((q) => (!q.isError && q.data?.mine ? [q.data.mine] : []))
  const moneyMissing = money.filter((q) => q.isError).length
  const waiting = items.filter((p) => !isFrozen(p)).reduce((sum, p) => sum + p.confirmedAmount, 0)

  const todoSources = [kyc, contributions, contracts, settlements, ...decisions]
  const todoPending = todoSources.some((q) => q.isPending)
  const todoFailed = todoSources.filter((q) => q.isError)
  const todos: (Todo & { deadline?: number })[] = [
    ...(kyc.data && kyc.data.verificationStatus !== 'Verified'
      ? [{ title: 'Xác minh danh tính', sub: 'Cần có trước khi góp vốn', href: '/nha-dau-tu/ho-so', tone: 'danger' as const, deadline: 0 }]
      : []),
    ...(contributions.data ?? [])
      .filter((c) => c.status === 'Reserved' && Date.parse(c.expiresAt) > Date.now())
      .map((c) => ({ title: `Chuyển khoản cho Lô ${c.batchCode}`, sub: `${formatVnd(c.amount)}, giữ chỗ tới ${formatDateTime(c.expiresAt)}`, href: contributeHref(c.batchCode), tone: 'warn' as const, deadline: Date.parse(c.expiresAt) })),
    ...(contracts.data ?? [])
      .filter((c) => c.nextSigner === 'Investor' && c.status !== 'Void')
      .map((c) => ({ title: `Ký hợp đồng ${c.contractNo}`, sub: `Lô ${c.batchCode}, ${formatVnd(c.amount)}`, href: `/nha-dau-tu/hop-dong?id=${c.contractId}`, tone: 'gold' as const })),
    ...decisions
      .flatMap((q) => q.data ?? [])
      .filter((d) => d.canVote)
      .map((d) => ({ title: `Biểu quyết ${d.decisionNo}: ${label('decisionKind', d.kind)}`, sub: `Lô ${d.batchCode}, hạn ${formatDateTime(d.closesAt)}`, href: portfolioHref(d.batchCode, 'bieu-quyet'), tone: 'gold' as const, deadline: Date.parse(d.closesAt) })),
    ...(settlements.data ?? [])
      .filter((s) => s.feedbackOpen)
      .map((s) => ({ title: `Xem bảng quyết toán Lô ${s.batchCode}`, sub: `Góp ý tới ${formatDateTime(s.feedbackDeadline)}`, href: `/nha-dau-tu/quyet-toan/${s.settlementId}`, tone: 'info' as const, deadline: s.feedbackDeadline ? Date.parse(s.feedbackDeadline) : undefined })),
  ]
  todos.sort((a, b) => (a.deadline ?? Number.MAX_SAFE_INTEGER) - (b.deadline ?? Number.MAX_SAFE_INTEGER))

  return (
    <>
      <OpHeading
        title={`Chào ${user?.fullName ?? 'bạn'}`}
        description="Theo dõi vốn góp và những việc cần xử lý."
        action={<a className="rd-btn rd-btn--primary" href="/nha-dau-tu/lo"><Sprout size={17} /> Lô đang gọi vốn</a>}
      />

      <QueryView query={portfolio}>
        {(page) => (
          <>
            <div className="inv-overview">
              <OpPanel className="inv-action-queue" title="Việc cần làm" action={<span className="rd-muted">{todos.length} việc đã ghi nhận</span>}>
                {todos.length > 0 && <OpTodo items={todos} />}
                {todoPending && <OpLoading label="Đang kiểm tra việc cần làm…" />}
                {todoFailed.length > 0 && (
                  <OpNote tone="danger">
                    <p>Chưa kiểm tra được hết việc cần làm.</p>
                    <OpBtn variant="ghost" sm onClick={() => { for (const q of todoFailed) void q.refetch() }}>Thử lại</OpBtn>
                  </OpNote>
                )}
                {!todoPending && todoFailed.length === 0 && todos.length === 0 && <p className="rd-muted">Không có việc nào đang chờ.</p>}
              </OpPanel>
              <div className="inv-capital-summary op-stack">
                {money.some((q) => q.isPending)
                  ? <OpPanel><OpLoading /></OpPanel>
                  : moneyMissing > 0 && mine.length === 0
                    ? <OpEmpty title="Chưa tải được số liệu vốn" />
                    : <MoneyStat title={moneyMissing > 0 ? 'Vốn góp đã tải được' : 'Vốn góp ở Lô đã chốt'} figures={sumFigures(mine)}
                        sub={`${mine.length} Lô đã chốt vốn${moneyMissing > 0 ? `, còn ${moneyMissing} Lô chưa tải` : ''}`} />}
                {waiting > 0 && <p className="inv-waiting">Thêm <b>{formatVnd(waiting)}</b> đã xác nhận, chờ chốt vốn.</p>}
                {moneyMissing > 0 && <OpNote tone="danger">
                  <p>Chưa lấy được số tiền của {moneyMissing} Lô.</p>
                  <OpBtn variant="ghost" sm onClick={() => { for (const q of money) if (q.isError) void q.refetch() }}>Thử lại số liệu vốn</OpBtn>
                </OpNote>}
              </div>
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
