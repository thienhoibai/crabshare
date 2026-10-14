import type { CostItem, CostTranche } from './batchesApi'
import { formatVnd } from '../../shared/lib/format'
import { costAmount } from '../../shared/lib/money'

export const scheduledItems = (items: CostItem[]) => items.filter(i => i.category !== 'Depreciation' && i.category !== 'MortalityReserve')
export const scheduleNumbers = (items: CostItem[]) => [...new Set(scheduledItems(items).map(i => i.trancheNo).filter((n): n is number => n !== null && Number.isInteger(n) && n > 0))].sort((a, b) => a - b)

export default function CostScheduleEditor({ items, plans, onChange, disabled }: { items: CostItem[]; plans: CostTranche[]; onChange: (p: CostTranche[]) => void; disabled: boolean }) {
  const numbers = scheduleNumbers(items)
  const update = (number: number, patch: Partial<CostTranche>) => {
    const old = plans.find(p => p.trancheNo === number) ?? { trancheNo: number, plannedDate: '', unlockCondition: '' }
    onChange([...plans.filter(p => p.trancheNo !== number), { ...old, ...patch }])
  }
  return <fieldset disabled={disabled} className="border-0 p-0 m-0 min-w-0 space-y-4">
    <p className="text-sm text-slate-600">Bạn chọn ngày dự kiến và điều kiện cho từng đợt. Dự phòng hao hụt giữ lại trong tài khoản lô; khấu hao trả khi quyết toán.</p>
    {numbers.length === 0 && <p>Chưa có khoản chi theo đợt.</p>}
    {numbers.map(n => {
      const plan = plans.find(p => p.trancheNo === n)
      const amount = scheduledItems(items).filter(i => i.trancheNo === n).reduce((s, i) => s + costAmount(i.quantity, i.unitPrice), 0)
      return <div key={n} className="border border-slate-200 rounded-lg p-4 space-y-3">
        <h3 className="font-bold">Đợt {n} — {formatVnd(amount)}</h3>
        <div className="op-field"><label htmlFor={`plan-date-${n}`}>Ngày dự kiến đợt {n}</label><input id={`plan-date-${n}`} className="op-input" type="date" value={plan?.plannedDate ?? ''} onChange={e => update(n, { plannedDate: e.target.value })} /></div>
        <div className="op-field"><label htmlFor={`plan-condition-${n}`}>Điều kiện đợt {n}</label><textarea id={`plan-condition-${n}`} className="op-input" maxLength={300} value={plan?.unlockCondition ?? ''} onChange={e => update(n, { unlockCondition: e.target.value })} /></div>
      </div>
    })}
    <p className="text-sm text-slate-500">Có thể lưu nháp trước; cần hoàn thành lịch từng đợt trước khi gửi duyệt. Đây là lịch dự kiến để đưa vào thỏa thuận, chưa phải lệnh chi tiền.</p>
  </fieldset>
}
