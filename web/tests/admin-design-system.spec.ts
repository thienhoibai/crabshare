import { expect, signIn, test } from './support/app'
import { mockAdmin } from './support/admin'

test('admin shell presents page context as readable navigation text', async ({ page, api }) => {
  mockAdmin(api)
  await signIn(page, 'PlatformAdmin')
  await page.goto('/admin/batches')

  await expect(page.locator('.o2--admin')).toBeVisible()
  await expect(page.locator('.op-heading__context')).toHaveText('Lô')
  await expect(page.locator('.op-heading .rd-eyebrow')).toHaveCount(0)
})
