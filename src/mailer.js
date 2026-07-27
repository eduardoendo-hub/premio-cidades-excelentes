// Envio de e-mails via SMTP (Gmail / Google Workspace) com nodemailer.
import nodemailer from "nodemailer";
import { config } from "./config.js";
import { PROJETO_FIELDS } from "./fields.js";
import { normalizeValue } from "./validation.js";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: { user: config.mail.user, pass: config.mail.pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return transporter;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildRowsHtml(data) {
  return PROJETO_FIELDS.map((f) => {
    const v = normalizeValue(data[f.key]) || "—";
    return `<tr>
      <td style="padding:6px 10px;border:1px solid #e0e0e0;background:#f7f7f7;font-weight:600;vertical-align:top;white-space:nowrap">${esc(f.label)}</td>
      <td style="padding:6px 10px;border:1px solid #e0e0e0;white-space:pre-wrap">${esc(v)}</td>
    </tr>`;
  }).join("\n");
}

// E-mail para a organização, com o PDF em anexo
export async function sendOrgEmail(data, meta, fileBuffer, fileName) {
  if (!config.mail.enabled) return { skipped: true };
  const t = getTransporter();
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:720px">
    <h2 style="color:#003a70">Nova inscrição — Prêmio Cidades Excelentes 2026</h2>
    <p><strong>Projeto:</strong> ${esc(normalizeValue(data.nome_projeto))}<br>
       <strong>Município:</strong> ${esc(normalizeValue(data.cidade))} / ${esc(normalizeValue(data.estado))}<br>
       <strong>Recebido em:</strong> ${esc(meta.timestamp)}</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px">${buildRowsHtml(data)}</table>
    <p style="margin-top:16px">
      <strong>PDF do projeto:</strong> ${esc(fileName)}<br>
      ${meta.fileUrl ? `<a href="${esc(meta.fileUrl)}" style="display:inline-block;margin-top:6px;padding:8px 16px;background:#003a70;color:#fff;text-decoration:none;border-radius:4px">⬇ Baixar PDF</a>` : ""}
      <br><span style="color:#666;font-size:12px">(o PDF também vai anexado a este e-mail)</span>
    </p>
  </div>`;

  return t.sendMail({
    from: config.mail.from,
    to: config.mail.to,
    bcc: config.mail.bcc || undefined,
    replyTo: normalizeValue(data.email) || undefined,
    subject: `[Inscrição 2026] ${normalizeValue(data.nome_projeto)} — ${normalizeValue(data.cidade)}/${normalizeValue(data.estado)}`,
    html,
    attachments: fileBuffer
      ? [{ filename: fileName, content: fileBuffer, contentType: "application/pdf" }]
      : [],
  });
}

// E-mail de confirmação para quem se inscreveu
export async function sendConfirmationEmail(data) {
  if (!config.mail.enabled) return { skipped: true };
  const to = normalizeValue(data.email);
  if (!to) return { skipped: true, reason: "sem e-mail" };
  const t = getTransporter();
  const nome = normalizeValue(data.nome_completo);
  const projeto = normalizeValue(data.nome_projeto);
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:640px">
    <h2 style="color:#003a70">Inscrição recebida!</h2>
    <p>Olá, ${esc(nome)},</p>
    <p>Recebemos a inscrição do projeto <strong>${esc(projeto)}</strong> no
       <strong>Prêmio Band Cidades Excelentes 2026</strong>. Em breve nossa equipe fará a análise.</p>
    <p>Guarde este e-mail como comprovante do envio.</p>
    <p style="margin-top:24px;color:#666;font-size:12px">Este é um e-mail automático, por favor não responda.</p>
  </div>`;

  return t.sendMail({
    from: config.mail.from,
    to,
    subject: "Confirmação de inscrição — Prêmio Cidades Excelentes 2026",
    html,
  });
}

export async function verifyMailer() {
  if (!config.mail.enabled) return { skipped: true };
  const t = getTransporter();
  await t.verify();
  return { ok: true };
}
