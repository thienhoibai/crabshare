using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    private static void ConfigureOrderShipping(ModelBuilder model)
    {
        var order = model.Entity<SalesOrder>();
        order.Property(o => o.CarrierName).HasColumnName("carrier_name").HasMaxLength(150);
        order.Property(o => o.VehiclePlate).HasColumnName("vehicle_plate").HasMaxLength(20).IsUnicode(false);
        order.Property(o => o.DriverPhone).HasColumnName("driver_phone").HasMaxLength(15).IsUnicode(false);
        order.Property(o => o.ExpectedArrivalAt).HasColumnName("expected_arrival_at").HasPrecision(3);
        order.Property(o => o.ShippingNote).HasColumnName("shipping_note").HasMaxLength(300);
        order.Property(o => o.ReceivedAt).HasColumnName("received_at").HasPrecision(3);
    }
}
