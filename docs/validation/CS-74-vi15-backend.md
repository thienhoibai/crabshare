# CS-74 / VI-15 backend validation

**Date:** 2026-10-21  
**Scope:** Backend tag list/label, post-harvest Evidence context, manual review for `Watch`, activation, void/replacement, and public trace API.

## Database

- Added forward-only `V017__evidence_crab_item.sql`. It adds nullable `evidence.crab_item_id`, a foreign key to `crab_item`, and a non-unique lookup index. Existing evidence rows remain `NULL`.
- Applied V017 to local `CrabShareDev` with `dotnet run --project backend/tools/CrabShare.DbMigrator`.
- The database fixture applies all `database/migrations/V*.sql` to isolated LocalDB test databases. Persistence tests verified nullable/non-unique schema behavior, an invalid Evidence-to-crab FK, and the existing `ck_crab_tag_active` check.
- `backend/scripts/scaffold-db.ps1` was run after the migration. Its full output included unrelated schema drift and generated duplicate members against existing custom partial entities, so the resulting unrelated generated changes were restored. The Evidence model and context mapping for V017 were retained in the current scaffold files.

## Verification commands

| Command | Result |
|---|---|
| `dotnet test backend/tests/CrabShare.Api.Tests/CrabShare.Api.Tests.csproj --filter FullyQualifiedName~TagTestsPersistence --no-restore --verbosity quiet` | Passed 1/1 |
| `dotnet test backend/tests/CrabShare.Api.Tests/CrabShare.Api.Tests.csproj --filter "FullyQualifiedName~EvidenceControllerTests\|FullyQualifiedName~EvidenceDatabaseTests\|FullyQualifiedName~EvidenceReviewDatabaseTests" --no-restore --verbosity quiet` | Passed 55/55; separate tag-context upload passed 1/1 |
| `dotnet test backend/tests/CrabShare.Api.Tests/CrabShare.Api.Tests.csproj --filter "FullyQualifiedName~HarvestTests\|FullyQualifiedName~EvidenceControllerTests\|FullyQualifiedName~EvidenceDatabaseTests\|FullyQualifiedName~EvidenceReviewDatabaseTests" --no-restore --verbosity quiet` | Passed 140/140 after review fixes |
| `dotnet test backend/CrabShare.sln --no-restore --verbosity quiet` | Passed 1,058 total (API 1,054; SettlementEngine 4) after review fixes |

Review-fix regression commands also passed: foreign Evidence scoping, membership revocation after the audit lock, invalid generated code, concurrent activation, concurrent void, and audit-failure rollback (6/6). The three behavior fixes were each observed failing with their guard removed, then passing after restoration.

## Coverage notes and limitations

- Direct API tests cover current Operator scope, configured label URL, tag state visibility, Accepted evidence activation, evidence status/media/source/crab gates, same-evidence replay, conflicting replay, replacement and collision retry, and non-cacheable trace responses.
- Evidence Reviewer `Watch` decision path uses the existing Pass/Fail/NeedMoreEvidence mapping and audit flow. Operators have no status-setting route.
- Void/replace is limited to `Printed` or `Active` tags while the crab is `InStock`, and requires Operator Owner. Replacement after `Packed` or `Delivered` remains a TODO for the later exception workflow.
- Web/mobile screens and physical printer/camera integrations were not tested in this backend phase.

