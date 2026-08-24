/* Luma Reads — simple sight-word + picture-word trainer */
const STORAGE_KEY = 'luma_reads_v1'
const SESSION_MS = 5 * 60 * 1000

/* Dolch Pre-Primer → Grade 1 (kid-friendly, high-frequency) */
const SIGHT_WORDS = [
  'a', 'I', 'the', 'to', 'and', 'you', 'it', 'in', 'is', 'my',
  'me', 'we', 'he', 'she', 'see', 'can', 'go', 'up', 'on', 'at',
  'no', 'yes', 'look', 'like', 'come', 'said', 'for', 'here', 'help', 'make',
  'play', 'run', 'jump', 'big', 'little', 'red', 'blue', 'one', 'two', 'three',
  'this', 'that', 'with', 'have', 'are', 'was', 'do', 'did', 'get', 'put',
  'away', 'down', 'find', 'not', 'all', 'but', 'out', 'so', 'went', 'will',
  'want', 'what', 'where', 'who', 'when', 'good', 'new', 'old', 'came', 'they',
  'them', 'then', 'too', 'our', 'your', 'from', 'into', 'over', 'under', 'ate',
  'saw', 'say', 'let', 'now', 'soon', 'please', 'thank', 'stop', 'open', 'ran',
  'fun', 'must', 'ride'
]

/* Grade-1 picture words: mostly CVC / digraph / CVCe / simple teams */
const PICTURE_WORDS = [
  { word: 'cat', emoji: '🐱' }, { word: 'dog', emoji: '🐶' }, { word: 'sun', emoji: '☀️' },
  { word: 'hat', emoji: '🧢' }, { word: 'cup', emoji: '☕' }, { word: 'bed', emoji: '🛏️' },
  { word: 'bus', emoji: '🚌' }, { word: 'map', emoji: '🗺️' }, { word: 'jam', emoji: '🫙' },
  { word: 'box', emoji: '📦' }, { word: 'web', emoji: '🕸️' }, { word: 'pig', emoji: '🐷' },
  { word: 'fox', emoji: '🦊' }, { word: 'hen', emoji: '🐔' }, { word: 'van', emoji: '🚐' },
  { word: 'mop', emoji: '🧹' }, { word: 'pot', emoji: '🍲' }, { word: 'pen', emoji: '🖊️' },
  { word: 'ship', emoji: '🚢' }, { word: 'fish', emoji: '🐟' }, { word: 'duck', emoji: '🦆' },
  { word: 'sock', emoji: '🧦' }, { word: 'bell', emoji: '🔔' }, { word: 'ball', emoji: '⚽' },
  { word: 'drum', emoji: '🥁' }, { word: 'nest', emoji: '🪺' }, { word: 'frog', emoji: '🐸' },
  { word: 'crab', emoji: '🦀' }, { word: 'flag', emoji: '🚩' }, { word: 'star', emoji: '⭐' },
  { word: 'moon', emoji: '🌙' }, { word: 'book', emoji: '📕' }, { word: 'cake', emoji: '🍰' },
  { word: 'bike', emoji: '🚲' }, { word: 'kite', emoji: '🪁' }, { word: 'boat', emoji: '⛵' },
  { word: 'tree', emoji: '🌳' }, { word: 'rain', emoji: '🌧️' }, { word: 'leaf', emoji: '🍃' },
  { word: 'bird', emoji: '🐦' }, { word: 'bee', emoji: '🐝' }, { word: 'cow', emoji: '🐮' },
  { word: 'sheep', emoji: '🐑' }, { word: 'goat', emoji: '🐐' }, { word: 'home', emoji: '🏠' },
  { word: 'shop', emoji: '🏪' }, { word: 'gift', emoji: '🎁' }, { word: 'shell', emoji: '🐚' }
]

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
  { trick: 'giggle', say: 'Pink lines love vowels. Teal lines love consonants. Yellow means friends sharing a sound.' }
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
    // silent e in CVCe (and longer like cake, home, bike)
    if (soft === 'e' && i === lower.length - 1 && lower.length >= 3) {
      const prev = lower[i - 1]
      const before = lower[i - 2]
      if (prev && before && !'aeiou'.includes(prev) && 'aeiou'.includes(before)) kind = 'silent'
    }
    parts.push({ text: ch, kind })
    i += 1
  }
  return parts
}

function renderUnderlinedWord(word) {
  const parts = splitGraphemes(word)
  return `<div class="word-line" role="img" aria-label="Word ${word}">${parts.map((p, idx) =>
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
    $('coach').textContent = 'Look at the word. Say it out loud.'
    $('playHint').textContent = 'Tap the green mic — or “I said it” if the mic is shy.'
    nextSight()
    buddySay(`Sight words, ${profile.name}! Brave voice ready.`, 'wave')
  } else {
    $('coach').textContent = 'Read the word. Tap the matching picture.'
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
  const word = pickFresh(SIGHT_WORDS)
  current = { word, emoji: '⭐' }
  const tone = ['tone-a', 'tone-b', 'tone-c'][Math.floor(Math.random() * 3)]
  $('board').innerHTML = `
    <div class="word-stage ${tone}">
      <div class="word-ico" aria-hidden="true">🌟</div>
      ${renderUnderlinedWord(word)}
      <p class="underline-legend" aria-hidden="true"><i class="lg-v"></i>vowels <i class="lg-c"></i>consonants <i class="lg-d"></i>teams</p>
    </div>`
  $('controls').innerHTML = `
    <button class="btn mic bigtap" id="micBtn" type="button"><span aria-hidden="true">🎤</span> Say it</button>
    <button class="btn secondary bigtap" id="hearBtn" type="button">Hear a hint</button>
    <button class="btn ghost bigtap" id="yesBtn" type="button">I said it ✓</button>`
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
  const item = pickFresh(PICTURE_WORDS, (x) => x.word)
  current = item
  const distractors = shuffleCopy(PICTURE_WORDS.filter((w) => w.word !== item.word)).slice(0, 3)
  const choices = shuffleCopy([item, ...distractors])
  const tone = ['tone-a', 'tone-b', 'tone-c'][Math.floor(Math.random() * 3)]
  $('board').innerHTML = `
    <div class="word-stage ${tone}">
      ${renderUnderlinedWord(item.word)}
      <p class="underline-legend" aria-hidden="true"><i class="lg-v"></i>vowels <i class="lg-c"></i>consonants <i class="lg-d"></i>teams</p>
    </div>
    <div class="choices" id="choices" role="group" aria-label="Pick the matching picture"></div>`
  const box = $('choices')
  choices.forEach((c, idx) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'choice bigtap'
    btn.setAttribute('aria-label', `Picture ${idx + 1}`)
    btn.innerHTML = `<span class="choice-emoji" aria-hidden="true">${c.emoji}</span>`
    btn.onclick = () => onSymbolPick(btn, c.word === item.word, item.word)
    box.appendChild(btn)
  })
  $('controls').innerHTML = `<button class="btn secondary bigtap" id="hearBtn" type="button">Hear the word</button>`
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
  if (clean.includes(target)) return true
  const aliases = {
    a: ['uh', 'ay', 'ey'],
    i: ['eye'],
    to: ['two', 'too'],
    for: ['four'],
    be: ['bee'],
    so: ['sew'],
    no: ['know'],
    one: ['won'],
    two: ['to', 'too'],
    four: ['for'],
    red: ['read'],
    read: ['red'],
    here: ['hear'],
    see: ['sea', 'c'],
    you: ['u'],
    are: ['r'],
    our: ['hour'],
    their: ['there', "they're"],
    there: ['their', "they're"],
    where: ['wear'],
    who: ['hoo'],
    too: ['to', 'two']
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
  const practicedSet = new Set(words.map((w) => w.toLowerCase()))

  if (mode === 'sight') {
    const verbs = ['see', 'look', 'go', 'run', 'jump', 'play', 'come', 'make', 'find', 'help', 'want', 'like', 'ride']
    const places = ['here', 'away', 'down', 'up', 'out']
    const people = ['you', 'we', 'he', 'she', 'they']
    const traits = ['big', 'little', 'good', 'red', 'blue', 'new', 'fun']
    const have = (list) => list.filter((w) => practicedSet.has(w.toLowerCase()))
    const used = new Set()
    const v1 = pickFrom(have(verbs), ['see', 'look', 'play'], used)
    const v2 = pickFrom(have(verbs), ['go', 'run', 'jump'], used)
    const v3 = pickFrom(have(verbs), ['play', 'look', 'help'], used)
    const who = pickFrom(have(people), ['you', 'we'], used)
    const place = pickFrom(have(places), ['here', 'away'], used)
    const trait = pickFrom(have(traits), ['good', 'fun'], used)
    const pair = (who === 'we' || who === 'they') ? who : `${name} and ${who}`

    const leftovers = words
      .map((w) => w.toLowerCase())
      .filter((w) => !used.has(w))
      .filter((w) => !['a', 'i', 'the', 'to', 'and', 'or', 'of', 'can'].includes(w))
      .slice(0, 4)
    const cheer = leftovers.length
      ? ` Words you practiced: ${leftovers.join(', ')}.`
      : ''

    const templates = [
      `${name} can ${v1}. ${who === 'we' ? 'We' : who === 'you' ? 'You' : who} can ${v2}. ` +
      `Then ${pair} ${v3} ${place}. What a ${trait} day!${cheer}`,

      `Look, ${name}! You can ${v1}. We can ${v2}. ` +
      `${name} said, “Come ${place}!” They all ${v3}. What a ${trait} surprise!${cheer}`,

      `One day ${name} said, “I can ${v1}.” ` +
      `${who === 'we' ? 'We' : who === 'you' ? 'You' : who} said, “We can ${v2}.” So they ${v3} ${place}. ` +
      `${name} felt ${trait}. The end.${cheer}`
    ]
    return templates[Math.floor(Math.random() * templates.length)]
  }

  const pics = take(words, 6, ['cat', 'dog', 'sun', 'ship', 'fish', 'home'])
  const [a, b, c, d, e, f] = pics
  const art = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a')
  const Art = (w) => (/^[aeiou]/i.test(w) ? 'An' : 'A')
  const templates = [
    `One bright morning, ${name} saw ${art(a)} ${a} near ${art(b)} ${b}. ` +
    `Along came ${art(c)} ${c}. “Hello!” said ${name}. Together they found ${art(d)} ${d} by ${art(e)} ${e}, then went home to see the ${f}. The end.`,

    `${name} drew ${art(a)} ${a} and ${art(b)} ${b} in a book. ` +
    `Next came ${art(c)} ${c} and a little ${d}. ` +
    `At the end of the page: ${art(e)} ${e} and ${art(f)} ${f}. What a surprise!`,

    `“Look!” said ${name}. “${Art(a)} ${a}!” Then they saw ${art(b)} ${b} and ${art(c)} ${c}. ` +
    `The ${d} and the ${e} played until the ${f} came out. Good night, ${name}.`
  ]
  return templates[Math.floor(Math.random() * templates.length)]
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
}

document.addEventListener('DOMContentLoaded', init)
