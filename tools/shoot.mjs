// Screenshots each chapter from a headless GPU browser. Usage: node tools/shoot.mjs [url] [w] [h] [prefix]
import { chromium } from '/Users/connorevans/Downloads/Chicago_open_world/app/node_modules/@playwright/test/index.mjs'
const url = process.argv[2] || 'http://localhost:5410/'
const w = +(process.argv[3] || 1600), h = +(process.argv[4] || 1000)
const prefix = process.argv[5] || 'd'
const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
const errs = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()) })
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__globe && window.__globe.city, null, { timeout: 60000 })
await page.waitForTimeout(2500)
if (process.env.EVAL) await page.evaluate(process.env.EVAL)
const n = await page.evaluate(() => window.__globe.chapters.length)
for (let i = 0; i < n; i++) {
  if (only && !only.includes(i)) continue
  await page.evaluate((i) => { const s = innerHeight * (innerWidth <= 760 ? 1.5 : 1.6); scrollTo(0, i * s + (i ? 2 : 0)) }, i)
  await page.waitForTimeout(3200)
  await page.screenshot({ path: `shots/${prefix}-${i}.png` })
}
if (!only) {
  await page.evaluate(() => document.getElementById('index').scrollIntoView())
  await page.waitForTimeout(800)
  await page.screenshot({ path: `shots/${prefix}-index.png` })
}
console.log(errs.slice(0, 3).map(e=>e.slice(0,1500)).join('\n----\n') || 'no console errors')
await browser.close()
