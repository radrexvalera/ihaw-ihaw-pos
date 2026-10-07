/* Service worker for Ihaw-Ihaw POS.
 * The build (scripts/vite-plugin-sw.ts) fills in the precache list with every
 * built file, and the version with a hash of their contents.
 *
 * - Install: download the whole app shell into a versioned cache.
 * - Fetch: serve the app shell from cache first, so the POS opens with NO signal.
 *   Supabase (another origin) is never touched: data sync is the app's job.
 * - Update: a new version waits until the app asks it to take over (the user
 *   taps UPDATE), so a reload never happens in the middle of a sale.
 */
const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const CACHE = `ihaw-pos-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ihaw-pos-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Every page navigation gets the cached app shell (single-page app).
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match('/index.html').then((cached) => cached || fetch(request)),
      ),
    )
    return
  }

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request)),
    ),
  )
})
