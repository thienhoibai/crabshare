using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Tests;

/// <summary>Bộ kiểm tra chuỗi chạy trên dữ liệu trong bộ nhớ — không cần CSDL nên chạy được trên CI.</summary>
public class AuditChainVerifierTests
{
    private static List<AuditLog> Chain(int count)
    {
        var rows = new List<AuditLog>();
        string? prev = null;
        for (var i = 1; i <= count; i++)
        {
            var row = new AuditLog
            {
                AuditId = i, EntityType = "batch", EntityId = 100 + i, ActionType = "update",
                OldValue = $$"""{"step":{{i - 1}}}""", NewValue = $$"""{"step":{{i}}}""",
                ActorUserId = 1, OccurredAt = new DateTimeOffset(2026, 10, 13, 8, 0, 0, TimeSpan.Zero).AddMinutes(i),
                PrevHash = prev,
            };
            row.RowHash = AuditChain.Hash(row);
            prev = row.RowHash;
            rows.Add(row);
        }
        return rows;
    }

    [Fact]
    public void Chuoi_100_dong_hop_le()
    {
        var result = AuditChainVerifier.Verify(Chain(100));

        Assert.True(result.IsValid);
        Assert.Equal(100, result.CheckedRows);
    }

    [Fact]
    public void Sua_noi_dung_mot_dong_thi_bao_gay_dung_dong_do()
    {
        var rows = Chain(100);
        rows[56].NewValue = """{"step":999}""";   // dòng audit_id = 57

        var result = AuditChainVerifier.Verify(rows);

        Assert.False(result.IsValid);
        Assert.Equal(57, result.BrokenAuditId);
        Assert.Equal(56, result.CheckedRows);
    }

    [Fact]
    public void Xoa_mot_dong_thi_bao_gay_o_dong_ke_tiep()
    {
        var rows = Chain(100);
        rows.RemoveAt(29);   // xoá dòng audit_id = 30

        var result = AuditChainVerifier.Verify(rows);

        Assert.False(result.IsValid);
        Assert.Equal(31, result.BrokenAuditId);
    }

    [Fact]
    public void Kiem_tra_tu_giua_bang_dung_hash_cua_dong_lien_truoc()
    {
        var rows = Chain(10);

        Assert.True(AuditChainVerifier.Verify(rows.Skip(5), rows[4].RowHash).IsValid);
        Assert.False(AuditChainVerifier.Verify(rows.Skip(5)).IsValid);   // thiếu dòng liền trước
    }

    [Fact]
    public void Chap_nhan_dong_Accounts_cu_dang_PascalCase_nam_giua_chuoi()
    {
        var rows = Chain(3);
        var legacy = new AuditLog
        {
            AuditId = 4, EntityType = "Investor", EntityId = 5, ActionType = "VerifyIdentity",
            OldValue = """{"VerificationStatus":"Unverified"}""", NewValue = """{"VerificationStatus":"Verified"}""",
            ActorUserId = 5, OccurredAt = new DateTimeOffset(2026, 10, 12, 1, 2, 3, 456, TimeSpan.Zero), PrevHash = rows[2].RowHash,
        };
        var pascal = JsonSerializer.Serialize(new
        {
            legacy.EntityType, legacy.EntityId, legacy.ActionType, legacy.OldValue, legacy.NewValue, legacy.ActorUserId, legacy.OccurredAt,
        });
        legacy.RowHash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(legacy.PrevHash + pascal)));
        rows.Add(legacy);

        Assert.True(AuditChainVerifier.Verify(rows).IsValid);
    }
}
