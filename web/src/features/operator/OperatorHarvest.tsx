import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { ArrowLeft, Store } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuthStore } from '../../shared/auth/authStore'
import { errorMessage } from '../../shared/api/http'
import OperatorLayout from './OperatorLayout'
import { OpBack, OpBadge, OpBtn, OpFacts, OpHeading, OpPanel, OpRow, crabImg } from './operatorUi'
import { batchStatuses, crabTypes, listBatches } from './batchesApi'
import { harvestApi, type HarvestRecord, type HarvestSession, type RecordHarvestRequest, type StartHarvestRequest } from './harvestApi'
import { listingsApi } from './listingsApi'
import { useOperatorApplication } from './operatorsApi'

const statusLabel = { Open: 'Đang mở', Completed: 'Đã chốt', Legacy: 'Lịch sử chưa xác định' }
const time = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa ghi nhận'
const uncertain = (error: unknown) => !axios.isAxiosError(error) || !error.response || error.response.status >= 500
type Weighing = { id: number; itemUuid: string; request: RecordHarvestRequest }

function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (page: number) => void }) {
  if (total <= size) return null
  return <div className="op-actions"><OpBtn sm variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Trang trước</OpBtn><span>Trang {page} / {Math.ceil(total / size)}</span><OpBtn sm variant="ghost" disabled={page * size >= total} onClick={() => onPage(page + 1)}>Trang sau</OpBtn></div>
}

function BatchList() {
  const userId = useAuthStore(s => s.user?.userId)
  const [status, setStatus] = useState('Harvesting')
  const [page, setPage] = useState(1)
  const batches = useQuery({ queryKey: ['harvest-batches', userId, status, page], queryFn: ({ signal }) => listBatches(status, page, signal), retry: false })
  return <><OpHeading eyebrow="Thu hoạch" title="Thu hoạch từng cá thể" description="Chọn lô để mở đợt, cân từng con và cấp tem truy xuất." action={<a className="rd-btn rd-btn--ghost" href="/operator/listings"><Store size={16} /> Niêm yết sản phẩm</a>} />
    <div className="op-field"><label htmlFor="harvest-batch-status">Trạng thái lô</label><select id="harvest-batch-status" className="op-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="Harvesting">Đang thu hoạch</option><option value="InProduction">Đang sản xuất</option></select></div>
    {batches.isPending && <p role="status">Đang tải lô nuôi…</p>}
    {batches.isError && <div role="alert">{errorMessage(batches.error)} <OpBtn variant="ghost" onClick={() => void batches.refetch()}>Tải lại lô</OpBtn></div>}
    {batches.data && <><div className="op-panel op-list">{batches.data.items.length === 0 && <p>Chưa có lô ở trạng thái này.</p>}{batches.data.items.map(batch => <OpRow key={batch.batchCode} href={`/operator/harvest?batchId=${encodeURIComponent(batch.batchCode)}`} media={crabImg(batch.crabType)} title={batch.title} sub={`${batch.batchCode} · ${crabTypes[batch.crabType]}`} end={<OpBadge tone="ok">{batchStatuses[batch.status]}</OpBadge>} />)}</div><Pager page={page} total={batches.data.total} size={batches.data.pageSize} onPage={setPage} /></>}
  </>
}

function HarvestDetail({ code }: { code: string }) {
  const token = useAuthStore(s => s.token)
  const cache = useQueryClient()
  const application = useOperatorApplication()
  const owner = application.data?.memberRole === 'Owner'
  const key = ['harvest', token, code] as const
  const [slotCode, setSlotCode] = useState('')
  const [manualSlot, setManualSlot] = useState('')
  const [boxPage, setBoxPage] = useState(1)
  const [sessionPage, setSessionPage] = useState(1)
  const [recordPage, setRecordPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [weight, setWeight] = useState('')
  const [shell, setShell] = useState<'' | RecordHarvestRequest['shellCondition']>('')
  const [pendingStart, setPendingStart] = useState<StartHarvestRequest | null>(null)
  const [pendingRecord, setPendingRecord] = useState<Weighing | null>(null)
  const [confirmation, setConfirmation] = useState<Weighing | null>(null)
  const [closing, setClosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [result, setResult] = useState<HarvestRecord | null>(null)
  // Keep the batch/session available when a manually entered box cannot be found.
  const batchContext = useQuery({ queryKey: [...key, 'context', ''], queryFn: ({ signal }) => harvestApi.context(code, '', signal), retry: false })
  const context = useQuery({ queryKey: [...key, 'context', slotCode], queryFn: ({ signal }) => harvestApi.context(code, slotCode, signal), retry: false })
  const sessions = useQuery({ queryKey: [...key, 'sessions', sessionPage], queryFn: ({ signal }) => harvestApi.sessions(code, sessionPage, signal), retry: false })
  const boxes = useQuery({ queryKey: [...key, 'boxes', boxPage], queryFn: ({ signal }) => harvestApi.boxes(code, boxPage, signal), retry: false })
  const active = batchContext.data?.activeHarvest
  const chosen = sessions.data?.items.find(s => s.id === selectedId)
  const selectedSession = chosen ?? (selectedId === null || selectedId === active?.id ? active : undefined)
  const selectedRead = useQuery({ queryKey: [...key, 'session', selectedId], queryFn: ({ signal }) => harvestApi.session(selectedId!, signal), enabled: selectedId !== null && !selectedSession, retry: false })
  const session = selectedSession ?? selectedRead.data
  const records = useQuery({ queryKey: [...key, 'records', session?.id, recordPage], queryFn: ({ signal }) => harvestApi.records(session!.id, recordPage, signal), enabled: !!session, retry: false })
  const options = useQuery({ queryKey: [...key, 'listing-options'], queryFn: listingsApi.options, enabled: owner, retry: false })
  const locked = busy || !!pendingRecord || !!pendingStart
  const canWeigh = !!session?.canRecord && session.status === 'Open' && !!batchContext.data?.canRecord && active?.id === session.id
  const validWeight = /^\d+$/.test(weight) && Number(weight) >= 1 && Number(weight) <= 32767
  const canConfirm = canWeigh && !!slotCode && !!context.data?.currentCrab && context.data.slotStatus === 'Occupied' && validWeight && !!shell && !context.isFetching && !context.isError
  useEffect(() => { setName(session?.name ?? ''); setNote(session?.note ?? '') }, [session?.id, session?.revision, session?.name, session?.note])
  const measurementIdentity = `${session?.id ?? ''}:${slotCode}:${context.data?.currentCrab?.id ?? ''}`
  useEffect(() => {
    if (!pendingRecord) { setWeight(''); setShell(''); setConfirmation(null) }
    // A submitted operation remains immutable until its replay resolves, even if the box is reused.
  }, [measurementIdentity, pendingRecord])

  function confirmWeighing() {
    if (!canConfirm || !session || !shell || !context.data?.currentCrab) return
    setConfirmation({ id: session.id, itemUuid: context.data.currentCrab.itemUuid, request: {
      requestId: crypto.randomUUID(), slotCode, expectedCrabItemId: context.data.currentCrab.id,
      weightG: Number(weight), shellCondition: shell,
    } })
  }

  const refresh = async () => {
    await Promise.all([cache.invalidateQueries({ queryKey: key }), cache.invalidateQueries({ predicate: q => ['operator-batch', 'operator-batches', 'operator-dashboard', 'boxes', 'listings', 'harvest-batches', 'batch-timeline', 'production'].includes(String(q.queryKey[0])) })])
  }
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError(''); setNotice('')
    try { await action() } finally { busyRef.current = false; setBusy(false) }
  }
  const useSession = (value: HarvestSession) => { setSelectedId(value.id); setRecordPage(1); setName(value.name ?? ''); setNote(value.note ?? '') }
  async function start() {
    if (busyRef.current) return
    const request = pendingStart ?? { requestId: crypto.randomUUID(), name: name.trim() || null, note: note.trim() || null }
    setPendingStart(request)
    await run(async () => {
      try { const value = await harvestApi.start(code, request); setPendingStart(null); useSession(value); setNotice('Đã mở hoặc tiếp tục đợt thu hoạch.'); await refresh() }
      catch (e) { if (!uncertain(e)) setPendingStart(null); setError(`${uncertain(e) ? 'Chưa xác định kết quả mở đợt. Gửi lại cùng yêu cầu để kiểm tra. ' : ''}${errorMessage(e)}`); if (!uncertain(e)) await refresh() }
    })
  }
  async function record() {
    if (busyRef.current) return
    const operation = pendingRecord ?? confirmation
    if (!operation) return
    if (!pendingRecord && (!canConfirm || operation.id !== session?.id || operation.request.slotCode !== slotCode || operation.request.expectedCrabItemId !== context.data?.currentCrab?.id)) {
      setConfirmation(null); setWeight(''); setShell(''); return
    }
    setPendingRecord(operation)
    await run(async () => {
      try {
        const value = await harvestApi.record(operation.id, operation.request)
        setResult(value); setPendingRecord(null); setConfirmation(null); setWeight(''); setShell(''); setSlotCode(''); setManualSlot(''); setRecordPage(1)
        setNotice('Đã lưu thu hoạch. Tem ở trạng thái Printed, chờ kích hoạt.'); await refresh()
      } catch (e) {
        if (uncertain(e)) setError(`Chưa xác định kết quả lần cân. Giữ nguyên hộp và nội dung; gửi lại để nhận kết quả đã lưu. ${errorMessage(e)}`)
        else { setPendingRecord(null); setConfirmation(null); setError(errorMessage(e)); await refresh() }
      }
    })
  }
  async function update() {
    if (!session) return
    await run(async () => { try { useSession(await harvestApi.update(session.id, { expectedRevision: session.revision, name: name.trim() || null, note: note.trim() || null })); setNotice('Đã lưu thông tin đợt.'); await refresh() } catch (e) { setError(errorMessage(e)); await refresh() } })
  }
  async function complete() {
    if (!session) return
    await run(async () => { try { useSession(await harvestApi.complete(session.id, session.revision)); setClosing(false); setNotice('Đã chốt đợt thu hoạch.'); await refresh() } catch (e) { setError(errorMessage(e)); await refresh() } })
  }
  async function refreshCatalog() {
    setCatalogError('')
    await run(async () => {
      try {
        const currentOptions = await listingsApi.options()
        const ids = [...new Set(currentOptions.filter(option => option.batchCode === code && option.existingListingId !== null).map(option => option.existingListingId!))]
        const outcomes = await Promise.allSettled(ids.map(id => listingsApi.refreshStock(id)))
        await Promise.all([options.refetch(), cache.invalidateQueries({ queryKey: ['listings'] })])
        if (outcomes.some(outcome => outcome.status === 'rejected')) throw new Error('refresh failed')
        setNotice('Đã làm mới tồn niêm yết.')
      } catch { setCatalogError(`${result ? 'Đã lưu thu hoạch; chưa làm mới tồn niêm yết' : 'Chưa làm mới được tồn niêm yết'}. Có thể thử lại thao tác làm mới tồn.`) }
    })
  }

  return <>
    <OpHeading crumb={<OpBack href="/operator/harvest"><ArrowLeft size={16} /> Quay lại danh sách lô</OpBack>} eyebrow={`Lô ${code}`} title="Thu hoạch từng cá thể" description="Cân theo gram và xác nhận vỏ hiện tại. Hạng và tem do máy chủ trả về sau khi lưu." />
    {error && <p role="alert" className="op-note danger">{error}</p>}{notice && <p role="status" className="op-note ok">{notice}</p>}{catalogError && <p role="alert" className="op-note danger">{catalogError}</p>}
    {context.isPending && <p role="status">Đang tải thông tin thu hoạch…</p>}{context.isError && <div role="alert">{errorMessage(context.error)} <OpBtn variant="ghost" onClick={() => void context.refetch()}>Tải lại thông tin</OpBtn></div>}
    {batchContext.data && <OpFacts items={[{ label: 'Còn đang nuôi', value: `${batchContext.data.remainingGrowingCount} con` }, { label: 'Đã thu hoạch', value: `${batchContext.data.harvestedCount} con` }, { label: 'Tổng khối lượng', value: `${batchContext.data.totalWeightKg} kg` }]} />}
    <div className="op-grid">
      <OpPanel className="op-span-4" title="Đợt thu hoạch" subtitle={session ? `${statusLabel[session.status]} · Bắt đầu ${time(session.startedAt)}` : 'Mở đợt khi lô sẵn sàng thu hoạch.'}>
        {session && <><p>{session.name || `Đợt #${session.id}`}</p><p>{session.harvestedCount} con · {session.totalWeightKg} kg</p>{session.status === 'Completed' && <p>Chốt lúc {time(session.completedAt)}</p>}{session.status === 'Legacy' && <p>Dữ liệu lịch sử chỉ đọc; thời điểm chốt chưa được ghi nhận.</p>}</>}
        {owner && ((!active && batchContext.data?.canStart) || (session?.status === 'Open' && session.canComplete)) && <div className="op-form">
          <div className="op-field"><label htmlFor="hv-name">Tên đợt thu hoạch</label><input id="hv-name" className="op-input" maxLength={100} value={name} onChange={e => setName(e.target.value)} disabled={locked} /></div>
          <div className="op-field"><label htmlFor="hv-note">Ghi chú đợt</label><textarea id="hv-note" className="op-input" maxLength={300} value={note} onChange={e => setNote(e.target.value)} disabled={locked} /></div>
          {!active && batchContext.data?.canStart && !pendingStart && <OpBtn disabled={busy || !!pendingRecord} onClick={() => void start()}>Bắt đầu đợt thu hoạch</OpBtn>}
          {session?.status === 'Open' && session.canComplete && <><OpBtn variant="ghost" disabled={locked} onClick={() => void update()}>Lưu thông tin đợt</OpBtn><OpBtn variant="ink" disabled={locked} onClick={() => setClosing(true)}>Chốt đợt thu hoạch</OpBtn></>}
        </div>}
        {pendingStart && <OpBtn disabled={busy} onClick={() => void start()}>Gửi lại yêu cầu mở đợt</OpBtn>}
        {closing && <div className="op-note"><div><p>Chốt đợt này? Lô vẫn có thể tiếp tục thu hoạch trong đợt mới.</p><OpBtn disabled={locked} onClick={() => void complete()}>Xác nhận chốt đợt</OpBtn><OpBtn variant="ghost" disabled={busy} onClick={() => setClosing(false)}>Quay lại</OpBtn></div></div>}
        {!owner && !active && <p>Chủ hộ nuôi cần mở đợt trước khi nhân viên ghi nhận.</p>}
      </OpPanel>
      <OpPanel className="op-span-4" title="Cân từng con" subtitle="Không tự gửi lần cân tiếp theo.">
        {!canWeigh && !pendingRecord && <p>Chọn một đợt đang mở có quyền ghi nhận để cân.</p>}
        <div className="op-form">
          <div className="op-field"><label htmlFor="hv-box">Hộp nuôi</label><select id="hv-box" className="op-select" value={slotCode} disabled={locked || !canWeigh} onChange={e => { setSlotCode(e.target.value); setConfirmation(null) }}><option value="">Chọn hộp đang nuôi trong lô</option>{slotCode && !boxes.data?.items.some(box => box.slotCode === slotCode) && <option value={slotCode}>{slotCode}</option>}{boxes.data?.items.map(box => <option key={box.slotCode} value={box.slotCode}>{box.slotCode}</option>)}</select></div>
          {boxes.isPending && <p>Đang tải hộp…</p>}{boxes.isError && <div role="alert">{errorMessage(boxes.error)} <OpBtn variant="ghost" onClick={() => void boxes.refetch()}>Tải lại hộp</OpBtn></div>}{boxes.data && <Pager page={boxPage} total={boxes.data.total} size={boxes.data.pageSize} onPage={setBoxPage} />}
          <div className="op-field"><label htmlFor="hv-slot-code">Hoặc nhập mã hộp</label><input id="hv-slot-code" className="op-input" maxLength={30} value={manualSlot} disabled={locked || !canWeigh} onChange={e => setManualSlot(e.target.value)} /><OpBtn variant="ghost" disabled={locked || !canWeigh || !manualSlot.trim()} onClick={() => { setSlotCode(manualSlot.trim()); setConfirmation(null); if (manualSlot.trim() === slotCode) void context.refetch() }}>Tải thông tin hộp</OpBtn></div>
          {slotCode && context.isFetching && <p role="status">Đang kiểm tra cá thể trong hộp…</p>}
          {slotCode && !context.isFetching && context.data && <>{context.data.currentCrab ? <p>Cua đang nuôi: {context.data.currentCrab.itemUuid}</p> : <p>Hộp không có cá thể đang nuôi của lô.</p>}{context.data.latestMoltedAt && <p>Lột gần nhất: {time(context.data.latestMoltedAt)}. Vẫn cần xác nhận vỏ lúc cân.</p>}</>}
          <div className="op-field"><label htmlFor="hv-weight">Trọng lượng (gram)</label><input id="hv-weight" className="op-input" type="number" min="1" max="32767" step="1" inputMode="numeric" value={weight} disabled={locked || !canWeigh} onChange={e => { setWeight(e.target.value); setConfirmation(null) }} /><small>Nhập số nguyên từ 1 đến 32767 gram.</small></div>
          <div className="op-field"><label htmlFor="hv-shell">Tình trạng vỏ lúc cân</label><select id="hv-shell" className="op-select" value={shell} disabled={locked || !canWeigh} onChange={e => { setShell(e.target.value as typeof shell); setConfirmation(null) }}><option value="">Xác nhận quan sát hiện tại</option><option value="HardShell">Vỏ cứng</option><option value="SoftShell">Vỏ mềm / cua lột</option></select></div>
          {!pendingRecord && <OpBtn disabled={busy || !canConfirm} onClick={confirmWeighing}>Kiểm tra lần cân</OpBtn>}
          {confirmation && !pendingRecord && <div><p>Hộp {confirmation.request.slotCode} · {confirmation.itemUuid} · {confirmation.request.weightG} g · {confirmation.request.shellCondition === 'SoftShell' ? 'Vỏ mềm' : 'Vỏ cứng'}</p><OpBtn disabled={busy || !canConfirm} onClick={() => void record()}>Xác nhận ghi thu hoạch</OpBtn><OpBtn variant="ghost" disabled={busy} onClick={() => setConfirmation(null)}>Sửa lần cân</OpBtn></div>}
          {pendingRecord && <><p>Đang chờ kết quả: {pendingRecord.itemUuid} · Hộp {pendingRecord.request.slotCode} · {pendingRecord.request.weightG} g.</p><OpBtn disabled={busy} onClick={() => void record()}>Gửi lại lần cân</OpBtn></>}
        </div>
      </OpPanel>
      <OpPanel className="op-span-4" title="Kết quả và niêm yết">
        {result ? <section aria-label="Kết quả lần cân"><p><b>{result.itemUuid}</b> · Hộp {result.slotCode}</p><p>{result.weightG} g · {result.gradeName || result.gradeCode}</p><p>Tem: <b className="op-mono">{result.tagCode}</b> · {result.tagStatus}</p>{result.tagCode && result.tracePath && <><QRCodeSVG value={new URL(result.tracePath, window.location.origin).href} size={144} title={`Tem ${result.tagCode}`} /><p><a className="rd-link" href={result.tracePath}>Đường dẫn truy xuất</a></p></>}<p>Tem Printed chờ kích hoạt qua luồng riêng.</p></section> : <p>Kết quả hạng và tem sẽ hiện sau khi lưu.</p>}
        <p><a className="rd-link" href="/operator/listings">Quản lý giá và niêm yết sản phẩm</a></p><p><a className="rd-link" href="/operator/orders">Đóng gói và giao hàng trong Đơn hàng</a></p>
        {owner && options.isError && <p role="alert">Không tải được niêm yết. <OpBtn variant="ghost" onClick={() => void options.refetch()}>Tải lại niêm yết</OpBtn></p>}
        {owner && options.data?.some(option => option.batchCode === code && option.existingListingId !== null) && <OpBtn variant="ghost" disabled={locked} onClick={() => void refreshCatalog()}>Làm mới tồn niêm yết</OpBtn>}
      </OpPanel>
    </div>
    <OpPanel title="Lịch sử các đợt">
      {sessions.isPending && <p>Đang tải các đợt…</p>}{sessions.isError && <p role="alert">{errorMessage(sessions.error)} <OpBtn variant="ghost" onClick={() => void sessions.refetch()}>Tải lại các đợt</OpBtn></p>}
      {sessions.data && <>{sessions.data.items.length === 0 && <p>Chưa có đợt thu hoạch.</p>}<div className="op-list">{sessions.data.items.map(item => <div key={item.id} className="op-tile"><span><b>{item.name || `Đợt #${item.id}`}</b><small>{statusLabel[item.status]} · {item.harvestedCount} con · {item.totalWeightKg} kg · {time(item.startedAt)}</small></span><OpBtn sm variant="ghost" disabled={locked} onClick={() => { useSession(item); setClosing(false) }}>Xem đợt #{item.id}</OpBtn></div>)}</div><Pager page={sessionPage} total={sessions.data.total} size={sessions.data.pageSize} onPage={setSessionPage} /></>}
    </OpPanel>
    {session && <section aria-label="Cá thể đã thu hoạch"><OpPanel title={`Cá thể đã thu hoạch · ${session.name || `Đợt #${session.id}`}`}>
      {records.isPending && <p>Đang tải lịch sử cân…</p>}{records.isError && <p role="alert">{errorMessage(records.error)} <OpBtn variant="ghost" onClick={() => void records.refetch()}>Tải lại lịch sử cân</OpBtn></p>}
      {records.data && <>{records.data.items.length === 0 && <p>Chưa ghi nhận cá thể nào.</p>}<div className="op-list">{records.data.items.map(item => <div className="op-tile" key={item.crabItemId}><span><b>{item.itemUuid}</b><small>Hộp {item.slotCode ?? 'chưa ghi nhận'} · {item.weightG === null ? 'Chưa ghi cân' : `${item.weightG} g`} · {item.gradeName || item.gradeCode || 'Chưa ghi hạng'}</small><small>{item.tagCode ?? 'Chưa ghi tem'} {item.tagStatus ?? ''} · {time(item.recordedAt)}</small>{item.tracePath && <a className="rd-link" href={item.tracePath}>Truy xuất</a>}</span></div>)}</div><Pager page={recordPage} total={records.data.total} size={records.data.pageSize} onPage={setRecordPage} /></>}
    </OpPanel></section>}
    {selectedRead.isError && <p role="alert">{errorMessage(selectedRead.error)}</p>}
  </>
}

export default function OperatorHarvest() {
  const code = new URLSearchParams(window.location.search).get('batchId')
  const token = useAuthStore(s => s.token)
  return <OperatorLayout activeTab="harvest">{code ? <HarvestDetail key={`${token}:${code}`} code={code} /> : <BatchList key={token} />}</OperatorLayout>
}
