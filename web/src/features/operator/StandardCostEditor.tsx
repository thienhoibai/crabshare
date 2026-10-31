import { Plus, Trash2 } from 'lucide-react'
import { formatVnd } from '../../shared/lib/format'
import { costAmount } from '../../shared/lib/money'
import { costCategories, type CostItem } from './batchesApi'
import { OpBtn, OpNote, OpPanel } from './operatorUi'
import './standardCostEditor.css'

export type EditableCostItem = CostItem & { key: number }

export default function StandardCostEditor({
  items,
  disabled,
  onUpdate,
  onAdd,
  onRemove
}: {
  items: EditableCostItem[]
  disabled: boolean
  onUpdate: (key: number, patch: Partial<CostItem>) => void
  onAdd: () => void
  onRemove: (key: number) => void
}) {
  // Làm tròn từng khoản trước khi cộng để tổng trên màn hình khớp với máy chủ.
  const total = items.reduce((sum, item) => sum + costAmount(item.quantity, item.unitPrice), 0)

  return (
    <OpPanel
      title="Chi phí chuẩn"
      subtitle="Đơn giá tính bằng đồng. Khấu hao và dự phòng hao hụt không giải ngân theo lịch."
    >
      <section aria-label="Các khoản chi phí chuẩn" className="cost-editor">
        <fieldset disabled={disabled} className="cost-editor__items">
          {items.map((item, index) => (
            <section className="cost-editor__item" key={item.key} aria-label={`Khoản chi ${index + 1}`}>
              <header className="cost-editor__head">
                <h3>Khoản chi {index + 1}</h3>
                <OpBtn
                  type="button"
                  variant="ghost"
                  sm
                  aria-label={`Xóa khoản chi ${index + 1}`}
                  onClick={() => onRemove(item.key)}
                >
                  <Trash2 size={16} /> Xóa
                </OpBtn>
              </header>
              <div className="cost-editor__fields">
                <label className="op-field">
                  Hạng mục {index + 1}
                  <select
                    aria-label={`Hạng mục ${index + 1}`}
                    className="op-select"
                    value={item.category}
                    onChange={(event) =>
                      onUpdate(item.key, {
                        category: event.target.value as CostItem['category'],
                        trancheNo: event.target.value === 'Depreciation' ? null : (item.trancheNo ?? 1)
                      })
                    }
                  >
                    {Object.entries(costCategories).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="op-field">
                  Mô tả {index + 1}
                  <input
                    className="op-input"
                    required
                    maxLength={200}
                    value={item.description}
                    onChange={(event) => onUpdate(item.key, { description: event.target.value })}
                  />
                </label>
                <label className="op-field">
                  Số lượng {index + 1}
                  <input
                    className="op-input"
                    type="number"
                    required
                    min={0.001}
                    max={999999999.999}
                    step={0.001}
                    value={Number.isNaN(item.quantity) ? '' : item.quantity}
                    onChange={(event) => onUpdate(item.key, { quantity: event.target.valueAsNumber })}
                  />
                </label>
                <label className="op-field">
                  Đơn vị {index + 1}
                  <input
                    className="op-input"
                    required
                    maxLength={20}
                    value={item.unit}
                    onChange={(event) => onUpdate(item.key, { unit: event.target.value })}
                  />
                </label>
                <label className="op-field">
                  Đơn giá {index + 1}
                  <input
                    className="op-input"
                    type="number"
                    required
                    min={0}
                    max={Number.MAX_SAFE_INTEGER}
                    step={1}
                    value={Number.isNaN(item.unitPrice) ? '' : item.unitPrice}
                    onChange={(event) => onUpdate(item.key, { unitPrice: event.target.valueAsNumber })}
                  />
                </label>
                {item.category === 'Depreciation' || item.category === 'MortalityReserve' ? (
                  <div className="op-field">
                    <span>Phân bổ khoản chi</span>
                    <p className="cost-editor__allocation">
                      {item.category === 'Depreciation' ? 'Quyết toán' : 'Giữ lại'}
                    </p>
                  </div>
                ) : (
                  <label className="op-field">
                    Đợt {index + 1}
                    <input
                      className="op-input"
                      type="number"
                      required
                      min={1}
                      max={255}
                      step={1}
                      value={item.trancheNo ?? ''}
                      onChange={(event) => onUpdate(item.key, { trancheNo: event.target.valueAsNumber })}
                    />
                  </label>
                )}
              </div>
              <p className="cost-editor__amount">
                <span>Thành tiền</span>
                <strong>{formatVnd(costAmount(item.quantity, item.unitPrice))}</strong>
              </p>
            </section>
          ))}
          {items.length === 0 && (
            <p className="op-muted">Chưa có khoản chi. Thêm các chi phí dự kiến, bao gồm dự phòng hao hụt.</p>
          )}
          <OpBtn type="button" variant="outline" onClick={onAdd}>
            <Plus size={16} /> Thêm khoản chi
          </OpBtn>
        </fieldset>
      </section>
      <p className="cost-editor__total">Tổng chi phí: {formatVnd(Number.isFinite(total) ? total : 0)}</p>
      <OpNote>Thành tiền được làm tròn đến đồng cho từng khoản chi trước khi cộng tổng.</OpNote>
    </OpPanel>
  )
}
