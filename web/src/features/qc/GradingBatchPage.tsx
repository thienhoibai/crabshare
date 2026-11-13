/* /qc/phan-hang/:batchCode — Hàng chờ duyệt phân hạng của một Lô (BR-155…157, BR-017).
   GET /api/batches/{code}/grade-decisions (quyết định hiện hành), lọc Draft và Hold thành hàng chờ, mỗi lần một con.
   Buổi đo: người được phân việc GradingSession duyệt, giữ lại, loại, nhập thước kẹp. Con đã bị giữ lại (QcHold):
   chỉ người được phân việc SecondReview xác nhận giữ rồi duyệt hoặc loại. Người khác bấm thì máy chủ trả 403.
   Đổi size hoặc hạng chỉ làm được với con đã duyệt nên nằm ở tab Đã xử lý. */
import { useState } from 'react'
import { useParams } from 'react-router'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, PauseCircle, Ruler, ShieldCheck, Trash2 } from 'lucide-react'
import type { BatchGradingSummary, GradeDecisionResponse, GradeRuleSetResponse, GradingStandardResponse } from '../../shared/api/api.gen'
import {
  OpBack, OpBtn, OpEmpty, OpFacts, OpHeading, OpLoading, OpNote, OpTabs, QueryView, StatusBadge, label, useGet,
} from '../../shared/ui/console'
import { DecisionCard } from './DecisionCard'
import { DecisionDialog, type DialogKind } from './DecisionDialogs'
import { HandledDecisions } from './HandledDecisions'
import { ruleSetOf, useBatchHead, useMyId, useQcTasks } from './qc'

/** Vai của tôi với một quyết định đang chờ. */
type Role = 'session' | 'second' | 'holder' | 'none'
const ROLE_ORDER: Record<Role, number> = { session: 0, second: 0, holder: 1, none: 2 }

/** Thẻ một con đang chờ kèm nút thao tác theo vai của tôi. checking: chưa biết tôi có được phân hay không. */
function WaitingCard({ decision: d, role, ruleSet, checking, onRemeasured }: {
  decision: GradeDecisionResponse
  role: Role
  ruleSet: GradeRuleSetResponse | undefined
  checking: boolean
  onRemeasured: (decisionNo: string | null) => void
}) {
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const needCaliper = d.holdReasons.includes('CaliperRequired')
  const needConfirm = role === 'second' && d.secondConfirmedAt === null
  const caliper = <OpBtn variant={needCaliper ? 'primary' : 'ghost'} onClick={() => setDialog('caliper')}><Ruler size={18} /> Nhập thước kẹp</OpBtn>

  return (
    <>
      <DecisionCard decision={d} ruleSet={ruleSet} extra={role === 'session' && !needCaliper ? caliper : undefined}>
        {checking ? <OpLoading /> : role === 'holder' ? (
          <OpNote tone="info">Bạn đã giữ lại con này. Chờ người kiểm thứ hai.</OpNote>
        ) : role === 'none' ? (
          <OpNote tone="info">Con này không phân cho bạn.</OpNote>
        ) : (
          <>
            {/* Lý do giữ lại đã hiện trên thẻ (DecisionCard) cho mọi con bị giữ, không lặp lại ở đây. */}
            <div className="qc-acts">
              {needConfirm ? (
                <OpBtn onClick={() => setDialog('confirm')}><ShieldCheck size={18} /> Xác nhận giữ</OpBtn>
              ) : (
                <>
                  {needCaliper && role === 'session'
                    ? caliper
                    : <OpBtn disabled={needCaliper} onClick={() => setDialog('approve')}><Check size={18} /> Duyệt</OpBtn>}
                  {role === 'session' && <OpBtn variant="ghost" onClick={() => setDialog('hold')}><PauseCircle size={18} /> Giữ lại</OpBtn>}
                  <OpBtn variant="danger" onClick={() => setDialog('reject')}><Trash2 size={18} /> Loại bỏ</OpBtn>
                </>
              )}
            </div>
          </>
        )}
      </DecisionCard>
      {dialog && <DecisionDialog kind={dialog} decision={d} onClose={() => setDialog(null)} onRemeasured={onRemeasured} />}
    </>
  )
}

export default function GradingBatchPage() {
  const { batchCode = '' } = useParams()
  const path = `/api/batches/${encodeURIComponent(batchCode)}`
  const me = useMyId()
  const tasks = useQcTasks()
  const head = useBatchHead(batchCode)
  // Người nuôi đo từng con ở trạm trong lúc kiểm phẩm đứng duyệt, nên tự hỏi lại để thấy đề xuất mới.
  const summary = useGet<BatchGradingSummary>(`${path}/grading`, undefined, { refetchInterval: 20_000 })
  const decisions = useGet<GradeDecisionResponse[]>(`${path}/grade-decisions`, undefined, { refetchInterval: 20_000 })
  const standards = useGet<GradingStandardResponse[]>('/api/grading/standards', undefined, { staleTime: 600_000 })
  const [tab, setTab] = useState<'waiting' | 'handled'>('waiting')
  const [pos, setPos] = useState(0)
  const [pinned, setPinned] = useState<string | null>(null)

  const mine = (tasks.data ?? []).filter((t) => t.batchCode === batchCode)
  const hasSession = mine.some((t) => t.kind === 'GradingSession')
  const hasSecond = mine.some((t) => t.kind === 'SecondReview')
  const roleOf = (d: GradeDecisionResponse): Role =>
    d.holdReasons.includes('QcHold') ? (d.heldBy === me ? 'holder' : hasSecond ? 'second' : 'none') : hasSession ? 'session' : 'none'
  const s = summary.data

  return (
    <>
      <OpHeading
        crumb={<OpBack href="/qc/phan-hang"><ArrowLeft size={16} /> Duyệt phân hạng</OpBack>}
        eyebrow={`Lô ${batchCode}${s ? ` · ${label('crabType', s.crabType)}` : ''}`}
        title={head.data?.title ?? batchCode}
        action={s ? <StatusBadge kind="batch" value={s.batchStatus} /> : undefined}
      />
      {s && (
        <OpFacts items={[
          { label: 'Chờ duyệt', value: s.draft + s.hold, tone: s.draft + s.hold > 0 ? 'warn' : undefined },
          { label: 'Chưa đo', value: s.notMeasured },
          { label: 'Đã duyệt', value: s.approved, tone: 'ok' },
          { label: 'Loại bỏ', value: s.rejected, tone: s.rejected > 0 ? 'danger' : undefined },
        ]} />
      )}

      <QueryView query={decisions}>
        {(all) => {
          const queue = all.filter((d) => d.status === 'Draft' || d.status === 'Hold')
            .sort((a, b) => ROLE_ORDER[roleOf(a)] - ROLE_ORDER[roleOf(b)] || Date.parse(a.createdAt) - Date.parse(b.createdAt))
          const handled = all.filter((d) => d.status === 'Approved' || d.status === 'Rejected')
            .sort((a, b) => Date.parse(b.decidedAt ?? b.createdAt) - Date.parse(a.decidedAt ?? a.createdAt))
          // Sau khi nhập thước kẹp, bám theo phiên bản đề xuất mới của đúng con đó; còn lại giữ vị trí trong hàng chờ.
          const pinnedIndex = pinned ? queue.findIndex((d) => d.decisionNo === pinned) : -1
          const index = pinnedIndex >= 0 ? pinnedIndex : Math.min(pos, queue.length - 1)
          const current = queue[index]
          const go = (next: number) => { setPinned(null); setPos(next) }
          return (
            <>
              <OpTabs
                items={[{ key: 'waiting', label: 'Chờ duyệt', count: queue.length }, { key: 'handled', label: 'Đã xử lý', count: handled.length }]}
                value={tab}
                onChange={setTab}
              />
              {tab === 'handled' && <HandledDecisions decisions={handled} bySpec={s?.bySpec ?? []} />}
              {tab === 'waiting' && !current && (
                <OpEmpty title="Không có con nào chờ duyệt">{s && s.notMeasured > 0 ? `Còn ${s.notMeasured} con chưa đo ở trạm.` : null}</OpEmpty>
              )}
              {tab === 'waiting' && current && (
                <>
                  {queue.length > 1 && (
                    <div className="qc-pager">
                      <OpBtn variant="ghost" disabled={index === 0} onClick={() => go(index - 1)} aria-label="Con trước"><ChevronLeft size={18} /> Trước</OpBtn>
                      <span>Con {index + 1} / {queue.length}</span>
                      <OpBtn variant="ghost" disabled={index >= queue.length - 1} onClick={() => go(index + 1)} aria-label="Con sau">Sau <ChevronRight size={18} /></OpBtn>
                    </div>
                  )}
                  <WaitingCard
                    key={current.decisionNo}
                    decision={current}
                    role={roleOf(current)}
                    ruleSet={ruleSetOf(standards.data, s?.crabType, current.ruleSetVersion)}
                    checking={tasks.isPending}
                    onRemeasured={setPinned}
                  />
                </>
              )}
            </>
          )
        }}
      </QueryView>
    </>
  )
}
