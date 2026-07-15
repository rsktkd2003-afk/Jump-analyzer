// MediaPipe の WASM を node_modules から public/ へ複製する。
// オフライン動作のため、CDN(jsDelivr)からの取得をやめてローカル配信する。
// FilesetResolver.forVisionTasks() は isModule=false で呼ばれるため、
// "_module" 系のバリアントは使用されない（SIMD版と非SIMD版のみで足りる）。
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const sourceDir = join(
  projectRoot,
  "node_modules",
  "@mediapipe",
  "tasks-vision",
  "wasm"
);
const targetDir = join(projectRoot, "public", "mediapipe", "wasm");

const files = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

if (!existsSync(sourceDir)) {
  console.error(
    `[copy-mediapipe-assets] コピー元が見つかりません: ${sourceDir}\n` +
      `先に "npm install" を実行して @mediapipe/tasks-vision を取得してください。`
  );
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

for (const file of files) {
  const src = join(sourceDir, file);
  const dest = join(targetDir, file);

  if (!existsSync(src)) {
    console.error(`[copy-mediapipe-assets] ファイルが見つかりません: ${src}`);
    process.exit(1);
  }

  copyFileSync(src, dest);
  console.log(`[copy-mediapipe-assets] copied ${file}`);
}

console.log("[copy-mediapipe-assets] done.");
