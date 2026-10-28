import * as THREE from 'three'
import { R } from './geo'

// One photographic Earth: NASA Blue Marble by day, Black Marble city lights by night,
// GEBCO relief, a NASA cloud layer that casts shadows, and single-scattering air.

export const ATMOS = 100 // km of air drawn

const common = /* glsl */ `
  vec2 geoUv(vec3 n) {
    float lon = atan(-n.z, n.x);
    float lat = asin(clamp(n.y, -1.0, 1.0));
    return vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
  }
  // Colour of sunlight after the path through the air at this sun height.
  vec3 sunTint(float mu) {
    float h = clamp(mu * 4.0 + 0.15, 0.0, 1.0);
    return mix(vec3(1.0, 0.38, 0.12), vec3(1.0, 0.97, 0.92), smoothstep(0.0, 1.0, h));
  }
`

export type EarthUniforms = {
  sunDir: { value: THREE.Vector3 }
  time: { value: number }
}

export function makeEarth(tex: {
  day: THREE.Texture
  night: THREE.Texture
  relief: THREE.Texture
  clouds: THREE.Texture
}) {
  const shared: EarthUniforms = {
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    time: { value: 0 },
  }

  const surfaceMat = new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      dayMap: { value: tex.day },
      nightMap: { value: tex.night },
      reliefMap: { value: tex.relief },
      cloudMap: { value: tex.clouds },
      cloudSpin: { value: 0 },
      cloudFade: { value: 1 },
      lightsScale: { value: 1 },
      shadowMap: { value: null as THREE.Texture | null },
      shadowMW: { value: new THREE.Matrix4() },
      shadowOn: { value: 0 },
      // Up to two photo layers for the place being visited, each a square in that place's local frame.
      detA: { value: null as THREE.Texture | null },
      detAM: { value: new THREE.Matrix4() },
      detAHalf: { value: 1 },
      detAOn: { value: 0 },
      detAWater: { value: 0 },
      detKeep: { value: 0 },
      detB: { value: null as THREE.Texture | null },
      detBM: { value: new THREE.Matrix4() },
      detBHalf: { value: 1 },
      detBOn: { value: 0 },
      detC: { value: null as THREE.Texture | null },
      detCHalf: { value: 1 },
      detCOn: { value: 0 },
      detL: { value: null as THREE.Texture | null },
      detLHalf: { value: 10240 },
      detLStreet: { value: 1 },
      detMapOn: { value: 0 },
      detR: { value: null as THREE.Texture | null },
      detROn: { value: 0 },
      detLOn: { value: 0 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${common}
      uniform vec3 sunDir;
      uniform sampler2D dayMap, nightMap, reliefMap, cloudMap, detA, detB, detC, detL, detR;
      uniform float lightsScale, shadowOn;
      uniform sampler2D shadowMap;
      uniform mat4 shadowMW;
      float groundShadow(vec3 p) {
        if (shadowOn < 0.5) return 1.0;
        vec4 sc = shadowMW * vec4(p, 1.0);
        vec3 c = sc.xyz / sc.w * 0.5 + 0.5;
        if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0) return 1.0;
        float t = 1.0 / 4096.0, s = 0.0;
        for (int i = -1; i <= 1; i++)
          for (int j = -1; j <= 1; j++)
            s += step(c.z - 0.00003, texture2D(shadowMap, c.xy + vec2(float(i), float(j)) * t).r);
        float edge = min(min(c.x, 1.0 - c.x), min(c.y, 1.0 - c.y));
        return mix(1.0, s / 9.0, smoothstep(0.0, 0.05, edge));
      }
      uniform float cloudSpin, cloudFade, detAOn, detBOn, detCOn, detAHalf, detBHalf, detCHalf, detAWater, detKeep, detLOn, detLHalf, detLStreet, detROn, detMapOn;
      uniform mat4 detAM, detBM;
      // Returns rgb photo (linear) and a weight in .a; water mask in w.
      vec4 detail(sampler2D t, mat4 M, float hw, vec3 p, out float land) {
        vec3 lp = (M * vec4(p, 1.0)).xyz;
        vec2 m = lp.xz / (2.0 * hw) + 0.5;
        land = 1.0;
        if (m.x <= 0.0 || m.x >= 1.0 || m.y <= 0.0 || m.y >= 1.0) return vec4(0.0);
        vec4 c = texture2D(t, m);
        land = c.a;
        float edge = smoothstep(0.0, 0.06, min(min(m.x, 1.0 - m.x), min(m.y, 1.0 - m.y)));
        return vec4(pow(c.rgb, vec3(1.85)), edge);
      }
      varying vec3 vPos;

      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vPos);
        vec2 uv = geoUv(n);
        vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n));
        vec3 north = cross(n, east);

        vec4 rel = texture2D(reliefMap, uv);
        vec3 tn = rel.xyz * 2.0 - 1.0;
        float water = rel.a;
        vec3 albedo = pow(texture2D(dayMap, uv).rgb, vec3(2.2));
        // Ocean in Blue Marble is near black; give it depth of colour.
        albedo = mix(albedo, albedo * vec3(0.55, 0.8, 1.0) + vec3(0.002, 0.008, 0.02), water * 0.6);
        float photo = 0.0;
        vec3 photoCol = vec3(0.0);
        if (detAOn > 0.5) {
          float land;
          vec4 d = detail(detA, detAM, detAHalf, vPos, land);
          d.a *= detAOn;
          photo = d.a; photoCol = d.rgb;
          water = mix(water, (1.0 - land) * detAWater, d.a);
          if (detBOn > 0.5) {
            float landB;
            vec4 e = detail(detB, detAM, detBHalf, vPos, landB);
            photoCol = mix(photoCol, e.rgb, e.a);
            water = mix(water, 1.0 - landB, e.a * detAWater);
          }
          if (detCOn > 0.5) {
            float landC;
            vec4 e = detail(detC, detAM, detCHalf, vPos, landC);
            photoCol = mix(photoCol, e.rgb, e.a);
            water = mix(water, 1.0 - landC, e.a * detAWater);
          }
          tn = mix(tn, vec3(0.0, 0.0, 1.0), photo);
        }
        albedo = mix(albedo, photoCol * 0.62, photo * (1.0 - water * detAWater));
        if (detLOn > 0.5 && detMapOn > 0.5) {
          vec3 lp0 = (detAM * vec4(vPos, 1.0)).xyz;
          vec2 m0 = lp0.xz / (2.0 * detLHalf) + 0.5;
          float road = smoothstep(0.35, 0.9, texture2D(detL, m0).r) * photo * (1.0 - water);
          albedo = mix(albedo, vec3(0.42, 0.41, 0.39), road * 0.4 * detMapOn);
        }
        // Under the photo layer the lake keeps its own colour.
        albedo = mix(albedo, mix(vec3(0.012, 0.03, 0.045), photoCol * 0.5, detKeep), photo * water * detAWater);
        vec3 N = normalize(east * tn.x * 0.9 + north * tn.y * 0.9 + n * tn.z);
        N = normalize(mix(N, n, water));

        vec3 L = normalize(sunDir);
        vec3 V = normalize(cameraPosition - vPos);
        float mu = dot(n, L);
        float lit = smoothstep(-0.12, 0.08, mu);

        // Clouds above cast their shadow along the sun direction.
        vec3 sp = normalize(n + L * 0.0025);
        vec2 suv = geoUv(sp); suv.x += cloudSpin;
        float shadow = 1.0 - texture2D(cloudMap, suv).r * 0.65 * lit * cloudFade;

        vec3 sun = sunTint(mu) * 3.2;
        float diff = max(dot(N, L), 0.0);
        shadow *= mix(1.0, 0.3 + 0.7 * groundShadow(vPos + n * 0.002), photo * (1.0 - water));
        vec3 col = albedo * sun * diff * shadow;
        // Sky fill on the day side.
        col += albedo * vec3(0.18, 0.26, 0.42) * 0.12 * lit;

        // Water: sun glint and the sky's reflection, by Fresnel.
        vec3 H = normalize(L + V);
        float nv = max(dot(n, V), 0.0);
        float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
        float spec = pow(max(dot(n, H), 0.0), 300.0) * 1.6 + pow(max(dot(n, H), 0.0), 40.0) * 0.03;
        col += water * (spec * sun * shadow * step(0.0, mu) + F * vec3(0.25, 0.45, 0.8) * 0.5 * lit);

        // City lights where the sun has gone.
        float night = 1.0 - smoothstep(-0.18, 0.02, mu);
        // Black Marble carries faint terrain under its lights; keep only the lights.
        float lights = max(texture2D(nightMap, uv).r - 0.16, 0.0) / 0.84;
        lights = pow(lights, 1.5) * lightsScale;
        // Regional lights at 500 m (NASA Black Marble), 450 km around the place.
        if (detROn > 0.5) {
          vec3 rp = (detAM * vec4(vPos, 1.0)).xyz;
          vec2 rm = rp.xz / 900000.0 + 0.5;
          if (rm.x > 0.0 && rm.x < 1.0 && rm.y > 0.0 && rm.y < 1.0) {
            float re = smoothstep(0.0, 0.1, min(min(rm.x, 1.0 - rm.x), min(rm.y, 1.0 - rm.y))) * detROn;
            float rl = texture2D(detR, rm).r;
            lights = mix(lights, pow(rl, 2.2) * 0.65, re);
          }
        }
        // Up close, the real street grid stands in for the blurred satellite glow.
        if (detLOn > 0.5) {
          vec3 lp = (detAM * vec4(vPos, 1.0)).xyz;
          vec2 m = lp.xz / (2.0 * detLHalf) + 0.5;
          float inside = step(0.0, m.x) * step(m.x, 1.0) * step(0.0, m.y) * step(m.y, 1.0);
          // The carriageway at its real width (2.5 m per texel near the Loop) plus the soft spill around it.
          vec3 lt = texture2D(detL, m).rgb;
          float st = lt.r * 0.55 + lt.g * 0.08;
          float fadeL = smoothstep(0.0, 0.08, min(min(m.x, 1.0 - m.x), min(m.y, 1.0 - m.y)));
          // Beyond the street map, the photo's bright pavement stands in at a low level.
          float pave = smoothstep(0.2, 0.45, dot(photoCol, vec3(0.3, 0.55, 0.15))) * 0.08;
          lights = mix(lights, mix(pave * detLStreet, st * mix(1.1, 0.5, detLStreet), inside * fadeL), photo);
        }
        col += mix(vec3(1.0, 0.56, 0.24), vec3(1.0, 0.72, 0.45), detLStreet * photo) * lights * night * mix(1.6, 1.0, detLStreet * photo) * (1.0 - water * 0.95);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })

  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, cloudMap: { value: tex.clouds }, cloudSpin: surfaceMat.uniforms.cloudSpin, fade: { value: 1 } },
    transparent: true,
    depthWrite: false,
    vertexShader: surfaceMat.vertexShader,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${common}
      uniform vec3 sunDir;
      uniform sampler2D cloudMap;
      uniform float cloudSpin, fade;
      varying vec3 vPos;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vPos);
        vec2 uv = geoUv(n); uv.x += cloudSpin;
        float c = texture2D(cloudMap, uv).r;
        c = smoothstep(0.08, 0.95, c);
        float mu = dot(n, normalize(sunDir));
        float lit = smoothstep(-0.1, 0.12, mu);
        vec3 col = vec3(0.96, 0.97, 1.0) * sunTint(mu) * 2.6 * (0.35 + 0.65 * max(mu, 0.0) + 0.25) * lit;
        col += vec3(0.01, 0.012, 0.02);
        gl_FragColor = vec4(col, c * 0.92 * fade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })

  // Rayleigh and Mie single scattering through a spherical shell, drawn over everything behind it.
  const airMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, rP: { value: R }, rA: { value: R + ATMOS }, strength: { value: 1 } },
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.SrcAlphaFactor,
    blendEquation: THREE.AddEquation,
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        gl_Position.z = gl_Position.w * 0.999999;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform float rP, rA, strength;
      varying vec3 vPos;
      const vec3 BR = vec3(5.8e-3, 13.5e-3, 33.1e-3); // per km
      const float BM = 9e-3;
      const float HR = 8.0, HM = 1.2;

      vec2 hit(vec3 o, vec3 d, float r) {
        float b = dot(o, d);
        float c = dot(o, o) - r * r;
        float h = b * b - c;
        if (h < 0.0) return vec2(1e9, -1e9);
        h = sqrt(h);
        return vec2(-b - h, -b + h);
      }

      void main() {
        vec3 o = cameraPosition;
        vec3 d = normalize(vPos - o);
        vec3 L = normalize(sunDir);
        vec2 a = hit(o, d, rA);
        if (a.x > a.y) discard;
        float t0 = max(a.x, 0.0);
        float t1 = a.y;
        vec2 p = hit(o, d, rP);
        bool ground = p.x > 0.0;
        if (ground) t1 = min(t1, p.x);
        if (t1 <= t0) discard;

        const int N = 24;
        vec3 sumR = vec3(0.0), sumM = vec3(0.0);
        float odR = 0.0, odM = 0.0;
        float span = t1 - t0;
        for (int i = 0; i < N; i++) {
          float a0 = float(i) / float(N), a1 = float(i + 1) / float(N);
          float ta = t0 + span * a0 * a0, tb = t0 + span * a1 * a1;
          float ds = tb - ta;
          vec3 s = o + d * (0.5 * (ta + tb));
          float h = length(s) - rP;
          float hr = exp(-h / HR) * ds, hm = exp(-h / HM) * ds;
          odR += hr; odM += hm;
          // optical depth toward the sun, closed form along the shell
          vec2 ls = hit(s, L, rA);
          // Earth's shadow, softened over 30 km so the terminator never bands.
          float bS = dot(s, L);
          float miss = bS > 0.0 ? 1e9 : sqrt(max(dot(s, s) - bS * bS, 0.0));
          float lightF = smoothstep(rP - 10.0, rP + 20.0, miss);
          if (lightF <= 0.0) continue;
          float lt = ls.y;
          const int M = 4;
          float lds = lt / float(M);
          float lR = 0.0, lM = 0.0;
          for (int j = 0; j < M; j++) {
            float lh = length(s + L * lds * (float(j) + 0.5)) - rP;
            lR += exp(-lh / HR) * lds; lM += exp(-lh / HM) * lds;
          }
          vec3 tau = BR * (odR + lR) + BM * 1.1 * (odM + lM);
          vec3 att = exp(-tau);
          sumR += att * hr * lightF; sumM += att * hm * lightF;
        }
        float mu = dot(d, L);
        float pR = 3.0 / (16.0 * 3.14159) * (1.0 + mu * mu);
        float g = 0.76;
        float pM = 3.0 / (8.0 * 3.14159) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
        vec3 col = 12.0 * (ground ? strength : 1.0) * (sumR * BR * pR + sumM * BM * pM);
        vec3 trans = exp(-(BR * odR + BM * 1.1 * odM));
        float tr = ground ? dot(trans, vec3(0.3333)) : 1.0;
        gl_FragColor = vec4(col, mix(1.0, tr, strength));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })

  const surface = new THREE.Mesh(new THREE.SphereGeometry(R, 768, 384), surfaceMat)
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(R + 9, 256, 128), cloudMat)
  clouds.renderOrder = 1
  const air = new THREE.Mesh(new THREE.SphereGeometry(R + ATMOS, 192, 96), airMat)
  air.renderOrder = 2
  air.frustumCulled = false

  return { surface, clouds, air, surfaceMat, cloudMat, airMat, shared }
}

// A finely divided piece of the sphere around one place, so close-ups sit on the true surface
// instead of the coarse globe's chords. It uses the same material as the globe.
export function surfacePatch(lat: number, lon: number, halfDeg: number, mat: THREE.Material, seg = 160) {
  const g = new THREE.BufferGeometry()
  const pos: number[] = []
  const idx: number[] = []
  const hLon = halfDeg / Math.cos((lat * Math.PI) / 180)
  for (let j = 0; j <= seg; j++) {
    for (let i = 0; i <= seg; i++) {
      const la = ((lat - halfDeg + (2 * halfDeg * j) / seg) * Math.PI) / 180
      const lo = ((lon - hLon + (2 * hLon * i) / seg) * Math.PI) / 180
      pos.push(R * Math.cos(la) * Math.cos(lo), R * Math.sin(la), -R * Math.cos(la) * Math.sin(lo))
    }
  }
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i
      idx.push(a, a + 1, a + seg + 1, a + 1, a + seg + 2, a + seg + 1)
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeBoundingSphere()
  const m = new THREE.Mesh(g, mat)
  m.renderOrder = 0
  return m
}
