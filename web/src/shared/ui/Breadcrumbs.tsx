import { ChevronLeft, ChevronRight } from 'lucide-react'
import './breadcrumbs.css'

export interface BreadcrumbItem {
  label: string
  onClick?: () => void
  href?: string
}

export function Breadcrumbs({
  items,
  onBack,
  fallbackHref,
}: {
  items: BreadcrumbItem[]
  onBack?: () => void
  fallbackHref?: string
}) {
  const handleBack = () => {
    if (onBack) {
      onBack()
    } else if (window.history.length > 1) {
      window.history.back()
    } else if (fallbackHref) {
      window.location.href = fallbackHref
    }
  }

  return (
    <nav className="rd-breadcrumb-bar" aria-label="Đường dẫn phân cấp">
      <button
        type="button"
        className="rd-btn-back-large"
        onClick={handleBack}
        title="Quay lại trang trước"
        aria-label="Quay lại"
      >
        <ChevronLeft size={22} strokeWidth={2.5} />
      </button>

      <ol className="rd-breadcrumb-trail">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={index} className="rd-breadcrumb-item">
              {index > 0 && <ChevronRight size={14} className="rd-breadcrumb-sep" />}
              {isLast ? (
                <span className="rd-breadcrumb-current" aria-current="page">
                  {item.label}
                </span>
              ) : item.onClick ? (
                <button type="button" className="rd-breadcrumb-link" onClick={item.onClick}>
                  {item.label}
                </button>
              ) : item.href ? (
                <a className="rd-breadcrumb-link" href={item.href}>
                  {item.label}
                </a>
              ) : (
                <span className="rd-breadcrumb-text">{item.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
