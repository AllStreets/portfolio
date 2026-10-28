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
  const ctr: number[] = [] // footprint centre, for sampling the aerial photo

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
    let cx = 0
    let cz = 0
    for (const r of ring) {
      cx += r.x / n
      cz += r.y / n
    }
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
        ctr.push(cx, cz)
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
        ctr.push(cx, cz)
      }
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('wall', new THREE.Float32BufferAttribute(wall, 3))
  g.setAttribute('meta', new THREE.Float32BufferAttribute(meta, 2))
  g.setAttribute('ctr', new THREE.Float32BufferAttribute(ctr, 2))
  g.computeBoundingSphere()

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      sunLocal: { value: new THREE.Vector3(0, 1, 0) },
      camLocal: { value: new THREE.Vector3() },
      fade: { value: 0 },
      photoO: { value: null as THREE.Texture | null },
      photoI: { value: null as THREE.Texture | null },
      photoOn: { value: 0 },
      shadowMap: { value: null as THREE.Texture | null },
      shadowM: { value: new THREE.Matrix4() },
      shadowOn: { value: 0 },
    },
    transparent: true,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 wall;
      attribute vec2 meta;
      attribute vec2 ctr;
      varying vec3 vWall;
      varying vec2 vMeta;
      varying vec2 vCtr;
      varying vec3 vN;
      varying vec3 vP;
      void main() {
        vWall = wall; vMeta = meta; vN = normal; vP = position; vCtr = ctr;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 sunLocal, camLocal;
      uniform float fade, photoOn, shadowOn;
      uniform sampler2D photoO, photoI, shadowMap;
      uniform mat4 shadowM;
      varying vec3 vWall;
      varying vec2 vMeta;
      varying vec2 vCtr;
      varying vec3 vN;
      varying vec3 vP;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }

      // The aerial photograph at a point in metres (x east, z south), inner layer where it reaches.
      vec3 photo(vec2 xz, float bias) {
        vec2 ui = xz / 6144.0 + 0.5;
        vec2 uo = xz / 20480.0 + 0.5;
        vec3 o = texture2D(photoO, uo, bias).rgb;
        if (ui.x > 0.02 && ui.x < 0.98 && ui.y > 0.02 && ui.y < 0.98) o = texture2D(photoI, ui, bias).rgb;
        return pow(o, vec3(1.85));
      }

      float sunShadow(vec3 p, vec3 N) {
        if (shadowOn < 0.5) return 1.0;
        vec4 sc = shadowM * vec4(p + N * 3.0, 1.0);
        vec3 c = sc.xyz / sc.w * 0.5 + 0.5;
        if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0) return 1.0;
        float t = 1.0 / 4096.0;
        float s = 0.0;
        for (int i = -1; i <= 1; i++)
          for (int j = -1; j <= 1; j++)
            s += step(c.z - 0.00004, texture2D(shadowMap, c.xy + vec2(float(i), float(j)) * t).r);
        return s / 9.0;
      }

      // Box-filtered stripe: the share of each period covered by [0, w), averaged over the pixel's footprint.
      float stripe(float x, float w, float fw) {
        fw = max(fw, 1e-4);
        float a = x - 0.5 * fw, b = x + 0.5 * fw;
        float Fa = floor(a) * w + min(fract(a), w);
        float Fb = floor(b) * w + min(fract(b), w);
        return (Fb - Fa) / fw;
      }
      vec3 skyAt(vec3 R, float day) {
        vec3 zen = vec3(0.16, 0.3, 0.6), hor = vec3(0.52, 0.6, 0.7), gnd = vec3(0.12, 0.11, 0.1);
        vec3 c = R.y > 0.0 ? mix(hor, zen, pow(R.y, 0.6)) : mix(hor * 0.6, gnd, min(1.0, -R.y * 4.0));
        return c * day;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 L = normalize(sunLocal);
        vec3 N = normalize(vN);
        vec3 V = normalize(camLocal - vP);
        float h = vMeta.x;
        float roof = vMeta.y;
        float seed = vWall.z;
        float mu = L.y;
        float day = smoothstep(-0.06, 0.12, mu);
        float night = 1.0 - smoothstep(-0.1, 0.03, mu);
        vec3 sunCol = mix(vec3(1.0, 0.45, 0.18), vec3(1.0, 0.95, 0.88), smoothstep(0.0, 0.35, mu)) * 2.6;
        float sh = day > 0.0 ? sunShadow(vP, N) : 1.0;
        float diff = max(dot(N, L), 0.0) * day * sh;
        vec3 amb = mix(vec3(0.004, 0.005, 0.01), vec3(0.17, 0.21, 0.28), day) * (0.55 + 0.45 * N.y);
        float ao = mix(0.5, 1.0, smoothstep(0.0, 16.0, vWall.y + roof * 99.0));

        // Material family by height and chance: towers are mostly glass or dark steel, the rest stone and brick.
        float r1 = hash(vec3(seed, 1.0, 2.0)), r2 = hash(vec3(seed, 3.0, 5.0));
        float tall = smoothstep(45.0, 110.0, h);
        float isGlass = step(r1, mix(0.12, 0.62, tall));
        float isSteel = (1.0 - isGlass) * step(r1, mix(0.15, 0.82, tall));
        float isBrick = (1.0 - isGlass) * (1.0 - isSteel) * step(r2, mix(0.55, 0.2, tall));
        vec3 glassTint = r2 < 0.33 ? vec3(0.07, 0.13, 0.2) : (r2 < 0.66 ? vec3(0.06, 0.13, 0.13) : vec3(0.12, 0.13, 0.15));
        vec3 stoneC = r2 < 0.4 ? vec3(0.58, 0.51, 0.41) : (r2 < 0.75 ? vec3(0.66, 0.62, 0.55) : vec3(0.6, 0.45, 0.32));
        vec3 brickC = r2 < 0.5 ? vec3(0.5, 0.24, 0.15) : vec3(0.6, 0.38, 0.25);
        vec3 steelC = vec3(0.075, 0.075, 0.085);
        vec3 wallC = isGlass > 0.5 ? glassTint : (isSteel > 0.5 ? steelC : (isBrick > 0.5 ? brickC : stoneC));
        // Low buildings borrow their colour from the photograph around them.
        if (photoOn > 0.5 && isGlass < 0.5 && isSteel < 0.5) {
          vec3 near = photo(vCtr, 3.0);
          wallC = mix(wallC, clamp(near * 2.4, 0.0, 1.0), 0.35 * (1.0 - tall));
        }

        // Warm light bounced up from sunlit streets onto the lower floors.
        vec3 bounce = vec3(0.2, 0.16, 0.12) * day * max(mu, 0.0) * (1.0 - abs(N.y)) * (1.0 - smoothstep(0.0, 120.0, vWall.y));
        amb += bounce;
        vec3 col;
        vec3 R = reflect(-V, N);
        float nv = max(dot(N, V), 0.0);
        if (roof > 0.5) {
          vec3 rc = vec3(0.3, 0.3, 0.29);
          if (photoOn > 0.5) rc = mix(photo(vP.xz, 0.0) * 0.75, rc, tall * 0.6);
          col = rc * (sunCol * diff + amb);
        } else {
          vec2 fw;
          float far;
          if (isGlass > 0.5 || isSteel > 0.5) {
            // Curtain wall: a spandrel band at each floor and mullions every 1.6 m, filtered so they hold at distance.
            vec2 cell = vec2(vWall.x / 1.6, vWall.y / 3.9);
            fw = fwidth(cell);
            float spandrel = stripe(cell.y, 0.22, fw.y);
            float mull = stripe(cell.x, 0.04, fw.x);
            float glassAmt = (1.0 - spandrel) * (1.0 - mull);
            float F = mix(0.24, 0.1, isSteel) + 0.7 * pow(1.0 - nv, 5.0);
            vec3 refl = skyAt(R, day) * mix(1.0, 0.5, isSteel);
            // Neighbouring towers fill the lower part of the reflection.
            refl = mix(refl, vec3(0.07, 0.08, 0.09) * day, smoothstep(0.2, -0.1, R.y) * 0.75);
            vec3 glass = wallC * (sunCol * diff * 0.35 + amb * 0.6) + refl * F * 1.8;
            glass += sunCol * pow(max(dot(R, L), 0.0), 300.0) * 1.5 * sh;
            vec3 frameC = mix(vec3(0.13, 0.14, 0.15), steelC * 1.5, isSteel);
            vec3 frame = frameC * (sunCol * diff + amb);
            // Spandrels are glass too, opaque behind: a darker band that still reflects.
            vec3 span = wallC * 0.5 * (sunCol * diff * 0.4 + amb) + refl * F * 1.2;
            col = mix(mix(frame, span, 1.0 - mull), glass, glassAmt);
          } else {
            // Punched windows in masonry, filtered the same way.
            vec2 cell = vec2(vWall.x / 3.2, vWall.y / 3.8);
            fw = fwidth(cell);
            float win = stripe(cell.x - 0.22, 0.56, fw.x) * stripe(cell.y - 0.3, 0.54, fw.y);
            vec3 masonry = wallC * (sunCol * diff + amb);
            float F = 0.06 + 0.8 * pow(1.0 - nv, 5.0);
            vec3 pane = vec3(0.03, 0.04, 0.05) * (amb + sunCol * diff * 0.2) + skyAt(R, day) * F;
            col = mix(masonry, pane, win * 0.9);
          }
          // A lighter parapet at the top edge.
          col *= 1.0 + 0.12 * step(h - 1.2, vWall.y) * day;
          col *= ao;

          // Night: lit windows; sub-pixel cells fall back to the average glow.
          vec2 wc = vec2(vWall.x / 3.2, vWall.y / 3.8);
          vec2 id = floor(wc);
          vec2 wf = fract(wc);
          float win2 = step(0.18, wf.x) * step(wf.x, 0.82) * step(0.22, wf.y) * step(wf.y, 0.8);
          float litP = (0.18 + 0.3 * fract(seed * 13.7)) + 0.15 * isGlass;
          float on = step(hash(vec3(id, seed * 91.0)), litP);
          vec3 warm = mix(vec3(1.0, 0.7, 0.4), vec3(0.85, 0.9, 1.0), step(0.82, hash(vec3(id.yx, seed))));
          vec2 fw2 = fwidth(wc);
          float far2 = smoothstep(0.35, 0.9, max(fw2.x, fw2.y));
          float top = step(vWall.y, h - 1.0) * step(2.5, vWall.y);
          col += mix(win2 * on * warm, vec3(1.0, 0.74, 0.46) * litP * 0.3, far2) * top * night * 1.25;
        }

        // Air between the camera and the facade.
        float dist = length(camLocal - vP);
        float haze = 1.0 - exp(-dist / 16000.0);
        vec3 hazeCol = mix(vec3(0.01, 0.012, 0.02), vec3(0.5, 0.6, 0.75), day) * mix(vec3(1.0), sunCol / 3.0, 0.3);
        col = mix(col, hazeCol, haze * 0.45);
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
