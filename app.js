/* Luma Reads — simple sight-word + picture-word trainer */
const STORAGE_KEY = 'luma_reads_v1'
const SESSION_MS = 5 * 60 * 1000

const SIGHT_WORDS = [
  'the', 'a', 'I', 'to', 'and', 'you', 'it', 'in', 'is', 'was',
  'for', 'on', 'are', 'as', 'with', 'his', 'they', 'at', 'be', 'this',
  'have', 'from', 'or', 'one', 'had', 'by', 'but', 'not', 'what', 'all',
  'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'an', 'each',
  'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other', 'about',
  'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make',
  'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go',
  'see', 'number', 'no', 'way', 'could', 'people', 'my', 'than', 'first', 'water',
  'been', 'call', 'who', 'oil', 'sit', 'now', 'find', 'long', 'down', 'day',
  'did', 'get', 'come', 'made', 'may', 'part'
]

/* Grade-1 picture words: CVC / digraph / simple blends only */
const PICTURE_WORDS = [
  { word: 'cat', emoji: '🐱' }, { word: 'dog', emoji: '🐶' }, { word: 'sun', emoji: '☀️' },
  { word: 'hat', emoji: '🎩' }, { word: 'cup', emoji: '🥤' }, { word: 'bed', emoji: '🛏️' },
  { word: 'bus', emoji: '🚌' }, { word: 'map', emoji: '🗺️' }, { word: 'jam', emoji: '🍯' },
  { word: 'box', emoji: '📦' }, { word: 'web', emoji: '🕸️' }, { word: 'pig', emoji: '🐷' },
  { word: 'fox', emoji: '🦊' }, { word: 'hen', emoji: '🐔' }, { word: 'van', emoji: '🚐' },
  { word: 'ship', emoji: '🚢' }, { word: 'fish', emoji: '🐟' }, { word: 'duck', emoji: '🦆' },
  { word: 'sock', emoji: '🧦' }, { word: 'bell', emoji: '🔔' }, { word: 'ball', emoji: '⚽' },
  { word: 'drum', emoji: '🥁' }, { word: 'lamp', emoji: '💡' }, { word: 'nest', emoji: '🪺' },
  { word: 'frog', emoji: '🐸' }, { word: 'crab', emoji: '🦀' }, { word: 'flag', emoji: '🚩' },
  { word: 'star', emoji: '⭐' }, { word: 'moon', emoji: '🌙' }, { word: 'book', emoji: '📕' },
  { word: 'cake', emoji: '🍰' }, { word: 'bike', emoji: '🚲' }, { word: 'kite', emoji: '🪁' },
  { word: 'boat', emoji: '⛵' }, { word: 'tree', emoji: '🌳' }, { word: 'rain', emoji: '🌧️' }
]

const WISE_FUNNY = [
  { trick: 'giggle', say: 'Tiny tip from a pirate bird: slow eyes make fast readers.' },
  { trick: 'spin', say: 'I spun around and still remembered the word. Practice sticks better than glue.' },
  { trick: 'jump', say: 'Jump for joy, then land on the sounds. Words love brave voices.' },
  { trick: 'dance', say: 'Vowels are the music. Consonants keep the beat. Together they make a song you can read.' },
  { trick: 'wiggle', say: 'If a word feels wiggly, look under it. The line is your little road.' },
  { trick: 'wave', say: 'Ahoy. Mistakes are just practice wearing a funny hat.' },
  { trick: 'jump', say: 'Captain Pip says: read it once with your eyes, once with your voice.' },
  { trick: 'dance', say: 'Wisdom of the week: a calm breath beats a hurried guess.' },
  { trick: 'wiggle', say: 'Shiver me feathers. Digraphs stick together like best friends — sh, ch, th.' },
  { trick: 'spin', say: 'Treasure maps start with one step. Your next word is that step.' }
]

const TRICKS = ['wave', 'spin', 'jump', 'wiggle', 'dance', 'giggle']

let profile = { name: '', points: 0 }
let mode = null
let sessionStart = 0
let sessionTick = 0
let sessionDone = false
let practiced = []
let current = null
let pickLocked = false
let preferredVoice = null
let voices = []
let recognition = null
let confettiCtx = null
let confettiParticles = []

const $ = (id) => document.getElementById(id)

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) profile = { ...profile, ...JSON.parse(raw) }
  } catch (e) {}
  if (profile.name) {
    $('savedName').textContent = profile.name
    $('continueBtn').classList.remove('hidden')
    $('childName').value = profile.name
  }
}

function saveProfile() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === name))
}

function setPoints(n) {
  profile.points = Math.max(0, n)
  $('points').textContent = String(profile.points)
  $('points').parentElement.classList.add('is-bump')
  setTimeout(() => $('points').parentElement.classList.remove('is-bump'), 350)
  saveProfile()
}

function addPoints(delta) {
  setPoints(profile.points + delta)
}

function unlockSpeech() {
  try {
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    speechSynthesis.speak(u)
    speechSynthesis.cancel()
  } catch (e) {}
}

function pickVoice() {
  voices = speechSynthesis.getVoices() || []
  let best = null
  let score = -1
  for (const v of voices) {
    const blob = `${v.name} ${v.lang}`.toLowerCase()
    if (!/en/.test(blob)) continue
    let s = 0
    if (/en-us|en_us|english/.test(blob)) s += 20
    if (/child|kids|samantha|karen|moira|zira|jenny|aria/.test(blob)) s += 40
    if (/female|woman|girl/.test(blob)) s += 10
    if (/google/.test(blob)) s += 8
    if (s > score) { score = s; best = v }
  }
  preferredVoice = best
}

function speak(text, opts = {}) {
  return new Promise((resolve) => {
    try {
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = opts.rate ?? 0.92
      u.pitch = opts.pitch ?? 1.05
      if (preferredVoice) u.voice = preferredVoice
      u.onend = () => resolve()
      u.onerror = () => resolve()
      speechSynthesis.speak(u)
    } catch (e) { resolve() }
  })
}

function buddyTrick(name, silent) {
  const el = $('buddy')
  if (!el) return
  TRICKS.forEach((t) => el.classList.remove(t))
  const trick = name || TRICKS[Math.floor(Math.random() * TRICKS.length)]
  el.classList.add(trick)
  setTimeout(() => el.classList.remove(trick), 1200)
  if (silent) return
}

function buddySay(line, trick) {
  buddyTrick(trick || 'wave', true)
  const bubble = $('bubble')
  bubble.textContent = line
  bubble.classList.remove('hidden')
  clearTimeout(buddySay._t)
  buddySay._t = setTimeout(() => bubble.classList.add('hidden'), 4800)
  return speak(line, { rate: 0.94 })
}

function buddyJoke() {
  const j = WISE_FUNNY[Math.floor(Math.random() * WISE_FUNNY.length)]
  return buddySay(j.say, j.trick)
}

/* reading.com-style grapheme underlines */
function splitGraphemes(word) {
  const digraphs = ['ch', 'sh', 'th', 'wh', 'ph', 'ck', 'ng', 'qu']
  const lower = String(word).toLowerCase()
  const parts = []
  let i = 0
  while (i < lower.length) {
    const two = lower.slice(i, i + 2)
    if (digraphs.includes(two)) {
      parts.push({ text: word.slice(i, i + 2), kind: 'digraph' })
      i += 2
      continue
    }
    const ch = word[i]
    const soft = ch.toLowerCase()
    let kind = 'consonant'
    if ('aeiou'.includes(soft)) kind = 'vowel'
    if (soft === 'y' && i > 0) kind = 'vowel'
    if (soft === 'e' && i === lower.length - 1 && lower.length > 2) kind = 'silent'
    parts.push({ text: ch, kind })
    i += 1
  }
  return parts
}

function renderUnderlinedWord(word) {
  const parts = splitGraphemes(word)
  return `<div class="word-line" aria-label="${word}">${parts.map((p, idx) =>
    `<span class="glyph is-${p.kind}" style="animation-delay:${idx * 40}ms">
      <span class="glyph-ch">${escapeHtml(p.text)}</span>
      <span class="glyph-bar" style="animation-delay:${80 + idx * 45}ms"></span>
    </span>`
  ).join('')}</div>`
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function shuffleCopy(a) { return shuffle(a.slice()) }

function fmtMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function startTimer() {
  sessionStart = Date.now()
  sessionDone = false
  $('timer').classList.remove('hidden')
  tickTimer()
  clearInterval(sessionTick)
  sessionTick = setInterval(tickTimer, 250)
}

function stopTimer() {
  clearInterval(sessionTick)
}

function tickTimer() {
  const elapsed = Date.now() - sessionStart
  const pct = Math.min(100, (elapsed / SESSION_MS) * 100)
  $('timerFill').style.width = pct + '%'
  $('timerLabel').textContent = `${fmtMs(elapsed)} / 5:00`
  $('timer').setAttribute('aria-valuenow', String(Math.min(5, Math.round(elapsed / 60000))))
  if (!sessionDone && elapsed >= SESSION_MS) {
    sessionDone = true
    finishSession()
  }
}

function beginApp(name) {
  profile.name = (name || 'Friend').trim() || 'Friend'
  saveProfile()
  $('hello').textContent = `Hi, ${profile.name}!`
  showView('home')
  buddySay(`Ahoy, ${profile.name}. Pick a practice. Five sunny minutes, then a surprise.`, 'wave')
}

function startMode(nextMode) {
  mode = nextMode
  practiced = []
  pickLocked = false
  showView('play')
  startTimer()
  $('status').textContent = ''
  if (mode === 'sight') {
    $('coach').textContent = 'Look at the word. Say it out loud.'
    nextSight()
  } else {
    $('coach').textContent = 'Read the word. Tap the matching picture.'
    nextSymbol()
  }
}

function rememberPractice(word) {
  if (!practiced.includes(word.toLowerCase())) practiced.push(word.toLowerCase())
}

function celebrateCorrect(word) {
  addPoints(1)
  rememberPractice(word)
  spawnConfetti(50)
  buddyTrick('jump', true)
  const line = `Well done, ${profile.name}! ${word}.`
  $('status').textContent = line
  return speak(line, { rate: 0.95, pitch: 1.08 })
}

function nextSight() {
  if (sessionDone) return
  pickLocked = false
  const word = SIGHT_WORDS[Math.floor(Math.random() * SIGHT_WORDS.length)]
  current = { word, emoji: '⭐' }
  const tone = ['tone-a', 'tone-b', 'tone-c'][Math.floor(Math.random() * 3)]
  $('board').innerHTML = `
    <div class="word-stage ${tone}">
      <div class="word-ico" aria-hidden="true">🌟</div>
      ${renderUnderlinedWord(word)}
    </div>`
  $('controls').innerHTML = `
    <button class="btn secondary" id="hearBtn" type="button">Hear a hint</button>
    <button class="btn mic" id="micBtn" type="button">🎤 Say it</button>
    <button class="btn primary" id="yesBtn" type="button">I said it!</button>`
  $('status').textContent = ''
  $('hearBtn').onclick = () => speak(word, { rate: 0.86 })
  $('yesBtn').onclick = () => onSightCorrect(word)
  $('micBtn').onclick = () => {
    unlockSpeech()
    $('micBtn').classList.add('is-on')
    $('status').textContent = 'Listening…'
    listenForWord(word, () => {
      $('micBtn').classList.remove('is-on')
      onSightCorrect(word)
    }, (heard) => {
      $('micBtn').classList.remove('is-on')
      $('status').textContent = heard
        ? `I heard “${heard}”. Try ${word} again.`
        : 'Try again, or tap I said it.'
      playTone(180, 0.12)
    })
  }
}

async function onSightCorrect(word) {
  if (pickLocked || sessionDone) return
  pickLocked = true
  await celebrateCorrect(word)
  if (sessionDone) return
  setTimeout(() => nextSight(), 900)
}

function nextSymbol() {
  if (sessionDone) return
  pickLocked = false
  const item = PICTURE_WORDS[Math.floor(Math.random() * PICTURE_WORDS.length)]
  current = item
  const distractors = shuffleCopy(PICTURE_WORDS.filter((w) => w.word !== item.word)).slice(0, 3)
  const choices = shuffleCopy([item, ...distractors])
  const tone = ['tone-a', 'tone-b', 'tone-c'][Math.floor(Math.random() * 3)]
  $('board').innerHTML = `
    <div class="word-stage ${tone}">
      ${renderUnderlinedWord(item.word)}
    </div>
    <div class="choices" id="choices"></div>`
  const box = $('choices')
  choices.forEach((c) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'choice'
    btn.setAttribute('aria-label', c.word)
    btn.textContent = c.emoji
    btn.onclick = () => onSymbolPick(btn, c.word === item.word, item.word)
    box.appendChild(btn)
  })
  $('controls').innerHTML = `<button class="btn secondary" id="hearBtn" type="button">Hear the word</button>`
  $('status').textContent = ''
  $('hearBtn').onclick = () => speak(item.word, { rate: 0.88 })
}

async function onSymbolPick(btn, ok, word) {
  if (pickLocked || sessionDone) return
  if (!ok) {
    btn.classList.add('wrong')
    playTone(180, 0.12)
    $('status').textContent = 'Not that one — look again.'
    setTimeout(() => btn.classList.remove('wrong'), 400)
    return
  }
  pickLocked = true
  btn.classList.add('correct')
  await celebrateCorrect(word)
  if (sessionDone) return
  setTimeout(() => nextSymbol(), 900)
}

function heardWord(blob, word) {
  const clean = String(blob || '').toLowerCase().replace(/[^a-z\s']/g, ' ')
  const target = String(word).toLowerCase()
  const tokens = clean.split(/\s+/).filter(Boolean)
  if (tokens.includes(target)) return true
  if (clean.includes(target)) return true
  // soft matches for short function words
  const aliases = {
    a: ['uh', 'ay'],
    i: ['eye'],
    to: ['two', 'too'],
    for: ['four'],
    be: ['bee'],
    so: ['sew'],
    no: ['know'],
    one: ['won'],
    two: ['to', 'too'],
    write: ['right'],
    their: ['there', 'they’re', "they're"],
    there: ['their', "they're"]
  }
  const al = aliases[target] || []
  return tokens.some((t) => al.includes(t))
}

function listenForWord(word, onHit, onMiss) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Rec) {
    onMiss?.('')
    return
  }
  try { recognition?.abort?.() } catch (e) {}
  const rec = new Rec()
  recognition = rec
  rec.lang = 'en-US'
  rec.interimResults = false
  rec.maxAlternatives = 4
  rec.onresult = (ev) => {
    const texts = []
    for (let i = 0; i < ev.results.length; i++) {
      for (let j = 0; j < ev.results[i].length; j++) texts.push(ev.results[i][j].transcript)
    }
    const blob = texts.join(' ')
    if (heardWord(blob, word)) onHit?.(blob)
    else onMiss?.(blob)
  }
  rec.onerror = () => onMiss?.('')
  rec.onend = () => { if (recognition === rec) recognition = null }
  try { rec.start() } catch (e) { onMiss?.('') }
}

function buildSurpriseStory(words) {
  const picks = (words.length ? words : ['cat', 'sun', 'ship']).slice(0, 6)
  while (picks.length < 3) picks.push(PICTURE_WORDS[picks.length % PICTURE_WORDS.length].word)
  const [w1, w2, w3, w4 = 'day', w5 = 'friend', w6 = 'home'] = picks
  const name = profile.name || 'Friend'
  if (mode === 'sight') {
    return `${name} could see the word ${w1}. Then ${name} said ${w2} and ${w3}. ` +
      `When ${w4} came, they all said ${w5}. What a reading ${w6}!`
  }
  return `One bright morning, ${name} saw a ${w1} near a ${w2}. ` +
    `Along came a ${w3} and a little ${w4}. Together they found a ${w5} and went ${w6}. The end.`
}

function highlightStory(text, words) {
  const set = new Set(words.map((w) => w.toLowerCase()))
  return escapeHtml(text).replace(/\b([A-Za-z']+)\b/g, (m, w) => {
    if (set.has(w.toLowerCase()) || set.has(w)) return `<span class="hi">${w}</span>`
    return w
  })
}

function finishSession() {
  stopTimer()
  pickLocked = true
  try { recognition?.abort?.() } catch (e) {}
  const story = buildSurpriseStory(practiced)
  $('surpriseTitle').textContent = `Well done, ${profile.name}!`
  $('storyPage').innerHTML = highlightStory(story, practiced)
  showView('surprise')
  spawnConfetti(90)
  buddySay(`Five minutes of brave reading, ${profile.name}. Here is your surprise story!`, 'dance')
  $('hearStory').onclick = () => speak(story, { rate: 0.92 })
}

function playTone(freq, dur) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = freq
    o.type = 'sine'
    g.gain.value = 0.04
    o.connect(g); g.connect(ctx.destination)
    o.start(); o.stop(ctx.currentTime + dur)
    setTimeout(() => ctx.close(), 400)
  } catch (e) {}
}

function setupConfetti() {
  const canvas = $('confetti')
  if (!canvas) return
  confettiCtx = canvas.getContext('2d')
  const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight }
  resize()
  addEventListener('resize', resize)
  const frame = () => {
    confettiCtx.clearRect(0, 0, canvas.width, canvas.height)
    for (let i = confettiParticles.length - 1; i >= 0; i--) {
      const p = confettiParticles[i]
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.rot += p.rotV
      confettiCtx.save()
      confettiCtx.translate(p.x, p.y)
      confettiCtx.rotate(p.rot * Math.PI / 180)
      confettiCtx.fillStyle = p.color
      confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      confettiCtx.restore()
      if (p.y > canvas.height + 40) confettiParticles.splice(i, 1)
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

function spawnConfetti(n) {
  const canvas = $('confetti')
  if (!canvas) return
  const colors = ['#FF6B81', '#FFD166', '#7EE7C1', '#89C2FF', '#FF9F4A']
  for (let i = 0; i < n; i++) {
    confettiParticles.push({
      x: Math.random() * canvas.width,
      y: -10,
      vx: (Math.random() - 0.5) * 6,
      vy: 2 + Math.random() * 5,
      size: 6 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 8
    })
  }
}

function init() {
  loadProfile()
  pickVoice()
  speechSynthesis.onvoiceschanged = pickVoice
  setupConfetti()

  $('nameForm').addEventListener('submit', (e) => {
    e.preventDefault()
    unlockSpeech()
    beginApp($('childName').value)
  })
  $('continueBtn').addEventListener('click', () => {
    unlockSpeech()
    beginApp(profile.name)
  })
  $('modeSight').addEventListener('click', () => {
    unlockSpeech()
    startMode('sight')
  })
  $('modeSymbol').addEventListener('click', () => {
    unlockSpeech()
    startMode('symbol')
  })
  $('backHome').addEventListener('click', () => {
    stopTimer()
    sessionDone = true
    try { recognition?.abort?.() } catch (e) {}
    showView('home')
    buddySay(`Rest your eyes, ${profile.name}. Ready when you are.`, 'wave')
  })
  $('againBtn').addEventListener('click', () => {
    sessionDone = false
    $('timer').classList.add('hidden')
    showView('home')
  })
  $('buddy').addEventListener('click', () => {
    unlockSpeech()
    buddyJoke()
  })

  // Parent/dev shortcut: force surprise with sample words
  window.__lumaForceSurprise = (words) => {
    practiced = words || ['the', 'and', 'you', 'ship', 'cat', 'sun']
    mode = mode || 'sight'
    finishSession()
  }
  window.__lumaForceTimerEnd = () => {
    sessionStart = Date.now() - SESSION_MS - 100
    tickTimer()
  }
}

document.addEventListener('DOMContentLoaded', init)
