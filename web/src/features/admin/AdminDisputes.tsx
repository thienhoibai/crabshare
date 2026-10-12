import { MessageSquareWarning, Image as ImageIcon, CheckCircle, XCircle } from 'lucide-react';
import AdminLayout from './AdminLayout';

const mockDisputes = [
  { id: 'DSP-992', order: 'ORD-8812', customer: 'Lê Văn Khách', issue: 'Cua bị chết 2 con khi nhận hàng', amount: '850,000 ₫', status: 'pending', date: '27/09/2026' },
];

export default function AdminDisputes() {
  return (
    <AdminLayout activeTab="disputes">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Xử lý Khiếu nại (Disputes)</h1>
        <p className="text-sm text-slate-500 mt-1">Giải quyết tranh chấp giữa Khách mua lẻ (Customer) và Trại nuôi (Operator) trên Storefront.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          {mockDisputes.map(dispute => (
            <div key={dispute.id} className="bg-white p-4 rounded-xl border border-red-200 shadow-sm cursor-pointer hover:border-red-400 transition-colors relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-slate-900">{dispute.id}</span>
                <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">Chờ xử lý</span>
              </div>
              <p className="text-sm text-slate-700 font-medium mb-1">{dispute.issue}</p>
              <div className="text-xs text-slate-500 flex justify-between mt-3 border-t border-slate-100 pt-2">
                <span>Đơn: {dispute.order}</span>
                <span>Giá trị: <strong className="text-slate-900">{dispute.amount}</strong></span>
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
            <MessageSquareWarning className="w-5 h-5 text-red-600" />
            <div>
              <h2 className="font-bold text-slate-900">Chi tiết Khiếu nại: DSP-992</h2>
              <p className="text-xs text-slate-500">Đơn hàng ORD-8812 • Khách: Lê Văn Khách</p>
            </div>
          </div>
          
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 text-sm">
              <strong className="text-amber-900 block mb-1">Khách hàng báo cáo:</strong>
              <p className="text-amber-800">"Tôi nhận 3 con cua lột nhưng lúc mở thùng xốp ra thì 2 con đã chết và có mùi ươn. Đề nghị hoàn tiền."</p>
              <div className="mt-3 flex gap-2">
                <div className="w-24 h-24 bg-amber-200 rounded flex items-center justify-center text-amber-700 flex-col gap-1 cursor-pointer">
                  <ImageIcon className="w-6 h-6" /> <span className="text-[10px] font-bold">Hình ảnh bóc hộp</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm">
              <strong className="text-blue-900 block mb-1">Operator giải trình:</strong>
              <p className="text-blue-800">"Lúc đóng gói cua hoàn toàn khỏe mạnh, đã cấp oxy và đá lạnh đầy đủ chuẩn quy trình. Khả năng do bên vận chuyển giao trễ 1 ngày."</p>
              <div className="mt-3 flex gap-2">
                <div className="w-24 h-24 bg-blue-200 rounded flex items-center justify-center text-blue-700 flex-col gap-1 cursor-pointer">
                  <ImageIcon className="w-6 h-6" /> <span className="text-[10px] font-bold">Video đóng gói</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold text-sm rounded hover:bg-slate-100">
              <XCircle className="w-4 h-4" /> Bác bỏ khiếu nại
            </button>
            <button onClick={() => alert('Đã hoàn tiền 100% cho Customer. Sẽ trừ vào doanh thu của Operator/Vận chuyển.')} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-bold text-sm rounded hover:bg-red-700">
              <CheckCircle className="w-4 h-4" /> Hoàn tiền (Refund 100%)
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
