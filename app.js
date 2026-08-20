// Reading Trainer — journey, games, chest, 3D buddy
const STORAGE_KEY = 'rt_profile_v2'
const confettiCanvas = document.getElementById('confetti-canvas')
let confettiCtx = null
let confettiParticles = []
let animals = []
let voices = []
let preferredVoice = null
let currentGame = null
let currentItem = null
let roundReady = false

const STOPS = [
  { id: 'letters', x: '9%', y: '74%', emoji: '🔤', title: 'Letter Land', skill: 'Hear beginning sounds', game: 'sounds', need: 0 },
  { id: 'blend', x: '30%', y: '38%', emoji: '🌉', title: 'Blend Bridge', skill: 'Smash sounds into words', game: 'blend', need: 1 },
  { id: 'safari', x: '52%', y: '64%', emoji: '🦁', title: 'Word Safari', skill: 'Read, then match', game: 'safari', need: 2 },
  { id: 'magice', x: '68%', y: '28%', emoji: '🪄', title: 'Magic E Peak', skill: 'Short vs long vowels', game: 'lessons', need: 3 },
  { id: 'fluent', x: '80%', y: '72%', emoji: '⭐', title: 'Story Summit', skill: 'Smooth animal words', game: 'safari', need: 4 }
]

const GAMES = [
  { id: 'sounds', title: 'First Sound', ico: '👂', blurb: 'Hear a sound. Tap the picture that starts with it.', skill: 'Phonemic awareness', unlock: 0 },
  { id: 'slice', title: 'Balloon Slice', ico: '🎈', blurb: 'Short words fly in. Slice the balloon that starts with the sound you hear.', skill: 'First sound', unlock: 0 },
  { id: 'rhyme', title: 'Rhyme Race', ico: '🏁', blurb: 'Hear a word. Tap the picture that rhymes.', skill: 'Rhyming', unlock: 0 },
  { id: 'odd', title: 'Odd One Out', ico: '🔍', blurb: 'Three start with the same sound. Tap the odd picture.', skill: 'First sound', unlock: 0 },
  { id: 'builder', title: 'Build the Word', ico: '🧱', blurb: 'Tap letters in order to spell the picture.', skill: 'Spelling', unlock: 0 },
  { id: 'blend', title: 'Blend Machine', ico: '🧩', blurb: 'Hear each sound, then blend them into a word.', skill: 'Decoding', unlock: 1 },
  { id: 'vowel', title: 'Vowel Catch', ico: '🎣', blurb: 'Hear a word. Catch the vowel in the middle.', skill: 'Short vowels', unlock: 1 },
  { id: 'safari', title: 'Word Safari', ico: '🦁', blurb: 'Read the word first. The voice cheers only after you get it.', skill: 'Word reading', unlock: 1 },
  { id: 'lessons', title: 'Vowel Quest', ico: '✨', blurb: 'Short vowels, magic e, and vowel teams.', skill: 'Phonics patterns', unlock: 2 }
]

const LOOT = [
  { id: 'pebble', name: 'Sunny pebble', emoji: '🟡', need: 1, blurb: 'Your first reading star!' },
  { id: 'shell', name: 'River shell', emoji: '🐚', need: 2, blurb: 'Found on Blend Bridge.' },
  { id: 'key', name: 'Bronze key', emoji: '🔑', need: 3, blurb: 'Opens a little gate.' },
  { id: 'hat', name: 'Silly hat', emoji: '🎩', need: 4, blurb: 'Pip can wear this.', wear: 'hat' },
  { id: 'gem', name: 'Ruby gem', emoji: '💎', need: 5, blurb: 'Sparkles when you blend.' },
  { id: 'glasses', name: 'Star glasses', emoji: '🕶️', need: 6, blurb: 'For careful looking.', wear: 'glasses' },
  { id: 'book', name: 'Pocket book', emoji: '📗', need: 7, blurb: 'A story of your own.' },
  { id: 'cape', name: 'Hero cape', emoji: '🦸', need: 8, blurb: 'Readers are heroes.', wear: 'cape' },
  { id: 'crown', name: 'Reader crown', emoji: '👑', need: 9, blurb: 'You keep showing up.' },
  { id: 'giant', name: 'Giant Treasure', emoji: '🏆', need: 10, blurb: 'The vault at the end of the map!', mega: true }
]

const CVC = [
  { word: 'cat', emoji: '🐱', start: 'c', sounds: ['c', 'a', 't'], phon: ['cuh', 'aah', 'tuh'], rhyme: 'at' },
  { word: 'hat', emoji: '🎩', start: 'h', sounds: ['h', 'a', 't'], phon: ['h', 'aah', 'tuh'], rhyme: 'at' },
  { word: 'bat', emoji: '🦇', start: 'b', sounds: ['b', 'a', 't'], phon: ['buh', 'aah', 'tuh'], rhyme: 'at' },
  { word: 'dog', emoji: '🐶', start: 'd', sounds: ['d', 'o', 'g'], phon: ['duh', 'aw', 'guh'], rhyme: 'og' },
  { word: 'log', emoji: '🪵', start: 'l', sounds: ['l', 'o', 'g'], phon: ['luh', 'aw', 'guh'], rhyme: 'og' },
  { word: 'fog', emoji: '🌫️', start: 'f', sounds: ['f', 'o', 'g'], phon: ['f', 'aw', 'guh'], rhyme: 'og' },
  { word: 'pig', emoji: '🐷', start: 'p', sounds: ['p', 'i', 'g'], phon: ['puh', 'ih', 'guh'], rhyme: 'ig' },
  { word: 'wig', emoji: '💇', start: 'w', sounds: ['w', 'i', 'g'], phon: ['wuh', 'ih', 'guh'], rhyme: 'ig' },
  { word: 'sun', emoji: '☀️', start: 's', sounds: ['s', 'u', 'n'], phon: ['s', 'uh', 'n'], rhyme: 'un' },
  { word: 'bun', emoji: '🍞', start: 'b', sounds: ['b', 'u', 'n'], phon: ['buh', 'uh', 'n'], rhyme: 'un' },
  { word: 'run', emoji: '🏃', start: 'r', sounds: ['r', 'u', 'n'], phon: ['ruh', 'uh', 'n'], rhyme: 'un' },
  { word: 'bed', emoji: '🛏️', start: 'b', sounds: ['b', 'e', 'd'], phon: ['buh', 'eh', 'duh'], rhyme: 'ed' },
  { word: 'red', emoji: '🔴', start: 'r', sounds: ['r', 'e', 'd'], phon: ['ruh', 'eh', 'duh'], rhyme: 'ed' },
  { word: 'pen', emoji: '🖊️', start: 'p', sounds: ['p', 'e', 'n'], phon: ['puh', 'eh', 'n'], rhyme: 'en' },
  { word: 'hen', emoji: '🐔', start: 'h', sounds: ['h', 'e', 'n'], phon: ['h', 'eh', 'n'], rhyme: 'en' },
  { word: 'ten', emoji: '🔟', start: 't', sounds: ['t', 'e', 'n'], phon: ['tuh', 'eh', 'n'], rhyme: 'en' },
  { word: 'cup', emoji: '🥤', start: 'c', sounds: ['c', 'u', 'p'], phon: ['cuh', 'uh', 'puh'], rhyme: 'up' },
  { word: 'pup', emoji: '🐾', start: 'p', sounds: ['p', 'u', 'p'], phon: ['puh', 'uh', 'puh'], rhyme: 'up' },
  { word: 'map', emoji: '🗺️', start: 'm', sounds: ['m', 'a', 'p'], phon: ['m', 'aah', 'puh'], rhyme: 'ap' },
  { word: 'cap', emoji: '🧢', start: 'c', sounds: ['c', 'a', 'p'], phon: ['cuh', 'aah', 'puh'], rhyme: 'ap' },
  { word: 'net', emoji: '🥅', start: 'n', sounds: ['n', 'e', 't'], phon: ['n', 'eh', 'tuh'], rhyme: 'et' },
  { word: 'jet', emoji: '✈️', start: 'j', sounds: ['j', 'e', 't'], phon: ['juh', 'eh', 'tuh'], rhyme: 'et' },
  { word: 'bus', emoji: '🚌', start: 'b', sounds: ['b', 'u', 's'], phon: ['buh', 'uh', 's'], rhyme: 'us' },
  { word: 'fox', emoji: '🦊', start: 'f', sounds: ['f', 'o', 'x'], phon: ['f', 'aw', 'ks'], rhyme: 'ox' },
  { word: 'van', emoji: '🚐', start: 'v', sounds: ['v', 'a', 'n'], phon: ['vuh', 'aah', 'n'], rhyme: 'an' },
  { word: 'fan', emoji: '🪭', start: 'f', sounds: ['f', 'a', 'n'], phon: ['f', 'aah', 'n'], rhyme: 'an' },
  { word: 'kid', emoji: '🧒', start: 'k', sounds: ['k', 'i', 'd'], phon: ['cuh', 'ih', 'duh'], rhyme: 'id' },
  { word: 'zip', emoji: '🤐', start: 'z', sounds: ['z', 'i', 'p'], phon: ['z', 'ih', 'puh'], rhyme: 'ip' },
  { word: 'gum', emoji: '🍬', start: 'g', sounds: ['g', 'u', 'm'], phon: ['guh', 'uh', 'm'], rhyme: 'um' }
]

const LESSONS = [
  { id: 'cvc', title: 'CVC words (short vowels)', words: ['cat', 'dog', 'pig', 'cup', 'bed'] },
  { id: 'silent-e', title: 'Silent e (long vowels)', words: ['cake', 'bike', 'rope', 'name', 'note'] },
  { id: 'vowel-teams', title: 'Vowel teams (ai, ea, oa)', words: ['rain', 'boat', 'seat', 'leaf', 'team'] }
]

let profile = { name: null, points: 0, stars: 0, gems: 0, streak: 0, lastDay: null, milestone: 0, level: 1, loot: [] }

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('rt_profile_v1')
    if (!raw) return
    const data = JSON.parse(raw)
    profile = { ...profile, ...data }
    if (typeof data.treasures === 'number' && !data.loot) {
      profile.stars = data.treasures
      profile.loot = LOOT.filter((t) => t.need <= profile.stars).map((t) => t.id)
    }
    if (!Array.isArray(profile.loot)) profile.loot = []
  } catch (e) { console.warn(e) }
}
function saveProfile() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

function showView(id) {
  if (id !== 'slice') stopSlice()
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('is-on'))
  const el = document.getElementById('view-' + id)
  if (el) el.classList.add('is-on')
  document.querySelectorAll('.dock-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.view === id))
}

function greet() {
  const n = profile.name || 'explorer'
  document.getElementById('hello').textContent = `Hi, ${n}!`
}

function renderStops() {
  const box = document.getElementById('stops')
  box.innerHTML = ''
  STOPS.forEach((s, i) => {
    const locked = profile.stars < s.need
    const here = Math.min(profile.milestone, STOPS.length - 1) === i
    const done = profile.stars > s.need || profile.loot.length > s.need
    const b = document.createElement('button')
    b.className = `stop ${locked ? 'is-lock' : ''} ${here ? 'is-here' : ''} ${done ? 'is-done' : ''}`
    b.style.left = s.x
    b.style.top = s.y
    b.type = 'button'
    b.innerHTML = `<div class="node">${locked ? '🔒' : s.emoji}</div><b>${s.title}</b>`
    b.addEventListener('click', () => {
      if (locked) {
        speak('Keep reading to unlock this stop')
        return
      }
      openGame(s.game)
    })
    box.appendChild(b)
  })
  const mega = document.getElementById('megaTreasure')
  const opened = profile.loot.includes('giant')
  mega.classList.toggle('is-open', opened)
  document.getElementById('megaHint').textContent = opened ? 'You opened the vault!' : `${Math.max(0, 10 - profile.stars)} stars to the giant treasure`
}

function renderGames() {
  const grid = document.getElementById('gameGrid')
  grid.innerHTML = ''
  GAMES.forEach((g) => {
    const locked = profile.stars < g.unlock
    const card = document.createElement('button')
    card.className = `game-card ${locked ? 'is-lock' : ''}`
    card.type = 'button'
    card.innerHTML = `<div class="ico">${g.ico}</div><h3>${g.title}</h3><p>${g.blurb}</p>`
    card.addEventListener('click', () => {
      if (locked) { speak('Play the earlier games first'); return }
      openGame(g.id)
    })
    grid.appendChild(card)
  })
}

function ownedLoot() {
  return LOOT.filter((t) => profile.stars >= t.need || profile.loot.includes(t.id))
}

function grantLoot() {
  const fresh = []
  LOOT.forEach((t) => {
    if (profile.stars >= t.need && !profile.loot.includes(t.id)) {
      profile.loot.push(t.id)
      fresh.push(t)
    }
  })
  profile.gems = Math.floor(profile.points / 2)
  saveProfile()
  if (fresh.length) {
    const t = fresh[fresh.length - 1]
    celebrate()
    showMessage(`Reward: ${t.name} ${t.emoji}`)
    if (t.wear) applyWear(t.wear)
    return t
  }
  return null
}

function announceLoot(t) {
  if (!t) return Promise.resolve()
  return speak(`You got a new treasure. The ${t.name}. ${t.blurb}`, { interrupt: false })
}

function applyWear(kind) {
  const el = document.getElementById('buddy')
  if (!el || !kind) return
  el.classList.add('wear-' + kind)
}

function haveLoot(t) {
  return profile.loot.includes(t.id) || profile.stars >= t.need
}

function renderChest() {
  document.getElementById('starCount').textContent = profile.stars
  document.getElementById('gemCount').textContent = profile.gems
  document.getElementById('streakCount').textContent = profile.streak
  document.getElementById('chestLead').textContent = profile.name
    ? `${profile.name} has ${profile.loot.length} treasures. Stars come from reading, not rushing.`
    : 'Rewards you earned by reading — not by rushing.'
  const grid = document.getElementById('lootGrid')
  grid.innerHTML = ''
  LOOT.forEach((t) => {
    const have = haveLoot(t)
    const card = document.createElement('button')
    card.type = 'button'
    card.className = `loot-card ${have ? '' : 'is-lock'}`
    card.innerHTML = `<span class="sparkle"></span><div class="ico">${have ? t.emoji : '❔'}</div><h3>${have ? t.name : 'Mystery reward'}</h3><p>${have ? t.blurb : `Earn ${t.need} stars`}</p>`
    card.addEventListener('click', () => onLootTap(card, t, have))
    grid.appendChild(card)
    if (have && t.wear) applyWear(t.wear)
  })
}

function onLootTap(card, t, have) {
  unlockSpeech()
  card.classList.remove('is-spark', 'is-shake')
  void card.offsetWidth
  if (!have) {
    card.classList.add('is-shake')
    speak(`This treasure unlocks at ${t.need} stars.`)
    return
  }
  card.classList.add('is-spark')
  spawnConfetti(36)
  buddyTrick('jump', true)
  if (t.wear) applyWear(t.wear)
  speak(`${t.name}. ${t.blurb}`)
}

function openGame(id) {
  currentGame = id
  if (id === 'lessons') {
    showView('lessons')
    renderLessons()
    return
  }
  if (id === 'slice') {
    showView('slice')
    unlockSpeech()
    requestAnimationFrame(() => startSliceRound())
    return
  }
  const g = GAMES.find((x) => x.id === id) || { title: 'Game', skill: 'Practice' }
  document.getElementById('playTitle').textContent = g.title
  document.getElementById('playSkill').textContent = g.skill
  document.getElementById('nextBtn').classList.add('hidden')
  showView('play')
  startRound()
}

function startRound() {
  roundReady = false
  clearMessage()
  document.getElementById('nextBtn').classList.add('hidden')
  if (currentGame === 'sounds') startSounds()
  else if (currentGame === 'blend') startBlend()
  else if (currentGame === 'rhyme') startRhyme()
  else if (currentGame === 'odd') startOdd()
  else if (currentGame === 'builder') startBuilder()
  else if (currentGame === 'vowel') startVowel()
  else if (currentGame === 'slice') startSliceRound()
  else startSafari()
}

let sliceRunning = false
let sliceLocked = false
let sliceScore = 0
const SLICE_GOAL = 10
let sliceBalloons = []
let sliceRaf = 0
let slashPts = []
let slicing = false

function stopSlice() {
  sliceRunning = false
  sliceLocked = false
  if (sliceRaf) cancelAnimationFrame(sliceRaf)
  sliceRaf = 0
  sliceBalloons = []
}

function updateSliceHud() {
  const hud = document.getElementById('sliceHud')
  if (!hud) return
  hud.textContent = `⭐ ${sliceScore} / ${SLICE_GOAL}`
  hud.classList.remove('is-ping')
  void hud.offsetWidth
  hud.classList.add('is-ping')
}

function startSliceRound() {
  sliceScore = 0
  document.getElementById('sliceNext').classList.add('hidden')
  document.getElementById('sliceMessage').textContent = ''
  document.getElementById('sliceModel').textContent = 'Listen. Slice the balloon that starts with that sound. Keep going until 10 stars.'
  updateSliceHud()
  startSliceWave()
}

function startSlice() {
  startSliceRound()
}

function startSliceWave() {
  sliceLocked = false
  sliceBalloons = []
  const layer = document.getElementById('balloons')
  if (layer) layer.innerHTML = ''
  const target = CVC[Math.floor(Math.random() * CVC.length)]
  currentItem = target
  const pack = uniqueStartChoices(target, CVC, 4)
  document.getElementById('sliceSound').textContent = `/${target.sounds[0]}/`
  const arena = document.getElementById('sliceArena')
  const canvas = document.getElementById('slashCanvas')
  if (arena && canvas) {
    canvas.width = arena.clientWidth
    canvas.height = arena.clientHeight
  }
  pack.forEach((item, i) => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = `balloon c${i}`
    el.innerHTML = `<span class="body"><small>${item.emoji}</small>${item.word}</span><span class="string"></span>`
    layer.appendChild(el)
    const balloon = {
      el,
      item,
      x: 18 + i * 22 + Math.random() * 6,
      y: 78 + Math.random() * 14,
      vx: (Math.random() - 0.5) * 0.28,
      vy: -0.32 - Math.random() * 0.1
    }
    sliceBalloons.push(balloon)
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      onSliceHit(balloon)
    })
  })
  if (!sliceRunning) {
    sliceRunning = true
    sliceTick()
  }
  setTimeout(() => speakPhoneme(target), 280)
}

function sliceTick() {
  if (!sliceRunning) return
  const arena = document.getElementById('sliceArena')
  if (!arena) return
  const w = arena.clientWidth
  const h = arena.clientHeight
  sliceBalloons.forEach((b) => {
    if (b.dead) return
    b.x += b.vx
    b.y += b.vy
    if (b.x < 8) { b.x = 8; b.vx = Math.abs(b.vx) }
    if (b.x > 92) { b.x = 92; b.vx = -Math.abs(b.vx) }
    if (b.y < -12) {
      b.y = 95
      b.x = 12 + Math.random() * 76
    }
    b.el.style.left = (b.x / 100) * w + 'px'
    b.el.style.top = (b.y / 100) * h + 'px'
  })
  drawSlash()
  sliceRaf = requestAnimationFrame(sliceTick)
}

function arenaPoint(e, arena) {
  const r = arena.getBoundingClientRect()
  const src = e.touches ? e.touches[0] : e
  return { x: src.clientX - r.left, y: src.clientY - r.top }
}

function hitBalloon(pt) {
  const arena = document.getElementById('sliceArena')
  const w = arena.clientWidth
  const h = arena.clientHeight
  for (const b of sliceBalloons) {
    if (b.dead) continue
    const cx = (b.x / 100) * w
    const cy = (b.y / 100) * h
    const dx = pt.x - cx
    const dy = pt.y - cy
    if (dx * dx + dy * dy < 52 * 52) return b
  }
  return null
}

function onSliceHit(b) {
  if (sliceLocked || b.dead || sliceScore >= SLICE_GOAL) return
  const ok = b.item.start === currentItem.start
  if (ok) {
    sliceLocked = true
    b.dead = true
    b.el.classList.add('is-pop')
    sliceScore += 1
    document.getElementById('sliceMessage').textContent = `+1 star · ${capitalize(b.item.word)}`
    const loot = awardSliceStar(b.item.word)
    updateSliceHud()
    const next = () => {
      if (!document.getElementById('view-slice')?.classList.contains('is-on')) return
      if (sliceScore >= SLICE_GOAL) finishSliceRound()
      else startSliceWave()
    }
    speak(capitalize(b.item.word), { rate: 0.9 }).then(() => announceLoot(loot)).then(() => wait(200)).then(next)
  } else {
    b.el.classList.remove('is-wrong')
    void b.el.offsetWidth
    b.el.classList.add('is-wrong')
    document.getElementById('sliceMessage').textContent = `${capitalize(b.item.word)} starts with a different sound. Listen again.`
    speakPhoneme(currentItem)
  }
}

function finishSliceRound() {
  sliceRunning = false
  sliceLocked = true
  document.getElementById('sliceMessage').textContent = '10 stars! Check your treasure chest.'
  document.getElementById('sliceModel').textContent = 'Nice round. Play again, or open the chest.'
  document.getElementById('sliceNext').classList.remove('hidden')
  celebrate()
  speak('You got ten stars. Check your treasure chest.')
}

function drawSlash() {
  const canvas = document.getElementById('slashCanvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (slashPts.length < 2) return
  ctx.strokeStyle = 'rgba(255,107,129,.9)'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(slashPts[0].x, slashPts[0].y)
  slashPts.forEach((p) => ctx.lineTo(p.x, p.y))
  ctx.stroke()
}

function bindSlicePointer() {
  const arena = document.getElementById('sliceArena')
  const start = (e) => {
    if (!document.getElementById('view-slice').classList.contains('is-on')) return
    slicing = true
    slashPts = [arenaPoint(e, arena)]
    arena.setPointerCapture?.(e.pointerId)
    const hit = hitBalloon(slashPts[0])
    if (hit) onSliceHit(hit)
  }
  const move = (e) => {
    if (!slicing) return
    e.preventDefault()
    const pt = arenaPoint(e, arena)
    slashPts.push(pt)
    if (slashPts.length > 12) slashPts.shift()
    const hit = hitBalloon(pt)
    if (hit) onSliceHit(hit)
  }
  const end = () => { slicing = false; setTimeout(() => { slashPts = []; drawSlash() }, 180) }
  arena.addEventListener('pointerdown', start)
  arena.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
}

function uniqueStartChoices(keep, pool, n) {
  const key = (p) => (p.start || (p.word || p.name || '')[0] || '').toLowerCase()
  const keepKey = key(keep)
  const used = new Set([keepKey])
  const rest = []
  for (const p of shuffleCopy(pool)) {
    const w = (p.word || p.name || '')
    if (w === (keep.word || keep.name)) continue
    const st = key(p)
    if (!st || used.has(st)) continue
    used.add(st)
    rest.push(p)
    if (rest.length >= n - 1) break
  }
  return shuffleCopy([keep, ...rest])
}

function distractors(keep, pool, n) {
  return uniqueStartChoices(keep, pool, n)
}

function startSounds() {
  currentItem = CVC[Math.floor(Math.random() * CVC.length)]
  document.getElementById('modelLine').textContent = 'Listen to the first sound. Then tap the matching picture.'
  document.getElementById('targetName').textContent = `/${currentItem.sounds[0]}/`
  document.getElementById('letterRow').innerHTML = `<div class="letter-tile">${currentItem.sounds[0].toUpperCase()}</div>`
  renderPictureChoices(distractors(currentItem, CVC, 4), (choice) => choice.word === currentItem.word)
  setTimeout(() => speakPhoneme(currentItem), 300)
}

function startBlend() {
  currentItem = CVC[Math.floor(Math.random() * CVC.length)]
  document.getElementById('modelLine').textContent = 'Hear each sound. Blend them. Then pick the word you made.'
  document.getElementById('targetName').textContent = currentItem.word
  document.getElementById('letterRow').innerHTML = currentItem.sounds.map((ch, i) =>
    `<div class="letter-tile ${'aeiou'.includes(ch) ? 'vowel-short' : ''}" data-i="${i}">${ch.toUpperCase()}</div>`
  ).join('')
  renderPictureChoices(distractors(currentItem, CVC, 4), (choice) => choice.word === currentItem.word)
  setTimeout(() => playBlend(currentItem), 250)
}

function startSafari() {
  const pool = animals.length ? animals : CVC.map((c) => ({ name: c.word, emoji: c.emoji, id: c.word, level: 1, reward: 1 }))
  const playable = pool.filter((a) => (a.level || 1) <= profile.level)
  currentItem = playable[Math.floor(Math.random() * playable.length)] || pool[0]
  const word = currentItem.name || currentItem.word
  document.getElementById('modelLine').textContent = 'Read the word with your eyes. Tap the picture. We only say it after you get it.'
  document.getElementById('targetName').textContent = capitalize(word)
  document.getElementById('letterRow').innerHTML = [...word].map((ch) =>
    `<div class="letter-tile ${'aeiou'.includes(ch) ? 'vowel-short' : ''}">${ch.toUpperCase()}</div>`
  ).join('')
  const choices = shuffleCopy(pool).slice(0, 6)
  if (!choices.find((c) => (c.id || c.word) === (currentItem.id || currentItem.word))) choices[0] = currentItem
  renderAnimalChoices(shuffleCopy(choices))
}

function startRhyme() {
  const groups = {}
  CVC.forEach((w) => {
    if (!w.rhyme) return
    ;(groups[w.rhyme] = groups[w.rhyme] || []).push(w)
  })
  const tails = Object.keys(groups).filter((t) => groups[t].length >= 2)
  const tail = tails[Math.floor(Math.random() * tails.length)]
  const pack = shuffleCopy(groups[tail])
  const prompt = pack[0]
  const answer = pack[1]
  currentItem = { ...prompt, rhymeAnswer: answer.word }
  const others = shuffleCopy(CVC.filter((w) => w.rhyme !== tail && w.word !== prompt.word)).slice(0, 2)
  document.getElementById('modelLine').textContent = `Tap the word that rhymes with ${prompt.word}.`
  document.getElementById('targetName').textContent = `${prompt.emoji} ${capitalize(prompt.word)}`
  document.getElementById('letterRow').innerHTML = ''
  renderPictureChoices(shuffleCopy([answer, ...others]), (choice) => choice.word === answer.word)
  setTimeout(() => speak(capitalize(prompt.word), { rate: 0.92 }), 280)
}

function startOdd() {
  const byStart = {}
  CVC.forEach((w) => { (byStart[w.start] = byStart[w.start] || []).push(w) })
  const starts = Object.keys(byStart).filter((s) => byStart[s].length >= 3)
  const start = starts[Math.floor(Math.random() * starts.length)]
  const same = shuffleCopy(byStart[start]).slice(0, 3)
  const odd = shuffleCopy(CVC.filter((w) => w.start !== start))[0]
  currentItem = { ...same[0], oddWord: odd.word }
  document.getElementById('modelLine').textContent = 'Three start with the same sound. Tap the odd one out.'
  document.getElementById('targetName').textContent = `/${same[0].sounds[0]}/`
  document.getElementById('letterRow').innerHTML = `<div class="letter-tile">${same[0].sounds[0].toUpperCase()}</div>`
  renderPictureChoices(shuffleCopy([...same, odd]), (choice) => choice.word === odd.word)
  setTimeout(() => speakPhoneme(same[0]), 300)
}

let builderNext = 0
function startBuilder() {
  currentItem = CVC[Math.floor(Math.random() * CVC.length)]
  builderNext = 0
  document.getElementById('modelLine').textContent = 'Tap the letters in order to build the word.'
  document.getElementById('targetName').textContent = `${currentItem.emoji} ${capitalize(currentItem.word)}`
  renderBuildSlots()
  const extra = 'aeioubcdfghjklmnpqrstvwxyz'.split('').find((ch) => !currentItem.word.includes(ch)) || 'x'
  const letters = shuffleCopy([...currentItem.word, extra])
  const grid = document.getElementById('grid')
  grid.className = 'grid'
  grid.innerHTML = ''
  letters.forEach((ch) => {
    const btn = document.createElement('button')
    btn.className = 'tile'
    btn.type = 'button'
    btn.innerHTML = `<div class="emoji" style="font-size:32px">${ch.toUpperCase()}</div>`
    btn.addEventListener('click', () => onBuilderTap(ch, btn))
    grid.appendChild(btn)
  })
}

function renderBuildSlots() {
  const word = currentItem.word
  document.getElementById('letterRow').innerHTML = [...word].map((ch, i) =>
    `<div class="build-slot ${i < builderNext ? 'is-on' : ''}">${i < builderNext ? ch.toUpperCase() : ''}</div>`
  ).join('')
}

function onBuilderTap(ch, btn) {
  const need = currentItem.word[builderNext]
  if (ch === need) {
    builderNext += 1
    btn.classList.add('correct')
    renderBuildSlots()
    playPhoneme(currentItem.phon[builderNext - 1] || ch)
    if (builderNext >= currentItem.word.length) {
      showMessage(`You built ${capitalize(currentItem.word)}!`)
      awardCorrect(currentItem.word)
      document.getElementById('nextBtn').classList.remove('hidden')
    }
  } else {
    btn.classList.add('wrong')
    setTimeout(() => btn.classList.remove('wrong'), 400)
  }
}

function startVowel() {
  const pool = CVC.filter((w) => w.sounds[1] && 'aeiou'.includes(w.sounds[1]))
  currentItem = pool[Math.floor(Math.random() * pool.length)]
  document.getElementById('modelLine').textContent = 'Listen to the word. Tap the vowel in the middle.'
  document.getElementById('targetName').textContent = currentItem.emoji
  document.getElementById('letterRow').innerHTML = currentItem.sounds.map((ch, i) =>
    `<div class="letter-tile ${i === 1 ? 'vowel-short' : ''}">${i === 1 ? '?' : ch.toUpperCase()}</div>`
  ).join('')
  const grid = document.getElementById('grid')
  grid.className = 'grid vowel-pad'
  grid.innerHTML = ''
  ;['a', 'e', 'i', 'o', 'u'].forEach((v) => {
    const btn = document.createElement('button')
    btn.className = 'tile'
    btn.type = 'button'
    btn.textContent = v.toUpperCase()
    btn.addEventListener('click', () => onPick(btn, v === currentItem.sounds[1], currentItem.word))
    grid.appendChild(btn)
  })
  setTimeout(() => speak(capitalize(currentItem.word), { rate: 0.92 }), 280)
}

function renderPictureChoices(items, isRight) {
  const grid = document.getElementById('grid')
  grid.className = 'grid'
  grid.innerHTML = ''
  items.forEach((item) => {
    const btn = document.createElement('button')
    btn.className = 'tile'
    btn.type = 'button'
    btn.innerHTML = `<div class="emoji">${item.emoji}</div><div>${capitalize(item.word)}</div>`
    btn.addEventListener('click', () => onPick(btn, isRight(item), item.word))
    grid.appendChild(btn)
  })
}

function renderAnimalChoices(items) {
  const grid = document.getElementById('grid')
  grid.className = 'grid'
  grid.innerHTML = ''
  items.forEach((a) => {
    const btn = document.createElement('button')
    btn.className = 'tile'
    btn.type = 'button'
    const word = a.name || a.word
    btn.innerHTML = `<div class="emoji">${a.emoji}</div><div>${capitalize(word)}</div>`
    btn.addEventListener('click', () => {
      const ok = (a.id || a.word) === (currentItem.id || currentItem.word)
      onPick(btn, ok, word)
    })
    grid.appendChild(btn)
  })
}

function onPick(btn, ok, word) {
  if (ok) {
    btn.classList.add('correct')
    showMessage(`You read it! ${capitalize(word)} 🎉`)
    awardCorrect(word)
    document.getElementById('nextBtn').classList.remove('hidden')
  } else {
    btn.classList.add('wrong')
    showMessage('Try again — look at the sounds')
    setTimeout(() => btn.classList.remove('wrong'), 500)
  }
}

function awardCorrect(word) {
  profile.points += 1
  profile.stars += 1
  if (profile.milestone < STOPS.length - 1 && profile.stars >= STOPS[profile.milestone + 1]?.need) {
    profile.milestone += 1
  }
  if (profile.stars >= 3) profile.level = 2
  if (profile.stars >= 6) profile.level = 3
  const loot = grantLoot()
  bumpStreak()
  saveProfile()
  renderStops()
  renderChest()
  speak(capitalize(word), { rate: 0.9 }).then(() => announceLoot(loot))
  celebrate()
  buddyTrick('jump', true)
}

function awardSliceStar(word) {
  profile.points += 1
  profile.stars += 1
  if (profile.milestone < STOPS.length - 1 && profile.stars >= STOPS[profile.milestone + 1]?.need) {
    profile.milestone += 1
  }
  const loot = grantLoot()
  bumpStreak()
  saveProfile()
  renderStops()
  renderChest()
  return loot
}

function bumpStreak() {
  const today = new Date().toDateString()
  if (profile.lastDay === today) return
  const y = new Date(); y.setDate(y.getDate() - 1)
  profile.streak = profile.lastDay === y.toDateString() ? (profile.streak || 0) + 1 : 1
  profile.lastDay = today
}

function playBlend(item) {
  const tiles = [...document.querySelectorAll('#letterRow .letter-tile')]
  let chain = Promise.resolve()
  item.phon.forEach((p, i) => {
    chain = chain.then(async () => {
      tiles[i]?.classList.add('pop')
      if (i === 0) {
        try { window.speechSynthesis.cancel() } catch (e) {}
      }
      await playPhoneme(p)
      tiles[i]?.classList.remove('pop')
      await wait(140)
    })
  })
}

function speakPhoneme(item) {
  const phon = typeof item === 'string' ? item : (item.phon && item.phon[0]) || ''
  return playPhoneme(phon)
}

function continuantKind(phon) {
  const k = String(phon || '').toLowerCase().replace(/[^a-z]/g, '')
  if (k === 's' || k === 'sss' || k.startsWith('ss')) return 's'
  if (k === 'm' || k === 'mmm' || k.startsWith('mm')) return 'm'
  if (k === 'n' || k === 'nnn' || k.startsWith('nn')) return 'n'
  if (k === 'h' || k === 'hhh' || k.startsWith('hh') || k === 'huh') return 'h'
  if (k === 'f' || k === 'fff' || k.startsWith('ff')) return 'f'
  if (k === 'z' || k === 'zzz' || k.startsWith('zz')) return 'z'
  return null
}

function playPhoneme(phon) {
  const kind = continuantKind(phon)
  if (kind) return playContinuant(kind)
  return speak(naturalSound(phon), { rate: 0.88, isolated: true })
}

let audioCtx = null
function getAudioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!audioCtx) audioCtx = new AC()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function playContinuant(kind) {
  const ctx = getAudioCtx()
  if (!ctx) {
    const fallback = { s: 'suh', m: 'muh', n: 'nuh', h: 'huh', f: 'fuh', z: 'zuh' }
    return speak(fallback[kind] || 'suh', { rate: 0.88, isolated: true })
  }
  const dur = kind === 'h' ? 0.32 : 0.5
  const now = ctx.currentTime
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(kind === 's' || kind === 'f' || kind === 'z' ? 0.09 : kind === 'h' ? 0.05 : 0.12, now + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  gain.connect(ctx.destination)

  if (kind === 's' || kind === 'h' || kind === 'f' || kind === 'z') {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur))
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = kind === 's' || kind === 'z' ? 3800 : kind === 'f' ? 2200 : 900
    src.connect(hp)
    if (kind === 's' || kind === 'z') {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = kind === 'z' ? 4000 : 5500
      bp.Q.value = 0.7
      hp.connect(bp)
      bp.connect(gain)
    } else {
      hp.connect(gain)
    }
    src.start(now)
    src.stop(now + dur)
  } else {
    const o1 = ctx.createOscillator()
    const o2 = ctx.createOscillator()
    o1.type = 'sine'
    o2.type = 'sine'
    o1.frequency.value = kind === 'm' ? 140 : 180
    o2.frequency.value = kind === 'm' ? 280 : 360
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = kind === 'm' ? 450 : 650
    const g2 = ctx.createGain()
    g2.gain.value = 0.45
    o1.connect(lp)
    o2.connect(g2)
    g2.connect(lp)
    lp.connect(gain)
    o1.start(now)
    o2.start(now)
    o1.stop(now + dur)
    o2.stop(now + dur)
  }
  return wait(dur * 1000 + 50)
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function naturalSound(phon) {
  const key = String(phon || '').toLowerCase().trim()
  const map = {
    kuh: 'cuh', cuh: 'cuh',
    duh: 'duh',
    puh: 'puh',
    s: 'suh', sss: 'suh',
    h: 'huh', hhh: 'huh',
    buh: 'buh',
    m: 'muh', mmm: 'muh',
    aaa: 'aah', aah: 'aah',
    aw: 'aw',
    ih: 'ih',
    uh: 'uh',
    eh: 'eh',
    g: 'guh', guh: 'guh',
    t: 'tuh', tuh: 'tuh',
    luh: 'luh', l: 'luh',
    ruh: 'ruh', r: 'ruh',
    wuh: 'wuh', w: 'wuh',
    vuh: 'vuh', v: 'vuh',
    juh: 'juh', j: 'juh',
    ks: 'ks',
    f: 'fuh', z: 'zuh',
    n: 'nuh', nnn: 'nuh',
    p: 'puh',
    d: 'duh'
  }
  return map[key] || key
}

function prepareSpeech(text, opts = {}) {
  let t = String(text || '').replace(/\u2026/g, ',').replace(/\.{3,}/g, ',')
  t = t.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (opts.isolated) t = `${t},`
  else if (!/[.!?]$/.test(t)) t += '.'
  return `${t} `
}

function unlockSpeech() {
  if (unlockSpeech.ready) return
  unlockSpeech.ready = true
  getAudioCtx()
  if (!('speechSynthesis' in window)) return
  try {
    const warm = new SpeechSynthesisUtterance(' ')
    warm.volume = 0
    window.speechSynthesis.speak(warm)
    kickSpeechEngine()
  } catch (e) {}
}

function kickSpeechEngine() {
  try {
    window.speechSynthesis.pause()
    window.speechSynthesis.resume()
  } catch (e) {}
}

let currentUtterance = null
let speakTail = Promise.resolve()
let speechWatch = 0

function speak(text, opts = {}) {
  if (!('speechSynthesis' in window) || !text) return Promise.resolve()
  const interrupt = opts.interrupt !== false
  const run = () => new Promise((resolve) => {
    const said = prepareSpeech(text, opts)
    if (!said.trim()) { resolve(); return }
    const start = () => {
      const u = new SpeechSynthesisUtterance(said)
      currentUtterance = u
      if (!preferredVoice) loadVoices()
      if (preferredVoice) {
        u.voice = preferredVoice
        u.lang = preferredVoice.lang || 'en-US'
      } else {
        u.lang = 'en-US'
      }
      u.rate = opts.rate ?? 0.96
      u.pitch = opts.pitch ?? 1
      u.volume = 1
      let done = false
      const finish = () => {
        if (done) return
        done = true
        if (speechWatch) { clearInterval(speechWatch); speechWatch = 0 }
        resolve()
      }
      u.onend = finish
      u.onerror = finish
      window.speechSynthesis.speak(u)
      if (!opts.isolated) kickSpeechEngine()
      speechWatch = setInterval(kickSpeechEngine, 8000)
      setTimeout(finish, Math.min(12000, 1600 + said.length * 80))
    }
    if (interrupt) {
      try { window.speechSynthesis.cancel() } catch (e) {}
      setTimeout(start, 70)
    } else {
      start()
    }
  })
  if (interrupt) {
    speakTail = run()
    return speakTail
  }
  speakTail = speakTail.then(run, run)
  return speakTail
}

function loadVoices() {
  if (!('speechSynthesis' in window)) return
  voices = window.speechSynthesis.getVoices() || []
  const score = (v) => {
    const n = (v.name || '').toLowerCase()
    const uri = (v.voiceURI || '').toLowerCase()
    const lang = (v.lang || '').toLowerCase()
    const blob = `${n} ${uri}`
    if (!lang.startsWith('en')) return -10
    if (/compact|novelty|whisper|zarvox|boing|bubbles|bad news|jester|organ|trinoids|cellos|albert|bells|hysterical|junior|princess|ralph|bahh|deranged|good news|pipe organ|superstar|wobble/.test(n)) return -80
    let s = 0
    if (lang === 'en-us' || lang.startsWith('en-us')) s += 20
    else if (lang.startsWith('en')) s += 4
    if (v.localService) s += 8
    if (/neural|natural|premium|enhanced|siri|wavenet|studio/.test(blob)) s += 45
    if (/nicky/.test(n)) s += 55
    if (/\bava\b/.test(n)) s += 50
    if (/\bzoe\b/.test(n)) s += 48
    if (/allison/.test(n)) s += 40
    if (/google us english/.test(n)) s += 42
    if (/microsoft (aria|jenny|sara)/.test(n)) s += 40
    if (/samantha/.test(n) && /premium|enhanced/.test(blob)) s += 22
    else if (/samantha/.test(n)) s += 4
    return s
  }
  preferredVoice = [...voices].sort((a, b) => score(b) - score(a))[0] || null
}

function renderLessons() {
  const body = document.getElementById('lessonsBody')
  body.innerHTML = ''
  const list = document.createElement('div')
  list.className = 'lesson-list'
  LESSONS.forEach((lesson) => {
    const card = document.createElement('div')
    card.className = 'lesson-card'
    const title = document.createElement('div')
    title.style.fontWeight = 800
    title.textContent = lesson.title
    card.appendChild(title)
    lesson.words.forEach((w) => {
      const wc = document.createElement('div')
      wc.className = 'word-card'
      wc.innerHTML = `<div class="word-letters">${annotateWordHTML(w)}</div><div class="word-actions"><button class="secondary hear" data-word="${w}" type="button">Hear</button><button class="ghost read" data-word="${w}" type="button">I read it</button></div>`
      card.appendChild(wc)
    })
    list.appendChild(card)
  })
  body.appendChild(list)
  body.querySelectorAll('.hear').forEach((b) => b.addEventListener('click', (e) => speak(e.currentTarget.dataset.word)))
  body.querySelectorAll('.read').forEach((b) => b.addEventListener('click', (e) => {
    const word = e.currentTarget.dataset.word
    profile.points += 1
    profile.stars += 1
    const loot = grantLoot()
    saveProfile(); renderStops(); renderChest(); celebrate()
    speak(word).then(() => announceLoot(loot))
  }))
}

function annotateWordHTML(word) {
  const lower = word.toLowerCase()
  const vowelPairs = ['ai', 'ea', 'oa', 'ee', 'ie', 'ue']
  let html = ''
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i]
    const next = lower[i + 1] || ''
    let cls = ''
    if ('aeiou'.includes(ch)) {
      const pair = ch + next
      if (vowelPairs.includes(pair)) cls = 'vowel-long'
      else if (lower.endsWith('e') && i === lower.length - 3 && !'aeiou'.includes(lower[i + 1])) cls = 'vowel-long'
      else cls = 'vowel-short'
    }
    html += `<span class="letter-tile ${cls}" style="width:auto;height:auto;padding:4px 6px;font-size:22px">${ch.toUpperCase()}</span>`
  }
  return html
}

function runPlacement() {
  currentGame = 'sounds'
  openGame('sounds')
  showMessage('Starter check: tap what you hear. This finds your starting stop.')
}

const SESSION_MS = 15 * 60 * 1000
let sessionTickId = 0

function fmtMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function startSessionClock() {
  sessionStorage.setItem('rt_session_start', String(Date.now()))
  document.getElementById('sessionBar')?.classList.remove('hidden')
  tickSession()
  clearInterval(sessionTickId)
  sessionTickId = setInterval(tickSession, 1000)
}

function tickSession() {
  const bar = document.getElementById('sessionBar')
  const fill = document.getElementById('sessionFill')
  const label = document.getElementById('sessionLabel')
  if (!bar || !fill || !label) return
  const start = Number(sessionStorage.getItem('rt_session_start') || Date.now())
  const elapsed = Math.max(0, Date.now() - start)
  const pct = Math.min(100, (elapsed / SESSION_MS) * 100)
  fill.style.width = pct + '%'
  if (elapsed >= SESSION_MS) {
    label.textContent = '15:00 / 15:00 · nice reading!'
    fill.style.width = '100%'
  } else {
    label.textContent = `${fmtMs(elapsed)} / 15:00`
  }
  bar.setAttribute('aria-valuenow', String(Math.min(15, Math.round(elapsed / 60000))))
}

function beginSession(n) {
  profile.name = n || 'Friend'
  saveProfile()
  greet()
  renderStops()
  renderGames()
  renderChest()
  showView('home')
  buddyTrick('wave')
  unlockSpeech()
  startSessionClock()
  speak(`Hi, ${profile.name}. Let's read.`)
}

function showMessage(text) {
  const el = document.getElementById('message')
  if (el) el.textContent = text || ''
}
function clearMessage() { showMessage('') }

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function shuffleCopy(a) { return shuffle(a.slice()) }
function capitalize(s) { return (s || '').charAt(0).toUpperCase() + (s || '').slice(1) }

const TRICKS = ['wave', 'spin', 'jump', 'wiggle', 'dance', 'peek', 'giggle']
const JOKES = [
  { trick: 'giggle', say: 'I tried to eat a book. It tasted like paper, and a tiny silent e.' },
  { trick: 'spin', say: 'If I spin too fast, cat turns into tac. Whoa.' },
  { trick: 'jump', say: 'Boing. I jumped over a short word and almost missed it.' },
  { trick: 'dance', say: 'A, E, I, O, U, and sometimes wowee. Dance with me.' },
  { trick: 'wiggle', say: 'My ears get mixed up. Left is buh. Right is duh.' },
  { trick: 'peek', say: 'Peekaboo. I was hiding behind a balloon. Pop.' },
  { trick: 'wave', say: 'Hi there. I can hiss like a snake.' }
]
function buddyTrick(name, silent) {
  const el = document.getElementById('buddy')
  if (!el) return
  TRICKS.forEach((t) => el.classList.remove(t))
  const trick = name || TRICKS[Math.floor(Math.random() * TRICKS.length)]
  el.classList.add(trick)
  setTimeout(() => el.classList.remove(trick), 1300)
  if (silent) return
}
function buddyJoke() {
  const joke = JOKES[Math.floor(Math.random() * JOKES.length)]
  buddyTrick(joke.trick, true)
  const bubble = document.getElementById('buddyBubble')
  if (bubble) {
    bubble.textContent = joke.say
    bubble.classList.remove('hidden')
    clearTimeout(buddyJoke.t)
    buddyJoke.t = setTimeout(() => bubble.classList.add('hidden'), 5000)
  }
  speak(joke.say)
}

function celebrate() {
  spawnConfetti(80)
  try {
    const ctx = getAudioCtx()
    if (!ctx) return
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.type = 'sine'; o.frequency.value = 880
    g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination)
    o.start(); o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15)
    o.stop(ctx.currentTime + 0.4)
  } catch (e) {}
}
function setupConfetti() {
  if (!confettiCanvas) return
  confettiCtx = confettiCanvas.getContext('2d')
  const resize = () => { confettiCanvas.width = innerWidth; confettiCanvas.height = innerHeight }
  resize(); addEventListener('resize', resize)
  requestAnimationFrame(confettiFrame)
}
function spawnConfetti(n) {
  if (!confettiCanvas) return
  for (let i = 0; i < n; i++) {
    confettiParticles.push({
      x: Math.random() * confettiCanvas.width, y: -10,
      vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 5,
      size: 6 + Math.random() * 8,
      color: ['#FF6B81', '#FFD166', '#7EE7C1', '#89C2FF', '#C58BFF'][Math.floor(Math.random() * 5)],
      rot: Math.random() * 360, rotV: (Math.random() - 0.5) * 8
    })
  }
}
function confettiFrame() {
  if (!confettiCtx) { requestAnimationFrame(confettiFrame); return }
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height)
  for (let i = confettiParticles.length - 1; i >= 0; i--) {
    const p = confettiParticles[i]
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.rot += p.rotV
    confettiCtx.save(); confettiCtx.translate(p.x, p.y); confettiCtx.rotate(p.rot * Math.PI / 180)
    confettiCtx.fillStyle = p.color; confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
    confettiCtx.restore()
    if (p.y > confettiCanvas.height + 40) confettiParticles.splice(i, 1)
  }
  requestAnimationFrame(confettiFrame)
}

async function init() {
  loadProfile()
  animals = await fetch('animals.json').then((r) => r.json()).catch(() => [])
  document.getElementById('startBtn').addEventListener('click', () => {
    unlockSpeech()
    const n = (document.getElementById('childName').value || '').trim()
    beginSession(n || 'Friend')
  })
  document.getElementById('continueBtn').addEventListener('click', () => {
    unlockSpeech()
    beginSession(profile.name)
  })
  document.getElementById('backBtn').addEventListener('click', () => showView('home'))
  document.getElementById('lessonsBack').addEventListener('click', () => showView('home'))
  document.getElementById('nextBtn').addEventListener('click', startRound)
  document.getElementById('sliceBack').addEventListener('click', () => { stopSlice(); showView('games') })
  document.getElementById('sliceNext').addEventListener('click', startSliceRound)
  document.getElementById('sliceHear').addEventListener('click', () => {
    unlockSpeech()
    if (currentItem) speakPhoneme(currentItem)
  })
  bindSlicePointer()
  document.getElementById('hearBtn').addEventListener('click', () => {
    unlockSpeech()
    if (!currentItem) return
    if (currentGame === 'blend' || currentGame === 'builder') playBlend(currentItem)
    else if (currentGame === 'sounds' || currentGame === 'slice' || currentGame === 'odd') speakPhoneme(currentItem)
    else if (currentGame === 'rhyme' || currentGame === 'vowel') speak(capitalize(currentItem.word), { rate: 0.92 })
    else showMessage('You say it first — then we cheer')
  })
  document.getElementById('placeBtn').addEventListener('click', runPlacement)
  document.getElementById('resetProgress').addEventListener('click', () => {
    if (!confirm('Reset stars, gems, and treasures?')) return
    const name = profile.name
    profile = { name, points: 0, stars: 0, gems: 0, streak: 0, lastDay: null, milestone: 0, level: 1, loot: [] }
    saveProfile(); renderStops(); renderGames(); renderChest()
    const buddy = document.getElementById('buddy')
    buddy?.classList.remove('wear-hat', 'wear-glasses', 'wear-cape')
  })
  document.getElementById('megaTreasure').addEventListener('click', () => showView('chest'))
  document.getElementById('buddy').addEventListener('click', (e) => {
    e.preventDefault()
    unlockSpeech()
    buddyJoke()
  })
  document.querySelectorAll('.dock-btn').forEach((b) => {
    b.addEventListener('click', () => {
      if (!profile.name) { showView('welcome'); return }
      const v = b.dataset.view
      if (v === 'games') renderGames()
      if (v === 'chest') renderChest()
      if (v === 'home') renderStops()
      showView(v)
    })
  })
  if ('speechSynthesis' in window) {
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
    setTimeout(loadVoices, 250)
    setTimeout(loadVoices, 1000)
  }
  setupConfetti()
  setInterval(() => buddyTrick(null, true), 9000)

  if (profile.name) {
    document.getElementById('savedName').textContent = profile.name
    document.getElementById('continueBtn').classList.remove('hidden')
    greet(); renderStops(); renderGames(); renderChest()
    showView('home')
    startSessionClock()
  } else {
    showView('welcome')
  }

  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  if (standalone) {
    document.getElementById('installHint')?.classList.add('hidden')
    document.getElementById('homeInstall')?.classList.add('hidden')
  }
}

window.addEventListener('load', init)
