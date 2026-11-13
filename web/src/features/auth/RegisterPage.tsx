import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage } from '../../shared/api/http'
import { homePathFor } from '../../shared/auth/authStore'
import SiteShell from '../../shared/layout/SiteShell'
import { Checkbox, Field, Input, OpBtn, OpNote, RadioCards, Select, options } from '../../shared/ui/console'
import { useRegister } from './authApi'
import { AuthPitch } from './LoginPage'

type RoleChoice = 'Customer' | 'Investor'

/**
 * UC01 — Đăng ký tài khoản khách hàng hoặc nhà đầu tư (POST /api/auth/register). Đăng ký xong tự đăng nhập.
 * Mỗi tài khoản gắn một hồ sơ đối tác (BR-001): cá nhân lấy họ tên, tổ chức khai tên pháp lý và mã số đăng ký.
 * Người nuôi đăng ký tài khoản trước rồi nộp hồ sơ hộ nuôi ở cổng người nuôi.
 * Form chỉ hiện ô bắt buộc; phần tổ chức mở ra khi đánh dấu "Đăng ký cho tổ chức".
 */
export default function RegisterPage() {
  const navigate = useNavigate()
  const register = useRegister()
  const [role, setRole] = useState<RoleChoice>('Customer')
  const [organisation, setOrganisation] = useState(false)
  const [partyType, setPartyType] = useState('Company')
  const [customerType, setCustomerType] = useState('Restaurant')
  const [fullName, setFullName] = useState('')
  const [legalName, setLegalName] = useState('')
  const [registrationNo, setRegistrationNo] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [terms, setTerms] = useState(false)
  const [message, setMessage] = useState('')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!fullName.trim() || !email.includes('@') || password.length < 8) return setMessage('Nhập họ tên, email và mật khẩu từ 8 ký tự.')
    if (organisation && !legalName.trim()) return setMessage('Nhập tên pháp lý của tổ chức.')
    if (!terms) return setMessage('Bạn cần đồng ý điều khoản sử dụng.')
    setMessage('')
    register.mutate(
      {
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        role,
        partyType: organisation ? partyType : 'Individual',
        legalName: organisation ? legalName.trim() : undefined,
        registrationNo: organisation ? registrationNo.trim() || undefined : undefined,
        customerType: role === 'Customer' ? customerType : undefined,
      },
      {
        onSuccess: (res) => navigate(homePathFor(res.user), { replace: true }),
        onError: (e) => setMessage(errorMessage(e)),
      },
    )
  }

  return (
    <SiteShell bare>
      <main className="op-auth">
        <AuthPitch
          title={<>Một tài khoản, <em>một hồ sơ.</em></>}
          points={['Khách hàng đặt trước ngay', 'Nhà đầu tư xác minh danh tính trước khi góp', 'Người nuôi nộp hồ sơ hộ nuôi sau khi đăng ký']}
        />
        <section className="op-auth__card" aria-labelledby="register-title">
          <h1 id="register-title" className="rd-h2">Đăng ký</h1>

          <form className="op-form" onSubmit={submit} noValidate>
            <RadioCards<RoleChoice>
              value={role}
              onChange={setRole}
              options={[
                { value: 'Customer', label: 'Khách hàng', hint: 'Đặt trước cua' },
                { value: 'Investor', label: 'Nhà đầu tư', hint: 'Góp vốn vào Lô' },
              ]}
            />

            <div className="op-form__row">
              <Field label="Họ và tên">
                <Input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </Field>
              <Field label="Số điện thoại">
                <Input type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
            </div>

            <div className="op-form__row">
              <Field label="Email">
                <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Mật khẩu" hint="Từ 8 ký tự">
                <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            </div>

            {role === 'Customer' && (
              <Field label="Bạn mua cho">
                <Select value={customerType} onChange={(e) => setCustomerType(e.target.value)}>
                  {options('customerType').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            )}

            <Checkbox checked={organisation} onChange={setOrganisation}>Đăng ký cho doanh nghiệp, hộ kinh doanh hoặc hợp tác xã</Checkbox>
            {organisation && (
              <div className="op-subform">
                <Field label="Loại hình">
                  <Select value={partyType} onChange={(e) => setPartyType(e.target.value)}>
                    {options('partyType').filter((o) => o.value !== 'Individual').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
                <Field label="Mã số thuế">
                  <Input value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} inputMode="numeric" />
                </Field>
                <Field label="Tên pháp lý" className="is-wide">
                  <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
                </Field>
              </div>
            )}

            <Checkbox checked={terms} onChange={setTerms}>Tôi đồng ý điều khoản sử dụng</Checkbox>

            {message && <OpNote tone="danger">{message}</OpNote>}
            <OpBtn type="submit" full disabled={register.isPending}>{register.isPending ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}</OpBtn>
          </form>

          <p className="op-auth__alt">Đã có tài khoản? <a href="/dang-nhap">Đăng nhập</a></p>
        </section>
      </main>
    </SiteShell>
  )
}
