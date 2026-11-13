// simdevice — tool giả lập thiết bị IoT của CrabShare (mục 11 Hướng dẫn dựng trạm đo GradeAI và camera chạy dàn; BR-112, BR-230).
// Gửi đúng các bản tin mà thiết bị thật gửi, qua cùng API, với header X-Device-Key và Idempotency-Key = mã bản tin.
//
//   dotnet run --project backend/tools/CrabShare.DeviceSimulator -- <chế độ> [tuỳ chọn]
//
// Chế độ:
//   station   trạm đo: hỏi lượt đo đang mở, gửi khối lượng và hai ảnh (đèn trắng, đèn soi)
//   railcam   camera chạy dàn: chụp lần lượt các hộp, gửi ảnh kèm mã hộp, tầng, cột
//   water     cụm cảm biến nước: gửi nhiệt độ, độ mặn, pH
//   heartbeat chỉ gửi heartbeat
//   calibrate gửi bản tin hiệu chuẩn (--kind scale|camera|tof|ph|ec)
//
// Tuỳ chọn chung:
//   --api <url>            địa chỉ API, mặc định http://localhost:5233
//   --device <mã>          mã thiết bị đã đăng ký
//   --key <khoá>           khoá thiết bị Admin cấp khi đăng ký
//   --count <n>            số bản tin (railcam: số hộp; water: số lần đo), mặc định 1
//   --interval <giây>      khoảng cách giữa hai bản tin, mặc định 0 (water thật là 300)
//   --duplicate            gửi lại cùng mã bản tin lần hai (máy chủ phải trả 409)
//   --offline-replay       giữ 3 bản tin cũ rồi gửi dồn (thời điểm chụp cũ, nhận mới)
//   --unknown-device       dùng mã thiết bị ngẫu nhiên (máy chủ phải trả 403)
//   --clock-skew <giây>    lệch đồng hồ thiết bị
//   --images <thư mục>     dùng ảnh JPG có sẵn thay vì ảnh tự vẽ
// Trạm đo:   --weight <g> --range <g> --door-open --calibrated-days-ago <n> --camera-height <mm>
// Camera dàn: --rack R01 --first-box 1 --tiers 4 --columns 10
// Nước:      --temp 28.5 --salinity 15 --ph 7.8
using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using SkiaSharp;

var options = Options.Parse(args);
if (options.Mode is null or "help" or "--help")
{
    Console.WriteLine(File.Exists("README.md") ? File.ReadAllText("README.md") : "Xem đầu tệp Program.cs để biết cách dùng.");
    return 0;
}

using var http = new HttpClient { BaseAddress = new Uri(options.Get("api", "http://localhost:5233")), Timeout = TimeSpan.FromSeconds(60) };
var deviceCode = options.Has("unknown-device") ? $"SIM-{Guid.NewGuid():N}"[..16] : options.Get("device");
var key = options.Get("key", "dk_unknown");
var skew = TimeSpan.FromSeconds(options.Int("clock-skew", 0));
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var images = options.Has("images") ? Directory.GetFiles(options.Get("images"), "*.jpg") : [];
var exit = 0;

DateTimeOffset DeviceNow() => DateTimeOffset.Now.ToOffset(TimeSpan.FromHours(7)) + skew;

async Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, HttpContent? content, Guid? messageId)
{
    var request = new HttpRequestMessage(method, url) { Content = content };
    request.Headers.Add("X-Device-Key", key);
    if (messageId is { } id) request.Headers.Add("Idempotency-Key", id.ToString());
    var response = await http.SendAsync(request);
    var body = await response.Content.ReadAsStringAsync();
    Console.WriteLine($"{method} {url} → {(int)response.StatusCode} {body}");
    return response;
}

byte[] Image(string label, SKColor color)
{
    if (images.Length > 0) return File.ReadAllBytes(images[Random.Shared.Next(images.Length)]);
    // BR-114: tool giả lập in số hộp và giờ lên ảnh như camera thật.
    using var bitmap = new SKBitmap(640, 480);
    using (var canvas = new SKCanvas(bitmap))
    {
        canvas.Clear(color);
        using var paint = new SKPaint { Color = SKColors.White, IsAntialias = true };
        using var font = new SKFont { Size = 34 };
        canvas.DrawText(label, 24, 60, SKTextAlign.Left, font, paint);
        canvas.DrawText(DeviceNow().ToString("yyyy-MM-dd HH:mm:ss zzz", CultureInfo.InvariantCulture), 24, 110, SKTextAlign.Left, font, paint);
        canvas.DrawOval(new SKRect(220, 180, 420, 330), new SKPaint { Color = new SKColor(70, 90, 40), IsAntialias = true });
    }
    using var image = SKImage.FromBitmap(bitmap);
    using var data = image.Encode(SKEncodedImageFormat.Jpeg, 85);
    return data.ToArray();
}

MultipartFormDataContent Multipart(object meta, params (string Name, byte[] Bytes)[] files)
{
    var form = new MultipartFormDataContent { { new StringContent(JsonSerializer.Serialize(meta, json)), "meta" } };
    foreach (var (name, bytes) in files)
    {
        var part = new ByteArrayContent(bytes);
        part.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        form.Add(part, name, $"{name}.jpg");
    }
    return form;
}

// Bản tin chờ gửi: (mã bản tin, hàm tạo request). Chế độ --offline-replay giữ lại 3 bản rồi gửi dồn.
var queue = new List<(Guid Id, Func<Task<HttpResponseMessage>> Send)>();
async Task Deliver(Guid id, Func<Task<HttpResponseMessage>> send)
{
    if (options.Has("offline-replay") && queue.Count < 3)
    {
        queue.Add((id, send));
        Console.WriteLine($"(mất mạng) giữ bản tin {id} trong hàng đợi");
        if (queue.Count < 3) return;
        Console.WriteLine("(có mạng lại) gửi dồn 3 bản tin cũ");
        foreach (var q in queue) await q.Send();
        return;
    }
    var response = await send();
    if (!response.IsSuccessStatusCode && (int)response.StatusCode != 409) exit = 1;
    if (options.Has("duplicate"))
    {
        Console.WriteLine("(gửi lặp cùng mã bản tin, máy chủ phải trả 409)");
        var again = await send();
        if ((int)again.StatusCode != 409) exit = 1;
    }
}

var count = options.Int("count", 1);
var interval = TimeSpan.FromSeconds(options.Int("interval", 0));
switch (options.Mode)
{
    case "heartbeat":
        await SendAsync(HttpMethod.Post, "/api/devices/heartbeat",
            JsonContent.Create(new { deviceCode, firmwareVersion = "sim-1.0", status = "ok", queueLength = 0 }, options: json), null);
        break;

    case "calibrate":
    {
        var id = Guid.NewGuid();
        var kind = options.Get("kind", "scale");
        await Deliver(id, () => SendAsync(HttpMethod.Post, "/api/devices/calibration", JsonContent.Create(new
        {
            messageId = id, deviceCode, kind, performedAt = DeviceNow(),
            details = kind == "scale" ? (object)new { reference = new[] { 200, 500 }, errorG = 0.2 } : new { note = "simdevice" },
        }, options: json), id));
        break;
    }

    case "station":
        for (var i = 0; i < count; i++)
        {
            var open = await SendAsync(HttpMethod.Get, $"/api/devices/{deviceCode}/open-session", null, null);
            var crabTag = "CHUA-MO";
            if (open.IsSuccessStatusCode)
                crabTag = (await open.Content.ReadFromJsonAsync<JsonElement>(json)).GetProperty("crabTag").GetString() ?? crabTag;
            var id = Guid.NewGuid();
            var captured = DeviceNow();
            var meta = new
            {
                messageId = id, deviceCode, deviceType = "Station", firmwareVersion = "sim-1.0", capturedAt = captured,
                weightG = options.Decimal("weight", 380m + Random.Shared.Next(0, 120)), weightSamples = 10, weightRangeG = options.Decimal("range", 0.12m),
                tofMm = 318, cameraHeightMm = options.Int("camera-height", 370),
                lastCalibratedAt = captured.AddDays(-options.Int("calibrated-days-ago", 1)),
                presets = new { white = new { exposureUs = 12000, gain = 1.0, lensPosition = 3.25 }, red = new { exposureUs = 4000, gain = 1.0, lensPosition = 3.25 } },
                doorClosed = !options.Has("door-open"),
            };
            var white = Image($"WHITE {crabTag}", new SKColor(40, 40, 40));
            var red = Image($"RED {crabTag}", new SKColor(120, 10, 10));
            await Deliver(id, () => SendAsync(HttpMethod.Post, "/api/devices/ingest/measurements", Multipart(meta, ("white", white), ("red", red)), id));
            if (interval > TimeSpan.Zero) await Task.Delay(interval);
        }
        break;

    case "railcam":
    {
        var rack = options.Get("rack", "R01");
        var first = options.Int("first-box", 1);
        var columns = options.Int("columns", 10);
        var tiers = options.Int("tiers", 4);
        var run = $"{DeviceNow():yyyy-MM-ddTHH:mmzzz}#{rack}";
        for (var i = 0; i < count; i++)
        {
            var n = first + i;
            var box = n.ToString("D4");
            var id = Guid.NewGuid();
            var meta = new
            {
                messageId = id, deviceCode, deviceType = "RailCamera", rackCode = rack, boxCode = box,
                // Hộp --first-box là tầng 1 cột 1 của dàn; các hộp tiếp theo đi hết một tầng rồi lên tầng trên.
                tier = (n - options.Int("rack-first-box", first)) / columns % tiers + 1, column = (n - options.Int("rack-first-box", first)) % columns + 1,
                runId = run, capturedAt = DeviceNow(), tofMm = 55,
                illumination = "IR850", exposureUs = 30000, gain = 6.0,
            };
            var image = Image($"HOP {box} {rack}", new SKColor(30, 30, 30));
            await Deliver(id, () => SendAsync(HttpMethod.Post, "/api/devices/ingest/box-images", Multipart(meta, ("image", image)), id));
            if (interval > TimeSpan.Zero) await Task.Delay(interval);
        }
        var commands = await SendAsync(HttpMethod.Get, $"/api/devices/{deviceCode}/commands", null, null);
        if (commands.IsSuccessStatusCode)
            foreach (var c in (await commands.Content.ReadFromJsonAsync<JsonElement>(json)).EnumerateArray())
                await SendAsync(HttpMethod.Post, $"/api/devices/commands/{c.GetProperty("commandId").GetInt64()}/ack?deviceCode={deviceCode}", null, null);
        break;
    }

    case "water":
        for (var i = 0; i < count; i++)
        {
            var id = Guid.NewGuid();
            var reading = new
            {
                messageId = id, deviceCode, measuredAt = DeviceNow(),
                temperatureC = options.Decimal("temp", 28.0m + (decimal)Random.Shared.NextDouble()),
                salinityPpt = options.Decimal("salinity", 15.0m + (decimal)Random.Shared.NextDouble()),
                ph = options.Decimal("ph", 7.7m + (decimal)Random.Shared.NextDouble() / 5), qualityFlag = "ok",
            };
            await Deliver(id, () => SendAsync(HttpMethod.Post, "/api/devices/ingest/water-readings", JsonContent.Create(reading, options: json), id));
            if (interval > TimeSpan.Zero) await Task.Delay(interval);
        }
        break;

    default:
        Console.Error.WriteLine($"Không có chế độ {options.Mode}. Dùng station, railcam, water, heartbeat hoặc calibrate.");
        return 2;
}
return exit;

sealed class Options
{
    private readonly Dictionary<string, string?> values = new(StringComparer.OrdinalIgnoreCase);
    public string? Mode { get; private init; }

    public static Options Parse(string[] args)
    {
        var o = new Options { Mode = args.FirstOrDefault(a => !a.StartsWith("--")) };
        for (var i = 0; i < args.Length; i++)
        {
            if (!args[i].StartsWith("--")) continue;
            var name = args[i][2..];
            var value = i + 1 < args.Length && !args[i + 1].StartsWith("--") ? args[++i] : null;
            o.values[name] = value;
        }
        return o;
    }

    public bool Has(string name) => values.ContainsKey(name);
    public string Get(string name, string? fallback = null)
        => values.TryGetValue(name, out var v) && v is not null ? v : fallback ?? throw new ArgumentException($"Thiếu --{name}");
    public int Int(string name, int fallback) => values.TryGetValue(name, out var v) && int.TryParse(v, out var n) ? n : fallback;
    public decimal Decimal(string name, decimal fallback)
        => values.TryGetValue(name, out var v) && decimal.TryParse(v, NumberStyles.Number, CultureInfo.InvariantCulture, out var d) ? decimal.Round(d, 2) : decimal.Round(fallback, 2);
}
