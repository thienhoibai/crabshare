/* /admin/settlements/:id — Bảng quyết toán của một Lô (GET /api/admin/settlements/{id}).
   Thân trang là bảng tính; dòng nhà đầu tư, góp ý và lệnh chi nằm sau các tab. Cột phải (SettlementActions) cho biết bảng đang ở bước nào
   và có đúng một nút cho việc kế tiếp. */
import { useState } from 'react'
import { useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import type { PaymentInstructionResponse, SettlementResponse } from '../../../shared/api/api.gen'
import {
  Money, OpBack, OpEmpty, OpFacts, OpHeading, OpPanel, OpTable, OpTabs, QueryView, StatusBadge,
  formatVnd, label, useGet, type Fact, type TabItem,
} from '../../../shared/ui/console'
import { Cell } from '../quality/shared'
import SettlementActions from './SettlementActions'
import SettlementFeedback from './SettlementFeedback'
import { InvestorLines, SettlementSheet } from './SettlementSheet'
import { SETTLEMENT_INSTRUCTION_TYPES, isLocked, operatorPayout } from './financeModel'

type Tab = 'sheet' | 'investors' | 'feedback' | 'instructions'

const crumb = <OpBack href="/admin/settlements"><ArrowLeft size={16} /> Quyết toán</OpBack>

function facts(s: SettlementResponse): Fact[] {
  const b = s.breakdown
  const revenue: Fact = { label: 'Doanh thu thực thu', value: formatVnd(s.actualRevenue) }
  if (b.mode === 'P') {
    return [
      revenue,
      { label: 'Còn lại sau phí và chi phí', value: formatVnd(s.revenuePool), tone: s.revenuePool < 0 ? 'danger' : 'ok' },
      { label: 'Nhà đầu tư thực nhận', value: formatVnd(s.totalNetPayout) },
      { label: 'Người nuôi nhận', value: formatVnd(operatorPayout(s)) },
    ]
  }
  if (b.mode === 'T') {
    return [
      revenue,
      { label: 'Giá vốn và chi phí', value: formatVnd(s.lockedStandardCost) },
      { label: 'Kết quả thương vụ', value: formatVnd(s.revenuePool), tone: s.revenuePool < 0 ? 'danger' : 'ok' },
    ]
  }
  return [
    revenue,
    { label: 'Hoa hồng của nền tảng', value: formatVnd(b.commissionAmount) },
    { label: 'Trả nhà cung cấp', value: formatVnd(b.supplierPayout) },
  ]
}

/** Các lệnh chi mà việc duyệt bảng đã lập cho Lô này. */
function SettlementInstructions({ s }: { s: SettlementResponse }) {
  const instructions = useGet<PaymentInstructionResponse[]>('/api/admin/payment-instructions', { BatchCode: s.batchCode })
  return (
    <OpPanel action={<a className="op-link" href={`/admin/finance?batch=${encodeURIComponent(s.batchCode)}`}>Gửi lại từng lệnh</a>}>
      <QueryView query={instructions}>
        {(list) => (
          <OpTable
            rows={list.filter((i) => SETTLEMENT_INSTRUCTION_TYPES.includes(i.type))}
            rowKey={(i) => i.instructionId}
            empty="Bảng này không lập lệnh chi nào"
            columns={[
              { key: 'type', header: 'Lệnh chi', cell: (i) => <Cell main={<StatusBadge kind="instructionType" value={i.type} />} sub={`Số ${i.instructionId}`} /> },
              { key: 'to', header: 'Người nhận', cell: (i) => <Cell main={i.beneficiary ?? (i.type === 'PlatformFee' || i.type === 'Commission' ? 'Nền tảng CrabShare' : 'Theo ghi chú')} sub={i.note} /> },
              { key: 'amount', header: 'Số tiền', num: true, cell: (i) => <Money value={i.amount} /> },
              { key: 'status', header: 'Trạng thái', cell: (i) => <StatusBadge kind="instruction" value={i.status} /> },
            ]}
          />
        )}
      </QueryView>
    </OpPanel>
  )
}

export default function SettlementDetailPage() {
  const { id = '' } = useParams()
  const valid = /^\d+$/.test(id)
  const settlement = useGet<SettlementResponse>(valid ? `/api/admin/settlements/${id}` : null)
  const [picked, setPicked] = useState<Tab>('sheet')

  if (!valid) {
    return (
      <>
        <OpHeading crumb={crumb} eyebrow="Tiền" title="Không tìm thấy bảng quyết toán" />
        <OpEmpty title="Mã bảng quyết toán không hợp lệ" />
      </>
    )
  }

  return (
    <QueryView query={settlement}>
      {(s) => {
        const isP = s.breakdown.mode === 'P'
        const openFeedback = s.feedback.filter((f) => f.status === 'Open').length
        const tabs: TabItem<Tab>[] = [
          { key: 'sheet', label: 'Bảng tính' },
          ...(isP ? [{ key: 'investors' as const, label: 'Nhà đầu tư', count: s.investorCount }] : []),
          ...(isP && (s.status !== 'Draft' || s.feedback.length > 0) ? [{ key: 'feedback' as const, label: 'Góp ý', count: openFeedback }] : []),
          ...(isLocked(s.status) && s.breakdown.mode !== 'T' ? [{ key: 'instructions' as const, label: 'Lệnh chi' }] : []),
        ]
        const tab = tabs.some((t) => t.key === picked) ? picked : 'sheet'
        return (
          <>
            <OpHeading
              crumb={crumb}
              eyebrow={`${s.batchCode} · ${label('batchMode', s.breakdown.mode)}`}
              title={`Quyết toán ${s.batchTitle}`}
              action={<StatusBadge kind="settlement" value={s.status} />}
            />
            <OpFacts items={facts(s)} />
            <div className="op-split">
              <div>
                {tabs.length > 1 && <OpTabs items={tabs} value={tab} onChange={setPicked} />}
                {tab === 'sheet' && <SettlementSheet s={s} />}
                {tab === 'investors' && <InvestorLines s={s} />}
                {tab === 'feedback' && <SettlementFeedback s={s} />}
                {tab === 'instructions' && <SettlementInstructions s={s} />}
              </div>
              <SettlementActions s={s} onShowFeedback={() => setPicked('feedback')} />
            </div>
          </>
        )
      }}
    </QueryView>
  )
}
