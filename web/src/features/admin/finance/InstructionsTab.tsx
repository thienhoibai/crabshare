/* Tab "Lệnh chi" của /admin/finance: lệnh giải ngân, chi trả, hoàn tiền, phí nền tảng, hoa hồng, trả nhà cung cấp
   (GET /api/admin/payment-instructions, mới nhất trước, tối đa 200 dòng) và gửi từng lệnh qua cổng thanh toán (POST …/send). */
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Search, Send } from 'lucide-react'
import type { PaymentInstructionResponse } from '../../../shared/api/api.gen'
import {
  Input, Money, OpBtn, OpConfirm, OpDl, OpFacts, OpNote, OpPanel, OpTable, QueryView, Select, StatusBadge,
  formatDateTime, formatVnd, label, options, toast, useGet, useSend,
} from '../../../shared/ui/console'
import { Cell } from '../quality/shared'
import { canSend, sum } from './financeModel'

/** Người nhận khi máy chủ không gắn tên: phí và hoa hồng về nền tảng, khoản còn lại xem ở ghi chú của lệnh. */
const beneficiary = (i: PaymentInstructionResponse) =>
  i.beneficiary ?? (i.type === 'PlatformFee' || i.type === 'Commission' ? 'Nền tảng CrabShare' : i.type === 'TaxPayment' ? 'Kho bạc Nhà nước' : 'Theo ghi chú')

function SendDialog({ instruction, onClose }: { instruction: PaymentInstructionResponse; onClose: () => void }) {
  const send = useSend<PaymentInstructionResponse, void>('post', `/api/admin/payment-instructions/${instruction.instructionId}/send`, {
    quietError: true,
    onSuccess: (res) => {
      if (res.status === 'Succeeded') toast(`Lệnh chi số ${res.instructionId} đã thành công.`)
      else toast(`Cổng thanh toán từ chối lệnh chi số ${res.instructionId}. Có thể gửi lại.`, 'danger')
      onClose()
    },
  })
  return (
    <OpConfirm
      title={`Gửi lệnh chi số ${instruction.instructionId}`}
      sub={`${label('instructionType', instruction.type)} · ${instruction.batchCode}`}
      confirmLabel={instruction.status === 'Failed' ? 'Gửi lại' : 'Gửi lệnh chi'}
      pending={send.isPending}
      error={send.error}
      onClose={onClose}
      onConfirm={() => send.mutate()}
    >
      <OpDl items={[
        { label: 'Người nhận', value: beneficiary(instruction) },
        { label: 'Số tiền chi', value: formatVnd(instruction.amount), total: true },
      ]} />
      <OpNote tone="danger">Thành công thì tiền rời tài khoản của Lô, không thu hồi được.</OpNote>
    </OpConfirm>
  )
}

export default function InstructionsTab() {
  const [params, setParams] = useSearchParams()
  const type = params.get('type') ?? ''
  const status = params.get('status') ?? ''
  const batch = params.get('batch') ?? ''
  const [batchText, setBatchText] = useState(batch)
  const [sending, setSending] = useState<PaymentInstructionResponse | null>(null)
  const instructions = useGet<PaymentInstructionResponse[]>('/api/admin/payment-instructions', { Type: type, Status: status, BatchCode: batch })

  const setFilter = (key: string, value: string) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    if (value) next.set(key, value)
    else next.delete(key)
    return next
  }, { replace: true })

  return (
    <>
      <form className="op-toolbar" onSubmit={(e) => { e.preventDefault(); setFilter('batch', batchText.trim()) }}>
        <Select aria-label="Lọc theo loại lệnh chi" value={type} onChange={(e) => setFilter('type', e.target.value)}>
          <option value="">Mọi loại lệnh</option>
          {options('instructionType').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select aria-label="Lọc theo trạng thái" value={status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">Mọi trạng thái</option>
          {options('instruction').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Input className="op-toolbar__grow" type="search" aria-label="Lọc theo mã Lô" placeholder="Mã Lô" maxLength={20} value={batchText} onChange={(e) => setBatchText(e.target.value)} />
        <button type="submit" className="rd-iconbtn" aria-label="Lọc"><Search size={17} /></button>
      </form>
      <QueryView query={instructions}>
        {(list) => {
          const waiting = list.filter((i) => i.status === 'Created')
          const failed = list.filter((i) => i.status === 'Failed').length
          return (
            <>
              {(waiting.length > 0 || failed > 0) && (
                <OpFacts items={[
                  { label: 'Chờ gửi', value: waiting.length, tone: waiting.length ? 'warn' : undefined },
                  { label: 'Tiền chờ gửi', value: formatVnd(sum(waiting.map((i) => i.amount))) },
                  { label: 'Bị từ chối', value: failed, tone: failed ? 'danger' : undefined },
                ]} />
              )}
              <OpPanel>
                <OpTable
                  rows={list}
                  rowKey={(i) => i.instructionId}
                  empty={type || status || batch ? 'Không có lệnh chi nào khớp bộ lọc' : 'Chưa có lệnh chi nào'}
                  columns={[
                    {
                      key: 'type', header: 'Lệnh chi',
                      cell: (i) => <Cell main={<StatusBadge kind="instructionType" value={i.type} />} sub={`Số ${i.instructionId}${i.trancheNo !== null ? ` · mốc ${i.trancheNo}` : ''}`} />,
                    },
                    { key: 'batch', header: 'Lô', cell: (i) => i.batchCode },
                    { key: 'to', header: 'Người nhận', cell: (i) => <Cell main={beneficiary(i)} sub={i.note} /> },
                    { key: 'amount', header: 'Số tiền', num: true, cell: (i) => <Money value={i.amount} /> },
                    {
                      key: 'status', header: 'Trạng thái',
                      cell: (i) => (
                        <Cell
                          main={<StatusBadge kind="instruction" value={i.status} />}
                          sub={formatDateTime(i.completedAt ?? i.sentAt ?? i.createdAt)}
                        />
                      ),
                    },
                    {
                      key: 'action', header: '',
                      cell: (i) => (canSend(i.status) ? <OpBtn sm onClick={() => setSending(i)}><Send size={15} /> {i.status === 'Failed' ? 'Gửi lại' : 'Gửi'}</OpBtn> : null),
                    },
                  ]}
                />
              </OpPanel>
            </>
          )
        }}
      </QueryView>
      {sending && <SendDialog instruction={sending} onClose={() => setSending(null)} />}
    </>
  )
}
