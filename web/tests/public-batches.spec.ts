/* Trang công khai: danh sách Lô đang mở (/lo), trang một Lô (/lo/:code), chuẩn phân hạng (/chuan-phan-hang). */
import type { BatchResponse } from '../src/shared/api/api.gen'
import { expect, reply, signIn, test, vnd } from './support/app'
import { availabilityP, batchP, batchPNoOffers, batchT, explorePage, mockPublic } from './support/public'

test.describe('/lo', () => {
  test('hiện các Lô đang mở kèm vốn đã góp, khoảng giá và số con còn đặt được', async ({ page, api }) => {
    mockPublic(api)
    await page.goto('/lo')
    await expect(page.getByRole('heading', { name: 'Chọn một Lô để đặt trước hoặc góp vốn' })).toBeVisible()
    expect(api.sent('GET', '/api/batches')[0].query).toEqual({ scope: 'open', pageSize: '60' })
    // Trang công khai: không gửi token.
    expect(api.sent('GET', '/api/batches')[0].auth).toBeUndefined()

    const card = page.getByRole('link', { name: batchP.title })
    await expect(card).toHaveAttribute('href', `/lo/${batchP.batchCode}`)
    await expect(card).toContainText('P-2611-01 · Cua gạch · HTX Năm Căn')
    await expect(card).toContainText('Đang gọi vốn')
    await expect(card).toContainText('Lô P')
    await expect(card).toContainText('Nhận đặt trước')
    await expect(card).toContainText('8 nhà đầu tư đã góp')
    await expect(card).toContainText(`${vnd(120_000_000)} / ${vnd(200_000_000)}`)
    await expect(card).toContainText(`${vnd(480_000)} – ${vnd(520_000)} / kg`)
    await expect(card).toContainText('Còn đặt được khoảng 400 con')

    const trade = page.getByRole('link', { name: batchT.title })
    await expect(trade).toContainText('Lô T')
    await expect(trade).toContainText('Đang lưu nuôi')
    await expect(trade).toContainText(`${vnd(360_000)} / kg`)
    await expect(trade).not.toContainText('nhà đầu tư đã góp')
  })

  test('lọc theo việc muốn làm và theo loại cua', async ({ page, api }) => {
    mockPublic(api)
    await page.goto('/lo')
    const cards = page.locator('a.op-card')
    await expect(cards).toHaveCount(3)

    await page.getByRole('tab', { name: 'Đang gọi vốn' }).click()
    await expect(cards).toHaveCount(2)
    await expect(page.getByRole('link', { name: batchT.title })).toHaveCount(0)

    await page.getByRole('tab', { name: 'Nhận đặt trước' }).click()
    await expect(cards).toHaveCount(2)
    await expect(page.getByRole('link', { name: batchPNoOffers.title })).toHaveCount(0)

    // Đổi loại cua thì hỏi lại máy chủ với crabType; Lô P cua gạch đang ở tab "Nhận đặt trước".
    await page.getByLabel('Loại cua').selectOption({ label: 'Cua gạch' })
    await expect(cards).toHaveCount(1)
    await expect(page.getByRole('link', { name: batchP.title })).toBeVisible()
    expect(api.sent('GET', '/api/batches').at(-1)!.query).toEqual({ scope: 'open', crabType: 'RoeCrab', pageSize: '60' })

    await page.getByLabel('Loại cua').selectOption({ label: 'Cua lột' })
    await expect(page.getByText('Chưa có Lô nào khớp bộ lọc')).toBeVisible()
  })

  test('bấm một Lô thì sang trang của Lô đó', async ({ page, api }) => {
    mockPublic(api)
    await page.goto('/lo')
    await page.getByRole('link', { name: batchT.title }).click()
    await expect(page).toHaveURL(new RegExp(`/lo/${batchT.batchCode}$`))
    await expect(page.getByRole('heading', { name: 'Thông tin Lô' })).toBeVisible()
  })
})

test.describe('/lo/:code', () => {
  test('khách chưa đăng nhập thấy thông tin, bảng giá và hai nút dẫn qua đăng nhập', async ({ page, api }) => {
    mockPublic(api)
    await page.goto(`/lo/${batchP.batchCode}`)
    await expect(page.getByText(batchP.title, { exact: true })).toBeVisible()
    await expect(page.getByText('P-2611-01 · Cua gạch · HTX Năm Căn')).toBeVisible()

    const info = page.locator('section', { has: page.getByRole('heading', { name: 'Thông tin Lô' }) })
    await expect(info).toContainText('Số cua dự kiến600 con')
    await expect(info).toContainText('Lưu nuôi30 ngày')
    await expect(info).toContainText('Khối lượng trung bình420 g')
    await expect(info).toContainText('Bán kính giao350 km')
    // Điều khoản bán hàng gấp lại, mở ra mới thấy bên cam kết thu mua và giá sàn.
    await info.getByText('Điều khoản bán hàng').click()
    await expect(info).toContainText('Công ty Hải sản Đất Mũi')
    await expect(info).toContainText(`${vnd(380_000)} / kg`)

    const prices = page.locator('section', { has: page.getByRole('heading', { name: 'Bảng giá theo quy cách' }) })
    await expect(prices.getByRole('row')).toHaveCount(3)
    const first = prices.getByRole('row', { name: /Cua gạch L hạng A/ })
    await expect(first).toContainText('RC-L-A')
    await expect(first).toContainText(vnd(520_000))
    await expect(first).toContainText('420 g')
    await expect(first).toContainText('200 con')

    // Lô chưa thả nuôi: không có mục Tiến độ. Chi phí chuẩn hiện tổng, chi tiết theo nhóm gấp lại.
    await expect(page.getByRole('heading', { name: 'Tiến độ' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: `Chi phí chuẩn ${vnd(180_000_000)}` })).toBeVisible()

    const aside = page.getByRole('complementary')
    await expect(aside).toContainText('Lô P · góp vốn')
    await expect(aside).toContainText('Nhận đặt trước')
    await expect(aside).toContainText(`${vnd(120_000_000)} / ${vnd(200_000_000)}`)
    await expect(aside).toContainText(`Còn nhận${vnd(70_000_000)}`)
    await expect(aside).toContainText(`Góp tối thiểu${vnd(5_000_000)}`)
    await expect(aside).toContainText('Còn đặt được400 con')
    await expect(aside).toContainText('Đặt cọc30%')
    await expect(aside).toContainText('Góp vốn có rủi ro, nền tảng không cam kết kết quả tài chính.')
    await expect(aside.getByRole('link', { name: 'Góp vốn' })).toHaveAttribute('href', `/dang-nhap?next=${encodeURIComponent(`/nha-dau-tu/gop-von/${batchP.batchCode}`)}`)
    await expect(aside.getByRole('link', { name: 'Đặt trước' })).toHaveAttribute('href', `/dang-nhap?next=${encodeURIComponent(`/khach/dat-truoc/${batchP.batchCode}`)}`)
    await expect(aside.getByRole('link', { name: 'Chuẩn phân hạng' })).toHaveAttribute('href', '/chuan-phan-hang')

    expect(api.calls.map((c) => c.path).sort()).toEqual([
      `/api/batches/${batchP.batchCode}`, `/api/batches/${batchP.batchCode}/availability`, `/api/batches/${batchP.batchCode}/progress`,
    ])
  })

  test('khách hàng đã đăng nhập đi thẳng tới trang đặt trước, không thấy nút góp vốn', async ({ page, api }) => {
    mockPublic(api)
    await signIn(page, 'Customer')
    await page.goto(`/lo/${batchP.batchCode}`)
    const aside = page.getByRole('complementary')
    await expect(aside.getByRole('link', { name: 'Đặt trước' })).toHaveAttribute('href', `/khach/dat-truoc/${batchP.batchCode}`)
    await expect(aside.getByRole('link', { name: 'Góp vốn' })).toHaveCount(0)
  })

  test('nhà đầu tư đã đăng nhập đi thẳng tới trang góp vốn, không thấy nút đặt trước', async ({ page, api }) => {
    mockPublic(api)
    await signIn(page, 'Investor')
    await page.goto(`/lo/${batchP.batchCode}`)
    const aside = page.getByRole('complementary')
    await expect(aside.getByRole('link', { name: 'Góp vốn' })).toHaveAttribute('href', `/nha-dau-tu/gop-von/${batchP.batchCode}`)
    await expect(aside.getByRole('link', { name: 'Đặt trước' })).toHaveCount(0)
  })

  test('Lô đang lưu nuôi hiện tiến độ; người ngoài không thấy số chết và số đã phân hạng', async ({ page, api }) => {
    mockPublic(api)
    await page.goto(`/lo/${batchT.batchCode}`)
    const progress = page.locator('section', { has: page.getByRole('heading', { name: 'Tiến độ' }) })
    await expect(progress).toContainText('Cua đang nuôi372 con')
    await expect(progress).toContainText('Số ngày nuôi9')
    await expect(progress).not.toContainText('Đã chết')
    await expect(progress).not.toContainText('Đã phân hạng')
    // Lô T không gọi vốn: không có thanh vốn và nút góp vốn.
    const aside = page.getByRole('complementary')
    await expect(aside).toContainText('Lô T · thương mại')
    await expect(aside.getByRole('link', { name: 'Góp vốn' })).toHaveCount(0)
    await expect(aside.getByRole('link', { name: 'Đặt trước' })).toBeVisible()
  })

  test('người đã đặt trước ở Lô thấy thêm số chết và số đã phân hạng', async ({ page, api }) => {
    mockPublic(api)
    api.get(`/api/batches/${batchT.batchCode}/progress`, {
      batchCode: batchT.batchCode, status: 'InProduction', crabsAlive: 372, daysRaised: 9, isParticipant: true,
      deadCrabs: 6, restockedCrabs: 2, gradedCrabs: 40, deliveredOrSoldCrabs: 0,
    })
    await signIn(page, 'Customer')
    await page.goto(`/lo/${batchT.batchCode}`)
    const progress = page.locator('section', { has: page.getByRole('heading', { name: 'Tiến độ' }) })
    await expect(progress).toContainText('Đã chết6')
    await expect(progress).toContainText('Đã phân hạng40')
  })

  test('Lô hết hạn đặt trước và không gọi vốn thì báo rõ, không có nút nào', async ({ page, api }) => {
    mockPublic(api)
    api.get(`/api/batches/${batchT.batchCode}/availability`, { ...availabilityP, batchCode: batchT.batchCode, acceptingPreorders: false, specs: [] })
    await page.goto(`/lo/${batchT.batchCode}`)
    const aside = page.getByRole('complementary')
    await expect(aside).toContainText('Lô này hiện không nhận góp vốn và đặt trước.')
    await expect(aside.getByRole('link', { name: 'Đặt trước' })).toHaveCount(0)
  })

  test('bản soạn thảo của người nuôi chưa công bố thì không hiện nội dung Lô', async ({ page, api }) => {
    // Người nuôi nhận BatchResponse (không có executorName) từ cùng đường dẫn; trang tìm bản công khai trong danh sách.
    const draft: Pick<BatchResponse, 'batchCode' | 'status' | 'title'> = { batchCode: 'P-DRAFT-9', status: 'Draft', title: 'Lô đang soạn' }
    api.get('/api/batches/P-DRAFT-9', draft)
    api.get('/api/batches', explorePage([batchP]))
    api.get('/api/batches/P-DRAFT-9/progress', () => reply(404, { status: 404, detail: 'Không tìm thấy Lô.' }))
    api.get('/api/batches/P-DRAFT-9/availability', () => reply(404, { status: 404, detail: 'Không tìm thấy Lô.' }))
    await signIn(page, 'OperatorMember')
    await page.goto('/lo/P-DRAFT-9')
    await expect(page.getByText('Lô P-DRAFT-9 chưa được công bố. Người nuôi xem bản soạn thảo ở cổng người nuôi.')).toBeVisible()
    await expect(page.getByText('Lô đang soạn')).toHaveCount(0)
    expect(api.sent('GET', '/api/batches')[0].query).toEqual({ scope: 'all', pageSize: '100' })
  })

  test('mã Lô không có thì báo lỗi của máy chủ và cho thử lại', async ({ page, api }) => {
    mockPublic(api)
    await page.goto('/lo/KHONG-CO')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Không tải được dữ liệu')
    await expect(alert).toContainText('Không tìm thấy Lô.')
    const before = api.sent('GET', '/api/batches/KHONG-CO').length
    await alert.getByRole('button', { name: 'Thử lại' }).click()
    await expect.poll(() => api.sent('GET', '/api/batches/KHONG-CO').length).toBeGreaterThan(before)
  })
})

test('/chuan-phan-hang nói rõ đây là chuẩn nội bộ tham chiếu và liệt kê quy tắc đang áp dụng', async ({ page, api }) => {
  mockPublic(api)
  await page.goto('/chuan-phan-hang')
  await expect(page.getByRole('heading', { name: 'Cua được chia size và hạng như thế nào' })).toBeVisible()
  await expect(page.getByText('Chuẩn nội bộ tham chiếu, không phải giấy chứng nhận.')).toBeVisible()
  await expect(page.getByText('CS-GRADE-01')).toBeVisible()
  const set = page.locator('section', { has: page.getByRole('heading', { name: 'Cua gạch' }) })
  await expect(set).toContainText('Đang áp dụng')
  await expect(set).toContainText('Phân size theo khối lượng')
  await expect(set.getByRole('row', { name: /≥ 400 g/ })).toContainText('Size L')
  await expect(set.getByRole('row', { name: /từ 300 tới dưới 400 g/ })).toContainText('Size M')
  await expect(set).toContainText('Điều kiện loại bỏ')
  await expect(set.getByRole('row', { name: /Còn sống/ })).toContainText('Loại')
})
