using System.Text.Json.Serialization;
using CrabShare.Api.Common;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure;
using CrabShare.Api.Infrastructure.Persistence;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// 1. Hạ tầng: CSDL, lưu file, các dịch vụ bên ngoài (thanh toán, ký số, eKYC, nhận diện cua)
builder.Services.AddInfrastructure(builder.Configuration);

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

// 7. Cho phép web (Vite) và app Flutter chạy trên trình duyệt gọi API khi dev
builder.Services.AddCors(o => o.AddPolicy("frontends", p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors("frontends");
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(o => o.WithTitle("CrabShare API"));
    await DevDataSeeder.SeedAsync(app.Services);
}

app.MapControllers();

app.Run();

// Cho phép project test dùng WebApplicationFactory<Program>
public partial class Program;
