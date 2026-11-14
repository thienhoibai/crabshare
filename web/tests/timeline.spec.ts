/* Nhật trình của một Lô (GET /api/batches/{code}/timeline?days=&before=), nay nằm trong mục Nhật trình của trang Lô tôi đã góp:
   /nha-dau-tu/danh-muc/:code?tab=nhat-trinh. Ghi nhận gom theo ngày; ảnh bằng chứng tải qua endpoint cần đăng nhập. */
import type { TimelineItem, TimelinePage } from '../src/shared/api/api.gen'
import { dateFromNow, expect, reply, signIn, test, type Page } from './support/app'
import { RUN, TIMELINE_DAY, dmy, fact, lot, mockInvestor, more, timelineEntries, timelinePage } from './support/investor'

const URL = lot(RUN, 'nhat-trinh')
const TIMELINE = `/api/batches/${RUN}/timeline`
const OLDER_DAY = dateFromNow(-9)

/** Khối của một ngày trong nhật trình, tìm theo ngày ở cuối tiêu đề ("Thứ Năm, 12/11/2026"). */
const dayPanel = (page: Page, date: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: new RegExp(`${dmy(date)}$`) }) })

const log = (id: number, date: string, extra: Partial<NonNullable<TimelineItem['productionLog']>> = {}): TimelineItem => ({
  id: `ProductionLog:${id}`, type: 'ProductionLog', sourceId: String(id), businessDate: date, occurredAt: null, timeBasis: 'Date',
  productionLog: { ph: 7.4, waterTempC: 27.5, salinityPpt: 19, feedKg: 2, source: 'Manual', plausibilityFlag: 'Ok', note: null, ...extra },
})

/** Trang đầu còn ngày cũ hơn để tải thêm. */
const firstOfTwo = (): TimelinePage => timelinePage({ hasMore: true, nextBefore: TIMELINE_DAY })

test.beforeEach(async ({ page, api }) => {
  mockInvestor(api)
  await signIn(page, 'Investor')
})

test('mỗi loại ghi nhận hiện đúng nội dung; ảnh bằng chứng tải qua endpoint cần đăng nhập và xem lớn được', async ({ page, api }) => {
  await page.goto(URL)
  await expect(page.getByRole('tab', { name: 'Nhật trình' })).toHaveAttribute('aria-selected', 'true')
  const entries = dayPanel(page, TIMELINE_DAY).getByRole('listitem')
  await expect(entries).toHaveText([/^Chất lượng nước/, /^Ảnh bằng chứng/, /^Chuyển hộp/, /^Cua chết/, /^Nhật ký chăm sóc/])

  // Cảnh báo: mức độ, trạng thái xử lý, nội dung, giờ Việt Nam.
  await expect(entries.nth(0)).toContainText('09:30')
  await expect(entries.nth(0).getByText('Vừa', { exact: true })).toBeVisible()
  await expect(entries.nth(0).getByText('Đã ghi nhận', { exact: true })).toBeVisible()
  await expect(entries.nth(0)).toContainText('Độ mặn ngoài khoảng hộ nuôi đã cấu hình.')

  // Bằng chứng đã chấp nhận: ảnh riêng tư tải bằng token, bấm để xem lớn.
  await expect(entries.nth(1).getByText('Chấp nhận', { exact: true })).toBeVisible()
  await expect(entries.nth(1).getByText('Hộp A-12', { exact: true })).toBeVisible()
  await expect(entries.nth(1).getByRole('img', { name: 'Ảnh bằng chứng hộp A-12 2' })).toHaveAttribute('src', /^blob:/)
  await entries.nth(1).getByRole('button', { name: 'Xem lớn: Ảnh bằng chứng hộp A-12 2' }).click()
  await expect(page.getByRole('dialog', { name: 'Ảnh bằng chứng hộp A-12 2' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Sự kiện hộp và sự kiện của từng con cua.
  await expect(entries.nth(2)).toContainText('Hộp A-12 sang hộp A-18 · 1 con')
  await expect(entries.nth(2)).toContainText('Chuyển sang hộp sạch')
  await expect(entries.nth(3)).toContainText('Cua C-000127 · hộp B-03 · Yếu sau lột xác · người nuôi ghi')

  // Nhật ký chăm sóc ghi theo ngày nên không có giờ; trong ngưỡng thì không gắn nhãn.
  const care = entries.nth(4)
  await expect(fact(care, 'pH')).toContainText('7,5')
  await expect(fact(care, 'Nhiệt độ nước')).toContainText('28 °C')
  await expect(fact(care, 'Độ mặn')).toContainText('20 ‰')
  await expect(fact(care, 'Thức ăn')).toContainText('1,25 kg')
  await expect(care).toContainText('Kiểm tra nước buổi sáng')
  await expect(care).not.toContainText('09:30')
  await expect(care.getByText('Trong ngưỡng')).toHaveCount(0)

  await expect(page.getByRole('button', { name: 'Xem những ngày trước' })).toHaveCount(0)
  expect(api.sent('GET', TIMELINE).map((c) => c.query)).toEqual([{ days: '7' }])
  const photo = api.sent('GET', `${TIMELINE}/evidence/2/file`)
  expect(photo.map((c) => c.auth)).toEqual(['Bearer test-token'])
  expect(api.writes()).toEqual([])
})

test('ngày có hơn năm ghi nhận thì phần sau gấp lại; video, chứng từ và nhật ký ngoài ngưỡng có nhãn riêng', async ({ page, api }) => {
  const extra: TimelineItem[] = [
    { id: 'Evidence:6', type: 'Evidence', sourceId: '6', businessDate: TIMELINE_DAY, occurredAt: `${TIMELINE_DAY}T03:00:00Z`, timeBasis: 'Occurred',
      evidence: { mediaType: 'Video', source: 'InAppCapture', slotCode: null, reviewStatus: 'Accepted', fileUrl: `${TIMELINE}/evidence/6/file` } },
    { id: 'Evidence:7', type: 'Evidence', sourceId: '7', businessDate: TIMELINE_DAY, occurredAt: `${TIMELINE_DAY}T03:10:00Z`, timeBasis: 'Occurred',
      evidence: { mediaType: 'Invoice', source: 'Upload', slotCode: null, reviewStatus: 'Accepted', fileUrl: `${TIMELINE}/evidence/7/file` } },
    log(8, TIMELINE_DAY, { ph: 9.6, plausibilityFlag: 'OutOfRange', note: 'Nước đục sau mưa' }),
  ]
  api.get(TIMELINE, timelinePage({ groups: [{ date: TIMELINE_DAY, items: [...timelineEntries, ...extra] }] }))
  await page.goto(URL)

  const today = dayPanel(page, TIMELINE_DAY)
  const folded = more(today, 'Ghi nhận khác trong ngày')
  await expect(folded.locator('summary')).toContainText('3')
  await expect(today.getByText('Video bằng chứng')).toBeHidden()
  await expect(today.getByText('Kiểm tra nước buổi sáng')).toBeVisible()

  await folded.locator('summary').click()
  const rest = folded.getByRole('listitem')
  await expect(rest).toHaveText([/^Video bằng chứng/, /^Chứng từ/, /^Nhật ký chăm sóc/])
  await expect(rest.nth(0).getByRole('button', { name: 'Mở video' })).toBeVisible()
  await expect(rest.nth(1).getByRole('button', { name: 'Mở chứng từ' })).toBeVisible()
  await expect(rest.nth(2).getByText('Ngoài ngưỡng')).toBeVisible()
  await expect(rest.nth(2)).toContainText('Nước đục sau mưa')
  await expect(today.getByRole('listitem')).toHaveCount(8)
  // Video và chứng từ chỉ tải khi bấm mở; chỉ có ảnh được tải sẵn.
  expect(api.sent('GET', /\/timeline\/evidence\//).map((c) => c.path)).toEqual([`${TIMELINE}/evidence/2/file`])
})

test('xem những ngày trước tải thêm trọn ngày cũ; ghi nhận trùng không hiện hai lần; làm mới không nhân đôi', async ({ page, api }) => {
  // Trang cũ hơn trả kèm một ghi nhận đã có ở trang đầu (máy chủ nhận thêm dữ liệu giữa hai lần gọi).
  const older: TimelinePage = timelinePage({
    groups: [{ date: TIMELINE_DAY, items: [timelineEntries[0]] }, { date: OLDER_DAY, items: [log(31, OLDER_DAY, { note: 'Thay nước định kỳ' })] }],
  })
  api.get(TIMELINE, (call) => (call.query.before ? older : firstOfTwo()))
  await page.goto(URL)
  const today = dayPanel(page, TIMELINE_DAY).getByRole('listitem')
  const before = dayPanel(page, OLDER_DAY).getByRole('listitem')
  await expect(today).toHaveCount(5)
  await expect(before).toHaveCount(0)

  await page.getByRole('button', { name: 'Xem những ngày trước' }).click()
  await expect(before).toHaveText([/Thay nước định kỳ/])
  await expect(today).toHaveCount(5)
  await expect(page.getByRole('button', { name: 'Xem những ngày trước' })).toHaveCount(0)
  expect(api.sent('GET', TIMELINE).map((c) => c.query)).toEqual([{ days: '7' }, { days: '7', before: TIMELINE_DAY }])

  // Làm mới tải lại các ngày đang xem, số ghi nhận giữ nguyên.
  const refresh = page.getByRole('button', { name: 'Làm mới' })
  await expect(refresh).toHaveCount(1)
  await refresh.click()
  await expect.poll(() => api.sent('GET', TIMELINE).length).toBe(4)
  await expect(refresh).toBeEnabled()
  await expect(today).toHaveCount(5)
  await expect(before).toHaveCount(1)
})

test('mất quyền khi đang tải thêm: ẩn hết ghi nhận đã tải, chỉ còn lời báo dành cho người tham gia Lô', async ({ page, api }) => {
  api.get(TIMELINE, (call) => (call.query.before ? reply(403, { status: 403, detail: 'Bạn không còn quyền xem nhật trình của Lô này.' }) : firstOfTwo()))
  await page.goto(URL)
  await expect(page.getByText('Kiểm tra nước buổi sáng')).toBeVisible()

  await page.getByRole('button', { name: 'Xem những ngày trước' }).click()
  await expect(page.getByText('Nhật trình chỉ dành cho người tham gia Lô')).toBeVisible()
  await expect(page.getByText('Bạn không còn quyền xem nhật trình của Lô này.')).toBeVisible()
  await expect(page.getByText('Kiểm tra nước buổi sáng')).toHaveCount(0)
  await expect(dayPanel(page, TIMELINE_DAY)).toHaveCount(0)
})

test('máy chủ lỗi thì có nút thử lại và tải được nhật trình', async ({ page, api }) => {
  let down = true
  api.get(TIMELINE, () => (down ? reply(500, { status: 500, detail: 'Chưa tải được nhật trình.' }) : timelinePage()))
  await page.goto(URL)
  await expect(page.getByRole('alert')).toContainText('Chưa tải được nhật trình.')
  await expect(page.getByText('Nhật trình chỉ dành cho người tham gia Lô')).toHaveCount(0)

  down = false
  await page.getByRole('button', { name: 'Thử lại' }).click()
  await expect(dayPanel(page, TIMELINE_DAY).getByRole('listitem')).toHaveCount(5)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('Lô chưa có ghi nhận nào thì nói rõ, không dựng ghi nhận mẫu', async ({ page, api }) => {
  api.get(TIMELINE, timelinePage({ groups: [] }))
  await page.goto(URL)
  await expect(page.getByText('Lô chưa có ghi nhận nào')).toBeVisible()
  await expect(page.getByText('Nhật ký chăm sóc')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Làm mới' })).toHaveCount(0)
  expect(api.sent('GET', /\/timeline\/evidence\//)).toEqual([])
})
