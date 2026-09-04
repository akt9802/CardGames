import { apiJson, loadSession } from "./session.ts";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export async function getExistingPushSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function authToken() {
  return loadSession()?.token ?? null;
}

export async function subscribeToPushNotifications() {
  if (!isPushSupported()) throw new Error("This browser does not take parlor chimes.");
  const token = await authToken();
  if (!token) throw new Error("Sign in first.");
  const { publicKey } = await apiJson<{ publicKey: string }>("/api/push/vapid", undefined, token);
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await apiJson("/api/push/subscribe", subscription.toJSON(), token);
  return true;
}

export async function syncPushSubscription() {
  try {
    if (!isPushSupported()) return false;
    if (Notification.permission !== "granted") return false;
    const subscription = await getExistingPushSubscription();
    if (!subscription) return false;
    const token = await authToken();
    if (!token) return false;
    await apiJson("/api/push/subscribe", subscription.toJSON(), token);
    return true;
  } catch {
    return false;
  }
}

export async function releasePushSubscriptionBinding() {
  try {
    if (!isPushSupported()) return;
    const subscription = await getExistingPushSubscription();
    const token = await authToken();
    if (subscription && token) {
      await apiJson("/api/push/unsubscribe", { endpoint: subscription.endpoint }, token);
    }
  } catch {
    /* never block logout */
  }
}

export async function unsubscribeFromPushNotifications() {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  const token = await authToken();
  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    if (token) await apiJson("/api/push/unsubscribe", { endpoint }, token);
  }
}

export async function requestAndSubscribeChimes(): Promise<"on" | "denied" | "default"> {
  if (!isPushSupported()) throw new Error("This browser does not take parlor chimes.");
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    await subscribeToPushNotifications();
    return "on";
  }
  return permission === "denied" ? "denied" : "default";
}

export async function sendTestPush() {
  const token = await authToken();
  if (!token) throw new Error("Sign in first.");
  await apiJson("/api/push/test", {}, token);
}
