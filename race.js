/* Word Kart — gyro-steer sight-word racer for iPad Reading Trainer */
(function () {
  const GOAL = 12
  const SEG_LEN = 200
  const ROAD_W = 2100
  const CAM_H = 1100
  const DRAW_DIST = 180
  const FOV = 100

  let canvas, ctx
  let running = false
  let raf = 0
  let lastT = 0
  let state = null
  let gyroOn = false
  let gyroPerm = false
  let touchSteer = 0
  let keySteer = 0
  let engineNodes = null
  let speakQueue = Promise.resolve()

  const COLORS = {
    skyTop: '#1a4a8a',
    skyMid: '#5eb8ff',
    skyBot: '#ffe8a3',
    grassA: '#3ecf6a',
    grassB: '#2fb85a',
    rumbleA: '#ff4d6d',
    rumbleB: '#fff8f0',
    roadA: '#3a3f55',
    roadB: '#484e68',
    line: '#fff6c8',
    sand: '#e8c078'
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }
  function lerp(a, b, t) { return a + (b - a) * t }
  function rand(a, b) { return a + Math.random() * (b - a) }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0] }
  function capitalize(s) { return (s || '').charAt(0).toUpperCase() + (s || '').slice(1) }

  function buildTrack() {
    const segs = []
    let curve = 0
    let y = 0
    for (let i = 0; i < 900; i++) {
      if (i % 40 === 0) curve = rand(-4.2, 4.2)
      if (i % 55 === 0) y += rand(-180, 180)
      y = lerp(y, 0, 0.012)
      segs.push({
        index: i,
        p1: { world: { z: i * SEG_LEN, y }, screen: {}, scale: 0 },
        p2: { world: { z: (i + 1) * SEG_LEN, y: 0 }, screen: {}, scale: 0 },
        curve,
        color: (i / 3 | 0) % 2 ? 'light' : 'dark',
        sprites: [],
        words: []
      })
    }
    // close height chain
    for (let i = 0; i < segs.length - 1; i++) {
      segs[i].p2.world.y = segs[i + 1].p1.world.y
    }
    return segs
  }

  function placeContent(segs, words) {
    const used = new Set()
    let wi = 0
    const pack = words.slice().sort(() => Math.random() - 0.5)
    for (let i = 30; i < segs.length - 40; i += 9 + ((Math.random() * 5) | 0)) {
      const lane = [-0.55, 0, 0.55][(Math.random() * 3) | 0]
      // scenery
      if (Math.random() < 0.7) {
        segs[i].sprites.push({
          kind: Math.random() < 0.55 ? 'palm' : 'rock',
          offset: (Math.random() < 0.5 ? -1 : 1) * rand(1.15, 1.85),
          scale: rand(0.9, 1.35)
        })
      }
      // sight word pads
      if (wi < pack.length && i % 2 === 0) {
        const w = pack[wi++ % pack.length]
        if (!used.has(w + i)) {
          used.add(w + i)
          segs[i].words.push({
            text: w,
            offset: lane,
            hit: false,
            pop: 0,
            hue: (wi * 47) % 360
          })
        }
      }
    }
  }

  function project(p, camX, camY, camZ, W, H) {
    const dz = p.world.z - camZ
    if (dz <= 0) { p.screen = { x: 0, y: 0, w: 0 }; p.scale = 0; return }
    p.scale = FOV / dz
    p.screen.x = W / 2 + (p.world.x - camX) * p.scale * W / 2
    p.screen.y = H / 2 - (p.world.y - camY) * p.scale * W / 2
    p.screen.w = p.scale * ROAD_W * W / 2
  }

  function ensureCanvas() {
    canvas = document.getElementById('raceCanvas')
    if (!canvas) return false
    ctx = canvas.getContext('2d')
    sizeCanvas()
    return true
  }

  function sizeCanvas() {
    if (!canvas) return
    const wrap = document.getElementById('raceArena')
    const r = wrap ? wrap.getBoundingClientRect() : { width: 800, height: 520 }
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.max(320, Math.floor(r.width))
    const h = Math.max(280, Math.floor(r.height))
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function freshState() {
    const words = (window.SIGHT_WORDS_G1 || []).slice()
    const segs = buildTrack()
    placeContent(segs, words)
    return {
      segs,
      pos: 0,
      speed: 0,
      maxSpeed: 280,
      playerX: 0,
      steer: 0,
      collected: 0,
      goal: GOAL,
      combo: 0,
      boost: 0,
      time: 0,
      finished: false,
      flash: 0,
      lastWord: '',
      rivals: [
        { z: 800, x: -0.35, color: '#ff6b9d', bob: 0 },
        { z: 1400, x: 0.4, color: '#6bcbff', bob: 1.2 },
        { z: 2200, x: -0.15, color: '#b8f25a', bob: 2.4 }
      ],
      particles: [],
      tiltHint: true,
      wordBag: words.slice()
    }
  }

  function updateHud() {
    const hud = document.getElementById('raceHud')
    const chip = document.getElementById('raceChip')
    const model = document.getElementById('raceModel')
    const msg = document.getElementById('raceMessage')
    if (!state) return
    if (hud) hud.textContent = `✨ ${state.collected} / ${state.goal}`
    if (chip) chip.textContent = state.finished ? 'Finish!' : (gyroOn ? 'Gyro on' : 'Tilt / drag')
    if (model) {
      model.textContent = state.lastWord
        ? `You drove over “${capitalize(state.lastWord)}” — keep racing!`
        : 'Tilt the iPad to steer. Your kart zooms by itself. Drive over glowing words to hear them!'
    }
    if (msg && !state.finished) {
      msg.textContent = state.combo > 1 ? `Word combo ×${state.combo}!` : ''
    }
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
      o1.connect(f)
      o2.connect(f)
      f.connect(g)
      g.connect(out)
      o1.start()
      o2.start()
      g.gain.exponentialRampToValueAtTime(0.035, ac.currentTime + 0.4)
      engineNodes = { o1, o2, g, f, ac }
    } catch (e) { engineNodes = null }
  }

  function stopEngineHum() {
    if (!engineNodes) return
    try {
      const { o1, o2, g, ac } = engineNodes
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.15)
      setTimeout(() => {
        try { o1.stop(); o2.stop() } catch (e) {}
      }, 200)
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
    if (typeof playSfx === 'function') {
      playSfx('ok')
      playSfx('whoosh')
    }
  }

  function speakWord(word) {
    if (typeof speak !== 'function') return Promise.resolve()
    speakQueue = speakQueue.then(() => speak(capitalize(word), { rate: 0.88, interrupt: true })).catch(() => {})
    return speakQueue
  }

  function awardWord(word) {
    let loot = null
    if (typeof awardSliceStar === 'function') {
      loot = awardSliceStar(word)
    } else if (typeof profile !== 'undefined') {
      profile.stars = (profile.stars || 0) + 1
      profile.reads = (profile.reads || 0) + 1
      if (typeof addPoints === 'function') addPoints(1)
      if (typeof saveProfile === 'function') saveProfile()
      if (typeof scoreHud === 'function') scoreHud()
    }
    if (typeof celebrate === 'function') celebrate()
    return loot
  }

  function onWordHit(w) {
    if (w.hit || state.finished) return
    w.hit = true
    w.pop = 1
    state.collected += 1
    state.combo += 1
    state.boost = Math.min(90, state.boost + 28 + state.combo * 4)
    state.flash = 0.55
    state.lastWord = w.text
    state.maxSpeed = Math.min(360, 280 + state.collected * 4)
    for (let i = 0; i < 18; i++) {
      state.particles.push({
        x: rand(-40, 40),
        y: rand(-20, 10),
        vx: rand(-120, 120),
        vy: rand(-220, -40),
        life: rand(0.4, 0.9),
        c: `hsl(${w.hue}, 90%, 60%)`
      })
    }
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
    state.speed *= 0.4
    stopEngineHum()
    const msg = document.getElementById('raceMessage')
    const next = document.getElementById('raceNext')
    if (msg) msg.textContent = `Lap clear! ${state.collected} sight words heard.`
    if (next) {
      next.classList.remove('hidden')
      next.textContent = 'Race again!'
    }
    if (typeof speak === 'function') {
      speak(`Awesome race! You collected ${state.collected} sight words.`, { rate: 0.95 })
    }
    if (typeof spawnConfetti === 'function') spawnConfetti(48)
    updateHud()
  }

  function projectSegment(n, camX, camY, camZ, W, H) {
    const seg = state.segs[n % state.segs.length]
    const baseZ = Math.floor(n / state.segs.length) * state.segs.length * SEG_LEN
    const p1 = {
      world: { x: 0, y: seg.p1.world.y, z: seg.p1.world.z + baseZ },
      screen: {},
      scale: 0
    }
    const p2 = {
      world: { x: 0, y: seg.p2.world.y, z: seg.p2.world.z + baseZ },
      screen: {},
      scale: 0
    }
    project(p1, camX, camY, camZ, W, H)
    project(p2, camX, camY, camZ, W, H)
    return { seg, p1, p2, curve: seg.curve }
  }

  function drawPoly(x1, y1, w1, x2, y2, w2, color) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x1 - w1, y1)
    ctx.lineTo(x1 + w1, y1)
    ctx.lineTo(x2 + w2, y2)
    ctx.lineTo(x2 - w2, y2)
    ctx.closePath()
    ctx.fill()
  }

  function drawSky(W, H, speed) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.55)
    g.addColorStop(0, COLORS.skyTop)
    g.addColorStop(0.55, COLORS.skyMid)
    g.addColorStop(1, COLORS.skyBot)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)

    // sun
    const sx = W * 0.72 + Math.sin(state.time * 0.2) * 8
    const sy = H * 0.16
    const sun = ctx.createRadialGradient(sx, sy, 4, sx, sy, 70)
    sun.addColorStop(0, '#fff8d0')
    sun.addColorStop(0.4, '#ffd166')
    sun.addColorStop(1, 'rgba(255,180,60,0)')
    ctx.fillStyle = sun
    ctx.beginPath()
    ctx.arc(sx, sy, 70, 0, Math.PI * 2)
    ctx.fill()

    // clouds
    for (let i = 0; i < 5; i++) {
      const cx = ((i * 220 + state.time * (12 + i * 3) * (0.2 + speed / 400)) % (W + 200)) - 100
      const cy = 40 + i * 22
      ctx.fillStyle = `rgba(255,255,255,${0.55 + (i % 2) * 0.2})`
      roundCloud(cx, cy, 38 + i * 4)
    }

    // distant hills
    ctx.fillStyle = '#4aa86a'
    ctx.beginPath()
    ctx.moveTo(0, H * 0.52)
    for (let x = 0; x <= W; x += 20) {
      const y = H * 0.48 + Math.sin(x * 0.01 + state.time * 0.15) * 18 + Math.sin(x * 0.03) * 10
      ctx.lineTo(x, y)
    }
    ctx.lineTo(W, H)
    ctx.lineTo(0, H)
    ctx.fill()
  }

  function roundCloud(x, y, r) {
    ctx.beginPath()
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2)
    ctx.arc(x + r * 0.55, y + 4, r * 0.45, 0, Math.PI * 2)
    ctx.arc(x - r * 0.5, y + 6, r * 0.4, 0, Math.PI * 2)
    ctx.fill()
  }

  function drawPalm(x, y, s) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    ctx.fillStyle = '#8b5a2b'
    ctx.fillRect(-4, -70, 8, 70)
    ctx.fillStyle = '#2ecc71'
    for (let i = 0; i < 5; i++) {
      const a = -1.2 + i * 0.55
      ctx.beginPath()
      ctx.ellipse(Math.cos(a) * 28, -70 + Math.sin(a) * 8, 28, 10, a, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  function drawRock(x, y, s) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    ctx.fillStyle = '#8a7f74'
    ctx.beginPath()
    ctx.moveTo(-22, 0)
    ctx.quadraticCurveTo(-18, -28, 0, -34)
    ctx.quadraticCurveTo(20, -26, 24, 0)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.15)'
    ctx.beginPath()
    ctx.ellipse(-6, -18, 6, 8, -0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  function drawWordPad(x, y, scale, word) {
    const w = Math.max(70, 150 * scale)
    const h = Math.max(28, 52 * scale)
    const pop = word.pop || 0
    const bounce = 1 + Math.sin(pop * Math.PI) * 0.35
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(bounce, bounce)
    // glow
    if (!word.hit) {
      const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, w)
      glow.addColorStop(0, `hsla(${word.hue}, 95%, 70%, .55)`)
      glow.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(0, 0, w * 0.85, 0, Math.PI * 2)
      ctx.fill()
    }
    // pad
    ctx.fillStyle = word.hit ? 'rgba(255,255,255,.35)' : `hsl(${word.hue}, 85%, 58%)`
    roundRect(-w / 2, -h / 2, w, h, Math.min(16, h / 2))
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,.85)'
    ctx.lineWidth = Math.max(2, 3 * scale)
    ctx.stroke()
    // text
    ctx.fillStyle = word.hit ? 'rgba(40,40,60,.45)' : '#1b1f36'
    ctx.font = `800 ${Math.max(14, 28 * scale)}px "Baloo 2", Nunito, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(capitalize(word.text), 0, 1)
    ctx.restore()
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  function drawKart(x, y, scale, color, tilt) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(tilt * 0.18)
    ctx.scale(scale, scale)
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.25)'
    ctx.beginPath()
    ctx.ellipse(0, 18, 38, 10, 0, 0, Math.PI * 2)
    ctx.fill()
    // body
    const body = ctx.createLinearGradient(-30, -20, 30, 20)
    body.addColorStop(0, color)
    body.addColorStop(1, '#fff')
    ctx.fillStyle = body
    roundRect(-34, -16, 68, 30, 12)
    ctx.fill()
    // cockpit
    ctx.fillStyle = 'rgba(40,60,100,.55)'
    roundRect(-14, -22, 28, 16, 8)
    ctx.fill()
    // spoiler
    ctx.fillStyle = color
    roundRect(-28, -28, 56, 8, 3)
    ctx.fill()
    // wheels
    ctx.fillStyle = '#1a1a22'
    ctx.fillRect(-32, 8, 14, 12)
    ctx.fillRect(18, 8, 14, 12)
    // star badge
    ctx.fillStyle = '#ffd166'
    ctx.beginPath()
    ctx.arc(0, 0, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  function drawPlayerKart(W, H, steer) {
    const x = W / 2 + state.playerX * W * 0.42
    const y = H - 78
    const bounce = Math.sin(state.time * 18) * 2 * (state.speed / state.maxSpeed)
    if (state.boost > 0) {
      ctx.fillStyle = 'rgba(120,220,255,.35)'
      ctx.beginPath()
      ctx.moveTo(x - 18, y + 10)
      ctx.lineTo(x + 18, y + 10)
      ctx.lineTo(x, y + 70 + state.boost * 0.4)
      ctx.fill()
    }
    drawKart(x, y + bounce, 1.35, '#ff8c42', steer)
    // Pip passenger
    ctx.font = '28px serif'
    ctx.textAlign = 'center'
    ctx.fillText('🦜', x + 10, y - 18 + bounce)
  }

  function render() {
    if (!ctx || !state) return
    const W = canvas.clientWidth
    const H = canvas.clientHeight
    const camZ = state.pos
    const start = Math.floor(camZ / SEG_LEN) % state.segs.length
    const camY = CAM_H + (state.segs[start].p1.world.y || 0)
    const playerSeg = state.segs[start]
    const camX = state.playerX * ROAD_W - (playerSeg ? playerSeg.curve * 40 : 0)

    drawSky(W, H, state.speed)

    let maxY = H
    let x = 0
    let dx = 0
    const cached = []

    for (let n = start + DRAW_DIST; n >= start; n--) {
      const base = Math.floor(n / state.segs.length) * state.segs.length * SEG_LEN
      const seg = state.segs[n % state.segs.length]
      const p1 = { world: { x: 0, y: seg.p1.world.y, z: n * SEG_LEN }, screen: {}, scale: 0 }
      // use continuous z
      p1.world.z = n * SEG_LEN
      const p2 = { world: { x: 0, y: seg.p2.world.y, z: (n + 1) * SEG_LEN }, screen: {}, scale: 0 }
      // adjust for looping visual continuity of height
      project(p1, camX - x, camY, camZ, W, H)
      project(p2, camX - x - dx, camY, camZ, W, H)
      x += dx
      dx += seg.curve
      seg._p1 = p1
      seg._p2 = p2
      seg._clip = maxY
      cached.push({ seg, p1, p2, n })
    }

    for (let i = 0; i < cached.length; i++) {
      const { seg, p1, p2 } = cached[i]
      if (p1.screen.y >= p2.screen.y) continue
      const dark = seg.color === 'dark'
      const grass = dark ? COLORS.grassA : COLORS.grassB
      const rumble = dark ? COLORS.rumbleA : COLORS.rumbleB
      const road = dark ? COLORS.roadA : COLORS.roadB
      drawPoly(0, p1.screen.y, W, 0, p2.screen.y, W, grass)
      drawPoly(p1.screen.x, p1.screen.y, p1.screen.w * 1.15, p2.screen.x, p2.screen.y, p2.screen.w * 1.15, rumble)
      drawPoly(p1.screen.x, p1.screen.y, p1.screen.w, p2.screen.x, p2.screen.y, p2.screen.w, road)
      // center dashed line
      if (dark) {
        drawPoly(p1.screen.x, p1.screen.y, p1.screen.w * 0.02, p2.screen.x, p2.screen.y, p2.screen.w * 0.02, COLORS.line)
      }
      if (p2.screen.y < maxY) maxY = p2.screen.y
    }

    // sprites & words (near to far reverse = already near-first from cached reverse build; draw far first)
    for (let i = cached.length - 1; i >= 0; i--) {
      const { seg, p1 } = cached[i]
      const scale = p1.scale
      if (scale <= 0.001) continue
      seg.sprites.forEach((sp) => {
        const sx = p1.screen.x + sp.offset * p1.screen.w
        const sy = p1.screen.y
        if (sp.kind === 'palm') drawPalm(sx, sy, scale * 220 * sp.scale)
        else drawRock(sx, sy, scale * 180 * sp.scale)
      })
      seg.words.forEach((w) => {
        if (w.pop > 0) w.pop = Math.max(0, w.pop - 0.04)
        const sx = p1.screen.x + w.offset * p1.screen.w * 0.72
        const sy = p1.screen.y
        drawWordPad(sx, sy, scale * 180, w)
      })
    }

    // rivals
    state.rivals.forEach((r) => {
      const rel = r.z - camZ
      if (rel < 40 || rel > DRAW_DIST * SEG_LEN) return
      const n = Math.floor(r.z / SEG_LEN)
      const seg = state.segs[n % state.segs.length]
      if (!seg || !seg._p1) return
      const sx = seg._p1.screen.x + r.x * seg._p1.screen.w * 0.7
      const sy = seg._p1.screen.y
      const sc = seg._p1.scale * 160
      drawKart(sx, sy, Math.max(0.25, sc), r.color, Math.sin(state.time + r.bob) * 0.4)
    })

    // particles near player
    state.particles.forEach((p) => {
      ctx.globalAlpha = clamp(p.life, 0, 1)
      ctx.fillStyle = p.c
      ctx.beginPath()
      ctx.arc(W / 2 + p.x, H - 90 + p.y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    })

    drawPlayerKart(W, H, state.steer)

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,255,220,${state.flash * 0.35})`
      ctx.fillRect(0, 0, W, H)
    }

    // tilt coach overlay
    if (state.tiltHint && state.time < 4) {
      ctx.fillStyle = 'rgba(20,28,50,.45)'
      roundRect(W / 2 - 150, 24, 300, 54, 16)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = '700 18px Nunito, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Tilt ◀ iPad ▶  ·  auto-zoom!', W / 2, 58)
    }
  }

  function step(dt) {
    if (!state || state.finished) {
      if (state && !state.finished) { /* noop */ }
      else if (state) {
        state.time += dt
        state.steer = lerp(state.steer, 0, 0.08)
        render()
      }
      return
    }

    state.time += dt
    state.flash = Math.max(0, state.flash - dt)

    // auto acceleration
    const target = state.maxSpeed + state.boost * 1.8
    state.speed = lerp(state.speed, target, 1 - Math.pow(0.08, dt * 60))
    state.boost = Math.max(0, state.boost - dt * 28)

    // steering: gyro > touch > keys
    let input = gyroOn ? state.gyroSteer || 0 : 0
    if (!gyroOn) input = clamp(touchSteer + keySteer, -1, 1)
    state.steer = lerp(state.steer, input, 1 - Math.pow(0.12, dt * 60))
    state.playerX += state.steer * dt * (1.6 + state.speed / 220)
    // road curve influence
    const segN = Math.floor(state.pos / SEG_LEN) % state.segs.length
    const curve = state.segs[segN].curve
    state.playerX -= curve * state.speed * dt * 0.00055
    state.playerX = clamp(state.playerX, -1.05, 1.05)

    state.pos += state.speed * dt * 60 * 0.55

    // rivals cruise
    state.rivals.forEach((r, i) => {
      r.z = state.pos + 600 + i * 700 + Math.sin(state.time * 0.7 + r.bob) * 120
      r.x = Math.sin(state.time * 0.55 + r.bob) * 0.45
    })

    // particles
    state.particles = state.particles.filter((p) => {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 280 * dt
      return p.life > 0
    })

    // word collisions — near field
    const near = Math.floor(state.pos / SEG_LEN)
    for (let i = near; i <= near + 3; i++) {
      const seg = state.segs[i % state.segs.length]
      const segZ = i * SEG_LEN
      const dz = segZ - state.pos
      if (dz < -20 || dz > SEG_LEN * 1.2) continue
      seg.words.forEach((w) => {
        if (w.hit) return
        const dx = Math.abs(state.playerX - w.offset)
        if (dx < 0.28 && dz < SEG_LEN * 0.55) onWordHit(w)
      })
    }

    if (state.time > 3.5) state.tiltHint = false
    syncEngine()
    render()
    if (Math.floor(state.time * 2) !== Math.floor((state.time - dt) * 2)) updateHud()
  }

  function loop(ts) {
    if (!running) return
    if (!lastT) lastT = ts
    const dt = clamp((ts - lastT) / 1000, 0, 0.05)
    lastT = ts
    step(dt)
    raf = requestAnimationFrame(loop)
  }

  function onOrient(e) {
    if (!running || !state) return
    // gamma: left-right tilt in landscape; beta in portrait
    let g = e.gamma
    let b = e.beta
    if (g == null && b == null) return
    // Prefer gamma; on some iPads landscape values swap
    let tilt = g
    if (Math.abs(b || 0) > Math.abs(g || 0) + 8) tilt = b
    // normalize ~±25 deg to ±1
    state.gyroSteer = clamp((tilt || 0) / 25, -1, 1)
    gyroOn = true
    updateHud()
  }

  async function enableGyro() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission()
        gyroPerm = res === 'granted'
      } else {
        gyroPerm = true
      }
    } catch (e) {
      gyroPerm = false
    }
    if (gyroPerm) {
      window.removeEventListener('deviceorientation', onOrient)
      window.addEventListener('deviceorientation', onOrient, true)
    }
    return gyroPerm
  }

  function bindPointer() {
    const arena = document.getElementById('raceArena')
    if (!arena || arena._raceBound) return
    arena._raceBound = true
    let down = false
    const setFromClientX = (x) => {
      const r = arena.getBoundingClientRect()
      const nx = (x - r.left) / r.width
      touchSteer = clamp((nx - 0.5) * 2.2, -1, 1)
    }
    arena.addEventListener('pointerdown', (e) => {
      down = true
      arena.setPointerCapture?.(e.pointerId)
      setFromClientX(e.clientX)
    })
    arena.addEventListener('pointermove', (e) => {
      if (!down) return
      setFromClientX(e.clientX)
    })
    const up = () => { down = false; touchSteer = 0 }
    arena.addEventListener('pointerup', up)
    arena.addEventListener('pointercancel', up)
  }

  function bindKeys() {
    if (window._raceKeys) return
    window._raceKeys = true
    window.addEventListener('keydown', (e) => {
      if (!running) return
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keySteer = -1
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keySteer = 1
    })
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' ||
          e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keySteer = 0
    })
  }

  function stopRace() {
    running = false
    lastT = 0
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    stopEngineHum()
    window.removeEventListener('deviceorientation', onOrient, true)
    gyroOn = false
    touchSteer = 0
    keySteer = 0
  }

  function startRaceGame() {
    if (!ensureCanvas()) return
    stopRace()
    state = freshState()
    const next = document.getElementById('raceNext')
    if (next) next.classList.add('hidden')
    const msg = document.getElementById('raceMessage')
    if (msg) msg.textContent = ''
    updateHud()
    bindPointer()
    bindKeys()
    sizeCanvas()
    running = true
    startEngineHum()
    enableGyro().then((ok) => {
      const tip = document.getElementById('raceGyroBtn')
      if (tip) tip.classList.toggle('hidden', ok)
    })
    lastT = 0
    raf = requestAnimationFrame(loop)
    window.addEventListener('resize', sizeCanvas)
  }

  function requestGyroFromButton() {
    unlockSpeech?.()
    enableGyro().then((ok) => {
      if (typeof speak === 'function') {
        speak(ok ? 'Tilt steering is on. Lean left and right.' : 'Tilt is not available. Drag on the track to steer.')
      }
      const tip = document.getElementById('raceGyroBtn')
      if (tip && ok) tip.classList.add('hidden')
      updateHud()
    })
  }

  // public API
  window.startRaceGame = startRaceGame
  window.stopRace = stopRace
  window.requestRaceGyro = requestGyroFromButton
  window.sizeRaceCanvas = sizeCanvas
})()
