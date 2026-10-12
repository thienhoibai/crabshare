import { CheckCircle2, FileText, ShieldCheck, UploadCloud } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpFacts, OpHeading, OpNote, OpPanel, OpStat } from './operatorUi'

export default function OperatorKyc() {
  return (
    <OperatorLayout activeTab="kyc">
      <OpHeading
        eyebrow="Định danh"
        title="Hồ sơ pháp lý & eKYC"
        description="Xác thực CCCD, khuôn mặt và giấy phép kinh doanh của trại."
      />

      <div className="op-grid">
        <OpStat className="op-span-5" label="Tiến độ hồ sơ" value="1 / 2" unit="bước" sub="Danh tính đã duyệt. Còn thiếu giấy phép trại để mở gọi vốn." />
        <OpPanel className="op-span-7" title="Việc còn lại">
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

        <OpPanel className="op-span-6" title="1. Danh tính" action={<OpBadge tone="ok"><CheckCircle2 /> Đã duyệt</OpBadge>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="op-cover" style={{ aspectRatio: '1.6' }}>
              <img src="/assets/imgQuestionCardSection.png" alt="" style={{ opacity: 0.5 }} />
              <span className="op-cover__text"><small>Mặt trước CCCD</small></span>
            </div>
            <div className="op-drop" style={{ aspectRatio: '1.6', alignContent: 'center' }}>Mặt sau CCCD</div>
          </div>
          <OpFacts
            items={[
              { label: 'Họ và tên', value: 'Nguyễn Văn A' },
              { label: 'Số CCCD', value: <span className="op-mono">079200123456</span> },
              { label: 'Khớp khuôn mặt', value: '99,8%', tone: 'ok' },
            ]}
          />
        </OpPanel>

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
