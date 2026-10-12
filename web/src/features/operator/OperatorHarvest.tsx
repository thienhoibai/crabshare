import { ArrowLeft, ArrowRight, Box, PackageCheck, PlusCircle, QrCode, Store, UploadCloud } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpBack, OpBadge, OpBtn, OpFacts, OpHeading, OpPanel, OpRow, crabImg } from './operatorUi'

const readyBatches = [
  { id: 'BATCH-2026-10B', type: 'Cua gạch', total: 800, sold: 150, frozen: 50, remaining: 600, status: 'Đang thu hoạch' },
  { id: 'BATCH-2026-11A', type: 'Cua lột', total: 1500, sold: 10, frozen: 0, remaining: 1490, status: 'Bắt đầu lột' },
]

const harvestedItems = [
  { id: 'CRAB-7392-L1', weight: '210 g', type: 'Cua lột chuẩn' },
  { id: 'CRAB-7393-L1', weight: '225 g', type: 'Cua lột loại 1' },
]

export default function OperatorHarvest() {
  const batchId = new URLSearchParams(window.location.search).get('batchId')

  if (!batchId) {
    return (
      <OperatorLayout activeTab="harvest">
        <OpHeading
          eyebrow="Thu hoạch"
          title="Thu hoạch & đóng gói"
          description="Chọn lô đến kỳ để cân, gắn tem QR và đóng gói đơn."
          action={<OpBtn variant="ghost" onClick={() => { window.location.href = '/operator/listings' }}><Store size={16} /> Niêm yết sản phẩm</OpBtn>}
        />
        <div className="op-panel op-list">
          {readyBatches.map((b) => (
            <OpRow
              key={b.id}
              href={`/operator/harvest?batchId=${b.id}`}
              media={crabImg(b.type)}
              title={b.id}
              sub={`${b.type} · ${b.total.toLocaleString('vi-VN')} con`}
              mid={
                <span className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <span><b className="op-warn">{b.remaining.toLocaleString('vi-VN')}</b> <small>sẵn sàng</small></span>
                  <span><b>{b.sold}</b> <small>đã bán</small></span>
                  <span><b className="op-info">{b.frozen}</b> <small>trữ đông</small></span>
                </span>
              }
              end={<OpBadge tone="ok">{b.status}</OpBadge>}
            />
          ))}
        </div>
      </OperatorLayout>
    )
  }

  return (
    <OperatorLayout activeTab="harvest">
      <OpHeading
        crumb={<OpBack href="/operator/harvest"><ArrowLeft size={16} /> Quay lại danh sách lô</OpBack>}
        eyebrow={`Lô ${batchId}`}
        title="Thu hoạch & đóng gói"
        description="Cân từng con, gắn tem truy xuất và báo đóng hàng cho đơn."
      />

      <OpFacts
        items={[
          { label: 'Sẵn sàng', value: '600 con', tone: 'warn' },
          { label: 'Đã bán & đóng gói', value: '150 con' },
          { label: 'Trữ đông', value: '50 con', tone: 'info' },
          { label: 'Tem QR đã in', value: harvestedItems.length },
        ]}
      />

      <a className="op-tile" href="/operator/listings">
        <Store size={20} />
        <span><b>Giá bán và đăng lên cửa hàng</b><small>Đặt giá theo lô + hạng ở trang Niêm yết sản phẩm. Mọi lần đổi giá được lưu cho nhà đầu tư xem.</small></span>
        <ArrowRight size={18} />
      </a>

      <div className="op-grid">
        <OpPanel className="op-span-4" title="1. Cân & gắn tem QR" subtitle="Sinh tem truy xuất cho từng con khi bắt khỏi hộp.">
          <div className="op-form">
            <div className="op-field"><label htmlFor="hv-w">Trọng lượng (gram)</label><input id="hv-w" className="op-input" type="number" placeholder="VD: 250" /></div>
            <div className="op-field">
              <label htmlFor="hv-g">Phân loại</label>
              <select id="hv-g" className="op-select">
                <option>Loại 1 (200 g+)</option>
                <option>Loại 2 (150 g+)</option>
              </select>
            </div>
            <div className="op-field"><label htmlFor="hv-s">Ô nuôi</label><input id="hv-s" className="op-input" placeholder="S-25" /></div>
            <OpBtn variant="ghost" full><PlusCircle size={16} /> In tem QR mới</OpBtn>
          </div>
        </OpPanel>

        <OpPanel accent className="op-span-4" title="2. Đóng hàng giao khách" subtitle="Đơn bán lẻ từ cửa hàng.">
          <div className="op-form">
            <div className="op-field"><label htmlFor="hv-o">Mã đơn / khách</label><input id="hv-o" className="op-input" defaultValue="ORD-9982 (Anh Tuấn)" readOnly /></div>
            <div className="op-form__row">
              <div className="op-field"><label htmlFor="hv-n">Số con</label><input id="hv-n" className="op-input" type="number" placeholder="2" /></div>
              <div className="op-field"><label htmlFor="hv-t">Tổng gram</label><input id="hv-t" className="op-input" type="number" placeholder="550" /></div>
            </div>
            <div className="op-field">
              <span className="op-label">Ảnh đóng thùng</span>
              <div className="op-drop"><UploadCloud size={20} /> Chụp & tải ảnh</div>
            </div>
            <OpBtn variant="ink" full onClick={() => alert('Đã báo đóng hàng xong! Khách sẽ nhận thông báo.')}>
              <PackageCheck size={16} /> Báo hoàn tất đóng hàng
            </OpBtn>
          </div>
        </OpPanel>

        <OpPanel className="op-span-4" title="Tem QR đã in" action={<OpBadge tone="ok">{harvestedItems.length} mã</OpBadge>}>
          <div className="grid gap-2">
            {harvestedItems.map((item) => (
              <div key={item.id} className="op-tile">
                <QrCode size={20} />
                <span><b className="op-mono">{item.id}</b><small>{item.type} · {item.weight}</small></span>
              </div>
            ))}
          </div>
          <div className="op-drop"><Box size={22} /> Quét QR để đối chiếu</div>
        </OpPanel>
      </div>
    </OperatorLayout>
  )
}
