using System.Data;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public static class TransactionExtensions
{
    /// <summary>
    /// Chạy <paramref name="work"/> trong một transaction: lỗi ở đâu thì rollback tất cả, xong thì tự SaveChanges + commit.
    /// Kết nối SQL chập chờn thì EF chạy lại CẢ khối (EnableRetryOnFailure), nên đọc và sửa entity BÊN TRONG work:
    /// mỗi lần chạy lại bắt đầu với ChangeTracker trống.
    /// Nếu DbContext đã ở trong một transaction do bên gọi mở (seeder kịch bản demo gọi nhiều service trong một giao dịch, xem
    /// <see cref="DemoScenarioSeeder"/>), work chạy luôn trong transaction đó; bên gọi chịu trách nhiệm commit hoặc rollback.
    /// </summary>
    public static Task<T> InTransactionAsync<T>(this AppDbContext db, Func<Task<T>> work,
        CancellationToken ct = default, IsolationLevel isolation = IsolationLevel.ReadCommitted)
        => db.Database.CurrentTransaction is not null
            ? InOuterTransactionAsync(db, work, ct)
            : db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
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

    // Giống khối thường (bắt đầu với ChangeTracker trống, lưu khi xong) nhưng không mở hay commit transaction riêng.
    private static async Task<T> InOuterTransactionAsync<T>(AppDbContext db, Func<Task<T>> work, CancellationToken ct)
    {
        await db.SaveChangesAsync(ct);
        db.ChangeTracker.Clear();
        var result = await work();
        await db.SaveChangesAsync(ct);
        return result;
    }
}
