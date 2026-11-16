/* /nha-dau-tu/danh-muc/:code — Một Lô tôi đã góp: ba số tiền của tôi và tiến độ ở đầu trang, rồi các mục chọn bằng ?tab=:
   Khoản góp, Thiết bị, Biểu quyết, Quyết toán. Mục Nhật trình có spec riêng (timeline.spec.ts). */
import type { DecisionResponse, PortfolioDetail, SettlementSummary } from '../src/shared/api/api.gen'
import { daysFromNow, expect, reply, signIn, test, vnd } from './support/app'
import {
  DONE, OPEN, RUN, closed, decisionOpen, decisionPassed, decisionsRunning, detailOpen, detailRunning, fact, lot, mockInvestor, more, open, panel, running,
  settlementPaid, viDate, viDateTime,
} from './support/investor'

test.beforeEach(async ({ page, api }) => {
  mockInvestor(api)
  await signIn(page, 'Investor')
})

test('Lô đã chốt vốn: ba số tiền của tôi, tiến độ, các khoản góp và phần gấp lại', async ({ page, api }) => {
  await page.goto(lot(RUN))
  await expect(page.getByRole('heading', { name: running.batch.title, level: 1 })).toBeVisible()
  await expect(page.getByText(`${RUN} · Cua gạch · HTX Năm Căn`)).toBeVisible()
  await expect(page.getByRole('main').getByText('1 cảnh báo', { exact: true })).toBeVisible()
  await expect(page.getByRole('main').getByText('Đang lưu nuôi', { exact: true })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Lô tôi đã góp' })).toHaveAttribute('href', '/nha-dau-tu/danh-muc')

  // Ba số tiền của tôi: đã góp, đã giải ngân theo mốc, còn giữ.
  await expect(page.getByText('30.000.000đ')).toBeVisible()
  await expect(page.getByText('15% vốn của Lô', { exact: true })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Đã giải ngân theo mốc' })).toContainText(vnd(12_000_000))
  await expect(page.getByRole('listitem').filter({ hasText: 'Còn giữ' })).toContainText(vnd(18_000_000))

  const progress = panel(page, 'Tiến độ')
  await expect(fact(progress, 'Cua đang nuôi')).toContainText('571 con')
  await expect(fact(progress, 'Ngày nuôi')).toContainText('12')
  await expect(fact(progress, 'Đã chết')).toContainText('9')
  await expect(fact(progress, 'Đã giao hoặc bán')).toContainText('0')

  await expect(page.getByRole('tab')).toHaveText(['Khoản góp', 'Nhật trình', 'Thiết bị', 'Biểu quyết', 'Quyết toán'])
  await expect(page.getByRole('tab', { name: 'Khoản góp' })).toHaveAttribute('aria-selected', 'true')

  const mine = panel(page, 'Khoản góp của tôi')
  await expect(mine.getByRole('columnheader')).toHaveText(['Số tiền', 'Trạng thái', 'Tiền về lúc', 'Hợp đồng'])
  const rows = mine.getByRole('row').filter({ has: page.getByRole('cell') })
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText(vnd(20_000_000))
  await expect(rows.nth(0)).toContainText('Đã xác nhận')
  await expect(rows.nth(0)).toContainText(viDateTime(detailRunning.contributions[0].confirmedAt!))
  await expect(rows.nth(0)).toContainText('HD-2610-0412')
  await expect(rows.nth(0)).toContainText('Đủ chữ ký')
  await expect(rows.nth(1)).toContainText(vnd(10_000_000))

  // Phần ít dùng gấp lại, bấm mới hiện.
  const batchMoney = more(mine, 'Tiền của cả Lô')
  await expect(fact(batchMoney, 'Số dư tài khoản của Lô')).toBeHidden()
  await batchMoney.locator('summary').click()
  await expect(fact(batchMoney, 'Đã góp')).toContainText(vnd(200_000_000))
  await expect(fact(batchMoney, 'Đã giải ngân theo mốc')).toContainText(vnd(80_000_000))
  await expect(fact(batchMoney, 'Số dư tài khoản của Lô')).toContainText(vnd(131_500_000))
  await expect(batchMoney.getByText('Phần của bạn trong số đã giải ngân tính theo tỷ lệ vốn, làm tròn xuống.')).toBeVisible()

  const info = more(mine, 'Thông tin Lô')
  await info.locator('summary').click()
  await expect(fact(info, 'Vốn của Lô')).toContainText(`${vnd(200_000_000)} / ${vnd(200_000_000)}`)
  await expect(fact(info, 'Số cua theo kế hoạch')).toContainText('600 con')
  await expect(fact(info, 'Ngày thả cua')).toContainText(viDate(running.batch.stockedAt!))
  await expect(fact(info, 'Ngày nuôi')).toContainText('12 / 30')
  await expect(fact(info, 'Đã thả bù')).toContainText('4')

  const care = more(mine, `Nhật ký chăm sóc ngày ${viDate(detailRunning.latestProduction!.logDate)}`)
  await care.locator('summary').click()
  await expect(fact(care, 'pH')).toContainText('7,8')
  await expect(fact(care, 'Nhiệt độ nước')).toContainText('28,5 °C')
  await expect(fact(care, 'Độ mặn')).toContainText('22 ‰')
  await expect(fact(care, 'Thức ăn')).toContainText('14,25 kg')

  const recent = more(mine, 'Diễn biến gần đây')
  await recent.locator('summary').click()
  await expect(recent.getByRole('listitem')).toHaveText([/Nhận nhật ký nuôi/, /Thả giống/, /Chốt vốn lô/])

  // Phần gấp lại dùng lại dữ liệu đã tải ở đầu trang: mỗi endpoint chỉ gọi một lần, không ghi gì.
  expect(api.calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual([
    `GET /api/batches/${RUN}/money-summary`, `GET /api/batches/${RUN}/progress`, `GET /api/investor/portfolio/${RUN}`,
  ])
})

test('Lô còn gọi vốn: chưa có ba số tiền, khoản chưa có hợp đồng dẫn về bước hợp đồng của luồng góp vốn', async ({ page, api }) => {
  const noContract: PortfolioDetail = { ...detailOpen, contributions: [{ ...detailOpen.contributions[0], contractNo: null, contractStatus: null }] }
  api.get(`/api/investor/portfolio/${OPEN}`, noContract)
  await page.goto(lot(OPEN))
  await expect(page.getByRole('heading', { name: open.batch.title, level: 1 })).toBeVisible()
  await expect(page.getByText('10.000.000đ')).toBeVisible()
  await expect(page.getByText('16,67% vốn của Lô · Lô chưa chốt vốn nên chưa giải ngân')).toBeVisible()
  await expect(page.getByText('Đã giải ngân theo mốc')).toHaveCount(0)

  const mine = panel(page, 'Khoản góp của tôi')
  await expect(mine.getByRole('link', { name: 'Lập hợp đồng' })).toHaveAttribute('href', `/nha-dau-tu/gop-von/${OPEN}?buoc=hop-dong`)
  await expect(more(mine, 'Tiền của cả Lô')).toHaveCount(0)
  expect(api.sent('GET', /\/money-summary$/)).toEqual([])

  // Lô chưa chốt vốn thì chưa có biểu quyết và trang không hỏi máy chủ.
  await page.getByRole('tab', { name: 'Biểu quyết' }).click()
  await expect(page.getByText('Lô chưa chốt vốn nên chưa có biểu quyết')).toBeVisible()
  expect(api.sent('GET', /\/decisions$/)).toEqual([])
})

test('Lô đã qua gọi vốn mà khoản góp chưa có hợp đồng thì chỉ ghi chưa lập', async ({ page, api }) => {
  api.get(`/api/investor/portfolio/${RUN}`, { ...detailRunning, contributions: [{ ...detailRunning.contributions[0], contractNo: null, contractStatus: null }] })
  await page.goto(lot(RUN))
  const mine = panel(page, 'Khoản góp của tôi')
  await expect(mine.getByText('Chưa lập')).toBeVisible()
  await expect(mine.getByRole('link', { name: 'Lập hợp đồng' })).toHaveCount(0)
})

test('không lấy được ba số tiền thì chỉ hiện số đã góp và nói rõ thiếu số giải ngân', async ({ page, api }) => {
  api.get(`/api/batches/${RUN}/money-summary`, () => reply(500, { status: 500, detail: 'Máy chủ đang bận.' }))
  await page.goto(lot(RUN))
  await expect(page.getByText('30.000.000đ')).toBeVisible()
  await expect(page.getByText('15% vốn của Lô · chưa lấy được số giải ngân')).toBeVisible()
  await expect(page.getByText('Còn giữ')).toHaveCount(0)
  await expect(panel(page, 'Khoản góp của tôi').getByRole('row')).toHaveCount(3)
})

test('Lô không thuộc danh mục của tôi: báo lỗi của máy chủ, không gọi thêm gì', async ({ page, api }) => {
  api.get('/api/investor/portfolio/P-2609-99', () => reply(404, { status: 404, detail: 'Không tìm thấy lô trong danh mục của bạn.' }))
  await page.goto(lot('P-2609-99'))
  await expect(page.getByRole('heading', { name: 'P-2609-99', level: 1 })).toBeVisible()
  await expect(page.getByText('Không mở được Lô này')).toBeVisible()
  await expect(page.getByText('Không tìm thấy lô trong danh mục của bạn.')).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByRole('main').getByRole('link', { name: 'Lô tôi đã góp' })).toHaveAttribute('href', '/nha-dau-tu/danh-muc')
  expect(api.calls.map((c) => c.path)).toEqual(['/api/investor/portfolio/P-2609-99'])
})

test('mục đang mở nằm trên đường dẫn: bấm tab đổi ?tab=, mở lại đường dẫn vào đúng mục', async ({ page }) => {
  await page.goto(lot(RUN))
  await page.getByRole('tab', { name: 'Quyết toán' }).click()
  await expect(page).toHaveURL(/\?tab=quyet-toan$/)
  await expect(page.getByRole('heading', { name: 'Điều kiện quyết toán' })).toBeVisible()

  await page.getByRole('tab', { name: 'Thiết bị' }).click()
  await expect(page).toHaveURL(/\?tab=thiet-bi$/)
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Thiết bị' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'Chỉ số nước' })).toBeVisible()

  await page.getByRole('tab', { name: 'Khoản góp' }).click()
  await expect(page).toHaveURL(new RegExp(`/danh-muc/${RUN}$`))
  await expect(page.getByRole('heading', { name: 'Khoản góp của tôi' })).toBeVisible()
})

test('mục Thiết bị: biểu đồ chỉ số nước theo 7 hoặc 30 ngày và ảnh hộp mới nhất, xem lại ảnh của một hộp', async ({ page, api }) => {
  await page.goto(lot(RUN, 'thiet-bi'))

  const water = panel(page, 'Chỉ số nước')
  for (const chart of ['nhiệt độ nước', 'độ mặn', 'ph']) await expect(water.getByRole('img', { name: `Biểu đồ ${chart} theo thời gian` })).toBeVisible()
  await expect(water.getByText(/^6 lượt đo · gần nhất /)).toBeVisible()
  await expect(water.getByText('1 lượt chưa hiệu chuẩn hoặc nghi sai')).toBeVisible()
  expect(api.sent('GET', `/api/batches/${RUN}/water-readings`).map((c) => c.query)).toEqual([{}])

  await water.getByRole('tab', { name: '30 ngày' }).click()
  await expect(water.getByRole('tab', { name: '30 ngày' })).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => api.sent('GET', `/api/batches/${RUN}/water-readings`).length).toBe(2)
  const from = Date.parse(api.sent('GET', `/api/batches/${RUN}/water-readings`)[1].query.from)
  expect(Math.abs(Date.now() - 30 * 86_400_000 - from)).toBeLessThan(120_000)

  // Mỗi hộp một ảnh mới nhất; ảnh tải qua endpoint cần đăng nhập.
  const images = panel(page, 'Ảnh hộp')
  const figures = images.getByRole('figure')
  await expect(figures).toHaveText([/Hộp A-01 · /, /Hộp A-02 · .* · không thấy cua/])
  await expect(images.getByRole('img', { name: /^Ảnh hộp A-01 lúc/ })).toHaveAttribute('src', /^blob:/)
  expect(api.sent('GET', /^\/api\/device-images\/\d+\/file$/).map((c) => c.path).sort()).toEqual(['/api/device-images/9003/file', '/api/device-images/9004/file'])

  await images.getByLabel('Chọn hộp').selectOption({ label: 'Hộp A-01' })
  await expect(figures).toHaveText([/Hộp A-01 · /, /Hộp A-01 · /])
  expect(api.sent('GET', `/api/batches/${RUN}/device-images`).map((c) => c.query)).toEqual([{}, { slotCode: 'A-01' }])

  // Bấm ảnh để xem lớn, Esc để đóng.
  await images.getByRole('button', { name: /^Xem lớn: Ảnh hộp A-01/ }).first().click()
  await expect(page.getByRole('dialog', { name: /^Ảnh hộp A-01 lúc/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(api.writes()).toEqual([])
})

test('mục Thiết bị khi Lô chưa có dữ liệu từ thiết bị', async ({ page, api }) => {
  api.get(`/api/batches/${RUN}/water-readings`, [])
  api.get(`/api/batches/${RUN}/device-images`, [])
  await page.goto(lot(RUN, 'thiet-bi'))
  await expect(page.getByText('Chưa có lượt đo nào trong khoảng này.')).toBeVisible()
  await expect(page.getByText('Lô chưa có ảnh từ thiết bị')).toBeVisible()
  await expect(page.getByLabel('Chọn hộp')).toHaveCount(0)
})

test('mục Biểu quyết: bỏ phiếu phải qua hộp xác nhận; lỗi hiện trong hộp; phiếu đã gửi thì hết nút', async ({ page, api }) => {
  const path = `/api/decisions/${decisionOpen.decisionNo}/votes`
  let decisions: DecisionResponse[] = decisionsRunning
  api.get(`/api/batches/${RUN}/decisions`, () => decisions)
  api.post(path, (call) => {
    // Phiếu không đồng ý bị từ chối để thử đường lỗi; phiếu đồng ý được ghi nhận.
    if ((call.body as { choice: string }).choice === 'No') return reply(409, { status: 409, detail: 'Chưa ghi được phiếu, thử lại (BR-210).' })
    const voted: DecisionResponse = { ...decisionOpen, myChoice: 'Yes', canVote: false, yesCapital: 110_000_000, yesPct: 55 }
    decisions = [decisionPassed, voted]
    return voted
  })
  await page.goto(lot(RUN, 'bieu-quyet'))

  // Cuộc đang mở xếp trước cuộc đã kết thúc.
  const current = panel(page, 'Thanh lý sớm')
  await expect(current.getByText('Đang biểu quyết')).toBeVisible()
  await expect(current.getByText(decisionOpen.proposal)).toBeVisible()
  await expect(current.getByText(`Hạn ${viDateTime(decisionOpen.closesAt)}`)).toBeVisible()
  await expect(current.getByText(`${vnd(80_000_000)} · 40%`)).toBeVisible()
  await expect(current.getByText(`${vnd(20_000_000)} · 10%`)).toBeVisible()
  const past = panel(page, 'Bán phần dư')
  await expect(past.getByText('Thông qua', { exact: true })).toBeVisible()
  await expect(past.getByText(`Kết thúc ${viDateTime(decisionPassed.decidedAt!)}`)).toBeVisible()
  await expect(past.getByText('Bạn đã chọn: Đồng ý')).toBeVisible()
  await expect(past.getByRole('button')).toHaveCount(0)

  await current.getByRole('button', { name: 'Không đồng ý' }).click()
  const against = page.getByRole('dialog', { name: 'Biểu quyết: Không đồng ý' })
  await expect(against).toContainText(`Thanh lý sớm · Lô ${RUN} · ${decisionOpen.decisionNo}`)
  expect(api.writes()).toEqual([])
  await against.getByRole('button', { name: 'Gửi phiếu không đồng ý' }).click()
  await expect(against.getByText('Chưa ghi được phiếu, thử lại.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(against).toHaveCount(0)

  await current.getByRole('button', { name: 'Đồng ý', exact: true }).click()
  const inFavour = page.getByRole('dialog', { name: 'Biểu quyết: Đồng ý' })
  await expect(inFavour).toContainText('Nếu thông qua: Lô thanh lý sớm')
  await expect(inFavour).toContainText('Phiếu tính theo vốn đã chốt của bạn và không đổi lại được.')
  await inFavour.getByRole('button', { name: 'Gửi phiếu đồng ý' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã ghi nhận phiếu của bạn.' })).toBeVisible()
  await expect(inFavour).toHaveCount(0)
  await expect(current.getByText('Bạn đã chọn: Đồng ý')).toBeVisible()
  await expect(current.getByText(`${vnd(110_000_000)} · 55%`)).toBeVisible()
  await expect(current.getByRole('button')).toHaveCount(0)

  expect(api.writes()).toEqual([`POST ${path}`, `POST ${path}`])
  expect(api.sent('POST', path).map((c) => c.body)).toEqual([expect.objectContaining({ choice: 'No' }), expect.objectContaining({ choice: 'Yes' })])
})

test('mục Biểu quyết khi Lô chưa có cuộc nào', async ({ page }) => {
  await page.goto(lot(DONE, 'bieu-quyet'))
  await expect(page.getByText('Lô này chưa có cuộc biểu quyết nào')).toBeVisible()
})

test('mục Quyết toán của Lô đang nuôi: điều kiện nào còn thiếu, bảng chưa công bố', async ({ page }) => {
  await page.goto(lot(RUN, 'quyet-toan'))
  const conditions = panel(page, 'Điều kiện quyết toán')
  await expect(conditions.getByText('Còn 2 điều kiện')).toBeVisible()
  await expect(conditions.getByRole('listitem')).toHaveText([
    /Mọi con cua đã được giao, bán, ghi chết hoặc huỷ.*Còn 571 mục/,
    /Mọi đơn đặt trước ở trạng thái cuối.*Còn 3 mục/,
    /^✓Đơn có hoá đơn và đơn hàng cuối đã thu đủ tiền$/,
    /^✓Mọi lệnh hoàn tiền cho khách đã thành công$/,
    /^✓Hết hạn đổi trả, không còn khiếu nại mở$/,
    /^✓Không còn giao dịch tiền chưa khớp$/,
  ])
  await expect(conditions.getByText('Bảng quyết toán chưa được công bố.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bảng quyết toán', exact: true })).toHaveCount(0)
})

test('mục Quyết toán của Lô đã chi trả: đủ điều kiện và số đã duyệt của tôi, có lối mở bảng', async ({ page }) => {
  await page.goto(lot(DONE, 'quyet-toan'))
  await expect(page.getByRole('heading', { name: closed.batch.title, level: 1 })).toBeVisible()
  await expect(panel(page, 'Điều kiện quyết toán').getByText('Đủ 6 điều kiện')).toBeVisible()

  const statement = panel(page, 'Bảng quyết toán')
  await expect(statement.getByText('Đã chi trả')).toBeVisible()
  await expect(fact(statement, 'Vốn hoàn')).toContainText(vnd(20_000_000))
  await expect(fact(statement, 'Phần chia')).toContainText(vnd(1_850_000))
  await expect(fact(statement, 'Khấu trừ thuế')).toContainText(vnd(-92_500))
  await expect(fact(statement, 'Tôi thực nhận')).toContainText(vnd(21_757_500))
  await expect(fact(statement, 'Nhận bằng hiện vật')).toHaveCount(0)
  await expect(statement.getByRole('link', { name: 'Mở bảng quyết toán' })).toHaveAttribute('href', '/nha-dau-tu/quyet-toan/31')
})

test('mục Quyết toán khi bảng mới công bố để lấy góp ý: số theo bảng và hạn góp ý', async ({ page, api }) => {
  const proposed: SettlementSummary = {
    ...settlementPaid, settlementId: 32, batchCode: RUN, batchTitle: running.batch.title, status: 'Proposed', myNetPayout: 31_200_000,
    feedbackDeadline: daysFromNow(5), feedbackOpen: true,
  }
  api.get('/api/me/settlements', [settlementPaid, proposed])
  await page.goto(lot(RUN, 'quyet-toan'))
  const statement = panel(page, 'Bảng quyết toán')
  await expect(statement.getByText('Đang lấy góp ý')).toBeVisible()
  await expect(fact(statement, 'Tôi thực nhận theo bảng')).toContainText(vnd(31_200_000))
  await expect(fact(statement, 'Góp ý tới')).toContainText(viDateTime(proposed.feedbackDeadline!))
  await expect(statement.getByRole('link', { name: 'Mở bảng quyết toán' })).toHaveAttribute('href', '/nha-dau-tu/quyet-toan/32')
  await expect(page.getByText('Bảng quyết toán chưa được công bố.')).toHaveCount(0)
})

test('mục Quyết toán khi máy chủ không cho xem trạng thái: vẫn liệt kê sáu điều kiện, không tô đạt hay chưa', async ({ page, api }) => {
  api.get(`/api/batches/${RUN}/settlement-readiness`, () => reply(403, { status: 403, detail: 'Chỉ người tham gia Lô được xem.' }))
  await page.goto(lot(RUN, 'quyet-toan'))
  const conditions = panel(page, 'Điều kiện quyết toán')
  await expect(conditions.getByText('Chưa xem được trạng thái')).toBeVisible()
  await expect(conditions.getByRole('listitem')).toHaveCount(6)
  await expect(conditions.getByRole('listitem').first()).toHaveText('1Mọi con cua đã được giao, bán, ghi chết hoặc huỷ')
  await expect(conditions.getByText('✓')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})
