import { QRCodeSVG } from 'qrcode.react'
import { errorMessage } from '../../shared/api/http'
import type { HarvestRecord } from './harvestApi'
import { OpBadge, OpBtn, OpFacts, OpPanel } from './operatorUi'

export default function HarvestResultPanel({
  result,
  owner,
  locked,
  listingError,
  canRefreshStock,
  onRetryListings,
  onRefreshStock
}: {
  result: HarvestRecord | null
  owner: boolean
  locked: boolean
  listingError: unknown
  canRefreshStock: boolean
  onRetryListings: () => void
  onRefreshStock: () => void
}) {
  return (
    <OpPanel className="harvest-result" title="Kết quả và niêm yết">
      {result ? (
        <section aria-label="Kết quả lần cân" className="harvest-result__body">
          <div className="harvest-result__details">
            <p className="op-mono">
              <b>{result.itemUuid}</b> · Hộp {result.slotCode}
            </p>
            <OpFacts
              items={[
                { label: 'Khối lượng', value: `${result.weightG} g` },
                { label: 'Hạng cua', value: result.gradeName || result.gradeCode }
              ]}
            />
            <p>
              Tem: <b className="op-mono">{result.tagCode}</b>
            </p>
            <OpBadge tone="info">
              {result.tagStatus === 'Printed' ? 'Đã in, chờ kích hoạt' : result.tagStatus}
            </OpBadge>
            <p className="op-muted">In nhãn, gắn tem lên đúng cá thể và kích hoạt qua ứng dụng tại trại.</p>
            <a className="rd-btn rd-btn--ghost" href="/operator/tags">
              Mở quản lý tem
            </a>
          </div>
          {result.tagCode && result.tracePath && (
            <div className="harvest-result__qr">
              <QRCodeSVG
                value={new URL(result.tracePath, window.location.origin).href}
                size={144}
                title={`Tem ${result.tagCode}`}
              />
              <a className="rd-link" href={result.tracePath}>
                Đường dẫn truy xuất
              </a>
            </div>
          )}
        </section>
      ) : (
        <p className="op-muted">Kết quả hạng và tem sẽ hiện sau khi lưu.</p>
      )}
      <div className="harvest-result__links">
        <a className="rd-link" href="/operator/listings">
          Quản lý giá và niêm yết sản phẩm
        </a>
        <a className="rd-link" href="/operator/orders">
          Đóng gói và giao hàng trong Đơn hàng
        </a>
      </div>
      {owner && !!listingError && (
        <div role="alert">
          {errorMessage(listingError)}{' '}
          <OpBtn variant="ghost" onClick={onRetryListings}>
            Tải lại niêm yết
          </OpBtn>
        </div>
      )}
      {owner && canRefreshStock && (
        <OpBtn variant="ghost" disabled={locked} onClick={onRefreshStock}>
          Làm mới tồn niêm yết
        </OpBtn>
      )}
    </OpPanel>
  )
}
