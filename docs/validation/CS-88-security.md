# CS-88 — Authorization and sensitive data

Payout account numbers are encrypted through an EF value converter using ASP.NET Data Protection (`dp:v1:`). The generated context/entities remain untouched. V012 replaces the plaintext unique index with a keyed HMAC lookup index, preserving duplicate detection across owners and leading zeroes. Public batch collection/VietQR account numbers are separate fields and remain usable.

## Deployment and recovery

- Apply V012 and the matching API during a maintenance window; stop the old API first. Never run an old API against upgraded account rows. CS-80 prepares this deployment sequence.
- Persist the entire private key directory, including `payout-lookup-key.protected`. Configure `Security__DataProtectionKeyPath`; App Service defaults to `/home/data/keys`. Keep it outside uploads/webroot, restrict filesystem access and back up with the database. Linux directory permissions are owner-only. These files are secrets; do not commit/upload them as build artifacts.
- The production startup upgrade encrypts legacy numbers without changing IDs, owner, status, timestamps or audit history. It checks all protected rows/digests in bounded chunks before serving. Missing/wrong keys or corruption stop startup. Restore the original key-directory backup; never generate replacement keys to recover existing records.
- Local Development: after applying V012 set `Security__UpgradeLegacyPayouts=true` for the upgrade. Seeding also upgrades before reading existing rows. This is skipped by validation-only test hosts without a database.
- Existing backups may still contain historical plaintext; handle them as sensitive backups. Encryption does not erase prior backups or protect a server compromised together with its private key directory. No image identity/selfie storage was introduced.

## Request security

JWT authorization uses current database roles and rejects unavailable users. The signed farm claim is retained so existing membership checks reject tokens for a former farm. Cross-role access remains 403; anonymous/revoked account tokens return 401.

Production rejects HTTP business requests before authentication and emits HSTS on HTTPS. Health probes remain available. Forwarded headers are accepted only from framework loopback defaults and configured `Security:KnownProxies` / `Security:KnownNetworks`; App Service adds its documented private ingress ranges only when the platform environment is present. Never enable `ASPNETCORE_FORWARDEDHEADERS_ENABLED` globally or expose Kestrel directly behind these trusted private ranges. See [Microsoft proxy guidance](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0) and [App Service HTTPS detection](https://learn.microsoft.com/en-us/azure/app-service/configure-language-dotnetcore).

Authentication endpoints have a 60-request/minute/IP limit (429 + Retry-After). A normalized account permits five failed/in-flight attempts in 15 minutes, with a bounded 10,000-entry store and fixed expiry. Successful login clears the account window. Unknown users run password verification against a dummy hash and receive the same error. The guard is in memory for the current single-instance demo: restart clears it; scaling to multiple instances requires a shared limiter/edge protection. Database fixtures explicitly raise only their IP budget for bulk setup; security tests exercise actual defaults.

Web ignores a delayed 401 belonging to an earlier session, while a current-token 401 signs out correctly.

## Dependency patches

API and migrator explicitly resolve Pkcs 9.0.21, addressing both [GHSA-2fmv-rv2c-59x7](https://github.com/advisories/GHSA-2fmv-rv2c-59x7) and [GHSA-846f-f764-76mx](https://github.com/advisories/GHSA-846f-f764-76mx). No advisory suppression was added. Keep the host's .NET runtime patched separately.

## Validation

- Release build and complete backend suite: 657 API tests and 4 settlement tests passed. After the final startup/key-consistency/proxy changes, all 32 focused security tests passed (one additional proxy case).
- Tests inspect raw SQL ciphertext, leading zeroes/API round trip, duplicate rejection, legacy upgrade/idempotence and unchanged audit count; JWT current roles/revocation, unknown-email 401→429, role matrix, concurrent attempt limits/expiry, key persistence/tampering, HTTP/HSTS and trusted/untrusted proxies.
- Web production build passed. Two new browser tests verify stale/current 401 session behavior; the final complete suite passed 90 cases with 2 existing real-API scenarios skipped. One existing batch test timed out in an earlier run, then passed in the targeted and complete reruns.
- No actual server records/keys were modified. Actual production acceptance and two-device checks are recorded separately in CS-80/84/92.
