import './style.css'
import { Game } from './game/Game'

const canvas = document.getElementById('game') as HTMLCanvasElement
const startScreen = document.getElementById('startScreen')!
const startBtn = document.getElementById('startBtn') as HTMLButtonElement

let game: Game | null = null

async function boot() {
  startBtn.disabled = true
  startBtn.textContent = 'Loading…'
  game = new Game(canvas)
  await game.start()
  startScreen.classList.add('hidden')
}

startBtn.addEventListener('click', () => {
  void boot()
})

// Dev helper: ?demoSay=the opens checkpoint immediately
const demo = new URLSearchParams(location.search).get('demoSay')
if (demo) {
  startScreen.classList.add('hidden')
  void boot().then(() => {
    setTimeout(() => game?.demoSayCheck(demo), 800)
  })
}

export {}
