/* /operator/devices — Thiết bị của trại (GET /api/operators/me/devices): trạm đo và phân hạng, camera chạy dàn, cảm biến nước.
   Admin đăng ký thiết bị và cấp khoá; người nuôi theo dõi kết nối, ra lệnh cho camera chạy dàn và ghi hiệu chuẩn tay (BR-225).
   Trạm đo quá hạn hiệu chuẩn thì bản tin đo bị máy chủ từ chối. */
import { Cpu } from 'lucide-react'
import type { DeviceResponse } from '../../shared/api/api.gen'
import { OpEmpty, OpFacts, OpHeading, OpNote, OpPanel, QueryView, useGet } from '../../shared/ui/console'
import DeviceList from './DeviceList'

export default function OperatorDevices() {
  const devices = useGet<DeviceResponse[]>('/api/operators/me/devices', undefined, { refetchInterval: 30_000 })
  return (
    <>
      <OpHeading eyebrow="Vận hành" title="Thiết bị" />
      <QueryView query={devices}>
        {(rows) => {
          if (rows.length === 0) return <OpEmpty title="Trại chưa có thiết bị nào" icon={<Cpu size={30} />}>Admin đăng ký thiết bị cho trại.</OpEmpty>
          const live = rows.filter((d) => d.status !== 'Removed')
          const offline = live.filter((d) => d.status === 'Offline').length
          const due = live.filter((d) => d.calibrationDue).length
          return (
            <>
              <OpFacts items={[
                { label: 'Đang kết nối', value: live.length - offline, tone: 'ok' },
                { label: 'Mất kết nối', value: offline, tone: offline ? 'danger' : undefined },
                { label: 'Quá hạn hiệu chuẩn', value: due, tone: due ? 'warn' : undefined },
              ]} />
              {due > 0 && <OpNote tone="danger">Có thiết bị quá hạn hiệu chuẩn. Trạm đo quá hạn sẽ không nhận số đo.</OpNote>}
              <OpPanel>
                <DeviceList devices={rows} />
              </OpPanel>
            </>
          )
        }}
      </QueryView>
    </>
  )
}
