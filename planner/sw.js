/* 교육부 수첩 — 홈 화면 추가(PWA)용 최소 서비스 워커. 앱 껍데기만 저장해 두고, 자료는 Firestore의 오프라인 저장소가 맡는다. */
const CACHE = 'planner-shell-202611061';
const SHELL = ['./', './index.html', './planner.css?v=202611061', './planner.js?v=202611061', '../config.js?v=202610131605', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // 공유로 들어온 주소(?text=…)는 항상 index.html로 — 캐시된 껍데기를 쓰되 주소는 그대로 둔다
  e.respondWith(fetch(e.request).then(r => { if (r.ok && !u.search) caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});
