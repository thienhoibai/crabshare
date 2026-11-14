/* /nha-dau-tu/hop-dong — Hợp đồng của các khoản góp của tôi (GET /api/me/contracts): trạng thái, xem và tải PDF (GET /api/contracts/{id}/file),
   ký khi tới lượt (POST /api/contracts/{id}/sign). Hợp đồng đang mở chọn bằng ?id=; chưa chọn thì mở hợp đồng đang chờ tôi ký. */
import { useSearchParams } from 'react-router'
import { Download } from 'lucide-react'
import type { ContractSummary } from '../../shared/api/api.gen'
import { ContractViewer } from '../../shared/contracts/ContractViewer'
import { useContract, useSignContract } from '../../shared/contracts/contractsApi'
import {
  Money, OpBadge, OpBtn, OpEmpty, OpError, OpHeading, OpLoading, OpPanel, OpTable, QueryView, StatusBadge, errorMessage, openFile, useGet,
} from '../../shared/ui/console'

const waitsForMe = (c: ContractSummary) => c.nextSigner === 'Investor' && c.status !== 'Void'

export default function ContractsPage() {
  const [params, setParams] = useSearchParams()
  const list = useGet<ContractSummary[]>('/api/me/contracts')
  const picked = Number(params.get('id')) || null
  const selected = picked ?? list.data?.find(waitsForMe)?.contractId ?? null
  const contract = useContract(selected, 'Operator')
  const sign = useSignContract()
  const c = contract.data
  const open = (id: number) => {
    sign.reset()
    setParams({ id: String(id) }, { replace: true })
  }

  return (
    <>
      <OpHeading eyebrow="Giấy tờ và tiền" title="Hợp đồng" description="Người nuôi ký trước, bạn ký sau." />

      <QueryView query={list}>
        {(rows) => rows.length === 0 ? (
          <OpEmpty title="Bạn chưa có hợp đồng nào"><a className="rd-btn rd-btn--primary" href="/nha-dau-tu/lo">Xem Lô đang gọi vốn</a></OpEmpty>
        ) : (
          <OpPanel>
            <OpTable
              rows={rows}
              rowKey={(r) => r.contractId}
              columns={[
                { key: 'no', header: 'Hợp đồng', cell: (r) => <><b className="op-mono">{r.contractNo}</b><br /><small className="rd-muted">Lô {r.batchCode}</small></> },
                { key: 'amount', header: 'Vốn góp', num: true, cell: (r) => <Money value={r.amount} /> },
                {
                  key: 'status', header: 'Trạng thái', cell: (r) => (waitsForMe(r)
                    ? <OpBadge tone="gold">Tới lượt bạn ký</OpBadge>
                    : <StatusBadge kind="contract" value={r.status} />),
                },
                {
                  key: 'act', header: '', cell: (r) => (
                    <span className="op-inline">
                      <OpBtn variant={r.contractId === selected ? 'ink' : 'ghost'} sm onClick={() => open(r.contractId)}>{waitsForMe(r) ? 'Xem và ký' : 'Xem'}</OpBtn>
                      <OpBtn variant="ghost" sm aria-label={`Tải PDF hợp đồng ${r.contractNo}`} onClick={() => void openFile(`/api/contracts/${r.contractId}/file`, `${r.contractNo}.pdf`)}>
                        <Download size={15} /> PDF
                      </OpBtn>
                    </span>
                  ),
                },
              ]}
            />
          </OpPanel>
        )}
      </QueryView>

      {selected !== null && (
        contract.isPending ? <OpLoading />
          : contract.isError ? <OpError error={contract.error} onRetry={() => void contract.refetch()} />
            : c && (
              <OpPanel title={`Hợp đồng ${c.contractNo}`} accent={c.canSign}>
                {/* Ghim hợp đồng đang ký lên ?id=: ký xong nó không còn là "hợp đồng chờ tôi ký" nhưng vẫn phải hiện kết quả. */}
                <ContractViewer contract={c} onSign={() => { setParams({ id: String(c.contractId) }, { replace: true }); sign.mutate(c.contractId) }}
                  signing={sign.isPending} signError={sign.isError ? errorMessage(sign.error) : null} />
              </OpPanel>
            )
      )}
    </>
  )
}
