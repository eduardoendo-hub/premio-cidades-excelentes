// Gravação de inscrições no Google Sheets via service account.
import { google } from "googleapis";
import fs from "node:fs";
import { config } from "./config.js";
import { PROJETO_FIELDS } from "./fields.js";
import { normalizeValue } from "./validation.js";

let sheetsClient = null;

function getAuth() {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  if (config.sheets.credentialsFile && fs.existsSync(config.sheets.credentialsFile)) {
    return new google.auth.GoogleAuth({ keyFile: config.sheets.credentialsFile, scopes });
  }
  if (config.sheets.clientEmail && config.sheets.privateKey) {
    return new google.auth.GoogleAuth({
      credentials: {
        client_email: config.sheets.clientEmail,
        private_key: config.sheets.privateKey,
      },
      scopes,
    });
  }
  throw new Error("Credenciais do Google não configuradas (GOOGLE_APPLICATION_CREDENTIALS ou GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY).");
}

async function getClient() {
  if (sheetsClient) return sheetsClient;
  const auth = getAuth();
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

// Cabeçalho da planilha (ordem das colunas)
export const SHEET_HEADER = [
  "Data/Hora",
  ...PROJETO_FIELDS.map((f) => f.label),
  "Arquivo (nome)",
  "Arquivo (URL)",
];

// Garante que a aba (sheet/tab) configurada exista; cria se faltar.
async function ensureSheetTab(sheets) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: config.sheets.spreadsheetId,
    fields: "sheets.properties.title",
  });
  const titles = (meta.data.sheets || []).map((s) => s.properties.title);
  if (titles.includes(config.sheets.sheetName)) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.sheets.spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: config.sheets.sheetName } } }],
    },
  });
}

async function ensureHeader(sheets) {
  const range = `${config.sheets.sheetName}!A1:1`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.spreadsheetId,
    range,
  });
  const row = res.data.values && res.data.values[0];
  if (!row || row.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.sheets.spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [SHEET_HEADER] },
    });
  }
}

// Teste leve de conectividade/permissão com a planilha (para /api/_diag)
export async function pingSheets() {
  const sheets = await getClient();
  await sheets.spreadsheets.get({
    spreadsheetId: config.sheets.spreadsheetId,
    fields: "properties.title",
  });
  return { ok: true };
}

// data: objeto com os campos do formulário; meta: { fileName, fileUrl, timestamp }
export async function appendInscricao(data, meta) {
  if (!config.sheets.enabled) return { skipped: true };
  const sheets = await getClient();
  await ensureSheetTab(sheets); // cria a aba se não existir
  await ensureHeader(sheets).catch(() => {}); // não bloqueia se não tiver permissão de update do header

  const row = [
    meta.timestamp,
    ...PROJETO_FIELDS.map((f) => normalizeValue(data[f.key])),
    meta.fileName || "",
    meta.fileUrl || "",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.sheets.spreadsheetId,
    range: `${config.sheets.sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
  return { ok: true };
}
