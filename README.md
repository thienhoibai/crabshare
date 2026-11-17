# CrabShare

Nền tảng B2B kết nối nhà cung cấp cua, cơ sở nuôi RAS, nhà đầu tư và người mua sỉ. CrabShare quản lý từng Lô từ góp vốn và nguồn hàng đến giám sát, kiểm phẩm GradeAI, giao hàng và quyết toán.

[Demo web](https://crabshare.vercel.app) · [IoT và mô hình đi dây](https://crabshare-twin.vercel.app/?view=di-day) · [CI](https://github.com/thienhoibai/crabshare/actions/workflows/ci.yml) · [Hướng dẫn triển khai](docs/deploy.md)

## Phạm vi sản phẩm

Trọng tâm là **lô P — hợp tác góp vốn**, với toàn bộ vòng đời nghiệp vụ, trạm cân và đo chất lượng cua, giám sát hộp nuôi và dòng tiền. **Lô T — CrabShare mua bán** và **lô A — kết nối đại lý** được bao phủ ở mức dữ liệu, hợp đồng và quyết toán.

Người dùng gồm Operator, nhà đầu tư, khách B2B, QC Inspector, người thẩm định bằng chứng và Admin. Khách B2B gồm nhà hàng, vựa, đại lý, tiểu thương và bếp trung tâm. Mỗi đối tác có thể giữ nhiều vai trò; quyền truy cập và xung đột lợi ích được kiểm soát theo Lô.

Phạm vi dưới đây tổng hợp BR v1.5, phiếu v1.7 và bản cam kết Review 2 ngày 09/11/2026. Bản cam kết đang ở trạng thái nháp chờ xác nhận; các tiêu chí nghiệm thu là mục tiêu cần kiểm chứng.

## Luồng hệ thống

Sáu workflow theo bản cam kết Review 2 bao phủ 14 tính năng bắt buộc. Gọi vốn và đặt trước diễn ra song song; giải ngân theo mốc tiếp tục trong quá trình sản xuất.

| Workflow | Kết quả cần đảm bảo |
|---|---|
| **WF-01 · Đối tác và Lô** | Hồ sơ Operator được duyệt trước khi tạo lô P. Admin thẩm định, khóa chi phí, chào giá, giá sàn và mốc giải ngân; mở tài khoản riêng của Lô. Hồ sơ bị từ chối có lý do; Lô được yêu cầu sửa có phiên bản chi phí mới |
| **WF-02 · Góp vốn và giải ngân** | Nhà đầu tư được xác minh; giữ chỗ, VietQR và ký hợp đồng; chỉ xác nhận khi đủ tiền và chữ ký. Mở Lô khi đạt điều kiện vốn và đặt trước, hoặc hoàn toàn bộ vốn/cọc. Giải ngân theo bằng chứng, mốc giữa vụ có biên bản QC; hiển thị đã góp, đã giải ngân, còn giữ |
| **WF-03 · Đặt trước B2B** | Đặt theo quy cách, số con hoặc kg và chia đợt giao; tổng đợt bằng số lượng đặt. Giữ chỗ/cọc trong hạn mức toàn Lô và từng quy cách; hết hạn nhả số lượng, chặn bên có xung đột lợi ích |
| **WF-04 · Nguồn hàng và giám sát** | Mua trong số con được cấp vốn, nhận hàng và QC đầu vào; định danh từng con gắn lô nguồn. Theo dõi hộp, nhật ký, ảnh/cảm biến và bằng chứng; ghi sự kiện tồn chỉ thêm, cảnh báo mất kết nối và yêu cầu chụp xác minh |
| **WF-05 · GradeAI và giao hàng** | Đo theo lượt, đề xuất size/hạng; QC được phân ngẫu nhiên duyệt, ca giữ lại cần QC thứ hai. Phân bổ cua đạt chuẩn vào đợt giao, cân hai lần, nghiệm thu, thu phần còn lại, hóa đơn, QR truy xuất và xử lý khiếu nại |
| **WF-06 · Quyết toán và thanh lý** | Hoàn tiền khách và đối soát trước tính kết quả; công bố, phản hồi, duyệt và chi trả. Bảng đã duyệt được khóa; mọi lệnh chi thành công mới đóng Lô. Thanh lý sớm qua biểu quyết theo vốn, dừng mốc chưa chi và hoàn vốn chưa giải ngân |

Thời gian giữ chỗ góp vốn và giữ đơn do Admin cấu hình. Tổng vốn xác nhận cộng phần đang giữ phải nằm trong vốn mục tiêu. Bản tin thanh toán và thiết bị gửi lặp chỉ được ghi nhận một lần. Chữ ký đi theo thứ tự lưu trên hợp đồng và có thể thực hiện song song với thanh toán.

### Quyết toán

```text
Phí nền tảng = tỷ lệ phí của Lô × doanh thu thực thu
Revenue Pool = doanh thu thực thu − phí nền tảng − chi phí trừ
Thù lao = tỷ lệ theo bậc tỷ lệ sống × Pool, khi Pool > 0
Khoản nhận nhà đầu tư = vốn góp + tỷ lệ vốn × (Pool − thù lao), khi Pool ≥ 0
```

Cơ sở chi phí được chốt trong hợp đồng. Pool âm phân bổ lỗ theo vốn, giới hạn bằng vốn góp mỗi nhà đầu tư; Operator chịu phần lỗ còn lại nếu có. Tiền lưu bằng số nguyên VND, tính bằng số thập phân cố định và phân bổ theo phần dư lớn nhất.

Tổng chi nhà đầu tư, thù lao, phí và Chi phí chuẩn chưa giải ngân phải bằng số dư tài khoản Lô tới đồng. Tiền đi qua trung gian thanh toán; CrabShare đối soát và phát lệnh chi.

## IoT và GradeAI

| Thành phần | Chức năng | Mức triển khai theo hồ sơ cung cấp |
|---|---|---|
| **Trạm GradeAI** | Raspberry Pi, load cell/HX711, camera, mốc ArUco, ánh sáng trắng/đỏ; cân và đo mai theo lượt gắn từng con | Có chương trình Python thử linh kiện và chu trình tối thiểu lưu ảnh/JSON; tiếp tục hoàn thiện chu trình đầy đủ và gửi API |
| **Camera chạy dàn** | Di chuyển theo cột/tầng, chụp hồng ngoại từng hộp theo lịch để giám sát cua | Mô hình FreeCAD v0.2 và kiểm tra hình học; hồ sơ ghi chưa in/lắp thử. Mục tiêu mẫu một dàn hoặc giả lập cùng API |
| **Cảm biến nước** | ESP32 thu nhiệt độ, pH và độ mặn cho giám sát và cảnh báo | Phạm vi làm thiết bị thật; nghiệm thu bằng kết quả đo và gửi dữ liệu |

GradeAI dùng khối lượng từ cân và chiều dài mai từ ảnh chuẩn hóa để tính **C = m / CL³**, với m tính bằng gram và CL bằng cm. Hồ sơ tham chiếu Huang và cộng sự (2026), Fishes 11:388 cho điểm mốc đo, và T/SCFA 0014-2024 bản sửa 08/2026 cho bộ quy tắc phân hạng nội bộ có phiên bản. AI đề xuất kết quả, QC duyệt hạng cuối. Độ tin cậy thấp chuyển Hold và đo đối chứng bằng thước kẹp.

Thiết bị thật và giả lập dùng cùng chuẩn ingestion API, có định danh bản tin, kiểm tra đăng ký thiết bị và xử lý gửi lại. Ảnh giám sát lưu dưới DeviceImage; bằng chứng nghiệp vụ có quy trình xác thực riêng. Ảnh cân/chụp của trạm gắn với MeasurementSession.

[Xem mô hình camera chạy dàn và sơ đồ đi dây](https://crabshare-twin.vercel.app/?view=di-day).

## Công nghệ và cấu trúc

| Thành phần | Công nghệ | Mã nguồn và hướng dẫn |
|---|---|---|
| API | ASP.NET Core .NET 10, EF Core, JWT | [backend](backend/README.md) |
| Quyết toán | Thư viện C# độc lập | [Settlement Engine](backend/src/CrabShare.SettlementEngine) |
| Web | React 19, TypeScript, Vite, Tailwind CSS | [web](web/README.md) |
| Mobile | Flutter, Riverpod, Dio | [mobile](mobile/README.md) |
| Dữ liệu | SQL Server, DbUp migrations | [database](database/README.md) |
| Triển khai | GitHub Actions, Vercel, Azure; cấu hình Docker | [Hướng dẫn triển khai](docs/deploy.md) |

Checkout dùng adapter giả lập cho thanh toán, ký số và eKYC. Hồ sơ phần cứng IoT được quản lý ngoài repository; kết quả kiểm tra hình học và chương trình thử tối thiểu là tiến độ hiện có, còn tích hợp thiết bị đầu cuối cần nghiệm thu.

## Chạy trên máy phát triển

Chuẩn bị .NET SDK 10, Node.js 22 và SQL Server. Các lệnh dưới dùng PowerShell từ thư mục gốc với LocalDB trên Windows. Hướng dẫn SQL Server khác và cấu hình chi tiết nằm trong [backend](backend/README.md) và [database](database/README.md).

```powershell
git clone https://github.com/thienhoibai/crabshare.git
Set-Location crabshare
dotnet tool restore --tool-manifest backend/dotnet-tools.json
dotnet run --project backend/tools/CrabShare.DbMigrator
dotnet run --project backend/src/CrabShare.Api --launch-profile http
```

Mở terminal mới để chạy web.

```powershell
Set-Location web
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Web chạy tại [localhost:5173](http://localhost:5173), API tại [localhost:5233](http://localhost:5233), tài liệu API tại [Scalar](http://localhost:5233/scalar) trong Development. Web đọc địa chỉ API từ VITE_API_URL.

Mobile dùng Flutter 3.47.7 theo CI. Từ thư mục mobile, chạy `flutter pub get` và `flutter run -d chrome --web-port 8080`. Cấu hình thiết bị thật và Android Emulator xem trong [hướng dẫn mobile](mobile/README.md).

## Kiểm thử

| Phạm vi | Lệnh |
|---|---|
| Backend, từ gốc repo | `dotnet build backend/CrabShare.sln -c Release` |
| Backend không cần CSDL | `dotnet test backend/CrabShare.sln -c Release --no-build --filter "Category!=Database"` |
| Web, trong web/ | `npm ci`, `npm run build`, `npm run test:kyc` |
| Mobile, trong mobile/ | `flutter pub get`, `flutter analyze`, `flutter test` |

Workflow [CI](.github/workflows/ci.yml) kiểm tra build/test backend, web, mobile và container. Mục tiêu nghiệm thu Review 2 còn bao gồm cân bằng tiền trên ít nhất 1.000 ca sinh, chống vượt tồn với 50 yêu cầu đồng thời, xử lý bản tin lặp và phân quyền theo Lô. Trạm đo cần đánh giá bằng cân chuẩn và bộ cua đối chứng; mục tiêu sai số chiều dài mai và tỷ lệ trùng mức C còn chờ giảng viên xác nhận.

## Tài liệu và đóng góp

Đọc [quy ước phát triển](docs/conventions.md), [quy trình Git](docs/git-workflow.md), [hướng dẫn triển khai](docs/deploy.md) và README của từng thành phần trước khi thay đổi. Pull request cần mô tả hành vi, phạm vi và kết quả kiểm tra phù hợp.

## Nhóm thực hiện

Đồ án **FA26SE229**, FPT University, 09–12/2026. Giảng viên hướng dẫn **Lâm Hữu Khánh Phương**.

| Thành viên | Phụ trách theo cam kết Review 2 |
|---|---|
| [Nguyễn Đạo Thiện](https://github.com/thienhoibai) · SE180297 · Trưởng nhóm | Góp vốn, hợp đồng, giải ngân và quyết toán |
| [Nguyễn Ngọc Viên](https://github.com/zienk) · SE182672 | Lô, nguồn hàng, sản xuất và ingestion IoT |
| [Tạ Hiểu Nhân](https://github.com/hieunhann) · SE180368 | Đặt trước, GradeAI, QC và giao hàng |
| [Võ Tuấn Khôi](https://github.com/rakkiu) · SE184567 | Tài khoản, bằng chứng, cảnh báo và yêu cầu phi chức năng |
