/* /qc/tham-trai — Các lần thăm trại giữa vụ được phân cho tôi (việc SiteVisit, BR-233). */
import { KindListPage } from './TaskRows'

export default function SiteVisitListPage() {
  return <KindListPage kinds={['SiteVisit']} title="Thăm trại giữa vụ" empty="Chưa có lần thăm trại nào được phân cho bạn" />
}
