import { Send } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../shared/api/http';
import { useSearchParams } from 'react-router';
import AdminLayout from './AdminLayout';
import AdminFundingPanel from './AdminFundingPanel';
import AdminInstructionsPanel from './AdminInstructionsPanel';
import AdminBatchContracts from './AdminBatchContracts';
import AdminTranchesPanel from './AdminTranchesPanel';
import AdminUnmatchedPanel from './AdminUnmatchedPanel';
import AdminSettlementsPanel from './AdminSettlementsPanel';
import { sendPaymentInstruction, type PaymentInstruction } from './financeApi';

const tabs = [
  { id: 'funding', label: 'Gọi vốn' },
  { id: 'tranches', label: 'Giải ngân' },
  { id: 'instructions', label: 'Lệnh chi' },
  { id: 'reconcile', label: 'Đối soát' },
  { id: 'contracts', label: 'Hợp đồng' },
  { id: 'settlement', label: 'Quyết toán' },
] as const;
type Tab = typeof tabs[number]['id'];

/** UC40 — gửi lệnh chi qua cổng thanh toán (TH-10); chỉ lệnh Chờ gửi hoặc Thất bại. */
function SendInstructionButton({ instruction }: { instruction: PaymentInstruction }) {
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: () => sendPaymentInstruction(instruction.instructionId),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin-instructions'] }), qc.invalidateQueries({ queryKey: ['admin-tranches'] }), qc.invalidateQueries({ queryKey: ['admin-funding'] })]);
    },
  });
  if (instruction.status !== 'Created' && instruction.status !== 'Failed') return null;
  return (
    <div className="flex flex-col items-end gap-1">
      <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded disabled:opacity-50 whitespace-nowrap"
        disabled={send.isPending} onClick={() => send.mutate()}>
        <Send className="w-3.5 h-3.5" /> {send.isPending ? 'Đang gửi…' : instruction.status === 'Failed' ? 'Gửi lại' : 'Gửi lệnh'}
      </button>
      {send.isError && <span className="text-xs text-red-700" role="alert">{errorMessage(send.error)}</span>}
    </div>
  );
}

export default function AdminFinance() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = tabs.some(t => t.id === params.get('tab')) ? params.get('tab') as Tab : 'funding';

  return (
    <AdminLayout activeTab="finance">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Đối soát & Tài chính</h1>
        <p className="text-sm text-slate-500 mt-1">Tiền nằm ở tài khoản chuyên dùng của từng lô do trung gian thanh toán giữ; nền tảng chỉ phát lệnh chi và đối soát.</p>
      </header>

      <div role="tablist" aria-label="Mục tài chính" className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px ${tab === t.id ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'funding' && <AdminFundingPanel />}
      {tab === 'tranches' && <AdminTranchesPanel />}
      {tab === 'instructions' && <AdminInstructionsPanel actions={i => <SendInstructionButton instruction={i} />} />}
      {tab === 'reconcile' && <AdminUnmatchedPanel />}
      {tab === 'contracts' && <AdminBatchContracts />}
      {tab === 'settlement' && <AdminSettlementsPanel />}
    </AdminLayout>
  );
}
