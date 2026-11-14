/* /nha-dau-tu/gop-von/:code — Luồng góp vốn vào một Lô P theo năm bước (UC10, UC11, UC12, UC14):
   1 xác minh danh tính · 2 công bố rủi ro · 3 số tiền và giữ chỗ · 4 chuyển khoản VietQR · 5 hợp đồng.
   Mỗi lúc chỉ hiện một bước với một nút chính. Bước hiện tại suy ra từ dữ liệu của máy chủ (GET /api/funding/batches/{code}). */
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import type { ContributionResponse, FundingBatchResponse } from '../../../shared/api/api.gen'
import { useCountdown } from '../../../shared/ui/kit/kit'
import { OpBack, OpBadge, OpHeading, OpNote, OpPanel, OpSteps, QueryView, useGet } from '../../../shared/ui/console'
import { fundingHref, enc } from '../investorShared'
import { AmountStep } from './AmountStep'
import { ContractStep } from './ContractStep'
import { PaymentStep } from './PaymentStep'
import { RiskStep } from './RiskStep'

type StepKey = 'kyc' | 'risk' | 'amount' | 'pay' | 'contract'

const STEPS: { key: StepKey; title: string }[] = [
  { key: 'kyc', title: 'Xác minh danh tính' },
  { key: 'risk', title: 'Công bố rủi ro' },
  { key: 'amount', title: 'Số tiền góp' },
  { key: 'pay', title: 'Chuyển khoản' },
  { key: 'contract', title: 'Hợp đồng' },
]

export default function ContributePage() {
  const { code = '' } = useParams()
  const funding = useGet<FundingBatchResponse>(`/api/funding/batches/${enc(code)}`, undefined, { retry: false })
  const { refetch } = funding
  return <QueryView query={funding}>{(f) => <Flow f={f} refresh={() => void refetch()} />}</QueryView>
}

function Flow({ f, refresh }: { f: FundingBatchResponse; refresh: () => void }) {
  const contributions = useGet<ContributionResponse[]>('/api/me/contributions')
  const [params] = useSearchParams()
  /** Bước người dùng chủ động mở (sang hợp đồng trước khi chuyển khoản, quay lại chuyển khoản, giữ chỗ lại). ?buoc=hop-dong mở thẳng bước hợp đồng. */
  const [picked, setPicked] = useState<StepKey | null>(params.get('buoc') === 'hop-dong' ? 'contract' : null)
  /** Yêu cầu chuyển khoản đang theo dõi trong lần mở trang này. */
  const [paymentId, setPaymentId] = useState<number | null>(null)
  const [paidNow, setPaidNow] = useState(false)

  const reservation = f.myActiveReservation
  const until = reservation ? Date.parse(reservation.expiresAt) : null
  const countdown = useCountdown(until)
  const expired = until !== null && countdown.left === 0
  // Hết giờ giữ chỗ: tải lại để chỗ được trả về.
  useEffect(() => {
    if (expired) refresh()
    // chỉ chạy khi đồng hồ vừa về 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired])

  const confirmed = (contributions.data ?? []).filter((c) => c.batchCode === f.batchCode && c.status === 'Confirmed')
  const ready = f.me.kycVerified && f.me.riskAcknowledged
  const allowed: Record<StepKey, boolean> = {
    kyc: false,
    risk: false,
    amount: ready,
    pay: ready && (!!reservation || paymentId !== null),
    contract: !!reservation || confirmed.length > 0 || paidNow,
  }
  const auto: StepKey = !f.me.kycVerified ? 'kyc' : !f.me.riskAcknowledged ? 'risk' : reservation ? 'pay' : 'amount'
  const step = picked && allowed[picked] ? picked : auto
  const index = STEPS.findIndex((s) => s.key === step)

  return (
    <>
      <OpHeading
        crumb={<OpBack href={fundingHref(f.batchCode)}><ArrowLeft size={16} /> {f.batchCode}</OpBack>}
        eyebrow={`Góp vốn · bước ${index + 1} / ${STEPS.length}`}
        title={f.title}
        action={reservation && !expired ? <OpBadge tone="warn">Giữ chỗ còn {countdown.text}</OpBadge> : undefined}
      />
      <OpSteps step={index + 1} total={STEPS.length} />

      {step === 'kyc' && (
        <OpPanel title={STEPS[0].title}>
          <OpNote tone="danger">Bạn chưa xác minh danh tính.</OpNote>
          <div className="op-formfoot"><a className="rd-btn rd-btn--primary" href="/nha-dau-tu/ho-so?tab=xac-minh">Xác minh danh tính</a></div>
        </OpPanel>
      )}
      {step === 'risk' && <RiskStep onAcknowledged={() => { setPicked(null); refresh() }} />}
      {step === 'amount' && (
        <AmountStep
          f={f}
          hasConfirmed={confirmed.length > 0}
          onReserved={() => { setPaymentId(null); setPaidNow(false); setPicked(null) }}
          onContract={() => setPicked('contract')}
        />
      )}
      {step === 'pay' && (
        <PaymentStep
          reservation={reservation}
          paymentId={paymentId}
          onPayment={setPaymentId}
          onExpire={refresh}
          onPaid={() => { setPaidNow(true); setPicked('contract') }}
          onContract={() => setPicked('contract')}
          onReserveAgain={() => { setPaymentId(null); setPicked('amount') }}
        />
      )}
      {step === 'contract' && (
        <ContractStep batchCode={f.batchCode} reservation={reservation} confirmed={confirmed} onPay={() => setPicked('pay')} />
      )}
    </>
  )
}
