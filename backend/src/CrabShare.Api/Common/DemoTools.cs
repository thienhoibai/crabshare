namespace CrabShare.Api.Common;

/// <summary>
/// Công cụ demo: các endpoint /api/dev/... làm thay những bước phụ thuộc bên ngoài để chạy được trọn luồng trong một buổi
/// (ngân hàng báo có, hạn góp ý 7 ngày). Luôn có ở Development. Ở môi trường khác chỉ bật khi cấu hình Demo:Tools = true,
/// và chỉ dành cho môi trường demo hoặc kiểm thử không có tiền thật (docs/deploy.md). Khi tắt, các endpoint trả 404
/// như thể không tồn tại.
/// </summary>
public static class DemoTools
{
    public static bool Enabled(IHostEnvironment env, IConfiguration config)
        => env.IsDevelopment() || config.GetValue<bool>("Demo:Tools");
}
