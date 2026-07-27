// Injeta o handler de formulário (/_premio/form-handler.js) nas páginas
// espelhadas que contêm um formulário Elementor. Idempotente — pode rodar
// novamente após cada espelhamento.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, "..", "site");
const TAG = '<script src="/_premio/form-handler.js" defer></script>';
const MARK = "/_premio/form-handler.js";

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "_premio") continue;
      yield* walk(p);
    } else if (e.name.endsWith(".html")) {
      yield p;
    }
  }
}

let patched = 0,
  skipped = 0,
  scanned = 0;

for await (const file of walk(SITE_DIR)) {
  scanned++;
  let html = await fs.readFile(file, "utf8");
  if (!html.includes("elementor-form")) continue; // só páginas com formulário
  if (html.includes(MARK)) {
    skipped++;
    continue;
  }
  if (html.includes("</body>")) {
    html = html.replace("</body>", TAG + "\n</body>");
  } else {
    html += "\n" + TAG;
  }
  await fs.writeFile(file, html, "utf8");
  patched++;
  console.log("patched:", path.relative(SITE_DIR, file));
}

console.log(`\n${scanned} HTML analisados | ${patched} com formulário injetados | ${skipped} já tinham`);
