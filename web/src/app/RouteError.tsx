/* Màn lỗi của router thay cho màn lỗi tiếng Anh mặc định của React Router.
   Lỗi hay gặp nhất là tab mở từ trước khi web có bản mới: các tệp JS cũ đã bị thay tên nên chuyển trang không tải được.
   Khi đó tải lại trang một lần là có bản mới (mỗi đường dẫn chỉ tự tải lại một lần trong một phút để không lặp vô hạn). */
import { useEffect } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'

const RELOAD_KEY = 'crabshare-chunk-reload'

/** Lỗi do không tải được tệp JS của trang (thường vì web vừa có bản mới). */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '')
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Failed to fetch dynamically/i.test(message)
}

/** Tải lại trang một lần cho đường dẫn hiện tại; trả về false nếu vừa tải lại trong một phút qua. */
export function reloadOnce(): boolean {
  try {
    const last = JSON.parse(sessionStorage.getItem(RELOAD_KEY) ?? 'null') as { path: string; at: number } | null
    if (last && last.path === window.location.pathname && Date.now() - last.at < 60_000) return false
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ path: window.location.pathname, at: Date.now() }))
  } catch {
    // Không ghi được sessionStorage: vẫn tải lại một lần.
  }
  window.location.reload()
  return true
}

export default function RouteError() {
  const error = useRouteError()
  const chunk = isChunkLoadError(error)

  useEffect(() => {
    if (chunk) reloadOnce()
  }, [chunk])

  const notFound = isRouteErrorResponse(error) && error.status === 404
  const title = chunk ? 'Web vừa có bản mới' : notFound ? 'Không tìm thấy trang' : 'Có lỗi khi mở trang này'
  const detail = chunk
    ? 'Đang tải lại để lấy bản mới. Nếu trang không tự tải lại, bấm nút bên dưới.'
    : notFound ? 'Đường dẫn không còn hoặc đã đổi.' : 'Bạn thử tải lại trang. Nếu vẫn lỗi, quay về trang chủ.'

  return (
    <main className="app-error" role="alert">
      <h1>{title}</h1>
      <p>{detail}</p>
      <div className="app-error__actions">
        <button type="button" className="rd-btn rd-btn--primary" onClick={() => window.location.reload()}>Tải lại trang</button>
        <a className="rd-btn rd-btn--ghost" href="/">Về trang chủ</a>
      </div>
    </main>
  )
}
