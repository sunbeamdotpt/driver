import { test, expect, type APIRequestContext } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots')

// Unique run prefix so parallel/repeat runs don't collide
const RUN_ID = `e2e-${Date.now()}`

// Track IDs for cleanup
const createdFileIds: string[] = []

// Save screenshot and display in Ghostty terminal via kitty graphics protocol
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

// Helper: create a file and track it for cleanup
async function createFile(
  request: APIRequestContext,
  data: { filename: string; mimetype: string; parent_id?: string | null },
) {
  const res = await request.post('/api/files', { data })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  const file = body.file ?? body
  createdFileIds.push(file.id)
  return file
}

// Helper: create a folder and track it for cleanup
async function createFolder(
  request: APIRequestContext,
  data: { name: string; parent_id?: string | null },
) {
  const res = await request.post('/api/folders', { data })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  const folder = body.folder ?? body.file ?? body
  createdFileIds.push(folder.id)
  return folder
}

test.describe.serial('Drive E2E Integration', () => {

  // Cleanup: delete all files we created, regardless of pass/fail
  test.afterAll(async ({ request }) => {
    // Delete in reverse order (children before parents)
    for (const id of [...createdFileIds].reverse()) {
      try {
        // Hard-delete: soft-delete then... we just leave them soft-deleted.
        // The test user prefix keeps them isolated anyway.
        await request.delete(`/api/files/${id}`)
      } catch { /* best-effort */ }
    }
  })

  test('health check', async ({ request }) => {
    const res = await request.get('/health')
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).ok).toBe(true)
  })

  test('session returns test user', async ({ request }) => {
    const res = await request.get('/api/auth/session')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.user.email).toBe('e2e@test.local')
  })

  test('app loads — explorer with sidebar', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL(/\/explorer/, { timeout: 5000 })
    await page.waitForTimeout(1000)

    await expect(page.getByText('Drive', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('My Files').first()).toBeVisible()

    await snap(page, '01-app-loaded')
  })

  test('create a folder', async ({ request }) => {
    const folder = await createFolder(request, {
      name: `Game Assets ${RUN_ID}`,
      parent_id: null,
    })
    expect(folder.is_folder).toBe(true)
    expect(folder.filename).toContain('Game Assets')
  })

  test('create files', async ({ request }) => {
    const files = [
      { filename: `${RUN_ID}-character.fbx`, mimetype: 'application/octet-stream' },
      { filename: `${RUN_ID}-brick-texture.png`, mimetype: 'image/png' },
      { filename: `${RUN_ID}-theme-song.mp3`, mimetype: 'audio/mpeg' },
      { filename: `${RUN_ID}-game-design.docx`, mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { filename: `${RUN_ID}-level-data.json`, mimetype: 'application/json' },
    ]
    for (const f of files) {
      await createFile(request, { ...f, parent_id: null })
    }
  })

  test('file listing shows created files', async ({ page }) => {
    await page.goto('/explorer')
    await page.waitForTimeout(2000)

    await expect(page.getByText(`${RUN_ID}-character.fbx`)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(`${RUN_ID}-brick-texture.png`)).toBeVisible()
    await expect(page.getByText(`${RUN_ID}-game-design.docx`)).toBeVisible()

    await snap(page, '02-files-listed')
  })

  test('upload via pre-signed URL', async ({ request }) => {
    const file = await createFile(request, {
      filename: `${RUN_ID}-uploaded-scene.glb`,
      mimetype: 'model/gltf-binary',
      parent_id: null,
    })

    // Get pre-signed upload URL
    const urlRes = await request.post(`/api/files/${file.id}/upload-url`, {
      data: { content_type: 'model/gltf-binary' },
    })
    expect(urlRes.ok()).toBeTruthy()
    const urlData = await urlRes.json()
    const uploadUrl = urlData.url ?? urlData.upload_url
    expect(uploadUrl).toBeTruthy()

    // Upload content directly to S3
    const content = Buffer.from('glTF-binary-test-content-placeholder')
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: content,
      headers: { 'Content-Type': 'model/gltf-binary' },
    })
    expect(putRes.ok).toBeTruthy()

    // Verify download URL
    const dlRes = await request.get(`/api/files/${file.id}/download`)
    expect(dlRes.ok()).toBeTruthy()
    const dlData = await dlRes.json()
    expect(dlData.url).toBeTruthy()
  })

  test('file CRUD: rename and soft-delete', async ({ request }) => {
    const file = await createFile(request, {
      filename: `${RUN_ID}-lifecycle.txt`,
      mimetype: 'text/plain',
      parent_id: null,
    })

    // Rename
    const renameRes = await request.put(`/api/files/${file.id}`, {
      data: { filename: `${RUN_ID}-renamed.txt` },
    })
    expect(renameRes.ok()).toBeTruthy()
    const renamed = await renameRes.json()
    expect((renamed.file ?? renamed).filename).toBe(`${RUN_ID}-renamed.txt`)

    // Soft delete
    const delRes = await request.delete(`/api/files/${file.id}`)
    expect(delRes.ok()).toBeTruthy()

    // Should appear in trash
    const trashRes = await request.get('/api/trash')
    expect(trashRes.ok()).toBeTruthy()
    const trashFiles = (await trashRes.json()).files ?? []
    expect(trashFiles.some((f: { id: string }) => f.id === file.id)).toBeTruthy()

    // Restore
    const restoreRes = await request.post(`/api/files/${file.id}/restore`)
    expect(restoreRes.ok()).toBeTruthy()

    // No longer in trash
    const trashRes2 = await request.get('/api/trash')
    const trashFiles2 = (await trashRes2.json()).files ?? []
    expect(trashFiles2.some((f: { id: string }) => f.id === file.id)).toBeFalsy()
  })

  test('WOPI token + CheckFileInfo', async ({ request }) => {
    const file = await createFile(request, {
      filename: `${RUN_ID}-wopi-test.odt`,
      mimetype: 'application/vnd.oasis.opendocument.text',
      parent_id: null,
    })

    // Generate WOPI token
    const tokenRes = await request.post('/api/wopi/token', { data: { file_id: file.id } })
    expect(tokenRes.ok()).toBeTruthy()
    const tokenData = await tokenRes.json()
    expect(tokenData.access_token).toBeTruthy()
    expect(tokenData.access_token_ttl).toBeGreaterThan(Date.now())

    // CheckFileInfo via WOPI endpoint
    const checkRes = await request.get(`/wopi/files/${file.id}?access_token=${tokenData.access_token}`)
    expect(checkRes.ok()).toBeTruthy()
    const info = await checkRes.json()
    expect(info.BaseFileName).toBe(`${RUN_ID}-wopi-test.odt`)
    expect(info.SupportsLocks).toBe(true)
    expect(info.UserCanWrite).toBe(true)
    expect(info.UserId).toBe('e2e-test-user-00000000')
  })

  test('navigate pages: recent, favorites, trash', async ({ page }) => {
    await page.goto('/recent')
    await page.waitForTimeout(1000)
    await snap(page, '03-recent-page')

    await page.goto('/favorites')
    await page.waitForTimeout(1000)
    await snap(page, '04-favorites-page')

    await page.goto('/trash')
    await page.waitForTimeout(1000)
    await snap(page, '05-trash-page')
  })

  test('final screenshot — full explorer with files', async ({ page }) => {
    await page.goto('/explorer')
    await page.waitForTimeout(2000)
    await snap(page, '06-final-explorer')
  })
})
