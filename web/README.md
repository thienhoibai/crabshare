# Web — React 19 + Vite + TypeScript (BR v1.5)

Web của CrabShare theo mô hình BR v1.5: Lô P / T / A, khách đặt trước theo quy cách và nhận theo đợt, nhà đầu tư góp vốn vào Lô P,
đo và phân hạng từng con tại trạm, Nhân viên kiểm phẩm duyệt hạng, quyết toán theo Lô. Không còn cửa hàng bán lẻ, giỏ hàng,
niêm yết hay tem từng con.

## Chạy

```bash
cd web
npm ci
cp .env.example .env.local     # sửa VITE_API_URL nếu API không ở cổng 5233
npm run dev                    # http://localhost:5173
```

| Lệnh | Việc |
|---|---|
| `npm run dev` | chạy dev, tự tải lại khi sửa |
| `npm run build` | kiểm tra TypeScript + build ra `dist/` (CI chạy lệnh này) |
| `npm run lint` | chỉ kiểm tra TypeScript |
| `npx playwright test` | chạy bộ kiểm thử giao diện trong `tests/` (CI chạy lệnh này qua `npm run test:kyc`); không cần backend |
| `node scripts/gen-api-types.mjs <url hoặc file openapi>` | sinh lại `src/shared/api/api.gen.ts` và `endpoints.gen.md` sau khi backend đổi API |

Khi chạy dev, trang Đăng nhập có nút đăng nhập nhanh bằng tài khoản mẫu (`features/auth/demoAccounts.ts`).

## Cấu trúc

```
src/
├── app/
│   ├── router.tsx            ← bản đồ trang; mỗi cổng ghép từ tệp routes của feature
│   ├── providers.tsx         ← TanStack Query
│   └── index.css
├── shared/
│   ├── api/
│   │   ├── http.ts           ← axios: gắn token, 401 → đăng xuất, errorMessage()
│   │   ├── hooks.ts          ← useGet, useSend, useBlobUrl, openFile
│   │   ├── api.gen.ts        ← kiểu dữ liệu tự sinh từ OpenAPI (không sửa tay)
│   │   └── endpoints.gen.md  ← bảng endpoint tự sinh để tra cứu
│   ├── auth/                 ← authStore (zustand), RequireRole, homePathFor
│   ├── layout/SiteShell.tsx  ← khung trang công khai
│   ├── lib/format.ts         ← formatVnd, formatDate, formatDateTime
│   ├── payments/             ← <VietQrBox>, usePaymentRequest, nút giả lập chuyển khoản (chỉ dev)
│   ├── contracts/, settlement/ ← xem hợp đồng, sao kê quyết toán dùng chung
│   └── ui/
│       ├── kit/              ← vỏ trang .rd, logo, biến màu, phông
│       └── console/          ← bộ thành phần op-*, khung ConsoleLayout, menu nav.ts, nhãn status.ts, README.md
└── features/
    ├── landing/              ← trang chủ
    ├── auth/                 ← đăng nhập, đăng ký
    ├── public/               ← /lo, /lo/:code, /chuan-phan-hang, /truy-xuat/:traceCode
    ├── customer/             ← cổng khách hàng /khach
    ├── investor/             ← cổng nhà đầu tư /nha-dau-tu
    ├── operator/             ← cổng người nuôi /operator (batch/ là trang làm việc một Lô, sales/ là bán và tiền)
    ├── qc/                   ← cổng Nhân viên kiểm phẩm /qc
    ├── admin/                ← cổng quản trị /admin (quality/, finance/)
    ├── accounts/             ← eKYC, tài khoản nhận tiền
    └── timeline/             ← nhật trình của Lô
```

## Cổng theo vai trò

| Vai trò | Đường dẫn gốc | Tệp route |
|---|---|---|
| Ai cũng vào | `/`, `/dang-nhap`, `/dang-ky`, `/lo`, `/lo/:code`, `/chuan-phan-hang`, `/truy-xuat/:traceCode` | `features/public/routes.tsx` |
| Đã đăng nhập, chưa thuộc hộ nuôi | `/dang-ky-ho-nuoi` | `app/router.tsx` |
| Customer | `/khach/…` | `features/customer/routes.tsx` |
| Investor | `/nha-dau-tu/…` | `features/investor/routes.tsx` |
| OperatorMember | `/operator/…`, trang làm việc một Lô `/operator/batches/:code/:tab` | `features/operator/routesA.tsx`, `routesB.tsx`, `batch/tabsA.tsx`, `batch/tabsB.tsx` |
| QcInspector | `/qc/…` | `features/qc/routes.tsx` |
| PlatformAdmin, EvidenceReviewer | `/admin/…` | `features/admin/routesA.tsx`, `routesB.tsx` |

Thêm trang mới: tạo component trong feature, thêm một dòng vào tệp route của cổng, thêm một mục trong
`shared/ui/console/nav.ts` nếu trang cần có trên menu. Trang trong một cổng chỉ trả về nội dung; khung do `ConsoleLayout` lo.

## Quy tắc giao diện

Đọc `src/shared/ui/console/README.md` trước khi viết trang. Tóm tắt:

- Một ngôn ngữ thiết kế cho mọi trang: bộ kit `.rd` và các thành phần `op-*`. Không tự chế màu, không thêm phông.
- Gọn và dễ dùng: một trang một việc, tối đa 3–4 con số chính, một nút chính, giải thích nằm sau nút (i) hoặc khối "Xem thêm",
  không ghi số quy tắc (BR-xxx) trên màn hình.
- Tiền là số nguyên đồng, hiện bằng `formatVnd()` hoặc `<Money>`. Không hiển thị lợi suất, lợi nhuận kỳ vọng hay bất kỳ con số dự phóng nào.
- Dữ liệu lấy bằng `useGet` / `useSend` với kiểu từ `api.gen.ts`. Không dựng dữ liệu giả trong trang.
- QR gắn theo đơn và theo Lô. Không có tem hay QR cho từng con cua.

## Kiểm thử

- `npm run lint` và `npm run build` phải sạch.
- `npx playwright test` phải qua hết. Bộ spec trong `tests/` kiểm thử giao diện BR v1.5 mà không cần backend: mọi lời gọi `/api/**`
  được giả lập, máy chủ dev tự bật ở cổng 5175 (đổi bằng biến `PW_PORT`). Trên máy của nhóm bộ spec chạy bằng Chrome đã cài; trên CI
  chạy bằng Chromium của Playwright.

| Tệp | Kiểm thử gì |
|---|---|
| `tests/support/app.ts` | `test` có fixture `api` (giả lập và ghi lại lời gọi API), `signIn(page, vai trò)`, các hàm tiện ích |
| `tests/support/<cổng>.ts` | dữ liệu giả lập có kiểu từ `api.gen.ts`, hàm `mock<Cổng>(api)` và danh sách trang `<CỔNG>_PAGES` |
| `auth`, `session-security` | đăng nhập, chuyển hướng theo vai trò, chặn trang theo vai trò, phiên hết hạn |
| `public-batches`, `order-trace` | `/lo`, `/lo/:code`, `/chuan-phan-hang`, `/truy-xuat/:traceCode` |
| `customer-*` | đặt trước tới bước QR đặt cọc, chi tiết đơn và nghiệm thu, giao hàng, địa điểm nhận hàng |
| `investor-*`, `kyc`, `notifications`, `timeline`, `payment-profiles` | tổng quan, góp vốn, danh mục, hợp đồng, quyết toán, xác minh, thông báo, nhật trình |
| `operator-*`, `batches`, `boxes`, `production-logs`, `evidence-explanation`, `dashboard` | trang làm việc một Lô, nhật ký chăm sóc, lượt đo, chuyến giao, hộp nuôi, bằng chứng |
| `qc-*` | việc được giao, kiểm đầu vào, duyệt phân hạng, thăm trại, chuẩn phân hạng |
| `admin-*`, `batch-review`, `evidence-review`, `alerts`, `audit-log` | duyệt Lô, giải ngân theo mốc, gọi vốn, quyết toán, người dùng, cảnh báo, nhật ký kiểm toán |
| `no-return-promises` | mở lại mọi trang trong các danh sách `*_PAGES` và soát chữ: không có "ROI", "lợi suất", "lợi nhuận kỳ vọng", không có số quy tắc |

Viết spec mới: nhập `test`, `expect`, `signIn` từ `./support/app`, gọi `mock<Cổng>(api)` rồi ghi đè endpoint cần đổi bằng
`api.get/post/put/delete(...)` (đăng ký sau thắng đăng ký trước). Lời gọi API chưa giả lập làm test hỏng, nên dữ liệu giả lập luôn khớp
với những gì trang thật sự gọi. Kiểm tra bằng nhãn tiếng Việt trên màn hình và bằng `api.sent(method, path)` (method, đường dẫn, body).
Thêm trang mới vào `<CỔNG>_PAGES` để trang đó cũng được soát chữ. Kiểm tra kiểu của spec: `npx tsc -p tests/tsconfig.json --noEmit`.

Ngày trong dữ liệu giả lập tính bằng `dateFromNow` / `daysFromNow` (giờ Việt Nam), không viết cứng. Trình duyệt của bộ spec luôn ở giờ
Việt Nam; `PW_SHIFT_HOURS=12 npx playwright test` chạy cả bộ với đồng hồ lệch 12 giờ để kiểm tra spec không phụ thuộc giờ trong ngày.
