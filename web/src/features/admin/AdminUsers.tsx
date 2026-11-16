/* /admin/users — Người dùng và eKYC: hai tab trên cùng một trang.
   Tab "Người dùng": GET /api/admin/users. Tab "Kiểm tra eKYC": GET /api/admin/kyc-checks và duyệt ngoại lệ (UC06). */
import { OpHeading, OpTabs } from '../../shared/ui/console'
import { useUrlFilters } from './adminPartA'
import AdminKycQueue from './AdminKycQueue'
import AdminUserList from './AdminUserList'

const TABS = [
  { key: 'users', label: 'Người dùng' },
  { key: 'kyc', label: 'Kiểm tra eKYC' },
] as const

export default function AdminUsers() {
  const filters = useUrlFilters()
  const tab = filters.get('tab') === 'kyc' ? 'kyc' : 'users'
  return (
    <>
      <OpHeading eyebrow="Đối tác và tài khoản" title="Người dùng và eKYC" />
      <OpTabs items={TABS} value={tab} onChange={(key) => filters.set({ tab: key === 'users' ? null : key, role: null, status: null, q: null, result: null, checkType: null })} />
      {tab === 'kyc' ? <AdminKycQueue /> : <AdminUserList />}
    </>
  )
}
