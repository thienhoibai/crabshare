import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '../../../shared/api/http'
import { formatDateTime, formatVnd } from '../../../shared/lib/format'
import { VietQrBox } from '../../../shared/payments/VietQrBox'
import { SimulatePaymentButton } from '../../../shared/payments/SimulatePaymentButton'
import { usePaymentRequest, type PaymentStatus } from '../../../shared/payments/paymentsApi'
import { useAddresses } from '../../accounts/paymentProfilesApi'
import { useMyContributions } from '../funding/fundingApi'
import {
  useMyOfftakes,
  useOfftakeCap,
  useCreateOfftake,
  useClaimOfftake,
  type OfftakeCommitment,
  type OfftakePayment,
} from './offtakeApi'

const STATUS_LABEL: Record<string, string> = {
  PendingHarvest: 'Chờ thu hoạch',
  WindowOpen: 'Cửa sổ ưu tiên',
  Fulfilled: 'Đã nhận hàng',
  Expired: 'Hết cửa sổ',
  Cancelled: 'Đã huỷ',
}

const DEPOSIT_LABEL: Record<string, string> = {
  Pending: 'Chờ cọc',
  Held: 'Đã giữ',
  Applied: 'Đã trừ vào tiền hàng',
  Forfeited: 'Mất cọc',
  Refunded: 'Đã hoàn',
}

function useCountdown(expiresAt?: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [expiresAt])
  if (!expiresAt) return null
  const ms = new Date(expiresAt).getTime() - now
  if (ms <= 0) return 'Đã hết giờ'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h} giờ ${String(m).padStart(2, '0')} phút ${String(s).padStart(2, '0')} giây`
}


function OfftakePaymentSection({ payment }: { payment: OfftakePayment }) {
  const live = usePaymentRequest(payment.paymentRequestId)
  const req = live.data
  const status = (req?.status ?? 'Pending') as PaymentStatus
  const paymentData = req ?? payment

  return (
    <div style={{ marginTop: '12px', padding: '16px', background: 'rgba(255, 91, 36, 0.05)', borderRadius: '16px', border: '1px solid rgba(255, 91, 36, 0.2)' }}>
      <VietQrBox payment={paymentData} status={status} />
      {status === 'Pending' && (
        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
          <SimulatePaymentButton payment={payment} />
        </div>
      )}
    </div>
  )
}

function OfftakeItem({ item }: { item: OfftakeCommitment }) {
  const [showQr, setShowQr] = useState(false)
  const [addressId, setAddressId] = useState<number | ''>('')
  const addresses = useAddresses()
  const claim = useClaimOfftake()
  const countdown = useCountdown(item.status === 'WindowOpen' ? item.windowExpiresAt : null)
  const isPendingDeposit = item.depositStatus === 'Pending'
  const canClaim = item.status === 'WindowOpen' && item.depositStatus === 'Held' && !item.orderId
  const balanceDue = item.status === 'WindowOpen' && item.depositStatus === 'Held' && !!item.orderId && !!item.payment

  useEffect(() => {
    const list = addresses.data ?? []
    if (!list.length) return
    if (list.some((a) => a.addressId === addressId)) return
    setAddressId((list.find((a) => a.isDefault) ?? list[0]).addressId)
  }, [addresses.data, addressId])

  return (
    <div
      style={{
        padding: '16px',
        borderRadius: '16px',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        display: 'grid',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <b style={{ fontSize: '16px' }}>{item.batchCode}</b>
          <span className="rd-muted" style={{ marginLeft: '8px' }}>· Hạng: <b>{item.gradeName || item.gradeCode}</b></span>
          <span className="rd-muted" style={{ marginLeft: '8px' }}>· Khoản góp #{item.contributionId}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 600,
              background: item.depositStatus === 'Held' ? '#dcfce7' : '#fef9c3',
              color: item.depositStatus === 'Held' ? '#166534' : '#854d0e',
            }}
          >
            Cọc: {DEPOSIT_LABEL[item.depositStatus] ?? item.depositStatus}
          </span>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 600,
              background: item.status === 'Cancelled' ? '#fee2e2' : '#e0e7ff',
              color: item.status === 'Cancelled' ? '#991b1b' : '#3730a3',
            }}
          >
            {STATUS_LABEL[item.status] ?? item.status}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '13px' }}>
        <div>Khối lượng: <b>{item.committedQtyKg} kg</b></div>
        <div>Giá chốt: <b>{formatVnd(item.fixedUnitPrice)}/kg</b></div>
        <div>Giá trị cam kết: <b>{formatVnd(item.commitmentValue)}</b></div>
        <div>
          Số tiền cọc ({item.depositPct}%): <b style={{ color: 'var(--accent, #ea580c)' }}>{formatVnd(item.depositAmount)}</b>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <small className="rd-muted">Đăng ký ngày: {formatDateTime(item.createdAt)}</small>
        {isPendingDeposit && item.payment && (
          <button
            type="button"
            className="rd-btn rd-btn--ghost"
            style={{ fontSize: '12px', padding: '4px 10px' }}
            onClick={() => setShowQr(!showQr)}
          >
            {showQr ? 'Ẩn mã cọc QR' : 'Mở QR cọc (mã ' + item.payment.referenceCode + ')'}
          </button>
        )}
      </div>

      {isPendingDeposit && item.payment && showQr && (
        <OfftakePaymentSection payment={item.payment} />
      )}

      {item.status === 'WindowOpen' && countdown && (
        <div style={{ fontSize: '14px' }}>
          Cửa sổ ưu tiên còn: <b>{countdown}</b>
          {item.windowExpiresAt && <span className="rd-muted"> · hết hạn {formatDateTime(item.windowExpiresAt)}</span>}
        </div>
      )}

      {canClaim && (
        <div style={{ display: 'grid', gap: '8px' }}>
          {(addresses.data ?? []).length === 0 ? (
            <p className="rd-muted" style={{ margin: 0 }}>
              Cần địa chỉ nhận hàng trước khi nhận cua.{' '}
              <Link to="/tai-khoan/dia-chi">Thêm địa chỉ</Link>
            </p>
          ) : (
            <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
              Địa chỉ nhận hàng
              <select value={addressId} onChange={(e) => setAddressId(Number(e.target.value))}>
                {(addresses.data ?? []).map((a) => (
                  <option key={a.addressId} value={a.addressId}>
                    {a.recipientName} — {a.addressLine}, {a.province}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="rd-btn rd-btn--primary"
            disabled={claim.isPending || typeof addressId !== 'number'}
            onClick={() => {
              if (typeof addressId !== 'number') return
              claim.mutate({ offtakeId: item.offtakeId, addressId })
            }}
          >
            {claim.isPending ? 'Đang nhận hàng…' : 'Nhận hàng ưu tiên'}
          </button>
          {claim.isError && <p className="rd-note" role="alert">{errorMessage(claim.error)}</p>}
        </div>
      )}

      {balanceDue && item.payment && (
        <div>
          <div style={{ fontSize: '13px' }}>
            Đơn <b>{item.orderNo}</b> · còn phải trả <b>{formatVnd(item.payment.amount)}</b> (đã trừ cọc {formatVnd(item.depositAmount)})
          </div>
          <OfftakePaymentSection payment={item.payment} />
        </div>
      )}

      {item.depositStatus === 'Forfeited' && (
        <p className="rd-muted" style={{ margin: 0 }}>Hết cửa sổ chưa thanh toán. Cọc được cộng vào doanh thu của lô, phần hàng chưa nhận mở bán trên gian hàng.</p>
      )}
      {item.depositStatus === 'Refunded' && (
        <p className="rd-muted" style={{ margin: 0 }}>Cọc được hoàn 100% vì lô huỷ hoặc không đủ hàng để giao.</p>
      )}
    </div>
  )
}

export default function InvestorOfftake() {
  const { data: offtakes, isPending: offtakesLoading, isError: offtakesError, error: offtakeLoadErr } = useMyOfftakes()
  const { data: contributions, isPending: contribsLoading } = useMyContributions()

  const [selectedContributionId, setSelectedContributionId] = useState<number | ''>('')
  const [gradeCode, setGradeCode] = useState('')
  const [qtyKg, setQtyKg] = useState<number | ''>('')
  const [createdCommitment, setCreatedCommitment] = useState<OfftakeCommitment | null>(null)

  const confirmedContributions = contributions?.filter((c) => c.status === 'Confirmed') ?? []
  const selectedContrib = confirmedContributions.find((c) => c.contributionId === selectedContributionId)
  const batchCode = selectedContrib?.batchCode ?? ''

  const { data: cap, isPending: capLoading } = useOfftakeCap(batchCode)
  const createOfftake = useCreateOfftake(batchCode)
  const publishedPrices = cap?.prices ?? []
  const unitPrice = publishedPrices.find((p) => p.gradeCode === gradeCode)?.unitPrice ?? 0

  useEffect(() => {
    if (!publishedPrices.length) {
      setGradeCode('')
      return
    }
    if (!publishedPrices.some((p) => p.gradeCode === gradeCode))
      setGradeCode(publishedPrices[0].gradeCode)
  }, [batchCode, publishedPrices, gradeCode])

  const qty = typeof qtyKg === 'number' ? qtyKg : 0
  const depositPct = cap?.depositPct ?? 15
  const estimatedValue = Math.round(qty * unitPrice)
  const estimatedDeposit = Math.round((estimatedValue * depositPct) / 100)

  const canSubmit =
    typeof selectedContributionId === 'number' &&
    selectedContributionId > 0 &&
    !!gradeCode &&
    unitPrice > 0 &&
    qty > 0 &&
    !createOfftake.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    createOfftake.mutate(
      {
        contributionId: selectedContributionId,
        gradeCode,
        qtyKg: qty,
      },
      {
        onSuccess: (data) => {
          setCreatedCommitment(data)
        },
      },
    )
  }

  const getErrorMessage = () => {
    if (!createOfftake.error) return ''
    const err = createOfftake.error as any
    const problem = err?.response?.data
    let msg = errorMessage(createOfftake.error)
    if (problem?.code === 'offtake.cap_exceeded' && problem?.details?.remainingKg != null) {
      msg = `${msg} (Còn ${problem.details.remainingKg} kg, yêu cầu ${problem.details.requestedKg} kg)`
    }
    return msg
  }

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {/* Khối A: Danh sách cam kết */}
      <section className="iv-card">
        <h2 className="rd-h3">Cam kết của tôi</h2>
        {offtakesLoading ? (
          <p className="rd-muted">Đang tải danh sách cam kết…</p>
        ) : offtakesError ? (
          <p className="rd-note" role="alert">{errorMessage(offtakeLoadErr)}</p>
        ) : !offtakes || offtakes.length === 0 ? (
          <p className="rd-muted">Bạn chưa có cam kết bao tiêu nào.</p>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {offtakes.map((o) => (
              <OfftakeItem key={o.offtakeId} item={o} />
            ))}
          </div>
        )}
      </section>

      {/* Khối B: Form đăng ký */}
      <section className="iv-card">
        <h2 className="rd-h3">Đăng ký cam kết bao tiêu</h2>
        <p className="rd-note">
          Cọc bao tiêu là khoản chuyển khoản riêng (mã BT), không trừ vào vốn đã góp.
        </p>

        {createdCommitment && createdCommitment.payment ? (
          <div style={{ display: 'grid', gap: '16px', padding: '16px', background: 'rgba(255, 91, 36, 0.05)', borderRadius: '16px' }}>
            <h3 className="rd-h3" style={{ color: '#166534' }}>
              ✓ Đăng ký cam kết thành công (#{createdCommitment.offtakeId})
            </h3>
            <p>
              Vui lòng chuyển khoản tiền cọc <b>{formatVnd(createdCommitment.depositAmount)}</b> để kích hoạt trạng thái cọc (Held).
            </p>
            <OfftakePaymentSection payment={createdCommitment.payment} />
            <div>
              <button
                type="button"
                className="rd-btn rd-btn--ghost"
                onClick={() => {
                  setCreatedCommitment(null)
                  setSelectedContributionId('')
                  setQtyKg('')
                }}
              >
                Đăng ký cam kết khác
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px', maxWidth: '640px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
                Khoản góp vốn đã xác nhận
              </label>
              {contribsLoading ? (
                <p className="rd-muted">Đang tải khoản góp…</p>
              ) : confirmedContributions.length === 0 ? (
                <p className="rd-muted">
                  Bạn chưa có khoản góp Confirmed nào trên lô đang mở gọi vốn để đăng ký bao tiêu.
                </p>
              ) : (
                <select
                  value={selectedContributionId}
                  onChange={(e) => {
                    const val = e.target.value
                    setSelectedContributionId(val ? Number(val) : '')
                  }}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                  }}
                >
                  <option value="">-- Chọn khoản góp vốn --</option>
                  {confirmedContributions.map((c) => (
                    <option key={c.contributionId} value={c.contributionId}>
                      {c.batchCode} · góp {formatVnd(c.amount)} · #{c.contributionId}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {batchCode && (
              <div style={{ padding: '12px 14px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--line)' }}>
                {capLoading ? (
                  <p className="rd-muted">Đang tải thông tin trần bao tiêu của lô…</p>
                ) : cap ? (
                  <div style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                    <div>
                      Lô: <b>{cap.batchCode}</b> · Trần cam kết: <b>{cap.capKg} kg</b> ({cap.capPct}%)
                    </div>
                    <div>
                      Đã cam kết: {cap.offtakeKg} kg bao tiêu + {cap.preorderKg} kg đặt trước
                    </div>
                    <div style={{ color: cap.remainingKg > 0 ? '#166534' : '#b91c1c', fontWeight: 600 }}>
                      Còn nhận: {cap.remainingKg} kg · Tỷ lệ cọc lô: {cap.depositPct}%
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
                Hạng cua cam kết
              </label>
              {!batchCode ? (
                <p className="rd-muted">Chọn khoản góp trước.</p>
              ) : publishedPrices.length === 0 && !capLoading ? (
                <p className="rd-note" role="alert">Lô này chưa công bố giá bao tiêu theo hạng.</p>
              ) : (
                <select
                  value={gradeCode}
                  onChange={(e) => setGradeCode(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                  }}
                >
                  {publishedPrices.map((g) => (
                    <option key={g.gradeCode} value={g.gradeCode}>
                      {g.gradeName} — {formatVnd(g.unitPrice)}/kg
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
                  Khối lượng (kg)
                </label>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  max="100000"
                  value={qtyKg}
                  onChange={(e) => {
                    const v = e.target.value
                    setQtyKg(v ? parseFloat(v) : '')
                  }}
                  placeholder="Ví dụ: 10"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
                  Giá chốt (đồng/kg)
                </label>
                <input
                  type="text"
                  readOnly
                  value={unitPrice > 0 ? formatVnd(unitPrice) : '—'}
                  aria-label="Giá chốt bao tiêu theo hạng đã công bố"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1px solid var(--line)',
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontWeight: 600,
                  }}
                />
                <small className="rd-muted">Lấy từ bảng giá công bố của lô — không nhập tay.</small>
              </div>
            </div>

            {qty > 0 && unitPrice > 0 && (
              <div style={{ padding: '12px 14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                <div>Giá trị cam kết: <b>{formatVnd(estimatedValue)}</b></div>
                <div>
                  Cọc cần chuyển ({depositPct}%): <b style={{ color: 'var(--accent, #ea580c)' }}>{formatVnd(estimatedDeposit)}</b>
                </div>
                <small className="rd-muted">Ước tính; server chốt bằng AwayFromZero. Đổi hạng sẽ đổi giá và cọc.</small>
              </div>
            )}

            {createOfftake.isError && (
              <p className="rd-note" style={{ color: '#b91c1c' }} role="alert">
                {getErrorMessage()}
              </p>
            )}

            <div>
              <button
                type="submit"
                className="rd-btn"
                disabled={!canSubmit}
                style={{ padding: '12px 24px', fontWeight: 600 }}
              >
                {createOfftake.isPending ? 'Đang xử lý…' : 'Đăng ký · tạo mã cọc'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
