/* /truy-xuat/:traceCode — Trang mở khi quét QR trên đơn (GET /api/trace/orders/{traceCode}, BR-162, BR-163).
   QR gắn theo đơn và theo Lô: chỉ có Lô, trại, vùng xuất xứ, ngày thu của lô nguồn và quy cách đã duyệt.
   Không có thông tin cá nhân, không có mã từng con cua. */
import { useParams } from 'react-router'
import { MapPin, QrCode, Sprout } from 'lucide-react'
import type { OrderTraceResponse } from '../../shared/api/api.gen'
import SiteShell from '../../shared/layout/SiteShell'
import { OpFacts, OpHeading, OpIcon, OpNote, OpPanel, OpTable, QueryView, crabImg, formatDate, formatDateTime, label, useGet } from '../../shared/ui/console'

export default function OrderTracePage() {
  const { traceCode = '' } = useParams()
  const trace = useGet<OrderTraceResponse>(`/api/trace/orders/${encodeURIComponent(traceCode)}`, undefined, { retry: false })
  return (
    <SiteShell narrow>
      <OpHeading eyebrow="Truy xuất nguồn gốc" title="Đơn hàng này đến từ đâu" description={`Mã truy xuất ${traceCode}`} />
      <QueryView query={trace}>
        {(t) => (
          <>
            <div className="op-cover">
              <img src={crabImg(t.crabType, 1200)} alt="" />
              <div className="op-cover__text">
                <small>{t.batchCode} · {label('crabType', t.crabType)}</small>
                <b>{t.batchTitle}</b>
              </div>
            </div>

            <OpPanel>
              <div className="op-tile">
                <OpIcon tone="ok"><Sprout size={20} /></OpIcon>
                <span><b>{t.farmName}</b><small>Trại thực hiện Lô {t.batchCode}</small></span>
              </div>
              <OpFacts items={[
                { label: 'Số đợt đã giao', value: t.deliveries.length },
                { label: 'Số quy cách', value: t.lines.length },
                { label: 'Tổng số con', value: t.lines.reduce((sum, l) => sum + l.crabs, 0) },
              ]} />
            </OpPanel>

            <OpPanel title="Quy cách trong đơn" subtitle="Hạng do Nhân viên kiểm phẩm duyệt sau khi đo tại trạm.">
              <OpTable
                rows={t.lines}
                rowKey={(l) => l.specCode}
                columns={[
                  { key: 'spec', header: 'Quy cách', cell: (l) => <><b>{l.specName}</b><br /><small className="op-mono rd-muted">{l.specCode}</small></> },
                  { key: 'crabs', header: 'Số con', num: true, cell: (l) => l.crabs },
                ]}
              />
            </OpPanel>

            {t.sourceLots.length > 0 && (
              <OpPanel title="Nguồn cua">
                <div className="op-stack" style={{ gap: 8 }}>
                  {t.sourceLots.map((s, i) => (
                    <div key={i} className="op-tile">
                      <OpIcon tone="info"><MapPin size={20} /></OpIcon>
                      <span><b>{s.originRegion ?? 'Chưa khai vùng xuất xứ'}</b><small>{s.species}{s.harvestedOn ? ` · thu ngày ${formatDate(s.harvestedOn)}` : ''}</small></span>
                    </div>
                  ))}
                </div>
              </OpPanel>
            )}

            {t.deliveries.length > 0 && (
              <OpPanel title="Các đợt giao">
                <ul className="op-feed">{t.deliveries.map((d) => <li key={d}><b>{formatDateTime(d) || d}</b></li>)}</ul>
              </OpPanel>
            )}

            <OpNote tone="info"><QrCode size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {t.standardNote.replace(/\s*\((BR|UC|TL)-[^)]*\)/g, '')}</OpNote>
          </>
        )}
      </QueryView>
    </SiteShell>
  )
}
