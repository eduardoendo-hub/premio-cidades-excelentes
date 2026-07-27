// E-mail do formulário de contato (home).
import nodemailer from "nodemailer";
import { config } from "./config.js";
import { CONTATO_FIELDS } from "./fields.js";
import { normalizeValue } from "./validation.js";

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: { user: config.mail.user, pass: config.mail.pass },
  });
  return transporter;
}
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendContatoEmail(body, ts) {
  if (!config.mail.enabled) return { skipped: true };
  const t = getTransporter();
  const rows = CONTATO_FIELDS.map(
    (f) =>
      `<tr><td style="padding:6px 10px;border:1px solid #e0e0e0;background:#f7f7f7;font-weight:600">${esc(
        f.label
      )}</td><td style="padding:6px 10px;border:1px solid #e0e0e0;white-space:pre-wrap">${esc(
        normalizeValue(body[f.key]) || "—"
      )}</td></tr>`
  ).join("");
  return t.sendMail({
    from: config.mail.from,
    to: config.mail.to,
    replyTo: normalizeValue(body.email) || undefined,
    subject: `[Contato] Mensagem de ${normalizeValue(body.name)}`,
    html: `<div style="font-family:Arial,sans-serif"><h3>Nova mensagem de contato (${esc(
      ts
    )})</h3><table style="border-collapse:collapse">${rows}</table></div>`,
  });
}
