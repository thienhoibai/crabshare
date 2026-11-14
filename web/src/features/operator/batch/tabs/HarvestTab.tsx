/* Mục "Thu hoạch và phân hạng" của một Lô, dùng khi đứng ở trạm đo: chọn cua, mở lượt đo, xem kết quả (BR-150, BR-151, BR-224).
   Bốn con số nhỏ, rồi danh sách quyết định phân hạng. Người nuôi chỉ đo và xem; Nhân viên kiểm phẩm duyệt hạng cuối (BR-155…157). */
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Sprout } from 'lucide-react'
import type { BatchGradingSummary, GradeDecisionResponse } from '../../../../shared/api/api.gen'
import {
  OpBadge, OpBtn, OpConfirm, OpEmpty, OpFacts, OpMore, OpPanel, OpTable, OpTabs, QueryView, StatusBadge, label, useGet, useSend,
} from '../../../../shared/ui/console'
import { OpenSessionForm, SessionView } from '../../sales/SessionPanel'
import { enc, fmtNum } from '../../sales/common'
import '../../sales/sales.css'
import type { BatchTabProps } from '../types'

type Filter = '' | 'Draft' | 'Hold' | 'Approved' | 'Rejected'

export default function HarvestTab({ code, batch }: BatchTabProps) {
  const base = `/api/batches/${enc(code)}`
  const [params, setParams] = useSearchParams()
  const sessionNo = params.get('luot')
  const [filter, setFilter] = useState<Filter>('')
  const [starting, setStarting] = useState(false)

  const summary = useGet<BatchGradingSummary>(`${base}/grading`)
  const decisions = useGet<GradeDecisionResponse[]>(`${base}/grade-decisions`)
  const start = useSend<{ status: string }, void>('post', `${base}/start-harvest`, {
    success: 'Đã bắt đầu thu hoạch.',
    quietError: true,
    onSuccess: () => setStarting(false),
  })

  const canStart = batch.hasHolding && batch.status === 'InProduction'
  // Lô có lưu nuôi đo khi thu hoạch; Lô không lưu nuôi đo ngay sau khi nhận cua (BR-151).
  const canMeasure = batch.hasHolding ? batch.status === 'Harvesting' : batch.status === 'Sourcing' || batch.status === 'Selling'
  const roe = batch.crabType.includes('Roe')
  const openSession = (no: string | null) => setParams(no ? { luot: no } : {}, { replace: true })

  return (
    <QueryView query={decisions}>
      {(all) => {
        const measured = new Set(all.map((d) => d.crabCode))
        const shown = filter ? all.filter((d) => d.status === filter) : all
        const count = (status: string) => all.filter((d) => d.status === status).length
        const g = summary.data
        return (
          <>
            {sessionNo && <SessionView key={sessionNo} sessionNo={sessionNo} roe={roe} onClose={() => openSession(null)} />}

            {canStart && (
              <OpPanel accent title="Thu hoạch">
                <div><OpBtn onClick={() => { start.reset(); setStarting(true) }}><Sprout size={17} /> Bắt đầu thu hoạch</OpBtn></div>
              </OpPanel>
            )}

            {canMeasure && (
              <OpPanel title={sessionNo ? 'Đo con tiếp theo' : 'Đo cua'}>
                <OpenSessionForm batch={batch} measured={measured} onOpened={openSession} />
              </OpPanel>
            )}

            {g && g.received > 0 && (
              <OpFacts items={[
                { label: 'Chờ đo', value: g.notMeasured, tone: g.notMeasured ? 'warn' : undefined },
                { label: 'Chờ kiểm phẩm duyệt', value: g.draft + g.hold, tone: g.draft + g.hold ? 'info' : undefined },
                { label: 'Đã duyệt hạng', value: g.approved, tone: 'ok' },
                { label: 'Loại bỏ', value: g.rejected, tone: g.rejected ? 'danger' : undefined },
              ]} />
            )}

            {all.length === 0 && !canStart && !canMeasure && <OpEmpty title="Lô chưa có con cua nào được đo" />}

            {all.length > 0 && (
              <OpPanel title="Kết quả từng con" subtitle="Nhân viên kiểm phẩm duyệt hạng cuối. Người nuôi chỉ đo và xem.">
                <OpTabs<Filter>
                  items={[
                    { key: '', label: 'Tất cả', count: all.length },
                    { key: 'Draft', label: 'Chờ duyệt', count: count('Draft') },
                    { key: 'Hold', label: 'Giữ lại', count: count('Hold') },
                    { key: 'Approved', label: 'Đã duyệt', count: count('Approved') },
                    { key: 'Rejected', label: 'Loại bỏ', count: count('Rejected') },
                  ]}
                  value={filter}
                  onChange={setFilter}
                  label="Lọc kết quả"
                />
                <OpTable
                  rows={shown}
                  rowKey={(d) => d.decisionNo}
                  empty="Không có con nào ở trạng thái này"
                  onRowClick={(d) => openSession(d.sessionNo)}
                  columns={[
                    { key: 'crab', header: 'Mã cua', cell: (d) => <><b className="op-mono">{d.crabCode}</b><span className="os-sub">{d.weightG === null ? '' : `${fmtNum(d.weightG)} g`}{d.carapaceLengthCm === null ? '' : ` · mai ${fmtNum(d.carapaceLengthCm)} cm`}</span></> },
                    {
                      key: 'proposed', header: 'Đề xuất', cell: (d) => (
                        <>
                          {[d.proposedSize ? label('sizeCode', d.proposedSize) : null, d.proposedGrade ? label('gradeCode', d.proposedGrade) : null].filter(Boolean).join(' · ') || '—'}
                          {d.holdReasons.length > 0 && <span className="os-sub">{d.holdReasons.map((r) => label('holdReason', r)).join(', ')}</span>}
                        </>
                      ),
                    },
                    {
                      key: 'final', header: 'Hạng cuối', cell: (d) => (d.finalGrade
                        ? <b>{label('sizeCode', d.finalSize)} · {label('gradeCode', d.finalGrade)}</b>
                        : '—'),
                    },
                    { key: 'status', header: 'Trạng thái', cell: (d) => <><StatusBadge kind="grade" value={d.status} />{d.reason && <span className="os-sub">{d.reason}</span>}</> },
                  ]}
                />
                {g && g.bySpec.length > 0 && (
                  <OpMore label="Đã duyệt theo quy cách" count={g.bySpec.length}>
                    <OpTable
                      rows={g.bySpec}
                      rowKey={(s) => `${s.specCode}-${s.size}-${s.grade}`}
                      columns={[
                        { key: 'spec', header: 'Quy cách', cell: (s) => (s.specCode === 'SUBSTANDARD' ? <OpBadge tone="warn">Dưới chuẩn</OpBadge> : <span className="op-mono">{s.specCode}</span>) },
                        { key: 'size', header: 'Size và hạng', cell: (s) => [label('sizeCode', s.size), label('gradeCode', s.grade)].filter(Boolean).join(' · ') || '—' },
                        { key: 'count', header: 'Số con', num: true, cell: (s) => <b>{s.count}</b> },
                      ]}
                    />
                  </OpMore>
                )}
              </OpPanel>
            )}

            {starting && (
              <OpConfirm
                title="Bắt đầu thu hoạch"
                sub={`Lô ${code}`}
                confirmLabel="Bắt đầu thu hoạch"
                pending={start.isPending}
                error={start.error}
                onConfirm={() => start.mutate()}
                onClose={() => setStarting(false)}
              >
                <p>Lô chuyển sang đang thu hoạch và không quay lại được.</p>
              </OpConfirm>
            )}
          </>
        )
      }}
    </QueryView>
  )
}
