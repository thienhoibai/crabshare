import { useSearchParams } from 'react-router'
import { Building2, Users } from 'lucide-react'
import { useAuthStore } from '../../shared/auth/authStore'
import AdminLayout from './AdminLayout'
import AdminLegacyUsers from './AdminLegacyUsers'
import AdminOperators from './AdminOperators'

export default function AdminUsers() {
  const [params, setParams] = useSearchParams()
  const isAdmin = useAuthStore(s => s.user?.roles.includes('PlatformAdmin') ?? false)
  const tab = isAdmin && params.get('tab') !== 'users' ? 'operators' : 'users'
  return <AdminLayout activeTab="users">
    <header className="mb-6"><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Quản lý người dùng & hộ nuôi</h1><p className="mt-1 text-sm text-slate-500">Quản lý hồ sơ định danh và xét duyệt hoạt động hộ nuôi trên nền tảng.</p></header>
    <div className="mb-6 flex gap-2 border-b border-slate-200" aria-label="Chọn danh sách">
      {(isAdmin ? [{ id: 'operators', label: 'Hộ nuôi', icon: Building2 }, { id: 'users', label: 'Người dùng & eKYC', icon: Users }] : [{ id: 'users', label: 'Người dùng & eKYC', icon: Users }]).map(item => {
        const Icon = item.icon
        return <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setParams({ tab: item.id })}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold ${tab === item.id ? 'border-red-600 text-red-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}><Icon size={17} />{item.label}</button>
      })}
    </div>
    {tab === 'operators' ? <AdminOperators /> : <AdminLegacyUsers />}
  </AdminLayout>
}
