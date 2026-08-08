import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { build as buildServer } from "esbuild";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const isWindows = process.platform === "win32";
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const appVersion = String(packageJson.version || "0.0.0");

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

function substMappings() {
  const output = execFileSync("subst", { encoding: "utf8" });
  return new Set(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z]:)/i)?.[1]?.toUpperCase())
      .filter(Boolean)
  );
}

function findDriveLetter() {
  const mapped = substMappings();

  for (const letter of "ZYXWVUTSRQPONMLKJIHGFED".split("")) {
    const drive = `${letter}:`;
    if (!mapped.has(drive) && !fs.existsSync(`${drive}\\`)) {
      return drive;
    }
  }

  throw new Error("No free drive letter is available for the Windows build mapping.");
}

async function withBuildRoot(callback) {
  if (!isWindows) {
    return callback(root);
  }

  const drive = findDriveLetter();
  execFileSync("subst", [drive, root]);

  try {
    return await callback(`${drive}\\`);
  } finally {
    execFileSync("subst", [drive, "/D"]);
  }
}

await withBuildRoot(async (buildRoot) => {
  fs.rmSync(path.join(buildRoot, "dist"), { recursive: true, force: true });
  await run(process.execPath, ["node_modules/vite/bin/vite.js", "build"], buildRoot);
  await buildServer({
    absWorkingDir: buildRoot,
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.MARO_BUILD_VERSION": JSON.stringify(appVersion),
    },
    logLevel: "info",
  });
  await run(process.execPath, ["scripts/build-extension.mjs"], buildRoot);
});
