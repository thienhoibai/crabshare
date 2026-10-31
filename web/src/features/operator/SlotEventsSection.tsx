import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { OpBtn, OpNote, OpPanel } from './operatorUi'
import { listBoxes, boxLabels } from './boxesApi'
import {
  getSlotEventContext,
  getSlotEventPolicy,
  recordSlotEvent,
  slotDate,
  slotEventLabels,
  slotTime,
  type SlotEventRequest,
  type SlotEventType
} from './slotEventsApi'
import SlotEventHistory from './SlotEventHistory'
import SlotEventPolicyForm from './SlotEventPolicyForm'
import './slotEvents.css'

const vietnamNow = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19)

export default function SlotEventsSection({ code, canConfigure }: { code: string; canConfigure: boolean }) {
  const userId = useAuthStore((state) => state.user?.userId)
  const operatorId = useAuthStore((state) => state.user?.operatorId)
  const client = useQueryClient()
  const [source, setSource] = useState('')
  const [selected, setSelected] = useState('')
  const [sourcePage, setSourcePage] = useState(1)
  const [eventType, setEventType] = useState<SlotEventType>('Molted')
  const [occurredAt, setOccurredAt] = useState(vietnamNow)
  const [note, setNote] = useState('')
  const [destinationSearch, setDestinationSearch] = useState('')
  const [destinationPage, setDestinationPage] = useState(1)
  const [destination, setDestination] = useState('')
  const [replacement, setReplacement] = useState('')
  const [evidence, setEvidence] = useState('')
  const [confirmed, setConfirmed] = useState<SlotEventRequest | null>(null)
  const [notice, setNotice] = useState('')
  const identity = useRef<{ fingerprint: string; requestId: string } | null>(null)
  const policyKey = ['slot-event-policy', userId, code]
  const policy = useQuery({
    queryKey: policyKey,
    queryFn: ({ signal }) => getSlotEventPolicy(code, signal),
    retry: false
  })
  const context = useQuery({
    queryKey: ['slot-event-context', userId, code, selected],
    enabled: !!selected,
    queryFn: ({ signal }) => getSlotEventContext(code, selected, signal),
    retry: false
  })
  const sources = useQuery({
    queryKey: ['boxes', userId, 'slot-event-source', source.trim(), sourcePage],
    enabled: !!source.trim(),
    queryFn: ({ signal }) => listBoxes('', source, sourcePage, signal),
    retry: false
  })
  const destinations = useQuery({
    queryKey: ['boxes', userId, 'slot-event-destination', destinationSearch.trim(), destinationPage],
    enabled: eventType === 'Relocated',
    queryFn: ({ signal }) => listBoxes('Available', destinationSearch, destinationPage, signal),
    retry: false
  })
  async function refresh() {
    await Promise.all(
      [
        ['slot-events', userId, code],
        ['slot-event-context', userId, code],
        ['slot-event-policy', userId, code],
        ['operator-batch', userId],
        ['operator-batches', userId],
        ['boxes', userId],
        ['production', userId, operatorId, 'batches'],
        ['operator-alerts', userId],
        ['operator-dashboard', userId]
      ].map((queryKey) => client.invalidateQueries({ queryKey }))
    )
  }
  const mutation = useMutation({
    mutationFn: (request: SlotEventRequest) => recordSlotEvent(code, request),
    onSuccess: async () => {
      identity.current = null
      setConfirmed(null)
      setEvidence('')
      setReplacement('')
      setDestination('')
      setOccurredAt(vietnamNow())
      setNotice('Đã ghi sự kiện lên máy chủ.')
      await refresh()
    }
  })
  const current = context.data
  const needsEvidence = eventType === 'Mortality' || eventType === 'Restocked'
  const busy = mutation.isPending
  const valid =
    !!current?.canRecord &&
    !context.isFetching &&
    !context.isError &&
    !!occurredAt &&
    (eventType === 'Restocked'
      ? !!policy.data?.current &&
        !!replacement &&
        current.replacementCandidates.some((item) => String(item.id) === replacement)
      : current.currentCrab?.status === 'Growing') &&
    (!needsEvidence ||
      (!!evidence && current.availableEvidence.some((item) => String(item.id) === evidence))) &&
    (eventType !== 'Relocated' ||
      (!!destination &&
        destination !== selected &&
        !!destinations.data?.items.some((item) => item.slotCode === destination)))
  function prepare() {
    if (!valid || busy) return
    const payload: Omit<SlotEventRequest, 'requestId'> = {
      slotCode: selected,
      eventType,
      occurredAt: `${occurredAt.length === 16 ? `${occurredAt}:00` : occurredAt}+07:00`,
      quantity: 1,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(needsEvidence ? { evidenceId: Number(evidence) } : {}),
      ...(eventType === 'Restocked' ? { replacesCrabItemId: Number(replacement) } : {}),
      ...(eventType === 'Relocated' ? { destinationSlotCode: destination } : {})
    }
    const fingerprint = JSON.stringify(payload)
    if (identity.current?.fingerprint !== fingerprint)
      identity.current = { fingerprint, requestId: crypto.randomUUID() }
    setConfirmed({ ...payload, requestId: identity.current.requestId })
    setNotice('')
    mutation.reset()
  }
  return (
    <div className="slot-events-workspace">
      <OpPanel title="Sự kiện hộp" subtitle="Mỗi lần ghi nhận tương ứng một cá thể trong một hộp.">
        <form
          className="op-form"
          onSubmit={(event) => {
            event.preventDefault()
            prepare()
          }}
        >
          <fieldset className="slot-events-fields" disabled={busy || !!confirmed}>
            <div className="slot-events-grid">
              <div className="op-field">
                <label htmlFor="slot-source">Mã hộp nguồn</label>
                <input
                  className="op-input"
                  id="slot-source"
                  maxLength={30}
                  list="slot-source-options"
                  value={source}
                  onChange={(event) => {
                    setSource(event.target.value)
                    setSelected('')
                    setSourcePage(1)
                    setEvidence('')
                    setReplacement('')
                  }}
                />
                <datalist id="slot-source-options">
                  {sources.data?.items?.map((item) => (
                    <option key={item.slotCode} value={item.slotCode}>
                      {boxLabels[item.status]}
                    </option>
                  ))}
                </datalist>
              </div>
              <OpBtn
                type="button"
                variant="outline"
                disabled={!source.trim() || context.isFetching}
                onClick={() => {
                  setEvidence('')
                  setReplacement('')
                  if (selected === source.trim()) void context.refetch()
                  else setSelected(source.trim())
                }}
              >
                Tải thông tin hộp
              </OpBtn>
            </div>
            {sources.isFetching && <p role="status">Đang tìm hộp…</p>}
            {sources.isError && <p role="alert">{errorMessage(sources.error)}</p>}
            {sources.data && sources.data.total > sources.data.pageSize && (
              <div className="slot-events-actions">
                <OpBtn
                  type="button"
                  variant="outline"
                  disabled={sourcePage === 1}
                  onClick={() => setSourcePage(sourcePage - 1)}
                >
                  Hộp nguồn trước
                </OpBtn>
                <span>Trang {sourcePage}</span>
                <OpBtn
                  type="button"
                  variant="outline"
                  disabled={sourcePage * sources.data.pageSize >= sources.data.total}
                  onClick={() => setSourcePage(sourcePage + 1)}
                >
                  Hộp nguồn sau
                </OpBtn>
              </div>
            )}
            {selected && context.isFetching && <p role="status">Đang tải thông tin hộp…</p>}
            {selected && context.isError && <p role="alert">{errorMessage(context.error)}</p>}
            {current && selected && (
              <div className="slot-events-context">
                <p>
                  Hộp {current.slotCode}:{' '}
                  {boxLabels[current.status as keyof typeof boxLabels] ?? current.status}
                </p>
                <p>
                  {current.currentCrab
                    ? `Cua đang nuôi: ${current.currentCrab.itemUuid}`
                    : 'Hộp không có cua đang nuôi.'}
                </p>
                <p>Cua còn sống trong lô: {current.aliveCount}</p>
                <p>
                  Hạn thả bù:{' '}
                  {current.restockDeadline
                    ? `${slotDate(current.restockDeadline)} · hết ngày UTC+7`
                    : 'Chưa cấu hình'}
                </p>
                {!current.canRecord && <OpNote>Hộp hoặc lô hiện không cho phép ghi sự kiện.</OpNote>}
              </div>
            )}
            <div className="slot-events-grid">
              <div className="op-field">
                <label htmlFor="slot-event-type">Loại sự kiện</label>
                <select
                  id="slot-event-type"
                  className="op-select"
                  value={eventType}
                  onChange={(event) => {
                    setEventType(event.target.value as SlotEventType)
                    setEvidence('')
                    setReplacement('')
                    setDestination('')
                  }}
                >
                  {Object.entries(slotEventLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="op-field">
                <label htmlFor="slot-event-time">Thời điểm xảy ra (UTC+7)</label>
                <input
                  className="op-input"
                  type="datetime-local"
                  step="1"
                  id="slot-event-time"
                  required
                  max={vietnamNow()}
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                />
              </div>
            </div>
            {eventType === 'Restocked' && (
              <>
                <div className="op-field">
                  <label htmlFor="slot-replacement">Cá thể được thay thế</label>
                  <select
                    id="slot-replacement"
                    className="op-select"
                    required
                    value={replacement}
                    onChange={(event) => setReplacement(event.target.value)}
                  >
                    <option value="">Chọn cá thể chết trong hộp này</option>
                    {current?.replacementCandidates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.itemUuid} · Chết {slotTime(item.diedAt)}
                      </option>
                    ))}
                  </select>
                </div>
                {!policy.data?.current && (
                  <OpNote>Chủ hộ nuôi cần cấu hình chính sách trước khi thả bù.</OpNote>
                )}
              </>
            )}
            {needsEvidence && (
              <>
                <div className="op-field">
                  <label htmlFor="slot-evidence">Ảnh chụp từ ứng dụng</label>
                  <select
                    className="op-select"
                    id="slot-evidence"
                    required
                    value={evidence}
                    onChange={(event) => setEvidence(event.target.value)}
                  >
                    <option value="">Chọn ảnh camera đã tải lên</option>
                    {current?.availableEvidence.map((item) => (
                      <option key={item.id} value={item.id}>
                        Ảnh #{item.id} · {slotTime(item.capturedAt)} · {item.reviewStatus}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="rd-note">
                  Chụp ảnh hộp này bằng camera trong ứng dụng mobile, tải lên rồi tải lại thông tin hộp.
                </p>
              </>
            )}
            {eventType === 'Relocated' && (
              <>
                <div className="op-field">
                  <label htmlFor="slot-destination-search">Tìm hộp đích</label>
                  <input
                    id="slot-destination-search"
                    className="op-input"
                    value={destinationSearch}
                    onChange={(event) => {
                      setDestinationSearch(event.target.value)
                      setDestinationPage(1)
                      setDestination('')
                    }}
                  />
                </div>
                <div className="op-field">
                  <label htmlFor="slot-destination">Hộp đích</label>
                  <select
                    className="op-select"
                    id="slot-destination"
                    required
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                  >
                    <option value="">Chọn hộp sẵn sàng</option>
                    {destinations.data?.items
                      ?.filter((item) => item.slotCode !== selected)
                      .map((item) => (
                        <option key={item.slotCode} value={item.slotCode}>
                          {item.slotCode}
                        </option>
                      ))}
                  </select>
                </div>
                {destinations.isFetching && <p role="status">Đang tải hộp đích…</p>}
                {destinations.isError && (
                  <div role="alert">
                    {errorMessage(destinations.error)}{' '}
                    <OpBtn type="button" onClick={() => void destinations.refetch()}>
                      Thử lại hộp đích
                    </OpBtn>
                  </div>
                )}
                {destinations.data && (
                  <div className="slot-events-actions">
                    <OpBtn
                      type="button"
                      variant="outline"
                      disabled={destinationPage === 1}
                      onClick={() => {
                        setDestination('')
                        setDestinationPage(destinationPage - 1)
                      }}
                    >
                      Hộp đích trước
                    </OpBtn>
                    <span>
                      Trang {destinationPage} · {destinations.data.total} hộp
                    </span>
                    <OpBtn
                      type="button"
                      variant="outline"
                      disabled={destinationPage * destinations.data.pageSize >= destinations.data.total}
                      onClick={() => {
                        setDestination('')
                        setDestinationPage(destinationPage + 1)
                      }}
                    >
                      Hộp đích sau
                    </OpBtn>
                  </div>
                )}
              </>
            )}
            <div className="op-field">
              <label htmlFor="slot-event-note">Ghi chú sự kiện</label>
              <textarea
                className="op-input"
                id="slot-event-note"
                rows={3}
                maxLength={300}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <p className="rd-note">
              Số lượng: 1 con. Thời điểm theo UTC+7, không được ở tương lai hoặc trước lịch sử của cá thể/hộp.
            </p>
            {!confirmed && (
              <OpBtn type="submit" disabled={!valid || busy}>
                Kiểm tra sự kiện
              </OpBtn>
            )}
          </fieldset>
        </form>
        {confirmed && (
          <div className="slot-events-confirm" role="group" aria-label="Xác nhận sự kiện">
            <h3>Kiểm tra trước khi ghi</h3>
            <p>
              {slotEventLabels[confirmed.eventType]} · Hộp {confirmed.slotCode}
              {confirmed.destinationSlotCode && ` → ${confirmed.destinationSlotCode}`} · 1 con
            </p>
            <p>
              {slotTime(confirmed.occurredAt)} · UTC+7
              {confirmed.evidenceId != null && ` · Ảnh #${confirmed.evidenceId}`}
              {confirmed.replacesCrabItemId != null && ` · Thay cá thể #${confirmed.replacesCrabItemId}`}
            </p>
            {confirmed.note && <p className="slot-events-note">{confirmed.note}</p>}
            <div className="slot-events-actions">
              <OpBtn
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setConfirmed(null)
                  mutation.reset()
                }}
              >
                Sửa sự kiện
              </OpBtn>
              <OpBtn type="button" autoFocus disabled={busy} onClick={() => mutation.mutate(confirmed)}>
                {busy ? 'Đang ghi sự kiện…' : 'Xác nhận ghi sự kiện'}
              </OpBtn>
            </div>
          </div>
        )}
        {mutation.isError && (
          <div role="alert">
            <OpNote tone="danger">
              {errorMessage(mutation.error)} Bản nhập được giữ lại. Thử lại giữ nguyên mã yêu cầu; sửa nội
              dung sẽ tạo yêu cầu mới.
            </OpNote>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
      </OpPanel>
      {policy.isError && policy.data && (
        <div role="alert">
          <OpNote tone="danger">
            {errorMessage(policy.error)} Bản nhập được giữ lại; chính sách đang hiển thị là lần tải gần nhất.
          </OpNote>
          <OpBtn disabled={policy.isFetching} onClick={() => void policy.refetch()}>
            Thử lại chính sách
          </OpBtn>
        </div>
      )}
      {policy.isPending ? (
        <OpPanel>
          <p role="status">Đang tải chính sách…</p>
        </OpPanel>
      ) : policy.isError && !policy.data ? (
        <OpPanel>
          <div role="alert">
            <OpNote tone="danger">{errorMessage(policy.error)}</OpNote>
            <OpBtn onClick={() => void policy.refetch()}>Thử lại chính sách</OpBtn>
          </div>
        </OpPanel>
      ) : (
        policy.data && (
          <SlotEventPolicyForm
            code={code}
            state={{ ...policy.data, canConfigure: canConfigure && policy.data.canConfigure }}
            onSaved={(version) => {
              client.setQueryData(policyKey, { ...policy.data, current: version })
              void refresh()
            }}
            onReload={async () => {
              const next = await getSlotEventPolicy(code)
              client.setQueryData(policyKey, next)
              return next
            }}
          />
        )
      )}
      <SlotEventHistory code={code} userId={userId} />
    </div>
  )
}
