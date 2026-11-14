/* Giấy tờ pháp lý của đối tác tổ chức để Admin xác minh hồ sơ (GET, POST, DELETE /api/me/party/documents).
   Chỉ hiện với hộ kinh doanh, hợp tác xã, doanh nghiệp. Cá nhân xác minh bằng eKYC nên không gửi giấy tờ ở đây.
   Gửi giấy tờ khi hồ sơ chưa xác minh hoặc bị từ chối thì hồ sơ chuyển sang chờ Admin xem. */
import { useState } from 'react'
import { FileUp, Trash2 } from 'lucide-react'
import type { PartyDocumentResponse, PartyResponse } from '../api/api.gen'
import {
  AuthImage, Field, Input, OpBtn, OpConfirm, OpNote, OpPhoto, OpPanel, QueryView, Select, errorMessage, formatDate, label, options, useGet, useSend,
} from '../ui/console'

type UploadBody = { DocType: string; Note: string; File: File }

export function PartyDocuments({ party }: { party: PartyResponse }) {
  const documents = useGet<PartyDocumentResponse[]>('/api/me/party/documents', undefined, { enabled: party.partyType !== 'Individual' })
  const [docType, setDocType] = useState('BusinessRegistration')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [removing, setRemoving] = useState<PartyDocumentResponse | null>(null)
  const upload = useSend<PartyDocumentResponse, UploadBody>('post', '/api/me/party/documents', {
    form: true, quietError: true, success: 'Đã gửi giấy tờ. Admin sẽ xem để xác minh hồ sơ.',
    onSuccess: () => { setFile(null); setNote('') },
  })
  const remove = useSend<void, void>('delete', () => `/api/me/party/documents/${removing?.documentId}`, {
    quietError: true, success: 'Đã xoá giấy tờ.', onSuccess: () => setRemoving(null),
  })

  if (party.partyType === 'Individual') return null
  const locked = party.verificationStatus === 'Verified'

  return (
    <OpPanel title="Giấy tờ pháp lý" subtitle="Ảnh giấy chứng nhận đăng ký, giấy phép hoặc giấy uỷ quyền. Admin đối chiếu với tên pháp lý và mã số thuế trước khi xác minh.">
      <QueryView query={documents}>
        {(list) => (
          <div className="op-stack">
            {list.length === 0
              ? <OpNote>Chưa có giấy tờ nào. Gửi ít nhất một ảnh để Admin xác minh hồ sơ.</OpNote>
              : (
                <div className="op-gallery">
                  {list.map((d) => (
                    <figure key={d.documentId} className="op-gallery__item">
                      <AuthImage path={`/api/me/party/documents/${d.documentId}/file`} alt={label('partyDocument', d.docType)} />
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

            {locked
              ? <small className="rd-muted">Hồ sơ đã được xác minh. Giấy tờ đã gửi được giữ làm căn cứ.</small>
              : (
                <form className="op-form" onSubmit={(e) => { e.preventDefault(); if (file) upload.mutate({ DocType: docType, Note: note.trim(), File: file }) }}>
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
                  <OpPhoto value={file} onChange={setFile} label="Chụp hoặc chọn ảnh giấy tờ" hint="JPEG, PNG hoặc WebP, tối đa 5 MB" />
                  {upload.isError && <OpNote tone="danger">{errorMessage(upload.error)}</OpNote>}
                  <div className="op-formfoot">
                    <OpBtn type="submit" disabled={!file || upload.isPending}><FileUp size={16} /> {upload.isPending ? 'Đang gửi…' : 'Gửi giấy tờ'}</OpBtn>
                  </div>
                </form>
              )}
          </div>
        )}
      </QueryView>

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
