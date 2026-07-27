// Extrai o CONTEÚDO LIMPO das páginas principais (sem o markup do Elementor)
// e monta um pacote em markdown + imagens, ideal para redesenhar o site.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");
const OUT = path.join(ROOT, "content-pack");

// Páginas principais (o site "de verdade" da edição atual)
const PAGES = [
  ["", "home"],
  ["o-premio", "o-premio"],
  ["regulamento-2026", "regulamento"],
  ["envie-seu-projeto-2026", "envie-seu-projeto"],
  ["midia", "midia"],
  ["resultados-anteriores", "resultados-anteriores"],
  ["contato", "contato"],
  ["obrigado", "obrigado"],
];

function unescapeHtml(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"').replace(/&nbsp;/g, " ").replace(/&raquo;/g, "»")
    .replace(/&aacute;/g, "á").replace(/&atilde;/g, "ã").replace(/&ccedil;/g, "ç")
    .replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó")
    .replace(/&otilde;/g, "õ").replace(/&uacute;/g, "ú").replace(/&#\d+;/g, "");
}
function clean(s) {
  return unescapeHtml(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function extractBody(html) {
  // remove ruído
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  const m = html.match(/<body[\s\S]*<\/body>/i);
  return m ? m[0] : html;
}

// Extrai blocos de conteúdo (headings, parágrafos, itens de lista) em ordem
function extractBlocks(body) {
  const blocks = [];
  const re = /<(h1|h2|h3|h4|h5|h6|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase();
    const text = clean(m[2]);
    if (!text || text.length < 2) continue;
    const key = tag + "|" + text;
    if (seen.has(key)) continue; // remove repetições (menu/rodapé duplicados)
    seen.add(key);
    blocks.push({ tag, text });
  }
  return blocks;
}

function extractImages(body) {
  const imgs = [];
  const re = /<img\b[^>]*>/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(body))) {
    const tag = m[0];
    const src = (tag.match(/\bsrc="([^"]+)"/) || [])[1] || "";
    const alt = clean((tag.match(/\balt="([^"]*)"/) || [])[1] || "");
    if (!src || src.startsWith("data:")) continue;
    // só imagens locais de conteúdo
    if (!src.includes("/wp-content/uploads/")) continue;
    const key = src.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    imgs.push({ src: key, alt });
  }
  return imgs;
}

function toMarkdown(title, blocks, imgs) {
  const out = [`# ${title}`, ""];
  for (const b of blocks) {
    if (b.text.startsWith("Menu ") || b.text === "Resultados Anteriores") continue;
    if (b.tag === "h1") out.push(`\n# ${b.text}`);
    else if (b.tag === "h2") out.push(`\n## ${b.text}`);
    else if (b.tag === "h3") out.push(`\n### ${b.text}`);
    else if (b.tag === "h4" || b.tag === "h5" || b.tag === "h6") out.push(`\n#### ${b.text}`);
    else if (b.tag === "li") out.push(`- ${b.text}`);
    else out.push(`\n${b.text}`);
  }
  if (imgs.length) {
    out.push("\n\n---\n\n## Imagens usadas nesta página\n");
    for (const im of imgs) out.push(`- \`${im.src}\`${im.alt ? ` — ${im.alt}` : ""}`);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

async function main() {
  await fsp.rm(OUT, { recursive: true, force: true });
  await fsp.mkdir(path.join(OUT, "pages"), { recursive: true });
  await fsp.mkdir(path.join(OUT, "images"), { recursive: true });

  const allImgs = new Set();
  const index = ["# Pacote de Conteúdo — Prêmio Cidades Excelentes", "",
    "Conteúdo limpo (sem o markup do Elementor) das páginas principais, para redesenhar o site.", "",
    "## Páginas", ""];

  for (const [slug, name] of PAGES) {
    const file = path.join(SITE, slug, "index.html");
    if (!fs.existsSync(file)) continue;
    const html = await fsp.readFile(file, "utf8");
    const titleM = html.match(/<title>([^<]*)<\/title>/i);
    const title = titleM ? clean(titleM[1]).replace(/\s*[-–]\s*Pr.mio.*$/, "").trim() || name : name;
    const body = extractBody(html);
    const blocks = extractBlocks(body);
    const imgs = extractImages(body);
    imgs.forEach((im) => allImgs.add(im.src));
    const md = toMarkdown(title, blocks, imgs);
    await fsp.writeFile(path.join(OUT, "pages", `${name}.md`), md, "utf8");
    index.push(`- [${title}](pages/${name}.md) — ${blocks.length} blocos de texto, ${imgs.length} imagens`);
    console.log(`✔ ${name}.md (${blocks.length} blocos, ${imgs.length} imgs)`);
  }

  // copia as imagens de conteúdo usadas
  let copied = 0;
  for (const src of allImgs) {
    const from = path.join(SITE, src.replace(/^\//, ""));
    if (fs.existsSync(from)) {
      const to = path.join(OUT, "images", path.basename(src));
      await fsp.copyFile(from, to).catch(() => {});
      copied++;
    }
  }
  index.push("", `## Imagens`, "", `${copied} imagens de conteúdo copiadas para \`images/\`.`, "");
  await fsp.writeFile(path.join(OUT, "README.md"), index.join("\n"), "utf8");
  console.log(`\nImagens copiadas: ${copied}`);
  console.log(`Pacote em: ${OUT}`);
}
main();
