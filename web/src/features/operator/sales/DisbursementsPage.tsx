/* /operator/disbursements — Mốc giải ngân của mọi Lô P của hộ nuôi tôi: Lô có việc cần làm hiện trước, mốc kế tiếp kèm điều còn thiếu,
   xin giải ngân, hạn giải trình. GET /api/operator/tranches, POST /api/batches/{code}/tranches/{no}/request (BR-144, BR-145, BR-233). */
import { OpEmpty, OpFacts, OpHeading, OpMeter, OpMore, OpPanel, QueryView, formatVnd, useGet } from '../../../shared/ui/console'
import { MilestoneFlow, needsAction } from './MilestoneFlow'
import { batchHref, useIsOwner, type MilestoneTranche } from './common'

const sum = (rows: MilestoneTranche[]) => rows.reduce((total, t) => total + t.plannedAmount, 0)
const released = (rows: MilestoneTranche[]) => rows.filter((t) => t.status === 'Released')

export default function DisbursementsPage() {
  const tranches = useGet<MilestoneTranche[]>('/api/operator/tranches')
  const { owner } = useIsOwner()

  const panel = (code: string, rows: MilestoneTranche[], accent: boolean) => (
    <OpPanel key={code} accent={accent} title={`${code} · ${rows[0].batchTitle}`} action={<a className="op-link" href={batchHref(code, 'tien')}>Mở Lô</a>}>
      <OpMeter label="Đã giải ngân" value={sum(released(rows))} max={sum(rows)} display={`${formatVnd(sum(released(rows)))} / ${formatVnd(sum(rows))}`} />
      <MilestoneFlow rows={rows} owner={owner} />
    </OpPanel>
  )

  return (
    <>
      <OpHeading eyebrow="Tiền" title="Giải ngân theo mốc" />
      <QueryView query={tranches}>
        {(rows) => {
          if (rows.length === 0) return <OpEmpty title="Chưa có mốc giải ngân nào">Mốc được lập khi Lô P có kế hoạch chi phí và được duyệt.</OpEmpty>
          const codes = [...new Set(rows.map((t) => t.batchCode))]
          const of = (code: string) => rows.filter((t) => t.batchCode === code)
          const todo = codes.filter((c) => of(c).some(needsAction))
          const rest = codes.filter((c) => !todo.includes(c))
          return (
            <>
              <OpFacts items={[
                { label: 'Xin được ngay', value: `${rows.filter((t) => t.canRequest).length} mốc`, tone: rows.some((t) => t.canRequest) ? 'warn' : undefined },
                { label: 'Cần giải trình', value: `${rows.filter((t) => t.status === 'NeedsExplanation').length} mốc`, tone: rows.some((t) => t.status === 'NeedsExplanation') ? 'danger' : undefined },
                { label: 'Chờ Admin duyệt', value: `${rows.filter((t) => t.status === 'Requested').length} mốc` },
                { label: 'Đã giải ngân', value: formatVnd(sum(released(rows))), tone: 'ok' },
              ]} />
              {todo.map((code) => panel(code, of(code), true))}
              {todo.length === 0
                ? rest.map((code) => panel(code, of(code), false))
                : rest.length > 0 && <OpMore label="Lô chưa có việc cần làm" count={rest.length}><div className="op-stack">{rest.map((code) => panel(code, of(code), false))}</div></OpMore>}
            </>
          )
        }}
      </QueryView>
    </>
  )
}
