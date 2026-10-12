import { UploadCloud, CheckCircle, ShieldCheck, FileText } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpHeading, OpPanel } from './operatorUi'

export default function OperatorKyc() {
  return (
    <OperatorLayout activeTab="kyc">
      <OpHeading
        eyebrow="Định danh · eKYC"
        title="Hồ sơ pháp lý & eKYC"
        description="Xác thực CCCD, liveness và giấy phép kinh doanh của trại."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <OpPanel
          title="1. Xác thực danh tính"
          action={<OpBadge tone="ok"><CheckCircle className="w-3 h-3" /> Đã duyệt</OpBadge>}
        >
          <div className="flex gap-4 mb-4">
            <div className="w-1/2 aspect-[1.6] rounded-xl border border-[#e8dccb] overflow-hidden relative bg-[#ece4d8]">
              <img src="/assets/imgQuestionCardSection.png" className="opacity-40 object-cover w-full h-full absolute" alt="" />
              <span className="absolute inset-0 grid place-items-center text-xs font-bold">Mặt trước CCCD</span>
            </div>
            <div className="w-1/2 aspect-[1.6] rounded-xl border border-[#e8dccb] grid place-items-center bg-[#ece4d8] text-xs font-bold text-[#9a8f84]">
              Mặt sau CCCD
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#f4efe8] border border-[#f0e8dc] text-sm space-y-1">
            <p><strong>Họ và tên:</strong> Nguyễn Văn A</p>
            <p><strong>Số CCCD:</strong> 079200123456</p>
            <p><strong>Liveness:</strong> <span className="text-[#15803d] font-bold">Khớp 99.8%</span></p>
          </div>
        </OpPanel>

        <OpPanel
          accent
          title="2. Giấy phép trại"
          action={<OpBadge tone="warn"><ShieldCheck className="w-3 h-3" /> Cần bổ sung</OpBadge>}
        >
          <div className="space-y-4">
            <div className="op-field">
              <label>Giấy phép đăng ký kinh doanh</label>
              <div className="op-drop is-accent"><UploadCloud className="w-6 h-6" /> Tải lên giấy phép KD (PDF/JPG)</div>
            </div>
            <div className="op-field">
              <label>Chứng nhận VietGAP / đủ điều kiện</label>
              <div className="op-drop"><UploadCloud className="w-6 h-6" /> Tải lên chứng nhận</div>
            </div>
            <OpBtn variant="ink" full onClick={() => window.alert('Đã gửi hồ sơ cho Admin xét duyệt!')}>
              <FileText className="w-4 h-4" /> Gửi xét duyệt
            </OpBtn>
          </div>
        </OpPanel>
      </div>
    </OperatorLayout>
  )
}
