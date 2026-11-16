/* Hộp "Ghi nhận đối tác": Admin ghi một nhà cung cấp hoặc bên cam kết thu mua không cần có tài khoản (BR-016).
   POST /api/admin/parties (ExternalPartyRequest). Đối tác do Admin ghi được xác minh ngay và vai trò có hiệu lực ngay.
   Địa điểm là tuỳ chọn; Lô A xuất hàng từ kho của nhà cung cấp thì kho đó cần có vĩ độ, kinh độ. */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { ExternalPartyRequest, PartyResponse } from '../../shared/api/api.gen'
import { Checkbox, DecimalInput, Field, Input, OpConfirm, OpMore, RadioCards, Select, options, useSend } from '../../shared/ui/console'

type ExternalRole = 'Supplier' | 'OfftakeBuyer'

export default function AdminPartyRecordDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [roleType, setRoleType] = useState<ExternalRole>('Supplier')
  const [partyType, setPartyType] = useState('Household')
  const [legalName, setLegalName] = useState('')
  const [registrationNo, setRegistrationNo] = useState('')
  const [representative, setRepresentative] = useState('')
  const [phone, setPhone] = useState('')
  const [withSite, setWithSite] = useState(false)
  const [siteType, setSiteType] = useState('Warehouse')
  const [siteName, setSiteName] = useState('')
  const [addressLine, setAddressLine] = useState('')
  const [province, setProvince] = useState('')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)

  const record = useSend<PartyResponse, ExternalPartyRequest>('post', '/api/admin/parties', {
    success: 'Đã ghi nhận đối tác.',
    quietError: true,
    onSuccess: (party) => navigate(`/admin/parties/${party.partyId}`),
  })

  const coordinatesPaired = (latitude === null) === (longitude === null)
  const siteReady = !withSite || (siteName.trim() !== '' && addressLine.trim() !== '' && coordinatesPaired)
  const ready = legalName.trim() !== '' && phone.trim() !== '' && siteReady

  const submit = () => record.mutate({
    legalName: legalName.trim(),
    partyType,
    registrationNo: registrationNo.trim() || null,
    representative: representative.trim() || null,
    phone: phone.trim(),
    roleType,
    site: withSite ? {
      siteType,
      name: siteName.trim(),
      addressLine: addressLine.trim(),
      province: province.trim() || null,
      latitude,
      longitude,
      isDefault: true,
    } : null,
  })

  return (
    <OpConfirm
      wide
      title="Ghi nhận đối tác"
      confirmLabel="Ghi nhận"
      pending={record.isPending}
      error={record.error}
      disabled={!ready}
      onConfirm={submit}
      onClose={onClose}
    >
      <RadioCards<ExternalRole>
        value={roleType}
        onChange={setRoleType}
        options={[
          { value: 'Supplier', label: 'Nhà cung cấp', hint: 'Bán cua nguồn cho Lô' },
          { value: 'OfftakeBuyer', label: 'Bên cam kết thu mua', hint: 'Mua phần còn lại theo giá sàn' },
        ]}
      />
      <div className="op-form__row">
        <Field label="Tên pháp lý" required>
          <Input value={legalName} maxLength={200} onChange={(e) => setLegalName(e.target.value)} autoFocus />
        </Field>
        <Field label="Số điện thoại" required>
          <Input type="tel" inputMode="tel" value={phone} maxLength={15} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Loại đối tác">
          <Select value={partyType} onChange={(e) => setPartyType(e.target.value)}>
            {options('partyType').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      </div>

      <OpMore label="Tuỳ chọn thêm">
        <div className="op-form__row">
          <Field label="Mã số thuế hoặc số đăng ký">
            <Input value={registrationNo} maxLength={30} onChange={(e) => setRegistrationNo(e.target.value)} />
          </Field>
          <Field label="Người đại diện">
            <Input value={representative} maxLength={150} onChange={(e) => setRepresentative(e.target.value)} />
          </Field>
        </div>
        <Checkbox checked={withSite} onChange={setWithSite}>Khai một địa điểm (kho, trại, địa chỉ giao)</Checkbox>
        {withSite && (
          <div className="op-subform">
            <Field label="Loại địa điểm">
              <Select value={siteType} onChange={(e) => setSiteType(e.target.value)}>
                {options('siteType').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Tên địa điểm" required>
              <Input value={siteName} maxLength={150} onChange={(e) => setSiteName(e.target.value)} />
            </Field>
            <Field label="Tỉnh, thành">
              <Input value={province} maxLength={100} onChange={(e) => setProvince(e.target.value)} />
            </Field>
            <Field label="Địa chỉ" required className="is-wide">
              <Input value={addressLine} maxLength={300} onChange={(e) => setAddressLine(e.target.value)} />
            </Field>
            <Field label="Vĩ độ">
              <DecimalInput value={latitude} onChange={setLatitude} />
            </Field>
            <Field label="Kinh độ" error={coordinatesPaired ? undefined : 'Nhập cả vĩ độ và kinh độ.'}>
              <DecimalInput value={longitude} onChange={setLongitude} />
            </Field>
          </div>
        )}
      </OpMore>
    </OpConfirm>
  )
}
