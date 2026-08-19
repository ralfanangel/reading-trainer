// Simple browser-based animals game with TTS

let animals = []
let target = null
let name = ''

async function init() {
  animals = await fetch('animals.json').then(r => r.json()).catch(()=>[])
  document.getElementById('startBtn').addEventListener('click', onStart)
  document.getElementById('speakBtn').addEventListener('click', () => speak(target?.name || ''))
  document.getElementById('nextBtn').addEventListener('click', startRound)
}

function onStart() {
  const input = document.getElementById('childName')
  name = (input.value || 'Friend').trim()
  document.getElementById('greeting').textContent = `Hi, ${name}!`;
  document.getElementById('onboard').classList.add('hidden')
  document.getElementById('game').classList.remove('hidden')
  startRound()
}

function startRound() {
  clearMessage()
  shuffle(animals)
  target = animals[0]
  document.getElementById('targetName').textContent = capitalize(target.name)
  renderGrid()
  speak(target.name)
}

function renderGrid() {
  const grid = document.getElementById('grid')
  grid.innerHTML = ''
  animals.forEach(a => {
    const btn = document.createElement('button')
    btn.className = 'tile'
    btn.setAttribute('data-id', a.id)
    btn.innerHTML = `<div class="emoji">${a.emoji}</div><div class="name">${capitalize(a.name)}</div>`
    btn.addEventListener('click', () => select(a))
    grid.appendChild(btn)
  })
}

function select(animal) {
  if (!target) return
  if (animal.id === target.id) {
    showMessage('Correct! 🎉')
    speak('Great job!')
    document.getElementById('nextBtn').classList.remove('hidden')
  } else {
    showMessage('Try again')
    speak('Try again')
  }
}

function showMessage(m) {
  const el = document.getElementById('message')
  el.textContent = m
}
function clearMessage(){
  const el = document.getElementById('message')
  el.textContent = ''
  document.getElementById('nextBtn').classList.add('hidden')
}

function speak(text) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  // prefer Apple's en-US voice if available
  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('samantha'))
  if (preferred) u.voice = preferred
  u.rate = 0.9
  window.speechSynthesis.speak(u)
}

function shuffle(a){
  for (let i = a.length -1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1))
    ;[a[i],a[j]] = [a[j],a[i]]
  }
}
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1) }

window.addEventListener('load', init)
