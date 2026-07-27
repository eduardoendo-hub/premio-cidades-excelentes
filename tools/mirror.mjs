// Espelhador do site premiocidadesexcelentes.band.com.br
// Baixa todas as páginas públicas (via sitemap) + assets do mesmo host,
// reescreve URLs para caminhos root-relative e salva em ../site preservando
// a estrutura de caminhos do WordPress. Assets de terceiros são mantidos como URL absoluta.
//
// Uso: node tools/mirror.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE_DIR = path.join(ROOT, "site");

const ORIGIN = "https://premiocidadesexcelentes.band.com.br";
const HOST = "premiocidadesexcelentes.band.com.br";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// Padrões de URL a ignorar (não são conteúdo estático servível)
const SKIP = [
  /\/wp-json\//,
  /\/feed\/?$/,
  /\/comments\/feed\//,
  /\/xmlrpc\.php/,
  /\/wp-login\.php/,
  /\/author\//,
  /[?&]replytocom=/,
  /[?&]s=/,
  /\/comment-page-/,
];

const ASSET_EXT =
  /\.(css|js|mjs|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|otf|mp4|webm|mp3|pdf|json|map|xml|txt)(\?|$)/i;

const seenPages = new Set();
const pageQueue = [];
const seenAssets = new Set();
const assetQueue = [];
let downloaded = 0;
let failed = 0;
const failures = [];

function log(...a) {
  console.log(...a);
}

async function ensureDir(p) {
  await fs.mkdir(path.dirname(p), { recursive: true });
}

async function fetchBuf(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
      if (!res.ok) {
        if (res.status === 404 || res.status === 410) return { status: res.status };
        throw new Error("HTTP " + res.status);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get("content-type") || "";
      return { buf, ct, status: res.status, finalUrl: res.url };
    } catch (e) {
      if (i === tries - 1) return { error: String(e) };
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}

// Normaliza uma URL absoluta do mesmo host para o caminho local em disco.
// Página (sem extensão / termina em /) => <path>/index.html
// Asset => <pathname sem query>
function urlToLocal(pathname, isPage) {
  let p = decodeURIComponent(pathname.split("#")[0]);
  if (isPage) {
    if (p.endsWith("/")) p += "index.html";
    else if (!path.extname(p)) p += "/index.html";
    else if (p.endsWith(".html")) {
      /* keep */
    } else p += "/index.html";
  }
  p = p.replace(/^\/+/, "");
  return path.join(SITE_DIR, p);
}

// Caminho root-relative (o que vai no HTML) para uma URL do mesmo host.
function urlToRootRelative(u, isPage) {
  const url = new URL(u);
  let p = url.pathname;
  if (isPage) {
    if (!p.endsWith("/") && !path.extname(p)) p += "/";
    return p; // sem query em páginas
  }
  return p; // asset: sem query -> casa com o arquivo salvo
}

function sameHost(u) {
  try {
    const url = new URL(u);
    return url.hostname === HOST;
  } catch {
    return false;
  }
}

function shouldSkip(u) {
  return SKIP.some((re) => re.test(u));
}

function isAssetUrl(u) {
  try {
    const url = new URL(u);
    return ASSET_EXT.test(url.pathname);
  } catch {
    return false;
  }
}

function enqueuePage(u) {
  try {
    const url = new URL(u, ORIGIN);
    url.hash = "";
    if (url.hostname !== HOST) return;
    if (shouldSkip(url.href)) return;
    const key = url.pathname;
    if (seenPages.has(key)) return;
    seenPages.add(key);
    pageQueue.push(url.href);
  } catch {}
}

function enqueueAsset(u) {
  try {
    const url = new URL(u, ORIGIN);
    if (url.hostname !== HOST) return;
    const key = url.pathname; // ignoramos query para deduplicar
    if (seenAssets.has(key)) return;
    seenAssets.add(key);
    assetQueue.push(url.href);
  } catch {}
}

// Extrai URLs de assets e páginas de um HTML
function looksLikeUrl(v) {
  if (!v || /\s/.test(v)) return false; // valores com espaço não são URL (ex.: meta content)
  return /^(https?:)?\/\//.test(v) || v.startsWith("/") || /^[\w./-]+\.(css|js|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|otf|mp4|webm|mp3|pdf)(\?|$)/i.test(v);
}

function extractUrls(html) {
  const urls = new Set();
  const attrRe = /(?:href|src|content|data-src|poster)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = attrRe.exec(html))) if (looksLikeUrl(m[1])) urls.add(m[1]);
  // srcset
  const srcsetRe = /srcset\s*=\s*["']([^"']+)["']/gi;
  while ((m = srcsetRe.exec(html))) {
    m[1].split(",").forEach((part) => {
      const u = part.trim().split(/\s+/)[0];
      if (u) urls.add(u);
    });
  }
  // url(...) em <style> inline
  const cssUrlRe = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((m = cssUrlRe.exec(html))) urls.add(m[1]);
  return [...urls];
}

// Descobre páginas e assets do mesmo host (para enfileirar download) e
// reescreve APENAS o domínio de origem para caminho root-relative.
// Não fazemos replace por-URL (isso corromperia texto): como o WordPress emite
// URLs absolutas e o Express ignora a query string (?ver=) ao servir arquivos,
// remover a origem é suficiente e seguro.
function rewriteHtml(html) {
  const found = extractUrls(html);
  for (const raw of found) {
    if (!raw || raw.startsWith("data:") || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:"))
      continue;
    let abs;
    try {
      abs = new URL(raw, ORIGIN);
    } catch {
      continue;
    }
    if (abs.hostname !== HOST) continue; // terceiros ficam absolutos
    if (isAssetUrl(abs.href)) enqueueAsset(abs.href);
    else if (!shouldSkip(abs.href)) enqueuePage(abs.href);
  }
  return stripOrigin(html);
}

// Remove todas as formas do domínio de origem, deixando caminho root-relative.
function stripOrigin(text) {
  const escJson = ORIGIN.replace(/\//g, "\\/"); // https:\/\/host
  text = replaceAll(text, escJson + "\\/", "\\/"); // preserva a barra escapada seguinte
  text = replaceAll(text, escJson, "");
  text = replaceAll(text, ORIGIN, "");
  text = replaceAll(text, "http://" + HOST, "");
  text = replaceAll(text, "//" + HOST, ""); // protocolo-relativo
  return text;
}

function replaceAll(hay, needle, rep) {
  if (!needle) return hay;
  return hay.split(needle).join(rep);
}

// Processa CSS: baixa url(...) do mesmo host (resolvendo relativo ao CSS).
// Só reescreve URLs absolutas do host (remoção de origem); relativas já funcionam.
async function processCss(cssText, cssUrl) {
  const cssUrlRe = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  const found = new Set();
  let m;
  while ((m = cssUrlRe.exec(cssText))) found.add(m[1]);
  for (const raw of found) {
    if (!raw || raw.startsWith("data:")) continue;
    let abs;
    try {
      abs = new URL(raw, cssUrl);
    } catch {
      continue;
    }
    if (abs.hostname !== HOST) continue;
    enqueueAsset(abs.href);
  }
  return stripOrigin(cssText);
}

async function processPage(url) {
  const r = await fetchBuf(url);
  if (r.error || r.status >= 400 || !r.buf) {
    failed++;
    failures.push([url, r.error || r.status]);
    return;
  }
  if (!(r.ct || "").includes("text/html")) {
    // servido como página mas é asset
    return saveAsset(url, r);
  }
  let html = r.buf.toString("utf8");
  html = rewriteHtml(html);
  const local = urlToLocal(new URL(url).pathname, true);
  await ensureDir(local);
  await fs.writeFile(local, html, "utf8");
  downloaded++;
  if (downloaded % 10 === 0)
    log(`  páginas: ${downloaded} salvas | fila páginas ${pageQueue.length} | fila assets ${assetQueue.length}`);
}

async function saveAsset(url, pre) {
  const r = pre || (await fetchBuf(url));
  if (r.error || r.status >= 400 || !r.buf) {
    failed++;
    failures.push([url, r.error || r.status]);
    return;
  }
  const local = urlToLocal(new URL(url).pathname, false);
  await ensureDir(local);
  if (/\.css(\?|$)/i.test(url)) {
    const css = await processCss(r.buf.toString("utf8"), url);
    await fs.writeFile(local, css, "utf8");
  } else {
    await fs.writeFile(local, r.buf);
  }
  downloaded++;
}

async function getSitemapUrls() {
  const maps = ["/page-sitemap.xml", "/post-sitemap.xml", "/category-sitemap.xml"];
  const urls = new Set([ORIGIN + "/"]);
  for (const mp of maps) {
    const r = await fetchBuf(ORIGIN + mp);
    if (r.buf) {
      const xml = r.buf.toString("utf8");
      const re = /<loc>([^<]+)<\/loc>/g;
      let m;
      while ((m = re.exec(xml))) urls.add(m[1].trim());
    }
  }
  return [...urls];
}

async function main() {
  log("Coletando URLs do sitemap...");
  const sm = await getSitemapUrls();
  log(`  ${sm.length} URLs no sitemap`);
  sm.forEach(enqueuePage);

  log("Baixando páginas (descobrindo assets)...");
  while (pageQueue.length) {
    const url = pageQueue.shift();
    await processPage(url);
  }
  log(`Páginas concluídas: ${downloaded} arquivos. Assets na fila: ${assetQueue.length}`);

  log("Baixando assets...");
  let a = 0;
  while (assetQueue.length) {
    const url = assetQueue.shift();
    await saveAsset(url);
    a++;
    if (a % 50 === 0) log(`  assets: ${a} baixados | fila ${assetQueue.length}`);
  }

  log("\n=== RESUMO ===");
  log(`Total arquivos salvos: ${downloaded}`);
  log(`Falhas: ${failed}`);
  if (failures.length) {
    await fs.writeFile(
      path.join(ROOT, "data", "mirror-failures.json"),
      JSON.stringify(failures, null, 2)
    );
    log(`Falhas registradas em data/mirror-failures.json`);
  }
}

main().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
