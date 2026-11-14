/* /admin/grading — Bộ quy tắc phân hạng theo loại cua và phiên bản (GET /api/admin/grade-rule-sets), tạo bản nháp mới (BR-038). */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FilePlus2 } from 'lucide-react'
import type { CreateRuleSetRequest, GradeRuleSetResponse, GradingStandardResponse } from '../../../shared/api/api.gen'
import {
  DecimalInput, Field, Input, OpBtn, OpConfirm, OpHeading, OpMore, OpNote, OpPanel, OpTable, OpTabs, QueryView, Select, StatusBadge, TextArea,
  formatDate, label, useGet, useSend,
} from '../../../shared/ui/console'
import { RULE_CRAB_TYPES } from './ruleSetModel'
import { Cell } from './shared'

type Tab = 'all' | 'Active' | 'Draft' | 'Retired'

function CreateDraftDialog({ sets, onClose }: { sets: GradeRuleSetResponse[]; onClose: () => void }) {
  const navigate = useNavigate()
  const [crabType, setCrabType] = useState<string>(RULE_CRAB_TYPES[0])
  const [nearPct, setNearPct] = useState<number | null>(null)
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [note, setNote] = useState('')
  const create = useSend<GradeRuleSetResponse, CreateRuleSetRequest>('post', '/api/admin/grade-rule-sets', {
    quietError: true,
    success: 'Đã tạo bản nháp bộ quy tắc.',
    onSuccess: (set) => navigate(`/admin/grading/${set.id}`),
  })
  const active = sets.find((s) => s.crabType === crabType && s.status === 'Active')
  const draft = sets.find((s) => s.crabType === crabType && s.status === 'Draft')
  const nearInvalid = nearPct !== null && (nearPct < 0 || nearPct > 20)

  return (
    <OpConfirm
      title="Tạo bản nháp bộ quy tắc"
      confirmLabel="Tạo bản nháp"
      pending={create.isPending}
      error={create.error}
      disabled={!!draft || nearInvalid}
      onClose={onClose}
      onConfirm={() => create.mutate({
        crabType,
        nearThresholdPct: nearPct,
        effectiveFrom: effectiveFrom ? `${effectiveFrom}T00:00:00+07:00` : null,
        note: note.trim() || null,
      })}
    >
      <Field label="Loại cua" required>
        <Select value={crabType} onChange={(e) => setCrabType(e.target.value)}>
          {RULE_CRAB_TYPES.map((t) => <option key={t} value={t}>{label('crabType', t)}</option>)}
        </Select>
      </Field>
      {draft ? (
        <OpNote tone="danger">
          Loại cua này đã có bản nháp. <a className="op-link" href={`/admin/grading/${draft.id}`}>Mở bản nháp</a>
        </OpNote>
      ) : (
        <p className="op-muted">{active ? `Chép ${active.rules.length} quy tắc của phiên bản ${active.versionNo} đang áp dụng.` : 'Bản nháp bắt đầu trống.'}</p>
      )}
      <OpMore label="Tuỳ chọn thêm">
        <div className="op-form__row">
          <Field label="Dải sát ngưỡng" error={nearInvalid ? 'Từ 0 đến 20%.' : undefined}>
            <DecimalInput value={nearPct} onChange={setNearPct} unit="%" />
          </Field>
          <Field label="Áp dụng từ ngày">
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>
        </div>
        <Field label="Ghi chú">
          <TextArea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </OpMore>
    </OpConfirm>
  )
}

export default function RuleSetsPage() {
  const standards = useGet<GradingStandardResponse[]>('/api/admin/grade-rule-sets')
  const [tab, setTab] = useState<Tab>('all')
  const [creating, setCreating] = useState(false)

  const all = (standards.data ?? []).flatMap((s) => s.ruleSets)
  const count = (status: string) => all.filter((s) => s.status === status).length
  const rows = all
    .filter((s) => tab === 'all' || s.status === tab)
    .sort((a, b) => label('crabType', a.crabType).localeCompare(label('crabType', b.crabType), 'vi') || b.versionNo - a.versionNo)

  return (
    <>
      <OpHeading
        eyebrow="Chất lượng"
        title="Bộ quy tắc phân hạng"
        description="Ngưỡng size và hạng theo từng loại cua."
        action={<OpBtn onClick={() => setCreating(true)}><FilePlus2 size={17} /> Tạo bản nháp</OpBtn>}
      />
      <QueryView query={standards} empty="Chưa có chuẩn phân hạng nào">
        {(list) => (
          <>
            {list.map((s) => (
              <p key={`${s.standardCode}-${s.revision}`} className="op-muted">
                Chuẩn tham chiếu nội bộ <b>{s.standardCode}</b> · {s.issuer} · áp dụng từ {formatDate(s.effectiveFrom)}
              </p>
            ))}
            <OpTabs
              value={tab}
              onChange={setTab}
              items={[
                { key: 'all', label: 'Tất cả' },
                { key: 'Active', label: 'Đang áp dụng', count: count('Active') },
                { key: 'Draft', label: 'Bản nháp', count: count('Draft') },
                { key: 'Retired', label: 'Đã thay thế' },
              ]}
            />
            <OpPanel>
              <OpTable
                rows={rows}
                rowKey={(r) => r.id}
                empty={tab === 'Draft' ? 'Chưa có bản nháp nào' : 'Không có bộ quy tắc nào ở mục này'}
                columns={[
                  { key: 'crab', header: 'Loại cua', cell: (r) => <Cell main={<b>{label('crabType', r.crabType)}</b>} sub={`Phiên bản ${r.versionNo}`} /> },
                  { key: 'status', header: 'Trạng thái', cell: (r) => <StatusBadge kind="ruleSet" value={r.status} /> },
                  { key: 'from', header: 'Áp dụng từ', cell: (r) => formatDate(r.effectiveFrom) },
                  { key: 'near', header: 'Sát ngưỡng', num: true, cell: (r) => `${r.nearThresholdPct}%` },
                  { key: 'rules', header: 'Số quy tắc', num: true, cell: (r) => r.rules.length },
                  { key: 'go', header: '', cell: (r) => <a className="op-link" href={`/admin/grading/${r.id}`}>{r.status === 'Draft' ? 'Sửa' : 'Xem'}</a> },
                ]}
              />
            </OpPanel>
          </>
        )}
      </QueryView>
      {creating && <CreateDraftDialog sets={all} onClose={() => setCreating(false)} />}
    </>
  )
}
