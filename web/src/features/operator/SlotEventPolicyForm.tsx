import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { errorMessage } from '../../shared/api/http'
import { OpBtn, OpNote, OpPanel } from './operatorUi'
import { isSlotConflict, saveSlotEventPolicy, slotDate, slotTime, type SlotEventPolicy, type SlotEventPolicyState, type SlotEventPolicyRequest } from './slotEventsApi'

const draftFor = (policy: SlotEventPolicy | null) => ({
  basis: policy?.restockCutoffBasis ?? '', days: policy ? String(policy.restockCutoffDays) : '',
  alerts: policy?.mortalityWindowHours != null, window: policy?.mortalityWindowHours?.toString() ?? '',
  threshold: policy?.mortalityThresholdPercent?.toString() ?? '', severity: policy?.mortalitySeverity ?? '', ack: policy?.mortalityAckWithinHours?.toString() ?? '',
})
export default function SlotEventPolicyForm({ code, state, onSaved, onReload }: { code: string; state: SlotEventPolicyState; onSaved: (version: SlotEventPolicy) => void; onReload: () => Promise<SlotEventPolicyState> }) {
  const [draft, setDraft] = useState(() => draftFor(state.current))
  const [versionNo, setVersionNo] = useState(state.current?.versionNo ?? 0)
  const [notice, setNotice] = useState('')
  const [reloadError, setReloadError] = useState('')
  const [reloading, setReloading] = useState(false)
  const mutation = useMutation({
    mutationFn: () => saveSlotEventPolicy(code, {
      expectedVersionNo: versionNo, restockCutoffBasis: draft.basis as SlotEventPolicyRequest['restockCutoffBasis'], restockCutoffDays: Number(draft.days),
      mortalityWindowHours: draft.alerts ? Number(draft.window) : null, mortalityThresholdPercent: draft.alerts ? Number(draft.threshold) : null,
      mortalitySeverity: draft.alerts ? draft.severity : null, mortalityAckWithinHours: draft.alerts ? Number(draft.ack) : null,
    }),
    onMutate: () => setNotice(''),
    onSuccess: version => { setDraft(draftFor(version)); setVersionNo(version.versionNo); setNotice(`Đã lưu chính sách phiên bản ${version.versionNo}.`); onSaved(version) },
  })
  const conflict = isSlotConflict(mutation.error)
  const busy = mutation.isPending || reloading
  async function reload() {
    setReloading(true); setReloadError('')
    try { const next = await onReload(); setDraft(draftFor(next.current)); setVersionNo(next.current?.versionNo ?? 0); mutation.reset(); setNotice('Đã tải chính sách hiện tại.') }
    catch (error) { setReloadError(errorMessage(error)) }
    finally { setReloading(false) }
  }
  return <OpPanel title="Chính sách sự kiện của trại" subtitle="Chủ hộ nuôi chọn hạn thả bù và ngưỡng cảnh báo phù hợp với lô.">
    {state.current ? <>
      <p>Phiên bản {state.current.versionNo} · {slotTime(state.current.createdAt)} · Người cấu hình: #{state.current.createdBy}</p>
      <p>{state.current.restockCutoffBasis === 'AfterStocking' ? `Ngày thả giống + ${state.current.restockCutoffDays} ngày` : `Ngày thả giống + chu kỳ − ${state.current.restockCutoffDays} ngày`} · Hạn thả bù: {state.restockDeadline ? slotDate(state.restockDeadline) : 'Chưa có ngày thả giống'} · hết ngày UTC+7.</p>
      <p>{state.current.mortalityWindowHours == null ? 'Chưa bật đánh giá tử vong tự động.' : `Cảnh báo ${state.current.mortalitySeverity}: số cua chết trong ${state.current.mortalityWindowHours} giờ / số cua giống ban đầu ≥ ${state.current.mortalityThresholdPercent}%. Phản hồi trong ${state.current.mortalityAckWithinHours} giờ.`}</p>
    </> : <OpNote>Chưa có chính sách thả bù. Chủ hộ nuôi cần cấu hình trước khi thả bù. Các sự kiện khác vẫn được ghi nhận.</OpNote>}
    {state.canConfigure && <form className="op-form" onSubmit={event => { event.preventDefault(); if (!busy && !conflict) mutation.mutate() }}>
      <fieldset className="slot-events-fields" disabled={busy}>
        <div className="op-field"><label htmlFor="slot-policy-basis">Cách tính hạn thả bù</label><select className="op-select" id="slot-policy-basis" value={draft.basis} required onChange={event => setDraft({ ...draft, basis: event.target.value })}><option value="">Chọn cách tính</option><option value="AfterStocking">Sau ngày thả giống</option><option value="BeforeHarvest">Trước ngày dự kiến thu hoạch</option></select></div>
        <div className="op-field"><label htmlFor="slot-policy-days">Số ngày hạn thả bù</label><input className="op-input" id="slot-policy-days" type="number" min="1" max="32767" step="1" required value={draft.days} onChange={event => setDraft({ ...draft, days: event.target.value })} /></div>
        <p className="rd-note">Số ngày trong hồ sơ lô ({state.suggestedRestockCutoffDays}) chỉ là gợi ý. Hạn tính theo ngày Việt Nam (UTC+7), cho phép đến hết ngày hạn; máy chủ kiểm tra cả thời điểm khai báo và giờ hiện tại.</p>
        <label className="slot-events-check"><input type="checkbox" checked={draft.alerts} onChange={event => setDraft({ ...draft, alerts: event.target.checked })} />Bật cảnh báo tử vong theo cấu hình trại</label>
        {draft.alerts && <div className="slot-events-grid">
          <div className="op-field"><label htmlFor="slot-policy-window">Cửa sổ tính (giờ)</label><input className="op-input" id="slot-policy-window" type="number" min="1" max="87600" step="1" required value={draft.window} onChange={event => setDraft({ ...draft, window: event.target.value })} /></div>
          <div className="op-field"><label htmlFor="slot-policy-threshold">Ngưỡng tử vong (%)</label><input className="op-input" id="slot-policy-threshold" type="number" min="0.01" max="10000" step="0.01" required value={draft.threshold} onChange={event => setDraft({ ...draft, threshold: event.target.value })} /></div>
          <div className="op-field"><label htmlFor="slot-policy-severity">Mức cảnh báo</label><select className="op-select" id="slot-policy-severity" required value={draft.severity} onChange={event => setDraft({ ...draft, severity: event.target.value })}><option value="">Chọn mức</option><option value="Low">Thấp</option><option value="Medium">Trung bình</option><option value="High">Cao</option><option value="Critical">Khẩn cấp</option></select></div>
          <div className="op-field"><label htmlFor="slot-policy-ack">Thời hạn phản hồi (giờ)</label><input className="op-input" id="slot-policy-ack" type="number" min="1" max="720" step="1" required value={draft.ack} onChange={event => setDraft({ ...draft, ack: event.target.value })} /></div>
        </div>}
      </fieldset>
      <p className="rd-note">Tử số là số sự kiện cua chết trong cửa sổ đến giờ máy chủ; mẫu số là số cua giống ban đầu. Tắt cảnh báo gửi cả bốn trường ngưỡng về rỗng. Mỗi lần lưu tạo phiên bản mới; đánh giá lịch sử giữ nguyên.</p>
      {mutation.isError && <div role="alert"><OpNote tone="danger">{errorMessage(mutation.error)}{conflict && <p>Bản nhập được giữ lại. Tải chính sách mới để kiểm tra trước khi lưu tiếp.</p>}</OpNote></div>}
      {reloadError && <p role="alert">{reloadError}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="slot-events-actions">{conflict && <OpBtn type="button" variant="outline" disabled={busy} onClick={() => void reload()}>Tải chính sách mới</OpBtn>}<OpBtn type="submit" disabled={busy || conflict}>{mutation.isPending ? 'Đang lưu chính sách…' : 'Lưu chính sách'}</OpBtn></div>
    </form>}
  </OpPanel>
}
