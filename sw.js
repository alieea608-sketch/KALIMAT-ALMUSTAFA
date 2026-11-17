/* =====================================
   Service Worker - متجر كلمات المصطفى
   الشبكة أولاً (تصل التحديثات فوراً) مع نسخة احتياطية عند انقطاع الإنترنت.
   عند تعديل ملفات الموقع غيّر رقم VERSION لتنظيف النسخ القديمة.
===================================== */
const VERSION = "kalimat-v1";

const CORE = [
  "./", "index.html", "smart-devices.html", "accessories.html", "computers.html",
  "offers.html", "product.html", "reels.html", "offline.html",
  "style.css", "main.js", "megamenu.js", "phone-finder.js", "data.js",
  "store-api.js", "supabase-config.js", "splash.js",
  "css/style.css", "js/main.js", "js/megamenu.js", "js/phone-finder.js",
  "js/data.js", "js/store-api.js", "js/supabase-config.js", "js/splash.js",
  "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => Promise.allSettled(
        // الملفات غير الموجودة (مثل مجلد css/ أو js/ غير المستخدم) تُتجاهل بهدوء
        CORE.map(url => cache.add(new Request(url, { cache: "reload" })))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // Supabase والخطوط والمكتبات: عبر الشبكة مباشرة
  if (/\/sw\.js$/.test(url.pathname)) return;
  if (/admin/i.test(url.pathname)) return;               // لوحة التحكم لا تُخزَّن أبداً

  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type === "basic") {
      const type = res.headers.get("content-type") || "";
      // لا نخزن صفحات HTML بدل الملفات المفقودة (بعض الاستضافات ترجع 200 لكل مسار)
      if (req.mode === "navigate" || !type.includes("text/html")) {
        cache.put(req, res.clone());
      }
    }
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    if (req.mode === "navigate") {
      const offline = await cache.match("offline.html");
      if (offline) return offline;
    }
    return Response.error();
  }
}