import { UploadCloud, ShieldCheck, FileText } from 'lucide-react'
import KycVerification from '../accounts/KycVerification'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpHeading, OpPanel } from './operatorUi'

export default function OperatorKyc() {
  return (
    <OperatorLayout activeTab="kyc">
      <OpHeading
        eyebrow="Định danh · eKYC"
        title="Hồ sơ pháp lý & eKYC"
        description="Trạng thái xác minh danh tính và hồ sơ pháp lý của trại."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <OpPanel title="1. Xác thực danh tính"><KycVerification /></OpPanel>

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
