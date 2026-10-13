import { ArrowLeft, ArrowRight, ExternalLink, FileText } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpAside, OpBack, OpBadge, OpBtn, OpFacts, OpHeading, OpNote, OpPanel, crabImg } from './operatorUi'

const investors = [
  { name: 'Trần Trọng A', role: 'Nhà đầu tư cá nhân', amount: '22.500.000 ₫', percent: '30%', status: 'Đã giải ngân' },
  { name: 'Lê Thị B', role: 'Nhà đầu tư cá nhân', amount: '37.500.000 ₫', percent: '50%', status: 'Đã giải ngân' },
  { name: 'Phạm Văn C', role: 'Nhà đầu tư cá nhân', amount: '15.000.000 ₫', percent: '20%', status: 'Đã giải ngân' },
]

export default function OperatorBatchDetail() {
  return (
    <OperatorLayout activeTab="batch">
      <OpHeading
        crumb={<OpBack href="/operator/batch"><ArrowLeft size={16} /> Quay lại danh sách lô</OpBack>}
        eyebrow="Chi tiết lô"
        title="Nguồn vốn & bao tiêu"
        description="Tài chính, nhà đầu tư và hồ sơ pháp lý của mẻ cua lột 11A."
      />

      <div className="op-split">
        <div>
          <div className="op-cover">
            <img src={crabImg('Cua lột', 1200)} alt="" />
            <OpBadge tone="info">Đang sản xuất</OpBadge>
            <span className="op-cover__text"><b>BATCH-2026-11A</b><small>Cua lột · 1.500 con giống · 125 ô RAS</small></span>
          </div>

          <OpFacts
            items={[
              { label: 'Vốn huy động', value: '75 triệu' },
              { label: 'Đã góp', value: '100%', tone: 'ok' },
              { label: 'Chu kỳ', value: 'Ngày 34 / 45' },
              { label: 'Cảnh báo mở', value: '2', tone: 'danger' },
            ]}
          />

          <OpNote tone="danger">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span><b>Lô đang có 2 cảnh báo.</b> pH tăng cao tại ô S-54 và S-102.</span>
              <OpBtn variant="danger" sm onClick={() => { window.location.href = '/operator/alerts' }}>
                Xử lý cảnh báo <ArrowRight size={14} />
              </OpBtn>
            </div>
          </OpNote>

          <OpPanel title="Đối tác bao tiêu" action={<OpBadge tone="ok">Đã ký hợp đồng</OpBadge>}>
            <OpFacts
              items={[
                { label: 'Đơn vị mua', value: 'Nhà hàng Biển Đông' },
                { label: 'Giá chốt', value: '350.000 ₫/kg', tone: 'ok' },
                { label: 'Cam kết', value: '100% sản lượng' },
              ]}
            />
          </OpPanel>

          <OpPanel title="Nhà đầu tư" subtitle="3 người góp · tổng 75.000.000 ₫">
            <div className="op-tablewrap">
              <table className="op-table">
                <thead>
                  <tr><th>Nhà đầu tư</th><th>Phân loại</th><th className="is-num">Số tiền góp</th><th className="is-num">Tỷ lệ</th><th>Trạng thái</th></tr>
                </thead>
                <tbody>
                  {investors.map((inv) => (
                    <tr key={inv.name}>
                      <td><b>{inv.name}</b></td>
                      <td className="op-muted">{inv.role}</td>
                      <td className="is-num"><b>{inv.amount}</b></td>
                      <td className="is-num">{inv.percent}</td>
                      <td><OpBadge tone="ok">{inv.status}</OpBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </OpPanel>
        </div>

        <OpAside>
          <p className="rd-eyebrow">Tổng huy động</p>
          <p className="op-big">75.000.000 <small>₫</small></p>
          <dl className="op-dl">
            <dt>Nhà đầu tư</dt><dd>3 người</dd>
            <dt>Đã giải ngân</dt><dd>2 / 3 đợt</dd>
            <dt>Thù lao người nuôi</dt><dd>7% khi Pool dương</dd>
          </dl>
          <p className="rd-eyebrow">Hồ sơ pháp lý</p>
          <a className="op-tile" href="/operator/contract">
            <FileText size={20} />
            <span><b>Hợp đồng sản xuất</b><small>Ký giữa trại và CrabShare</small></span>
            <ExternalLink size={16} />
          </a>
          <OpBtn variant="ink" full onClick={() => { window.location.href = '/operator/boxes' }}>Xem hộp nuôi</OpBtn>
        </OpAside>
      </div>
    </OperatorLayout>
  )
}
