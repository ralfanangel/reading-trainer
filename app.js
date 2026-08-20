// Reading Trainer — journey, games, chest, 3D buddy
const STORAGE_KEY = 'rt_profile_v3'
const confettiCanvas = document.getElementById('confetti-canvas')
let confettiCtx = null
let confettiParticles = []
let animals = []
let voices = []
let preferredVoice = null
let currentGame = null
let currentItem = null
let roundReady = false
let pickLocked = false
let roundStartedAt = 0
let bookPage = 0
let bookStory = null

const STOPS = [
  { id: 'letters', x: '16%', y: '74%', emoji: '🔤', title: 'Letter Grove', skill: 'Letter sounds', game: 'trace', need: 0, isle: 'grove' },
  { id: 'blend', x: '34%', y: '40%', emoji: '🎚️', title: 'Blend Bridge', skill: 'Sound sliders', game: 'slider', need: 4, isle: 'bridge' },
  { id: 'books', x: '52%', y: '76%', emoji: '📖', title: 'Story Meadow', skill: 'Co-read books', game: 'book', need: 8, isle: 'meadow' },
  { id: 'decode', x: '64%', y: '32%', emoji: '🪄', title: 'Decoder Peak', skill: 'Long vowels', game: 'magice', need: 12, isle: 'peak' },
  { id: 'fluent', x: '80%', y: '64%', emoji: '🏮', title: 'Luma\'s Lantern', skill: 'Heart words', game: 'heart', need: 16, isle: 'summit' }
]

const GAMES = [
  { id: 'trace', title: 'Sky Trace', ico: '✏️', blurb: 'Trace lowercase letters. Most words use these shapes.', skill: 'Letter formation', unlock: 0 },
  { id: 'hungry', title: 'Hungry Lantern', ico: '🏮', blurb: 'Feed Luma pictures that start with the sound.', skill: 'First sound', unlock: 0 },
  { id: 'slider', title: 'Sound Slide', ico: '🎚️', blurb: 'Slide under slow blue sounds and fast red sounds, then blend.', skill: 'Blending', unlock: 0 },
  { id: 'builder', title: 'Build the Word', ico: '🧱', blurb: 'Snap sound chunks like sh, st, and ake to spell the picture.', skill: 'Encoding', unlock: 0 },
  { id: 'book', title: 'Co-read Story', ico: '📖', blurb: 'Grown-up reads small words. Child reads the big word. Picture waits.', skill: 'Books', unlock: 0 },
  { id: 'safari', title: 'Word Safari', ico: '🗺️', blurb: 'Read the word first. The picture stays hidden until you get it.', skill: 'Word reading', unlock: 0 },
  { id: 'magice', title: 'Magic E Flip', ico: '🪄', blurb: 'Silent e makes the vowel say its name. Tap the right word.', skill: 'VCe', unlock: 0 },
  { id: 'heart', title: 'Heart Words', ico: '🧡', blurb: 'Some letters are rule-breakers. Remember them by heart.', skill: 'Irregulars', unlock: 0 },
  { id: 'slice', title: 'Balloon Slice', ico: '🎈', blurb: 'Slice the picture that starts with the sound.', skill: 'First sound', unlock: 0 },
  { id: 'rhyme', title: 'Rhyme Race', ico: '🏁', blurb: 'Tap the picture that rhymes.', skill: 'Rhyming', unlock: 0 },
  { id: 'odd', title: 'Odd One Out', ico: '🔍', blurb: 'Three start with the same sound. Tap the odd picture.', skill: 'First sound', unlock: 0 },
  { id: 'vowel', title: 'Vowel Catch', ico: '🎣', blurb: 'Catch the vowel in the middle.', skill: 'Short vowels', unlock: 0 }
]

const GAME_HOW = {
  slice: 'Balloon Slice. Listen to the sound. Then slice only the balloon that starts with that sound. Sparks you earn stay with Luma.',
  hungry: 'Hungry Lantern. Listen to the sound. Tap the picture that starts with that sound.',
  sounds: 'First sound. Listen to the sound. Tap the picture that starts with that sound.',
  slider: 'Sound Slide. Listen to each sound. Blend them into a word. Then tap the picture.',
  blend: 'Blend Machine. Listen to each sound. Blend them into a word. Then tap the picture.',
  builder: 'Build the Word. Look at the picture. Tap the letters in order to spell it.',
  book: 'Story time. A grown-up reads the small words. You read the big word. Then tap the matching picture.',
  safari: 'Word Safari. Look at the word. Sound it out. Then tap the matching picture. I will say the word only after you get it.',
  magice: 'Magic E. Look at the picture. Tap the word that matches. Silent e makes the vowel say its name.',
  heart: 'Heart Words. Some words are tricky. Tap the word that fits.',
  rhyme: 'Rhyme Race. Listen to the word. Tap the picture that rhymes.',
  odd: 'Odd one out. Three pictures start with the same sound. Tap the one that is different.',
  vowel: 'Vowel Catch. Listen to the word. Tap the vowel in the middle. A, E, I, O, or U.',
  trace: 'Letter hunt. Listen to the sound. Tap the matching letter.',
  lessons: 'Phonics studio. Listen. When you can read the word, tap I read it.'
}

let howReady = Promise.resolve()
function speakHowTo(id) {
  const line = GAME_HOW[id] || 'Listen first. Then you try.'
  unlockSpeech()
  pickLocked = true
  howReady = speak(line, { rate: 0.94 }).catch(() => {})
  return howReady
}
function afterHow(fn) {
  return howReady.then(() => {
    pickLocked = false
    if (fn) setTimeout(fn, 240)
  })
}

const SKILLS = [
  { id: 'cvc', title: 'Short CVC', blurb: 'cat, dog, sun', need: 6 },
  { id: 'digraph', title: 'Digraphs', blurb: 'sh, ch, th, ck', need: 8 },
  { id: 'blend', title: 'Blends', blurb: 'st, fr, nd, mp', need: 8 },
  { id: 'silent', title: 'Magic e', blurb: 'cake, bike, rope', need: 8 },
  { id: 'teams', title: 'Vowel teams', blurb: 'ai, ee, oa, ay', need: 8 }
]

const LOOT = [
  { id: 'pebble', name: 'Sunny pebble', emoji: '🟡', need: 1, blurb: 'Your first reading star!' },
  { id: 'shell', name: 'River shell', emoji: '🐚', need: 2, blurb: 'Found on Blend Bridge.' },
  { id: 'key', name: 'Bronze key', emoji: '🔑', need: 3, blurb: 'Opens a little gate.' },
  { id: 'hat', name: 'Silly hat', emoji: '🎩', need: 4, blurb: 'Pip can wear this.', wear: 'hat' },
  { id: 'gem', name: 'Ruby gem', emoji: '💎', need: 5, blurb: 'Sparkles when you blend.' },
  { id: 'glasses', name: 'Star glasses', emoji: '🕶️', need: 6, blurb: 'For careful looking.', wear: 'glasses' },
  { id: 'book', name: 'Pocket book', emoji: '📗', need: 7, blurb: 'A story of your own.' },
  { id: 'cape', name: 'Hero cape', emoji: '🦸', need: 8, blurb: 'Readers are heroes.', wear: 'cape' },
  { id: 'crown', name: 'Reader crown', emoji: '👑', need: 9, blurb: 'You keep showing up.' },
  { id: 'giant', name: 'Giant Treasure', emoji: '🏆', need: 10, blurb: 'The vault at the end of the map!', mega: true }
]

const CVC = [
  { word: 'cat', emoji: '🐱', start: 'c', sounds: ['c', 'a', 't'], phon: ['cuh', 'aah', 'tuh'], rhyme: 'at' },
  { word: 'hat', emoji: '🎩', start: 'h', sounds: ['h', 'a', 't'], phon: ['h', 'aah', 'tuh'], rhyme: 'at' },
  { word: 'bat', emoji: '🦇', start: 'b', sounds: ['b', 'a', 't'], phon: ['buh', 'aah', 'tuh'], rhyme: 'at' },
  { word: 'dog', emoji: '🐶', start: 'd', sounds: ['d', 'o', 'g'], phon: ['duh', 'aw', 'guh'], rhyme: 'og' },
  { word: 'log', emoji: '🪵', start: 'l', sounds: ['l', 'o', 'g'], phon: ['luh', 'aw', 'guh'], rhyme: 'og' },
  { word: 'fog', emoji: '🌫️', start: 'f', sounds: ['f', 'o', 'g'], phon: ['f', 'aw', 'guh'], rhyme: 'og' },
  { word: 'pig', emoji: '🐷', start: 'p', sounds: ['p', 'i', 'g'], phon: ['puh', 'ih', 'guh'], rhyme: 'ig' },
  { word: 'wig', emoji: '💇', start: 'w', sounds: ['w', 'i', 'g'], phon: ['wuh', 'ih', 'guh'], rhyme: 'ig' },
  { word: 'sun', emoji: '☀️', start: 's', sounds: ['s', 'u', 'n'], phon: ['s', 'uh', 'n'], rhyme: 'un' },
  { word: 'bun', emoji: '🍞', start: 'b', sounds: ['b', 'u', 'n'], phon: ['buh', 'uh', 'n'], rhyme: 'un' },
  { word: 'run', emoji: '🏃', start: 'r', sounds: ['r', 'u', 'n'], phon: ['ruh', 'uh', 'n'], rhyme: 'un' },
  { word: 'bed', emoji: '🛏️', start: 'b', sounds: ['b', 'e', 'd'], phon: ['buh', 'eh', 'duh'], rhyme: 'ed' },
  { word: 'red', emoji: '🔴', start: 'r', sounds: ['r', 'e', 'd'], phon: ['ruh', 'eh', 'duh'], rhyme: 'ed' },
  { word: 'pen', emoji: '🖊️', start: 'p', sounds: ['p', 'e', 'n'], phon: ['puh', 'eh', 'n'], rhyme: 'en' },
  { word: 'hen', emoji: '🐔', start: 'h', sounds: ['h', 'e', 'n'], phon: ['h', 'eh', 'n'], rhyme: 'en' },
  { word: 'ten', emoji: '🔟', start: 't', sounds: ['t', 'e', 'n'], phon: ['tuh', 'eh', 'n'], rhyme: 'en' },
  { word: 'cup', emoji: '🥤', start: 'c', sounds: ['c', 'u', 'p'], phon: ['cuh', 'uh', 'puh'], rhyme: 'up' },
  { word: 'pup', emoji: '🐾', start: 'p', sounds: ['p', 'u', 'p'], phon: ['puh', 'uh', 'puh'], rhyme: 'up' },
  { word: 'map', emoji: '🗺️', start: 'm', sounds: ['m', 'a', 'p'], phon: ['m', 'aah', 'puh'], rhyme: 'ap' },
  { word: 'cap', emoji: '🧢', start: 'c', sounds: ['c', 'a', 'p'], phon: ['cuh', 'aah', 'puh'], rhyme: 'ap' },
  { word: 'net', emoji: '🥅', start: 'n', sounds: ['n', 'e', 't'], phon: ['n', 'eh', 'tuh'], rhyme: 'et' },
  { word: 'jet', emoji: '✈️', start: 'j', sounds: ['j', 'e', 't'], phon: ['juh', 'eh', 'tuh'], rhyme: 'et' },
  { word: 'bus', emoji: '🚌', start: 'b', sounds: ['b', 'u', 's'], phon: ['buh', 'uh', 's'], rhyme: 'us' },
  { word: 'fox', emoji: '🦊', start: 'f', sounds: ['f', 'o', 'x'], phon: ['f', 'aw', 'ks'], rhyme: 'ox' },
  { word: 'van', emoji: '🚐', start: 'v', sounds: ['v', 'a', 'n'], phon: ['vuh', 'aah', 'n'], rhyme: 'an' },
  { word: 'fan', emoji: '🪭', start: 'f', sounds: ['f', 'a', 'n'], phon: ['f', 'aah', 'n'], rhyme: 'an' },
  { word: 'kid', emoji: '🧒', start: 'k', sounds: ['k', 'i', 'd'], phon: ['cuh', 'ih', 'duh'], rhyme: 'id' },
  { word: 'zip', emoji: '🤐', start: 'z', sounds: ['z', 'i', 'p'], phon: ['z', 'ih', 'puh'], rhyme: 'ip' },
  { word: 'gum', emoji: '🍬', start: 'g', sounds: ['g', 'u', 'm'], phon: ['guh', 'uh', 'm'], rhyme: 'um' }
]

const EXTRA_WORDS = [
  { word: 'ship', emoji: '🚢', start: 'sh', sounds: ['sh', 'i', 'p'], parts: ['sh', 'i', 'p'], phon: ['shh', 'ih', 'puh'], rhyme: 'ip', skill: 'digraph' },
  { word: 'shop', emoji: '🏪', start: 'sh', sounds: ['sh', 'o', 'p'], parts: ['sh', 'o', 'p'], phon: ['shh', 'aw', 'puh'], rhyme: 'op', skill: 'digraph' },
  { word: 'shed', emoji: '🛖', start: 'sh', sounds: ['sh', 'e', 'd'], parts: ['sh', 'e', 'd'], phon: ['shh', 'eh', 'duh'], rhyme: 'ed', skill: 'digraph' },
  { word: 'fish', emoji: '🐟', start: 'f', sounds: ['f', 'i', 'sh'], parts: ['f', 'i', 'sh'], phon: ['f', 'ih', 'shh'], rhyme: 'ish', skill: 'digraph' },
  { word: 'chop', emoji: '🔪', start: 'ch', sounds: ['ch', 'o', 'p'], parts: ['ch', 'o', 'p'], phon: ['chuh', 'aw', 'puh'], rhyme: 'op', skill: 'digraph' },
  { word: 'chin', emoji: '😊', start: 'ch', sounds: ['ch', 'i', 'n'], parts: ['ch', 'i', 'n'], phon: ['chuh', 'ih', 'n'], rhyme: 'in', skill: 'digraph' },
  { word: 'chip', emoji: '🍟', start: 'ch', sounds: ['ch', 'i', 'p'], parts: ['ch', 'i', 'p'], phon: ['chuh', 'ih', 'puh'], rhyme: 'ip', skill: 'digraph' },
  { word: 'duck', emoji: '🦆', start: 'd', sounds: ['d', 'u', 'ck'], parts: ['d', 'u', 'ck'], phon: ['duh', 'uh', 'kuh'], rhyme: 'uck', skill: 'digraph' },
  { word: 'sock', emoji: '🧦', start: 's', sounds: ['s', 'o', 'ck'], parts: ['s', 'o', 'ck'], phon: ['s', 'aw', 'kuh'], rhyme: 'ock', skill: 'digraph' },
  { word: 'bath', emoji: '🛁', start: 'b', sounds: ['b', 'a', 'th'], parts: ['b', 'a', 'th'], phon: ['buh', 'aah', 'thuh'], rhyme: 'ath', skill: 'digraph' },
  { word: 'thin', emoji: '📏', start: 'th', sounds: ['th', 'i', 'n'], parts: ['th', 'i', 'n'], phon: ['thuh', 'ih', 'n'], rhyme: 'in', skill: 'digraph' },
  { word: 'stop', emoji: '🛑', start: 'st', sounds: ['st', 'o', 'p'], parts: ['st', 'o', 'p'], phon: ['stuh', 'aw', 'puh'], rhyme: 'op', skill: 'blend' },
  { word: 'frog', emoji: '🐸', start: 'fr', sounds: ['fr', 'o', 'g'], parts: ['fr', 'o', 'g'], phon: ['fruh', 'aw', 'guh'], rhyme: 'og', skill: 'blend' },
  { word: 'flag', emoji: '🚩', start: 'fl', sounds: ['fl', 'a', 'g'], parts: ['fl', 'a', 'g'], phon: ['fluh', 'aah', 'guh'], rhyme: 'ag', skill: 'blend' },
  { word: 'crab', emoji: '🦀', start: 'cr', sounds: ['cr', 'a', 'b'], parts: ['cr', 'a', 'b'], phon: ['cruh', 'aah', 'buh'], rhyme: 'ab', skill: 'blend' },
  { word: 'clap', emoji: '👏', start: 'cl', sounds: ['cl', 'a', 'p'], parts: ['cl', 'a', 'p'], phon: ['cluh', 'aah', 'puh'], rhyme: 'ap', skill: 'blend' },
  { word: 'sled', emoji: '🛷', start: 'sl', sounds: ['sl', 'e', 'd'], parts: ['sl', 'e', 'd'], phon: ['sluh', 'eh', 'duh'], rhyme: 'ed', skill: 'blend' },
  { word: 'swim', emoji: '🏊', start: 'sw', sounds: ['sw', 'i', 'm'], parts: ['sw', 'i', 'm'], phon: ['swuh', 'ih', 'm'], rhyme: 'im', skill: 'blend' },
  { word: 'sand', emoji: '🏖️', start: 's', sounds: ['s', 'a', 'nd'], parts: ['s', 'a', 'nd'], phon: ['s', 'aah', 'nd'], rhyme: 'and', skill: 'blend' },
  { word: 'tent', emoji: '⛺', start: 't', sounds: ['t', 'e', 'nt'], parts: ['t', 'e', 'nt'], phon: ['tuh', 'eh', 'nt'], rhyme: 'ent', skill: 'blend' },
  { word: 'jump', emoji: '🦘', start: 'j', sounds: ['j', 'u', 'mp'], parts: ['j', 'u', 'mp'], phon: ['juh', 'uh', 'mp'], rhyme: 'ump', skill: 'blend' },
  { word: 'milk', emoji: '🥛', start: 'm', sounds: ['m', 'i', 'lk'], parts: ['m', 'i', 'lk'], phon: ['m', 'ih', 'lk'], rhyme: 'ilk', skill: 'blend' },
  { word: 'plum', emoji: '🍇', start: 'pl', sounds: ['pl', 'u', 'm'], parts: ['pl', 'u', 'm'], phon: ['pluh', 'uh', 'm'], rhyme: 'um', skill: 'blend' },
  { word: 'cake', emoji: '🍰', start: 'c', sounds: ['c', 'a', 'k', 'e'], parts: ['c', 'a', 'k', 'e'], phon: ['cuh', 'ay', 'kuh'], rhyme: 'ake', skill: 'silent', magic: true },
  { word: 'bike', emoji: '🚲', start: 'b', sounds: ['b', 'i', 'k', 'e'], parts: ['b', 'i', 'k', 'e'], phon: ['buh', 'eye', 'kuh'], rhyme: 'ike', skill: 'silent', magic: true },
  { word: 'rope', emoji: '🪢', start: 'r', sounds: ['r', 'o', 'p', 'e'], parts: ['r', 'o', 'p', 'e'], phon: ['ruh', 'oh', 'puh'], rhyme: 'ope', skill: 'silent', magic: true },
  { word: 'kite', emoji: '🪁', start: 'k', sounds: ['k', 'i', 't', 'e'], parts: ['k', 'i', 't', 'e'], phon: ['cuh', 'eye', 'tuh'], rhyme: 'ite', skill: 'silent', magic: true },
  { word: 'bone', emoji: '🦴', start: 'b', sounds: ['b', 'o', 'n', 'e'], parts: ['b', 'o', 'n', 'e'], phon: ['buh', 'oh', 'n'], rhyme: 'one', skill: 'silent', magic: true },
  { word: 'lake', emoji: '🏞️', start: 'l', sounds: ['l', 'a', 'k', 'e'], parts: ['l', 'a', 'k', 'e'], phon: ['luh', 'ay', 'kuh'], rhyme: 'ake', skill: 'silent', magic: true },
  { word: 'cape', emoji: '🦸', start: 'c', sounds: ['c', 'a', 'p', 'e'], parts: ['c', 'a', 'p', 'e'], phon: ['cuh', 'ay', 'puh'], rhyme: 'ape', skill: 'silent', magic: true, pair: 'cap' },
  { word: 'pine', emoji: '🌲', start: 'p', sounds: ['p', 'i', 'n', 'e'], parts: ['p', 'i', 'n', 'e'], phon: ['puh', 'eye', 'n'], rhyme: 'ine', skill: 'silent', magic: true },
  { word: 'note', emoji: '🎵', start: 'n', sounds: ['n', 'o', 't', 'e'], parts: ['n', 'o', 't', 'e'], phon: ['n', 'oh', 'tuh'], rhyme: 'ote', skill: 'silent', magic: true },
  { word: 'cube', emoji: '🧊', start: 'c', sounds: ['c', 'u', 'b', 'e'], parts: ['c', 'u', 'b', 'e'], phon: ['cuh', 'yoo', 'buh'], rhyme: 'ube', skill: 'silent', magic: true },
  { word: 'rain', emoji: '🌧️', start: 'r', sounds: ['r', 'ai', 'n'], parts: ['r', 'ai', 'n'], phon: ['ruh', 'ay', 'n'], rhyme: 'ain', skill: 'teams' },
  { word: 'train', emoji: '🚂', start: 'tr', sounds: ['tr', 'ai', 'n'], parts: ['tr', 'ai', 'n'], phon: ['truh', 'ay', 'n'], rhyme: 'ain', skill: 'teams' },
  { word: 'boat', emoji: '⛵', start: 'b', sounds: ['b', 'oa', 't'], parts: ['b', 'oa', 't'], phon: ['buh', 'oh', 'tuh'], rhyme: 'oat', skill: 'teams' },
  { word: 'goat', emoji: '🐐', start: 'g', sounds: ['g', 'oa', 't'], parts: ['g', 'oa', 't'], phon: ['guh', 'oh', 'tuh'], rhyme: 'oat', skill: 'teams' },
  { word: 'leaf', emoji: '🍃', start: 'l', sounds: ['l', 'ea', 'f'], parts: ['l', 'ea', 'f'], phon: ['luh', 'ee', 'f'], rhyme: 'eaf', skill: 'teams' },
  { word: 'seat', emoji: '💺', start: 's', sounds: ['s', 'ea', 't'], parts: ['s', 'ea', 't'], phon: ['s', 'ee', 'tuh'], rhyme: 'eat', skill: 'teams' },
  { word: 'tree', emoji: '🌳', start: 'tr', sounds: ['tr', 'ee'], parts: ['tr', 'ee'], phon: ['truh', 'ee'], rhyme: 'ee', skill: 'teams' },
  { word: 'green', emoji: '🟢', start: 'gr', sounds: ['gr', 'ee', 'n'], parts: ['gr', 'ee', 'n'], phon: ['gruh', 'ee', 'n'], rhyme: 'een', skill: 'teams' },
  { word: 'play', emoji: '▶️', start: 'pl', sounds: ['pl', 'ay'], parts: ['pl', 'ay'], phon: ['pluh', 'ay'], rhyme: 'ay', skill: 'teams' },
  { word: 'soap', emoji: '🧼', start: 's', sounds: ['s', 'oa', 'p'], parts: ['s', 'oa', 'p'], phon: ['s', 'oh', 'puh'], rhyme: 'oap', skill: 'teams' }
]

const EXTRA_SCENES = [
  { word: 'mop', emoji: '🧹', start: 'm', sounds: ['m', 'o', 'p'], phon: ['m', 'aw', 'puh'], rhyme: 'op', skill: 'cvc' },
  { word: 'pot', emoji: '🍲', start: 'p', sounds: ['p', 'o', 't'], phon: ['puh', 'aw', 'tuh'], rhyme: 'ot', skill: 'cvc' },
  { word: 'box', emoji: '📦', start: 'b', sounds: ['b', 'o', 'x'], phon: ['buh', 'aw', 'ks'], rhyme: 'ox', skill: 'cvc' },
  { word: 'bag', emoji: '👜', start: 'b', sounds: ['b', 'a', 'g'], phon: ['buh', 'aah', 'guh'], rhyme: 'ag', skill: 'cvc' },
  { word: 'pan', emoji: '🍳', start: 'p', sounds: ['p', 'a', 'n'], phon: ['puh', 'aah', 'n'], rhyme: 'an', skill: 'cvc' },
  { word: 'jam', emoji: '🍯', start: 'j', sounds: ['j', 'a', 'm'], phon: ['juh', 'aah', 'm'], rhyme: 'am', skill: 'cvc' },
  { word: 'web', emoji: '🕸️', start: 'w', sounds: ['w', 'e', 'b'], phon: ['wuh', 'eh', 'buh'], rhyme: 'eb', skill: 'cvc' },
  { word: 'mud', emoji: '🟤', start: 'm', sounds: ['m', 'u', 'd'], phon: ['m', 'uh', 'duh'], rhyme: 'ud', skill: 'cvc' },
  { word: 'nut', emoji: '🥜', start: 'n', sounds: ['n', 'u', 't'], phon: ['n', 'uh', 'tuh'], rhyme: 'ut', skill: 'cvc' },
  { word: 'bell', emoji: '🔔', start: 'b', sounds: ['b', 'e', 'll'], parts: ['b', 'e', 'll'], phon: ['buh', 'eh', 'l'], rhyme: 'ell', skill: 'cvc' },
  { word: 'ball', emoji: '⚽', start: 'b', sounds: ['b', 'a', 'll'], parts: ['b', 'a', 'll'], phon: ['buh', 'aw', 'l'], rhyme: 'all', skill: 'cvc' },
  { word: 'hill', emoji: '⛰️', start: 'h', sounds: ['h', 'i', 'll'], parts: ['h', 'i', 'll'], phon: ['h', 'ih', 'l'], rhyme: 'ill', skill: 'cvc' },
  { word: 'drum', emoji: '🥁', start: 'dr', sounds: ['dr', 'u', 'm'], parts: ['dr', 'u', 'm'], phon: ['druh', 'uh', 'm'], rhyme: 'um', skill: 'blend' },
  { word: 'lamp', emoji: '💡', start: 'l', sounds: ['l', 'a', 'mp'], parts: ['l', 'a', 'mp'], phon: ['luh', 'aah', 'mp'], rhyme: 'amp', skill: 'blend' },
  { word: 'mask', emoji: '🎭', start: 'm', sounds: ['m', 'a', 'sk'], parts: ['m', 'a', 'sk'], phon: ['m', 'aah', 'sk'], rhyme: 'ask', skill: 'blend' },
  { word: 'farm', emoji: '🚜', start: 'f', sounds: ['f', 'ar', 'm'], parts: ['f', 'ar', 'm'], phon: ['f', 'ar', 'm'], rhyme: 'arm', skill: 'blend' },
  { word: 'nest', emoji: '🪺', start: 'n', sounds: ['n', 'e', 'st'], parts: ['n', 'e', 'st'], phon: ['n', 'eh', 'st'], rhyme: 'est', skill: 'blend' },
  { word: 'gift', emoji: '🎁', start: 'g', sounds: ['g', 'i', 'ft'], parts: ['g', 'i', 'ft'], phon: ['guh', 'ih', 'ft'], rhyme: 'ift', skill: 'blend' },
  { word: 'truck', emoji: '🚚', start: 'tr', sounds: ['tr', 'u', 'ck'], parts: ['tr', 'u', 'ck'], phon: ['truh', 'uh', 'kuh'], rhyme: 'uck', skill: 'blend' },
  { word: 'clock', emoji: '⏰', start: 'cl', sounds: ['cl', 'o', 'ck'], parts: ['cl', 'o', 'ck'], phon: ['cluh', 'aw', 'kuh'], rhyme: 'ock', skill: 'digraph' },
  { word: 'brush', emoji: '🪥', start: 'br', sounds: ['br', 'u', 'sh'], parts: ['br', 'u', 'sh'], phon: ['bruh', 'uh', 'shh'], rhyme: 'ush', skill: 'digraph' },
  { word: 'shell', emoji: '🐚', start: 'sh', sounds: ['sh', 'e', 'll'], parts: ['sh', 'e', 'll'], phon: ['shh', 'eh', 'l'], rhyme: 'ell', skill: 'digraph' },
  { word: 'home', emoji: '🏠', start: 'h', sounds: ['h', 'o', 'm', 'e'], parts: ['h', 'o', 'm', 'e'], phon: ['h', 'oh', 'm'], rhyme: 'ome', skill: 'silent' },
  { word: 'gate', emoji: '🚧', start: 'g', sounds: ['g', 'a', 't', 'e'], parts: ['g', 'a', 't', 'e'], phon: ['guh', 'ay', 'tuh'], rhyme: 'ate', skill: 'silent' },
  { word: 'slide', emoji: '🛝', start: 'sl', sounds: ['sl', 'i', 'd', 'e'], parts: ['sl', 'i', 'd', 'e'], phon: ['sluh', 'eye', 'duh'], rhyme: 'ide', skill: 'silent' },
  { word: 'plane', emoji: '🛩️', start: 'pl', sounds: ['pl', 'a', 'n', 'e'], parts: ['pl', 'a', 'n', 'e'], phon: ['pluh', 'ay', 'n'], rhyme: 'ane', skill: 'silent' },
  { word: 'moon', emoji: '🌙', start: 'm', sounds: ['m', 'oo', 'n'], parts: ['m', 'oo', 'n'], phon: ['m', 'oo', 'n'], rhyme: 'oon', skill: 'teams' },
  { word: 'star', emoji: '⭐', start: 'st', sounds: ['st', 'ar'], parts: ['st', 'ar'], phon: ['stuh', 'ar'], rhyme: 'ar', skill: 'blend' },
  { word: 'snow', emoji: '❄️', start: 'sn', sounds: ['sn', 'ow'], parts: ['sn', 'ow'], phon: ['snuh', 'oh'], rhyme: 'ow', skill: 'teams' },
  { word: 'boot', emoji: '👢', start: 'b', sounds: ['b', 'oo', 't'], parts: ['b', 'oo', 't'], phon: ['buh', 'oo', 'tuh'], rhyme: 'oot', skill: 'teams' },
  { word: 'spoon', emoji: '🥄', start: 'sp', sounds: ['sp', 'oo', 'n'], parts: ['sp', 'oo', 'n'], phon: ['spuh', 'oo', 'n'], rhyme: 'oon', skill: 'teams' },
  { word: 'peach', emoji: '🍑', start: 'p', sounds: ['p', 'ea', 'ch'], parts: ['p', 'ea', 'ch'], phon: ['puh', 'ee', 'chuh'], rhyme: 'each', skill: 'teams' },
  { word: 'house', emoji: '🏡', start: 'h', sounds: ['h', 'ou', 'se'], parts: ['h', 'ou', 'se'], phon: ['h', 'ow', 's'], rhyme: 'ouse', skill: 'teams' },
  { word: 'book', emoji: '📕', start: 'b', sounds: ['b', 'oo', 'k'], parts: ['b', 'oo', 'k'], phon: ['buh', 'u', 'kuh'], rhyme: 'ook', skill: 'teams' },
  { word: 'queen', emoji: '👸', start: 'qu', sounds: ['qu', 'ee', 'n'], parts: ['qu', 'ee', 'n'], phon: ['kwuh', 'ee', 'n'], rhyme: 'een', skill: 'teams' },
  { word: 'castle', emoji: '🏰', start: 'c', sounds: ['c', 'a', 'stle'], parts: ['cas', 'tle'], phon: ['cas', 'ul'], rhyme: 'astle', skill: 'blend' },
  { word: 'bridge', emoji: '🌉', start: 'br', sounds: ['br', 'i', 'dge'], parts: ['br', 'i', 'dge'], phon: ['bruh', 'ih', 'j'], rhyme: 'idge', skill: 'blend' },
  { word: 'road', emoji: '🛣️', start: 'r', sounds: ['r', 'oa', 'd'], parts: ['r', 'oa', 'd'], phon: ['ruh', 'oh', 'duh'], rhyme: 'oad', skill: 'teams' }
]

const WORDS = CVC.map((w) => ({ ...w, skill: 'cvc', parts: w.sounds })).concat(EXTRA_WORDS, EXTRA_SCENES).map((w) => ({
  ...w,
  parts: w.parts || w.sounds,
  skill: w.skill || 'cvc'
}))

const MAGIC_PAIRS = [
  { short: { word: 'cap', emoji: '🧢' }, long: { word: 'cape', emoji: '🦸' } },
  { short: { word: 'kit', emoji: '🧰' }, long: { word: 'kite', emoji: '🪁' } },
  { short: { word: 'hop', emoji: '🐰' }, long: { word: 'hope', emoji: '🤞' } },
  { short: { word: 'not', emoji: '🚫' }, long: { word: 'note', emoji: '🎵' } },
  { short: { word: 'cub', emoji: '🐻' }, long: { word: 'cube', emoji: '🧊' } },
  { short: { word: 'pin', emoji: '📌' }, long: { word: 'pine', emoji: '🌲' } },
  { short: { word: 'tap', emoji: '🚰' }, long: { word: 'tape', emoji: '📼' } },
  { short: { word: 'hat', emoji: '🎩' }, long: { word: 'hate', emoji: '😠' } },
  { short: { word: 'mad', emoji: '😡' }, long: { word: 'made', emoji: '🛠️' } },
  { short: { word: 'slid', emoji: '🛷' }, long: { word: 'slide', emoji: '🛝' } }
]

const HEART = [
  { word: 'the', emoji: '👉', heart: 'e', line: 'I see ___ cat.', options: ['the', 'sat', 'sun'] },
  { word: 'a', emoji: '🅰️', heart: 'a', line: 'I want ___ map.', options: ['a', 'at', 'am'] },
  { word: 'is', emoji: '✅', heart: 's', line: 'The dog ___ big.', options: ['is', 'in', 'it'] },
  { word: 'to', emoji: '➡️', heart: 'o', line: 'We go ___ the shop.', options: ['to', 'top', 'tap'] },
  { word: 'said', emoji: '💬', heart: 'ai', line: 'Mom ___ stop.', options: ['said', 'sad', 'sit'] },
  { word: 'was', emoji: '⏳', heart: 'a', line: 'The cat ___ on the bed.', options: ['was', 'wag', 'wet'] },
  { word: 'of', emoji: '📦', heart: 'f', line: 'A bag ___ jam.', options: ['of', 'off', 'if'] },
  { word: 'you', emoji: '🫵', heart: 'ou', line: 'Can ___ read this?', options: ['you', 'yes', 'yum'] },
  { word: 'I', emoji: '🙋', heart: 'I', line: '___ can read.', options: ['I', 'in', 'it'] },
  { word: 'are', emoji: '👫', heart: 'are', line: 'We ___ here.', options: ['are', 'arm', 'art'] }
]

const BOOKS = [
  {
    title: 'In the Fog',
    pages: [
      { grownup: 'Look in the fog. I see a', child: 'dog', ask: 'Who was in the fog?' },
      { grownup: 'The dog sat on a', child: 'log', ask: 'Where did the dog sit?' }
    ]
  },
  {
    title: 'The Red Bus',
    pages: [
      { grownup: 'Here comes a big', child: 'bus', ask: 'What is coming?' },
      { grownup: 'The bus is at the', child: 'shop', ask: 'Where did the bus stop?' }
    ]
  },
  {
    title: 'Rain Day',
    pages: [
      { grownup: 'I feel the wet', child: 'rain', ask: 'What is falling?' },
      { grownup: 'I put on my', child: 'hat', ask: 'What did they put on?' }
    ]
  },
  {
    title: 'At Home',
    pages: [
      { grownup: 'We walk up to our', child: 'home', ask: 'Where are they going?' },
      { grownup: 'I sit on my', child: 'bed', ask: 'Where do they sit?' }
    ]
  },
  {
    title: 'The Gift',
    pages: [
      { grownup: 'Pip got a little', child: 'gift', ask: 'What did Pip get?' },
      { grownup: 'Inside the gift is a', child: 'bell', ask: 'What was inside?' }
    ]
  }
]

const SENTENCES = [
  { text: 'The ship is big.', word: 'ship' },
  { text: 'A frog can jump.', word: 'frog' },
  { text: 'She can bake a cake.', word: 'cake' },
  { text: 'The rain is wet.', word: 'rain' },
  { text: 'A crab is in the sand.', word: 'crab' },
  { text: 'The goat is on a boat.', word: 'goat' },
  { text: 'I see a green tree.', word: 'tree' },
  { text: 'The duck can swim.', word: 'duck' }
]

const LESSONS = [
  { id: 'cvc', title: 'CVC words (short vowels)', words: ['cat', 'dog', 'pig', 'cup', 'bed'] },
  { id: 'silent-e', title: 'Silent e (long vowels)', words: ['cake', 'bike', 'rope', 'name', 'note'] },
  { id: 'vowel-teams', title: 'Vowel teams (ai, ea, oa)', words: ['rain', 'boat', 'seat', 'leaf', 'team'] }
]

let profile = {
  name: null, points: 0, stars: 0, gems: 0, streak: 0, lastDay: null, milestone: 0, level: 1, loot: [],
  skillId: 'cvc', skills: {}, gaps: {}, practiceMs: 0, reads: 0, heardStory: false,
  a11y: { font: 'default', space: '1', tint: 'none' }
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('rt_profile_v2') || localStorage.getItem('rt_profile_v1')
    if (!raw) return
    const data = JSON.parse(raw)
    profile = { ...profile, ...data }
    if (typeof data.treasures === 'number' && !data.loot) {
      profile.stars = data.treasures
      profile.loot = LOOT.filter((t) => t.need <= profile.stars).map((t) => t.id)
    }
    if (!Array.isArray(profile.loot)) profile.loot = []
    if (!profile.skills || typeof profile.skills !== 'object') profile.skills = {}
    if (!profile.skillId) profile.skillId = 'cvc'
    if (!profile.gaps || typeof profile.gaps !== 'object') profile.gaps = {}
    if (!profile.a11y) profile.a11y = { font: 'default', space: '1', tint: 'none' }
    applyA11y()
  } catch (e) { console.warn(e) }
}
function saveProfile() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

function graphemes(item) {
  return (item && (item.parts || item.sounds)) || [...((item && item.word) || '')]
}

function wordPool() {
  const id = profile.skillId || 'digraph'
  const idx = Math.max(0, SKILLS.findIndex((s) => s.id === id))
  const allowed = SKILLS.slice(0, idx + 1).map((s) => s.id)
  const cur = WORDS.filter((w) => w.skill === id)
  const prev = WORDS.filter((w) => allowed.includes(w.skill) && w.skill !== id)
  if (cur.length < 4) return WORDS.filter((w) => allowed.includes(w.skill))
  if (prev.length && Math.random() < 0.25) return prev
  return cur
}

function itemKey(it) {
  return String((it && (it.word || it.name || it.id || it.title || (it.short && it.short.word))) || '').toLowerCase()
}

let recentKeys = []
function pickFrom(pool, avoid = 8) {
  const list = pool || []
  const last = recentKeys[recentKeys.length - 1]
  const blocked = new Set(recentKeys.slice(-avoid))
  let opts = list.filter((p) => !blocked.has(itemKey(p)))
  if (opts.length < 2) opts = list.filter((p) => itemKey(p) !== last)
  if (!opts.length) opts = list
  const pick = opts[Math.floor(Math.random() * opts.length)] || list[0]
  const key = itemKey(pick)
  if (key) {
    recentKeys.push(key)
    if (recentKeys.length > 24) recentKeys.shift()
  }
  return pick
}

function pickWord() {
  return pickFrom(wordPool()) || WORDS[0]
}

function uniquePictureChoices(keep, pool, n) {
  const usedWord = new Set([itemKey(keep)])
  const usedEmoji = new Set([keep.emoji || ''].filter(Boolean))
  const rest = []
  for (const p of shuffleCopy(pool || [])) {
    const w = itemKey(p)
    const em = p.emoji || ''
    if (!w || usedWord.has(w)) continue
    if (em && usedEmoji.has(em)) continue
    usedWord.add(w)
    if (em) usedEmoji.add(em)
    rest.push(p)
    if (rest.length >= n - 1) break
  }
  return shuffleCopy([keep, ...rest])
}

function scoreHud() {
  const p = document.getElementById('hudPoints')
  const s = document.getElementById('hudStars')
  if (p) p.textContent = String(profile.points || 0)
  if (s) s.textContent = String(profile.stars || 0)
  ;[p, s].forEach((el) => {
    if (!el) return
    el.parentElement?.classList.remove('is-bump')
    void el.parentElement?.offsetWidth
    el.parentElement?.classList.add('is-bump')
  })
}

function addPoints(n) {
  profile.points = Math.max(0, (profile.points || 0) + n)
  scoreHud()
}

function setCoach(text) {
  const el = document.getElementById('coachLine')
  if (el) el.textContent = text || ''
}

const SLOW_SOUNDS = new Set(['a', 'e', 'i', 'o', 'u', 'f', 'l', 'm', 'n', 'r', 's', 'v', 'z', 'sh', 'th', 'w', 'oa', 'ai', 'ee', 'ea', 'ay', 'oo', 'ar', 'or', 'ow', 'ou'])
function gClass(g) {
  return SLOW_SOUNDS.has(String(g || '').toLowerCase()) ? 'slow' : 'fast'
}

function applyA11y() {
  const a = profile.a11y || { font: 'default', space: '1', tint: 'none' }
  document.body.classList.toggle('font-lexend', a.font === 'lexend')
  document.body.classList.toggle('space-wide', String(a.space) !== '1')
  document.body.classList.remove('tint-cream', 'tint-mint')
  if (a.tint === 'cream') document.body.classList.add('tint-cream')
  if (a.tint === 'mint') document.body.classList.add('tint-mint')
}

function skillStat(id) {
  return profile.skills[id] || { tries: 0, correct: 0 }
}

function skillPct(id) {
  const s = SKILLS.find((x) => x.id === id)
  const st = skillStat(id)
  return Math.min(100, Math.round((st.correct / (s?.need || 8)) * 100))
}

function markSkill(ok) {
  const id = (currentItem && currentItem.skill) || profile.skillId || 'digraph'
  if (!profile.skills[id]) profile.skills[id] = { tries: 0, correct: 0 }
  profile.skills[id].tries += 1
  if (ok) profile.skills[id].correct += 1
  const s = SKILLS.find((x) => x.id === id)
  const st = profile.skills[id]
  const idx = SKILLS.findIndex((x) => x.id === id)
  if (s && st.correct >= s.need && st.correct / Math.max(1, st.tries) >= 0.7 && idx < SKILLS.length - 1) {
    if (profile.skillId === id) profile.skillId = SKILLS[idx + 1].id
  }
}

function noteGap(ok, item) {
  const g = (item && (item.start || (item.sounds && item.sounds[0]) || item.skill)) || 'sound'
  if (!profile.gaps[g]) profile.gaps[g] = { tries: 0, miss: 0 }
  profile.gaps[g].tries += 1
  if (!ok) profile.gaps[g].miss += 1
}

function renderDashboard() {
  const dash = document.getElementById('dashStats')
  if (dash) {
    const mins = Math.round((profile.practiceMs || 0) / 60000)
    const reads = profile.reads || 0
    const wpm = reads && mins ? Math.round(reads / Math.max(mins, 1)) : 0
    dash.innerHTML = `
      <div class="stat"><b>${profile.points || 0}</b><span>points</span></div>
      <div class="stat"><b>${reads}</b><span>words read</span></div>
      <div class="stat"><b>${mins}m</b><span>practice</span></div>
      <div class="stat"><b>${wpm}</b><span>words / min</span></div>`
  }
  const gaps = document.getElementById('gapList')
  if (gaps) {
    const ranked = Object.entries(profile.gaps || {}).map(([k, v]) => ({
      k, rate: v.miss / Math.max(1, v.tries), ...v
    })).filter((g) => g.tries >= 2).sort((a, b) => b.rate - a.rate).slice(0, 4)
    gaps.innerHTML = ranked.length
      ? ranked.map((g) => `<span class="gap-chip ${g.rate > 0.4 ? 'is-hot' : ''}">/${g.k}/ miss ${Math.round(g.rate * 100)}%</span>`).join('')
      : '<span class="gap-chip">No phonetic gaps yet — keep reading.</span>'
  }
}

function renderSkillTrack() {
  const html = SKILLS.map((s) => {
    const pct = skillPct(s.id)
    const here = profile.skillId === s.id
    return `<div class="skill-row ${here ? 'is-here' : ''} ${pct >= 100 ? 'is-done' : ''}"><div class="skill-meta"><b>${s.title}</b><span>${s.blurb}</span></div><div class="skill-bar"><i style="width:${pct}%"></i></div><em>${pct}%</em></div>`
  }).join('')
  const home = document.getElementById('skillTrack')
  const page = document.getElementById('progressBars')
  if (home) home.innerHTML = html
  if (page) page.innerHTML = html
  const lead = document.getElementById('progressLead')
  const cur = SKILLS.find((s) => s.id === profile.skillId)
  if (lead && cur) lead.textContent = `${profile.name || 'You'} · working on ${cur.title}. Bars fill only when they decode, not when they tap.`
  renderDashboard()
}

function updateWorldMood() {
  const sparks = profile.stars || 0
  document.body.classList.toggle('is-lit', sparks >= 10)
  const glow = document.getElementById('trailGlow')
  if (glow) glow.style.strokeDashoffset = String(Math.max(0, 1400 - (Math.min(10, sparks) / 10) * 1400))
  const luma = document.getElementById('lumaFly')
  const here = STOPS[Math.min(profile.milestone || 0, STOPS.length - 1)]
  if (luma && here) {
    luma.style.left = here.x
    luma.style.top = `calc(${here.y} - 8%)`
    luma.classList.toggle('is-dim', sparks < 3)
  }
  const left = Math.max(0, 10 - sparks)
  const quest = document.getElementById('questLine')
  if (quest) quest.textContent = left ? `Luma needs ${left} more spark${left === 1 ? '' : 's'} to reach her lantern.` : 'Luma found her lantern! The valley is awake.'
  const hook = document.getElementById('storyHook')
  if (hook) hook.textContent = left ? 'Help Luma find her light' : 'Luma is home'
  const megaHint = document.getElementById('megaHint')
  if (megaHint) megaHint.textContent = sparks >= 10 ? 'Her lantern is awake!' : `${left} sparks to wake her home`
}

function advanceSoon() {
  clearTimeout(advanceSoon.t)
  advanceSoon.t = setTimeout(() => {
    if (document.getElementById('view-play')?.classList.contains('is-on')) startRound()
  }, 1100)
}

function showView(id) {
  if (id !== 'slice') stopSlice()
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('is-on'))
  const el = document.getElementById('view-' + id)
  if (el) el.classList.add('is-on')
  document.querySelectorAll('.dock-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.view === id))
  if (id === 'home') startAmbient()
  else stopAmbient()
}

function boxFaces() {
  return '<i class="ft"></i><i class="rt"></i><i class="tp"></i>'
}
function stairHTML(n) {
  let html = ''
  for (let i = 0; i < n; i++) html += `<div class="box st n${i}">${boxFaces()}</div>`
  return html
}
function buildingHTML(kind, icon) {
  const b = (cls) => `<div class="box ${cls}">${boxFaces()}</div>`
  const parts = {
    grove: `${b('plat')}${b('plinth')}${b('hall')}${b('side')}${b('col a')}${b('col b')}${b('tree')}${b('tree t2')}${stairHTML(4)}`,
    bridge: `${b('plat')}${b('leftp')}${b('rightp')}${b('deck')}${b('post-l')}${b('post-r')}<div class="arch"></div>${stairHTML(5)}`,
    meadow: `${b('plat')}${b('hall')}${b('wing')}${b('roof')}<div class="arch"></div>${stairHTML(4)}`,
    peak: `${b('plat')}${b('base')}${b('mid')}${b('topr')}${b('spire')}<div class="flag"></div>${stairHTML(6)}`,
    summit: `${b('plat')}${b('keep')}${b('keep-r')}${b('spire')}<div class="glow"></div>${stairHTML(5)}`
  }
  return `<div class="mv ${kind || 'meadow'}"><div class="mv-shadow"></div>${parts[kind] || parts.meadow}<div class="node">${icon}</div></div>`
}

function greet() {
  const n = profile.name || 'explorer'
  document.getElementById('hello').textContent = `Hi, ${n}!`
}

function renderStops() {
  const box = document.getElementById('stops')
  box.innerHTML = ''
  STOPS.forEach((s, i) => {
    const locked = profile.stars < s.need
    const here = Math.min(profile.milestone, STOPS.length - 1) === i
    const done = profile.stars > s.need || profile.loot.length > s.need
    const b = document.createElement('button')
    b.className = `stop ${s.isle || 'meadow'} ${locked ? 'is-lock' : ''} ${here ? 'is-here' : ''} ${done ? 'is-done' : ''}`
    b.style.left = s.x
    b.style.top = s.y
    b.type = 'button'
    b.innerHTML = `${buildingHTML(s.isle, locked ? '🔒' : s.emoji)}<b>${s.title}</b><small>${s.need ? s.need + ' sparks' : 'Start'}</small>`
    b.addEventListener('click', () => {
      if (locked) {
        playSfx('lock')
        speak('Keep reading to unlock this stop')
        return
      }
      playSfx('tap')
      openGame(s.game)
    })
    box.appendChild(b)
  })
  const mega = document.getElementById('megaTreasure')
  const opened = profile.loot.includes('giant')
  mega.classList.toggle('is-open', opened)
  updateWorldMood()
  renderSkillTrack()
  scoreHud()
}

function renderGames() {
  const grid = document.getElementById('gameGrid')
  grid.innerHTML = ''
  GAMES.forEach((g) => {
    const locked = profile.stars < g.unlock
    const card = document.createElement('button')
    card.className = `game-card ${locked ? 'is-lock' : ''}`
    card.type = 'button'
    card.innerHTML = `<div class="ico">${g.ico}</div><h3>${g.title}</h3><p>${g.blurb}</p>`
    card.addEventListener('click', () => {
      if (locked) { playSfx('lock'); speak('Play the earlier games first'); return }
      playSfx('tap')
      openGame(g.id)
    })
    grid.appendChild(card)
  })
}

function ownedLoot() {
  return LOOT.filter((t) => profile.stars >= t.need || profile.loot.includes(t.id))
}

function grantLoot() {
  const fresh = []
  LOOT.forEach((t) => {
    if (profile.stars >= t.need && !profile.loot.includes(t.id)) {
      profile.loot.push(t.id)
      fresh.push(t)
    }
  })
  profile.gems = Math.floor(profile.points / 2)
  saveProfile()
  if (fresh.length) {
    const t = fresh[fresh.length - 1]
    celebrate()
    showMessage(`Reward: ${t.name} ${t.emoji}`)
    playSfx('loot')
    if (t.wear) applyWear(t.wear)
    return t
  }
  return null
}

function announceLoot(t) {
  if (!t) return Promise.resolve()
  return speak(`You got a new treasure. The ${t.name}. ${t.blurb}`, { interrupt: false })
}

function applyWear(kind) {
  const el = document.getElementById('buddy')
  if (!el || !kind) return
  el.classList.add('wear-' + kind)
}

function haveLoot(t) {
  return profile.loot.includes(t.id) || profile.stars >= t.need
}

function renderChest() {
  const star = document.getElementById('starCount')
  const gem = document.getElementById('gemCount')
  const streak = document.getElementById('streakCount')
  if (star) star.textContent = profile.stars
  if (gem) gem.textContent = profile.gems
  if (streak) streak.textContent = profile.streak
  const lead = document.getElementById('chestLead')
  if (lead) {
    lead.textContent = profile.name
      ? `${profile.name} has ${profile.loot.length} treasures. Sparks come from reading, not rushing.`
      : 'Rewards you earned by reading — not by rushing.'
  }
  const grid = document.getElementById('lootGrid')
  grid.innerHTML = ''
  LOOT.forEach((t) => {
    const have = haveLoot(t)
    const card = document.createElement('button')
    card.type = 'button'
    card.className = `loot-card ${have ? '' : 'is-lock'}`
    card.innerHTML = `<span class="sparkle"></span><div class="ico">${have ? t.emoji : '❔'}</div><h3>${have ? t.name : 'Mystery reward'}</h3><p>${have ? t.blurb : `Earn ${t.need} stars`}</p>`
    card.addEventListener('click', () => onLootTap(card, t, have))
    grid.appendChild(card)
    if (have && t.wear) applyWear(t.wear)
  })
}

function onLootTap(card, t, have) {
  unlockSpeech()
  card.classList.remove('is-spark', 'is-shake')
  void card.offsetWidth
  if (!have) {
    card.classList.add('is-shake')
    speak(`This treasure unlocks at ${t.need} stars.`)
    return
  }
  card.classList.add('is-spark')
  spawnConfetti(36)
  buddyTrick('jump', true)
  if (t.wear) applyWear(t.wear)
  speak(`${t.name}. ${t.blurb}`)
}

function openGame(id) {
  currentGame = id
  unlockSpeech()
  if (id === 'lessons') {
    showView('lessons')
    renderLessons()
    speakHowTo('lessons')
    return
  }
  if (id === 'slice') {
    showView('slice')
    speakHowTo('slice').then(() => startSliceRound())
    return
  }
  const g = GAMES.find((x) => x.id === id) || { title: 'Game', skill: 'Practice' }
  document.getElementById('playTitle').textContent = g.title
  document.getElementById('playSkill').textContent = g.skill
  showView('play')
  speakHowTo(id)
  startRound()
}

function startRound() {
  roundReady = false
  pickLocked = true
  roundStartedAt = Date.now()
  clearMessage()
  setCoach('Grown-up: sit together. You say the prompt. They read.')
  if (currentGame === 'hungry' || currentGame === 'sounds') startHungry()
  else if (currentGame === 'slider' || currentGame === 'blend') startSlider()
  else if (currentGame === 'rhyme') startRhyme()
  else if (currentGame === 'odd') startOdd()
  else if (currentGame === 'builder') startBuilder()
  else if (currentGame === 'vowel') startVowel()
  else if (currentGame === 'magice') startMagicE()
  else if (currentGame === 'book' || currentGame === 'fluency') startBook()
  else if (currentGame === 'heart') startHeart()
  else if (currentGame === 'trace') startTrace()
  else if (currentGame === 'slice') startSliceRound()
  else startSafari()
  afterHow()
}

let sliceRunning = false
let sliceLocked = false
let sliceScore = 0
let sliceWave = 1
let sliceGoal = 10
const SLICE_STEP = 10
let sliceBalloons = []
let sliceRaf = 0
let slashPts = []
let slicing = false

function stopSlice() {
  sliceRunning = false
  sliceLocked = false
  if (sliceRaf) cancelAnimationFrame(sliceRaf)
  sliceRaf = 0
  sliceBalloons = []
  const layer = document.getElementById('balloons')
  if (layer) layer.innerHTML = ''
}

function sliceCheer(wave) {
  return [
    'Luma flickered! Keep the sparks coming.',
    'The path grew brighter!',
    'Her lantern hummed louder!',
    'The valley is waking!',
    'Super glow! Luma can almost see home!'
  ][Math.min(wave, 5) - 1]
}

function updateSliceHud() {
  const hud = document.getElementById('sliceHud')
  if (hud) {
    hud.textContent = `✨ ${sliceScore} / ${sliceGoal}`
    hud.classList.remove('is-ping')
    void hud.offsetWidth
    hud.classList.add('is-ping')
  }
  const chip = document.getElementById('sliceWaveChip')
  if (chip) chip.textContent = `Wave ${sliceWave}`
  document.getElementById('sliceArena')?.classList.toggle('is-hot', sliceWave > 1)
}

function startSliceRound() {
  sliceScore = 0
  sliceWave = 1
  sliceGoal = SLICE_STEP
  document.getElementById('sliceNext').classList.add('hidden')
  document.getElementById('sliceNext').textContent = 'Keep going!'
  document.getElementById('sliceMessage').textContent = ''
  document.getElementById('sliceModel').textContent = 'Slice the balloon that starts with the sound. Every spark stays with Luma.'
  updateSliceHud()
  startSliceWave()
}

function continueSlice() {
  sliceWave += 1
  sliceGoal = sliceWave * SLICE_STEP
  document.getElementById('sliceNext').classList.add('hidden')
  document.getElementById('sliceModel').textContent = `Wave ${sliceWave}: balloons fly faster. Your ${sliceScore} sparks are still shining.`
  document.getElementById('sliceMessage').textContent = sliceCheer(sliceWave - 1)
  updateSliceHud()
  if (!sliceRunning) {
    sliceRunning = true
    sliceTick()
  }
  startSliceWave()
  speak(`Wave ${sliceWave}. Luma kept every spark. Help her glow even more.`)
}

function startSlice() {
  startSliceRound()
}

function sizeSliceArena() {
  const arena = document.getElementById('sliceArena')
  const canvas = document.getElementById('slashCanvas')
  if (!arena || !canvas) return { w: 0, h: 0 }
  const w = arena.clientWidth
  const h = arena.clientHeight
  if (w && h && (canvas.width !== w || canvas.height !== h)) {
    canvas.width = w
    canvas.height = h
  }
  return { w, h }
}

function placeBalloon(b) {
  if (!b?.el) return
  b.el.style.left = `${Math.round(b.x)}px`
  b.el.style.top = `${Math.round(b.y)}px`
}

function startSliceWave() {
  sliceLocked = false
  sliceBalloons = []
  const layer = document.getElementById('balloons')
  if (layer) layer.innerHTML = ''
  const spawn = () => {
    const { w, h } = sizeSliceArena()
    if (h < 120 || w < 120) {
      requestAnimationFrame(spawn)
      return
    }
    const target = pickWord()
    currentItem = target
    const pack = uniqueStartChoices(target, WORDS, 4)
    document.getElementById('sliceSound').textContent = `/${(target.sounds && target.sounds[0]) || target.start}/`
    const boost = Math.min(2.4, (sliceWave - 1) * 0.5)
    const col = w / Math.max(1, pack.length)
    pack.forEach((item, i) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = `balloon c${i}`
      el.innerHTML = `<span class="body"><small>${item.emoji}</small>${item.word}</span><span class="string"></span>`
      layer.appendChild(el)
      const balloon = {
        el,
        item,
        x: col * (i + 0.5) + (Math.random() - 0.5) * 16,
        y: h - 70 - Math.random() * Math.min(70, h * 0.16),
        vx: (Math.random() - 0.5) * (1.6 + boost * 0.6),
        vy: -(1.35 + boost + Math.random() * 0.45)
      }
      sliceBalloons.push(balloon)
      placeBalloon(balloon)
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        onSliceHit(balloon)
      })
    })
    if (!sliceRunning) {
      sliceRunning = true
      sliceTick()
    }
    setTimeout(() => speakPhoneme(target), 280)
  }
  requestAnimationFrame(() => requestAnimationFrame(spawn))
}

function sliceTick() {
  if (!sliceRunning) return
  const { w, h } = sizeSliceArena()
  if (h < 80 || w < 80) {
    sliceRaf = requestAnimationFrame(sliceTick)
    return
  }
  const ceiling = 64
  const grass = h - 66
  sliceBalloons.forEach((b) => {
    if (b.dead) return
    b.x += b.vx
    b.y += b.vy
    if (b.x < 48) { b.x = 48; b.vx = Math.abs(b.vx) }
    if (b.x > w - 48) { b.x = w - 48; b.vx = -Math.abs(b.vx) }
    if (b.y < ceiling) {
      b.y = grass
      b.x = 56 + Math.random() * Math.max(40, w - 112)
      b.vy = -Math.abs(b.vy)
    }
    if (b.y > grass + 24) {
      b.y = grass
      b.vy = -Math.abs(b.vy)
    }
    placeBalloon(b)
  })
  drawSlash()
  sliceRaf = requestAnimationFrame(sliceTick)
}

function arenaPoint(e, arena) {
  const r = arena.getBoundingClientRect()
  const src = e.touches ? e.touches[0] : e
  return { x: src.clientX - r.left, y: src.clientY - r.top }
}

function hitBalloon(pt) {
  for (const b of sliceBalloons) {
    if (b.dead) continue
    const dx = pt.x - b.x
    const dy = pt.y - b.y
    if (dx * dx + dy * dy < 52 * 52) return b
  }
  return null
}

function onSliceHit(b) {
  if (sliceLocked || b.dead || sliceScore >= sliceGoal) return
  const ok = b.item.start === currentItem.start
  if (ok) {
    sliceLocked = true
    b.dead = true
    b.el.classList.add('is-pop')
    playSfx('pop')
    sliceScore += 1
    markSkill(true)
    document.getElementById('sliceMessage').textContent = `+1 spark for Luma · ${capitalize(b.item.word)} · total ${sliceScore}`
    const loot = awardSliceStar(b.item.word)
    updateSliceHud()
    const next = () => {
      if (!document.getElementById('view-slice')?.classList.contains('is-on')) return
      if (sliceScore >= sliceGoal) finishSliceRound()
      else startSliceWave()
    }
    speak(capitalize(b.item.word), { rate: 0.9 }).then(() => announceLoot(loot)).then(() => wait(200)).then(next)
  } else {
    b.el.classList.remove('is-wrong')
    void b.el.offsetWidth
    b.el.classList.add('is-wrong')
    document.getElementById('sliceMessage').textContent = `${capitalize(b.item.word)} starts with a different sound. Listen again.`
    markSkill(false)
    addPoints(-1)
    saveProfile()
    playSfx('wrong')
    speakPhoneme(currentItem)
  }
}

function finishSliceRound() {
  sliceRunning = false
  sliceLocked = true
  const cheer = sliceCheer(sliceWave)
  updateSliceHud()
  document.getElementById('sliceMessage').textContent = `${sliceScore} sparks kept! ${cheer}`
  document.getElementById('sliceModel').textContent = `Wave ${sliceWave} done. Sparks do not reset. Next wave is faster, and Luma glows more.`
  const btn = document.getElementById('sliceNext')
  btn.textContent = `Wave ${sliceWave + 1} · keep her light!`
  btn.classList.remove('hidden')
  celebrate()
  speak(`${sliceScore} sparks for Luma. They all stay. Keep going and her lantern will get brighter.`)
}

function drawSlash() {
  const canvas = document.getElementById('slashCanvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (slashPts.length < 2) return
  ctx.strokeStyle = 'rgba(255,107,129,.9)'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(slashPts[0].x, slashPts[0].y)
  slashPts.forEach((p) => ctx.lineTo(p.x, p.y))
  ctx.stroke()
}

function bindSlicePointer() {
  const arena = document.getElementById('sliceArena')
  const start = (e) => {
    if (!document.getElementById('view-slice').classList.contains('is-on')) return
    slicing = true
    slashPts = [arenaPoint(e, arena)]
    arena.setPointerCapture?.(e.pointerId)
    const hit = hitBalloon(slashPts[0])
    if (hit) onSliceHit(hit)
  }
  const move = (e) => {
    if (!slicing) return
    e.preventDefault()
    const pt = arenaPoint(e, arena)
    slashPts.push(pt)
    if (slashPts.length > 12) slashPts.shift()
    const hit = hitBalloon(pt)
    if (hit) onSliceHit(hit)
  }
  const end = () => { slicing = false; setTimeout(() => { slashPts = []; drawSlash() }, 180) }
  arena.addEventListener('pointerdown', start)
  arena.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('resize', () => {
    if (document.getElementById('view-slice')?.classList.contains('is-on')) sizeSliceArena()
  })
}

function uniqueStartChoices(keep, pool, n) {
  const key = (p) => (p.start || (p.word || p.name || '')[0] || '').toLowerCase()
  const keepKey = key(keep)
  const usedStart = new Set([keepKey])
  const usedWord = new Set([itemKey(keep)])
  const usedEmoji = new Set([keep.emoji || ''].filter(Boolean))
  const rest = []
  for (const p of shuffleCopy(pool)) {
    const w = itemKey(p)
    const em = p.emoji || ''
    if (!w || usedWord.has(w)) continue
    if (em && usedEmoji.has(em)) continue
    const st = key(p)
    if (!st || usedStart.has(st)) continue
    usedStart.add(st)
    usedWord.add(w)
    if (em) usedEmoji.add(em)
    rest.push(p)
    if (rest.length >= n - 1) break
  }
  return shuffleCopy([keep, ...rest])
}

function distractors(keep, pool, n) {
  return uniqueStartChoices(keep, pool, n)
}

function startSounds() {
  currentItem = pickFrom(WORDS)
  setCoach('Grown-up: say the sound, not the letter name.')
  document.getElementById('modelLine').textContent = 'Listen to the first sound. Then tap the matching picture.'
  document.getElementById('targetName').textContent = `/${currentItem.sounds[0]}/`
  document.getElementById('letterRow').innerHTML = `<div class="letter-tile ${gClass(currentItem.sounds[0])}">${String(currentItem.sounds[0]).toUpperCase()}</div>`
  renderPictureChoices(uniqueStartChoices(currentItem, WORDS, 4), (choice) => choice.word === currentItem.word)
  afterHow(() => speakPhoneme(currentItem))
}

function startBlend() {
  currentItem = pickWord()
  const parts = graphemes(currentItem)
  setCoach('Grown-up: they slide under slow blue sounds and tap fast red sounds, then blend.')
  document.getElementById('modelLine').textContent = 'Hear each sound. Blend them. Then pick the picture you made.'
  document.getElementById('targetName').textContent = currentItem.word
  document.getElementById('letterRow').innerHTML = parts.map((ch, i) =>
    `<div class="letter-tile ${gClass(ch)}" data-i="${i}">${String(ch).toUpperCase()}</div>`
  ).join('') + `<div class="slider-track" aria-hidden="true"><i class="slider-knob" id="slideKnob">👆</i></div>`
  renderPictureChoices(uniquePictureChoices(currentItem, WORDS, 4), (choice) => choice.word === currentItem.word)
  afterHow(() => playBlend(currentItem))
}

function startSafari() {
  const item = pickWord()
  currentItem = { ...item, name: item.word, id: item.word }
  const word = item.word
  setCoach('Grown-up: they read the word first. Do not name it for them.')
  document.getElementById('modelLine').textContent = 'Read the word with your eyes. Tap the matching picture. We only say it after you get it.'
  document.getElementById('targetName').textContent = capitalize(word)
  document.getElementById('letterRow').innerHTML = graphemes(item).map((ch) =>
    `<div class="letter-tile ${gClass(ch)}">${String(ch).toUpperCase()}</div>`
  ).join('')
  renderPictureChoices(uniquePictureChoices(item, WORDS, 4), (choice) => choice.word === word, { hideLabel: true })
}

function startRhyme() {
  const groups = {}
  CVC.forEach((w) => {
    if (!w.rhyme) return
    ;(groups[w.rhyme] = groups[w.rhyme] || []).push(w)
  })
  const tails = Object.keys(groups).filter((t) => groups[t].length >= 2)
  const tail = tails[Math.floor(Math.random() * tails.length)]
  const pack = shuffleCopy(groups[tail])
  const prompt = pack[0]
  const answer = pack[1]
  currentItem = { ...prompt, rhymeAnswer: answer.word }
  const others = shuffleCopy(CVC.filter((w) => w.rhyme !== tail && w.word !== prompt.word)).slice(0, 2)
  setCoach('Grown-up: say the prompt word. They find the rhyme by ear.')
  document.getElementById('modelLine').textContent = `Tap the word that rhymes with ${prompt.word}.`
  document.getElementById('targetName').textContent = `${prompt.emoji} ${capitalize(prompt.word)}`
  document.getElementById('letterRow').innerHTML = ''
  renderPictureChoices(shuffleCopy([answer, ...others]), (choice) => choice.word === answer.word)
  afterHow(() => speak(capitalize(prompt.word), { rate: 0.92 }))
}

function startOdd() {
  const byStart = {}
  CVC.forEach((w) => { (byStart[w.start] = byStart[w.start] || []).push(w) })
  const starts = Object.keys(byStart).filter((s) => byStart[s].length >= 3)
  const start = starts[Math.floor(Math.random() * starts.length)]
  const same = shuffleCopy(byStart[start]).slice(0, 3)
  const odd = shuffleCopy(CVC.filter((w) => w.start !== start))[0]
  currentItem = { ...same[0], oddWord: odd.word }
  setCoach('Grown-up: they listen for the first sound. Three match. One does not.')
  document.getElementById('modelLine').textContent = 'Three start with the same sound. Tap the odd one out.'
  document.getElementById('targetName').textContent = `/${same[0].sounds[0]}/`
  document.getElementById('letterRow').innerHTML = `<div class="letter-tile">${same[0].sounds[0].toUpperCase()}</div>`
  renderPictureChoices(shuffleCopy([...same, odd]), (choice) => choice.word === odd.word)
  afterHow(() => speakPhoneme(same[0]))
}

let builderNext = 0
function startBuilder() {
  currentItem = pickWord()
  builderNext = 0
  const parts = graphemes(currentItem)
  setCoach('Grown-up: they tap sound chunks in order, not letter names.')
  document.getElementById('modelLine').textContent = 'Tap the sound chunks in order to build the word.'
  document.getElementById('targetName').textContent = `${currentItem.emoji} ${capitalize(currentItem.word)}`
  renderBuildSlots()
  const extraPool = WORDS.flatMap((w) => graphemes(w)).filter((g) => !parts.includes(g))
  const extra = extraPool[Math.floor(Math.random() * extraPool.length)] || 'x'
  const letters = shuffleCopy([...parts, extra])
  const grid = document.getElementById('grid')
  grid.className = 'grid'
  grid.innerHTML = ''
  letters.forEach((ch) => {
    const btn = document.createElement('button')
    btn.className = 'tile'
    btn.type = 'button'
    btn.innerHTML = `<div class="emoji" style="font-size:32px">${String(ch).toUpperCase()}</div>`
    btn.addEventListener('click', () => onBuilderTap(ch, btn))
    grid.appendChild(btn)
  })
}

function renderBuildSlots() {
  const parts = graphemes(currentItem)
  document.getElementById('letterRow').innerHTML = parts.map((ch, i) =>
    `<div class="build-slot ${i < builderNext ? 'is-on' : ''}">${i < builderNext ? String(ch).toUpperCase() : ''}</div>`
  ).join('')
}

function onBuilderTap(ch, btn) {
  const parts = graphemes(currentItem)
  const need = parts[builderNext]
  if (ch === need) {
    builderNext += 1
    btn.classList.add('correct')
    renderBuildSlots()
    playPhoneme(currentItem.phon?.[builderNext - 1] || ch)
    if (builderNext >= parts.length) {
      showMessage(`You built ${capitalize(currentItem.word)}!`)
      awardCorrect(currentItem.word)
      advanceSoon()
    }
  } else {
    btn.classList.add('wrong')
    addPoints(-1)
    saveProfile()
    playSfx('wrong')
    setTimeout(() => btn.classList.remove('wrong'), 400)
  }
}

function startVowel() {
  const pool = CVC.filter((w) => w.sounds[1] && 'aeiou'.includes(w.sounds[1]))
  currentItem = pool[Math.floor(Math.random() * pool.length)]
  setCoach('Grown-up: say the whole word. They catch the middle vowel sound.')
  document.getElementById('modelLine').textContent = 'Listen to the word. Tap the vowel in the middle.'
  document.getElementById('targetName').textContent = currentItem.emoji
  document.getElementById('letterRow').innerHTML = currentItem.sounds.map((ch, i) =>
    `<div class="letter-tile ${i === 1 ? 'vowel-short' : ''}">${i === 1 ? '?' : ch.toUpperCase()}</div>`
  ).join('')
  const grid = document.getElementById('grid')
  grid.className = 'grid vowel-pad'
  grid.innerHTML = ''
  ;['a', 'e', 'i', 'o', 'u'].forEach((v) => {
    const btn = document.createElement('button')
    btn.className = 'tile'
    btn.type = 'button'
    btn.textContent = v.toUpperCase()
    btn.addEventListener('click', () => onPick(btn, v === currentItem.sounds[1], currentItem.word))
    grid.appendChild(btn)
  })
  setTimeout(() => afterHow(() => speak(capitalize(currentItem.word), { rate: 0.92 })), 0)
}

function startHungry() { startSounds() }
function startSlider() { startBlend() }

function startMagicE() {
  const pair = pickFrom(MAGIC_PAIRS)
  const wantLong = Math.random() < 0.6
  const answer = wantLong ? pair.long : pair.short
  currentItem = { word: answer.word, emoji: answer.emoji, skill: 'silent' }
  setCoach('Grown-up: they must read both words. The picture is the meaning, not a letter hint.')
  document.getElementById('modelLine').textContent = wantLong
    ? 'Silent e makes the vowel say its name. Tap the word that matches the picture.'
    : 'No magic e this time. Tap the short word that matches the picture.'
  document.getElementById('targetName').textContent = answer.emoji
  document.getElementById('letterRow').innerHTML = ''
  const grid = document.getElementById('grid')
  grid.className = 'grid'
  grid.innerHTML = ''
  shuffleCopy([pair.short, pair.long]).forEach((opt) => {
    const btn = document.createElement('button')
    btn.className = 'tile'
    btn.type = 'button'
    btn.innerHTML = `<div class="emoji" style="font-size:28px">${opt.word}</div>`
    btn.addEventListener('click', () => onPick(btn, opt.word === answer.word, opt.word))
    grid.appendChild(btn)
  })
}

function startBook() {
  if (!bookStory || bookPage >= (bookStory.pages || []).length) {
    bookStory = pickFrom(BOOKS)
    bookPage = 0
  }
  const page = bookStory.pages[bookPage]
  const item = WORDS.find((w) => w.word === page.child) || { word: page.child, emoji: '📖', skill: 'cvc' }
  currentItem = { ...item }
  setCoach('Grown-up: read the small line. Child reads the big word.')
  document.getElementById('modelLine').textContent = page.grownup
  document.getElementById('targetName').textContent = page.child.toUpperCase()
  document.getElementById('letterRow').innerHTML = graphemes(item).map((ch) =>
    `<div class="letter-tile ${gClass(ch)}">${String(ch).toUpperCase()}</div>`
  ).join('')
  const grid = document.getElementById('grid')
  grid.className = 'grid'
  renderPictureChoices(uniquePictureChoices(item, WORDS, 4), (c) => c.word === item.word, { hideLabel: true })
}

function startHeart() {
  const h = pickFrom(HEART)
  currentItem = { word: h.word, emoji: h.emoji, skill: 'teams' }
  setCoach('Grown-up: orange letters break the usual rule. Tell the trick, then they pick the word.')
  document.getElementById('modelLine').textContent = 'Heart word. The orange bit is the tricky part.'
  document.getElementById('targetName').textContent = h.line
  document.getElementById('letterRow').innerHTML = [...h.word].map((ch) =>
    `<div class="letter-tile ${h.heart.includes(ch) ? 'heart' : ''}">${ch.toUpperCase()}</div>`
  ).join('')
  const grid = document.getElementById('grid')
  grid.className = 'grid'
  grid.innerHTML = ''
  shuffleCopy(h.options).forEach((opt) => {
    const btn = document.createElement('button')
    btn.className = 'tile'
    btn.type = 'button'
    btn.innerHTML = `<div class="emoji" style="font-size:28px">${opt}</div>`
    btn.addEventListener('click', () => onPick(btn, opt === h.word, opt))
    grid.appendChild(btn)
  })
}

function startTrace() {
  const letters = 'satpinmdgock'.split('')
  const ch = letters[Math.floor(Math.random() * letters.length)]
  currentItem = { word: ch, emoji: ch, sounds: [ch], phon: [ch], skill: 'cvc', start: ch }
  setCoach('Grown-up: say the sound, not the letter name.')
  document.getElementById('modelLine').textContent = `Find the letter for /${ch}/.`
  document.getElementById('targetName').textContent = `/${ch}/`
  document.getElementById('letterRow').innerHTML = `<div class="letter-tile ${gClass(ch)}" style="width:72px;height:72px;font-size:36px">${ch}</div>`
  const grid = document.getElementById('grid')
  grid.className = 'grid'
  grid.innerHTML = ''
  const pack = shuffleCopy([ch, ...shuffleCopy(letters.filter((x) => x !== ch)).slice(0, 3)])
  pack.forEach((opt) => {
    const btn = document.createElement('button')
    btn.className = 'tile'
    btn.type = 'button'
    btn.innerHTML = `<div class="emoji">${opt}</div>`
    btn.addEventListener('click', () => onPick(btn, opt === ch, opt))
    grid.appendChild(btn)
  })
  afterHow(() => speakPhoneme(currentItem))
}

function renderPictureChoices(items, isRight, opts = {}) {
  const grid = document.getElementById('grid')
  grid.className = 'grid'
  grid.innerHTML = ''
  items.forEach((item) => {
    const btn = document.createElement('button')
    btn.className = 'tile'
    btn.type = 'button'
    const label = opts.hideLabel ? '' : `<div>${capitalize(item.word)}</div>`
    btn.innerHTML = `<div class="emoji">${item.emoji}</div>${label}`
    btn.addEventListener('click', () => onPick(btn, isRight(item), item.word))
    grid.appendChild(btn)
  })
}

function renderAnimalChoices(items) {
  const grid = document.getElementById('grid')
  grid.className = 'grid'
  grid.innerHTML = ''
  items.forEach((a) => {
    const btn = document.createElement('button')
    btn.className = 'tile'
    btn.type = 'button'
    const word = a.name || a.word
    btn.innerHTML = `<div class="emoji">${a.emoji}</div><div>${capitalize(word)}</div>`
    btn.addEventListener('click', () => {
      const ok = (a.id || a.word) === (currentItem.id || currentItem.word)
      onPick(btn, ok, word)
    })
    grid.appendChild(btn)
  })
}

function onPick(btn, ok, word) {
  if (pickLocked) return
  if (ok) {
    pickLocked = true
    btn.classList.add('correct')
    document.getElementById('grid')?.classList.add('is-revealed')
    showMessage(`You read it! ${capitalize(word)} 🎉`)
    if (currentGame === 'book' || currentGame === 'fluency') bookPage += 1
    awardCorrect(word)
    advanceSoon()
  } else {
    btn.classList.add('wrong')
    addPoints(-1)
    noteGap(false, currentItem)
    markSkill(false)
    saveProfile()
    showMessage('Try again — look at the sounds')
    playSfx('wrong')
    setTimeout(() => btn.classList.remove('wrong'), 500)
  }
}

function awardCorrect(word) {
  addPoints(1)
  profile.stars += 1
  profile.reads = (profile.reads || 0) + 1
  if (profile.milestone < STOPS.length - 1 && profile.stars >= STOPS[profile.milestone + 1]?.need) {
    profile.milestone += 1
  }
  if (profile.stars >= 3) profile.level = 2
  if (profile.stars >= 6) profile.level = 3
  noteGap(true, currentItem)
  markSkill(true)
  const loot = grantLoot()
  bumpStreak()
  saveProfile()
  renderStops()
  renderChest()
  speak(capitalize(word), { rate: 0.9 }).then(() => announceLoot(loot))
  celebrate()
  buddyTrick('jump', true)
}

function awardSliceStar(word) {
  addPoints(1)
  profile.stars += 1
  profile.reads = (profile.reads || 0) + 1
  noteGap(true, currentItem)
  if (profile.milestone < STOPS.length - 1 && profile.stars >= STOPS[profile.milestone + 1]?.need) {
    profile.milestone += 1
  }
  const loot = grantLoot()
  bumpStreak()
  saveProfile()
  renderStops()
  renderChest()
  return loot
}

function bumpStreak() {
  const today = new Date().toDateString()
  if (profile.lastDay === today) return
  const y = new Date(); y.setDate(y.getDate() - 1)
  profile.streak = profile.lastDay === y.toDateString() ? (profile.streak || 0) + 1 : 1
  profile.lastDay = today
}

function playBlend(item) {
  const tiles = [...document.querySelectorAll('#letterRow .letter-tile')]
  const knob = document.getElementById('slideKnob')
  const parts = graphemes(item)
  let chain = Promise.resolve()
  parts.forEach((g, i) => {
    chain = chain.then(async () => {
      tiles[i]?.classList.add('pop')
      if (knob) knob.style.left = `${((i + 0.5) / Math.max(1, parts.length)) * 100}%`
      if (i === 0) {
        try { window.speechSynthesis.cancel() } catch (e) {}
      }
      await playPhoneme(item.phon?.[i] || g)
      tiles[i]?.classList.remove('pop')
      await wait(140)
    })
  })
}

function speakPhoneme(item) {
  const phon = typeof item === 'string' ? item : (item.phon && item.phon[0]) || ''
  return playPhoneme(phon)
}

function playPhoneme(phon) {
  const key = naturalSound(typeof phon === 'string' ? phon : (phon?.phon && phon.phon[0]) || phon)
  if (synthPhoneme(key)) return wait(430)
  return speak(key, { rate: 0.88, isolated: true })
}

let audioCtx = null
let masterNode = null
function getAudioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!audioCtx) audioCtx = new AC()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}
function masterOut() {
  const ctx = getAudioCtx()
  if (!ctx) return null
  if (!masterNode) {
    const g = ctx.createGain()
    g.gain.value = 0.78
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 6200
    lp.Q.value = 0.7
    const delay = ctx.createDelay()
    delay.delayTime.value = 0.24
    const fb = ctx.createGain()
    fb.gain.value = 0.32
    const wet = ctx.createGain()
    wet.gain.value = 0.28
    const damp = ctx.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 2800
    g.connect(lp)
    lp.connect(ctx.destination)
    lp.connect(damp)
    damp.connect(delay)
    delay.connect(fb)
    fb.connect(delay)
    delay.connect(wet)
    wet.connect(ctx.destination)
    masterNode = g
  }
  return masterNode
}

const VOWELS = {
  aah: [730, 1090, 2440], aaa: [730, 1090, 2440], a: [730, 1090, 2440],
  eh: [530, 1840, 2480], e: [530, 1840, 2480],
  ih: [390, 1990, 2550], i: [390, 1990, 2550],
  aw: [570, 840, 2410], o: [570, 840, 2410], oh: [570, 840, 2410],
  uh: [440, 1020, 2240], u: [440, 1020, 2240],
  ee: [270, 2290, 3010], ay: [550, 1760, 2470],
  oo: [300, 870, 2240], eye: [400, 1700, 2600], yoo: [310, 870, 2240]
}

function noiseBuf(ctx, dur, brown) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur))
  const buf = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1
    if (brown) {
      last = (last + 0.02 * white) / 1.02
      d[i] = last * 3.5
    } else {
      d[i] = white
    }
  }
  return buf
}

function playVowel(name, dur = 0.42, f0 = 118) {
  const ctx = getAudioCtx()
  const out = masterOut()
  if (!ctx || !out) return false
  const fs = VOWELS[name] || VOWELS.uh
  const t = ctx.currentTime
  const body = ctx.createOscillator()
  body.type = 'triangle'
  body.frequency.setValueAtTime(f0, t)
  body.frequency.exponentialRampToValueAtTime(f0 * 0.97, t + dur)
  const air = ctx.createOscillator()
  air.type = 'sine'
  air.frequency.setValueAtTime(f0 * 2, t)
  const mix = ctx.createGain()
  mix.gain.setValueAtTime(0.0001, t)
  mix.gain.exponentialRampToValueAtTime(0.28, t + 0.04)
  mix.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  fs.forEach((f, i) => {
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = f
    bp.Q.value = 4.2 + i * 0.6
    const g = ctx.createGain()
    g.gain.value = [1, 0.42, 0.14][i]
    body.connect(bp)
    bp.connect(g)
    g.connect(mix)
  })
  const airG = ctx.createGain()
  airG.gain.value = 0.08
  air.connect(airG)
  airG.connect(mix)
  mix.connect(out)
  body.start(t)
  air.start(t)
  body.stop(t + dur + 0.02)
  air.stop(t + dur + 0.02)
  return true
}

function playFric(kind) {
  const ctx = getAudioCtx()
  const out = masterOut()
  if (!ctx || !out) return false
  const dur = kind === 'h' ? 0.3 : 0.4
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf(ctx, dur)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = kind === 's' || kind === 'z' ? 3800 : kind === 'sh' || kind === 'ch' ? 1600 : kind === 'f' ? 1400 : 600
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = kind === 's' ? 5200 : kind === 'z' ? 3800 : kind === 'sh' || kind === 'ch' ? 2400 : kind === 'f' ? 2000 : 1000
  bp.Q.value = 0.9
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(kind === 'h' ? 0.06 : 0.12, t + 0.03)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(hp)
  hp.connect(bp)
  if (kind === 'z') {
    const buzz = ctx.createOscillator()
    buzz.type = 'triangle'
    buzz.frequency.value = 128
    const bg = ctx.createGain()
    bg.gain.value = 0.03
    buzz.connect(bg)
    bg.connect(out)
    buzz.start(t)
    buzz.stop(t + dur)
  }
  bp.connect(g)
  g.connect(out)
  src.start(t)
  src.stop(t + dur)
  if (kind === 'ch') playVowel('uh', 0.22)
  return true
}

function playNasal(kind) {
  const ctx = getAudioCtx()
  const out = masterOut()
  if (!ctx || !out) return false
  const t = ctx.currentTime
  const dur = 0.42
  const o1 = ctx.createOscillator()
  const o2 = ctx.createOscillator()
  o1.type = 'sine'
  o2.type = 'triangle'
  o1.frequency.value = kind === 'm' ? 128 : 162
  o2.frequency.value = kind === 'm' ? 256 : 324
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = kind === 'm' ? 400 : 580
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.05)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o1.connect(lp)
  o2.connect(lp)
  lp.connect(g)
  g.connect(out)
  o1.start(t)
  o2.start(t)
  o1.stop(t + dur)
  o2.stop(t + dur)
  return true
}

function playStopConsonant(burstHz, vowel, voiced) {
  const ctx = getAudioCtx()
  const out = masterOut()
  if (!ctx || !out) return false
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf(ctx, 0.04)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = burstHz
  bp.Q.value = 1.2
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(voiced ? 0.08 : 0.14, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
  src.connect(bp)
  bp.connect(g)
  g.connect(out)
  src.start(t)
  src.stop(t + 0.04)
  setTimeout(() => playVowel(vowel, 0.28, voiced ? 110 : 122), 28)
  return true
}

function synthPhoneme(raw) {
  const k = String(raw || '').toLowerCase().replace(/[^a-z]/g, '')
  if (!k) return false
  if (VOWELS[k]) return playVowel(k)
  const fric = { s: 's', suh: 's', sss: 's', f: 'f', fuh: 'f', fff: 'f', z: 'z', zuh: 'z', h: 'h', huh: 'h', hhh: 'h', shh: 'sh', sh: 'sh', thuh: 'th', th: 'th', chuh: 'ch', ch: 'ch' }
  if (fric[k]) return playFric(fric[k])
  const nas = { m: 'm', muh: 'm', mmm: 'm', n: 'n', nuh: 'n', nnn: 'n' }
  if (nas[k]) return playNasal(nas[k])
  const st = {
    cuh: [2100, 'uh', 0], kuh: [2100, 'uh', 0], puh: [800, 'uh', 0], buh: [700, 'uh', 1],
    tuh: [1900, 'uh', 0], duh: [1600, 'uh', 1], guh: [1400, 'uh', 1], g: [1400, 'uh', 1],
    p: [800, 'uh', 0], d: [1600, 'uh', 1], t: [1900, 'uh', 0], ks: [2200, 'uh', 0],
    juh: [1800, 'uh', 1], j: [1800, 'uh', 1]
  }
  if (st[k]) return playStopConsonant(st[k][0], st[k][1], st[k][2])
  const ap = { luh: 'uh', l: 'uh', ruh: 'uh', r: 'uh', wuh: 'uh', w: 'uh', vuh: 'uh', v: 'uh' }
  if (ap[k]) return playVowel(ap[k], 0.34, k[0] === 'r' ? 104 : 142)
  return false
}

function playBell(freq, when, dur, vol) {
  const ctx = getAudioCtx()
  const out = masterOut()
  if (!ctx || !out) return
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(vol, when + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  g.connect(out)
  ;[[1, 1], [2.003, 0.28], [2.76, 0.18], [4.07, 0.1], [5.43, 0.05]].forEach(([r, a]) => {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(freq * r, when)
    const pg = ctx.createGain()
    pg.gain.value = a
    o.connect(pg)
    pg.connect(g)
    o.start(when)
    o.stop(when + dur + 0.05)
  })
}

function playSfx(kind) {
  const ctx = getAudioCtx()
  const out = masterOut()
  if (!ctx || !out) return
  const t = ctx.currentTime
  const tone = (freq, when, dur, vol, type = 'sine') => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, when)
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(vol, when + 0.016)
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
    o.connect(g)
    g.connect(out)
    o.start(when)
    o.stop(when + dur + 0.04)
  }
  if (kind === 'ok') [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => playBell(f, t + i * 0.09, 1.15, 0.09))
  else if (kind === 'loot') [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => playBell(f, t + i * 0.08, 1.4, 0.1))
  else if (kind === 'tap') {
    tone(920, t, 0.07, 0.04, 'sine')
    playBell(784, t, 0.32, 0.035)
  } else if (kind === 'lock') {
    playBell(196, t, 0.55, 0.07)
    playBell(147, t + 0.14, 0.7, 0.05)
  } else if (kind === 'wrong') {
    playBell(311.1, t, 0.4, 0.06)
    playBell(233.1, t + 0.14, 0.55, 0.05)
  } else if (kind === 'pop') {
    playBell(1046, t, 0.28, 0.05)
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf(ctx, 0.1)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1400
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.05, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    src.connect(hp)
    hp.connect(g)
    g.connect(out)
    src.start(t)
    src.stop(t + 0.1)
  } else if (kind === 'whoosh') {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf(ctx, 0.34)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 0.55
    bp.frequency.setValueAtTime(320, t)
    bp.frequency.exponentialRampToValueAtTime(1600, t + 0.34)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34)
    src.connect(bp)
    bp.connect(g)
    g.connect(out)
    src.start(t)
    src.stop(t + 0.34)
  }
}

let ambientNodes = []
let ambientBellT = 0
function startAmbient() {
  const ctx = getAudioCtx()
  const out = masterOut()
  if (!ctx || !out || startAmbient.on) return
  startAmbient.on = true
  const pad = ctx.createGain()
  pad.gain.value = 0.028
  pad.connect(out)
  ;[110, 164.81, 196, 246.94].forEach((f, i) => {
    const o = ctx.createOscillator()
    o.type = i % 2 ? 'sine' : 'triangle'
    o.frequency.value = f
    const g = ctx.createGain()
    g.gain.value = i === 3 ? 0.35 : 1
    o.connect(g)
    g.connect(pad)
    o.start()
    ambientNodes.push(o, g)
  })
  const wind = ctx.createBufferSource()
  wind.buffer = noiseBuf(ctx, 3, true)
  wind.loop = true
  const wbp = ctx.createBiquadFilter()
  wbp.type = 'bandpass'
  wbp.frequency.value = 340
  wbp.Q.value = 0.35
  const wg = ctx.createGain()
  wg.gain.value = 0.016
  wind.connect(wbp)
  wbp.connect(wg)
  wg.connect(out)
  wind.start()
  ambientNodes.push(wind, wbp, wg, pad)
  const chime = () => {
    if (!startAmbient.on) return
    const notes = [523.25, 659.25, 783.99, 392, 440, 987.77]
    playBell(notes[Math.floor(Math.random() * notes.length)], ctx.currentTime, 2.2, 0.028)
    ambientBellT = setTimeout(chime, 2800 + Math.random() * 3200)
  }
  ambientBellT = setTimeout(chime, 1600)
}
function stopAmbient() {
  startAmbient.on = false
  clearTimeout(ambientBellT)
  ambientNodes.forEach((n) => {
    try { n.stop?.() } catch (e) {}
    try { n.disconnect?.() } catch (e) {}
  })
  ambientNodes = []
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function naturalSound(phon) {
  const key = String(phon || '').toLowerCase().trim()
  const map = {
    kuh: 'cuh', cuh: 'cuh',
    duh: 'duh',
    puh: 'puh',
    s: 'suh', sss: 'suh',
    h: 'huh', hhh: 'huh',
    buh: 'buh',
    m: 'muh', mmm: 'muh',
    aaa: 'aah', aah: 'aah',
    aw: 'aw',
    ih: 'ih',
    uh: 'uh',
    eh: 'eh',
    g: 'guh', guh: 'guh',
    t: 'tuh', tuh: 'tuh',
    luh: 'luh', l: 'luh',
    ruh: 'ruh', r: 'ruh',
    wuh: 'wuh', w: 'wuh',
    vuh: 'vuh', v: 'vuh',
    juh: 'juh', j: 'juh',
    ks: 'ks',
    f: 'fuh', z: 'zuh',
    n: 'nuh', nnn: 'nuh',
    p: 'puh',
    d: 'duh'
  }
  return map[key] || key
}

function prepareSpeech(text, opts = {}) {
  let t = String(text || '').replace(/\u2026/g, ',').replace(/\.{3,}/g, ',')
  t = t.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (opts.isolated) t = `${t},`
  else if (!/[.!?]$/.test(t)) t += '.'
  return `${t} `
}

function unlockSpeech() {
  if (unlockSpeech.ready) return
  unlockSpeech.ready = true
  getAudioCtx()
  if (document.getElementById('view-home')?.classList.contains('is-on')) startAmbient()
  if (!('speechSynthesis' in window)) return
  try {
    const warm = new SpeechSynthesisUtterance(' ')
    warm.volume = 0
    window.speechSynthesis.speak(warm)
    kickSpeechEngine()
  } catch (e) {}
}

function kickSpeechEngine() {
  try {
    window.speechSynthesis.pause()
    window.speechSynthesis.resume()
  } catch (e) {}
}

let currentUtterance = null
let speakTail = Promise.resolve()
let speechWatch = 0

function speak(text, opts = {}) {
  if (!('speechSynthesis' in window) || !text) return Promise.resolve()
  const interrupt = opts.interrupt !== false
  const run = () => new Promise((resolve) => {
    const said = prepareSpeech(text, opts)
    if (!said.trim()) { resolve(); return }
    const start = () => {
      const u = new SpeechSynthesisUtterance(said)
      currentUtterance = u
      if (!preferredVoice) loadVoices()
      if (preferredVoice) {
        u.voice = preferredVoice
        u.lang = preferredVoice.lang || 'en-US'
      } else {
        u.lang = 'en-US'
      }
      u.rate = opts.rate ?? 0.96
      u.pitch = opts.pitch ?? 1
      u.volume = 1
      let done = false
      const finish = () => {
        if (done) return
        done = true
        if (speechWatch) { clearInterval(speechWatch); speechWatch = 0 }
        resolve()
      }
      u.onend = finish
      u.onerror = finish
      window.speechSynthesis.speak(u)
      if (!opts.isolated) kickSpeechEngine()
      speechWatch = setInterval(kickSpeechEngine, 8000)
      setTimeout(finish, Math.min(12000, 1600 + said.length * 80))
    }
    if (interrupt) {
      try { window.speechSynthesis.cancel() } catch (e) {}
      setTimeout(start, 70)
    } else {
      start()
    }
  })
  if (interrupt) {
    speakTail = run()
    return speakTail
  }
  speakTail = speakTail.then(run, run)
  return speakTail
}

function loadVoices() {
  if (!('speechSynthesis' in window)) return
  voices = window.speechSynthesis.getVoices() || []
  const score = (v) => {
    const n = (v.name || '').toLowerCase()
    const uri = (v.voiceURI || '').toLowerCase()
    const lang = (v.lang || '').toLowerCase()
    const blob = `${n} ${uri}`
    if (!lang.startsWith('en')) return -10
    if (/compact|novelty|whisper|zarvox|boing|bubbles|bad news|jester|organ|trinoids|cellos|albert|bells|hysterical|junior|princess|ralph|bahh|deranged|good news|pipe organ|superstar|wobble/.test(n)) return -80
    let s = 0
    if (lang === 'en-us' || lang.startsWith('en-us')) s += 20
    else if (lang.startsWith('en')) s += 4
    if (v.localService) s += 8
    if (/neural|natural|premium|enhanced|siri|wavenet|studio/.test(blob)) s += 45
    if (/nicky/.test(n)) s += 55
    if (/\bava\b/.test(n)) s += 50
    if (/\bzoe\b/.test(n)) s += 48
    if (/allison/.test(n)) s += 40
    if (/google us english/.test(n)) s += 42
    if (/microsoft (aria|jenny|sara)/.test(n)) s += 40
    if (/samantha/.test(n) && /premium|enhanced/.test(blob)) s += 22
    else if (/samantha/.test(n)) s += 4
    return s
  }
  preferredVoice = [...voices].sort((a, b) => score(b) - score(a))[0] || null
}

function renderLessons() {
  const body = document.getElementById('lessonsBody')
  body.innerHTML = ''
  const list = document.createElement('div')
  list.className = 'lesson-list'
  LESSONS.forEach((lesson) => {
    const card = document.createElement('div')
    card.className = 'lesson-card'
    const title = document.createElement('div')
    title.style.fontWeight = 800
    title.textContent = lesson.title
    card.appendChild(title)
    lesson.words.forEach((w) => {
      const wc = document.createElement('div')
      wc.className = 'word-card'
      wc.innerHTML = `<div class="word-letters">${annotateWordHTML(w)}</div><div class="word-actions"><button class="secondary hear" data-word="${w}" type="button">Hear</button><button class="ghost read" data-word="${w}" type="button">I read it</button></div>`
      card.appendChild(wc)
    })
    list.appendChild(card)
  })
  body.appendChild(list)
  body.querySelectorAll('.hear').forEach((b) => b.addEventListener('click', (e) => speak(e.currentTarget.dataset.word)))
  body.querySelectorAll('.read').forEach((b) => b.addEventListener('click', (e) => {
    const word = e.currentTarget.dataset.word
    profile.points += 1
    profile.stars += 1
    const loot = grantLoot()
    saveProfile(); renderStops(); renderChest(); celebrate()
    speak(word).then(() => announceLoot(loot))
  }))
}

function annotateWordHTML(word) {
  const lower = word.toLowerCase()
  const vowelPairs = ['ai', 'ea', 'oa', 'ee', 'ie', 'ue']
  let html = ''
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i]
    const next = lower[i + 1] || ''
    let cls = ''
    if ('aeiou'.includes(ch)) {
      const pair = ch + next
      if (vowelPairs.includes(pair)) cls = 'vowel-long'
      else if (lower.endsWith('e') && i === lower.length - 3 && !'aeiou'.includes(lower[i + 1])) cls = 'vowel-long'
      else cls = 'vowel-short'
    }
    html += `<span class="letter-tile ${cls}" style="width:auto;height:auto;padding:4px 6px;font-size:22px">${ch.toUpperCase()}</span>`
  }
  return html
}

function runPlacement() {
  currentGame = 'sounds'
  openGame('sounds')
  showMessage('Starter check: tap what you hear. This finds your starting stop.')
}

const SESSION_MS = 15 * 60 * 1000
let sessionTickId = 0

function fmtMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function startSessionClock() {
  sessionStorage.setItem('rt_session_start', String(Date.now()))
  document.getElementById('sessionBar')?.classList.remove('hidden')
  tickSession()
  clearInterval(sessionTickId)
  sessionTickId = setInterval(tickSession, 1000)
}

function tickSession() {
  const bar = document.getElementById('sessionBar')
  const fill = document.getElementById('sessionFill')
  const label = document.getElementById('sessionLabel')
  if (!bar || !fill || !label) return
  const start = Number(sessionStorage.getItem('rt_session_start') || Date.now())
  const elapsed = Math.max(0, Date.now() - start)
  const pct = Math.min(100, (elapsed / SESSION_MS) * 100)
  fill.style.width = pct + '%'
  if (elapsed >= SESSION_MS) {
    label.textContent = '15:00 / 15:00 · nice reading!'
    fill.style.width = '100%'
  } else {
    label.textContent = `${fmtMs(elapsed)} / 15:00`
  }
  bar.setAttribute('aria-valuenow', String(Math.min(15, Math.round(elapsed / 60000))))
}

const STORY_BEATS = [
  { cls: 'is-b1', line: 'Pip met a tiny firefly named Luma.' },
  { cls: 'is-b2', line: 'A gust stole the glow from her lantern.' },
  { cls: 'is-b3', line: 'The valley went dark. Luma could not find home.' },
  { cls: 'is-b4', line: 'Every word you read is a spark. Help her light the way.' }
]

function playStory() {
  showView('story')
  const stage = document.getElementById('storyStage')
  const line = document.getElementById('storyLine')
  const go = document.getElementById('storyGo')
  if (go) go.classList.add('hidden')
  if (stage) stage.className = 'story-stage'
  let i = 0
  const beat = async () => {
    if (!document.getElementById('view-story')?.classList.contains('is-on')) return
    if (i >= STORY_BEATS.length) {
      go?.classList.remove('hidden')
      return
    }
    const b = STORY_BEATS[i++]
    if (stage) stage.className = 'story-stage ' + b.cls
    if (line) line.textContent = b.line
    speak(b.line, { rate: 0.96 })
    await wait(2100)
    beat()
  }
  beat()
}

function finishStory() {
  profile.heardStory = true
  saveProfile()
  showView('home')
  buddyTrick('wave')
  speak(`Hi, ${profile.name}. Let's read.`)
}

function beginSession(n) {
  profile.name = n || 'Friend'
  saveProfile()
  greet()
  renderStops()
  renderGames()
  renderChest()
  buddyTrick('wave')
  unlockSpeech()
  startSessionClock()
  if (!profile.heardStory) playStory()
  else {
    showView('home')
    speak(`Hi, ${profile.name}. Let's read.`)
  }
}

function showMessage(text) {
  const el = document.getElementById('message')
  if (el) el.textContent = text || ''
}
function clearMessage() { showMessage('') }

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function shuffleCopy(a) { return shuffle(a.slice()) }
function capitalize(s) { return (s || '').charAt(0).toUpperCase() + (s || '').slice(1) }

const TRICKS = ['wave', 'spin', 'jump', 'wiggle', 'dance', 'peek', 'giggle']
const JOKES = [
  { trick: 'giggle', say: 'I tried to eat a book. It tasted like paper, and a tiny silent e.' },
  { trick: 'spin', say: 'If I spin too fast, cat turns into tac. Whoa.' },
  { trick: 'jump', say: 'Boing. I jumped over a short word and almost missed it.' },
  { trick: 'dance', say: 'A, E, I, O, U, and sometimes wowee. Dance with me.' },
  { trick: 'wiggle', say: 'My ears get mixed up. Left is buh. Right is duh.' },
  { trick: 'peek', say: 'Peekaboo. I was hiding behind a balloon. Pop.' },
  { trick: 'wave', say: 'Hi there. I can hiss like a snake.' }
]
function buddyTrick(name, silent) {
  const el = document.getElementById('buddy')
  if (!el) return
  TRICKS.forEach((t) => el.classList.remove(t))
  const trick = name || TRICKS[Math.floor(Math.random() * TRICKS.length)]
  el.classList.add(trick)
  setTimeout(() => el.classList.remove(trick), 1300)
  if (silent) return
}
function buddyJoke() {
  const joke = JOKES[Math.floor(Math.random() * JOKES.length)]
  buddyTrick(joke.trick, true)
  const bubble = document.getElementById('buddyBubble')
  if (bubble) {
    bubble.textContent = joke.say
    bubble.classList.remove('hidden')
    clearTimeout(buddyJoke.t)
    buddyJoke.t = setTimeout(() => bubble.classList.add('hidden'), 5000)
  }
  speak(joke.say)
}

function celebrate() {
  spawnConfetti(80)
  playSfx('ok')
}
function setupConfetti() {
  if (!confettiCanvas) return
  confettiCtx = confettiCanvas.getContext('2d')
  const resize = () => { confettiCanvas.width = innerWidth; confettiCanvas.height = innerHeight }
  resize(); addEventListener('resize', resize)
  requestAnimationFrame(confettiFrame)
}
function spawnConfetti(n) {
  if (!confettiCanvas) return
  for (let i = 0; i < n; i++) {
    confettiParticles.push({
      x: Math.random() * confettiCanvas.width, y: -10,
      vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 5,
      size: 6 + Math.random() * 8,
      color: ['#FF6B81', '#FFD166', '#7EE7C1', '#89C2FF', '#C58BFF'][Math.floor(Math.random() * 5)],
      rot: Math.random() * 360, rotV: (Math.random() - 0.5) * 8
    })
  }
}
function confettiFrame() {
  if (!confettiCtx) { requestAnimationFrame(confettiFrame); return }
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height)
  for (let i = confettiParticles.length - 1; i >= 0; i--) {
    const p = confettiParticles[i]
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.rot += p.rotV
    confettiCtx.save(); confettiCtx.translate(p.x, p.y); confettiCtx.rotate(p.rot * Math.PI / 180)
    confettiCtx.fillStyle = p.color; confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
    confettiCtx.restore()
    if (p.y > confettiCanvas.height + 40) confettiParticles.splice(i, 1)
  }
  requestAnimationFrame(confettiFrame)
}

function blockPageZoom() {
  const stop = (e) => e.preventDefault()
  document.addEventListener('gesturestart', stop, { passive: false })
  document.addEventListener('gesturechange', stop, { passive: false })
  document.addEventListener('dblclick', stop, { passive: false })
  let last = 0
  document.addEventListener('touchend', (e) => {
    const now = Date.now()
    if (now - last < 350) e.preventDefault()
    last = now
  }, { passive: false })
}

async function init() {
  loadProfile()
  animals = await fetch('animals.json').then((r) => r.json()).catch(() => [])
  document.getElementById('startBtn').addEventListener('click', () => {
    unlockSpeech()
    const n = (document.getElementById('childName').value || '').trim()
    beginSession(n || 'Friend')
  })
  document.getElementById('continueBtn').addEventListener('click', () => {
    unlockSpeech()
    beginSession(profile.name)
  })
  document.getElementById('storyGo')?.addEventListener('click', () => {
    unlockSpeech()
    finishStory()
  })
  document.getElementById('backBtn').addEventListener('click', () => showView('home'))
  document.getElementById('lessonsBack')?.addEventListener('click', () => showView('home'))
  document.getElementById('sliceBack').addEventListener('click', () => { stopSlice(); showView('games') })
  document.getElementById('sliceNext').addEventListener('click', continueSlice)
  bindSlicePointer()
  document.getElementById('a11yBtn')?.addEventListener('click', () => {
    document.getElementById('a11yPanel')?.classList.toggle('hidden')
  })
  document.querySelectorAll('#a11yPanel [data-a11y]').forEach((btn) => {
    btn.addEventListener('click', () => {
      profile.a11y = profile.a11y || {}
      profile.a11y[btn.dataset.a11y] = btn.dataset.val
      saveProfile()
      applyA11y()
    })
  })
  blockPageZoom()
  document.getElementById('resetProgress').addEventListener('click', () => {
    if (!confirm('Reset stars, gems, and treasures?')) return
    const name = profile.name
    const a11y = profile.a11y
    profile = { name, points: 0, stars: 0, gems: 0, streak: 0, lastDay: null, milestone: 0, level: 1, loot: [], skillId: 'cvc', skills: {}, gaps: {}, practiceMs: 0, reads: 0, heardStory: false, a11y: a11y || { font: 'default', space: '1', tint: 'none' } }
    saveProfile(); renderStops(); renderGames(); renderChest()
    const buddy = document.getElementById('buddy')
    buddy?.classList.remove('wear-hat', 'wear-glasses', 'wear-cape')
  })
  document.getElementById('megaTreasure').addEventListener('click', () => { renderChest(); showView('chest') })
  document.getElementById('buddy').addEventListener('click', (e) => {
    e.preventDefault()
    unlockSpeech()
    buddyJoke()
  })
  document.querySelectorAll('.dock-btn').forEach((b) => {
    b.addEventListener('click', () => {
      if (!profile.name) { showView('welcome'); return }
      const v = b.dataset.view
      if (v === 'games') renderGames()
      if (v === 'chest') renderChest()
      if (v === 'home') renderStops()
      if (v === 'progress') renderSkillTrack()
      showView(v)
    })
  })
  if ('speechSynthesis' in window) {
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
    setTimeout(loadVoices, 250)
    setTimeout(loadVoices, 1000)
  }
  setupConfetti()
  applyA11y()
  scoreHud()
  setInterval(() => buddyTrick(null, true), 9000)

  if (profile.name) {
    document.getElementById('savedName').textContent = profile.name
    document.getElementById('continueBtn').classList.remove('hidden')
    greet(); renderStops(); renderGames(); renderChest()
    startSessionClock()
    if (!profile.heardStory) playStory()
    else showView('home')
  } else {
    showView('welcome')
  }

  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  if (standalone) {
    document.getElementById('installHint')?.classList.add('hidden')
    document.getElementById('homeInstall')?.classList.add('hidden')
  }
}

window.addEventListener('load', init)
