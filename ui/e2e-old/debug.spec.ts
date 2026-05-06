import { test, expect } from '@playwright/test'

test('debug: check console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', err => errors.push(err.message))

  await page.goto('/')
  await page.waitForTimeout(3000)

  console.log('=== Console errors ===')
  for (const e of errors) console.log(e)
  console.log('=== End errors ===')

  const content = await page.content()
  console.log('=== Page HTML (first 2000 chars) ===')
  console.log(content.slice(0, 2000))
})
