import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { ArrowDown, BookOpen, Camera, CircleAlert, LockKeyhole, RefreshCw, Shell } from 'lucide-react'
import { useAuthStore } from '../../shared/auth/authStore'
import { errorMessage } from '../../shared/api/http'
import { dayLabel, mergeTimeline, useTimeline } from './timelineApi'
import { TimelineEntry } from './TimelineEntry'
import './timeline.css'

export default function BatchTimeline({ code }: { code: string }) {
  const user = useAuthStore(s => s.user)
  const token = useAuthStore(s => s.token)
  return <TimelineBody key={`${user?.userId}:${token}:${code}`} code={code} />
}
function TimelineBody({ code }: { code: string }) {
  const userId = useAuthStore(s => s.user?.userId)
  const query = useTimeline(code)
  const client = useQueryClient()
  const [denied, setDenied] = useState(false)
  const groups = mergeTimeline(query.data?.pages ?? [])
  const forbidden = denied || (axios.isAxiosError(query.error) && query.error.response?.status === 403)
  const loading = query.isPending || query.isRefetching
  async function refresh() {
    setDenied(false)
    await client.resetQueries({ queryKey: ['batch-timeline', userId, code], exact: true })
  }
  return <section id="nhat-trinh" className="tl" aria-label="Nhật trình sản xuất">
    <header className="tl-header">
      <div><span className="tl-eyebrow">THEO DÕI LÔ NUÔI · {code}</span><h2>Nhật trình sản xuất<span className="tl-heading-dot" /></h2><p>Từng ghi nhận từ hộ nuôi, cùng bằng chứng của quá trình sản xuất.</p></div>
      <button className="tl-button" onClick={() => void refresh()} disabled={query.isFetching} aria-label="Làm mới nhật trình"><RefreshCw size={16} /> Làm mới</button>
    </header>
    <div className="tl-legend"><span><BookOpen size={15} /> Nhật ký</span><span><Shell size={15} /> Sự kiện hộp</span><span><Camera size={15} /> Bằng chứng</span><span><CircleAlert size={15} /> Cảnh báo</span><small>Giờ Việt Nam · UTC+7</small></div>
    {forbidden ? <div className="tl-state" role="alert"><LockKeyhole size={30} /><h3>Nhật trình dành cho người có quyền theo dõi lô</h3><p>Bạn cần khoản góp đã xác nhận hoặc quyền vận hành lô để xem nội dung này.</p></div>
      : query.isError ? <div className="tl-state" role="alert"><CircleAlert size={30} /><h3>Chưa tải được nhật trình</h3><p>{errorMessage(query.error)}</p><button className="tl-button" onClick={() => void refresh()}>Thử lại nhật trình</button></div>
        : loading ? <div className="tl-loading" role="status" aria-label="Đang tải nhật trình" aria-busy="true"><div /><div /><div /></div>
          : groups.length === 0 ? <div className="tl-state" role="status"><BookOpen size={32} /><h3>Nhật trình đang chờ những ghi nhận đầu tiên</h3><p>Nhật ký, sự kiện hộp, bằng chứng được chấp nhận và cảnh báo sẽ xuất hiện tại đây.</p></div>
            : <div className="tl-body">{groups.map((group, index) => <section key={group.date} className="tl-day" aria-label={dayLabel(group.date)}>
              <div className="tl-date"><span className="tl-date-number">{group.date.slice(-2)}</span><div><h3>{dayLabel(group.date)}</h3><span>{index === 0 ? 'Ngày ghi nhận gần nhất · ' : ''}{group.items.length} ghi nhận</span></div></div>
              <ol>{group.items.map(item => <TimelineEntry key={`${query.dataUpdatedAt}:${item.id}`} item={item} code={code} onDenied={() => setDenied(true)} />)}</ol>
            </section>)}
              <footer className="tl-footer">{query.hasNextPage ? <button className="tl-button tl-more" disabled={query.isFetching} onClick={() => { if (!query.isFetching) void query.fetchNextPage() }}><ArrowDown size={17} /> {query.isFetchingNextPage ? 'Đang tải những ngày trước…' : 'Xem những ngày trước'}</button> : <p>Đã hiển thị toàn bộ nhật trình hiện có.</p>}</footer>
            </div>}
  </section>
}
