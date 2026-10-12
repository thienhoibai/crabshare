/* Khung chuyển khoản VietQR dùng chung: góp vốn (TH-05), đơn hàng (NH-06), cọc bao tiêu.
   TL-10 §6.1: cạnh mã QR chỉ có số tiền, nội dung chuyển khoản và hạn; số tài khoản nằm sau một bước "chuyển khoản
   thủ công" kèm cảnh báo, vì chuyển tay sai nội dung thì tiền không tự khớp được. Hết hạn thì ẩn mã để không ai quét mã cũ. */
import { useEffect, useId, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Ban, Check, Clock, Copy, ScanLine, TriangleAlert } from 'lucide-react'
import { formatDateTime, formatVnd } from '../lib/format'
import { useCountdown } from '../ui/kit/kit'
import type { PaymentStatus } from './paymentsApi'
import './vietqr.css'

/** Vừa với cả PaymentRequest (API thanh toán) lẫn OrderPayment của trang xác nhận đơn hàng. */
export interface VietQrInfo {
  referenceCode: string
  amount: number
  qrContent: string | null
  expiresAt: string
  accountNo: string
  providerName?: string
  batchCode?: string
}

/**
 * @param status trạng thái mới nhất của yêu cầu (hỏi lại bằng usePaymentRequest); mặc định Pending.
 * @param onExpire gọi một lần khi hết hạn — đồng hồ về 0 hoặc máy chủ báo Expired trước (đồng hồ máy lệch) —
 *   để trang tải lại giữ chỗ.
 */
export function VietQrBox({ payment, status = 'Pending', onExpire }: { payment: VietQrInfo; status?: PaymentStatus; onExpire?: () => void }) {
  const until = Date.parse(payment.expiresAt)
  const cd = useCountdown(status === 'Pending' ? until : null)
  const timedOut = status === 'Pending' && cd.left <= 0
  const ended = timedOut || status === 'Expired'
  const notified = useRef(false)

  useEffect(() => {
    if (ended && !notified.current) {
      notified.current = true
      onExpire?.()
    }
  }, [ended, onExpire])

  if (status === 'Paid') {
    return (
      <div className="vq vq--state vq--done" role="status">
        <span className="vq-state__icon"><Check size={26} /></span>
        <b>Đã nhận {formatVnd(payment.amount)}</b>
        <small>Mã đối chiếu {payment.referenceCode}</small>
      </div>
    )
  }
  if (status === 'Cancelled') {
    return (
      <div className="vq vq--state vq--off" role="status">
        <span className="vq-state__icon"><Ban size={24} /></span>
        <b>Mã chuyển khoản đã huỷ</b>
        <p>Đừng chuyển tiền theo mã {payment.referenceCode} nữa.</p>
      </div>
    )
  }
  if (status === 'Expired' || timedOut || !payment.qrContent) {
    return (
      <div className="vq vq--state vq--off" role="status">
        <span className="vq-state__icon"><Clock size={24} /></span>
        <b>Mã QR đã hết hạn lúc {formatDateTime(payment.expiresAt)}</b>
        <p>Đừng chuyển khoản theo mã này nữa. Nếu lỡ chuyển sau khi hết hạn, khoản tiền sẽ được hoàn về tài khoản đã chuyển.</p>
      </div>
    )
  }

  // Nội dung QR của FakePaymentGateway: không phải mã ngân hàng thật
  const sandbox = payment.qrContent.startsWith('VIETQR|SANDBOX|')
  return (
    <div className="vq">
      <div className="vq-code">
        <QRCodeSVG value={payment.qrContent} size={208} level="M" marginSize={2} className="vq-code__svg"
          title={`Mã VietQR chuyển ${formatVnd(payment.amount)}, nội dung ${payment.referenceCode}`} />
        {sandbox && <small className="vq-code__tag">Thử nghiệm</small>}
      </div>
      <div className="vq-info">
        <p className="vq-info__label">Số tiền</p>
        <p className="vq-info__amount">{formatVnd(payment.amount)}</p>
        <p className="vq-info__label">Nội dung chuyển khoản</p>
        <p className="vq-info__ref">{payment.referenceCode}</p>
        <p className="vq-timer" role="timer" aria-live="off"><Clock size={14} /> Mã hết hạn sau <b>{cd.text}</b></p>
        <p className="rd-note"><ScanLine size={14} /> Mở app ngân hàng và quét mã: số tiền, nội dung đã điền sẵn, bạn chỉ cần xác nhận.</p>
        {sandbox && <p className="rd-note"><TriangleAlert size={14} /> Môi trường thử nghiệm: mã này không dùng để chuyển tiền thật.</p>}
      </div>
      <ManualTransfer payment={payment} />
    </div>
  )
}

function ManualTransfer({ payment }: { payment: VietQrInfo }) {
  const [open, setOpen] = useState(false)
  const panel = useId()
  return (
    <div className="vq-manual">
      <button type="button" className="vq-manual__toggle" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
        Không quét được mã? Chuyển khoản thủ công
      </button>
      <div id={panel} className="vq-manual__body" hidden={!open}>
        <p className="vq-warn"><TriangleAlert size={16} />
          <span>Chuyển tay phải ghi <b>đúng</b> nội dung <b>{payment.referenceCode}</b> và đúng số tiền. Sai nội dung thì khoản tiền không tự khớp được, phải chờ đối soát thủ công.</span>
        </p>
        <dl className="vq-manual__list">
          {payment.providerName && <><dt>Đơn vị giữ tài khoản</dt><dd>{payment.providerName}</dd></>}
          {payment.batchCode && <><dt>Tài khoản của</dt><dd>Lô {payment.batchCode}</dd></>}
          <dt>Số tài khoản</dt><dd><CopyText value={payment.accountNo} label="số tài khoản" /></dd>
          <dt>Số tiền</dt><dd><CopyText value={String(payment.amount)} display={formatVnd(payment.amount)} label="số tiền" /></dd>
          <dt>Nội dung</dt><dd><CopyText value={payment.referenceCode} label="nội dung chuyển khoản" /></dd>
        </dl>
      </div>
    </div>
  )
}

function CopyText({ value, display = value, label }: { value: string; display?: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <span className="vq-copy">
      <b>{display}</b>
      <button type="button" className="rd-iconbtn" onClick={copy} aria-label={`Sao chép ${label}`}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </span>
  )
}
