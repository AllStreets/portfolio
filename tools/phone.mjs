// Phone-like diagnostics through Chrome DevTools: 390x844 at 3x, 4x CPU slowdown, ~10 Mbps.
// Reports bytes, time to globe, memory, GPU load and frame rate per chapter.
import { chromium } from '/Users/connorevans/Downloads/Chicago_open_world/app/node_modules/@playwright/test/index.mjs'
const url = process.argv[2] || 'https://connor-evans.vercel.app/'
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 70, downloadThroughput: 1.25e6, uploadThroughput: 4e5 })
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
let bytes = 0; const files = {}
cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength })
cdp.on('Network.responseReceived', (e) => { files[e.requestId] = e.response.url })
const t0 = Date.now()
await page.goto(url + '?r=' + Math.random())
await page.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 90000 })
console.log('globe visible', ((Date.now() - t0) / 1000).toFixed(1), 's')
await page.waitForTimeout(15000)
console.log('MB downloaded in first', ((Date.now() - t0) / 1000).toFixed(0), 's:', (bytes / 1e6).toFixed(1))
const n = await page.evaluate(() => window.__globe.chapters.length)
for (const i of [0, 1, 2, 3, 5]) {
  await page.evaluate((i) => scrollTo(0, i * innerHeight * 1.5 + 2), i)
  await page.waitForTimeout(5000)
  const r = await page.evaluate(() => new Promise((res) => { let n = 0, worst = 0, last = performance.now(); const s = last; const f = (t) => { worst = Math.max(worst, t - last); last = t; n++; if (t - s < 3000) requestAnimationFrame(f); else res({ fps: (n / 3).toFixed(0), worst: worst.toFixed(0) }) }; requestAnimationFrame(f) }))
  const info = await page.evaluate(() => { const r = window.__globe.renderer; return { lite: window.__globe.lite, texMB: window.__globe.texMB, tex: r.info.memory.textures, geo: r.info.memory.geometries, tris: r.info.render.triangles, px: r.getPixelRatio(), heapMB: performance.memory ? (performance.memory.usedJSHeapSize / 1e6).toFixed(0) : '?' } })
  console.log('chapter', i, JSON.stringify({ ...r, ...info }))
}
console.log('total MB', (bytes / 1e6).toFixed(1))
await browser.close()
