/* /qc/phan-hang — Buổi đo được phân cho tôi (mỗi Lô một việc GradingSession) và các con bị giữ lại chờ tôi
   xác nhận lần hai (việc SecondReview, mỗi con một việc, gom theo Lô). Việc của một Lô tự đóng khi mọi con đã có
   quyết định, nên có thêm ô mở Lô theo mã (gấp lại) để xem lại hoặc đổi hạng con đã duyệt (BR-157). */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Input, OpBtn, OpMore } from '../../shared/ui/console'
import { KindListPage } from './TaskRows'

function OpenByCode() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  return (
    <OpMore label="Mở Lô khác theo mã">
      <form
        className="op-toolbar"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim()) navigate(`/qc/phan-hang/${encodeURIComponent(code.trim())}`)
        }}
      >
        <Input className="op-toolbar__grow" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS-2611-P1" aria-label="Mã Lô" autoCapitalize="characters" />
        <OpBtn type="submit" variant="ghost" disabled={!code.trim()}>Mở</OpBtn>
      </form>
    </OpMore>
  )
}

export default function GradingListPage() {
  return (
    <KindListPage kinds={['GradingSession', 'SecondReview']} title="Duyệt phân hạng" empty="Chưa có buổi đo nào được phân cho bạn">
      <OpenByCode />
    </KindListPage>
  )
}
