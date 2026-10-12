import { useRef, useState, type FormEvent } from 'react'
import { Landmark, ShieldCheck } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { usePayoutProfile, useSavePayout, type PayoutOwner, type PayoutProfile } from './paymentProfilesApi'
import './paymentProfiles.css'

function PayoutEditor({ profile, owner }: { profile: PayoutProfile; owner: PayoutOwner }) {
  const save = useSavePayout(owner)
  const busy = useRef(false)
  const [error, setError] = useState('')
  const account = profile.account
  const locked = account?.status === 'Locked' && account.nameMatchStatus === 'Matched'
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || locked) return
    const form = new FormData(event.currentTarget)
    const input = { bankCode: String(form.get('bankCode')).trim().toUpperCase(), accountNo: String(form.get('accountNo')).trim(), accountHolderName: String(form.get('accountHolderName')).trim() }
    if (Object.values(input).some(v => !v)) { setError('Vui lòng điền đầy đủ thông tin.'); return }
    busy.current = true
    setError('')
    try { await save.mutateAsync(input) } catch (failure) { setError(errorMessage(failure)) }
    finally { busy.current = false; save.reset() }
  }
  return <div className="account-stack">
    <div className={`account-notice ${account?.status === 'Active' ? 'is-good' : ''}`} role="status">
      <ShieldCheck size={22} aria-hidden="true" /><div><strong>{!account ? 'Chưa có tài khoản nhận tiền' : account.nameMatchStatus === 'Mismatched' ? 'Tên chủ tài khoản chưa khớp' : account.status === 'Active' ? 'Tài khoản sẵn sàng nhận tiền' : 'Tài khoản nhận tiền đã bị khoá'}</strong>
        <p>{account?.nameMatchStatus === 'Mismatched' ? 'Tài khoản đang bị khoá. Kiểm tra lại tên chủ tài khoản để xác minh lại.' : locked ? 'Vui lòng liên hệ quản trị để được hỗ trợ.' : 'Mỗi chủ sở hữu dùng một tài khoản nhận tiền đang hoạt động.'}</p></div>
    </div>
    <p className="rd-note">Tên cần khớp với {owner === 'Investor' ? 'hồ sơ nhà đầu tư' : 'tên pháp lý của hộ nuôi'}: <strong>{profile.expectedHolderName}</strong>.</p>
    <form className="rd-form account-form" onSubmit={submit} aria-busy={save.isPending}>
      <fieldset disabled={save.isPending || locked}>
        <label>Mã ngân hàng<input name="bankCode" autoCapitalize="characters" placeholder="Ví dụ: VCB" required maxLength={20} pattern="(?:[A-Za-z0-9_]|-)+" defaultValue={account?.bankCode ?? ''} /></label>
        <label>Số tài khoản<input name="accountNo" inputMode="numeric" autoComplete="off" required maxLength={30} pattern="[0-9]{4,30}" defaultValue={account?.accountNo ?? ''} /></label>
        <label className="account-wide">Tên chủ tài khoản<input name="accountHolderName" autoComplete="off" required maxLength={150} defaultValue={account?.accountHolderName ?? profile.expectedHolderName} /></label>
      </fieldset>
      <p className="rd-note">Nhập tên như trên tài khoản ngân hàng. Khi thay đổi ngân hàng hoặc số tài khoản, tài khoản cũ sẽ ngừng nhận tiền.</p>
      {error && <p className="account-error" role="alert">{error}</p>}
      <button className="rd-btn rd-btn--primary" type="submit" disabled={save.isPending || locked}><Landmark size={17} />{save.isPending ? 'Đang đối chiếu…' : account ? 'Lưu và đối chiếu lại' : 'Lưu tài khoản nhận tiền'}</button>
    </form>
  </div>
}

export default function PayoutAccountForm({ owner }: { owner: PayoutOwner }) {
  const userId = useAuthStore(s => s.user?.userId)
  const query = usePayoutProfile(owner)
  if (query.isPending) return <p role="status">Đang tải tài khoản nhận tiền…</p>
  if (query.isError) return <div className="account-stack"><p className="account-error" role="alert">{errorMessage(query.error)}</p><button className="rd-btn rd-btn--ghost" type="button" onClick={() => void query.refetch()}>Thử lại</button></div>
  return <PayoutEditor key={`${userId}-${owner}-${query.data.account?.updatedAt ?? 'new'}`} profile={query.data} owner={owner} />
}
