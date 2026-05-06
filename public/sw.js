self.addEventListener('push', function(event) {
  if (!event.data) return

  const data = event.data.json()

  event.waitUntil(
    self.registration.showNotification(data.title || 'Washio', {
      body: data.body || '',
      icon: '/washio-logo.png',
      badge: '/washio-logo.png',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  )
})
