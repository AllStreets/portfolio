import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { localFrame, latLon, enu } from './geo'
// @ts-ignore: Chicago Open World's facade material, carried over as JavaScript
import { createFacadeMaterial, loadFacadeTextures, loadStylePalette, facadeUniforms } from './cow/facadeMaterial.js'

export const CHICAGO = { lat: 41.88203, lon: -87.62784 }

// Chicago Open World's own buildings: its geometry, its facade families (from OpenStreetMap tags and the
// City of Chicago's records) and its sourced landmark looks, drawn with its facade shader. tools/city_tiles.mjs
// takes them from that project's tiles: full detail within 2.6 km of the Loop, the lighter LOD out to 7 km.
export async function makeChicago(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const frame = localFrame(CHICAGO.lat, CHICAGO.lon).multiply(new THREE.Matrix4().makeScale(0.001, 0.001, 0.001))
  const group = new THREE.Group()
  group.matrixAutoUpdate = false
  group.matrix.copy(frame)
  facadeUniforms.uCityInv.value.copy(frame).invert()

  const material = createFacadeMaterial()
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const meshes: THREE.Mesh[] = []
  const add = (g: THREE.Group) => {
    g.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.material = material
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
      meshes.push(m)
    })
    group.add(g)
    group.updateMatrixWorld(true)
  }

  // Sunlight, sky light and a sky to reflect, all aligned to Chicago's own horizon.
  const { up } = enu(CHICAGO.lat, CHICAGO.lon)
  const center = latLon(41.8835, -87.6305)
  const sun = new THREE.DirectionalLight(0xffffff, 3)
  sun.target.position.copy(center)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  const sc = sun.shadow.camera as THREE.OrthographicCamera
  sc.left = -4.2
  sc.right = 4.2
  sc.top = 4.2
  sc.bottom = -4.2
  sc.near = 1
  sc.far = 80
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.002
  const sky = new THREE.HemisphereLight(0xbfd4ee, 0x5a5048, 0.9)
  sky.position.copy(up)
  scene.add(sun, sun.target, sky)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const skyScene = new THREE.Scene()
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { up: { value: up.clone() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 up; varying vec3 vD;
      void main() {
        float h = dot(normalize(vD), up);
        vec3 zen = vec3(0.2, 0.3, 0.5), hor = vec3(0.6, 0.64, 0.68), gnd = vec3(0.14, 0.13, 0.12);
        vec3 c = h > 0.0 ? mix(hor, zen, pow(h, 0.5)) : mix(hor * 0.7, gnd, min(1.0, -h * 5.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
  skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat))
  const dayEnv = pmrem.fromScene(skyScene, 0.02).texture
  // Night: a dark sky with the city's own warm glow along the horizon, for the glass to catch.
  skyMat.fragmentShader = skyMat.fragmentShader.replace(
    'vec3 zen = vec3(0.2, 0.3, 0.5), hor = vec3(0.6, 0.64, 0.68), gnd = vec3(0.14, 0.13, 0.12);',
    'vec3 zen = vec3(0.01, 0.012, 0.025), hor = vec3(0.32, 0.2, 0.11), gnd = vec3(0.12, 0.07, 0.035);',
  )
  skyMat.needsUpdate = true
  const nightEnv = pmrem.fromScene(skyScene, 0.02).texture
  material.envMap = dayEnv

  await Promise.all([loadFacadeTextures(), loadStylePalette()])
  const core = await loader.loadAsync('/chicago/core.glb')
  add(core.scene)
  scene.add(group)
  // The outer ring follows once the Loop is up.
  const outer = loader.loadAsync('/chicago/outer.glb').then((g) => add(g.scene))

  return { group, meshes, material, sun, sky, center, outer, dayEnv, nightEnv, uniforms: facadeUniforms }
}
