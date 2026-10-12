# Web — React 19 + Vite + TypeScript

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
