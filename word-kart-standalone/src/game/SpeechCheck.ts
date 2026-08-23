import { capitalize, transcriptMatchesWord } from './utils'
import type { AudioEngine } from './AudioEngine'

export class SpeechCheck {
  private rec: SpeechRecognition | null = null
  private timer = 0
  private prompting = false
  private onDone: (() => void) | null = null
  private word = ''

  constructor(
    private audio: AudioEngine,
    private els: {
      overlay: HTMLElement
      word: HTMLElement
      status: HTMLElement
      micBtn: HTMLButtonElement
    },
  ) {
    els.micBtn.addEventListener('click', () => this.startListening())
  }

  get active() {
    return !!this.word
  }

  begin(word: string, onDone: () => void) {
    this.word = word
    this.onDone = onDone
    this.prompting = false
    this.show(word, 'Get ready…')
    void this.audio.checkpoint()
    void this.audio.speak('Checkpoint! Now you say the word.')
      .then(() => this.audio.speak(capitalize(word), 0.82))
      .then(() => this.audio.speak('Your turn. Say it into the microphone.', 0.95))
      .then(() => this.startListening())
  }

  cancel() {
    this.stopListening()
    this.word = ''
    this.onDone = null
    this.els.overlay.classList.add('hidden')
  }

  private show(word: string, status: string) {
    this.els.overlay.classList.remove('hidden')
    this.els.word.textContent = capitalize(word)
    this.els.status.textContent = status
  }

  private hide() {
    this.els.overlay.classList.add('hidden')
    this.els.micBtn.classList.remove('is-listening')
  }

  private stopListening() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = 0
    }
    if (this.rec) {
      try { this.rec.onresult = null; this.rec.onerror = null; this.rec.onend = null } catch { /* noop */ }
      try { this.rec.abort() } catch { /* noop */ }
      try { this.rec.stop() } catch { /* noop */ }
      this.rec = null
    }
  }

  private startListening() {
    if (!this.word) return
    this.stopListening()
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Ctor) {
      this.els.status.textContent = 'Speech not available here — tap mic after saying the word aloud.'
      return
    }
    const rec = new Ctor()
    this.rec = rec
    rec.lang = 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (event) => {
      let interim = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        const piece = r[0]?.transcript ?? ''
        if (r.isFinal) finalText += ' ' + piece
        else interim += ' ' + piece
      }
      if (interim.trim()) this.handleHeard(interim, false)
      if (finalText.trim()) this.handleHeard(finalText, true)
    }
    rec.onerror = (e) => {
      const err = e.error || ''
      if (err === 'not-allowed') this.els.status.textContent = 'Allow the microphone, then tap the mic.'
      else if (err === 'no-speech') this.els.status.textContent = 'I did not hear you. Tap mic and try again.'
      else if (err !== 'aborted') this.els.status.textContent = 'Tap the mic and say the word.'
    }
    rec.onend = () => {
      if (this.word && this.rec === rec) {
        try { rec.start() } catch { /* noop */ }
      }
    }
    try {
      rec.start()
      this.els.status.textContent = 'Listening… say the word!'
      this.els.micBtn.classList.add('is-listening')
    } catch {
      this.els.status.textContent = 'Tap the mic, then say the word.'
    }
    this.timer = window.setTimeout(() => this.retry('I am still listening. Here is the word again.'), 12000)
  }

  private handleHeard(text: string, isFinal: boolean) {
    if (!this.word) return
    const clean = text.trim()
    if (!clean) return
    if (!isFinal) {
      this.els.status.textContent = `Hearing “${clean}”…`
      return
    }
    if (!transcriptMatchesWord(clean, this.word)) {
      this.els.status.textContent = `I heard “${clean}”. Listen again.`
      this.retry(`I heard “${clean}”. The word is`)
      return
    }
    this.success()
  }

  private retry(leadIn: string) {
    if (!this.word || this.prompting) return
    this.prompting = true
    this.stopListening()
    const w = this.word
    this.show(w, 'Listen, then say it.')
    void this.audio.speak(leadIn, 0.95)
      .then(() => this.audio.speak(capitalize(w), 0.8))
      .then(() => this.audio.speak('Now you say it.', 0.95))
      .then(() => {
        this.prompting = false
        if (this.word) this.startListening()
      })
  }

  private success() {
    this.stopListening()
    const done = this.onDone
    this.word = ''
    this.onDone = null
    this.show('', 'Yes! Great job!')
    void this.audio.success()
    void this.audio.speak('Yes! Great job. Keep racing!', 0.95).then(() => {
      this.hide()
      done?.()
    })
  }
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

export {}
