# Bộ giao diện khu điều hành (BR v1.5)

Mọi trang của web dùng chung một ngôn ngữ thiết kế: bộ kit `.rd` (`shared/ui/kit`) và các thành phần `op-*` ở thư mục này.
Không dùng lớp Tailwind màu slate/red/gray của bản cũ, không tự chế màu, không thêm phông chữ.

## Khung trang

| Loại trang | Khung | Trang trả về gì |
|---|---|---|
| Trang trong một cổng (`/operator`, `/qc`, `/admin`, `/nha-dau-tu`, `/khach`) | `ConsoleLayout` gắn sẵn ở `app/router.tsx` | Chỉ nội dung: `<><OpHeading …/> … </>` |
| Trang công khai (`/lo`, `/chuan-phan-hang`, …) | `<SiteShell>` từ `shared/layout/SiteShell` | Tự bọc `<SiteShell>` |

Menu của từng cổng ở `nav.ts`. Mục đang chọn tự tính theo đường dẫn. Liên kết nội bộ viết `<a href="/...">` bình thường,
bộ định tuyến tự chuyển trang không tải lại. Chuyển trang bằng code thì dùng `useNavigate()` của `react-router`.

## Một điểm nhập

```tsx
import {
  // khung nội dung
  OpHeading, OpPanel, OpMore, OpAside, OpBack, OpNote, OpBtn, OpBadge, OpStat, OpSplit, OpFacts, OpRow, OpTodo, OpIcon, OpSteps, OpModal,
  // bổ sung v1.5
  Field, Input, Select, TextArea, NumberInput, MoneyInput, DecimalInput, RadioCards, Checkbox, OpPhoto,
  OpTabs, OpTable, OpLoading, OpError, OpEmpty, QueryView, StatusBadge, Money, OpKv, OpDl, OpMeter, OpFlow, OpCard, AuthImage, OpConfirm,
  // dữ liệu
  useGet, useSend, useBlobUrl, openFile, errorMessage, toast,
  // nhãn và định dạng
  label, tone, options, specName, crabImg, formatVnd, formatDate, formatDateTime,
} from '../../shared/ui/console'
import type { BatchResponse } from '../../shared/api/api.gen'
```

Kiểu dữ liệu lấy từ `shared/api/api.gen.ts` (tự sinh từ OpenAPI, không sửa tay). Đường dẫn, query, body và kiểu trả về tra ở
`shared/api/endpoints.gen.md`. Ô "Trả về" để trống nghĩa là controller trả `IActionResult`: mở controller hoặc DTO ở
`backend/src/CrabShare.Api/Features/<nhóm>/` để biết kiểu, hoặc gọi thử API.

## Lấy và ghi dữ liệu

```tsx
const batches = useGet<PagedResultOfBatchResponse>('/api/operators/me/batches', { status, pageSize: 50 })
const detail  = useGet<BatchResponse>(code ? `/api/operators/me/batches/${code}` : null)      // null: chưa gọi

const submit = useSend<BatchResponse, void>('post', `/api/batches/${code}/submit`, { success: 'Đã gửi Lô đi duyệt.' })
const decide = useSend<void, { id: number; reason: string }>('post', (b) => `/api/admin/tranches/${b.id}/block`)
const upload = useSend<void, { Photo: File; Reason: string }>('post', url, { form: true })   // multipart/form-data

<QueryView query={batches} empty="Chưa có Lô nào">{(page) => <OpTable … rows={page.items} />}</QueryView>
<OpBtn onClick={() => submit.mutate()} disabled={submit.isPending}>Gửi duyệt</OpBtn>
```

- Sau mỗi lần ghi thành công mọi truy vấn tự tải lại. Lỗi tự hiện thành thông báo ở góc (tắt bằng `quietError: true`).
- Thao tác có hậu quả (duyệt, từ chối, huỷ, xác nhận nghiệm thu, biểu quyết) mở `OpConfirm`, có ô lý do khi API yêu cầu.
- Tên trường của form multipart phải đúng tên thuộc tính của DTO bên backend (thường viết hoa chữ đầu). Xem `[form]` trong bảng endpoint.
- Ảnh từ endpoint cần đăng nhập: `<AuthImage path="/api/device-images/12/file" alt="…" />`. Tệp PDF, CSV: `openFile(path)`.
- Ảnh chụp tại chỗ theo BR (ảnh hộp, ảnh cua chết, ảnh kiểm phẩm): `<OpPhoto value={file} onChange={setFile} />`.

## Bố cục quen dùng

```tsx
<>
  <OpHeading eyebrow="Giao hàng" title="Chuyến giao" description="…" action={<OpBtn>…</OpBtn>} />
  <OpTabs items={[{ key: 'open', label: 'Đang mở', count: 3 }, …]} value={tab} onChange={setTab} />
  <div className="op-split">           {/* cột chính + cột phải dính 360px */}
    <div>
      <OpPanel title="…" subtitle="…">…</OpPanel>
    </div>
    <OpAside>…</OpAside>
  </div>
</>
```

| Cần | Dùng |
|---|---|
| Lưới 12 cột | `<div className="op-grid">` + `op-span-4/5/6/7/8` |
| Lưới thẻ | `<div className="op-cards">` + `OpCard` |
| Số liệu lớn nền tối | `OpStat` (+ `OpSplit`) |
| Ô số liệu nhỏ | `OpFacts` |
| Thông tin hồ sơ | `OpKv` (lưới) hoặc `OpDl` (hai cột, có dòng tổng) |
| Danh sách có ảnh | `OpPanel className="op-list"` + `OpRow` |
| Bảng | `OpTable` (cột số đặt `num: true`) |
| Form | `<form className="op-form">`, hàng nhiều ô `op-form__row`, chân form `op-formfoot` |
| Bước, điều kiện | `OpFlow` |
| Tiến độ | `OpMeter` |
| Thanh lọc | `<div className="op-toolbar">` |
| Lưới hộp nuôi | `<div className="op-boxes">` + nút có lớp `is-occupied / is-alert / is-warn / is-empty / is-on` |
| Ảnh nhỏ | `op-thumbs` + `AuthImage` |
| Chữ màu | `op-ok / op-danger / op-warn / op-info / op-muted`, số dùng `rd-num` |

Trạng thái: `<StatusBadge kind="batch" value={b.status} />`. Các `kind` có sẵn ở `status.ts` (batch, batchMode, order, deposit,
deliveryTranche, shipment, acceptance, allocation, claim, contribution, contract, payment, instruction, tranche, settlement, decision,
verification, partyRole, roleType, partyType, customerType, siteType, operator, user, kyc, procurement, receipt, inspection,
crabInventory, crabCondition, crabType, sex, box, device, deviceType, session, ai, grade, gradeCode, sizeCode, ruleSet, qcTask, qcKind,
evidence, alert, severity, alertType, costCategory, saleReason, feedback, match, …). Mã chưa có trong bảng hiện nguyên mã.

Cần kiểu riêng cho một cổng thì thêm một tệp CSS trong thư mục feature với tiền tố riêng, dùng biến của kit
(`--surface --line --fg --muted --faint --input --accent --grad --ok --warn --danger --info --dark --on-dark --shadow --ease`).

## Gọn và dễ dùng (bắt buộc)

Người dùng là người nuôi, khách hàng, nhà đầu tư, không phải người đọc tài liệu. Trang phải dùng được trong vài giây.

| Quy tắc | Cụ thể |
|---|---|
| Một trang một việc | Đầu trang là việc cần làm tiếp theo và tối đa 3–4 con số chính. Phần còn lại vào tab, `OpMore`, hộp thoại hoặc trang chi tiết. |
| Ít chữ | `OpHeading description` tối đa 12 từ hoặc bỏ hẳn. Không có đoạn văn giải thích hệ thống hoạt động thế nào. |
| Giải thích khi cần | `OpPanel subtitle` nằm sau nút (i), bấm mới hiện: chỉ viết khi thật sự giúp người dùng, tối đa 25 từ. Câu bắt buộc thấy ngay dùng `lead` (rất ít). |
| Không dẫn số quy tắc | Không viết BR-xxx, UC-xx, TL-xx, tên bảng, tên trường trên màn hình. |
| Ghi chú theo tình huống | `OpNote` chỉ hiện khi dữ liệu hiện tại cần cảnh báo (quá hạn, thiếu điều kiện, sắp mất cọc). Tối đa một ghi chú mỗi màn hình. Hậu quả của một thao tác viết trong `OpConfirm`, không viết sẵn trên trang. |
| Ẩn phần trống | Mục phụ chưa có dữ liệu và không có thao tác thì không hiện. Mỗi trang tối đa một `OpEmpty`, một câu, kèm nút làm bước tiếp. |
| Ẩn thứ ít dùng | Mã nội bộ, id, thời điểm chi tiết, trường tuỳ chọn, lịch sử, bảng phụ: cho vào `OpMore` (mặc định đóng) hoặc trang chi tiết. |
| Bảng gọn | Tối đa 5–6 cột. Cột phụ chuyển vào dòng thứ hai của ô đầu hoặc vào chi tiết khi bấm dòng. |
| Form ngắn | Chỉ ô bắt buộc hiện sẵn, có giá trị mặc định hợp lý. Ô tuỳ chọn vào `OpMore label="Tuỳ chọn thêm"`. `hint` tối đa 8 từ. |
| Một nút chính | Mỗi màn hình một nút `primary`. Nút phụ dùng `ghost`. Thao tác nguy hiểm đặt cuối, qua `OpConfirm`. |
| Trạng thái bằng hình | Dùng `StatusBadge`, `OpMeter`, `OpFlow`, `OpFacts` (tối đa 4 ô) thay cho câu mô tả. |

```tsx
<OpPanel title="Đợt giao" subtitle="Cua vừa duyệt hạng được phân cho đợt đến hạn sớm nhất.">…</OpPanel>   {/* giải thích sau nút (i) */}
<OpMore label="Lịch sử phân bổ" count={12}>…</OpMore>                                             {/* gấp lại, mặc định đóng */}
```

## Quy tắc nội dung

- Tiếng Việt có dấu, câu ngắn. Tiền là số nguyên đồng, hiện bằng `formatVnd` hoặc `<Money>`; nhập bằng `MoneyInput`.
- Không dùng chữ "lợi nhuận kỳ vọng", "lợi suất", "ROI", "sinh lời", "cam kết lãi" ở bất kỳ đâu (BR-219). Nói về tiền của nhà đầu tư
  thì dùng số đã có thật: đã góp, đã giải ngân, còn giữ, doanh thu đã ghi nhận, phần được chia theo bảng quyết toán.
- Gọi đúng tên: Lô (viết hoa), Lô P / T / A, người nuôi, Nhân viên kiểm phẩm, đợt giao, nghiệm thu, quy cách, đặt trước, đặt cọc,
  mốc giải ngân, biểu quyết, quyết toán, chuẩn phân hạng (chuẩn nội bộ tham chiếu, không phải chứng nhận).
- QR gắn theo đơn và theo Lô. Không có tem hay mã QR cho từng con cua.
- Không dựng dữ liệu giả trong trang. Chưa có dữ liệu thì hiện `OpEmpty` với một câu chỉ việc cần làm tiếp.
