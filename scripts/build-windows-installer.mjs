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
set "APP_URL=http://127.0.0.1:%PORT%/"
echo MARO is starting on %APP_URL%
start "MARO local server" /min "%APP_DIR%runtime\\node.exe" "%APP_DIR%dist\\index.cjs"
timeout /t 2 /nobreak >nul
start "" "%APP_URL%"
where ngrok >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  echo Opening an ngrok tunnel for MARO.
  if defined NGROK_BASIC_AUTH (
    start "MARO ngrok tunnel" cmd /k ngrok http http://127.0.0.1:%PORT% --basic-auth "%NGROK_BASIC_AUTH%"
  ) else (
    start "MARO ngrok tunnel" cmd /k ngrok http http://127.0.0.1:%PORT%
  )
) else (
  echo ngrok was not found on PATH. MARO will still run locally.
  echo Install and authenticate ngrok if you want a public tunnel.
)
exit /b 0
`
);

writeText(
  path.join(appRoot, "README-INSTALL.txt"),
  `MARO - Micromentor Reachout Console

Open MARO from the Start Menu shortcut named "MARO".

The app runs locally at http://127.0.0.1:3000/.
If ngrok is installed and authenticated, the launcher also opens an ngrok tunnel.
Set NGROK_BASIC_AUTH before launching if you want ngrok basic authentication.
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

namespace MAROInstaller
{
    internal static class Program
    {
        private const string ResourceName = "MaroPayloadZip";

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
