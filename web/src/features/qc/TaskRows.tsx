/* Hàng việc dùng chung cho trang /qc và ba trang danh sách theo loại việc. Mỗi hàng dẫn tới đúng trang làm việc:
   kiểm đầu vào → phiếu nhận, duyệt phân hạng và xác nhận lần hai → hàng chờ của Lô, thăm trại → biên bản. */
import type { ReactNode } from 'react'
import { ClipboardCheck, MapPin, Ruler, ShieldCheck } from 'lucide-react'
import type { BatchGradingSummary, QcTaskResponse } from '../../shared/api/api.gen'
import {
  OpBadge, OpEmpty, OpError, OpHeading, OpLoading, OpMeter, OpPanel, OpRow, QueryView, label, toast, useGet,
} from '../../shared/ui/console'
import { newestFirst, receiptHref, useBatchHead, useIncomingReceipts, useQcTasks, type ReceiptTask } from './qc'

/** "Lô CS-… · tên Lô" cho dòng phụ của một hàng. */
function BatchName({ code }: { code: string }) {
  const head = useBatchHead(code)
  return <>Lô {code}{head.data ? ` · ${head.data.title}` : ''}</>
}

function IncomingRow({ row }: { row: ReceiptTask }) {
  const { task, receipt } = row
  if (!receipt)
    return (
      <OpRow
        onClick={() => toast('Chưa tra được số phiếu của việc này. Tải lại trang.', 'info')}
        media={<ClipboardCheck size={24} />}
        title="Phiếu nhận hàng"
        sub={<BatchName code={task.batchCode} />}
      />
    )
  const done = receipt.acceptedCount + receipt.rejectedCount
  return (
    <OpRow
      href={receiptHref(receipt.receiptNo, task.batchCode)}
      media={<ClipboardCheck size={24} />}
      title={receipt.receiptNo}
      sub={<BatchName code={task.batchCode} />}
      mid={<OpMeter label="Đã kiểm" value={done} max={receipt.declaredCount} display={`${done} / ${receipt.declaredCount} con`} />}
      end={receipt.rejectedCount > 0 ? <OpBadge tone="danger">Loại {receipt.rejectedCount}</OpBadge> : null}
    />
  )
}

/** Buổi đo của một Lô, hoặc các con bị giữ lại của Lô đang chờ tôi xác nhận lần hai (count con). */
function GradingRow({ task, count }: { task: QcTaskResponse; count: number }) {
  const summary = useGet<BatchGradingSummary>(`/api/batches/${encodeURIComponent(task.batchCode)}/grading`)
  const head = useBatchHead(task.batchCode)
  const s = summary.data
  const second = task.kind === 'SecondReview'
  return (
    <OpRow
      href={`/qc/phan-hang/${encodeURIComponent(task.batchCode)}`}
      media={second ? <ShieldCheck size={24} /> : <Ruler size={24} />}
      title={task.batchCode}
      sub={head.data?.title}
      mid={s ? <small>{label('crabType', s.crabType)} · {s.notMeasured} chưa đo · {s.approved} đã duyệt</small> : null}
      end={second
        ? <OpBadge tone="danger">{count} con chờ xác nhận</OpBadge>
        : s ? <OpBadge tone={s.draft + s.hold > 0 ? 'warn' : 'mute'}>{s.draft + s.hold} con chờ duyệt</OpBadge> : null}
    />
  )
}

function VisitRow({ task }: { task: QcTaskResponse }) {
  const head = useBatchHead(task.batchCode)
  return (
    <OpRow
      href={`/qc/tham-trai/${task.assignmentId}`}
      media={<MapPin size={24} />}
      title={task.batchCode}
      sub={head.data?.title}
      mid={head.data?.executorName ? <small>Người nuôi: {head.data.executorName}</small> : null}
    />
  )
}

/** Các nhóm việc theo loại, mới nhất trước. titles: hiện tên nhóm phía trên (trang /qc). */
export function TaskGroups({ tasks, kinds, titles = false }: { tasks: QcTaskResponse[]; kinds: readonly string[]; titles?: boolean }) {
  const wantsIncoming = kinds.includes('IncomingInspection')
  const receipts = useIncomingReceipts(wantsIncoming ? tasks : undefined)

  const rowsOf = (kind: string): ReactNode[] => {
    const list = newestFirst(tasks.filter((t) => t.kind === kind))
    if (kind === 'IncomingInspection') {
      if (list.length === 0) return []
      if (receipts.loading) return [<OpLoading key="wait" />]
      if (receipts.error) return [<OpError key="error" error={receipts.error} />]
      return [...receipts.rows].sort((a, b) => Date.parse(b.task.assignedAt) - Date.parse(a.task.assignedAt))
        .map((row) => <IncomingRow key={row.task.assignmentId} row={row} />)
    }
    if (kind === 'SecondReview') {
      // Mỗi con bị giữ lại là một việc; gom theo Lô vì cùng dẫn tới hàng chờ của Lô đó.
      const firstOfBatch = list.filter((t, i) => list.findIndex((x) => x.batchCode === t.batchCode) === i)
      return firstOfBatch.map((t) => <GradingRow key={t.assignmentId} task={t} count={list.filter((x) => x.batchCode === t.batchCode).length} />)
    }
    if (kind === 'GradingSession') return list.map((t) => <GradingRow key={t.assignmentId} task={t} count={1} />)
    if (kind === 'SiteVisit') return list.map((t) => <VisitRow key={t.assignmentId} task={t} />)
    return []
  }

  return (
    <>
      {kinds.map((kind) => {
        const rows = rowsOf(kind)
        if (rows.length === 0) return null
        return (
          <section key={kind} className="op-stack" style={{ gap: 8 }}>
            {titles && <p className="rd-eyebrow">{label('qcKind', kind)}</p>}
            <OpPanel className="op-list">{rows}</OpPanel>
          </section>
        )
      })}
    </>
  )
}

/** Trang danh sách của một loại việc: tiêu đề, các hàng việc, hoặc một câu khi chưa có việc. */
export function KindListPage({ kinds, title, empty, children }: {
  kinds: readonly string[]
  title: string
  empty: string
  /** Phần thêm bên dưới danh sách. */
  children?: ReactNode
}) {
  const tasks = useQcTasks()
  return (
    <>
      <OpHeading eyebrow="Việc được giao" title={title} />
      <QueryView query={tasks}>
        {(list) => (list.some((t) => kinds.includes(t.kind))
          ? <TaskGroups tasks={list} kinds={kinds} titles={kinds.length > 1} />
          : <OpEmpty title={empty} />)}
      </QueryView>
      {children}
    </>
  )
}
