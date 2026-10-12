# Sinh lại Entities + AppDbContext từ CSDL (database-first). KHÔNG sửa tay các file sinh ra.
# Chạy SAU khi đã chạy DbMigrator. Cách dùng (từ gốc repo):
#   powershell -ExecutionPolicy Bypass -File backend/scripts/scaffold-db.ps1
#   powershell -ExecutionPolicy Bypass -File backend/scripts/scaffold-db.ps1 -Connection "<chuỗi kết nối>"
param(
  [string]$Connection = 'Server=(localdb)\MSSQLLocalDB;Database=CrabShareDev;Trusted_Connection=True;TrustServerCertificate=True'
)

$ErrorActionPreference = 'Stop'

# Bảng + view của CrabShare (không lấy bảng SchemaVersions của DbUp).
# Thêm bảng/view mới bằng migration V00X thì thêm tên vào cuối danh sách này.
$objects = @(
  'app_user'
  'app_user_role'
  'investor'
  'customer'
  'customer_address'
  'operator'
  'operator_member'
  'kyc_check'
  'payout_account'
  'risk_disclosure'
  'risk_acknowledgement'
  'physical_slot'
  'slot_allocation'
  'batch'
  'standard_cost_version'
  'standard_cost_item'
  'disbursement_tranche'
  'fee_tier'
  'batch_account'
  'contribution'
  'capital_share'
  'contract_template'
  'investment_contract'
  'contract_signature'
  'offtake_commitment'
  'production_log'
  'slot_event'
  'evidence'
  'capture_request'
  'evidence_detection'
  'evidence_review'
  'alert'
  'harvest'
  'crab_item'
  'crab_tag'
  'crab_item_event'
  'tag_scan'
  'product_grade'
  'product_listing'
  'price_history'
  'sales_order'
  'order_line'
  'stock_reservation'
  'complaint'
  'product_rating'
  'payment_request'
  'payment_instruction'
  'provider_transaction'
  'settlement'
  'settlement_line'
  'settlement_feedback'
  'audit_log'
  'v_batch_funding_progress'
  'v_batch_actual_revenue'
  'v_investor_portfolio'
  'v_traceability'
  'v_crab_count_reconciliation'
  'v_batch_commitment_cap'
  'v_settlement_reconciliation'
  'v_operator_reputation'
  'v_overdue_alerts'
)

$backend = Split-Path $PSScriptRoot -Parent
Push-Location $backend
try {
  dotnet tool restore
  $tableArgs = foreach ($o in $objects) { '--table'; "dbo.$o" }
  dotnet ef dbcontext scaffold $Connection Microsoft.EntityFrameworkCore.SqlServer `
    --project src/CrabShare.Api `
    --context AppDbContext --context-dir Infrastructure/Persistence --context-namespace CrabShare.Api.Infrastructure.Persistence `
    --output-dir Infrastructure/Persistence/Entities --namespace CrabShare.Api.Infrastructure.Persistence.Entities `
    --no-onconfiguring --force @tableArgs
  if ($LASTEXITCODE -ne 0) { throw "Scaffold lỗi (mã $LASTEXITCODE)" }
  Write-Host 'Xong. Chạy dotnet build để kiểm tra.' -ForegroundColor Green
}
finally {
  Pop-Location
}
