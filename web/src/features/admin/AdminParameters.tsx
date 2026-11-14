/* /admin/parameters — Tham số nền tảng (BR-217, BR-218): giá trị đang hiệu lực, giá trị đã hẹn ngày, giá trị cũ.
   GET /api/admin/parameters?history=true (lấy cả giá trị cũ, trang tự tách); POST /api/admin/parameters (ParameterChangeRequest).
   Mỗi lần đặt là một dòng mới có ngày hiệu lực; giá trị cũ giữ nguyên. Lô đang chạy giữ giá trị lúc Lô mở gọi vốn.
   Tham số chia nhóm theo tab; lời giải thích của từng tham số hiện trong hộp đặt giá trị. */
import { useState } from 'react'
import { PencilLine } from 'lucide-react'
import type { ParameterChangeRequest, ParameterValueResponse } from '../../shared/api/api.gen'
import {
  Checkbox, DecimalInput, Field, Input, MoneyInput, OpBadge, OpBtn, OpConfirm, OpHeading, OpMore, OpPanel, OpTable, OpTabs, QueryView, TextArea,
  formatDate, formatDateTime, useGet, useSend,
} from '../../shared/ui/console'
import { formatNumber, localToIso, toLocalInput } from './adminPartA'
import { PARAMETER_GROUPS, PARAMETER_META, formatParameter } from './parameterMeta'

interface KeyState { key: string; label: string; current: ParameterValueResponse | null; scheduled: ParameterValueResponse[]; old: ParameterValueResponse[] }

const OTHER = 'Khác'
const groupOf = (key: string) => PARAMETER_META[key]?.group ?? OTHER
const nameOf = (s: { key: string; label: string }) => PARAMETER_META[s.key]?.name ?? s.label

/** Gom các dòng theo khoá: giá trị đang hiệu lực, các giá trị đã hẹn, các giá trị cũ. */
function byKey(rows: ParameterValueResponse[]): KeyState[] {
  const now = Date.now()
  const map = new Map<string, ParameterValueResponse[]>()
  for (const row of rows) map.set(row.key, [...(map.get(row.key) ?? []), row])
  return [...map.entries()].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))
    const past = sorted.filter((r) => Date.parse(r.effectiveFrom) <= now)
    return { key, label: list[0].label, current: past[0] ?? null, scheduled: sorted.filter((r) => Date.parse(r.effectiveFrom) > now).reverse(), old: past.slice(1) }
  })
}

export default function AdminParameters() {
  const list = useGet<ParameterValueResponse[]>('/api/admin/parameters', { history: true })
  const [group, setGroup] = useState(PARAMETER_GROUPS[0])
  const [editing, setEditing] = useState<KeyState | null>(null)

  return (
    <>
      <OpHeading eyebrow="Hệ thống" title="Tham số nền tảng" description="Giá trị mới có ngày hiệu lực, giá trị cũ được giữ lại." />

      <QueryView query={list}>
        {(rows) => {
          const states = byKey(rows)
          const groups = [...PARAMETER_GROUPS, OTHER].filter((g) => states.some((s) => groupOf(s.key) === g))
          const shown = groups.includes(group) ? group : groups[0]
          const items = states.filter((s) => groupOf(s.key) === shown)
          const old = items.flatMap((s) => s.old)
          return (
            <>
              <OpTabs items={groups.map((g) => ({ key: g, label: g }))} value={shown} onChange={setGroup} label="Nhóm tham số" />
              <OpPanel>
                <OpTable
                  rows={items}
                  rowKey={(s) => s.key}
                  empty="Chưa có tham số nào"
                  columns={[
                    { key: 'name', header: 'Tham số', cell: (s) => <b>{nameOf(s)}</b> },
                    {
                      key: 'value', header: 'Đang hiệu lực', num: true,
                      cell: (s) => (s.current ? <b className="rd-num">{formatParameter(s.key, s.current.value)}</b> : <span className="op-warn">Chưa có</span>),
                    },
                    {
                      key: 'next', header: 'Đã hẹn',
                      cell: (s) => (s.scheduled.length
                        ? s.scheduled.map((r) => <div key={r.effectiveFrom}><OpBadge tone="info">{formatParameter(s.key, r.value)}</OpBadge> <small className="rd-muted">từ {formatDate(r.effectiveFrom)}</small></div>)
                        : '—'),
                    },
                    { key: 'act', header: '', cell: (s) => <OpBtn sm variant="ghost" onClick={() => setEditing(s)}><PencilLine size={15} /> Đổi</OpBtn> },
                  ]}
                />
                {old.length > 0 && (
                  <OpMore label="Giá trị cũ" count={old.length}>
                    <OpTable
                      rows={old}
                      rowKey={(r) => `${r.key}-${r.effectiveFrom}`}
                      columns={[
                        { key: 'name', header: 'Tham số', cell: (r) => nameOf(r) },
                        { key: 'value', header: 'Giá trị', num: true, cell: (r) => formatParameter(r.key, r.value) },
                        { key: 'from', header: 'Hiệu lực từ', cell: (r) => <>{formatDateTime(r.effectiveFrom)}{r.note ? <><br /><small className="rd-muted">{r.note}</small></> : null}</> },
                      ]}
                    />
                  </OpMore>
                )}
              </OpPanel>
            </>
          )
        }}
      </QueryView>

      {editing && <ParameterDialog state={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function ParameterDialog({ state, onClose }: { state: KeyState; onClose: () => void }) {
  const meta = PARAMETER_META[state.key]
  const [value, setValue] = useState<number | null>(state.current?.value ?? null)
  const [immediately, setImmediately] = useState(true)
  const [effectiveFrom, setEffectiveFrom] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)))
  const [note, setNote] = useState('')
  const save = useSend<ParameterValueResponse, ParameterChangeRequest>('post', '/api/admin/parameters', {
    success: 'Đã đặt giá trị mới.', quietError: true, onSuccess: onClose,
  })

  const outOfRange = value !== null && meta !== undefined && (value < meta.min || value > meta.max)
  const when = immediately ? new Date().toISOString() : localToIso(effectiveFrom)
  const range = meta ? `Từ ${formatNumber(meta.min)} đến ${formatNumber(meta.max)}${meta.unit ? ` ${meta.unit}` : ''}` : undefined

  return (
    <OpConfirm
      title={nameOf(state)}
      sub={meta?.help ?? state.label}
      confirmLabel="Lưu giá trị mới"
      pending={save.isPending}
      error={save.error}
      disabled={value === null || outOfRange || !when}
      onConfirm={() => { if (value !== null && when) save.mutate({ key: state.key, value, effectiveFrom: when, note: note.trim() || null }) }}
      onClose={onClose}
    >
      {state.current && (
        <p className="rd-muted" style={{ fontSize: 13 }}>
          Đang là {formatParameter(state.key, state.current.value)} từ {formatDate(state.current.effectiveFrom)}{state.current.note ? ` · ${state.current.note}` : ''}
        </p>
      )}
      <Field label="Giá trị mới" required hint={range} error={outOfRange ? `Ngoài khoảng cho phép. ${range ?? ''}` : undefined}>
        {meta?.unit === 'đ'
          ? <MoneyInput value={value} onChange={setValue} autoFocus />
          : <DecimalInput value={value} onChange={setValue} unit={meta?.unit || undefined} autoFocus />}
      </Field>
      <Checkbox checked={immediately} onChange={setImmediately}>Có hiệu lực ngay khi lưu</Checkbox>
      {!immediately && (
        <Field label="Có hiệu lực từ" required>
          <Input type="datetime-local" value={effectiveFrom} min={toLocalInput(new Date())} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </Field>
      )}
      <Field label="Ghi chú">
        <TextArea rows={2} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </OpConfirm>
  )
}
