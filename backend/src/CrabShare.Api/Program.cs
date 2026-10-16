using System.Text.Json.Serialization;
using CrabShare.Api.Common;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Security;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// 1. Hạ tầng: CSDL, lưu file, các dịch vụ bên ngoài (thanh toán, ký số, eKYC, nhận diện cua)
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddAppSecurity(builder.Configuration, builder.Environment);

// 2. Đăng nhập JWT và phân quyền theo vai trò
builder.Services.AddAppAuth(builder.Configuration);

// 3. Controller (Features/<Module>/<Module>Controller.cs) — tự tìm, không cần đăng ký.
//    Enum nhận và trả dạng chữ ("Investor"); DTO sai DataAnnotations → [ApiController] tự trả 400.
builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter())); // để /scalar cũng hiện enum dạng chữ

// 4. Service của từng tính năng — tính năng mới thì đăng ký trong Common/FeatureRegistry.cs
builder.Services.AddFeatureServices();

// 5. Lỗi trả về theo chuẩn ProblemDetails
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

// 6. Tài liệu API (OpenAPI) — xem tại /scalar khi chạy Development
builder.Services.AddOpenApi(o => o.AddDocumentTransformer<BearerSecuritySchemeTransformer>());

// 7. Cho phép web (Vite khi dev, Vercel khi deploy) và app Flutter chạy trên trình duyệt gọi API.
//    Cors:Origins là địa chỉ cố định; Cors:OriginPatterns là mẫu có dấu * cho các bản Preview của Vercel.
var allowOrigin = CorsOrigins.Matcher(
    builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [],
    builder.Configuration.GetSection("Cors:OriginPatterns").Get<string[]>() ?? []);
builder.Services.AddCors(o => o.AddPolicy("frontends", p => p
    .SetIsOriginAllowed(allowOrigin)
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

app.UseExceptionHandler();
app.UseAppSecurity();
app.UseStatusCodePages();
app.UseCors("frontends");
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(o => o.WithTitle("CrabShare API"));
    if (builder.Configuration.GetValue<bool>("Security:UpgradeLegacyPayouts") || builder.Configuration.GetValue<bool>("Seed:Enabled"))
        await new PayoutProtectionUpgrade(app.Services.GetRequiredService<IServiceScopeFactory>()).StartAsync(CancellationToken.None);
    await DevDataSeeder.SeedAsync(app.Services);
}

app.MapControllers();

app.Run();

// Cho phép project test dùng WebApplicationFactory<Program>
public partial class Program;
