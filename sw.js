// HWP 뷰어 — 오프라인 캐시 (첫 방문 후 망이 끊겨도 열림)
// 문서 데이터는 절대 캐시하지 않음: 뷰어 껍데기(HTML/manifest)만 저장한다.
const CACHE = 'hwp-viewer-v17';
const ASSETS = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // 네트워크 우선 → 실패 시 캐시 (새 버전 자동 반영 + 오프라인 동작)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
