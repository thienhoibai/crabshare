/* /qc/chuan — Chuẩn phân hạng và bộ quy tắc đang áp dụng, để tra nhanh khi duyệt hạng. */
import { GradingStandards } from '../public/GradingStandardPage'
import { OpHeading } from '../../shared/ui/console'

export default function StandardsPage() {
  return (
    <>
      <OpHeading eyebrow="Tra cứu" title="Chuẩn phân hạng" description="Chuẩn nội bộ tham chiếu, không phải giấy chứng nhận." />
      <GradingStandards />
    </>
  )
}
