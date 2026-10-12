import { useParams } from 'react-router'
import { Logo, Shell } from '../../shared/ui/kit/kit'

/**
 * UC33 — Trang truy xuất mở ra khi người mua quét tem trên con cua: /truy-xuat/K7Q2M9X4P8LA
 * Khung trang để sẵn; task Harvest (UC33) gọi GET /api/trace/{tagCode} (view v_traceability) và hiển thị
 * trại, lô, số hộp, ngày thả, ngày thu hoạch, cân nặng, ảnh thu hoạch, đơn hàng.
 */
export default function TracePage() {
  const { tagCode } = useParams()
  return (
    <Shell theme="light">
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px', display: 'grid', gap: 16 }}>
        <Logo />
        <p className="rd-eyebrow">Truy xuất nguồn gốc</p>
        <h1 className="rd-display">Tem {tagCode}</h1>
        <p className="rd-muted">Trang này sẽ hiện chuỗi nguồn gốc của con cua: trại → lô → hộp nuôi → nhật ký → thu hoạch → đơn hàng.</p>
      </main>
    </Shell>
  )
}
