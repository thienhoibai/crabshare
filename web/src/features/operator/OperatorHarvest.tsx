import { QrCode, PlusCircle, Box, PackageCheck, UploadCloud, ArrowLeft, ArrowRight, Package } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpBack, OpBadge, OpBtn, OpHeading, OpNote, OpPanel } from './operatorUi'

export default function OperatorHarvest() {
  const params = new URLSearchParams(window.location.search)
  const batchId = params.get('batchId')

  if (!batchId) {
    const readyBatches = [
      { id: 'BATCH-2026-10B', type: 'Cua gạch', total: 800, sold: 150, frozen: 50, remaining: 600, status: 'Đang thu hoạch' },
      { id: 'BATCH-2026-11A', type: 'Cua lột', total: 1500, sold: 10, frozen: 0, remaining: 1490, status: 'Bắt đầu lột tẻ' },
    ]

    return (
      <OperatorLayout activeTab="harvest">
        <OpHeading
          eyebrow="UC-07 · Thu hoạch"
          title="Xuất bán & thu hoạch"
          description="Chọn lô đạt chuẩn để gắn QR, đóng gói và đẩy giá lên storefront."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {readyBatches.map((b) => (
            <article key={b.id} onClick={() => { window.location.href = `/operator/harvest?batchId=${b.id}` }} className="op-panel cursor-pointer hover:border-[#7d4b1a] transition-all">
              <div className="flex justify-between items-start mb-4 pb-4 border-b border-[#f0e8dc]">
                <div>
                  <h2 className="text-lg font-extrabold text-[#7d4b1a]">{b.id}</h2>
                  <p className="text-sm text-[#6f675e]">{b.type}</p>
                </div>
                <OpBadge tone="ok">{b.status}</OpBadge>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-[10px] font-bold uppercase text-[#9a8f84]">Tổng sản lượng</p><p className="font-extrabold text-lg">{b.total} <em className="text-xs font-medium not-italic text-[#6f675e]">con</em></p></div>
                <div><p className="text-[10px] font-bold uppercase text-[#b45309]">Tồn kho sẵn sàng</p><p className="font-extrabold text-lg text-[#b45309]">{b.remaining}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-[#9a8f84]">Đã bán & đóng gói</p><p className="font-extrabold">{b.sold}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-[#9a8f84]">Trữ đông</p><p className="font-extrabold text-[#0369a1]">{b.frozen}</p></div>
              </div>
              <OpBtn variant="ghost" full className="mt-5">
                <Package className="w-4 h-4" /> Vào khu vực thu hoạch <ArrowRight className="w-4 h-4" />
              </OpBtn>
            </article>
          ))}
        </div>
      </OperatorLayout>
    )
  }

  const harvestedItems = [
    { id: 'CRAB-7392-L1', weight: '210g', type: 'Cua lột chuẩn' },
    { id: 'CRAB-7393-L1', weight: '225g', type: 'Cua lột loại 1' },
  ]

  return (
    <OperatorLayout activeTab="harvest">
      <OpHeading
        eyebrow={`Lô ${batchId}`}
        title="Thu hoạch & đóng gói"
        description="Khả dụng: 600 con · tự định giá theo BR-56."
        crumb={
          <OpBack href="/operator/harvest">
            <ArrowLeft className="w-4 h-4" /> Quay lại danh sách lô
          </OpBack>
        }
      />

      <OpPanel accent className="mb-5" title="Thiết lập giá bán & lên cửa hàng" action={<OpBadge tone="gold">BR-56 · Operator tự định giá</OpBadge>}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="op-field">
            <label>Cua lột loại 1 (200g+)</label>
            <div className="flex items-center gap-2">
              <input type="number" defaultValue={850000} className="op-input font-mono font-bold text-[#7d4b1a]" />
              <span className="text-sm text-[#6f675e]">₫/kg</span>
            </div>
          </div>
          <div className="op-field">
            <label>Cua lột loại 2 (150g+)</label>
            <div className="flex items-center gap-2">
              <input type="number" defaultValue={650000} className="op-input font-mono font-bold text-[#7d4b1a]" />
              <span className="text-sm text-[#6f675e]">₫/kg</span>
            </div>
          </div>
          <div className="flex items-end">
            <OpBtn full onClick={() => alert('Đã lưu giá và gửi yêu cầu đến Admin. Chờ duyệt lên Storefront!')}>
              <PackageCheck className="w-4 h-4" /> Yêu cầu duyệt lên kệ
            </OpBtn>
          </div>
        </div>
        <OpNote className="mt-4">Giá loại 1 đang cao hơn ~10% mặt bằng chung — chỉ là cảnh báo, nền tảng không áp giá (BR-56).</OpNote>
      </OpPanel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <OpPanel title="1. Khai báo & gắn tem QR" subtitle="Sinh tem truy xuất từng con lúc bắt khỏi hộp.">
          <div className="space-y-4">
            <div className="op-field"><label>Trọng lượng (gram)</label><input className="op-input" type="number" placeholder="VD: 250" /></div>
            <div className="op-field">
              <label>Phân loại</label>
              <select className="op-select">
                <option>Loại 1 (200g+)</option>
                <option>Loại 2 (150g+)</option>
              </select>
            </div>
            <div className="op-field"><label>Vị trí lồng (Slot ID)</label><input className="op-input" placeholder="S-25" /></div>
            <OpBtn variant="ghost" full><PlusCircle className="w-4 h-4" /> In tem QR mới</OpBtn>
          </div>
        </OpPanel>

        <OpPanel accent title="2. Đóng hàng giao khách" subtitle="Đơn bán lẻ từ nền tảng.">
          <div className="space-y-4">
            <div className="op-field"><label>Mã đơn / khách</label><input className="op-input" defaultValue="ORD-9982 (Anh Tuấn)" readOnly /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="op-field"><label>Số con</label><input className="op-input" type="number" placeholder="2" /></div>
              <div className="op-field"><label>Tổng gram</label><input className="op-input" type="number" placeholder="550" /></div>
            </div>
            <div className="op-field">
              <label>Ảnh đóng thùng</label>
              <div className="op-drop"><UploadCloud className="w-5 h-5" /> Chụp & tải ảnh</div>
            </div>
            <OpBtn variant="ink" full onClick={() => alert('Đã báo đóng hàng xong! Khách sẽ nhận thông báo.')}>
              <PackageCheck className="w-4 h-4" /> Báo hoàn tất đóng hàng
            </OpBtn>
          </div>
        </OpPanel>

        <OpPanel title="Mã QR đã sinh" action={<OpBadge tone="ok">{harvestedItems.length} mã</OpBadge>}>
          <div className="space-y-3">
            {harvestedItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#f0e8dc] bg-[#f4efe8]">
                <div className="p-1.5 bg-white rounded-lg border border-[#e8dccb]"><QrCode className="w-5 h-5" /></div>
                <div>
                  <p className="font-extrabold text-[#7d4b1a] text-xs tracking-wider">{item.id}</p>
                  <p className="text-[11px] text-[#6f675e]">{item.type} · {item.weight}</p>
                </div>
              </div>
            ))}
            <div className="op-drop"><Box className="w-6 h-6" /> Scan QR để đối chiếu</div>
          </div>
        </OpPanel>
      </div>
    </OperatorLayout>
  )
}
