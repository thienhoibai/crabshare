import { useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { ActionDialog } from '../../shared/ui/ActionDialog'
import { Logo, Shell } from '../../shared/ui/kit/kit'
import { useAddresses, useChangeAddress, type AddressInput, type DeliveryAddress } from './paymentProfilesApi'
import './paymentProfiles.css'

const fields = [
  { name: 'recipientName', label: 'Tên người nhận', max: 150, autoComplete: 'name' },
  { name: 'recipientPhone', label: 'Số điện thoại', max: 15, autoComplete: 'tel' },
  { name: 'addressLine', label: 'Địa chỉ chi tiết', max: 300, autoComplete: 'street-address' },
  { name: 'province', label: 'Tỉnh / thành phố', max: 100, autoComplete: 'address-level1' },
] as const

function AddressBook() {
  const query = useAddresses()
  const change = useChangeAddress()
  const busy = useRef(false)
  const [editor, setEditor] = useState<{ action: 'save' | 'delete'; address?: DeliveryAddress } | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  function open(action: 'save' | 'delete', address?: DeliveryAddress) { setError(''); setMessage(''); setEditor({ action, address }) }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || !editor) return
    const form = new FormData(event.currentTarget)
    const input = { ...Object.fromEntries(fields.map(f => [f.name, String(form.get(f.name) ?? '').trim()])), isDefault: form.get('isDefault') === 'on' } as AddressInput
    if (editor.action === 'save' && fields.some(f => !input[f.name])) { setError('Vui lòng điền đầy đủ thông tin.'); return }
    busy.current = true
    setError('')
    try {
      await change.mutateAsync({ action: editor.action, addressId: editor.address?.addressId, input })
      setMessage(editor.action === 'delete' ? 'Đã xoá địa chỉ.' : 'Đã lưu địa chỉ giao hàng.')
      setEditor(null)
    } catch (failure) { setError(errorMessage(failure)) }
    finally { busy.current = false; change.reset() }
  }
  return <>
    <div className="account-title"><div><p className="rd-eyebrow">Tài khoản khách hàng</p><h1 className="rd-h2">Sổ địa chỉ giao hàng</h1><p className="rd-muted">Lưu người nhận và địa chỉ để dùng khi đặt hàng.</p></div>
      <button className="rd-btn rd-btn--primary" type="button" disabled={!query.isSuccess} onClick={() => open('save')}><Plus size={18} />Thêm địa chỉ</button></div>
    {message && <p role="status" className="account-notice is-good">{message}</p>}
    {query.isPending ? <p role="status">Đang tải địa chỉ…</p> : query.isError ? <section className="account-card account-stack"><p className="account-error" role="alert">{errorMessage(query.error)}</p><button className="rd-btn rd-btn--ghost" onClick={() => void query.refetch()}>Thử lại</button></section>
      : query.data.length === 0 ? <section className="account-card account-empty"><MapPin size={32} /><h2 className="rd-h3">Chưa có địa chỉ giao hàng</h2><p className="rd-muted">Thêm địa chỉ đầu tiên; đây sẽ là địa chỉ mặc định của bạn.</p><button className="rd-btn rd-btn--ghost" type="button" onClick={() => open('save')}>Thêm địa chỉ đầu tiên</button></section>
      : <div className="address-grid">{query.data.map(address => <article key={address.addressId} className="account-card address-card">
        <div className="account-title"><MapPin size={22} />{address.isDefault && <span className="rd-chip">Mặc định</span>}</div>
        <h2 className="rd-h3">{address.recipientName}</h2><p className="rd-muted">{address.recipientPhone}</p><p>{address.addressLine}<br />{address.province}</p>
        <div className="account-actions"><button className="rd-btn rd-btn--ghost rd-btn--sm" type="button" onClick={() => open('save', address)}><Pencil size={15} />Sửa</button><button className="rd-btn rd-btn--ghost rd-btn--sm account-delete" type="button" onClick={() => open('delete', address)}><Trash2 size={15} />Xoá</button></div>
      </article>)}</div>}
    {editor && <ActionDialog title={editor.action === 'delete' ? 'Xoá địa chỉ giao hàng?' : editor.address ? 'Sửa địa chỉ giao hàng' : 'Thêm địa chỉ giao hàng'} theme="operator" busy={change.isPending} onClose={() => setEditor(null)}>
      <form className="rd-form account-form" onSubmit={submit} aria-busy={change.isPending}>
        {editor.action === 'delete' ? <p>Địa chỉ <strong>{editor.address?.addressLine}</strong> sẽ được xoá khỏi sổ địa chỉ. Nếu đây là mặc định, địa chỉ còn lại sẽ được chọn thay thế.</p> : <>
          <fieldset disabled={change.isPending}>{fields.map(field => <label key={field.name} className={field.name === 'addressLine' ? 'account-wide' : ''}>{field.label}<input name={field.name} required maxLength={field.max} autoComplete={field.autoComplete} type={field.name === 'recipientPhone' ? 'tel' : 'text'} pattern={field.name === 'recipientPhone' ? '(0[0-9]{9}|[+]84[0-9]{9})' : undefined} defaultValue={editor.address?.[field.name] ?? ''} /></label>)}</fieldset>
          <label className="account-checkbox"><input type="checkbox" name="isDefault" disabled={change.isPending || editor.address?.isDefault} defaultChecked={editor.address?.isDefault ?? query.data?.length === 0} />Đặt làm địa chỉ mặc định</label>
        </>}
        {error && <p className="account-error" role="alert">{error}</p>}
        <div className="account-actions"><button className="rd-btn rd-btn--ghost" type="button" disabled={change.isPending} onClick={() => setEditor(null)}>Huỷ</button><button className="rd-btn rd-btn--primary" type="submit" disabled={change.isPending}>{change.isPending ? 'Đang lưu…' : editor.action === 'delete' ? 'Xác nhận xoá' : 'Lưu địa chỉ'}</button></div>
      </form>
    </ActionDialog>}
  </>
}

export default function CustomerAddresses() {
  const userId = useAuthStore(s => s.user?.userId)
  return <Shell theme="light"><div className="account-customer"><header className="account-title"><Logo /><Link className="rd-btn rd-btn--ghost" to="/cua-hang"><ArrowLeft size={17} />Về cửa hàng</Link></header><main className="account-stack"><AddressBook key={userId} /></main></div></Shell>
}
