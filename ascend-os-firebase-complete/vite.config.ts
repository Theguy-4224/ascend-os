import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

function firebaseMessagingWorker(): Plugin {
  let firebaseConfig: Record<string, string> = {};
  return {
    name: "ascend-firebase-messaging-worker",
    config(_, { mode }) {
      const env = loadEnv(mode, projectRoot, "");
      firebaseConfig = {
        apiKey: env.VITE_FIREBASE_API_KEY || "",
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
        projectId: env.VITE_FIREBASE_PROJECT_ID || "",
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
        appId: env.VITE_FIREBASE_APP_ID || "",
      };
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "firebase-messaging-sw.js",
        source: `importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");\nimportScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");\nfirebase.initializeApp(${JSON.stringify(firebaseConfig)});\nconst messaging = firebase.messaging();\nmessaging.onBackgroundMessage((payload) => {\n  const notification = payload.notification || {};\n  self.registration.showNotification(notification.title || "Ascend OS", {\n    body: notification.body || "You have a new reminder.",\n    icon: "/favicon.svg",\n    badge: "/favicon.svg",\n    data: payload.data || {},\n    silent: false,\n  });\n});\nself.addEventListener("notificationclick", (event) => {\n  event.notification.close();\n  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => windows[0] ? windows[0].focus() : clients.openWindow("/")));\n});\nconst cacheName = "ascend-os-shell-v1";\nself.addEventListener("install", (event) => event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/favicon.svg"]))));\nself.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));\nself.addEventListener("fetch", (event) => {\n  const url = new URL(event.request.url);\n  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;\n  event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); void caches.open(cacheName).then((cache) => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))));\n});\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), firebaseMessagingWorker()],
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
