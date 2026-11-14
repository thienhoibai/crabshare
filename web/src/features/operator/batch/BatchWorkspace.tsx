/* /operator/batches/:code/:tab? — Trang làm việc của một Lô. Phần đầu trang và hàng tab ở đây;
   nội dung từng tab khai báo trong tabsA.tsx và tabsB.tsx (mỗi tab là một component nhận { code, batch }). */
import { Suspense } from 'react'
import { useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import type { BatchResponse } from '../../../shared/api/api.gen'
import { OpBack, OpBadge, OpEmpty, OpHeading, OpLoading, QueryView, StatusBadge, label, useGet } from '../../../shared/ui/console'
import { tabsA } from './tabsA'
import { tabsB } from './tabsB'

const ALL_TABS = [...tabsA, ...tabsB]

export default function BatchWorkspace() {
  const { code = '', tab } = useParams()
  const batch = useGet<BatchResponse>(`/api/operators/me/batches/${encodeURIComponent(code)}`)
  const base = `/operator/batches/${encodeURIComponent(code)}`

  return (
    <QueryView query={batch}>
      {(b) => {
        const tabs = ALL_TABS.filter((t) => !t.show || t.show(b))
        const current = tabs.find((t) => t.key === tab) ?? tabs[0]
        return (
          <>
            <OpHeading
              crumb={<OpBack href="/operator/batches"><ArrowLeft size={16} /> Lô của tôi</OpBack>}
              eyebrow={`${b.batchCode} · ${label('crabType', b.crabType)}`}
              title={b.title}
              action={
                <>
                  <OpBadge tone={b.batchMode === 'P' ? 'gold' : 'info'}>{label('batchMode', b.batchMode)}</OpBadge>
                  <StatusBadge kind="batch" value={b.status} />
                </>
              }
            />
            {tabs.length > 0 && (
              <nav className="op-tabs" aria-label="Các mục của Lô">
                {tabs.map((t) => (
                  <a key={t.key} href={`${base}/${t.key}`} className={t === current ? 'is-on' : ''} aria-current={t === current ? 'page' : undefined}>{t.label}</a>
                ))}
              </nav>
            )}
            {current
              ? <Suspense fallback={<OpLoading />}><current.Component code={b.batchCode} batch={b} /></Suspense>
              : <OpEmpty title="Lô này chưa có mục nào để làm việc" />}
          </>
        )
      }}
    </QueryView>
  )
}
