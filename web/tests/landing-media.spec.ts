/* Configured-media regressions. All manifest entries and API responses in this file
 * are test fixtures; none are shipped in the production manifest. The metadata test
 * exercises mobile preload behavior/event wiring, not video codec playback quality. */
import type { LandingMediaContent } from '../src/features/landing/landingMediaContent'
import { expect, PNG, signIn, test, type Page } from './support/app'
import { mockPublic, trace } from './support/public'

async function configure(page: Page, media: LandingMediaContent) {
  await page.route(/\/src\/features\/landing\/landingMediaContent\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `export const LANDING_MEDIA = ${JSON.stringify(media)};` }))
}
test.beforeEach(async ({ api }) => { mockPublic(api) })

test('metadata alone enables configured media; reduced motion, film dialog and errors remain usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await configure(page, {
    heroLoop: { src: '/landing/test-loop.mp4', alt: 'Clip kiểm thử dàn hộp' },
    film: { src: '/landing/test-film.mp4', alt: 'Phim kiểm thử' },
  })
  // Leave frame requests pending, like metadata-only preload on a constrained device.
  await page.route(/\/landing\/test-(loop|film)\.mp4$/, () => {})
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () { this.dispatchEvent(new Event('playing')); return Promise.resolve() }
    HTMLMediaElement.prototype.pause = function () { this.dispatchEvent(new Event('pause')) }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const loop = page.locator('.ldm-hero__loop')
  const film = page.locator('.ldm-film video')
  await expect(loop).toHaveCount(1)
  await expect(film).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Phát video nền' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Xem phim 1 phút' })).toHaveCount(0)
  for (const [element, duration] of [[loop, 10], [film, 76]] as const) {
    await element.evaluate((video, seconds) => {
      Object.defineProperty(video, 'duration', { configurable: true, value: seconds })
      Object.defineProperty(video, 'readyState', { configurable: true, value: 1 })
      video.dispatchEvent(new Event('loadedmetadata'))
    }, duration)
  }
  await expect(page.getByRole('button', { name: 'Phát video nền' })).toBeVisible()
  await expect(loop).not.toHaveClass(/is-playing/)
  await expect(loop).toHaveJSProperty('muted', true)
  await page.getByRole('button', { name: 'Phát video nền' }).click()
  await expect(loop).toHaveClass(/is-playing/)
  await page.getByRole('button', { name: 'Tạm dừng video nền' }).click()
  await expect(loop).not.toHaveClass(/is-playing/)

  await page.getByRole('button', { name: 'Xem phim 1 phút' }).click()
  await expect(page.getByRole('dialog', { name: 'Phim giới thiệu CrabShare' })).toBeVisible()
  await expect(film).toHaveJSProperty('muted', false)
  await expect(film).toHaveJSProperty('controls', true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Phim giới thiệu CrabShare' })).not.toBeVisible()
  await loop.dispatchEvent('error')
  await film.dispatchEvent('error')
  await expect(page.getByRole('button', { name: 'Phát video nền' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Xem phim 1 phút' })).toHaveCount(0)
})

test('configured capture displays in the evidence section', async ({ page }) => {
  await configure(page, { rack: { src: '/landing/test-rack.png', alt: 'Ảnh dàn hộp kiểm thử' } })
  await page.route('**/landing/test-rack.png', (route) => route.fulfill({ contentType: 'image/png', body: PNG }))
  await signIn(page, 'Investor')
  await page.goto('/')
  await expect(page.locator('#thiet-bi').getByRole('img', { name: 'Ảnh dàn hộp kiểm thử' })).toBeVisible()
})

test('missing capture never produces an empty technology section; trace lookup stays in the footer', async ({ page, api }) => {
  await configure(page, { rack: { src: '/landing/test-missing.png', alt: 'Ảnh chưa có' } })
  await page.route('**/landing/test-missing.png', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/')
  // Lazy image loading starts only when the evidence region comes into view.
  const section = page.locator('#thiet-bi')
  if (await section.count()) await section.scrollIntoViewIfNeeded()
  await expect(section).toHaveCount(0)
  await expect(page.getByRole('contentinfo').getByRole('textbox', { name: 'Mã truy xuất' })).toBeVisible()
  expect(api.sent('GET', `/api/trace/orders/${trace.traceCode}`)).toHaveLength(0)
})

test('role cards show configured chibi art and fall back to icons when a picture fails', async ({ page }) => {
  await configure(page, { roles: { farmer: '/landing/vai/test-farmer.png', investor: '/landing/vai/test-missing.png' } })
  await page.route('**/landing/vai/test-farmer.png', (route) => route.fulfill({ contentType: 'image/png', body: PNG }))
  await page.route('**/landing/vai/test-missing.png', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/')
  const join = page.locator('#bat-dau')
  await join.scrollIntoViewIfNeeded()
  await expect(join.locator('.ld-role--farmer img')).toHaveAttribute('src', '/landing/vai/test-farmer.png')
  await expect(join.locator('.ld-role--investor img')).toHaveCount(0)
  await expect(join.locator('.ld-role--investor .ld-role__mascot')).toBeVisible()
  await expect(join.locator('.ld-role--buyer .ld-role__mascot')).toBeVisible()
  await expect(join.getByRole('link', { name: /Người nuôi/ })).toHaveAttribute('href', '/dang-ky-ho-nuoi')
})
