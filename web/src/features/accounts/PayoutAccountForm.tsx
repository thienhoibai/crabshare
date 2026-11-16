/* UC03 — Tài khoản nhận tiền của nhà đầu tư hoặc của hộ nuôi: GET / PUT /api/me/payout-account?ownerType=.
   Tên chủ tài khoản được đối chiếu với tên trên hồ sơ. Không có khung bao: đặt trong OpPanel của trang gọi. */
import { useState, type FormEvent } from 'react'
import { Landmark } from 'lucide-react'
import type { PayoutProfileResponse } from '../../shared/api/api.gen'
import { useAuthStore } from '../../shared/auth/authStore'
import { Field, Input, OpBadge, OpBtn, OpNote, QueryView, type Tone } from '../../shared/ui/console'
import { usePayoutProfile, useSavePayout, type PayoutOwner } from './paymentProfilesApi'

const MATCH: Record<string, [string, Tone]> = {
  Pending: ['Chờ đối chiếu tên', 'warn'],
  Matched: ['Tên khớp hồ sơ', 'ok'],
  Mismatched: ['Tên chưa khớp hồ sơ', 'danger'],
}
const ACCOUNT: Record<string, [string, Tone]> = {
  Active: ['Đang nhận tiền', 'ok'],
  Locked: ['Đang khoá', 'danger'],
  Closed: ['Đã đóng', 'mute'],
}

function Editor({ profile, owner }: { profile: PayoutProfileResponse; owner: PayoutOwner }) {
  const account = profile.account
  const save = useSavePayout(owner)
  const [bankCode, setBankCode] = useState(account?.bankCode ?? '')
  const [accountNo, setAccountNo] = useState(account?.accountNo ?? '')
  const [holder, setHolder] = useState(account?.accountHolderName ?? profile.expectedHolderName)
  // Tài khoản khớp tên mà bị khoá là do Admin khoá: không tự mở lại bằng cách lưu.
  const adminLocked = account?.status === 'Locked' && account.nameMatchStatus === 'Matched'
  const valid = /^[A-Za-z0-9_-]{1,20}$/.test(bankCode.trim()) && /^[0-9]{4,30}$/.test(accountNo.trim()) && holder.trim().length > 0

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!valid || adminLocked || save.isPending) return
    save.mutate({ bankCode: bankCode.trim().toUpperCase(), accountNo: accountNo.trim(), accountHolderName: holder.trim() })
  }

  return (
    <div className="op-stack">
      {account && (
        <div className="op-inline">
          <OpBadge tone={ACCOUNT[account.status]?.[1] ?? 'mute'}>{ACCOUNT[account.status]?.[0] ?? account.status}</OpBadge>
          <OpBadge tone={MATCH[account.nameMatchStatus]?.[1] ?? 'mute'}>{MATCH[account.nameMatchStatus]?.[0] ?? account.nameMatchStatus}</OpBadge>
        </div>
      )}
      {/* Chỉ một ghi chú, khi tài khoản đang không nhận được tiền. */}
      {adminLocked
        ? <OpNote tone="danger">Tài khoản đang bị Admin khoá. Liên hệ Admin để mở lại.</OpNote>
        : account?.nameMatchStatus === 'Mismatched' && <OpNote tone="danger">Tên chưa khớp nên tài khoản đang khoá. Sửa tên rồi lưu lại.</OpNote>}

      <form className="op-form" onSubmit={submit}>
        <div className="op-form__row">
          <Field label="Mã ngân hàng" required hint="Ví dụ: VCB, BIDV, TCB">
            <Input value={bankCode} onChange={(e) => setBankCode(e.target.value)} maxLength={20} autoCapitalize="characters" disabled={adminLocked} />
          </Field>
          <Field label="Số tài khoản" required>
            <Input value={accountNo} onChange={(e) => setAccountNo(e.target.value.replace(/\D/g, ''))} maxLength={30} inputMode="numeric" autoComplete="off" disabled={adminLocked} />
          </Field>
        </div>
        <Field label="Tên chủ tài khoản" required hint={`Phải khớp: ${profile.expectedHolderName}`}>
          <Input value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={150} autoComplete="off" disabled={adminLocked} />
        </Field>
        <div className="op-formfoot">
          <OpBtn type="submit" disabled={!valid || adminLocked || save.isPending}>
            <Landmark size={17} /> {save.isPending ? 'Đang đối chiếu…' : 'Lưu tài khoản'}
          </OpBtn>
        </div>
      </form>
    </div>
  )
}

export default function PayoutAccountForm({ owner }: { owner: PayoutOwner }) {
  const userId = useAuthStore((s) => s.user?.userId)
  const profile = usePayoutProfile(owner)
  return (
    <QueryView query={profile}>
      {(data) => <Editor key={`${userId}-${owner}-${data.account?.updatedAt ?? 'new'}`} profile={data} owner={owner} />}
    </QueryView>
  )
}
