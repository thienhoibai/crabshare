import { useRef, useState, type FormEvent } from 'react'
import axios from 'axios'
import { errorMessage, type ApiProblem } from '../../shared/api/http'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpHeading, OpNote, OpPanel } from './operatorUi'
import {
  useOperatorApplication,
  useSaveOperatorApplication,
  useSubmitOperatorApplication,
  type OperatorProfile
} from './operatorsApi'

const fields: { name: keyof OperatorProfile; label: string; maxLength: number }[] = [
  { name: 'legalName', label: 'Tên pháp nhân', maxLength: 200 },
  { name: 'taxCode', label: 'Mã số thuế', maxLength: 14 },
  { name: 'businessRegNo', label: 'Số đăng ký kinh doanh', maxLength: 30 },
  { name: 'farmAddress', label: 'Địa chỉ trại', maxLength: 300 }
]
const statusLabels = {
  Draft: 'Nháp',
  Submitted: 'Đã gửi',
  Rejected: 'Bị từ chối',
  Approved: 'Đã duyệt',
  Suspended: 'Đình chỉ'
}
const statusGuidance = {
  Draft: 'Kiểm tra thông tin pháp lý và địa chỉ trại trước khi gửi hồ sơ xét duyệt.',
  Submitted: 'Hồ sơ đang chờ xét duyệt. Trạng thái sẽ tự cập nhật khi có kết quả.',
  Approved: 'Hồ sơ đã được duyệt. Bạn có thể quản lý hộp nuôi và lập đề xuất lô nuôi.',
  Rejected: 'Bạn có thể sửa và lưu hồ sơ bị từ chối. Chức năng gửi lại chưa được hỗ trợ.',
  Suspended: 'Hộ nuôi đang bị đình chỉ. Liên hệ quản trị viên để được hướng dẫn.'
}

export default function OperatorRegistration() {
  const query = useOperatorApplication()
  const save = useSaveOperatorApplication()
  const submit = useSubmitOperatorApplication()
  const busy = useRef(false)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState<unknown>(null)
  const application = query.data
  const canEdit = !application || application.canEdit
  const canSubmit = !application || application.canSubmit
  const errors = axios.isAxiosError<ApiProblem>(failure) ? failure.response?.data.errors : undefined

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const send = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-intent') === 'submit'
    if (busy.current || !canEdit || (send && !canSubmit)) return
    const form = new FormData(event.currentTarget)
    const profile = Object.fromEntries(
      fields.map(({ name }) => [name, String(form.get(name) ?? '').trim()])
    ) as OperatorProfile
    setMessage('')
    setFailure(null)
    if (fields.some(({ name }) => !profile[name])) {
      setMessage('Vui lòng điền đầy đủ thông tin, không chỉ nhập khoảng trắng.')
      return
    }
    busy.current = true
    setProcessing(true)
    try {
      await save.mutateAsync({ profile, exists: !!application })
      if (send) await submit.mutateAsync()
      setMessage(send ? 'Đã gửi hồ sơ xét duyệt.' : 'Đã lưu hồ sơ hộ nuôi.')
    } catch (error) {
      setFailure(error)
      // Tải lại quyền/trạng thái nếu hồ sơ đã thay đổi ở phiên khác.
      if (axios.isAxiosError(error) && [403, 409, 422].includes(error.response?.status ?? 0))
        void query.refetch()
    } finally {
      busy.current = false
      setProcessing(false)
    }
  }

  return (
    <OperatorLayout activeTab="register">
      <OpHeading
        eyebrow="Hồ sơ hộ nuôi"
        title="Đăng ký hộ nuôi"
        description="Lưu hồ sơ nháp và gửi xét duyệt để đăng ký hộ nuôi trên CrabShare."
      />
      {query.isPending ? (
        <p role="status">Đang tải hồ sơ…</p>
      ) : query.isError ? (
        <OpPanel title="Không tải được hồ sơ">
          <p role="alert">{errorMessage(query.error)}</p>
          <OpBtn variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
            Thử lại
          </OpBtn>
        </OpPanel>
      ) : (
        <OpPanel
          title="Thông tin hộ nuôi"
          action={
            <OpBadge
              tone={
                application?.status === 'Approved'
                  ? 'ok'
                  : application?.status === 'Submitted'
                    ? 'info'
                    : 'mute'
              }
            >
              {application ? statusLabels[application.status] : 'Chưa có hồ sơ'}
            </OpBadge>
          }
        >
          <div className="space-y-5">
            {application && (
              <OpNote tone={application.status === 'Approved' ? 'ok' : 'info'}>
                {statusGuidance[application.status]}
              </OpNote>
            )}
            {application?.memberRole === 'Staff' && (
                <OpNote>Chỉ chủ hộ nuôi được gửi hồ sơ xét duyệt.</OpNote>
            )}
            {message && <p role="status">{message}</p>}
            {!!failure && (
              <div role="alert">
                <OpNote tone="danger">{errorMessage(failure)}</OpNote>
              </div>
            )}
            <form
              key={JSON.stringify(application)}
              onSubmit={handleSave}
              className="space-y-5"
              aria-busy={processing}
            >
              <fieldset disabled={!canEdit || processing} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {fields.map(({ name, label, maxLength }) => {
                  const fieldErrors = errors?.[name] ?? errors?.[name[0].toUpperCase() + name.slice(1)]
                  return (
                    <div className="op-field" key={name}>
                      <label htmlFor={name}>{label}</label>
                      <input
                        className="op-input"
                        id={name}
                        name={name}
                        defaultValue={application?.[name] ?? ''}
                        required
                        maxLength={maxLength}
                        aria-invalid={!!fieldErrors}
                        aria-describedby={fieldErrors ? `${name}-error` : undefined}
                      />
                      {fieldErrors && (
                        <p id={`${name}-error`} className="text-sm text-red-700">
                          {fieldErrors.join(' ')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </fieldset>
              <div className="op-actions">
                {canEdit && (
                  <OpBtn type="submit" variant="outline" disabled={processing}>
                    {processing ? 'Đang xử lý…' : application ? 'Lưu thay đổi' : 'Tạo hồ sơ nháp'}
                  </OpBtn>
                )}
                {canEdit && canSubmit && (
                  <OpBtn type="submit" data-intent="submit" disabled={processing}>
                    Lưu và gửi hồ sơ
                  </OpBtn>
                )}
              </div>
            </form>
          </div>
        </OpPanel>
      )}
    </OperatorLayout>
  )
}
