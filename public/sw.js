// 서비스워커: "네트워크 우선" 전략.
// 온라인이면 항상 서버의 최신 파일을 보여주고, 오프라인일 때만 캐시로 대체한다.
// (이전 "캐시 우선" 방식은 배포해도 옛날 화면이 남는 문제가 있어 교체함)
const CACHE = "ajd-v2";
const SHELL = ["./", "./index.html", "./style.css", "./dashboard.js", "./logo.png", "./icon.svg", "./manifest.json"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // 외부(폰트·차트 CDN)는 그대로 네트워크
  if (url.pathname.startsWith("/api/")) return;     // API는 항상 네트워크
  // 네트워크 우선 → 성공 시 캐시 갱신, 실패(오프라인) 시 캐시 사용
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
