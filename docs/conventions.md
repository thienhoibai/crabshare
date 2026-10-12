# Quy ước code

Đọc 10 phút trước khi code. Mục tiêu: 4 người viết mà đọc như 1 người viết.

## 1. Chung

| Việc | Quy ước |
|---|---|
| Tên biến, hàm, file | Tiếng Anh. `BatchService`, `recordHarvestedCrab`, `daily_log_form_page.dart` |
| Comment, PR, tài liệu | Tiếng Việt được |
| Commit | `<type>(<scope>): <mô tả tiếng Anh>` — xem `git-workflow.md` |
| Chữ trên giao diện | Tiếng Việt (bản tiếng Anh làm sau nếu kịp) |
| **Tiền** | **Số nguyên đồng**: `long` (C#), `DECIMAL(18,0)` (SQL), `number` nguyên (TS), `int` (Dart). Không dùng `double`/`float` cho tiền. Hiển thị bằng `formatVnd()` |
| Thời gian | `DateTimeOffset` (C#), `DATETIMEOFFSET` (SQL). Hiển thị theo giờ Việt Nam |
| Lợi suất | **Không bao giờ hiển thị lợi suất / lãi kỳ vọng** (TL-05 §8, BR-49). Chỉ hiển thị số liệu thật: vốn, chi phí chuẩn, doanh thu thực thu, quyết toán |
| Mã định danh trên URL | Dùng mã nghiệp vụ khi có: `batch_code`, `tag_code`, `slot_code`. Còn lại dùng id số |
| Dữ liệu cá nhân | Không log mật khẩu, token, số giấy tờ. Không lưu ảnh giấy tờ eKYC |

## 2. API (backend)

- Đường dẫn: `/api/<danh-từ-số-nhiều>` chữ thường, gạch ngang: `/api/batches/{code}/production-logs`.
- Khu vực quản trị: `/api/admin/...`; nhập dữ liệu từ phần mềm trại: `/api/ingest/v1/...`; công khai: `/api/trace/{tagCode}`.
- JSON camelCase (mặc định của .NET).
- Mã trạng thái:

| Mã | Khi nào | Cách trả |
|---|---|---|
| 200 / 201 / 204 | Thành công | Trong controller: `Ok(...)`, `CreatedAtAction(...)`, `NoContent()` |
| 400 | Dữ liệu vào sai định dạng | Tự động nhờ `[ApiController]` + DataAnnotations trên DTO |
| 401 | Chưa đăng nhập | Tự động (`[Authorize]`) |
| 403 | Không có quyền trên lô / hộ nuôi này | `throw new ForbiddenException("batch.not_owner", "Lô này không thuộc hộ nuôi của bạn.")` |
| 404 | Không tìm thấy | `throw new NotFoundException("batch.not_found", "Không tìm thấy lô.")` |
| 409 | Trùng (email, mã...) | `throw new ConflictException("auth.email_taken", "...")` hoặc để CSDL báo unique → 409 `db.unique` |
| 422 | Vi phạm quy tắc nghiệp vụ | `throw new BusinessRuleException("batch.invalid_transition", "...")` |

Mọi exception đều nhận **(code, message)** theo đúng thứ tự đó.

- Mã lỗi `code` dạng `<module>.<lý_do>`: `funding.reservation_expired`, `order.out_of_stock`. Web/mobile dựa vào `code` để hiện câu báo lỗi phù hợp.
- Danh sách có phân trang dùng `PageQuery` + `ToPagedAsync()` (`Common/Paging`).

## 3. Thêm một tính năng — từng bước

### Backend
1. Tạo thư mục `Features/<Module>/` (đọc `README.md` trong thư mục đó: use case, bảng, endpoint dự kiến).
2. Copy cách viết của `Features/Auth/`: `<Module>Dtos.cs`, `<Module>Service.cs`, `<Tên thư mục>Controller.cs` (ví dụ `Features/Batches/BatchesController.cs`).
3. Bỏ comment 2 dòng của module trong `Common/FeatureRegistry.cs` (`using` + `AddScoped<...Service>()`). Controller tự được nhận, không cần đăng ký.
4. Chạy API (F5 trong Visual Studio) → trình duyệt mở `http://localhost:5233/scalar` → thử endpoint.
5. Viết test cho quy tắc nghiệp vụ quan trọng (`backend/tests/CrabShare.Api.Tests`).

Controller mẫu:

```csharp
[ApiController]
[Route("api/batches")]
public sealed class BatchesController(BatchService batches) : ControllerBase
{
    [Authorize(Policy = Policies.Operator)]
    [HttpPost]
    [EndpointSummary("UC07 — Tạo lô")]
    public async Task<ActionResult<BatchResponse>> Create(CreateBatchRequest req, CancellationToken ct)
    {
        var batch = await batches.CreateAsync(req, ct);
        return CreatedAtAction(nameof(Get), new { code = batch.BatchCode }, batch);
    }

    [HttpGet("{code}")]
    public async Task<ActionResult<BatchResponse>> Get(string code, CancellationToken ct)
        => Ok(await batches.GetAsync(code, ct));

    [HttpGet]
    public async Task<ActionResult<PagedResult<BatchResponse>>> List([FromQuery] PageQuery paging, CancellationToken ct)
        => Ok(await batches.ListAsync(paging, ct));
}
```

- Controller chỉ nhận/trả HTTP. Nghiệp vụ, kiểm tra quyền trên lô, ném `AppException` đều nằm trong service.
- Request DTO là `class` có `{ get; set; }` + DataAnnotations; response là `record`.
- Route ghi rõ bằng `[Route("api/...")]` (chữ thường, gạch ngang), không dùng `[controller]`.
- Tên action không thêm hậu tố `Async` (ASP.NET bỏ hậu tố này nên `CreatedAtAction(nameof(GetAsync))` sẽ không tìm thấy action).

### Cần đổi CSDL?
1. **Không sửa** file migration đã có (`V001`, `V002`...). Tạo file mới `database/migrations/V00X__mo_ta_ngan.sql`.
2. Chạy `dotnet run --project backend/tools/CrabShare.DbMigrator`.
3. Sinh lại entity: xem `backend/README.md` mục *Sinh lại entity*.
4. Báo cả nhóm trong nhóm chat: "đã thêm V00X, mọi người chạy migrator".

### Web
1. Gọi API bằng `http` (`shared/api/http.ts`) trong file `xxxApi.ts` cạnh trang, bọc bằng `useQuery` / `useMutation`.
2. Thay dữ liệu mẫu (mock) trong trang bằng dữ liệu từ hook.
3. Route mới thêm ở `app/router.tsx`, bọc `RequireRole` đúng vai trò.

### Mobile
1. Thêm hàm vào repository interface của tính năng (`features/<x>/data/*_repository.dart`).
2. Viết `Api<X>Repository` gọi `dioProvider`, rồi đổi provider sang bản API (một dòng).
3. Màn mới: thêm path ở `app/routes.dart`, route ở `app/router.dart`, thêm dòng vào `test/pages_smoke_test.dart`.
4. Import Material bằng `package:material_ui/material_ui.dart` (không dùng `package:flutter/material.dart`).

## 4. Kiểm thử tối thiểu trước khi mở PR

| Phần | Lệnh | Yêu cầu |
|---|---|---|
| Backend | `dotnet test backend/CrabShare.sln` | Xanh hết |
| Web | `npm run build` (trong `web/`) | Không lỗi TypeScript |
| Mobile | `flutter analyze` và `flutter test` (trong `mobile/`) | Không lỗi, test xanh |

CI trên GitHub chạy đúng 3 lệnh này cho mỗi PR.
