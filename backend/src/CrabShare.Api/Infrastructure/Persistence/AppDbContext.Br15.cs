using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

/// <summary>Điểm gom cấu hình các bảng thêm theo Business Rule v1.5 (V018 trở đi). Mỗi nhóm một file AppDbContext.&lt;Nhóm&gt;.cs.</summary>
public partial class AppDbContext
{
    private static void ConfigureBr15(ModelBuilder model)
    {
        ConfigureParties(model);
        ConfigureBatchTerms(model);
        ConfigureSales(model);
        ConfigureSourcing(model);
        ConfigureDevices(model);
        ConfigureGrading(model);
        ConfigureDelivery(model);
        ConfigureSettlementV15(model);
    }
}
