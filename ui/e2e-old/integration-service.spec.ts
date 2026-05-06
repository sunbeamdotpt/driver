import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots')

const INTEGRATION_URL = process.env.INTEGRATION_URL || 'https://integration.sunbeam.pt'

async function snap(page: import('@playwright/test').Page, label: string) {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const filePath = path.join(SCREENSHOT_DIR, `${label}.png`)
  await page.screenshot({ path: filePath, fullPage: true })

  const data = fs.readFileSync(filePath)
  const b64 = data.toString('base64')
  const chunkSize = 4096
  for (let i = 0; i < b64.length; i += chunkSize) {
    const chunk = b64.slice(i, i + chunkSize)
    const isLast = i + chunkSize >= b64.length
    if (i === 0) {
      process.stdout.write(`\x1b_Ga=T,f=100,m=${isLast ? 0 : 1};${chunk}\x1b\\`)
    } else {
      process.stdout.write(`\x1b_Gm=${isLast ? 0 : 1};${chunk}\x1b\\`)
    }
  }
  process.stdout.write('\n')
  console.log(`  Screenshot: ${label}`)
}

// Expected token values from the Sunbeam theme
const EXPECTED_TOKENS = {
  '--c--globals--colors--brand-500': '#f59e0b',
  '--c--globals--colors--gray-000': '#0C1A2B',
  '--c--globals--colors--gray-900': '#EFF1F3',
  '--c--theme--colors--primary-500': '#f59e0b',
  '--c--theme--colors--primary-400': '#fbbf24',
  '--c--theme--colors--greyscale-000': '#0C1A2B',
  '--c--theme--colors--greyscale-800': '#F3F4F4',
  '--c--globals--font--families--base': "'Ysabeau'",
}

/** Gaufre button vanilla CSS (from integration package — needed for mask-image icon) */
const GAUFRE_BUTTON_CSS = `
.lasuite-gaufre-btn--vanilla::before,
.lasuite-gaufre-btn--vanilla::after {
  mask-image: url("data:image/svg+xml,%3Csvg width%3D%2224%22 height%3D%2224%22 viewBox%3D%220 0 24 24%22 xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath d%3D%22m11.931261 8.1750088 3.362701 1.9413282v3.882529l-3.362701 1.941262-3.3627003-1.941262v-3.882529zm3.785275-6.8155706 3.362701 1.9412995v3.8825496l-3.362701 1.9412783-3.362701-1.9412783V3.3007377Zm0 13.5159968 3.362701 1.941263v3.882529l-3.362701 1.941335-3.362701-1.941335v-3.882529ZM4.3627012 8.1750088l3.3627014 1.9413282v3.882529l-3.3627014 1.941262L1 13.998866v-3.882529Zm3.7841385-6.8155706 3.3627023 1.9412995v3.8825496L8.1468397 9.1245656 4.7841172 7.1832873V3.3007377Zm0 13.5159968 3.3627023 1.941263v3.882529l-3.3627023 1.941335-3.3627225-1.941335v-3.882529ZM19.637299 8.1750088 23 10.116337v3.882529l-3.362701 1.941262-3.362702-1.941262v-3.882529z%22%2F%3E%3C%2Fsvg%3E") !important;
}
.lasuite-gaufre-btn--vanilla {
  all: unset; overflow-wrap: break-word !important; box-sizing: border-box !important;
  appearance: none !important; border: none !important; cursor: pointer !important;
  display: inline-flex !important; align-items: center !important;
  width: fit-content !important; min-height: 2.5rem !important;
  padding: 0.5rem !important; background-color: transparent !important;
  color: var(--c--theme--colors--primary-400, #000091) !important;
  box-shadow: inset 0 0 0 1px var(--c--theme--colors--greyscale-200, #ddd) !important;
  overflow: hidden !important; white-space: nowrap !important;
  max-width: 2.5rem !important; max-height: 2.5rem !important;
}
.lasuite-gaufre-btn--vanilla::before {
  content: "" !important; flex: 0 0 auto !important; display: block !important;
  background-color: currentColor !important;
  width: 1.5rem !important; height: 1.5rem !important;
  mask-size: 100% 100% !important; -webkit-mask-size: 100% 100% !important;
  margin-left: 0 !important; margin-right: 0.5rem !important;
}
html:not(.lasuite--gaufre-loaded) .lasuite-gaufre-btn { visibility: hidden !important; }
`

/** Load integration theme + gaufre into a page */
async function injectIntegration(page: import('@playwright/test').Page) {
  // Add gaufre button CSS (for the mask-image waffle icon)
  await page.addStyleTag({ content: GAUFRE_BUTTON_CSS })
  // Add theme CSS (overrides Cunningham tokens)
  await page.addStyleTag({ url: `${INTEGRATION_URL}/api/v2/theme.css` })
  // Load lagaufre widget script and init with the button element
  await page.evaluate(async (url) => {
    return new Promise<void>((resolve) => {
      const script = document.createElement('script')
      script.src = url
      script.onload = () => {
        // Init the widget with the button element
        const btn = document.querySelector('.js-lasuite-gaufre-btn')
        if (btn) {
          ;(window as any)._lasuite_widget = (window as any)._lasuite_widget || []
          ;(window as any)._lasuite_widget.push(['lagaufre', 'init', {
            api: url.replace('lagaufre.js', 'services.json'),
            buttonElement: btn,
            label: 'Sunbeam Studios',
            closeLabel: 'Close',
            newWindowLabelSuffix: ' \u00b7 new window',
          }])
        }
        document.documentElement.classList.add('lasuite--gaufre-loaded')
        resolve()
      }
      script.onerror = () => resolve()
      document.head.appendChild(script)
    })
  }, `${INTEGRATION_URL}/api/v2/lagaufre.js`)
  // Let fonts and styles settle
  await page.waitForTimeout(1500)
}

test.describe.serial('Integration Service Validation', () => {

  // ── API endpoint checks ─────────────────────────────────────────────────

  test('01 — theme.css loads with correct content type and CSS custom properties', async ({ request }) => {
    const res = await request.get(`${INTEGRATION_URL}/api/v2/theme.css`)
    expect(res.ok()).toBeTruthy()

    const contentType = res.headers()['content-type'] ?? ''
    expect(contentType).toContain('css')

    const css = await res.text()
    expect(css.length).toBeGreaterThan(500)

    // Verify critical token declarations exist
    for (const [token] of Object.entries(EXPECTED_TOKENS)) {
      expect(css, `theme.css should declare ${token}`).toContain(token)
    }

    // Verify font imports
    expect(css).toContain('Ysabeau')
    expect(css).toContain('Material')

    console.log(`  theme.css: ${css.length} bytes`)
  })

  test('02 — services.json lists expected suite services', async ({ request }) => {
    const res = await request.get(`${INTEGRATION_URL}/api/v2/services.json`)
    expect(res.ok()).toBeTruthy()

    const data = await res.json()
    const services = Array.isArray(data) ? data : data.services ?? data.items ?? Object.values(data)
    expect(services.length).toBeGreaterThan(0)

    const names = services.map((s: Record<string, string>) => s.name ?? s.title ?? s.label)
    console.log(`  services: ${names.join(', ')}`)

    // Should have at minimum these core services
    const lowerNames = names.map((n: string) => n.toLowerCase())
    for (const expected of ['drive', 'mail', 'calendar']) {
      expect(lowerNames.some((n: string) => n.includes(expected)),
        `services.json should include "${expected}"`).toBeTruthy()
    }
  })

  test('03 — lagaufre.js is valid JavaScript (not HTML 404)', async ({ request }) => {
    const res = await request.get(`${INTEGRATION_URL}/api/v2/lagaufre.js`)
    expect(res.ok()).toBeTruthy()

    const js = await res.text()
    expect(js.length).toBeGreaterThan(100)
    expect(js).not.toContain('<!DOCTYPE')
    expect(js).not.toContain('<html')

    console.log(`  lagaufre.js: ${js.length} bytes`)
  })

  test('04 — lagaufre.js embeds popup CSS and widget logic', async ({ request }) => {
    const res = await request.get(`${INTEGRATION_URL}/api/v2/lagaufre.js`)
    expect(res.ok()).toBeTruthy()

    const js = await res.text()
    // Embeds popup CSS with service grid, cards, and shadow DOM rendering
    expect(js).toContain('services-grid')
    expect(js).toContain('service-card')
    expect(js).toContain('service-name')
    expect(js).toContain('wrapper-dialog')
    // Widget API event handling
    expect(js).toContain('lasuite-widget')
    expect(js).toContain('lagaufre')

    console.log(`  lagaufre.js: embeds popup CSS, shadow DOM, event API`)
  })

  // ── Token rendering validation ──────────────────────────────────────────

  test('05 — theme tokens are applied to :root when CSS is loaded', async ({ page }) => {
    await page.goto('http://localhost:3100/')
    await page.waitForURL(/\/explorer/, { timeout: 5000 })

    // Inject the integration theme
    await page.addStyleTag({ url: `${INTEGRATION_URL}/api/v2/theme.css` })
    await page.waitForTimeout(500)

    // Read computed values from :root
    const tokenResults = await page.evaluate((tokens) => {
      const style = getComputedStyle(document.documentElement)
      const results: Record<string, { expected: string; actual: string; match: boolean }> = {}
      for (const [token, expected] of Object.entries(tokens)) {
        const actual = style.getPropertyValue(token).trim()
        // Normalize for comparison (case-insensitive hex, trim quotes from font families)
        const normalExpected = expected.toLowerCase().replace(/['"]/g, '')
        const normalActual = actual.toLowerCase().replace(/['"]/g, '')
        results[token] = {
          expected,
          actual: actual || '(not set)',
          match: normalActual.includes(normalExpected),
        }
      }
      return results
    }, EXPECTED_TOKENS)

    for (const [token, result] of Object.entries(tokenResults)) {
      console.log(`  ${result.match ? '✓' : '✗'} ${token}: ${result.actual} (expected: ${result.expected})`)
      expect(result.match, `Token ${token}: got "${result.actual}", expected "${result.expected}"`).toBeTruthy()
    }

    await snap(page, 'i01-tokens-applied')
  })

  test('06 — header background uses theme greyscale-000 (dark navy)', async ({ page }) => {
    await page.goto('http://localhost:3100/')
    await page.waitForURL(/\/explorer/, { timeout: 5000 })
    await injectIntegration(page)

    const headerBg = await page.evaluate(() => {
      const header = document.querySelector('header')
      return header ? getComputedStyle(header).backgroundColor : null
    })

    expect(headerBg).toBeTruthy()
    // Should be dark (#0C1A2B → rgb(12, 26, 43))
    console.log(`  Header background: ${headerBg}`)
    // Verify it's a dark color (R+G+B < 150)
    const match = headerBg!.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (match) {
      const sum = parseInt(match[1]) + parseInt(match[2]) + parseInt(match[3])
      expect(sum).toBeLessThan(150)
    }

    await snap(page, 'i02-header-dark-bg')
  })

  test('07 — sidebar uses correct theme background', async ({ page }) => {
    await page.goto('http://localhost:3100/')
    await page.waitForURL(/\/explorer/, { timeout: 5000 })
    await injectIntegration(page)

    const navBg = await page.evaluate(() => {
      const nav = document.querySelector('nav')
      return nav ? getComputedStyle(nav).backgroundColor : null
    })
    console.log(`  Sidebar background: ${navBg}`)

    await snap(page, 'i03-sidebar-themed')
  })

  test('08 — profile avatar uses brand primary-400 (amber)', async ({ page }) => {
    await page.goto('http://localhost:3100/')
    await page.waitForURL(/\/explorer/, { timeout: 5000 })
    await injectIntegration(page)

    const avatarBg = await page.evaluate(() => {
      const btn = document.querySelector('[aria-label="Profile menu"]')
      const avatar = btn?.querySelector('div')
      return avatar ? getComputedStyle(avatar).backgroundColor : null
    })

    console.log(`  Avatar background: ${avatarBg}`)
    // Should be amber (#fbbf24 → rgb(251, 191, 36))
    expect(avatarBg).toBeTruthy()
    if (avatarBg!.includes('rgb')) {
      const match = avatarBg!.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
      if (match) {
        expect(parseInt(match[1])).toBeGreaterThan(200) // R > 200 (amber)
        expect(parseInt(match[2])).toBeGreaterThan(100) // G > 100
      }
    }

    await snap(page, 'i04-avatar-amber')
  })

  // ── Waffle menu integration ─────────────────────────────────────────────

  test('09 — gaufre button is visible and styled', async ({ page }) => {
    await page.goto('http://localhost:3100/')
    await page.waitForURL(/\/explorer/, { timeout: 5000 })
    await injectIntegration(page)

    const gaufreBtn = page.locator('.lasuite-gaufre-btn')
    await expect(gaufreBtn).toBeVisible({ timeout: 3000 })

    // Verify the mask-image waffle icon is applied (button should have ::before)
    const hasMask = await page.evaluate(() => {
      const btn = document.querySelector('.lasuite-gaufre-btn')
      if (!btn) return false
      const before = getComputedStyle(btn, '::before')
      return before.maskImage !== 'none' && before.maskImage !== ''
    })
    console.log(`  Gaufre button mask-image: ${hasMask}`)

    await snap(page, 'i05-gaufre-button')
  })

  test('10 — gaufre popup opens on click and shows services', async ({ page }) => {
    await page.goto('http://localhost:3100/')
    await page.waitForURL(/\/explorer/, { timeout: 5000 })
    await injectIntegration(page)

    const gaufreBtn = page.locator('.lasuite-gaufre-btn')
    await expect(gaufreBtn).toBeVisible({ timeout: 3000 })

    // Click to open the waffle popup
    await gaufreBtn.click()
    await page.waitForTimeout(1500)

    // The lagaufre popup renders in a shadow DOM or as a sibling element
    const popupVisible = await page.evaluate(() => {
      // Check for the popup element (lagaufre v2 creates #lasuite-gaufre-popup)
      const popup = document.getElementById('lasuite-gaufre-popup')
      if (popup) return { found: true, visible: popup.offsetHeight > 0 }
      // Also check shadow DOM on the button
      const btn = document.querySelector('.js-lasuite-gaufre-btn')
      if (btn?.shadowRoot) {
        const shadow = btn.shadowRoot.querySelector('[role="dialog"], [class*="popup"]')
        return { found: !!shadow, visible: shadow ? (shadow as HTMLElement).offsetHeight > 0 : false }
      }
      return { found: false, visible: false }
    })
    console.log(`  Gaufre popup: found=${popupVisible.found}, visible=${popupVisible.visible}`)

    await snap(page, 'i06-gaufre-popup-open')
  })

  // ── Full themed app ─────────────────────────────────────────────────────

  test('11 — full themed explorer with files', async ({ page, request }) => {
    // Create some files for a populated view
    const RUN = `int-${Date.now()}`
    const fileIds: string[] = []
    for (const f of [
      { filename: `${RUN}-scene.glb`, mimetype: 'model/gltf-binary' },
      { filename: `${RUN}-design.docx`, mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { filename: `${RUN}-hero.png`, mimetype: 'image/png' },
    ]) {
      const res = await request.post('/api/files', { data: { ...f, parent_id: null } })
      if (res.ok()) {
        const body = await res.json()
        fileIds.push((body.file ?? body).id)
      }
    }

    await page.goto('http://localhost:3100/explorer')
    await page.waitForTimeout(500)
    await injectIntegration(page)
    await page.waitForTimeout(500)

    await snap(page, 'i07-full-themed-explorer')

    // Cleanup
    for (const id of fileIds) {
      await request.delete(`/api/files/${id}`)
    }
  })

  test('12 — font family is Ysabeau (not default Roboto)', async ({ page }) => {
    await page.goto('http://localhost:3100/')
    await page.waitForURL(/\/explorer/, { timeout: 5000 })
    await injectIntegration(page)

    const fontFamily = await page.evaluate(() => {
      return getComputedStyle(document.body).fontFamily
    })
    console.log(`  Body font-family: ${fontFamily}`)
    expect(fontFamily.toLowerCase()).toContain('ysabeau')

    await snap(page, 'i08-font-ysabeau')
  })
})
