using System.Diagnostics;
using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

static class Program
{
    public static async Task<int> Main(string[] args)
    {
        var options = Options.Parse(args);
        using var http = new HttpClient { BaseAddress = options.BaseUri, Timeout = TimeSpan.FromSeconds(30) };
        var rows = new List<Row>
        {
            await TimeManyAsync(http, "100 người gọi API phổ biến", options.Users, async client =>
            {
                using var health = await client.GetAsync("/api/health");
                using var listings = await client.GetAsync("/api/listings?pageSize=20");
                return health.IsSuccessStatusCode && listings.IsSuccessStatusCode;
            }),
        };

        if (options.ListingId is null || options.AddressId is null || string.IsNullOrEmpty(options.BuyerToken))
            rows.Add(Row.Skipped("50 checkout song song trên 1 niêm yết", "Thiếu --listing, --address hoặc token người mua."));
        else
            rows.Add(await CheckoutsAsync(http, options));

        if (string.IsNullOrEmpty(options.BatchCode) || string.IsNullOrEmpty(options.AdminToken))
            rows.Add(Row.Skipped("Quyết toán một lô", "Thiếu --batch hoặc token admin."));
        else
            rows.Add(await SettlementAsync(http, options));

        var markdown = Markdown(options.BaseUri, rows);
        Console.WriteLine(markdown);
        if (options.Output is { } path)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
            await File.WriteAllTextAsync(path, markdown);
        }
        return rows.Any(r => r.Failed) ? 1 : 0;
    }

    private static async Task<Row> CheckoutsAsync(HttpClient http, Options options)
    {
        using var before = await http.GetAsync($"/api/listings/{options.ListingId}");
        if (!before.IsSuccessStatusCode)
            return Row.Skipped("50 checkout song song trên 1 niêm yết", $"Không đọc được niêm yết {options.ListingId}: {(int)before.StatusCode}.");
        var available = (await before.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("availableQtyKg").GetDecimal();
        var quantity = options.QuantityKg;
        var started = Stopwatch.GetTimestamp();
        var samples = await Task.WhenAll(Enumerable.Range(0, options.Checkouts).Select(async _ =>
        {
            using var client = NewClient(http, options.BuyerToken);
            var watch = Stopwatch.StartNew();
            using var response = await client.PostAsJsonAsync("/api/orders/checkout", new
            {
                addressId = options.AddressId,
                lines = new[] { new { listingId = options.ListingId, quantityKg = quantity } },
            });
            watch.Stop();
            var ok = response.IsSuccessStatusCode;
            var rejected = (int)response.StatusCode is 409 or 422;
            return (ok, rejected, watch.Elapsed.TotalMilliseconds);
        }));
        var elapsed = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
        var success = samples.Count(s => s.ok);
        var rejectedCount = samples.Count(s => s.rejected);
        var errors = samples.Length - success - rejectedCount;
        var sold = success * quantity;
        var oversell = sold > available ? sold - available : 0m;
        return new Row(
            "50 checkout song song trên 1 niêm yết",
            samples.Length,
            Percentile(samples.Select(s => s.Item3), 0.95),
            elapsed,
            errors,
            $"bán vượt {oversell:0.###} kg; thành công {success}; từ chối vì hết hàng {rejectedCount}; tồn lúc bắt đầu {available:0.###} kg",
            errors == 0 && oversell == 0);
    }

    private static async Task<Row> SettlementAsync(HttpClient http, Options options)
    {
        using var client = NewClient(http, options.AdminToken);
        var watch = Stopwatch.StartNew();
        using var response = await client.PostAsJsonAsync($"/api/admin/batches/{options.BatchCode}/settlements",
            new { taxWithholdingPct = options.TaxPercent });
        watch.Stop();
        if (!response.IsSuccessStatusCode)
            return new Row("Quyết toán một lô", 1, watch.Elapsed.TotalMilliseconds, watch.Elapsed.TotalMilliseconds, 1,
                $"HTTP {(int)response.StatusCode}", false);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var investors = body.GetProperty("investorCount").GetInt32();
        var difference = body.GetProperty("reconciliationDifference").GetInt64();
        var note = investors >= 100
            ? $"{investors} nhà đầu tư, lệch đối soát {difference} đồng"
            : $"{investors} nhà đầu tư (ca 100 nhà đầu tư cần một lô đã chốt đủ 100 capital_share), lệch đối soát {difference} đồng";
        return new Row("Quyết toán một lô", 1, watch.Elapsed.TotalMilliseconds, watch.Elapsed.TotalMilliseconds,
            difference == 0 ? 0 : 1, note, difference == 0);
    }

    private static async Task<Row> TimeManyAsync(HttpClient http, string name, int count, Func<HttpClient, Task<bool>> call)
    {
        var started = Stopwatch.GetTimestamp();
        var samples = await Task.WhenAll(Enumerable.Range(0, count).Select(async _ =>
        {
            using var client = NewClient(http, null);
            var watch = Stopwatch.StartNew();
            var ok = false;
            try { ok = await call(client); }
            catch (HttpRequestException) { ok = false; }
            watch.Stop();
            return (ok, watch.Elapsed.TotalMilliseconds);
        }));
        var elapsed = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
        var errors = samples.Count(s => !s.ok);
        return new Row(name, count, Percentile(samples.Select(s => s.Item2), 0.95), elapsed, errors, "GET /api/health và GET /api/listings", errors == 0);
    }

    private static HttpClient NewClient(HttpClient template, string? token)
    {
        var client = new HttpClient { BaseAddress = template.BaseAddress, Timeout = template.Timeout };
        if (!string.IsNullOrEmpty(token))
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private static double Percentile(IEnumerable<double> values, double p)
    {
        var sorted = values.Order().ToArray();
        if (sorted.Length == 0) return 0;
        var index = (int)Math.Ceiling(p * sorted.Length) - 1;
        return sorted[Math.Clamp(index, 0, sorted.Length - 1)];
    }

    private static string Markdown(Uri baseUri, IReadOnlyList<Row> rows)
    {
        var lines = new List<string>
        {
            "# CS-87 — Kiểm thử tải và đồng thời",
            "",
            $"Máy chủ: `{baseUri}`. Ngưỡng: p95 dưới 1 giây; bán vượt = 0. Số trên server thật lấy sau khi CS-80 triển khai xong.",
            "",
            "| Ca | Số lần | p95 (ms) | Cả lượt (ms) | Lỗi | Ghi chú | Đạt |",
            "|---|---:|---:|---:|---:|---|---|",
        };
            lines.AddRange(rows.Select(r => $"| {r.Name} | {r.Count?.ToString() ?? "—"} | {Fmt(r.P95)} | {Fmt(r.Elapsed)} | {r.Errors?.ToString() ?? "—"} | {r.Note} | {(r.WasSkipped ? "Bỏ qua" : r.Passed ? "Đạt" : "Không đạt")} |"));
        lines.Add("");
        return string.Join(Environment.NewLine, lines);
    }

    private static string Fmt(double? value) => value is { } n ? n.ToString("0") : "—";

    private sealed record Row(string Name, int? Count, double? P95, double? Elapsed, int? Errors, string Note, bool Passed)
    {
        public bool WasSkipped { get; private init; }
        public bool Failed => !WasSkipped && !Passed;
        public static Row Skipped(string name, string note) => new(name, null, null, null, null, note, false) { WasSkipped = true };
    }

    private sealed record Options(Uri BaseUri, int Users, int Checkouts, long? ListingId, long? AddressId, decimal QuantityKg,
        string? BuyerToken, string? AdminToken, string? BatchCode, decimal TaxPercent, string? Output)
    {
        public static Options Parse(string[] args)
        {
            string? Value(string name)
            {
                var index = Array.FindIndex(args, a => a == name);
                return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
            }
            var baseUrl = Value("--base-url") ?? "http://localhost:5233";
            return new Options(
                new Uri(baseUrl.TrimEnd('/') + "/"),
                int.Parse(Value("--users") ?? "100"),
                int.Parse(Value("--checkouts") ?? "50"),
                long.TryParse(Value("--listing"), out var listing) ? listing : null,
                long.TryParse(Value("--address"), out var address) ? address : null,
                decimal.Parse(Value("--quantity") ?? "0.1", CultureInfo.InvariantCulture),
                Value("--buyer-token") ?? Environment.GetEnvironmentVariable("CRABSHARE_BUYER_TOKEN"),
                Value("--admin-token") ?? Environment.GetEnvironmentVariable("CRABSHARE_ADMIN_TOKEN"),
                Value("--batch"),
                decimal.Parse(Value("--tax") ?? "0", CultureInfo.InvariantCulture),
                Value("--output"));
        }
    }
}
