/* Form thêm hoặc sửa một địa điểm nhận hàng (POST, PUT /api/me/sites, loại DeliveryAddress).
   Dùng ở trang Địa điểm nhận hàng và ngay trong trang đặt trước. Toạ độ bắt buộc vì đơn đặt trước tính khoảng cách
   từ điểm xuất hàng của Lô tới địa chỉ giao (BR-084, BR-085). */
import { useState, type FormEvent } from 'react'
import { LocateFixed } from 'lucide-react'
import type { PartySiteResponse, SiteRequest } from '../../shared/api/api.gen'
import { Checkbox, Field, Input, OpBtn, OpMore, OpNote, errorMessage, useSend } from '../../shared/ui/console'

const COORDS = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/

/** Đọc "10.7769, 106.7009" (cách Google Maps chép toạ độ) thành cặp vĩ độ, kinh độ. */
export function parseCoords(text: string): { latitude: number; longitude: number } | null {
  const m = COORDS.exec(text)
  if (!m) return null
  const latitude = Number(m[1])
  const longitude = Number(m[2])
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null
}

export function SiteForm({ site, onDone, onCancel }: { site?: PartySiteResponse; onDone: (site: PartySiteResponse) => void; onCancel: () => void }) {
  const [name, setName] = useState(site?.name ?? '')
  const [addressLine, setAddressLine] = useState(site?.addressLine ?? '')
  const [province, setProvince] = useState(site?.province ?? '')
  const [coords, setCoords] = useState(site?.latitude != null && site.longitude != null ? `${site.latitude}, ${site.longitude}` : '')
  const [contactName, setContactName] = useState(site?.contactName ?? '')
  const [contactPhone, setContactPhone] = useState(site?.contactPhone ?? '')
  const [isDefault, setIsDefault] = useState(site?.isDefault ?? false)
  const [message, setMessage] = useState('')
  const [locating, setLocating] = useState(false)

  const save = useSend<PartySiteResponse, SiteRequest>(site ? 'put' : 'post', site ? `/api/me/sites/${site.siteId}` : '/api/me/sites', {
    success: site ? 'Đã lưu địa điểm.' : 'Đã thêm địa điểm nhận hàng.',
    quietError: true,
    onSuccess: onDone,
  })

  const locate = () => {
    if (!navigator.geolocation) return setMessage('Trình duyệt này không lấy được vị trí. Hãy dán toạ độ từ bản đồ.')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`)
        setMessage('')
        setLocating(false)
      },
      () => {
        setMessage('Không lấy được vị trí hiện tại. Hãy dán toạ độ từ bản đồ.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const point = parseCoords(coords)
    if (!name.trim() || !addressLine.trim()) return setMessage('Nhập tên địa điểm và địa chỉ.')
    if (!point) return setMessage('Toạ độ chưa đúng. Ví dụ: 10.7769, 106.7009.')
    setMessage('')
    save.mutate({
      siteType: 'DeliveryAddress',
      name: name.trim(),
      addressLine: addressLine.trim(),
      province: province.trim() || null,
      latitude: point.latitude,
      longitude: point.longitude,
      contactName: contactName.trim() || null,
      contactPhone: contactPhone.trim() || null,
      isDefault,
    })
  }

  return (
    <form className="op-form" onSubmit={submit} noValidate>
      <div className="op-form__row">
        <Field label="Tên địa điểm" required>
          <Input value={name} maxLength={150} placeholder="Nhà hàng, kho…" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Số điện thoại người nhận">
          <Input type="tel" inputMode="tel" value={contactPhone} maxLength={15} autoComplete="tel" onChange={(e) => setContactPhone(e.target.value)} />
        </Field>
      </div>
      <Field label="Địa chỉ" required>
        <Input value={addressLine} maxLength={300} autoComplete="street-address" onChange={(e) => setAddressLine(e.target.value)} />
      </Field>
      <Field label="Toạ độ" required hint="Chép từ bản đồ: vĩ độ, kinh độ">
        <Input value={coords} inputMode="decimal" placeholder="10.7769, 106.7009" onChange={(e) => setCoords(e.target.value)} />
      </Field>
      <div>
        <OpBtn type="button" variant="ghost" sm onClick={locate} disabled={locating}><LocateFixed size={15} /> {locating ? 'Đang lấy vị trí…' : 'Dùng vị trí hiện tại'}</OpBtn>
      </div>
      <OpMore label="Tuỳ chọn thêm">
        <div className="op-form__row">
          <Field label="Tên người nhận">
            <Input value={contactName} maxLength={150} autoComplete="name" onChange={(e) => setContactName(e.target.value)} />
          </Field>
          <Field label="Tỉnh, thành phố">
            <Input value={province} maxLength={100} autoComplete="address-level1" onChange={(e) => setProvince(e.target.value)} />
          </Field>
        </div>
        <Checkbox checked={isDefault} onChange={setIsDefault} disabled={site?.isDefault}>Dùng làm địa điểm mặc định</Checkbox>
      </OpMore>
      {(message || save.isError) && <OpNote tone="danger">{message || errorMessage(save.error)}</OpNote>}
      <div className="op-formfoot">
        <OpBtn type="button" variant="ghost" onClick={onCancel}>Đóng</OpBtn>
        <OpBtn type="submit" disabled={save.isPending}>{save.isPending ? 'Đang lưu…' : site ? 'Lưu địa điểm' : 'Thêm địa điểm'}</OpBtn>
      </div>
    </form>
  )
}
