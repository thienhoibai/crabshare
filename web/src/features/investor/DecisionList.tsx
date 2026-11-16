/* Các cuộc biểu quyết tập thể của một hoặc nhiều Lô (BR-182, BR-210, BR-211) và nút biểu quyết của nhà đầu tư.
   POST /api/decisions/{decisionNo}/votes { choice: Yes | No }. Mỗi phiếu có trọng số bằng vốn đã chốt.
   Hậu quả của việc thông qua chỉ hiện trong hộp xác nhận khi bấm biểu quyết. */
import { useState } from 'react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import type { CastVoteRequest, DecisionResponse } from '../../shared/api/api.gen'
import { OpBadge, OpBtn, OpConfirm, OpMeter, OpPanel, StatusBadge, formatDateTime, formatVnd, label, useSend } from '../../shared/ui/console'
import { enc } from './investorShared'

const EFFECT: Record<string, string> = {
  EarlyLiquidation: 'Nếu thông qua: Lô thanh lý sớm, các mốc chưa giải ngân dừng lại, cua còn lại được bán rồi quyết toán.',
  SurplusSale: 'Nếu thông qua: người nuôi được mở bán phần dư mà bên cam kết thu mua không mua.',
}

const CHOICE: Record<string, string> = { Yes: 'Đồng ý', No: 'Không đồng ý' }

type Pending = { decision: DecisionResponse; choice: 'Yes' | 'No' }

export function DecisionList({ decisions, showBatch = false }: { decisions: DecisionResponse[]; showBatch?: boolean }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const vote = useSend<DecisionResponse, CastVoteRequest & { decisionNo: string }>(
    'post',
    (body) => `/api/decisions/${enc(body.decisionNo)}/votes`,
    { success: 'Đã ghi nhận phiếu của bạn.', quietError: true, onSuccess: () => setPending(null) },
  )
  const ask = (decision: DecisionResponse, choice: 'Yes' | 'No') => {
    vote.reset()
    setPending({ decision, choice })
  }

  return (
    <>
      {decisions.map((d) => {
        const open = d.status === 'Open'
        return (
          <OpPanel
            key={d.decisionNo}
            accent={d.canVote}
            title={`${label('decisionKind', d.kind)}${showBatch ? ` · Lô ${d.batchCode}` : ''}`}
            action={<StatusBadge kind="decision" value={d.status} />}
          >
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{d.proposal}</p>
            <div className="op-inline">
              <OpBadge tone={open ? 'warn' : 'mute'}>{open ? 'Hạn' : 'Kết thúc'} {formatDateTime(open ? d.closesAt : d.decidedAt ?? d.closesAt)}</OpBadge>
              {d.myChoice && <OpBadge tone="ok">Bạn đã chọn: {CHOICE[d.myChoice] ?? d.myChoice}</OpBadge>}
              {open && !d.myChoice && !d.canVote && <OpBadge>Bạn không có quyền biểu quyết</OpBadge>}
            </div>
            <div className="op-stack">
              <OpMeter label="Đồng ý" value={d.yesCapital} max={d.eligibleCapital} display={`${formatVnd(d.yesCapital)} · ${d.yesPct}%`} tone="var(--ok)" />
              <OpMeter label="Không đồng ý" value={d.noCapital} max={d.eligibleCapital} display={`${formatVnd(d.noCapital)} · ${d.noPct}%`} tone="var(--danger)" />
            </div>
            {d.canVote && (
              <div className="op-formfoot">
                <OpBtn variant="ghost" onClick={() => ask(d, 'No')}><ThumbsDown size={16} /> Không đồng ý</OpBtn>
                <OpBtn onClick={() => ask(d, 'Yes')}><ThumbsUp size={16} /> Đồng ý</OpBtn>
              </div>
            )}
          </OpPanel>
        )
      })}

      {pending && (
        <OpConfirm
          title={`Biểu quyết: ${CHOICE[pending.choice]}`}
          sub={`${label('decisionKind', pending.decision.kind)} · Lô ${pending.decision.batchCode} · ${pending.decision.decisionNo}`}
          confirmLabel={`Gửi phiếu ${CHOICE[pending.choice].toLowerCase()}`}
          variant={pending.choice === 'Yes' ? 'primary' : 'danger'}
          pending={vote.isPending}
          error={vote.error}
          onConfirm={() => vote.mutate({ decisionNo: pending.decision.decisionNo, choice: pending.choice })}
          onClose={() => setPending(null)}
        >
          {EFFECT[pending.decision.kind] && <p>{EFFECT[pending.decision.kind]}</p>}
          <p className="rd-muted">Phiếu tính theo vốn đã chốt của bạn và không đổi lại được.</p>
        </OpConfirm>
      )}
    </>
  )
}
