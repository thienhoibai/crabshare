using System.ComponentModel.DataAnnotations;
using CrabShare.Api.Features.Catalog;
using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Tests;

/// <summary>UC25 — lọc và sắp xếp ở cửa hàng, chạy trên danh sách trong bộ nhớ.</summary>
public class StoreQueryTests
{
    private static ProductListing Listing(long id, string status, string crabType = "FatteningMudCrab", string grade = "L1",
        string storage = "Fresh", decimal price = 400_000, decimal stock = 10, decimal reserved = 0, int publishedDay = 1,
        string batchCode = "L2701-01") => new()
    {
        ListingId = id,
        Status = status,
        StorageType = storage,
        CurrentPricePerKg = price,
        StockQtyKg = stock,
        ReservedQtyKg = reserved,
        PublishedAt = new DateTimeOffset(2026, 10, publishedDay, 0, 0, 0, TimeSpan.Zero),
        Batch = new Batch { CrabType = crabType, BatchCode = batchCode },
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
    public void Niem_yet_bi_quan_tri_an_khong_hien()
    {
        var hidden = Listing(2, "Published");
        hidden.HiddenAt = DateTimeOffset.UtcNow;
        var source = new[] { Listing(1, "Published"), hidden, Listing(3, "SoldOut") }.AsQueryable();

        var result = CatalogService.FilterStore(source, new StoreListingQuery());

        Assert.Equal([1, 3], Ids(result.OrderBy(l => l.ListingId)));
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
    public void Loc_theo_ma_lo_chi_tra_dung_lo_do()
    {
        var hidden = Listing(4, "Published", batchCode: "L2701-01");
        hidden.HiddenAt = DateTimeOffset.UtcNow;
        var source = new[]
        {
            Listing(1, "Published", batchCode: "L2701-01"),
            Listing(2, "Published", batchCode: "L2610-05"),
            Listing(3, "SoldOut", batchCode: "L2701-01"),
            hidden,
            Listing(5, "Draft", batchCode: "L2701-01"),
            Listing(6, "Published", batchCode: "L2701-011"),
        }.AsQueryable();

        var result = CatalogService.FilterStore(source, new StoreListingQuery { Batch = " L2701-01 " });

        Assert.Equal([1, 3], Ids(result.OrderBy(l => l.ListingId)));
        Assert.All(result, l => Assert.Equal("L2701-01", l.Batch.BatchCode));
    }

    [Fact]
    public void Loc_khoang_gia_tinh_ca_hai_dau()
    {
        var source = new[]
        {
            Listing(1, "Published", price: 299_999),
            Listing(2, "Published", price: 300_000),
            Listing(3, "Published", price: 400_000),
            Listing(4, "SoldOut", price: 500_000),
            Listing(5, "Published", price: 500_001),
        }.AsQueryable();

        Assert.Equal([2, 3, 4], Ids(CatalogService.FilterStore(source, new StoreListingQuery { MinPrice = 300_000, MaxPrice = 500_000 }).OrderBy(l => l.ListingId)));
        Assert.Equal([2, 3, 4, 5], Ids(CatalogService.FilterStore(source, new StoreListingQuery { MinPrice = 300_000 }).OrderBy(l => l.ListingId)));
        Assert.Equal([1, 2], Ids(CatalogService.FilterStore(source, new StoreListingQuery { MaxPrice = 300_000 }).OrderBy(l => l.ListingId)));
        Assert.Equal([3], Ids(CatalogService.FilterStore(source, new StoreListingQuery { MinPrice = 400_000, MaxPrice = 400_000 })));
    }

    [Fact]
    public void Gia_tu_lon_hon_gia_den_khong_hop_le()
    {
        static List<ValidationResult> Errors(StoreListingQuery q) => q.Validate(new ValidationContext(q)).ToList();

        Assert.Single(Errors(new StoreListingQuery { MinPrice = 500_000, MaxPrice = 300_000 }));
        Assert.Empty(Errors(new StoreListingQuery { MinPrice = 300_000, MaxPrice = 300_000 }));
        Assert.Empty(Errors(new StoreListingQuery { MinPrice = 500_000 }));
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

    [Fact]
    public void Dat_truoc_het_tran_xep_sau_niem_yet_con_hang()
    {
        var preorderEmpty = Listing(10, "Published", stock: 0, publishedDay: 5);
        preorderEmpty.BatchId = 100;
        preorderEmpty.Batch.Status = "InProduction";

        var harvestingInStock = Listing(11, "Published", stock: 8, reserved: 0, publishedDay: 2);
        harvestingInStock.BatchId = 101;
        harvestingInStock.Batch.Status = "Harvesting";

        var preorderAvailable = Listing(12, "Published", stock: 0, publishedDay: 1);
        preorderAvailable.BatchId = 102;
        preorderAvailable.Batch.Status = "InProduction";

        var caps = new[]
        {
            new VBatchCommitmentCap { BatchId = 100, RemainingKg = 0m },
            new VBatchCommitmentCap { BatchId = 102, RemainingKg = 5m },
        }.AsQueryable();

        var source = new[] { preorderEmpty, harvestingInStock, preorderAvailable }.AsQueryable();

        Assert.Equal([11, 12, 10], Ids(CatalogService.SortStore(source, StoreSort.Newest, caps)));
    }
}
