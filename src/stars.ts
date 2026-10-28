import * as THREE from 'three'

// The Yale Bright Star Catalogue: 9,096 real stars at their real places, brightness and colour.
function kelvinToRgb(k: number) {
  const t = k / 100
  let r: number, g: number, b: number
  if (t <= 66) {
    r = 255
    g = 99.47 * Math.log(t) - 161.12
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332)
    g = 288.12 * Math.pow(t - 60, -0.0755)
    b = 255
  }
  const c = (v: number) => Math.min(255, Math.max(0, v)) / 255
  // Desaturate: stars read nearly white to the eye.
  const w = 0.55
  return [c(r) * w + (1 - w), c(g) * w + (1 - w), c(b) * w + (1 - w)]
}

export async function makeStars(url: string) {
  const buf = await (await fetch(url)).arrayBuffer()
  const f = new Float32Array(buf)
  const n = f.length / 5
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  const size = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const [x, y, z, mag, k] = f.subarray(i * 5, i * 5 + 5)
    pos.set([x * 1e6, y * 1e6, z * 1e6], i * 3)
    const flux = Math.pow(10, -0.4 * (mag - 1.0))
    const [r, g, b] = kelvinToRgb(k || 6000)
    col.set([r, g, b], i * 3)
    size[i] = Math.min(1, flux)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('flux', new THREE.BufferAttribute(size, 1))
  const mat = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 }, dim: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float flux;
      attribute vec3 color;
      uniform float pixelRatio;
      varying vec3 vCol;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float s = clamp(sqrt(flux) * 3.2, 0.9, 3.6);
        gl_PointSize = s * pixelRatio;
        vA = clamp(flux * 2.2, 0.05, 1.0);
        vCol = color;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float dim;
      varying vec3 vCol;
      varying float vA;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 p = gl_PointCoord - 0.5;
        float d = dot(p, p) * 4.0;
        float a = exp(-d * 4.0) * vA * dim;
        gl_FragColor = vec4(vCol * a, 1.0);
      }
    `,
  })
  const pts = new THREE.Points(g, mat)
  pts.frustumCulled = false
  pts.renderOrder = -1
  return pts
}
