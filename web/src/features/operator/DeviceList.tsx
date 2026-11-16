/* Danh sách thiết bị của trại và hai thao tác của người nuôi: ra lệnh cho camera chạy dàn (POST /api/devices/{code}/commands)
   và ghi hiệu chuẩn tay vào nhật ký kiểm toán (POST /api/devices/{code}/calibrations, BR-225: cân đạt khi sai số không quá 0,5 g).
   Dùng ở trang Thiết bị và tab Thiết bị của Lô. */
import { useState } from 'react'
import { Camera, Cpu, Droplets, Radio, Wrench } from 'lucide-react'
import type { DeviceCommandRequest, DeviceCommandResponse, DeviceResponse, ManualCalibrationRequest } from '../../shared/api/api.gen'
import {
  DecimalInput, Field, Input, OpBadge, OpBtn, OpConfirm, OpIcon, OpMore, OpNote, OpTable, RadioCards, Select, StatusBadge, TextArea, formatDateTime, label,
  useSend,
} from '../../shared/ui/console'
import { calibrationKinds, scopeTypeLabel } from './opA'

type Command = 'ScanRack' | 'ScanBox' | 'Park' | 'Calibrate'
const COMMANDS: { value: Command; label: string }[] = [
  { value: 'ScanRack', label: 'Quét cả dàn' },
  { value: 'ScanBox', label: 'Quét một hộp' },
  { value: 'Park', label: 'Về chỗ đỗ' },
  { value: 'Calibrate', label: 'Hiệu chuẩn vị trí' },
]

const ICONS: Record<string, typeof Cpu> = { Station: Cpu, RailCamera: Camera, WaterSensor: Droplets, Camera }
/** Loại hiệu chuẩn hợp với từng loại thiết bị, để gợi ý lựa chọn đầu tiên. */
const DEFAULT_KIND: Record<string, string> = { Station: 'scale', RailCamera: 'position', WaterSensor: 'ph', Camera: 'camera' }

function CommandDialog({ device, boxCodes, onClose }: { device: DeviceResponse; boxCodes?: string[]; onClose: () => void }) {
  const [commandType, setCommandType] = useState<Command>('ScanRack')
  const [boxCode, setBoxCode] = useState('')
  const [reason, setReason] = useState('')
  const send = useSend<DeviceCommandResponse, DeviceCommandRequest>('post', `/api/devices/${encodeURIComponent(device.deviceCode)}/commands`, {
    success: (c) => `Đã gửi lệnh “${label('commandType', c.commandType)}”.`, onSuccess: onClose, quietError: true,
  })
  return (
    <OpConfirm
      title="Ra lệnh cho camera"
      sub={`${device.deviceCode} · dàn ${device.scope}`}
      confirmLabel="Gửi lệnh"
      pending={send.isPending}
      error={send.error}
      disabled={commandType === 'ScanBox' && !boxCode.trim()}
      onClose={onClose}
      onConfirm={() => send.mutate({ commandType, boxCode: commandType === 'ScanBox' ? boxCode.trim() : null, reason: reason.trim() || null })}
    >
      <RadioCards<Command> value={commandType} onChange={setCommandType} options={COMMANDS} />
      {commandType === 'ScanBox' && (
        <Field label="Hộp cần quét" required>
          {boxCodes?.length ? (
            <Select value={boxCode} onChange={(e) => setBoxCode(e.target.value)}>
              <option value="">Chọn hộp</option>
              {boxCodes.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          ) : <Input value={boxCode} maxLength={30} onChange={(e) => setBoxCode(e.target.value)} placeholder="1703" />}
        </Field>
      )}
      {device.status !== 'Active' && <OpNote tone="danger">Camera đang mất kết nối. Lệnh chờ tới khi camera kết nối lại.</OpNote>}
      <OpMore label="Lý do">
        <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Kiểm tra sau cảnh báo" aria-label="Lý do ra lệnh" />
      </OpMore>
    </OpConfirm>
  )
}

function CalibrationDialog({ device, onClose }: { device: DeviceResponse; onClose: () => void }) {
  const [kind, setKind] = useState(DEFAULT_KIND[device.deviceType] ?? 'scale')
  const [performedAt, setPerformedAt] = useState('')
  const [errorG, setErrorG] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const save = useSend<DeviceResponse, ManualCalibrationRequest>('post', `/api/devices/${encodeURIComponent(device.deviceCode)}/calibrations`, {
    success: 'Đã ghi hiệu chuẩn.', onSuccess: onClose, quietError: true,
  })
  const failing = kind === 'scale' && errorG !== null && errorG > 0.5
  return (
    <OpConfirm
      title="Ghi hiệu chuẩn"
      sub={device.deviceCode}
      confirmLabel="Ghi"
      pending={save.isPending}
      error={save.error}
      disabled={kind === 'scale' ? errorG === null : !note.trim()}
      onClose={onClose}
      onConfirm={() => save.mutate({
        kind, performedAt: performedAt ? new Date(performedAt).toISOString() : null, errorG: kind === 'scale' ? errorG : null, note: note.trim() || null,
      })}
    >
      <Field label="Hạng mục" required>
        <Select value={kind} onChange={(e) => setKind(e.target.value)}>
          {calibrationKinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </Select>
      </Field>
      {kind === 'scale' && (
        <Field label="Sai số với quả cân chuẩn" required hint="Đạt khi không quá 0,5 g">
          <DecimalInput unit="g" value={errorG} onChange={setErrorG} />
        </Field>
      )}
      {failing && <OpNote tone="danger">Sai số quá 0,5 g: lần này được ghi là không đạt.</OpNote>}
      <Field label="Cách làm và kết quả" required={kind !== 'scale'}>
        <TextArea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <OpMore label="Làm vào lúc khác">
        <Input type="datetime-local" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} aria-label="Thời điểm hiệu chuẩn" />
      </OpMore>
    </OpConfirm>
  )
}

export default function DeviceList({ devices, boxCodes, empty = 'Trại chưa có thiết bị nào' }: { devices: DeviceResponse[]; boxCodes?: string[]; empty?: string }) {
  const [commanding, setCommanding] = useState<DeviceResponse | null>(null)
  const [calibrating, setCalibrating] = useState<DeviceResponse | null>(null)
  return (
    <>
      <OpTable
        rows={devices}
        rowKey={(d) => d.deviceCode}
        empty={empty}
        columns={[
          {
            key: 'device', header: 'Thiết bị', cell: (d) => {
              const Icon = ICONS[d.deviceType] ?? Cpu
              return (
                <span className="op-inline">
                  <OpIcon tone={d.status === 'Active' ? 'ok' : d.status === 'Offline' ? 'danger' : 'mute'} round><Icon size={18} /></OpIcon>
                  <span>
                    <b>{label('deviceType', d.deviceType)}</b><br />
                    <small className="rd-muted">{d.deviceCode} · {scopeTypeLabel(d.scopeType)} {d.scope}{d.source === 'Simulated' ? ' · giả lập' : ''}</small>
                  </span>
                </span>
              )
            },
          },
          {
            key: 'status', header: 'Kết nối', cell: (d) => (
              <>
                <StatusBadge kind="device" value={d.status} /><br />
                <small className="rd-muted">{formatDateTime(d.lastSeenAt) || 'Chưa có tín hiệu'}{d.queueLength ? ` · ${d.queueLength} bản tin chờ gửi` : ''}</small>
              </>
            ),
          },
          {
            key: 'cal', header: 'Hiệu chuẩn', cell: (d) => (
              d.calibrationDue
                ? <OpBadge tone="danger">Quá hạn {d.calibrationPeriodDays} ngày</OpBadge>
                : <>{formatDateTime(d.lastCalibratedAt) || 'Chưa hiệu chuẩn'}<br /><small className="rd-muted">Mỗi {d.calibrationPeriodDays} ngày</small></>
            ),
          },
          {
            key: 'act', header: '', cell: (d) => d.status === 'Removed' ? null : (
              <span className="op-inline">
                {d.deviceType === 'RailCamera' && <OpBtn variant="ghost" sm onClick={() => setCommanding(d)}><Radio size={14} /> Ra lệnh</OpBtn>}
                <OpBtn variant="ghost" sm onClick={() => setCalibrating(d)}><Wrench size={14} /> Hiệu chuẩn</OpBtn>
              </span>
            ),
          },
        ]}
      />
      {commanding && <CommandDialog device={commanding} boxCodes={boxCodes} onClose={() => setCommanding(null)} />}
      {calibrating && <CalibrationDialog device={calibrating} onClose={() => setCalibrating(null)} />}
    </>
  )
}
