/* /admin/batches/:code — Trang xét duyệt và theo dõi một Lô. GET /api/admin/batches/{code}.
   Đầu trang là quyết định cần làm và bốn con số tóm tắt (AdminBatchReview). Chi tiết chia tab:
   điều khoản, chào giá, chi phí; Lô đã duyệt có thêm tiến độ, kiểm phẩm, hợp đồng góp vốn (lô P). */
import { useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { OpBack, OpHeading, OpNote, OpTabs, QueryView, StatusBadge, label, useGet, type TabItem } from '../../shared/ui/console'
import { useUrlFilters, type AdminBatch } from './adminPartA'
import AdminBatchContracts from './AdminBatchContracts'
import AdminBatchCostEditor from './AdminBatchCostEditor'
import AdminBatchOps from './AdminBatchOps'
import AdminBatchQc from './AdminBatchQc'
import AdminBatchReview from './AdminBatchReview'
import AdminBatchTerms, { BatchCostPanel, BatchOffersPanel } from './AdminBatchTerms'

type TabKey = 'terms' | 'offers' | 'cost' | 'ops' | 'qc' | 'contracts'

export default function AdminBatchDetail() {
  const { code = '' } = useParams()
  const filters = useUrlFilters()
  const detail = useGet<AdminBatch>(`/api/admin/batches/${encodeURIComponent(code)}`)

  return (
    <QueryView query={detail}>
      {(d) => {
        const b = d.batch
        const approved = d.approvedAt !== null
        const editable = b.canEdit && b.batchMode !== 'P'
        const tabs: TabItem<TabKey>[] = [
          ...(approved ? [{ key: 'ops' as const, label: 'Tiến độ' }, { key: 'qc' as const, label: 'Kiểm phẩm' }] : []),
          { key: 'terms', label: 'Điều khoản' },
          { key: 'offers', label: 'Chào giá', count: b.offers.length },
          { key: 'cost', label: 'Chi phí' },
          ...(approved && b.batchMode === 'P' ? [{ key: 'contracts' as const, label: 'Hợp đồng' }] : []),
        ]
        // Lô nháp của Quản trị chưa có chi phí thì mở sẵn tab chi phí; Lô đã duyệt mở tab tiến độ.
        const fallback: TabKey = approved ? 'ops' : editable && b.costPlan === null ? 'cost' : 'terms'
        const tab = tabs.find((t) => t.key === filters.get('tab'))?.key ?? fallback
        const reason = b.cancelReason ?? b.rejectionReason

        return (
          <>
            <OpHeading
              crumb={<OpBack href="/admin/batches"><ArrowLeft size={16} /> Duyệt và tạo Lô</OpBack>}
              eyebrow={`${b.batchCode} · ${label('crabType', b.crabType)} · ${d.operatorName}`}
              title={b.title}
              action={
                <>
                  <StatusBadge kind="batchMode" value={b.batchMode} />
                  <StatusBadge kind="batch" value={b.status} />
                </>
              }
            />
            {reason && <OpNote tone="danger">{reason}</OpNote>}

            <AdminBatchReview detail={d} />

            <OpTabs items={tabs} value={tab} onChange={(key) => filters.set({ tab: key })} label="Các mục của Lô" />
            {tab === 'terms' && <AdminBatchTerms detail={d} />}
            {tab === 'offers' && <BatchOffersPanel batch={b} />}
            {tab === 'cost' && (
              <>
                <BatchCostPanel detail={d} />
                {editable && <AdminBatchCostEditor key={b.costPlan?.versionNo ?? 0} batch={b} />}
              </>
            )}
            {tab === 'ops' && <AdminBatchOps code={b.batchCode} />}
            {tab === 'qc' && <AdminBatchQc batch={b} />}
            {tab === 'contracts' && <AdminBatchContracts code={b.batchCode} />}
          </>
        )
      }}
    </QueryView>
  )
}
