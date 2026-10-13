using System.Data;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public static class TransactionExtensions
{
    /// <summary>
    /// Chạy <paramref name="work"/> trong một transaction: lỗi ở đâu thì rollback tất cả, xong thì tự SaveChanges + commit.
    /// Kết nối SQL chập chờn thì EF chạy lại CẢ khối (EnableRetryOnFailure), nên đọc và sửa entity BÊN TRONG work:
    /// mỗi lần chạy lại bắt đầu với ChangeTracker trống.
    /// </summary>
    public static Task<T> InTransactionAsync<T>(this AppDbContext db, Func<Task<T>> work,
        CancellationToken ct = default, IsolationLevel isolation = IsolationLevel.ReadCommitted)
        => db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(isolation, ct);
            var result = await work();
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return result;
        });

    /// <summary>Bản không trả về giá trị.</summary>
    public static Task InTransactionAsync(this AppDbContext db, Func<Task> work,
        CancellationToken ct = default, IsolationLevel isolation = IsolationLevel.ReadCommitted)
        => db.InTransactionAsync(async () =>
        {
            await work();
            return true;
        }, ct, isolation);
}
