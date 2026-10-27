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
  fs.writeFileSync(filePath, content.replace(/\n/g, "\r\n"), "utf8");
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
echo MARO will be removed from %APP_DIR%
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

The app runs locally at http://127.0.0.1:3000/.

To remove MARO, use Windows Settings > Apps > Installed apps, or run the Start Menu shortcut named "Uninstall MARO".
Close the MARO server before uninstalling.
`
);

writeText(
  csharpSource,
  `using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
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

        private static int Main()
        {
            try
            {
                string? installDir = Environment.GetEnvironmentVariable("MARO_INSTALL_DIR");
                if (String.IsNullOrWhiteSpace(installDir))
                {
                    installDir = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "MARO"
                    );
                }

                installDir = Path.GetFullPath(installDir);
                string tempZip = Path.Combine(Path.GetTempPath(), "maro-app-" + Guid.NewGuid().ToString("N") + ".zip");

                ExtractEmbeddedPayload(tempZip);

                if (Directory.Exists(installDir))
                {
                    Directory.Delete(installDir, true);
                }

                Directory.CreateDirectory(installDir);
                ZipFile.ExtractToDirectory(tempZip, installDir);
                File.Delete(tempZip);

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
                    RegisterUninstallEntry(installDir);
                }

                Console.WriteLine("MARO has been installed to " + installDir);

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
            using (Stream? input = assembly.GetManifestResourceStream(ResourceName))
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

        private static void RegisterUninstallEntry(string installDir)
        {
            using (RegistryKey? key = Registry.CurrentUser.CreateSubKey(@"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MARO"))
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
            string? shortcutDirectory = Path.GetDirectoryName(shortcutPath);
            if (String.IsNullOrEmpty(shortcutDirectory))
            {
                throw new ArgumentException("A shortcut directory is required.", nameof(shortcutPath));
            }
            Directory.CreateDirectory(shortcutDirectory);

            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell") ?? throw new InvalidOperationException("Windows Script Host is unavailable.");
                dynamic shell = Activator.CreateInstance(shellType) ?? throw new InvalidOperationException("Windows Script Host could not be created.");
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
