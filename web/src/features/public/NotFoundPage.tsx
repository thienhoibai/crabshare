import SiteShell from '../../shared/layout/SiteShell'
import { OpEmpty } from '../../shared/ui/console'

export default function NotFoundPage() {
  return (
    <SiteShell narrow>
      <OpEmpty title="Không tìm thấy trang này">
        Đường dẫn có thể đã đổi sau khi cập nhật. <a href="/lo" style={{ textDecoration: 'underline' }}>Xem các Lô đang mở</a> hoặc <a href="/" style={{ textDecoration: 'underline' }}>về trang chủ</a>.
      </OpEmpty>
    </SiteShell>
  )
}
