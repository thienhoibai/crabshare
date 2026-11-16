#requires -Version 7.0
<#
.SYNOPSIS
Runs VI-01 through VI-06 acceptance checks against an explicitly selected local development DB.
.DESCRIPTION
Requires an already running dedicated API configured for the same database, with seed and background
jobs disabled and the sandbox payment gateway. Does not create, reset, migrate, or clean a database.
Every HTTP-created entity is identified by RunId (users/profile/title) or an ID in manifest.json.
The sole committed direct-SQL write grants PlatformAdmin to this run's newly registered admin.
All immutability probes use their own SQL transaction and unconditionally roll it back. No HTTP
request runs inside a SQL probe transaction. Locked cost/audit fixtures intentionally remain.
Reports never contain passwords, JWTs, email addresses, request/response bodies, or connection strings.
.EXAMPLE
./backend/scripts/Validate-VI01-06Local.ps1 -ApiBaseUrl http://127.0.0.1:5274 `
  -ConnectionString 'Server=ZIENK;Database=CrabShare_Local;Integrated Security=True;Encrypt=True;TrustServerCertificate=True' `
  -ExpectedServer ZIENK -ExpectedDatabase CrabShare_Local -OutputDirectory ./artifacts/vi-local
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][uri]$ApiBaseUrl,
    [Parameter(Mandatory)][string]$ConnectionString,
    [string]$ExpectedServer = 'ZIENK',
    [string]$ExpectedDatabase = 'CrabShare_Local',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '../../artifacts/vi-local'),
    [ValidatePattern('^VI[0-9A-Za-z_-]{8,35}$')][string]$RunId = ('VI' + (Get-Date -Format 'yyyyMMddHHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6))
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data
Add-Type -AssemblyName System.Net.Http
$script:checks = [System.Collections.Generic.List[object]]::new()
$script:users = [System.Collections.Generic.List[object]]::new()
$script:operators = [System.Collections.Generic.List[object]]::new()
$script:batches = [System.Collections.Generic.List[object]]::new()
$script:metrics = [ordered]@{}
$script:started = [DateTimeOffset]::UtcNow
$script:failure = $null
$script:currentVI = 'Preflight'
$script:client = $null
$script:sqlConnection = $null
$script:runPath = $null
$script:password = 'VIloc-' + [guid]::NewGuid().ToString('N') + '!9a'

function Check([string]$Name, [bool]$Condition, [string]$Evidence = '') {
    $script:checks.Add([ordered]@{ vi = $script:currentVI; name = $Name; passed = $Condition; evidence = $Evidence })
    if (-not $Condition) { throw "Validation: $script:currentVI / $Name failed. $Evidence" }
}

function New-SqlCommand($Connection, [string]$Sql, [hashtable]$Parameters, $Transaction = $null) {
    $command = $Connection.CreateCommand()
    $command.CommandText = $Sql
    $command.CommandTimeout = 60
    if ($null -ne $Transaction) { $command.Transaction = $Transaction }
    foreach ($key in $Parameters.Keys) {
        $value = $Parameters[$key]
        if ($null -eq $value) { $value = [DBNull]::Value }
        [void]$command.Parameters.AddWithValue('@' + $key, $value)
    }
    return $command
}

function Sql([string]$Text, [hashtable]$Parameters = @{}, [ValidateSet('Scalar','Table','NonQuery')][string]$Mode = 'Scalar') {
    $connection = [System.Data.SqlClient.SqlConnection]::new($script:sqlConnection)
    try {
        $connection.Open()
        $command = New-SqlCommand $connection $Text $Parameters
        try {
            if ($Mode -eq 'Scalar') { return $command.ExecuteScalar() }
            if ($Mode -eq 'NonQuery') { return $command.ExecuteNonQuery() }
            $table = [System.Data.DataTable]::new()
            $reader = $command.ExecuteReader()
            try { $table.Load($reader) } finally { $reader.Dispose() }
            return ,$table
        } finally { $command.Dispose() }
    } finally { $connection.Dispose() }
}

function Http([string]$Method, [string]$Path, $Body = $null, [string]$Token = '', [int]$Expected = 200, [string]$Code = '') {
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), $Path)
    if ($Token) { $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $Token) }
    if ($null -ne $Body) {
        $request.Content = [System.Net.Http.StringContent]::new(($Body | ConvertTo-Json -Depth 30 -Compress), [Text.Encoding]::UTF8, 'application/json')
    }
    try {
        $response = $script:client.SendAsync($request).GetAwaiter().GetResult()
        try {
            $status = [int]$response.StatusCode
            $raw = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            $parsed = if ($raw) { $raw | ConvertFrom-Json } else { $null }
            $actualCode = if ($null -ne $parsed -and $parsed.PSObject.Properties.Name -contains 'code') { [string]$parsed.code } else { '' }
            Check "$Method $Path returns $Expected" ($status -eq $Expected) "HTTP=$status; expected=$Expected; code=$actualCode"
            if ($Code) { Check "$Method $Path error code" ($actualCode -eq $Code) "code=$actualCode; expected=$Code" }
            return $parsed
        } finally { $response.Dispose() }
    } finally { $request.Dispose() }
}

function Register([string]$Label, [string]$Role = 'Customer') {
    $email = ($RunId + '-' + $Label + '@example.invalid').ToLowerInvariant()
    $auth = Http POST 'api/auth/register' @{ email = $email; password = $script:password; fullName = "$RunId $Label"; role = $Role }
    $script:users.Add([ordered]@{ label = $Label; userId = [long]$auth.user.userId; selfRegisterRole = $Role })
    # Confirms this HTTP API is actually writing to the selected DB before any privileged SQL write.
    $found = Sql 'SELECT COUNT(*) FROM dbo.app_user WHERE user_id=@id AND email=@email AND full_name=@name AND status=''Active''' @{ id = [long]$auth.user.userId; email = $email; name = "$RunId $Label" }
    Check "$Label persisted in expected DB" ($found -eq 1)
    return @{ Email = $email; UserId = [long]$auth.user.userId; Token = [string]$auth.accessToken; Label = $Label }
}

function Login($User) {
    $auth = Http POST 'api/auth/login' @{ email = $User.Email; password = $script:password }
    Check "$($User.Label) login identity" ([long]$auth.user.userId -eq $User.UserId)
    $User.Token = [string]$auth.accessToken
    return $auth.user
}

function Profile($User, [string]$Label) {
    $tax = 'VI' + [guid]::NewGuid().ToString('N').Substring(0, 12)
    $body = @{ legalName = "$RunId $Label"; taxCode = $tax; businessRegNo = $RunId.Substring(0, [Math]::Min(30, $RunId.Length)); farmAddress = "$RunId local validation farm" }
    $result = Http POST 'api/operators' $body $User.Token 201
    $script:operators.Add([ordered]@{ label = $Label; operatorId = [long]$result.operatorId; taxCode = $tax; businessRegNo = $body.businessRegNo })
    return @{ Id = [long]$result.operatorId; Body = $body; Result = $result }
}

function New-Batch($User, [string]$Label, $Template) {
    $body = @{} + $Template
    $body.title = "$RunId $Label"
    $result = Http POST 'api/batches' $body $User.Token 201
    $id = [long](Sql 'SELECT batch_id FROM dbo.batch WHERE batch_code=@code AND title=@title' @{ code = $result.batchCode; title = $body.title })
    $script:batches.Add([ordered]@{ label = $Label; batchId = $id; batchCode = [string]$result.batchCode })
    return @{ Id = $id; Code = [string]$result.batchCode; Body = $body; Result = $result }
}

function Rollback-Probe([string]$Name, [string]$Text, [hashtable]$Parameters, [int[]]$ExpectedNumber) {
    $connection = [System.Data.SqlClient.SqlConnection]::new($script:sqlConnection)
    $transaction = $null
    $numbers = @()
    $unexpected = $null
    try {
        $connection.Open()
        $transaction = $connection.BeginTransaction()
        $command = New-SqlCommand $connection $Text $Parameters $transaction
        try { [void]$command.ExecuteNonQuery() }
        catch {
            $exception = $_.Exception
            while ($null -ne $exception.InnerException -and $exception -isnot [System.Data.SqlClient.SqlException]) { $exception = $exception.InnerException }
            if ($exception -is [System.Data.SqlClient.SqlException]) { $numbers = @($exception.Errors | ForEach-Object { $_.Number }) }
            else { $unexpected = $exception.GetType().Name }
        } finally { $command.Dispose() }
    } finally {
        # A THROW inside a trigger may already abort the transaction; never attempt to commit it.
        if ($null -ne $transaction) { try { $transaction.Rollback() } catch {} ; $transaction.Dispose() }
        $connection.Dispose()
    }
    $matched = @($numbers | Where-Object { $ExpectedNumber -contains $_ }).Count -gt 0
    Check "$Name blocked and rolled back" $matched "SQL errors=$($numbers -join ','); expected=$($ExpectedNumber -join ' or '); unexpected=$unexpected"
}

try {
    Check 'API is loopback HTTP(S)' ($ApiBaseUrl.IsLoopback -and $ApiBaseUrl.Scheme -in @('http','https'))
    # Microsoft.Data.SqlClient's connection-level Command Timeout is unsupported by legacy SqlClient.
    $normalized = [regex]::Replace($ConnectionString, '(?i)(^|;)\s*Command\s*Timeout\s*=\s*[^;]*', '$1')
    # Use the constructor: PowerShell's IDictionary adapter can treat .ConnectionString assignment as a SQL keyword.
    $builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new($normalized)
    Check 'Windows integrated authentication required' $builder.IntegratedSecurity
    Check 'Explicit expected database selected' ($builder.InitialCatalog -eq $ExpectedDatabase)
    Check 'Encrypted local SQL connection configured' ($builder.Encrypt -and $builder.TrustServerCertificate)
    $script:sqlConnection = $builder.ConnectionString
    $identity = Sql 'SELECT CONVERT(nvarchar(128),SERVERPROPERTY(''ServerName'')) server_name, DB_NAME() database_name' @{} Table
    $actualServer = [string]$identity.Rows[0].server_name
    Check 'SQL Server identity matches' ($actualServer -ieq $ExpectedServer) "server=$actualServer"
    Check 'SQL database identity matches' ([string]$identity.Rows[0].database_name -eq $ExpectedDatabase) "database=$ExpectedDatabase"
    $schema = Sql 'SELECT COUNT(*) FROM sys.triggers WHERE is_disabled=0 AND name IN (''tr_cost_item_locked'',''tr_cost_plan_locked'',''tr_cost_version_locked'',''trg_audit_log_append_only'')'
    Check 'Required immutability triggers are enabled' ($schema -eq 4)
    Check 'Relative cost schedule schema exists' ((Sql 'SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(''dbo.standard_cost_tranche_plan'') AND name IN (''anchor_code'',''offset_days'')') -eq 2)
    $script:metrics.baselineCounts = [ordered]@{}
    foreach ($table in @('app_user','operator','batch','physical_slot','standard_cost_version','audit_log','fee_tier')) {
        $script:metrics.baselineCounts[$table] = [long](Sql "SELECT COUNT_BIG(*) FROM dbo.$table")
    }
    $feeFingerprintSql = 'SELECT CONVERT(varchar(64),HASHBYTES(''SHA2_256'',(SELECT * FROM dbo.fee_tier ORDER BY fee_tier_id FOR JSON PATH)),2)'
    $script:metrics.feeTierFingerprint = [string](Sql $feeFingerprintSql)
    $script:runPath = Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) $RunId
    [void](New-Item -ItemType Directory -Path $script:runPath -Force)
    $script:client = [System.Net.Http.HttpClient]::new()
    $script:client.BaseAddress = [uri]($ApiBaseUrl.AbsoluteUri.TrimEnd('/') + '/')
    $script:client.Timeout = [TimeSpan]::FromSeconds(90)
    Write-Host "Running $RunId against $ExpectedServer/$ExpectedDatabase. Test fixtures will be retained."

    $batchTemplate = @{ title = "$RunId guard"; crabType = 'SoftShellCrab'; seedQuantity = 100; expectedOutputKg = 50.125; cycleDays = 45; restockCutoffDays = 10; minViableCapital = 10000000; targetCapital = 75000000; maxCapital = 100000000; minContribution = 1000000; operatorSharePct = 7 }
    $costs = @{ items = @(
        @{ category = 'Seed'; description = "$RunId seed"; quantity = 100; unit = 'animal'; unitPrice = 100000; trancheNo = 1 },
        @{ category = 'Feed'; description = "$RunId feed"; quantity = 10; unit = 'kg'; unitPrice = 200000; trancheNo = 2 },
        @{ category = 'MortalityReserve'; description = "$RunId reserve"; quantity = 1; unit = 'cycle'; unitPrice = 1000000; trancheNo = 0 },
        @{ category = 'Depreciation'; description = "$RunId depreciation"; quantity = 1; unit = 'cycle'; unitPrice = 500000; trancheNo = $null }
    ); tranches = @(
        @{ trancheNo = 1; anchorCode = 'FundingReady'; offsetDays = 0; unlockCondition = "$RunId funding ready" },
        @{ trancheNo = 2; anchorCode = 'Stocked'; offsetDays = 7; unlockCondition = "$RunId feed after stocking" }
    ) }

    $script:currentVI = 'VI-01'
    $owner = Register owner
    [void](Login $owner)
    $farm = Profile $owner farm
    Check 'New operator has Draft and Owner' ($farm.Result.status -eq 'Draft' -and $farm.Result.memberRole -eq 'Owner')
    Check 'Owner membership and role persisted' ((Sql 'SELECT COUNT(*) FROM dbo.operator_member m JOIN dbo.app_user_role r ON r.user_id=m.user_id AND r.role_code=''OperatorMember'' WHERE m.user_id=@user AND m.operator_id=@op AND m.member_role=''Owner''' @{ user = $owner.UserId; op = $farm.Id }) -eq 1)
    [void](Http POST 'api/operators' $farm.Body $owner.Token 409 'operator.already_member')
    [void](Http PUT 'api/operators/me' $farm.Body $owner.Token)
    [void](Http POST 'api/batches' $batchTemplate $owner.Token 422 'batch.operator_not_approved')
    [void](Http POST 'api/boxes/range' @{ from = 1; to = 1; width = 4 } $owner.Token 422 'box.operator_not_approved')
    $submitted = Http POST 'api/operators/me/submit' $null $owner.Token
    Check 'Profile submit is persisted' ($submitted.status -eq 'Submitted' -and $null -ne $submitted.submittedAt)
    [void](Http PUT 'api/operators/me' $farm.Body $owner.Token 422 'operator.not_editable')

    $script:currentVI = 'VI-02'
    $admin = Register admin
    $granted = Sql @'
IF NOT EXISTS (SELECT 1 FROM dbo.app_user WHERE user_id=@user AND email=@email AND full_name=@name AND status='Active')
    THROW 51090, 'Validation admin identity mismatch', 1;
INSERT dbo.app_user_role(user_id,role_code) VALUES(@user,'PlatformAdmin');
'@ @{ user = $admin.UserId; email = $admin.Email; name = "$RunId admin" } NonQuery
    Check 'Only newly registered test admin was granted PlatformAdmin' ($granted -eq 1)
    $adminMe = Login $admin
    Check 'Admin login receives PlatformAdmin' ($adminMe.roles -contains 'PlatformAdmin')
    $ownerMe = Login $owner
    Check 'Owner relogin receives OperatorMember and farm claim' ($ownerMe.roles -contains 'OperatorMember' -and $ownerMe.operatorId -eq $farm.Id)
    [void](Http POST "api/admin/operators/$($farm.Id)/approve" @{ approvedSlotCapacity = 1200 } '' 401)
    [void](Http POST "api/admin/operators/$($farm.Id)/approve" @{ approvedSlotCapacity = 1200 } $owner.Token 403)
    [void](Http POST "api/admin/operators/$($farm.Id)/approve" @{ approvedSlotCapacity = -1 } $admin.Token 400)
    $approvedFarm = Http POST "api/admin/operators/$($farm.Id)/approve" @{ approvedSlotCapacity = 1200 } $admin.Token
    Check 'Operator approval snapshots capacity and actor' ($approvedFarm.status -eq 'Approved' -and $approvedFarm.approvedSlotCapacity -eq 1200 -and $approvedFarm.approvedBy -eq $admin.UserId -and $null -ne $approvedFarm.approvedAt)
    [void](Http POST "api/admin/operators/$($farm.Id)/approve" @{ approvedSlotCapacity = 1200 } $admin.Token 422 'operator.invalid_transition')
    $staff = Register staff
    $member = Http POST 'api/operators/me/members' @{ email = $staff.Email } $owner.Token 201
    Check 'Added member is Staff' ($member.memberRole -eq 'Staff' -and $member.userId -eq $staff.UserId)
    [void](Login $staff)
    $staffProfile = Http GET 'api/operators/me' $null $staff.Token
    Check 'Staff reads same farm' ($staffProfile.operatorId -eq $farm.Id -and $staffProfile.memberRole -eq 'Staff')
    [void](Http POST 'api/operators/me/members' @{ email = $staff.Email } $owner.Token 409 'operator.already_member')
    [void](Http POST 'api/operators/me/members' @{ email = $admin.Email } $staff.Token 403 'operator.owner_required')
    [void](Http DELETE "api/operators/me/members/$($owner.UserId)" $null $staff.Token 403 'operator.owner_required')
    [void](Http POST 'api/operators/me/submit' $null $staff.Token 403 'operator.owner_required')

    $script:currentVI = 'VI-03'
    [void](Http POST 'api/boxes/range' @{ from = 1; to = 1; width = 4 } $staff.Token 403 'box.owner_required')
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $range = Http POST 'api/boxes/range' @{ from = 1; to = 1200; width = 4 } $owner.Token 201
    $watch.Stop()
    $script:metrics.bulk1200Milliseconds = [math]::Round($watch.Elapsed.TotalMilliseconds, 2)
    Check 'Bulk 1200 completes within two seconds' ($watch.Elapsed.TotalMilliseconds -lt 2000) "durationMs=$($script:metrics.bulk1200Milliseconds); limitMs=2000"
    Check 'Bulk created 1200 padded box codes' ($range.created -eq 1200 -and $range.from -eq '0001' -and $range.to -eq '1200')
    Check 'Bulk 1200 persisted exactly' ((Sql 'SELECT COUNT(*) FROM dbo.physical_slot WHERE operator_id=@op' @{ op = $farm.Id }) -eq 1200)
    $boxPage = Http GET 'api/boxes?pageSize=100' $null $staff.Token
    Check 'Staff can read paged 1200 boxes' ($boxPage.total -eq 1200 -and @($boxPage.items).Count -eq 100)
    [void](Http POST 'api/boxes' @{ slotCode = '1201' } $owner.Token 422 'box.over_capacity')
    [void](Http POST 'api/boxes/range' @{ from = 1201; to = 1202; width = 4 } $owner.Token 422 'box.over_capacity')
    [void](Http PATCH 'api/boxes/0001' @{ status = 'Maintenance' } $owner.Token)
    $maintenance = Http GET 'api/boxes?status=Maintenance&search=0001&pageSize=1&page=1' $null $staff.Token
    Check 'Maintenance status and search filter return patched box' ($maintenance.total -eq 1 -and @($maintenance.items).Count -eq 1 -and $maintenance.items[0].slotCode -eq '0001' -and $maintenance.items[0].status -eq 'Maintenance')
    $available1 = Http GET 'api/boxes?status=Available&search=000&pageSize=3&page=1' $null $staff.Token
    $available2 = Http GET 'api/boxes?status=Available&search=000&pageSize=3&page=2' $null $staff.Token
    $expectedAvailable = Sql 'SELECT COUNT(*) FROM dbo.physical_slot WHERE operator_id=@op AND status=''Available'' AND slot_code LIKE ''%000%''' @{ op = $farm.Id }
    Check 'Available search total matches SQL and excludes Maintenance' ($available1.total -eq $expectedAvailable -and @($available1.items | Where-Object { $_.status -ne 'Available' -or $_.slotCode -eq '0001' }).Count -eq 0)
    Check 'Filtered pagination has distinct ordered pages' (@($available1.items).Count -eq 3 -and @($available2.items).Count -eq 3 -and $available1.items[0].slotCode -eq '0002' -and $available2.items[0].slotCode -eq '0005')
    [void](Http PATCH 'api/boxes/0001' @{ status = 'Available' } $owner.Token)
    Check 'Over-capacity attempts leave box count unchanged' ((Sql 'SELECT COUNT(*) FROM dbo.physical_slot WHERE operator_id=@op' @{ op = $farm.Id }) -eq 1200)

    $script:currentVI = 'VI-04'
    [void](Http POST 'api/batches' $batchTemplate $staff.Token 403 'batch.owner_required')
    $invalidCapital = @{} + $batchTemplate
    $invalidCapital.minViableCapital = 80000000
    [void](Http POST 'api/batches' $invalidCapital $owner.Token 400)
    $batch = New-Batch $owner published $batchTemplate
    Check 'Created batch is editable Draft' ($batch.Result.status -eq 'Draft' -and $batch.Result.canEdit)
    $investor = Register investor Investor
    [void](Login $investor)
    [void](Http GET "api/batches/$($batch.Code)" $null $investor.Token 404 'batch.not_found')
    [void](Http POST "api/batches/$($batch.Code)/submit" $null $owner.Token 422 'batch.mortality_reserve_required')
    $missingReserve = @{ items = @($costs.items | Where-Object { $_.category -ne 'MortalityReserve' }); tranches = $costs.tranches }
    [void](Http PUT "api/batches/$($batch.Code)/standard-cost" $missingReserve $owner.Token 422 'batch.mortality_reserve_required')
    $saved = Http PUT "api/batches/$($batch.Code)/standard-cost" $costs $owner.Token
    Check 'Saved cost total, items and relative plans' ($saved.standardCost.total -eq 13500000 -and @($saved.standardCost.items).Count -eq 4 -and @($saved.standardCost.tranches).Count -eq 2)
    $reloaded = Http GET "api/operators/me/batches/$($batch.Code)" $null $owner.Token
    Check 'Draft cost reload retains relative milestones' ($reloaded.standardCost.tranches[0].anchorCode -eq 'FundingReady' -and $reloaded.standardCost.tranches[1].offsetDays -eq 7)
    $pending = Http POST "api/batches/$($batch.Code)/submit" $null $owner.Token
    Check 'Submission updates batch and cost together' ($pending.status -eq 'PendingApproval' -and $pending.standardCost.status -eq 'Submitted')
    [void](Http PUT "api/batches/$($batch.Code)" $batch.Body $owner.Token 422 'batch.invalid_transition')

    $script:currentVI = 'VI-05'
    [void](Http GET "api/batches/$($batch.Code)" $null $investor.Token 404 'batch.not_found')
    $revision = Http POST "api/admin/batches/$($batch.Code)/request-revision" @{ reason = "$RunId supplement schedule" } $admin.Token
    Check 'Admin returns submitted batch for revision' ($revision.batch.status -eq 'Draft')
    $v2 = Http PUT "api/batches/$($batch.Code)/standard-cost" $costs $owner.Token
    Check 'Revision creates cost version 2' ($v2.standardCost.versionNo -eq 2)
    [void](Http POST "api/batches/$($batch.Code)/submit" $null $owner.Token)
    $today = [DateTimeOffset]::UtcNow.ToOffset([TimeSpan]::FromHours(7)).Date.ToString('yyyy-MM-dd')
    $tiers = Sql @'
SELECT fee_tier_id, tier_code, fee_amount FROM dbo.fee_tier WHERE effective_from<=@today AND (effective_to IS NULL OR effective_to>=@today)
AND (@target>min_capital OR (min_inclusive=1 AND @target=min_capital))
AND (max_capital IS NULL OR @target<max_capital OR (max_inclusive=1 AND @target=max_capital))
'@ @{ today = $today; target = 75000000 } Table
    Check 'Exactly one existing effective fee tier matches' ($tiers.Rows.Count -eq 1)
    $fundingTimes = @{ fundingOpenAt = [DateTimeOffset]::UtcNow.AddMinutes(-1).ToString('o'); fundingDeadline = [DateTimeOffset]::UtcNow.AddDays(7).ToString('o') }
    [void](Http POST "api/admin/batches/$($batch.Code)/approve" $fundingTimes $owner.Token 403)
    $approval = Http POST "api/admin/batches/$($batch.Code)/approve" $fundingTimes $admin.Token
    Check 'Approval opens Funding and locks cost' ($approval.batch.status -eq 'Funding' -and $approval.batch.standardCost.status -eq 'Locked' -and $null -ne $approval.batch.standardCost.lockedAt)
    Check 'Approval snapshots existing fee tier and admin' ($approval.feeTierId -eq $tiers.Rows[0].fee_tier_id -and $approval.platformFeeAmount -eq $tiers.Rows[0].fee_amount -and $approval.approvedBy -eq $admin.UserId)
    Check 'Approval creates exactly two planned relative tranches' (@($approval.tranches).Count -eq 2 -and @($approval.tranches | Where-Object { $_.status -ne 'Planned' -or $null -ne $_.plannedDate }).Count -eq 0)
    $plannedTotal = ($approval.tranches | Measure-Object -Property plannedAmount -Sum).Sum
    Check 'Reserve and depreciation excluded from tranche amounts' ($plannedTotal -eq 12000000)
    $locked = Sql 'SELECT cost_version_id FROM dbo.standard_cost_version WHERE batch_id=@batch AND status=''Locked''' @{ batch = $batch.Id }
    Check 'One Locked version and one preserved superseded version' ((Sql 'SELECT COUNT(*) FROM dbo.standard_cost_version WHERE batch_id=@batch AND status=''Locked''' @{ batch = $batch.Id }) -eq 1 -and (Sql 'SELECT COUNT(*) FROM dbo.standard_cost_version WHERE batch_id=@batch AND status=''Superseded''' @{ batch = $batch.Id }) -eq 1)
    $audit = Sql 'SELECT audit_id,old_value,new_value FROM dbo.audit_log WHERE entity_type=''batch'' AND entity_id=@batch AND action_type=''approve'' AND actor_user_id=@admin' @{ batch = $batch.Id; admin = $admin.UserId } Table
    Check 'Approval audit has actor and before/after snapshots' ($audit.Rows.Count -eq 1 -and ($audit.Rows[0].old_value | ConvertFrom-Json).batch.status -eq 'PendingApproval' -and ($audit.Rows[0].new_value | ConvertFrom-Json).batch.status -eq 'Funding')
    [void](Http PUT "api/batches/$($batch.Code)" $batch.Body $owner.Token 422 'batch.cost_locked')
    [void](Http PUT "api/batches/$($batch.Code)/standard-cost" $costs $owner.Token 422 'batch.cost_locked')
    [void](Http POST "api/batches/$($batch.Code)/submit" $null $owner.Token 422 'batch.cost_locked')
    [void](Http POST "api/admin/batches/$($batch.Code)/approve" $fundingTimes $admin.Token 422 'batch.invalid_transition')
    $probeParams = @{ version = [long]$locked; batch = $batch.Id; audit = [long]$audit.Rows[0].audit_id }
    Rollback-Probe 'Locked item UPDATE' 'UPDATE dbo.standard_cost_item SET unit_price=unit_price+1 WHERE cost_version_id=@version' $probeParams 51008
    Rollback-Probe 'Locked item DELETE' 'DELETE dbo.standard_cost_item WHERE cost_version_id=@version' $probeParams 51008
    Rollback-Probe 'Locked item INSERT' 'INSERT dbo.standard_cost_item(cost_version_id,category,description,quantity,unit,unit_price,tranche_no) VALUES(@version,''Other'',''rollback-only'',1,''test'',1,1)' $probeParams 51008
    Rollback-Probe 'Locked plan UPDATE' 'UPDATE dbo.standard_cost_tranche_plan SET offset_days=offset_days+1 WHERE cost_version_id=@version' $probeParams 51008
    Rollback-Probe 'Locked plan DELETE' 'DELETE dbo.standard_cost_tranche_plan WHERE cost_version_id=@version' $probeParams 51008
    Rollback-Probe 'Locked plan INSERT' 'INSERT dbo.standard_cost_tranche_plan(cost_version_id,tranche_no,anchor_code,offset_days,unlock_condition) VALUES(@version,3,''FundingReady'',0,''rollback-only'')' $probeParams 51008
    Rollback-Probe 'Locked version UPDATE' 'UPDATE dbo.standard_cost_version SET status=''Draft'' WHERE cost_version_id=@version' $probeParams 51008
    # SQL Server may apply the existing item/plan FK before the AFTER DELETE lock trigger.
    Rollback-Probe 'Locked version DELETE (trigger or FK barrier)' 'DELETE dbo.standard_cost_version WHERE cost_version_id=@version' $probeParams @(51008,547)
    Rollback-Probe 'Locked cost replacement INSERT' 'INSERT dbo.standard_cost_version(batch_id,version_no,status) VALUES(@batch,3,''Draft'')' $probeParams 51008
    Rollback-Probe 'Audit UPDATE' 'UPDATE dbo.audit_log SET action_type=''rollback-only'' WHERE audit_id=@audit' $probeParams 50001
    Rollback-Probe 'Audit DELETE' 'DELETE dbo.audit_log WHERE audit_id=@audit' $probeParams 50001
    Check 'SQL probes leave Locked cost unchanged' ((Sql 'SELECT COUNT(*) FROM dbo.standard_cost_item WHERE cost_version_id=@version' $probeParams) -eq 4 -and (Sql 'SELECT COUNT(*) FROM dbo.standard_cost_tranche_plan WHERE cost_version_id=@version' $probeParams) -eq 2 -and (Sql 'SELECT status FROM dbo.standard_cost_version WHERE cost_version_id=@version' $probeParams) -eq 'Locked')
    $rejected = New-Batch $owner rejected $batchTemplate
    [void](Http PUT "api/batches/$($rejected.Code)/standard-cost" $costs $owner.Token)
    [void](Http POST "api/batches/$($rejected.Code)/submit" $null $owner.Token)
    $rejection = Http POST "api/admin/batches/$($rejected.Code)/reject" @{ reason = "$RunId terminal rejection" } $admin.Token
    Check 'Rejected batch records reason' ($rejection.batch.status -eq 'Rejected' -and $rejection.rejectionReason -eq "$RunId terminal rejection")
    [void](Http PUT "api/batches/$($rejected.Code)" $rejected.Body $owner.Token 422 'batch.invalid_transition')

    $script:currentVI = 'VI-06'
    $explore = Http GET "api/batches/$($batch.Code)" $null $investor.Token
    $view = Sql 'SELECT confirmed_capital,reserved_capital,investor_count,pct_of_target FROM dbo.v_batch_funding_progress WHERE batch_id=@batch' @{ batch = $batch.Id } Table
    Check 'Investor reads published terms and Locked cost' ($explore.status -eq 'Funding' -and $explore.targetCapital -eq 75000000 -and $explore.standardCost.status -eq 'Locked' -and $explore.standardCost.total -eq 13500000)
    Check 'Discovery progress exactly matches SQL view' ($explore.fundingProgress.confirmedCapital -eq $view.Rows[0].confirmed_capital -and $explore.fundingProgress.reservedCapital -eq $view.Rows[0].reserved_capital -and $explore.fundingProgress.investorCount -eq $view.Rows[0].investor_count -and [decimal]$explore.fundingProgress.pctOfTarget -eq [decimal]$view.Rows[0].pct_of_target)
    Check 'Zero funding is reported without creating contributions' ($explore.fundingProgress.confirmedCapital -eq 0 -and $explore.fundingProgress.reservedCapital -eq 0 -and $explore.fundingProgress.percentLabel -eq '0,00%')
    Check 'Discovery omits internal authoring fields' (-not ($explore.PSObject.Properties.Name -contains 'approvedBy') -and -not ($explore.PSObject.Properties.Name -contains 'canEdit'))
    $list = Http GET 'api/batches?status=Funding&crabType=SoftShellCrab&pageSize=100' $null $investor.Token
    Check 'Filtered discovery contains this published batch' (@($list.items | Where-Object { $_.batchCode -eq $batch.Code }).Count -eq 1)
    $drafts = Http GET 'api/batches?status=Draft&pageSize=100' $null $investor.Token
    Check 'Draft filter cannot expose unpublished batches' (@($drafts.items).Count -eq 0)
    [void](Http GET "api/batches/$($rejected.Code)" $null $investor.Token 404 'batch.not_found')

    $script:currentVI = 'VI-02 follow-up'
    $otherOwner = Register rejectowner
    $otherFarm = Profile $otherOwner rejectedfarm
    [void](Http POST 'api/operators/me/submit' $null $otherOwner.Token)
    $rejectFarm = Http POST "api/admin/operators/$($otherFarm.Id)/reject" @{ reason = "$RunId operator rejection" } $admin.Token
    Check 'Admin rejects a new submitted operator' ($rejectFarm.status -eq 'Rejected')
    $suspended = Http POST "api/admin/operators/$($farm.Id)/suspend" @{ reason = "$RunId operator suspension" } $admin.Token
    Check 'Admin suspends only this run approved operator' ($suspended.status -eq 'Suspended')
    [void](Http POST 'api/batches' $batchTemplate $owner.Token 422 'batch.operator_not_approved')
    [void](Http POST 'api/boxes/range' @{ from = 1201; to = 1201; width = 4 } $owner.Token 422 'box.operator_not_approved')
    Check 'Operator decisions all append actor audit rows' ((Sql 'SELECT COUNT(*) FROM dbo.audit_log WHERE entity_type=''operator'' AND entity_id=@farm AND actor_user_id=@admin AND action_type IN (''approve'',''suspend'')' @{ farm = $farm.Id; admin = $admin.UserId }) -eq 2)
    [void](Http DELETE "api/operators/me/members/$($staff.UserId)" $null $owner.Token 204)
    Check 'Staff removal deletes membership and role' ((Sql 'SELECT COUNT(*) FROM dbo.operator_member WHERE user_id=@user' @{ user = $staff.UserId }) -eq 0 -and (Sql 'SELECT COUNT(*) FROM dbo.app_user_role WHERE user_id=@user AND role_code=''OperatorMember''' @{ user = $staff.UserId }) -eq 0)
    [void](Http GET 'api/operators/me/members' $null $staff.Token 403 'operator.membership_required')
    [void](Http GET 'api/boxes' $null $staff.Token 403 'box.access_denied')
    [void](Http GET 'api/operators/me/batches' $null $staff.Token 403 'batch.access_denied')
    Check 'Fee tier count preserved' ((Sql 'SELECT COUNT_BIG(*) FROM dbo.fee_tier') -eq $script:metrics.baselineCounts.fee_tier)
    Check 'Fee tier configuration fingerprint preserved' ([string](Sql $feeFingerprintSql) -eq $script:metrics.feeTierFingerprint)
    Write-Host "All $($script:checks.Count) acceptance assertions passed. Bulk 1200: $($script:metrics.bulk1200Milliseconds) ms."
} catch {
    $message = $_.Exception.Message
    $script:failure = if ($message.StartsWith('Validation:')) { $message } else { 'Validation interrupted by ' + $_.Exception.GetType().Name + ' (details omitted to avoid exposing secrets).' }
    Write-Host $script:failure -ForegroundColor Red
} finally {
    if ($null -ne $script:client) { $script:client.Dispose() }
    $finished = [DateTimeOffset]::UtcNow
    if ($null -ne $script:runPath) {
        try {
            $script:metrics.finalCounts = [ordered]@{}
            foreach ($table in @('app_user','operator','batch','physical_slot','standard_cost_version','audit_log','fee_tier')) {
                $script:metrics.finalCounts[$table] = [long](Sql "SELECT COUNT_BIG(*) FROM dbo.$table")
            }
            $operatorIds = @($script:operators | Where-Object { $_['label'] -eq 'farm' } | ForEach-Object { $_['operatorId'] })
            $retainedCosts = [System.Collections.Generic.List[object]]::new()
            $retainedAccounts = [System.Collections.Generic.List[object]]::new()
            $retainedTranches = [System.Collections.Generic.List[object]]::new()
            $retainedAudit = [System.Collections.Generic.List[object]]::new()
            foreach ($entry in $script:batches) {
                $versions = Sql 'SELECT cost_version_id,version_no,status FROM dbo.standard_cost_version WHERE batch_id=@id ORDER BY version_no' @{ id = $entry.batchId } Table
                foreach ($row in $versions.Rows) { $retainedCosts.Add(@{ batchId = $entry.batchId; costVersionId = [long]$row.cost_version_id; versionNo = [int]$row.version_no; status = [string]$row.status }) }
                $accounts = Sql 'SELECT batch_account_id,status FROM dbo.batch_account WHERE batch_id=@id' @{ id = $entry.batchId } Table
                foreach ($row in $accounts.Rows) { $retainedAccounts.Add(@{ batchId = $entry.batchId; batchAccountId = [long]$row.batch_account_id; status = [string]$row.status }) }
                $tranches = Sql 'SELECT tranche_id,tranche_no,status FROM dbo.disbursement_tranche WHERE batch_id=@id' @{ id = $entry.batchId } Table
                foreach ($row in $tranches.Rows) { $retainedTranches.Add(@{ batchId = $entry.batchId; trancheId = [long]$row.tranche_id; trancheNo = [int]$row.tranche_no; status = [string]$row.status }) }
            }
            foreach ($entry in $script:users) {
                $auditRows = Sql 'SELECT audit_id,entity_type,entity_id,action_type FROM dbo.audit_log WHERE actor_user_id=@id ORDER BY audit_id' @{ id = $entry.userId } Table
                foreach ($row in $auditRows.Rows) { $retainedAudit.Add(@{ auditId = [long]$row.audit_id; actorUserId = $entry.userId; entityType = [string]$row.entity_type; entityId = [long]$row.entity_id; action = [string]$row.action_type }) }
            }
            $manifest = [ordered]@{
                runId = $RunId; startedAt = $script:started.ToString('o'); finishedAt = $finished.ToString('o')
                server = $ExpectedServer; database = $ExpectedDatabase; apiBaseUrl = $ApiBaseUrl.GetLeftPart([UriPartial]::Authority)
                users = $script:users.ToArray(); operators = $script:operators.ToArray(); batches = $script:batches.ToArray()
                costVersions = $retainedCosts.ToArray(); batchAccounts = $retainedAccounts.ToArray(); disbursementTranches = $retainedTranches.ToArray(); audit = $retainedAudit.ToArray()
                boxes = @{ operatorIds = $operatorIds; range = '0001..1200'; expectedCreated = 1200 }
                retained = $true; retentionReason = 'All identifiable validation fixtures intentionally retained; Locked costs and append-only audit records must not be deleted.'
                directCommittedSqlWrites = 'PlatformAdmin role for this run newly registered admin only'
                rollbackOnlySqlProbes = 'Cost item/plan/version mutation and append-only audit mutation'
                deferred = @('funding reservations','payments','contracts','stocking','contribution fixtures')
            }
            $summary = [ordered]@{
                runId = $RunId; passed = ($null -eq $script:failure); failure = $script:failure
                assertionCount = $script:checks.Count; passedAssertions = @($script:checks | Where-Object passed).Count
                durationSeconds = [math]::Round(($finished - $script:started).TotalSeconds, 2)
                metrics = $script:metrics; checks = $script:checks.ToArray()
            }
            $manifest | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $script:runPath 'manifest.json') -Encoding utf8
            $summary | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $script:runPath 'summary.json') -Encoding utf8
            $lines = @("# VI-01 through VI-06 local API validation", "", "Run: $RunId", "Database: $ExpectedServer/$ExpectedDatabase", "Result: $(if ($summary.passed) { 'PASS' } else { 'FAIL' })", "Assertions: $($summary.passedAssertions)/$($summary.assertionCount)", "Duration: $($summary.durationSeconds) seconds", "Bulk 1200 duration (HTTP round trip): $($script:metrics['bulk1200Milliseconds']) ms", "", 'All created fixtures are retained and identified in manifest.json. No reset, migration, cleanup, existing-account updates, or fee-configuration writes were performed. SQL trigger probes were rolled back independently of HTTP writes.', '', 'Funding reservation, payment, contract and stocking workflows were deferred. Funding progress was compared to the live SQL view with zero contributions.', '', '| Area | Passed assertions |', '| --- | ---: |')
            foreach ($group in ($script:checks | Group-Object { $_['vi'] })) { $lines += "| $($group.Name) | $(@($group.Group | Where-Object passed).Count)/$($group.Count) |" }
            if ($script:failure) { $lines += @('', $script:failure) }
            $lines | Set-Content -LiteralPath (Join-Path $script:runPath 'report.md') -Encoding utf8
            Write-Host "Sanitized manifest and results: $script:runPath"
        } catch { Write-Host ('Could not finish report: ' + $_.Exception.GetType().Name) -ForegroundColor Red; if (-not $script:failure) { $script:failure = 'Validation: report generation failed.' } }
    }
    $script:password = $null
    $script:sqlConnection = $null
}
if ($script:failure) { exit 1 }
