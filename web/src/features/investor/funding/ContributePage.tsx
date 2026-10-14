/* Luồng góp vốn ≤ 5 màn (Phiếu, Usability): Rủi ro → Số tiền & giữ chỗ → Hợp đồng → Chuyển tiền → Xong.
   Màn 1–2 (TH-04) và 4–5 (TH-05) chạy với API thật. Màn 3 chờ ký số (TH-08).
   Không hiển thị lợi suất kỳ vọng ở bất kỳ đâu (TL-05 §8, BR-49). */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Check, Clock, FileSignature, Hourglass, QrCode, ShieldCheck, Wallet } from 'lucide-react'
import { errorMessage } from '../../../shared/api/http'
import { formatDate, formatDateTime, formatVnd } from '../../../shared/lib/format'
import { usePaymentRequest } from '../../../shared/payments/paymentsApi'
import { SimulatePaymentButton } from '../../../shared/payments/SimulatePaymentButton'
import { VietQrBox } from '../../../shared/payments/VietQrBox'
import { Shell, useCountdown } from '../../../shared/ui/kit/kit'
import {
  useAcknowledgeRisk, useActiveDisclosure, useCancelReservation, useFundingBatch, useRequestPayment, useReserve,
  type Contribution, type FundingBatch,
} from './fundingApi'
import '../investor.css'
import './funding.css'

const STEPS = ['Rủi ro', 'Số tiền', 'Hợp đồng', 'Chuyển tiền', 'Xong'] as const
type Countdown = { left: number; text: string }
/** Yêu cầu chuyển khoản đã lấy cho khoản giữ chỗ nào (giữ chỗ lại thì phải lấy mã mới). */
type PaymentRef = { contributionId: number; paymentRequestId: number }

export default function ContributePage() {
  const { code = '' } = useParams()
  return (
    <Shell theme="light">
      <ContributeFlow code={code} />
    </Shell>
  )
}

function ContributeFlow({ code }: { code: string }) {
  const batch = useFundingBatch(code)
  const { refetch } = batch
  const [step, setStep] = useState<number | null>(null)
  const [payment, setPayment] = useState<PaymentRef | null>(null)
  const reservation = batch.data?.myActiveReservation ?? null
  const until = reservation ? Date.parse(reservation.expiresAt) : null
  const countdown = useCountdown(until)

  // Bắt đầu ở màn 1 nếu chưa xác nhận rủi ro, ngược lại vào thẳng màn 2
  useEffect(() => {
    if (batch.data && step === null) setStep(batch.data.me.riskAcknowledged ? 1 : 0)
  }, [batch.data, step])

  // Hết giờ giữ chỗ: tải lại để chỗ được trả về và hiện lại ô nhập số tiền
  useEffect(() => {
    if (until && countdown.left === 0) void refetch()
  }, [until, countdown.left, refetch])

  if (batch.isPending) return <Frame code={code}><p className="rd-muted">Đang tải…</p></Frame>
  if (batch.isError) return <Frame code={code}><p className="cf-error">{errorMessage(batch.error)}</p></Frame>

  const b = batch.data
  // Lần vẽ đầu (trước khi effect đặt step) cũng đã đúng màn, không chớp qua màn rủi ro
  const current = step ?? (b.me.riskAcknowledged ? 1 : 0)
  const pill = reservation && countdown.left > 0
    ? <span className="rd-hold rd-hold--pill" title="Thời gian giữ chỗ còn lại"><Clock size={14} /> {countdown.text}</span>
    : null

  if (!b.me.kycVerified) {
    return (
      <Frame code={code} title={b.title}>
        <StepHead icon={<ShieldCheck size={20} />} title="Cần xác minh danh tính" sub="Phải xác minh eKYC trước khi góp vốn (TL-06)." />
        <footer className="cf-foot"><Link className="rd-btn rd-btn--primary rd-btn--lg" to="/nha-dau-tu/ho-so">Xác minh ngay</Link></footer>
      </Frame>
    )
  }
  if (!b.isOpen && !reservation) {
    return (
      <Frame code={code} title={b.title}>
        <StepHead icon={<Wallet size={20} />} title="Lô không nhận góp vốn lúc này"
          sub={b.status === 'Funding' ? 'Đã hết hạn gọi vốn.' : 'Lô không còn ở giai đoạn gọi vốn.'} />
        <footer className="cf-foot"><Link className="rd-btn rd-btn--ghost" to="/nha-dau-tu">Về cổng nhà đầu tư</Link></footer>
      </Frame>
    )
  }

  return (
    <Frame code={code} title={`${b.title} · ${b.operatorName}`} aside={pill} step={current}>
      {current === 0 && <RiskStep code={code} onDone={() => setStep(1)} />}
      {current === 1 && <AmountStep b={b} reservation={reservation} countdown={countdown} onNext={() => setStep(2)} />}
      {current === 2 && <ContractStep b={b} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {current === 3 && (
        <PaymentStep reservation={reservation} payment={payment} onCreated={setPayment} onExpire={() => void refetch()}
          onBack={() => setStep(2)} onTransferred={() => setStep(4)} onReserveAgain={() => setStep(1)} />
      )}
      {current === 4 && (
        <DoneStep payment={payment} onPaid={() => void refetch()} onShowQr={() => setStep(3)} onReserveAgain={() => setStep(1)} />
      )}
    </Frame>
  )
}

function Frame({ code, title, aside, step, children }: { code: string; title?: string; aside?: ReactNode; step?: number; children: ReactNode }) {
  return (
    <main className="cf">
      <header className="cf-head">
        <Link to="/nha-dau-tu" className="iv-back"><ArrowLeft size={16} /> Cổng nhà đầu tư</Link>
        <div className="cf-head__row">
          <div>
            <p className="rd-eyebrow">Góp vốn</p>
            <h1 className="rd-h2">{code}</h1>
            {title && <p className="rd-muted">{title}</p>}
          </div>
          {aside}
        </div>
        {step !== undefined && (
          <ol className="rd-steps cf-steps" aria-label="Các bước góp vốn">
            {STEPS.map((s, i) => (
              <li key={s} className={i < step ? 'is-done' : i === step ? 'is-on' : ''} aria-current={i === step ? 'step' : undefined}>
                <span>{i + 1}</span>{s}
              </li>
            ))}
          </ol>
        )}
      </header>
      <section className="iv-card cf-card">{children}</section>
    </main>
  )
}

function StepHead({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="cf-step-head">
      <span className="cf-step-head__icon">{icon}</span>
      <div><h2 className="rd-h3">{title}</h2>{sub && <small>{sub}</small>}</div>
    </div>
  )
}

/* ---------- Màn 1: bản công bố rủi ro, chỉ xác nhận được khi đã cuộn hết ---------- */
function RiskStep({ code, onDone }: { code: string; onDone: () => void }) {
  const disclosure = useActiveDisclosure()
  const acknowledge = useAcknowledgeRisk(code)
  const box = useRef<HTMLDivElement>(null)
  const [atEnd, setAtEnd] = useState(false)
  const [agree, setAgree] = useState(false)

  // Nội dung ngắn hơn khung (màn hình cao) thì coi như đã cuộn hết
  useLayoutEffect(() => {
    const el = box.current
    if (el && el.scrollHeight <= el.clientHeight + 8) setAtEnd(true)
  }, [disclosure.data])

  if (disclosure.isPending) return <p className="rd-muted">Đang tải bản công bố rủi ro…</p>
  if (disclosure.isError) return <p className="cf-error">{errorMessage(disclosure.error)}</p>

  const d = disclosure.data
  const onScroll = () => {
    const el = box.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setAtEnd(true)
  }
  return (
    <>
      <StepHead icon={<ShieldCheck size={20} />} title="Đọc bản công bố rủi ro" sub={`Phiên bản ${d.versionCode} · cuộn tới cuối rồi mới xác nhận được`} />
      <div ref={box} className="cf-disclosure" onScroll={onScroll} tabIndex={0} aria-label="Nội dung công bố rủi ro">
        <Disclosure text={d.content} />
      </div>
      {d.acknowledgedAt ? (
        <p className="cf-ok"><Check size={16} /> Bạn đã xác nhận bản này lúc {formatDateTime(d.acknowledgedAt)}.</p>
      ) : (
        <label className={`rd-check${atEnd ? '' : ' cf-disabled'}`}>
          <input type="checkbox" disabled={!atEnd} checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>{atEnd ? 'Tôi đã đọc hết và hiểu các rủi ro trên' : 'Cuộn tới cuối bản công bố để xác nhận'}</span>
        </label>
      )}
      {acknowledge.isError && <p className="cf-error">{errorMessage(acknowledge.error)}</p>}
      <footer className="cf-foot">
        {d.acknowledgedAt ? (
          <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" onClick={onDone}>Tiếp tục</button>
        ) : (
          <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" disabled={!atEnd || !agree || acknowledge.isPending}
            onClick={() => acknowledge.mutate(d.riskDisclosureId, { onSuccess: onDone })}>
            {acknowledge.isPending ? 'Đang ghi nhận…' : 'Xác nhận'}
          </button>
        )}
      </footer>
    </>
  )
}

/** Hiển thị toàn văn (đúng file đã băm): tiêu đề, đoạn văn, danh sách đánh số; ý có ★ được làm nổi bật. */
function Disclosure({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let items: string[] = []
  const flush = () => {
    if (items.length === 0) return
    blocks.push(<ol key={blocks.length}>{items.map((t, i) => <li key={i} className={t.includes('★') ? 'is-key' : undefined}>{t}</li>)}</ol>)
    items = []
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const numbered = /^\d+\.\s+(.*)$/.exec(line)
    if (numbered) { items.push(numbered[1]); continue }
    flush()
    if (!line) continue
    blocks.push(line.startsWith('# ') ? <h3 key={blocks.length}>{line.slice(2)}</h3> : <p key={blocks.length}>{line}</p>)
  }
  flush()
  return <>{blocks}</>
}

/* ---------- Màn 2: số tiền và giữ chỗ ---------- */
function AmountStep({ b, reservation, countdown, onNext }: { b: FundingBatch; reservation: Contribution | null; countdown: Countdown; onNext: () => void }) {
  const reserve = useReserve(b.batchCode)
  const cancel = useCancelReservation(b.batchCode)
  const room = b.remainingCapacity
  const [amount, setAmount] = useState(() => Math.max(b.minContribution, Math.min(10_000_000, room)))

  if (reservation && countdown.left > 0) {
    return (
      <>
        <StepHead icon={<Clock size={20} />} title="Đã giữ chỗ cho bạn" sub={`Giữ trong ${b.reservationMinutes} phút. Hết giờ mà chưa chuyển tiền thì chỗ được trả lại cho người khác.`} />
        <p className="rd-amount">{formatVnd(reservation.amount)}</p>
        <div className="rd-hold cf-hold"><Clock size={16} /> Còn <b>{countdown.text}</b> để ký hợp đồng và chuyển tiền</div>
        <dl className="rd-review">
          <dt>Lô</dt><dd>{b.batchCode}</dd>
          <dt>Giữ lúc</dt><dd>{formatDateTime(reservation.reservedAt)}</dd>
          <dt>Hết hạn</dt><dd>{formatDateTime(reservation.expiresAt)}</dd>
          <dt>Lỗ tối đa</dt><dd>{formatVnd(reservation.amount)}</dd>
        </dl>
        {cancel.isError && <p className="cf-error">{errorMessage(cancel.error)}</p>}
        <footer className="cf-foot">
          <button type="button" className="rd-btn rd-btn--ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(reservation.contributionId)}>
            {cancel.isPending ? 'Đang huỷ…' : 'Huỷ giữ chỗ'}
          </button>
          <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" onClick={onNext}>Tiếp tục</button>
        </footer>
      </>
    )
  }

  const full = room < b.minContribution
  const problem = full
    ? 'Lô đã gần chạm trần vốn, không còn đủ chỗ cho mức góp tối thiểu.'
    : amount < b.minContribution ? `Số tiền góp tối thiểu là ${formatVnd(b.minContribution)}.`
      : amount > room ? `Lô chỉ còn nhận tối đa ${formatVnd(room)}.` : null
  const quick = [b.minContribution, 5_000_000, 10_000_000, 20_000_000, 50_000_000]
    .filter((v, i, all) => v >= b.minContribution && v <= room && all.indexOf(v) === i)
  return (
    <>
      <StepHead icon={<Wallet size={20} />} title="Chọn số tiền góp" sub={`Tối thiểu ${formatVnd(b.minContribution)} · lô còn nhận ${formatVnd(room)} trước khi chạm trần`} />
      <label className="cf-amount">
        <span>Số tiền (đồng)</span>
        <input inputMode="numeric" autoComplete="off" value={amount ? new Intl.NumberFormat('vi-VN').format(amount) : ''}
          onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)} aria-invalid={!!problem} />
      </label>
      {quick.length > 0 && (
        <div className="rd-pills">
          {quick.map((q) => <button key={q} type="button" className={amount === q ? 'is-on' : ''} onClick={() => setAmount(q)}>{formatVnd(q)}</button>)}
        </div>
      )}
      {problem && <p className="cf-error">{problem}</p>}
      <div className="rd-facts cf-facts">
        <div><small>Đã xác nhận</small><b>{formatVnd(b.confirmedCapital)}</b><small>mục tiêu {formatVnd(b.targetCapital)}</small></div>
        <div><small>Lỗ tối đa</small><b>{formatVnd(amount)}</b><small>bằng đúng số tiền bạn góp</small></div>
        <div><small>Hạn gọi vốn</small><b>{b.fundingDeadline ? formatDate(b.fundingDeadline) : '—'}</b><small>{b.investorCount} nhà đầu tư đã góp</small></div>
        <div><small>Không đủ vốn khả thi</small><b>Hoàn tiền</b><small>nếu chưa đủ {formatVnd(b.minViableCapital)} đúng hạn</small></div>
      </div>
      {reserve.isError && <p className="cf-error">{errorMessage(reserve.error)}</p>}
      <footer className="cf-foot">
        <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" disabled={!!problem || reserve.isPending} onClick={() => reserve.mutate(amount)}>
          {reserve.isPending ? 'Đang giữ chỗ…' : `Giữ chỗ ${b.reservationMinutes} phút`}
        </button>
      </footer>
    </>
  )
}

/* ---------- Màn 3: hợp đồng (TH-08) ---------- */
function ContractStep({ b, onBack, onNext }: { b: FundingBatch; onBack: () => void; onNext: () => void }) {
  return (
    <>
      <StepHead icon={<FileSignature size={20} />} title="Ký hợp đồng hợp tác" sub={`Hợp đồng giữa bạn và ${b.operatorName}. CrabShare không là một bên.`} />
      <div className="cf-soon">
        <b>Đang làm ở task TH-08</b>
        <p>Ký số theo thứ tự: người nuôi ký trước, bạn ký sau. Bản demo hiện bỏ qua bước này.</p>
      </div>
      <footer className="cf-foot">
        <button type="button" className="rd-btn rd-btn--ghost" onClick={onBack}>Quay lại</button>
        <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" onClick={onNext}>Tiếp tục</button>
      </footer>
    </>
  )
}

/* ---------- Màn 4: chuyển tiền bằng VietQR (TH-05) ---------- */
function PaymentStep({ reservation, payment, onCreated, onExpire, onBack, onTransferred, onReserveAgain }: {
  reservation: Contribution | null
  payment: PaymentRef | null
  onCreated: (payment: PaymentRef) => void
  onExpire: () => void
  onBack: () => void
  onTransferred: () => void
  onReserveAgain: () => void
}) {
  const { mutate, isError, error } = useRequestPayment()
  const contributionId = reservation?.contributionId ?? null
  // Hết giữ chỗ thì vẫn theo dõi mã cũ, để còn biết tiền đã về hay mã đã hết hạn
  const id = payment && (contributionId === null || payment.contributionId === contributionId) ? payment.paymentRequestId : null
  const request = usePaymentRequest(id)
  const started = useRef<number | null>(null)

  // Vào màn là lấy mã ngay. StrictMode chạy effect hai lần nên nhớ đã gọi cho khoản góp nào (API cũng trả lại mã cũ).
  useEffect(() => {
    if (contributionId === null || id !== null || started.current === contributionId) return
    started.current = contributionId
    mutate(contributionId, { onSuccess: (p) => onCreated({ contributionId, paymentRequestId: p.paymentRequestId }) })
  }, [contributionId, id, mutate, onCreated])

  // Ngân hàng báo tiền về (webhook TH-06) thì sang màn Xong
  const status = request.data?.status
  useEffect(() => {
    if (status === 'Paid') onTransferred()
  }, [status, onTransferred])

  const payable = reservation !== null && status === 'Pending'
  const lapsed = (reservation === null && !request.data) || status === 'Expired' || status === 'Cancelled'
  return (
    <>
      <StepHead icon={<QrCode size={20} />} title="Chuyển tiền bằng VietQR"
        sub="Tiền vào thẳng tài khoản chuyên dùng của lô tại trung gian thanh toán, CrabShare không giữ tiền." />
      {request.data ? (
        <VietQrBox payment={request.data} status={request.data.status} onExpire={onExpire} />
      ) : reservation === null ? (
        <p className="cf-error">Đã hết thời gian giữ chỗ nên chưa tạo được mã chuyển khoản. Hãy giữ chỗ lại.</p>
      ) : isError ? (
        <p className="cf-error">{errorMessage(error)}</p>
      ) : (
        <p className="rd-muted">Đang tạo mã chuyển khoản…</p>
      )}
      <footer className="cf-foot">
        {lapsed ? (
          <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" onClick={onReserveAgain}>Giữ chỗ lại</button>
        ) : (
          <>
            <button type="button" className="rd-btn rd-btn--ghost" onClick={onBack}>Quay lại</button>
            {/* Chỉ dev: giả lập ngân hàng báo có, trang tự sang màn Xong khi mã đổi sang Paid */}
            {request.data?.status === 'Pending' && <SimulatePaymentButton payment={request.data} />}
            <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" disabled={!payable} onClick={onTransferred}>Tôi đã chuyển khoản</button>
          </>
        )}
      </footer>
    </>
  )
}

/* ---------- Màn 5: chờ tiền về hoặc đã xác nhận ---------- */
function DoneStep({ payment, onPaid, onShowQr, onReserveAgain }: {
  payment: PaymentRef | null
  onPaid: () => void
  onShowQr: () => void
  onReserveAgain: () => void
}) {
  const request = usePaymentRequest(payment?.paymentRequestId ?? null)
  const p = request.data
  const paid = p?.status === 'Paid'
  const refreshed = useRef(false)

  // Tiền đã về: tải lại số liệu lô để khoản góp thôi hiện là "đang giữ chỗ"
  useEffect(() => {
    if (paid && !refreshed.current) {
      refreshed.current = true
      onPaid()
    }
  }, [paid, onPaid])

  if (!p) {
    return request.isError
      ? <p className="cf-error">{errorMessage(request.error)}</p>
      : <p className="rd-muted">Đang tải…</p>
  }
  if (p.status === 'Paid') {
    return (
      <>
        <div className="rd-done" role="status">
          <span className="rd-done__icon"><Check size={28} /></span>
          <h3>Đã nhận tiền góp vốn</h3>
          <p>{formatVnd(p.amount)} vào lô {p.batchCode}. Khoản góp đã được xác nhận.</p>
        </div>
        <footer className="cf-foot"><Link className="rd-btn rd-btn--primary rd-btn--lg" to="/nha-dau-tu">Về cổng nhà đầu tư</Link></footer>
      </>
    )
  }
  if (p.status === 'Pending') {
    return (
      <>
        <StepHead icon={<Hourglass size={20} />} title="Đang chờ tiền về tài khoản của lô"
          sub="Hệ thống tự xác nhận khi ngân hàng báo có giao dịch, bạn không cần gửi biên lai." />
        <dl className="rd-review">
          <dt>Số tiền</dt><dd>{formatVnd(p.amount)}</dd>
          <dt>Nội dung chuyển khoản</dt><dd>{p.referenceCode}</dd>
          <dt>Mã hết hạn</dt><dd>{formatDateTime(p.expiresAt)}</dd>
        </dl>
        <p className="rd-note"><Clock size={14} /> Trang tự cập nhật khi tiền về. Khoản góp chỉ được tính khi tiền đã vào tài khoản của lô.</p>
        <footer className="cf-foot">
          <button type="button" className="rd-btn rd-btn--ghost" onClick={onShowQr}>Xem lại mã QR</button>
          {/* Chỉ dev: giả lập ngân hàng báo có (đi đúng luồng webhook TH-06) */}
          <SimulatePaymentButton payment={p} />
        </footer>
      </>
    )
  }
  return (
    <>
      <StepHead icon={<Clock size={20} />} title={p.status === 'Cancelled' ? 'Mã chuyển khoản đã huỷ' : 'Mã đã hết hạn mà chưa nhận được tiền'}
        sub="Chỗ giữ đã được trả lại. Nếu bạn lỡ chuyển sau khi hết hạn, khoản tiền sẽ được hoàn về tài khoản đã chuyển." />
      <footer className="cf-foot">
        <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" onClick={onReserveAgain}>Giữ chỗ lại</button>
      </footer>
    </>
  )
}
