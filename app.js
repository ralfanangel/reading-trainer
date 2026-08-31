/* Luma Reads — simple sight-word + picture-word trainer */
const STORAGE_KEY = 'luma_reads_v1'
const SESSION_MS = 5 * 60 * 1000

/* Dolch Pre-Primer → Grade 1 (kid-friendly, high-frequency) */
/* True Grade-1 heart / irregular sight words (memorize as wholes) */
const HEART_WORDS = new Set([
  'a', 'i', 'the', 'to', 'you', 'of', 'was', 'are', 'said', 'have', 'one', 'two',
  'what', 'where', 'who', 'they', 'their', 'there', 'here', 'come', 'some', 'give',
  'could', 'would', 'were', 'from', 'into', 'want', 'does', 'done', 'gone', 'any',
  'many', 'once', 'walk', 'talk', 'know', 'by', 'my', 'his', 'her', 'our', 'your'
])

const SIGHT_WORDS = [
  'the', 'a', 'I', 'to', 'and', 'you', 'it', 'in', 'is', 'my',
  'me', 'we', 'he', 'she', 'see', 'can', 'go', 'up', 'on', 'at',
  'no', 'yes', 'look', 'said', 'for', 'here', 'come', 'was', 'are', 'have',
  'one', 'two', 'three', 'this', 'that', 'with', 'do', 'did', 'get', 'put',
  'away', 'down', 'find', 'not', 'all', 'but', 'out', 'so', 'went', 'will',
  'want', 'what', 'where', 'who', 'when', 'they', 'them', 'then', 'our', 'your',
  'from', 'into', 'saw', 'say', 'let', 'now', 'soon', 'please', 'thank', 'stop',
  'some', 'give', 'could', 'were', 'her', 'his', 'by', 'how', 'just', 'know'
]

/* Grade-1 picture words by difficulty tier */
const PICTURE_A = [
  { word: 'cat', emoji: '🐱' }, { word: 'dog', emoji: '🐶' }, { word: 'sun', emoji: '☀️' },
  { word: 'hat', emoji: '🧢' }, { word: 'cup', emoji: '🥤' }, { word: 'bed', emoji: '🛏️' },
  { word: 'bus', emoji: '🚌' }, { word: 'map', emoji: '🗺️' }, { word: 'jam', emoji: '🍓' },
  { word: 'box', emoji: '📦' }, { word: 'pig', emoji: '🐷' }, { word: 'fox', emoji: '🦊' },
  { word: 'hen', emoji: '🐔' }, { word: 'van', emoji: '🚐' }, { word: 'log', emoji: '🪵' },
  { word: 'pot', emoji: '🍲' }, { word: 'pen', emoji: '🖊️' }, { word: 'tub', emoji: '🛁' },
  { word: 'bee', emoji: '🐝' }, { word: 'cow', emoji: '🐮' }, { word: 'car', emoji: '🚗' }
]
const PICTURE_B = [
  { word: 'ship', emoji: '🚢' }, { word: 'fish', emoji: '🐟' }, { word: 'duck', emoji: '🦆' },
  { word: 'sock', emoji: '🧦' }, { word: 'bell', emoji: '🔔' }, { word: 'ball', emoji: '⚽' },
  { word: 'drum', emoji: '🥁' }, { word: 'nest', emoji: '🪺' }, { word: 'frog', emoji: '🐸' },
  { word: 'crab', emoji: '🦀' }, { word: 'flag', emoji: '🚩' }, { word: 'shop', emoji: '🏪' },
  { word: 'shell', emoji: '🐚' }, { word: 'gift', emoji: '🎁' }, { word: 'bird', emoji: '🐦' }
]
const PICTURE_C = [
  { word: 'star', emoji: '⭐' }, { word: 'moon', emoji: '🌙' }, { word: 'book', emoji: '📕' },
  { word: 'cake', emoji: '🍰' }, { word: 'bike', emoji: '🚲' }, { word: 'kite', emoji: '🪁' },
  { word: 'boat', emoji: '⛵' }, { word: 'tree', emoji: '🌳' }, { word: 'rain', emoji: '🌧️' },
  { word: 'leaf', emoji: '🍃' }, { word: 'sheep', emoji: '🐑' }, { word: 'goat', emoji: '🐐' },
  { word: 'home', emoji: '🏠' }
]
const PICTURE_WORDS = [...PICTURE_A, ...PICTURE_B, ...PICTURE_C]

const WISE_FUNNY = [
  { trick: 'giggle', say: 'Tiny tip from Captain Pip: slow eyes make fast readers.' },
  { trick: 'spin', say: 'I spun around and still remembered the word. Practice sticks better than glue.' },
  { trick: 'jump', say: 'Jump for joy, then land on the sounds. Words love brave voices.' },
  { trick: 'dance', say: 'Vowels are the music. Consonants keep the beat. Together they make a song you can read.' },
  { trick: 'wiggle', say: 'If a word feels wiggly, look under it. The colored line is your little road.' },
  { trick: 'wave', say: 'Ahoy. Mistakes are just practice wearing a funny hat.' },
  { trick: 'jump', say: 'Captain Pip says: read it once with your eyes, once with your voice.' },
  { trick: 'dance', say: 'Wisdom of the nest: a calm breath beats a hurried guess.' },
  { trick: 'wiggle', say: 'Shiver me feathers. Digraphs stick together like best friends — sh, ch, th.' },
  { trick: 'spin', say: 'Treasure maps start with one step. Your next word is that step.' },
  { trick: 'wave', say: 'Big taps, brave voice, happy bird. That is how legends learn to read.' },
  { trick: 'giggle', say: 'Pink lines love vowels. Teal loves consonants. Gold means letters that stick together — like sh or ee.' },
]

const CHEERS = [
  'You are on a roll!',
  'Brave reading!',
  'Pip is so proud!',
  'Those words are yours now.',
  'Keep going, star reader!'
]

const TRICKS = ['wave', 'spin', 'jump', 'wiggle', 'dance', 'giggle']

let profile = { name: '', points: 0 }
let mode = null
let sessionStart = 0
let sessionTick = 0
let sessionDone = false
let endingSoon = false
let practiced = []
let recentWords = []
let current = null
let pickLocked = false
let preferredVoice = null
let voices = []
let recognition = null
let confettiCtx = null
let confettiParticles = []
let wordsThisSession = 0

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
  setPoints(profile.points || 0, true)
}

function saveProfile() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === name))
  document.body.dataset.view = name
}

function setPoints(n, quiet) {
  profile.points = Math.max(0, n)
  $('points').textContent = String(profile.points)
  if (!quiet) {
    $('points').parentElement.classList.add('is-bump')
    setTimeout(() => $('points').parentElement.classList.remove('is-bump'), 350)
  }
  saveProfile()
}

function addPoints(delta) {
  setPoints(profile.points + delta)
}

function setSessionCount() {
  const el = $('wordCount')
  const hud = $('wordsHud')
  if (!el || !hud) return
  el.textContent = String(wordsThisSession)
  hud.classList.toggle('hidden', !mode)
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
    if (/en-us|en_us|english \(us\)|en-gb|en_gb/.test(blob)) s += 20
    if (/child|kids|samantha|karen|moira|zira|jenny|aria|siri/.test(blob)) s += 40
    if (/female|woman|girl/.test(blob)) s += 10
    if (/google|microsoft|apple/.test(blob)) s += 8
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
  buddySay._t = setTimeout(() => bubble.classList.add('hidden'), 5200)
  return speak(line, { rate: 0.94 })
}

function buddyQuiet() {
  clearTimeout(buddySay._t)
  clearTimeout(celebrateCorrect._cheer)
  const bubble = $('bubble')
  if (bubble) bubble.classList.add('hidden')
  try { speechSynthesis.cancel() } catch (e) {}
}

function buddyJoke() {
  const j = WISE_FUNNY[Math.floor(Math.random() * WISE_FUNNY.length)]
  return buddySay(j.say, j.trick)
}

/* reading.com-style grapheme underlines: digraphs + vowel teams share one bar */
function splitGraphemes(word) {
  const digraphs = ['ch', 'sh', 'th', 'wh', 'ph', 'ck', 'ng', 'qu']
  const teams = ['ee', 'ea', 'oo', 'oa', 'ai', 'ay', 'oy', 'oi', 'ou', 'ow', 'aw', 'au', 'ie', 'ue', 'ui', 'ey']
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
    if (teams.includes(two)) {
      parts.push({ text: word.slice(i, i + 2), kind: 'team' })
      i += 2
      continue
    }
    const ch = word[i]
    const soft = ch.toLowerCase()
    let kind = 'consonant'
    if ('aeiou'.includes(soft)) kind = 'vowel'
    if (soft === 'y' && i > 0) kind = 'vowel'
    // silent e in true magic-e words (cake, bike) — not sight words like are/one/have
    if (soft === 'e' && i === lower.length - 1 && lower.length >= 4) {
      const exceptions = new Set(['are', 'one', 'have', 'come', 'some', 'done', 'gone', 'were', 'there', 'where', 'here', 'were'])
      if (!exceptions.has(lower)) {
        const prev = lower[i - 1]
        const before = lower[i - 2]
        if (prev && before && !'aeiou'.includes(prev) && 'aeiou'.includes(before)) kind = 'silent'
      }
    }
    parts.push({ text: ch, kind })
    i += 1
  }
  return parts
}

function renderUnderlinedWord(word, opts = {}) {
  const heart = opts.heart || HEART_WORDS.has(String(word).toLowerCase())
  if (heart) {
    // One soft “heart word” underline — no phonics segmentation
    return `<div class="word-line is-heart" role="img" aria-label="Word ${escapeHtml(word)}">
      <span class="glyph is-heart">
        <span class="glyph-ch">${escapeHtml(word)}</span>
        <span class="glyph-bar heart-bar" aria-hidden="true"></span>
      </span>
    </div>`
  }
  const parts = splitGraphemes(word)
  return `<div class="word-line" role="img" aria-label="Word ${escapeHtml(word)}">${parts.map((p, idx) =>
    `<span class="glyph is-${p.kind}" style="animation-delay:${idx * 40}ms">
      <span class="glyph-ch">${escapeHtml(p.text)}</span>
      <span class="glyph-bar" aria-hidden="true" style="animation-delay:${80 + idx * 45}ms"></span>
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

function pickFresh(list, keyFn) {
  const key = keyFn || ((x) => String(x).toLowerCase())
  const pool = list.filter((item) => !recentWords.includes(key(item)))
  const use = pool.length ? pool : list
  const item = use[Math.floor(Math.random() * use.length)]
  recentWords.push(key(item))
  if (recentWords.length > 8) recentWords.shift()
  return item
}

function fmtMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function startTimer() {
  sessionStart = Date.now()
  sessionDone = false
  endingSoon = false
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
  const left = Math.max(0, SESSION_MS - elapsed)
  const pct = Math.min(100, (elapsed / SESSION_MS) * 100)
  $('timerFill').style.width = pct + '%'
  $('timerLabel').textContent = left > 0 ? `${fmtMs(left)} left` : 'Time!'
  $('timer').setAttribute('aria-valuenow', String(Math.min(5, Math.round(elapsed / 60000))))
  $('timer').classList.toggle('is-low', left > 0 && left < 30000)
  if (!sessionDone && !endingSoon && elapsed >= SESSION_MS) {
    endingSoon = true
    // Soft end: finish the current round, then surprise
    if (!pickLocked) finishSession()
  }
}

function beginApp(name) {
  profile.name = (name || 'Friend').trim() || 'Friend'
  saveProfile()
  $('hello').textContent = `Hi, ${profile.name}!`
  showView('home')
  buddySay(`Ahoy, ${profile.name}. Pick a practice. Five sunny minutes, then a surprise story.`, 'wave')
}

function startMode(nextMode) {
  mode = nextMode
  practiced = []
  recentWords = []
  wordsThisSession = 0
  pickLocked = false
  endingSoon = false
  buddyQuiet()
  setSessionCount()
  showView('play')
  startTimer()
  $('status').textContent = ''
  $('endEarly').classList.add('hidden')
  if (mode === 'sight') {
    $('coach').textContent = 'This is a heart word — say the whole word.'
    $('playHint').textContent = 'Tap the green mic — or “I said it” if the mic is shy.'
    nextSight()
    buddySay(`Heart words, ${profile.name}! Say the whole word bravely.`, 'wave')
  } else {
    $('coach').textContent = 'Sound out the word. Tap the matching picture.'
    $('playHint').textContent = 'Four pictures. Only one is right.'
    nextSymbol()
    buddySay(`Picture words, ${profile.name}! Find the match.`, 'wave')
  }
}

function rememberPractice(word) {
  const w = word.toLowerCase()
  if (!practiced.includes(w)) practiced.push(w)
  wordsThisSession += 1
  setSessionCount()
  if (wordsThisSession >= 1) $('endEarly').classList.remove('hidden')
}

function celebrateCorrect(word) {
  addPoints(1)
  rememberPractice(word)
  spawnConfetti(50)
  buddyTrick('jump', true)
  const line = `Well done, ${profile.name}!`
  $('status').innerHTML = `<span class="status-ok">${escapeHtml(line)}</span> <span class="status-word">${escapeHtml(word)}</span>`
  // Defer Pip cheer so it does not cancel the "Well done" voice line
  if (wordsThisSession > 0 && wordsThisSession % 4 === 0) {
    const cheer = CHEERS[Math.floor(Math.random() * CHEERS.length)]
    clearTimeout(celebrateCorrect._cheer)
    celebrateCorrect._cheer = setTimeout(() => buddySay(`${cheer} ${profile.name}!`, 'dance'), 1600)
  }
  return speak(`${line} ${word}.`, { rate: 0.95, pitch: 1.08 })
}

function afterCorrectAdvance(nextFn) {
  if (sessionDone) return
  if (endingSoon) {
    finishSession()
    return
  }
  setTimeout(() => nextFn(), 850)
}

function nextSight() {
  if (sessionDone) return
  if (endingSoon) { finishSession(); return }
  pickLocked = false
  const heartBank = SIGHT_WORDS.filter((w) => HEART_WORDS.has(w.toLowerCase()))
  const word = pickFresh(heartBank.length ? heartBank : SIGHT_WORDS)
  current = { word, emoji: '⭐' }
  const tone = ['tone-a', 'tone-b', 'tone-c'][Math.floor(Math.random() * 3)]
  $('board').innerHTML = `
    <div class="word-stage ${tone}" data-testid="sight-card">
      <div class="word-ico" aria-hidden="true">💗</div>
      ${renderUnderlinedWord(word, { heart: true })}
      <p class="underline-legend" aria-hidden="true"><i class="lg-h"></i>heart word — say it as a whole</p>
    </div>`
  $('controls').innerHTML = `
    <button class="btn mic bigtap" id="micBtn" type="button" data-testid="mic-btn"><span aria-hidden="true">🎤</span> Say it</button>
    <button class="btn secondary bigtap" id="hearBtn" type="button" data-testid="hear-btn">Hear a hint</button>
    <button class="btn ghost bigtap" id="yesBtn" type="button" data-testid="said-btn">I said it ✓</button>`
  $('status').textContent = ''
  $('hearBtn').onclick = () => speak(word, { rate: 0.82 })
  $('yesBtn').onclick = () => onSightCorrect(word)
  $('micBtn').onclick = () => {
    unlockSpeech()
    $('micBtn').classList.add('is-on')
    $('status').textContent = 'Listening… say the word!'
    listenForWord(word, () => {
      $('micBtn').classList.remove('is-on')
      onSightCorrect(word)
    }, (heard) => {
      $('micBtn').classList.remove('is-on')
      $('status').textContent = heard
        ? `I heard “${heard}”. Try “${word}” again.`
        : 'Try again, or tap I said it.'
      playTone(180, 0.12)
      buddyTrick('wiggle', true)
    })
  }
}

async function onSightCorrect(word) {
  if (pickLocked || sessionDone) return
  pickLocked = true
  try { recognition?.abort?.() } catch (e) {}
  await celebrateCorrect(word)
  afterCorrectAdvance(nextSight)
}

function nextSymbol() {
  if (sessionDone) return
  if (endingSoon) { finishSession(); return }
  pickLocked = false
  // Prefer easier CVC early in the session
  const tier = wordsThisSession < 4 ? PICTURE_A
    : wordsThisSession < 9 ? [...PICTURE_A, ...PICTURE_B]
    : PICTURE_WORDS
  const item = pickFresh(tier, (x) => x.word)
  current = item
  // Distractors from same tier when possible (less phonics-near-miss chaos)
  const samePool = tier.filter((w) => w.word !== item.word)
  const distractors = shuffleCopy(samePool.length >= 3 ? samePool : PICTURE_WORDS.filter((w) => w.word !== item.word)).slice(0, 3)
  const choices = shuffleCopy([item, ...distractors])
  const tone = ['tone-a', 'tone-b', 'tone-c'][Math.floor(Math.random() * 3)]
  $('board').innerHTML = `
    <div class="word-stage ${tone}" data-testid="symbol-card">
      ${renderUnderlinedWord(item.word, { heart: false })}
      <p class="underline-legend" aria-hidden="true"><i class="lg-v"></i>vowels <i class="lg-c"></i>consonants <i class="lg-d"></i>digraphs/teams</p>
    </div>
    <div class="choices" id="choices" role="group" aria-label="Pick the matching picture" data-testid="choices"></div>`
  const box = $('choices')
  choices.forEach((c) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'choice bigtap'
    btn.setAttribute('aria-label', c.word)
    btn.dataset.testid = `choice-${c.word}`
    btn.dataset.word = c.word
    btn.innerHTML = `<span class="choice-emoji" aria-hidden="true">${c.emoji}</span>`
    btn.onclick = () => onSymbolPick(btn, c.word === item.word, item.word)
    box.appendChild(btn)
  })
  $('controls').innerHTML = `<button class="btn secondary bigtap" id="hearBtn" type="button" data-testid="hear-btn">Hear the word</button>`
  $('status').textContent = ''
  $('hearBtn').onclick = () => speak(item.word, { rate: 0.86 })
}

async function onSymbolPick(btn, ok, word) {
  if (pickLocked || sessionDone) return
  if (!ok) {
    btn.classList.add('wrong')
    playTone(180, 0.12)
    $('status').textContent = 'Not that one — look at the word again.'
    setTimeout(() => btn.classList.remove('wrong'), 420)
    buddyTrick('wiggle', true)
    return
  }
  pickLocked = true
  btn.classList.add('correct')
  await celebrateCorrect(word)
  afterCorrectAdvance(nextSymbol)
}

function heardWord(blob, word) {
  const clean = String(blob || '').toLowerCase().replace(/[^a-z\s']/g, ' ')
  const target = String(word).toLowerCase()
  const tokens = clean.split(/\s+/).filter(Boolean)
  if (tokens.includes(target)) return true
  // Avoid substring false positives for short heart words (e.g. "a" inside "cat")
  if (target.length > 3 && clean.includes(target)) return true
  const aliases = {
    a: ['uh', 'ay', 'ey'],
    i: ['eye'],
    one: ['won'],
    four: ['for'],
    be: ['bee'],
    so: ['sew'],
    see: ['sea'],
    you: ['u'],
    are: ['r'],
    our: ['hour'],
    their: ["they're"],
    there: ["they're"],
    who: ['hoo']
  }
  const al = aliases[target] || []
  return tokens.some((t) => al.includes(t))
}

function listenForWord(word, onHit, onMiss) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Rec) {
    $('status').textContent = 'Mic not ready here — tap I said it.'
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

function take(words, n, fallback) {
  const out = []
  for (const w of words) {
    if (out.length >= n) break
    if (!out.includes(w)) out.push(w)
  }
  let i = 0
  while (out.length < n) {
    out.push(fallback[i % fallback.length])
    i += 1
  }
  return out
}

function pickFrom(set, fallback, used) {
  for (const w of set) {
    const key = w.toLowerCase()
    if (!used.has(key)) { used.add(key); return w }
  }
  for (const w of fallback) {
    const key = w.toLowerCase()
    if (!used.has(key)) { used.add(key); return w }
  }
  return fallback[0]
}

function buildSurpriseStory(words) {
  const name = profile.name || 'Friend'
  const list = [...new Set(words.map((w) => w.toLowerCase()))]
  const glue = new Set(['a', 'i', 'the', 'to', 'and', 'or', 'of', 'can', 'is', 'it', 'in', 'on', 'at'])

  if (mode === 'sight') {
    const content = list.filter((w) => !glue.has(w))
    while (content.length < 4) {
      const pad = ['see', 'look', 'go', 'play', 'here', 'fun'][content.length]
      if (!content.includes(pad)) content.push(pad)
      else content.push('yes')
    }
    const [w1, w2, w3, w4] = content
    // Short frames; each practiced word appears at least twice when possible
    return [
      `${name} can see the word ${w1}. ${name} can see ${w1} again!`,
      `We look. We look at ${w2}. ${name} said, “${w2}!”`,
      `Can you go? Can ${name} go? Yes — go and ${w3}.`,
      `Here is ${w4}. Here is ${w4} for ${name}. What a fun day!`
    ].join(' ')
  }

  const pics = list.filter((w) => PICTURE_WORDS.some((p) => p.word === w)).slice(0, 4)
  while (pics.length < 3) {
    const pad = PICTURE_A[pics.length % PICTURE_A.length].word
    if (!pics.includes(pad)) pics.push(pad)
  }
  const [a, b, c, d = a] = pics
  return [
    `I see a ${a}. I see the ${a} again!`,
    `Look at the ${b}. Look — a ${b}!`,
    `Here is a ${c}. Here is the ${c} for ${name}.`,
    `${name} likes the ${d}. ${name} likes the ${d}! The end.`
  ].join(' ')
}

function highlightStory(text, words) {
  const set = new Set(words.map((w) => w.toLowerCase()))
  return escapeHtml(text).replace(/\b([A-Za-z']+)\b/g, (m, w) => {
    if (set.has(w.toLowerCase())) return `<span class="hi">${w}</span>`
    return w
  })
}

function finishSession() {
  if (sessionDone) return
  sessionDone = true
  endingSoon = false
  stopTimer()
  pickLocked = true
  $('endEarly').classList.add('hidden')
  $('timer').classList.add('hidden')
  const wordsHud = $('wordsHud')
  if (wordsHud) wordsHud.classList.add('hidden')
  try { recognition?.abort?.() } catch (e) {}
  const story = buildSurpriseStory(practiced)
  const n = wordsThisSession
  $('surpriseTitle').textContent = `Well done, ${profile.name}!`
  $('surpriseSub').textContent = n
    ? `You practiced ${n} word${n === 1 ? '' : 's'}. Here is your surprise story.`
    : 'A tiny story just for you.'
  $('storyPage').innerHTML = highlightStory(story, practiced)
  showView('surprise')
  spawnConfetti(90)
  buddySay(`Five minutes of brave reading, ${profile.name}. Here is your surprise!`, 'dance')
  $('hearStory').onclick = () => speak(story, { rate: 0.9 })
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

function leavePlay(toSurprise) {
  stopTimer()
  try { recognition?.abort?.() } catch (e) {}
  if (toSurprise && practiced.length) {
    finishSession()
    return
  }
  if (practiced.length) {
    const modal = $('leaveModal')
    modal.classList.remove('hidden')
    const finish = (wantStory) => {
      modal.classList.add('hidden')
      $('leaveYes').onclick = null
      $('leaveNo').onclick = null
      if (wantStory) finishSession()
      else goHomeQuiet()
    }
    $('leaveYes').onclick = () => finish(true)
    $('leaveNo').onclick = () => finish(false)
    return
  }
  goHomeQuiet()
}

function goHomeQuiet() {
  sessionDone = true
  endingSoon = false
  mode = null
  $('timer').classList.add('hidden')
  $('endEarly').classList.add('hidden')
  setSessionCount()
  showView('home')
  buddySay(`Rest your eyes, ${profile.name}. Ready when you are.`, 'wave')
}

function init() {
  loadProfile()
  pickVoice()
  speechSynthesis.onvoiceschanged = pickVoice
  setupConfetti()
  document.body.dataset.view = 'welcome'
  const urlEl = $('installUrl')
  if (urlEl) urlEl.textContent = location.href.replace(/\/$/, '')
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
    document.documentElement.dataset.installed = 'true'
    $('installGuide')?.classList.add('hidden')
  }
  // Quiet welcome: Pip greets after the child starts (visible buddy on home)

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
  $('backHome').addEventListener('click', () => leavePlay(false))
  $('endEarly').addEventListener('click', () => {
    if (practiced.length) finishSession()
    else leavePlay(false)
  })
  $('againBtn').addEventListener('click', () => {
    sessionDone = false
    endingSoon = false
    mode = null
    wordsThisSession = 0
    $('timer').classList.add('hidden')
    $('endEarly').classList.add('hidden')
    setSessionCount()
    showView('home')
    buddySay(`Another round, ${profile.name}? Pick a practice!`, 'wave')
  })
  $('buddy').addEventListener('click', () => {
    unlockSpeech()
    buddyJoke()
  })

  // Parent/dev shortcuts for quick QA
  window.__lumaForceSurprise = (words) => {
    practiced = words || ['the', 'and', 'you', 'can', 'see', 'go']
    wordsThisSession = practiced.length
    mode = mode || 'sight'
    finishSession()
  }
  window.__lumaForceTimerEnd = () => {
    sessionStart = Date.now() - SESSION_MS - 100
    tickTimer()
  }
  window.__lumaSplit = splitGraphemes
  window.__lumaBegin = (name) => beginApp(name || 'Mia')
  window.__lumaStart = (m) => startMode(m || 'sight')
  $('startBtn')?.addEventListener('click', (e) => {
    // Extra path for automation environments that swallow form submit
    if (document.body.dataset.view === 'welcome') {
      e.preventDefault()
      unlockSpeech()
      beginApp($('childName').value)
    }
  })
}

document.addEventListener('DOMContentLoaded', init)
