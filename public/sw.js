// 최소 서비스워커: 앱 셸(정적 파일)을 캐시해 오프라인/설치형 앱으로 동작하게 한다.
// API 응답(/api/*)은 항상 네트워크에서 받는다(캐시하지 않음).
const CACHE = "ajd-v1";
const SHELL = ["./", "./index.html", "./style.css", "./dashboard.js", "./icon.svg", "./manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // API는 네트워크 우선(캐시 안 함)
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
