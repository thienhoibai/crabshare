import { AlertTriangle, CheckCircle2, Circle, Download, FileSignature } from 'lucide-react'
import { formatDateTime, formatVnd } from '../lib/format'
import { contractStatuses, useContractPdf, type Contract, type SignerRole } from './contractsApi'
import './contracts.css'

/**
 * Xem hợp đồng góp vốn: cảnh báo bản demo, hai bước ký theo thứ tự, file PDF hiện hành và mã băm của nó.
 * Dùng chung cho màn 3 luồng góp vốn (nhà đầu tư) và trang Hợp đồng của người nuôi.
 */
export function ContractViewer({ contract, onSign, signing = false, signError, pdfHeight = 480 }: {
  contract: Contract
  onSign?: () => void
  signing?: boolean
  signError?: string | null
  pdfHeight?: number
}) {
  const pdf = useContractPdf(contract.contractId, contract.currentHash)
  const signedBy = (role: SignerRole) => contract.signatures.find(s => s.role === role)
  const steps: { role: SignerRole; label: string; name: string }[] = [
    { role: 'Operator', label: 'Bên A — người nuôi ký trước', name: contract.operatorName },
    { role: 'Investor', label: 'Bên B — nhà đầu tư ký sau', name: contract.investorName },
  ]

  return (
    <div className="ct">
      <p className="ct-notice" role="note"><AlertTriangle size={16} /> {contract.legalNotice}</p>

      <dl className="ct-meta">
        <div><dt>Số hợp đồng</dt><dd>{contract.contractNo}</dd></div>
        <div><dt>Lô</dt><dd>{contract.batchCode}</dd></div>
        <div><dt>Vốn góp</dt><dd>{formatVnd(contract.amount)}</dd></div>
        <div><dt>Trạng thái</dt><dd className={`ct-status ct-status--${contract.status}`}>{contractStatuses[contract.status]}</dd></div>
      </dl>

      <ol className="ct-steps" aria-label="Thứ tự ký">
        {steps.map(step => {
          const s = signedBy(step.role)
          const waiting = contract.nextSigner === step.role
          return (
            <li key={step.role} className={s ? 'is-done' : waiting ? 'is-on' : ''}>
              {s ? <CheckCircle2 size={18} /> : <Circle size={18} />}
              <div>
                <b>{step.label}</b>
                <span>{step.name}</span>
                <small>{s ? `Đã ký ${formatDateTime(s.signedAt)} · ${s.signerName}` : waiting ? 'Đang chờ ký' : contract.status === 'Void' ? 'Hợp đồng đã huỷ' : 'Chưa tới lượt'}</small>
              </div>
            </li>
          )
        })}
      </ol>

      {pdf.error && <p className="ct-error" role="alert">Không tải được file PDF của hợp đồng.</p>}
      {!pdf.error && !pdf.url && <p className="ct-muted" role="status">Đang tải file hợp đồng…</p>}
      {pdf.url && (
        <>
          <iframe className="ct-pdf" title={`Hợp đồng ${contract.contractNo}`} src={pdf.url} style={{ height: pdfHeight }} />
          <a className="ct-download" href={pdf.url} download={`${contract.contractNo}.pdf`}><Download size={15} /> Tải file PDF</a>
        </>
      )}
      <p className="ct-hash">Mã băm SHA-256 của bản đang xem: <code>{contract.currentHash}</code></p>

      {signError && <p className="ct-error" role="alert">{signError}</p>}
      {onSign && contract.canSign && (
        <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" disabled={signing} onClick={onSign}>
          <FileSignature size={18} /> {signing ? 'Đang ký số…' : 'Ký số hợp đồng'}
        </button>
      )}
    </div>
  )
}
