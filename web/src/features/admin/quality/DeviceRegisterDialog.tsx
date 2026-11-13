/* Đăng ký thiết bị (POST /api/admin/devices): mã, loại, hộ nuôi và phạm vi theo loại. Khoá thiết bị trả về một lần, trang cha hiện ngay. */
import { useState } from 'react'
import type {
  AdminOperatorResponse, DeviceRegisteredResponse, PagedResultOfAdminBatchResponse, PagedResultOfPartySummaryResponse, PartyResponse,
  RegisterDeviceRequest,
} from '../../../shared/api/api.gen'
import { Field, Input, NumberInput, OpConfirm, OpMore, RadioCards, Select, label, useGet, useSend } from '../../../shared/ui/console'

type DeviceType = 'Station' | 'RailCamera' | 'WaterSensor' | 'Camera'

const TYPES: { value: DeviceType; label: string; hint: string }[] = [
  { value: 'Station', label: 'Trạm đo', hint: 'Gắn với trạm kiểm phẩm' },
  { value: 'RailCamera', label: 'Camera chạy dàn', hint: 'Gắn với một dàn' },
  { value: 'WaterSensor', label: 'Cảm biến nước', hint: 'Gắn với một Lô' },
  { value: 'Camera', label: 'Camera hộp', hint: 'Gắn với một hộp' },
]

const CODE = /^[A-Za-z0-9_-]{3,40}$/
const RACK = /^R[0-9]{2}$/

export default function DeviceRegisterDialog({ operators, onClose, onRegistered }: {
  operators: AdminOperatorResponse[]
  onClose: () => void
  onRegistered: (result: DeviceRegisteredResponse) => void
}) {
  const [deviceCode, setDeviceCode] = useState('')
  const [deviceType, setDeviceType] = useState<DeviceType>('Station')
  const [operatorId, setOperatorId] = useState('')
  const [slotCode, setSlotCode] = useState('')
  const [rackCode, setRackCode] = useState('')
  const [batchCode, setBatchCode] = useState('')
  const [partyId, setPartyId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [source, setSource] = useState<'Real' | 'Simulated'>('Real')
  const [calibrationDays, setCalibrationDays] = useState<number | null>(null)
  const [cameraHeight, setCameraHeight] = useState<number | null>(null)

  const batches = useGet<PagedResultOfAdminBatchResponse>(deviceType === 'WaterSensor' ? '/api/admin/batches' : null, { PageSize: 100 })
  const parties = useGet<PagedResultOfPartySummaryResponse>(deviceType === 'Station' ? '/api/admin/parties' : null, { PageSize: 100 })
  const party = useGet<PartyResponse>(deviceType === 'Station' && partyId ? `/api/admin/parties/${partyId}` : null)
  const register = useSend<DeviceRegisteredResponse, RegisterDeviceRequest>('post', '/api/admin/devices', { quietError: true, onSuccess: onRegistered })

  const farmBatches = (batches.data?.items ?? []).filter((b) => String(b.batch.operatorId) === operatorId && b.batch.hasHolding)
  const sites = (party.data?.sites ?? []).filter((s) => (s.siteType === 'QcStation' || s.siteType === 'Farm') && s.status === 'Active')
  const rack = rackCode.trim().toUpperCase()

  const codeOk = CODE.test(deviceCode)
  const scopeOk = deviceType === 'Camera' ? slotCode.trim().length > 0
    : deviceType === 'RailCamera' ? RACK.test(rack)
      : deviceType === 'WaterSensor' ? !!batchCode
        : !!siteId
  const daysOk = calibrationDays === null || (calibrationDays >= 1 && calibrationDays <= 365)
  const heightOk = cameraHeight === null || (cameraHeight >= 50 && cameraHeight <= 2000)

  const submit = () => register.mutate({
    deviceCode,
    deviceType,
    operatorId: Number(operatorId),
    slotCode: deviceType === 'Camera' ? slotCode.trim() : null,
    rackCode: deviceType === 'RailCamera' ? rack : null,
    batchCode: deviceType === 'WaterSensor' ? batchCode : null,
    siteId: deviceType === 'Station' ? Number(siteId) : null,
    source,
    calibrationPeriodDays: calibrationDays,
    cameraHeightMm: deviceType === 'WaterSensor' ? null : cameraHeight,
  })

  return (
    <OpConfirm
      wide
      title="Đăng ký thiết bị"
      confirmLabel="Đăng ký và nhận khoá"
      pending={register.isPending}
      error={register.error}
      disabled={!codeOk || !operatorId || !scopeOk || !daysOk || !heightOk}
      onClose={onClose}
      onConfirm={submit}
    >
      <Field label="Loại thiết bị" required>
        <RadioCards value={deviceType} onChange={setDeviceType} options={TYPES} />
      </Field>
      <div className="op-form__row">
        <Field label="Mã thiết bị" required hint="Chữ không dấu, số, gạch. Ví dụ ST-NC-02." error={deviceCode && !codeOk ? 'Từ 3 đến 40 ký tự, không dấu, không khoảng trắng.' : undefined}>
          <Input className="op-mono" value={deviceCode} maxLength={40} onChange={(e) => setDeviceCode(e.target.value.trim())} />
        </Field>
        <Field label="Hộ nuôi" required>
          <Select value={operatorId} onChange={(e) => { setOperatorId(e.target.value); setBatchCode('') }}>
            <option value="">Chọn hộ nuôi</option>
            {operators.map((o) => <option key={o.operatorId} value={o.operatorId}>{o.legalName}</option>)}
          </Select>
        </Field>
      </div>

      {deviceType === 'Camera' && (
        <Field label="Mã hộp" required>
          <Input value={slotCode} maxLength={30} onChange={(e) => setSlotCode(e.target.value)} />
        </Field>
      )}
      {deviceType === 'RailCamera' && (
        <Field label="Mã dàn" required hint="Dạng R01 là kệ số 1." error={rackCode && !RACK.test(rack) ? 'Mã dàn gồm chữ R và hai chữ số.' : undefined}>
          <Input className="op-mono" value={rackCode} maxLength={3} onChange={(e) => setRackCode(e.target.value)} />
        </Field>
      )}
      {deviceType === 'WaterSensor' && (
        <Field label="Lô đang lưu nuôi" required hint={!operatorId ? 'Chọn hộ nuôi trước.' : farmBatches.length === 0 ? 'Hộ nuôi này chưa có Lô lưu nuôi.' : undefined}>
          <Select value={batchCode} disabled={!operatorId || farmBatches.length === 0} onChange={(e) => setBatchCode(e.target.value)}>
            <option value="">Chọn Lô</option>
            {farmBatches.map((b) => <option key={b.batch.batchCode} value={b.batch.batchCode}>{b.batch.batchCode} · {b.batch.title}</option>)}
          </Select>
        </Field>
      )}
      {deviceType === 'Station' && (
        <div className="op-form__row">
          <Field label="Đối tác của chủ hộ nuôi" required>
            <Select value={partyId} onChange={(e) => { setPartyId(e.target.value); setSiteId('') }}>
              <option value="">Chọn đối tác</option>
              {(parties.data?.items ?? []).map((p) => <option key={p.partyId} value={p.partyId}>{p.legalName} · {p.partyCode}</option>)}
            </Select>
          </Field>
          <Field label="Địa điểm đặt trạm" required hint={partyId && !party.isPending && sites.length === 0 ? 'Đối tác này chưa có trạm hay trại.' : undefined}>
            <Select value={siteId} disabled={!partyId || sites.length === 0} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Chọn địa điểm</option>
              {sites.map((s) => <option key={s.siteId} value={s.siteId}>{s.name} · {label('siteType', s.siteType)}</option>)}
            </Select>
          </Field>
        </div>
      )}

      <OpMore label="Tuỳ chọn thêm">
        <div className="op-form__row">
          <Field label="Nguồn dữ liệu">
            <Select value={source} onChange={(e) => setSource(e.target.value as 'Real' | 'Simulated')}>
              <option value="Real">Thiết bị thật</option>
              <option value="Simulated">Giả lập</option>
            </Select>
          </Field>
          <Field label="Chu kỳ hiệu chuẩn" error={daysOk ? undefined : 'Từ 1 đến 365 ngày.'}>
            <NumberInput value={calibrationDays} onChange={setCalibrationDays} unit="ngày" />
          </Field>
          {deviceType !== 'WaterSensor' && (
            <Field label="Độ cao camera" error={heightOk ? undefined : 'Từ 50 đến 2.000 mm.'}>
              <NumberInput value={cameraHeight} onChange={setCameraHeight} unit="mm" />
            </Field>
          )}
        </div>
      </OpMore>
    </OpConfirm>
  )
}
