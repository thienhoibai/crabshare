import { useState } from 'react'
import { ArrowLeft, CheckCircle2, Download, Key, Loader2, PenTool, ShieldCheck } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpAside, OpBack, OpBadge, OpBtn, OpHeading, OpIcon, OpModal, OpNote, OpPanel } from './operatorUi'

export default function OperatorContract() {
  const [agreed, setAgreed] = useState(false)
  const [showSigner, setShowSigner] = useState(false)
  const [signStep, setSignStep] = useState(0)
  const [isSigned, setIsSigned] = useState(false)

  const openSigner = () => {
    if (!agreed) return
    setShowSigner(true)
    setSignStep(0)
  }

  const sign = () => {
    setSignStep(1)
    setTimeout(() => {
      setSignStep(2)
      setIsSigned(true)
      setTimeout(() => setShowSigner(false), 2000)
    }, 2500)
  }

  return (
    <OperatorLayout activeTab="batch">
      <OpHeading
        crumb={<OpBack href="/operator/batch/detail"><ArrowLeft size={16} /> Quay lại chi tiết lô</OpBack>}
        eyebrow="Ký số Viettel-CA"
        title="Ký hợp đồng hợp tác"
        description="Lô BATCH-2026-11A · Cua lột 11A"
        action={<OpBtn variant="ghost"><Download size={16} /> Tải bản PDF</OpBtn>}
      />

      <div className="op-split">
        <div>
          <OpPanel>
            <div className="op-doc">
              <div>
                {isSigned && <span className="op-watermark"><ShieldCheck size={240} /></span>}
                <h2>HỢP ĐỒNG HỢP TÁC SẢN XUẤT<br /><small className="op-muted">Số: BATCH-2026-11A/HTSX</small></h2>
                <p>Hôm nay, ngày 01 tháng 10 năm 2026, tại nền tảng CrabShare, chúng tôi gồm:</p>
                <p><b>BÊN A (NỀN TẢNG CRABSHARE):</b><br />Công ty CP Công nghệ CrabShare Vietnam · MST 0318928419</p>
                <p><b>BÊN B (HỘ NUÔI):</b><br />Trại Cần Giờ 01 (Ông Nguyễn Văn A) · CCCD 079200123456</p>
                <h3>ĐIỀU 1: NỘI DUNG HỢP TÁC</h3>
                <p>Bên B nhận vốn giải ngân <b>75.000.000 VNĐ</b> để nuôi 1.500 con giống cua lột theo tiêu chuẩn RAS.</p>
                <h3>ĐIỀU 2: ĐỊNH MỨC VÀ LỢI NHUẬN</h3>
                <p>Tỷ lệ ăn chia doanh thu ròng: Bên B <b>60%</b>, nhà đầu tư và nền tảng 40%.</p>
                <h3>ĐIỀU 3: DANH SÁCH NHÀ ĐẦU TƯ</h3>
                <table className="op-table">
                  <thead><tr><th>Nhà đầu tư</th><th className="is-num">Tỷ lệ</th><th className="is-num">Số tiền</th></tr></thead>
                  <tbody>
                    <tr><td>Trần Trọng A</td><td className="is-num">30%</td><td className="is-num">22.500.000 ₫</td></tr>
                    <tr><td>Lê Thị B</td><td className="is-num">50%</td><td className="is-num">37.500.000 ₫</td></tr>
                    <tr><td>Phạm Văn C</td><td className="is-num">20%</td><td className="is-num">15.000.000 ₫</td></tr>
                    <tr><td><b>Tổng cộng</b></td><td className="is-num"><b>100%</b></td><td className="is-num"><b>75.000.000 ₫</b></td></tr>
                  </tbody>
                </table>
                <div className="op-signs">
                  <div>
                    <b>ĐẠI DIỆN BÊN A</b>
                    <span className="op-stamp">Ký bởi: CRABSHARE VN<small>01/10/2026 · Viettel-CA</small></span>
                  </div>
                  <div>
                    <b>ĐẠI DIỆN BÊN B</b>
                    {isSigned
                      ? <span className="op-stamp">Ký bởi: NGUYỄN VĂN A<small>Vừa xong · Viettel-CA</small></span>
                      : <span className="op-stamp is-pending">Khu vực ký</span>}
                  </div>
                </div>
              </div>
            </div>
          </OpPanel>
        </div>

        <OpAside>
          <p className="rd-eyebrow">Trạng thái ký</p>
          <dl className="op-dl">
            <dt>CrabShare</dt><dd><OpBadge tone="ok">Đã ký</OpBadge></dd>
            <dt>Hộ nuôi (bạn)</dt><dd>{isSigned ? <OpBadge tone="ok">Đã ký</OpBadge> : <OpBadge tone="danger">Chờ ký</OpBadge>}</dd>
          </dl>
          {!isSigned ? (
            <>
              <label className="op-check">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                Tôi đã đọc và đồng ý toàn bộ điều khoản hợp đồng BATCH-2026-11A.
              </label>
              <OpBtn full disabled={!agreed} onClick={openSigner}><PenTool size={16} /> Ký hợp đồng</OpBtn>
              <p className="rd-note"><ShieldCheck size={14} /> Chữ ký số do Viettel-CA cấp, có giá trị pháp lý như chữ ký tay.</p>
            </>
          ) : (
            <>
              <OpNote tone="ok"><b>Hợp đồng đã có hiệu lực.</b> Đã ký số và lưu trên hệ thống.</OpNote>
              <OpBtn variant="ghost" full onClick={() => { window.location.href = '/operator/batch' }}>Về danh sách lô</OpBtn>
            </>
          )}
        </OpAside>
      </div>

      {showSigner && (
        <OpModal title="Cổng ký số điện tử" sub="Cung cấp bởi Viettel-CA" onClose={() => setShowSigner(false)}>
          {signStep === 0 && (
            <div className="op-form">
              <OpNote>Bạn đang ký số văn bản <b>BATCH-2026-11A/HTSX</b>.</OpNote>
              <div className="op-field">
                <label htmlFor="ca-id">Tài khoản Viettel-CA (CCCD)</label>
                <input id="ca-id" className="op-input" defaultValue="079200123456" />
              </div>
              <div className="op-field">
                <label htmlFor="ca-pin">Mã PIN</label>
                <input id="ca-pin" className="op-input" type="password" defaultValue="123456" />
              </div>
              <OpBtn full onClick={sign}><Key size={16} /> Xác thực & ký</OpBtn>
            </div>
          )}
          {signStep === 1 && (
            <div className="op-empty">
              <Loader2 size={40} className="animate-spin" />
              <b>Đang xác thực chứng thư…</b>
              <span>Vui lòng không đóng cửa sổ này.</span>
            </div>
          )}
          {signStep === 2 && (
            <div className="op-empty">
              <OpIcon tone="ok" round><CheckCircle2 size={24} /></OpIcon>
              <b>Ký số thành công</b>
              <span>Chứng thư số Nguyễn Văn A đã đóng dấu văn bản.</span>
            </div>
          )}
        </OpModal>
      )}
    </OperatorLayout>
  )
}
