// Where the sun is overhead right now, from the NOAA solar position approximations.
// Good to a fraction of a degree, which is all a terminator needs.
export function subsolar(date: Date) {
  const jd = date.getTime() / 86400000 + 2440587.5
  const n = jd - 2451545.0
  const L = (280.46 + 0.9856474 * n) % 360
  const g = ((357.528 + 0.9856003 * n) % 360) * (Math.PI / 180)
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * (Math.PI / 180)
  const eps = (23.439 - 0.0000004 * n) * (Math.PI / 180)
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda))
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda))
  const gmst = gmstRadians(date)
  let lon = ((ra - gmst) * 180) / Math.PI
  lon = ((lon + 540) % 360) - 180
  return { lat: (dec * 180) / Math.PI, lon }
}

// Greenwich mean sidereal time, for turning the star catalogue with the Earth.
export function gmstRadians(date: Date) {
  const jd = date.getTime() / 86400000 + 2440587.5
  const t = (jd - 2451545.0) / 36525
  let deg = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * t * t
  deg = ((deg % 360) + 360) % 360
  return (deg * Math.PI) / 180
}
