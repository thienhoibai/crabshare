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
        model.Entity<DeviceMessage>().ToTable("device_message");
        model.Entity<DeviceImage>().ToTable("device_image");
        model.Entity<WaterReading>().ToTable("water_reading");
        model.Entity<DeviceCalibration>().ToTable("device_calibration");
        model.Entity<DeviceCommand>().ToTable("device_command");
        model.Entity<MeasurementSession>().ToTable("measurement_session");
    }
}
