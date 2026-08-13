# TeleCaption

Speak on your Android phone → live captions appear as an overlay on your laptop (Windows / macOS), over the internet.

```
[Android app] --speech-to-text--> [WebSocket relay] --text--> [Desktop overlay]
   (phone mic, on-device STT)      (tiny Node server)          (Electron, click-through,
                                                                always on top, no focus steal)
```

- **Accuracy**: uses Android's native speech recognition (Google's on-device/hybrid model — same engine as Gboard voice typing).
- **Latency**: partial results stream word-by-word as you speak; only tiny JSON text goes over the wire (~50–200 ms end-to-end on a normal connection).
- **Overlay**: transparent, always-on-top, click-through, never takes focus — the app under it never notices.

## 1. Deploy the relay (once)

Any free Node host works. Easiest — [Render](https://render.com) free tier:

1. Push this repo to GitHub/GitLab.
2. Render → New → Web Service → pick the repo, set **Root Directory** = `relay`.
3. Build command `npm install`, start command `node server.js`. Done.
4. Your relay URL is `wss://<your-service>.onrender.com`.

Or Docker anywhere: `cd relay && docker build -t telecaption-relay . && docker run -p 8080:8080 telecaption-relay`

Local test: `cd relay && npm install && npm start` → `ws://localhost:8080`.

> Note: Render free tier sleeps after idle — first connect takes ~30 s to wake. For zero cold start use a $5 instance or Fly.io.

## 2. Desktop overlay (Windows & macOS)

```
cd desktop
npm install
npm start
```

First run opens Settings: enter relay URL (`wss://…`) and a room code (any word — must match phone). Overlay appears at bottom of screen.

- Tray icon → Settings / Hide overlay / Quit.
- `Ctrl+Alt+T` (`Cmd+Alt+T` on Mac) toggles the overlay.
- Overlay is click-through and unfocusable — type/click/game underneath freely.

Build installers:

```
npm run dist:win   # Windows .exe installer (run on Windows)
npm run dist:mac   # macOS .dmg (must run on a Mac)
```

macOS note: overlay shows over full-screen apps too. Unsigned builds need right-click → Open on first launch (or sign with your Apple Developer ID for distribution).

## 3. Android app

1. Open `android/` in Android Studio (it generates the Gradle wrapper automatically).
2. Run on your phone (USB debugging) — or Build → Generate Signed App Bundle for Play Store.
3. In the app: enter the same relay URL + room code, tap **START**, allow microphone, speak.

Captions appear on the laptop as you talk. Yellow text = live partial, white = finalized sentence.

### Play Store publishing (short version)

1. Android Studio → Build → Generate Signed Bundle (`.aab`) with a new keystore (keep the keystore safe).
2. [Play Console](https://play.google.com/console) ($25 one-time) → Create app → upload `.aab`.
3. Declare the microphone permission in the Data Safety form (audio processed on device, only text transmitted).

## CI builds (no local toolchain needed)

Same repo works on GitLab and GitHub — push to either (or both), download artifacts.

**GitLab** (`.gitlab-ci.yml`) — CI/CD → Pipelines → job artifacts:

- `android-apk` → `app-debug.apk` (sideload directly on phone)
- `windows-exe` → `TeleCaption Setup.exe` (built via wine, free tier)
- `macos-dmg` → **manual job, needs GitLab Premium** (SaaS Mac runners are paid) — use GitHub for the free Mac build

**GitHub** (`.github/workflows/build.yml`) — Actions → run → Artifacts. Builds all three on every push (APK, .exe, .dmg); macOS runners are free on GitHub. Also runnable manually: Actions → build-all → Run workflow.

## Notes

- Room code is the only "auth" — pick something unguessable if captions are sensitive.
- Recognition language = phone's system language. Change phone language/Google voice-typing language to switch.
- Android's recognizer has a brief (~0.3 s) gap between sentences while it restarts — normal, partials resume immediately.
- Multiple laptops can join the same room; all get the captions.
