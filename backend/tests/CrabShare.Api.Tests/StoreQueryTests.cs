using CrabShare.Api.Features.Catalog;
using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Tests;

/// <summary>UC25 — lọc và sắp xếp ở cửa hàng, chạy trên danh sách trong bộ nhớ.</summary>
public class StoreQueryTests
{
    private static ProductListing Listing(long id, string status, string crabType = "FatteningMudCrab", string grade = "L1",
        string storage = "Fresh", decimal price = 400_000, decimal stock = 10, decimal reserved = 0, int publishedDay = 1) => new()
    {
        ListingId = id,
        Status = status,
        StorageType = storage,
        CurrentPricePerKg = price,
        StockQtyKg = stock,
        ReservedQtyKg = reserved,
        PublishedAt = new DateTimeOffset(2026, 10, publishedDay, 0, 0, 0, TimeSpan.Zero),
        Batch = new Batch { CrabType = crabType },
        Grade = new ProductGrade { GradeCode = grade },
    };

    private static long[] Ids(IEnumerable<ProductListing> list) => list.Select(l => l.ListingId).ToArray();

    [Fact]
    public void Chi_hien_niem_yet_dang_ban_va_het_hang()
    {
        var source = new[] { Listing(1, "Draft"), Listing(2, "Published"), Listing(3, "SoldOut"), Listing(4, "Closed") }.AsQueryable();

        var result = CatalogService.FilterStore(source, new StoreListingQuery());

        Assert.Equal([2, 3], Ids(result.OrderBy(l => l.ListingId)));
    }

    [Fact]
    public void Loc_theo_loai_cua_hang_va_bao_quan()
    {
        var source = new[]
        {
            Listing(1, "Published", crabType: "RoeCrab", grade: "L1", storage: "Fresh"),
            Listing(2, "Published", crabType: "RoeCrab", grade: "L2", storage: "Fresh"),
            Listing(3, "Published", crabType: "RoeCrab", grade: "L1", storage: "Frozen"),
            Listing(4, "Published", crabType: "FatteningMudCrab", grade: "L1", storage: "Fresh"),
        }.AsQueryable();

        var result = CatalogService.FilterStore(source, new StoreListingQuery { CrabType = "RoeCrab", Grade = "l1", Storage = StorageType.Fresh });

        Assert.Equal([1], Ids(result));
    }

    [Fact]
    public void Sap_xep_gia_tang_dan_va_het_hang_xuong_cuoi()
    {
        var source = new[]
        {
            Listing(1, "Published", price: 500_000),
            Listing(2, "SoldOut", price: 100_000),
            Listing(3, "Published", price: 300_000),
            Listing(4, "Published", price: 200_000, stock: 5, reserved: 5),
        }.AsQueryable();

        Assert.Equal([3, 1, 2, 4], Ids(CatalogService.SortStore(source, StoreSort.PriceAsc)));
        Assert.Equal([1, 3, 4, 2], Ids(CatalogService.SortStore(source, StoreSort.PriceDesc)));
    }

    [Fact]
    public void Mac_dinh_moi_dang_truoc()
    {
        var source = new[]
        {
            Listing(1, "Published", publishedDay: 1),
            Listing(2, "Published", publishedDay: 3),
            Listing(3, "Published", publishedDay: 2),
        }.AsQueryable();

        Assert.Equal([2, 3, 1], Ids(CatalogService.SortStore(source, StoreSort.Newest)));
    }
}
