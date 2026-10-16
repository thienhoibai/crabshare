import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../auth/authStore'

/** Địa chỉ API lấy từ biến môi trường VITE_API_URL (xem web/.env.example). */
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5233'

/** Client HTTP dùng chung: tự gắn JWT, tự đăng xuất khi token hết hạn (401). */
export const http = axios.create({ baseURL: API_URL, timeout: 20_000 })

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const token = useAuthStore.getState().token
    if (error.response?.status === 401 && token && error.config?.headers.Authorization === `Bearer ${token}`)
      useAuthStore.getState().logout()
    return Promise.reject(error)
  },
)

/** Lỗi theo chuẩn ProblemDetails mà backend trả về (GlobalExceptionHandler). */
export interface ApiProblem {
  status: number
  title?: string
  detail?: string
  code?: string
  errors?: Record<string, string[]>
}

/** Lấy câu thông báo lỗi dễ đọc từ bất kỳ lỗi nào (dùng trong toast, dòng báo lỗi dưới form). */
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiProblem>(error)) {
    const p = error.response?.data
    if (p?.errors) return Object.values(p.errors).flat().join(' ')
    if (p?.detail) return p.detail
    if (!error.response) return 'Không kết nối được máy chủ. Kiểm tra API đã chạy chưa.'
  }
  return 'Có lỗi xảy ra, thử lại sau.'
}
