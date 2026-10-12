import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Camera, ShieldCheck } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { useKycStatus, useVerifyKyc } from './kycApi'
import './kyc.css'

const labels = ['CCCD mặt trước', 'CCCD mặt sau', 'Ảnh khuôn mặt']
const statusLabel = { Unverified: 'Chưa xác minh danh tính', Verified: 'Đã xác minh danh tính', Rejected: 'Xác minh không đạt — hãy thử lại' }

function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const preview = URL.createObjectURL(file)
    setUrl(preview)
    return () => URL.revokeObjectURL(preview)
  }, [file])
  return <img className="kyc-preview" src={url || undefined} alt="Ảnh vừa chọn để xác minh" />
}

export function KycStatusCard() {
  const status = useKycStatus()
  return (
    <section className="iv-card i2-wide kyc-banner" aria-live="polite">
      <ShieldCheck size={24} aria-hidden="true" />
      <div>
        <strong>{status.isPending ? 'Đang kiểm tra danh tính…' : status.isError ? 'Chưa đọc được trạng thái xác minh' : statusLabel[status.data.verificationStatus]}</strong>
        <p>{status.isError ? errorMessage(status.error) : 'CrabShare chỉ lưu kết quả xác minh danh tính.'}</p>
      </div>
      <Link className="rd-btn rd-btn--ghost" to="/nha-dau-tu/ho-so">{status.data?.verificationStatus === 'Verified' ? 'Xem hồ sơ' : 'Xác minh ngay'}</Link>
    </section>
  )
}

function InvestorKycForm() {
  const status = useKycStatus()
  const verify = useVerifyKyc()
  const [images, setImages] = useState<(File | null)[]>([null, null, null])
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inputVersion, setInputVersion] = useState(0)

  function chooseImage(index: number, file: File | undefined) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      setError('Mỗi ảnh cần có định dạng JPEG, PNG hoặc WebP và dung lượng không quá 5 MB.')
      return
    }
    setError(null)
    setImages((current) => current.map((image, i) => i === index ? file : image))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!consent || images.some((image) => !image) || verify.isPending) return
    setError(null)
    try {
      await verify.mutateAsync({ images: images as [File, File, File], consent })
      setImages([null, null, null])
      setInputVersion((version) => version + 1)
    } catch (failure) {
      setError(errorMessage(failure))
      await status.refetch()
    } finally {
      verify.reset()
    }
  }

  if (status.isPending) return <p role="status">Đang đọc trạng thái xác minh…</p>
  if (status.isError) return <div role="alert" className="kyc-error"><p>{errorMessage(status.error)}</p><button className="rd-btn rd-btn--ghost" type="button" onClick={() => void status.refetch()}>Thử lại</button></div>
  const data = status.data
  return (
    <div className="kyc-verification">
      <div className={`kyc-result ${data.verificationStatus === 'Verified' ? 'is-verified' : ''}`} role="status">
        <ShieldCheck size={22} aria-hidden="true" />
        <div><strong>{statusLabel[data.verificationStatus]}</strong>
          {data.lastCheck?.failureReason && <p>{data.lastCheck.failureReason}</p>}
          {data.verifiedAt && <p>Xác minh lúc {new Date(data.verifiedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
        </div>
      </div>
      <p className="rd-note">Ảnh được gửi cho nhà cung cấp eKYC. CrabShare chỉ lưu kết quả xác minh, không lưu ảnh CCCD hoặc selfie.</p>
      {data.verificationStatus !== 'Verified' && (
        <form onSubmit={submit} className="kyc-form">
          <div className="kyc-images">
            {labels.map((label, index) => <label className="kyc-image" key={`${index}-${inputVersion}`}>
              <strong>{index + 1}. {label}</strong>
              {images[index] ? <ImagePreview file={images[index]!} /> : <div className="kyc-placeholder"><Camera size={28} aria-hidden="true" /><span>Chụp hoặc chọn ảnh rõ nét</span></div>}
              <input type="file" aria-label={label} accept="image/jpeg,image/png,image/webp" capture={index === 2 ? 'user' : 'environment'}
                disabled={verify.isPending} onChange={(event) => chooseImage(index, event.target.files?.[0])} />
            </label>)}
          </div>
          <p className="rd-note">Chụp rõ bốn góc CCCD; selfie nhìn thẳng, không che khuôn mặt. Mỗi ảnh tối đa 5 MB.</p>
          <label className="kyc-consent"><input type="checkbox" checked={consent} disabled={verify.isPending} onChange={(event) => setConsent(event.target.checked)} />
            <span>Tôi đồng ý cho nhà cung cấp eKYC xử lý ảnh CCCD và khuôn mặt để xác minh danh tính.</span>
          </label>
          <button className="rd-btn rd-btn--primary" type="submit" disabled={!consent || images.some((image) => !image) || verify.isPending}>
            {verify.isPending ? 'Đang xác minh…' : 'Gửi xác minh'}
          </button>
        </form>
      )}
      {error && <p role="alert" className="kyc-error">{error}</p>}
    </div>
  )
}

export default function KycVerification() {
  const user = useAuthStore((s) => s.user)
  return user?.roles.includes('Investor') ? <InvestorKycForm key={user.userId} />
    : <p className="rd-note">Xác minh danh tính eKYC dành cho tài khoản nhà đầu tư. Hồ sơ pháp lý của hộ nuôi được duyệt riêng.</p>
}
