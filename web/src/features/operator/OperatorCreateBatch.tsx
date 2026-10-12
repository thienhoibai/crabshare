import { useState } from 'react'
import { Send, DollarSign, Package, Calendar } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpBtn, OpHeading, OpNote, OpPanel } from './operatorUi'

export default function OperatorCreateBatch() {
  const [seed, setSeed] = useState('1500')
  const [days, setDays] = useState('45')
  const [cap, setCap] = useState('75000000')

  return (
    <OperatorLayout activeTab="batch">
      <OpHeading
        eyebrow="UC-01 · Standard cost"
        title="Đề xuất lô nuôi mới"
        description="Lên kế hoạch ngân sách (giống, cám, điện) trước khi mở gọi vốn."
      />

      <OpPanel className="max-w-3xl">
        <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="op-field">
              <label>Tên lô (tiêu đề gọi vốn)</label>
              <input className="op-input" placeholder="VD: Lô cua lột tháng 11" defaultValue="Lô cua lột tháng 11" />
            </div>
            <div className="op-field">
              <label>Loại cua</label>
              <select className="op-select">
                <option>Cua lột (SoftShell Crab)</option>
                <option>Cua gạch (Roe Crab)</option>
                <option>Cua thịt (Fattening Mud Crab)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="op-field">
              <label className="flex items-center gap-1.5"><Package className="w-4 h-4 text-[#7d4b1a]" /> Số con giống</label>
              <input className="op-input" type="number" value={seed} onChange={(e) => setSeed(e.target.value)} />
            </div>
            <div className="op-field">
              <label className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-[#7d4b1a]" /> Chu kỳ (ngày)</label>
              <input className="op-input" type="number" value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
            <div className="op-field">
              <label className="flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-[#7d4b1a]" /> Vốn mục tiêu</label>
              <input className="op-input" type="number" value={cap} onChange={(e) => setCap(e.target.value)} />
            </div>
          </div>
          <div className="op-field">
            <label>Định mức chi phí sơ bộ</label>
            <textarea className="op-textarea" rows={4} placeholder="Chi phí giống, thức ăn, điện nước, nhân công..." defaultValue="Giống 28tr · Cám 22tr · Điện RAS 12tr · Nhân công 8tr · Dự phòng 5tr" />
          </div>
          <OpNote>
            <div>
              <strong>Sau khi gửi,</strong> Admin sẽ chốt bảng Standard Cost và hợp đồng trước khi mở gọi vốn công khai.
            </div>
          </OpNote>
          <OpBtn
            full
            onClick={() => {
              window.alert('Đã gửi đề xuất mở lô nuôi mới!')
              window.location.href = '/operator/batch'
            }}
          >
            <Send className="w-4 h-4" /> Gửi đề xuất lên platform
          </OpBtn>
        </form>
      </OpPanel>
    </OperatorLayout>
  )
}
