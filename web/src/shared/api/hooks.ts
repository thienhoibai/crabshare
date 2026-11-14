/* Hook gọi API dùng chung cho các trang BR v1.5.
   Kiểu dữ liệu lấy từ api.gen.ts, đường dẫn tra trong endpoints.gen.md.

   const batches = useGet<BatchSummary[]>('/api/operators/me/batches')
   const submit  = useSend<BatchDetail, void>('post', `/api/batches/${code}/submit`, { success: 'Đã gửi Lô đi duyệt.' })
   submit.mutate()

   Sau mỗi lần ghi thành công, mọi truy vấn đang hiển thị được tải lại, nên trang không cần tự làm mới. */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { errorMessage, http } from './http'
import { toast } from '../ui/console/toast'

type Params = Record<string, string | number | boolean | null | undefined>

const clean = (params?: Params) =>
  params ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')) : undefined

/** GET một đường dẫn. Truyền url = null để tạm chưa gọi (ví dụ chưa chọn Lô). */
export function useGet<T>(
  url: string | null | undefined | false,
  params?: Params,
  options?: Pick<UseQueryOptions<T>, 'refetchInterval' | 'enabled' | 'staleTime' | 'retry'>,
) {
  const query = clean(params)
  return useQuery<T>({
    queryKey: [url, query],
    queryFn: async ({ signal }) => (await http.get<T>(url as string, { params: query, signal })).data,
    ...options,
    enabled: !!url && (options?.enabled ?? true),
  })
}

export interface SendOptions<TRes, TBody> {
  /** Gửi multipart/form-data: body là object, giá trị File được gửi nguyên, mảng được lặp lại theo tên. */
  form?: boolean
  /** Câu báo thành công hiện ở góc màn hình. */
  success?: string | ((res: TRes, body: TBody) => string)
  onSuccess?: (res: TRes, body: TBody) => void
  /** true: không tự hiện thông báo lỗi (trang tự hiện bằng errorMessage(mutation.error)). */
  quietError?: boolean
}

/** Đổi object thành FormData. Bỏ qua null, undefined; File gửi nguyên; mảng lặp theo tên; object con thành JSON. */
export function toFormData(body: Record<string, unknown>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue
    if (value instanceof Blob) data.append(key, value)
    else if (Array.isArray(value)) value.forEach((v) => data.append(key, v instanceof Blob ? v : typeof v === 'object' ? JSON.stringify(v) : String(v)))
    else if (typeof value === 'object') data.append(key, JSON.stringify(value))
    else data.append(key, String(value))
  }
  return data
}

/** POST, PUT, PATCH, DELETE. url có thể là hàm nhận body khi đường dẫn phụ thuộc vào dòng được bấm. */
export function useSend<TRes = unknown, TBody = void>(
  method: 'post' | 'put' | 'patch' | 'delete',
  url: string | ((body: TBody) => string),
  options: SendOptions<TRes, TBody> = {},
) {
  const queryClient = useQueryClient()
  return useMutation<TRes, unknown, TBody>({
    retry: false,
    mutationFn: async (body) => {
      const path = typeof url === 'function' ? url(body) : url
      const payload = options.form && body ? toFormData(body as Record<string, unknown>) : body
      const res = method === 'delete' ? await http.delete<TRes>(path, { data: payload }) : await http[method]<TRes>(path, payload)
      return res.data
    },
    onSuccess: (res, body) => {
      void queryClient.invalidateQueries()
      if (options.success) toast(typeof options.success === 'function' ? options.success(res, body) : options.success)
      options.onSuccess?.(res, body)
    },
    onError: (error) => {
      if (!options.quietError) toast(errorMessage(error), 'danger')
    },
  })
}

/** Tải một tệp cần đăng nhập (ảnh bằng chứng, ảnh lượt đo, PDF hợp đồng) về dạng Blob. */
export async function fetchBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  return (await http.get<Blob>(path, { responseType: 'blob', signal })).data
}

/** Object URL của một tệp cần đăng nhập; tự thu hồi khi đổi path hoặc rời trang. */
export function useBlobUrl(path: string | null | undefined) {
  const [state, setState] = useState<{ url: string | null; error: boolean; loading: boolean }>({ url: null, error: false, loading: !!path })
  useEffect(() => {
    if (!path) {
      setState({ url: null, error: false, loading: false })
      return
    }
    const controller = new AbortController()
    let objectUrl = ''
    setState({ url: null, error: false, loading: true })
    fetchBlob(path, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setState({ url: objectUrl, error: false, loading: false })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ url: null, error: true, loading: false })
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])
  return state
}

/** Mở một tệp cần đăng nhập ở tab mới (PDF hợp đồng, CSV báo cáo). */
export async function openFile(path: string, downloadName?: string) {
  try {
    const url = URL.createObjectURL(await fetchBlob(path))
    const a = document.createElement('a')
    a.href = url
    if (downloadName) a.download = downloadName
    else a.target = '_blank'
    a.rel = 'noopener'
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    toast(errorMessage(error), 'danger')
  }
}
