-- The application upgrades legacy rows with ASP.NET Data Protection before serving requests.
-- Deploy V011 and the matching API together; persist/backup the private key ring first.
ALTER TABLE dbo.payout_account DROP CONSTRAINT ux_payout_bank_account;
GO
ALTER TABLE dbo.payout_account ALTER COLUMN account_no VARCHAR(2048) NOT NULL;
GO
ALTER TABLE dbo.payout_account ADD account_no_digest VARCHAR(64) NULL;
GO
CREATE UNIQUE INDEX ux_payout_account_digest ON dbo.payout_account(account_no_digest)
WHERE account_no_digest IS NOT NULL;
GO
