import * as THREE from 'three'
import { localFrame } from './geo'
import albert from './albert.json'

// Albert Park, Melbourne, traced from bacinger/f1-circuits (MIT), laid on the globe where it is.
export const ALBERT = { lat: -37.8497, lon: 144.9688 }

export function makeCircuit() {
  const lat0 = ALBERT.lat
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const ky = 110574
  const pts = (albert as number[][]).map(([lon, lat]) => new THREE.Vector2((lon - ALBERT.lon) * kx, -(lat - ALBERT.lat) * ky))
  // Resample to an even spacing so the trace moves at a steady pace.
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, 0, p.y)), true, 'centripetal')
  const N = 1400
  const even = curve.getSpacedPoints(N)
  const length = curve.getLength()

  const pos: number[] = []
  const along: number[] = []
  const side: number[] = []
  const W = 30
  for (let i = 0; i <= N; i++) {
    const p = even[i % N]
    const q = even[(i + 1) % N]
    const d = new THREE.Vector3().subVectors(q, p).normalize()
    const nx = -d.z
    const nz = d.x
    const s = (i / N) * length
    pos.push(p.x + nx * W * 0.5, 2, p.z + nz * W * 0.5, p.x - nx * W * 0.5, 2, p.z - nz * W * 0.5)
    along.push(s, s)
    side.push(1, -1)
  }
  const idx: number[] = []
  for (let i = 0; i < N; i++) {
    const a = i * 2
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1))
  g.setAttribute('side', new THREE.Float32BufferAttribute(side, 1))
  g.setIndex(idx)

  const mat = new THREE.ShaderMaterial({
    uniforms: { head: { value: 0 }, length: { value: length }, fade: { value: 0 }, day: { value: 1 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float along, side;
      varying float vS, vSide;
      void main() {
        vS = along; vSide = side;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float head, length, fade, day;
      varying float vS, vSide;
      void main() {
        #include <logdepthbuf_fragment>
        float behind = mod(head - vS + length, length);
        float trail = 1.0 - smoothstep(0.0, 1800.0, behind);
        float edge = smoothstep(1.0, 0.55, abs(vSide));
        vec3 asphalt = mix(vec3(0.05), vec3(0.16, 0.16, 0.17), day);
        vec3 kerb = vec3(0.92, 0.9, 0.86);
        vec3 col = mix(kerb * mix(0.35, 1.0, day), asphalt, edge);
        vec3 trace = vec3(1.0, 0.1, 0.06);
        col = mix(col, trace * mix(5.0, 3.0, day), trail * edge);
        float tip = 1.0 - smoothstep(0.0, 22.0, behind);
        col = mix(col, vec3(4.0, 3.8, 3.5), tip);
        gl_FragColor = vec4(col, fade * (0.8 + 0.2 * max(trail, 1.0 - edge)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  const mesh = new THREE.Mesh(g, mat)
  mesh.matrixAutoUpdate = false
  mesh.matrix.copy(localFrame(ALBERT.lat, ALBERT.lon)).multiply(new THREE.Matrix4().makeScale(0.001, 0.001, 0.001))
  mesh.renderOrder = 3
  mesh.frustumCulled = false
  return { mesh, mat, length }
}
