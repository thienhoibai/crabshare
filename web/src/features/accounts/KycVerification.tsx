/* UC02 — Xác minh danh tính eKYC của nhà đầu tư: GET /api/me/kyc, POST /api/kyc/ekyc (multipart IdCardFront, IdCardBack, Selfie, Consent).
   Ảnh chỉ chuyển cho nhà cung cấp eKYC, hệ thống chỉ lưu kết quả. Hai thành phần ở đây không có khung bao: đặt trong OpPanel của trang gọi. */
import { useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { KycStatusResponse } from '../../shared/api/api.gen'
import { useAuthStore } from '../../shared/auth/authStore'
import {
  Checkbox, Field, OpBtn, OpKv, OpMore, OpNote, OpPhoto, QueryView, StatusBadge, formatDateTime, label, useGet, useSend,
} from '../../shared/ui/console'

type EkycForm = { IdCardFront: File; IdCardBack: File; Selfie: File; Consent: boolean }

const PHOTOS = [
  { key: 'front', label: 'CCCD mặt trước', hint: 'Chụp rõ bốn góc, không loá' },
  { key: 'back', label: 'CCCD mặt sau', hint: 'Chụp rõ bốn góc, không loá' },
  { key: 'selfie', label: 'Ảnh khuôn mặt', hint: 'Nhìn thẳng, không che mặt' },
] as const
type PhotoKey = (typeof PHOTOS)[number]['key']

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

const useKyc = () => {
  const isInvestor = useAuthStore((s) => !!s.user?.roles.includes('Investor'))
  return useGet<KycStatusResponse>(isInvestor ? '/api/me/kyc' : null)
}

/** Dòng nhắc xác minh danh tính. Chỉ hiện khi nhà đầu tư chưa xác minh; đã xác minh thì không hiện gì. */
export function KycStatusCard() {
  const kyc = useKyc()
  if (!kyc.data || kyc.data.verificationStatus === 'Verified') return null
  return (
    <OpNote tone="danger">
      <b>{kyc.data.verificationStatus === 'Rejected' ? 'Xác minh danh tính chưa đạt' : 'Chưa xác minh danh tính'}</b>.{' '}
      <a className="op-link" href="/nha-dau-tu/ho-so?tab=xac-minh">Xác minh ngay</a>
    </OpNote>
  )
}

function InvestorKyc() {
  const kyc = useKyc()
  const [files, setFiles] = useState<Record<PhotoKey, File | null>>({ front: null, back: null, selfie: null })
  const [consent, setConsent] = useState(false)
  const [problem, setProblem] = useState('')
  const verify = useSend<KycStatusResponse, EkycForm>('post', '/api/kyc/ekyc', {
    form: true,
    success: (res) => (res.verificationStatus === 'Verified' ? 'Đã xác minh danh tính.' : 'Xác minh chưa đạt. Gửi lại ảnh rõ hơn.'),
    onSuccess: () => setFiles({ front: null, back: null, selfie: null }),
  })

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
        return (
          <div className="op-stack">
            <div className="op-inline">
              <ShieldCheck size={20} />
              <StatusBadge kind="verification" value={data.verificationStatus} />
              {data.verifiedAt && <span className="rd-muted">Xác minh lúc {formatDateTime(data.verifiedAt)}</span>}
            </div>

            {!verified && last?.failureReason && <OpNote tone="danger">{last.failureReason}</OpNote>}

            {!verified && (
              <form className="op-form" onSubmit={submit}>
                <div className="op-form__row">
                  {PHOTOS.map((p) => (
                    <Field key={p.key} label={p.label} required>
                      <OpPhoto value={files[p.key]} onChange={(file) => pick(p.key, file)} label={p.label} hint={p.hint} capture={p.key === 'selfie' ? 'user' : 'environment'} />
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
