import { useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { errorMessage } from '../../shared/api/http'
import { homePathFor, PROFILE_SETUP_PATH } from '../../shared/auth/authStore'
import { Field, Input, OpBtn, OpNote } from '../../shared/ui/console'
import AuthLayout from './AuthLayout'
import GoogleSignInButton from './GoogleSignInButton'
import PasswordInput from './PasswordInput'
import { useGoogleLogin, useLogin, type AuthResponse } from './authApi'
import { DEMO_ACCOUNTS } from './demoAccounts'

/** Đăng nhập qua POST /api/auth/login. Đăng nhập xong về trang của vai trò, hoặc trang đang mở dở (?next=). */
export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const login = useLogin()
  const googleLogin = useGoogleLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const busy = login.isPending || googleLogin.isPending

  const finishSignIn = (res: AuthResponse) =>
    navigate(res.user.customerProfileRequired ? PROFILE_SETUP_PATH : params.get('next') ?? homePathFor(res.user), { replace: true })

  const submit = (creds: { email: string; password: string }) => {
    setMessage('')
    login.mutate(creds, {
      onSuccess: finishSignIn,
      onError: (e) => setMessage(errorMessage(e)),
    })
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email.includes('@') || !password.trim()) {
      setMessage('Vui lòng nhập email và mật khẩu.')
      return
    }
    submit({ email, password })
  }

  return (
    <AuthLayout mode="login">
      <form className="op-form" onSubmit={onSubmit} onChange={() => setMessage('')} noValidate>
        <Field htmlFor="login-email" label="Email">
          <Input id="login-email" name="email" type="email" autoComplete="email" value={email} placeholder="Nhập địa chỉ email" required
            onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field htmlFor="login-password" label="Mật khẩu">
          <PasswordInput id="login-password" name="password" autoComplete="current-password" value={password} required
            onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {message && <div role="alert"><OpNote tone="danger">{message}</OpNote></div>}
        <OpBtn className="auth-submit" type="submit" full disabled={busy}>
          {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          <ArrowRight size={18} aria-hidden="true" />
        </OpBtn>
      </form>

      <GoogleSignInButton
        mode="login"
        disabled={busy}
        onCredential={(idToken) => {
          setMessage('')
          googleLogin.mutate({ idToken }, { onSuccess: finishSignIn, onError: (e) => setMessage(errorMessage(e)) })
        }}
      />

      {import.meta.env.DEV && (
        <div className="op-form auth-demo">
          <p className="rd-eyebrow">Tài khoản mẫu, chỉ có khi chạy thử</p>
          <div className="op-demo">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} type="button" disabled={busy}
                onClick={() => { setEmail(a.email); setPassword(a.password); submit(a) }}>
                <b>{a.label}</b>
                <small>{a.hint}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  )
}
