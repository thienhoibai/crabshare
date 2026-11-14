import type { ComponentType, LazyExoticComponent } from 'react'
import type { BatchResponse } from '../../../shared/api/api.gen'

/** Mỗi tab của trang làm việc một Lô nhận mã Lô và dữ liệu Lô (GET /api/operators/me/batches/{code}). */
export interface BatchTabProps {
  code: string
  batch: BatchResponse
}

export interface BatchTab {
  /** Đoạn cuối của đường dẫn: /operator/batches/:code/<key>. */
  key: string
  label: string
  /** Ẩn tab khi Lô chưa tới giai đoạn hoặc phương thức không dùng tới. */
  show?: (batch: BatchResponse) => boolean
  Component: LazyExoticComponent<ComponentType<BatchTabProps>> | ComponentType<BatchTabProps>
}
