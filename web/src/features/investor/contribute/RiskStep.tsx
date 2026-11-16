/* Bước 2 của luồng góp vốn (UC11): đọc hết bản công bố rủi ro đang hiệu lực rồi xác nhận.
   GET /api/risk-disclosures/active, POST /api/risk-acknowledgements { riskDisclosureId, scrolledToEnd: true }.
   Toàn văn bản công bố là nội dung pháp lý nên hiện đầy đủ; ngoài ra chỉ có một ô xác nhận và một nút. */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { AcknowledgeRiskRequest, RiskAcknowledgementResponse, RiskDisclosureResponse } from '../../../shared/api/api.gen'
import { Checkbox, OpBadge, OpBtn, OpPanel, QueryView, useGet, useSend } from '../../../shared/ui/console'
import '../investorPages.css'

/** Hiện toàn văn đúng như tệp đã băm: tiêu đề, đoạn văn, danh sách đánh số; ý có dấu ★ được làm nổi bật. */
function DisclosureText({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let items: string[] = []
  const flush = () => {
    if (items.length === 0) return
    blocks.push(<ol key={blocks.length}>{items.map((t, i) => <li key={i} className={t.includes('★') ? 'is-key' : undefined}>{t}</li>)}</ol>)
    items = []
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const numbered = /^\d+\.\s+(.*)$/.exec(line)
    if (numbered) {
      items.push(numbered[1])
      continue
    }
    flush()
    if (!line) continue
    blocks.push(line.startsWith('# ') ? <h3 key={blocks.length} className="rd-h3">{line.slice(2)}</h3> : <p key={blocks.length}>{line}</p>)
  }
  flush()
  return <>{blocks}</>
}

export function RiskStep({ onAcknowledged }: { onAcknowledged: () => void }) {
  const disclosure = useGet<RiskDisclosureResponse>('/api/risk-disclosures/active')
  const acknowledge = useSend<RiskAcknowledgementResponse, AcknowledgeRiskRequest>('post', '/api/risk-acknowledgements', {
    success: 'Đã ghi nhận xác nhận rủi ro.',
    onSuccess: onAcknowledged,
  })
  const box = useRef<HTMLDivElement>(null)
  const [atEnd, setAtEnd] = useState(false)
  const [agree, setAgree] = useState(false)

  // Nội dung ngắn hơn khung (màn hình cao) thì coi như đã cuộn hết.
  useLayoutEffect(() => {
    const el = box.current
    if (el && el.scrollHeight <= el.clientHeight + 8) setAtEnd(true)
  }, [disclosure.data])

  const onScroll = () => {
    const el = box.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setAtEnd(true)
  }

  return (
    <QueryView query={disclosure}>
      {(d) => (
        <OpPanel title="Công bố rủi ro" action={<OpBadge>{d.versionCode}</OpBadge>}>
          <div ref={box} className="inv-risk" onScroll={onScroll} tabIndex={0} role="document" aria-label="Nội dung công bố rủi ro">
            <DisclosureText text={d.content} />
          </div>
          {!d.acknowledgedAt && (
            <Checkbox checked={agree} onChange={setAgree} disabled={!atEnd || acknowledge.isPending}>
              {atEnd ? 'Tôi đã đọc hết và hiểu các rủi ro trên.' : 'Cuộn tới cuối để xác nhận.'}
            </Checkbox>
          )}
          <div className="op-formfoot">
            {d.acknowledgedAt ? (
              <OpBtn onClick={onAcknowledged}>Tiếp tục</OpBtn>
            ) : (
              <OpBtn
                disabled={!atEnd || !agree || acknowledge.isPending}
                onClick={() => acknowledge.mutate({ riskDisclosureId: d.riskDisclosureId, scrolledToEnd: true })}
              >
                {acknowledge.isPending ? 'Đang ghi nhận…' : 'Xác nhận đã đọc'}
              </OpBtn>
            )}
          </div>
        </OpPanel>
      )}
    </QueryView>
  )
}
