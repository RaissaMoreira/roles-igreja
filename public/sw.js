// Service worker do app "Rolês Alcance".
// - Páginas: tenta a internet primeiro; sem conexão, abre a última versão salva.
// - Arquivos do build (/assets/*, têm hash no nome): salva e reaproveita.
// - Supabase e Mercado Pago (outros domínios) nunca passam pelo cache.
const CACHE = 'roles-alcance-v1'
const BASICOS = ['/', '/manifest.webmanifest', '/alcance-logo.png', '/icon-192.png', '/favicon.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICOS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copia = resp.clone()
          caches.open(CACHE).then((c) => c.put('/', copia))
          return resp
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (salvo) =>
          salvo ||
          fetch(req).then((resp) => {
            const copia = resp.clone()
            caches.open(CACHE).then((c) => c.put(req, copia))
            return resp
          }),
      ),
    )
  }
})
