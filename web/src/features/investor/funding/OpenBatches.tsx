import { Link } from 'react-router'
import { errorMessage } from '../../../shared/api/http'
import { formatDate, formatVnd } from '../../../shared/lib/format'
import { useOpenBatches } from './fundingApi'
import './funding.css'

/** Các lô đang mở gọi vốn lấy từ API (TH-04). Bấm vào để mở luồng góp vốn. */
export default function OpenBatches() {
  const open = useOpenBatches()
  if (open.isPending) return null
  if (open.isError) return <section className="iv-card"><p className="cf-error">{errorMessage(open.error)}</p></section>
  if (open.data.length === 0) return null
  return (
    <section className="iv-card cf-open">
      <div className="cf-open__head">
        <h3 className="rd-h3">Đang mở gọi vốn</h3>
        <small>{open.data.length} lô · số liệu thật</small>
      </div>
      {open.data.map((b) => {
        const pct = Math.min(100, Math.round((b.confirmedCapital / b.targetCapital) * 100))
        return (
          <Link key={b.batchCode} to={`/nha-dau-tu/gop-von/${b.batchCode}`} className="cf-open__row">
            <span className="cf-open__name"><b>{b.batchCode}</b><small>{b.title} · {b.operatorName}</small></span>
            <span className="cf-open__prog" aria-label={`Đã góp ${pct}% mục tiêu`}><i style={{ width: `${pct}%` }} /></span>
            <span className="cf-open__nums">
              <b>{pct}%</b>
              <small>còn nhận {formatVnd(b.remainingCapacity)}{b.fundingDeadline ? ` · hạn ${formatDate(b.fundingDeadline)}` : ''}</small>
            </span>
            <span className="rd-btn rd-btn--primary rd-btn--sm">Góp vốn</span>
          </Link>
        )
      })}
    </section>
  )
}
