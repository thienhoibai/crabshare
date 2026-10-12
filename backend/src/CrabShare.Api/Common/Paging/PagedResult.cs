using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Common.Paging;

/// <summary>
/// Tham số phân trang chung: ?page=1&amp;pageSize=20. Trong controller nhận bằng <c>[FromQuery] PageQuery paging</c>;
/// thiếu tham số thì dùng giá trị mặc định bên dưới.
/// </summary>
public sealed class PageQuery
{
    [Range(1, int.MaxValue)]
    public int Page { get; set; } = 1;

    [Range(1, 100)]
    public int PageSize { get; set; } = 20;
}

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

    public static Task<PagedResult<T>> ToPagedAsync<T>(this IQueryable<T> query, PageQuery paging, CancellationToken ct)
        => query.ToPagedAsync(paging.Page, paging.PageSize, ct);
}
