# Web — React 19 + Vite + TypeScript

KH-03: nhà đầu tư đăng ký tài khoản nhận tiền tại Hồ sơ & eKYC; chủ hộ nuôi tại
`/operator/payout-account`; khách hàng mở Sổ địa chỉ từ Cửa hàng (`/tai-khoan/dia-chi`).
Form dùng API thật và style rd/OperatorLayout hiện có. `npm run test:kyc` chạy cả
test eKYC và tài khoản/địa chỉ. Test trình duyệt dùng API mock; backend test LocalDB
kiểm tra lưu dữ liệu, quyền và cập nhật đồng thời.

Giao diện lấy từ bản demo `cs-ui-demo` (đã bỏ phần chọn phiên bản):
**Cửa hàng = bản 1 (nền sáng)**, **Nhà đầu tư = bản 2**, **trang chủ 3D giữ nguyên** (sẽ chỉnh sau).

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
| `npm run test:kyc` | test eKYC bằng Chrome; CI dùng Chromium của Playwright |

Khi chạy dev, trang Đăng nhập có nút **đăng nhập nhanh** bằng tài khoản demo (`features/auth/demoAccounts.ts`).

## Cấu trúc

```
src/
├── main.tsx
├── app/
│   ├── router.tsx          ← MỌI route ở đây, nhóm theo vai trò (RequireRole)
│   ├── providers.tsx       ← TanStack Query
│   └── index.css
├── shared/
│   ├── api/http.ts         ← axios: gắn token, 401 → đăng xuất, errorMessage()
│   ├── auth/               ← authStore (zustand), RequireRole, homePathFor
│   ├── lib/format.ts       ← formatVnd, formatDate, formatDateTime
│   ├── layout/SiteChrome.tsx
│   └── ui/kit/             ← bộ khối giao diện dùng chung + mock-data (sẽ bỏ dần)
└── features/
    ├── landing/            ← trang chủ 3D
    ├── auth/               ← đăng nhập, đăng ký (đã gọi API thật)
    ├── store/              ← cửa hàng (bản 1)
    ├── orders/             ← giỏ hàng → thanh toán → theo dõi → lịch sử → huỷ/trả → đánh giá
    ├── investor/           ← cổng nhà đầu tư (bản 2)
    ├── operator/           ← khu vực hộ nuôi
    ├── admin/              ← khu vực quản trị
    └── trace/              ← trang truy xuất /truy-xuat/:tagCode (URL in trong QR trên tem)
```

## Route theo vai trò

| Vai trò | Đường dẫn | File |
|---|---|---|
| Ai cũng vào | `/`, `/dang-nhap`, `/dang-ky`, `/cua-hang`, `/san-pham`, `/truy-xuat/:tagCode` | `landing/`, `auth/`, `store/`, `orders/`, `trace/` |
| Customer, Investor | `/gio-hang`, `/thanh-toan`, `/xac-nhan-don-hang`, `/theo-doi-don-hang`, `/lich-su-don-hang`, `/huy-tra-hang`, `/danh-gia-don-hang` | `orders/CommercePage.tsx` |
| Investor | `/nha-dau-tu/*` | `investor/InvestorPortal.tsx` |
| OperatorMember | `/operator`, `/operator/kyc`, `/operator/create-batch`, `/operator/contract`, `/operator/harvest`, `/operator/settlement`, `/operator/map`, `/operator/log`, `/operator/batch`, `/operator/batch/detail`, `/operator/alerts`, `/operator/listings` | `operator/*.tsx` |
| PlatformAdmin, EvidenceReviewer | `/admin`, `/admin/users`, `/admin/batches`, `/admin/storefront`, `/admin/finance`, `/admin/alerts`, `/admin/disputes`, `/admin/settings` (+ trang chi tiết) | `admin/*.tsx` |

> `/operator/map` (sơ đồ trại) sẽ được thay bằng trang **Hộp nuôi** (đánh số hộp) — task của Viên.

## Xác minh danh tính (CS-27)

Nhà đầu tư mở **Hồ sơ & eKYC** tại `/nha-dau-tu/ho-so`, chọn/chụp CCCD mặt trước,
mặt sau và ảnh khuôn mặt, đồng ý điều khoản rồi gửi xác minh. Mỗi ảnh JPEG/PNG/WebP
tối đa 5 MB. GET `/api/me/kyc` và POST `/api/kyc/ekyc` dùng HTTP client JWT chung;
cache trạng thái theo userId. Kết quả và banner ở Tổng quan cập nhật từ API.
Ảnh xem trước dùng URL cục bộ được thu hồi khi thay ảnh/đóng form, không đưa vào
localStorage. Hộ nuôi không có vai Investor nhận hướng dẫn hồ sơ pháp lý riêng,
không hiện kết quả eKYC mẫu hoặc gọi API Investor.

Đăng ký Investor mới để thử gửi; các tài khoản demo đã Verified. Backend hiện dùng
provider giả lập. Các test Playwright trong `tests/kyc.spec.ts` dùng ảnh mẫu và API
mock để kiểm tra consent, multipart, lỗi 400 và đổi tài khoản. Chạy local cần Chrome;
CI cài Chromium bằng `npx playwright install --with-deps chromium`.

## Gọi API — mẫu

```ts
// features/batches/batchesApi.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '../../shared/api/http'

export type BatchSummary = { code: string; title: string; status: string; targetCapital: number; raisedCapital: number }

export function useFundingBatches() {
  return useQuery({
    queryKey: ['batches', 'funding'],
    queryFn: async () => (await http.get<BatchSummary[]>('/api/batches', { params: { status: 'Funding' } })).data,
  })
}

export function useSubmitBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => http.post(`/api/batches/${code}/submit`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batches'] }),
  })
}
```

Trong trang: `const { data, isLoading, error } = useFundingBatches()`; báo lỗi bằng `errorMessage(error)`.

## Quy tắc giao diện
- Tiền hiển thị bằng `formatVnd()`; **không** hiển thị lợi suất kỳ vọng.
- Thay dần dữ liệu trong `shared/ui/kit/mock-data.ts` bằng dữ liệu API; trang nào xong thì xoá phần mock tương ứng.
- Giữ phong cách sẵn có của từng khu vực (CSS trong `store.css`, `investor.css`, `operator.css`).

## VI-02 — Duyệt hộ nuôi và nhân viên

- Admin: `/admin/users?tab=operators`, chỉ PlatformAdmin thấy tab Hộ nuôi; mặc định Chờ duyệt. Lọc Đã duyệt để đình chỉ. Các form xác nhận gọi API thật, nhận sức chứa hoặc lý do và cập nhật danh sách sau thành công. Tab Người dùng & eKYC vẫn là màn hình mẫu trước đây.
- Operator: `/operator/members`, có trong sidebar và menu mobile. Owner thêm Staff bằng email tài khoản có sẵn và xóa Staff có xác nhận; Staff chỉ xem. Thành viên mới cần đăng nhập lại để cập nhật quyền giao diện.
- Hook API ở `features/admin/adminOperatorsApi.ts` và `features/operator/operatorsApi.ts`; hộp thoại dùng `shared/ui/ActionDialog.tsx`. Không thêm dependency.
- Chạy `npm run lint` và `npm run build`; API ở `http://localhost:5233`, web dev nên mở `http://localhost:5173` theo cấu hình CORS mặc định.
