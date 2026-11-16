Signed Android APK for the CrabShare Sprint 3 demo. API and web use the existing HTTPS Azure/Vercel environment.

Download `CrabShare-Sprint3-demo.apk`, `SHA256SUMS.txt` and `release-manifest.json`. Verify the checksum before installation. The manifest includes the actual application ID, Android version, source commit and public signing certificate fingerprint.

Installation and role instructions: `docs/demo-app.md` in the source repository at the listed commit.

This is a draft pending two-real-phone acceptance (install, login, evidence camera/GPS and trace QR). CS-82 supplies the actual tag scanner/trace implementation; current placeholder trace screens are not accepted as a passing scan. Publish only after that dependency and the device checklist pass. Do not upload private signing keys or passwords as release assets.
