/* /qc/kiem-dau-vao — Các phiếu nhận hàng đang chờ tôi kiểm đầu vào (việc IncomingInspection, BR-017, BR-101). */
import { KindListPage } from './TaskRows'

export default function IncomingListPage() {
  return <KindListPage kinds={['IncomingInspection']} title="Kiểm đầu vào" empty="Chưa có phiếu nhận nào chờ bạn kiểm" />
}
