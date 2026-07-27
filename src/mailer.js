// Envio de e-mails via SMTP (Gmail / Google Workspace) com nodemailer.
import nodemailer from "nodemailer";
import { config } from "./config.js";
import { PROJETO_FIELDS, EMAIL_LAYOUT } from "./fields.js";
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

// Valor de um campo: anexo_pdf mostra a URL do PDF (como no site antigo)
function fieldValue(key, data, meta) {
  if (key === "anexo_pdf") return meta.fileUrl || "";
  return normalizeValue(data[key]);
}

// Monta o corpo em TEXTO puro, idêntico ao site antigo (Elementor)
export function buildOrgEmailText(data, meta) {
  const lines = [];
  for (const grp of EMAIL_LAYOUT) {
    lines.push(grp.section);
    for (const [key, label] of grp.items) {
      const val = fieldValue(key, data, meta);
      lines.push(label === "__VALUE_ONLY__" ? `${val}` : `${label}: ${val}`);
    }
  }
  lines.push("", "---", "");
  if (meta.dateLong) lines.push(`Date: ${meta.dateLong}`);
  if (meta.time) lines.push(`Time: ${meta.time}`);
  if (meta.pageUrl) lines.push(`Page URL: ${meta.pageUrl}`);
  if (meta.userAgent) lines.push(`User Agent: ${meta.userAgent}`);
  if (meta.ip) lines.push(`Remote IP: ${meta.ip}`);
  lines.push("Powered by: Band");
  return lines.join("\n");
}

// Versão HTML (mesmo conteúdo/ordem, seções em negrito)
function buildOrgEmailHtml(data, meta) {
  const parts = [];
  for (const grp of EMAIL_LAYOUT) {
    parts.push(`<p style="margin:14px 0 4px;font-weight:bold">${esc(grp.section)}</p>`);
    for (const [key, label] of grp.items) {
      const valHtml = esc(fieldValue(key, data, meta)).replace(/\n/g, "<br>");
      if (label === "__VALUE_ONLY__") {
        parts.push(`<div style="margin:2px 0">${valHtml}</div>`);
      } else {
        const labelHtml = esc(label).replace(/\n/g, "<br>");
        parts.push(`<div style="margin:2px 0"><strong>${labelHtml}:</strong> ${valHtml}</div>`);
      }
    }
  }
  const footer = [
    meta.dateLong ? `Date: ${esc(meta.dateLong)}` : "",
    meta.time ? `Time: ${esc(meta.time)}` : "",
    meta.pageUrl ? `Page URL: ${esc(meta.pageUrl)}` : "",
    meta.userAgent ? `User Agent: ${esc(meta.userAgent)}` : "",
    meta.ip ? `Remote IP: ${esc(meta.ip)}` : "",
    "Powered by: Band",
  ].filter(Boolean).join("<br>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;font-size:14px;max-width:760px">
    ${parts.join("\n")}
    <hr style="margin:18px 0;border:none;border-top:1px solid #ddd">
    <div style="color:#666;font-size:12px">${footer}</div>
  </div>`;
}

// E-mail para a organização, com o PDF em anexo (formato idêntico ao site antigo)
export async function sendOrgEmail(data, meta, fileBuffer, fileName) {
  if (!config.mail.enabled) return { skipped: true };
  const t = getTransporter();

  return t.sendMail({
    from: config.mail.from,
    to: config.mail.to,
    bcc: config.mail.bcc || undefined,
    replyTo: normalizeValue(data.email) || undefined,
    subject: "Projeto enviado pelo site Prêmio Band Cidades Excelentes",
    text: buildOrgEmailText(data, meta),
    html: buildOrgEmailHtml(data, meta),
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
