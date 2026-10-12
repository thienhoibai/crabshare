import { useState } from 'react'
import { ArrowLeft, Calendar, DollarSign, Package, Send } from 'lucide-react'
import { formatVnd } from '../../shared/lib/format'
import OperatorLayout from './OperatorLayout'
import { OpAside, OpBack, OpBtn, OpHeading, OpNote, OpPanel, crabImg } from './operatorUi'

const CRAB_TYPES = ['Cua lột', 'Cua gạch', 'Cua thịt']

export default function OperatorCreateBatch() {
  const [type, setType] = useState(CRAB_TYPES[0])
  const [seed, setSeed] = useState('1500')
  const [days, setDays] = useState('45')
  const [cap, setCap] = useState('75000000')
  const target = Math.max(0, Number(cap) || 0)
  const minContribution = Math.max(1_000_000, Math.round(target / 100))

  return (
    <OperatorLayout activeTab="batch">
      <OpHeading
        crumb={<OpBack href="/operator/batch"><ArrowLeft size={16} /> Quay lại danh sách lô</OpBack>}
        eyebrow="Standard Cost"
        title="Đề xuất lô nuôi mới"
        description="Lên kế hoạch ngân sách (giống, cám, điện) trước khi mở gọi vốn."
      />

      <div className="op-split">
        <div>
          <OpPanel>
            <form className="op-form" onSubmit={(e) => e.preventDefault()}>
              <div className="op-form__group">
                <h2 className="rd-h3">Thông tin lô</h2>
                <div className="op-form__row">
                  <div className="op-field">
                    <label htmlFor="cb-title">Tên lô (tiêu đề gọi vốn)</label>
                    <input id="cb-title" className="op-input" placeholder="VD: Lô cua lột tháng 11" defaultValue="Lô cua lột tháng 11" />
                  </div>
                  <div className="op-field">
                    <label htmlFor="cb-type">Loại cua</label>
                    <select id="cb-type" className="op-select" value={type} onChange={(e) => setType(e.target.value)}>
                      {CRAB_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="op-form__group">
                <h2 className="rd-h3">Quy mô & vốn</h2>
                <div className="op-form__row">
                  <div className="op-field">
                    <label htmlFor="cb-seed"><Package size={14} /> Số con giống</label>
                    <input id="cb-seed" className="op-input" type="number" value={seed} onChange={(e) => setSeed(e.target.value)} />
                  </div>
                  <div className="op-field">
                    <label htmlFor="cb-days"><Calendar size={14} /> Chu kỳ (ngày)</label>
                    <input id="cb-days" className="op-input" type="number" value={days} onChange={(e) => setDays(e.target.value)} />
                  </div>
                  <div className="op-field">
                    <label htmlFor="cb-cap"><DollarSign size={14} /> Vốn mục tiêu (đồng)</label>
                    <input id="cb-cap" className="op-input" type="number" step={1_000_000} value={cap} onChange={(e) => setCap(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="op-form__group">
                <h2 className="rd-h3">Định mức chi phí sơ bộ</h2>
                <textarea className="op-textarea" rows={4} aria-label="Định mức chi phí" placeholder="Chi phí giống, thức ăn, điện nước, nhân công..." defaultValue="Giống 28tr · Cám 22tr · Điện RAS 12tr · Nhân công 8tr · Dự phòng 5tr" />
                <OpNote>Sau khi gửi, Admin chốt bảng Standard Cost và hợp đồng trước khi mở gọi vốn công khai.</OpNote>
              </div>
            </form>
          </OpPanel>
        </div>

        <OpAside>
          <div className="op-cover" style={{ aspectRatio: '16 / 9' }}><img src={crabImg(type, 720)} alt="" /></div>
          <p className="rd-eyebrow">Vốn mục tiêu</p>
          <p className="op-big">{formatVnd(target)}</p>
          <dl className="op-dl">
            <dt>Lô chạy khi đạt (80%)</dt><dd>{formatVnd(target * 0.8)}</dd>
            <dt>Dừng nhận vốn ở (120%)</dt><dd>{formatVnd(target * 1.2)}</dd>
            <dt>Góp tối thiểu</dt><dd>{formatVnd(minContribution)}</dd>
            <dt>Quy mô</dt><dd>{Number(seed || 0).toLocaleString('vi-VN')} con · {days || 0} ngày</dd>
          </dl>
          <OpBtn
            full
            onClick={() => {
              window.alert('Đã gửi đề xuất mở lô nuôi mới!')
              window.location.href = '/operator/batch'
            }}
          >
            <Send size={16} /> Gửi đề xuất
          </OpBtn>
          <p className="rd-note">Chưa đủ 80% vốn đúng hạn thì lô không chạy và tiền hoàn lại nhà đầu tư.</p>
        </OpAside>
      </div>
    </OperatorLayout>
  )
}
