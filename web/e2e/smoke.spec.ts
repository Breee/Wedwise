import { expect, test, type Page } from '@playwright/test'

// Runs against a started instance with the users created by `make up`.
const STAFF = { username: 'couple', password: 'couple12345' }

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    // The local test certificate is not trusted, so the service worker cannot register there.
    if (m.type() === 'error' && !/SSL certificate|Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  return errors
}

test('home page shows the wedding', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await expect(page.locator('h1')).toBeVisible()
  for (const id of ['ort', 'ablauf', 'anreise', 'faq']) await expect(page.locator(`#${id}`)).toBeAttached()
  await page.locator('#anreise').scrollIntoViewIfNeeded()
  await expect(page.locator('#anreise .maplibregl-canvas').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('guest answers through an invite link', async ({ page, request }) => {
  expect((await request.post('/api/auth/login', { data: STAFF })).ok()).toBeTruthy()
  const created = await request.post('/api/invite-links/')
  expect(created.status()).toBe(201)
  const { id, token } = await created.json()

  const errors = watchErrors(page)
  await page.goto(`/rsvp/${token}`)
  const name = page.locator('#contactName')
  await name.scrollIntoViewIfNeeded()
  await name.fill('Smoke Test')
  const next = page.locator('form button[type=submit]')
  await next.click()
  await page.locator('#status-no').click()
  await next.click()
  await next.click()
  await expect(page.locator('#contactName')).toHaveCount(0)
  await expect(page.locator('form')).toHaveCount(0)
  expect(errors).toEqual([])

  const list = await (await request.get('/api/responses/')).json()
  const mine = list.responses.filter((r: { contactName: string }) => r.contactName === 'Smoke Test')
  expect(mine.length).toBeGreaterThan(0)
  await request.post('/api/responses/delete', { data: { ids: mine.map((r: { id: number }) => r.id) } })
  await request.delete(`/api/invite-links/${id}`)
})

test('staff can sign in', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/login')
  await page.locator('#username').fill(STAFF.username)
  await page.locator('#password').fill(STAFF.password)
  await page.locator('form button[type=submit]').click()
  // An account without a passkey is offered one first.
  await page.getByRole('button', { name: 'Später' }).click()
  await expect(page).toHaveURL(/\/couple\/dashboard/)
  await expect(page.locator('main h1, main h2').first()).toBeVisible()
  expect(errors).toEqual([])
})
