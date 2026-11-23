/* Giấy tờ pháp lý của đối tác tổ chức để Admin xác minh hồ sơ (GET, POST, DELETE /api/me/party/documents).
   Chỉ hiện với hộ kinh doanh, hợp tác xã, doanh nghiệp. Cá nhân xác minh bằng eKYC nên không gửi giấy tờ ở đây.
   Gửi giấy tờ khi hồ sơ chưa xác minh hoặc bị từ chối thì hồ sơ chuyển sang chờ Admin xem. */
import { useRef, useState } from 'react'
import { Download, FileText, FileUp, Trash2 } from 'lucide-react'
import type { PartyDocumentResponse, PartyResponse } from '../api/api.gen'
import {
  AuthImage, Field, Input, OpBtn, OpConfirm, OpNote, OpPhoto, OpPanel, QueryView, Select, errorMessage, formatDate, label, openFile, options, useGet, useSend,
} from '../ui/console'

type UploadBody = { DocType: string; Note: string; File: File }

export function PartyDocumentFile({ document, path }: { document: PartyDocumentResponse; path: string }) {
  const name = label('partyDocument', document.docType)
  if (document.contentType !== 'application/pdf') return <AuthImage path={path} alt={name} />
  return (
    <OpBtn type="button" sm variant="ghost" aria-label={`Tải PDF: ${name}`}
      onClick={() => void openFile(path, `giay-to-${document.documentId}.pdf`)}>
      <Download size={14} /> Tải PDF
    </OpBtn>
  )
}

export function PartyDocuments({ party, title, draft }: {
  party: PartyResponse
  title?: string
  draft?: { canSave: boolean; save: () => Promise<PartyResponse> }
}) {
  const documents = useGet<PartyDocumentResponse[]>('/api/me/party/documents', undefined, { enabled: !draft && party.partyType !== 'Individual' })
  const [docType, setDocType] = useState('BusinessRegistration')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const pdfInput = useRef<HTMLInputElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<unknown>(null)
  const [removing, setRemoving] = useState<PartyDocumentResponse | null>(null)
  const upload = useSend<PartyDocumentResponse, UploadBody>('post', '/api/me/party/documents', {
    form: true, quietError: true, success: 'Đã gửi giấy tờ. Admin sẽ xem để xác minh hồ sơ.',
    onSuccess: () => { setFile(null); setNote('') },
  })
  const remove = useSend<void, void>('delete', () => `/api/me/party/documents/${removing?.documentId}`, {
    quietError: true, success: 'Đã xoá giấy tờ.', onSuccess: () => setRemoving(null),
  })

  if (!draft && party.partyType === 'Individual') return null
  const locked = !draft && (party.legalDossierVerified ?? (party.verificationStatus === 'Verified'))
  const pdf = file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) ? file : null

  async function submit() {
    if (!file || submitting || (draft && !draft.canSave)) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await draft?.save()
      await upload.mutateAsync({ DocType: docType, Note: note.trim(), File: file })
    } catch (error) {
      setSubmitError(error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <OpPanel title={title ?? 'Giấy tờ pháp lý'} subtitle="Gửi bản PDF hoặc ảnh giấy chứng nhận đăng ký, giấy phép hoặc giấy uỷ quyền. Admin đối chiếu với tên pháp lý và mã số thuế trước khi xác minh.">
      {!draft && <QueryView query={documents}>
        {(list) => (
          <div className="op-stack">
            {list.length === 0
              ? <OpNote>Chưa có giấy tờ nào. Gửi ít nhất một tệp để Admin xác minh hồ sơ.</OpNote>
              : (
                <div className="op-gallery">
                  {list.map((d) => (
                    <figure key={d.documentId} className="op-gallery__item">
                      <PartyDocumentFile document={d} path={`/api/me/party/documents/${d.documentId}/file`} />
                      <figcaption>
                        <b>{label('partyDocument', d.docType)}</b>
                        <small className="rd-muted">{[d.note, `gửi ${formatDate(d.uploadedAt)}`].filter(Boolean).join(' · ')}</small>
                      </figcaption>
                      {!locked && (
                        <div className="op-gallery__actions">
                          <OpBtn sm variant="ghost" onClick={() => { remove.reset(); setRemoving(d) }}><Trash2 size={14} /> Xoá</OpBtn>
                        </div>
                      )}
                    </figure>
                  ))}
                </div>
              )}
          </div>
        )}
      </QueryView>}

      {locked ? (
        <small className="rd-muted">Hồ sơ đã được xác minh. Giấy tờ đã gửi được giữ làm căn cứ.</small>
      ) : (
        <form className="op-form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <div className="op-form__row">
            <Field label="Loại giấy tờ">
              <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
                {options('partyDocument').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Ghi chú">
              <Input value={note} maxLength={200} placeholder="Ví dụ: bản cập nhật tháng 10" onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <OpPhoto key={pdf ? 'pdf' : 'image'} value={pdf ? null : file} onChange={setFile}
            label={title ? 'Thêm ảnh giấy tờ' : 'Chụp hoặc chọn ảnh giấy tờ'} hint="JPEG, PNG hoặc WebP, tối đa 5 MB" />
          <div className="op-inline">
            <OpBtn type="button" variant="ghost" onClick={() => pdfInput.current?.click()}>
              <FileText size={16} /> {pdf ? 'Đổi tệp PDF' : 'Chọn tệp PDF'}
            </OpBtn>
            <input ref={pdfInput} type="file" hidden aria-label="Chọn tệp PDF" accept="application/pdf,.pdf" onChange={(e) => {
              const selected = e.currentTarget.files?.[0]
              if (selected) {
                setFile(selected.type !== 'application/pdf' && selected.name.toLowerCase().endsWith('.pdf')
                  ? new File([selected], selected.name, { type: 'application/pdf' })
                  : selected)
              }
              e.currentTarget.value = ''
            }} />
            <small className="rd-muted [overflow-wrap:anywhere]" role="status">{pdf?.name ?? 'PDF tối đa 5 MB'}</small>
          </div>
          {submitError != null && <OpNote tone="danger">{errorMessage(submitError)}</OpNote>}
          {draft && !draft.canSave && !submitting && <p>Điền tên pháp lý và người đại diện để gửi giấy tờ.</p>}
          <div className="op-formfoot">
            <OpBtn type="submit" disabled={!file || submitting || (draft && !draft.canSave)}><FileUp size={16} /> {submitting ? 'Đang gửi…' : draft ? 'Lưu hồ sơ và gửi giấy tờ' : 'Gửi giấy tờ'}</OpBtn>
          </div>
        </form>
      )}

      {removing && (
        <OpConfirm
          title="Xoá giấy tờ"
          sub={label('partyDocument', removing.docType)}
          confirmLabel="Xoá"
          variant="danger"
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate()}
          onClose={() => setRemoving(null)}
        />
      )}
    </OpPanel>
  )
}
