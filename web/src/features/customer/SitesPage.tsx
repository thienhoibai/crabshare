/* /khach/dia-diem — Địa điểm nhận hàng của khách (GET, POST, PUT, DELETE /api/me/sites, loại DeliveryAddress).
   Thay cho sổ địa chỉ cũ. Xoá là ngừng dùng: đơn đã đặt vẫn giữ địa chỉ lúc đặt. */
import { useState } from 'react'
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import type { PartySiteResponse } from '../../shared/api/api.gen'
import { OpBadge, OpBtn, OpConfirm, OpEmpty, OpHeading, OpIcon, OpModal, OpPanel, QueryView, useGet, useSend } from '../../shared/ui/console'
import { SiteForm } from './SiteForm'

export default function SitesPage() {
  const sites = useGet<PartySiteResponse[]>('/api/me/sites', { siteType: 'DeliveryAddress' })
  const [editing, setEditing] = useState<PartySiteResponse | 'new' | null>(null)
  const [removing, setRemoving] = useState<PartySiteResponse | null>(null)
  const remove = useSend<void, void>('delete', `/api/me/sites/${removing?.siteId ?? 0}`, {
    success: 'Đã ngừng dùng địa điểm.', quietError: true, onSuccess: () => setRemoving(null),
  })

  return (
    <>
      <OpHeading
        eyebrow="Tài khoản"
        title="Địa điểm nhận hàng"
        action={<OpBtn onClick={() => setEditing('new')}><Plus size={17} /> Thêm địa điểm</OpBtn>}
      />
      <QueryView query={sites}>
        {(rows) => rows.length === 0 ? (
          <OpPanel><OpEmpty title="Chưa có địa điểm nhận hàng" icon={<MapPin size={30} />} /></OpPanel>
        ) : (
          <div className="op-cards">
            {rows.map((s) => {
              const located = s.latitude !== null && s.longitude !== null
              return (
                <div key={s.siteId} className="op-card">
                  <span className="op-card__body">
                    <span className="op-between">
                      <OpIcon tone={located ? 'gold' : 'warn'}><MapPin size={20} /></OpIcon>
                      <span className="op-inline">
                        {s.isDefault && <OpBadge tone="ok">Mặc định</OpBadge>}
                        {!located && <OpBadge tone="warn">Thiếu toạ độ</OpBadge>}
                      </span>
                    </span>
                    <b className="op-card__title">{s.name}</b>
                    <span className="op-card__sub">{s.addressLine}{s.province ? `, ${s.province}` : ''}</span>
                    {(s.contactName || s.contactPhone) && <span className="op-card__sub">{[s.contactName, s.contactPhone].filter(Boolean).join(' · ')}</span>}
                    <span className="op-card__foot">
                      <OpBtn variant="ghost" sm onClick={() => setEditing(s)}><Pencil size={15} /> Sửa</OpBtn>
                      <OpBtn variant="ghost" sm onClick={() => { remove.reset(); setRemoving(s) }}><Trash2 size={15} /> Ngừng dùng</OpBtn>
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </QueryView>

      {editing && (
        <OpModal title={editing === 'new' ? 'Thêm địa điểm nhận hàng' : `Sửa ${editing.name}`} onClose={() => setEditing(null)} wide>
          <SiteForm site={editing === 'new' ? undefined : editing} onCancel={() => setEditing(null)} onDone={() => setEditing(null)} />
        </OpModal>
      )}

      {removing && (
        <OpConfirm title={`Ngừng dùng ${removing.name}`} confirmLabel="Ngừng dùng địa điểm" variant="danger" pending={remove.isPending} error={remove.error}
          onConfirm={() => remove.mutate()} onClose={() => setRemoving(null)}>
          <p>Đơn đã đặt vẫn giao tới địa chỉ ghi trên đơn.</p>
        </OpConfirm>
      )}
    </>
  )
}
