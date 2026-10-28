// Pulls only the buildings out of Chicago Open World's tiles (its own geometry, facade ids, landmark styles
// and wall UVs) and merges them into two files: full detail near the Loop, the lighter LOD further out.
// Positions are baked into the city's local metres (x east, y up, z south), so the shader can use them directly.
import { NodeIO, Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { dequantize, quantize, reorder, weld, join, flatten, prune } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import fs from 'node:fs'
import path from 'node:path'

const SRC = '/Users/connorevans/Downloads/Chicago_open_world/app/public/world/tiles'
const OUT = 'public/chicago'
const TILE = 500
const CORE = 2600, OUTER = 7200 // metres from the origin, by tile centre

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const tiles = fs.readdirSync(SRC).filter((f) => /^-?\d+_-?\d+\.glb$/.test(f)).map((f) => {
  const [x, z] = f.replace('.glb', '').split('_').map(Number)
  return { x, z, d: Math.hypot((x + 0.5) * TILE, (z + 0.5) * TILE) }
})

async function build(list, lod, name) {
  const out = new Document()
  const buf = out.createBuffer()
  const scene = out.createScene()
  let n = 0
  for (const t of list) {
    const file = path.join(SRC, `${t.x}_${t.z}${lod ? '.lod1' : ''}.glb`)
    if (!fs.existsSync(file)) continue
    const doc = await io.read(file)
    await doc.transform(dequantize())
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh()
      if (!mesh || mesh.getName() !== 'buildings') continue
      const m = node.getWorldMatrix()
      for (const prim of mesh.listPrimitives()) {
        const p = out.createPrimitive()
        for (const sem of prim.listSemantics()) {
          const a = prim.getAttribute(sem)
          let arr = Float32Array.from(a.getArray())
          const k = a.getElementSize()
          if (sem === 'POSITION') {
            for (let i = 0; i < arr.length; i += 3) {
              const [x, y, z] = [arr[i], arr[i + 1], arr[i + 2]]
              arr[i] = m[0] * x + m[4] * y + m[8] * z + m[12]
              arr[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
              arr[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
            }
          } else if (sem === 'NORMAL') {
            for (let i = 0; i < arr.length; i += 3) {
              const [x, y, z] = [arr[i], arr[i + 1], arr[i + 2]]
              const nx = m[0] * x + m[4] * y + m[8] * z, ny = m[1] * x + m[5] * y + m[9] * z, nz = m[2] * x + m[6] * y + m[10] * z
              const l = Math.hypot(nx, ny, nz) || 1
              arr[i] = nx / l; arr[i + 1] = ny / l; arr[i + 2] = nz / l
            }
          }
          p.setAttribute(sem, out.createAccessor().setType(a.getType()).setArray(arr).setBuffer(buf))
        }
        const idx = prim.getIndices()
        if (idx) p.setIndices(out.createAccessor().setType('SCALAR').setArray(Uint32Array.from(idx.getArray())).setBuffer(buf))
        const mm = out.createMesh('buildings').addPrimitive(p)
        scene.addChild(out.createNode(`b${n++}`).setMesh(mm))
      }
    }
  }
  await out.transform(flatten(), join({ keepNamed: false }), weld(), prune(), reorder({ encoder: MeshoptEncoder }), quantize({ pattern: /^(POSITION|NORMAL|TEXCOORD_0)$/ }))
  out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER })
  await io.write(path.join(OUT, name), out)
  console.log(name, list.length, 'tiles', (fs.statSync(path.join(OUT, name)).size / 1e6).toFixed(1), 'MB')
}

await build(tiles.filter((t) => t.d <= CORE), false, 'core.glb')
await build(tiles.filter((t) => t.d > CORE && t.d <= OUTER), true, 'outer.glb')
