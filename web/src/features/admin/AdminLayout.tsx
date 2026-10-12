import { useState } from 'react';
import { LayoutDashboard, Users, FolderKanban, Wallet, LogOut, Menu, X, ShieldAlert, AlertTriangle, MessageSquareWarning, Settings, Store } from 'lucide-react';

export default function AdminLayout({ children, activeTab }: { children: React.ReactNode, activeTab: string }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Tổng quan', path: '/admin' },
    { id: 'users', icon: Users, label: 'Quản lý Người dùng', path: '/admin/users' },
    { id: 'batches', icon: FolderKanban, label: 'Kiểm duyệt Dự án', path: '/admin/batches' },
    { id: 'storefront', icon: Store, label: 'Duyệt Lên Kệ (Store)', path: '/admin/storefront' },
    { id: 'finance', icon: Wallet, label: 'Đối soát & Tài chính', path: '/admin/finance' },
    { id: 'alerts', icon: AlertTriangle, label: 'Cảnh báo', path: '/admin/alerts' },
    { id: 'disputes', icon: MessageSquareWarning, label: 'Xử lý Khiếu nại', path: '/admin/disputes' },
    { id: 'settings', icon: Settings, label: 'Cài đặt Hệ thống', path: '/admin/settings' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-[#0f172a] text-slate-300 border-r border-slate-800 fixed h-full z-20">
        <div className="p-5 flex items-center gap-3 border-b border-slate-800 bg-[#020617]">
          <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center text-white font-bold">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-white text-lg tracking-wider">CRABSHARE</h1>
            <p className="text-[10px] text-red-400 font-bold tracking-widest uppercase">Platform Admin</p>
          </div>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1">
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <a key={item.id} href={item.path} className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-red-600 text-white shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}>
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {item.label}
              </a>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-slate-800">
          <button onClick={() => window.location.href = '/'} className="flex items-center gap-3 w-full px-3 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <LogOut className="w-5 h-5" /> Đăng xuất
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 w-full h-16 bg-[#0f172a] border-b border-slate-800 flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-red-500" />
          <span className="font-extrabold text-white text-lg tracking-wider">ADMIN</span>
        </div>
        <button onClick={() => setMobileMenuOpen(true)} className="text-slate-300">
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)}></div>
          <div className="w-64 bg-[#0f172a] h-full relative flex flex-col animate-in slide-in-from-left duration-200">
            <div className="p-4 flex justify-between items-center border-b border-slate-800">
              <span className="font-extrabold text-white tracking-wider">MENU ADMIN</span>
              <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-white"><X className="w-6 h-6"/></button>
            </div>
            <nav className="flex-1 py-4 px-3 space-y-2">
              {menuItems.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <a key={item.id} href={item.path} className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
                    <Icon className="w-5 h-5" /> {item.label}
                  </a>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-800">
              <button onClick={() => window.location.href = '/'} className="flex items-center gap-3 text-slate-300 py-2"><LogOut className="w-5 h-5" /> Đăng xuất</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 pt-20 md:p-8 min-w-0">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
