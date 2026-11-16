/* /nha-dau-tu/danh-muc/:code — Một Lô tôi đã góp (GET /api/investor/portfolio/{batchCode}).
   Đầu trang: ba số tiền của tôi (GET /api/batches/{code}/money-summary, BR-232) và tiến độ (GET /api/batches/{code}/progress, BR-143).
   Phần còn lại nằm trong các mục chọn bằng ?tab=: Khoản góp, Nhật trình, Thiết bị, Biểu quyết, Quyết toán. */
import { useParams, useSearchParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import type { BatchProgressResponse, DecisionResponse, MoneySummaryResponse, PortfolioDetail } from '../../shared/api/api.gen'
import BatchTimeline from '../timeline/BatchTimeline'
import {
  OpBack, OpBadge, OpEmpty, OpError, OpFacts, OpHeading, OpLoading, OpPanel, OpStat, OpTabs, StatusBadge, errorMessage, label, useGet,
} from '../../shared/ui/console'
import { DecisionList } from './DecisionList'
import { MoneyStat, batchApi, enc, isFrozen, ratioText, type PortfolioTab } from './investorShared'
import { ContributionsTab } from './portfolio/ContributionsTab'
import { DevicesTab } from './portfolio/DevicesTab'
import { SettlementTab } from './portfolio/SettlementTab'

const TABS: { key: PortfolioTab; label: string }[] = [
  { key: 'khoan-gop', label: 'Khoản góp' },
  { key: 'nhat-trinh', label: 'Nhật trình' },
  { key: 'thiet-bi', label: 'Thiết bị' },
  { key: 'bieu-quyet', label: 'Biểu quyết' },
  { key: 'quyet-toan', label: 'Quyết toán' },
]

/** Ba số tiền của tôi và bốn số tiến độ, luôn ở đầu trang. */
function Summary({ detail }: { detail: PortfolioDetail }) {
  const { position } = detail
  const code = position.batch.code
  const frozen = isFrozen(position)
  const money = useGet<MoneySummaryResponse>(frozen ? batchApi(code, 'money-summary') : null, undefined, { retry: false })
  const progress = useGet<BatchProgressResponse>(batchApi(code, 'progress'), undefined, { retry: false })
  const share = `${ratioText(position.capitalRatio)} vốn của Lô`

  return (
    <div className="op-grid">
      <div className="op-span-7">
        {frozen && money.isPending ? <OpPanel><OpLoading /></OpPanel>
          : money.data?.mine ? <MoneyStat title="Tôi đã góp vào Lô này" figures={money.data.mine} sub={share} />
            : (
              <OpStat label="Tôi đã góp vào Lô này" value={new Intl.NumberFormat('vi-VN').format(position.confirmedAmount)} unit="đ"
                sub={frozen ? `${share} · chưa lấy được số giải ngân` : `${share} · Lô chưa chốt vốn nên chưa giải ngân`} />
            )}
      </div>
      {progress.data && (
        <OpPanel className="op-span-5" title="Tiến độ">
          <OpFacts items={[
            { label: 'Cua đang nuôi', value: `${progress.data.crabsAlive} con`, tone: 'ok' },
            { label: 'Ngày nuôi', value: progress.data.daysRaised ?? '—' },
            { label: 'Đã chết', value: progress.data.deadCrabs ?? '—', tone: 'danger' },
            { label: 'Đã giao hoặc bán', value: progress.data.deliveredOrSoldCrabs ?? '—' },
          ]} />
        </OpPanel>
      )}
    </div>
  )
}

function DecisionsTab({ code, frozen }: { code: string; frozen: boolean }) {
  const decisions = useGet<DecisionResponse[]>(frozen ? batchApi(code, 'decisions') : null, undefined, { retry: false })
  if (!frozen) return <OpEmpty title="Lô chưa chốt vốn nên chưa có biểu quyết" />
  if (decisions.isPending) return <OpLoading />
  if (decisions.isError) return <OpError error={decisions.error} onRetry={() => void decisions.refetch()} />
  if (decisions.data.length === 0) return <OpEmpty title="Lô này chưa có cuộc biểu quyết nào" />
  return <DecisionList decisions={[...decisions.data].reverse()} />
}

export default function PortfolioDetailPage() {
  const { code = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const detail = useGet<PortfolioDetail>(`/api/investor/portfolio/${enc(code)}`, undefined, { retry: false })
  const tab = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'khoan-gop'

  if (detail.isPending) return <OpLoading />
  if (detail.isError) {
    return (
      <>
        <OpHeading crumb={<OpBack href="/nha-dau-tu/danh-muc"><ArrowLeft size={16} /> Lô tôi đã góp</OpBack>} title={code} />
        <OpEmpty title="Không mở được Lô này">{errorMessage(detail.error)}</OpEmpty>
      </>
    )
  }

  const d = detail.data
  const b = d.position.batch
  return (
    <>
      <OpHeading
        crumb={<OpBack href="/nha-dau-tu/danh-muc"><ArrowLeft size={16} /> Lô tôi đã góp</OpBack>}
        eyebrow={`${b.code} · ${label('crabType', b.crabType)} · ${b.operatorName}`}
        title={b.title}
        action={
          <>
            {b.openAlerts > 0 && <OpBadge tone="danger">{b.openAlerts} cảnh báo</OpBadge>}
            <StatusBadge kind="batch" value={b.status} />
          </>
        }
      />
      <Summary detail={d} />
      <OpTabs<PortfolioTab> items={TABS} value={tab} onChange={(key) => setParams(key === 'khoan-gop' ? {} : { tab: key }, { replace: true })} label="Các mục của Lô" />

      {tab === 'khoan-gop' && <ContributionsTab detail={d} />}
      {tab === 'nhat-trinh' && <BatchTimeline code={b.code} />}
      {tab === 'thiet-bi' && <DevicesTab code={b.code} />}
      {tab === 'bieu-quyet' && <DecisionsTab code={b.code} frozen={isFrozen(d.position)} />}
      {tab === 'quyet-toan' && <SettlementTab detail={d} />}
    </>
  )
}
