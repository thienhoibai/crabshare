/* Địa điểm của hộ nuôi: trại, trạm kiểm phẩm, kho (GET/POST /api/me/sites, PUT/DELETE /api/me/sites/{siteId}).
   Người dùng chọn Tỉnh/Thành phố (34 tỉnh/thành sau sáp nhập), Phường/Xã và số nhà/đường; toạ độ được phân giải tự động. */
import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { PartySiteResponse, SiteRequest } from '../../shared/api/api.gen'
import {
  composeVnAddress, parseVnAddress, resolveVnCoordinates, useVnProvinces, VnAddressPicker, type VnAddressValue,
} from '../../shared/party/VnAddressPicker'
import {
  Checkbox, Field, Input, OpBadge, OpBtn, OpConfirm, OpMore, OpNote, OpPanel, OpTable, QueryView, Select, StatusBadge, useGet, useSend,
} from '../../shared/ui/console'

const SITE_TYPES = [
  { value: 'Farm', label: 'Trại nuôi' },
  { value: 'QcStation', label: 'Trạm kiểm phẩm' },
  { value: 'Warehouse', label: 'Kho' },
]

type Draft = {
  siteType: string; name: string; address: VnAddressValue
  contactName: string; contactPhone: string; isDefault: boolean
}

const toDraft = (s?: PartySiteResponse, parsed?: VnAddressValue): Draft => ({
  siteType: s?.siteType ?? 'Farm',
  name: s?.name ?? '',
  address: parsed ?? { provinceName: s?.province ?? '', wardName: '', streetLine: s?.addressLine ?? '' },
  contactName: s?.contactName ?? '',
  contactPhone: s?.contactPhone ?? '',
  isDefault: s?.isDefault ?? false,
})

function SiteDialog({ site, onClose }: { site: PartySiteResponse | null; onClose: () => void }) {
  const provinces = useVnProvinces()
  const [f, setF] = useState<Draft>(() => toDraft(site ?? undefined, site ? parseVnAddress(provinces, site.addressLine, site.province) : undefined))
  const [hydrating, setHydrating] = useState(false)
  const [touchedAddress, setTouchedAddress] = useState(false)

  useEffect(() => {
    if (!site || touchedAddress || provinces.length === 0) return
    setF((old) => ({ ...old, address: parseVnAddress(provinces, site.addressLine, site.province) }))
  }, [provinces, site, touchedAddress])

  const save = useSend<PartySiteResponse, SiteRequest>(site ? 'put' : 'post', site ? `/api/me/sites/${site.siteId}` : '/api/me/sites', {
    success: site ? 'Đã lưu địa điểm.' : 'Đã thêm địa điểm.', onSuccess: onClose, quietError: true,
  })
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setF((old) => ({ ...old, [key]: value }))
  const hasProvinceData = provinces.length > 0
  const addressReady = !!f.address.streetLine.trim() && !!f.address.provinceName.trim() && (!hasProvinceData || !!f.address.wardName.trim() || !provinces.some((p) => p.name === f.address.provinceName))

  const onSave = async () => {
    setHydrating(true)
    try {
      const coords = await resolveVnCoordinates(
        provinces,
        f.address,
        site ? { latitude: site.latitude, longitude: site.longitude, addressLine: site.addressLine, province: site.province } : undefined,
      )
      save.mutate({
        siteCode: site?.siteCode,
        siteType: f.siteType,
        name: f.name.trim(),
        addressLine: composeVnAddress(f.address.streetLine, f.address.wardName),
        province: f.address.provinceName.trim() || null,
        latitude: coords.latitude,
        longitude: coords.longitude,
        contactName: f.contactName.trim() || null,
        contactPhone: f.contactPhone.trim() || null,
        isDefault: f.isDefault,
      })
    } finally {
      setHydrating(false)
    }
  }

  return (
    <OpConfirm
      title={site ? `Sửa ${site.name}` : 'Thêm địa điểm'}
      confirmLabel="Lưu"
      pending={hydrating || save.isPending}
      error={save.error}
      disabled={!f.name.trim() || !addressReady}
      onClose={onClose}
      onConfirm={() => void onSave()}
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
      <VnAddressPicker
        provinces={provinces}
        value={f.address}
        onChange={(next) => { setTouchedAddress(true); set('address', next) }}
        streetPlaceholder="Ấp Hàng Vịnh, số nhà, tên đường…"
      />
      <OpMore label="Tuỳ chọn thêm">
        <div className="op-form__row">
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
      subtitle="Chọn Tỉnh/Thành phố, Phường/Xã và địa chỉ trại hoặc kho để làm nơi xuất hàng của Lô."
      action={<OpBtn variant="ghost" sm onClick={() => setEditing('new')}><Plus size={15} /> Thêm</OpBtn>}
    >
      <QueryView query={sites}>
        {(rows) => {
          const mine = rows.filter((s) => s.siteType !== 'DeliveryAddress' && s.status === 'Active')
          const dispatchReady = mine.some((s) => (s.siteType === 'Farm' || s.siteType === 'Warehouse') && s.latitude !== null)
          return (
            <>
              {!dispatchReady && <OpNote tone="danger">Chưa có trại hoặc kho nào có địa chỉ đầy đủ nên chưa tạo được Lô.</OpNote>}
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
                    { key: 'contact', header: 'Liên hệ', cell: (s) => [s.contactName, s.contactPhone].filter(Boolean).join(' · ') || <span className="rd-muted">—</span> },
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
