import { useEffect, useState } from 'react'
import { Download, FileSignature } from 'lucide-react'
import type { ContractResponse } from '../api/api.gen'
import { formatDateTime, formatVnd } from '../lib/format'
import { OpConfirm, OpFlow, OpKv, OpLoading, StatusBadge, type FlowStep } from '../ui/console/parts'
import { OpBtn, OpMore, OpNote } from '../ui/console/ui'
import { useContractPdf } from './contractsApi'
import './contracts.css'

/**
 * Xem hợp đồng góp vốn: ghi chú pháp lý của bản demo, hai bước ký theo thứ tự (người nuôi trước, nhà đầu tư sau),
 * file PDF hiện hành và mã băm của nó. Không có khung bao: đặt trong OpPanel hoặc OpModal của trang gọi.
 * Bấm ký thì mở hộp xác nhận rồi mới gọi onSign.
 */
export function ContractViewer({ contract, onSign, signing = false, signError, pdfHeight = 480 }: {
  contract: ContractResponse
  onSign?: () => void
  signing?: boolean
  signError?: string | null
  pdfHeight?: number
}) {
  const pdf = useContractPdf(contract.contractId, contract.currentHash)
  const [confirming, setConfirming] = useState(false)

  // Ký xong thì API trả canSign = false: đóng hộp xác nhận.
  useEffect(() => {
    if (!contract.canSign) setConfirming(false)
  }, [contract.canSign])

  const parties: { role: string; label: string; name: string }[] = [
    { role: 'Operator', label: 'Người nuôi', name: contract.operatorName },
    { role: 'Investor', label: 'Nhà đầu tư', name: contract.investorName },
  ]
  const steps: FlowStep[] = parties.map((p) => {
    const signed = contract.signatures.find((s) => s.role === p.role)
    const waiting = contract.nextSigner === p.role
    return {
      title: `${p.label}: ${p.name}`,
      sub: signed
        ? `Đã ký ${formatDateTime(signed.signedAt)}`
        : contract.status === 'Void' ? 'Hợp đồng đã huỷ' : waiting ? 'Đang chờ ký' : contract.status === 'FullySigned' ? 'Đã ký ngoài hệ thống' : 'Chưa tới lượt',
      state: signed || contract.status === 'FullySigned' ? 'done' : contract.status === 'Void' ? 'bad' : waiting ? 'now' : 'todo',
    }
  })

  return (
    <div className="op-stack">
      <OpNote tone="danger">{contract.legalNotice}</OpNote>

      <OpKv items={[
        { label: 'Số hợp đồng', value: <span className="op-mono">{contract.contractNo}</span> },
        { label: 'Lô', value: contract.batchCode },
        { label: 'Vốn góp', value: formatVnd(contract.amount) },
        { label: 'Trạng thái', value: <StatusBadge kind="contract" value={contract.status} /> },
      ]} />

      <OpFlow steps={steps} />

      {pdf.error && <p className="rd-muted">Chưa xem được file PDF của hợp đồng này.</p>}
      {!pdf.error && !pdf.url && <OpLoading label="Đang tải file hợp đồng…" />}
      {pdf.url && (
        <>
          <iframe className="ct-pdf" title={`Hợp đồng ${contract.contractNo}`} src={pdf.url} style={{ height: pdfHeight }} />
          <div className="op-between">
            <a className="rd-btn rd-btn--ghost rd-btn--sm" href={pdf.url} download={`${contract.contractNo}.pdf`}><Download size={15} /> Tải file PDF</a>
            <a className="op-link" href={pdf.url} target="_blank" rel="noopener">Mở ở tab mới</a>
          </div>
        </>
      )}

      <OpMore label="Chi tiết kỹ thuật">
        <OpKv items={[
          { label: 'Mẫu hợp đồng', value: contract.templateVersion },
          { label: 'Cách ký', value: contract.signingMethod === 'OfflineUpload' ? 'Ký ngoài hệ thống' : 'Ký số' },
        ]} />
        <p className="ct-hash">Mã băm SHA-256: <code className="op-mono">{contract.currentHash}</code></p>
      </OpMore>

      {signError && !confirming && <OpNote tone="danger">{signError}</OpNote>}
      {onSign && contract.canSign && (
        <div className="op-formfoot">
          <OpBtn onClick={() => setConfirming(true)} disabled={signing}><FileSignature size={17} /> Ký số hợp đồng</OpBtn>
        </div>
      )}

      {confirming && onSign && (
        <OpConfirm
          title={`Ký số hợp đồng ${contract.contractNo}`}
          sub={`Lô ${contract.batchCode} · vốn góp ${formatVnd(contract.amount)}`}
          confirmLabel="Ký số"
          pending={signing}
          onConfirm={onSign}
          onClose={() => setConfirming(false)}
        >
          <p className="rd-muted">Sau khi ký không sửa được nội dung hợp đồng.</p>
          {signError && <OpNote tone="danger">{signError}</OpNote>}
        </OpConfirm>
      )}
    </div>
  )
}
