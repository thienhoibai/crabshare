import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { errorMessage } from '../../shared/api/http'
import { homePathFor } from '../../shared/auth/authStore'
import { SiteFooter, SiteHeader } from '../../shared/layout/SiteChrome'
import { useLogin } from './authApi'
import { DEMO_ACCOUNTS } from './demoAccounts'

const asset = (name: string) => `/assets/${name}`

/** Đăng nhập thật qua POST /api/auth/login. Giao diện giữ nguyên từ bản demo. */
export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')

  const submit = (creds: { email: string; password: string }) => {
    setMessage('')
    login.mutate(creds, {
      onSuccess: (res) => navigate(params.get('next') ?? homePathFor(res.user), { replace: true }),
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
    <>
      <SiteHeader />
      <main className='login-page'>
        <section className='login-card' aria-labelledby='login-title'>
          <header className='login-brand'>
            <a href='/' className='login-logo' aria-label='CrabShare'>
              <span className='login-wordmark'><strong>CRAB</strong><span>SHARE</span></span>
              <span className='login-logo-icon'><img src={asset('loginCrabIcon.svg')} alt='' /></span>
            </a>
            <span className='login-tagline'>BATCH . GROW . SHARE</span>
            <h1 id='login-title' className='sr-only'>Đăng nhập</h1>
          </header>

          {import.meta.env.DEV && (
            <div className='login-demo-banner'>
              <div className='login-demo-header'>
                <span className='login-demo-badge'>DEV</span>
                <p className='login-demo-desc'>Đăng nhập nhanh bằng tài khoản demo (chỉ hiện khi chạy dev)</p>
              </div>
              <div className='login-demo-actions'>
                {DEMO_ACCOUNTS.map((a) => (
                  <button key={a.email} type='button' className='login-demo-btn login-demo-btn--outline' disabled={login.isPending}
                    onClick={() => { setEmail(a.email); setPassword(a.password); submit(a) }}>
                    <span className='login-demo-btn-text'><strong>{a.label}</strong><small>{a.hint}</small></span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form className='login-form' onSubmit={onSubmit} noValidate>
            <label className='login-field'>
              <span className='sr-only'>Email</span>
              <input type='email' autoComplete='email' value={email} onChange={(e) => { setEmail(e.target.value); setMessage('') }} placeholder='Email' required />
              <img src={asset('loginMail.svg')} alt='' />
            </label>
            <label className='login-field'>
              <span className='sr-only'>Mật khẩu</span>
              <input type={showPassword ? 'text' : 'password'} autoComplete='current-password' value={password} onChange={(e) => { setPassword(e.target.value); setMessage('') }} placeholder='Mật khẩu' required />
              <button type='button' onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}><img src={asset('loginEye.svg')} alt='' /></button>
            </label>
            <button type='submit' className='login-submit' disabled={login.isPending}>{login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
            {message && <p className='login-error' role='alert'>{message}</p>}
            <p className='login-signup'>Chưa có tài khoản? <a href='/dang-ky'>Đăng ký</a></p>
          </form>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
