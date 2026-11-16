/* Tab "Hợp đồng" của trang chi tiết Lô P: kho hợp đồng góp vốn của Lô. GET /api/admin/batches/{code}/contracts.
   Xem tệp PDF hiện hành: GET /api/contracts/{id}/file. Đường dự phòng UC15: tải bản đã ký ngoài hệ thống,
   POST /api/contracts/{id}/offline-upload (multipart: file, confirmedBothSigned=true). */
import { useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import type { ContractResponse, ContractSummary } from '../../shared/api/api.gen'
import {
  Checkbox, Field, Money, OpBtn, OpConfirm, OpPanel, OpTable, QueryView, StatusBadge, formatDate, openFile, useGet, useSend,
} from '../../shared/ui/console'

const MAX_PDF_BYTES = 10 * 1024 * 1024

export default function AdminBatchContracts({ code }: { code: string }) {
  const list = useGet<ContractSummary[]>(`/api/admin/batches/${encodeURIComponent(code)}/contracts`)
  const [target, setTarget] = useState<ContractSummary | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const upload = useSend<ContractResponse, { file: File; confirmedBothSigned: boolean }>(
    'post',
    () => `/api/contracts/${target?.contractId}/offline-upload`,
    { form: true, success: 'Đã lưu bản hợp đồng đã ký.', quietError: true, onSuccess: () => setTarget(null) },
  )
  const tooLarge = !!file && file.size > MAX_PDF_BYTES

  return (
    <OpPanel title="Hợp đồng góp vốn" subtitle="Mỗi khoản góp một hợp đồng. Người nuôi ký trước, nhà đầu tư ký sau.">
      <QueryView query={list}>
        {(rows) => (
          <OpTable
            rows={rows}
            rowKey={(c) => c.contractId}
            empty="Lô chưa có hợp đồng góp vốn"
            columns={[
              { key: 'investor', header: 'Nhà đầu tư', cell: (c) => <><b>{c.investorName}</b><br /><small className="op-mono rd-muted">{c.contractNo}</small></> },
              { key: 'amount', header: 'Vốn góp', num: true, cell: (c) => <Money value={c.amount} /> },
              {
                key: 'status', header: 'Hợp đồng',
                cell: (c) => (
                  <>
                    <StatusBadge kind="contract" value={c.status} />
                    {c.fullySignedAt && <><br /><small className="rd-muted">{formatDate(c.fullySignedAt)}{c.signingMethod === 'OfflineUpload' ? ' · ký ngoài hệ thống' : ''}</small></>}
                  </>
                ),
              },
              { key: 'contribution', header: 'Khoản góp', cell: (c) => <StatusBadge kind="contribution" value={c.contributionStatus} /> },
              {
                key: 'act', header: '',
                cell: (c) => (
                  <span className="op-inline">
                    <OpBtn sm variant="ghost" onClick={() => void openFile(`/api/contracts/${c.contractId}/file`)}><FileText size={15} /> PDF</OpBtn>
                    {c.status !== 'FullySigned' && c.status !== 'Void' && (
                      <OpBtn sm variant="ghost" onClick={() => { upload.reset(); setFile(null); setConfirmed(false); setTarget(c) }}><Upload size={15} /> Tải bản đã ký</OpBtn>
                    )}
                  </span>
                ),
              },
            ]}
          />
        )}
      </QueryView>

      {target && (
        <OpConfirm
          title="Tải bản đã ký ngoài hệ thống"
          sub={`${target.contractNo} · ${target.investorName}`}
          confirmLabel="Lưu bản đã ký"
          pending={upload.isPending}
          error={upload.error}
          disabled={!file || tooLarge || !confirmed}
          onConfirm={() => { if (file) upload.mutate({ file, confirmedBothSigned: true }) }}
          onClose={() => setTarget(null)}
        >
          <Field label="Tệp PDF đã ký" required hint="Tối đa 10 MB" error={tooLarge ? 'Tệp lớn hơn 10 MB.' : undefined}>
            <input className="op-input" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Checkbox checked={confirmed} onChange={setConfirmed}>Tôi đã đối chiếu, bản này đủ chữ ký hai bên.</Checkbox>
        </OpConfirm>
      )}
    </OpPanel>
  )
}
