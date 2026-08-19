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
  { id: 'blend', title: 'Blend Machine', ico: '🧩', blurb: 'Hear each sound, then blend them into a word.', skill: 'Decoding', unlock: 1 },
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
  { word: 'cat', emoji: '🐱', start: 'c', sounds: ['c', 'a', 't'], phon: ['kuh', 'aaa', 't'] },
  { word: 'dog', emoji: '🐶', start: 'd', sounds: ['d', 'o', 'g'], phon: ['duh', 'aw', 'g'] },
  { word: 'pig', emoji: '🐷', start: 'p', sounds: ['p', 'i', 'g'], phon: ['puh', 'ih', 'g'] },
  { word: 'sun', emoji: '☀️', start: 's', sounds: ['s', 'u', 'n'], phon: ['sss', 'uh', 'n'] },
  { word: 'hat', emoji: '🎩', start: 'h', sounds: ['h', 'a', 't'], phon: ['hhh', 'aaa', 't'] },
  { word: 'bed', emoji: '🛏️', start: 'b', sounds: ['b', 'e', 'd'], phon: ['buh', 'eh', 'd'] },
  { word: 'cup', emoji: '🥤', start: 'c', sounds: ['c', 'u', 'p'], phon: ['kuh', 'uh', 'p'] },
  { word: 'map', emoji: '🗺️', start: 'm', sounds: ['m', 'a', 'p'], phon: ['mmm', 'aaa', 'p'] },
  { word: 'pen', emoji: '🖊️', start: 'p', sounds: ['p', 'e', 'n'], phon: ['puh', 'eh', 'n'] },
  { word: 'bus', emoji: '🚌', start: 'b', sounds: ['b', 'u', 's'], phon: ['buh', 'uh', 'sss'] }
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
  LOOT.forEach((t) => {
    if (profile.stars >= t.need && !profile.loot.includes(t.id)) {
      profile.loot.push(t.id)
      celebrate()
      showMessage(`Reward: ${t.name} ${t.emoji}`)
    }
  })
  profile.gems = Math.floor(profile.points / 2)
  saveProfile()
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
    const have = profile.loot.includes(t.id) || profile.stars >= t.need
    const card = document.createElement('div')
    card.className = `loot-card ${have ? '' : 'is-lock'}`
    card.innerHTML = `<div class="ico">${have ? t.emoji : '❔'}</div><h3>${have ? t.name : 'Mystery reward'}</h3><p>${have ? t.blurb : `Earn ${t.need} stars`}</p>`
    grid.appendChild(card)
  })
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
    requestAnimationFrame(() => startSlice())
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
  else if (currentGame === 'slice') startSlice()
  else startSafari()
}

let sliceRunning = false
let sliceWon = false
let sliceBalloons = []
let sliceRaf = 0
let slashPts = []
let slicing = false

function stopSlice() {
  sliceRunning = false
  if (sliceRaf) cancelAnimationFrame(sliceRaf)
  sliceRaf = 0
  sliceBalloons = []
}

function startSlice() {
  stopSlice()
  sliceWon = false
  document.getElementById('sliceNext').classList.add('hidden')
  document.getElementById('sliceMessage').textContent = ''
  const target = CVC[Math.floor(Math.random() * CVC.length)]
  currentItem = target
  const others = shuffleCopy(CVC.filter((w) => w.start !== target.start)).slice(0, 3)
  const pack = shuffleCopy([target, ...others])
  document.getElementById('sliceSound').textContent = `/${target.sounds[0]}/`
  document.getElementById('sliceModel').textContent = 'Listen. Slice the balloon that starts with that sound.'
  const layer = document.getElementById('balloons')
  layer.innerHTML = ''
  const arena = document.getElementById('sliceArena')
  const canvas = document.getElementById('slashCanvas')
  canvas.width = arena.clientWidth
  canvas.height = arena.clientHeight
  pack.forEach((item, i) => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = `balloon c${i}`
    el.innerHTML = `<span class="body"><small>${item.emoji}</small>${item.word}</span><span class="string"></span>`
    layer.appendChild(el)
    sliceBalloons.push({
      el,
      item,
      x: 18 + i * 22 + Math.random() * 6,
      y: 108 + Math.random() * 18,
      vx: (Math.random() - 0.5) * 0.28,
      vy: -0.28 - Math.random() * 0.12
    })
  })
  sliceRunning = true
  sliceTick()
  setTimeout(() => speakPhoneme(target.phon[0]), 350)
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
      b.y = 112
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
  if (sliceWon || b.dead) return
  const ok = b.item.start === currentItem.start
  if (ok) {
    b.dead = true
    b.el.classList.add('is-pop')
    sliceWon = true
    sliceRunning = false
    document.getElementById('sliceMessage').textContent = `You sliced ${capitalize(b.item.word)}! 🎉`
    awardCorrect(b.item.word)
    document.getElementById('sliceNext').classList.remove('hidden')
  } else {
    b.el.classList.remove('is-wrong')
    void b.el.offsetWidth
    b.el.classList.add('is-wrong')
    document.getElementById('sliceMessage').textContent = `${capitalize(b.item.word)} starts with /${b.item.sounds[0]}/. Listen again.`
    speakPhoneme(currentItem.phon[0])
  }
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

function distractors(keep, pool, n) {
  const rest = shuffleCopy(pool.filter((p) => p.word !== keep.word && p.emoji !== keep.emoji))
  return shuffleCopy([keep, ...rest.slice(0, n - 1)])
}

function startSounds() {
  currentItem = CVC[Math.floor(Math.random() * CVC.length)]
  document.getElementById('modelLine').textContent = 'Listen to the first sound. Then tap the matching picture.'
  document.getElementById('targetName').textContent = `/${currentItem.sounds[0]}/`
  document.getElementById('letterRow').innerHTML = `<div class="letter-tile">${currentItem.sounds[0].toUpperCase()}</div>`
  renderPictureChoices(distractors(currentItem, CVC, 4), (choice) => choice.word === currentItem.word)
  setTimeout(() => speakPhoneme(currentItem.phon[0]), 300)
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

function renderPictureChoices(items, isRight) {
  const grid = document.getElementById('grid')
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
  grantLoot()
  bumpStreak()
  saveProfile()
  renderStops()
  renderChest()
  speak(`${capitalize(word)}. Great listening!`)
  celebrate()
  buddyTrick('jump')
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
  item.phon.forEach((p, i) => {
    setTimeout(() => {
      tiles[i]?.classList.add('pop')
      speakPhoneme(p)
      setTimeout(() => tiles[i]?.classList.remove('pop'), 400)
    }, i * 700)
  })
}

function speakPhoneme(p) {
  speak(p)
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
    speak(word)
    profile.points += 1
    profile.stars += 1
    grantLoot()
    saveProfile(); renderStops(); renderChest(); celebrate()
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

function beginSession(n) {
  profile.name = n || 'Friend'
  saveProfile()
  greet()
  renderStops()
  renderGames()
  renderChest()
  showView('home')
  buddyTrick('wave')
  speak(`Hi ${profile.name}! Let's read.`)
}

function speak(text) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  if (preferredVoice) u.voice = preferredVoice
  u.rate = 0.92
  u.pitch = 1.08
  window.speechSynthesis.speak(u)
}

function loadVoices() {
  voices = window.speechSynthesis.getVoices()
  const names = ['samantha', 'siri', 'karen', 'moira', 'fiona', 'daniel']
  preferredVoice = voices.find((v) => names.some((n) => v.name.toLowerCase().includes(n))) || voices.find((v) => v.lang.startsWith('en')) || null
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
  { trick: 'giggle', say: 'I tried to eat a book. It tasted like paper... and a tiny silent e!' },
  { trick: 'spin', say: 'If I spin too fast, cat turns into tac! Whoa!' },
  { trick: 'jump', say: 'Boing! I jumped over a short word. It was so little I almost missed it!' },
  { trick: 'dance', say: 'A, E, I, O, U, and sometimes wowee! Dance with me!' },
  { trick: 'wiggle', say: 'My ears get mixed up. Left ear is b. Right ear is d. Wiggle wiggle!' },
  { trick: 'peek', say: 'Peekaboo! I was hiding behind a balloon. Pop!' },
  { trick: 'wave', say: 'Hi! I can hiss like a snake. Listen: ssssss. That is the sound of s!' }
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
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
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
    const n = (document.getElementById('childName').value || '').trim()
    beginSession(n || 'Friend')
  })
  document.getElementById('continueBtn').addEventListener('click', () => beginSession(profile.name))
  document.getElementById('backBtn').addEventListener('click', () => showView('home'))
  document.getElementById('lessonsBack').addEventListener('click', () => showView('home'))
  document.getElementById('nextBtn').addEventListener('click', startRound)
  document.getElementById('sliceBack').addEventListener('click', () => { stopSlice(); showView('games') })
  document.getElementById('sliceNext').addEventListener('click', startSlice)
  document.getElementById('sliceHear').addEventListener('click', () => {
    if (currentItem) speakPhoneme(currentItem.phon[0])
  })
  bindSlicePointer()
  document.getElementById('hearBtn').addEventListener('click', () => {
    if (currentGame === 'blend' && currentItem) playBlend(currentItem)
    else if (currentGame === 'sounds' && currentItem) speakPhoneme(currentItem.phon[0])
    else if (currentGame === 'slice' && currentItem) speakPhoneme(currentItem.phon[0])
    else if (currentItem) { showMessage('You say it first — then we cheer') }
  })
  document.getElementById('placeBtn').addEventListener('click', runPlacement)
  document.getElementById('resetProgress').addEventListener('click', () => {
    if (!confirm('Reset stars, gems, and treasures?')) return
    const name = profile.name
    profile = { name, points: 0, stars: 0, gems: 0, streak: 0, lastDay: null, milestone: 0, level: 1, loot: [] }
    saveProfile(); renderStops(); renderGames(); renderChest()
  })
  document.getElementById('megaTreasure').addEventListener('click', () => showView('chest'))
  document.getElementById('buddy').addEventListener('click', (e) => {
    e.preventDefault()
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
  loadVoices()
  window.speechSynthesis.onvoiceschanged = loadVoices
  setupConfetti()
  setInterval(() => buddyTrick(null, true), 9000)

  if (profile.name) {
    document.getElementById('savedName').textContent = profile.name
    document.getElementById('continueBtn').classList.remove('hidden')
    greet(); renderStops(); renderGames(); renderChest()
    showView('home')
  } else {
    showView('welcome')
  }
}

window.addEventListener('load', init)
