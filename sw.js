// HWP 뷰어 — 오프라인 캐시 (첫 방문 후 망이 끊겨도 열림)
// 뷰어 껍데기(HTML/manifest)만 저장한다. 문서 데이터는 캐시하지 않는다.
const CACHE = 'hwp-viewer-v39';
const CORE = './index.html';                                  // 없으면 안 되는 것
const OPTIONAL = ['./', './manifest.webmanifest'];            // 없어도 설치는 성공해야 하는 것

// 캐시에 남겨도 되는 것만 허용 (뷰어 껍데기). 그 외(문서·글꼴 등)는 저장하지 않는다.
// 주의: 지금은 단일 HTML이라 목록이 짧다. 나중에 CSS/JS를 외부 파일로 분리하면
//       여기에 함께 추가해야 오프라인이 조용히 깨지지 않는다.
function isShell(url) {
  try {
    const u = new URL(url);
    if (u.origin !== self.location.origin) return false;      // 다른 사이트 자원은 캐시하지 않음
    return /(^|\/)$|(^|\/)index\.html$|(^|\/)manifest\.webmanifest$/.test(u.pathname);
  } catch (e) { return false; }
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // 핵심 파일만 실패 시 설치 중단. 나머지는 개별 실패를 무시해 오프라인이 통째로 죽지 않게 한다.
      c.add(CORE).then(() => Promise.all(OPTIONAL.map((u) => c.add(u).catch(() => {}))))
    ).then(() => self.skipWaiting())
  );
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
        if (isShell(e.request.url) && res && res.ok) {        // 껍데기만 저장
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match(CORE)))
  );
});
