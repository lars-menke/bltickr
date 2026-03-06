import { subscribePush } from './api.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker wird nicht unterstützt');
  }

  return navigator.serviceWorker.register('./sw.js');
}

export async function requestNotificationPermission() {
  const permission = await Notification.requestPermission();

  if (permission !== 'granted') {
    throw new Error('Benachrichtigungen wurden nicht erlaubt');
  }

  return permission;
}

export async function ensurePushSubscription({ vapidPublicKey, favorites = [] }) {
  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  await subscribePush(subscription.toJSON(), favorites);

  return subscription;
}

export async function renewExistingSubscription({ favorites = [] }) {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return null;
  }

  await subscribePush(subscription.toJSON(), favorites);
  return subscription;
}
