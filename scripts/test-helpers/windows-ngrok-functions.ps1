param(
  [Parameter(Mandatory=$true)][string]$LauncherPath,
  [Parameter(Mandatory=$true)][int]$InspectorPort,
  [string]$Case = "foreign",
  [string]$NodePath,
  [string]$TestDirectory,
  [int]$OwnedPid = 0,
  [int]$FallbackPort = 0
)
$ErrorActionPreference = "Stop"
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($LauncherPath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw "The packaged launcher does not parse." }
foreach ($functionName in @("Find-MaroTunnel", "Get-MaroTunnelConfigId", "Get-MaroOwnedNgrokProcess")) {
  $definition = $ast.Find({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $functionName
  }, $true)
  if (-not $definition) { throw "The packaged $functionName function is missing." }
  . ([scriptblock]::Create($definition.Extent.Text))
}
$name = "maro-0123456789abcdef0123456789abcdef"
if ($Case -eq "fixture-timeout") {
  Write-Output "TIMEOUT_READY"
  Start-Sleep -Seconds 120
  throw "The parent did not interrupt its fixture."
}
if ($Case -in @("fingerprint", "fingerprint-repeat")) {
  $env:MARO_LEDGER_PASSPHRASE = "isolated-fingerprint-key"
  $first = Get-MaroTunnelConfigId "http://127.0.0.1:39871" ([Uri]"https://owned-fixture.example") "fixture:synthetic-password" $false
  $same = Get-MaroTunnelConfigId "http://127.0.0.1:39871" ([Uri]"https://owned-fixture.example") "fixture:synthetic-password" $false
  if ($first -cne $same -or $first -match "synthetic-password") { throw "Configuration fingerprints are not stable and opaque." }
  Write-Output "FINGERPRINT $first"
  $variants = @(
    (Get-MaroTunnelConfigId "http://127.0.0.1:39872" ([Uri]"https://owned-fixture.example") "fixture:synthetic-password" $false),
    (Get-MaroTunnelConfigId "http://127.0.0.1:39871" ([Uri]"https://changed-fixture.example") "fixture:synthetic-password" $false),
    (Get-MaroTunnelConfigId "http://127.0.0.1:39871" ([Uri]"https://owned-fixture.example") "fixture:changed-password" $false),
    (Get-MaroTunnelConfigId "http://127.0.0.1:39871" ([Uri]"https://owned-fixture.example") "fixture:synthetic-password" $true)
  )
  $env:MARO_LEDGER_PASSPHRASE = "another-isolated-key"
  $variants += Get-MaroTunnelConfigId "http://127.0.0.1:39871" ([Uri]"https://owned-fixture.example") "fixture:synthetic-password" $false
  if ($variants -ccontains $first -or @($variants | Select-Object -Unique).Count -ne 5) { throw "A changed tunnel configuration could reuse the old fingerprint." }
} elseif ($Case -in @("ownership", "stale-stop", "valid-stop", "handle-retention")) {
  $owned = Get-Process -Id $OwnedPid
  $verifiedProcess = $null
  try {
    $details = Get-CimInstance Win32_Process -Filter "ProcessId = $($owned.Id)"
    $state = [pscustomobject]@{
      Version = 2; Pid = $owned.Id; EndpointName = $name; Executable = $details.ExecutablePath
      CreatedAtTicks = [string]$details.CreationDate.ToUniversalTime().Ticks
      AppDirectory = $TestDirectory; Target = "http://127.0.0.1:39871"
    }
    $verifiedProcess = Get-MaroOwnedNgrokProcess $state $TestDirectory
    if (-not $verifiedProcess) { throw "The actual owned process was not recognized." }
    if ($Case -eq "handle-retention") {
      if ($verifiedProcess -isnot [Diagnostics.Process]) { throw "Ownership did not retain an OS process handle." }
      $handle = $verifiedProcess.Handle
      $owned.Kill()
      if (-not $verifiedProcess.WaitForExit(5000) -or -not $verifiedProcess.HasExited -or $verifiedProcess.Handle -ne $handle) {
        throw "The verified handle did not retain the identity of the exited process."
      }
    } elseif ($Case -in @("stale-stop", "valid-stop")) {
      $stopAst = [Management.Automation.Language.Parser]::ParseFile((Join-Path (Split-Path $LauncherPath -Parent) "Stop-MARO.ps1"), [ref]$tokens, [ref]$errors)
      $stopFunction = $stopAst.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq "Stop-RecordedProcess" }, $true)
      . ([scriptblock]::Create($stopFunction.Extent.Text))
      $appDir = $TestDirectory
      if ($Case -eq "stale-stop") { $state.CreatedAtTicks = "0" }
      $statePath = Join-Path $TestDirectory "unverified-process.json"
      $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
      Stop-RecordedProcess $statePath "http://127.0.0.1:"
      $stillRunning = Get-Process -Id $owned.Id -ErrorAction SilentlyContinue
      if ($Case -eq "stale-stop" -and -not $stillRunning) { throw "A stale creation-time record stopped an unverified process." }
      if ($Case -eq "valid-stop" -and $stillRunning) { throw "The verified owned process did not stop." }
    } else {
      foreach ($change in @(
        @{ key = "Version"; value = 1 }, @{ key = "Pid"; value = -1 },
        @{ key = "EndpointName"; value = "maro-ffffffffffffffffffffffffffffffff" },
        @{ key = "CreatedAtTicks"; value = "0" }, @{ key = "Executable"; value = (Join-Path $TestDirectory "unrelated.exe") },
        @{ key = "AppDirectory"; value = (Join-Path $TestDirectory "other") },
        @{ key = "Target"; value = "http://127.0.0.1:39872" }
      )) {
        $changed = $state | ConvertTo-Json | ConvertFrom-Json
        $changed.($change.key) = $change.value
        $unexpected = Get-MaroOwnedNgrokProcess $changed $TestDirectory
        if ($unexpected) {
          if ($unexpected -is [Diagnostics.Process]) { $unexpected.Dispose() }
          throw "An unverified process identity was accepted: $($change.key)"
        }
      }
    }
  } finally {
    if ($verifiedProcess -is [Diagnostics.Process]) { $verifiedProcess.Dispose() }
    if (Get-Process -Id $owned.Id -ErrorAction SilentlyContinue) {
      Stop-Process -Id $owned.Id -Force
      Wait-Process -Id $owned.Id -Timeout 5 -ErrorAction SilentlyContinue
    }
  }
} else {
  # Exclude fresh .NET HTTP initialization from the per-response deadline tests.
  Add-Type -AssemblyName System.Net.Http
  $warmHandler = [Net.Http.HttpClientHandler]::new()
  $warmHandler.UseProxy = $false
  $warmClient = [Net.Http.HttpClient]::new($warmHandler)
  $warmClient.Timeout = [TimeSpan]::FromSeconds(5)
  try {
    $warmResponse = $warmClient.GetAsync("http://127.0.0.1:$InspectorPort/warm-up").GetAwaiter().GetResult()
    $warmResponse.Dispose()
  } finally { $warmClient.Dispose(); $warmHandler.Dispose() }
  $ports = @($InspectorPort)
  if ($FallbackPort) { $ports += $FallbackPort }
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $result = Find-MaroTunnel -targetPort 39871 -endpointName $name -expectedEndpoint ([Uri]"https://owned-fixture.example") -inspectorPorts $ports -timeoutMs 1000
  if ($Case -in @("valid", "localhost", "fallback")) {
    if (-not $result -or $result.name -cne $name -or $result.url -ne "https://owned-fixture.example") { throw "The expected owned endpoint was not returned." }
    if ($result.PSObject.Properties.Name -contains "traffic_policy") { throw "Inspector policy contents must not escape the lookup." }
  } elseif ($null -ne $result) { throw "An unrelated or invalid ngrok endpoint was accepted: $Case" }
  if ($watch.ElapsedMilliseconds -gt 2500) { throw "The inspector lookup exceeded its bounded response window." }
}
Write-Output "PASS Windows ngrok: $Case"
