# Android App Links (future)

This folder exists as a placeholder for enabling **Android App Links** for invite URLs like:

- `https://www.kamisocial.com/invite/benji`

When you are ready to enable verified links:

- Add a real `assetlinks.json` payload in `/.well-known/assetlinks.json` that matches your Android package name and signing certificate fingerprints.
- Add an `<intent-filter>` with `android:autoVerify="true"` in the Android app for:
  - `https://www.kamisocial.com/invite/*`

Notes:

- `assetlinks.json` must be served **without redirects** and with `Content-Type: application/json`.
- Once verified, Android can open `https://www.kamisocial.com/invite/{code}` directly in the app (no `kami://` deep link required).

