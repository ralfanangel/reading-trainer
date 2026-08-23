import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { GOAL, SAY_CHECK_AT, SIGHT_WORDS_G1 } from '../data/sightWords'
import { AudioEngine } from './AudioEngine'
import { Kart } from './Kart'
import { SpeechCheck } from './SpeechCheck'
import { Track } from './Track'
import { capitalize, clamp } from './utils'
import { checkWordHit, spawnWordPads, updateWordPads, type WordPad } from './WordPads'

export class Game {
  private readonly canvas: HTMLCanvasElement
  private readonly audio = new AudioEngine()
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.2, 500)
  private readonly renderer: THREE.WebGLRenderer
  private composer: EffectComposer | null = null
  private sun!: THREE.DirectionalLight
  private track!: Track
  private kart!: Kart
  private world!: RAPIER.World
  private words: WordPad[] = []
  private speech!: SpeechCheck
  private raf = 0
  private running = false
  private paused = false
  private finished = false
  private sayDone = false
  private collected = 0
  private combo = 0
  private lastWord = ''
  private time = 0
  private steerInput = 0
  private gyroSteer = 0
  private gyroOn = false
  private pointerSteer = 0
  private keySteer = 0
  private camPos = new THREE.Vector3()
  private camLook = new THREE.Vector3()
  private readonly clock = new THREE.Clock()

  private readonly hud = {
    score: document.getElementById('scorePill')!,
    speed: document.getElementById('speedPill')!,
    hint: document.getElementById('hint')!,
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.28
    this.scene.background = new THREE.Color('#2f9aff')
    this.scene.fog = new THREE.FogExp2('#8ed0ff', 0.0018)

    this.speech = new SpeechCheck(this.audio, {
      overlay: document.getElementById('sayOverlay')!,
      word: document.getElementById('sayWord')!,
      status: document.getElementById('sayStatus')!,
      micBtn: document.getElementById('sayMicBtn') as HTMLButtonElement,
    })

    window.addEventListener('resize', () => this.resize())
    this.bindInput()
  }

  async start() {
    await RAPIER.init()
    this.world = new RAPIER.World({ x: 0, y: -18, z: 0 })
    this.track = new Track()
    await this.track.initPhysics(this.world)
    this.scene.add(this.track.group)

    this.setupLights()
    this.kart = new Kart(this.world, this.track)
    this.scene.add(this.kart.mesh)
    this.words = spawnWordPads(this.track, [...SIGHT_WORDS_G1], this.scene)

    const s = this.track.place(this.kart.t, this.kart.lane, 0)
    this.camPos.copy(s.pos).add(new THREE.Vector3(0, 4, -10))
    this.camLook.copy(s.pos)

    this.collected = 0
    this.combo = 0
    this.finished = false
    this.paused = false
    this.sayDone = false
    this.lastWord = ''
    this.time = 0
    this.resize()
    this.audio.startEngine()
    this.running = true
    this.clock.start()
    this.raf = requestAnimationFrame(() => this.loop())
    this.updateHud()
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.speech.cancel()
    this.audio.stopEngine()
  }

  /** Dev helper: jump straight to the pronunciation checkpoint. */
  demoSayCheck(word: string) {
    this.paused = true
    this.lastWord = word
    this.collected = SAY_CHECK_AT
    this.sayDone = false
    this.updateHud()
    this.speech.begin(word, () => {
      this.paused = false
      this.sayDone = true
    })
  }

  private setupLights() {
    this.scene.add(new THREE.HemisphereLight('#dff0ff', '#4fa858', 1.05))
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.45))
    this.sun = new THREE.DirectionalLight('#fff4dc', 2.1)
    this.sun.position.set(40, 70, 25)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 2
    this.sun.shadow.camera.far = 220
    const sc = 70
    this.sun.shadow.camera.left = -sc
    this.sun.shadow.camera.right = sc
    this.sun.shadow.camera.top = sc
    this.sun.shadow.camera.bottom = -sc
    this.sun.shadow.bias = -0.00015
    this.scene.add(this.sun)
    this.scene.add(new THREE.DirectionalLight('#9fd4ff', 0.55).translateX(-30).translateY(20))
  }

  private setupComposer(w: number, h: number) {
    if (this.composer) {
      this.composer.setSize(w, h)
      return
    }
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.55, 0.88)
    this.composer.addPass(bloom)
    this.composer.addPass(new OutputPass())
  }

  private resize() {
    const parent = this.canvas.parentElement
    if (!parent) return
    const w = parent.clientWidth
    const h = parent.clientHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.setupComposer(w, h)
  }

  private bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') this.keySteer = -1
      if (e.key === 'ArrowRight' || e.key === 'd') this.keySteer = 1
    })
    window.addEventListener('keyup', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key)) this.keySteer = 0
    })

    let down = false
    const setX = (x: number) => {
      const r = this.canvas.getBoundingClientRect()
      this.pointerSteer = clamp(((x - r.left) / r.width - 0.5) * 2.4, -1, 1)
    }
    this.canvas.addEventListener('pointerdown', (e) => { down = true; this.canvas.setPointerCapture(e.pointerId); setX(e.clientX) })
    this.canvas.addEventListener('pointermove', (e) => { if (down) setX(e.clientX) })
    const up = () => { down = false; this.pointerSteer = 0 }
    this.canvas.addEventListener('pointerup', up)
    this.canvas.addEventListener('pointercancel', up)

    const onOrient = (e: DeviceOrientationEvent) => {
      let g = e.gamma ?? 0
      const b = e.beta ?? 0
      if (Math.abs(b) > Math.abs(g) + 8) g = b
      this.gyroSteer = clamp(g / 25, -1, 1)
      this.gyroOn = true
    }
    window.addEventListener('deviceorientation', onOrient, true)
  }

  private loop() {
    if (!this.running) return
    const dt = clamp(this.clock.getDelta(), 0, 0.05)
    this.time += dt

    if (!this.paused && !this.finished) {
      this.steerInput = this.gyroOn ? this.gyroSteer : clamp(this.pointerSteer + this.keySteer, -1, 1)
      this.kart.steerInput = this.steerInput
      this.kart.syncFromTrack(this.track, dt)
      this.world.step()

      updateWordPads(this.words, this.track, this.time, true)
      const hit = checkWordHit(this.words, this.kart.t, this.kart.lane)
      if (hit) this.onWordCollect(hit)

      this.audio.updateEngine(this.kart.speedNorm(), Math.abs(this.steerInput))
      if (Math.abs(this.steerInput) > 0.55 && this.kart.speedNorm() > 0.35) {
        this.audio.skid(Math.abs(this.steerInput) * this.kart.speedNorm())
      }
    } else {
      updateWordPads(this.words, this.track, this.time, false)
      this.audio.updateEngine(0, 0)
    }

    this.updateCamera(dt)
    this.sun.target.position.copy(this.kart.mesh.position)
    this.sun.position.set(
      this.kart.mesh.position.x + 35,
      68,
      this.kart.mesh.position.z + 20,
    )

    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)

    if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.updateHud()
    this.raf = requestAnimationFrame(() => this.loop())
  }

  private updateCamera(dt: number) {
    const s = this.track.place(this.kart.t, this.kart.lane, 0)
    const side = s.side
    const target = s.pos.clone()
      .addScaledVector(s.tan, -9.5)
      .add(new THREE.Vector3(0, 4.2, 0))
      .addScaledVector(side, -this.steerInput * 1.1)
    this.camPos.lerp(target, 1 - Math.pow(0.06, dt * 60))
    this.camera.position.copy(this.camPos)
    const look = s.pos.clone().addScaledVector(s.tan, 12).add(new THREE.Vector3(0, 1.4, 0))
    this.camLook.lerp(look, 1 - Math.pow(0.1, dt * 60))
    this.camera.lookAt(this.camLook)
  }

  private onWordCollect(w: WordPad) {
    w.hit = true
    w.sprite.visible = false
    this.collected += 1
    this.combo += 1
    this.lastWord = w.text
    this.audio.collect()
    void this.audio.speak(capitalize(w.text), 0.88)

    const needSay = this.collected === SAY_CHECK_AT && !this.sayDone
    if (needSay) {
      this.paused = true
      setTimeout(() => {
        this.speech.begin(w.text, () => {
          this.paused = false
          this.sayDone = true
          if (this.collected >= GOAL) this.finish()
        })
      }, 450)
    } else if (this.collected >= GOAL) {
      this.finish()
    }
    this.updateHud()
  }

  private finish() {
    if (this.finished) return
    this.finished = true
    this.audio.stopEngine()
    void this.audio.speak(`Awesome race! You collected ${this.collected} sight words.`, 0.95)
    this.hud.hint.textContent = 'Race complete! Refresh or press Start again.'
  }

  private updateHud() {
    this.hud.score.textContent = `✨ ${this.collected} / ${GOAL}`
    this.hud.speed.textContent = `${Math.round(this.kart?.speed ?? 0)} km/h`
    if (this.paused) {
      this.hud.hint.textContent = `Say “${capitalize(this.lastWord)}” into the microphone.`
    } else if (this.lastWord) {
      this.hud.hint.textContent = `You drove over “${capitalize(this.lastWord)}” — keep racing!`
    } else {
      this.hud.hint.textContent = 'Arrow keys or drag to steer · auto-accelerate'
    }
  }
}
