import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageDirectory = path.dirname(
  require.resolve("@spotify/basic-pitch/package.json"),
);
const modelDirectory = path.join(packageDirectory, "model");
const publicDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/models/basic-pitch",
);

await mkdir(publicDirectory, { recursive: true });
await Promise.all(
  ["model.json", "group1-shard1of1.bin"].map((filename) =>
    copyFile(
      path.join(modelDirectory, filename),
      path.join(publicDirectory, filename),
    ),
  ),
);
