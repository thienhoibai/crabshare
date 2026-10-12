import { ArrowLeft, Landmark, Receipt } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpAside, OpBack, OpBadge, OpBtn, OpHeading, OpIcon, OpNote, OpPanel, OpRow, OpSplit, OpStat } from './operatorUi'

const settlementBatches = [
  { id: 'BATCH-2026-09A', name: 'Lô cua lột 09A', type: 'Cua lột', totalRev: '125.500.000', cost: '50.000.000', profit: '75.500.000', status: 'Chờ bạn xác nhận', action: true },
  { id: 'BATCH-2026-08B', name: 'Lô cua gạch 08B', type: 'Cua gạch', totalRev: '90.200.000', cost: '40.000.000', profit: '50.200.000', status: 'Đã nhận tiền', action: false },
]

export default function OperatorSettlement() {
  const batchId = new URLSearchParams(window.location.search).get('batchId')

  if (!batchId) {
    return (
      <OperatorLayout activeTab="settlement">
        <OpHeading
          eyebrow="Đối soát"
          title="Đối soát & quyết toán"
          description="Lô đã bán xong: xem bảng kê, xác nhận để nhận phần của trại."
        />
        <div className="op-panel op-list">
          {settlementBatches.map((b) => (
            <OpRow
              key={b.id}
              href={`/operator/settlement?batchId=${b.id}`}
              media={<Receipt size={24} />}
              title={b.id}
              sub={b.name}
              mid={
                <span className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <span><small>Doanh thu</small> <b className="op-ok">{b.totalRev} ₫</b></span>
                  <span><small>Chi phí</small> <b className="op-danger">−{b.cost} ₫</b></span>
                </span>
              }
              end={
                <>
                  <OpBadge tone={b.action ? 'gold' : 'mute'}>{b.status}</OpBadge>
                  <small>Lợi nhuận gộp <b>{b.profit} ₫</b></small>
                </>
              }
            />
          ))}
        </div>
      </OperatorLayout>
    )
  }

  return (
    <OperatorLayout activeTab="settlement">
      <OpHeading
        crumb={<OpBack href="/operator/settlement"><ArrowLeft size={16} /> Quay lại danh sách lô</OpBack>}
        eyebrow={`Lô ${batchId}`}
        title="Bảng đối soát doanh thu"
        description="Lô đã bán xong · chia 60/40 theo hợp đồng."
      />

      <div className="op-split">
        <div>
          <OpStat label="Lợi nhuận gộp" value="75.500.000" unit="₫" sub="Doanh thu 125.500.000 ₫ − chi phí đã ứng 50.000.000 ₫">
            <OpSplit
              parts={[
                { label: 'Trại nhận (60%)', value: 60, display: '45.300.000 ₫', tone: 'var(--ok)' },
                { label: 'Nhà đầu tư & nền tảng (40%)', value: 40, display: '30.200.000 ₫', tone: 'var(--accent)' },
              ]}
            />
          </OpStat>

          <OpPanel title="Chi tiết">
            <dl className="op-dl">
              <dt>Doanh thu bán ra</dt><dd className="op-ok">125.500.000 ₫</dd>
              <dt>Chi phí đã ứng (Standard Cost)</dt><dd className="op-danger">−50.000.000 ₫</dd>
              <dt>Lợi nhuận gộp</dt><dd>75.500.000 ₫</dd>
              <dt>Nhà đầu tư & nền tảng (40%)</dt><dd>30.200.000 ₫</dd>
              <dt className="is-total">Thực nhận của trại (60%)</dt><dd className="is-total op-ok">45.300.000 ₫</dd>
            </dl>
          </OpPanel>
        </div>

        <OpAside>
          <OpIcon tone="ok" round><Landmark size={20} /></OpIcon>
          <p className="rd-eyebrow">Thực nhận</p>
          <p className="op-big">45.300.000 <small>₫</small></p>
          <OpNote tone="info"><b>Vietcombank · 0123456789</b><br />NGUYEN VAN A · chuyển tự động</OpNote>
          <OpBtn
            full
            onClick={() => {
              window.alert('Xác nhận thành công! Tiền sẽ được chuyển về tài khoản trong 2 giờ.')
              window.location.href = '/operator/settlement'
            }}
          >
            Xác nhận đối soát & nhận tiền
          </OpBtn>
          <p className="rd-note">Nền tảng đã thu đủ tiền bán hàng. Sau khi bạn xác nhận, hệ thống chuyển khoản trong 2 giờ.</p>
        </OpAside>
      </div>
    </OperatorLayout>
  )
}
