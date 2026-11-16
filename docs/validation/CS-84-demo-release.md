# CS-84 — Signed HTTPS demo release preparation

- APK source: `570276d1f8d1273c986d0066c157f031d3a79d05`.
- Application: `vn.crabshare.crabshare_mobile`, version `1.0.0-demo.3`, Android code `30084`.
- Size: 75,440,327 bytes.
- APK SHA-256: `3e319789302b3f84e56dc3eba2a9e6b354aaacf52cce20feab497495fdfb2ad5`.
- Public certificate SHA-256: `fdeaf0e79452d7b13a704940c85a09c717c042c9e3da0550552565e6795fc7e0`.
- API: `https://crabshare-api.azurewebsites.net`; web: `https://crabshare.vercel.app`.

[Draft GitHub Release](https://github.com/thienhoibai/crabshare/releases/tag/untagged-6013493a4e5dadbb6314) contains the signed APK, checksum, public signature evidence, release manifest and install guide. A draft requires repository write access and is not a public installation link yet. No private key/password is an asset.

Validation: Flutter analyze clean; all 151 tests passed; release APK built and Android `apksigner` verification passed. Two packaging guard tests passed. Actual Gradle checks rejected both missing signing configuration and HTTP API_URL. Actionlint passed the manual draft-release workflow.

Four previously absent GitHub Actions signing secrets were created using GitHub's public-key encryption protocol: `ANDROID_KEYSTORE_BASE64`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEY_ALIAS`. No existing secret was overwritten. The workflow can reuse the accepted APK's signing identity after merge. Keep a separate private backup of the local demo key/passwords (ignored `.artifacts/sprint3/signing/`); do not clean that directory before backing it up. See [GitHub's secret encryption protocol](https://docs.github.com/en/rest/guides/encrypting-secrets-for-the-rest-api).

No Android device was connected (`adb devices` empty). Installation/camera/GPS/reopen behavior on two real phones remains pending. CS-82 (Viên, To Do) owns real scanner/trace; current mock scan/trace screens do not meet the QR acceptance criterion. Do not publish or mark CS-84 fully accepted until those dependencies pass. See `docs/demo-app.md` and CS-92's checklist.
