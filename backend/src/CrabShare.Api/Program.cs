using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Endpoints;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure;
using CrabShare.Api.Infrastructure.Persistence;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// 1. Hạ tầng: CSDL, lưu file, các dịch vụ bên ngoài (thanh toán, ký số, eKYC, nhận diện cua)
builder.Services.AddInfrastructure(builder.Configuration);

// 2. Đăng nhập JWT và phân quyền theo vai trò
builder.Services.AddAppAuth(builder.Configuration);

// 3. Service của từng tính năng (Features/*) — tính năng mới thì đăng ký trong Common/Endpoints/FeatureRegistry.cs
builder.Services.AddFeatureServices();

// 4. Lỗi trả về theo chuẩn ProblemDetails; dữ liệu vào được kiểm tra bằng DataAnnotations
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddValidation();

// 5. Tài liệu API (OpenAPI) — xem tại /scalar khi chạy Development
builder.Services.AddOpenApi(o => o.AddDocumentTransformer<BearerSecuritySchemeTransformer>());

// 6. Cho phép web (Vite) và app Flutter chạy trên trình duyệt gọi API khi dev
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

app.MapFeatureEndpoints();

app.Run();

// Cho phép project test dùng WebApplicationFactory<Program>
public partial class Program;
