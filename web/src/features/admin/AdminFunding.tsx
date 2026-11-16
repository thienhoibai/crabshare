/* /admin/funding — Vốn vào theo Lô: đã xác nhận, đang giữ chỗ, tối thiểu khả thi, mục tiêu, giai đoạn gọi vốn, lệnh hoàn.
   GET /api/admin/funding/batches. "Chạy chốt vốn ngay": POST /api/admin/funding/close-due (việc mà job nền tự chạy mỗi phút):
   hết hạn các khoản giữ chỗ quá hạn; Lô tới hạn gọi vốn được chốt vốn và mở nếu đủ vốn tối thiểu khả thi và đủ tỷ lệ đặt trước,
   không đủ thì Lô bị huỷ và lập lệnh hoàn. */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Play } from 'lucide-react'
import type { AdminFundingBatch, FundingCloseResult } from '../../shared/api/api.gen'
import {
  Money, OpBadge, OpBtn, OpConfirm, OpFacts, OpHeading, OpMeter, OpNote, OpPanel, OpTable, QueryView, formatDate, formatVnd, useGet, useSend,
} from '../../shared/ui/console'
import { FundingStageBadge } from './adminPartA'

const OUTCOME: Record<string, string> = { CapitalClosed: 'Đã chốt vốn, Lô mở', Cancelled: 'Huỷ, hoàn tiền' }

/** Dòng phụ dưới giai đoạn: hạn gọi vốn, ngày chốt, lệnh hoàn. */
function stageDetail(r: AdminFundingBatch): string {
  const parts = [
    r.capitalClosedAt
      ? `Chốt ${formatDate(r.capitalClosedAt)}${r.totalConfirmedCapital !== null ? `: ${formatVnd(r.totalConfirmedCapital)}` : ''}`
      : r.fundingDeadline ? `${formatDate(r.fundingOpenAt)} – ${formatDate(r.fundingDeadline)}` : '',
    r.refundCount > 0 ? `${r.refundCount} lệnh hoàn${r.refundOpenCount > 0 ? `, ${r.refundOpenCount} chưa xong` : ''}` : '',
  ]
  return parts.filter(Boolean).join(' · ')
}

export default function AdminFunding() {
  const navigate = useNavigate()
  const list = useGet<AdminFundingBatch[]>('/api/admin/funding/batches')
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<FundingCloseResult | null>(null)
  const closeDue = useSend<FundingCloseResult, void>('post', '/api/admin/funding/close-due', {
    success: 'Đã chạy xong một lượt chốt vốn.', quietError: true,
    onSuccess: (r) => { setResult(r); setConfirming(false) },
  })

  return (
    <>
      <OpHeading
        eyebrow="Lô"
        title="Gọi vốn"
        description="Vốn đã xác nhận và giai đoạn gọi vốn của từng Lô."
        action={<OpBtn onClick={() => { closeDue.reset(); setConfirming(true) }}><Play size={17} /> Chạy chốt vốn ngay</OpBtn>}
      />

      {result && (
        <OpPanel accent title={`Vừa chốt: ${result.batches.length} Lô, ${result.expiredReservations} giữ chỗ hết hạn`} action={<OpBtn sm variant="ghost" onClick={() => setResult(null)}>Ẩn</OpBtn>}>
          {result.batches.length > 0 && (
            <OpTable
              rows={result.batches}
              rowKey={(r) => r.batchCode}
              columns={[
                { key: 'code', header: 'Lô', cell: (r) => <a className="op-link op-mono" href={`/admin/batches/${encodeURIComponent(r.batchCode)}`}>{r.batchCode}</a> },
                { key: 'outcome', header: 'Kết quả', cell: (r) => <OpBadge tone={r.outcome === 'CapitalClosed' ? 'ok' : 'danger'}>{OUTCOME[r.outcome] ?? r.outcome}</OpBadge> },
                { key: 'capital', header: 'Vốn đã xác nhận', num: true, cell: (r) => <Money value={r.confirmedCapital} /> },
                { key: 'refunds', header: 'Lệnh hoàn', num: true, cell: (r) => r.refundCount },
              ]}
            />
          )}
        </OpPanel>
      )}

      <QueryView query={list}>
        {(rows) => (
          <OpPanel>
            <OpFacts items={[
              { label: 'Lô đang nhận góp', value: rows.filter((r) => r.stage === 'Open').length },
              { label: 'Quá hạn, chờ chốt', value: rows.filter((r) => r.stage === 'AwaitingClose').length, tone: rows.some((r) => r.stage === 'AwaitingClose') ? 'warn' : undefined },
              { label: 'Vốn đã xác nhận', value: formatVnd(rows.filter((r) => r.stage !== 'Cancelled').reduce((n, r) => n + r.confirmedCapital, 0)), tone: 'ok' },
              { label: 'Lệnh hoàn chưa xong', value: rows.reduce((n, r) => n + r.refundOpenCount, 0), tone: rows.some((r) => r.refundOpenCount > 0) ? 'danger' : undefined },
            ]} />
            <OpTable
              rows={rows}
              rowKey={(r) => r.batchCode}
              empty="Chưa có Lô nào gọi vốn"
              onRowClick={(r) => navigate(`/admin/batches/${encodeURIComponent(r.batchCode)}`)}
              columns={[
                { key: 'batch', header: 'Lô', cell: (r) => <><b>{r.title}</b><br /><small className="rd-muted"><span className="op-mono">{r.batchCode}</span> · {r.operatorName}</small></> },
                { key: 'stage', header: 'Giai đoạn', cell: (r) => <><FundingStageBadge stage={r.stage} /><br /><small className="rd-muted">{stageDetail(r)}</small></> },
                {
                  key: 'meter', header: 'Đã xác nhận trên mục tiêu', width: 280,
                  cell: (r) => (
                    <OpMeter
                      label={`${r.investorCount} nhà đầu tư`}
                      value={r.confirmedCapital}
                      max={r.targetCapital}
                      display={`${formatVnd(r.confirmedCapital)} / ${formatVnd(r.targetCapital)}`}
                    />
                  ),
                },
                {
                  key: 'min', header: 'Tối thiểu khả thi', num: true,
                  cell: (r) => (
                    <>
                      <span className={r.confirmedCapital >= r.minViableCapital ? 'op-ok' : 'op-warn'}><Money value={r.minViableCapital} /></span>
                      {r.reservedCapital > 0 && <><br /><small className="rd-muted">Đang giữ chỗ {formatVnd(r.reservedCapital)}</small></>}
                    </>
                  ),
                },
              ]}
            />
          </OpPanel>
        )}
      </QueryView>

      {confirming && (
        <OpConfirm
          title="Chạy chốt vốn ngay"
          confirmLabel="Chạy ngay"
          pending={closeDue.isPending}
          error={closeDue.error}
          onConfirm={() => closeDue.mutate()}
          onClose={() => setConfirming(false)}
        >
          <OpNote tone="danger">Lô tới hạn sẽ được chốt vốn, hoặc bị huỷ và hoàn tiền nếu chưa đủ điều kiện mở. Không hoàn tác được.</OpNote>
        </OpConfirm>
      )}
    </>
  )
}
