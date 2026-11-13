/* Bên liên quan của người nuôi (BR-008): GET/POST /api/me/related-parties, DELETE /api/me/related-parties/{id}.
   Hệ thống chỉ lưu mã băm và 4 số cuối của giấy tờ. Thành phần chỉ trả nội dung, đặt trong một khối gấp của trang hồ sơ. */
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { RelatedPartyRequest, RelatedPartyResponse } from '../../shared/api/api.gen'
import { Field, Input, OpBtn, OpConfirm, OpMore, OpTable, useGet, useSend } from '../../shared/ui/console'

function AddDialog({ onClose }: { onClose: () => void }) {
  const [fullName, setFullName] = useState('')
  const [relation, setRelation] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [linkedPartyCode, setLinkedPartyCode] = useState('')
  const add = useSend<RelatedPartyResponse, RelatedPartyRequest>('post', '/api/me/related-parties', { success: 'Đã thêm bên liên quan.', onSuccess: onClose, quietError: true })
  const idOk = /^[0-9A-Za-z]{6,20}$/.test(idNumber.trim())
  return (
    <OpConfirm
      title="Thêm bên liên quan"
      confirmLabel="Thêm"
      pending={add.isPending}
      error={add.error}
      disabled={!fullName.trim() || !relation.trim() || !idOk}
      onClose={onClose}
      onConfirm={() => add.mutate({ fullName: fullName.trim(), relation: relation.trim(), idNumber: idNumber.trim(), linkedPartyCode: linkedPartyCode.trim() || null })}
    >
      <Field label="Họ và tên" required>
        <Input value={fullName} maxLength={150} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <div className="op-form__row">
        <Field label="Quan hệ" required hint="Vợ, chồng, con, cổ đông…">
          <Input value={relation} maxLength={50} onChange={(e) => setRelation(e.target.value)} />
        </Field>
        <Field label="Số CCCD" required error={idNumber && !idOk ? 'Từ 6 đến 20 chữ số hoặc chữ cái.' : undefined}>
          <Input value={idNumber} maxLength={20} inputMode="numeric" autoComplete="off" onChange={(e) => setIdNumber(e.target.value)} />
        </Field>
      </div>
      <OpMore label="Tuỳ chọn thêm">
        <Field label="Mã đối tác trên nền tảng" hint="Khi người này cũng có tài khoản">
          <Input value={linkedPartyCode} maxLength={10} onChange={(e) => setLinkedPartyCode(e.target.value)} placeholder="DT00000012" />
        </Field>
      </OpMore>
    </OpConfirm>
  )
}

export default function RelatedParties() {
  const list = useGet<RelatedPartyResponse[]>('/api/me/related-parties', undefined, { retry: false })
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<RelatedPartyResponse | null>(null)
  const remove = useSend<void, void>('delete', `/api/me/related-parties/${removing?.relatedPartyId ?? 0}`, { success: 'Đã xoá bên liên quan.', onSuccess: () => setRemoving(null), quietError: true })
  // Tài khoản chưa có vai trò người nuôi (vừa tạo hồ sơ, chưa đăng nhập lại) thì API từ chối: ẩn cả khối.
  if (!list.data) return null

  return (
    <OpMore label="Bên liên quan" count={list.data.length}>
      {list.data.length > 0 && (
        <OpTable
          rows={list.data}
          rowKey={(r) => r.relatedPartyId}
          columns={[
            { key: 'name', header: 'Họ và tên', cell: (r) => <><b>{r.fullName}</b>{r.linkedPartyCode && <><br /><small className="op-mono rd-muted">{r.linkedPartyCode}</small></>}</> },
            { key: 'relation', header: 'Quan hệ', cell: (r) => r.relation },
            { key: 'id', header: 'Giấy tờ', cell: (r) => <span className="op-mono">•••• {r.idNumberLast4}</span> },
            { key: 'act', header: '', cell: (r) => <OpBtn variant="ghost" sm onClick={() => setRemoving(r)} aria-label={`Xoá ${r.fullName}`}><Trash2 size={14} /></OpBtn> },
          ]}
        />
      )}
      <div className="op-inline">
        <OpBtn variant="ghost" sm onClick={() => setAdding(true)}><Plus size={15} /> Thêm người thân hoặc tổ chức liên quan</OpBtn>
      </div>
      {adding && <AddDialog onClose={() => setAdding(false)} />}
      {removing && (
        <OpConfirm title="Xoá bên liên quan" sub={`${removing.fullName} · ${removing.relation}`} confirmLabel="Xoá" variant="danger"
          pending={remove.isPending} error={remove.error} onConfirm={() => remove.mutate()} onClose={() => setRemoving(null)} />
      )}
    </OpMore>
  )
}
