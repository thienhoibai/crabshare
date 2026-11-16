/* /operator/register — Hồ sơ hộ nuôi (UC04): hồ sơ xét duyệt, địa điểm, hồ sơ đối tác, bên liên quan.
   GET/PUT /api/operators/me, POST /api/operators, POST /api/operators/me/submit, GET/PUT /api/me/party.
   Trang chỉ trả nội dung vì còn được dùng cho tài khoản đã đăng nhập nhưng chưa thuộc hộ nuôi nào. */
import { useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import type { OperatorProfileRequest, OperatorResponse, PartyResponse, UpdatePartyRequest } from '../../shared/api/api.gen'
import { useAuthStore } from '../../shared/auth/authStore'
import {
  Field, Input, OpBadge, OpBtn, OpConfirm, OpError, OpHeading, OpLoading, OpMore, OpNote, OpPanel, Select, StatusBadge, errorMessage, label, options, useGet,
  useSend,
} from '../../shared/ui/console'
import FarmSites from './FarmSites'
import { httpStatus } from './opA'
import RelatedParties from './RelatedParties'

function ApplicationForm({ app }: { app: OperatorResponse | null }) {
  const [f, setF] = useState<OperatorProfileRequest>({
    legalName: app?.legalName ?? '', taxCode: app?.taxCode ?? '', businessRegNo: app?.businessRegNo ?? '', farmAddress: app?.farmAddress ?? '',
  })
  const [confirming, setConfirming] = useState(false)
  const save = useSend<OperatorResponse, OperatorProfileRequest>(app ? 'put' : 'post', app ? '/api/operators/me' : '/api/operators', {
    success: app ? 'Đã lưu hồ sơ.' : 'Đã tạo hồ sơ nháp.', quietError: true,
  })
  const submit = useSend<OperatorResponse, void>('post', '/api/operators/me/submit', { success: 'Đã gửi hồ sơ xét duyệt.', onSuccess: () => setConfirming(false), quietError: true })
  const canEdit = !app || app.canEdit
  const complete = Object.values(f).every((v) => v.trim())
  const dirty = !app || f.legalName !== app.legalName || f.taxCode !== app.taxCode || f.businessRegNo !== app.businessRegNo || f.farmAddress !== app.farmAddress
  const onSave = (e: FormEvent) => {
    e.preventDefault()
    if (canEdit && complete) save.mutate({ legalName: f.legalName.trim(), taxCode: f.taxCode.trim(), businessRegNo: f.businessRegNo.trim(), farmAddress: f.farmAddress.trim() })
  }
  const set = (key: keyof OperatorProfileRequest) => (e: { target: { value: string } }) => setF((old) => ({ ...old, [key]: e.target.value }))
  // Hồ sơ nháp đã lưu đủ thì nút chính là gửi duyệt; còn lại nút chính là lưu.
  const readyToSubmit = !!app?.canSubmit && !dirty && complete

  return (
    <form className="op-form" onSubmit={onSave}>
      <div className="op-form__row">
        <Field label="Tên pháp lý" required>
          <Input value={f.legalName} maxLength={200} disabled={!canEdit} onChange={set('legalName')} placeholder="HTX Nuôi cua Năm Căn" />
        </Field>
        <Field label="Mã số thuế" required>
          <Input value={f.taxCode} maxLength={14} inputMode="numeric" disabled={!canEdit} onChange={set('taxCode')} />
        </Field>
      </div>
      <div className="op-form__row">
        <Field label="Số đăng ký kinh doanh" required>
          <Input value={f.businessRegNo} maxLength={30} disabled={!canEdit} onChange={set('businessRegNo')} />
        </Field>
        <Field label="Địa chỉ trại" required>
          <Input value={f.farmAddress} maxLength={300} disabled={!canEdit} onChange={set('farmAddress')} />
        </Field>
      </div>
      {save.isError && <OpNote tone="danger">{errorMessage(save.error)}</OpNote>}
      {canEdit && (
        <div className="op-formfoot">
          <OpBtn type="submit" variant={readyToSubmit ? 'ghost' : 'primary'} disabled={!complete || !dirty || save.isPending}>
            {save.isPending ? 'Đang lưu…' : app ? 'Lưu' : 'Tạo hồ sơ'}
          </OpBtn>
          {app?.canSubmit && <OpBtn type="button" variant={readyToSubmit ? 'primary' : 'ghost'} disabled={!readyToSubmit} onClick={() => setConfirming(true)}><Send size={16} /> Gửi xét duyệt</OpBtn>}
        </div>
      )}
      {confirming && app && (
        <OpConfirm title="Gửi hồ sơ xét duyệt" sub={app.legalName} confirmLabel="Gửi" pending={submit.isPending} error={submit.error}
          onConfirm={() => submit.mutate()} onClose={() => setConfirming(false)}>
          <p className="rd-muted">Hồ sơ khoá lại cho tới khi Admin có kết quả.</p>
        </OpConfirm>
      )}
    </form>
  )
}

function PartyForm({ party }: { party: PartyResponse }) {
  const [f, setF] = useState({
    legalName: party.legalName, partyType: party.partyType, registrationNo: party.registrationNo ?? '', representative: party.representative ?? '', phone: party.phone ?? '',
  })
  const save = useSend<PartyResponse, UpdatePartyRequest>('put', '/api/me/party', { success: 'Đã lưu hồ sơ đối tác.', quietError: true })
  const organisation = f.partyType !== 'Individual'
  const onSave = (e: FormEvent) => {
    e.preventDefault()
    save.mutate({
      legalName: f.legalName.trim(), partyType: f.partyType, registrationNo: f.registrationNo.trim() || null,
      representative: f.representative.trim() || null, phone: f.phone.trim() || null,
    })
  }
  return (
    <form className="op-form" onSubmit={onSave}>
      <div className="op-inline">
        <OpBadge>{party.partyCode}</OpBadge>
        <StatusBadge kind="verification" value={party.verificationStatus} />
        {party.roles.map((r) => <OpBadge key={r.roleType} tone={r.status === 'Active' ? 'ok' : r.status === 'Pending' ? 'warn' : 'mute'}>{label('roleType', r.roleType)} · {label('partyRole', r.status)}</OpBadge>)}
      </div>
      {party.rejectReason && <OpNote tone="danger">Bị từ chối xác minh: {party.rejectReason}</OpNote>}
      <div className="op-form__row">
        <Field label="Tên pháp lý" required hint="Phải khớp tên chủ tài khoản nhận tiền">
          <Input value={f.legalName} maxLength={200} onChange={(e) => setF({ ...f, legalName: e.target.value })} />
        </Field>
        <Field label="Loại đối tác">
          <Select value={f.partyType} onChange={(e) => setF({ ...f, partyType: e.target.value })}>
            {options('partyType').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      </div>
      <div className="op-form__row">
        <Field label="Số đăng ký">
          <Input value={f.registrationNo} maxLength={30} onChange={(e) => setF({ ...f, registrationNo: e.target.value })} />
        </Field>
        <Field label="Người đại diện" required={organisation}>
          <Input value={f.representative} maxLength={150} onChange={(e) => setF({ ...f, representative: e.target.value })} />
        </Field>
        <Field label="Điện thoại">
          <Input type="tel" inputMode="tel" value={f.phone} maxLength={15} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
      </div>
      {save.isError && <OpNote tone="danger">{errorMessage(save.error)}</OpNote>}
      <div className="op-formfoot">
        <OpBtn type="submit" variant="ghost" disabled={!f.legalName.trim() || (organisation && !f.representative.trim()) || save.isPending}>
          {save.isPending ? 'Đang lưu…' : 'Lưu hồ sơ đối tác'}
        </OpBtn>
      </div>
    </form>
  )
}

export default function OperatorRegistration() {
  const application = useGet<OperatorResponse>('/api/operators/me', undefined, { retry: false })
  const party = useGet<PartyResponse>('/api/me/party', undefined, { retry: false })
  const isMember = useAuthStore((s) => !!s.user?.roles.includes('OperatorMember'))
  const none = application.isError && httpStatus(application.error) === 404
  const app = application.data ?? null

  return (
    <>
      <OpHeading eyebrow="Hồ sơ" title="Hồ sơ hộ nuôi" />

      <OpPanel
        title="Hồ sơ xét duyệt"
        action={app ? <StatusBadge kind="operator" value={app.status} /> : none ? <OpBadge>Chưa có hồ sơ</OpBadge> : undefined}
      >
        {application.isPending ? <OpLoading /> : application.isError && !none ? <OpError error={application.error} onRetry={() => void application.refetch()} /> : (
          <>
            {app && !isMember
              ? <OpNote>Đăng xuất rồi đăng nhập lại để mở cổng người nuôi.</OpNote>
              : app?.status === 'Rejected' ? <OpNote tone="danger">Hồ sơ bị từ chối. Liên hệ Admin để xét lại.</OpNote>
                : app?.status === 'Suspended' ? <OpNote tone="danger">Hộ nuôi đang tạm dừng. Liên hệ Admin.</OpNote> : null}
            <ApplicationForm key={app ? `${app.operatorId}-${app.status}` : 'new'} app={app} />
          </>
        )}
      </OpPanel>

      <FarmSites />

      {(party.data || app) && (
        <OpPanel title="Thông tin khác">
          {party.data && (
            <OpMore label="Hồ sơ đối tác">
              <PartyForm key={`${party.data.partyId}-${party.data.verificationStatus}`} party={party.data} />
            </OpMore>
          )}
          {app && <RelatedParties />}
        </OpPanel>
      )}
    </>
  )
}
