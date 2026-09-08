/* Word Kart — real WebGL/Three.js sight-word racer (professional) */
(function () {
  const GOAL = 12
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

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }
  function lerp(a, b, t) { return a + (b - a) * t }
  function rand(a, b) { return a + Math.random() * (b - a) }
  function capitalize(s) { return (s || '').charAt(0).toUpperCase() + (s || '').slice(1) }

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
    const n = 56
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const r = 62 + Math.sin(a * 2) * 12 + Math.cos(a * 3.4) * 7
      pts.push(new T.Vector3(
        Math.cos(a) * r,
        0.6 + Math.sin(a * 2.5) * 1.8 + Math.cos(a * 1.7) * 0.9,
        Math.sin(a) * r
      ))
    }
    return new T.CatmullRomCurve3(pts, true, 'catmullrom', 0.4)
  }

  function makeAsphaltTexture() {
    const T = ensureThree()
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 512
    const g = c.getContext('2d')
    g.fillStyle = '#3d4458'
    g.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 9000; i++) {
      const n = (Math.random() * 40) | 0
      g.fillStyle = `rgba(${n},${n},${n + 8},${0.08 + Math.random() * 0.1})`
      g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
    }
    // lane dashes (V tile)
    g.fillStyle = '#fff3b0'
    for (let y = 0; y < 512; y += 64) {
      g.fillRect(248, y + 8, 16, 28)
    }
    g.fillStyle = '#ffd166'
    g.fillRect(18, 0, 10, 512)
    g.fillRect(484, 0, 10, 512)
    const tex = new T.CanvasTexture(c)
    tex.wrapS = tex.wrapT = T.RepeatWrapping
    tex.repeat.set(1, 48)
    tex.anisotropy = 8
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

  function buildRoadMesh(curve) {
    const T = ensureThree()
    const group = new T.Group()
    const segs = 320
    const hw = ROAD_HALF
    const pos = []
    const nrm = []
    const uv = []
    const idx = []

    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const p = curve.getPointAt(t)
      const tan = curve.getTangentAt(t).normalize()
      const side = sideOf(tan)
      // Stable road up: prefer world up projected onto plane perpendicular to tangent
      const up = new T.Vector3(0, 1, 0).addScaledVector(tan, -tan.y).normalize()
      const left = p.clone().addScaledVector(side, -hw).addScaledVector(up, 0.04)
      const right = p.clone().addScaledVector(side, hw).addScaledVector(up, 0.04)
      pos.push(left.x, left.y, left.z, right.x, right.y, right.z)
      nrm.push(up.x, up.y, up.z, up.x, up.y, up.z)
      uv.push(0, t * 50, 1, t * 50)
      if (i < segs) {
        const a = i * 2
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }

    const geo = new T.BufferGeometry()
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
    geo.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3))
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
    geo.setIndex(idx)

    const road = new T.Mesh(geo, new T.MeshStandardMaterial({
      map: makeAsphaltTexture(),
      color: '#d8dce8',
      roughness: 0.8,
      metalness: 0.05,
      side: T.DoubleSide
    }))
    road.receiveShadow = true
    road.castShadow = true
    group.add(road)

    // slightly wider darker bed under the road for thickness
    const bedPos = []
    const bedIdx = []
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const p = curve.getPointAt(t)
      const tan = curve.getTangentAt(t).normalize()
      const side = sideOf(tan)
      const left = p.clone().addScaledVector(side, -(hw + 0.35))
      const right = p.clone().addScaledVector(side, hw + 0.35)
      left.y -= 0.08
      right.y -= 0.08
      bedPos.push(left.x, left.y, left.z, right.x, right.y, right.z)
      if (i < segs) {
        const a = i * 2
        bedIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    const bedGeo = new T.BufferGeometry()
    bedGeo.setAttribute('position', new T.Float32BufferAttribute(bedPos, 3))
    bedGeo.setIndex(bedIdx)
    bedGeo.computeVertexNormals()
    const bed = new T.Mesh(bedGeo, new T.MeshStandardMaterial({
      color: '#2a2f3d', roughness: 0.95, side: T.DoubleSide
    }))
    bed.receiveShadow = true
    group.add(bed)

    // curb blocks
    for (let i = 0; i < 240; i++) {
      const t0 = i / 240
      const t1 = (i + 1) / 240
      const p0 = curve.getPointAt(t0)
      const p1 = curve.getPointAt(t1)
      const tan = curve.getTangentAt(t0).normalize()
      const side = sideOf(tan)
      const mid = p0.clone().lerp(p1, 0.5)
      const len = Math.max(0.3, p0.distanceTo(p1) * 1.01)
      const color = i % 2 === 0 ? '#ff3d5a' : '#f7f3ea'
      ;[-1, 1].forEach((sign) => {
        const curb = new T.Mesh(
          new T.BoxGeometry(0.5, 0.26, len),
          new T.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.06 })
        )
        curb.position.copy(mid).addScaledVector(side, sign * (hw + 0.3))
        curb.position.y += 0.14
        curb.lookAt(mid.clone().add(tan))
        curb.castShadow = true
        curb.receiveShadow = true
        group.add(curb)
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
      new T.MeshStandardMaterial({ color: '#249a4e', roughness: 1 })
    )
    far.rotation.x = -Math.PI / 2
    far.position.y = -0.25
    far.receiveShadow = true
    group.add(far)

    return group
  }

  function makeSkyDome() {
    const T = ensureThree()
    const c = document.createElement('canvas')
    c.width = 8
    c.height = 256
    const g = c.getContext('2d')
    const grd = g.createLinearGradient(0, 0, 0, 256)
    grd.addColorStop(0, '#0d4fa8')
    grd.addColorStop(0.45, '#5eb7ff')
    grd.addColorStop(0.62, '#c8e9ff')
    grd.addColorStop(0.78, '#ffe7b0')
    grd.addColorStop(1, '#8fd36a')
    g.fillStyle = grd
    g.fillRect(0, 0, 8, 256)
    const tex = new T.CanvasTexture(c)
    tex.colorSpace = T.SRGBColorSpace
    const mesh = new T.Mesh(
      new T.SphereGeometry(380, 32, 20),
      new T.MeshBasicMaterial({ map: tex, side: T.BackSide, depthWrite: false })
    )
    return mesh
  }

  function makeClouds() {
    const T = ensureThree()
    const g = new T.Group()
    const mat = new T.MeshStandardMaterial({
      color: '#ffffff', roughness: 1, metalness: 0, transparent: true, opacity: 0.92
    })
    for (let i = 0; i < 14; i++) {
      const cloud = new T.Group()
      const a = (i / 14) * Math.PI * 2
      const r = 90 + (i % 3) * 18
      ;[0, 0.9, -0.85, 0.4].forEach((ox, k) => {
        const p = new T.Mesh(new T.SphereGeometry(3.2 + (k % 3), 10, 8), mat)
        p.position.set(ox * 4.5, (k % 2) * 1.2, (k - 1) * 1.5)
        cloud.add(p)
      })
      cloud.position.set(Math.cos(a) * r, 28 + (i % 4) * 3, Math.sin(a) * r)
      cloud.scale.setScalar(1.2 + (i % 3) * 0.35)
      g.add(cloud)
    }
    return g
  }

  function makeSun() {
    const T = ensureThree()
    const g = new T.Group()
    g.add(new T.Mesh(
      new T.SphereGeometry(7, 24, 16),
      new T.MeshBasicMaterial({ color: '#fff6c8' })
    ))
    g.add(new T.Mesh(
      new T.SphereGeometry(16, 24, 16),
      new T.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.28 })
    ))
    g.position.set(70, 55, -100)
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
    scene.fog = new T.FogExp2('#9fd6ff', 0.012)

    camera = new T.PerspectiveCamera(58, 1, 0.15, 450)

    scene.add(new T.HemisphereLight('#cfe9ff', '#4a9a55', 0.7))
    scene.add(new T.AmbientLight('#ffffff', 0.35))
    sun = new T.DirectionalLight('#fff1d0', 1.65)
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
    const fill = new T.DirectionalLight('#a8d4ff', 0.35)
    fill.position.set(-30, 20, -20)
    scene.add(fill)

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
    renderer.setClearColor('#6eb8ff', 1)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = T.PCFSoftShadowMap
    if (T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace
    if (T.ACESFilmicToneMapping) {
      renderer.toneMapping = T.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.2
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
    if (chip) chip.textContent = state.finished ? 'Finish!' : (gyroOn ? 'Gyro on' : '3D · Tilt / drag')
    if (model) {
      model.textContent = state.lastWord
        ? `You drove over “${capitalize(state.lastWord)}” — keep racing!`
        : 'Tilt the iPad to steer. Your kart zooms by itself. Drive over glowing words to hear them!'
    }
    if (msg && !state.finished) msg.textContent = state.combo > 1 ? `Word combo ×${state.combo}!` : ''
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
    if (w.hit || state.finished) return
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
    speakWord(w.text).then(() => {
      if (typeof announceLoot === 'function') return announceLoot(loot)
    })
    if (state.collected >= state.goal) finishRace()
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

    if (!state.finished) {
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
    const spin = state.speed * 90
    ;(state.kart.userData.wheels || []).forEach((w) => { w.rotation.x += spin * dt })

    state.rivals.forEach((r, i) => {
      const rt = (state.t + r.offset + Math.sin(state.time * 0.45 + r.bob) * 0.008) % 1
      const lane = r.lane + Math.sin(state.time * 0.55 + r.bob) * 0.55
      setKartPose(r.mesh, rt, lane, Math.sin(state.time + r.bob) * 0.12)
    })

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
      lastWord: '',
      camPos: new T.Vector3(0, 5, 10),
      camLook: new T.Vector3(0, 1, 0)
    }
    document.getElementById('raceNext')?.classList.add('hidden')
    const msg = document.getElementById('raceMessage')
    if (msg) msg.textContent = ''
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
})()
