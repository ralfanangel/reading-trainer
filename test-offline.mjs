/**
 * Verify service worker serves app offline.
 */
import { chromium } from 'playwright'

const BASE = process.env.LUMA_URL || 'http://127.0.0.1:8080/'
const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20000 })

await context.setOffline(true)
const resp = await page.goto(BASE, { waitUntil: 'domcontentloaded' })
if (!resp || !resp.ok()) throw new Error('offline load failed: ' + resp?.status())

const title = await page.title()
if (!/Luma Reads/i.test(title)) throw new Error('wrong offline title: ' + title)

const hasLocalFont = await page.evaluate(() =>
  [...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href.includes('fonts/fonts.css'))
)
if (!hasLocalFont) throw new Error('local fonts.css not loaded')

console.log('OFFLINE OK:', title)
await browser.close()
