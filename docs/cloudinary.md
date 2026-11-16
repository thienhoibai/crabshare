# Lưu ảnh bằng Cloudinary

`Storage:Provider=Cloudinary` chọn `CloudinaryFileStorage`; `Local` giữ lưu ổ đĩa. Không tự fallback lưu local khi Cloudinary lỗi: trả lỗi rõ ràng để tránh hiểu nhầm ảnh đã được lưu trên cloud.

Ảnh mới JPEG/PNG/WebP được backend gửi qua HTTPS tới Upload API, dùng thông tin kết nối riêng của backend, `type=authenticated`, `overwrite=false`, public ID ngẫu nhiên trong `crabshare/evidence/...` hoặc `crabshare/listings/...`. SQL lưu định danh dạng `cloudinary:<cloud-name>/image/authenticated/<public-id>.<format>`, SHA-256 và metadata; không lưu API secret hay URL có chữ ký.

Các endpoint ảnh hiện có vẫn kiểm tra quyền rồi gọi IFileStorage.OpenReadAsync. Adapter tạo URL download có chữ ký và hết hạn sau 120 giây để đọc bản gốc từ Cloudinary, trả byte ảnh qua API. Không gửi khóa hoặc URL download nội bộ cho web/mobile. Ảnh mở trực tiếp bằng URL không chữ ký trả 401 là hành vi đúng của ảnh authenticated. Không cần bật unsigned preset hoặc tắt quyền riêng tư để xem qua CrabShare.

Ảnh cũ có đường dẫn tương đối vẫn đọc/xóa từ LocalFileStorage. Không tự chuyển toàn bộ ảnh cũ lên cloud; khi deploy vẫn cần giữ volume cũ nếu DB còn tham chiếu chúng. Chuyển đổi kho cũ cần đợt migration dữ liệu riêng. Không liên quan đến thiết lập PDF/ZIP vì adapter ảnh chỉ nhận JPEG/PNG/WebP.

## Máy phát triển

Project API có UserSecretsId `CrabShare.Api.Local`. Trong phiên triển khai đã lưu Storage:Provider và ba thông tin Cloudinary vào .NET User Secrets của người dùng Windows, ngoài repository; không ghi credential thật vào appsettings, source hoặc tài liệu. Các tài khoản phát triển khác tự đặt bằng:

```powershell
dotnet user-secrets set --project backend/src/CrabShare.Api "Storage:Provider" "Cloudinary"
dotnet user-secrets set --project backend/src/CrabShare.Api "Cloudinary:CloudName" "<cloud-name>"
dotnet user-secrets set --project backend/src/CrabShare.Api "Cloudinary:ApiKey" "<api-key>"
dotnet user-secrets set --project backend/src/CrabShare.Api "Cloudinary:ApiSecret" "<api-secret>"
```

Khởi động lại API ở Development để nạp cấu hình mới. Không chạy `user-secrets list` vào log chia sẻ vì lệnh in giá trị. User Secrets là cấu hình local ngoài Git, không phải kho bí mật mã hóa cho production.

## Production

Đặt bằng hệ thống secrets/environment của dịch vụ chạy backend:

```text
Storage__Provider=Cloudinary
Cloudinary__CloudName=<cloud-name>
Cloudinary__ApiKey=<api-key>
Cloudinary__ApiSecret=<api-secret>
```

Cũng hỗ trợ `CLOUDINARY_URL=cloudinary://<api-key>:<api-secret>@<cloud-name>` nếu không đặt ba trường riêng; vẫn cần chọn Storage__Provider=Cloudinary. Không đặt secret trong VITE_*, Flutter hoặc biến build frontend.

Compose tự host có các biến `CRABSHARE_STORAGE_PROVIDER`, `CRABSHARE_CLOUDINARY_CLOUD_NAME`, `CRABSHARE_CLOUDINARY_API_KEY`, `CRABSHARE_CLOUDINARY_API_SECRET`. Mặc định Compose vẫn Local để không làm hỏng môi trường chưa cấu hình; không khẳng định cấu hình đã được đưa lên Azure/production.

Sai/mất khóa thì cập nhật secrets trên backend và restart; không cần đổi DB vì chữ ký được tạo khi đọc. Adapter không cho lấy URL tùy ý hoặc đọc asset thuộc cloud khác. Test DB dùng Provider=Local tường minh để không tải fixture lên tài khoản thật.

## Kiểm chứng thực tế

Đã tạo một ảnh PNG thử không chứa dữ liệu người dùng, upload thật lên tài khoản đã cấu hình, download có chữ ký, đối chiếu byte gốc/SHA-256 trùng khớp, kiểm tra truy cập không chữ ký trả 401 và xóa đúng asset thử sau kiểm tra. Không sửa các thiết lập Security của tài khoản vì đọc có chữ ký đã hoạt động.

Test tự động CloudinaryStorageTests kiểm tra chọn provider, upload authenticated, stable identifier/hash, download có hạn và chữ ký, chống path/URL không hợp lệ, xóa đúng asset, đọc ảnh local cũ và không lộ response body/credential khi upstream lỗi.

Tài liệu giao thức: [Upload API](https://cloudinary.com/documentation/image_upload_api_reference), [private_download_url](https://cloudinary.com/documentation/control_access_to_media#providing_time_limited_access_to_private_media_assets).
