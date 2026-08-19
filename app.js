// Enhanced browser-based animals game with progress, journey, treasures, starter test and improved UX

let animals = []
let target = null
let name = ''
let voices = []
let preferredVoice = null
const confettiCanvas = document.getElementById('confetti-canvas')
let confettiCtx = null
let confettiParticles = []

const STORAGE_KEY = 'rt_profile_v1'
let profile = { name: null, treasures: 0, points: 0, level: 1 }

async function init() {
  animals = await fetch('animals.json').then(r => r.json()).catch(()=>[])
  document.getElementById('startBtn').addEventListener('click', onStart)
  document.getElementById('nextBtn').addEventListener('click', startRound)
  document.getElementById('starterBtn').addEventListener('click', openStarterTest)
  document.getElementById('modalClose').addEventListener('click', closeModal)
  document.getElementById('resetProgress').addEventListener('click', resetProgress)
  document.getElementById('continueBtn').addEventListener('click', continueSaved)

  loadProfile()
  updateJourneyUI()
  // Setup voices (may be async)
  loadVoices()
  window.speechSynthesis.onvoiceschanged = loadVoices
  // confetti canvas
  setupConfetti()
}

function loadProfile(){
  try{
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) {
      profile = JSON.parse(data)
      document.getElementById('savedName').textContent = profile.name
      document.getElementById('continueBtn').classList.remove('hidden')
    }
  }catch(e){console.warn('load profile',e)}
}
function saveProfile(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}
function resetProgress(){
  if (!confirm('Reset progress and treasures?')) return
  profile.treasures = 0
  profile.points = 0
  profile.level = 1
  saveProfile()
  updateJourneyUI()
  alert('Progress reset')
}
function continueSaved(){
  if (!profile.name) return
  document.getElementById('onboard').classList.add('hidden')
  document.getElementById('game').classList.remove('hidden')
  document.getElementById('greeting').textContent = `Hi, ${profile.name}!`;
  startRound()
}

function loadVoices(){
  voices = window.speechSynthesis.getVoices()
  const preferredNames = ['samantha','siri','alex','fiona','amelia','amelie','daniel','oliver','kate','victoria']
  preferredVoice = voices.find(v => preferredNames.some(n => v.name.toLowerCase().includes(n) || v.lang.toLowerCase().includes(n))) || voices.find(v => v.lang.startsWith('en')) || null
}

function onStart() {
  const input = document.getElementById('childName')
  name = (input.value || 'Friend').trim()
  profile.name = name
  saveProfile()
  document.getElementById('greeting').textContent = `Hi, ${name}! Ready to play?`;
  document.getElementById('onboard').classList.add('hidden')
  document.getElementById('game').classList.remove('hidden')
  animateAvatarIntro()
  startRound()
}

function startRound() {
  clearMessage()
  shuffle(animals)
  // pick target according to level (simple: slice top N by difficulty)
  target = animals.find(a => a.level <= profile.level) || animals[0]
  document.getElementById('targetName').textContent = capitalize(target.name)
  renderGrid()
}

function renderGrid() {
  const grid = document.getElementById('grid')
  grid.innerHTML = ''
  // show a subset + some distractors
  const choices = shuffleCopy(animals).slice(0,6)
  if (!choices.find(c=>c.id===target.id)) { choices[0]=target }
  shuffle(choices)
  choices.forEach((a, idx) => {
    const btn = document.createElement('button')
    btn.className = 'tile'
    btn.setAttribute('data-id', a.id)
    btn.setAttribute('aria-label', a.name)
    btn.innerHTML = `<div class="emoji">${a.emoji}</div><div class="name">${capitalize(a.name)}</div>`
    btn.addEventListener('click', () => select(a, btn))
    btn.style.animation = `fadeIn .35s ${idx * 60}ms both`
    grid.appendChild(btn)
  })
}

function select(animal, btnEl) {
  if (!target) return
  if (animal.id === target.id) {
    btnEl.classList.add('correct')
    showMessage('Correct! 🎉')
    celebrate()
    profile.points += (target.reward || 1)
    // every 3 points -> 1 treasure piece
    const newTreasures = Math.floor(profile.points / 3)
    if (newTreasures > profile.treasures) {
      profile.treasures = newTreasures
      // small unlock animation
      animateTreasureUnlock()
    }
    // simple leveling: every 6 points increase level
    profile.level = 1 + Math.floor(profile.points / 6)
    saveProfile()
    updateJourneyUI()
    speak(`${capitalize(animal.name)}. Great job!`)
    document.getElementById('nextBtn').classList.remove('hidden')
  } else {
    btnEl.classList.add('wrong')
    if (navigator.vibrate) navigator.vibrate(60)
    showMessage('Try again')
    setTimeout(()=>{ btnEl.classList.remove('wrong') }, 600)
  }
}

function animateTreasureUnlock(){
  const el = document.getElementById('treasureCount')
  el.classList.add('pop')
  el.textContent = profile.treasures
  setTimeout(()=>el.classList.remove('pop'),700)
}

function updateJourneyUI(){
  document.getElementById('treasureCount').textContent = profile.treasures
  // map steps: show 6 steps and progress based on points
  const steps = 6
  const percent = Math.min(100, (profile.points / (steps*1)) * (100/steps))
  document.getElementById('map-progress').style.width = `${Math.min(100, profile.points*10)}%`
  const container = document.getElementById('mapSteps')
  container.innerHTML = ''
  for (let i=0;i<steps;i++){
    const step = document.createElement('div')
    step.className = 'map-step'
    step.textContent = i < Math.floor(profile.points/2) ? '⭐' : ''
    container.appendChild(step)
  }
}

function openStarterTest(){
  const modal = document.getElementById('modal')
  modal.classList.remove('hidden')
  const body = document.getElementById('modalBody')
  body.innerHTML = ''
  // simple 5-question quick test
  const qcount = 5
  const questions = shuffleCopy(animals).slice(0,qcount)
  let current = 0
  let score = 0

  const qEl = document.createElement('div')
  qEl.className = 'test-question'
  body.appendChild(qEl)

  function renderQuestion(){
    const q = questions[current]
    qEl.innerHTML = `<div style="font-size:22px;margin-bottom:10px">Tap the picture for: <strong>${capitalize(q.name)}</strong></div>`
    const choices = shuffleCopy(animals).slice(0,4)
    if (!choices.find(c=>c.id===q.id)) { choices[0] = q }
    shuffle(choices)
    const ch = document.createElement('div')
    ch.style.display = 'grid'
    ch.style.gridTemplateColumns = 'repeat(2,1fr)'
    ch.style.gap = '10px'
    choices.forEach(c=>{
      const b = document.createElement('button')
      b.className = 'tile'
      b.style.padding='10px'
      b.innerHTML = `<div class="emoji">${c.emoji}</div><div class="name">${capitalize(c.name)}</div>`
      b.addEventListener('click', ()=>{
        if (c.id === q.id) { score++ }
        current++
        if (current < questions.length) renderQuestion()
        else finishTest()
      })
      ch.appendChild(b)
    })

    qEl.appendChild(ch)
  }

  function finishTest(){
    const level = score >= 4 ? 2 : (score >= 2 ? 1 : 0)
    profile.level = Math.max(1, level+1)
    // give a starter treasure or points based on score
    profile.points += score
    const newTreasures = Math.floor(profile.points/3)
    profile.treasures = newTreasures
    saveProfile()
    updateJourneyUI()
    qEl.innerHTML = `<div style="font-size:18px">Test complete — score: ${score}/${qcount}. We've set your starting level to ${profile.level}.</div>`
    setTimeout(()=>{ closeModal(); document.getElementById('onboard').classList.add('hidden'); document.getElementById('game').classList.remove('hidden'); document.getElementById('greeting').textContent = `Hi, ${profile.name}!` ; startRound() }, 1400)
  }

  renderQuestion()
}

function closeModal(){
  document.getElementById('modal').classList.add('hidden')
}

function speak(text) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  if (preferredVoice) u.voice = preferredVoice
  else {
    const all = window.speechSynthesis.getVoices()
    if (all && all.length) u.voice = all.find(v => v.lang.startsWith('en')) || all[0]
  }
  u.rate = 0.95
  u.pitch = 1.06
  window.speechSynthesis.speak(u)
}

function celebrate(){
  spawnConfetti(100)
  playChime()
}

function setupConfetti(){
  if (!confettiCanvas) return
  confettiCtx = confettiCanvas.getContext('2d')
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  requestAnimationFrame(confettiFrame)
}
function resizeCanvas(){
  confettiCanvas.width = window.innerWidth
  confettiCanvas.height = window.innerHeight
}
function spawnConfetti(count){
  for(let i=0;i<count;i++){
    confettiParticles.push({
      x: Math.random()*confettiCanvas.width,
      y: -10 - Math.random()*200,
      vx: (Math.random()-0.5)*6,
      vy: 2+Math.random()*6,
      size: 6+Math.random()*10,
      color: randomColor(),
      rot: Math.random()*360,
      rotV: (Math.random()-0.5)*8
    })
  }
}
function confettiFrame(){
  if (!confettiCtx) { requestAnimationFrame(confettiFrame); return }
  confettiCtx.clearRect(0,0,confettiCanvas.width,confettiCanvas.height)
  for(let i=confettiParticles.length-1;i>=0;i--){
    const p = confettiParticles[i]
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.12
    p.rot += p.rotV
    confettiCtx.save()
    confettiCtx.translate(p.x,p.y)
    confettiCtx.rotate(p.rot*Math.PI/180)
    confettiCtx.fillStyle = p.color
    confettiCtx.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.6)
    confettiCtx.restore()
    if (p.y > confettiCanvas.height + 50) confettiParticles.splice(i,1)
  }
  requestAnimationFrame(confettiFrame)
}
function randomColor(){
  const palette = ['#FF6B81','#FFB26B','#FFD166','#7EE7C1','#89C2FF','#C58BFF']
  return palette[Math.floor(Math.random()*palette.length)]
}

function playChime(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(880, ctx.currentTime)
    g.gain.setValueAtTime(0, ctx.currentTime)
    g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.01)
    o.connect(g); g.connect(ctx.destination)
    o.start()
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
    o.stop(ctx.currentTime + 0.7)
  }catch(e){ }
}

function shuffle(a){
  for (let i = a.length -1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1))
    ;[a[i],a[j]] = [a[j],a[i]]
  }
}
function shuffleCopy(a){
  const c = a.slice(); shuffle(c); return c
}
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1) }

// small avatar intro animation
function animateAvatarIntro(){
  const av = document.getElementById('avatar')
  if (!av) return
  av.animate([
    { transform: 'translateY(-6px) scale(0.98)'},
    { transform: 'translateY(0px) scale(1)'}
  ],{ duration: 700, easing: 'cubic-bezier(.2,.9,.3,1)'})
}

window.addEventListener('load', init)
