import * as THREE from 'three'
import { localFrame } from './geo'

export const CHICAGO = { lat: 41.88203, lon: -87.62784 }

// 72,000 Chicago buildings at their recorded heights, from the City of Chicago's footprints,
// OpenStreetMap and Wikipedia's tallest-buildings list, packed by tools/chicago.py.
export async function makeChicago(url: string) {
  const buf = await (await fetch(url)).arrayBuffer()
  const dv = new DataView(buf)
  const count = dv.getUint32(0, true)
  let o = 4

  const pos: number[] = []
  const nrm: number[] = []
  const wall: number[] = [] // metres along the facade, metres up, building seed
  const meta: number[] = [] // height, roof flag

  for (let b = 0; b < count; b++) {
    const n = dv.getUint16(o, true)
    const h = dv.getUint16(o + 2, true) / 10
    o += 4
    const ring: THREE.Vector2[] = []
    for (let i = 0; i < n; i++) {
      ring.push(new THREE.Vector2(dv.getInt16(o, true) / 2, -dv.getInt16(o + 2, true) / 2))
      o += 4
    }
    // x east, z south: the file stores north, so z is its negative.
    if (THREE.ShapeUtils.isClockWise(ring)) ring.reverse()
    const seed = Math.random()
    let u = 0
    for (let i = 0; i < n; i++) {
      const a = ring[i]
      const c = ring[(i + 1) % n]
      const len = a.distanceTo(c)
      const nx = c.y - a.y
      const nz = -(c.x - a.x)
      const l = Math.hypot(nx, nz) || 1
      // facing outward for a counter-clockwise ring in x/z with z south
      const fx = -nx / l
      const fz = -nz / l
      const quad = [
        [a.x, 0, a.y, u, 0],
        [c.x, 0, c.y, u + len, 0],
        [c.x, h, c.y, u + len, h],
        [a.x, 0, a.y, u, 0],
        [c.x, h, c.y, u + len, h],
        [a.x, h, a.y, u, h],
      ]
      for (const q of quad) {
        pos.push(q[0], q[1], q[2])
        nrm.push(fx, 0, fz)
        wall.push(q[3], q[4], seed)
        meta.push(h, 0)
      }
      u += len
    }
    const tris = THREE.ShapeUtils.triangulateShape(ring, [])
    for (const t of tris) {
      for (const k of [t[0], t[2], t[1]]) {
        pos.push(ring[k].x, h, ring[k].y)
        nrm.push(0, 1, 0)
        wall.push(ring[k].x, ring[k].y, seed)
        meta.push(h, 1)
      }
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('wall', new THREE.Float32BufferAttribute(wall, 3))
  g.setAttribute('meta', new THREE.Float32BufferAttribute(meta, 2))
  g.computeBoundingSphere()

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      sunLocal: { value: new THREE.Vector3(0, 1, 0) },
      camLocal: { value: new THREE.Vector3() },
      fade: { value: 0 },
    },
    transparent: true,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 wall;
      attribute vec2 meta;
      varying vec3 vWall;
      varying vec2 vMeta;
      varying vec3 vN;
      varying vec3 vP;
      void main() {
        vWall = wall; vMeta = meta; vN = normal; vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 sunLocal, camLocal;
      uniform float fade;
      varying vec3 vWall;
      varying vec2 vMeta;
      varying vec3 vN;
      varying vec3 vP;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 L = normalize(sunLocal);
        vec3 N = normalize(vN);
        float h = vMeta.x;
        float roof = vMeta.y;
        float seed = vWall.z;
        float mu = L.y;
        float day = smoothstep(-0.06, 0.12, mu);
        float night = 1.0 - smoothstep(-0.1, 0.03, mu);

        // Facade families: limestone, brick, dark glass. Towers lean to glass.
        float glassy = smoothstep(40.0, 140.0, h) * step(0.25, seed) + step(0.9, seed) * 0.6;
        vec3 stone = mix(vec3(0.52, 0.47, 0.40), vec3(0.42, 0.27, 0.20), step(0.55, fract(seed * 7.0)));
        vec3 base = mix(stone, vec3(0.10, 0.13, 0.16), clamp(glassy, 0.0, 1.0));
        if (roof > 0.5) base = vec3(0.26, 0.26, 0.25);

        vec3 sunCol = mix(vec3(1.0, 0.45, 0.18), vec3(1.0, 0.96, 0.9), smoothstep(0.0, 0.35, mu)) * 3.0;
        float diff = max(dot(N, L), 0.0) * day;
        vec3 sky = mix(vec3(0.006, 0.008, 0.016), vec3(0.25, 0.32, 0.45), day);
        vec3 col = base * (sunCol * diff + sky * (0.55 + 0.45 * N.y)) * mix(0.9, 1.08, smoothstep(0.0, 200.0, vWall.y * (1.0 - roof)));

        // Glass reflects the sky, more at grazing angles.
        vec3 V = normalize(camLocal - vP);
        float F = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        col += glassy * (1.0 - roof) * F * mix(vec3(0.02, 0.025, 0.05), vec3(0.45, 0.55, 0.7), day) * 0.8;

        // Windows: one cell per floor (3.8 m) and per 3.2 m of facade. When a cell is smaller than a pixel,
        // fall back to the average so distant towers glow evenly instead of shimmering.
        if (roof < 0.5) {
          vec2 cell = vec2(vWall.x / 3.2, vWall.y / 3.8);
          vec2 id = floor(cell);
          vec2 f = fract(cell);
          float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.8);
          float litP = (0.18 + 0.3 * fract(seed * 13.7)) + 0.15 * glassy;
          float on = step(hash(vec3(id, seed * 91.0)), litP);
          vec3 warm = mix(vec3(1.0, 0.7, 0.4), vec3(0.85, 0.9, 1.0), step(0.82, hash(vec3(id.yx, seed))));
          vec2 fw = fwidth(cell);
          float far = smoothstep(0.35, 0.9, max(fw.x, fw.y));
          float top = step(vWall.y, h - 1.0) * step(2.5, vWall.y);
          vec3 near = win * on * warm;
          vec3 avg = vec3(1.0, 0.74, 0.46) * litP * 0.3;
          col += mix(near, avg, far) * top * night * 1.25;
          col *= mix(1.0, mix(0.8, 0.9, far), win * day * (1.0 - far));
        }
        // Grounding: a little occlusion where walls meet the street.
        col *= mix(0.55, 1.0, smoothstep(0.0, 14.0, vWall.y + roof * 99.0));

        // Air between the camera and the facade.
        float dist = length(camLocal - vP);
        float haze = 1.0 - exp(-dist / 9000.0);
        vec3 hazeCol = mix(vec3(0.01, 0.012, 0.02), vec3(0.42, 0.55, 0.75), day) * mix(vec3(1.0), sunCol / 3.0, 0.3);
        col = mix(col, hazeCol, haze * 0.85);
        gl_FragColor = vec4(col, fade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })

  const mesh = new THREE.Mesh(g, mat)
  const frame = localFrame(CHICAGO.lat, CHICAGO.lon)
  mesh.matrixAutoUpdate = false
  mesh.matrix.copy(frame).multiply(new THREE.Matrix4().makeScale(0.001, 0.001, 0.001))
  mesh.renderOrder = 3
  mesh.frustumCulled = false
  return { mesh, mat, frame, triangles: pos.length / 9 }
}
