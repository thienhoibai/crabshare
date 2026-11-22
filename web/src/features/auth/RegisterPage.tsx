import { useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import { errorMessage, type ApiProblem } from '../../shared/api/http'

import { Checkbox, Field, Input, OpBtn, OpNote, RadioCards, Select, options } from '../../shared/ui/console'
import AuthLayout from './AuthLayout'
import PasswordInput from './PasswordInput'
import { useRegister } from './authApi'

type RoleChoice = 'Customer' | 'Investor'
const PHONE_TAKEN = 'Số điện thoại này đã được dùng cho một tài khoản khác.'

function isPhoneConflict(error: unknown) {
  if (!isAxiosError<ApiProblem>(error) || error.response?.status !== 409) return false
  const problem = error.response.data
  return problem?.code === 'auth.phone_taken' || problem?.detail === PHONE_TAKEN || !!problem?.detail?.includes("'ux_app_user_phone'")
}

/**
 * UC01 — Đăng ký tài khoản khách hàng hoặc nhà đầu tư (POST /api/auth/register). Đăng ký xong tự đăng nhập.
 * Mỗi tài khoản gắn một hồ sơ đối tác (BR-001): cá nhân lấy họ tên, tổ chức khai tên pháp lý và mã số đăng ký.
 * Người nuôi đăng ký tài khoản trước rồi nộp hồ sơ hộ nuôi ở cổng người nuôi.
 * Phần tổ chức mở ra khi người dùng chọn đăng ký cho tổ chức.
 */
export default function RegisterPage() {
  const navigate = useNavigate()
  const register = useRegister()
  const [role, setRole] = useState<RoleChoice>('Customer')
  const [organisation, setOrganisation] = useState(false)
  const [partyType, setPartyType] = useState('Company')
  const [fullName, setFullName] = useState('')
  const [legalName, setLegalName] = useState('')
  const [registrationNo, setRegistrationNo] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [rejectedPhone, setRejectedPhone] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [terms, setTerms] = useState(false)
  const [message, setMessage] = useState('')
  const [attempted, setAttempted] = useState(false)

  const errors = {
    fullName: fullName.trim() ? '' : 'Nhập họ và tên của bạn.',
    email: /^[^\s@]+@[^\s@]+$/.test(email.trim()) ? '' : 'Nhập địa chỉ email hợp lệ.',
    password: password.length >= 8 ? '' : 'Mật khẩu cần ít nhất 8 ký tự.',
    legalName: organisation && !legalName.trim() ? 'Nhập tên pháp lý của tổ chức.' : '',
    terms: terms ? '' : 'Bạn cần đồng ý điều khoản sử dụng.',
  }

  const fieldDetails = (name: keyof typeof errors, hint?: string) => {
    const id = `register-${name}`
    const error = attempted ? errors[name] : ''
    const descriptionId = error || hint ? `${id}-description` : undefined
    return {
      field: { htmlFor: id, descriptionId, error, hint },
      input: { id, name, 'aria-invalid': error ? true : undefined, 'aria-describedby': descriptionId },
    }
  }
  const nameInput = fieldDetails('fullName')
  const emailInput = fieldDetails('email')
  const passwordInput = fieldDetails('password', 'Từ 8 ký tự')
  const legalNameInput = fieldDetails('legalName', 'Sau khi đăng ký, gửi ảnh giấy tờ ở trang Hồ sơ để được xác minh.')
  const termsError = attempted ? errors.terms : ''
  const phoneError = phone.trim() === rejectedPhone ? PHONE_TAKEN : ''

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    const firstError = Object.entries(errors).find(([, error]) => error)
    if (firstError) {
      setAttempted(true)
      const field = event.currentTarget.elements.namedItem(firstError[0])
      if (field instanceof HTMLElement) requestAnimationFrame(() => field.focus())
      return
    }

    const submittedPhone = phone.trim()
    const phoneField = event.currentTarget.elements.namedItem('phone')
    register.mutate(
      {
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        phone: submittedPhone || undefined,
        role,
        partyType: organisation ? partyType : 'Individual',
        legalName: organisation ? legalName.trim() : undefined,
        registrationNo: organisation ? registrationNo.trim() || undefined : undefined,
      },
      {
        onSuccess: () => navigate('/hoan-thien-ho-so', { replace: true }),
        onError: (e) => {
          if (!isPhoneConflict(e)) return setMessage(errorMessage(e))
          setRejectedPhone(submittedPhone)
          if (phoneField instanceof HTMLInputElement && phoneField.value.trim() === submittedPhone) {
            requestAnimationFrame(() => phoneField.focus())
          }
        },
      },
    )
  }

  return (
    <AuthLayout mode="register">
      <form className="op-form" onSubmit={submit} onChange={() => setMessage('')} noValidate>
        <fieldset className="auth-roles">
          <legend className="op-label">Loại tài khoản</legend>
          <RadioCards<RoleChoice>
            value={role}
            onChange={setRole}
            options={[
              { value: 'Customer', label: 'Khách hàng' },
              { value: 'Investor', label: 'Nhà đầu tư' },
            ]}
          />
          <p className="auth-role-hint" aria-live="polite">
            {role === 'Customer' ? 'Đặt trước cua và tra cứu nguồn gốc.' : 'Xác minh danh tính sau khi tạo tài khoản.'}
          </p>
        </fieldset>

        <div className="op-form__row">
          <Field {...nameInput.field} label="Họ và tên" required>
            <Input {...nameInput.input} autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Số điện thoại (không bắt buộc)" htmlFor="register-phone" error={phoneError} descriptionId="register-phone-error">
            <Input id="register-phone" name="phone" type="tel" autoComplete="tel" value={phone}
              aria-invalid={phoneError ? true : undefined} aria-describedby={phoneError ? 'register-phone-error' : undefined}
              onChange={(e) => { setPhone(e.target.value); setRejectedPhone(null) }} />
          </Field>
        </div>

        <div className="op-form__row">
          <Field {...emailInput.field} label="Email" required>
            <Input {...emailInput.input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field {...passwordInput.field} label="Mật khẩu" required>
            <PasswordInput {...passwordInput.input} autoComplete="new-password" required minLength={8} value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>

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
            <Field {...legalNameInput.field} label="Tên pháp lý" className="is-wide" required>
              <Input {...legalNameInput.input} autoComplete="organization" required value={legalName} onChange={(e) => setLegalName(e.target.value)} />
            </Field>
          </div>
        )}

        <div className="auth-consent">
          <Checkbox name="terms" checked={terms} onChange={setTerms} required
            aria-invalid={termsError ? true : undefined} aria-describedby={termsError ? 'register-terms-description' : undefined}>
            Tôi đồng ý điều khoản sử dụng
          </Checkbox>
          {termsError && <p id="register-terms-description" className="op-field__error">{termsError}</p>}
        </div>

        {message && <div role="alert"><OpNote tone="danger">{message}</OpNote></div>}
        <OpBtn className="auth-submit" type="submit" full disabled={register.isPending}>
          {register.isPending ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
          <ArrowRight size={18} aria-hidden="true" />
        </OpBtn>
      </form>
    </AuthLayout>
  )
}
