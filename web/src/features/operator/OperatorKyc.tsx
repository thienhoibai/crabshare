import { FileText, ShieldCheck, UploadCloud } from 'lucide-react'
import KycVerification from '../accounts/KycVerification'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpHeading, OpNote, OpPanel } from './operatorUi'

export default function OperatorKyc() {
  return (
    <OperatorLayout activeTab="kyc">
      <OpHeading
        eyebrow="Định danh"
        title="Hồ sơ pháp lý & eKYC"
        description="Trạng thái xác minh danh tính và hồ sơ pháp lý của trại."
      />

      <div className="op-grid">
        <OpPanel className="op-span-12" title="Hồ sơ cần bổ sung">
          <div className="op-todo">
            <a href="#giay-phep">
              <span className="op-dot" />
              <span><b>Tải giấy phép kinh doanh</b><small>PDF hoặc ảnh chụp rõ nét</small></span>
            </a>
            <a href="#giay-phep">
              <span className="op-dot" />
              <span><b>Tải chứng nhận VietGAP</b><small>Hoặc giấy đủ điều kiện nuôi trồng</small></span>
            </a>
          </div>
        </OpPanel>
        <OpPanel className="op-span-6" title="1. Danh tính"><KycVerification /></OpPanel>

        <div className="op-span-6" id="giay-phep">
          <OpPanel accent title="2. Giấy phép trại" action={<OpBadge tone="warn"><ShieldCheck /> Cần bổ sung</OpBadge>}>
            <div className="op-field">
              <span className="op-label">Giấy phép đăng ký kinh doanh</span>
              <div className="op-drop is-accent"><UploadCloud size={24} /> Tải lên giấy phép (PDF/JPG)</div>
            </div>
            <div className="op-field">
              <span className="op-label">Chứng nhận VietGAP / đủ điều kiện</span>
              <div className="op-drop"><UploadCloud size={24} /> Tải lên chứng nhận</div>
            </div>
            <OpNote>Admin xét duyệt trong 1–2 ngày làm việc. Bạn sẽ nhận thông báo khi có kết quả.</OpNote>
            <OpBtn variant="ink" full onClick={() => window.alert('Đã gửi hồ sơ cho Admin xét duyệt!')}>
              <FileText size={16} /> Gửi xét duyệt
            </OpBtn>
          </OpPanel>
        </div>
      </div>
    </OperatorLayout>
  )
}
