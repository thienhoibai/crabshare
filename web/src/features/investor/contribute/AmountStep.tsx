/* Bước 3 của luồng góp vốn (UC10, BR-057): nhập số tiền, hoặc tỷ lệ % vốn mục tiêu (quy đổi qua lại), rồi giữ chỗ.
   POST /api/batches/{code}/contributions { amount } hoặc { pct }. Giữ chỗ có hạn; quá hạn mà chưa chuyển khoản thì chỗ được trả lại. */
import { useState } from 'react'
import type { ContributionResponse, FundingBatchResponse, ReserveContributionRequest } from '../../../shared/api/api.gen'
import {
  DecimalInput, Field, MoneyInput, OpBtn, OpConfirm, OpDl, OpMore, OpNote, OpPanel, formatDateTime, formatVnd, moneyToWords, useSend,
} from '../../../shared/ui/console'
import { enc } from '../investorShared'

export function AmountStep({ f, hasConfirmed, onReserved, onContract }: {
  f: FundingBatchResponse
  hasConfirmed: boolean
  onReserved: () => void
  onContract: () => void
}) {
  const [amount, setAmount] = useState<number | null>(null)
  const [pct, setPct] = useState<number | null>(null)
  /** Người dùng nhập tỷ lệ sau cùng thì gửi tỷ lệ, để máy chủ tự quy đổi. */
  const [byPct, setByPct] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const reserve = useSend<ContributionResponse, ReserveContributionRequest>('post', `/api/batches/${enc(f.batchCode)}/contributions`, {
    success: (c) => `Đã giữ chỗ ${formatVnd(c.amount)} tới ${formatDateTime(c.expiresAt)}.`,
    quietError: true,
    onSuccess: () => { setConfirming(false); onReserved() },
  })

  const room = f.remainingCapacity
  const pctOk = pct === null || Math.round(pct * 100) / 100 === pct
  const problem = amount === null || amount <= 0 ? null
    : byPct && !pctOk ? 'Tỷ lệ nhận tối đa hai chữ số thập phân.'
      : amount < f.minContribution ? `Góp tối thiểu ${formatVnd(f.minContribution)}.`
        : amount > room ? `Lô chỉ còn nhận ${formatVnd(room)}.` : null
  const quick = [f.minContribution, 5_000_000, 10_000_000, 20_000_000, 50_000_000]
    .filter((v, i, all) => v >= f.minContribution && v <= room && all.indexOf(v) === i)
  const typeAmount = (value: number | null) => { setAmount(value); setByPct(false); setPct(null) }
  const typePct = (value: number | null) => {
    setPct(value)
    setByPct(value !== null)
    setAmount(value === null ? null : Math.round((value / 100) * f.targetCapital))
  }

  if (!f.isOpen || room < f.minContribution) {
    return (
      <OpPanel title="Số tiền góp">
        <OpNote tone="info">{!f.isOpen ? 'Lô đã hết hạn hoặc đã chốt vốn.' : 'Phần còn lại không đủ cho mức góp tối thiểu.'}</OpNote>
        <div className="op-formfoot">
          {hasConfirmed
            ? <OpBtn onClick={onContract}>Hợp đồng của khoản đã góp</OpBtn>
            : <a className="rd-btn rd-btn--primary" href="/nha-dau-tu/lo">Xem Lô khác</a>}
        </div>
      </OpPanel>
    )
  }

  return (
    <OpPanel title="Số tiền góp" subtitle={`Giữ chỗ ${f.reservationMinutes} phút để chuyển khoản. Quá hạn mà tiền chưa về thì chỗ được trả lại.`}>
      <form className="op-form" onSubmit={(e) => { e.preventDefault(); if (amount && !problem) { reserve.reset(); setConfirming(true) } }}>
        <Field label="Số tiền" required error={problem} hint={`Từ ${formatVnd(f.minContribution)} đến ${formatVnd(room)}`}>
          <MoneyInput value={amount} onChange={typeAmount} max={f.maxCapital} autoComplete="off" />
        </Field>
        {quick.length > 0 && (
          <div className="op-inline">
            {quick.map((q) => <OpBtn key={q} type="button" variant={amount === q ? 'ink' : 'ghost'} sm onClick={() => typeAmount(q)}>{formatVnd(q)}</OpBtn>)}
          </div>
        )}
        <OpMore label="Nhập theo tỷ lệ vốn mục tiêu">
          <Field label={`Tỷ lệ của ${formatVnd(f.targetCapital)}`}>
            <DecimalInput value={pct} onChange={typePct} unit="%" autoComplete="off" />
          </Field>
        </OpMore>
        <div className="op-formfoot">
          {hasConfirmed && <OpBtn type="button" variant="ghost" onClick={onContract}>Hợp đồng đã có</OpBtn>}
          <OpBtn type="submit" disabled={!amount || !!problem}>Giữ chỗ {f.reservationMinutes} phút</OpBtn>
        </div>
      </form>

      {confirming && amount && (
        <OpConfirm
          title={`Giữ chỗ ${formatVnd(amount)}`}
          sub={`Lô ${f.batchCode}`}
          confirmLabel="Giữ chỗ"
          pending={reserve.isPending}
          error={reserve.error}
          onConfirm={() => reserve.mutate(byPct ? { pct } : { amount })}
          onClose={() => setConfirming(false)}
        >
          <OpDl items={[
            { label: 'Số tiền góp', value: formatVnd(amount) },
            { label: 'Bằng chữ', value: moneyToWords(amount) },
            { label: 'Giữ chỗ trong', value: `${f.reservationMinutes} phút` },
          ]} />
        </OpConfirm>
      )}
    </OpPanel>
  )
}
