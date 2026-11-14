/* /khach/lo và /khach/lo/:code — Lô nhận đặt trước ngay trong cổng khách hàng (giữ menu trái).
   Dùng lại nội dung của trang công khai /lo và /lo/:code (features/public). */
import { useParams } from 'react-router'
import { BatchExplorer } from '../public/BatchExplorePage'
import { BatchDetail } from '../public/BatchPublicPage'

export default function BatchesPage() {
  return <BatchExplorer embedded />
}

export function BatchPage() {
  const { code = '' } = useParams()
  return <BatchDetail code={code} embedded />
}
