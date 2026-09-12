/* 客户管理系统 Service Worker —— 离线缓存
 * 版本号：修改本文件或页面后请递增 CACHE_VERSION，浏览器会自动更新并清理旧缓存
 */
const CACHE_VERSION = 'crm-pwa-v5';
const CORE_CACHE = CACHE_VERSION + '-core';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

// 本地核心资源（首次安装时预缓存）
const PRECACHE_URLS = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './icon-maskable.png'
];

// 允许缓存的第三方 CDN（离线时保证样式/图表可用）
const CACHEABLE_CDN_HOSTS = ['cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'cdn.sheetjs.com'];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CORE_CACHE)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

function putInCache(request, response) {
    if (request.method !== 'GET' || !response || response.status !== 200) return;
    const url = new URL(request.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    const clone = response.clone();
    caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone)).catch(() => {});
}

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // 仅缓存两类资源：同源静态资源 + 白名单 CDN。
    // 其余请求（如云同步 Gitee API、任何跨域接口）一律放行直连，不缓存，
    // 保证云端数据实时拉取、避免令牌写入缓存。
    const sameOrigin = url.origin === location.origin;
    const isCdn = CACHEABLE_CDN_HOSTS.includes(url.hostname);
    if (!sameOrigin && !isCdn) return;
    if (sameOrigin && url.pathname.startsWith('/api/')) return;

    // 页面导航：网络优先，失败回退缓存（保证离线可打开）
    if (req.mode === 'navigate') {
        e.respondWith(
            fetch(req)
                .then((res) => { putInCache(req, res); return res; })
                .catch(() =>
                    caches.match(req).then((cached) =>
                        cached || caches.match('./index.html')
                    )
                )
        );
        return;
    }

    // 静态资源（含白名单 CDN）：缓存优先，网络更新缓存，离线回退缓存
    e.respondWith(
        caches.match(req).then((cached) => {
            const network = fetch(req)
                .then((res) => { putInCache(req, res); return res; })
                .catch(() => cached);
            return cached || network;
        })
    );
});
