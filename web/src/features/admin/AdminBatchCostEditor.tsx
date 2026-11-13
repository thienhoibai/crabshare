/* Soạn kế hoạch chi phí cho Lô T, A do Quản trị tạo (BR-030…036). PUT /api/batches/{code}/cost-plan (CostPlanRequest).
   Không gửi mốc giải ngân: hệ thống tự tạo mốc mặc định theo nhóm chi phí (BR-145). Lô P do người nuôi soạn ở cổng người nuôi. */
import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import type { BatchResponse, CostItemRequest, CostPlanRequest } from '../../shared/api/api.gen'
import {
  DecimalInput, Input, MoneyInput, OpBtn, OpFacts, OpNote, OpPanel, Select, errorMessage, formatVnd, options, useSend,
} from '../../shared/ui/console'
import { COST_BEARER_OPTIONS } from './adminPartA'

interface Row { id: number; category: string; description: string; quantity: number | null; unit: string; unitPrice: number | null; costBearer: string }

let nextId = 1
const blank = (category: string, description = '', unit = ''): Row => ({ id: nextId++, category, description, quantity: null, unit, unitPrice: null, costBearer: 'Batch' })
const amountOf = (r: Row) => Math.round((r.quantity ?? 0) * (r.unitPrice ?? 0))

export default function AdminBatchCostEditor({ batch }: { batch: BatchResponse }) {
  const [rows, setRows] = useState<Row[]>(() => (batch.costPlan?.items.length
    ? batch.costPlan.items.map((i) => ({
        id: nextId++, category: i.category, description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, costBearer: i.costBearer ?? 'Batch',
      }))
    : [
        { ...blank('Seed', 'Cua đầu vào', 'con'), quantity: batch.plannedQuantity },
        { ...blank('MortalityReserve', 'Dự phòng hao hụt', 'gói'), quantity: 1 },
      ]))
  const [message, setMessage] = useState('')
  const save = useSend<BatchResponse, CostPlanRequest>('put', `/api/batches/${encodeURIComponent(batch.batchCode)}/cost-plan`, {
    success: 'Đã lưu kế hoạch chi phí.', quietError: true,
  })

  const patch = (id: number, part: Partial<Row>) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...part } : r)))
  const total = rows.filter((r) => r.costBearer === 'Batch').reduce((n, r) => n + amountOf(r), 0)
  const perCrab = batch.plannedQuantity > 0 ? Math.ceil(total / batch.plannedQuantity) : 0

  const problem = (): string | null => {
    if (rows.length === 0) return 'Cần ít nhất một khoản chi.'
    for (const [i, r] of rows.entries()) {
      if (!r.description.trim() || !r.unit.trim()) return `Dòng ${i + 1}: nhập tên khoản chi và đơn vị.`
      if (!r.quantity || r.quantity <= 0) return `Dòng ${i + 1}: số lượng phải lớn hơn 0.`
      if (r.unitPrice === null) return `Dòng ${i + 1}: nhập đơn giá.`
    }
    if (!rows.some((r) => r.category === 'MortalityReserve' && r.costBearer === 'Batch' && amountOf(r) > 0)) return 'Cần có khoản dự phòng hao hụt do Lô chịu.'
    return null
  }

  const submit = () => {
    const issue = problem()
    setMessage(issue ?? '')
    if (issue) return
    const items: CostItemRequest[] = rows.map((r) => ({
      category: r.category, description: r.description.trim(), quantity: r.quantity ?? 0, unit: r.unit.trim(), unitPrice: r.unitPrice ?? 0, costBearer: r.costBearer,
    }))
    save.mutate({ items, milestones: null })
  }

  return (
    <OpPanel
      title="Soạn kế hoạch chi phí"
      subtitle="Mốc giải ngân được tạo tự động theo nhóm chi phí sau khi lưu."
      action={<OpBtn sm variant="ghost" onClick={() => setRows((list) => [...list, blank('Other')])}><Plus size={15} /> Thêm khoản</OpBtn>}
    >
      <div className="op-tablewrap">
        <table className="op-table">
          <thead>
            <tr>
              <th>Nhóm</th>
              <th>Khoản chi</th>
              <th>Số lượng, đơn vị</th>
              <th>Đơn giá</th>
              <th>Bên chịu</th>
              <th className="is-num">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td>
                  <Select sm aria-label={`Nhóm chi phí dòng ${i + 1}`} value={r.category} onChange={(e) => patch(r.id, { category: e.target.value })}>
                    {options('costCategory').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </td>
                <td><Input sm aria-label={`Tên khoản chi dòng ${i + 1}`} value={r.description} maxLength={200} onChange={(e) => patch(r.id, { description: e.target.value })} /></td>
                <td>
                  <span className="op-inline" style={{ flexWrap: 'nowrap' }}>
                    <DecimalInput sm aria-label={`Số lượng dòng ${i + 1}`} value={r.quantity} onChange={(v) => patch(r.id, { quantity: v })} />
                    <Input sm aria-label={`Đơn vị dòng ${i + 1}`} value={r.unit} maxLength={20} onChange={(e) => patch(r.id, { unit: e.target.value })} placeholder="con, kg" />
                  </span>
                </td>
                <td><MoneyInput sm aria-label={`Đơn giá dòng ${i + 1}`} value={r.unitPrice} onChange={(v) => patch(r.id, { unitPrice: v })} /></td>
                <td>
                  <Select sm aria-label={`Bên chịu dòng ${i + 1}`} value={r.costBearer} onChange={(e) => patch(r.id, { costBearer: e.target.value })}>
                    {COST_BEARER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </td>
                <td className="is-num">
                  <span className="op-inline" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    {formatVnd(amountOf(r))}
                    <button type="button" className="rd-iconbtn" aria-label={`Xoá dòng ${i + 1}`} onClick={() => setRows((list) => list.filter((x) => x.id !== r.id))}><Trash2 size={16} /></button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <OpFacts items={[
        { label: 'Tổng chi phí Lô chịu', value: formatVnd(total) },
        { label: `Mỗi con (${batch.plannedQuantity} con)`, value: formatVnd(perCrab) },
      ]} />
      {message && <OpNote tone="danger">{message}</OpNote>}
      {!message && save.isError && <OpNote tone="danger">{errorMessage(save.error)}</OpNote>}
      <div className="op-formfoot">
        <OpBtn variant="ink" onClick={submit} disabled={save.isPending}><Save size={17} /> {save.isPending ? 'Đang lưu…' : 'Lưu kế hoạch chi phí'}</OpBtn>
      </div>
    </OpPanel>
  )
}
