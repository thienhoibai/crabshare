import { useMutation } from '@tanstack/react-query'
import { http } from '../../shared/api/http'
import { useAuthStore, type Me } from '../../shared/auth/authStore'

/** Gọi API của Features/Auth bên backend. Mỗi feature có một file *Api.ts như thế này. */
export interface AuthResponse {
  accessToken: string
  expiresAt: string
  user: Me
}

export interface LoginInput { email: string; password: string }
export interface RegisterInput { email: string; password: string; fullName: string; phone?: string; role: 'Customer' | 'Investor' }

export const authApi = {
  login: (body: LoginInput) => http.post<AuthResponse>('/api/auth/login', body).then((r) => r.data),
  register: (body: RegisterInput) => http.post<AuthResponse>('/api/auth/register', body).then((r) => r.data),
  me: () => http.get<Me>('/api/auth/me').then((r) => r.data),
}

/** Đăng nhập xong thì lưu phiên vào authStore. */
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (res) => setSession(res.accessToken, res.expiresAt, res.user),
  })
}

export function useRegister() {
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (res) => setSession(res.accessToken, res.expiresAt, res.user),
  })
}
