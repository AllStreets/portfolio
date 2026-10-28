// Contact sheet of the flight between chapters at fractional scroll positions.
import { chromium } from '/Users/connorevans/Downloads/Chicago_open_world/app/node_modules/@playwright/test/index.mjs'
const url = process.argv[2] || 'http://localhost:5410/'
const ps = (process.argv[3] || '0.6,0.75,0.9,1.6,1.75,1.9,2.6,2.75,2.9,3.6,3.75,3.9,4.6,4.75,4.9,7.6,7.75,7.9').split(',').map(Number)
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__globe && window.__globe.city, null, { timeout: 60000 })
await page.waitForTimeout(2000)
for (const p of ps) {
  await page.evaluate((p) => scrollTo(0, p * innerHeight * 1.6), p)
  await page.waitForTimeout(2600)
  await page.screenshot({ path: `shots/f-${p}.png` })
}
await browser.close()
