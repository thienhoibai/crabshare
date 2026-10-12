import { useState } from 'react'
import { PenTool, Download, ShieldCheck, Key, FileCheck, CheckCircle2, Loader2, X } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpHeading, OpPanel } from './operatorUi'

export default function OperatorContract() {
  const [agreed, setAgreed] = useState(false)
  const [showViettelCA, setShowViettelCA] = useState(false)
  const [signStep, setSignStep] = useState(0)
  const [isSigned, setIsSigned] = useState(false)

  const handleSignClick = () => {
    if (!agreed) return alert('Vui lòng đồng ý với các điều khoản trước khi ký!')
    setShowViettelCA(true)
    setSignStep(0)
  }

  const handleViettelAuth = () => {
    setSignStep(1)
    setTimeout(() => {
      setSignStep(2)
      setIsSigned(true)
      setTimeout(() => setShowViettelCA(false), 2000)
    }, 2500)
  }

  return (
    <OperatorLayout activeTab="batch">
      <OpHeading
        eyebrow="UC-04 · Viettel-CA Cloud"
        title="Ký hợp đồng hợp tác"
        description="Lô BATCH-2026-11A · Cua lột 11A"
        action={<OpBtn variant="outline"><Download className="w-4 h-4" /> Tải bản PDF</OpBtn>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <OpPanel className="lg:col-span-2 h-[600px] overflow-y-auto">
          <div className="max-w-xl mx-auto space-y-5 text-sm leading-relaxed font-serif relative">
            {isSigned && (
              <div className="absolute inset-0 grid place-items-center pointer-events-none opacity-10">
                <ShieldCheck className="w-64 h-64 text-[#15803d]" />
              </div>
            )}
            <h2 className="text-xl font-bold text-center font-sans">HỢP ĐỒNG HỢP TÁC SẢN XUẤT<br /><span className="text-sm font-normal">Số: BATCH-2026-11A/HTSX</span></h2>
            <p>Hôm nay, ngày 01 tháng 10 năm 2026, tại nền tảng CrabShare, chúng tôi gồm:</p>
            <div>
              <strong>BÊN A (NỀN TẢNG CRABSHARE):</strong>
              <p>Công ty CP Công nghệ CrabShare Vietnam · MST 0318928419</p>
            </div>
            <div>
              <strong>BÊN B (OPERATOR):</strong>
              <p>Trại Cần Giờ 01 (Ông Nguyễn Văn A) · CCCD 079200123456</p>
            </div>
            <h3 className="font-bold font-sans mt-4">ĐIỀU 1: NỘI DUNG HỢP TÁC</h3>
            <p>Bên B nhận vốn giải ngân <strong>75.000.000 VNĐ</strong> để nuôi 1.500 con giống cua lột theo tiêu chuẩn RAS.</p>
            <h3 className="font-bold font-sans mt-4">ĐIỀU 2: ĐỊNH MỨC VÀ LỢI NHUẬN</h3>
            <p>Tỷ lệ ăn chia doanh thu ròng: Bên B <strong>60%</strong>, nhà đầu tư và nền tảng 40%.</p>
            <h3 className="font-bold font-sans mt-4">ĐIỀU 3: DANH SÁCH NHÀ ĐẦU TƯ</h3>
            <table className="op-table font-sans">
              <thead><tr><th>Nhà đầu tư</th><th>Tỷ lệ</th><th>Số tiền</th></tr></thead>
              <tbody>
                <tr><td>Trần Trọng A</td><td>30%</td><td>22.500.000 ₫</td></tr>
                <tr><td>Lê Thị B</td><td>50%</td><td>37.500.000 ₫</td></tr>
                <tr><td>Phạm Văn C</td><td>20%</td><td>15.000.000 ₫</td></tr>
                <tr className="font-bold"><td>Tổng cộng</td><td>100%</td><td>75.000.000 ₫</td></tr>
              </tbody>
            </table>
            <div className="pt-12 pb-6 flex flex-col sm:flex-row justify-between gap-10 font-sans">
              <div className="text-center">
                <strong>ĐẠI DIỆN BÊN A</strong>
                <div className="w-48 border-2 border-green-600 bg-green-50 mt-2 mx-auto p-2 text-green-700 text-[10px] font-bold rounded-lg -rotate-2">
                  <span className="text-xs">Ký bởi: CRABSHARE VN</span>
                  <p>01/10/2026 · Viettel-CA Cloud</p>
                </div>
              </div>
              <div className="text-center">
                <strong>ĐẠI DIỆN BÊN B</strong>
                {!isSigned ? (
                  <div className="w-32 h-16 border-2 border-dashed border-red-300 bg-red-50 mt-2 mx-auto grid place-items-center text-red-500 text-xs font-bold">Khu vực ký</div>
                ) : (
                  <div className="w-48 border-2 border-red-600 bg-red-50 mt-2 mx-auto p-2 text-red-700 text-[10px] font-bold rounded-lg rotate-1">
                    <span className="text-xs uppercase">Ký bởi: Nguyễn Văn A</span>
                    <p>Vừa xong · Viettel-CA Cloud</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </OpPanel>

        <OpPanel accent title="Trạng thái ký kết" className="self-start sticky top-6">
          <div className="space-y-3 mb-6 text-sm">
            <div className="flex justify-between border-b border-[#f4cf9c] pb-2">
              <span className="text-[#6f675e]">Platform</span>
              <OpBadge tone="ok">Đã ký</OpBadge>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6f675e]">Operator (bạn)</span>
              {isSigned ? <OpBadge tone="ok">Đã ký</OpBadge> : <OpBadge tone="danger">Chờ ký</OpBadge>}
            </div>
          </div>
          {!isSigned ? (
            <div className="space-y-3">
              <label className="flex items-start gap-2 text-xs text-[#4a433c] cursor-pointer">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-[#7d4b1a] w-4 h-4" />
                Tôi đã đọc và đồng ý toàn bộ điều khoản hợp đồng BATCH-2026-11A.
              </label>
              <OpBtn variant="ink" full onClick={handleSignClick}><PenTool className="w-4 h-4" /> Ký hợp đồng ngay</OpBtn>
              <p className="flex items-center justify-center gap-2 pt-3 border-t border-[#f4cf9c] text-[11px] font-bold text-[#6f675e] uppercase tracking-wide">
                <ShieldCheck className="w-5 h-5 text-red-600" /> Viettel-CA Cloud
              </p>
            </div>
          ) : (
            <div className="text-center p-4 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl">
              <ShieldCheck className="w-10 h-10 text-[#15803d] mx-auto mb-2" />
              <p className="font-bold text-[#15803d]">Hợp đồng đã có hiệu lực</p>
              <p className="text-xs text-[#6f675e] mt-1">Đã ký số và lưu trên hệ thống.</p>
              <OpBtn variant="outline" full className="mt-4" onClick={() => { window.location.href = '/operator/batch' }}>
                Trở về danh sách lô
              </OpBtn>
            </div>
          )}
        </OpPanel>
      </div>

      {showViettelCA && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] grid place-items-center p-4">
          <div className="bg-[#faf6f0] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-red-600 p-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6" />
                <div>
                  <h3 className="font-bold">Cổng ký số điện tử</h3>
                  <p className="text-[10px] uppercase opacity-90">Cung cấp bởi Viettel-CA</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowViettelCA(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              {signStep === 0 && (
                <div className="space-y-4">
                  <div className="bg-red-50 text-red-700 p-3 rounded-xl flex gap-3 border border-red-100 text-xs">
                    <FileCheck className="w-5 h-5 shrink-0" />
                    Bạn đang ký số văn bản <strong>BATCH-2026-11A/HTSX</strong>.
                  </div>
                  <div className="op-field">
                    <label>Tài khoản Viettel-CA (CCCD)</label>
                    <input className="op-input" defaultValue="079200123456" />
                  </div>
                  <div className="op-field">
                    <label>Mã PIN</label>
                    <input className="op-input" type="password" defaultValue="123456" />
                  </div>
                  <button type="button" onClick={handleViettelAuth} className="op-btn op-btn-full" style={{ background: '#dc2626', color: '#fff' }}>
                    <Key className="w-4 h-4" /> Xác thực & ký ngay
                  </button>
                </div>
              )}
              {signStep === 1 && (
                <div className="py-12 text-center">
                  <Loader2 className="w-12 h-12 text-red-600 animate-spin mx-auto mb-4" />
                  <h4 className="font-bold text-lg">Đang xác thực chứng thư…</h4>
                  <p className="text-sm text-[#6f675e] mt-2">Vui lòng không đóng cửa sổ này.</p>
                </div>
              )}
              {signStep === 2 && (
                <div className="py-10 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full grid place-items-center mx-auto mb-4">
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                  </div>
                  <h4 className="font-bold text-green-700 text-lg">Ký số thành công</h4>
                  <p className="text-sm text-[#6f675e] mt-2">Chứng thư số Nguyễn Văn A đã đóng dấu văn bản.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </OperatorLayout>
  )
}
