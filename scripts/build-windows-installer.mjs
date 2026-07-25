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
set "HOST=127.0.0.1"
if not defined PORT set "PORT=3000"
set "NODE_ENV=production"
set "MARO_APP_VERSION=${appVersion}"
set "APP_URL=http://127.0.0.1:%PORT%/"
echo MARO is starting on %APP_URL%
start "MARO local server" /min "%APP_DIR%runtime\\node.exe" "%APP_DIR%dist\\index.cjs"
timeout /t 2 /nobreak >nul
start "" "%APP_URL%"
where ngrok >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  if defined NGROK_BASIC_AUTH (
    echo Opening a basic-auth protected ngrok tunnel for MARO.
    start "MARO ngrok tunnel" cmd /k ngrok http http://127.0.0.1:%PORT% --basic-auth "%NGROK_BASIC_AUTH%"
  ) else (
    if "%MARO_ALLOW_PUBLIC_TUNNEL%"=="1" (
      echo WARNING: Opening an explicitly allowed public ngrok tunnel without basic auth.
      start "MARO ngrok tunnel" cmd /k ngrok http http://127.0.0.1:%PORT%
    ) else (
      echo Public tunnel not started. Set NGROK_BASIC_AUTH=user:password to open a protected tunnel.
      echo Set MARO_ALLOW_PUBLIC_TUNNEL=1 only when unauthenticated public access is intentional.
    )
  )
) else (
  echo ngrok was not found on PATH. MARO will still run locally.
  echo Install and authenticate ngrok if you want a public tunnel.
)
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
If ngrok is installed, the launcher opens a tunnel only when NGROK_BASIC_AUTH is set.
Set MARO_ALLOW_PUBLIC_TUNNEL=1 only when unauthenticated public access is intentional.

To remove MARO, use Windows Settings > Apps > Installed apps, or run the Start Menu shortcut named "Uninstall MARO".
Close any MARO server or ngrok windows before uninstalling.
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
                string installDir = Environment.GetEnvironmentVariable("MARO_INSTALL_DIR");
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

        private static void RegisterUninstallEntry(string installDir)
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
  "/reference:Microsoft.CSharp.dll",
  csharpSource,
]);

const stats = fs.statSync(installerPath);
console.log(`Created ${installerPath}`);
console.log(`Installer size: ${(stats.size / (1024 * 1024)).toFixed(1)} MB`);
