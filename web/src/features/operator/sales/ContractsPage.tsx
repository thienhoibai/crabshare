/* /operator/contract — Hợp đồng góp vốn của các Lô của hộ nuôi tôi. Chủ hộ nuôi ký trước, nhà đầu tư ký sau trên cùng một tệp PDF.
   GET /api/operator/contracts, GET /api/contracts/{id}, tệp /api/contracts/{id}/file, POST /api/contracts/{id}/sign.
   Tải bản ký ngoài hệ thống (offline-upload) là quyền của Admin nên không có ở trang này. */
import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowLeft, FileSignature, FileText } from 'lucide-react'
import type { ContractResponse, ContractSummary } from '../../../shared/api/api.gen'
import {
  Money, OpBack, OpBtn, OpConfirm, OpEmpty, OpFlow, OpHeading, OpKv, OpMore, OpNote, OpPanel, OpTable, OpTabs, QueryView, StatusBadge,
  formatDateTime, formatVnd, openFile, useBlobUrl, useGet, useSend,
} from '../../../shared/ui/console'
import './sales.css'

type Tab = 'mine' | 'investor' | 'done' | 'all'

const FILTERS: Record<Tab, (c: ContractSummary) => boolean> = {
  mine: (c) => c.status === 'Draft',
  investor: (c) => c.status === 'OperatorSigned',
  done: (c) => c.status === 'FullySigned',
  all: () => true,
}

export default function ContractsPage() {
  const [params, setParams] = useSearchParams()
  const id = Number(params.get('hd'))
  return id > 0
    ? <ContractDetail id={id} />
    : <ContractList onOpen={(contractId) => setParams({ hd: String(contractId) })} />
}

function ContractList({ onOpen }: { onOpen: (id: number) => void }) {
  const [picked, setPicked] = useState<Tab | null>(null)
  const contracts = useGet<ContractSummary[]>('/api/operator/contracts')
  return (
    <>
      <OpHeading eyebrow="Tiền" title="Hợp đồng góp vốn" description="Chủ hộ nuôi ký trước, nhà đầu tư ký sau." />
      <QueryView query={contracts}>
        {(rows) => {
          if (rows.length === 0) return <OpEmpty title="Chưa có hợp đồng góp vốn nào" />
          const count = (key: Tab) => rows.filter(FILTERS[key]).length
          const tab = picked ?? (count('mine') > 0 ? 'mine' : 'all')
          return (
            <>
              <OpTabs<Tab>
                items={[
                  { key: 'mine', label: 'Chờ tôi ký', count: count('mine') },
                  { key: 'investor', label: 'Chờ nhà đầu tư', count: count('investor') },
                  { key: 'done', label: 'Đủ chữ ký', count: count('done') },
                  { key: 'all', label: 'Tất cả', count: rows.length },
                ]}
                value={tab}
                onChange={setPicked}
                label="Lọc hợp đồng"
              />
              <OpPanel>
                <OpTable
                  rows={rows.filter(FILTERS[tab])}
                  rowKey={(c) => c.contractId}
                  empty="Không có hợp đồng nào ở mục này"
                  onRowClick={(c) => onOpen(c.contractId)}
                  columns={[
                    { key: 'investor', header: 'Nhà đầu tư', cell: (c) => <><b>{c.investorName}</b><span className="os-sub op-mono">{c.contractNo}</span></> },
                    { key: 'batch', header: 'Lô', cell: (c) => c.batchCode },
                    { key: 'amount', header: 'Vốn góp', num: true, cell: (c) => <Money value={c.amount} /> },
                    { key: 'status', header: 'Trạng thái', cell: (c) => <StatusBadge kind="contract" value={c.status} /> },
                    { key: 'open', header: '', cell: (c) => <OpBtn sm variant="ghost" onClick={(e) => { e.stopPropagation(); onOpen(c.contractId) }}>{c.status === 'Draft' ? 'Xem và ký' : 'Xem'}</OpBtn> },
                  ]}
                />
              </OpPanel>
            </>
          )
        }}
      </QueryView>
    </>
  )
}

function ContractDetail({ id }: { id: number }) {
  const contract = useGet<ContractResponse>(`/api/contracts/${id}`)
  const crumb = <OpBack href="/operator/contract"><ArrowLeft size={16} /> Hợp đồng góp vốn</OpBack>
  return (
    <QueryView query={contract}>
      {(c) => <ContractView c={c} crumb={crumb} />}
    </QueryView>
  )
}

function ContractView({ c, crumb }: { c: ContractResponse; crumb: ReactNode }) {
  const [confirm, setConfirm] = useState(false)
  const filePath = `/api/contracts/${c.contractId}/file`
  // Thêm mã băm vào đường dẫn để tải lại bản xem trước sau mỗi chữ ký.
  const pdf = useBlobUrl(`${filePath}?v=${c.currentHash}`)
  const sign = useSend<ContractResponse, void>('post', `/api/contracts/${c.contractId}/sign`, {
    success: 'Đã ký hợp đồng. Chờ nhà đầu tư ký.',
    quietError: true,
    onSuccess: () => setConfirm(false),
  })
  const signed = (role: string) => c.signatures.find((s) => s.role === role)
  const farm = signed('Operator')
  const investor = signed('Investor')
  const live = c.status !== 'Void'

  return (
    <>
      <OpHeading
        crumb={crumb}
        eyebrow={`Lô ${c.batchCode} · ${c.contractNo}`}
        title={`Hợp đồng với ${c.investorName}`}
        action={<StatusBadge kind="contract" value={c.status} />}
      />
      {/* Câu cảnh báo pháp lý do máy chủ trả về, phải thấy trước khi ký. */}
      <OpNote>{c.legalNotice}</OpNote>

      <OpPanel accent={c.canSign} title={`Vốn góp ${formatVnd(c.amount)}`} subtitle="Ký trên giấy thì gửi bản đã ký cho Admin tải lên.">
        <OpFlow steps={[
          { title: 'Chủ hộ nuôi ký', sub: farm ? `${farm.signerName} · ${formatDateTime(farm.signedAt)}` : undefined, state: farm ? 'done' : live ? 'now' : 'bad' },
          { title: 'Nhà đầu tư ký', sub: investor ? `${investor.signerName} · ${formatDateTime(investor.signedAt)}` : undefined, state: investor ? 'done' : farm && live ? 'now' : 'todo' },
        ]} />
        <div className="op-inline">
          {c.canSign && <OpBtn onClick={() => { sign.reset(); setConfirm(true) }}><FileSignature size={17} /> Ký số hợp đồng</OpBtn>}
          <OpBtn variant="ghost" onClick={() => void openFile(filePath)}><FileText size={17} /> Mở tệp PDF</OpBtn>
        </div>
        {!c.canSign && c.status === 'Draft' && <small className="rd-muted">Chủ hộ nuôi mới ký được.</small>}
      </OpPanel>

      {pdf.url && <iframe className="os-pdf" title={`Hợp đồng ${c.contractNo}`} src={pdf.url} />}
      {pdf.error && <small className="rd-muted">Không xem trước được tệp PDF của hợp đồng này.</small>}

      <OpMore label="Chi tiết hợp đồng">
        <div className="op-stack">
          <OpKv items={[
            { label: 'Bên A, người nuôi', value: c.operatorName },
            { label: 'Khoản góp', value: <StatusBadge kind="contribution" value={c.contributionStatus} /> },
            { label: 'Mẫu hợp đồng', value: c.templateVersion },
            { label: 'Cách ký', value: c.signingMethod === 'OfflineUpload' ? 'Ký trên giấy' : 'Ký số' },
            { label: 'Lập lúc', value: formatDateTime(c.createdAt) },
            { label: 'Đủ chữ ký lúc', value: formatDateTime(c.fullySignedAt) },
          ]} />
          <p className="os-hash">Mã băm bản đang xem: <code>{c.currentHash}</code></p>
          {c.finalHash && <p className="os-hash">Mã băm bản cuối: <code>{c.finalHash}</code></p>}
        </div>
      </OpMore>

      {confirm && (
        <OpConfirm
          title="Ký số hợp đồng"
          sub={`${c.investorName} · ${c.contractNo}`}
          confirmLabel="Ký hợp đồng"
          pending={sign.isPending}
          error={sign.error}
          onConfirm={() => sign.mutate()}
          onClose={() => setConfirm(false)}
        >
          <p>Bạn ký phần của người nuôi trên tệp đang xem. Đã ký thì không rút lại được.</p>
        </OpConfirm>
      )}
    </>
  )
}
