/* Mảnh giao diện nhỏ dùng chung trong cổng Nhân viên kiểm phẩm. */
import type { ReactNode } from 'react'

/**
 * Nhóm lựa chọn có nhãn (bọc RadioCards). Không dùng <label> bao ngoài như Field,
 * để bấm vào nhãn hay dòng gợi ý không tự chọn ô đầu tiên khi thao tác vội ở trại.
 */
export function Group({ title, hint, required, children }: { title: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="op-field" role="group" aria-label={title}>
      <span className="op-label">{title}{required && <b className="op-danger" aria-hidden="true">*</b>}</span>
      {children}
      {hint && <span className="op-field__hint">{hint}</span>}
    </div>
  )
}
