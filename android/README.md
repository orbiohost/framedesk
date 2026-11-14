# FrameDesk for Android

A [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity)
of https://desk.orbio.in, generated with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).
The app opens the live site full screen in Chrome's engine, so Google sign-in, cookies,
Razorpay, the microphone and the media service worker all behave exactly as on the web.
Every web deploy updates the app; only icon, name or colour changes need a new APK.

The JDK 17 and Android SDK live in `~/.bubblewrap` (paths in `~/.bubblewrap/config.json`).

## First release

```sh
cd android
npm install
npm run setup        # read and accept the Android SDK licences, install SDK parts
npm run keystore     # create android.keystore; save the password, back up the file
npm run build        # -> app-release-signed.apk, app-release-bundle.aab, assetlinks.json
npm run assetlinks   # copy assetlinks.json to client/public/.well-known/
```

Then deploy the web app and check that
`https://desk.orbio.in/.well-known/assetlinks.json` returns the JSON. LiteSpeed/CyberPanel may
answer `/.well-known/` itself (ACME), and the same check applies to the OAuth discovery URLs.
Until that file is served, the app still works but shows a small browser address bar.

- Test on a phone: `npm run install-apk` (USB debugging on), or copy `app-release-signed.apk`.
- Google Play: upload `app-release-bundle.aab`. With Play App Signing, Play re-signs the app,
  so also add Play's **app signing key SHA-256** (Play Console → Setup → App signing) with
  `npx bubblewrap fingerprint add <sha256>`, rebuild, and run `npm run assetlinks` again.

## Build notes

- `keystore.env` (git-ignored) holds the key passwords; load it before building so Bubblewrap
  doesn't prompt (`set -a; . ./keystore.env; set +a` in Git Bash).
- Signing the `.aab` needs `jarsigner` on PATH: add `~/.bubblewrap/jdk/bin` to PATH.
- Minimum Android version is 7.0 (API 24, required by androidbrowserhelper).

## Later releases

Bump the version with `npm run update` (it regenerates the project from `twa-manifest.json`
and the live web manifest), then `npm run build`. Always sign with the same `android.keystore`.
