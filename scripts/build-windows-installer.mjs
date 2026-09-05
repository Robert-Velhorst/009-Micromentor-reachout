import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifactsRoot = path.join(root, "artifacts", "windows-installer");
const appRoot = path.join(artifactsRoot, "app");
const appZip = path.join(artifactsRoot, "maro-app.zip");
const csharpSource = path.join(artifactsRoot, "MAROInstaller.cs");
const installerPath = path.join(root, "artifacts", "MARO-Windows11-Setup.exe");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const appVersion = String(packageJson.version || "0.0.0");
const publisher = "Noodzakelijk Online";
const cscPath = path.join(
  process.env.SystemRoot || "C:\\Windows",
  "Microsoft.NET",
  "Framework64",
  "v4.0.30319",
  "csc.exe"
);

function assertInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside ${parent}: ${child}`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
}

function copyDirectory(from, to) {
  fs.mkdirSync(to, { recursive: true });

  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const destination = path.join(to, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(source, destination);
    } else if (entry.isFile()) {
      fs.copyFileSync(source, destination);
    }
  }
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.replace(/\n/g, "\r\n"), "utf8");
}

if (process.platform !== "win32") {
  throw new Error("The Windows installer can only be built on Windows.");
}

const releaseNodeVersion = fs.readFileSync(path.join(root, ".node-version"), "utf8").trim();
if (process.versions.node !== releaseNodeVersion || process.arch !== "x64") {
  throw new Error(`Build the Windows x64 installer with Node.js ${releaseNodeVersion} x64 from .node-version; got ${process.version} ${process.arch}.`);
}

if (!fs.existsSync(path.join(root, "dist", "index.cjs"))) {
  throw new Error("dist/index.cjs is missing. Run npm run build before building the installer.");
}

if (!fs.existsSync(path.join(root, "dist", "public", "index.html"))) {
  throw new Error("dist/public/index.html is missing. Run npm run build before building the installer.");
}

if (!fs.existsSync(cscPath)) {
  throw new Error(`The .NET Framework C# compiler was not found at ${cscPath}.`);
}

for (const target of [artifactsRoot, appRoot, appZip, csharpSource, installerPath]) {
  assertInside(path.join(root, "artifacts"), target);
}

fs.rmSync(artifactsRoot, { recursive: true, force: true });
fs.mkdirSync(appRoot, { recursive: true });

copyDirectory(path.join(root, "dist"), path.join(appRoot, "dist"));
fs.mkdirSync(path.join(appRoot, "runtime"), { recursive: true });
fs.copyFileSync(process.execPath, path.join(appRoot, "runtime", "node.exe"));

writeText(
  path.join(appRoot, "MARO.cmd"),
  `@echo off
setlocal
set "APP_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%MARO.ps1"
set "MARO_EXIT=%ERRORLEVEL%"
if not "%MARO_EXIT%"=="0" (
  echo.
  echo MARO could not start. Review the message above, then press any key to close.
  pause >nul
)
exit /b %MARO_EXIT%
`
);

writeText(
  path.join(appRoot, "MARO.ps1"),
  `param()

$ErrorActionPreference = "Stop"
$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataPathFile = Join-Path $appDir "MARO.data-path.txt"

if (-not (Test-Path -LiteralPath $dataPathFile)) {
  throw "MARO's data-path configuration is missing. Reinstall MARO without deleting user data."
}

$dataDir = (Get-Content -LiteralPath $dataPathFile -Raw).Trim()
$keyPath = Join-Path $dataDir "ledger-key.dpapi"
if (-not (Test-Path -LiteralPath $keyPath)) {
  throw "MARO's protected ledger key is missing from $dataDir. Restore it or reinstall before opening the workspace."
}

Add-Type -AssemblyName System.Security
$entropy = [Text.Encoding]::UTF8.GetBytes("MARO ledger key v1")
$protectedKey = [IO.File]::ReadAllBytes($keyPath)
$clearKey = [Security.Cryptography.ProtectedData]::Unprotect(
  $protectedKey,
  $entropy,
  [Security.Cryptography.DataProtectionScope]::CurrentUser
)

try {
  $env:MARO_LEDGER_PASSPHRASE = [Text.Encoding]::UTF8.GetString($clearKey)
} finally {
  [Array]::Clear($clearKey, 0, $clearKey.Length)
}

$env:MARO_DATA_DIR = $dataDir
$allowedHostsFile = Join-Path $dataDir "MARO.allowed-hosts.json"
$env:MARO_ALLOWED_HOSTS_FILE = $allowedHostsFile
$env:HOST = "127.0.0.1"
$env:NODE_ENV = "production"
$env:MARO_APP_VERSION = "${appVersion}"
$ngrokEndpoint = $null
if ($env:MARO_NGROK_URL) {
  try { $ngrokEndpoint = [Uri]$env:MARO_NGROK_URL } catch { throw "MARO_NGROK_URL must be a valid HTTPS origin." }
  if ($ngrokEndpoint.Scheme -ne "https" -or $ngrokEndpoint.UserInfo -or $ngrokEndpoint.AbsolutePath -ne "/" -or $ngrokEndpoint.Query -or $ngrokEndpoint.Fragment) {
    throw "MARO_NGROK_URL must be an HTTPS origin without credentials, a path, query, or fragment."
  }
}

function Get-MaroHealth([int]$candidatePort) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$candidatePort/api/health" -TimeoutSec 1
    if ($health.service -eq "maro-ledger") { return $health }
  } catch {}
  return $null
}

function Set-MaroAllowedHostsFile([string[]]$hosts) {
  $normalized = @($hosts | Where-Object { $_ } | ForEach-Object { ([string]$_).ToLowerInvariant() } | Select-Object -Unique)
  $temporary = $allowedHostsFile + ".tmp-" + [guid]::NewGuid().ToString("N")
  $json = @{ hosts = $normalized } | ConvertTo-Json -Depth 3
  [IO.File]::WriteAllText($temporary, $json, [Text.UTF8Encoding]::new($false))
  Remove-Item -LiteralPath $allowedHostsFile -Force -ErrorAction SilentlyContinue
  Move-Item -LiteralPath $temporary -Destination $allowedHostsFile -Force
}

function Test-PortAvailable([int]$candidatePort) {
  $listener = $null
  try {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $candidatePort)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) { $listener.Stop() }
  }
}

$preferredPort = 3000
if ($env:PORT -and [int]::TryParse($env:PORT, [ref]$preferredPort) -and $preferredPort -gt 0 -and $preferredPort -le 65535) {
  $port = $preferredPort
} else {
  $port = 3000
}

$serverStatePath = Join-Path $dataDir "MARO.server.json"
$expectedNode = [IO.Path]::GetFullPath((Join-Path $appDir "runtime\\node.exe"))
$desiredRuntimeConfig = @{
  AppVersion = [string]$env:MARO_APP_VERSION
  AllowedHosts = [string]$env:MARO_ALLOWED_HOSTS
  BasicAuthConfigured = [bool]$env:NGROK_BASIC_AUTH
  PublicTunnelAllowed = ($env:MARO_ALLOW_PUBLIC_TUNNEL -eq "1")
  HaiFeedEnabled = ($env:MARO_HAI_FEED_ENABLED -eq "1")
  OutboundPaused = ($env:MARO_OUTBOUND_PAUSED -eq "1")
}
$health = $null
$runtimeRestartRequested = $false
if (Test-Path -LiteralPath $serverStatePath) {
  try {
    $state = Get-Content -LiteralPath $serverStatePath -Raw | ConvertFrom-Json
    $recordedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.Pid)" -ErrorAction Stop
    $recordedNode = [IO.Path]::GetFullPath($recordedProcess.ExecutablePath)
    if ($recordedNode -eq $expectedNode -and $recordedProcess.CommandLine -like "*dist\\index.cjs*") {
      $recordedPort = [int]$state.Port
      $health = Get-MaroHealth $recordedPort
      if ($health) {
        $runtimeConfigMatches =
          ([string]$state.AppVersion -eq $desiredRuntimeConfig.AppVersion) -and
          ([string]$state.AllowedHosts -eq $desiredRuntimeConfig.AllowedHosts) -and
          ([bool]$state.BasicAuthConfigured -eq $desiredRuntimeConfig.BasicAuthConfigured) -and
          ([bool]$state.PublicTunnelAllowed -eq $desiredRuntimeConfig.PublicTunnelAllowed) -and
          ([bool]$state.HaiFeedEnabled -eq $desiredRuntimeConfig.HaiFeedEnabled) -and
          ([bool]$state.OutboundPaused -eq $desiredRuntimeConfig.OutboundPaused)
        if ($runtimeConfigMatches) {
          $port = $recordedPort
        } else {
          $runtimeRestartRequested = $true
          & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $appDir "Stop-MARO.ps1")
          if ($LASTEXITCODE -ne 0) { throw "MARO could not restart after its runtime configuration changed." }
          $health = $null
        }
      }
    }
  } catch {
    if ($runtimeRestartRequested) { throw }
  }
  if (-not $health) { Remove-Item -LiteralPath $serverStatePath -Force -ErrorAction SilentlyContinue }
}

if (-not $health -and -not (Test-PortAvailable $port)) {
  $port = 3001..3099 | Where-Object { Test-PortAvailable $_ } | Select-Object -First 1
  if (-not $port) { throw "No free local port was found between 3001 and 3099." }
}

$env:PORT = [string]$port
$appUrl = "http://127.0.0.1:$port/"
$initialTunnelHosts = @()
Set-MaroAllowedHostsFile $initialTunnelHosts

if (-not $health) {
  $serverEntry = '"' + (Join-Path $appDir "dist\\index.cjs") + '"'
  $serverStdout = Join-Path $dataDir "server-startup.stdout.log"
  $serverStderr = Join-Path $dataDir "server-startup.stderr.log"
  Remove-Item -LiteralPath $serverStdout, $serverStderr -Force -ErrorAction SilentlyContinue
  $server = Start-Process -FilePath $expectedNode -ArgumentList $serverEntry -WorkingDirectory $appDir -WindowStyle Hidden -RedirectStandardOutput $serverStdout -RedirectStandardError $serverStderr -PassThru
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    Start-Sleep -Milliseconds 250
    $health = Get-MaroHealth $port
    if ($health) { break }
    if ($server.HasExited) { throw "MARO's local server exited before it became ready." }
  }
  if (-not $health) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    throw "MARO did not become ready at $appUrl"
  }
  Set-Content -LiteralPath (Join-Path $dataDir "MARO.server.pid") -Value ([string]$server.Id) -Encoding ASCII
  @{
    Pid = $server.Id
    Port = $port
    Executable = $expectedNode
    AppDirectory = $appDir
    AppVersion = $desiredRuntimeConfig.AppVersion
    AllowedHosts = $desiredRuntimeConfig.AllowedHosts
    BasicAuthConfigured = $desiredRuntimeConfig.BasicAuthConfigured
    PublicTunnelAllowed = $desiredRuntimeConfig.PublicTunnelAllowed
    HaiFeedEnabled = $desiredRuntimeConfig.HaiFeedEnabled
    OutboundPaused = $desiredRuntimeConfig.OutboundPaused
  } | ConvertTo-Json | Set-Content -LiteralPath $serverStatePath -Encoding UTF8
}

function Find-MaroTunnel([int]$targetPort, [string]$endpointName, [Uri]$expectedEndpoint, [int[]]$inspectorPorts = @(4040..4050), [int]$timeoutMs = 3300) {
  if (-not $endpointName -or $timeoutMs -le 0) { return $null }
  Add-Type -AssemblyName System.Net.Http
  $clock = [Diagnostics.Stopwatch]::StartNew()
  $handler = [Net.Http.HttpClientHandler]::new()
  $handler.UseProxy = $false
  $handler.AllowAutoRedirect = $false
  $client = [Net.Http.HttpClient]::new($handler)
  try {
    foreach ($inspectorPort in $inspectorPorts) {
      $remaining = $timeoutMs - [int]$clock.ElapsedMilliseconds
      if ($remaining -le 0) { break }
      $cancellation = [Threading.CancellationTokenSource]::new()
      $cancellation.CancelAfter([Math]::Min(300, $remaining))
      $response = $null
      try {
        # Default GetAsync completion includes buffering the entire response body.
        $response = $client.GetAsync("http://127.0.0.1:$inspectorPort/api/endpoints", $cancellation.Token).GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) { continue }
        $result = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
        foreach ($item in @($result.endpoints)) {
          if ([string]$item.name -cne $endpointName) { continue }
          $upstream = [Uri]$item.upstream.url
          $public = [Uri]$item.url
          if (-not $upstream.IsAbsoluteUri -or $upstream.Scheme -ne "http" -or $upstream.Host -notin @("127.0.0.1", "localhost") -or $upstream.Port -ne $targetPort -or $upstream.UserInfo -or $upstream.AbsolutePath -ne "/" -or $upstream.Query -or $upstream.Fragment) { continue }
          if (-not $public.IsAbsoluteUri -or $public.Scheme -ne "https" -or $public.UserInfo -or $public.AbsolutePath -ne "/" -or $public.Query -or $public.Fragment) { continue }
          if ($expectedEndpoint -and $public.GetLeftPart([UriPartial]::Authority) -ne $expectedEndpoint.GetLeftPart([UriPartial]::Authority)) { continue }
          return [pscustomobject]@{ name = $endpointName; url = $public.GetLeftPart([UriPartial]::Authority) }
        }
      } catch {
        # Ignore unrelated or unavailable inspectors; never follow their redirects.
      } finally {
        if ($response) { $response.Dispose() }
        $cancellation.Dispose()
      }
    }
  } finally {
    $client.Dispose()
    $handler.Dispose()
  }
  return $null
}

function Get-MaroTunnelConfigId([string]$target, [Uri]$endpoint, [string]$credentials, [bool]$allowPublic) {
  if (-not $env:MARO_LEDGER_PASSPHRASE) { throw "The workspace key is required to protect tunnel configuration fingerprints." }
  $keyBytes = [Text.Encoding]::UTF8.GetBytes($env:MARO_LEDGER_PASSPHRASE)
  $configBytes = [Text.Encoding]::UTF8.GetBytes(([ordered]@{ target = $target; endpoint = [string]$endpoint; credentials = $credentials; public = $allowPublic } | ConvertTo-Json -Compress))
  $hmac = [Security.Cryptography.HMACSHA256]::new()
  try {
    $hmac.Key = $keyBytes
    return [Convert]::ToBase64String($hmac.ComputeHash($configBytes))
  } finally {
    $hmac.Dispose()
    [Array]::Clear($keyBytes, 0, $keyBytes.Length)
    [Array]::Clear($configBytes, 0, $configBytes.Length)
  }
}

function Get-MaroOwnedNgrokProcess($state, [string]$appDirectory) {
  $runtimeProcess = $null
  $verified = $false
  try {
    if ($state.Version -ne 2 -or $state.EndpointName -notmatch "^maro-[a-f0-9]{32}$" -or -not $state.CreatedAtTicks) { return $null }
    if ([IO.Path]::GetFullPath([string]$state.AppDirectory) -ne [IO.Path]::GetFullPath($appDirectory)) { return $null }
    $target = [Uri]$state.Target
    if (-not $target.IsAbsoluteUri -or $target.Scheme -ne "http" -or $target.Host -ne "127.0.0.1" -or $target.UserInfo -or $target.AbsolutePath -ne "/" -or $target.Query -or $target.Fragment) { return $null }
    $ownedPid = 0
    if (-not [int]::TryParse([string]$state.Pid, [ref]$ownedPid) -or $ownedPid -le 0) { return $null }
    $runtimeProcess = [Diagnostics.Process]::GetProcessById($ownedPid)
    # Retain the OS handle before checking identity, through any later stop operation.
    $null = $runtimeProcess.Handle
    $details = Get-CimInstance Win32_Process -Filter "ProcessId = $ownedPid" -ErrorAction Stop
    if ([IO.Path]::GetFullPath($details.ExecutablePath) -ne [IO.Path]::GetFullPath([string]$state.Executable)) { return $null }
    if ([string]$details.CreationDate.ToUniversalTime().Ticks -ne [string]$state.CreatedAtTicks) { return $null }
    if (-not $details.CommandLine.Contains('"' + [string]$state.Target + '"') -or -not $details.CommandLine.Contains('"' + [string]$state.EndpointName + '"')) { return $null }
    if ($runtimeProcess.HasExited) { return $null }
    $verified = $true
    return $runtimeProcess
  } catch { return $null } finally {
    if ($runtimeProcess -and -not $verified) { $runtimeProcess.Dispose() }
  }
}

$ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
if ($env:MARO_SKIP_NGROK -ne "1" -and $ngrok -and ($env:NGROK_BASIC_AUTH -or $env:MARO_ALLOW_PUBLIC_TUNNEL -eq "1")) {
  Set-MaroAllowedHostsFile @()
  $target = "http://127.0.0.1:$port"
  $configId = Get-MaroTunnelConfigId $target $ngrokEndpoint $env:NGROK_BASIC_AUTH ($env:MARO_ALLOW_PUBLIC_TUNNEL -eq "1")
  $ngrokStatePath = Join-Path $dataDir "MARO.ngrok.json"
  $activeTunnel = $null
  $ownedNgrok = $null
  if (Test-Path -LiteralPath $ngrokStatePath) {
    try {
      $ngrokState = Get-Content -LiteralPath $ngrokStatePath -Raw | ConvertFrom-Json
      $ownedNgrok = Get-MaroOwnedNgrokProcess $ngrokState $appDir
      if ($ownedNgrok) {
        if ($ngrokState.Target -eq $target -and $ngrokState.ConfigId -ceq $configId) {
          $activeTunnel = Find-MaroTunnel $port $ngrokState.EndpointName $ngrokEndpoint
          if ($ownedNgrok.HasExited) { $activeTunnel = $null }
        }
        if (-not $activeTunnel) {
          if (-not $ownedNgrok.HasExited) {
            try { $ownedNgrok.Kill() } catch { if (-not $ownedNgrok.HasExited) { throw } }
          }
          if (-not $ownedNgrok.WaitForExit(5000)) { throw "The previous MARO tunnel did not stop." }
        }
      }
    } catch {
      if ($ownedNgrok) { throw }
      # Never reuse or terminate a process based only on a stale record or port.
    } finally {
      if ($ownedNgrok) { $ownedNgrok.Dispose() }
    }
  }
  $startedNgrokProcess = $null
  if (-not $activeTunnel) {
    $endpointName = "maro-" + [guid]::NewGuid().ToString("N")
    $ngrokArguments = @("http", $target, "--name", $endpointName)
    if ($ngrokEndpoint) { $ngrokArguments += @("--url", $ngrokEndpoint.AbsoluteUri.TrimEnd("/")) }
    $policyPath = $null
    if ($env:NGROK_BASIC_AUTH) {
      $separator = $env:NGROK_BASIC_AUTH.IndexOf(":")
      $passwordLength = if ($separator -ge 0) { $env:NGROK_BASIC_AUTH.Length - $separator - 1 } else { 0 }
      if ($separator -le 0 -or $passwordLength -lt 8 -or $passwordLength -gt 128 -or $env:NGROK_BASIC_AUTH -match "[\\r\\n]") {
        throw "NGROK_BASIC_AUTH must use user:password with an 8-128 character password and no line breaks."
      }
      $policyPath = Join-Path $env:TEMP ("maro-ngrok-policy-" + [guid]::NewGuid().ToString("N") + ".json")
      $policyJson = @{
        on_http_request = @(
          @{
            actions = @(
              @{
                type = "basic-auth"
                config = @{ credentials = @($env:NGROK_BASIC_AUTH); enforce = $true; realm = "MARO" }
              }
            )
          }
        )
      } | ConvertTo-Json -Depth 8
      [IO.File]::WriteAllText($policyPath, $policyJson, [Text.UTF8Encoding]::new($false))
      $ngrokArguments += @("--traffic-policy-file", $policyPath)
    }
    $ngrokStdout = Join-Path $dataDir "ngrok-startup.stdout.log"
    $ngrokStderr = Join-Path $dataDir "ngrok-startup.stderr.log"
    Remove-Item -LiteralPath $ngrokStdout, $ngrokStderr -Force -ErrorAction SilentlyContinue
    try {
      $quotedArguments = ($ngrokArguments | ForEach-Object {
        if ($_.Contains('"') -or $_.Contains([char]13) -or $_.Contains([char]10)) { throw "Invalid character in an ngrok startup argument." }
        '"' + $_ + '"'
      }) -join " "
      $ngrokProcess = Start-Process -FilePath $ngrok.Source -ArgumentList $quotedArguments -WorkingDirectory $appDir -WindowStyle Hidden -RedirectStandardOutput $ngrokStdout -RedirectStandardError $ngrokStderr -PassThru
      $startedNgrokProcess = $ngrokProcess
      $discoveryClock = [Diagnostics.Stopwatch]::StartNew()
      while ($discoveryClock.ElapsedMilliseconds -lt 15000) {
        if ($ngrokProcess.HasExited) { break }
        $remaining = 15000 - [int]$discoveryClock.ElapsedMilliseconds
        $activeTunnel = Find-MaroTunnel $port $endpointName $ngrokEndpoint -timeoutMs ([Math]::Min(3300, $remaining))
        if ($activeTunnel) { break }
        Start-Sleep -Milliseconds 100
      }
    } finally {
      if ($policyPath) { Remove-Item -LiteralPath $policyPath -Force -ErrorAction SilentlyContinue }
    }
  }

  if ($activeTunnel) {
    try {
      $activeTunnelHost = ([Uri]$activeTunnel.url).Host
      Set-MaroAllowedHostsFile @($activeTunnelHost)
    } catch {
      if ($startedNgrokProcess) { Stop-Process -Id $startedNgrokProcess.Id -Force -ErrorAction SilentlyContinue }
      throw "ngrok returned an invalid public endpoint URL. The local app remains available."
    }
    if ($startedNgrokProcess) {
      $ngrokDetails = Get-CimInstance Win32_Process -Filter "ProcessId = $($ngrokProcess.Id)"
      @{
        Version = 2
        Pid = $ngrokProcess.Id
        Executable = $ngrokDetails.ExecutablePath
        CreatedAtTicks = [string]$ngrokDetails.CreationDate.ToUniversalTime().Ticks
        AppDirectory = $appDir
        EndpointName = $endpointName
        ConfigId = $configId
        Target = $target
      } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataDir "MARO.ngrok.json") -Encoding UTF8
    }
  } else {
    if ($startedNgrokProcess -and -not $startedNgrokProcess.HasExited) {
      Stop-Process -Id $startedNgrokProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Set-MaroAllowedHostsFile $initialTunnelHosts
    Write-Warning "ngrok could not open a MARO endpoint. The local app remains available; review $ngrokStderr."
  }
}

if ($env:MARO_SKIP_BROWSER -ne "1") {
  Start-Process $appUrl
}
Write-Host "MARO is ready at $appUrl"
if (-not $ngrok) {
  Write-Host "ngrok is not installed; MARO remains local-only."
} elseif (-not $env:NGROK_BASIC_AUTH -and $env:MARO_ALLOW_PUBLIC_TUNNEL -ne "1") {
  Write-Host "The public tunnel remains off. Set NGROK_BASIC_AUTH to enable protected cloud access."
}
`
);

writeText(
  path.join(appRoot, "Stop-MARO.ps1"),
  `param()

$ErrorActionPreference = "Stop"
$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataPathFile = Join-Path $appDir "MARO.data-path.txt"
if (-not (Test-Path -LiteralPath $dataPathFile)) { exit 0 }
$dataDir = (Get-Content -LiteralPath $dataPathFile -Raw).Trim()

function Stop-RecordedProcess([string]$statePath, [string]$requiredMarker) {
  if (-not (Test-Path -LiteralPath $statePath)) { return }
  $ownedProcessId = $null
  $runtimeProcess = $null
  try {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $recordedPid = 0
    if (-not [int]::TryParse([string]$state.Pid, [ref]$recordedPid) -or $recordedPid -le 0) { return }
    $runtimeProcess = [Diagnostics.Process]::GetProcessById($recordedPid)
    $null = $runtimeProcess.Handle
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $recordedPid" -ErrorAction Stop
    $actualExecutable = [IO.Path]::GetFullPath($process.ExecutablePath)
    $expectedExecutable = [IO.Path]::GetFullPath([string]$state.Executable)
    if ($requiredMarker -eq "http://127.0.0.1:") {
      if ($state.Version -ne 2 -or $state.EndpointName -notmatch "^maro-[a-f0-9]{32}$" -or -not $state.CreatedAtTicks) { return }
      if ([IO.Path]::GetFullPath([string]$state.AppDirectory) -ne [IO.Path]::GetFullPath($appDir)) { return }
      if ([string]$process.CreationDate.ToUniversalTime().Ticks -ne [string]$state.CreatedAtTicks) { return }
      $target = [Uri]$state.Target
      if (-not $target.IsAbsoluteUri -or $target.Scheme -ne "http" -or $target.Host -ne "127.0.0.1" -or $target.UserInfo -or $target.AbsolutePath -ne "/" -or $target.Query -or $target.Fragment) { return }
      if (-not $process.CommandLine.Contains('"' + [string]$state.Target + '"') -or -not $process.CommandLine.Contains('"' + [string]$state.EndpointName + '"')) { return }
    }
    if ($actualExecutable -eq $expectedExecutable -and $process.CommandLine -like "*$requiredMarker*") {
      $ownedProcessId = [int]$state.Pid
      if (-not $runtimeProcess.HasExited) {
        try { $runtimeProcess.Kill() } catch { if (-not $runtimeProcess.HasExited) { throw } }
      }
      for ($attempt = 0; $attempt -lt 100; $attempt += 1) {
        if (-not (Get-Process -Id $ownedProcessId -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 100
      }
      if (Get-Process -Id $ownedProcessId -ErrorAction SilentlyContinue) {
        throw "MARO could not stop its owned process $ownedProcessId. Close it before upgrading or uninstalling."
      }
    }
  } catch {
    if ($ownedProcessId) { throw }
    # Never stop an unverified process; ngrok also requires its creation time and exact endpoint identity.
  } finally {
    if (-not $ownedProcessId -or -not (Get-Process -Id $ownedProcessId -ErrorAction SilentlyContinue)) {
      Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
    }
    if ($runtimeProcess) { $runtimeProcess.Dispose() }
  }
}

Stop-RecordedProcess (Join-Path $dataDir "MARO.ngrok.json") "http://127.0.0.1:"
Stop-RecordedProcess (Join-Path $dataDir "MARO.server.json") "dist\\index.cjs"
Remove-Item -LiteralPath (Join-Path $dataDir "MARO.server.pid") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $dataDir "MARO.allowed-hosts.json") -Force -ErrorAction SilentlyContinue
`
);

writeText(
  path.join(appRoot, "Uninstall-MARO.cmd"),
  `@echo off
setlocal
set "APP_DIR=%~dp0"
if "%APP_DIR%"=="" exit /b 1
if not exist "%APP_DIR%MARO.install.json" (
  echo This does not look like a MARO install directory.
  exit /b 1
)
set "START_MENU=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\MARO"
set "DESKTOP_LINK=%USERPROFILE%\\Desktop\\MARO.lnk"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%Stop-MARO.ps1" >nul 2>nul
reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MARO" /f >nul 2>nul
del "%DESKTOP_LINK%" >nul 2>nul
rmdir /s /q "%START_MENU%" >nul 2>nul
echo MARO will be removed from %APP_DIR%
echo Workspace data is retained outside the application directory.
cd /d "%TEMP%"
start "MARO uninstall cleanup" /min cmd /c "timeout /t 2 /nobreak >nul & rmdir /s /q ""%APP_DIR%"""
exit /b 0
`
);

writeText(
  path.join(appRoot, "MARO.install.json"),
  JSON.stringify(
    {
      name: "MARO",
      displayName: "MARO - Micromentor Reachout Console",
      version: appVersion,
      nodeVersion: process.versions.node,
      architecture: process.arch,
      publisher,
      installedBy: "MARO Windows installer",
    },
    null,
    2
  )
);

writeText(
  path.join(appRoot, "README-INSTALL.txt"),
  `MARO - Micromentor Reachout Console
Version ${appVersion}

Open MARO from the Start Menu shortcut named "MARO".

The app runs locally at http://127.0.0.1:3000/ or the next available local port.
Workspace data is stored separately in %LOCALAPPDATA%\MARO-Data and encrypted with a Windows DPAPI-protected key.
If ngrok is installed, the launcher opens a tunnel only when NGROK_BASIC_AUTH is set.
Set MARO_ALLOW_PUBLIC_TUNNEL=1 only when unauthenticated public access is intentional.

To remove MARO, use Windows Settings > Apps > Installed apps, or run the Start Menu shortcut named "Uninstall MARO".
Uninstalling keeps workspace data so an accidental removal or later reinstall does not erase outreach history.
`
);

if (fs.existsSync(appZip)) {
  fs.unlinkSync(appZip);
}

run(
  "powershell",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "$ProgressPreference='SilentlyContinue'; Compress-Archive -Force -Path * -DestinationPath $env:APP_ZIP",
  ],
  { cwd: appRoot, env: { ...process.env, APP_ZIP: appZip } }
);

writeText(
  csharpSource,
  `using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Microsoft.Win32;

[assembly: AssemblyTitle("MARO Windows 11 Setup")]
[assembly: AssemblyDescription("Installer for MARO - Micromentor Reachout Console")]
[assembly: AssemblyCompany("${publisher}")]
[assembly: AssemblyProduct("MARO")]
[assembly: AssemblyCopyright("Copyright ${publisher}")]
[assembly: AssemblyVersion("${appVersion}.0")]
[assembly: AssemblyFileVersion("${appVersion}.0")]

namespace MAROInstaller
{
    internal static class Program
    {
        private const string ResourceName = "MaroPayloadZip";
        private const string AppVersion = "${appVersion}";
        private const string Publisher = "${publisher}";
        private const string KeyEntropy = "MARO ledger key v1";

        private static int Main()
        {
            try
            {
                string installDir = Environment.GetEnvironmentVariable("MARO_INSTALL_DIR");
                if (String.IsNullOrWhiteSpace(installDir))
                {
                    installDir = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "MARO"
                    );
                }

                installDir = Path.GetFullPath(installDir);
                string dataDir = ResolveDataDirectory();
                EnsureSeparateDataDirectory(installDir, dataDir);
                string tempZip = Path.Combine(Path.GetTempPath(), "maro-app-" + Guid.NewGuid().ToString("N") + ".zip");

                try
                {
                    ExtractEmbeddedPayload(tempZip);
                    StopExistingRuntime(installDir);
                    MigrateLegacyData(Path.Combine(installDir, "data"), dataDir);
                    EnsureProtectedLedgerKey(dataDir);
                    InstallPayloadAtomically(tempZip, installDir, dataDir);
                }
                finally
                {
                    if (File.Exists(tempZip))
                    {
                        File.Delete(tempZip);
                    }
                }

                if (Environment.GetEnvironmentVariable("MARO_SKIP_SHORTCUTS") != "1")
                {
                    CreateShortcut(
                        Path.Combine(
                            Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                            "MARO",
                            "MARO.lnk"
                        ),
                        Path.Combine(installDir, "MARO.cmd"),
                        installDir
                    );
                    CreateShortcut(
                        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "MARO.lnk"),
                        Path.Combine(installDir, "MARO.cmd"),
                        installDir
                    );
                    CreateShortcut(
                        Path.Combine(
                            Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                            "MARO",
                            "Uninstall MARO.lnk"
                        ),
                        Path.Combine(installDir, "Uninstall-MARO.cmd"),
                        installDir
                    );
                }

                if (Environment.GetEnvironmentVariable("MARO_SKIP_REGISTRY") != "1")
                {
                    RegisterUninstallEntry(installDir, dataDir);
                }

                Console.WriteLine("MARO has been installed to " + installDir);
                Console.WriteLine("Workspace data is protected at " + dataDir);

                if (Environment.GetEnvironmentVariable("MARO_SKIP_LAUNCH") != "1")
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = Path.Combine(installDir, "MARO.cmd"),
                        WorkingDirectory = installDir,
                        UseShellExecute = true
                    });
                }

                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("MARO installer failed: " + ex.Message);
                return 1;
            }
        }

        private static void ExtractEmbeddedPayload(string destination)
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            using (Stream input = assembly.GetManifestResourceStream(ResourceName))
            {
                if (input == null)
                {
                    throw new InvalidOperationException("Embedded MARO payload was not found.");
                }

                using (FileStream output = File.Create(destination))
                {
                    input.CopyTo(output);
                }
            }
        }

        private static void StopExistingRuntime(string installDir)
        {
            string installMarker = Path.Combine(installDir, "MARO.install.json");
            string stopScript = Path.Combine(installDir, "Stop-MARO.ps1");
            if (!File.Exists(installMarker) || !File.Exists(stopScript))
            {
                return;
            }

            ProcessStartInfo start = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -File \\\"" + stopScript + "\\\"",
                WorkingDirectory = installDir,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using (Process process = Process.Start(start))
            {
                if (process == null)
                {
                    throw new InvalidOperationException("MARO could not start its existing runtime stop helper.");
                }
                if (!process.WaitForExit(30000))
                {
                    try { process.Kill(); } catch {}
                    throw new IOException("MARO's existing runtime did not stop within 30 seconds. Close MARO and retry the installer.");
                }
                if (process.ExitCode != 0)
                {
                    throw new IOException("MARO's existing runtime could not be stopped safely. Close MARO and retry the installer.");
                }
            }
        }

        private static string ResolveDataDirectory()
        {
            string configured = Environment.GetEnvironmentVariable("MARO_USER_DATA_DIR");
            if (!String.IsNullOrWhiteSpace(configured))
            {
                return Path.GetFullPath(configured);
            }

            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MARO-Data"
            );
        }

        private static void EnsureSeparateDataDirectory(string installDir, string dataDir)
        {
            string normalizedInstall = installDir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string normalizedData = dataDir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string installPrefix = normalizedInstall + Path.DirectorySeparatorChar;
            if (normalizedData.Equals(normalizedInstall, StringComparison.OrdinalIgnoreCase) ||
                normalizedData.StartsWith(installPrefix, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("MARO_USER_DATA_DIR must be outside the replaceable application directory.");
            }
        }

        private static void EnsureProtectedLedgerKey(string dataDir)
        {
            Directory.CreateDirectory(dataDir);
            string keyPath = Path.Combine(dataDir, "ledger-key.dpapi");
            if (File.Exists(keyPath))
            {
                try
                {
                    byte[] protectedKey = File.ReadAllBytes(keyPath);
                    byte[] validationEntropy = Encoding.UTF8.GetBytes(KeyEntropy);
                    byte[] clear = ProtectedData.Unprotect(protectedKey, validationEntropy, DataProtectionScope.CurrentUser);
                    if (clear.Length == 0) throw new InvalidDataException("Protected key is empty.");
                    Array.Clear(clear, 0, clear.Length);
                }
                catch (Exception ex)
                {
                    throw new InvalidDataException("The existing MARO ledger key cannot be opened by this Windows user. It was preserved: " + ex.Message);
                }
                return;
            }

            byte[] clearKey = new byte[32];
            using (RandomNumberGenerator random = RandomNumberGenerator.Create())
            {
                random.GetBytes(clearKey);
            }

            byte[] passphrase = Encoding.UTF8.GetBytes(Convert.ToBase64String(clearKey));
            byte[] entropy = Encoding.UTF8.GetBytes(KeyEntropy);
            try
            {
                byte[] protectedKey = ProtectedData.Protect(passphrase, entropy, DataProtectionScope.CurrentUser);
                string temporaryKey = keyPath + ".tmp-" + Guid.NewGuid().ToString("N");
                File.WriteAllBytes(temporaryKey, protectedKey);
                File.Move(temporaryKey, keyPath);
            }
            finally
            {
                Array.Clear(clearKey, 0, clearKey.Length);
                Array.Clear(passphrase, 0, passphrase.Length);
            }
        }

        private static void MigrateLegacyData(string legacyDataDir, string dataDir)
        {
            if (!Directory.Exists(legacyDataDir))
            {
                return;
            }

            Directory.CreateDirectory(dataDir);
            foreach (string source in Directory.GetFiles(legacyDataDir, "*", SearchOption.AllDirectories))
            {
                string relative = source.Substring(legacyDataDir.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string destination = Path.Combine(dataDir, relative);
                Directory.CreateDirectory(Path.GetDirectoryName(destination));

                if (!File.Exists(destination))
                {
                    File.Copy(source, destination, false);
                    continue;
                }

                if (!FilesEqual(source, destination))
                {
                    string preserved = destination + ".legacy-" + DateTime.UtcNow.ToString("yyyyMMddHHmmss") + "-" + Guid.NewGuid().ToString("N");
                    File.Copy(source, preserved, false);
                }
            }
        }

        private static bool FilesEqual(string first, string second)
        {
            FileInfo left = new FileInfo(first);
            FileInfo right = new FileInfo(second);
            if (left.Length != right.Length)
            {
                return false;
            }

            using (SHA256 hash = SHA256.Create())
            using (FileStream leftStream = File.OpenRead(first))
            using (FileStream rightStream = File.OpenRead(second))
            {
                byte[] leftHash = hash.ComputeHash(leftStream);
                byte[] rightHash = hash.ComputeHash(rightStream);
                for (int index = 0; index < leftHash.Length; index++)
                {
                    if (leftHash[index] != rightHash[index]) return false;
                }
                return true;
            }
        }

        private static void InstallPayloadAtomically(string payloadZip, string installDir, string dataDir)
        {
            string parent = Path.GetDirectoryName(installDir);
            Directory.CreateDirectory(parent);
            string staging = installDir + ".installing-" + Guid.NewGuid().ToString("N");
            string previous = installDir + ".previous-" + Guid.NewGuid().ToString("N");
            ZipFile.ExtractToDirectory(payloadZip, staging);
            File.WriteAllText(Path.Combine(staging, "MARO.data-path.txt"), dataDir, new UTF8Encoding(false));

            bool previousMoved = false;
            try
            {
                if (Directory.Exists(installDir))
                {
                    MoveDirectoryWithRetry(installDir, previous);
                    previousMoved = true;
                }

                MoveDirectoryWithRetry(staging, installDir);
                if (previousMoved)
                {
                    TryDeleteDirectory(previous);
                }
            }
            catch
            {
                TryDeleteDirectory(staging);
                if (previousMoved && !Directory.Exists(installDir) && Directory.Exists(previous))
                {
                    MoveDirectoryWithRetry(previous, installDir);
                }
                throw;
            }
        }

        private static void MoveDirectoryWithRetry(string source, string destination)
        {
            Exception lastError = null;
            for (int attempt = 0; attempt < 40; attempt++)
            {
                try
                {
                    Directory.Move(source, destination);
                    return;
                }
                catch (IOException ex)
                {
                    lastError = ex;
                }
                catch (UnauthorizedAccessException ex)
                {
                    lastError = ex;
                }

                if (attempt < 39) Thread.Sleep(250);
            }

            throw new IOException(
                "MARO could not replace its application files after waiting for Windows to release them. " +
                "Close MARO and retry the installer; workspace data was not changed.",
                lastError
            );
        }

        private static void TryDeleteDirectory(string directory)
        {
            for (int attempt = 0; attempt < 20; attempt++)
            {
                try
                {
                    if (Directory.Exists(directory)) Directory.Delete(directory, true);
                    return;
                }
                catch (IOException) {}
                catch (UnauthorizedAccessException) {}

                if (attempt < 19) Thread.Sleep(250);
            }
            // A scanner may retain old binaries; user data is stored elsewhere and the next install can retry cleanup.
        }

        private static void RegisterUninstallEntry(string installDir, string dataDir)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MARO"))
            {
                if (key == null)
                {
                    throw new InvalidOperationException("Could not create MARO uninstall registry key.");
                }

                char quote = '"';
                string uninstallCommand = quote + Path.Combine(installDir, "Uninstall-MARO.cmd") + quote;
                key.SetValue("DisplayName", "MARO - Micromentor Reachout Console", RegistryValueKind.String);
                key.SetValue("DisplayVersion", AppVersion, RegistryValueKind.String);
                key.SetValue("Publisher", Publisher, RegistryValueKind.String);
                key.SetValue("InstallLocation", installDir, RegistryValueKind.String);
                key.SetValue("MaroDataLocation", dataDir, RegistryValueKind.String);
                key.SetValue("UninstallString", uninstallCommand, RegistryValueKind.String);
                key.SetValue("QuietUninstallString", uninstallCommand, RegistryValueKind.String);
                key.SetValue("DisplayIcon", Path.Combine(installDir, "MARO.cmd"), RegistryValueKind.String);
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                key.SetValue("EstimatedSize", EstimateInstallSizeKb(installDir), RegistryValueKind.DWord);
            }
        }

        private static int EstimateInstallSizeKb(string installDir)
        {
            long bytes = 0;
            foreach (string file in Directory.GetFiles(installDir, "*", SearchOption.AllDirectories))
            {
                bytes += new FileInfo(file).Length;
            }

            return Math.Max(1, (int)(bytes / 1024));
        }

        private static void CreateShortcut(string shortcutPath, string targetPath, string workingDirectory)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(shortcutPath));

            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(shellType);
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = targetPath;
                shortcut.WorkingDirectory = workingDirectory;
                shortcut.IconLocation = Environment.ExpandEnvironmentVariables("%SystemRoot%\\\\System32\\\\shell32.dll,220");
                shortcut.Save();
            }
            catch
            {
                string fallbackPath = Path.ChangeExtension(shortcutPath, ".cmd");
                File.WriteAllText(
                    fallbackPath,
                    "@echo off\\r\\ncd /d \\"" + workingDirectory + "\\"\\r\\ncall \\"" + targetPath + "\\"\\r\\n"
                );
            }
        }
    }
}
`
);

run(cscPath, [
  "/nologo",
  "/target:exe",
  "/platform:anycpu",
  "/optimize+",
  `/out:${installerPath}`,
  `/resource:${appZip},MaroPayloadZip`,
  "/reference:System.IO.Compression.dll",
  "/reference:System.IO.Compression.FileSystem.dll",
  "/reference:System.Security.dll",
  "/reference:Microsoft.CSharp.dll",
  csharpSource,
]);

const stats = fs.statSync(installerPath);
console.log(`Created ${installerPath}`);
console.log(`Installer size: ${(stats.size / (1024 * 1024)).toFixed(1)} MB`);
