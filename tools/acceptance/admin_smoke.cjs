// Actual deployed web, real login, read-only navigation. Never save auth state or traces with JWTs.
const path = require('node:path')
const fs = require('node:fs/promises')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || path.resolve(__dirname, '../../web/node_modules/playwright'))

async function main() {
  const web = new URL(process.env.CRABSHARE_WEB_URL || 'https://crabshare.vercel.app')
  const api = new URL(process.env.CRABSHARE_API_URL || 'https://crabshare-api.azurewebsites.net')
  if ([web, api].some(url => url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash))
    throw new Error('Expected HTTPS origins')
  if (!process.env.CRABSHARE_DEMO_PASSWORD) throw new Error('Private demo password environment is required')
  const output = path.resolve(process.env.CS92_OUTPUT_DIR || '.artifacts/cs92-admin')
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
  const results = []
  let pageErrors = 0
  let phase = 'open-login'
  let page
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.on('pageerror', () => { pageErrors++ })
    await page.goto(new URL('/dang-nhap', web).href, { waitUntil: 'domcontentloaded' })
    phase = 'fill-credentials'
    await page.locator('input[type=email]').fill('admin@crabshare.local')
    await page.locator('input[autocomplete=current-password]').fill(process.env.CRABSHARE_DEMO_PASSWORD)
    phase = 'login-request'
    const loginResponse = page.waitForResponse(response => response.url().startsWith(api.origin + '/api/auth/login'), { timeout: 20_000 })
    await page.locator('button[type=submit]').click()
    const login = await loginResponse
    if (login.status() !== 200) throw new Error('Actual web login failed')
    phase = 'admin-navigation'
    await page.waitForURL(url => url.pathname.startsWith('/admin'), { timeout: 15_000 })
    results.push({ check: 'actual-web-admin-login', status: 'PASS' })
    for (const [name, route, endpoint] of [
      ['dashboard', '/admin', '/api/admin/dashboard'],
      ['users', '/admin/users?tab=users', '/api/admin/users'],
      ['alerts', '/admin/alerts', '/api/admin/alerts'],
      ['audit-log', '/admin/audit-log', '/api/admin/audit-log'],
    ]) {
      phase = name
      const requested = page.waitForResponse(response => {
        const url = new URL(response.url())
        return url.origin === api.origin && url.pathname === endpoint && response.request().method() === 'GET'
      }, { timeout: 12_000 }).catch(() => null)
      await page.goto(new URL(route, web).href, { waitUntil: 'domcontentloaded' })
      const response = await requested
      await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true })
      const http = response?.status()
      results.push({ check: name + '-actual-api-request', status: http === 200 ? 'PASS' : (!response || http === 404 ? 'BLOCKED_DEPLOYMENT' : 'FAIL'),
        ...(http ? { http } : { reason: 'No expected API request; screen may be stale or a placeholder' }) })
    }
    results.push({ check: 'no-unhandled-browser-errors', status: pageErrors === 0 ? 'PASS' : 'FAIL', count: pageErrors })
  } catch (error) {
    results.push({ check: 'browser-prerequisite', status: 'FAIL', phase, reason: error.name })
    if (page) await page.screenshot({ path: path.join(output, 'blocked-' + phase + '.png'), fullPage: true }).catch(() => {})
  } finally { await browser.close() }
  const report = { checkedAt: new Date().toISOString(), web: web.origin, api: api.origin, results, passed: results.every(row => row.status === 'PASS') }
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = report.passed ? 0 : 1
}
main().catch(error => { console.error('Admin smoke failed:', error.name); process.exitCode = 1 })
