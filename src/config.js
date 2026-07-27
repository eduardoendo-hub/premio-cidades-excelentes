import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function bool(v, def = false) {
  if (v === undefined) return def;
  return ["1", "true", "yes", "sim"].includes(String(v).toLowerCase());
}

// Lê a chave privada do Google de forma robusta:
// 1) GOOGLE_PRIVATE_KEY_B64 (base64 do PEM) — à prova de problemas de \n/aspas
// 2) GOOGLE_PRIVATE_KEY — normaliza aspas e \n
function normalizePrivateKey() {
  const b64 = process.env.GOOGLE_PRIVATE_KEY_B64;
  if (b64 && b64.trim()) {
    try {
      return Buffer.from(b64.trim(), "base64").toString("utf8");
    } catch {
      /* cai no método abaixo */
    }
  }
  let k = (process.env.GOOGLE_PRIVATE_KEY || "").trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  return k.replace(/\\r/g, "").replace(/\\n/g, "\n");
}

export const config = {
  root: ROOT,
  siteDir: path.join(ROOT, "site"),
  uploadsDir: process.env.UPLOADS_DIR || path.join(ROOT, "uploads"),
  port: parseInt(process.env.PORT || "3000", 10),

  // Google Sheets
  sheets: {
    enabled: bool(process.env.SHEETS_ENABLED, true),
    spreadsheetId: process.env.GOOGLE_SHEETS_ID || "",
    sheetName: process.env.GOOGLE_SHEETS_TAB || "Inscrições",
    // Caminho para o JSON da service account OU credenciais inline via env
    credentialsFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL || "",
    privateKey: normalizePrivateKey(),
  },

  // E-mail (Gmail / Google Workspace via SMTP)
  mail: {
    enabled: bool(process.env.MAIL_ENABLED, true),
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    secure: bool(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || process.env.SMTP_USER || "",
    // destino das inscrições (organização) — pode ter vários separados por vírgula
    to: process.env.MAIL_TO_ORG || "",
    bcc: process.env.MAIL_BCC || "",
    // enviar e-mail de confirmação para quem se inscreveu?
    confirmation: bool(process.env.MAIL_CONFIRMATION, false),
  },

  maxUploadMB: parseInt(process.env.MAX_UPLOAD_MB || "10", 10),
};

export function missingConfig() {
  const missing = [];
  if (config.sheets.enabled) {
    if (!config.spreadsheetId && !config.sheets.spreadsheetId) missing.push("GOOGLE_SHEETS_ID");
    if (!config.sheets.credentialsFile && !config.sheets.clientEmail) missing.push("GOOGLE_CLIENT_EMAIL/GOOGLE_APPLICATION_CREDENTIALS");
  }
  if (config.mail.enabled) {
    if (!config.mail.user) missing.push("SMTP_USER");
    if (!config.mail.pass) missing.push("SMTP_PASS");
    if (!config.mail.to) missing.push("MAIL_TO_ORG");
  }
  return missing;
}
