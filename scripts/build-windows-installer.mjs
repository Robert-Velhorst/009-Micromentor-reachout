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
const sdkProfile = JSON.parse(fs.readFileSync(path.join(root, "installer-sdk.json"), "utf8"));
const sdkProject = path.join(artifactsRoot, "MAROInstaller.csproj");
const publishRoot = path.join(artifactsRoot, "publish");
const runtimeIdentifier = sdkProfile.runtimeIdentifiers[process.arch];

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
  fs.writeFileSync(filePath, content.replace(/\r?\n/g, "\r\n"), "utf8");
}

if (process.platform !== "win32") {
  throw new Error("The Windows installer can only be built on Windows.");
}

if (!fs.existsSync(path.join(root, "dist", "index.cjs"))) {
  throw new Error("dist/index.cjs is missing. Run npm run build before building the installer.");
}

if (!fs.existsSync(path.join(root, "dist", "public", "index.html"))) {
  throw new Error("dist/public/index.html is missing. Run npm run build before building the installer.");
}

if (!runtimeIdentifier || !/^win-(x64|arm64)$/.test(runtimeIdentifier)) {
  throw new Error(`No current Windows installer runtime is configured for ${process.arch}.`);
}
if (!/^\d+\.\d+\.\d+$/.test(sdkProfile.dotnetSdkVersion)
    || !/^\d+\.\d+\.\d+$/.test(sdkProfile.dotnetRuntimeVersion)
    || !/^\d+\.\d+$/.test(sdkProfile.csharpLanguageVersion)) {
  throw new Error("The installer requires explicit stable SDK, runtime and C# versions.");
}
if (process.versions.node !== sdkProfile.nodeVersion) {
  throw new Error(`Build with the pinned stable Node ${sdkProfile.nodeVersion}.`);
}
const selectedSdk = spawnSync("dotnet", ["--version"], {
  cwd: root, shell: false, encoding: "utf8", windowsHide: true,
});
if (selectedSdk.status !== 0 || selectedSdk.stdout.trim() !== sdkProfile.dotnetSdkVersion) {
  throw new Error(`Install the pinned stable .NET SDK ${sdkProfile.dotnetSdkVersion}; no fallback is accepted.`);
}
const sdkList = spawnSync("dotnet", ["--list-sdks"], {
  cwd: root, shell: false, encoding: "utf8", windowsHide: true,
});
const sdkPrefix = `${sdkProfile.dotnetSdkVersion} [`;
const sdkRow = sdkList.stdout.split(/\r?\n/).find((line) => line.startsWith(sdkPrefix));
if (sdkList.status !== 0 || !sdkRow) {
  throw new Error("The selected .NET SDK location could not be verified.");
}
const dotnetRoot = path.dirname(sdkRow.slice(sdkPrefix.length, -1));

for (const target of [artifactsRoot, appRoot, appZip, csharpSource, installerPath, sdkProject, publishRoot]) {
  assertInside(path.join(root, "artifacts"), target);
}

fs.rmSync(artifactsRoot, { recursive: true, force: true });
fs.mkdirSync(appRoot, { recursive: true });

copyDirectory(path.join(root, "dist"), path.join(appRoot, "dist"));
fs.mkdirSync(path.join(appRoot, "runtime"), { recursive: true });
fs.copyFileSync(process.execPath, path.join(appRoot, "runtime", "node.exe"));
for (const [from, name] of [
  [path.join(path.dirname(process.execPath), "LICENSE"), "THIRD-PARTY-NODE-LICENSE.txt"],
  [path.join(dotnetRoot, "LICENSE.txt"), "THIRD-PARTY-DOTNET-LICENSE.txt"],
  [path.join(dotnetRoot, "ThirdPartyNotices.txt"), "THIRD-PARTY-DOTNET-NOTICES.txt"],
]) {
  fs.copyFileSync(from, path.join(appRoot, name));
}

writeText(
  path.join(appRoot, "MARO.cmd"),
  `@echo off
setlocal
set "APP_DIR=%~dp0"
set "HOST=127.0.0.1"
if not defined PORT set "PORT=3000"
set "NODE_ENV=production"
set "MARO_APP_VERSION=${appVersion}"
set "APP_URL=http://127.0.0.1:%PORT%/"
echo MARO is starting on %APP_URL%
start "MARO local server" /min "%APP_DIR%runtime\\node.exe" "%APP_DIR%dist\\index.cjs"
timeout /t 2 /nobreak >nul
start "" "%APP_URL%"
exit /b 0
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
reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MARO" /f >nul 2>nul
del "%DESKTOP_LINK%" >nul 2>nul
rmdir /s /q "%START_MENU%" >nul 2>nul
echo MARO has been deregistered from Windows.
echo Program files and personal data remain at %APP_DIR% for recovery.
echo Review and back up this directory before removing it manually.
exit /b 0
`
);

const managedFiles = [];
function inventoryManagedFiles(folder, prefix = "") {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) inventoryManagedFiles(path.join(folder, entry.name), `${relative}/`);
    else if (entry.isFile()) managedFiles.push(relative);
    else throw new Error(`Non-regular payload entry: ${relative}`);
  }
}
inventoryManagedFiles(appRoot);
managedFiles.push("MARO.install.json", "README-INSTALL.txt");
managedFiles.sort();

writeText(
  path.join(appRoot, "MARO.install.json"),
  JSON.stringify(
    {
      name: "MARO",
      displayName: "MARO - Micromentor Reachout Console",
      version: appVersion,
      publisher,
      installedBy: "MARO Windows installer",
      managedFiles,
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

The app runs locally at http://127.0.0.1:3000/.

To remove MARO, use Windows Settings > Apps > Installed apps, or run the Start Menu shortcut named "Uninstall MARO".
Close the MARO server before upgrading or uninstalling.
Upgrades preserve default data and unrecognized files. The complete previous install remains
beside the active install with the suffix .maro-recovery. Review and preserve that checkpoint
before the next upgrade; the installer will never delete or overwrite it automatically.
The uninstall command deregisters the app and retains program files and data for recovery.
Legacy files inside dist/runtime remain in the recovery directory rather than being served
as current program code. Relocate MARO_DATA_DIR if it overlaps either managed program root.
`
);

if (!/^\d+\.\d+\.\d+$/.test(appVersion)) {
  throw new Error("The native assembly requires a stable three-part application version.");
}
const installerTemplate = fs.readFileSync(path.join(root, "installer", "Program.cs"), "utf8");
writeText(csharpSource, installerTemplate
  .replaceAll("__MARO_VERSION__", appVersion)
  .replaceAll("__MARO_PUBLISHER__", publisher));

writeText(
  sdkProject,
  `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0-windows</TargetFramework>
    <RuntimeIdentifier>${runtimeIdentifier}</RuntimeIdentifier>
    <RuntimeFrameworkVersion>${sdkProfile.dotnetRuntimeVersion}</RuntimeFrameworkVersion>
    <LangVersion>${sdkProfile.csharpLanguageVersion}</LangVersion>
    <Nullable>enable</Nullable>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <GenerateAssemblyInfo>false</GenerateAssemblyInfo>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <AssemblyName>MARO-Windows11-Setup</AssemblyName>
    <SelfContained>true</SelfContained>
    <PublishSingleFile>true</PublishSingleFile>
    <EnableCompressionInSingleFile>true</EnableCompressionInSingleFile>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="MAROInstaller.cs" />
    <EmbeddedResource Include="maro-app.zip" LogicalName="MaroPayloadZip" />
  </ItemGroup>
  <Target Name="CreateMaroPayload" BeforeTargets="PrepareResources">
    <ZipDirectory SourceDirectory="$(MSBuildProjectDirectory)/app"
                  DestinationFile="$(MSBuildProjectDirectory)/maro-app.zip" Overwrite="true" />
  </Target>
</Project>
`
);

run("dotnet", [
  "publish", sdkProject, "--configuration", "Release", "--runtime", runtimeIdentifier,
  "--self-contained", "true", "--output", publishRoot,
]);
fs.copyFileSync(path.join(publishRoot, "MARO-Windows11-Setup.exe"), installerPath);

const stats = fs.statSync(installerPath);
console.log(`Created ${installerPath}`);
console.log(`Installer size: ${(stats.size / (1024 * 1024)).toFixed(1)} MB`);
