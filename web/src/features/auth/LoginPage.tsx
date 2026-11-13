import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Check, Eye, EyeOff } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { homePathFor } from '../../shared/auth/authStore'
import SiteShell from '../../shared/layout/SiteShell'
import { Field, Input, OpBtn, OpNote } from '../../shared/ui/console'
import { useLogin } from './authApi'
import { DEMO_ACCOUNTS } from './demoAccounts'

/** Phần giới thiệu bên trái trang đăng nhập và đăng ký. */
export function AuthPitch({ title, points }: { title: React.ReactNode; points: string[] }) {
  return (
    <aside className="op-auth__pitch">
      <img src="/minhbach/farmer.png" alt="" />
      <p className="rd-eyebrow" style={{ color: 'rgba(243,239,231,0.7)' }}>CrabShare</p>
      <h2 className="rd-h2">{title}</h2>
      <ul>
        {points.map((p) => <li key={p}><Check size={16} />{p}</li>)}
      </ul>
    </aside>
  )
}

/** Đăng nhập qua POST /api/auth/login. Đăng nhập xong về trang của vai trò, hoặc trang đang mở dở (?next=). */
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
    <SiteShell bare>
      <main className="op-auth">
        <AuthPitch
          title={<>Mỗi con cua một hộp, <em>mỗi Lô một sổ.</em></>}
          points={['Đặt trước cua theo quy cách', 'Góp vốn và theo dõi từng Lô', 'Đo và phân hạng từng con tại trạm']}
        />
        <section className="op-auth__card" aria-labelledby="login-title">
          <div>
            <p className="rd-eyebrow">Tài khoản</p>
            <h1 id="login-title" className="rd-h2">Đăng nhập</h1>
          </div>

          <form className="op-form" onSubmit={onSubmit} noValidate>
            <Field label="Email">
              <Input type="email" autoComplete="email" value={email} placeholder="ban@vidu.vn" required
                onChange={(e) => { setEmail(e.target.value); setMessage('') }} />
            </Field>
            <Field label="Mật khẩu">
              <span className="op-affix">
                <Input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} required
                  onChange={(e) => { setPassword(e.target.value); setMessage('') }} />
                <span style={{ pointerEvents: 'auto', right: 8 }}>
                  <button type="button" className="rd-iconbtn" style={{ width: 34, height: 34 }} onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
              </span>
            </Field>
            {message && <OpNote tone="danger">{message}</OpNote>}
            <OpBtn type="submit" full disabled={login.isPending}>{login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}</OpBtn>
          </form>

          <p className="op-auth__alt">Chưa có tài khoản? <a href="/dang-ky">Đăng ký</a></p>

          {import.meta.env.DEV && (
            <div className="op-form">
              <p className="rd-eyebrow">Tài khoản mẫu, chỉ có khi chạy thử</p>
              <div className="op-demo">
                {DEMO_ACCOUNTS.map((a) => (
                  <button key={a.email} type="button" disabled={login.isPending}
                    onClick={() => { setEmail(a.email); setPassword(a.password); submit(a) }}>
                    <b>{a.label}</b>
                    <small>{a.hint}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </SiteShell>
  )
}
