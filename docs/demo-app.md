# CS-84 — Android demo APK

The demo uses `https://crabshare-api.azurewebsites.net` and `https://crabshare.vercel.app`. It does not need USB reverse or a laptop backend. Server feature acceptance depends on CS-80 rollout. Two physical phones are required; an emulator does not count.

## Signing and build

Keep one private demo signing key for subsequent updates. Store/back up the key and passwords privately, outside source control and release artifacts. `mobile/android/key.properties` and keystores are ignored. Configure an existing private key through that file:

```properties
storeFile=C:/private/crabshare-demo.jks
storePassword=<private password>
keyAlias=crabshare-demo
keyPassword=<private password>
```

Alternatively set `CRABSHARE_KEYSTORE_PATH`, `CRABSHARE_STORE_PASSWORD`, `CRABSHARE_KEY_ALIAS`, `CRABSHARE_KEY_PASSWORD` only in the build environment. No password is a Dart define. Default release builds require signing and explicit HTTPS origins; they fail instead of silently producing a debug-signed localhost APK.

```bash
cd mobile
flutter pub get
flutter analyze
flutter test
flutter build apk --release --build-name=1.0.0-demo.3 --build-number=30084 --dart-define=API_URL=https://crabshare-api.azurewebsites.net --dart-define=WEB_URL=https://crabshare.vercel.app
cd ..
python mobile/scripts/package_demo.py --apk mobile/build/app/outputs/flutter-apk/app-release.apk --output .artifacts/demo-release --revision <full-source-SHA> --api https://crabshare-api.azurewebsites.net --web https://crabshare.vercel.app
```

Set `ANDROID_HOME` and `JAVA_HOME` to the installed SDK/JDK for packaging. `package_demo.py` verifies the actual APK signature, rejects an Android Debug certificate and unexpected application ID, extracts the APK version, and emits SHA-256/public fingerprint/provenance. The API/web values record the build inputs; device acceptance confirms the actual network behavior. Never edit provenance to claim untested device results.

For local USB **development only**, the older release testing procedure can opt in with `CRABSHARE_ALLOW_LOCAL_RELEASE=true`. That permits existing debug signing and loopback HTTP. Remove the variable before a demo release. Debug builds continue to support LAN HTTP. The release packaging tool always rejects a debug certificate.

## GitHub draft release

After review/merge, configure repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEY_ALIAS` using the same private key as the accepted APK. Run **Prepare demo Android release** from develop with a new `demo-*` tag and an increasing Android build number. The workflow analyzes/tests/builds, verifies the signature/checksum and creates a **draft prerelease** with only APK and public metadata. No private key is uploaded.

Before publishing, complete both device rows in CS-92, including CS-82's real QR/trace dependency. Draft assets need repository write access; after publishing the prerelease the APK gets a shareable Releases link. A tag/build already used must not be silently reused for different bytes.

## Install on a real phone

1. Open the published GitHub Release link on the phone. Download the APK and compare its SHA-256 with `SHA256SUMS.txt` using a trusted checksum tool, or verify on the laptop with `Get-FileHash <apk> -Algorithm SHA256` before USB transfer.
2. Allow installation for that browser/file manager, install and open **CrabShare**. Disable the installation permission again afterwards if desired.
3. For USB installation: `adb -s <serial> install -r <apk>`. If an older app uses the Android Debug signing key, Android rejects the update with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. First submit/export any pending offline evidence, then uninstall that old test app and install the signed demo. Uninstalling clears its local session and queued files.
4. Grant camera and location **while using the app**, enable device location, set automatic date/time, and use working Wi-Fi/mobile data. No `adb reverse` is needed.

Demo accounts use the team's seeded password `CrabShare@2026` (demo data only):

| Phone / role | Account | Checks |
|---|---|---|
| A / household operator | `operator@crabshare.local` | Login, current boxes/capture requests, take an actual photo with GPS, upload and reopen persisted submission status |
| B / investor | `investor1@crabshare.local` | Login, real KYC/portfolio, account/payout view, logout and restore session |
| Either / public trace | No login required | Real activated tag from CS-71/74/82, scan camera → matching trace record; unknown tag must not show a fabricated success |

Admin `admin@crabshare.local` and reviewer `reviewer@crabshare.local` belong to web acceptance. Do not count their unsupported mobile-role page as a login failure.

## Acceptance limits

At preparation time, CS-82 (Viên) remains To Do; the existing scanner/trace screens are mock demonstrations. Building an APK does not make them real. This task does not replace the teammate's feature or mark scan acceptance as passed. No physical phone was connected during this build; record model/Android version, APK checksum and each actual result in CS-92 before marking CS-84 complete.
