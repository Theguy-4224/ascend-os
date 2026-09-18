import { useCallback, useEffect, useMemo, useState } from "react";
import { firebaseConfigured } from "@/lib/firebase";

type NotificationOptions = {
  enabled: boolean;
  sound: boolean;
  onToken: (token: string) => Promise<void>;
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

function playChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1047, context.currentTime + 0.14);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.45);
    window.setTimeout(() => void context.close(), 600);
  } catch {
    // Some browsers block audio until the user has interacted with the page.
  }
}

export function useNotifications({ enabled, sound, onToken }: NotificationOptions) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const supported = permission !== "unsupported";
  const pushReady = Boolean(firebaseConfigured && vapidKey);

  const show = useCallback((title: string, body: string, forceSound = false) => {
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return false;
    try {
      new Notification(title, { body, icon: "/favicon.svg", badge: "/favicon.svg", tag: `ascend-${title}`, silent: false });
      if (sound || forceSound) playChime();
      return true;
    } catch {
      return false;
    }
  }, [sound]);

  const enable = useCallback(async () => {
    if (!supported) throw new Error("This browser does not support notifications.");
    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);
    if (nextPermission !== "granted") throw new Error("Notification permission was not allowed.");

    if (pushReady && "serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      const { getMessaging, getToken, isSupported } = await import("@firebase/messaging");
      if (await isSupported()) {
        const token = await getToken(getMessaging(), { vapidKey, serviceWorkerRegistration: registration });
        if (token) await onToken(token);
      }
    }
    if (sound) playChime();
    return pushReady;
  }, [onToken, pushReady, sound, supported]);

  useEffect(() => {
    if (!enabled || permission !== "granted" || !pushReady) return;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const { getMessaging, onMessage, isSupported } = await import("@firebase/messaging");
      if (!await isSupported()) return;
      unsubscribe = onMessage(getMessaging(), (payload) => {
        const notification = payload.notification;
        show(notification?.title || "Ascend OS", notification?.body || "You have a new reminder.");
      });
    })();
    return () => unsubscribe?.();
  }, [enabled, permission, pushReady, show]);

  return useMemo(() => ({ permission, supported, pushReady, enable, show }), [enable, permission, pushReady, show, supported]);
}
