using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Common.Paging;

/// <summary>Tham số phân trang chung: ?page=1&amp;pageSize=20</summary>
public sealed record PageQuery([property: Range(1, int.MaxValue)] int Page = 1, [property: Range(1, 100)] int PageSize = 20);

/// <summary>Kết quả phân trang trả về cho web và mobile.</summary>
public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);

public static class PagingExtensions
{
    public static async Task<PagedResult<T>> ToPagedAsync<T>(this IQueryable<T> query, int page, int pageSize, CancellationToken ct)
    {
        var total = await query.CountAsync(ct);
        var items = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return new PagedResult<T>(items, page, pageSize, total);
    }
}
