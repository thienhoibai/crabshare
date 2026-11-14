/* Địa điểm của hộ nuôi: trại, trạm kiểm phẩm, kho (GET/POST /api/me/sites, PUT/DELETE /api/me/sites/{siteId}).
   Trại hoặc kho phải có toạ độ thì mới chọn được làm địa điểm xuất hàng của Lô (BR-084). */
import { useState } from 'react'
import { LocateFixed, Pencil, Plus, Trash2 } from 'lucide-react'
import type { PartySiteResponse, SiteRequest } from '../../shared/api/api.gen'
import {
  Checkbox, DecimalInput, Field, Input, OpBadge, OpBtn, OpConfirm, OpMore, OpNote, OpPanel, OpTable, QueryView, Select, StatusBadge, toast, useGet, useSend,
} from '../../shared/ui/console'

const SITE_TYPES = [
  { value: 'Farm', label: 'Trại nuôi' },
  { value: 'QcStation', label: 'Trạm kiểm phẩm' },
  { value: 'Warehouse', label: 'Kho' },
]

type Draft = {
  siteType: string; name: string; addressLine: string; province: string; latitude: number | null; longitude: number | null
  contactName: string; contactPhone: string; isDefault: boolean
}

const toDraft = (s?: PartySiteResponse): Draft => ({
  siteType: s?.siteType ?? 'Farm', name: s?.name ?? '', addressLine: s?.addressLine ?? '', province: s?.province ?? '',
  latitude: s?.latitude ?? null, longitude: s?.longitude ?? null, contactName: s?.contactName ?? '', contactPhone: s?.contactPhone ?? '',
  isDefault: s?.isDefault ?? false,
})

function SiteDialog({ site, onClose }: { site: PartySiteResponse | null; onClose: () => void }) {
  const [f, setF] = useState<Draft>(() => toDraft(site ?? undefined))
  const [locating, setLocating] = useState(false)
  const save = useSend<PartySiteResponse, SiteRequest>(site ? 'put' : 'post', site ? `/api/me/sites/${site.siteId}` : '/api/me/sites', {
    success: site ? 'Đã lưu địa điểm.' : 'Đã thêm địa điểm.', onSuccess: onClose, quietError: true,
  })
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setF((old) => ({ ...old, [key]: value }))
  const locate = () => {
    if (!('geolocation' in navigator)) return toast('Trình duyệt này không có định vị.', 'danger')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => { setF((old) => ({ ...old, latitude: Number(p.coords.latitude.toFixed(6)), longitude: Number(p.coords.longitude.toFixed(6)) })); setLocating(false) },
      () => { toast('Không lấy được vị trí. Nhập vĩ độ, kinh độ bằng tay.', 'danger'); setLocating(false) },
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }
  return (
    <OpConfirm
      title={site ? `Sửa ${site.name}` : 'Thêm địa điểm'}
      confirmLabel="Lưu"
      pending={save.isPending}
      error={save.error}
      disabled={!f.name.trim() || !f.addressLine.trim()}
      onClose={onClose}
      onConfirm={() => save.mutate({
        siteCode: site?.siteCode, siteType: f.siteType, name: f.name.trim(), addressLine: f.addressLine.trim(), province: f.province.trim() || null,
        latitude: f.latitude, longitude: f.longitude, contactName: f.contactName.trim() || null, contactPhone: f.contactPhone.trim() || null, isDefault: f.isDefault,
      })}
      wide
    >
      <div className="op-form__row">
        {/* API không cho đổi loại của địa điểm đã có. */}
        <Field label="Loại">
          <Select value={f.siteType} disabled={!!site} onChange={(e) => set('siteType', e.target.value)}>
            {SITE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Tên" required>
          <Input value={f.name} maxLength={150} onChange={(e) => set('name', e.target.value)} placeholder="Trại cua hộp Năm Căn" />
        </Field>
      </div>
      <Field label="Địa chỉ" required>
        <Input value={f.addressLine} maxLength={300} onChange={(e) => set('addressLine', e.target.value)} />
      </Field>
      <div className="op-form__row">
        <Field label="Vĩ độ" hint="Ví dụ 8,7601">
          <DecimalInput value={f.latitude} onChange={(v) => set('latitude', v)} />
        </Field>
        <Field label="Kinh độ" hint="Ví dụ 105,0503">
          <DecimalInput value={f.longitude} onChange={(v) => set('longitude', v)} />
        </Field>
      </div>
      <div className="op-inline">
        <OpBtn type="button" variant="ghost" sm onClick={locate} disabled={locating}><LocateFixed size={15} /> {locating ? 'Đang lấy vị trí…' : 'Lấy vị trí của máy'}</OpBtn>
      </div>
      <OpMore label="Tuỳ chọn thêm">
        <div className="op-form__row">
          <Field label="Tỉnh, thành">
            <Input value={f.province} maxLength={100} onChange={(e) => set('province', e.target.value)} />
          </Field>
          <Field label="Người liên hệ">
            <Input value={f.contactName} maxLength={150} onChange={(e) => set('contactName', e.target.value)} />
          </Field>
          <Field label="Điện thoại">
            <Input type="tel" inputMode="tel" value={f.contactPhone} maxLength={15} onChange={(e) => set('contactPhone', e.target.value)} />
          </Field>
        </div>
        <Checkbox checked={f.isDefault} onChange={(v) => set('isDefault', v)}>Địa điểm mặc định của loại này</Checkbox>
      </OpMore>
    </OpConfirm>
  )
}

export default function FarmSites() {
  const sites = useGet<PartySiteResponse[]>('/api/me/sites')
  const [editing, setEditing] = useState<PartySiteResponse | 'new' | null>(null)
  const [removing, setRemoving] = useState<PartySiteResponse | null>(null)
  const remove = useSend<void, void>('delete', `/api/me/sites/${removing?.siteId ?? 0}`, { success: 'Đã ngừng dùng địa điểm.', onSuccess: () => setRemoving(null), quietError: true })

  return (
    <OpPanel
      title="Địa điểm"
      subtitle="Trại hoặc kho cần có toạ độ để làm nơi xuất hàng của Lô."
      action={<OpBtn variant="ghost" sm onClick={() => setEditing('new')}><Plus size={15} /> Thêm</OpBtn>}
    >
      <QueryView query={sites}>
        {(rows) => {
          const mine = rows.filter((s) => s.siteType !== 'DeliveryAddress' && s.status === 'Active')
          const dispatchReady = mine.some((s) => (s.siteType === 'Farm' || s.siteType === 'Warehouse') && s.latitude !== null)
          return (
            <>
              {!dispatchReady && <OpNote tone="danger">Chưa có trại hoặc kho nào có toạ độ nên chưa tạo được Lô.</OpNote>}
              {mine.length > 0 && (
                <OpTable
                  rows={mine}
                  rowKey={(s) => s.siteId}
                  columns={[
                    {
                      key: 'name', header: 'Địa điểm', cell: (s) => (
                        <><b>{s.name}</b>{s.isDefault && <> <OpBadge tone="gold">Mặc định</OpBadge></>}<br /><small className="rd-muted">{[s.addressLine, s.province].filter(Boolean).join(', ')}</small></>
                      ),
                    },
                    { key: 'type', header: 'Loại', cell: (s) => <StatusBadge kind="siteType" value={s.siteType} /> },
                    { key: 'geo', header: 'Toạ độ', cell: (s) => (s.latitude !== null && s.longitude !== null ? <span className="rd-num">{s.latitude}, {s.longitude}</span> : <span className="op-warn">Chưa có</span>) },
                    {
                      key: 'act', header: '', cell: (s) => (
                        <span className="op-inline">
                          <OpBtn variant="ghost" sm onClick={() => setEditing(s)} aria-label={`Sửa ${s.name}`}><Pencil size={14} /></OpBtn>
                          <OpBtn variant="ghost" sm onClick={() => setRemoving(s)} aria-label={`Ngừng dùng ${s.name}`}><Trash2 size={14} /></OpBtn>
                        </span>
                      ),
                    },
                  ]}
                />
              )}
            </>
          )
        }}
      </QueryView>

      {editing && <SiteDialog site={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {removing && (
        <OpConfirm title="Ngừng dùng địa điểm" sub={removing.name} confirmLabel="Ngừng dùng" variant="danger"
          pending={remove.isPending} error={remove.error} onConfirm={() => remove.mutate()} onClose={() => setRemoving(null)}>
          <p className="rd-muted">Lô và đơn đã dùng địa điểm này vẫn giữ nguyên.</p>
        </OpConfirm>
      )}
    </OpPanel>
  )
}
