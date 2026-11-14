/* Khối "Căn cứ xác minh" trong trang đối tác: giấy tờ pháp lý đã gửi (tổ chức) và tài khoản đứng tên kèm kết quả eKYC (cá nhân).
   GET /api/admin/parties/{partyId}/dossier; ảnh giấy tờ qua …/documents/{id}/file. */
import type { PartyDossierResponse, PartyResponse } from '../../shared/api/api.gen'
import { AuthImage, OpNote, OpPanel, QueryView, StatusBadge, formatDate, label, useGet } from '../../shared/ui/console'

export function PartyDossier({ party }: { party: PartyResponse }) {
  const base = `/api/admin/parties/${party.partyId}`
  const dossier = useGet<PartyDossierResponse>(`${base}/dossier`)
  const organization = party.partyType !== 'Individual'

  return (
    <OpPanel title="Căn cứ xác minh" subtitle="Tổ chức gửi ảnh giấy tờ pháp lý. Cá nhân xác minh bằng eKYC, hệ thống không lưu ảnh giấy tờ tuỳ thân.">
      <QueryView query={dossier}>
        {(d) => (
          <div className="op-stack">
            {organization && (d.documents.length > 0 ? (
              <div className="op-gallery">
                {d.documents.map((doc) => (
                  <figure key={doc.documentId} className="op-gallery__item">
                    <AuthImage path={`${base}/documents/${doc.documentId}/file`} alt={label('partyDocument', doc.docType)} />
                    <figcaption>
                      <b>{label('partyDocument', doc.docType)}</b>
                      <small className="rd-muted">{[doc.note, `gửi ${formatDate(doc.uploadedAt)}`].filter(Boolean).join(' · ')}</small>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : <OpNote>Đối tác chưa gửi giấy tờ pháp lý. Chỉ xác minh khi đã đối chiếu được giấy tờ.</OpNote>)}

            {d.accounts.length === 0 ? <small className="rd-muted">Đối tác này không có tài khoản đăng nhập.</small> : d.accounts.map((a) => (
              <div key={a.userId} className="op-acct">
                <div>
                  <b>{a.fullName}</b>
                  <br />
                  <small className="rd-muted">{[a.email, a.phone].filter(Boolean).join(' · ')}</small>
                </div>
                <div className="op-acct__end">
                  {a.investorVerification && <span><small className="rd-muted">Nhà đầu tư </small><StatusBadge kind="verification" value={a.investorVerification} /></span>}
                  {a.ekycResult
                    ? <span><small className="rd-muted">eKYC {a.ekycCheckedAt ? formatDate(a.ekycCheckedAt) : ''} </small><StatusBadge kind="kyc" value={a.ekycResult} /></span>
                    : !organization && <small className="rd-muted">Chưa làm eKYC</small>}
                  {a.ekycFailureReason && <small className="op-danger">{a.ekycFailureReason}</small>}
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryView>
    </OpPanel>
  )
}
