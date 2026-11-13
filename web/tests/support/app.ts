/* Phần dùng chung của các spec giao diện BR v1.5.
   - `test` có sẵn fixture `api`: mọi lời gọi /api/** đều bị chặn, trả dữ liệu giả lập và được ghi lại.
     Lời gọi chưa giả lập trả 404 và làm test hỏng ở cuối, nên bộ dữ liệu giả lập luôn khớp với những gì trang thật sự gọi.
   - `signIn(page, 'Customer')` ghi phiên đăng nhập vào localStorage như authStore (zustand persist).
   Kiểu dữ liệu giả lập lấy từ src/shared/api/api.gen.ts. Không cần backend. */
import { test as base, expect, type Page, type Route } from '@playwright/test'
import type { MeResponse } from '../../src/shared/api/api.gen'

export { expect }
export type { Page }

/* PW_SHIFT_HOURS=12 npx playwright test — chạy cả bộ như thể đồng hồ lệch đi số giờ đó, ở cả trình chạy test lẫn trình duyệt.
   Dùng để kiểm tra spec không phụ thuộc giờ trong ngày, nhất là khung 0–7 giờ sáng Việt Nam khi ngày UTC và ngày Việt Nam khác nhau.
   Tệp này được nạp trước mọi tệp support khác, nên dữ liệu giả lập tính ngày lúc nạp cũng theo đồng hồ đã lệch. */
const SHIFT_MS = Number(process.env.PW_SHIFT_HOURS ?? 0) * 3_600_000

/** Thay Date bằng bản lệch đi `ms`; chạy được cả trong Node lẫn trong trang (không dùng biến bên ngoài). */
function shiftClock(ms: number) {
  const scope = globalThis as unknown as { Date: DateConstructor; __clockShifted?: boolean }
  if (!ms || scope.__clockShifted) return
  const Real = scope.Date
  class Shifted extends Real {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(Real.now() + ms)
      else super(...(args as []))
    }
    static now() { return Real.now() + ms }
  }
  scope.Date = Shifted as unknown as DateConstructor
  scope.__clockShifted = true
}
shiftClock(SHIFT_MS)

export type Role = 'Customer' | 'Investor' | 'OperatorMember' | 'QcInspector' | 'PlatformAdmin' | 'EvidenceReviewer'

const NAMES: Record<Role, string> = {
  Customer: 'Trần Thu Hà',
  Investor: 'Lê Minh Khôi',
  OperatorMember: 'Nguyễn Văn Năm',
  QcInspector: 'Phạm Thị Lan',
  PlatformAdmin: 'Đỗ Quang Huy',
  EvidenceReviewer: 'Vũ Ngọc Anh',
}

/** Người dùng mẫu của một vai trò. */
export const userOf = (role: Role, extra: Partial<MeResponse> = {}): MeResponse => ({
  userId: 100 + Object.keys(NAMES).indexOf(role),
  email: `${role.toLowerCase()}@test.local`,
  fullName: NAMES[role],
  phone: null,
  status: 'Active',
  roles: [role],
  operatorId: role === 'OperatorMember' ? 7 : null,
  ...extra,
})

export const TOKEN = 'test-token'

/** Đăng nhập sẵn trước khi trang tải: ghi phiên vào localStorage đúng dạng của authStore. */
export async function signIn(page: Page, who: Role | MeResponse): Promise<MeResponse> {
  const user = typeof who === 'string' ? userOf(who) : who
  await page.addInitScript(({ user, token }) => {
    localStorage.setItem('crabshare-auth', JSON.stringify({ state: { token, user, expiresAt: '2099-01-01T00:00:00Z' }, version: 0 }))
  }, { user, token: TOKEN })
  return user
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Một lời gọi API mà trang đã gửi. */
export interface Call {
  method: Method
  /** Đường dẫn không kèm query, ví dụ /api/preorders. */
  path: string
  query: Record<string, string>
  /** Body JSON; với multipart là các trường chữ, tệp ghi thành "file:<tên tệp>". */
  body: unknown
  /** Giá trị header Authorization. */
  auth: string | undefined
  multipart: boolean
}

class Reply {
  constructor(readonly status: number, readonly json?: unknown, readonly raw?: { body: Buffer | string; contentType: string }) {}
}

/** Trả về một mã trạng thái khác 200, ví dụ reply(422, { detail: '…' }) hoặc reply(204). */
export const reply = (status: number, json?: unknown) => new Reply(status, json)

/** Trả về tệp (ảnh, PDF) thay cho JSON. */
export const file = (body: Buffer | string, contentType: string) => new Reply(200, undefined, { body, contentType })

/** Ảnh PNG 1×1 dùng cho ô chụp ảnh và các endpoint trả ảnh. */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=', 'base64')
export const photo = (name = 'anh.png') => ({ name, mimeType: 'image/png', buffer: PNG })

type Handler<T> = T | ((call: Call) => T | Reply | Promise<T | Reply>)
type Pattern = string | RegExp

/** Đọc các trường của một body multipart/form-data. */
function parseMultipart(buffer: Buffer | null): Record<string, string | string[]> {
  const fields: Record<string, string | string[]> = {}
  if (!buffer) return fields
  const text = buffer.toString('latin1')
  const part = /Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]*)")?[^\r]*\r\n(?:Content-Type: [^\r]*\r\n)?\r\n([\s\S]*?)\r\n--/g
  for (let m = part.exec(text); m; m = part.exec(text)) {
    const value = m[2] !== undefined ? `file:${m[2]}` : Buffer.from(m[3], 'latin1').toString('utf8')
    const old = fields[m[1]]
    fields[m[1]] = old === undefined ? value : Array.isArray(old) ? [...old, value] : [old, value]
  }
  return fields
}

export class Api {
  /** Mọi lời gọi /api/** theo thứ tự gửi. */
  readonly calls: Call[] = []
  /** Lời gọi không có dữ liệu giả lập: "GET /api/…". Test hỏng nếu danh sách này khác rỗng. */
  readonly unmocked: string[] = []
  private readonly routes: { method: Method; pattern: Pattern; handler: Handler<unknown> }[] = []

  constructor(private readonly page: Page) {}

  async start() {
    await this.page.route((url) => url.pathname.startsWith('/api/'), (route) => this.handle(route))
  }

  /** Giả lập một endpoint. Đăng ký sau thắng đăng ký trước, nên test ghi đè được dữ liệu mặc định. */
  on<T>(method: Method, pattern: Pattern, handler: Handler<T>) {
    this.routes.unshift({ method, pattern, handler })
    return this
  }
  get<T>(pattern: Pattern, handler: Handler<T>) { return this.on('GET', pattern, handler) }
  post<T>(pattern: Pattern, handler: Handler<T>) { return this.on('POST', pattern, handler) }
  put<T>(pattern: Pattern, handler: Handler<T>) { return this.on('PUT', pattern, handler) }
  patch<T>(pattern: Pattern, handler: Handler<T>) { return this.on('PATCH', pattern, handler) }
  delete<T>(pattern: Pattern, handler: Handler<T>) { return this.on('DELETE', pattern, handler) }

  /** Các lời gọi đã gửi tới một endpoint. */
  sent(method: Method, pattern: Pattern): Call[] {
    return this.calls.filter((c) => c.method === method && matches(pattern, c.path))
  }

  /** Lời gọi ghi (POST, PUT, PATCH, DELETE) đã gửi, dạng "POST /api/…", để kiểm tra trang không ghi thừa. */
  writes(): string[] {
    return this.calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`)
  }

  private async handle(route: Route) {
    const request = route.request()
    const url = new URL(request.url())
    const type = request.headers()['content-type'] ?? ''
    const multipart = type.startsWith('multipart/form-data')
    let body: unknown = null
    if (multipart) body = parseMultipart(request.postDataBuffer())
    else if (request.postData()) {
      try { body = request.postDataJSON() } catch { body = request.postData() }
    }
    const call: Call = {
      method: request.method() as Method,
      path: decodeURIComponent(url.pathname),
      query: Object.fromEntries(url.searchParams),
      body,
      auth: request.headers()['authorization'],
      multipart,
    }
    this.calls.push(call)
    const found = this.routes.find((r) => r.method === call.method && matches(r.pattern, call.path))
    if (!found) {
      this.unmocked.push(`${call.method} ${call.path}`)
      return route.fulfill({ status: 404, json: { status: 404, detail: `Chưa giả lập ${call.method} ${call.path}` } })
    }
    const result = typeof found.handler === 'function' ? await (found.handler as (call: Call) => unknown)(call) : found.handler
    if (result instanceof Reply) {
      if (result.raw) return route.fulfill({ status: result.status, body: result.raw.body, contentType: result.raw.contentType })
      return result.json === undefined ? route.fulfill({ status: result.status, body: '' }) : route.fulfill({ status: result.status, json: result.json })
    }
    return route.fulfill({ status: 200, json: result })
  }
}

const matches = (pattern: Pattern, path: string) => (typeof pattern === 'string' ? pattern === path : pattern.test(path))

/** Trang phân trang của API: { items, page, pageSize, total }. */
export const paged = <T>(items: T[], pageSize = 50) => ({ items, page: 1, pageSize, total: items.length })

/**
 * Chữ không được xuất hiện ở bất kỳ trang nào: lời hứa về lợi nhuận (ROI, lợi suất, lợi nhuận kỳ vọng) và số quy tắc nghiệp vụ (BR-xxx).
 * Trả về các cụm tìm thấy trong toàn bộ chữ của trang, kể cả phần đang gấp lại.
 */
export async function forbiddenWords(page: Page): Promise<string[]> {
  const text = (await page.evaluate(() => document.body?.textContent ?? '')).normalize('NFC')
  const found: string[] = []
  for (const pattern of [/\bROI\b/, /lợi suất/i, /lợi nhuận kỳ vọng/i, /\bBR-\d+/]) {
    const hit = pattern.exec(text)
    if (hit) found.push(`${hit[0]} trong "${text.slice(Math.max(0, hit.index - 40), hit.index + 60).replace(/\s+/g, ' ')}"`)
  }
  return found
}

/**
 * Một trang đang được kiểm thử, để spec "không hứa lợi nhuận" (no-return-promises.spec.ts) mở lại và soát chữ.
 * Mỗi tệp support của một cổng xuất danh sách các trang này cùng hàm giả lập API mặc định của cổng.
 */
export interface PageUnderTest {
  /** Vai trò đăng nhập; null là khách chưa đăng nhập. */
  role: Role | null
  path: string
  /** Một dòng chữ chỉ có khi trang đã tải xong dữ liệu. */
  ready: string | RegExp
}

export const test = base.extend<{ api: Api; steadyPage: void }>({
  /**
   * Ba thứ ngoài ứng dụng có thể làm một test lúc qua lúc trượt; fixture này (tự bật cho mọi test) gỡ cả ba:
   * 1. Máy chủ dev của Vite báo qua kênh HMR mỗi khi có tệp trong web/ được lưu và trình duyệt tải lại cả trang, làm mất hộp thoại đang mở.
   *    Kênh HMR là WebSocket duy nhất của ứng dụng nên được thay bằng một kết nối câm.
   * 2. Phông chữ Google và ảnh minh hoạ của trang chủ nằm ở máy chủ ngoài: mạng chậm thì trang tải lâu và chữ đổi phông giữa chừng làm xê dịch
   *    bố cục. Mọi yêu cầu ra ngoài máy chủ dev bị chặn, trang dùng phông dự phòng.
   * 3. Hợp đồng được nhúng vào iframe dưới dạng blob application/pdf. Chrome khởi động trình xem PDF trong iframe và thỉnh thoảng nuốt mất cú bấm
   *    ngay sau đó; Chromium không có trình xem PDF (máy CI) thì tải tệp về. Cách trình duyệt vẽ PDF không phải thứ spec kiểm tra, nên blob PDF
   *    được đổi thành văn bản thường trước khi tạo đường dẫn.
   */
  steadyPage: [async ({ page }, use) => {
    await page.routeWebSocket(() => true, () => {})
    await page.route((url) => url.protocol.startsWith('http') && url.hostname !== '127.0.0.1', (route) => route.abort())
    if (SHIFT_MS) await page.addInitScript(shiftClock, SHIFT_MS)
    await page.addInitScript(() => {
      const createObjectURL = URL.createObjectURL.bind(URL)
      URL.createObjectURL = (source: Blob | MediaSource) =>
        createObjectURL(source instanceof Blob && source.type === 'application/pdf' ? new Blob([source], { type: 'text/plain' }) : source)
    })
    await use()
  }, { auto: true }],
  api: async ({ page }, use) => {
    const api = new Api(page)
    await api.start()
    await use(api)
    expect(api.unmocked, 'Trang gọi API chưa được giả lập').toEqual([])
    // Màn hình cuối của mọi test cũng được soát chữ cấm.
    const words = page.isClosed() ? [] : await forbiddenWords(page).catch(() => [])
    expect(words, 'Trang hiện chữ bị cấm').toEqual([])
  },
})

/** Ngày giờ ISO cách hiện tại một số ngày (âm là quá khứ), để dữ liệu giả lập không cũ đi theo thời gian. */
export const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

/**
 * Ngày (yyyy-mm-dd) cách hôm nay một số ngày, tính theo giờ Việt Nam: ứng dụng tính "hôm nay" theo giờ Việt Nam (todayIso, vnDate),
 * nên từ 0 đến 7 giờ sáng ngày UTC còn là hôm qua và không dùng được.
 */
export const dateFromNow = (days: number) => new Date(Date.now() + 7 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10)

/** Số tiền như formatVnd của ứng dụng: 1500000 → "1.500.000 đ". */
export const vnd = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))} đ`

/** Cột phải (OpAside) của trang trong một cổng; menu trái của cổng cũng là <aside> nên phải tìm trong <main>. */
export const aside = (page: Page) => page.getByRole('main').getByRole('complementary')
