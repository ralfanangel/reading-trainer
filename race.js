/* Word Kart — gyro-steer sight-word racer for iPad Reading Trainer */
(function () {
  const GOAL = 12
  const SEG_LEN = 200
  const ROAD_W = 2000
  const CAM_H = 1000
  const DRAW_DIST = 220
  const FOV_DEG = 100
  const CAM_DEPTH = 1 / Math.tan((FOV_DEG / 2) * Math.PI / 180)

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

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }
  function lerp(a, b, t) { return a + (b - a) * t }
  function rand(a, b) { return a + Math.random() * (b - a) }
  function capitalize(s) { return (s || '').charAt(0).toUpperCase() + (s || '').slice(1) }

  function buildTrack() {
    const segs = []
    let curve = 0
    let y = 0
    for (let i = 0; i < 1200; i++) {
      if (i > 20 && i % 36 === 0) curve = rand(-5.5, 5.5)
      if (i > 40 && i % 50 === 0) y += rand(-320, 320)
      y *= 0.96
      segs.push({
        index: i,
        p1: { world: { x: 0, y, z: i * SEG_LEN }, camera: {}, screen: {}, scale: 0 },
        p2: { world: { x: 0, y: 0, z: (i + 1) * SEG_LEN }, camera: {}, screen: {}, scale: 0 },
        curve,
        color: ((i / 3) | 0) % 2,
        sprites: [],
        words: []
      })
    }
    for (let i = 0; i < segs.length - 1; i++) {
      segs[i].p2.world.y = segs[i + 1].p1.world.y
    }
    return segs
  }

  function placeContent(segs, words) {
    const pack = words.slice().sort(() => Math.random() - 0.5)
    let wi = 0
    for (let i = 12; i < segs.length - 60; i++) {
      if (i % 10 === 0 && Math.random() < 0.9) {
        segs[i].sprites.push({
          kind: Math.random() < 0.55 ? 'palm' : (Math.random() < 0.5 ? 'rock' : 'cactus'),
          offset: (Math.random() < 0.5 ? -1 : 1) * rand(1.2, 2.1),
          scale: rand(0.85, 1.4)
        })
      }
      // dense sight-word pads in the three drive lanes
      if (i % 5 === 0) {
        const lane = [-0.5, 0, 0.5][wi % 3]
        const w = pack[wi % pack.length]
        wi++
        segs[i].words.push({
          text: w,
          offset: lane,
          hit: false,
          pop: 0,
          hue: (wi * 53) % 360
        })
      }
    }
  }

  function project(p, camX, camY, camZ, W, H) {
    p.camera.x = (p.world.x || 0) - camX
    p.camera.y = (p.world.y || 0) - camY
    p.camera.z = (p.world.z || 0) - camZ
    if (p.camera.z <= CAM_DEPTH) {
      p.screen.x = 0; p.screen.y = 0; p.screen.w = 0; p.scale = 0
      return
    }
    p.scale = CAM_DEPTH / p.camera.z
    p.screen.x = Math.round((W / 2) + (p.scale * p.camera.x * W / 2))
    p.screen.y = Math.round((H / 2) - (p.scale * p.camera.y * H / 2))
    p.screen.w = Math.round(p.scale * ROAD_W * W / 2)
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
    const w = Math.max(320, Math.floor(r.width) || 800)
    const h = Math.max(280, Math.floor(r.height) || 480)
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
      pos: SEG_LEN * 8,
      speed: 0,
      maxSpeed: 5200,
      playerX: 0,
      steer: 0,
      gyroSteer: 0,
      collected: 0,
      goal: GOAL,
      combo: 0,
      boost: 0,
      time: 0,
      finished: false,
      flash: 0,
      lastWord: '',
      rivals: [
        { z: 1800, x: -0.35, color: '#ff6b9d', bob: 0 },
        { z: 2800, x: 0.4, color: '#6bcbff', bob: 1.2 },
        { z: 4200, x: -0.15, color: '#b8f25a', bob: 2.4 }
      ],
      particles: [],
      tiltHint: true
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

  function onWordHit(w) {
    if (w.hit || state.finished) return
    w.hit = true
    w.pop = 1
    state.collected += 1
    state.combo += 1
    state.boost = Math.min(100, state.boost + 32 + state.combo * 4)
    state.flash = 0.5
    state.lastWord = w.text
    state.maxSpeed = Math.min(7800, 5200 + state.collected * 120)
    for (let i = 0; i < 22; i++) {
      state.particles.push({
        x: rand(-50, 50), y: rand(-30, 10),
        vx: rand(-140, 140), vy: rand(-260, -60),
        life: rand(0.4, 1), c: `hsl(${w.hue}, 92%, 62%)`
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

  function roundRect(x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
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

  function drawSky(W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#0d3a7a')
    g.addColorStop(0.42, '#4eb4ff')
    g.addColorStop(0.55, '#b8e8ff')
    g.addColorStop(0.62, '#ffe6a0')
    g.addColorStop(1, '#7ad45a')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)

    const sx = W * 0.78
    const sy = H * 0.18
    const sun = ctx.createRadialGradient(sx, sy, 2, sx, sy, 90)
    sun.addColorStop(0, '#fffce8')
    sun.addColorStop(0.35, '#ffd166')
    sun.addColorStop(1, 'rgba(255,170,40,0)')
    ctx.fillStyle = sun
    ctx.beginPath(); ctx.arc(sx, sy, 90, 0, Math.PI * 2); ctx.fill()

    for (let i = 0; i < 6; i++) {
      const cx = ((i * 190 + state.time * (10 + i * 2)) % (W + 160)) - 80
      const cy = 36 + (i % 3) * 28
      ctx.fillStyle = `rgba(255,255,255,${0.5 + (i % 2) * 0.25})`
      ctx.beginPath()
      ctx.arc(cx, cy, 22, 0, Math.PI * 2)
      ctx.arc(cx + 26, cy + 4, 18, 0, Math.PI * 2)
      ctx.arc(cx - 22, cy + 6, 16, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function drawPalm(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s)
    ctx.fillStyle = '#8b5a2b'
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-2, -90); ctx.lineTo(3, -90); ctx.lineTo(6, 0); ctx.fill()
    ctx.fillStyle = '#2dd46a'
    for (let i = 0; i < 6; i++) {
      const a = -1.4 + i * 0.5
      ctx.beginPath()
      ctx.ellipse(Math.cos(a) * 34, -88 + Math.sin(a) * 10, 34, 11, a, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#ffd166'
    ctx.beginPath(); ctx.arc(0, -92, 5, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  function drawRock(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s)
    ctx.fillStyle = '#9a8b7c'
    ctx.beginPath(); ctx.moveTo(-26, 0); ctx.quadraticCurveTo(-20, -36, 2, -42); ctx.quadraticCurveTo(28, -30, 30, 0); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.2)'
    ctx.beginPath(); ctx.ellipse(-6, -22, 7, 9, -0.3, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  function drawCactus(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s)
    ctx.fillStyle = '#2f9e4f'
    roundRect(-8, -70, 16, 70, 8); ctx.fill()
    roundRect(-28, -48, 22, 12, 6); ctx.fill()
    roundRect(-28, -48, 12, 28, 6); ctx.fill()
    roundRect(8, -58, 22, 12, 6); ctx.fill()
    roundRect(18, -58, 12, 24, 6); ctx.fill()
    ctx.restore()
  }

  function drawWordPad(x, y, scale, word) {
    const w = Math.max(80, 220 * scale)
    const h = Math.max(32, 70 * scale)
    const bounce = 1 + Math.sin((word.pop || 0) * Math.PI) * 0.4
    ctx.save(); ctx.translate(x, y - h * 0.15); ctx.scale(bounce, bounce)
    if (!word.hit) {
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, w)
      glow.addColorStop(0, `hsla(${word.hue}, 95%, 70%, .75)`)
      glow.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(0, 0, w, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = word.hit ? 'rgba(255,255,255,.28)' : `hsl(${word.hue}, 90%, 58%)`
    roundRect(-w / 2, -h / 2, w, h, Math.min(20, h / 2)); ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(3, 4 * scale); ctx.stroke()
    ctx.fillStyle = word.hit ? 'rgba(30,30,50,.35)' : '#101828'
    const fs = Math.max(16, Math.min(42, 38 * scale))
    ctx.font = `800 ${fs}px "Baloo 2", Nunito, sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(capitalize(word.text), 0, 1)
    ctx.restore()
  }

  function drawKart(x, y, scale, color, tilt) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt * 0.2); ctx.scale(scale, scale)
    ctx.fillStyle = 'rgba(0,0,0,.28)'
    ctx.beginPath(); ctx.ellipse(0, 20, 42, 11, 0, 0, Math.PI * 2); ctx.fill()
    const body = ctx.createLinearGradient(-36, -18, 36, 22)
    body.addColorStop(0, color); body.addColorStop(0.55, '#fff8f0'); body.addColorStop(1, color)
    ctx.fillStyle = body
    roundRect(-36, -14, 72, 32, 14); ctx.fill()
    ctx.fillStyle = 'rgba(30,50,90,.55)'
    roundRect(-16, -26, 32, 18, 9); ctx.fill()
    ctx.fillStyle = color
    roundRect(-30, -32, 60, 9, 3); ctx.fill()
    ctx.fillStyle = '#15151c'
    ctx.fillRect(-34, 10, 16, 14); ctx.fillRect(18, 10, 16, 14)
    ctx.fillStyle = '#ffd166'
    ctx.beginPath(); ctx.arc(0, 2, 8, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  function drawPlayerKart(W, H, steer) {
    const x = W / 2 + state.playerX * W * 0.38
    const y = H - 72
    const bounce = Math.sin(state.time * 20) * 2.5 * (state.speed / Math.max(1, state.maxSpeed))
    if (state.boost > 0) {
      const trail = ctx.createLinearGradient(x, y, x, y + 90)
      trail.addColorStop(0, 'rgba(120,230,255,.55)')
      trail.addColorStop(1, 'rgba(120,230,255,0)')
      ctx.fillStyle = trail
      ctx.beginPath(); ctx.moveTo(x - 22, y + 8); ctx.lineTo(x + 22, y + 8); ctx.lineTo(x, y + 80 + state.boost * 0.5); ctx.fill()
    }
    drawKart(x, y + bounce, 1.4, '#ff8c42', steer)
    ctx.font = `${Math.round(30)}px serif`
    ctx.textAlign = 'center'
    ctx.fillText('🦜', x + 12, y - 20 + bounce)
  }

  function findSegment(z) {
    return state.segs[Math.floor(z / SEG_LEN) % state.segs.length]
  }

  function render() {
    if (!ctx || !state) return
    const W = canvas.clientWidth || 800
    const H = canvas.clientHeight || 480
    const base = state.pos
    const startN = Math.floor(base / SEG_LEN)
    const playerSeg = findSegment(base)
    let camY = CAM_H + playerSeg.p1.world.y
    // gentle look into hills
    camY += state.speed * 0.15

    drawSky(W, H)

    // project near → far (Jake Gordon style) so curves accumulate correctly
    let x = 0
    let dx = 0
    const camX = state.playerX * ROAD_W
    const startSeg = findSegment(base)
    dx = -(startSeg.curve || 0) * ((base % SEG_LEN) / SEG_LEN)

    for (let n = 0; n < DRAW_DIST; n++) {
      const idx = startN + n
      const seg = state.segs[idx % state.segs.length]
      seg.p1.world.z = idx * SEG_LEN
      seg.p2.world.z = (idx + 1) * SEG_LEN
      project(seg.p1, camX - x, camY, base, W, H)
      project(seg.p2, camX - x - dx, camY, base, W, H)
      x += dx
      dx += seg.curve
      seg._idx = idx
    }

    // draw far → near
    for (let n = DRAW_DIST - 1; n >= 0; n--) {
      const seg = state.segs[(startN + n) % state.segs.length]
      const p1 = seg.p1.screen
      const p2 = seg.p2.screen
      if (!p1.w && !p2.w) continue
      if (p1.y < p2.y) continue

      const alt = seg.color
      const grass = alt ? '#3ddc72' : '#2fbf5c'
      const rumble = alt ? '#ff4d6d' : '#fff8f0'
      const road = alt ? '#4a5168' : '#3a4054'
      const lane = '#fff6c8'

      drawPoly(W / 2, p1.y, W, W / 2, p2.y, W, grass)
      drawPoly(p1.x, p1.y, p1.w * 1.18, p2.x, p2.y, p2.w * 1.18, rumble)
      drawPoly(p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, road)
      if (alt) {
        drawPoly(p1.x, p1.y, p1.w * 0.028, p2.x, p2.y, p2.w * 0.028, lane)
        drawPoly(p1.x - p1.w * 0.55, p1.y, p1.w * 0.045, p2.x - p2.w * 0.55, p2.y, p2.w * 0.045, lane)
        drawPoly(p1.x + p1.w * 0.55, p1.y, p1.w * 0.045, p2.x + p2.w * 0.55, p2.y, p2.w * 0.045, lane)
      }
    }

    // sprites & words far → near
    for (let n = DRAW_DIST - 1; n >= 1; n--) {
      const seg = state.segs[(startN + n) % state.segs.length]
      const scale = seg.p1.scale
      if (!scale || scale <= 0) continue
      const sy = seg.p1.screen.y
      if (sy > H + 80 || sy < -20) continue

      if (scale > 0.0005) {
        seg.sprites.forEach((sp) => {
          const sx = seg.p1.screen.x + sp.offset * seg.p1.screen.w
          const sc = scale * 280 * sp.scale
          if (sp.kind === 'palm') drawPalm(sx, sy, sc)
          else if (sp.kind === 'cactus') drawCactus(sx, sy, sc)
          else drawRock(sx, sy, sc)
        })
      }
      seg.words.forEach((w) => {
        if (w.pop > 0) w.pop = Math.max(0, w.pop - 0.045)
        const sx = seg.p1.screen.x + w.offset * seg.p1.screen.w * 0.7
        // keep pads readable even mid-distance
        const ws = Math.max(0.18, scale * 380)
        drawWordPad(sx, sy, ws, w)
      })
    }

    // rivals
    state.rivals.forEach((r) => {
      const rel = r.z - base
      if (rel < 40 || rel > DRAW_DIST * SEG_LEN) return
      const seg = findSegment(r.z)
      if (!seg.p1.scale) return
      // approximate screen using current projection of that segment
      const n = Math.floor(r.z / SEG_LEN)
      const s = state.segs[n % state.segs.length]
      if (!s.p1.scale) return
      const sx = s.p1.screen.x + r.x * s.p1.screen.w * 0.7
      const sy = s.p1.screen.y
      const sc = Math.max(0.2, s.p1.scale * 180)
      drawKart(sx, sy, sc, r.color, Math.sin(state.time + r.bob) * 0.45)
    })

    state.particles.forEach((p) => {
      ctx.globalAlpha = clamp(p.life, 0, 1)
      ctx.fillStyle = p.c
      ctx.beginPath(); ctx.arc(W / 2 + p.x, H - 90 + p.y, 6, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1
    })

    drawPlayerKart(W, H, state.steer)

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,255,210,${state.flash * 0.4})`
      ctx.fillRect(0, 0, W, H)
    }

    if (state.tiltHint && state.time < 4.5) {
      ctx.fillStyle = 'rgba(16,24,48,.5)'
      roundRect(W / 2 - 160, 18, 320, 52, 16); ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = '700 17px Nunito, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Tilt ◀ iPad ▶  ·  auto-zoom!', W / 2, 50)
    }
  }

  function step(dt) {
    if (!state) return
    state.time += dt
    state.flash = Math.max(0, state.flash - dt)

    if (!state.finished) {
      const target = state.maxSpeed + state.boost * 45
      state.speed = lerp(state.speed, target, 1 - Math.pow(0.08, dt * 60))
      state.boost = Math.max(0, state.boost - dt * 28)

      let input = gyroOn ? (state.gyroSteer || 0) : 0
      if (!gyroOn) input = clamp(touchSteer + keySteer, -1, 1)
      state.steer = lerp(state.steer, input, 1 - Math.pow(0.14, dt * 60))
      state.playerX += state.steer * dt * (2.2 + state.speed / 4000)

      const seg = findSegment(state.pos)
      state.playerX -= seg.curve * state.speed * dt * 0.00002
      state.playerX = clamp(state.playerX, -1.15, 1.15)

      state.pos += state.speed * dt

      state.rivals.forEach((r, i) => {
        r.z = state.pos + 900 + i * 900 + Math.sin(state.time * 0.6 + r.bob) * 140
        r.x = Math.sin(state.time * 0.5 + r.bob) * 0.5
      })

      // collisions
      const near = Math.floor(state.pos / SEG_LEN)
      for (let i = near; i <= near + 2; i++) {
        const s = state.segs[i % state.segs.length]
        const segZ = i * SEG_LEN
        const dz = segZ - state.pos
        if (dz < -30 || dz > SEG_LEN) continue
        s.words.forEach((w) => {
          if (w.hit) return
          if (Math.abs(state.playerX - w.offset) < 0.32 && dz < SEG_LEN * 0.65) onWordHit(w)
        })
      }
      // decay combo if no hit recently
      if (state.boost < 5 && state.combo > 0 && state.time % 1 < dt) {
        /* keep combo until miss stretch — reset after quiet */
      }
    } else {
      state.speed = lerp(state.speed, 40, 0.02)
      state.pos += state.speed * dt
      state.steer = lerp(state.steer, 0, 0.08)
    }

    state.particles = state.particles.filter((p) => {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt
      return p.life > 0
    })

    if (state.time > 4) state.tiltHint = false
    syncEngine()
    render()
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
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission()
        gyroPerm = res === 'granted'
      } else gyroPerm = true
    } catch (e) { gyroPerm = false }
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
      document.getElementById('raceGyroBtn')?.classList.toggle('hidden', !!ok && location.protocol === 'https:')
      // always show button on http (gyro needs secure context / permission UX)
      if (!ok) document.getElementById('raceGyroBtn')?.classList.remove('hidden')
    })
    lastT = 0
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
