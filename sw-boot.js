(function () {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .then((reg) => {
        window.__lumaSwReady = reg
        if (navigator.serviceWorker.controller) {
          document.documentElement.dataset.offline = 'ready'
        }
      })
      .catch(() => {})
  })
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    document.documentElement.dataset.offline = 'ready'
  })
})()
