# Ascend OS

Ascend OS is a responsive personal command center for money, routines, habits, physique, aesthetics, and daily reflection.

## What works

- Firebase Authentication with anonymous sessions and optional Google account linking
- Firestore cloud persistence with per-user security rules
- Full Blueprint CRUD: create, edit, complete, and delete routine blocks
- Real expense entries, deletion, daily allowance, and seven-day chart
- Habit completion and streak tracking
- Protein, hydration, skincare, reflection, and progressive-overload logs
- Local-storage fallback when Firebase is not configured or unavailable
- Responsive desktop sidebar and mobile bottom navigation

## Local development

```bash
npm install
npm run dev
```

The production build is validated with:

```bash
npm run build
```

## Firebase setup

1. Create a Firebase project and register a Web app.
2. In **Authentication → Sign-in method**, enable **Anonymous** and **Google**.
3. In **Authentication → Settings → Authorized domains**, add your deployed hostname, for example `ascend-os.fh84469.workers.dev`.
4. Create a Cloud Firestore database.
5. Open **Firestore Database → Rules**, copy the contents of `firestore.rules`, then publish the rules.
6. Copy `.env.example` to `.env.local` and replace each placeholder with the values from **Project settings → Your apps → SDK setup and configuration**.

The Firebase web configuration is not a server secret. Access is protected by Authentication and `firestore.rules`.

## Cloudflare Workers deployment

In **Worker → Settings → Build**, use:

- Root directory: the folder containing `package.json` and `wrangler.jsonc`
- Build command: `npm run build`
- Deploy command: `npm run deploy`

Add these as Cloudflare build variables using the values from the Firebase Web app:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

Push a new commit or retry deployment after saving the variables. Without them, the app remains fully usable in device-only mode.

## Data model

Each signed-in user owns isolated data under `users/{uid}`:

```text
users/{uid}/routines/{routineId}
users/{uid}/expenses/{expenseId}
users/{uid}/lifts/{liftId}
users/{uid}/settings/dashboard
```

