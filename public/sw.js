// MSU Traffic - Service Worker for Notifications & PWA
const CACHE_NAME = 'msu-traffic-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle Notification Click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const clickActionUrl = event.notification.data?.url || '/';
  const reportId = event.notification.data?.reportId || null;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a tab is already open, focus it and post a message
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if (reportId) {
            client.postMessage({ type: 'FOCUS_REPORT', reportId: reportId });
          }
          return client.focus();
        }
      }
      // If no tab is open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(clickActionUrl);
      }
    })
  );
});

// Handle Background Push Event
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || '🚨 แจ้งเตือน MSU Traffic';
    const options = {
      body: payload.body || 'มีข้อมูลจราจรอัปเดตใหม่',
      icon: payload.icon || '/images/logo.png',
      badge: '/favicon.svg',
      vibrate: [200, 100, 200],
      data: payload.data || { url: '/' },
      tag: payload.tag || 'msu-traffic-alert'
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    console.error('Push event error:', e);
  }
});
