import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Printer, QrCode, RefreshCw } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { ActionDialog } from '../../shared/ui/ActionDialog'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpHeading, OpNote, OpPanel } from './operatorUi'
import { useOperatorApplication } from './operatorsApi'
import { tagsApi, type TagLabel, type TagListItem, type TagStatus } from './tagsApi'
import './tags-print.css'

const states: { value: TagStatus; label: string; tone: 'ok' | 'info' | 'danger' }[] = [
  { value: 'Printed', label: 'Đã in', tone: 'info' },
  { value: 'Active', label: 'Đang hoạt động', tone: 'ok' },
  { value: 'Void', label: 'Đã hủy', tone: 'danger' }
]
const date = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })

function Label({ tag, label, print = false }: { tag: TagListItem; label: TagLabel; print?: boolean }) {
  return (
    <div className={`tag-label ${print ? 'tag-print-label' : ''}`}>
      <QRCodeSVG value={label.traceUrl} level="M" marginSize={1} title={`Mã QR tem ${tag.tagCode}`} />
      <div className="tag-label__meta">
        <b>{tag.tagCode}</b>
        <span>Lô {tag.batchCode}</span>
        <span>{tag.itemUuid}</span>
        <span>Truy xuất CrabShare</span>
      </div>
    </div>
  )
}

export default function OperatorTags() {
  const userId = useAuthStore((s) => s.user?.userId)
  const application = useOperatorApplication()
  const cache = useQueryClient()
  const owner = application.data?.memberRole === 'Owner'
  const [status, setStatus] = useState<TagStatus>('Printed')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [voidTarget, setVoidTarget] = useState<TagListItem | null>(null)
  const [reason, setReason] = useState('')
  const [voidBusy, setVoidBusy] = useState(false)
  const voidInFlight = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [replacement, setReplacement] = useState<TagListItem | null>(null)
  const [printCodes, setPrintCodes] = useState<string[]>([])
  const tags = useQuery({
    queryKey: ['operator-tags', userId, status, page],
    queryFn: ({ signal }) => tagsApi.list(status, page, signal),
    retry: false
  })
  const selectedTags = useMemo(
    () => tags.data?.items.filter((item) => selected.includes(item.tagCode)) ?? [],
    [tags.data, selected]
  )
  const labels = useQuery({
    queryKey: ['operator-tag-labels', userId, selectedTags.map((item) => item.tagCode)],
    enabled: selectedTags.length > 0,
    queryFn: async ({ signal }) =>
      Promise.all(
        selectedTags.map(async (tag) => [tag.tagCode, await tagsApi.label(tag.tagCode, signal)] as const)
      ),
    retry: false
  })
  const replacementLabel = useQuery({
    queryKey: ['operator-tag-label', userId, replacement?.tagCode],
    enabled: !!replacement,
    queryFn: ({ signal }) => tagsApi.label(replacement!.tagCode, signal),
    retry: false
  })

  const toggle = (tag: TagListItem) =>
    setSelected((current) =>
      current.includes(tag.tagCode)
        ? current.filter((code) => code !== tag.tagCode)
        : [...current, tag.tagCode]
    )
  const refresh = async () => {
    setError('')
    await tags.refetch()
  }
  const printSelected = () => {
    if (selectedTags.length && labels.data?.length === selectedTags.length) {
      setPrintCodes(selectedTags.map((tag) => tag.tagCode))
      window.setTimeout(() => window.print(), 0)
    }
  }
  const printReplacement = () => {
    if (replacement && replacementLabel.data) {
      setPrintCodes([replacement.tagCode])
      window.setTimeout(() => window.print(), 0)
    }
  }
  async function confirmVoid() {
    if (voidInFlight.current || !voidTarget || !reason.trim() || reason.trim().length > 200) return
    // Chặn gửi lặp ngay lập tức, trước khi React cập nhật nút sang trạng thái đang xử lý.
    voidInFlight.current = true
    setVoidBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await tagsApi.voidAndReplace(voidTarget.tagCode, reason.trim())
      setReplacement(result.replacementTag)
      setSelected((current) => current.filter((code) => code !== voidTarget.tagCode))
      setVoidTarget(null)
      setReason('')
      setNotice(
        `Tem ${result.voidedTag.tagCode} đã được hủy; tem thay thế ${result.replacementTag.tagCode} đã tạo ở trạng thái Đã in.`
      )
      await cache.invalidateQueries({ queryKey: ['operator-tags', userId] })
    } catch (e) {
      const conflict = axios.isAxiosError(e) && e.response?.status === 409
      setError(
        `${conflict ? 'Trạng thái tem đã thay đổi trên máy chủ. Danh sách đã được làm mới; hãy kiểm tra tem trước khi thử lại. ' : ''}${errorMessage(e)}`
      )
      if (conflict) await cache.invalidateQueries({ queryKey: ['operator-tags', userId] })
    } finally {
      voidInFlight.current = false
      setVoidBusy(false)
    }
  }

  return (
    <OperatorLayout activeTab="tags">
      <OpHeading
        eyebrow="Thu hoạch"
        title="Quản lý tem truy xuất"
        description="Xem và in nhãn QR thật cho tem. Hủy hoặc thay tem chỉ dành cho chủ hộ nuôi."
        action={
          <OpBtn variant="ghost" onClick={() => void refresh()}>
            <RefreshCw size={16} /> Làm mới
          </OpBtn>
        }
      />
      {error && !voidTarget && (
        <div role="alert">
          <OpNote tone="danger">{error}</OpNote>
        </div>
      )}
      {notice && (
        <div role="status">
          <OpNote tone="ok">{notice}</OpNote>
        </div>
      )}
      <OpPanel
        title="Danh sách tem"
        subtitle="Lọc theo trạng thái và chọn tem Đã in để xem trước hoặc in nhãn 40 × 30 mm."
      >
        <div className="tag-actions">
          <div className="op-field">
            <label htmlFor="tag-status">Trạng thái tem</label>
            <select
              id="tag-status"
              className="op-select"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as TagStatus)
                setPage(1)
                setSelected([])
              }}
            >
              {states.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {status === 'Printed' && (
            <OpBtn disabled={!selected.length || labels.isPending || labels.isError} onClick={printSelected}>
              <Printer size={16} /> In {selected.length || ''} nhãn đã chọn
            </OpBtn>
          )}
        </div>
        {tags.isPending && <p role="status">Đang tải danh sách tem…</p>}
        {tags.isError && (
          <OpNote tone="danger">
            {errorMessage(tags.error)}{' '}
            <OpBtn variant="ghost" onClick={() => void tags.refetch()}>
              Tải lại
            </OpBtn>
          </OpNote>
        )}
        {tags.data && (
          <>
            {tags.data.items.length === 0 ? (
              <div className="op-empty">
                <QrCode size={28} />
                <b>Chưa có tem ở trạng thái này</b>
                <span>Hãy chọn trạng thái khác hoặc quay lại sau.</span>
              </div>
            ) : (
              <div className="op-tablewrap">
                <table className="op-table">
                  <thead>
                    <tr>
                      <th>Chọn</th>
                      <th>Mã tem</th>
                      <th>Trạng thái</th>
                      <th>Lô</th>
                      <th>Mã cá thể</th>
                      <th>Thời điểm in</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tags.data.items.map((tag) => (
                      <tr key={tag.tagCode}>
                        <td>
                          {tag.status === 'Printed' ? (
                            <input
                              className="tag-table-check"
                              type="checkbox"
                              aria-label={`Chọn tem ${tag.tagCode}`}
                              checked={selected.includes(tag.tagCode)}
                              onChange={() => toggle(tag)}
                            />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="op-mono">{tag.tagCode}</td>
                        <td>
                          <OpBadge tone={states.find((s) => s.value === tag.status)?.tone ?? 'mute'}>
                            {states.find((s) => s.value === tag.status)?.label ?? tag.status}
                          </OpBadge>
                        </td>
                        <td>{tag.batchCode}</td>
                        <td className="op-mono">{tag.itemUuid}</td>
                        <td>{date(tag.printedAt)}</td>
                        <td>
                          {owner && tag.status !== 'Void' && (
                            <OpBtn
                              sm
                              variant="danger"
                              onClick={() => {
                                setVoidTarget(tag)
                                setReason('')
                                setError('')
                              }}
                            >
                              Hủy / thay
                            </OpBtn>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tags.data.total > tags.data.pageSize && (
              <div className="op-pager">
                <span>{tags.data.total} tem</span>
                <div>
                  <OpBtn
                    sm
                    variant="ghost"
                    disabled={page <= 1}
                    onClick={() => {
                      setSelected([])
                      setPage((p) => p - 1)
                    }}
                  >
                    Trang trước
                  </OpBtn>
                  <span>
                    Trang {page} / {Math.ceil(tags.data.total / tags.data.pageSize)}
                  </span>
                  <OpBtn
                    sm
                    variant="ghost"
                    disabled={page * tags.data.pageSize >= tags.data.total}
                    onClick={() => {
                      setSelected([])
                      setPage((p) => p + 1)
                    }}
                  >
                    Trang sau
                  </OpBtn>
                </div>
              </div>
            )}
          </>
        )}
      </OpPanel>
      {status === 'Printed' && selectedTags.length > 0 && (
        <OpPanel title="Xem trước nhãn" subtitle="Tra cứu nhãn không làm thay đổi trạng thái tem.">
          {labels.isPending && <p role="status">Đang tải đường dẫn tra cứu…</p>}
          {labels.isError && (
            <OpNote tone="danger">
              {errorMessage(labels.error)}{' '}
              <OpBtn variant="ghost" onClick={() => void labels.refetch()}>
                Tải lại nhãn
              </OpBtn>
            </OpNote>
          )}
          {labels.data && (
            <div className="tag-label-grid">
              {labels.data.map(([code, label]) => {
                const tag = selectedTags.find((item) => item.tagCode === code)!
                return (
                  <div key={code}>
                    <Label tag={tag} label={label} />
                    <a className="rd-link" href={label.traceUrl} target="_blank" rel="noreferrer">
                      Mở trang truy xuất
                    </a>
                  </div>
                )
              })}
            </div>
          )}
        </OpPanel>
      )}
      {replacement && (
        <OpPanel
          title="Tem thay thế"
          subtitle="Tem mới ở trạng thái Đã in; việc xem hoặc in nhãn không kích hoạt tem."
        >
          <p>
            <b className="op-mono">{replacement.tagCode}</b> · lô {replacement.batchCode} ·{' '}
            {replacement.itemUuid}
          </p>
          {replacementLabel.isPending && <p role="status">Đang tải nhãn thay thế…</p>}
          {replacementLabel.isError && (
            <OpNote tone="danger">
              {errorMessage(replacementLabel.error)}{' '}
              <OpBtn variant="ghost" onClick={() => void replacementLabel.refetch()}>
                Tải lại nhãn
              </OpBtn>
            </OpNote>
          )}
          {replacementLabel.data && (
            <div className="tag-actions">
              <Label tag={replacement} label={replacementLabel.data} />
              <OpBtn onClick={printReplacement}>
                <Printer size={16} /> In nhãn thay thế
              </OpBtn>
            </div>
          )}
        </OpPanel>
      )}
      {voidTarget && (
        <ActionDialog
          title="Hủy và thay tem?"
          theme="operator"
          busy={voidBusy}
          onClose={() => setVoidTarget(null)}
        >
          <form
            className="op-form"
            onSubmit={(event) => {
              event.preventDefault()
              void confirmVoid()
            }}
          >
            <p className="op-mono">
              {voidTarget.tagCode} · {states.find((state) => state.value === voidTarget.status)?.label}
            </p>
            <p>
              Máy chủ sẽ kiểm tra trạng thái hiện tại và tạo tem thay thế. Thao tác này không thể hoàn tác.
            </p>
            <div className="op-field">
              <label htmlFor="tag-void-reason">Lý do (bắt buộc, tối đa 200 ký tự)</label>
              <textarea
                id="tag-void-reason"
                className="op-textarea"
                required
                maxLength={200}
                value={reason}
                disabled={voidBusy}
                onChange={(event) => setReason(event.target.value)}
                aria-describedby="tag-reason-help"
              />
              <small id="tag-reason-help">
                {reason.trim().length} / 200 ký tự sau khi bỏ khoảng trắng đầu/cuối.
              </small>
            </div>
            {error && (
              <div role="alert">
                <OpNote tone="danger">{error}</OpNote>
              </div>
            )}
            <div className="op-actions">
              <OpBtn type="button" variant="ghost" disabled={voidBusy} onClick={() => setVoidTarget(null)}>
                Quay lại
              </OpBtn>
              <OpBtn
                type="submit"
                variant="danger"
                disabled={voidBusy || !reason.trim() || reason.trim().length > 200}
              >
                {voidBusy ? 'Đang hủy và thay…' : 'Xác nhận hủy và thay'}
              </OpBtn>
            </div>
          </form>
        </ActionDialog>
      )}
      <div className="tag-print-area" aria-hidden="true">
        {printCodes.map((code) => {
          if (replacement?.tagCode === code && replacementLabel.data)
            return <Label key={code} tag={replacement} label={replacementLabel.data} print />
          const item = labels.data?.find(([labelCode]) => labelCode === code)
          const tag = selectedTags.find((value) => value.tagCode === code)
          return item && tag ? <Label key={code} tag={tag} label={item[1]} print /> : null
        })}
      </div>
    </OperatorLayout>
  )
}
