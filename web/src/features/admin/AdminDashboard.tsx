import { Users, LayoutGrid, DollarSign, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AdminLayout from './AdminLayout';

const mockData = [
  { month: 'T5', revenue: 120 },
  { month: 'T6', revenue: 210 },
  { month: 'T7', revenue: 180 },
  { month: 'T8', revenue: 320 },
  { month: 'T9', revenue: 450 },
  { month: 'T10', revenue: 390 },
];

export default function AdminDashboard() {
  return (
    <AdminLayout activeTab="dashboard">
      <header className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Tổng quan Nền tảng</h1>
        <p className="text-sm text-slate-500 mt-1">Giám sát hoạt động và dòng tiền hệ thống CrabShare.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tổng Vốn Huy Động</p>
              <h3 className="text-2xl font-extrabold text-slate-900">4.25 <span className="text-sm font-medium text-slate-500">Tỷ ₫</span></h3>
            </div>
            <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Doanh thu Platform</p>
              <h3 className="text-2xl font-extrabold text-slate-900">850 <span className="text-sm font-medium text-slate-500">Tr ₫</span></h3>
            </div>
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
              <Activity className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Dự án / Lô nuôi</p>
              <h3 className="text-2xl font-extrabold text-slate-900">12 <span className="text-sm font-medium text-slate-500">đang chạy</span></h3>
            </div>
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
              <LayoutGrid className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tổng User</p>
              <h3 className="text-2xl font-extrabold text-slate-900">1,204</h3>
            </div>
            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-6">Tăng trưởng Doanh thu Platform (Triệu VNĐ)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="revenue" fill="#dc2626" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-6">Cảnh báo hệ thống</h3>
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg flex gap-3 items-start">
              <div className="w-2 h-2 bg-amber-500 rounded-full mt-1.5 shrink-0"></div>
              <div>
                <p className="text-sm font-bold text-amber-900">3 User chờ duyệt eKYC</p>
                <p className="text-xs text-amber-700 mt-1">Cần xác minh danh tính trước khi cho phép đầu tư.</p>
                <a href="/admin/users" className="text-xs font-bold text-amber-600 mt-2 inline-block hover:underline">Xử lý ngay &rarr;</a>
              </div>
            </div>
            
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex gap-3 items-start">
              <div className="w-2 h-2 bg-red-500 rounded-full mt-1.5 shrink-0"></div>
              <div>
                <p className="text-sm font-bold text-red-900">Lô 11A - Nhiệt độ nước vượt ngưỡng</p>
                <p className="text-xs text-red-700 mt-1">Nhật ký trại Cần Giờ ghi nhiệt độ nước 35°C, vượt ngưỡng. Trạng thái nguy hiểm.</p>
                <a href="/admin/batches" className="text-xs font-bold text-red-600 mt-2 inline-block hover:underline">Xem lô nuôi &rarr;</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
