using DbUp;
using DbUp.Engine;
using DbUp.ScriptProviders;
using Microsoft.Data.SqlClient;

// Áp các file database/migrations/V*.sql theo thứ tự tên, mỗi file chỉ chạy một lần
// (đã chạy thì ghi vào bảng dbo.SchemaVersions). Cách dùng: xem database/README.md
//
//   dotnet run --project backend/tools/CrabShare.DbMigrator                 -> CSDL dev mặc định (LocalDB)
//   dotnet run --project backend/tools/CrabShare.DbMigrator -- --reset      -> XOÁ CSDL rồi tạo lại từ đầu (chỉ dev)
//   dotnet run --project backend/tools/CrabShare.DbMigrator -- "<chuỗi kết nối>"

const string DefaultConnection = "Server=(localdb)\\MSSQLLocalDB;Database=CrabShareDev;Trusted_Connection=True;TrustServerCertificate=True";

var reset = args.Contains("--reset");
var connection = args.FirstOrDefault(a => !a.StartsWith("--"))
                 ?? Environment.GetEnvironmentVariable("CRABSHARE_DB")
                 ?? DefaultConnection;

var scriptsFolder = FindMigrationsFolder();
Console.WriteLine($"Thư mục migration: {scriptsFolder}");

var localDb = new SqlConnectionStringBuilder(connection).DataSource.StartsWith("(localdb)\\", StringComparison.OrdinalIgnoreCase);
if (reset && !localDb)
{
    Console.Error.WriteLine("Refusing --reset outside LocalDB. Production migrations must never delete or recreate the database.");
    return 2;
}

if (reset)
{
    Console.WriteLine("--reset: xoá CSDL hiện có...");
    DropDatabase.For.SqlDatabase(connection);
}

// Remote/production databases must already exist with an explicitly chosen service tier.
if (localDb) EnsureDatabase.For.SqlDatabase(connection);

var upgrader = DeployChanges.To
    .SqlDatabase(connection)
    .WithScriptsFromFileSystem(scriptsFolder, new FileSystemScriptOptions { Filter = f => Path.GetFileName(f).StartsWith('V') })
    .WithTransactionPerScript()
    .LogToConsole()
    .Build();

var result = upgrader.PerformUpgrade();
if (!result.Successful)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine(result.Error);
    Console.ResetColor();
    return 1;
}

Console.ForegroundColor = ConsoleColor.Green;
Console.WriteLine("CSDL đã cập nhật xong.");
Console.ResetColor();
return 0;

// Tìm thư mục database/migrations tính từ thư mục hiện tại đi ngược lên (chạy được từ gốc repo hoặc từ backend/)
static string FindMigrationsFolder()
{
    for (var dir = new DirectoryInfo(Directory.GetCurrentDirectory()); dir is not null; dir = dir.Parent)
    {
        var candidate = Path.Combine(dir.FullName, "database", "migrations");
        if (Directory.Exists(candidate)) return candidate;
    }
    throw new DirectoryNotFoundException("Không tìm thấy thư mục database/migrations. Hãy chạy lệnh từ trong repo crabshare.");
}
