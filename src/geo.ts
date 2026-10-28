import * as THREE from 'three'

// The globe works in kilometres. +Y is the north pole, the prime meridian faces +X,
// and longitude grows toward -Z so that textures read the right way round.
export const R = 6371

const D = Math.PI / 180

export function latLon(lat: number, lon: number, alt = 0, out = new THREE.Vector3()) {
  const r = R + alt
  const la = lat * D
  const lo = lon * D
  return out.set(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo))
}

// East, north, up at a point on the surface.
export function enu(lat: number, lon: number) {
  const up = latLon(lat, lon, 0).normalize()
  const east = new THREE.Vector3(-Math.sin(lon * D), 0, -Math.cos(lon * D))
  const north = new THREE.Vector3().crossVectors(up, east).normalize()
  return { east, north, up }
}

// A matrix whose local frame is x = east, y = up, z = south, in kilometres, at the surface point.
export function localFrame(lat: number, lon: number) {
  const { east, north, up } = enu(lat, lon)
  const south = north.clone().negate()
  const m = new THREE.Matrix4().makeBasis(east, up, south)
  m.setPosition(latLon(lat, lon, 0))
  return m
}

// Great-circle distance in kilometres.
export function distance(a: [number, number], b: [number, number]) {
  const [la1, lo1] = [a[0] * D, a[1] * D]
  const [la2, lo2] = [b[0] * D, b[1] * D]
  const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatCoord(lat: number, lon: number) {
  const f = (v: number, p: string, n: string) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? p : n}`
  return `${f(lat, 'N', 'S')}, ${f(lon, 'E', 'W')}`
}
