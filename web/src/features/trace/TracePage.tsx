import axios from 'axios'
import { useParams } from 'react-router'
import { Logo, Shell } from '../../shared/ui/kit/kit'
import type { ApiProblem } from '../../shared/api/http'
import { crabTypes } from '../operator/batchesApi'
import { useTrace } from './traceApi'
import './trace.css'

const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value))
  : 'Chưa ghi nhận'
const crabTypeName = (value: string) => crabTypes[value as keyof typeof crabTypes] ?? value
const itemStatusName: Record<string, string> = { InStock: 'Đang lưu kho', Reserved: 'Đã đặt trước', Packed: 'Đã đóng gói', Delivered: 'Đã giao' }

function problemCode(error: unknown) {
  return axios.isAxiosError<ApiProblem>(error) ? error.response?.data.code : undefined
}

export default function TracePage() {
  const { tagCode } = useParams()
  const query = useTrace(tagCode)
  const trace = query.data
  const code = query.isError ? problemCode(query.error) : undefined

  return (
    <Shell theme="light" className="trace-page">
      <main className="trace-shell">
        <Logo />
        <header className="trace-heading">
          <p className="rd-eyebrow">Truy xuất nguồn gốc</p>
          <h1 className="rd-display">Tem {tagCode || 'không xác định'}</h1>
          <p className="rd-muted">Thông tin hành trình của sản phẩm được ghi nhận tại trang trại.</p>
        </header>

        {!tagCode ? <section className="trace-state" role="alert">
          <h2>Thiếu mã tem</h2><p>Hãy quét mã QR hoặc nhập lại đường dẫn có mã tem hợp lệ.</p>
        </section> : query.isPending ? <section className="trace-state" role="status" aria-live="polite">
          <span className="trace-spinner" aria-hidden="true" /><p>Đang tải thông tin truy xuất…</p>
        </section> : query.isError ? <section className="trace-state" role="alert">
          {code === 'tag.not_found' ? <><h2>Không tìm thấy tem</h2><p>Mã tem này không tồn tại hoặc không có thông tin truy xuất.</p></> :
            code === 'tag.invalid_code' ? <><h2>Mã tem không hợp lệ</h2><p>Mã trên tem hoặc đường dẫn QR không đúng định dạng.</p></> :
            code === 'tag.void' ? <><h2>Tem đã bị hủy</h2><p>Tem này không còn hợp lệ để truy xuất sản phẩm.</p></> :
              code === 'tag.not_active' ? <><h2>Tem chưa được kích hoạt</h2><p>Thông tin truy xuất sẽ xuất hiện sau khi tem được xác nhận kích hoạt.</p></> :
                <><h2>Chưa tải được thông tin</h2><p>Đã xảy ra lỗi khi kết nối đến dịch vụ truy xuất. Vui lòng thử lại.</p></>}
          <button className="rd-btn rd-btn--ghost trace-retry" type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? 'Đang thử lại…' : 'Thử lại'}
          </button>
        </section> : trace && <>
          <section className="trace-overview" aria-label="Tóm tắt nguồn gốc">
            <div className="trace-overview__title">
              <span className="trace-active"><i aria-hidden="true" /> Đã xác thực</span>
              <h2>{crabTypeName(trace.crabType)}</h2>
              <p className="trace-batch">Lô {trace.batchCode}</p>
            </div>
            <dl className="trace-facts">
              <div><dt>Hạng</dt><dd>{trace.gradeName || trace.gradeCode || 'Chưa phân hạng'}</dd></div>
              <div><dt>Khối lượng</dt><dd>{trace.weightG != null ? `${trace.weightG.toLocaleString('vi-VN')} g` : 'Chưa cân'}</dd></div>
              <div><dt>Hộp nuôi</dt><dd>{trace.slotCode}</dd></div>
              <div><dt>Tình trạng</dt><dd>{itemStatusName[trace.itemStatus] ?? trace.itemStatus}</dd></div>
              <div><dt>Ngày thả nuôi</dt><dd>{dateTime(trace.stockedAt)}</dd></div>
              <div><dt>Ngày thu hoạch</dt><dd>{dateTime(trace.harvestedAt)}</dd></div>
            </dl>
          </section>

          <section className="trace-history" aria-labelledby="trace-history-title">
            <p className="rd-eyebrow">Hành trình sản phẩm</p>
            <h2 id="trace-history-title">Lịch sử ghi nhận</h2>
            {trace.events.length ? <ol className="trace-timeline">
              {trace.events.map((event, index) => <li key={`${event.occurredAt}-${event.eventType}-${index}`}>
                <span className="trace-timeline__dot" aria-hidden="true" />
                <div><h3>{event.eventType}</h3><time dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time>
                </div>
              </li>)}
            </ol> : <p className="rd-muted">Chưa có sự kiện nào được ghi nhận.</p>}
          </section>
          <p className="trace-footnote">Dữ liệu được cung cấp bởi trang trại CrabShare.</p>
        </>}
      </main>
    </Shell>
  )
}
