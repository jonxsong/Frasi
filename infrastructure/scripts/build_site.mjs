import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const webOutput = path.join(repositoryRoot, "apps", "web", "out");
const siteOutput = path.join(repositoryRoot, "out");

function runPnpm(args, extraEnvironment = {}) {
  const result = spawnSync("pnpm", args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnvironment },
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runPnpm(["--filter", "@frasi/web", "build"], {
  FRASI_SITE_EXPORT: "1",
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
});

if (!existsSync(webOutput)) {
  throw new Error(`Next.js did not create the expected static output: ${webOutput}`);
}
if (path.dirname(siteOutput) !== repositoryRoot) {
  throw new Error("Refusing to replace a static output outside the repository root");
}
rmSync(siteOutput, { recursive: true, force: true });
cpSync(webOutput, siteOutput, { recursive: true });
console.log(`Prepared Sites static output at ${siteOutput}`);
