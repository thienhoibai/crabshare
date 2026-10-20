namespace CrabShare.Api.Infrastructure.Persistence.Entities;

// Source allocation is immutable on SlotEvent; destination is preserved here after a move.
public sealed class SlotEventDetail
{
    public long SlotEventId { get; set; }
    public long BatchId { get; set; }
    public long CrabItemId { get; set; }
    public long? DestinationSlotAllocationId { get; set; }
    public long ActorId { get; set; }
    public Guid RequestId { get; set; }
    public string RequestHash { get; set; } = "";
    public long? PolicyVersionId { get; set; }
    public int AliveCount { get; set; }
}
