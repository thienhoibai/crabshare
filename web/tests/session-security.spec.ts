import { test, expect } from '@playwright/test'

test('an old request returning 401 preserves the replacement login session', async ({ page }) => {
  await page.goto('/login')
  const result = await page.evaluate(async () => {
    // Exercise the actual interceptor with a deferred adapter and the actual session store.
    const load = (path: string) => import(/* @vite-ignore */ path)
    const { http } = await load('/src/shared/api/http.ts')
    const { useAuthStore } = await load('/src/shared/auth/authStore.ts')
    const user = { userId: 1, email: 'test@test.local', fullName: 'Test', phone: null, status: 'Active', roles: ['Customer'], operatorId: null }
    useAuthStore.getState().setSession('old-token', '2099-01-01T00:00:00Z', user)
    let rejectRequest: ((error: unknown) => void) | undefined
    const request = http.get('/test-deferred', { adapter: (config: unknown) => new Promise((_, reject) => {
      rejectRequest = () => reject({ config, response: { status: 401 } })
    }) }).catch(() => undefined)
    while (!rejectRequest) await new Promise(resolve => setTimeout(resolve, 0))
    useAuthStore.getState().setSession('new-token', '2099-01-01T00:00:00Z', { ...user, userId: 2 })
    rejectRequest()
    await request
    return { token: useAuthStore.getState().token, userId: useAuthStore.getState().user?.userId }
  })
  expect(result).toEqual({ token: 'new-token', userId: 2 })
})

test('a 401 for the current authenticated request clears its session', async ({ page }) => {
  await page.goto('/login')
  const token = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const { http } = await load('/src/shared/api/http.ts')
    const { useAuthStore } = await load('/src/shared/auth/authStore.ts')
    useAuthStore.getState().setSession('expired-token', '2099-01-01T00:00:00Z', { userId: 1, roles: ['Customer'] })
    await http.get('/test-expired', { adapter: (config: unknown) => Promise.reject({ config, response: { status: 401 } }) }).catch(() => undefined)
    return useAuthStore.getState().token
  })
  expect(token).toBeNull()
})
