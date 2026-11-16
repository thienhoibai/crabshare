/* Tab "Đã xử lý" của hàng chờ phân hạng: các quyết định đã chốt của Lô; bấm một con để xem quyết định hiện hành,
   đổi size, hạng hoặc loại bỏ (BR-157). Phiên bản cũ và chi tiết số đo nằm trong phần gấp lại.
   GET /api/crab-units/{crabCode}/grade-decisions. Người không đủ quyền bấm thì lỗi của máy chủ hiện trong hộp xác nhận. */
import { useState } from 'react'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import type { GradeDecisionResponse, SpecCount } from '../../shared/api/api.gen'
import {
  AuthImage, OpBadge, OpBtn, OpEmpty, OpKv, OpMore, OpPanel, QueryView, StatusBadge, formatDateTime, specName, useGet,
} from '../../shared/ui/console'
import { DecisionDialog } from './DecisionDialogs'
import { FOOD_SAFETY, LIVE_STATUS, num } from './qc'

function FinalBadges({ d }: { d: GradeDecisionResponse }) {
  if (d.status !== 'Approved') return <StatusBadge kind="grade" value={d.status} />
  return (
    <>
      <StatusBadge kind="sizeCode" value={d.finalSize} />
      <StatusBadge kind="gradeCode" value={d.finalGrade} />
      {/* Hạng BELOW đã mang nhãn "Dưới chuẩn"; chỉ thêm nhãn khi dưới chuẩn vì ngoài cỡ. */}
      {d.isSubstandard && d.finalGrade !== 'BELOW' && <OpBadge tone="warn">Dưới chuẩn</OpBadge>}
    </>
  )
}

/** Một phiên bản quyết định: kết quả, lý do, ảnh; phần còn lại gấp trong "Chi tiết". */
function Version({ d }: { d: GradeDecisionResponse }) {
  return (
    <article className="qc-version">
      <div className="op-between">
        <b>Phiên bản {d.versionNo}</b>
        <span className="op-inline"><FinalBadges d={d} /></span>
      </div>
      {(d.reason || d.sensoryNote) && <p>{[d.reason, d.sensoryNote].filter(Boolean).join(' · ')}</p>}
      {d.hasPhoto && (
        <div className="op-thumbs">
          <AuthImage path={`/api/grade-decisions/${encodeURIComponent(d.decisionNo)}/photo`} alt={`Ảnh quyết định phiên bản ${d.versionNo} của ${d.crabCode}`} />
        </div>
      )}
      <OpMore label="Chi tiết">
        <OpKv items={[
          { label: 'Đề xuất', value: specName(null, d.proposedSize, d.proposedGrade) },
          { label: 'Quy cách', value: d.specCode ? <span className="op-mono">{d.specCode}</span> : null },
          { label: 'Khối lượng', value: d.weightG === null ? null : `${num(d.weightG, 1)} g` },
          { label: 'Chỉ số C', value: d.cIndex === null ? null : num(d.cIndex, 4) },
          { label: 'Tình trạng', value: d.liveStatus ? LIVE_STATUS[d.liveStatus] ?? d.liveStatus : null },
          { label: 'An toàn thực phẩm', value: d.foodSafety ? FOOD_SAFETY[d.foodSafety] ?? d.foodSafety : null },
          { label: 'Lúc', value: formatDateTime(d.decidedAt ?? d.createdAt) },
          { label: 'Xác nhận lần hai', value: formatDateTime(d.secondConfirmedAt) },
        ].filter((i) => i.value !== null && i.value !== '')} />
      </OpMore>
    </article>
  )
}

function CrabHistory({ crabCode, onBack }: { crabCode: string; onBack: () => void }) {
  const history = useGet<GradeDecisionResponse[]>(`/api/crab-units/${encodeURIComponent(crabCode)}/grade-decisions`)
  const [dialog, setDialog] = useState<'revise' | 'reject' | null>(null)
  return (
    <OpPanel title={crabCode} action={<OpBtn variant="ghost" sm onClick={onBack}><ArrowLeft size={15} /> Danh sách</OpBtn>}>
      <QueryView query={history} empty="Con cua này chưa có quyết định">
        {(list) => {
          const current = list.find((d) => d.isCurrent) ?? list[list.length - 1]
          const older = list.filter((d) => d !== current).reverse()
          return (
            <>
              <Version d={current} />
              {current.isCurrent && current.status === 'Approved' && (
                <div className="qc-acts">
                  <OpBtn onClick={() => setDialog('revise')}><Pencil size={17} /> Đổi size, hạng</OpBtn>
                  <OpBtn variant="danger" onClick={() => setDialog('reject')}><Trash2 size={17} /> Loại bỏ</OpBtn>
                </div>
              )}
              {older.length > 0 && (
                <OpMore label="Phiên bản trước" count={older.length}>
                  {older.map((d) => <Version key={d.decisionNo} d={d} />)}
                </OpMore>
              )}
              {dialog && <DecisionDialog kind={dialog} decision={current} onClose={() => setDialog(null)} />}
            </>
          )
        }}
      </QueryView>
    </OpPanel>
  )
}

export function HandledDecisions({ decisions, bySpec }: { decisions: GradeDecisionResponse[]; bySpec: SpecCount[] }) {
  const [crab, setCrab] = useState<string | null>(null)
  if (crab) return <CrabHistory crabCode={crab} onBack={() => setCrab(null)} />
  if (decisions.length === 0) return <OpEmpty title="Chưa có con nào được duyệt hoặc loại" />
  return (
    <OpPanel>
      <div className="qc-lines">
        {decisions.map((d) => (
          <button key={d.decisionNo} type="button" onClick={() => setCrab(d.crabCode)}>
            <span><b className="op-mono">{d.crabCode}</b><small>{num(d.weightG, 1)} g{d.versionNo > 1 ? ` · phiên bản ${d.versionNo}` : ''}</small></span>
            <span className="qc-lines__end"><FinalBadges d={d} /></span>
          </button>
        ))}
      </div>
      {bySpec.length > 0 && (
        <OpMore label="Theo quy cách" count={bySpec.length}>
          <ul className="qc-lines">
            {bySpec.map((s) => (
              <li key={`${s.specCode}-${s.size}-${s.grade}`}>
                <b>{specName(null, s.size, s.grade)}</b>
                <span className="qc-lines__end">{s.count} con</span>
              </li>
            ))}
          </ul>
        </OpMore>
      )}
    </OpPanel>
  )
}
