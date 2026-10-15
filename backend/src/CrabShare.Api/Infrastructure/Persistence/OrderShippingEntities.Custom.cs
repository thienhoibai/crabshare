// Handwritten additions for V010; database-first generated files remain untouched.
namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public partial class SalesOrder
{
    public string? CarrierName { get; set; }
    public string? VehiclePlate { get; set; }
    public string? DriverPhone { get; set; }
    public DateTimeOffset? ExpectedArrivalAt { get; set; }
    public string? ShippingNote { get; set; }
    public DateTimeOffset? ReceivedAt { get; set; }
}
