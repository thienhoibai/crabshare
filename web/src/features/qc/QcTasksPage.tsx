/* /qc — Tất cả việc đang chờ của tôi (GET /api/qc/tasks), gom theo loại việc, mới nhất trước.
   API chỉ trả việc đang chờ làm; việc đã xong rời khỏi danh sách. */
import { OpEmpty, OpFacts, OpHeading, OpMore, QueryView, label } from '../../shared/ui/console'
import { TaskGroups } from './TaskRows'
import { WORK_KINDS, newestFirst, useQcTasks } from './qc'

const KIND_HREF: Record<string, string> = {
  IncomingInspection: '/qc/kiem-dau-vao',
  GradingSession: '/qc/phan-hang',
  SecondReview: '/qc/phan-hang',
  SiteVisit: '/qc/tham-trai',
}

export default function QcTasksPage() {
  const tasks = useQcTasks()
  return (
    <>
      <OpHeading eyebrow="Việc được giao" title="Tất cả việc" />
      <QueryView query={tasks}>
        {(list) => {
          if (list.length === 0) return <OpEmpty title="Chưa có việc nào chờ bạn" />
          // Loại việc chưa có trang làm việc trên web (kiểm xuất hàng, kiểm khi tranh chấp).
          const others = newestFirst(list.filter((t) => !(WORK_KINDS as readonly string[]).includes(t.kind)))
          return (
            <>
              <OpFacts items={WORK_KINDS.map((kind) => {
                const count = list.filter((t) => t.kind === kind).length
                return { label: label('qcKind', kind), value: <a href={KIND_HREF[kind]}>{count}</a>, tone: count > 0 ? 'warn' as const : undefined }
              })} />
              <TaskGroups tasks={list} kinds={WORK_KINDS} titles />
              {others.length > 0 && (
                <OpMore label="Việc khác" count={others.length}>
                  <ul className="qc-lines">
                    {others.map((t) => <li key={t.assignmentId}><b>{label('qcKind', t.kind)}</b><span>Lô {t.batchCode}</span></li>)}
                  </ul>
                </OpMore>
              )}
            </>
          )
        }}
      </QueryView>
    </>
  )
}
