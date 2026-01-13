importScripts(
  "https://cdn.jsdelivr.net/npm/streamsaver@2.0.6/StreamSaver.min.js"
)

self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request))
})
