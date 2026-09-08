/* Word Kart — real WebGL/Three.js sight-word racer (professional) */
(function () {
  const GOAL = 12
  const SAY_CHECK_AT = 10
  const ROAD_HALF = 4.6
  const LANE_X = [-2.5, 0, 2.5]

  let canvas, wrap
  let renderer, scene, camera, sun
  let running = false
  let raf = 0
  let state = null
  let gyroOn = false
  let touchSteer = 0
  let keySteer = 0
  let engineNodes = null
  let speakQueue = Promise.resolve()
  let clock = null
  let sayRecognizer = null
  let sayListenTimer = 0
  let sayRetryCount = 0
  let sayPrompting = false

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }
  function lerp(a, b, t) { return a + (b - a) * t }
  function rand(a, b) { return a + Math.random() * (b - a) }
  function capitalize(s) { return (s || '').charAt(0).toUpperCase() + (s || '').slice(1) }

  function normalizeHeard(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function transcriptMatchesWord(transcript, word) {
    const target = normalizeHeard(word)
    const heard = normalizeHeard(transcript)
    if (!target || !heard) return false
    if (heard === target) return true
    const tokens = heard.split(' ').filter(Boolean)
    if (tokens.includes(target)) return true
    // Allow "the the" / trailing filler from kids
    if (tokens.length <= 3 && tokens.some((t) => t === target)) return true
    // Soft match for very short words if the transcript is only that sound-ish
    if (target.length <= 2 && tokens.length === 1 && tokens[0].startsWith(target)) return true
    return false
  }

  function getSpeechRecognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null
  }

  function ensureThree() {
    if (typeof THREE === 'undefined') throw new Error('Three.js failed to load')
    return THREE
  }

  function sideOf(tan) {
    const T = ensureThree()
    const side = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), tan)
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0)
    return side.normalize()
  }

  function buildTrackCurve() {
    const T = ensureThree()
    const pts = []
    const n = 96
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      // Gentle flowing circuit — avoid sharp radius wobble that facets the edges
      const r = 68 + Math.sin(a * 2) * 8 + Math.cos(a * 3) * 3.5
      pts.push(new T.Vector3(
        Math.cos(a) * r,
        0.45 + Math.sin(a * 2) * 1.1 + Math.cos(a * 1.5) * 0.45,
        Math.sin(a) * r
      ))
    }
    return new T.CatmullRomCurve3(pts, true, 'catmullrom', 0.25)
  }

  function makeTrackTexture() {
    const T = ensureThree()
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 1024
    const g = c.getContext('2d')
    const W = 1024
    const H = 1024
    // Cross-section U layout (pixels):
    // [0..140] left kerb | [140..160] white line | [160..864] asphalt | [864..884] white | [884..1024] right kerb
    const L0 = 0
    const L1 = 140
    const Lw = 160
    const Rw = 864
    const R0 = 884
    const R1 = 1024

    // Asphalt fill
    g.fillStyle = '#2a2e36'
    g.fillRect(Lw, 0, Rw - Lw, H)
    for (let i = 0; i < 28000; i++) {
      const n = 18 + ((Math.random() * 55) | 0)
      const x = Lw + Math.random() * (Rw - Lw)
      g.fillStyle = `rgba(${n},${n},${n + 6},${0.05 + Math.random() * 0.14})`
      g.fillRect(x, Math.random() * H, 1 + (Math.random() * 2) | 0, 1 + (Math.random() * 2) | 0)
    }
    for (let i = 0; i < 120; i++) {
      const x = Lw + 40 + Math.random() * (Rw - Lw - 80)
      g.strokeStyle = `rgba(12,12,14,${0.04 + Math.random() * 0.06})`
      g.lineWidth = 1 + Math.random() * 2
      g.beginPath()
      g.moveTo(x, Math.random() * H)
      g.lineTo(x + (Math.random() - 0.5) * 8, Math.random() * H)
      g.stroke()
    }
    g.fillStyle = '#f2ecd0'
    for (let y = 0; y < H; y += 72) {
      g.fillRect(502, y + 12, 20, 32)
    }

    // Painted rumble strips baked into the road texture (smooth edges)
    const bandH = 64
    for (let y = 0; y < H; y += bandH) {
      const isRed = ((y / bandH) | 0) % 2 === 0
      g.fillStyle = isRed ? '#d91022' : '#f8f6f1'
      g.fillRect(L0, y, L1 - L0, bandH + 1)
      g.fillRect(R0, y, R1 - R0, bandH + 1)
      const glossL = g.createLinearGradient(L0, 0, L1, 0)
      glossL.addColorStop(0, 'rgba(0,0,0,0.18)')
      glossL.addColorStop(0.4, 'rgba(255,255,255,0.2)')
      glossL.addColorStop(1, 'rgba(0,0,0,0.08)')
      g.fillStyle = glossL
      g.fillRect(L0, y, L1 - L0, bandH + 1)
      const glossR = g.createLinearGradient(R0, 0, R1, 0)
      glossR.addColorStop(0, 'rgba(0,0,0,0.08)')
      glossR.addColorStop(0.6, 'rgba(255,255,255,0.2)')
      glossR.addColorStop(1, 'rgba(0,0,0,0.18)')
      g.fillStyle = glossR
      g.fillRect(R0, y, R1 - R0, bandH + 1)
    }

    g.fillStyle = '#f7f7f2'
    g.fillRect(L1, 0, Lw - L1, H)
    g.fillRect(Rw, 0, R0 - Rw, H)

    const tex = new T.CanvasTexture(c)
    tex.wrapS = T.ClampToEdgeWrapping
    tex.wrapT = T.RepeatWrapping
    tex.repeat.set(1, 1)
    tex.anisotropy = 8
    tex.colorSpace = T.SRGBColorSpace
    return tex
  }

  function makeShoulderTexture() {
    const T = ensureThree()
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 128
    const g = c.getContext('2d')
    g.fillStyle = '#3a3f48'
    g.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 1200; i++) {
      const n = 30 + ((Math.random() * 40) | 0)
      g.fillStyle = `rgba(${n},${n},${n},${0.08 + Math.random() * 0.1})`
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2)
    }
    const tex = new T.CanvasTexture(c)
    tex.wrapS = tex.wrapT = T.RepeatWrapping
    tex.repeat.set(1, 1)
    tex.colorSpace = T.SRGBColorSpace
    return tex
  }

  function makeGrassTexture() {
    const T = ensureThree()
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 256
    const g = c.getContext('2d')
    g.fillStyle = '#36c45f'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = Math.random() > 0.5 ? '#2aaa52' : '#48d872'
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 3)
    }
    const tex = new T.CanvasTexture(c)
    tex.wrapS = tex.wrapT = T.RepeatWrapping
    tex.repeat.set(80, 80)
    tex.colorSpace = T.SRGBColorSpace
    return tex
  }

  function buildRibbon(curve, segs, profileFn, uvScaleV, uvU) {
    const T = ensureThree()
    const pos = []
    const nrm = []
    const uv = []
    const idx = []
    const sample = profileFn(0, curve.getPointAt(0), curve.getTangentAt(0).normalize())
    const cols = sample.length
    const uVals = uvU || null
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const p = curve.getPointAt(t)
      const tan = curve.getTangentAt(t).normalize()
      const pts = profileFn(t, p, tan)
      const up = new T.Vector3(0, 1, 0).addScaledVector(tan, -tan.y).normalize()
      for (let c = 0; c < cols; c++) {
        const q = pts[c]
        pos.push(q.x, q.y, q.z)
        nrm.push(up.x, up.y, up.z)
        const uu = uVals ? uVals[c] : (c / Math.max(1, cols - 1))
        uv.push(uu, t * (uvScaleV || 40))
      }
      if (i < segs) {
        const base = i * cols
        for (let c = 0; c < cols - 1; c++) {
          const a = base + c
          const b = a + 1
          const d = a + cols
          const e = d + 1
          idx.push(a, d, b, b, d, e)
        }
      }
    }
    const geo = new T.BufferGeometry()
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
    geo.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3))
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
  }

  function buildRoadMesh(curve) {
    const T = ensureThree()
    const group = new T.Group()
    const segs = 800
    const hw = ROAD_HALF
    const kerbW = 1.2
    const shoulderW = 1.5
    const railX = hw + kerbW + shoulderW + 0.4
    // Texture U stops matching makeTrackTexture layout
    const uOuterL = 0.0
    const uKerbMidL = 0.068
    const uAsphaltL = 0.156
    const uAsphaltR = 0.844
    const uKerbMidR = 0.932
    const uOuterR = 1.0

    // Flat continuous road+kerb ribbon (painted rumble strips, no raised bricks)
    const roadGeo = buildRibbon(curve, segs, (t, p, tan) => {
      const side = sideOf(tan)
      const up = new T.Vector3(0, 1, 0).addScaledVector(tan, -tan.y).normalize()
      const y = 0.04
      return [
        p.clone().addScaledVector(side, -(hw + kerbW)).addScaledVector(up, y),
        p.clone().addScaledVector(side, -(hw + kerbW * 0.5)).addScaledVector(up, y),
        p.clone().addScaledVector(side, -hw).addScaledVector(up, y),
        p.clone().addScaledVector(side, hw).addScaledVector(up, y),
        p.clone().addScaledVector(side, hw + kerbW * 0.5).addScaledVector(up, y),
        p.clone().addScaledVector(side, hw + kerbW).addScaledVector(up, y)
      ]
    }, 12, [uOuterL, uKerbMidL, uAsphaltL, uAsphaltR, uKerbMidR, uOuterR])

    const road = new T.Mesh(roadGeo, new T.MeshStandardMaterial({
      map: makeTrackTexture(),
      color: '#d5d9e0',
      roughness: 0.86,
      metalness: 0.04,
      side: T.DoubleSide
    }))
    road.receiveShadow = true
    road.castShadow = true
    group.add(road)

    // Thickness bed under road
    const bedGeo = buildRibbon(curve, segs, (t, p, tan) => {
      const side = sideOf(tan)
      const left = p.clone().addScaledVector(side, -(hw + kerbW + 0.15))
      const right = p.clone().addScaledVector(side, hw + kerbW + 0.15)
      left.y -= 0.1
      right.y -= 0.1
      return [left, right]
    }, 10)
    const bed = new T.Mesh(bedGeo, new T.MeshStandardMaterial({
      color: '#1e222b', roughness: 0.98, side: T.DoubleSide
    }))
    bed.receiveShadow = true
    group.add(bed)

    // Dark shoulder / apron outside kerbs
    const shoulderMat = new T.MeshStandardMaterial({
      map: makeShoulderTexture(),
      color: '#b8bdc8',
      roughness: 0.95,
      metalness: 0,
      side: T.DoubleSide
    })
    ;[-1, 1].forEach((sign) => {
      const shoulderGeo = buildRibbon(curve, segs, (t, p, tan) => {
        const side = sideOf(tan)
        const up = new T.Vector3(0, 1, 0).addScaledVector(tan, -tan.y).normalize()
        const a = p.clone().addScaledVector(side, sign * (hw + kerbW)).addScaledVector(up, 0.018)
        const b = p.clone().addScaledVector(side, sign * (hw + kerbW + shoulderW)).addScaledVector(up, 0.0)
        return sign > 0 ? [a, b] : [b, a]
      }, 48)
      const shoulder = new T.Mesh(shoulderGeo, shoulderMat)
      shoulder.receiveShadow = true
      group.add(shoulder)
    })

    // Armco-style metal guardrails (continuous rails)
    const railMat = new T.MeshStandardMaterial({
      color: '#c5ccd6',
      roughness: 0.28,
      metalness: 0.85
    })
    const postMat = new T.MeshStandardMaterial({
      color: '#8a929e',
      roughness: 0.45,
      metalness: 0.55
    })
    ;[-1, 1].forEach((sign) => {
      ;[0.38, 0.72].forEach((hOff) => {
        const railGeo = buildRibbon(curve, segs, (t, p, tan) => {
          const side = sideOf(tan)
          const up = new T.Vector3(0, 1, 0).addScaledVector(tan, -tan.y).normalize()
          const x0 = railX - 0.06
          const x1 = railX + 0.06
          const y0 = hOff - 0.07
          const y1 = hOff + 0.07
          const a = p.clone().addScaledVector(side, sign * x0).addScaledVector(up, y0)
          const b = p.clone().addScaledVector(side, sign * x1).addScaledVector(up, y0)
          const c = p.clone().addScaledVector(side, sign * x1).addScaledVector(up, y1)
          const d = p.clone().addScaledVector(side, sign * x0).addScaledVector(up, y1)
          return sign > 0 ? [a, b, c, d] : [b, a, d, c]
        }, 20)
        const rail = new T.Mesh(railGeo, railMat)
        rail.castShadow = true
        rail.receiveShadow = true
        group.add(rail)
      })
    })

    // Guardrail posts at intervals
    for (let i = 0; i < 180; i++) {
      const t = i / 180
      const p = curve.getPointAt(t)
      const tan = curve.getTangentAt(t).normalize()
      const side = sideOf(tan)
      ;[-1, 1].forEach((sign) => {
        const post = new T.Mesh(new T.BoxGeometry(0.08, 0.95, 0.12), postMat)
        post.position.copy(p).addScaledVector(side, sign * railX)
        post.position.y += 0.48
        post.lookAt(p.clone().add(tan))
        post.castShadow = true
        group.add(post)
      })
    }

    const grass = new T.Mesh(
      new T.CircleGeometry(160, 72),
      new T.MeshStandardMaterial({
        map: makeGrassTexture(),
        color: '#ffffff',
        roughness: 0.95,
        metalness: 0
      })
    )
    grass.rotation.x = -Math.PI / 2
    grass.position.y = -0.12
    grass.receiveShadow = true
    group.add(grass)

    const far = new T.Mesh(
      new T.CircleGeometry(260, 48),
      new T.MeshStandardMaterial({ color: '#2aad55', roughness: 1 })
    )
    far.rotation.x = -Math.PI / 2
    far.position.y = -0.25
    far.receiveShadow = true
    group.add(far)

    return group
  }

  function makeSkyTexture() {
    const T = ensureThree()
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 512
    const g = c.getContext('2d')
    const grd = g.createLinearGradient(0, 0, 0, 512)
    // scene.background uses this as an equirect-ish vertical gradient (top=zenith)
    grd.addColorStop(0, '#0a6df2')
    grd.addColorStop(0.25, '#1f8cff')
    grd.addColorStop(0.45, '#3ea4ff')
    grd.addColorStop(0.62, '#6cbcff')
    grd.addColorStop(0.78, '#9ed4ff')
    grd.addColorStop(0.9, '#d8eefc')
    grd.addColorStop(1, '#fff2c8')
    g.fillStyle = grd
    g.fillRect(0, 0, 4, 512)
    const tex = new T.CanvasTexture(c)
    tex.colorSpace = T.SRGBColorSpace
    tex.magFilter = T.LinearFilter
    tex.minFilter = T.LinearFilter
    return tex
  }

  function makeSkyDome() {
    const T = ensureThree()
    // Wide painted backdrop dome (no fog) with cloud soft-shapes
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 512
    const g = c.getContext('2d')
    const grd = g.createLinearGradient(0, 0, 0, 512)
    grd.addColorStop(0, '#0a6df2')
    grd.addColorStop(0.22, '#1f8cff')
    grd.addColorStop(0.4, '#3ea4ff')
    grd.addColorStop(0.55, '#5eb4ff')
    grd.addColorStop(0.7, '#8eccff')
    grd.addColorStop(0.84, '#c5e6ff')
    grd.addColorStop(0.92, '#fff0c4')
    grd.addColorStop(1, '#7ecf6a')
    g.fillStyle = grd
    g.fillRect(0, 0, 1024, 512)
    // Soft painted cloud patches — leave plenty of open blue
    for (let i = 0; i < 16; i++) {
      const cx = (i * 97 + 60) % 1024
      const cy = 55 + (i % 5) * 48 + (i % 3) * 10
      if (cy > 260) continue
      const rx = 55 + (i % 4) * 14
      const ry = 18 + (i % 3) * 6
      const cloud = g.createRadialGradient(cx, cy, 2, cx, cy, rx)
      cloud.addColorStop(0, 'rgba(255,255,255,0.8)')
      cloud.addColorStop(0.4, 'rgba(255,255,255,0.35)')
      cloud.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = cloud
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill()
      g.beginPath(); g.ellipse(cx + rx * 0.35, cy + 3, rx * 0.65, ry * 0.8, 0, 0, Math.PI * 2); g.fill()
    }
    const tex = new T.CanvasTexture(c)
    tex.colorSpace = T.SRGBColorSpace
    const mesh = new T.Mesh(
      new T.SphereGeometry(200, 48, 28),
      new T.MeshBasicMaterial({
        map: tex, side: T.BackSide, depthWrite: false, fog: false, toneMapped: false
      })
    )
    return mesh
  }

  function makeClouds() {
    const T = ensureThree()
    const g = new T.Group()
    const mat = new T.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false, fog: false
    })
    const matSoft = new T.MeshBasicMaterial({
      color: '#f7fbff', transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, fog: false
    })
    // Fewer, farther clouds so big blue sky remains visible in the driver FOV
    for (let i = 0; i < 18; i++) {
      const cloud = new T.Group()
      const a = (i / 18) * Math.PI * 2 + (i % 5) * 0.13
      const r = 95 + (i % 4) * 22
      const parts = [
        [0, 0, 0, 4.0],
        [3.8, 0.4, 0.6, 2.9],
        [-3.6, 0.25, -0.4, 2.7],
        [1.4, 1.1, -1.2, 2.2],
        [-1.7, 0.9, 1.3, 2.0],
        [5.4, 0.0, -0.7, 1.8]
      ]
      parts.forEach((pt, k) => {
        const p = new T.Mesh(new T.SphereGeometry(pt[3], 10, 8), k % 3 === 0 ? matSoft : mat)
        p.position.set(pt[0], pt[1], pt[2])
        p.scale.set(1.2, 0.52, 1.0)
        cloud.add(p)
      })
      cloud.position.set(Math.cos(a) * r, 28 + (i % 4) * 3.5, Math.sin(a) * r)
      cloud.scale.setScalar(1.05 + (i % 3) * 0.25)
      cloud.rotation.y = a * 0.3
      g.add(cloud)
    }
    return g
  }

  function makeSun() {
    const T = ensureThree()
    const g = new T.Group()
    g.add(new T.Mesh(
      new T.SphereGeometry(9, 24, 16),
      new T.MeshBasicMaterial({ color: '#fffbe8', toneMapped: false, fog: false })
    ))
    g.add(new T.Mesh(
      new T.SphereGeometry(22, 24, 16),
      new T.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0.38, toneMapped: false, depthWrite: false, fog: false })
    ))
    g.add(new T.Mesh(
      new T.SphereGeometry(36, 24, 16),
      new T.MeshBasicMaterial({ color: '#ffd978', transparent: true, opacity: 0.14, toneMapped: false, depthWrite: false, fog: false })
    ))
    g.position.set(55, 70, -90)
    return g
  }

  function makePalm(x, y, z, s) {
    const T = ensureThree()
    const g = new T.Group()
    const trunkMat = new T.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.9 })
    const trunk = new T.Mesh(new T.CylinderGeometry(0.16 * s, 0.28 * s, 3.6 * s, 8), trunkMat)
    trunk.position.y = 1.8 * s
    trunk.castShadow = true
    g.add(trunk)
    const leafMat = new T.MeshStandardMaterial({ color: '#27c46a', roughness: 0.65, side: T.DoubleSide })
    for (let i = 0; i < 7; i++) {
      const leaf = new T.Mesh(new T.PlaneGeometry(2.4 * s, 0.55 * s), leafMat)
      leaf.position.set(0, 3.5 * s, 0)
      leaf.rotation.y = (i / 7) * Math.PI * 2
      leaf.rotation.z = 0.85
      leaf.translateX(1.0 * s)
      leaf.castShadow = true
      g.add(leaf)
    }
    const nuts = new T.Mesh(
      new T.SphereGeometry(0.22 * s, 8, 8),
      new T.MeshStandardMaterial({ color: '#6b3e18', roughness: 0.8 })
    )
    nuts.position.y = 3.35 * s
    g.add(nuts)
    g.position.set(x, y, z)
    return g
  }

  function makeRock(x, y, z, s) {
    const T = ensureThree()
    const m = new T.Mesh(
      new T.IcosahedronGeometry(0.7 * s, 0),
      new T.MeshStandardMaterial({ color: '#8d8379', roughness: 0.95, flatShading: true })
    )
    m.position.set(x, y + 0.3 * s, z)
    m.rotation.set(rand(0, 1), rand(0, 5), rand(0, 1))
    m.scale.set(1.2, 0.75, 1)
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  function makeKart(colorHex, withPip) {
    const T = ensureThree()
    const g = new T.Group()
    const bodyMat = new T.MeshStandardMaterial({
      color: colorHex, roughness: 0.42, metalness: 0.18,
      emissive: colorHex, emissiveIntensity: 0.12
    })
    const darkMat = new T.MeshStandardMaterial({ color: '#243044', roughness: 0.35, metalness: 0.35 })
    const chrome = new T.MeshStandardMaterial({ color: '#e8eef8', roughness: 0.25, metalness: 0.7 })

    const hull = new T.Mesh(new T.BoxGeometry(1.45, 0.38, 2.25), bodyMat)
    hull.position.y = 0.48
    hull.castShadow = true
    g.add(hull)

    const nose = new T.Mesh(new T.BoxGeometry(1.15, 0.28, 0.85), bodyMat)
    nose.position.set(0, 0.42, -1.2)
    nose.castShadow = true
    g.add(nose)

    const wing = new T.Mesh(new T.BoxGeometry(1.7, 0.1, 0.4), bodyMat)
    wing.position.set(0, 0.95, 1.0)
    wing.castShadow = true
    g.add(wing)
    ;[-0.62, 0.62].forEach((x) => {
      const post = new T.Mesh(new T.BoxGeometry(0.08, 0.4, 0.08), bodyMat)
      post.position.set(x, 0.75, 0.9)
      g.add(post)
    })

    const cabin = new T.Mesh(new T.BoxGeometry(0.9, 0.36, 0.8), darkMat)
    cabin.position.set(0, 0.78, 0.05)
    cabin.castShadow = true
    g.add(cabin)

    const seat = new T.Mesh(new T.BoxGeometry(0.55, 0.18, 0.45), new T.MeshStandardMaterial({ color: '#2a2f45', roughness: 0.7 }))
    seat.position.set(0, 0.62, 0.15)
    g.add(seat)

    const badge = new T.Mesh(new T.SphereGeometry(0.13, 12, 10), new T.MeshStandardMaterial({
      color: '#ffd166', emissive: '#ff9f1c', emissiveIntensity: 0.45, metalness: 0.7, roughness: 0.25
    }))
    badge.position.set(0, 0.55, -0.35)
    g.add(badge)

    // wheels
    const wheelGeo = new T.CylinderGeometry(0.34, 0.34, 0.32, 16)
    const wheelMat = new T.MeshStandardMaterial({ color: '#14141c', roughness: 0.65, metalness: 0.25 })
    const hubMat = chrome
    g.userData.wheels = []
    ;[[-0.78, 0.34, 0.78], [0.78, 0.34, 0.78], [-0.78, 0.34, -0.85], [0.78, 0.34, -0.85]].forEach(([x, y, z]) => {
      const w = new T.Mesh(wheelGeo, wheelMat)
      w.rotation.z = Math.PI / 2
      w.position.set(x, y, z)
      w.castShadow = true
      const hub = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.34, 10), hubMat)
      hub.rotation.z = Math.PI / 2
      hub.position.copy(w.position)
      g.add(w, hub)
      g.userData.wheels.push(w)
    })

    // underglow
    const glow = new T.Mesh(
      new T.CircleGeometry(0.9, 20),
      new T.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.22, depthWrite: false })
    )
    glow.rotation.x = -Math.PI / 2
    glow.position.y = 0.05
    g.add(glow)

    if (withPip) {
      const pip = makePip()
      pip.position.set(0.12, 1.05, 0.05)
      g.add(pip)
    }
    return g
  }

  function makePip() {
    const T = ensureThree()
    const g = new T.Group()
    const green = new T.MeshStandardMaterial({ color: '#2fbf5c', roughness: 0.45 })
    const body = new T.Mesh(new T.SphereGeometry(0.24, 16, 12), green)
    body.scale.set(0.9, 1.05, 0.85)
    body.castShadow = true
    g.add(body)
    const head = new T.Mesh(new T.SphereGeometry(0.17, 14, 12), new T.MeshStandardMaterial({ color: '#45d978', roughness: 0.4 }))
    head.position.y = 0.24
    g.add(head)
    const beak = new T.Mesh(new T.ConeGeometry(0.055, 0.16, 8), new T.MeshStandardMaterial({ color: '#ff9f1c', roughness: 0.35 }))
    beak.rotation.x = Math.PI / 2
    beak.position.set(0, 0.22, 0.18)
    g.add(beak)
    const eye = new T.Mesh(new T.SphereGeometry(0.035, 8, 8), new T.MeshStandardMaterial({ color: '#1a1a22' }))
    eye.position.set(0.07, 0.28, 0.12)
    g.add(eye)
    const eye2 = eye.clone(); eye2.position.x = -0.07; g.add(eye2)
    const hat = new T.Mesh(new T.CylinderGeometry(0.13, 0.16, 0.09, 12), new T.MeshStandardMaterial({ color: '#1e1a16', roughness: 0.8 }))
    hat.position.y = 0.4
    g.add(hat)
    const brim = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.03, 12), new T.MeshStandardMaterial({ color: '#1e1a16', roughness: 0.8 }))
    brim.position.y = 0.36
    g.add(brim)
    // red chest
    const chest = new T.Mesh(new T.SphereGeometry(0.12, 10, 8), new T.MeshStandardMaterial({ color: '#e63946', roughness: 0.5 }))
    chest.position.set(0, 0.02, 0.14)
    chest.scale.set(1, 0.8, 0.5)
    g.add(chest)
    return g
  }

  function makeWordTexture(text, hue) {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 192
    const g = c.getContext('2d')
    // Clear
    g.clearRect(0, 0, 512, 192)
    const glow = g.createRadialGradient(256, 96, 10, 256, 96, 200)
    glow.addColorStop(0, `hsla(${hue},95%,70%,0.95)`)
    glow.addColorStop(1, `hsla(${hue},90%,55%,0)`)
    g.fillStyle = glow
    g.fillRect(0, 0, 512, 192)
    roundRect2d(g, 28, 22, 456, 148, 52)
    g.fillStyle = `hsl(${hue}, 90%, 56%)`
    g.fill()
    g.lineWidth = 12
    g.strokeStyle = '#ffffff'
    g.stroke()
    g.fillStyle = '#0f1728'
    g.font = '800 88px "Baloo 2", Nunito, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(capitalize(text), 256, 100)
    const T = ensureThree()
    const tex = new T.CanvasTexture(c)
    if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace
    tex.anisotropy = 4
    // Sprites expect flipY true so canvas top = texture top on screen
    tex.flipY = true
    tex.needsUpdate = true
    return tex
  }

  function roundRect2d(g, x, y, w, h, r) {
    g.beginPath()
    g.moveTo(x + r, y)
    g.arcTo(x + w, y, x + w, y + h, r)
    g.arcTo(x + w, y + h, x, y + h, r)
    g.arcTo(x, y + h, x, y, r)
    g.arcTo(x, y, x + w, y, r)
    g.closePath()
  }

  function makeWordPad(text, hue) {
    const T = ensureThree()
    const tex = makeWordTexture(text, hue)
    // Sprite always faces the camera upright in screen space — never upside-down
    const mat = new T.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
      fog: true
    })
    const sprite = new T.Sprite(mat)
    sprite.scale.set(3.6, 1.35, 1)
    sprite.center.set(0.5, 0.5)
    return sprite
  }

  function placeOnTrack(curve, t, lane, yLift) {
    const T = ensureThree()
    const tt = ((t % 1) + 1) % 1
    const p = curve.getPointAt(tt)
    const tan = curve.getTangentAt(tt)
    const side = sideOf(tan)
    const pos = p.clone().addScaledVector(side, lane)
    pos.y += yLift || 0
    return { pos, tan, side }
  }

  function createScene() {
    const T = ensureThree()
    scene = new T.Scene()
    scene.fog = new T.FogExp2('#7ec8ff', 0.0032)

    camera = new T.PerspectiveCamera(58, 1, 0.15, 450)

    scene.add(new T.HemisphereLight('#d8efff', '#5fbf68', 1.05))
    scene.add(new T.AmbientLight('#ffffff', 0.62))
    sun = new T.DirectionalLight('#fff6e0', 2.05)
    sun.position.set(40, 70, 25)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 2
    sun.shadow.camera.far = 200
    sun.shadow.camera.left = -55
    sun.shadow.camera.right = 55
    sun.shadow.camera.top = 55
    sun.shadow.camera.bottom = -55
    sun.shadow.bias = -0.0002
    scene.add(sun)
    const fill = new T.DirectionalLight('#a8d8ff', 0.6)
    fill.position.set(-30, 20, -20)
    scene.add(fill)

    scene.background = new T.Color('#2f9aff')
    scene.add(makeSkyDome())
    scene.add(makeSun())
    scene.add(makeClouds())

    const curve = buildTrackCurve()
    scene.add(buildRoadMesh(curve))

    const scenery = new T.Group()
    for (let i = 0; i < 85; i++) {
      const t = Math.random()
      const sign = Math.random() < 0.5 ? -1 : 1
      const { pos } = placeOnTrack(curve, t, sign * rand(8, 18), 0)
      if (Math.random() < 0.7) scenery.add(makePalm(pos.x, 0, pos.z, rand(0.9, 1.45)))
      else scenery.add(makeRock(pos.x, 0, pos.z, rand(0.8, 1.6)))
    }
    scene.add(scenery)

    const words = (window.SIGHT_WORDS_G1 || ['the', 'and', 'you']).slice()
    const pack = words.slice().sort(() => Math.random() - 0.5)
    const wordObjs = []
    let wi = 0
    for (let i = 0; i < 100; i++) {
      const t = (0.03 + i * 0.0095) % 1
      const lane = LANE_X[wi % 3]
      const text = pack[wi % pack.length]
      const hue = (wi * 49) % 360
      wi++
      const pad = makeWordPad(text, hue)
      const { pos } = placeOnTrack(curve, t, lane, 0.85)
      pad.position.copy(pos)
      scene.add(pad)
      wordObjs.push({ mesh: pad, text, t, lane, hue, hit: false })
    }

    const kart = makeKart('#ff6a1a', true)
    scene.add(kart)
    const rivals = [0, 1, 2].map((i) => {
      const k = makeKart(['#ff2f86', '#1aa8ff', '#7dff4d'][i], false)
      scene.add(k)
      return { mesh: k, lane: LANE_X[(i + 1) % 3], bob: i * 1.8, offset: 0.07 + i * 0.06 }
    })

    const sparks = []
    const sparkGeo = new T.SphereGeometry(0.11, 8, 8)
    for (let i = 0; i < 48; i++) {
      const s = new T.Mesh(sparkGeo, new T.MeshBasicMaterial({ color: '#ffd166' }))
      s.visible = false
      scene.add(s)
      sparks.push({ mesh: s, life: 0, v: new T.Vector3() })
    }

    return { curve, kart, rivals, wordObjs, sparks }
  }

  function initRenderer() {
    const T = ensureThree()
    canvas = document.getElementById('raceCanvas')
    wrap = document.getElementById('raceArena')
    if (!canvas || !wrap) return false

    // Fresh canvas node avoids "existing context of a different type"
    if (canvas.__glTaken || renderer) {
      const fresh = canvas.cloneNode(false)
      canvas.parentNode.replaceChild(fresh, canvas)
      canvas = fresh
      canvas.id = 'raceCanvas'
    }
    canvas.__glTaken = true

    if (renderer) {
      try { renderer.dispose() } catch (e) {}
      renderer = null
    }

    renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false
    })
    renderer.setClearColor('#3a9dff', 1)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = T.PCFSoftShadowMap
    if (T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace
    if (T.ACESFilmicToneMapping) {
      renderer.toneMapping = T.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.22
    }
    sizeCanvas()
    clock = new T.Clock()
    return true
  }

  function sizeCanvas() {
    if (!renderer || !wrap || !camera) return
    const r = wrap.getBoundingClientRect()
    const w = Math.max(320, Math.floor(r.width) || 800)
    const h = Math.max(280, Math.floor(r.height) || 480)
    renderer.setSize(w, h, false)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  function updateHud() {
    if (!state) return
    const hud = document.getElementById('raceHud')
    const chip = document.getElementById('raceChip')
    const model = document.getElementById('raceModel')
    const msg = document.getElementById('raceMessage')
    if (hud) hud.textContent = `✨ ${state.collected} / ${state.goal}`
    if (chip) {
      chip.textContent = state.finished
        ? 'Finish!'
        : (state.pausedForSay ? 'Say it!' : (gyroOn ? 'Gyro on' : '3D · Tilt / drag'))
    }
    if (model) {
      if (state.pausedForSay && state.sayWord) {
        model.textContent = `Say “${capitalize(state.sayWord)}” out loud into the microphone.`
      } else {
        model.textContent = state.lastWord
          ? `You drove over “${capitalize(state.lastWord)}” — keep racing!`
          : 'Tilt the iPad to steer. Your kart zooms by itself. Drive over glowing words to hear them!'
      }
    }
    if (msg && !state.finished && !state.pausedForSay) {
      msg.textContent = state.combo > 1 ? `Word combo ×${state.combo}!` : ''
    }
  }

  function setSayOverlay(visible, word, status) {
    const overlay = document.getElementById('raceSayOverlay')
    const wordEl = document.getElementById('raceSayWord')
    const statusEl = document.getElementById('raceSayStatus')
    if (wordEl && word) wordEl.textContent = capitalize(word)
    if (statusEl && status != null) statusEl.textContent = status
    if (overlay) overlay.classList.toggle('hidden', !visible)
  }

  function stopSayListening() {
    if (sayListenTimer) {
      clearTimeout(sayListenTimer)
      sayListenTimer = 0
    }
    if (sayRecognizer) {
      try { sayRecognizer.onresult = null; sayRecognizer.onerror = null; sayRecognizer.onend = null } catch (e) {}
      try { sayRecognizer.abort() } catch (e) {}
      try { sayRecognizer.stop() } catch (e) {}
      sayRecognizer = null
    }
  }

  function handleHeardTranscript(transcript, isFinal) {
    if (!state || !state.pausedForSay || !state.sayWord) return
    const text = String(transcript || '').trim()
    if (!text) return
    const statusEl = document.getElementById('raceSayStatus')
    if (statusEl && !isFinal) statusEl.textContent = `Hearing “${text}”…`
    if (!transcriptMatchesWord(text, state.sayWord)) {
      if (!isFinal) return
      if (statusEl) statusEl.textContent = `I heard “${text}”. Listen again.`
      // Model the correct word, then listen for a repeat
      promptSayRetry(`I heard “${text}”. The word is`)
      return
    }
    onSayCorrect()
  }

  function startSayListening() {
    if (!state || !state.pausedForSay) return
    stopSayListening()
    const Ctor = getSpeechRecognitionCtor()
    const statusEl = document.getElementById('raceSayStatus')
    const micBtn = document.getElementById('raceSayMicBtn')
    if (!Ctor) {
      if (statusEl) statusEl.textContent = 'Microphone speech is not available. Tap the button after you say it.'
      micBtn?.classList.remove('hidden')
      return
    }
    const rec = new Ctor()
    sayRecognizer = rec
    rec.lang = 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 4
    rec.onresult = (event) => {
      let interim = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        const piece = res[0] && res[0].transcript ? res[0].transcript : ''
        if (res.isFinal) finalText += ' ' + piece
        else interim += ' ' + piece
      }
      if (interim.trim()) handleHeardTranscript(interim, false)
      if (finalText.trim()) handleHeardTranscript(finalText, true)
    }
    rec.onerror = (event) => {
      const err = (event && event.error) || ''
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        if (statusEl) statusEl.textContent = 'Please allow the microphone, then tap to speak.'
        micBtn?.classList.remove('hidden')
      } else if (err === 'no-speech') {
        if (statusEl) statusEl.textContent = 'I did not hear you. Tap the mic and say the word.'
        micBtn?.classList.remove('hidden')
      } else if (err !== 'aborted') {
        if (statusEl) statusEl.textContent = 'Listening had a hiccup. Tap the mic to try again.'
        micBtn?.classList.remove('hidden')
      }
    }
    rec.onend = () => {
      // Keep listening while the say-check is still open
      if (state && state.pausedForSay && sayRecognizer === rec) {
        try { rec.start() } catch (e) {
          micBtn?.classList.remove('hidden')
          if (statusEl) statusEl.textContent = 'Tap the mic, then say the word.'
        }
      }
    }
    try {
      rec.start()
      if (statusEl) statusEl.textContent = 'Listening… say the word!'
      micBtn?.classList.add('is-listening')
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Tap the mic, then say the word.'
      micBtn?.classList.remove('hidden')
    }
    // Safety: if nothing matches for a while, model the word again
    sayListenTimer = setTimeout(() => {
      if (state && state.pausedForSay) promptSayRetry('I am still listening. Here is the word again.')
    }, 12000)
  }

  function promptSayRetry(leadIn) {
    if (!state || !state.pausedForSay || !state.sayWord) return
    if (sayPrompting) return
    sayPrompting = true
    stopSayListening()
    sayRetryCount += 1
    const word = state.sayWord
    setSayOverlay(true, word, 'Listen, then say it.')
    updateHud()
    const line = leadIn || 'Not quite. Listen carefully.'
    const run = () => {
      if (typeof speak !== 'function') return Promise.resolve()
      return speak(line, { rate: 0.95, interrupt: true })
        .then(() => speak(capitalize(word), { rate: 0.8, interrupt: false }))
        .then(() => speak('Now you say it.', { rate: 0.95, interrupt: false }))
    }
    speakQueue = speakQueue.then(run).catch(() => {}).then(() => {
      sayPrompting = false
      if (state && state.pausedForSay) startSayListening()
    })
  }

  function onSayCorrect() {
    if (!state || !state.pausedForSay) return
    stopSayListening()
    sayPrompting = false
    state.pausedForSay = false
    state.sayCheckDone = true
    const shown = state.sayWord || state.lastWord || 'Yes'
    state.sayWord = ''
    sayRetryCount = 0
    const micBtn = document.getElementById('raceSayMicBtn')
    micBtn?.classList.remove('is-listening')
    setSayOverlay(true, shown, 'Yes! Great job!')
    updateHud()
    const finish = () => {
      setSayOverlay(false)
      if (engineNodes) {
        try {
          engineNodes.g.gain.exponentialRampToValueAtTime(0.035, engineNodes.ac.currentTime + 0.25)
        } catch (e) {}
      } else startEngineHum()
      updateHud()
    }
    if (typeof speak === 'function') {
      speakQueue = speakQueue
        .then(() => speak('Yes! Great job. Keep racing!', { rate: 0.95, interrupt: true }))
        .catch(() => {})
        .then(finish)
    } else {
      setTimeout(finish, 700)
    }
  }

  function beginSayCheck(word) {
    if (!state || state.sayCheckDone || state.finished) return
    state.pausedForSay = true
    state.sayWord = word
    state.speed = 0
    state.boost = 0
    sayRetryCount = 0
    stopSayListening()
    // Quiet the engine while listening
    if (engineNodes) {
      try {
        engineNodes.g.gain.exponentialRampToValueAtTime(0.0001, engineNodes.ac.currentTime + 0.2)
      } catch (e) {}
    }
    setSayOverlay(true, word, 'Get ready…')
    updateHud()
    if (typeof unlockSpeech === 'function') unlockSpeech()
    const run = () => {
      if (typeof speak !== 'function') return Promise.resolve()
      return speak(`Checkpoint! Now you say the word.`, { rate: 0.95, interrupt: true })
        .then(() => speak(capitalize(word), { rate: 0.82, interrupt: false }))
        .then(() => speak('Your turn. Say it into the microphone.', { rate: 0.95, interrupt: false }))
    }
    speakQueue = speakQueue.then(run).catch(() => {}).then(() => {
      if (state && state.pausedForSay) startSayListening()
    })
  }

  function onRaceSayMicTap() {
    if (!state || !state.pausedForSay) return
    if (typeof unlockSpeech === 'function') unlockSpeech()
    const statusEl = document.getElementById('raceSayStatus')
    if (statusEl) statusEl.textContent = 'Listening… say the word!'
    startSayListening()
  }

  function bindSayOverlay() {
    const micBtn = document.getElementById('raceSayMicBtn')
    if (!micBtn || micBtn._raceSayBound) return
    micBtn._raceSayBound = true
    micBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onRaceSayMicTap()
    })
  }

  function startEngineHum() {
    stopEngineHum()
    try {
      if (typeof getAudioCtx !== 'function' || typeof masterOut !== 'function') return
      const ac = getAudioCtx()
      const out = masterOut()
      if (!ac || !out) return
      const o1 = ac.createOscillator()
      const o2 = ac.createOscillator()
      const g = ac.createGain()
      const f = ac.createBiquadFilter()
      o1.type = 'sawtooth'; o2.type = 'triangle'
      o1.frequency.value = 55; o2.frequency.value = 82
      f.type = 'lowpass'; f.frequency.value = 420
      g.gain.value = 0.0001
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(out)
      o1.start(); o2.start()
      g.gain.exponentialRampToValueAtTime(0.035, ac.currentTime + 0.4)
      engineNodes = { o1, o2, g, f, ac }
    } catch (e) { engineNodes = null }
  }

  function stopEngineHum() {
    if (!engineNodes) return
    try {
      const { o1, o2, g, ac } = engineNodes
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.15)
      setTimeout(() => { try { o1.stop(); o2.stop() } catch (e) {} }, 200)
    } catch (e) {}
    engineNodes = null
  }

  function syncEngine() {
    if (!engineNodes || !state) return
    const t = state.speed / state.maxSpeed
    engineNodes.o1.frequency.setTargetAtTime(48 + t * 90, engineNodes.ac.currentTime, 0.08)
    engineNodes.o2.frequency.setTargetAtTime(70 + t * 120, engineNodes.ac.currentTime, 0.08)
    engineNodes.f.frequency.setTargetAtTime(280 + t * 900 + state.boost * 40, engineNodes.ac.currentTime, 0.05)
    engineNodes.g.gain.setTargetAtTime(0.02 + t * 0.04 + (state.boost > 0 ? 0.02 : 0), engineNodes.ac.currentTime, 0.08)
  }

  function playCollectSfx() {
    if (typeof playSfx === 'function') { playSfx('ok'); playSfx('whoosh') }
  }

  function speakWord(word) {
    if (typeof speak !== 'function') return Promise.resolve()
    speakQueue = speakQueue.then(() => speak(capitalize(word), { rate: 0.88, interrupt: true })).catch(() => {})
    return speakQueue
  }

  function awardWord(word) {
    let loot = null
    if (typeof awardSliceStar === 'function') loot = awardSliceStar(word)
    else if (typeof profile !== 'undefined') {
      profile.stars = (profile.stars || 0) + 1
      profile.reads = (profile.reads || 0) + 1
      if (typeof addPoints === 'function') addPoints(1)
      if (typeof saveProfile === 'function') saveProfile()
      if (typeof scoreHud === 'function') scoreHud()
    }
    if (typeof celebrate === 'function') celebrate()
    return loot
  }

  function burstSparks(pos, hue) {
    const T = ensureThree()
    let n = 0
    state.sparks.forEach((s) => {
      if (n > 18 || s.life > 0) return
      s.life = rand(0.45, 1)
      s.mesh.visible = true
      s.mesh.position.copy(pos)
      s.mesh.material.color.setHSL((hue % 360) / 360, 0.9, 0.6)
      s.v.set(rand(-5, 5), rand(4, 10), rand(-5, 5))
      n++
    })
  }

  function onWordHit(w) {
    if (w.hit || state.finished || state.pausedForSay) return
    w.hit = true
    state.collected += 1
    state.combo += 1
    state.boost = Math.min(1, state.boost + 0.38 + state.combo * 0.04)
    state.lastWord = w.text
    state.maxSpeed = Math.min(0.09, 0.052 + state.collected * 0.0022)
    w.mesh.visible = false
    burstSparks(w.mesh.position.clone().add(new (ensureThree()).Vector3(0, 0.6, 0)), w.hue)
    playCollectSfx()
    updateHud()
    const loot = awardWord(w.text)
    const needSayCheck = state.collected === SAY_CHECK_AT && !state.sayCheckDone
    speakWord(w.text).then(() => {
      if (typeof announceLoot === 'function') return announceLoot(loot)
    }).then(() => {
      if (!state || state.finished) return
      if (needSayCheck) beginSayCheck(w.text)
      else if (state.collected >= state.goal) finishRace()
    })
  }

  function finishRace() {
    if (state.finished) return
    state.finished = true
    state.speed *= 0.3
    stopEngineHum()
    const msg = document.getElementById('raceMessage')
    const next = document.getElementById('raceNext')
    if (msg) msg.textContent = `Lap clear! ${state.collected} sight words heard.`
    if (next) { next.classList.remove('hidden'); next.textContent = 'Race again!' }
    if (typeof speak === 'function') speak(`Awesome race! You collected ${state.collected} sight words.`, { rate: 0.95 })
    if (typeof spawnConfetti === 'function') spawnConfetti(48)
    updateHud()
  }

  function setKartPose(mesh, t, lane, lean) {
    const { pos, tan } = placeOnTrack(state.curve, t, lane, 0.12)
    mesh.position.copy(pos)
    mesh.lookAt(pos.clone().add(tan))
    if (lean) mesh.rotateZ(lean)
  }

  function step(dt) {
    if (!state || !renderer) return
    const T = ensureThree()
    state.time += dt

    if (state.pausedForSay) {
      state.speed = lerp(state.speed, 0, 0.2)
      state.boost = 0
      state.steer = lerp(state.steer, 0, 0.12)
      // Keep rendering the frozen kart pose
    } else if (!state.finished) {
      const target = state.maxSpeed * (1 + state.boost * 0.9)
      state.speed = lerp(state.speed, target, 1 - Math.pow(0.08, dt * 60))
      state.boost = Math.max(0, state.boost - dt * 0.32)
      let input = gyroOn ? (state.gyroSteer || 0) : 0
      if (!gyroOn) input = clamp(touchSteer + keySteer, -1, 1)
      state.steer = lerp(state.steer, input, 1 - Math.pow(0.14, dt * 60))
      state.laneOffset += state.steer * dt * 8
      state.laneOffset = clamp(state.laneOffset, -ROAD_HALF + 1.0, ROAD_HALF - 1.0)
      state.t = (state.t + state.speed * dt) % 1
    } else {
      state.speed = lerp(state.speed, 0.008, 0.02)
      state.t = (state.t + state.speed * dt) % 1
      state.steer = lerp(state.steer, 0, 0.08)
    }

    setKartPose(state.kart, state.t, state.laneOffset, -state.steer * 0.32)
    const spin = state.pausedForSay ? 0 : state.speed * 90
    ;(state.kart.userData.wheels || []).forEach((w) => { w.rotation.x += spin * dt })

    state.rivals.forEach((r, i) => {
      const rt = (state.t + r.offset + Math.sin(state.time * 0.45 + r.bob) * 0.008) % 1
      const lane = r.lane + Math.sin(state.time * 0.55 + r.bob) * 0.55
      setKartPose(r.mesh, rt, lane, Math.sin(state.time + r.bob) * 0.12)
    })

    if (!state.pausedForSay) {
      state.wordObjs.forEach((w) => {
        if (w.hit) return
        const placed = placeOnTrack(state.curve, w.t, w.lane, 0)
        w.mesh.position.copy(placed.pos)
        // Hover above the road; Sprite auto-faces camera upright (screen-aligned)
        w.mesh.position.y += 1.15 + Math.sin(state.time * 3 + w.t * 50) * 0.08
        let dT = Math.abs(w.t - state.t)
        dT = Math.min(dT, 1 - dT)
        if (dT < 0.011 && Math.abs(w.lane - state.laneOffset) < 1.2) onWordHit(w)
      })
    } else {
      state.wordObjs.forEach((w) => {
        if (w.hit) return
        const placed = placeOnTrack(state.curve, w.t, w.lane, 0)
        w.mesh.position.copy(placed.pos)
        w.mesh.position.y += 1.15
      })
    }

    state.sparks.forEach((s) => {
      if (s.life <= 0) { s.mesh.visible = false; return }
      s.life -= dt
      s.v.y -= 14 * dt
      s.mesh.position.addScaledVector(s.v, dt)
      s.mesh.visible = s.life > 0
    })

    const { pos, tan, side } = placeOnTrack(state.curve, state.t, state.laneOffset, 0)
    const camPos = pos.clone().addScaledVector(tan, -8.2).add(new T.Vector3(0, 3.9, 0)).addScaledVector(side, state.steer * -0.9)
    state.camPos.lerp(camPos, 1 - Math.pow(0.07, dt * 60))
    camera.position.copy(state.camPos)
    const look = pos.clone().addScaledVector(tan, 10).add(new T.Vector3(0, 1.3, 0))
    state.camLook.lerp(look, 1 - Math.pow(0.12, dt * 60))
    camera.lookAt(state.camLook)
    sun.target.position.copy(pos)
    sun.target.updateMatrixWorld()
    sun.position.set(pos.x + 35, 65, pos.z + 20)

    syncEngine()
    renderer.render(scene, camera)
    if (Math.floor(state.time * 2) !== Math.floor((state.time - dt) * 2)) updateHud()
  }

  function loop() {
    if (!running) return
    step(clamp(clock.getDelta(), 0, 0.05))
    raf = requestAnimationFrame(loop)
  }

  function onOrient(e) {
    if (!running || !state) return
    let g = e.gamma, b = e.beta
    if (g == null && b == null) return
    let tilt = g
    if (Math.abs(b || 0) > Math.abs(g || 0) + 8) tilt = b
    state.gyroSteer = clamp((tilt || 0) / 25, -1, 1)
    gyroOn = true
    updateHud()
  }

  async function enableGyro() {
    let ok = false
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        ok = (await DeviceOrientationEvent.requestPermission()) === 'granted'
      } else ok = true
    } catch (e) { ok = false }
    if (ok) {
      window.removeEventListener('deviceorientation', onOrient)
      window.addEventListener('deviceorientation', onOrient, true)
    }
    return ok
  }

  function bindPointer() {
    const arena = document.getElementById('raceArena')
    if (!arena || arena._raceBound) return
    arena._raceBound = true
    let down = false
    const setX = (x) => {
      const r = arena.getBoundingClientRect()
      touchSteer = clamp(((x - r.left) / r.width - 0.5) * 2.4, -1, 1)
    }
    arena.addEventListener('pointerdown', (e) => { down = true; arena.setPointerCapture?.(e.pointerId); setX(e.clientX) })
    arena.addEventListener('pointermove', (e) => { if (down) setX(e.clientX) })
    const up = () => { down = false; touchSteer = 0 }
    arena.addEventListener('pointerup', up)
    arena.addEventListener('pointercancel', up)
  }

  function bindKeys() {
    if (window._raceKeys) return
    window._raceKeys = true
    window.addEventListener('keydown', (e) => {
      if (!running) return
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keySteer = -1; e.preventDefault() }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keySteer = 1; e.preventDefault() }
    })
    window.addEventListener('keyup', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) keySteer = 0
    })
  }

  function disposeScene() {
    if (!scene) return
    scene.traverse((obj) => {
      obj.geometry?.dispose?.()
      const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : [])
      mats.forEach((m) => { m.map?.dispose?.(); m.dispose?.() })
    })
    scene = null
  }

  function stopRace() {
    running = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    stopSayListening()
    setSayOverlay(false)
    stopEngineHum()
    window.removeEventListener('deviceorientation', onOrient, true)
    gyroOn = false
    touchSteer = 0
    keySteer = 0
    disposeScene()
    state = null
  }

  function startRaceGame() {
    try { ensureThree() } catch (e) {
      const msg = document.getElementById('raceMessage')
      if (msg) msg.textContent = '3D engine failed to load.'
      return
    }
    stopRace()
    if (!initRenderer()) return
    const built = createScene()
    const T = ensureThree()
    state = {
      ...built,
      t: 0.015,
      speed: 0,
      maxSpeed: 0.052,
      laneOffset: 0,
      steer: 0,
      gyroSteer: 0,
      collected: 0,
      goal: GOAL,
      combo: 0,
      boost: 0,
      time: 0,
      finished: false,
      pausedForSay: false,
      sayCheckDone: false,
      sayWord: '',
      lastWord: '',
      camPos: new T.Vector3(0, 5, 10),
      camLook: new T.Vector3(0, 1, 0)
    }
    document.getElementById('raceNext')?.classList.add('hidden')
    const msg = document.getElementById('raceMessage')
    if (msg) msg.textContent = ''
    setSayOverlay(false)
    bindSayOverlay()
    updateHud()
    bindPointer()
    bindKeys()
    sizeCanvas()
    running = true
    startEngineHum()
    enableGyro().then((ok) => {
      const btn = document.getElementById('raceGyroBtn')
      if (!ok) btn?.classList.remove('hidden')
      else if (location.protocol === 'https:') btn?.classList.add('hidden')
    })
    clock.start()
    raf = requestAnimationFrame(loop)
    window.addEventListener('resize', sizeCanvas)
    try {
      const demo = new URLSearchParams(location.search).get('demoSay')
      if (demo) setTimeout(() => beginSayCheck(demo), 900)
    } catch (e) {}
  }

  function requestGyroFromButton() {
    if (typeof unlockSpeech === 'function') unlockSpeech()
    enableGyro().then((ok) => {
      if (typeof speak === 'function') {
        speak(ok ? 'Tilt steering is on. Lean left and right.' : 'Tilt is not available. Drag on the track to steer.')
      }
      if (ok) document.getElementById('raceGyroBtn')?.classList.add('hidden')
      updateHud()
    })
  }

  window.startRaceGame = startRaceGame
  window.stopRace = stopRace
  window.requestRaceGyro = requestGyroFromButton
  window.sizeRaceCanvas = sizeCanvas
  // Test / debug helpers for pronunciation checkpoint
  window.__raceSay = {
    normalizeHeard,
    transcriptMatchesWord,
    sayCheckAt: SAY_CHECK_AT,
    begin: (word) => beginSayCheck(word || 'the'),
    forceHeard: (text) => handleHeardTranscript(text, true),
    isPaused: () => !!(state && state.pausedForSay),
    currentWord: () => (state && state.sayWord) || '',
    getCollected: () => (state && state.collected) || 0
  }
})()
