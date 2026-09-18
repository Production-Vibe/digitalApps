function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var raw = window.atob(base64);
  var bytes = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function pushSupported() {
  return ('serviceWorker' in navigator) && ('PushManager' in window);
}

var cachedVapidKey = null;

async function getPushConfig() {
  if (!pushSupported()) return null;
  try {
    if (!cachedVapidKey) {
      var data = await api('/api/push/vapid-key');
      cachedVapidKey = data.publicKey || '';
    }
    return cachedVapidKey || null;
  } catch (e) {
    return null;
  }
}

async function ensureServiceWorker() {
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    return null;
  }
}

async function attachPushSubscription(registration) {
  var key = await getPushConfig();
  if (!key || !registration || !registration.pushManager) return false;
  try {
    var subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key)
      });
    }
    var subKeys = {
      p256dh: subscription.getKey ? btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')))) : '',
      auth: subscription.getKey ? btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth')))) : ''
    };
    if (!subKeys.p256dh || !subKeys.auth) return false;
    try {
      await api('/api/push/subscribe', {
        method: 'POST',
        body: { endpoint: subscription.endpoint, keys: subKeys }
      });
      try { localStorage.setItem('pushEndpoint', subscription.endpoint); } catch (e2) {}
      return true;
    } catch (eNotify) {
      try { await subscription.unsubscribe(); } catch (e3) {}
    }
  } catch (e) {
    console.warn('[push] attach failed', e);
  }
  return false;
}

async function initPush() {
  if (!pushSupported()) return;
  var registration = await ensureServiceWorker();
  if (!registration) return;
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    await attachPushSubscription(registration);
  }
}

window.askPushPermission = async function () {
  if (!pushSupported()) {
    showToast('Push недоступен в этом браузере', true);
    return;
  }
  var permission = typeof Notification !== 'undefined' ? await Notification.requestPermission() : 'denied';
  if (permission !== 'granted') {
    showToast('Уведомления отключены', true);
    return;
  }
  var registration = await ensureServiceWorker();
  var ok = await attachPushSubscription(registration);
  showToast(ok ? 'Push-уведомления включены' : 'Не удалось включить push', !ok);
  if (window.reloadNotifPanel) window.reloadNotifPanel();
};