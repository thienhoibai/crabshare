# Add repeatable CS-44 camera/GPS fixtures to the local demo database only.
# From the repo root: powershell -ExecutionPolicy Bypass -File backend/scripts/seed-evidence-demo.ps1
$ErrorActionPreference = 'Stop'
$cs44RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$cs44SeedPath = Join-Path $cs44RepoRoot 'database/seed/CS44__production_evidence_demo.sql'
$cs44Connection = New-Object System.Data.SqlClient.SqlConnection 'Server=(localdb)\MSSQLLocalDB;Database=CrabShareDev;Trusted_Connection=True;TrustServerCertificate=True'
try {
    $cs44Connection.Open()
    if ($cs44Connection.Database -ne 'CrabShareDev') { throw 'Unexpected database; refusing to add demo fixtures.' }
    $cs44Command = $cs44Connection.CreateCommand()
    $cs44Command.CommandTimeout = 60
    $cs44Command.CommandText = Get-Content -LiteralPath $cs44SeedPath -Raw -Encoding UTF8
    $cs44Table = New-Object System.Data.DataTable
    $cs44Adapter = New-Object System.Data.SqlClient.SqlDataAdapter $cs44Command
    [void]$cs44Adapter.Fill($cs44Table)
    $cs44Table | Format-Table -AutoSize
} finally {
    $cs44Connection.Dispose()
}
