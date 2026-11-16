using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Tests;

public class AuditChainTests
{
    private static AuditLog Row() => new() { EntityType = "investor", EntityId = 42, ActionType = "verifyIdentity",
        OldValue = null, NewValue = "changed", ActorUserId = 7, OccurredAt = new DateTimeOffset(2026, 10, 12, 8, 0, 0, TimeSpan.Zero), PrevHash = new string('a', 64) };

    [Fact]
    public void Hash_matches_a_fixed_CS25_camelCase_UTF8_vector_and_is_lowercase()
    {
        var row = Row();
        var hash = AuditChain.Hash(row);
        Assert.Equal("623f46651f4795a0d241919159c19cd14a770bb440245b5727a09daf3b8f9a4c", hash);
        Assert.Matches("^[0-9a-f]{64}$", hash);
        row.RowHash = hash;
        Assert.True(AuditChain.VerifyHash(row));
        row.RowHash = hash.ToUpperInvariant(); Assert.False(AuditChain.VerifyHash(row));
        row.RowHash = hash; row.NewValue = "tampered"; Assert.False(AuditChain.VerifyHash(row));
    }

    [Fact]
    public void Existing_PascalCase_hash_is_verified_without_rewriting_it()
    {
        var row = Row();
        var content = JsonSerializer.Serialize(new { row.EntityType, row.EntityId, row.ActionType, row.OldValue, row.NewValue, row.ActorUserId, row.OccurredAt });
        row.RowHash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(row.PrevHash + content)));
        var original = row.RowHash;
        Assert.NotEqual(AuditChain.Hash(row), original);
        Assert.True(AuditChain.VerifyHash(row)); Assert.Equal(original, row.RowHash);
    }

    [Fact]
    public void Snapshot_uses_camelCase_keys_and_preserves_business_value_case()
    {
        using var json = JsonDocument.Parse(AuditChain.Snapshot(new { VerificationStatus = "Verified", Reason = "Reviewed CCCD" }));
        Assert.Equal("Verified", json.RootElement.GetProperty("verificationStatus").GetString());
        Assert.Equal("Reviewed CCCD", json.RootElement.GetProperty("reason").GetString());
        Assert.False(json.RootElement.TryGetProperty("VerificationStatus", out _));
    }

    [Fact]
    public void Timestamp_matches_DATETIMEOFFSET3_and_normalizes_to_UTC()
    {
        var value = new DateTimeOffset(2026, 10, 12, 15, 0, 0, TimeSpan.FromHours(7)).AddTicks(123456);
        var normalized = AuditChain.Timestamp(value);
        Assert.Equal(TimeSpan.Zero, normalized.Offset);
        Assert.Equal(0, normalized.Ticks % TimeSpan.TicksPerMillisecond);
        Assert.Equal(value.ToUnixTimeMilliseconds(), normalized.ToUnixTimeMilliseconds());
    }
}
