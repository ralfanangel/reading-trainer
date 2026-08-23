import * as THREE from 'three'
import { capitalize } from './utils'
import type { Track } from './Track'

export type WordPad = {
  text: string
  t: number
  lane: number
  hue: number
  hit: boolean
  sprite: THREE.Sprite
}

export function makeWordSprite(text: string, hue: number) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  const col = `hsl(${hue} 88% 58%)`
  g.fillStyle = 'rgba(0,0,0,0.22)'
  g.beginPath()
  g.roundRect(28, 36, 456, 184, 48)
  g.fill()
  g.fillStyle = col
  g.beginPath()
  g.roundRect(16, 20, 456, 184, 48)
  g.fill()
  g.strokeStyle = 'rgba(255,255,255,0.55)'
  g.lineWidth = 8
  g.stroke()
  g.fillStyle = '#142038'
  g.font = '800 92px "Baloo 2", system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(capitalize(text), 256, 118)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: true })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(3.2, 1.6, 1)
  sprite.renderOrder = 10
  return sprite
}

export function spawnWordPads(track: Track, words: string[], scene: THREE.Scene): WordPad[] {
  const pack = [...words].sort(() => Math.random() - 0.5)
  const pads: WordPad[] = []
  track.wordAnchors.forEach((anchor, i) => {
    const text = pack[i % pack.length]
    const hue = (i * 47) % 360
    const sprite = makeWordSprite(text, hue)
    const placed = track.place(anchor.t, anchor.lane, 0.9)
    sprite.position.copy(placed.pos)
    scene.add(sprite)
    pads.push({ text, t: anchor.t, lane: anchor.lane, hue, hit: false, sprite })
  })
  return pads
}

export function updateWordPads(pads: WordPad[], track: Track, time: number, animate = true) {
  for (const w of pads) {
    if (w.hit) continue
    const p = track.place(w.t, w.lane, 0.9)
    w.sprite.position.copy(p.pos)
    if (animate) w.sprite.position.y += Math.sin(time * 3 + w.t * 50) * 0.08
  }
}

export function checkWordHit(
  pads: WordPad[],
  kartT: number,
  kartLane: number,
): WordPad | null {
  for (const w of pads) {
    if (w.hit) continue
    let dT = Math.abs(w.t - kartT)
    dT = Math.min(dT, 1 - dT)
    if (dT < 0.011 && Math.abs(w.lane - kartLane) < 1.25) return w
  }
  return null
}
