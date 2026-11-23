import { useState } from 'react'
import type { SessionResponse } from '../../../shared/api/api.gen'
import {
  AuthImage, Input, OpBtn, OpFacts, OpNote, OpPanel, OpTable, QueryView, Select, StatusBadge,
  formatDateTime, useGet,
} from '../../../shared/ui/console'
import Pager from '../Pager'

export interface WeighingHistoryPage {
  items: SessionResponse[]
  page: number
  pageSize: number
  total: number
}

export function BatchWeighingHistory({ code, onSelect }: { code: string; onSelect?: (session: string) => void }) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('')
  const [detail, setDetail] = useState<SessionResponse | null>(null)
  const data = useGet<WeighingHistoryPage>(`/api/batches/${encodeURIComponent(code)}/measurement-sessions`,
    { page, pageSize: 20, search, status }, { refetchInterval: 5000 })

  function show(row: SessionResponse) {
    setDetail(row)
    onSelect?.(row.sessionNo)
  }

  return <OpPanel title="Lịch sử cân theo lô" lead={code}>
    <form className="op-toolbar" onSubmit={(event) => { event.preventDefault(); setSearch(draft.trim()); setPage(1) }}>
      <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Tìm mã cua hoặc mã lượt đo" aria-label="Tìm lượt cân" maxLength={64} />
      <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} aria-label="Trạng thái lượt cân">
        <option value="">Tất cả lượt</option>
        <option value="Open">Đang chờ trạm</option>
        <option value="Received">Đã nhận dữ liệu</option>
        <option value="Measured">Đã xử lý</option>
        <option value="Failed">Có lỗi</option>
        <option value="Cancelled">Đã hủy</option>
      </Select>
      <OpBtn type="submit" variant="ghost">Tìm</OpBtn>
    </form>
    <QueryView query={data}>
      {(result) => <>
        <p className="rd-muted">{result.total} lượt khớp bộ lọc. Danh sách tự cập nhật khi trạm gửi kết quả.</p>
        <OpTable rows={result.items} rowKey={(row) => row.sessionNo} empty="Chưa có lượt cân trong lô này"
          columns={[
            { key: 'crab', header: 'Mã cua', cell: (row) => <><b>{row.gradeAiTag ?? row.crabCode}</b><small className="os-sub">{row.sessionNo}</small></> },
            { key: 'time', header: 'Thời điểm', cell: (row) => formatDateTime(row.capturedAt ?? row.openedAt) },
            { key: 'weight', header: 'Khối lượng', num: true, cell: (row) => row.weightG == null ? 'Chờ số cân' : `${row.weightG.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} g` },
            { key: 'status', header: 'Kết quả', cell: (row) => <><StatusBadge kind="session" value={row.status} />{row.failReason && <small className="os-sub op-danger">{row.failReason}</small>}</> },
            { key: 'view', header: '', cell: (row) => <OpBtn sm variant="ghost" onClick={() => show(row)}>Xem lượt cân</OpBtn> },
          ]} />
        <Pager page={result.page} pageSize={result.pageSize} total={result.total} unit="lượt cân" onChange={setPage} />
      </>}
    </QueryView>
    {detail && !onSelect && <div className="device-history-detail">
      <div className="op-between"><h3>{detail.gradeAiTag ?? detail.crabCode}</h3><OpBtn sm variant="ghost" onClick={() => setDetail(null)}>Đóng chi tiết</OpBtn></div>
      <OpFacts items={[
        { label: 'Lượt đo', value: detail.sessionNo },
        { label: 'Trạm', value: detail.stationCode ?? 'Đo tay' },
        { label: 'Khối lượng', value: detail.weightG == null ? 'Chưa có' : `${detail.weightG.toLocaleString('vi-VN')} g` },
        { label: 'Khoảng cách', value: detail.tofMm == null ? 'Chưa có' : `${detail.tofMm} mm` },
      ]} />
      {detail.failReason && <OpNote tone="danger">{detail.failReason}</OpNote>}
      <div className="op-thumbs">
        {(['white', 'red'] as const).map((channel) => (channel === 'white' ? detail.hasWhiteImage : detail.hasRedImage) && (
          <figure key={channel}><AuthImage path={`/api/measurement-sessions/${encodeURIComponent(detail.sessionNo)}/images/${channel}`} alt={channel === 'white' ? 'Ảnh đèn trắng' : 'Ảnh đèn soi'} />
            <figcaption>{channel === 'white' ? 'Đèn trắng' : 'Đèn soi'}</figcaption></figure>
        ))}
      </div>
    </div>}
  </OpPanel>
}
