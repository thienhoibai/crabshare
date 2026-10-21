import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { PenTool, ShieldCheck } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { ContractViewer } from '../../shared/contracts/ContractViewer'
import { contractStatuses, useContract, useOperatorContracts, useSignContract, type ContractStatus } from '../../shared/contracts/contractsApi'
import { formatDateTime, formatVnd } from '../../shared/lib/format'
import OperatorLayout from './OperatorLayout'
import { OpAside, OpBadge, OpBtn, OpHeading, OpNote, OpPanel, type Tone } from './operatorUi'

const tone: Record<ContractStatus, Tone> = { Draft: 'danger', OperatorSigned: 'warn', FullySigned: 'ok', Void: 'mute' }

/** UC14 phía người nuôi (TH-08): hợp đồng các khoản góp vào lô của hộ nuôi, chủ hộ nuôi ký trước nhà đầu tư. */
export default function OperatorContract() {
  const [params, setParams] = useSearchParams()
  const list = useOperatorContracts()
  const selectedId = Number(params.get('id')) || list.data?.[0]?.contractId || null
  const contract = useContract(selectedId)
  const sign = useSignContract()
  const [agreedFor, setAgreedFor] = useState<number | null>(null)
  const c = contract.data
  const agreed = c !== undefined && agreedFor === c.contractId

  return (
    <OperatorLayout activeTab="contract">
      <OpHeading
        eyebrow="Ký số (dịch vụ ký giả lập Viettel)"
        title="Hợp đồng góp vốn"
        description="Mỗi khoản góp có một hợp đồng giữa hộ nuôi và nhà đầu tư. Chủ hộ nuôi ký trước, nhà đầu tư ký sau trên đúng file đó."
      />

      <div className="op-split">
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <OpPanel title="Danh sách hợp đồng" subtitle="Hợp đồng chờ bạn ký nằm trên cùng.">
            {list.isPending && <p className="rd-muted">Đang tải hợp đồng…</p>}
            {list.isError && <OpNote tone="danger">{errorMessage(list.error)}</OpNote>}
            {list.data?.length === 0 && <p className="rd-muted">Chưa có hợp đồng nào. Hợp đồng được lập khi nhà đầu tư giữ chỗ góp vốn vào lô của bạn.</p>}
            {list.data && list.data.length > 0 && (
              <div className="op-tablewrap">
                <table className="op-table">
                  <thead><tr><th>Số hợp đồng</th><th>Lô</th><th>Nhà đầu tư</th><th className="is-num">Vốn góp</th><th>Trạng thái</th></tr></thead>
                  <tbody>
                    {list.data.map(row => (
                      <tr key={row.contractId} onClick={() => setParams({ id: String(row.contractId) }, { replace: true })}
                        style={{ cursor: 'pointer', fontWeight: row.contractId === selectedId ? 700 : undefined }}>
                        <td><button type="button" className="op-link" onClick={() => setParams({ id: String(row.contractId) }, { replace: true })}>{row.contractNo}</button></td>
                        <td>{row.batchCode}</td>
                        <td>{row.investorName}</td>
                        <td className="is-num">{formatVnd(row.amount)}</td>
                        <td><OpBadge tone={tone[row.status]}>{contractStatuses[row.status]}</OpBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </OpPanel>

          {c && (
            <OpPanel title={`Hợp đồng ${c.contractNo}`} subtitle={`${c.batchTitle} · lập ${formatDateTime(c.createdAt)}`}>
              <ContractViewer contract={c} pdfHeight={560} />
            </OpPanel>
          )}
          {contract.isError && <OpNote tone="danger">{errorMessage(contract.error)}</OpNote>}
        </div>

        <OpAside>
          <p className="rd-eyebrow">Ký phần của hộ nuôi</p>
          {!c && <p className="rd-muted">Chọn một hợp đồng để xem và ký.</p>}
          {c && c.canSign && (
            <>
              <label className="op-check">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreedFor(e.target.checked ? c.contractId : null)} />
                Tôi đã đọc toàn bộ hợp đồng {c.contractNo} và đồng ý ký thay mặt hộ nuôi.
              </label>
              <OpBtn full disabled={!agreed || sign.isPending} onClick={() => sign.mutate(c.contractId)}>
                <PenTool size={16} /> {sign.isPending ? 'Đang ký số…' : 'Ký số hợp đồng'}
              </OpBtn>
              {sign.isError && <OpNote tone="danger">{errorMessage(sign.error)}</OpNote>}
            </>
          )}
          {c && !c.canSign && c.nextSigner === 'Operator' && (
            <OpNote>Chỉ <b>chủ hộ nuôi</b> mới ký thay hộ nuôi. Nhân viên chỉ xem được hợp đồng.</OpNote>
          )}
          {c?.status === 'OperatorSigned' && <OpNote tone="ok">Hộ nuôi đã ký. Đang chờ <b>{c.investorName}</b> ký tiếp.</OpNote>}
          {c?.status === 'FullySigned' && <OpNote tone="ok"><b>Đã đủ hai chữ ký</b> lúc {formatDateTime(c.fullySignedAt)}. Bản cuối được lưu nguyên vẹn kèm mã băm.</OpNote>}
          {c?.status === 'Void' && <OpNote tone="danger">Hợp đồng đã huỷ vì khoản góp hết hạn giữ chỗ hoặc lô huỷ.</OpNote>}
          <p className="rd-note"><ShieldCheck size={14} /> CrabShare chỉ điều phối việc ký, không ký thay và không là một bên của hợp đồng.</p>
        </OpAside>
      </div>
    </OperatorLayout>
  )
}
