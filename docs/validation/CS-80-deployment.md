# CS-80 — Production deployment preparation

The existing Azure App Service, Azure SQL and Vercel environment is reused. No new infrastructure, production migration, server restart, secret change or database reset was performed in this work session.

Implemented:

- Non-root .NET 10 API Dockerfile, explicit migrator target, private persistent key/storage paths, source revision metadata and secret/build exclusions.
- Optional Caddy HTTPS Compose template using an existing SQL service and a private API port. This is a template, not a newly deployed server.
- Develop-only OIDC workflow: build/test/publish, redacted config checks, HTTPS-only/Production/seed-off settings, stop old binary before migrations, deploy/start matching binary, readiness and revision/HTTPS/web smoke evidence. Failure after maintenance begins requires deliberate recovery.
- Public no-store `/api/health/version`, returning only assembly version/commit metadata. Remote DbMigrator reset is rejected and a missing remote database is not automatically created.
- Deployment/recovery instructions and safe private-key backup requirements in `docs/deploy.md`.

Validation completed locally:

- Release solution build; 2 health API tests and 3 smoke-script tests passed.
- Actual existing Azure/Vercel smoke: HTTPS liveness, database readiness, anonymous private-route 401 and production web/JS asset all passed on 2026-10-16. This checks the currently deployed binary; it does not claim new feature endpoints are deployed.
- Actionlint v1.7.12 passed both changed workflows (download SHA-256 verified). Remote-reset guard rejected an `example.invalid` connection before any database connection attempt.
- Local Docker engine is unavailable; CI builds both image targets and checks non-root runtime. Its result belongs in the PR checks.

The CS-88 dependency fixes inherited Pkcs advisories in API/migrator. Review CS-80's maintenance workflow before deploying V012. Team review/merge is still required; production OIDC deliberately trusts only develop. CS-92 records actual feature acceptance after that deploy.
