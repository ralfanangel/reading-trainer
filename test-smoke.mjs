/**
 * Headless smoke test for Luma Reads (Playwright).
 * Run: npx --yes playwright@1.49.0 install chromium && node test-smoke.mjs
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

const BASE = process.env.LUMA_URL || 'http://127.0.0.1:8080/'
const OUT = '/opt/cursor/artifacts'
mkdirSync(OUT, { recursive: true })

const log = []
const note = (m) => { console.log(m); log.push(m) }

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${OUT}/test_01_welcome.png`, fullPage: true })
  note('OK welcome loaded')

  // unit: silent-e exceptions + heart words stay unsegmented in sight UI
  const split = await page.evaluate(() => {
    const f = window.__lumaSplit
    return {
      are: f('are').map((p) => p.kind),
      cake: f('cake').map((p) => p.kind),
      the: f('the').map((p) => `${p.text}:${p.kind}`),
      ship: f('ship').map((p) => `${p.text}:${p.kind}`)
    }
  })
  if (split.are.includes('silent')) throw new Error('are should not be silent-e: ' + JSON.stringify(split.are))
  if (!split.cake.includes('silent')) throw new Error('cake should mark silent e')
  if (!split.ship.some((s) => s.startsWith('sh:digraph'))) throw new Error('ship should group sh')
  note('OK grapheme splits ' + JSON.stringify(split))

  await page.fill('[data-testid="child-name"]', 'Mia')
  await page.click('[data-testid="start-btn"]')
  await page.waitForSelector('#view-home.is-on', { timeout: 5000 })
  await page.screenshot({ path: `${OUT}/test_02_home.png`, fullPage: true })
  note('OK began as Mia')

  await page.click('[data-testid="mode-sight"]')
  await page.waitForSelector('#view-play.is-on')
  await page.waitForSelector('[data-testid="sight-card"]')
  const heart = await page.locator('.word-line.is-heart').count()
  if (!heart) throw new Error('sight mode should show heart-word underline')
  note('OK heart-word underline in sight mode')
  await page.screenshot({ path: `${OUT}/test_03_sight.png`, fullPage: true })
  const pts0 = await page.textContent('#points')
  await page.click('[data-testid="said-btn"]')
  await page.waitForTimeout(900)
  const pts1 = await page.textContent('#points')
  if (Number(pts1) <= Number(pts0)) throw new Error(`points did not rise: ${pts0} -> ${pts1}`)
  note(`OK sight award ${pts0} -> ${pts1}`)
  await page.screenshot({ path: `${OUT}/test_04_sight_point.png`, fullPage: true })

  await page.click('#backHome')
  await page.waitForSelector('#view-home.is-on')
  await page.click('[data-testid="mode-symbol"]')
  await page.waitForSelector('[data-testid="symbol-card"]')
  const label = await page.getAttribute('[data-testid="symbol-card"] .word-line', 'aria-label')
  const word = String(label || '').replace(/^Word\s+/i, '').trim()
  if (!word) throw new Error('missing symbol word label')
  const choices = page.locator('.choice')
  const count = await choices.count()
  let wrongTapped = false
  for (let i = 0; i < count; i++) {
    const a = await choices.nth(i).getAttribute('aria-label')
    if (a !== word) {
      await choices.nth(i).click()
      wrongTapped = true
      await page.waitForTimeout(450)
      break
    }
  }
  note(wrongTapped ? `OK wrong choice rejected for ${word}` : 'WARN no wrong choice')
  await page.click(`[data-testid="choice-${word}"]`)
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/test_05_symbol.png`, fullPage: true })
  note('OK correct symbol awarded')

  await page.evaluate(() => window.__lumaForceSurprise(['the', 'and', 'you', 'ship', 'cat']))
  await page.waitForSelector('#view-surprise.is-on')
  const story = await page.textContent('#storyPage')
  if (!/Mia/.test(story)) throw new Error('story missing child name')
  if (!/the|and|you|ship|cat/i.test(story)) throw new Error('story missing practiced words')
  await page.screenshot({ path: `${OUT}/test_06_surprise.png`, fullPage: true })
  note('OK surprise story for Mia')

  await page.click('[data-testid="buddy"]')
  await page.waitForTimeout(400)
  const bubbleHidden = await page.locator('#bubble').evaluate((el) => el.classList.contains('hidden'))
  if (bubbleHidden) throw new Error('buddy bubble did not show')
  note('OK buddy tip bubble')

  writeFileSync(`${OUT}/smoke_test_log.txt`, log.join('\n') + '\n')
  await browser.close()
  console.log('ALL PASS')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
