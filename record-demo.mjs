/**
 * Clean demo recording (no DevTools). Saves video + screenshots.
 */
import { chromium } from 'playwright'
import { mkdirSync, copyFileSync, readdirSync } from 'fs'
import { join } from 'path'

const BASE = process.env.LUMA_URL || 'http://127.0.0.1:8080/'
const OUT = '/opt/cursor/artifacts'
const VID = '/tmp/luma-pw-video'
mkdirSync(OUT, { recursive: true })
mkdirSync(VID, { recursive: true })

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    recordVideo: { dir: VID, size: { width: 1024, height: 768 } }
  })
  const page = await context.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/walk_01_welcome.png` })

  await page.fill('[data-testid="child-name"]', 'Mia')
  await page.click('[data-testid="start-btn"]')
  await page.waitForSelector('#view-home.is-on')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/walk_02_home.png` })

  await page.click('[data-testid="mode-sight"]')
  await page.waitForSelector('[data-testid="sight-card"]')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/walk_03_heart.png` })
  await page.click('[data-testid="said-btn"]')
  await page.waitForTimeout(1100)
  await page.click('[data-testid="said-btn"]')
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/walk_04_heart_points.png` })

  await page.click('#backHome')
  const modal = page.locator('#leaveModal:not(.hidden)')
  if (await modal.count()) await page.click('#leaveYes')
  await page.waitForSelector('#view-surprise.is-on', { timeout: 4000 }).catch(() => {})
  if (await page.locator('#view-surprise.is-on').count()) {
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/walk_05_surprise_early.png` })
    await page.click('#againBtn')
    await page.waitForSelector('#view-home.is-on')
  } else {
    await page.waitForSelector('#view-home.is-on')
  }

  await page.click('[data-testid="mode-symbol"]')
  await page.waitForSelector('[data-testid="symbol-card"]')
  await page.waitForTimeout(400)
  const label = await page.getAttribute('[data-testid="symbol-card"] .word-line', 'aria-label')
  const word = String(label || '').replace(/^Word\s+/i, '').trim()
  const choices = page.locator('.choice')
  for (let i = 0; i < await choices.count(); i++) {
    const a = await choices.nth(i).getAttribute('aria-label')
    if (a !== word) { await choices.nth(i).click(); await page.waitForTimeout(500); break }
  }
  await page.click(`[data-testid="choice-${word}"]`)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/walk_06_picture.png` })

  await page.evaluate(() => window.__lumaForceSurprise(['the', 'said', 'you', 'ship', 'cat']))
  await page.waitForSelector('#view-surprise.is-on')
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/walk_07_surprise.png` })

  await page.click('[data-testid="buddy"]')
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/walk_08_pip.png` })

  await context.close()
  await browser.close()

  const vids = readdirSync(VID).filter((f) => f.endsWith('.webm'))
  if (!vids.length) throw new Error('no playwright video')
  const src = join(VID, vids[0])
  // Convert to mp4 under 15MB
  const { execSync } = await import('child_process')
  execSync(`ffmpeg -y -i "${src}" -vf scale=1024:-2 -c:v libx264 -preset veryfast -crf 26 -an -movflags +faststart ${OUT}/luma_reads_clean_walkthrough.mp4`, { stdio: 'inherit' })
  console.log('CLEAN WALKTHROUGH READY')
}

main().catch((e) => { console.error(e); process.exit(1) })
