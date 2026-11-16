/* Quyết định cuối của Admin cho một khiếu nại (POST /api/admin/claims/{claimNo}/decide, BR-174).
   Số tiền hoàn do máy chủ tính: kg hoàn × giá mỗi kg của quy cách, không vượt số kg đã nghiệm thu (BR-173). */
import { useState, type ReactNode } from 'react'
import { Gavel } from 'lucide-react'
import type { AdminClaimDecisionRequest, ClaimResponse, ShipmentLineResponse } from '../../../shared/api/api.gen'
import { DecimalInput, Field, OpAside, OpBtn, OpConfirm, OpDl, OpNote, RadioCards, TextArea, formatVnd, useSend } from '../../../shared/ui/console'
import { formatKg } from './shared'

/** Ước tính theo đúng cách máy chủ tính; con số chính thức là số máy chủ trả về sau khi quyết định. */
function estimate(claim: ClaimResponse, line: ShipmentLineResponse, refundKg: number | null) {
  const accepted = line.acceptedKg ?? 0
  const perCrab = line.acceptedCrabs && line.acceptedCrabs > 0 ? accepted / line.acceptedCrabs : 0
  const wanted = refundKg ?? claim.affectedKg ?? (claim.affectedCrabs !== null ? perCrab * claim.affectedCrabs : 0)
  const kg = Math.round(Math.min(wanted, accepted) * 1000) / 1000
  return { kg, amount: Math.round(kg * line.pricePerKg) }
}

/** Cột phải của trang khiếu nại khi tới lượt Admin: tiến trình (flow), form quyết định, rồi phần thông tin đơn (children).
    Hộp xác nhận nằm ngoài cột dính để phủ kín cả màn hình. */
export default function ClaimDecisionForm({ claim, line, flow, children }: {
  claim: ClaimResponse
  line: ShipmentLineResponse | null
  flow: ReactNode
  children?: ReactNode
}) {
  const [choice, setChoice] = useState<'accept' | 'reject' | null>(null)
  const [refundKg, setRefundKg] = useState<number | null>(null)
  const [decision, setDecision] = useState('')
  const [confirming, setConfirming] = useState(false)
  const decide = useSend<ClaimResponse, AdminClaimDecisionRequest>('post', `/api/admin/claims/${encodeURIComponent(claim.claimNo)}/decide`, {
    quietError: true,
    success: (res) => (res.status === 'Accepted' ? 'Đã chấp nhận khiếu nại và lập lệnh hoàn tiền.' : 'Đã chốt: không chấp nhận khiếu nại.'),
    onSuccess: () => setConfirming(false),
  })

  const accept = choice === 'accept'
  const kgInvalid = refundKg !== null && refundKg <= 0
  const text = decision.trim()
  const ready = choice !== null && text.length >= 3 && text.length <= 500 && !(accept && kgInvalid)
  const refund = accept && line ? estimate(claim, line, refundKg) : null

  return (
    <>
      <OpAside>
        {flow}
        <RadioCards
          value={choice}
          onChange={setChoice}
          options={[
            { value: 'accept', label: 'Chấp nhận', hint: 'Hoàn tiền cho khách' },
            { value: 'reject', label: 'Không chấp nhận', hint: 'Không hoàn tiền' },
          ]}
        />
        {accept && (
          <Field label="Số kg được hoàn" hint="Bỏ trống: lấy số khách khai." error={kgInvalid ? 'Số kg phải lớn hơn 0.' : undefined}>
            <DecimalInput value={refundKg} onChange={setRefundKg} unit="kg" />
          </Field>
        )}
        {refund && <OpDl items={[{ label: `Ước tính hoàn cho ${formatKg(refund.kg)}`, value: formatVnd(refund.amount), total: true }]} />}
        <Field label="Nội dung quyết định" required hint="Nêu căn cứ. Hai bên đều đọc được.">
          <TextArea rows={3} maxLength={500} value={decision} onChange={(e) => setDecision(e.target.value)} />
        </Field>
        <OpBtn full disabled={!ready} onClick={() => { decide.reset(); setConfirming(true) }}><Gavel size={17} /> Ra quyết định</OpBtn>
        {children}
      </OpAside>

      {confirming && choice && (
        <OpConfirm
          title={accept ? 'Chấp nhận khiếu nại' : 'Không chấp nhận khiếu nại'}
          sub={`Khiếu nại ${claim.claimNo}`}
          confirmLabel={accept ? 'Chấp nhận và hoàn tiền' : 'Chốt không chấp nhận'}
          variant={accept ? 'primary' : 'danger'}
          pending={decide.isPending}
          error={decide.error}
          onClose={() => setConfirming(false)}
          onConfirm={() => decide.mutate({ accept, decision: text, refundKg: accept ? refundKg : null })}
        >
          <OpNote tone={accept ? 'info' : 'danger'}>
            {accept
              ? `Lập lệnh hoàn tiền cho khách${refund ? `, ước tính ${formatVnd(refund.amount)}` : ''}.`
              : 'Khách không được hoàn tiền.'}
            {' '}Quyết định cuối, không sửa lại được.
          </OpNote>
          <p className="ab-quote">{text}</p>
        </OpConfirm>
      )}
    </>
  )
}
