/* UC02 — Xác minh danh tính eKYC của nhà đầu tư: GET /api/me/kyc, POST /api/kyc/ekyc (multipart IdCardFront, IdCardBack, Selfie, Consent).
   Ảnh chỉ chuyển cho nhà cung cấp eKYC, hệ thống chỉ lưu kết quả. Hai thành phần ở đây không có khung bao: đặt trong OpPanel của trang gọi. */
import { useState, type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ShieldCheck } from 'lucide-react'
import type { KycStatusResponse } from '../../shared/api/api.gen'
import { useAuthStore } from '../../shared/auth/authStore'
import {
  Checkbox, Field, OpBtn, OpKv, OpMore, OpNote, OpPhoto, QueryView, StatusBadge, errorMessage,
  formatDateTime, label, useSend,
} from '../../shared/ui/console'
import {
  useCancelKycHandoff, useCreateKycHandoff, useKycHandoffStatus, useKycStatus,
  type KycHandoff,
} from './kycApi'

type EkycForm = { IdCardFront: File; IdCardBack: File; Selfie: File; Consent: boolean }

const PHOTOS = [
  { key: 'front', label: 'CCCD mặt trước', hint: 'Chụp rõ bốn góc, không loá' },
  { key: 'back', label: 'CCCD mặt sau', hint: 'Chụp rõ bốn góc, không loá' },
  { key: 'selfie', label: 'Ảnh khuôn mặt', hint: 'Nhìn thẳng, không che mặt' },
] as const
type PhotoKey = (typeof PHOTOS)[number]['key']

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

/** Dòng nhắc xác minh danh tính. Chỉ hiện khi nhà đầu tư chưa xác minh; đã xác minh thì không hiện gì. */
export function KycStatusCard() {
  const kyc = useKycStatus()
  if (!kyc.data || kyc.data.verificationStatus === 'Verified') return null
  return (
    <OpNote tone="danger">
      <b>{kyc.data.verificationStatus === 'Rejected' ? 'Xác minh danh tính chưa đạt' : 'Chưa xác minh danh tính'}</b>.{' '}
      <a className="op-link" href="/nha-dau-tu/ho-so?tab=xac-minh">Xác minh ngay</a>
    </OpNote>
  )
}

function InvestorKyc() {
  const kyc = useKycStatus()
  const [files, setFiles] = useState<Record<PhotoKey, File | null>>({ front: null, back: null, selfie: null })
  const [consent, setConsent] = useState(false)
  const [problem, setProblem] = useState('')
  const [handoff, setHandoff] = useState<KycHandoff | null>(null)
  const [cancelledLocally, setCancelledLocally] = useState(false)
  const verify = useSend<KycStatusResponse, EkycForm>('post', '/api/kyc/ekyc', {
    form: true,
    success: (res) => (res.verificationStatus === 'Verified' ? 'Đã xác minh danh tính.' : 'Xác minh chưa đạt. Gửi lại ảnh rõ hơn.'),
    onSuccess: () => setFiles({ front: null, back: null, selfie: null }),
  })
  const createHandoff = useCreateKycHandoff((created) => {
    setHandoff(created)
    setCancelledLocally(false)
  })
  const handoffStatus = useKycHandoffStatus(handoff?.id ?? null)
  const cancelHandoff = useCancelKycHandoff(handoff?.id ?? null, () => setCancelledLocally(true))

  const pick = (key: PhotoKey, file: File | null) => {
    if (file && (!ALLOWED.includes(file.type) || file.size === 0 || file.size > MAX_BYTES)) {
      setProblem('Mỗi ảnh phải là JPEG, PNG hoặc WebP và không quá 5 MB.')
      return
    }
    setProblem('')
    setFiles((current) => ({ ...current, [key]: file }))
  }

  const ready = !!files.front && !!files.back && !!files.selfie && consent
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!files.front || !files.back || !files.selfie || !consent || verify.isPending) return
    verify.mutate({ IdCardFront: files.front, IdCardBack: files.back, Selfie: files.selfie, Consent: consent })
  }

  return (
    <QueryView query={kyc}>
      {(data) => {
        const verified = data.verificationStatus === 'Verified'
        const last = data.lastCheck
        const status = cancelledLocally ? 'Cancelled' : handoffStatus.data?.status
        const qrUrl = handoff ? `crabshare://app/i/kyc?ref=${encodeURIComponent(handoff.token)}` : null

        return (
          <div className="op-stack">
            <div className="op-inline">
              <ShieldCheck size={20} />
              <StatusBadge kind="verification" value={data.verificationStatus} />
              {data.verifiedAt && <span className="rd-muted">Xác minh lúc {formatDateTime(data.verifiedAt)}</span>}
            </div>

            {!verified && (
              <section className="op-card" aria-labelledby="kyc-mobile-title">
                <h3 id="kyc-mobile-title">Xác minh trên ứng dụng CrabShare</h3>
                <p>Quét mã bằng điện thoại có cài CrabShare. Hãy đăng nhập đúng tài khoản đang dùng trên web; mã có hiệu lực trong 5 phút.</p>

                {qrUrl && status !== 'Claimed' && status !== 'Expired' && status !== 'Cancelled' && (
                  <div className="op-inline" style={{ alignItems: 'flex-start', gap: 20 }}>
                    <QRCodeSVG value={qrUrl} size={176} marginSize={4} title="Mở màn xác minh trên ứng dụng CrabShare" />
                    <div className="op-stack">
                      <b aria-live="polite">{status === 'Pending' ? 'Đang chờ ứng dụng quét mã' : 'Mã QR đã được tạo'}</b>
                      <span className="rd-muted">Hết hạn lúc {formatDateTime(handoff!.expiresAt)}</span>
                      <a className="op-link" href={qrUrl}>Mở ứng dụng trên điện thoại này</a>
                      <OpBtn variant="ghost" disabled={cancelHandoff.isPending} onClick={() => cancelHandoff.mutate()}>
                        {cancelHandoff.isPending ? 'Đang huỷ…' : 'Huỷ mã QR'}
                      </OpBtn>
                    </div>
                  </div>
                )}

                {status === 'Claimed' && <OpNote tone="info">Ứng dụng đã xác nhận đúng tài khoản. Hoàn tất xác minh trên điện thoại; kết quả sẽ tự cập nhật tại đây.</OpNote>}
                {status === 'Expired' && <OpNote tone="danger">Mã QR đã hết hạn. Hãy tạo mã mới để tiếp tục.</OpNote>}
                {status === 'Cancelled' && <OpNote tone="info">Mã QR đã được huỷ.</OpNote>}
                {cancelHandoff.isError && <OpNote tone="info">{errorMessage(cancelHandoff.error)}</OpNote>}
                {handoffStatus.isError && (
                  <>
                    <OpNote tone="danger">Không kiểm tra được phiên QR: {errorMessage(handoffStatus.error)}</OpNote>
                    <OpBtn variant="ghost" onClick={() => { void handoffStatus.refetch() }}>Thử kiểm tra lại</OpBtn>
                  </>
                )}
                {createHandoff.isError && <OpNote tone="danger">{errorMessage(createHandoff.error)}</OpNote>}

                {(!handoff || status === 'Claimed' || status === 'Expired' || status === 'Cancelled' || createHandoff.isError) && (
                  <OpBtn disabled={createHandoff.isPending} onClick={() => createHandoff.mutate()}>
                    {createHandoff.isPending ? 'Đang tạo mã…' : handoff ? 'Tạo mã QR mới' : 'Tạo mã QR xác minh'}
                  </OpBtn>
                )}
              </section>
            )}

            {!verified && last?.failureReason && <OpNote tone="danger">{last.failureReason}</OpNote>}

            {!verified && (
              <form className="op-form" onSubmit={submit}>
                <div className="op-form__row">
                  {PHOTOS.map((photo) => (
                    <Field key={photo.key} label={photo.label} required>
                      <OpPhoto value={files[photo.key]} onChange={(file) => pick(photo.key, file)} label={photo.label} hint={photo.hint} capture={photo.key === 'selfie' ? 'user' : 'environment'} />
                    </Field>
                  ))}
                </div>
                <Checkbox checked={consent} onChange={setConsent} disabled={verify.isPending}>
                  Tôi đồng ý gửi ảnh cho nhà cung cấp eKYC để xác minh. Hệ thống chỉ lưu kết quả, không lưu ảnh.
                </Checkbox>
                {problem && <OpNote tone="danger">{problem}</OpNote>}
                <div className="op-formfoot">
                  <OpBtn type="submit" disabled={!ready || verify.isPending}>{verify.isPending ? 'Đang xác minh…' : 'Gửi xác minh'}</OpBtn>
                </div>
              </form>
            )}

            {last && (
              <OpMore label="Lần kiểm tra gần nhất">
                <OpKv items={[
                  { label: 'Thời điểm', value: formatDateTime(last.checkedAt) },
                  { label: 'Kết quả', value: label('kyc', last.result) },
                  { label: 'Mã tham chiếu', value: last.providerReference ? <span className="op-mono">{last.providerReference}</span> : null },
                ]} />
              </OpMore>
            )}
          </div>
        )
      }}
    </QueryView>
  )
}

/** Khối xác minh danh tính. Tài khoản không có vai trò nhà đầu tư chỉ thấy một dòng giải thích. */
export default function KycVerification() {
  const user = useAuthStore((s) => s.user)
  return user?.roles.includes('Investor')
    ? <InvestorKyc key={user.userId} />
    : <OpNote tone="info">Xác minh eKYC chỉ dành cho tài khoản nhà đầu tư.</OpNote>
}
