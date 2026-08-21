/* Word Kart — real WebGL/Three.js sight-word racer */
(function () {
  const GOAL = 12
  const ROAD_HALF = 4.2
  const LANE_X = [-2.4, 0, 2.4]

  let canvas, wrap
  let renderer, scene, camera, sun
  let running = false
  let raf = 0
  let lastT = 0
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
  function hsl(h, s, l) { return `hsl(${h % 360},${s}%,${l}%)` }

  function ensureThree() {
    if (typeof THREE === 'undefined') throw new Error('Three.js failed to load')
    return THREE
  }

  function makeSky() {
    const T = ensureThree()
    const geo = new T.SphereGeometry(420, 32, 16)
    const mat = new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new T.Color('#1a6fd4') },
        mid: { value: new T.Color('#7ec8ff') },
        bot: { value: new T.Color('#ffe6a8') }
      },
      vertexShader: `
        varying vec3 vW;
        void main(){
          vec4 p = modelMatrix * vec4(position,1.0);
          vW = normalize(p.xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        varying vec3 vW;
        void main(){
          float h = clamp(vW.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 c = mix(bot, mid, smoothstep(0.35, 0.55, h));
          c = mix(c, top, smoothstep(0.55, 0.95, h));
          gl_FragColor = vec4(c, 1.0);
        }`
    })
    return new T.Mesh(geo, mat)
  }

  function makeSunMesh() {
    const T = ensureThree()
    const g = new T.Group()
    const core = new T.Mesh(
      new T.SphereGeometry(6, 24, 16),
      new T.MeshBasicMaterial({ color: '#fff4c2' })
    )
    const glow = new T.Mesh(
      new T.SphereGeometry(14, 24, 16),
      new T.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.35 })
    )
    g.add(core, glow)
    g.position.set(90, 70, -120)
    return g
  }

  function buildTrackCurve() {
    const T = ensureThree()
    const pts = []
    const n = 48
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const r = 55 + Math.sin(a * 2.2) * 10 + Math.cos(a * 3.1) * 6
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const y = Math.sin(a * 3) * 2.2 + Math.cos(a * 2) * 1.2
      pts.push(new T.Vector3(x, y, z))
    }
    return new T.CatmullRomCurve3(pts, true, 'catmullrom', 0.35)
  }

  function buildRoadMesh(curve) {
    const T = ensureThree()
    const frames = curve.computeFrenetFrames(200, true)
    const segs = 200
    const hw = ROAD_HALF
    const positions = []
    const uvs = []
    const indices = []
    const rumbleL = []
    const rumbleR = []
    const grassL = []
    const grassR = []

    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const p = curve.getPointAt(t)
      const tangent = frames.tangents[i] || curve.getTangentAt(t)
      const normal = frames.normals[i] || new T.Vector3(0, 1, 0)
      const binormal = frames.binormals[i] || new T.Vector3().crossVectors(tangent, normal).normalize()
      // keep road mostly upright
      const up = new T.Vector3(0, 1, 0)
      const side = new T.Vector3().crossVectors(up, tangent).normalize()
      if (side.lengthSq() < 0.01) side.set(1, 0, 0)
      const roadUp = new T.Vector3().crossVectors(tangent, side).normalize()

      const left = p.clone().addScaledVector(side, -hw).addScaledVector(roadUp, 0.05)
      const right = p.clone().addScaledVector(side, hw).addScaledVector(roadUp, 0.05)
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z)
      uvs.push(0, t * 40, 1, t * 40)

      const rl = p.clone().addScaledVector(side, -hw - 0.55).addScaledVector(roadUp, 0.06)
      const rr = p.clone().addScaledVector(side, hw + 0.55).addScaledVector(roadUp, 0.06)
      rumbleL.push(left.x, left.y + 0.01, left.z, rl.x, rl.y, rl.z)
      rumbleR.push(right.x, right.y + 0.01, right.z, rr.x, rr.y, rr.z)

      const gl = p.clone().addScaledVector(side, -hw - 12)
      const gr = p.clone().addScaledVector(side, hw + 12)
      grassL.push(rl.x, 0.02, rl.z, gl.x, 0.02, gl.z)
      grassR.push(rr.x, 0.02, rr.z, gr.x, 0.02, gr.z)

      if (i < segs) {
        const a = i * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }

    function stripMesh(posArr, color, yLift) {
      const geo = new T.BufferGeometry()
      const pos = new Float32Array(posArr)
      // rebuild as triangle strip pairs matching indices pattern
      const verts = []
      const cols = []
      const c = new T.Color(color)
      for (let i = 0; i < segs; i++) {
        const i0 = i * 6
        const ax = pos[i0], ay = pos[i0 + 1] + yLift, az = pos[i0 + 2]
        const bx = pos[i0 + 3], by = pos[i0 + 4] + yLift, bz = pos[i0 + 5]
        const cx = pos[i0 + 6], cy = pos[i0 + 7] + yLift, cz = pos[i0 + 8]
        const dx = pos[i0 + 9], dy = pos[i0 + 10] + yLift, dz = pos[i0 + 11]
        verts.push(ax, ay, az, bx, by, bz, cx, cy, cz, bx, by, bz, dx, dy, dz, cx, cy, cz)
        for (let k = 0; k < 6; k++) cols.push(c.r, c.g, c.b)
      }
      geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3))
      geo.setAttribute('color', new T.Float32BufferAttribute(cols, 3))
      geo.computeVertexNormals()
      return new T.Mesh(geo, new T.MeshStandardMaterial({
        vertexColors: true, roughness: 0.92, metalness: 0.02, flatShading: false
      }))
    }

    const roadGeo = new T.BufferGeometry()
    roadGeo.setAttribute('position', new T.Float32BufferAttribute(positions, 3))
    roadGeo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2))
    roadGeo.setIndex(indices)
    roadGeo.computeVertexNormals()

    const roadTex = makeRoadTexture()
    const roadMat = new T.MeshStandardMaterial({
      map: roadTex,
      roughness: 0.78,
      metalness: 0.08,
      color: '#d0d4de'
    })
    const road = new T.Mesh(roadGeo, roadMat)
    road.receiveShadow = true
    road.castShadow = false

    // striped rumble
    const rumbleGroup = new T.Group()
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs
      const t1 = (i + 1) / segs
      const p0 = curve.getPointAt(t0)
      const p1 = curve.getPointAt(t1)
      const tan = curve.getTangentAt(t0)
      const side = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), tan).normalize()
      const mid = p0.clone().lerp(p1, 0.5)
      const len = p0.distanceTo(p1)
      const color = i % 2 === 0 ? '#ff3b5c' : '#f7f3ea'
      ;[-1, 1].forEach((sign) => {
        const m = new T.Mesh(
          new T.BoxGeometry(0.7, 0.12, Math.max(0.4, len * 0.98)),
          new T.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 })
        )
        m.position.copy(mid).addScaledVector(side, sign * (hw + 0.35))
        m.position.y += 0.08
        m.lookAt(mid.clone().add(tan))
        m.castShadow = true
        rumbleGroup.add(m)
      })
    }

    // soft grass skirts via large ground
    const ground = new T.Mesh(
      new T.CircleGeometry(140, 64),
      new T.MeshStandardMaterial({ color: '#3ecf6a', roughness: 0.95, metalness: 0 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.2
    ground.receiveShadow = true

    const darkGround = new T.Mesh(
      new T.CircleGeometry(220, 48),
      new T.MeshStandardMaterial({ color: '#2aa856', roughness: 1, metalness: 0 })
    )
    darkGround.rotation.x = -Math.PI / 2
    darkGround.position.y = -0.35
    darkGround.receiveShadow = true

    const group = new T.Group()
    group.add(darkGround, ground, road, rumbleGroup)
    return { group, road }
  }

  function makeRoadTexture() {
    const T = ensureThree()
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 256
    const g = c.getContext('2d')
    g.fillStyle = '#4a5166'
    g.fillRect(0, 0, 256, 256)
    // asphalt noise
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2)
    }
    // center dashes
    g.fillStyle = '#fff6c8'
    for (let y = 0; y < 256; y += 32) g.fillRect(122, y, 12, 18)
    // edge lines
    g.fillStyle = '#ffe08a'
    g.fillRect(8, 0, 6, 256)
    g.fillRect(242, 0, 6, 256)
    const tex = new T.CanvasTexture(c)
    tex.wrapS = T.RepeatWrapping
    tex.wrapT = T.RepeatWrapping
    tex.anisotropy = 8
    return tex
  }

  function makePalm(x, y, z, scale) {
    const T = ensureThree()
    const g = new T.Group()
    const trunk = new T.Mesh(
      new T.CylinderGeometry(0.18 * scale, 0.28 * scale, 3.2 * scale, 8),
      new T.MeshStandardMaterial({ color: '#8a5a2b', roughness: 0.9 })
    )
    trunk.position.y = 1.6 * scale
    trunk.castShadow = true
    g.add(trunk)
    const leafMat = new T.MeshStandardMaterial({ color: '#2ecc71', roughness: 0.7, side: T.DoubleSide })
    for (let i = 0; i < 6; i++) {
      const leaf = new T.Mesh(new T.SphereGeometry(0.9 * scale, 8, 6, 0, Math.PI), leafMat)
      leaf.scale.set(1.6, 0.25, 0.7)
      leaf.position.set(0, 3.1 * scale, 0)
      leaf.rotation.y = (i / 6) * Math.PI * 2
      leaf.rotation.z = 0.55
      leaf.castShadow = true
      g.add(leaf)
    }
    g.position.set(x, y, z)
    return g
  }

  function makeRock(x, y, z, scale) {
    const T = ensureThree()
    const m = new T.Mesh(
      new T.DodecahedronGeometry(0.7 * scale, 0),
      new T.MeshStandardMaterial({ color: '#8e8378', roughness: 0.95, flatShading: true })
    )
    m.position.set(x, y + 0.35 * scale, z)
    m.rotation.set(rand(0, 1), rand(0, 6), rand(0, 1))
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  function makeKart(color, withPip) {
    const T = ensureThree()
    const g = new T.Group()
    const bodyMat = new T.MeshStandardMaterial({
      color, roughness: 0.35, metalness: 0.45, envMapIntensity: 1
    })
    const body = new T.Mesh(new T.BoxGeometry(1.35, 0.42, 2.1), bodyMat)
    body.position.y = 0.45
    body.castShadow = true
    g.add(body)

    const nose = new T.Mesh(new T.BoxGeometry(1.1, 0.28, 0.7), bodyMat)
    nose.position.set(0, 0.4, -1.15)
    nose.castShadow = true
    g.add(nose)

    const cockpit = new T.Mesh(
      new T.BoxGeometry(0.85, 0.35, 0.7),
      new T.MeshStandardMaterial({ color: '#1e3a5f', roughness: 0.25, metalness: 0.6, transparent: true, opacity: 0.85 })
    )
    cockpit.position.set(0, 0.72, 0.1)
    cockpit.castShadow = true
    g.add(cockpit)

    const spoiler = new T.Mesh(new T.BoxGeometry(1.5, 0.1, 0.35), bodyMat)
    spoiler.position.set(0, 0.85, 0.95)
    spoiler.castShadow = true
    g.add(spoiler)
    ;[-0.55, 0.55].forEach((x) => {
      const post = new T.Mesh(new T.BoxGeometry(0.08, 0.35, 0.08), bodyMat)
      post.position.set(x, 0.7, 0.85)
      g.add(post)
    })

    const wheelMat = new T.MeshStandardMaterial({ color: '#1a1a22', roughness: 0.7, metalness: 0.2 })
    const wheelGeo = new T.CylinderGeometry(0.32, 0.32, 0.28, 14)
    ;[[-0.7, 0.32, 0.7], [0.7, 0.32, 0.7], [-0.7, 0.32, -0.75], [0.7, 0.32, -0.75]].forEach(([x, y, z]) => {
      const w = new T.Mesh(wheelGeo, wheelMat)
      w.rotation.z = Math.PI / 2
      w.position.set(x, y, z)
      w.castShadow = true
      g.add(w)
    })

    const badge = new T.Mesh(
      new T.SphereGeometry(0.14, 12, 10),
      new T.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffaa00', emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.3 })
    )
    badge.position.set(0, 0.55, -0.2)
    g.add(badge)

    if (withPip) {
      const pip = makePip()
      pip.position.set(0.15, 0.95, 0.05)
      g.add(pip)
    }

    g.userData.wheels = g.children.filter((c) => c.geometry && c.geometry.type === 'CylinderGeometry')
    return g
  }

  function makePip() {
    const T = ensureThree()
    const g = new T.Group()
    const body = new T.Mesh(
      new T.SphereGeometry(0.22, 14, 12),
      new T.MeshStandardMaterial({ color: '#2fbf5c', roughness: 0.55 })
    )
    body.castShadow = true
    g.add(body)
    const head = new T.Mesh(
      new T.SphereGeometry(0.16, 12, 10),
      new T.MeshStandardMaterial({ color: '#3ddc72', roughness: 0.5 })
    )
    head.position.y = 0.22
    g.add(head)
    const beak = new T.Mesh(
      new T.ConeGeometry(0.06, 0.14, 8),
      new T.MeshStandardMaterial({ color: '#ff9f1c', roughness: 0.4 })
    )
    beak.rotation.x = Math.PI / 2
    beak.position.set(0, 0.2, -0.16)
    g.add(beak)
    const hat = new T.Mesh(
      new T.CylinderGeometry(0.12, 0.14, 0.08, 10),
      new T.MeshStandardMaterial({ color: '#1e1a16', roughness: 0.8 })
    )
    hat.position.y = 0.36
    g.add(hat)
    return g
  }

  function makeWordTexture(text, hue) {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 192
    const g = c.getContext('2d')
    g.clearRect(0, 0, 512, 192)
    // glow
    const grd = g.createRadialGradient(256, 96, 20, 256, 96, 180)
    grd.addColorStop(0, `hsla(${hue},95%,70%,0.9)`)
    grd.addColorStop(1, `hsla(${hue},95%,60%,0)`)
    g.fillStyle = grd
    g.fillRect(0, 0, 512, 192)
    // pill
    roundRect(g, 36, 28, 440, 136, 48)
    g.fillStyle = `hsl(${hue},88%,58%)`
    g.fill()
    g.lineWidth = 10
    g.strokeStyle = '#ffffff'
    g.stroke()
    // text
    g.fillStyle = '#101828'
    g.font = '800 84px "Baloo 2", Nunito, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(capitalize(text), 256, 100)
    const T = ensureThree()
    const tex = new T.CanvasTexture(c)
    tex.anisotropy = 4
    tex.needsUpdate = true
    return tex
  }

  function roundRect(g, x, y, w, h, r) {
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
    const mat = new T.MeshStandardMaterial({
      map: tex,
      transparent: true,
      roughness: 0.45,
      metalness: 0.15,
      emissive: new T.Color().setHSL((hue % 360) / 360, 0.7, 0.25),
      emissiveIntensity: 0.55,
      side: T.DoubleSide
    })
    const mesh = new T.Mesh(new T.PlaneGeometry(2.8, 1.05), mat)
    mesh.castShadow = true
    const glow = new T.Mesh(
      new T.CircleGeometry(1.5, 24),
      new T.MeshBasicMaterial({
        color: new T.Color().setHSL((hue % 360) / 360, 0.9, 0.55),
        transparent: true,
        opacity: 0.28,
        depthWrite: false
      })
    )
    glow.rotation.x = -Math.PI / 2
    glow.position.y = -0.02
    const group = new T.Group()
    group.add(glow, mesh)
    mesh.rotation.x = -Math.PI / 2.4
    return group
  }

  function placeOnTrack(curve, t, lane, yLift) {
    const T = ensureThree()
    const p = curve.getPointAt(t % 1)
    const tan = curve.getTangentAt(t % 1)
    const side = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), tan).normalize()
    if (side.lengthSq() < 0.01) side.set(1, 0, 0)
    const pos = p.clone().addScaledVector(side, lane).add(new T.Vector3(0, yLift || 0.35, 0))
    return { pos, tan, side }
  }

  function createScene() {
    const T = ensureThree()
    scene = new T.Scene()
    scene.fog = new T.Fog('#8fd3ff', 45, 160)

    camera = new T.PerspectiveCamera(55, 1, 0.1, 500)
    camera.position.set(0, 6, 12)

    const hemi = new T.HemisphereLight('#b8e4ff', '#5aa85a', 0.85)
    scene.add(hemi)
    sun = new T.DirectionalLight('#fff2d0', 1.55)
    sun.position.set(40, 60, 20)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 180
    sun.shadow.camera.left = -50
    sun.shadow.camera.right = 50
    sun.shadow.camera.top = 50
    sun.shadow.camera.bottom = -50
    sun.shadow.bias = -0.00025
    scene.add(sun)
    scene.add(new T.AmbientLight('#ffffff', 0.28))

    scene.add(makeSky())
    scene.add(makeSunMesh())

    const curve = buildTrackCurve()
    const { group: trackGroup } = buildRoadMesh(curve)
    scene.add(trackGroup)

    // scenery
    const scenery = new T.Group()
    for (let i = 0; i < 70; i++) {
      const t = Math.random()
      const sideSign = Math.random() < 0.5 ? -1 : 1
      const lane = sideSign * rand(7.5, 16)
      const { pos } = placeOnTrack(curve, t, lane, 0)
      if (Math.random() < 0.65) scenery.add(makePalm(pos.x, 0, pos.z, rand(0.85, 1.4)))
      else scenery.add(makeRock(pos.x, 0, pos.z, rand(0.7, 1.5)))
    }
    scene.add(scenery)

    // words
    const words = (window.SIGHT_WORDS_G1 || ['the', 'and', 'you']).slice()
    const pack = words.slice().sort(() => Math.random() - 0.5)
    const wordObjs = []
    let wi = 0
    for (let i = 0; i < 90; i++) {
      const t = (0.04 + i * 0.0105) % 1
      const lane = LANE_X[wi % 3]
      const text = pack[wi % pack.length]
      const hue = (wi * 47) % 360
      wi++
      const pad = makeWordPad(text, hue)
      const { pos, tan } = placeOnTrack(curve, t, lane, 0.55)
      pad.position.copy(pos)
      pad.lookAt(pos.clone().add(tan))
      pad.rotateY(Math.PI)
      scene.add(pad)
      wordObjs.push({ mesh: pad, text, t, lane, hue, hit: false, pop: 0 })
    }

    const kart = makeKart('#ff8c42', true)
    scene.add(kart)

    const rivals = [0, 1, 2].map((i) => {
      const k = makeKart(['#ff6b9d', '#6bcbff', '#b8f25a'][i], false)
      scene.add(k)
      return { mesh: k, t: 0.12 + i * 0.08, lane: LANE_X[(i + 1) % 3], bob: i * 1.7 }
    })

    // collect spark pool
    const sparks = []
    const sparkGeo = new T.SphereGeometry(0.12, 8, 8)
    for (let i = 0; i < 40; i++) {
      const s = new T.Mesh(sparkGeo, new T.MeshBasicMaterial({ color: '#ffd166' }))
      s.visible = false
      scene.add(s)
      sparks.push({ mesh: s, life: 0, v: new T.Vector3() })
    }

    return { curve, kart, rivals, wordObjs, sparks, trackGroup }
  }

  function initRenderer() {
    const T = ensureThree()
    canvas = document.getElementById('raceCanvas')
    wrap = document.getElementById('raceArena')
    if (!canvas || !wrap) return false
    if (renderer) {
      renderer.dispose()
      renderer = null
    }
    renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = T.PCFSoftShadowMap
    renderer.outputColorSpace = T.SRGBColorSpace
    if ('toneMapping' in renderer) {
      renderer.toneMapping = T.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.15
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
      o1.type = 'sawtooth'
      o2.type = 'triangle'
      o1.frequency.value = 55
      o2.frequency.value = 82
      f.type = 'lowpass'
      f.frequency.value = 420
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
    engineNodes.f.frequency.setTargetAtTime(280 + t * 900 + state.boost * 12, engineNodes.ac.currentTime, 0.05)
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
    let used = 0
    state.sparks.forEach((s) => {
      if (used > 16) return
      if (s.life > 0) return
      s.life = rand(0.4, 0.9)
      s.mesh.visible = true
      s.mesh.position.copy(pos)
      s.mesh.material.color.setHSL((hue % 360) / 360, 0.9, 0.6)
      s.v.set(rand(-4, 4), rand(3, 8), rand(-4, 4))
      used++
    })
  }

  function onWordHit(w) {
    if (w.hit || state.finished) return
    w.hit = true
    w.pop = 1
    state.collected += 1
    state.combo += 1
    state.boost = Math.min(1, state.boost + 0.35 + state.combo * 0.04)
    state.lastWord = w.text
    state.maxSpeed = Math.min(0.085, 0.055 + state.collected * 0.002)
    w.mesh.visible = false
    burstSparks(w.mesh.position, w.hue)
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
    state.speed *= 0.35
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
    const { pos, tan } = placeOnTrack(state.curve, t, lane, 0.2)
    mesh.position.copy(pos)
    mesh.lookAt(pos.clone().add(tan))
    if (lean) mesh.rotateZ(lean)
  }

  function step(dt) {
    if (!state || !renderer) return
    state.time += dt
    const T = ensureThree()

    if (!state.finished) {
      const target = state.maxSpeed * (1 + state.boost * 0.85)
      state.speed = lerp(state.speed, target, 1 - Math.pow(0.08, dt * 60))
      state.boost = Math.max(0, state.boost - dt * 0.35)

      let input = gyroOn ? (state.gyroSteer || 0) : 0
      if (!gyroOn) input = clamp(touchSteer + keySteer, -1, 1)
      state.steer = lerp(state.steer, input, 1 - Math.pow(0.14, dt * 60))
      state.laneOffset += state.steer * dt * 7.5
      state.laneOffset = clamp(state.laneOffset, -ROAD_HALF + 0.9, ROAD_HALF - 0.9)

      state.t = (state.t + state.speed * dt) % 1
    } else {
      state.speed = lerp(state.speed, 0.01, 0.02)
      state.t = (state.t + state.speed * dt) % 1
      state.steer = lerp(state.steer, 0, 0.08)
    }

    setKartPose(state.kart, state.t, state.laneOffset, -state.steer * 0.35)
    // wheel spin
    const spin = state.speed * 80
    state.kart.traverse((c) => {
      if (c.geometry && c.geometry.type === 'CylinderGeometry') c.rotation.x += spin * dt
    })

    state.rivals.forEach((r, i) => {
      r.t = (state.t + 0.08 + i * 0.07 + Math.sin(state.time * 0.5 + r.bob) * 0.01) % 1
      const lane = r.lane + Math.sin(state.time * 0.6 + r.bob) * 0.5
      setKartPose(r.mesh, r.t, lane, Math.sin(state.time + r.bob) * 0.15)
    })

    // float word pads
    state.wordObjs.forEach((w) => {
      if (w.hit) return
      w.mesh.position.y = 0.55 + Math.sin(state.time * 3 + w.t * 40) * 0.12
      w.mesh.children[1] && (w.mesh.children[1].rotation.z = Math.sin(state.time * 2 + w.hue) * 0.05)
    })

    // collisions — nearest words by track param
    state.wordObjs.forEach((w) => {
      if (w.hit) return
      let dT = Math.abs(w.t - state.t)
      dT = Math.min(dT, 1 - dT)
      if (dT > 0.012) return
      if (Math.abs(w.lane - state.laneOffset) < 1.15) onWordHit(w)
    })

    // sparks
    state.sparks.forEach((s) => {
      if (s.life <= 0) { s.mesh.visible = false; return }
      s.life -= dt
      s.v.y -= 12 * dt
      s.mesh.position.addScaledVector(s.v, dt)
      s.mesh.visible = s.life > 0
    })

    // chase camera
    const { pos, tan, side } = placeOnTrack(state.curve, state.t, state.laneOffset, 0)
    const camPos = pos.clone()
      .addScaledVector(tan, -7.5)
      .add(new T.Vector3(0, 3.6, 0))
      .addScaledVector(side, state.steer * -0.8)
    state.camPos.lerp(camPos, 1 - Math.pow(0.08, dt * 60))
    camera.position.copy(state.camPos)
    const look = pos.clone().addScaledVector(tan, 8).add(new T.Vector3(0, 1.2, 0))
    state.camLook.lerp(look, 1 - Math.pow(0.12, dt * 60))
    camera.lookAt(state.camLook)

    // sun follows a bit with camera for consistent lighting feel
    sun.position.set(camera.position.x + 30, 55, camera.position.z + 20)

    syncEngine()
    renderer.render(scene, camera)
    if (Math.floor(state.time * 2) !== Math.floor((state.time - dt) * 2)) updateHud()
  }

  function loop() {
    if (!running) return
    const dt = clamp(clock.getDelta(), 0, 0.05)
    step(dt)
    raf = requestAnimationFrame(loop)
  }

  function onOrient(e) {
    if (!running || !state) return
    let g = e.gamma
    let b = e.beta
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
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
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
    const setFromClientX = (x) => {
      const r = arena.getBoundingClientRect()
      touchSteer = clamp(((x - r.left) / r.width - 0.5) * 2.4, -1, 1)
    }
    arena.addEventListener('pointerdown', (e) => {
      down = true
      arena.setPointerCapture?.(e.pointerId)
      setFromClientX(e.clientX)
    })
    arena.addEventListener('pointermove', (e) => { if (down) setFromClientX(e.clientX) })
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
      if (obj.geometry) obj.geometry.dispose?.()
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.())
        else {
          obj.material.map?.dispose?.()
          obj.material.dispose?.()
        }
      }
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
    if (renderer) {
      // keep renderer for reuse; clear canvas
      try {
        const gl = renderer.getContext()
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      } catch (e) {}
    }
    state = null
  }

  function startRaceGame() {
    try {
      ensureThree()
    } catch (e) {
      console.error(e)
      const msg = document.getElementById('raceMessage')
      if (msg) msg.textContent = '3D engine failed to load. Check your connection and try again.'
      return
    }
    stopRace()
    if (!initRenderer()) return
    const built = createScene()
    const T = ensureThree()
    state = {
      ...built,
      t: 0.02,
      speed: 0,
      maxSpeed: 0.055,
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
      camPos: new T.Vector3(0, 6, 12),
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
