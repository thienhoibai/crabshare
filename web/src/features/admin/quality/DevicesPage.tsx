/* /admin/devices — Thiết bị IoT của các hộ nuôi (GET /api/admin/devices): đăng ký, đổi khoá, gỡ. Khoá thiết bị chỉ hiện một lần (BR-116, BR-230).
   Bảng chỉ có thông tin cần nhìn hằng ngày; chi tiết kỹ thuật và hai thao tác ít dùng nằm trong hộp "Quản lý" của từng thiết bị. */
import { useState } from 'react'
import { KeyRound, Plus, Trash2 } from 'lucide-react'
import type { DeviceRegisteredResponse, DeviceResponse, PagedResultOfAdminOperatorResponse } from '../../../shared/api/api.gen'
import {
  OpBadge, OpBtn, OpConfirm, OpFacts, OpHeading, OpKv, OpModal, OpNote, OpPanel, OpTable, QueryView, Select, StatusBadge,
  formatDateTime, label, options, useGet, useSend,
} from '../../../shared/ui/console'
import DeviceKeyDialog from './DeviceKeyDialog'
import DeviceRegisterDialog from './DeviceRegisterDialog'
import { Cell, extraLabel } from './shared'

type IssuedKey = { deviceCode: string; deviceKey: string; rotated: boolean }

function RotateKeyDialog({ device, onClose, onIssued }: { device: DeviceResponse; onClose: () => void; onIssued: (key: IssuedKey) => void }) {
  const rotate = useSend<{ deviceKey: string }, void>('post', `/api/admin/devices/${encodeURIComponent(device.deviceCode)}/rotate-key`, {
    quietError: true,
    onSuccess: (res) => onIssued({ deviceCode: device.deviceCode, deviceKey: res.deviceKey, rotated: true }),
  })
  return (
    <OpConfirm title={`Đổi khoá ${device.deviceCode}`} confirmLabel="Đổi khoá" pending={rotate.isPending} error={rotate.error} onClose={onClose} onConfirm={() => rotate.mutate()}>
      <OpNote tone="danger">Khoá cũ hết hiệu lực ngay. Thiết bị ngừng gửi được cho tới khi nạp khoá mới.</OpNote>
    </OpConfirm>
  )
}

function RemoveDialog({ device, onClose }: { device: DeviceResponse; onClose: () => void }) {
  const remove = useSend<DeviceResponse, void>('post', `/api/admin/devices/${encodeURIComponent(device.deviceCode)}/remove`, {
    quietError: true,
    success: `Đã gỡ thiết bị ${device.deviceCode}.`,
    onSuccess: onClose,
  })
  return (
    <OpConfirm title={`Gỡ thiết bị ${device.deviceCode}`} confirmLabel="Gỡ thiết bị" variant="danger" pending={remove.isPending} error={remove.error} onClose={onClose} onConfirm={() => remove.mutate()}>
      <OpNote tone="danger">Thiết bị bị từ chối từ lúc gỡ. Mã này không đăng ký lại được.</OpNote>
    </OpConfirm>
  )
}

/** Chi tiết kỹ thuật của một thiết bị và hai thao tác ít dùng: đổi khoá, gỡ. */
function ManageDialog({ device, farm, onClose, onRotate, onRemove }: {
  device: DeviceResponse
  farm: string
  onClose: () => void
  onRotate: () => void
  onRemove: () => void
}) {
  return (
    <OpModal title={device.deviceCode} sub={`${label('deviceType', device.deviceType)} · ${farm}`} onClose={onClose}>
      <OpKv items={[
        { label: 'Phạm vi', value: `${extraLabel('scopeType', device.scopeType)} ${device.scope}` },
        { label: 'Nguồn dữ liệu', value: extraLabel('deviceSource', device.source) },
        { label: 'Phần mềm', value: device.firmwareVersion },
        { label: 'Bản tin chờ gửi', value: device.queueLength },
        { label: 'Chu kỳ hiệu chuẩn', value: `${device.calibrationPeriodDays} ngày` },
        { label: 'Khoá bắt đầu bằng', value: <span className="op-mono">{device.keyPrefix}</span> },
      ]} />
      {device.status !== 'Removed' && (
        <div className="op-modal__foot">
          <OpBtn variant="ghost" onClick={onRotate}><KeyRound size={16} /> Đổi khoá</OpBtn>
          <OpBtn variant="danger" onClick={onRemove}><Trash2 size={16} /> Gỡ thiết bị</OpBtn>
        </div>
      )}
    </OpModal>
  )
}

export default function DevicesPage() {
  const [operatorId, setOperatorId] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [registering, setRegistering] = useState(false)
  const [managing, setManaging] = useState<DeviceResponse | null>(null)
  const [rotating, setRotating] = useState<DeviceResponse | null>(null)
  const [removing, setRemoving] = useState<DeviceResponse | null>(null)
  const [issued, setIssued] = useState<IssuedKey | null>(null)

  const devices = useGet<DeviceResponse[]>('/api/admin/devices', { operatorId })
  const operators = useGet<PagedResultOfAdminOperatorResponse>('/api/admin/operators', { PageSize: 100 })
  const farms = operators.data?.items ?? []
  const farmName = (id: number) => farms.find((o) => o.operatorId === id)?.legalName ?? `Hộ nuôi số ${id}`

  const onRegistered = (res: DeviceRegisteredResponse) => {
    setRegistering(false)
    setIssued({ deviceCode: res.device.deviceCode, deviceKey: res.deviceKey, rotated: false })
  }

  return (
    <>
      <OpHeading
        eyebrow="Chất lượng"
        title="Thiết bị"
        action={<OpBtn onClick={() => setRegistering(true)}><Plus size={17} /> Đăng ký thiết bị</OpBtn>}
      />
      <div className="op-toolbar">
        <Select aria-label="Lọc theo hộ nuôi" value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
          <option value="">Mọi hộ nuôi</option>
          {farms.map((o) => <option key={o.operatorId} value={o.operatorId}>{o.legalName}</option>)}
        </Select>
        <Select aria-label="Lọc theo loại thiết bị" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Mọi loại</option>
          {options('deviceType').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select aria-label="Lọc theo trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Mọi trạng thái</option>
          {options('device').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>
      <QueryView query={devices}>
        {(list) => {
          const rows = list.filter((d) => (!type || d.deviceType === type) && (!status || d.status === status))
          const inUse = list.filter((d) => d.status !== 'Removed')
          const offline = list.filter((d) => d.status === 'Offline').length
          const due = inUse.filter((d) => d.calibrationDue).length
          return (
            <>
              <OpFacts items={[
                { label: 'Đang dùng', value: inUse.length },
                { label: 'Đang hoạt động', value: list.filter((d) => d.status === 'Active').length, tone: 'ok' },
                { label: 'Mất kết nối', value: offline, tone: offline ? 'danger' : undefined },
                { label: 'Đến hạn hiệu chuẩn', value: due, tone: due ? 'warn' : undefined },
              ]} />
              <OpPanel>
                <OpTable
                  rows={rows}
                  rowKey={(d) => d.deviceCode}
                  empty={list.length === 0 ? 'Chưa có thiết bị nào' : 'Không có thiết bị nào khớp bộ lọc'}
                  columns={[
                    { key: 'code', header: 'Thiết bị', cell: (d) => <Cell main={<b className="op-mono">{d.deviceCode}</b>} sub={`${label('deviceType', d.deviceType)} · ${farmName(d.operatorId)}`} /> },
                    { key: 'scope', header: 'Phạm vi', cell: (d) => `${extraLabel('scopeType', d.scopeType)} ${d.scope}` },
                    {
                      key: 'status', header: 'Trạng thái',
                      cell: (d) => (
                        <span className="op-inline">
                          <StatusBadge kind="device" value={d.status} />
                          {d.calibrationDue && d.status !== 'Removed' && <OpBadge tone="warn">Đến hạn hiệu chuẩn</OpBadge>}
                        </span>
                      ),
                    },
                    { key: 'seen', header: 'Tín hiệu gần nhất', cell: (d) => (d.lastSeenAt ? formatDateTime(d.lastSeenAt) : 'Chưa có') },
                    { key: 'calibration', header: 'Hiệu chuẩn gần nhất', cell: (d) => (d.lastCalibratedAt ? formatDateTime(d.lastCalibratedAt) : 'Chưa có') },
                    { key: 'actions', header: '', cell: (d) => <OpBtn variant="ghost" sm onClick={() => setManaging(d)}>Quản lý</OpBtn> },
                  ]}
                />
              </OpPanel>
            </>
          )
        }}
      </QueryView>

      {registering && <DeviceRegisterDialog operators={farms.filter((o) => o.status === 'Approved')} onClose={() => setRegistering(false)} onRegistered={onRegistered} />}
      {managing && (
        <ManageDialog
          device={managing}
          farm={farmName(managing.operatorId)}
          onClose={() => setManaging(null)}
          onRotate={() => { setRotating(managing); setManaging(null) }}
          onRemove={() => { setRemoving(managing); setManaging(null) }}
        />
      )}
      {rotating && <RotateKeyDialog device={rotating} onClose={() => setRotating(null)} onIssued={(key) => { setRotating(null); setIssued(key) }} />}
      {removing && <RemoveDialog device={removing} onClose={() => setRemoving(null)} />}
      {issued && <DeviceKeyDialog {...issued} onClose={() => setIssued(null)} />}
    </>
  )
}
