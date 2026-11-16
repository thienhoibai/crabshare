/* Phần dùng chung của cổng nhà đầu tư: đường dẫn, danh mục của tôi, gọi nhiều API theo từng Lô, ba số tiền (BR-232). */
import { useQueries, type QueryFunctionContext } from '@tanstack/react-query'
import type { MoneyFigures, PortfolioItem, PortfolioPage } from '../../shared/api/api.gen'
import { OpFacts, OpStat, formatVnd, http, useGet } from '../../shared/ui/console'

export const enc = encodeURIComponent

export type PortfolioTab = 'khoan-gop' | 'nhat-trinh' | 'thiet-bi' | 'bieu-quyet' | 'quyet-toan'

export const portfolioHref = (code: string, tab?: PortfolioTab) => `/nha-dau-tu/danh-muc/${enc(code)}${tab ? `?tab=${tab}` : ''}`
export const fundingHref = (code: string) => `/nha-dau-tu/lo/${enc(code)}`
export const contributeHref = (code: string) => `/nha-dau-tu/gop-von/${enc(code)}`
export const batchApi = (code: string, tail: string) => `/api/batches/${enc(code)}/${tail}`

/** Mọi Lô tôi đã góp (tối đa 100 Lô, là mức trần của API). */
export const usePortfolio = () => useGet<PortfolioPage>('/api/investor/portfolio', { pageSize: 100 })

/** Lô đã chốt vốn: phần vốn của tôi đã cố định nên xem được ba số tiền và các cuộc biểu quyết của Lô. */
export const isFrozen = (p: PortfolioItem) => p.capitalBasis === 'Frozen'

/** "60%" từ tỷ lệ vốn 0,6. Đây là tỷ lệ vốn góp trong Lô, không phải tỷ lệ tiền nhận về. */
export const ratioText = (ratio: number | null) => (ratio === null ? '—' : `${(ratio * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`)

/**
 * GET nhiều đường dẫn cùng lúc, mỗi Lô một lần gọi. Dùng chung khoá bộ nhớ đệm với useGet(url) nên tự tải lại sau mỗi lần ghi.
 * Không thử lại khi lỗi: Lô chưa chốt vốn trả 403 cho ba số tiền và biểu quyết.
 */
export function useGetMany<T>(urls: string[]) {
  return useQueries({
    queries: urls.map((url) => ({
      queryKey: [url, undefined],
      queryFn: async ({ signal }: QueryFunctionContext) => (await http.get<T>(url, { signal })).data,
      retry: false,
    })),
  })
}

export const sumFigures = (list: MoneyFigures[]): MoneyFigures =>
  list.reduce((sum, f) => ({ contributed: sum.contributed + f.contributed, disbursed: sum.disbursed + f.disbursed, heldInAccount: sum.heldInAccount + f.heldInAccount }),
    { contributed: 0, disbursed: 0, heldInAccount: 0 })

const plain = (n: number) => new Intl.NumberFormat('vi-VN').format(n)

/** Thẻ lớn nền tối với đủ ba số: đã góp (số lớn), đã giải ngân theo mốc và còn giữ (hai số dưới, số 0 vẫn hiện). */
export function MoneyStat({ title, figures, sub }: { title: string; figures: MoneyFigures; sub?: string }) {
  const parts = [
    { label: 'Đã giải ngân theo mốc', value: figures.disbursed, tone: 'var(--accent)' },
    { label: 'Còn giữ', value: figures.heldInAccount, tone: 'var(--ok)' },
  ]
  return (
    <OpStat label={title} value={plain(figures.contributed)} unit="đ" sub={sub}>
      <span className="op-hero__split">{parts.filter((p) => p.value > 0).map((p) => <i key={p.label} style={{ flex: p.value, background: p.tone }} />)}</span>
      <ul className="op-hero__legend">{parts.map((p) => <li key={p.label}><i style={{ background: p.tone }} />{p.label}<b>{formatVnd(p.value)}</b></li>)}</ul>
    </OpStat>
  )
}

/** Ba ô số: đã góp, đã giải ngân theo mốc, còn giữ. */
export function MoneyFacts({ figures, heldLabel = 'Còn giữ' }: { figures: MoneyFigures; heldLabel?: string }) {
  return (
    <OpFacts items={[
      { label: 'Đã góp', value: formatVnd(figures.contributed) },
      { label: 'Đã giải ngân theo mốc', value: formatVnd(figures.disbursed), tone: 'warn' },
      { label: heldLabel, value: formatVnd(figures.heldInAccount), tone: 'ok' },
    ]} />
  )
}
