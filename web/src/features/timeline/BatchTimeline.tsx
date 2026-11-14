/* Nhật trình của một Lô (UC21): nhật ký chăm sóc, sự kiện hộp, sự kiện từng con cua, bằng chứng đã chấp nhận và cảnh báo, gom theo ngày.
   Trả về các OpPanel theo ngày: đặt thẳng trong trang hoặc trong một tab, không bọc thêm OpPanel.
   Mỗi ngày hiện sẵn vài ghi nhận đầu, phần còn lại gấp trong "Ghi nhận khác trong ngày". */
import axios from 'axios'
import { ArrowDown, LockKeyhole, RefreshCw } from 'lucide-react'
import { useAuthStore } from '../../shared/auth/authStore'
import { OpBtn, OpEmpty, OpError, OpLoading, OpMore, OpPanel, errorMessage } from '../../shared/ui/console'
import { TimelineEntry } from './TimelineEntry'
import { dayLabel, mergeTimeline, useTimeline } from './timelineApi'
import './timeline.css'

/** Số ghi nhận hiện sẵn của mỗi ngày. */
const FIRST = 5

export default function BatchTimeline({ code }: { code: string }) {
  const userId = useAuthStore((s) => s.user?.userId)
  return <TimelineBody key={`${userId}:${code}`} code={code} />
}

function TimelineBody({ code }: { code: string }) {
  const query = useTimeline(code)
  const groups = mergeTimeline(query.data?.pages ?? [])

  if (query.isPending) return <OpLoading label="Đang tải nhật trình…" />
  if (query.isError) {
    return axios.isAxiosError(query.error) && query.error.response?.status === 403
      ? <OpEmpty icon={<LockKeyhole size={30} />} title="Nhật trình chỉ dành cho người tham gia Lô">{errorMessage(query.error)}</OpEmpty>
      : <OpError error={query.error} onRetry={() => void query.refetch()} />
  }

  return (
    <div className="op-stack">
      {groups.length === 0 && <OpEmpty title="Lô chưa có ghi nhận nào" />}

      {groups.map((group, index) => {
        const head = group.items.slice(0, FIRST)
        const rest = group.items.slice(FIRST)
        return (
          <OpPanel
            key={group.date}
            title={dayLabel(group.date)}
            action={index === 0
              ? <OpBtn variant="ghost" sm disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={15} /> Làm mới</OpBtn>
              : undefined}
          >
            <ol className="tl-list">
              {head.map((item) => <TimelineEntry key={item.id} item={item} code={code} />)}
            </ol>
            {rest.length > 0 && (
              <OpMore label="Ghi nhận khác trong ngày" count={rest.length}>
                <ol className="tl-list">
                  {rest.map((item) => <TimelineEntry key={item.id} item={item} code={code} />)}
                </ol>
              </OpMore>
            )}
          </OpPanel>
        )
      })}

      {query.hasNextPage && (
        <div className="op-formfoot" style={{ justifyContent: 'center' }}>
          <OpBtn variant="ghost" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            <ArrowDown size={16} /> {query.isFetchingNextPage ? 'Đang tải…' : 'Xem những ngày trước'}
          </OpBtn>
        </div>
      )}
    </div>
  )
}
