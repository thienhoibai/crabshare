import { useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ActionDialog } from '../../shared/ui/ActionDialog'
import { errorMessage } from '../../shared/api/http'
import { OpBtn, OpNote } from './operatorUi'
import { stockBatch, type Batch, type StockingResult } from './batchesApi'

export default function StockingDialog({
  batch,
  onClose,
  onStocked
}: {
  batch: Batch
  onClose: () => void
  onStocked: (result: StockingResult) => Promise<void>
}) {
  const [from, setFrom] = useState('1')
  const [to, setTo] = useState(String(batch.seedQuantity))
  const [width, setWidth] = useState('4')
  const [confirming, setConfirming] = useState(false)
  const inFlight = useRef(false)
  const range = { from: Number(from), to: Number(to), width: Number(width) }
  const count = range.to - range.from + 1
  const valid =
    [range.from, range.to, range.width].every(Number.isInteger) &&
    range.from >= 1 &&
    range.to >= range.from &&
    range.to <= 2147483647 &&
    range.width >= 1 &&
    range.width <= 30 &&
    count === batch.seedQuantity
  const preview = valid
    ? `${String(range.from).padStart(range.width, '0')}–${String(range.to).padStart(range.width, '0')}`
    : '—'
  const mutation = useMutation({
    mutationFn: () => stockBatch(batch.batchCode, range),
    onSuccess: onStocked,
    onError: () => setConfirming(false),
    onSettled: () => {
      inFlight.current = false
    },
    retry: false
  })
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || inFlight.current) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    inFlight.current = true
    mutation.mutate()
  }
  return (
    <ActionDialog
      title={confirming ? 'Xác nhận thả giống' : 'Thả giống'}
      theme="operator"
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form onSubmit={submit} className="grid gap-4">
        <OpNote>Mỗi hộp chứa 1 con cua. Chỉ xác nhận sau khi đã thả giống thực tế.</OpNote>
        <p>
          Lô <b>{batch.batchCode}</b> cần thả{' '}
          <b>{batch.seedQuantity.toLocaleString('vi-VN')} con cua giống</b>.
        </p>
        <fieldset disabled={mutation.isPending || confirming} className="grid gap-3 sm:grid-cols-3 min-w-0">
          <label className="op-field">
            Số hộp đầu
            <input
              className="op-input"
              type="number"
              required
              min={1}
              max={2147483647}
              step={1}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                mutation.reset()
              }}
            />
          </label>
          <label className="op-field">
            Số hộp cuối
            <input
              className="op-input"
              type="number"
              required
              min={1}
              max={2147483647}
              step={1}
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                mutation.reset()
              }}
            />
          </label>
          <label className="op-field">
            Số chữ số trên nhãn
            <input
              className="op-input"
              type="number"
              required
              min={1}
              max={30}
              step={1}
              value={width}
              onChange={(e) => {
                setWidth(e.target.value)
                mutation.reset()
              }}
            />
          </label>
        </fieldset>
        <p className="op-muted">Dùng đúng số chữ số khi đánh số hộp; số dài hơn vẫn được giữ nguyên.</p>
        <div className="rounded-2xl border border-current/10 p-4 grid gap-2" aria-live="polite">
          <p>
            Khoảng hộp: <b>{preview}</b>
          </p>
          <p>
            Đã chọn: <b>{Number.isInteger(count) && count > 0 ? count.toLocaleString('vi-VN') : 0} hộp</b> /{' '}
            {batch.seedQuantity.toLocaleString('vi-VN')} hộp cần thả
          </p>
        </div>
        {!valid && (
          <p role="status">Chọn khoảng hợp lệ và đúng {batch.seedQuantity.toLocaleString('vi-VN')} hộp.</p>
        )}
        {confirming && (
          <OpNote tone="info">
            Bạn xác nhận đã thả thực tế {batch.seedQuantity.toLocaleString('vi-VN')} con cua vào các hộp{' '}
            {preview}? Sau khi ghi nhận, lô sẽ chuyển sang đang sản xuất.
          </OpNote>
        )}
        {mutation.isError && <p role="alert">{errorMessage(mutation.error)}</p>}
        <div className="flex flex-wrap gap-3 justify-end">
          <OpBtn
            type="button"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={confirming ? () => setConfirming(false) : onClose}
          >
            {confirming ? 'Chọn lại hộp' : 'Hủy'}
          </OpBtn>
          <OpBtn type="submit" disabled={!valid || mutation.isPending}>
            {mutation.isPending ? 'Đang ghi nhận…' : confirming ? 'Xác nhận đã thả giống' : 'Tiếp tục'}
          </OpBtn>
        </div>
      </form>
    </ActionDialog>
  )
}
