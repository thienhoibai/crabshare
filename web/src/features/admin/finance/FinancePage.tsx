/* /admin/finance — Lệnh chi và đối soát: tab "Lệnh chi" và tab "Tiền vào chưa khớp". Bộ lọc nằm trên đường dẫn
   (?tab=unmatched, ?type=Refund&batch=CS-…) để các trang khác dẫn thẳng tới đúng danh sách. */
import { useSearchParams } from 'react-router'
import type { UnmatchedTransactionResponse } from '../../../shared/api/api.gen'
import { OpHeading, OpTabs, useGet } from '../../../shared/ui/console'
import InstructionsTab from './InstructionsTab'
import UnmatchedTab from './UnmatchedTab'

type Tab = 'instructions' | 'unmatched'

export default function FinancePage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'unmatched' ? 'unmatched' : 'instructions'
  const unmatched = useGet<UnmatchedTransactionResponse[]>('/api/admin/payments/unmatched')

  return (
    <>
      <OpHeading eyebrow="Tiền" title="Lệnh chi và đối soát" />
      <OpTabs
        value={tab}
        onChange={(key) => setParams(key === 'unmatched' ? { tab: 'unmatched' } : {})}
        items={[
          { key: 'instructions', label: 'Lệnh chi' },
          { key: 'unmatched', label: 'Tiền vào chưa khớp', count: unmatched.data?.length },
        ]}
      />
      {tab === 'instructions' ? <InstructionsTab /> : <UnmatchedTab query={unmatched} />}
    </>
  )
}
