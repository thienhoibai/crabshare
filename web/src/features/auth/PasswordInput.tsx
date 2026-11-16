import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '../../shared/ui/console'

export default function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false)

  return (
    <span className="op-affix">
      <Input {...props} type={visible ? 'text' : 'password'} />
      <button className="auth-password-toggle" type="button" aria-controls={props.id}
        aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setVisible((value) => !value)}>
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </span>
  )
}
