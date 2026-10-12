using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Catalog;

[ApiController]
[Route("api/listings")]
public sealed class ListingsController(CatalogService catalog) : ControllerBase
{
    [Authorize(Policy = Policies.Operator)]
    [HttpPost]
    [EndpointSummary("UC24 — Tạo niêm yết (bản nháp) từ tồn đã thu hoạch của lô + hạng")]
    public async Task<ActionResult<ListingResponse>> Create(CreateListingRequest req, CancellationToken ct)
    {
        var listing = await catalog.CreateAsync(req, ct);
        return CreatedAtAction(nameof(OperatorListingsController.Get), "OperatorListings", new { id = listing.ListingId }, listing);
    }

    [Authorize(Policy = Policies.Operator)]
    [HttpGet("{id:long}/price-check")]
    [EndpointSummary("UC24 — So giá định đổi với giao dịch tương đồng, chưa lưu (TL-27)")]
    public async Task<ActionResult<PriceCheckResponse>> PreviewPrice(long id, [FromQuery] long pricePerKg, CancellationToken ct)
        => Ok(await catalog.PreviewPriceAsync(id, pricePerKg, ct));

    [Authorize(Policy = Policies.Operator)]
    [HttpPatch("{id:long}/price")]
    [EndpointSummary("UC24 — Đổi giá: ghi lịch sử giá, gắn cờ nếu lệch bất thường")]
    public async Task<ActionResult<ListingResponse>> ChangePrice(long id, ChangePriceRequest req, CancellationToken ct)
        => Ok(await catalog.ChangePriceAsync(id, req, ct));

    [Authorize(Policy = Policies.Operator)]
    [HttpPost("{id:long}/publish")]
    [EndpointSummary("UC24 — Đăng bán lên cửa hàng")]
    public async Task<ActionResult<ListingResponse>> Publish(long id, CancellationToken ct)
        => Ok(await catalog.PublishAsync(id, ct));

    [Authorize(Policy = Policies.Operator)]
    [HttpPost("{id:long}/close")]
    [EndpointSummary("UC24 — Ngừng bán")]
    public async Task<ActionResult<ListingResponse>> Close(long id, CancellationToken ct)
        => Ok(await catalog.CloseAsync(id, ct));

    [Authorize(Policy = Policies.Operator)]
    [HttpPost("{id:long}/refresh-stock")]
    [EndpointSummary("UC24 — Cập nhật tồn theo số cua đang có trong kho")]
    public async Task<ActionResult<ListingResponse>> RefreshStock(long id, CancellationToken ct)
        => Ok(await catalog.RefreshStockAsync(id, ct));

    [Authorize(Policy = Policies.Operator)]
    [HttpPost("{id:long}/image")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(CatalogService.MaxImageBytes + 64 * 1024)]
    [EndpointSummary("UC24 — Tải ảnh sản phẩm (JPG/PNG/WEBP, tối đa 5 MB)")]
    public async Task<ActionResult<ListingResponse>> UploadImage(long id, IFormFile file, CancellationToken ct)
        => Ok(await catalog.UploadImageAsync(id, file, ct));

    [HttpGet("{id:long}/image")]
    [EndpointSummary("Ảnh sản phẩm (công khai)")]
    public async Task<IActionResult> Image(long id, CancellationToken ct)
    {
        var (content, contentType) = await catalog.OpenImageAsync(id, ct);
        Response.Headers.CacheControl = "public, max-age=86400";
        return File(content, contentType);
    }
}
