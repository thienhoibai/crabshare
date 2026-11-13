/* Tab "Kiểm tra eKYC" của /admin/users: hàng các lần kiểm tra danh tính. GET /api/admin/kyc-checks.
   Backend mặc định lọc kết quả "Không đạt"; muốn xem mọi kết quả phải gửi result rỗng (result=). */
import type { PagedResultOfAdminKycResponse } from '../../shared/api/api.gen'
import { OpPanel, QueryView, Select, options, useGet } from '../../shared/ui/console'
import { KYC_TYPE_OPTIONS, Pager, useUrlFilters } from './adminPartA'
import AdminKycTable from './AdminKycTable'

export default function AdminKycQueue() {
  const filters = useUrlFilters()
  const result = filters.get('result') || 'Failed'
  const checkType = filters.get('checkType')
  const all = result === 'all'
  const list = useGet<PagedResultOfAdminKycResponse>(
    all ? '/api/admin/kyc-checks?result=' : '/api/admin/kyc-checks',
    { result: all ? undefined : result, checkType, page: filters.page, pageSize: 20 },
  )

  return (
    <>
      <div className="op-toolbar">
        <Select aria-label="Kết quả" value={result} onChange={(e) => filters.set({ result: e.target.value === 'Failed' ? null : e.target.value })}>
          {options('kyc').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          <option value="all">Mọi kết quả</option>
        </Select>
        <Select aria-label="Loại kiểm tra" value={checkType} onChange={(e) => filters.set({ checkType: e.target.value })}>
          <option value="">Mọi loại kiểm tra</option>
          {KYC_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>

      <OpPanel>
        <QueryView query={list}>
          {(page) => (
            <>
              <AdminKycTable rows={page.items} empty="Không có lần kiểm tra nào khớp" />
              <Pager page={page.page} pageSize={page.pageSize} total={page.total} onPage={(n) => filters.set({ page: n })} />
            </>
          )}
        </QueryView>
      </OpPanel>
    </>
  )
}
