/* 공부별 아카데미 서비스 워커 — 오프라인에서도 개인 학습 기능이 열리도록 앱 파일을 캐시한다. */
const CACHE = 'study-star-v3';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch('/precache-manifest.json', { cache: 'no-store' });
        const { files } = await res.json();
        await cache.addAll(files);
      } catch {
        await cache.addAll(['/', '/index.html']);
      }
      self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 실시간 서버 요청은 캐시하지 않는다

  if (req.mode === 'navigate') {
    // 페이지 이동: 네트워크 우선, 실패하면 캐시된 앱 화면
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html', { ignoreVary: true })),
    );
    return;
  }

  // 정적 파일: 캐시 우선, 없으면 받아서 캐시
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
