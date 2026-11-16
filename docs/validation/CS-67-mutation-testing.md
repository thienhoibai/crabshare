# CS-67 / VI-13 — Mutation testing SettlementEngine

Ngày đo: 24/10/2026 (Asia/Bangkok). Mã nguồn engine: commit `4c8ecfc`, không sửa production code trong task này. SDK .NET `10.0.401`, Stryker.NET `5.0.0`, Windows; concurrency 4, cấu hình mặc định về mutation level, coverage analysis và timeout. Chỉ mutate `CrabShare.SettlementEngine`.

## Kết quả thực đo

| Chỉ số | Baseline (18:00:32) | Sau bổ sung test (18:04:33) |
|---|---:|---:|
| Test case được phát hiện | 13 | 37 |
| Mutant được tạo | 123 | 123 |
| Killed | 64 | 83 |
| Timeout | 2 | 2 |
| Survived | 26 | 19 |
| NoCoverage | 12 | 0 |
| CompileError | 10 | 10 |
| Ignored tự động bởi Stryker | 9 | 9 |
| Mutation score | **63,46%** | **81,73%** |
| Thời gian | 65 giây | 61 giây |

Score = `(Killed + Timeout) / (Killed + Timeout + Survived + NoCoverage) × 100`, tức baseline `66/104`, cuối `85/104`: tăng **18,27 điểm phần trăm**. Không loại mutant sống sót khỏi score và không có ignore/exclude thủ công. 9 Ignored do Stryker báo `Removed by block already covered filter`; 10 CompileError không thực thi được, không tính là lỗi test. Đây là score thô, không phải score đã điều chỉnh theo phân loại tương đương.

- [HTML tương tác, có mã nguồn và từng mutant](CS-67/mutation-report.html) — bản Stryker sinh, có script và dữ liệu nhúng, mở trực tiếp bằng trình duyệt.
- [JSON kết quả cuối](CS-67/mutation-report.json).
- [JSON baseline](CS-67/baseline.json).

Các JSON/HTML được sao chép nguyên bản từ StrykerOutput; ID, dòng và đường dẫn tuyệt đối bên trong phản ánh máy đo. ID có thể thay đổi sau khi sửa engine hoặc nâng Stryker. Không dùng kết quả này để tuyên bố đã hoàn thành VI-12: checkout hiện tại mới có 6 property, còn bộ ≥10 property × 1.000 ca thuộc task đó.

## Những khoảng trống test đã xử lý

`MutationRegressionTests.cs` thêm 24 test case qua Fact/Theory, dùng expected value tính trực tiếp:

- Không có người nhận/nhà đầu tư; một weight/capital bằng 0 hoặc âm xen giữa vốn hợp lệ; trùng investor ID. Kiểm tra exception type và parameter để tránh việc một exception ngẫu nhiên phía sau che mất validation đã bị xóa.
- Từng tỷ lệ ngoài khoảng cho phép độc lập; chấp nhận đủ tổ hợp 0% và 100%, kiểm tra thù lao, thuế, phần chia, số nhận và investor ID.
- Phần lẻ bằng nhau ưu tiên vốn lớn, với total dương/âm/0 và thứ tự đầu vào đảo.
- Pool bằng 0; lỗ lớn hơn vốn của người lớn nhất nhưng nhỏ hơn tổng vốn; làm tròn khiến người vốn nhỏ chạm trần; lỗ đúng bằng hoặc vượt tổng vốn.
- Ca vốn 10/20 tỷ và lỗ 30/100 tỷ bảo vệ nhánh chặn lỗ: nếu đổi `>=` thành `>` hoặc bỏ nhánh trả về sớm, phép nhân tỷ lệ `long` phía sau có thể tràn. Hai mutant này không thể coi là tương đương chỉ vì các ca tiền nhỏ cho cùng kết quả.

Đối chiếu hai JSON: 19 mutant từ Survived/NoCoverage chuyển sang Killed: **3, 6, 8, 9, 25, 34, 37, 39, 40, 45, 47, 52, 54, 60, 61, 100, 102, 103, 119**. Ví dụ ID 25 bắt đảo ưu tiên vốn, 102 bắt `Sum` → `Max`, 119 bắt cộng sai lỗ còn lại. Bộ test tăng từ 13 lên 37; Stryker chạy lại xác nhận những lỗi cấy này không còn lọt qua.

## Toàn bộ 19 mutant còn sống

`A` = `LargestRemainderAllocator.cs`; `S` = `SettlementCalculator.cs`. Dòng tham chiếu mã nguồn trong JSON/HTML cuối. “Tương đương” dưới đây là phân tích qua public API trên miền tiền nguyên, vốn dương, không tràn phép tính trung gian; không phải chứng minh cho toàn miền `long`.

| ID | File:dòng | Thay đổi | Giải thích và quyết định |
|---|---|---|---|
| 4 | A:17 | Message → `""` | Chỉ đổi nội dung lỗi danh sách rỗng. Test giữ contract exception type/parameter; không khóa nguyên văn thông báo tiếng Việt. Giữ trong score. |
| 10 | A:18 | Message → `""` | Chỉ đổi nội dung lỗi weight không dương; cùng quyết định như ID 4. |
| 14 | A:20 | `total < 0` → `total <= 0` | Chỉ đổi dấu khi total = 0; mọi amount đều 0, nhân -1 vẫn 0. |
| 35 | S:17 | Message → `""` | Chỉ đổi nội dung lỗi không có nhà đầu tư; type/parameter vẫn được kiểm tra. |
| 41 | S:18 | Message → `""` | Chỉ đổi nội dung lỗi vốn không dương. |
| 46 | S:20 | Message → `""` | Chỉ đổi nội dung lỗi investor ID trùng. |
| 62 | S:22 | Message → `""` | Chỉ đổi nội dung lỗi tỷ lệ ngoài 0–100%. |
| 67 | S:25 | `pool > 0` → `pool >= 0` | Pool 0 tính thù lao bằng floor(0 × tỷ lệ) = 0, như nhánh gốc. |
| 70 | S:26 | Luôn dùng `pool - remuneration` | Pool không dương đã có remuneration = 0; distributable không đổi. |
| 73 | S:26 | `pool > 0` → `pool >= 0` | Khi pool = 0, cả hai nhánh trả 0. |
| 78 | S:29 | `distributable >= 0` → `distributable > 0` | Chỉ đổi đường đi khi chia 0: allocator trả toàn 0 hoặc AllocateLoss(0) trả toàn 0; cùng các dòng đầu ra. |
| 81 | S:32 | Luôn tính `-distributable + Sum(profit)` | Khi distributable không âm, allocator bảo toàn tổng nên biểu thức bằng 0, như nhánh gốc. |
| 84 | S:32 | `distributable < 0` → `distributable <= 0` | Khi distributable = 0, Sum(profit) = 0; uncovered vẫn 0. |
| 92 | S:37 | `share > 0` → `share >= 0` | Share 0 thì thuế floor(0 × tỷ lệ) = 0. |
| 109 | S:58 | `active.Count > 0` → `active.Count >= 0` | Sau guard loss ≥ tổng vốn, loss còn lại nhỏ hơn tổng vốn. Chia theo chính vốn dương không tạo phần vượt trần, nên remaining về 0 ngay vòng đầu; không có đường public hợp lệ tới trạng thái remaining > 0 và active rỗng. |
| 113 | S:65 | `Weight - result[key]` → `Weight + result[key]` | result ban đầu toàn 0. Với loss nhỏ hơn tổng vốn, vòng phân bổ đầu đã kết thúc công việc; phép cộng/trừ đọc cùng 0. |
| 115 | S:66 | `s.Amount >= room` → `s.Amount > room` | Khi bằng room, nhánh else cũng cộng đúng room vào result. remaining vẫn 0; khác biệt active không được dùng tiếp. |
| 118 | S:69 | `remaining += ...` → `remaining -= ...` | Với loss dưới tổng vốn và phân bổ theo chính vốn, s.Amount ≤ room. Nhánh này chỉ có thể chạy ở điểm bằng nhau; s.Amount - room = 0. |
| 122 | S:74 | Xóa `stillActive.Add(c)` | Chỉ thay danh sách cho vòng tiếp theo, nhưng phân bổ hợp lệ đã có remaining = 0 sau vòng đầu. |

Lý do nhóm vòng lặp: với tổng vốn C, vốn c nguyên dương và `0 < loss < C`, phần chính xác `loss × c / C < c`; largest remainder cấp floor hoặc ceil nên không vượt c. Guard đã xử lý `loss >= C`. Vì vậy không có phần vượt dương cần phân bổ vòng hai trong miền không tràn. Không thêm test gọi private/internal bằng reflection chỉ để ép trạng thái public API không tạo ra.

## Timeout và giới hạn

- **104, S:58** (`&&` → `||`) và **107, S:58** (`remaining > 0` → `remaining >= 0`) đều timeout trong cả baseline và lượt cuối. Khi remaining về 0 nhưng active còn người, điều kiện mutant vẫn đúng và vòng lặp không kết thúc. Stryker tính chúng là detected; bảng tách riêng, không gộp thành assertion-killed.
- 6 string mutant vẫn sống vì wording không thuộc contract được test. 13 mutant còn lại được phân tích ở trên; giữ nguyên production code và mẫu số, không đổi mã chỉ để lấy 100%.
- Phân loại tương đương cho nhánh tính toán dựa trên miền không tràn. Engine hiện có phép nhân `abs * w.Weight` bằng `long` trước khi chia decimal; task này bảo vệ nhánh chặn lỗ lớn nhưng chưa xác minh toàn miền `long` của allocator. Kiểm định số lớn/BigInteger thuộc phần model-based của VI-12, không suy ra từ mutation score này.
- FsCheck vẫn dùng thiết lập hiện có; số mutant/score có thể đổi khi bộ VI-12 được bổ sung. Nên chạy lại và cập nhật bằng chứng khi engine hoặc bộ test thay đổi.

## Chạy lại và kiểm chứng

Xem [backend/README.md](../../backend/README.md#mutation-testing--vi-13--cs-67) để restore và chạy mutation từ test directory. Tài liệu cấu hình/reporters: [Stryker.NET configuration](https://stryker-mutator.io/docs/stryker-net/configuration/), [reporters](https://stryker-mutator.io/docs/stryker-net/reporters/).

```powershell
# Từ gốc repository, chạy suite backend không cần CSDL như CI:
dotnet test backend/CrabShare.sln -c Release --filter "Category!=Database"
```

Không thay workflow CI vì ticket không yêu cầu mutation gate. Kết quả mutation được tạo bằng lệnh trong README, không phải số ước lượng hoặc kết quả chạy CI từ xa.

Kiểm chứng cuối: lệnh backend suite trên pass **389 test** (37 engine + 352 API), không test nào fail/skip trong tập đã lọc. `dotnet tool restore` từ test directory pass; `git diff --check` pass. Test cần CSDL nằm ngoài lượt kiểm chứng này.
