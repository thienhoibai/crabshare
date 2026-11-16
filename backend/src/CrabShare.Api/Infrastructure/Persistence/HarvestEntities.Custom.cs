using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public partial class Harvest
{
    [Column("name"), MaxLength(100)] public string? Name { get; set; }
    [Column("lifecycle_status"), MaxLength(20), Unicode(false)] public string? LifecycleStatus { get; set; }
    [Column("completed_at"), Precision(3)] public DateTimeOffset? CompletedAt { get; set; }
    [Column("completed_by")] public long? CompletedBy { get; set; }
    [Column("revision_no")] public int RevisionNo { get; set; } = 1;
}

[Table("harvest_start_request")]
public sealed class HarvestStartRequestLog
{
    [Key, Column("request_id")] public Guid RequestId { get; set; }
    [Column("harvest_id")] public long HarvestId { get; set; }
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("actor_id")] public long ActorId { get; set; }
    [Column("request_hash"), MaxLength(64), Unicode(false)] public string RequestHash { get; set; } = "";
    [Column("created_at"), Precision(3)] public DateTimeOffset CreatedAt { get; set; }
}

[Table("harvest_record")]
public sealed class HarvestRecord
{
    [Key, Column("slot_event_id"), DatabaseGenerated(DatabaseGeneratedOption.None)] public long SlotEventId { get; set; }
    [Column("harvest_id")] public long HarvestId { get; set; }
    [Column("batch_id")] public long BatchId { get; set; }
    [Column("crab_item_id")] public long CrabItemId { get; set; }
    [Column("tag_id")] public long TagId { get; set; }
    [Column("slot_code"), MaxLength(30), Unicode(false)] public string SlotCode { get; set; } = "";
    [Column("weight_g")] public short WeightG { get; set; }
    [Column("shell_condition"), MaxLength(20), Unicode(false)] public string ShellCondition { get; set; } = "";
    [Column("grade_code"), MaxLength(20), Unicode(false)] public string GradeCode { get; set; } = "";
    [Column("grade_name"), MaxLength(100)] public string GradeName { get; set; } = "";
    [Column("tag_code"), MaxLength(12), Unicode(false)] public string TagCode { get; set; } = "";
    [Column("tag_status"), MaxLength(20), Unicode(false)] public string TagStatus { get; set; } = "Printed";
    [Column("recorded_at"), Precision(3)] public DateTimeOffset RecordedAt { get; set; }
    [Column("harvested_count")] public int HarvestedCount { get; set; }
    [Column("total_weight_kg"), Precision(12, 3)] public decimal TotalWeightKg { get; set; }
}
