/* Form thêm hoặc sửa địa điểm nhận hàng trong sổ địa chỉ và khi đặt trước (POST, PUT /api/me/sites). */
import { useEffect, useState, type FormEvent } from 'react'
import type { PartySiteResponse, SiteRequest } from '../../shared/api/api.gen'
import {
  composeVnAddress, findVnProvince, parseVnAddress, resolveVnCoordinates, useVnProvinces, VnAddressPicker, type VnAddressValue,
} from '../../shared/party/VnAddressPicker'
import { Checkbox, Field, Input, OpBtn, OpMore, OpNote, errorMessage, useSend } from '../../shared/ui/console'

export function SiteForm({ site, onDone, onCancel }: {
  site?: PartySiteResponse
  onDone: (site: PartySiteResponse) => void
  onCancel: () => void
}) {
  const provinces = useVnProvinces()
  const [name, setName] = useState(site?.name ?? '')
  const [address, setAddress] = useState<VnAddressValue>(() =>
    site ? parseVnAddress(provinces, site.addressLine, site.province) : { provinceName: '', wardName: '', streetLine: '' },
  )
  const [touchedAddress, setTouchedAddress] = useState(false)
  const [contactName, setContactName] = useState(site?.contactName ?? '')
  const [contactPhone, setContactPhone] = useState(site?.contactPhone ?? '')
  const [isDefault, setIsDefault] = useState(site?.isDefault ?? false)
  const [message, setMessage] = useState('')
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    if (!site || touchedAddress || provinces.length === 0) return
    setAddress(parseVnAddress(provinces, site.addressLine, site.province))
  }, [provinces, site, touchedAddress])

  const save = useSend<PartySiteResponse, SiteRequest>(site ? 'put' : 'post', site ? `/api/me/sites/${site.siteId}` : '/api/me/sites', {
    success: site ? 'Đã lưu địa điểm.' : 'Đã thêm địa điểm nhận hàng.',
    quietError: true,
    onSuccess: onDone,
  })

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const matchedProvince = findVnProvince(provinces, address.provinceName)
    const wardRequired = (!site || touchedAddress) && (matchedProvince?.wards.length ?? 0) > 0
    if (!name.trim() || !address.provinceName.trim() || !address.streetLine.trim() || (wardRequired && !address.wardName.trim())) {
      return setMessage('Nhập tên địa điểm, chọn Tỉnh/Thành phố, Phường/Xã và điền số nhà, tên đường.')
    }
    setMessage('')
    setResolving(true)
    try {
      const coords = await resolveVnCoordinates(
        provinces,
        address,
        site ? { latitude: site.latitude, longitude: site.longitude, addressLine: site.addressLine, province: site.province } : undefined,
      )
      save.mutate({
        siteType: 'DeliveryAddress',
        name: name.trim(),
        addressLine: composeVnAddress(address.streetLine, address.wardName),
        province: (!touchedAddress && site?.province) ? site.province : (address.provinceName.trim() || null),
        latitude: coords.latitude,
        longitude: coords.longitude,
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
        isDefault,
      })
    } finally {
      setResolving(false)
    }
  }

  return (
    <form className="op-form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="op-form__row">
        <Field label="Tên địa điểm" required>
          <Input value={name} maxLength={150} placeholder="Nhà hàng, kho…" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Số điện thoại người nhận">
          <Input type="tel" inputMode="tel" value={contactPhone} maxLength={15} autoComplete="tel" onChange={(e) => setContactPhone(e.target.value)} />
        </Field>
      </div>
      <VnAddressPicker
        provinces={provinces}
        value={address}
        onChange={(next) => { setTouchedAddress(true); setAddress(next) }}
      />
      <OpMore label="Tuỳ chọn thêm">
        <Field label="Tên người nhận">
          <Input value={contactName} maxLength={150} autoComplete="name" onChange={(e) => setContactName(e.target.value)} />
        </Field>
        <Checkbox checked={isDefault} onChange={setIsDefault} disabled={site?.isDefault}>Dùng làm địa điểm mặc định</Checkbox>
      </OpMore>
      {(message || save.isError) && <div role="alert"><OpNote tone="danger">{message || errorMessage(save.error)}</OpNote></div>}
      <div className="op-formfoot">
        <OpBtn type="button" variant="ghost" onClick={onCancel}>Đóng</OpBtn>
        <OpBtn type="submit" disabled={resolving || save.isPending}>{resolving || save.isPending ? 'Đang lưu…' : site ? 'Lưu địa điểm' : 'Thêm địa điểm'}</OpBtn>
      </div>
    </form>
  )
}
