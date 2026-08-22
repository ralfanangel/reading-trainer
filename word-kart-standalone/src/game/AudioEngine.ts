import { clamp } from './utils'

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engineGain: GainNode | null = null
  private engineOsc1: OscillatorNode | null = null
  private engineOsc2: OscillatorNode | null = null
  private engineFilter: BiquadFilterNode | null = null
  private started = false

  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.85
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  startEngine() {
    this.unlock()
    if (!this.ctx || !this.master || this.started) return
    this.started = true
    const ac = this.ctx
    this.engineGain = ac.createGain()
    this.engineGain.gain.value = 0.0001
    this.engineFilter = ac.createBiquadFilter()
    this.engineFilter.type = 'lowpass'
    this.engineFilter.frequency.value = 480
    this.engineOsc1 = ac.createOscillator()
    this.engineOsc2 = ac.createOscillator()
    this.engineOsc1.type = 'sawtooth'
    this.engineOsc2.type = 'triangle'
    this.engineOsc1.frequency.value = 62
    this.engineOsc2.frequency.value = 93
    this.engineOsc1.connect(this.engineFilter)
    this.engineOsc2.connect(this.engineFilter)
    this.engineFilter.connect(this.engineGain)
    this.engineGain.connect(this.master)
    this.engineOsc1.start()
    this.engineOsc2.start()
    this.engineGain.gain.exponentialRampToValueAtTime(0.12, ac.currentTime + 0.5)
  }

  updateEngine(speedNorm: number, steerAbs: number) {
    if (!this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineFilter || !this.engineGain) return
    const t = this.ctx.currentTime
    const rpm = 55 + speedNorm * 140
    this.engineOsc1.frequency.setTargetAtTime(rpm, t, 0.06)
    this.engineOsc2.frequency.setTargetAtTime(rpm * 1.48, t, 0.06)
    this.engineFilter.frequency.setTargetAtTime(320 + speedNorm * 2200 + steerAbs * 400, t, 0.05)
    this.engineGain.gain.setTargetAtTime(0.04 + speedNorm * 0.14 + steerAbs * 0.03, t, 0.08)
  }

  stopEngine() {
    if (!this.ctx || !this.engineGain) return
    this.engineGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.2)
    setTimeout(() => {
      try { this.engineOsc1?.stop() } catch { /* noop */ }
      try { this.engineOsc2?.stop() } catch { /* noop */ }
      this.engineOsc1 = this.engineOsc2 = null
      this.started = false
    }, 250)
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol = 0.15) {
    if (!this.ctx || !this.master) return
    const ac = this.ctx
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.value = vol
    o.connect(g)
    g.connect(this.master)
    const now = ac.currentTime
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    o.start(now)
    o.stop(now + dur + 0.02)
  }

  collect() {
    this.unlock()
    this.tone(880, 0.08, 'sine', 0.12)
    this.tone(1320, 0.12, 'triangle', 0.08)
  }

  checkpoint() {
    this.unlock()
    this.tone(523, 0.15, 'sine', 0.14)
    setTimeout(() => this.tone(659, 0.18, 'sine', 0.12), 80)
  }

  success() {
    this.unlock()
    this.tone(784, 0.2, 'sine', 0.16)
    setTimeout(() => this.tone(988, 0.25, 'sine', 0.14), 100)
  }

  skid(amount: number) {
    if (!this.ctx || !this.master || amount < 0.15) return
    const ac = this.ctx
    const buf = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * amount
    const src = ac.createBufferSource()
    src.buffer = buf
    const f = ac.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 900
    const g = ac.createGain()
    g.gain.value = clamp(amount * 0.08, 0, 0.06)
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start()
  }

  speak(text: string, rate = 0.92): Promise<void> {
    if (!('speechSynthesis' in window)) return Promise.resolve()
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text)
      u.rate = rate
      u.pitch = 1.05
      u.onend = () => resolve()
      u.onerror = () => resolve()
      window.speechSynthesis.cancel()
      setTimeout(() => window.speechSynthesis.speak(u), 60)
    })
  }
}
