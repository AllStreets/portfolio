// Scrolls like a visitor (wheel, from the top) and reports long frames and long tasks along the way.
import { chromium } from '/Users/connorevans/Downloads/Chicago_open_world/app/node_modules/@playwright/test/index.mjs'
const url = process.argv[2] || 'http://localhost:5411/'
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.addInitScript(() => {
  window.__frames = []; window.__tasks = []
  let last = performance.now()
  const f = (t) => { window.__frames.push([t, t - last, scrollY]); last = t; requestAnimationFrame(f) }
  requestAnimationFrame(f)
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__tasks.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true })
})
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(2500)
await page.mouse.move(800, 500)
const t0 = await page.evaluate(() => performance.now())
for (let i = 0; i < 260; i++) { await page.mouse.wheel(0, 60); await page.waitForTimeout(30) }
await page.waitForTimeout(1500)
const { frames, tasks } = await page.evaluate(() => ({ frames: window.__frames, tasks: window.__tasks }))
const seg = innerH => 0
const after = frames.filter((f) => f[0] > t0)
const long = after.filter((f) => f[1] > 25)
console.log('frames', after.length, 'over 25ms', long.length, 'over 50ms', after.filter((f) => f[1] > 50).length, 'worst', Math.max(...after.map((f) => f[1])).toFixed(0))
console.log('long frames (ms @ chapter):', long.slice(0, 30).map((f) => `${f[1].toFixed(0)}@${(f[2] / 1600).toFixed(2)}`).join(' '))
console.log('long tasks after scroll start:', tasks.filter((t) => t[0] > t0).map((t) => t[1].toFixed(0)).join(' '))
await browser.close()
