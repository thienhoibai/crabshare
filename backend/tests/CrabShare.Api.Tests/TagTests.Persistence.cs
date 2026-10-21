using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public sealed class TagTestsPersistence(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    [Fact]
    public async Task Evidence_crab_item_reference_is_nullable_and_non_unique()
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<Infrastructure.Persistence.AppDbContext>();
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.CommandText = """
            SELECT c.is_nullable,
                   (SELECT COUNT(*) FROM sys.indexes i JOIN sys.index_columns ic ON i.object_id=ic.object_id AND i.index_id=ic.index_id JOIN sys.columns col ON col.object_id=ic.object_id AND col.column_id=ic.column_id WHERE i.object_id=OBJECT_ID('dbo.evidence') AND col.name='crab_item_id' AND i.is_unique=1),
                   (SELECT COUNT(*) FROM sys.foreign_key_columns fkc JOIN sys.columns col ON col.object_id=fkc.parent_object_id AND col.column_id=fkc.parent_column_id WHERE fkc.parent_object_id=OBJECT_ID('dbo.evidence') AND col.name='crab_item_id')
            FROM sys.columns c WHERE c.object_id=OBJECT_ID('dbo.evidence') AND c.name='crab_item_id';
            """;
        await db.Database.OpenConnectionAsync();
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync(), "evidence.crab_item_id should exist");
        Assert.True(reader.GetBoolean(0), "legacy evidence must remain unlinked and valid");
        Assert.Equal(0, reader.GetInt32(1));
        Assert.Equal(1, reader.GetInt32(2));
    }
}
