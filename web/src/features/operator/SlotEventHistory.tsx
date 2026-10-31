import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { errorMessage } from '../../shared/api/http'
import { OpBtn, OpNote, OpPanel } from './operatorUi'
import { getSlotEvents, slotEventLabels, slotTime } from './slotEventsApi'

const historyLabels: Record<string, string> = {
  ...slotEventLabels,
  Stocked: 'Thả giống',
  Harvested: 'Thu hoạch'
}

export default function SlotEventHistory({ code, userId }: { code: string; userId: number | undefined }) {
  const [page, setPage] = useState(1)
  const history = useQuery({
    queryKey: ['slot-events', userId, code, page],
    queryFn: ({ signal }) => getSlotEvents(code, page, signal),
    retry: false
  })
  return (
    <section aria-label="Lịch sử sự kiện hộp">
      <OpPanel title="Lịch sử sự kiện hộp">
        {history.isPending ? (
          <p role="status">Đang tải lịch sử…</p>
        ) : history.isError ? (
          <div role="alert">
            <OpNote tone="danger">{errorMessage(history.error)}</OpNote>
            <OpBtn onClick={() => void history.refetch()}>Thử lại lịch sử</OpBtn>
          </div>
        ) : !history.data?.items?.length ? (
          <p>Chưa có sự kiện hộp.</p>
        ) : (
          <>
            <div className="slot-events-history">
              {history.data.items.map((item) => (
                <article className="slot-events-record" key={item.id}>
                  <h3>
                    {historyLabels[item.eventType] ?? `Sự kiện ${item.eventType}`} · Hộp {item.slotCode}
                    {item.destinationSlotCode && ` → ${item.destinationSlotCode}`}
                  </h3>
                  <p>
                    {slotTime(item.occurredAt)} · UTC+7 · {item.quantity} con ·{' '}
                    <span>{item.itemUuid ?? 'Chưa có liên kết cá thể'}</span>
                  </p>
                  {item.note && <p className="slot-events-note">{item.note}</p>}
                  <p className="rd-note">
                    Người ghi: {item.actorId == null ? 'Không có thông tin' : `#${item.actorId}`}
                    {item.replacesCrabItemId != null && ` · Thay cá thể #${item.replacesCrabItemId}`}
                    {item.evidenceId != null && ` · Ảnh #${item.evidenceId}`} ·{' '}
                    {item.aliveCount == null
                      ? 'Không có số liệu tại thời điểm ghi'
                      : `Cua còn sống lúc ghi: ${item.aliveCount}`}
                  </p>
                </article>
              ))}
            </div>
            <div className="slot-events-actions">
              <OpBtn
                variant="outline"
                disabled={page === 1 || history.isFetching}
                onClick={() => setPage(page - 1)}
              >
                Trang trước
              </OpBtn>
              <span>Trang {page}</span>
              <OpBtn
                variant="outline"
                disabled={page * history.data.pageSize >= history.data.total || history.isFetching}
                onClick={() => setPage(page + 1)}
              >
                Trang sau
              </OpBtn>
            </div>
          </>
        )}
      </OpPanel>
    </section>
  )
}
