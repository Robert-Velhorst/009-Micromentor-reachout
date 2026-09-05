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
foreach ($functionName in @("Find-MaroTunnel", "Get-MaroTunnelConfigId", "Get-MaroOwnedNgrokProcess", "Set-MaroAllowedHostsFile", "Set-MaroConfigurationFile", "Write-MaroNewConfiguration", "Remove-MaroTemporaryConfiguration", "Stop-MaroStartedNgrok")) {
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
if ($Case -eq "config-replace") {
  $filePath = Join-Path $TestDirectory "configuration.json"
  Set-MaroConfigurationFile $filePath '{"value":"first"}'
  $expected = '{"value":"caf' + [char]0x00e9 + '"}'
  Set-MaroConfigurationFile $filePath $expected
  if ([IO.File]::ReadAllText($filePath) -cne $expected) { throw "Configuration replacement did not retain exact UTF-8 content." }
  $allowedHostsFile = Join-Path $TestDirectory "normalized-hosts.json"
  Set-MaroAllowedHostsFile @("UPPER.example", "upper.example", "")
  $saved = Get-Content -LiteralPath $allowedHostsFile -Raw -Encoding UTF8 | ConvertFrom-Json
  if (@($saved.hosts).Count -ne 1 -or $saved.hosts[0] -cne "upper.example") { throw "Host normalization changed." }
  Set-MaroAllowedHostsFile @()
  if (@((Get-Content -LiteralPath $allowedHostsFile -Raw | ConvertFrom-Json).hosts).Count) { throw "Host revocation did not persist an empty list." }
  if (@(Get-ChildItem -LiteralPath $TestDirectory -Filter "*.tmp-*").Count) { throw "Successful configuration writing left temporary files." }
} elseif ($Case -eq "config-exclusive") {
  $filePath = Join-Path $TestDirectory "exclusive.json"
  [IO.File]::WriteAllText($filePath, "unowned-sentinel")
  $failed = $false
  try { Write-MaroNewConfiguration $filePath "replacement" } catch { $failed = $true }
  if (-not $failed -or [IO.File]::ReadAllText($filePath) -cne "unowned-sentinel") { throw "Exclusive creation changed or removed an existing file." }
} elseif ($Case -eq "config-locked-cleanup") {
  $filePath = Join-Path $TestDirectory "locked-policy.json"
  Write-MaroNewConfiguration $filePath "synthetic-sensitive-content"
  $lock = [IO.File]::Open($filePath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    $failure = $null
    try { Remove-MaroTemporaryConfiguration $filePath } catch { $failure = $_ }
    if (-not $failure -or -not $failure.Exception.Message.Contains($filePath) -or $failure.Exception.Message.Contains("synthetic-sensitive-content")) { throw "A blocked cleanup did not report its path without contents." }
    if (-not [IO.File]::Exists($filePath)) { throw "The deletion-refusal fixture was not effective." }
  } finally { $lock.Dispose() }
  Remove-MaroTemporaryConfiguration $filePath
  if ([IO.File]::Exists($filePath)) { throw "Cleanup after releasing the lock did not remove the owned file." }
} elseif ($Case -eq "config-locked-host") {
  $allowedHostsFile = Join-Path $TestDirectory "locked-hosts.json"
  $original = '{"hosts":["previous-fixture.example"]}'
  [IO.File]::WriteAllText($allowedHostsFile, $original)
  $lock = [IO.File]::Open($allowedHostsFile, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    $failed = $false
    try { Set-MaroAllowedHostsFile @("new-fixture.example") } catch { $failed = $true }
    if (-not $failed) { throw "A locked destination did not reject replacement." }
    if ([IO.File]::ReadAllText($allowedHostsFile) -cne $original) { throw "Failed replacement changed the previous hosts file." }
    if (@(Get-ChildItem -LiteralPath $TestDirectory -Filter "locked-hosts.json.tmp-*").Count) { throw "Failed host replacement left a temporary configuration file." }
  } finally { $lock.Dispose() }
} elseif ($Case -in @("config-locked-state", "config-locked-host-publication", "config-activation")) {
  $allowedHostsFile = Join-Path $TestDirectory "activation-hosts.json"
  [IO.File]::WriteAllText($allowedHostsFile, '{"hosts":[]}')
  $dataDir = $TestDirectory
  $appDir = $TestDirectory
  $ngrokStatePath = Join-Path $dataDir "MARO.ngrok.json"
  [IO.File]::WriteAllText($ngrokStatePath, '{"previous":true}')
  $lock = $null
  if ($Case -ne "config-activation") {
    $lockPath = if ($Case -eq "config-locked-state") { $ngrokStatePath } else { $allowedHostsFile }
    $lock = [IO.File]::Open($lockPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  }
  $startedNgrokProcess = Get-Process -Id $OwnedPid
  $null = $startedNgrokProcess.Handle
  $ngrokProcess = $startedNgrokProcess
  $activeTunnel = [pscustomobject]@{ url = "https://owned-fixture.example" }
  $endpointName = $name
  $configId = "isolated-config"
  $target = "http://127.0.0.1:39871"
  $actualHostWriter = ${function:Set-MaroAllowedHostsFile}
  $script:prematurePublication = $false
  $script:publicationsObserved = 0
  function Set-MaroAllowedHostsFile {
    param([string[]]$hosts)
    if (@($hosts).Count -gt 0) {
      $script:publicationsObserved++
      $recordedProcess = $null
      try {
        $record = Get-Content -LiteralPath $ngrokStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
        $recordedProcess = Get-MaroOwnedNgrokProcess $record $appDir
        if (-not $recordedProcess -or $recordedProcess.Id -ne $OwnedPid -or $record.ConfigId -cne $configId) { $script:prematurePublication = $true }
      } catch { $script:prematurePublication = $true }
      finally { if ($recordedProcess) { $recordedProcess.Dispose() } }
    }
    # Observe the boundary without changing the real file-write behavior.
    & $actualHostWriter $hosts
  }
  $activation = $ast.Find({ param($node)
    $node -is [Management.Automation.Language.IfStatementAst] -and
    $node.Clauses[0].Item1.Extent.Text -eq '$activeTunnel' -and
    $node.Clauses[0].Item2.Extent.Text.Contains("Set-MaroAllowedHostsFile")
  }, $true)
  if (-not $activation) { throw "The actual activation block was not found." }
  try {
    $failed = $false
    try { . ([scriptblock]::Create($activation.Extent.Text)) } catch { $failed = $true }
    if ($script:prematurePublication) { throw "A public host was authorized before valid owned-process registration." }
    if ($Case -eq "config-activation") {
      if ($script:publicationsObserved -ne 1) { throw "The valid publication boundary was not observed exactly once." }
      if ($failed -or $startedNgrokProcess.HasExited) { throw "Valid activation failed or stopped its agent." }
      $record = Get-Content -LiteralPath $ngrokStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
      $verified = Get-MaroOwnedNgrokProcess $record $appDir
      if (-not $verified) { throw "Successful activation did not persist verifiable process identity." }
      $verified.Dispose()
      $hosts = @((Get-Content -LiteralPath $allowedHostsFile -Raw | ConvertFrom-Json).hosts)
      if ($hosts.Count -ne 1 -or $hosts[0] -ne "owned-fixture.example") { throw "Successful activation did not publish its exact host." }
    } else {
      if (-not $failed) { throw "Locked configuration publication did not fail." }
      if (-not $startedNgrokProcess.WaitForExit(1000)) { throw "Failed state publication left the newly started agent alive." }
      if (@((Get-Content -LiteralPath $allowedHostsFile -Raw | ConvertFrom-Json).hosts).Count) { throw "Failed state publication authorized a public host." }
      if ($Case -eq "config-locked-state" -and [IO.File]::ReadAllText($ngrokStatePath) -cne '{"previous":true}') { throw "Failed state publication changed the previous record." }
    }
  } finally { if ($lock) { $lock.Dispose() }; $startedNgrokProcess.Dispose() }
} elseif ($Case -in @("config-locked-policy", "config-policy-create-failure", "config-startup")) {
  $savedTemp = $env:TEMP
  $env:TEMP = Join-Path $TestDirectory ($Case + " policy test")
  if ($Case -eq "config-policy-create-failure") { [IO.File]::WriteAllText($env:TEMP, "not-a-directory") }
  else { [void][IO.Directory]::CreateDirectory($env:TEMP) }
  $env:NGROK_BASIC_AUTH = "fixture:synthetic-policy-password"
  $ngrokEndpoint = $null
  $activeTunnel = $null
  $startedNgrokProcess = $null
  $port = 39871
  $target = "http://127.0.0.1:$port"
  $appDir = $TestDirectory
  $dataDir = $TestDirectory
  $ngrok = [pscustomobject]@{ Source = "test-boundary-only.exe" }
  $script:agentBoundaryReached = $false
  $script:policyLock = $null
  $script:capturedPolicy = $null
  function Start-Process {
    param($FilePath, $ArgumentList, $WorkingDirectory, $WindowStyle, $RedirectStandardOutput, $RedirectStandardError, [switch]$PassThru)
    $script:agentBoundaryReached = $true
    if ($FilePath -ne "test-boundary-only.exe" -or $WindowStyle -ne "Hidden" -or -not $PassThru) { throw "Unexpected process boundary arguments." }
    if (-not $ArgumentList.Contains('"--traffic-policy-file" "' + $policyPath + '"')) { throw "The policy path was not passed as one quoted argument." }
    $policy = Get-Content -LiteralPath $policyPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $action = $policy.on_http_request[0].actions[0]
    if ($action.type -ne "basic-auth" -or -not $action.config.enforce -or $action.config.credentials[0] -cne $env:NGROK_BASIC_AUTH) { throw "The real policy file differs from the requested protection." }
    $script:capturedPolicy = $policyPath
    if ($Case -eq "config-locked-policy") { $script:policyLock = [IO.File]::Open($policyPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read) }
    return Get-Process -Id $OwnedPid
  }
  function Find-MaroTunnel {
    param([int]$targetPort, [string]$endpointName, [Uri]$expectedEndpoint, [int]$timeoutMs)
    return [pscustomobject]@{ name = $endpointName; url = "https://owned-fixture.example" }
  }
  $startup = $ast.Find({ param($node)
    $node -is [Management.Automation.Language.IfStatementAst] -and
    $node.Clauses[0].Item1.Extent.Text -eq '-not $activeTunnel' -and
    $node.Clauses[0].Item2.Extent.Text.Contains('"maro-ngrok-policy-"')
  }, $true)
  if (-not $startup) { throw "The actual startup block was not found." }
  try {
    $failure = $null
    try { . ([scriptblock]::Create($startup.Extent.Text)) } catch { $failure = $_ }
    if ($Case -eq "config-startup") {
      if ($failure -or -not $script:agentBoundaryReached -or $startedNgrokProcess.HasExited -or -not $activeTunnel) { throw "Valid startup did not keep its owned process and endpoint." }
      if ([IO.File]::Exists($script:capturedPolicy)) { throw "Successful startup retained the credentials file." }
    } elseif ($Case -eq "config-policy-create-failure") {
      if (-not $failure -or $script:agentBoundaryReached) { throw "Failed policy creation reached agent startup." }
      if ([IO.File]::ReadAllText($env:TEMP) -cne "not-a-directory") { throw "Failed policy creation changed the existing obstruction." }
    } else {
      if (-not $failure -or -not $script:agentBoundaryReached -or -not $startedNgrokProcess.WaitForExit(1000)) { throw "A blocked policy cleanup did not fail and stop the new agent." }
      if (-not $failure.Exception.Message.Contains($script:capturedPolicy) -or $failure.Exception.Message.Contains($env:NGROK_BASIC_AUTH)) { throw "Blocked policy cleanup did not report only the retained file path." }
      if (-not [IO.File]::Exists($script:capturedPolicy)) { throw "The policy-lock fixture was ineffective." }
    }
  } finally {
    if ($script:policyLock) { $script:policyLock.Dispose() }
    if ($script:capturedPolicy) { Remove-MaroTemporaryConfiguration $script:capturedPolicy }
    if ($startedNgrokProcess) { $startedNgrokProcess.Dispose() }
    $env:TEMP = $savedTemp
  }
} elseif ($Case -in @("fingerprint", "fingerprint-repeat")) {
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
