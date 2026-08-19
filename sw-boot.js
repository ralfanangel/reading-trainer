(function(){
  // Register service worker for PWA/offline caching
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(()=>{})
  }
})();

// Enhanced game logic additions: streaks, daily bonus, avatar unlocks

let streak = 0
let lastPlay = 0

function onCorrectAnswer() {
  const now = Date.now()
  // if last play was within 30s, continue streak
  if (now - lastPlay < 30000) streak++
  else streak = 1
  lastPlay = now
  profile.points += 1
  // small bonus for streaks
  if (streak > 1) {
    profile.points += Math.min(2, Math.floor(streak/2))
  }
  // daily bonus: give a small treasure if first play of the day
  const today = new Date().toDateString()
  const last = localStorage.getItem('rt_last_play_date')
  if (last !== today) {
    profile.treasures += 1
    localStorage.setItem('rt_last_play_date', today)
  }
  saveProfile()
  updateJourneyUI()
}

// Hook into existing celebrate() used earlier
const _origCelebrate = window.celebrate
window.celebrate = function() {
  try { onCorrectAnswer() } catch(e){}
  if (typeof _origCelebrate === 'function') _origCelebrate()
}

// Avatar unlocks: simple mapping from treasures to unlocked items
const avatarUnlocks = [
  { need: 1, id: 'hat', emoji: '🎩' },
  { need: 3, id: 'glasses', emoji: '🕶️' },
  { need: 6, id: 'cape', emoji: '🦸‍♂️' }
]

function updateAvatar() {
  const el = document.getElementById('avatar')
  if (!el) return
  const unlocked = avatarUnlocks.filter(u => profile.treasures >= u.need)
  if (unlocked.length) {
    el.textContent = '🧸 ' + unlocked.map(u=>u.emoji).join(' ')
  } else {
    el.textContent = '🧸'
  }
}

// call updateAvatar whenever UI updates
const _origUpdateJourneyUI = window.updateJourneyUI
window.updateJourneyUI = function() {
  try { if (typeof _origUpdateJourneyUI === 'function') _origUpdateJourneyUI() } catch(e){}
  updateAvatar()
}
