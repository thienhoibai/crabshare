/* Bước 5 của luồng góp vốn (UC14): lập hợp đồng từ mẫu đang hiệu lực cho khoản góp của tôi ở Lô này, rồi ký khi tới lượt.
   POST /api/contributions/{id}/contract (đã có thì trả lại đúng hợp đồng đó), GET /api/contracts/{id}, POST /api/contracts/{id}/sign.
   Người nuôi ký trước, nhà đầu tư ký sau; trang hỏi lại 5 giây một lần khi đang chờ người nuôi.
   Thường chỉ có một khoản góp; có nhiều khoản thì chọn ở góc phải. Mỗi lúc chỉ có một nút chính: lập hợp đồng, ký, hoặc xem Lô. */
import { useState } from 'react'
import { FilePlus2 } from 'lucide-react'
import type { ContractSummary, ContributionResponse, PortfolioDetail } from '../../../shared/api/api.gen'
import { ContractViewer } from '../../../shared/contracts/ContractViewer'
import { useContract, useCreateContract, useSignContract } from '../../../shared/contracts/contractsApi'
import { OpBtn, OpDl, OpEmpty, OpLoading, OpNote, OpPanel, Select, StatusBadge, errorMessage, formatVnd, label, useGet } from '../../../shared/ui/console'
import { enc, portfolioHref } from '../investorShared'

export function ContractStep({ batchCode, reservation, confirmed, onPay }: {
  batchCode: string
  reservation: ContributionResponse | null
  confirmed: ContributionResponse[]
  onPay: () => void
}) {
  const contracts = useGet<ContractSummary[]>('/api/me/contracts')
  // Số hợp đồng của từng khoản đã xác nhận nằm ở chi tiết danh mục (404 khi chưa có khoản nào được xác nhận).
  const detail = useGet<PortfolioDetail>(confirmed.length > 0 ? `/api/investor/portfolio/${enc(batchCode)}` : null, undefined, { retry: false })
  const create = useCreateContract()
  const sign = useSignContract()
  const [pickedId, setPickedId] = useState<number | null>(null)
  /** Hợp đồng vừa lập, dùng tới khi danh sách tải lại xong. */
  const [made, setMade] = useState<{ contributionId: number; contractId: number } | null>(null)

  const rows = [...(reservation ? [reservation] : []), ...confirmed]
  const live = (contracts.data ?? []).filter((c) => c.batchCode === batchCode && c.status !== 'Void')
  const contractOf = (c: ContributionResponse): ContractSummary | undefined => {
    if (c.status === 'Reserved') return live.find((k) => k.contributionStatus === 'Reserved')
    const no = detail.data?.contributions.find((x) => x.id === c.contributionId)?.contractNo
    return no ? live.find((k) => k.contractNo === no) : undefined
  }
  // Mặc định mở khoản chưa có hợp đồng đủ chữ ký.
  const current = rows.find((r) => r.contributionId === pickedId) ?? rows.find((r) => contractOf(r)?.status !== 'FullySigned') ?? rows[0]
  const contractId = current
    ? contractOf(current)?.contractId ?? (made?.contributionId === current.contributionId ? made.contractId : null)
    : null
  const contract = useContract(contractId, 'Operator')
  const c = contract.data
  const loading = contracts.isPending || detail.isLoading || (contractId !== null && contract.isPending)

  if (!current) return <OpEmpty title="Chưa có khoản góp nào ở Lô này" />

  return (
    <OpPanel
      title="Hợp đồng"
      subtitle="Người nuôi ký trước, bạn ký sau trên cùng một file. Lô chỉ thả cua khi mọi hợp đồng đủ hai chữ ký."
      accent={!!c?.canSign}
      action={rows.length > 1 ? (
        <Select sm value={current.contributionId} aria-label="Chọn khoản góp" onChange={(e) => { sign.reset(); setPickedId(Number(e.target.value)) }}>
          {rows.map((r) => <option key={r.contributionId} value={r.contributionId}>{formatVnd(r.amount)} · {label('contribution', r.status)}</option>)}
        </Select>
      ) : undefined}
    >
      {loading ? <OpLoading /> : c ? (
        <ContractViewer contract={c} onSign={() => sign.mutate(c.contractId)} signing={sign.isPending}
          signError={sign.isError ? errorMessage(sign.error) : null} pdfHeight={440} />
      ) : (
        <>
          <OpDl items={[
            { label: 'Khoản góp', value: formatVnd(current.amount) },
            { label: 'Trạng thái', value: <StatusBadge kind="contribution" value={current.status} /> },
          ]} />
          {(create.isError || contract.isError) && <OpNote tone="danger">{errorMessage(create.error ?? contract.error)}</OpNote>}
          <div className="op-formfoot">
            <OpBtn disabled={create.isPending}
              onClick={() => create.mutate(current.contributionId, { onSuccess: (k) => setMade({ contributionId: current.contributionId, contractId: k.contractId }) })}>
              <FilePlus2 size={16} /> {create.isPending ? 'Đang lập…' : 'Lập hợp đồng từ mẫu'}
            </OpBtn>
          </div>
        </>
      )}

      {/* Khoản còn giữ chỗ thì việc tiếp theo là chuyển khoản; khoản đã xác nhận và đủ chữ ký thì xong. */}
      {current.status === 'Reserved' ? (
        <div className="op-formfoot">
          <OpBtn variant={c?.status === 'FullySigned' ? 'primary' : 'ghost'} onClick={onPay}>Về bước chuyển khoản</OpBtn>
        </div>
      ) : c?.status === 'FullySigned' && (
        <div className="op-formfoot"><a className="rd-btn rd-btn--primary" href={portfolioHref(batchCode)}>Xem Lô đã góp</a></div>
      )}
    </OpPanel>
  )
}
