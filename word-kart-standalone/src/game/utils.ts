export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const rand = (a: number, b: number) => a + Math.random() * (b - a)
export const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

export function normalizeHeard(text: string) {
  return String(text || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function transcriptMatchesWord(transcript: string, word: string) {
  const target = normalizeHeard(word)
  const heard = normalizeHeard(transcript)
  if (!target || !heard) return false
  if (heard === target) return true
  const tokens = heard.split(' ').filter(Boolean)
  if (tokens.includes(target)) return true
  if (tokens.length <= 3 && tokens.some((t) => t === target)) return true
  if (target.length <= 2 && tokens.length === 1 && tokens[0].startsWith(target)) return true
  return false
}
