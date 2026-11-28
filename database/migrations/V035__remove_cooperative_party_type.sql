/* V035 - Bỏ loại đối tác Cooperative (hợp tác xã): chuyển hồ sơ cũ sang Company rồi siết CHECK. */
UPDATE dbo.party SET party_type = 'Company' WHERE party_type = 'Cooperative';
GO
ALTER TABLE dbo.party DROP CONSTRAINT ck_party_party_type;
GO
ALTER TABLE dbo.party ADD CONSTRAINT ck_party_party_type CHECK (party_type IN ('Individual', 'Household', 'Company'));
GO
