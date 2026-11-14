/* Kế hoạch chi phí và mốc giải ngân của một Lô nháp (PUT /api/batches/{code}/cost-plan, BR-030…036, BR-145, BR-146).
   Hệ thống tự tính Chi phí chuẩn mỗi con (làm tròn lên) và vốn mục tiêu; người nuôi không nhập hai số này.
   Bắt buộc có khoản dự phòng hao hụt do Lô chịu. Không gửi mốc thì hệ thống tạo mốc mặc định: nhận cua xong, giữa vụ, quyết toán. */
import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import type { BatchResponse, CostItemRequest, CostPlanRequest, MilestoneRequest } from '../../shared/api/api.gen'
import {
  Checkbox, DecimalInput, Field, Input, Money, MoneyInput, OpBtn, OpDl, OpFacts, OpMore, OpNote, OpPanel, Select, errorMessage, formatVnd, options, useSend,
} from '../../shared/ui/console'
import { costBearerLabel, milestoneKindLabel } from './opA'

type ItemDraft = { id: number; category: string; description: string; quantity: number | null; unit: string; unitPrice: number | null; basis: string; costBearer: string }
type StoneDraft = { id: number; kind: string; name: string; pct: number | null; unlockCondition: string }

let nextId = 1
const newItem = (category: string, description = '', unit = ''): ItemDraft => ({ id: nextId++, category, description, quantity: null, unit, unitPrice: null, basis: '', costBearer: 'Batch' })
const newStone = (kind: string, name: string): StoneDraft => ({ id: nextId++, kind, name, pct: null, unlockCondition: '' })

const amountOf = (i: ItemDraft) => Math.round((i.quantity ?? 0) * (i.unitPrice ?? 0))
const BEARERS = ['Batch', 'Executor', 'Supplier']
const KINDS = ['Receipt', 'MidCycle', 'Custom', 'Settlement']

function initialItems(batch: BatchResponse): ItemDraft[] {
  const saved = batch.costPlan?.items ?? []
  // Lô mới: gợi ý sẵn ba khoản thường gặp, có khoản dự phòng hao hụt bắt buộc.
  if (saved.length === 0) return [newItem('Seed', 'Cua đầu vào', 'con'), newItem('Feed', 'Thức ăn', 'kg'), newItem('MortalityReserve', 'Dự phòng hao hụt', 'gói')]
  return saved.map((i) => ({
    id: nextId++, category: i.category, description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, basis: i.basis ?? '', costBearer: i.costBearer ?? 'Batch',
  }))
}

export default function CostPlanEditor({ batch }: { batch: BatchResponse }) {
  const [items, setItems] = useState<ItemDraft[]>(() => initialItems(batch))
  const saved = batch.costPlan?.milestones ?? []
  const [custom, setCustom] = useState(false)
  const [stones, setStones] = useState<StoneDraft[]>(() => saved.length
    ? saved.map((m) => ({ id: nextId++, kind: m.kind, name: m.name, pct: m.pct, unlockCondition: m.unlockCondition }))
    : [newStone('Receipt', 'Nhận cua xong'), newStone('MidCycle', 'Giữa vụ'), newStone('Settlement', 'Quyết toán')])
  const save = useSend<BatchResponse, CostPlanRequest>('put', `/api/batches/${encodeURIComponent(batch.batchCode)}/cost-plan`, { success: 'Đã lưu kế hoạch chi phí.', quietError: true })

  const patch = (id: number, part: Partial<ItemDraft>) => setItems((old) => old.map((i) => (i.id === id ? { ...i, ...part } : i)))
  const patchStone = (id: number, part: Partial<StoneDraft>) => setStones((old) => old.map((s) => (s.id === id ? { ...s, ...part } : s)))

  const batchTotal = items.filter((i) => i.costBearer === 'Batch').reduce((sum, i) => sum + amountOf(i), 0)
  const perCrab = batch.plannedQuantity > 0 ? Math.ceil(batchTotal / batch.plannedQuantity) : 0
  const target = perCrab * batch.plannedQuantity
  const hasReserve = items.some((i) => i.category === 'MortalityReserve' && i.costBearer === 'Batch' && amountOf(i) > 0)
  const complete = items.length > 0 && items.every((i) => i.description.trim() && i.unit.trim() && i.quantity !== null && i.quantity > 0 && i.unitPrice !== null)
  const pctTotal = Number(stones.reduce((sum, s) => sum + (s.pct ?? 0), 0).toFixed(2))
  const stonesOk = !custom || (stones.length > 0 && stones.every((s) => s.name.trim() && s.pct !== null && s.pct > 0) && pctTotal === 100 && stones[stones.length - 1].kind === 'Settlement')
  const missing = [
    !complete && 'Mỗi khoản cần mô tả, số lượng, đơn vị và đơn giá',
    !hasReserve && 'Cần khoản dự phòng hao hụt do Lô chịu',
    custom && pctTotal !== 100 && `Tổng tỷ lệ các mốc đang là ${pctTotal}%, cần đủ 100%`,
    custom && stones[stones.length - 1]?.kind !== 'Settlement' && 'Mốc cuối phải là mốc quyết toán',
    custom && !stonesOk && 'Mỗi mốc cần tên và tỷ lệ',
  ].filter(Boolean) as string[]

  const submit = () => {
    const body: CostPlanRequest = {
      items: items.map<CostItemRequest>((i) => ({
        category: i.category, description: i.description.trim(), quantity: i.quantity ?? 0, unit: i.unit.trim(), unitPrice: i.unitPrice ?? 0,
        basis: i.basis.trim() || null, costBearer: i.costBearer,
      })),
      milestones: custom
        ? stones.map<MilestoneRequest>((s, index) => ({ no: index + 1, kind: s.kind, name: s.name.trim(), pct: s.pct ?? 0, unlockCondition: s.unlockCondition.trim() || null }))
        : null,
    }
    save.mutate(body)
  }

  return (
    <>
      <OpFacts items={[
        { label: 'Tổng Chi phí chuẩn', value: formatVnd(batchTotal) },
        { label: 'Mỗi con', value: formatVnd(perCrab) },
        { label: 'Vốn mục tiêu', value: formatVnd(target), tone: 'info' },
        { label: 'Số con', value: batch.plannedQuantity },
      ]} />

      <OpPanel
        title="Các khoản chi"
        subtitle="Chi phí chuẩn mỗi con bằng tổng các khoản do Lô chịu chia số con, làm tròn lên. Vốn mục tiêu bằng số đó nhân số con."
        action={<OpBtn variant="ghost" sm onClick={() => setItems((old) => [...old, newItem('Other')])}><Plus size={15} /> Thêm khoản</OpBtn>}
      >
        {items.map((i, index) => (
          <div key={i.id} className="op-subform">
            <Field label="Nhóm">
              <Select sm value={i.category} onChange={(e) => patch(i.id, { category: e.target.value })}>
                {options('costCategory').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Mô tả">
              <Input sm value={i.description} maxLength={200} onChange={(e) => patch(i.id, { description: e.target.value })} />
            </Field>
            <Field label="Số lượng">
              <DecimalInput sm value={i.quantity} onChange={(v) => patch(i.id, { quantity: v })} />
            </Field>
            <Field label="Đơn vị">
              <Input sm value={i.unit} maxLength={20} onChange={(e) => patch(i.id, { unit: e.target.value })} placeholder="con, kg, tháng" />
            </Field>
            <Field label="Đơn giá">
              <MoneyInput sm value={i.unitPrice} onChange={(v) => patch(i.id, { unitPrice: v })} />
            </Field>
            <div className="op-between is-wide">
              <span>Thành tiền <b className="rd-num">{formatVnd(amountOf(i))}</b>{i.costBearer !== 'Batch' && <span className="rd-muted"> · {costBearerLabel(i.costBearer)}</span>}</span>
              <OpBtn variant="ghost" sm onClick={() => setItems((old) => old.filter((x) => x.id !== i.id))} disabled={items.length === 1} aria-label={`Xoá khoản ${index + 1}`}><Trash2 size={14} /></OpBtn>
            </div>
            <div className="is-wide">
              <OpMore label="Bên chịu, căn cứ">
                <div className="op-form__row">
                  <Field label="Bên chịu chi phí">
                    <Select sm value={i.costBearer} onChange={(e) => patch(i.id, { costBearer: e.target.value })}>
                      {BEARERS.map((b) => <option key={b} value={b}>{costBearerLabel(b)}</option>)}
                    </Select>
                  </Field>
                  <Field label="Căn cứ">
                    <Input sm value={i.basis} maxLength={300} onChange={(e) => patch(i.id, { basis: e.target.value })} placeholder="Báo giá, định mức" />
                  </Field>
                </div>
              </OpMore>
            </div>
          </div>
        ))}
      </OpPanel>

      <OpPanel title="Mốc giải ngân" subtitle="Để mặc định thì hệ thống chia ba mốc theo các khoản chi: nhận cua xong, giữa vụ, quyết toán.">
        {saved.length > 0 && !custom && (
          <OpDl items={saved.map((m) => ({ label: `Mốc ${m.no} · ${m.name} · ${m.pct}%`, value: <Money value={m.plannedAmount} /> }))} />
        )}
        <OpMore label="Tự khai mốc" defaultOpen={custom}>
          <Checkbox checked={custom} onChange={setCustom}>Dùng các mốc dưới đây thay cho mốc mặc định</Checkbox>
          {custom && (
            <>
              {stones.map((s, index) => (
                <div key={s.id} className="op-subform">
                  <Field label={`Mốc ${index + 1}`}>
                    <Select sm value={s.kind} onChange={(e) => patchStone(s.id, { kind: e.target.value })}>
                      {KINDS.map((k) => <option key={k} value={k}>{milestoneKindLabel(k)}</option>)}
                    </Select>
                  </Field>
                  <Field label="Tên mốc">
                    <Input sm value={s.name} maxLength={100} onChange={(e) => patchStone(s.id, { name: e.target.value })} />
                  </Field>
                  <Field label="Tỷ lệ">
                    <DecimalInput sm unit="%" value={s.pct} onChange={(v) => patchStone(s.id, { pct: v })} />
                  </Field>
                  <Field label="Điều kiện mở mốc" className="is-wide">
                    <Input sm value={s.unlockCondition} maxLength={300} onChange={(e) => patchStone(s.id, { unlockCondition: e.target.value })} placeholder="Để trống: theo loại mốc" />
                  </Field>
                  <div className="op-between is-wide">
                    <span>Khi đủ vốn <b className="rd-num">{formatVnd(Math.floor(((s.pct ?? 0) / 100) * target))}</b></span>
                    <OpBtn variant="ghost" sm onClick={() => setStones((old) => old.filter((x) => x.id !== s.id))} disabled={stones.length === 1} aria-label={`Xoá mốc ${index + 1}`}><Trash2 size={14} /></OpBtn>
                  </div>
                </div>
              ))}
              <div className="op-between">
                <OpBtn variant="ghost" sm onClick={() => setStones((old) => [...old.slice(0, -1), newStone('Custom', ''), ...old.slice(-1)])}><Plus size={15} /> Thêm mốc</OpBtn>
                <span className={pctTotal === 100 ? 'op-ok' : 'op-danger'}>Tổng <b>{pctTotal}%</b></span>
              </div>
            </>
          )}
        </OpMore>
      </OpPanel>

      {save.isError && <OpNote tone="danger">{errorMessage(save.error)}</OpNote>}
      <div className="op-formfoot">
        {missing.length > 0 && <span className="op-warn" style={{ fontSize: 14, marginRight: 'auto' }}>{missing[0]}</span>}
        <OpBtn onClick={submit} disabled={missing.length > 0 || save.isPending}><Save size={16} /> {save.isPending ? 'Đang lưu…' : 'Lưu chi phí'}</OpBtn>
      </div>
    </>
  )
}
