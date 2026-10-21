import { useState } from 'react'
import { errorMessage } from '../../../shared/api/http'
import { ContractViewer } from '../../../shared/contracts/ContractViewer'
import { contractStatuses, useContract, useMyContracts, useSignContract } from '../../../shared/contracts/contractsApi'
import { formatDateTime, formatVnd } from '../../../shared/lib/format'

/** Tab Hợp đồng của cổng nhà đầu tư (TH-09): hợp đồng của các khoản góp của tôi; ký tiếp khi người nuôi đã ký. */
export default function InvestorContracts() {
  const list = useMyContracts()
  const [picked, setPicked] = useState<number | null>(null)
  // Mặc định mở hợp đồng đang chờ tôi ký, nếu có
  const selected = picked ?? list.data?.find(c => c.nextSigner === 'Investor')?.contractId ?? list.data?.[0]?.contractId ?? null
  const contract = useContract(selected, 'Operator')
  const sign = useSignContract()
  const c = contract.data

  return (
    <div className="iv-contracts-grid">
      <section className="iv-card">
        <h3 className="rd-h3">Hợp đồng của tôi</h3>
        {list.isPending && <p className="rd-muted">Đang tải…</p>}
        {list.isError && <p className="ct-error">{errorMessage(list.error)}</p>}
        {list.data?.length === 0 && <p className="rd-muted">Chưa có hợp đồng. Hợp đồng được lập ở bước 3 khi bạn góp vốn vào một lô.</p>}
        <ul className="iv-contracts">
          {list.data?.map(c => (
            <li key={c.contractId}>
              <button type="button" className={c.contractId === selected ? 'is-on' : ''} onClick={() => { setPicked(c.contractId); sign.reset() }}>
                <b>{c.batchCode} · {formatVnd(c.amount)}</b>
                <small>{c.contractNo} · {contractStatuses[c.status]}</small>
                {c.nextSigner === 'Investor' && <em>Chờ bạn ký</em>}
                {c.fullySignedAt && <small>Đủ chữ ký {formatDateTime(c.fullySignedAt)}</small>}
              </button>
            </li>
          ))}
        </ul>
      </section>
      {c && (
        <section className="iv-card">
          <h3 className="rd-h3">{c.batchTitle}</h3>
          <ContractViewer contract={c} onSign={() => sign.mutate(c.contractId)} signing={sign.isPending}
            signError={sign.isError ? errorMessage(sign.error) : null} />
        </section>
      )}
    </div>
  )
}
