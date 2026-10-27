using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Win32;

[assembly: AssemblyTitle("MARO Windows 11 Setup")]
[assembly: AssemblyDescription("Installer for MARO - Micromentor Reachout Console")]
[assembly: AssemblyCompany("__MARO_PUBLISHER__")]
[assembly: AssemblyProduct("MARO")]
[assembly: AssemblyCopyright("Copyright __MARO_PUBLISHER__")]
[assembly: AssemblyVersion("__MARO_VERSION__.0")]
[assembly: AssemblyFileVersion("__MARO_VERSION__.0")]

namespace MAROInstaller;

internal static class Program
{
    private const string AppVersion = "__MARO_VERSION__";
    private const string Publisher = "__MARO_PUBLISHER__";
    private static readonly HashSet<string> ManagedRootFiles = new(StringComparer.OrdinalIgnoreCase)
    {
        "MARO.cmd", "Uninstall-MARO.cmd", "MARO.install.json", "README-INSTALL.txt",
        "THIRD-PARTY-NODE-LICENSE.txt", "THIRD-PARTY-DOTNET-LICENSE.txt", "THIRD-PARTY-DOTNET-NOTICES.txt"
    };

    private static bool ExpectedFailure(Exception error) => error is IOException
        or UnauthorizedAccessException or InvalidOperationException or ArgumentException
        or JsonException or COMException or Win32Exception or TargetInvocationException
        or NotSupportedException;

    private static int Main(string[] args)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("MARO installation requires Windows.");
        try
        {
            if (args.Length == 1 && args[0] == "--runtime-info")
            {
                Console.WriteLine(JsonSerializer.Serialize(new
                {
                    runtimeVersion = Environment.Version.ToString(),
                    frameworkDescription = RuntimeInformation.FrameworkDescription,
                    processArchitecture = RuntimeInformation.ProcessArchitecture.ToString(),
                    osArchitecture = RuntimeInformation.OSArchitecture.ToString(),
                    appVersion = AppVersion
                }));
                return 0;
            }
            if (args.Length != 0) throw new ArgumentException("Unrecognized MARO installer argument.");
            string? configured = Environment.GetEnvironmentVariable("MARO_INSTALL_DIR");
            string installDir = Path.TrimEndingDirectorySeparator(Path.GetFullPath(
                String.IsNullOrWhiteSpace(configured)
                    ? Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MARO")
                    : configured));
            if (String.Equals(installDir, Path.GetPathRoot(installDir), StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("A filesystem root cannot be a MARO install directory.");
            string parent = Path.GetDirectoryName(installDir)
                ?? throw new InvalidOperationException("An installation parent directory is required.");
            RequireSafeAncestors(installDir);
            string lockPath = installDir + ".maro-install.lock";
            RequireSafeAncestors(lockPath);
            Directory.CreateDirectory(parent);
            using FileStream installLock = new(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
            if (File.Exists(installDir))
                throw new InvalidOperationException("The installation target is an existing file.");
            string recovery = installDir + ".maro-recovery";
            if (Directory.Exists(recovery) || File.Exists(recovery))
                throw new InvalidOperationException("Review and preserve the previous recovery checkpoint before another upgrade: " + recovery);
            HashSet<string>? managed = null;
            bool hasOriginal = Directory.Exists(installDir);
            bool nonEmpty = false;
            if (hasOriginal)
            {
                using IEnumerator<string> children = Directory.EnumerateFileSystemEntries(installDir).GetEnumerator();
                nonEmpty = children.MoveNext();
            }
            if (hasOriginal) RequireSafeTree(installDir);
            if (nonEmpty)
            {
                managed = ReadOwnedInstallation(installDir);
                RequireApplicationStopped(installDir);
                string? customData = Environment.GetEnvironmentVariable("MARO_DATA_DIR");
                if (!String.IsNullOrWhiteSpace(customData))
                {
                    string absoluteData = Path.GetFullPath(customData, installDir);
                    if (IsWithin(installDir, absoluteData))
                    {
                        string relative = Path.GetRelativePath(installDir, absoluteData).Replace('\\', '/');
                        if (IsManagedLocation(relative))
                            throw new InvalidOperationException("MARO_DATA_DIR overlaps managed program files; preserve and relocate it before upgrading.");
                    }
                }
            }
            string stage = installDir + ".maro-staging-" + Guid.NewGuid().ToString("N");
            Directory.CreateDirectory(stage);
            Console.WriteLine("Preparing install in " + stage);
            using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("MaroPayloadZip")
                ?? throw new InvalidOperationException("The embedded MARO payload is missing."))
            using (ZipArchive archive = new(payload, ZipArchiveMode.Read))
                archive.ExtractToDirectory(stage);
            RequireSafeTree(stage);
            _ = ReadOwnedInstallation(stage);

            bool movedOriginal = false;
            try
            {
                if (nonEmpty)
                {
                    // Recheck immediately before the rename. Never erase an existing installation.
                    RequireApplicationStopped(installDir);
                    RequireSafeTree(installDir);
                    Directory.Move(installDir, recovery);
                    movedOriginal = true;
                    CopyUserContent(recovery, stage, managed!);
                }
                else if (hasOriginal)
                    Directory.Delete(installDir); // Only an empty directory; never recursive.
                Directory.Move(stage, installDir);
            }
            catch (Exception error) when (ExpectedFailure(error))
            {
                if (movedOriginal && !Directory.Exists(installDir) && !File.Exists(installDir))
                    Directory.Move(recovery, installDir);
                Console.Error.WriteLine("Staging was retained for recovery: " + stage);
                throw;
            }

            if (Environment.GetEnvironmentVariable("MARO_SKIP_SHORTCUTS") != "1")
            {
                string programs = Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "MARO");
                CreateShortcut(Path.Join(programs, "MARO.lnk"), Path.Join(installDir, "MARO.cmd"), installDir);
                CreateShortcut(Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "MARO.lnk"),
                    Path.Join(installDir, "MARO.cmd"), installDir);
                CreateShortcut(Path.Join(programs, "Uninstall MARO.lnk"), Path.Join(installDir, "Uninstall-MARO.cmd"), installDir);
            }
            if (Environment.GetEnvironmentVariable("MARO_SKIP_REGISTRY") != "1") RegisterUninstallEntry(installDir);
            Console.WriteLine("MARO has been installed to " + installDir);
            if (movedOriginal) Console.WriteLine("Previous installation and all its files retained at " + recovery);
            if (Environment.GetEnvironmentVariable("MARO_SKIP_LAUNCH") != "1")
                Process.Start(new ProcessStartInfo
                {
                    FileName = Path.Join(installDir, "MARO.cmd"), WorkingDirectory = installDir, UseShellExecute = true
                });
            return 0;
        }
        catch (Exception error) when (ExpectedFailure(error))
        {
            Console.Error.WriteLine("MARO installation failed: " + error.Message);
            return 1;
        }
    }

    private static bool IsWithin(string root, string candidate) => candidate.StartsWith(
        Path.TrimEndingDirectorySeparator(root) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);

    private static void RequireSafeAncestors(string target)
    {
        for (DirectoryInfo? item = new(target); item != null; item = item.Parent)
            if (item.LinkTarget != null || ((item.Exists || File.Exists(item.FullName))
                && (File.GetAttributes(item.FullName) & FileAttributes.ReparsePoint) != 0))
                throw new InvalidOperationException("Reparse points cannot be installation targets or ancestors: " + item.FullName);
    }

    private static void RequireSafeTree(string directory)
    {
        foreach (string item in Directory.EnumerateFileSystemEntries(directory))
        {
            FileAttributes attributes = File.GetAttributes(item);
            if ((attributes & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("Preserve and resolve this reparse point before installation: " + item);
            if ((attributes & FileAttributes.Directory) != 0) RequireSafeTree(item);
        }
    }

    private static bool IsManagedLocation(string relative) => ManagedRootFiles.Contains(relative)
        || relative.Equals("dist", StringComparison.OrdinalIgnoreCase)
        || relative.StartsWith("dist/", StringComparison.OrdinalIgnoreCase)
        || relative.Equals("runtime", StringComparison.OrdinalIgnoreCase)
        || relative.StartsWith("runtime/", StringComparison.OrdinalIgnoreCase);

    private static HashSet<string> ReadOwnedInstallation(string directory)
    {
        string marker = Path.Join(directory, "MARO.install.json");
        if (!File.Exists(marker) || new FileInfo(marker).Length > 1024 * 1024)
            throw new InvalidOperationException("Refusing a nonempty directory without a bounded MARO ownership marker.");
        using JsonDocument document = JsonDocument.Parse(File.ReadAllText(marker));
        JsonElement root = document.RootElement;
        if (root.GetProperty("name").GetString() != "MARO" || root.GetProperty("publisher").GetString() != Publisher
            || root.GetProperty("installedBy").GetString() != "MARO Windows installer")
            throw new InvalidOperationException("The existing installation ownership marker is not MARO's.");
        HashSet<string> managed = new(StringComparer.OrdinalIgnoreCase);
        if (root.TryGetProperty("managedFiles", out JsonElement recorded))
        {
            foreach (JsonElement element in recorded.EnumerateArray())
            {
                string name = element.GetString() ?? throw new InvalidOperationException("Invalid managed-file declaration.");
                string absolute = Path.GetFullPath(Path.Join(directory, name));
                if (!IsWithin(directory, absolute) || Path.GetRelativePath(directory, absolute).Replace('\\', '/') != name
                    || !IsManagedLocation(name) || !managed.Add(name))
                    throw new InvalidOperationException("Invalid managed-file path in the installation marker.");
            }
        }
        else
        {
            // Legacy installers did not inventory their managed files. Keep a complete recovery
            // directory and carry all content outside the old program roots into the new install.
            foreach (string file in Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories))
            {
                string relative = Path.GetRelativePath(directory, file).Replace('\\', '/');
                if (IsManagedLocation(relative)) managed.Add(relative);
            }
        }
        return managed;
    }

    private static void CopyUserContent(string original, string stage, HashSet<string> managed)
    {
        foreach (string directory in Directory.EnumerateDirectories(original, "*", SearchOption.AllDirectories))
            Directory.CreateDirectory(Path.Join(stage, Path.GetRelativePath(original, directory)));
        foreach (string source in Directory.EnumerateFiles(original, "*", SearchOption.AllDirectories))
        {
            string relative = Path.GetRelativePath(original, source);
            if (managed.Contains(relative.Replace('\\', '/'))) continue;
            string destination = Path.Join(stage, relative);
            // A new payload must not overwrite a previously unrecognized user file.
            using FileStream input = new(source, FileMode.Open, FileAccess.Read, FileShare.Read);
            using FileStream output = new(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            input.CopyTo(output);
        }
    }

    private static void RequireApplicationStopped(string directory)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Windows process inspection is required.");
        foreach (Process process in Process.GetProcessesByName("node"))
        {
            using (process)
            {
                string? executable = process.MainModule?.FileName;
                if (executable == null) throw new InvalidOperationException("Could not inspect an active Node process safely.");
                if (IsWithin(directory, executable)) throw new InvalidOperationException("Close the MARO server before upgrading.");
            }
        }
    }

    private static void RegisterUninstallEntry(string installDir)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Windows registry is required.");
        using RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\MARO")
            ?? throw new InvalidOperationException("Could not create MARO uninstall registry key.");
        string uninstallCommand = '"' + Path.Join(installDir, "Uninstall-MARO.cmd") + '"';
        key.SetValue("DisplayName", "MARO - Micromentor Reachout Console", RegistryValueKind.String);
        key.SetValue("DisplayVersion", AppVersion, RegistryValueKind.String);
        key.SetValue("Publisher", Publisher, RegistryValueKind.String);
        key.SetValue("InstallLocation", installDir, RegistryValueKind.String);
        key.SetValue("UninstallString", uninstallCommand, RegistryValueKind.String);
        key.SetValue("QuietUninstallString", uninstallCommand, RegistryValueKind.String);
        key.SetValue("DisplayIcon", Path.Join(installDir, "MARO.cmd"), RegistryValueKind.String);
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        long bytes = 0;
        foreach (string file in Directory.GetFiles(installDir, "*", SearchOption.AllDirectories)) bytes += new FileInfo(file).Length;
        key.SetValue("EstimatedSize", Math.Max(1, (int)Math.Min(Int32.MaxValue, bytes / 1024)), RegistryValueKind.DWord);
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string workingDirectory)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Windows Script Host is required.");
        string directory = Path.GetDirectoryName(shortcutPath)
            ?? throw new InvalidOperationException("A shortcut directory is required.");
        Directory.CreateDirectory(directory);
        Type shellType = Type.GetTypeFromProgID("WScript.Shell")
            ?? throw new InvalidOperationException("Windows Script Host is unavailable.");
        object shell = Activator.CreateInstance(shellType)
            ?? throw new InvalidOperationException("Windows Script Host could not be created.");
        try
        {
            object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath })
                ?? throw new InvalidOperationException("Windows shortcut could not be created.");
            try
            {
                Type shortcutType = shortcut.GetType();
                foreach ((string name, string value) in new[]
                {
                    ("TargetPath", targetPath), ("WorkingDirectory", workingDirectory),
                    ("IconLocation", Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.System), "shell32.dll") + ",220")
                }) shortcutType.InvokeMember(name, BindingFlags.SetProperty, null, shortcut, new object[] { value });
                shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
            }
            finally { if (Marshal.IsComObject(shortcut)) Marshal.FinalReleaseComObject(shortcut); }
        }
        finally { if (Marshal.IsComObject(shell)) Marshal.FinalReleaseComObject(shell); }
    }
}
