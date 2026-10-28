import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import './style.css'
import { R, latLon, enu, formatCoord, distance } from './geo'
import { subsolar, gmstRadians } from './sun'
import { makeEarth, surfacePatch } from './earth'
import { makeStars } from './stars'
import { makeChicago, CHICAGO } from './chicago'
import { makeCircuit, ALBERT } from './circuit'
import { chapters, index, PATH, type View } from './chapters'

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const small = matchMedia('(max-width: 760px)').matches

// ---------- Words on the page ----------

const stage = $('#stage')
const legs = $('#legs')
const chicagoTime = () =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }).format(sunDate())

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

const panels: HTMLElement[] = []
const footage: (HTMLImageElement | null)[] = []

chapters.forEach((c, i) => {
  const p = el('section', `panel panel-${c.id}`)
  p.dataset.i = String(i)
  p.setAttribute('aria-label', c.title ?? c.place)
  let img: HTMLImageElement | null = null

  if (c.id === 'orbit') {
    p.innerHTML = `
      <h1 class="hero-name">Connor Evans</h1>
      <p class="hero-line">I design and build interfaces for AI, from the pixels down to the permissions.</p>
      <p class="hero-now">This is the Earth as it is lit right now. In Chicago, where I live and work, it is <time id="now-chicago"></time>.</p>
      <p class="hero-go">Scroll to fly to the work</p>`
  } else if (c.id === 'path') {
    const rows = PATH.map(
      (s) => `<li><span class="path-where">${s.name}</span><span class="path-when">${s.when}</span><span class="path-what">${s.what}</span></li>`,
    ).join('')
    p.innerHTML = `
      <p class="place"><span class="place-name">${c.place}</span></p>
      <h2 class="title">How I got here</h2>
      <p class="tagline">Self-taught, by building things for people to use.</p>
      <ol class="path">${rows}</ol>`
  } else {
    const text = el('div', 'text')
    text.innerHTML = `
      <p class="place"><span class="place-name">${c.place}</span><span class="place-at">${formatCoord(c.view.lat, c.view.lon)}</span></p>
      <h2 class="title">${c.title}</h2>
      <p class="tagline">${c.tagline}</p>
      ${(c.body ?? []).map((b) => `<p class="body">${b}</p>`).join('')}
      <p class="stack">${c.stack}</p>
      <p class="links">${(c.links ?? []).map((l) => `<a href="${l.href}"${l.href.startsWith('http') ? ' rel="noopener"' : ''}>${l.label}</a>`).join('')}</p>`
    p.append(text)
    if (c.footage) {
      const fig = el('figure', 'shot')
      const pic = document.createElement('picture')
      if (c.footage.avif) {
        const s = document.createElement('source')
        s.type = 'image/avif'
        s.dataset.srcset = c.footage.avif
        pic.append(s)
      }
      img = document.createElement('img')
      img.alt = c.footage.alt
      img.width = 800
      img.height = 500
      img.decoding = 'async'
      img.dataset.src = c.footage.webp
      pic.append(img)
      const live = c.links?.find((l) => /live/i.test(l.label)) ?? c.links?.[0]
      if (live) {
        const a = el('a', 'shot-link')
        a.href = live.href
        a.setAttribute('aria-label', `${live.label}: ${c.title}`)
        a.append(pic)
        fig.append(a)
      } else fig.append(pic)
      fig.append(el('figcaption', '', `Recorded from ${c.title}, frame by frame.`))
      p.append(fig)
    }
  }
  stage.append(p)
  panels.push(p)
  footage.push(img)

  const b = el('button', 'leg')
  b.type = 'button'
  b.innerHTML = `<span class="leg-name">${c.id === 'orbit' ? 'Earth' : c.id === 'path' ? 'How I got here' : c.title}</span>`
  b.addEventListener('click', () => go(i))
  legs.append(b)
})
const indexLeg = el('button', 'leg')
indexLeg.type = 'button'
indexLeg.innerHTML = '<span class="leg-name">All work</span>'
indexLeg.addEventListener('click', () => $('#index').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }))
legs.append(indexLeg)

$('#ledger').innerHTML = index
  .map(
    (e) => `<li><h3>${e.name}</h3><p>${e.what}</p><p class="ledger-links">${e.links
      .map((l) => `<a href="${l.href}"${l.href.startsWith('http') ? ' rel="noopener"' : ''}>${l.label}</a>`)
      .join('')}</p></li>`,
  )
  .join('')

// ---------- Scroll → where the camera should be ----------

const N = chapters.length
let SEG = innerHeight * 1.6
function layout() {
  SEG = innerHeight * (small ? 1.5 : 1.6)
  $('#track').style.height = `${(N - 1) * SEG + innerHeight}px`
}
layout()

function go(i: number) {
  scrollTo({ top: i * SEG + (i === 0 ? 0 : 2), behavior: reduced ? 'auto' : 'smooth' })
}
document.querySelectorAll<HTMLElement>('[data-go]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault()
    go(Number(a.dataset.go))
  }),
)

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const sstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

function lerpAngle(a: number, b: number, t: number) {
  const d = ((((b - a) % 360) + 540) % 360) - 180
  return a + d * t
}

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
function between(A: View, B: View, t: number): View {
  if (t <= 0) return A
  if (t >= 1) return B
  latLon(A.lat, A.lon, 0, _a).normalize()
  latLon(B.lat, B.lon, 0, _b).normalize()
  const omega = Math.acos(clamp(_a.dot(_b), -1, 1))
  const s = Math.sin(omega)
  const p =
    s < 1e-6
      ? _a.clone()
      : _a
          .clone()
          .multiplyScalar(Math.sin((1 - t) * omega) / s)
          .add(_b.clone().multiplyScalar(Math.sin(t * omega) / s))
  p.normalize()
  const lat = (Math.asin(p.y) * 180) / Math.PI
  const lon = (Math.atan2(-p.z, p.x) * 180) / Math.PI
  const d = distance([A.lat, A.lon], [B.lat, B.lon])
  const base = Math.exp(Math.log(A.range) * (1 - t) + Math.log(B.range) * t)
  // Climb for long hops: high enough that both ends fit on screen at the top of the arc.
  const peak = Math.max(base, Math.min(d * 1.25, 16000))
  const range = Math.max(base, peak * Math.pow(Math.sin(Math.PI * t), 0.8))
  const hop = clamp(d / 1500)
  let pitch = A.pitch + (B.pitch - A.pitch) * t
  pitch = pitch + (90 - pitch) * Math.sin(Math.PI * t) * hop
  return { lat, lon, range, heading: lerpAngle(A.heading, B.heading, t), pitch }
}

function viewAt(p: number): View {
  const i = Math.min(N - 1, Math.floor(p))
  if (i >= N - 1) return chapters[N - 1].view
  const f = p - i
  const t = reduced ? (f > 0.7 ? 1 : 0) : ease(clamp((f - 0.42) / 0.58))
  return between(chapters[i].view, chapters[i + 1].view, t)
}

// ---------- The scene ----------

const canvas = $('#globe') as unknown as HTMLCanvasElement
let renderer: THREE.WebGLRenderer
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' })
} catch {
  document.documentElement.classList.add('no-gl')
  throw new Error('WebGL unavailable')
}
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.outputColorSpace = THREE.SRGBColorSpace
let dpr = Math.min(devicePixelRatio, small ? 1.5 : 1.75)
renderer.setPixelRatio(dpr)

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0x8899aa, 0.05) // affects only the city's standard material
const camera = new THREE.PerspectiveCamera(small ? 50 : 38, innerWidth / innerHeight, 0.002, 4e6)

function resize() {
  renderer.setSize(innerWidth, innerHeight, false)
  composer?.setSize(innerWidth, innerHeight)
  composer?.setPixelRatio(renderer.getPixelRatio())
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  layout()
}
// Lit windows and lamps bloom a little, as they do to the eye. Only the brightest pixels take part.
let composer: EffectComposer | null = null
let bloom: UnrealBloomPass | null = null
addEventListener('resize', resize)
resize()

composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }))
composer.addPass(new RenderPass(scene, camera))
bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.4, 0.9)
composer.addPass(bloom)
composer.addPass(new OutputPass())
resize()

const loader = new THREE.TextureLoader()
async function tex(url: string, srgb: boolean) {
  const t = await loader.loadAsync(url)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = renderer.capabilities.getMaxAnisotropy()
  t.wrapS = THREE.RepeatWrapping
  return t
}

const [day, night, relief, clouds] = await Promise.all([
  tex('/earth/day-4k.webp', true),
  tex('/earth/night-4k.webp', false),
  tex('/earth/relief-4k.webp', false),
  tex('/earth/clouds-4k.webp', false),
])
const earth = makeEarth({ day, night, relief, clouds })
scene.add(earth.surface, earth.clouds, earth.air)

const chiPatch = surfacePatch(CHICAGO.lat, CHICAGO.lon, 1.4, earth.surfaceMat, 360)
const albPatch = surfacePatch(ALBERT.lat, ALBERT.lon, 1.4, earth.surfaceMat, 360)
scene.add(chiPatch, albPatch)

// Photo layers for close-ups: NAIP aerial photography over Chicago, Sentinel-2 elsewhere.
type Place = { lat: number; lon: number; keep?: number; map?: number; layers: { url: string; half: number }[]; lights?: { url: string; half: number; street: number }; region: string; water: number; M: THREE.Matrix4; tex: (THREE.Texture | null)[]; light: THREE.Texture | null; regionTex: THREE.Texture | null; loading: boolean }
const places: Place[] = [
  { lat: CHICAGO.lat, lon: CHICAGO.lon, water: 1, layers: [{ url: '/places/chicago-wide.webp', half: 32768 }, { url: '/places/chicago-outer.webp', half: 10240 }, { url: '/places/chicago-inner.webp', half: 3072 }], lights: { url: '/places/chicago-lights.webp', half: 10240, street: 1 }, region: '/places/chicago-region-lights.webp' },
  { lat: -37.8455, lon: 144.9705, water: 1, keep: 1, map: 1, layers: [{ url: '/places/melbourne.webp', half: 7000 }], lights: { url: '/places/melbourne-lights.webp', half: 7000, street: 1 }, region: '' },
  { lat: 22.29, lon: 114.17, water: 1, keep: 1, layers: [{ url: '/places/hongkong.webp', half: 450000 }, { url: '/places/hongkong-close.webp', half: 16000 }], lights: { url: '/places/hongkong-lights.webp', half: 16000, street: 1 }, region: '/places/hongkong-region-lights.webp' },
  { lat: 51.997, lon: -0.741, water: 0, keep: 1, layers: [{ url: '/places/bletchley.webp', half: 450000 }, { url: '/places/bletchley-mid.webp', half: 200000 }], region: '/places/bletchley-region-lights.webp' },
].map((p) => {
  const { east, north, up } = enu(p.lat, p.lon)
  const m = new THREE.Matrix4().makeBasis(east, up, north.clone().negate()).setPosition(latLon(p.lat, p.lon))
  const M = m.invert().premultiply(new THREE.Matrix4().makeScale(1000, 1000, 1000))
  return { ...p, M, tex: p.layers.map(() => null), light: null as THREE.Texture | null, regionTex: null as THREE.Texture | null, loading: false }
})
function loadPlace(p: Place) {
  if (p.loading) return
  p.loading = true
  p.layers.forEach((l, i) =>
    loader.loadAsync(l.url).then((t) => {
      t.flipY = false
      t.colorSpace = THREE.NoColorSpace
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
      t.minFilter = THREE.LinearMipmapLinearFilter
      p.tex[i] = t
    }),
  )
  if (p.region)
    loader.loadAsync(p.region).then((t) => {
      t.flipY = false
      t.colorSpace = THREE.NoColorSpace
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
      p.regionTex = t
    })
  if (p.lights)
    loader.loadAsync(p.lights.url).then((t) => {
      t.flipY = false
      t.colorSpace = THREE.NoColorSpace
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
      p.light = t
    })
}
function usePlace(cam: THREE.Vector3) {
  const u = earth.surfaceMat.uniforms
  let best: Place | null = null
  let bd = Infinity
  for (const p of places) {
    const d = cam.distanceTo(latLon(p.lat, p.lon))
    const reach = Math.max(1500, p.layers[0].half / 1000 * 4)
    if (d < reach * 1.5) loadPlace(p)
    if (d < reach && d < bd) {
      bd = d
      best = p
    }
  }
  const ready = best && best.tex[0]
  const photoReach = best ? Math.max(80, best.layers[0].half / 1000 * 4) : 1
  u.detAOn.value = ready ? 1 - sstep(photoReach * 0.7, photoReach, bd) : 0
  u.detROn.value = best && best.regionTex ? 1 - sstep(1100, 1500, bd) : 0
  if (best) {
    u.detAM.value = best.M
    if (best.regionTex) u.detR.value = best.regionTex
  }
  if (ready && best) {
    u.detA.value = best.tex[0]
    u.detAM.value = best.M
    u.detAHalf.value = best.layers[0].half
    u.detAWater.value = best.water
    u.detKeep.value = best.keep ?? 0
    u.detMapOn.value = best.map ?? 0
    u.detLOn.value = best.light ? 1 : 0
    if (best.light && best.lights) {
      u.detL.value = best.light
      u.detLHalf.value = best.lights.half
      u.detLStreet.value = best.lights.street
    }
    const b = best.tex[1]
    const c = best.tex[2]
    u.detBOn.value = b ? 1 : 0
    u.detCOn.value = c ? 1 : 0
    if (b) {
      u.detB.value = b
      u.detBHalf.value = best.layers[1].half
    }
    if (c) {
      u.detC.value = c
      u.detCHalf.value = best.layers[2].half
    }
  }
}
loadPlace(places[0])

const circuit = makeCircuit()
scene.add(circuit.mesh)

// The path from Chapel Hill to Barcelona to Chicago, as arcs above the surface.
const pathGroup = new THREE.Group()
const pathMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#e9a650'), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, fog: false })
for (let i = 0; i < PATH.length - 1; i++) {
  const a = PATH[i]
  const b = PATH[i + 1]
  const A = latLon(a.lat, a.lon).normalize()
  const B = latLon(b.lat, b.lon).normalize()
  const d = distance([a.lat, a.lon], [b.lat, b.lon])
  const pts: THREE.Vector3[] = []
  for (let k = 0; k <= 96; k++) {
    const t = k / 96
    const p = A.clone().lerp(B, t).normalize()
    // Starts and ends on the ground, exactly under each dot, and rises with the distance between.
    pts.push(p.multiplyScalar(R + 2 + Math.sin(Math.PI * t) * d * 0.12))
  }
  const arc = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 10, 8, false), pathMat)
  arc.renderOrder = 4 // after the air, so it stays its own colour
  pathGroup.add(arc)
}
scene.add(pathGroup)

const stars = await makeStars('/earth/stars.bin')
stars.material.uniforms.pixelRatio.value = dpr
scene.add(stars)

// Place labels drawn by the page, pinned to the globe.
type Pin = { el: HTMLElement; pos: THREE.Vector3; show: (p: number) => number }
const pins: Pin[] = []
// Labels sit on the side of the dot away from the lines that leave it.
function pin(text: string, lat: number, lon: number, show: Pin['show'], side: 'right' | 'left' = 'right') {
  const e = el('div', side === 'left' ? 'pin pin-left' : 'pin')
  e.innerHTML = `<i></i><span>${text}</span>`
  e.setAttribute('aria-hidden', 'true')
  document.body.append(e)
  pins.push({ el: e, pos: latLon(lat, lon, 0.5), show })
}
const pathIndex = chapters.findIndex((c) => c.id === 'path')
PATH.forEach((s) => pin(s.name, s.lat, s.lon, (p) => sstep(pathIndex - 0.25, pathIndex, p), s.lon < -30 ? 'left' : 'right'))
pin('Chicago', CHICAGO.lat, CHICAGO.lon, (p) => 1 - sstep(0.2, 0.5, p))
const at = (id: string) => chapters.findIndex((c) => c.id === id)
const hold = (i: number) => (p: number) => sstep(i - 0.12, i - 0.02, p) * (1 - sstep(i + 0.3, i + 0.42, p))
pin('Victoria Harbour', 22.285, 114.17, hold(at('hongkong')))
pin('Bletchley Park', 51.997, -0.741, hold(at('bletchley')))

// Sun shadows for the city: the towers drawn from the sun into a depth map, 10 km across.
const SH = 4096
const shadowRT = new THREE.WebGLRenderTarget(SH, SH, { depthBuffer: true })
shadowRT.depthTexture = new THREE.DepthTexture(SH, SH, THREE.UnsignedIntType)
const shadowCam = new THREE.OrthographicCamera(-5, 5, 5, -5, 1, 70)
const shadowScene = new THREE.Scene()
const shadowCenter = latLon(41.8835, -87.6305)
let shadowSun = new THREE.Vector3()
function updateShadow(sun: THREE.Vector3) {
  if (!city) return
  if (shadowSun.angleTo(sun) < 0.0004 && shadowScene.children.length) return
  shadowSun = sun.clone()
  if (shadowScene.children.length !== city.meshes.length) {
    shadowScene.clear()
    const depth = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })
    for (const src of city.meshes) {
      const m = new THREE.Mesh(src.geometry, depth)
      m.matrixAutoUpdate = false
      m.matrix.copy(src.matrixWorld)
      m.frustumCulled = false
      shadowScene.add(m)
    }
  }
  shadowCam.position.copy(shadowCenter).addScaledVector(sun, 35)
  shadowCam.up.copy(shadowCenter).normalize()
  shadowCam.lookAt(shadowCenter)
  shadowCam.updateMatrixWorld()
  shadowCam.updateProjectionMatrix()
  renderer.setRenderTarget(shadowRT)
  renderer.clear()
  renderer.render(shadowScene, shadowCam)
  renderer.setRenderTarget(null)
  const vp = new THREE.Matrix4().multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse)
  earth.surfaceMat.uniforms.shadowMW.value.copy(vp)
  earth.surfaceMat.uniforms.shadowMap.value = shadowRT.depthTexture
  // The towers themselves take three.js's own shadows from the same sun.
  city.sun.position.copy(shadowCenter).addScaledVector(sun, 35)
  renderer.shadowMap.needsUpdate = true
}

// Chicago's buildings load once the globe is up.
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.shadowMap.autoUpdate = false
let city: Awaited<ReturnType<typeof makeChicago>> | null = null
const loadCity = () =>
  makeChicago(renderer, scene).then((c) => {
    city = c
    c.outer.then(() => (shadowSun = new THREE.Vector3()))
  })
;('requestIdleCallback' in window ? requestIdleCallback : setTimeout)(() => loadCity(), { timeout: 1200 } as never)

// Sharper Earth when the device can take it.
if (!small && renderer.capabilities.maxTextureSize >= 8192) {
  setTimeout(async () => {
    const [d8, n8, r8, c8] = await Promise.all([
      tex('/earth/day-8k.webp', true),
      tex('/earth/night-8k.webp', false),
      tex('/earth/relief-8k.webp', false),
      tex('/earth/clouds-8k.webp', false),
    ])
    const u = earth.surfaceMat.uniforms
    u.dayMap.value = d8
    u.nightMap.value = n8
    u.reliefMap.value = r8
    u.cloudMap.value = c8
    earth.cloudMat.uniforms.cloudMap.value = c8
  }, 1500)
}

// ---------- The sun ----------

const qs = new URLSearchParams(location.search)
let sunOffset = clamp(Number(qs.get('sun')) || 0, -720, 720) // minutes
const sunDate = () => new Date(Date.now() + sunOffset * 60000)
const range = $('#sun-range') as HTMLInputElement
const sunLabel = $('#sun-label')
const sunReset = $('#sun-reset')
function sunText() {
  if (sunOffset === 0) return 'Sun as of now'
  return `Sun at ${chicagoTime()} in Chicago`
}
range.value = String(sunOffset)
sunLabel.textContent = sunText()
sunReset.hidden = sunOffset === 0
range.addEventListener('input', () => {
  sunOffset = Number(range.value)
  sunLabel.textContent = sunText()
  sunReset.hidden = sunOffset === 0
})
sunReset.addEventListener('click', () => {
  sunOffset = 0
  range.value = '0'
  sunLabel.textContent = sunText()
  sunReset.hidden = true
})

// The opening view faces the terminator: day to the east, the night's cities to the west.
{
  const s0 = subsolar(sunDate())
  chapters[0].view.lon = ((s0.lon - 52 + 540) % 360) - 180
  chapters[0].view.lat = 24
}

// ---------- Frame loop ----------

let shown = 0
let last = performance.now()
let slow = 0
const camUp = new THREE.Vector3()
const tmp = new THREE.Vector3()
const nowEl = () => document.getElementById('now-chicago')

function place(v: View, drift: number) {
  const { east, north, up } = enu(v.lat, v.lon)
  const target = latLon(v.lat, v.lon, 0)
  const h = ((v.heading + drift) * Math.PI) / 180
  const pch = (Math.min(v.pitch, 89.9) * Math.PI) / 180
  const facing = north.clone().multiplyScalar(Math.cos(h)).add(east.clone().multiplyScalar(Math.sin(h)))
  camera.position
    .copy(target)
    .addScaledVector(facing, -v.range * Math.cos(pch))
    .addScaledVector(up, v.range * Math.sin(pch))
  camUp.copy(v.pitch > 80 ? facing.clone().lerp(up, (90 - v.pitch) / 10) : up).normalize()
  camera.up.copy(camUp)
  // Look a little above the target when close in, so the skyline sits low in frame.
  const lift = small ? 0 : Math.min(v.range * 0.04, 0.4)
  camera.lookAt(target.addScaledVector(up, lift))
}

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  const goal = clamp(scrollY / SEG, 0, N - 1)
  shown += (goal - shown) * (reduced ? 1 : 1 - Math.exp(-dt * 5))
  if (Math.abs(goal - shown) < 1e-4) shown = goal

  const v = viewAt(shown)
  const drift = reduced || qs.has('still') ? 0 : Math.sin(now / 9000) * (v.range < 50 ? 4 : 2)
  place(v, drift)
  const pathOn = sstep(pathIndex - 0.4, pathIndex, shown)
  const shift = small ? 0 : ((1 - sstep(0.15, 0.6, shown)) * 0.16 + pathOn * 0.1) * innerWidth
  const shiftY = small ? pathOn * innerHeight * 0.3 : 0
  camera.setViewOffset(innerWidth, innerHeight, -shift, shiftY, innerWidth, innerHeight)

  const sd = sunDate()
  const s = subsolar(sd)
  const sun = latLon(s.lat, s.lon).normalize()
  earth.shared.sunDir.value.copy(sun)
  stars.rotation.y = -gmstRadians(sd)

  const alt = camera.position.length() - R
  usePlace(camera.position)
  earth.cloudMat.uniforms.fade.value = sstep(25, 140, alt) * (0.35 + 0.65 * sstep(300, 1400, alt))
  earth.surfaceMat.uniforms.cloudFade.value = sstep(8, 80, alt)
  stars.material.uniforms.dim.value = sstep(60, 400, alt)
  earth.airMat.uniforms.strength.value = 0.22 + 0.78 * sstep(20, 450, alt)
  earth.surfaceMat.uniforms.lightsScale.value = 0.25 + 0.75 * sstep(30, 400, alt)

  if (city) {
    const near = 1 - sstep(25, 90, camera.position.distanceTo(latLon(CHICAGO.lat, CHICAGO.lon)))
    city.group.visible = near > 0
    if (near <= 0) earth.surfaceMat.uniforms.shadowOn.value = 0
    if (near > 0) {
      const mu = sun.dot(latLon(CHICAGO.lat, CHICAGO.lon).normalize())
      const lit = mu > 0.02
      if (lit) updateShadow(sun)
      earth.surfaceMat.uniforms.shadowOn.value = lit ? 1 : 0
      const day = sstep(-0.06, 0.12, mu)
      const warm = sstep(0.0, 0.35, mu)
      city.sun.color.setRGB(1, 0.45 + 0.5 * warm, 0.2 + 0.68 * warm)
      city.sun.intensity = 3.2 * day
      city.sun.castShadow = lit
      city.sky.intensity = 0.06 + 0.9 * day
      const env = day > 0.3 ? city.dayEnv : city.nightEnv
      if (city.material.envMap !== env) city.material.envMap = env
      city.material.envMapIntensity = day > 0.3 ? 0.6 * day : 0.22
      city.uniforms.uNight.value = 1 - sstep(-0.1, 0.03, mu)
      city.uniforms.uTime.value = now / 1000
      // Air between the camera and the towers, the colour of the sky at that hour.
      ;(scene.fog as THREE.FogExp2).color.setRGB(0.012 + 0.48 * day, 0.016 + 0.56 * day, 0.03 + 0.66 * day)
    }
  }
  const nearAlbert = 1 - sstep(20, 70, camera.position.distanceTo(latLon(ALBERT.lat, ALBERT.lon)))
  circuit.mesh.visible = nearAlbert > 0
  circuit.mat.uniforms.fade.value = nearAlbert
  circuit.mat.uniforms.head.value = ((now / 1000) * 210) % circuit.length
  circuit.mat.uniforms.day.value = sstep(-0.05, 0.15, latLon(ALBERT.lat, ALBERT.lon).normalize().dot(sun))

  pathMat.opacity = sstep(pathIndex - 0.3, pathIndex - 0.02, shown) * 0.95
  pathGroup.visible = pathMat.opacity > 0

  // Panels: each one holds while its place is on screen, and leaves as the flight starts.
  panels.forEach((p, i) => {
    const vin = i === 0 ? 1 : sstep(i - 0.22, i - 0.02, shown)
    const vout = i === N - 1 ? 1 : 1 - sstep(i + 0.34, i + 0.5, shown)
    const o = vin * vout
    p.style.opacity = String(o)
    p.style.transform = `translate3d(0, ${(1 - vin) * 18 - (1 - vout) * 18}px, 0)`
    const active = o > 0.5
    if (p.inert === active) p.inert = !active
    p.classList.toggle('is-on', active)
    const img = footage[i]
    if (img && !img.src && Math.abs(i - goal) < 1.2) {
      img.parentElement?.querySelectorAll('source').forEach((s) => (s.srcset = s.dataset.srcset!))
      img.src = img.dataset.src!
    }
  })
  const on = Math.round(shown)
  document.documentElement.classList.toggle('in-index', scrollY > (N - 1) * SEG + innerHeight * 0.35)
  legs.querySelectorAll('.leg').forEach((b, i) => b.toggleAttribute('aria-current', i === on && scrollY < (N - 1) * SEG + innerHeight * 0.5))

  // Pins
  const camDir = tmp.copy(camera.position).normalize()
  for (const p of pins) {
    const vis = p.show(shown)
    const facing = p.pos.clone().normalize().dot(camDir) > 0.15
    if (vis < 0.01 || !facing) {
      p.el.style.opacity = '0'
      continue
    }
    const sp = p.pos.clone().project(camera)
    p.el.style.opacity = String(vis)
    p.el.style.transform = `translate3d(${((sp.x + 1) / 2) * innerWidth}px, ${((1 - sp.y) / 2) * innerHeight}px, 0)`
  }

  const t = nowEl()
  if (t) t.textContent = chicagoTime()

  if (bloom) {
    // Night only: by day the sunlit roofs would bloom too.
    const nightHere = 1 - sstep(-0.1, 0.05, tmp.copy(camera.position).normalize().dot(sun))
    bloom.strength = 0.45 * nightHere
    bloom.enabled = alt < 400 && nightHere > 0.01
  }
  if (composer && bloom?.enabled) composer.render()
  else renderer.render(scene, camera)

  // If frames run long, draw fewer pixels.
  if (dt > 0.034) slow++
  else slow = Math.max(0, slow - 1)
  if (slow > 40 && dpr > 1) {
    dpr = Math.max(1, dpr - 0.25)
    renderer.setPixelRatio(dpr)
    composer?.setPixelRatio(dpr)
    stars.material.uniforms.pixelRatio.value = dpr
    slow = 0
  }
  requestAnimationFrame(frame)
}
document.documentElement.classList.add('ready')
requestAnimationFrame(frame)

// For tests and the capture script.
Object.assign(window, { __globe: { renderer, scene, camera, chapters, go, shadowScene, shadowCam, shadowRT, earth, get city() { return city } } })
