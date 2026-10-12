# Kiến trúc CrabShare

Một **API duy nhất** (modular monolith), một **CSDL SQL Server**, hai giao diện: **web React** và **app Flutter**.
Mỗi tính năng là một **lát cắt dọc** (vertical slice) — cùng một người làm từ API tới màn hình.

## 1. Bối cảnh hệ thống

```mermaid
flowchart LR
    subgraph Users[Người dùng]
        INV[Nhà đầu tư<br/>tài chính / bao tiêu]
        OP[Hộ nuôi<br/>chủ + nhân viên]
        CUS[Khách hàng]
        ADM[Quản trị nền tảng<br/>+ Thẩm định bằng chứng]
    end

    subgraph CS[CrabShare]
        WEB[Web React]
        APP[App Flutter]
        API[API ASP.NET Core]
        DB[(SQL Server)]
        FS[(Kho file ảnh/hợp đồng)]
    end

    subgraph Ext[Hệ thống ngoài — sandbox / giả lập]
        EKYC[eKYC]
        SIGN[Ký số Viettel]
        PAY[Trung gian thanh toán<br/>VietQR]
        FARM[Phần mềm của trại<br/>qua Ingestion API]
        PRN[Máy in tem của trại]
    end

    INV --> WEB & APP
    OP --> WEB & APP
    CUS --> WEB
    ADM --> WEB
    WEB & APP -->|REST JSON + JWT| API
    API --> DB
    API --> FS
    API <-->|IEkycProvider| EKYC
    API <-->|IDigitalSigningService| SIGN
    API <-->|IPaymentGateway + webhook| PAY
    FARM -->|POST /api/ingest/v1/...| API
    APP -->|lệnh in| PRN
```

- Tiền **không đi qua CrabShare**: mỗi lô có tài khoản chuyên dùng ở trung gian thanh toán; CrabShare chỉ phát lệnh và đọc thông báo giao dịch (TL-02).
- Mọi hệ thống ngoài nằm sau một **interface** trong `Infrastructure/`. Bản dev dùng bản giả (`Fake*`), đổi sang bản thật chỉ sửa `DependencyInjection.cs`.

## 2. Các khối (container) và công nghệ

```mermaid
flowchart TB
    subgraph Client
        W["web/<br/>React 19 + Vite + TypeScript<br/>TanStack Query · Zustand · Tailwind"]
        M["mobile/<br/>Flutter 3 · Riverpod · go_router · Dio"]
    end
    subgraph Server["backend/"]
        A["CrabShare.Api<br/>.NET 10 Minimal API<br/>Features/&lt;Module&gt;/"]
        S["CrabShare.SettlementEngine<br/>thư viện thuần, không phụ thuộc DB"]
        J["Job nền (BackgroundService)<br/>hết hạn giữ chỗ · leo thang cảnh báo · yêu cầu chụp ngẫu nhiên"]
        A --> S
        A --- J
    end
    D[("database/<br/>SQL Server<br/>V001… migrations chạy bằng DbUp")]
    ML["ml/<br/>YOLO → ONNX"]
    W & M -->|HTTPS · JSON · Bearer JWT| A
    A -->|EF Core 10| D
    ML -.->|file .onnx| A
```

## 3. Cấu trúc backend — lát cắt dọc

```
backend/src/CrabShare.Api/
├── Program.cs                     ← chỉ ghép nối, không viết logic
├── Common/
│   ├── Auth/                      ← JWT, vai trò, ICurrentUser
│   ├── Errors/                    ← AppException → ProblemDetails (mã lỗi "code")
│   ├── Endpoints/FeatureRegistry.cs  ← NƠI DUY NHẤT đăng ký module
│   └── Paging/
├── Infrastructure/
│   ├── Persistence/               ← AppDbContext + Entities (sinh từ CSDL, KHÔNG sửa tay)
│   ├── Payments/ Signing/ Ekyc/ Detection/ Storage/   ← interface + bản giả
└── Features/
    ├── Auth/                      ← MẪU: Dtos + Service + Endpoints
    ├── Batches/  Funding/  Production/  Orders/  Settlement/ ...
```

Mỗi module gồm 3 file (thêm file khi cần, không tạo tầng thừa):

| File | Chứa gì |
|---|---|
| `<Module>Dtos.cs` | record request/response + DataAnnotations để validate |
| `<Module>Service.cs` | toàn bộ nghiệp vụ, dùng `AppDbContext` trực tiếp (không repository riêng) |
| `<Module>Endpoints.cs` | `Map<Module>Endpoints()` — route, phân quyền, gọi service |

```mermaid
sequenceDiagram
    autonumber
    participant App as Mobile / Web
    participant EP as XxxEndpoints
    participant SV as XxxService
    participant DB as SQL Server
    App->>EP: POST /api/batches/CS-2610-01/production-logs (JWT)
    EP->>EP: [Authorize] + validate DTO (400 nếu sai)
    EP->>SV: RecordLogAsync(dto)
    SV->>DB: kiểm tra lô thuộc hộ nuôi của user (403 nếu không)
    SV->>DB: INSERT production_log (+ sinh cảnh báo nếu ngoài ngưỡng)
    DB-->>SV: OK / lỗi ràng buộc
    SV-->>EP: kết quả
    EP-->>App: 201 + JSON  |  ProblemDetails {code, detail}
```

## 4. Cấu trúc web và mobile

```
web/src/                                mobile/lib/
├── app/        router, providers       ├── app/       router (theo vai trò), theme
├── shared/     api (axios), auth,      ├── core/      api (dio), auth (phiên), format
│               layout, ui kit          ├── shared/    widgets (gauge, thẻ, nav), models
└── features/   theo khu vực/vai trò    └── features/  investor/ operator/ trace/ ...
                                                        mỗi tính năng: data/ (repository) + màn hình
```

- Web gọi API qua `shared/api/http.ts` (tự gắn token, 401 → đăng xuất).
- Mobile gọi API qua `core/api/api_client.dart`; mỗi tính năng có **repository interface + bản Mock**. Khi API xong: viết bản `Api...Repository` và đổi **một dòng** provider.

## 5. Vòng đời lô (state machine)

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> PendingApproval: Hộ nuôi gửi duyệt (UC07)
    PendingApproval --> Rejected: Quản trị từ chối
    PendingApproval --> Funding: Duyệt + khoá chi phí chuẩn (UC08)
    Funding --> Cancelled: Hết hạn, chưa đủ vốn tối thiểu → hoàn tiền
    Funding --> Stocked: Đủ vốn, thả giống, gán hộp
    Stocked --> InProduction
    InProduction --> Harvesting: Khai báo thu hoạch (UC22)
    Harvesting --> Settlement: Bán xong / hết hạn tồn kho
    Settlement --> Closed: Duyệt quyết toán + chi trả (UC39)
    Rejected --> [*]
    Cancelled --> [*]
    Closed --> [*]
```

Chặn chuyển trạng thái sai ở **cả hai nơi**: service (trả 422 `batch.invalid_transition`) và trigger CSDL (lỗi ≥ 50000 → 422 `db.rule`).

## 6. Quyết toán (trọng tâm đề tài)

```mermaid
flowchart LR
    R[Doanh thu thực thu<br/>từ đơn đã hoàn tất] --> P
    C[Chi phí chuẩn<br/>đã khoá trước gọi vốn] --> P
    P{Revenue Pool = R − C}
    P -->|> 0| OPS[Thù lao người nuôi<br/>operator_share_pct]
    P -->|> 0| INV[Phần còn lại chia theo tỷ lệ vốn<br/>LargestRemainderAllocator]
    P -->|≤ 0| LOSS[Lỗ phân bổ theo vốn,<br/>tối đa bằng vốn đã góp]
```

- Tiền là **số nguyên đồng** (`long` ở C#, `DECIMAL(18,0)` ở SQL, `int` ở Dart/TS). Không dùng `double` cho tiền.
- `CrabShare.SettlementEngine` là thư viện thuần → kiểm thử bằng property-based (FsCheck) và mutation testing (Stryker) cho TSK-12.

## 7. Bảo mật và phân quyền

| Vai trò (claim `role`) | Vào được |
|---|---|
| `Investor` | `/nha-dau-tu/*` (web), app tab Nhà đầu tư |
| `Customer` | cửa hàng, giỏ hàng, đơn hàng |
| `OperatorMember` (+ claim `operator_id`) | `/operator/*` (web), app tab Hộ nuôi — chỉ dữ liệu của hộ nuôi mình |
| `PlatformAdmin` | `/admin/*` |
| `EvidenceReviewer` | hàng đợi thẩm định — **không** thẩm định lô mình đã góp vốn |

- Phân quyền theo lô làm trong service (`ICurrentUser.RequireOperatorId()` rồi so với `batch.operator_id`).
- Không lưu ảnh giấy tờ eKYC, chỉ lưu kết quả. Mật khẩu băm bằng `PasswordHasher`.
- **Không hiển thị lợi suất kỳ vọng** ở bất kỳ màn hình nào (TL-05 §8, BR-49).
