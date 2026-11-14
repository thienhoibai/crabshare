/* Hai form của một chuyến giao: xuất hàng với cân lần một (BR-164) và nhận hàng với cân lần hai, lập biên bản nghiệm thu (BR-165).
   Form nhận hàng mặc định là "khách nhận đủ": chỉ cần số cân lần hai. Các ô số con, kg chấp nhận, mã cua bị từ chối và lý do
   chỉ hiện khi đánh dấu có chênh lệch. */
import { useState } from 'react'
import { ClipboardCheck, PackageCheck } from 'lucide-react'
import type { AllocationResponse, DispatchRequest, ReceiptRequest, ShipmentLineResponse, ShipmentResponse } from '../../../shared/api/api.gen'
import { Checkbox, DecimalInput, Field, Input, NumberInput, OpBtn, OpConfirm, OpMore, OpNote, OpPanel, TextArea, useSend } from '../../../shared/ui/console'
import { enc, fmtKg } from './common'
import './sales.css'

type NameOf = (specCode: string) => string

/** Xuất hàng: số con của từng dòng bằng số con đã phân bổ, người nuôi cân và ghi kg. */
export function DispatchForm({ s, allocated, nameOf }: { s: ShipmentResponse; allocated: Record<number, number> | null; nameOf: NameOf }) {
  const [kg, setKg] = useState<Record<number, number | null>>({})
  const [transport, setTransport] = useState(s.transportCondition ?? '')
  const [confirm, setConfirm] = useState(false)
  const dispatch = useSend<ShipmentResponse, DispatchRequest>('post', `/api/shipments/${enc(s.shipmentNo)}/dispatch`, {
    success: 'Đã xuất hàng.',
    quietError: true,
    onSuccess: () => setConfirm(false),
  })
  const count = (line: ShipmentLineResponse) => allocated?.[line.lineId] ?? 0
  const lines = s.lines.filter((l) => count(l) > 0)
  const ready = lines.length > 0 && lines.every((l) => (kg[l.lineId] ?? 0) > 0)
  const totalCrabs = lines.reduce((n, l) => n + count(l), 0)
  const totalKg = lines.reduce((n, l) => n + (kg[l.lineId] ?? 0), 0)
  const body: DispatchRequest = {
    lines: s.lines.map((l) => ({ lineId: l.lineId, dispatchedCrabs: count(l), dispatchedKg: count(l) > 0 ? kg[l.lineId] ?? 0 : 0 })),
    transportCondition: transport.trim() || null,
  }

  return (
    <OpPanel accent className="os-noprint" title="Xuất hàng">
      {allocated && totalCrabs === 0 && <OpNote tone="danger">Chưa có cua nào được phân bổ cho đợt này nên chưa xuất được.</OpNote>}
      <form className="op-form" onSubmit={(e) => { e.preventDefault(); if (ready) { dispatch.reset(); setConfirm(true) } }}>
        <div className="op-form__row">
          {lines.map((l) => (
            <Field key={l.lineId} label={`${nameOf(l.specCode)} · ${count(l)} con`} required>
              <DecimalInput value={kg[l.lineId] ?? null} onChange={(v) => setKg({ ...kg, [l.lineId]: v })} unit="kg" placeholder="Cân lần một" />
            </Field>
          ))}
        </div>
        <OpMore label="Tuỳ chọn thêm">
          <Field label="Điều kiện vận chuyển">
            <Input value={transport} onChange={(e) => setTransport(e.target.value)} maxLength={300} />
          </Field>
        </OpMore>
        <div className="op-formfoot">
          <OpBtn type="submit" disabled={!ready}><PackageCheck size={17} /> Xuất hàng</OpBtn>
        </div>
      </form>

      {confirm && (
        <OpConfirm
          title="Xuất hàng"
          sub={`${totalCrabs} con · ${fmtKg(totalKg)}`}
          confirmLabel="Xuất hàng"
          pending={dispatch.isPending}
          error={dispatch.error}
          onConfirm={() => dispatch.mutate(body)}
          onClose={() => setConfirm(false)}
        >
          <p>Sau khi xuất không sửa được số cân lần một.</p>
        </OpConfirm>
      )}
    </OpPanel>
  )
}

type ReceiptLine = { receivedCrabs: number | null; receivedKg: number | null; acceptedCrabs: number | null; acceptedKg: number | null }

/** Nhận hàng: cân lần hai; khi có chênh lệch thì ghi thêm số con, kg khách chấp nhận, mã cua bị từ chối và lý do. */
export function ReceiptForm({ s, shipped, nameOf }: { s: ShipmentResponse; shipped: AllocationResponse[]; nameOf: NameOf }) {
  const [lines, setLines] = useState<Record<number, ReceiptLine>>(() => Object.fromEntries(s.lines.map((l) => [l.lineId, {
    receivedCrabs: l.receivedCrabs ?? l.dispatchedCrabs ?? 0,
    receivedKg: l.receivedKg,
    acceptedCrabs: l.acceptedCrabs ?? l.receivedCrabs ?? l.dispatchedCrabs ?? 0,
    acceptedKg: l.acceptedKg,
  }])))
  // Biên bản cũ đã có chênh lệch thì mở sẵn phần chi tiết.
  const [partial, setPartial] = useState(() => !!s.acceptance && (s.acceptance.rejectedCrabs > 0 || !!s.acceptance.discrepancyReason
    || s.lines.some((l) => l.receivedCrabs !== l.dispatchedCrabs || l.acceptedKg !== l.receivedKg)))
  const [rejected, setRejected] = useState<string[]>([])
  const [reason, setReason] = useState(s.acceptance?.discrepancyReason ?? '')
  const [confirm, setConfirm] = useState(false)
  const receipt = useSend<ShipmentResponse, ReceiptRequest>('post', `/api/shipments/${enc(s.shipmentNo)}/receipt`, {
    success: 'Đã lập biên bản. Chờ khách xác nhận.',
    quietError: true,
    onSuccess: () => setConfirm(false),
  })

  const set = (lineId: number, patch: Partial<ReceiptLine>) => setLines({ ...lines, [lineId]: { ...lines[lineId], ...patch } })
  /** Số liệu gửi đi của một dòng: nhận đủ thì số con bằng số xuất và kg chấp nhận bằng kg cân lần hai. */
  const value = (l: ShipmentLineResponse) => {
    const v = lines[l.lineId]
    const sent = l.dispatchedCrabs ?? 0
    return partial
      ? { lineId: l.lineId, receivedCrabs: v.receivedCrabs ?? 0, receivedKg: v.receivedKg ?? 0, acceptedCrabs: v.acceptedCrabs ?? 0, acceptedKg: v.acceptedKg ?? 0 }
      : { lineId: l.lineId, receivedCrabs: sent, receivedKg: v.receivedKg ?? 0, acceptedCrabs: sent, acceptedKg: sent > 0 ? v.receivedKg ?? 0 : 0 }
  }
  const values = s.lines.map(value)
  const problems = s.lines.flatMap((l, i) => {
    const v = values[i]
    const name = nameOf(l.specCode)
    const out: string[] = []
    if (v.receivedCrabs > (l.dispatchedCrabs ?? 0)) out.push(`${name}: số con nhận vượt số con xuất (${l.dispatchedCrabs ?? 0}).`)
    if (v.acceptedCrabs > v.receivedCrabs) out.push(`${name}: số con chấp nhận vượt số con nhận.`)
    if (v.acceptedKg > v.receivedKg) out.push(`${name}: kg chấp nhận vượt kg nhận.`)
    if ((v.acceptedCrabs > 0) !== (v.acceptedKg > 0)) out.push(`${name}: thiếu kg ${partial ? 'chấp nhận' : 'cân lần hai'}.`)
    return out
  })
  const discrepancy = s.lines.some((l, i) => values[i].receivedCrabs !== (l.dispatchedCrabs ?? 0) || values[i].acceptedCrabs !== values[i].receivedCrabs)
  const ready = problems.length === 0 && (!discrepancy || reason.trim().length > 0)
  const body: ReceiptRequest = {
    lines: values,
    rejectedCrabCodes: partial && rejected.length ? rejected : null,
    discrepancyReason: partial ? reason.trim() || null : null,
  }
  const sumAccepted = values.reduce((n, l) => n + l.acceptedCrabs, 0)
  const sumKg = values.reduce((n, l) => n + l.acceptedKg, 0)

  return (
    <OpPanel accent className="os-noprint" title={s.acceptance ? 'Ghi lại cân lần hai' : 'Nhận hàng'}>
      <form className="op-form" onSubmit={(e) => { e.preventDefault(); if (ready) { receipt.reset(); setConfirm(true) } }}>
        {!partial && (
          <div className="op-form__row">
            {s.lines.filter((l) => (l.dispatchedCrabs ?? 0) > 0).map((l) => (
              <Field key={l.lineId} label={`${nameOf(l.specCode)} · ${l.dispatchedCrabs} con`} required hint={`Cân lần một ${fmtKg(l.dispatchedKg)}`}>
                <DecimalInput value={lines[l.lineId].receivedKg} onChange={(n) => set(l.lineId, { receivedKg: n })} unit="kg" placeholder="Cân lần hai" />
              </Field>
            ))}
          </div>
        )}
        <Checkbox checked={partial} onChange={setPartial}>Thiếu cua hoặc khách từ chối một phần</Checkbox>

        {partial && s.lines.map((l) => {
          const v = lines[l.lineId]
          return (
            <div key={l.lineId} className="op-subform">
              <div className="is-wide"><b>{nameOf(l.specCode)}</b><span className="os-sub">Đã xuất {l.dispatchedCrabs ?? 0} con · {fmtKg(l.dispatchedKg)}</span></div>
              <Field label="Số con nhận"><NumberInput value={v.receivedCrabs} onChange={(n) => set(l.lineId, { receivedCrabs: n })} unit="con" max={l.dispatchedCrabs ?? 0} /></Field>
              <Field label="Cân lần hai"><DecimalInput value={v.receivedKg} onChange={(n) => set(l.lineId, { receivedKg: n })} unit="kg" /></Field>
              <Field label="Số con chấp nhận"><NumberInput value={v.acceptedCrabs} onChange={(n) => set(l.lineId, { acceptedCrabs: n })} unit="con" max={l.dispatchedCrabs ?? 0} /></Field>
              <Field label="Kg chấp nhận"><DecimalInput value={v.acceptedKg} onChange={(n) => set(l.lineId, { acceptedKg: n })} unit="kg" /></Field>
            </div>
          )
        })}
        {partial && shipped.length > 0 && (
          <div className="op-field">
            <span className="op-label">Mã cua khách từ chối</span>
            <div className="os-pick">
              {shipped.map((a) => (
                <Checkbox key={a.crabCode} checked={rejected.includes(a.crabCode)} onChange={(on) => setRejected(on ? [...rejected, a.crabCode] : rejected.filter((c) => c !== a.crabCode))}>
                  <span className="op-mono">{a.crabCode}</span> <small>{a.crabSpecCode ?? a.lineSpecCode ?? ''}</small>
                </Checkbox>
              ))}
            </div>
          </div>
        )}
        {partial && (
          <Field label="Lý do chênh lệch" required={discrepancy}>
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </Field>
        )}
        {partial && problems.length > 0 && <OpNote tone="danger">{problems.map((p) => <div key={p}>{p}</div>)}</OpNote>}
        <div className="op-formfoot">
          <OpBtn type="submit" disabled={!ready}><ClipboardCheck size={17} /> Lập biên bản nghiệm thu</OpBtn>
        </div>
      </form>

      {confirm && (
        <OpConfirm
          title="Lập biên bản nghiệm thu"
          sub={`Khách chấp nhận ${sumAccepted} con · ${fmtKg(sumKg)}${partial && rejected.length > 0 ? ` · từ chối ${rejected.length} con` : ''}`}
          confirmLabel="Lập biên bản"
          pending={receipt.isPending}
          error={receipt.error}
          onConfirm={() => receipt.mutate(body)}
          onClose={() => setConfirm(false)}
        />
      )}
    </OpPanel>
  )
}
