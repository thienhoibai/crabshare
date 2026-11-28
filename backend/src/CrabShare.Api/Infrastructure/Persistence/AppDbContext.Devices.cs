using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<DeviceMessage> DeviceMessages => Set<DeviceMessage>();
    public DbSet<DeviceImage> DeviceImages => Set<DeviceImage>();
    public DbSet<WaterReading> WaterReadings => Set<WaterReading>();
    public DbSet<DeviceCalibration> DeviceCalibrations => Set<DeviceCalibration>();
    public DbSet<DeviceCommand> DeviceCommands => Set<DeviceCommand>();
    public DbSet<MeasurementSession> MeasurementSessions => Set<MeasurementSession>();

    private static void ConfigureDevices(ModelBuilder model)
    {
        model.Entity<Device>().ToTable("device");
        // device_record gộp 5 loại bản ghi của thiết bị (V036); EF tự thêm điều kiện record_type khi truy vấn từng loại.
        var record = model.Entity<DeviceRecord>();
        record.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        record.HasDiscriminator<string>("record_type")
            .HasValue<DeviceMessage>("Message").HasValue<DeviceImage>("Image").HasValue<WaterReading>("WaterReading")
            .HasValue<DeviceCalibration>("Calibration").HasValue<DeviceCommand>("Command");
    }
}
