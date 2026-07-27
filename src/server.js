import express from "express";
import multer from "multer";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { config, missingConfig } from "./config.js";
import { PROJETO_FIELDS, CONTATO_FIELDS, FILE_FIELD } from "./fields.js";
import { validate } from "./validation.js";
import { appendInscricao } from "./sheets.js";
import { sendOrgEmail, sendConfirmationEmail } from "./mailer.js";

const app = express();
app.set("trust proxy", true);

// ---- uploads ----
fs.mkdirSync(config.uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (config.maxUploadMB + 1) * 1024 * 1024 },
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---- Healthcheck ----
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, missingConfig: missingConfig() });
});

// ---- Diagnóstico (Sheets + portas SMTP) — para depurar conectividade do host ----
app.get("/api/_diag", async (req, res) => {
  if (req.query.key !== (process.env.DIAG_KEY || "premio-diag-2026")) {
    return res.status(403).json({ ok: false });
  }
  const out = { sheets: null, smtp465: null, smtp587: null };

  // Sheets (HTTPS 443)
  try {
    const t0 = Date.now();
    const { pingSheets } = await import("./sheets.js");
    await pingSheets();
    out.sheets = { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    out.sheets = { ok: false, error: e.message };
  }

  // Testa portas SMTP do Gmail
  const nodemailer = (await import("nodemailer")).default;
  for (const [key, port, secure] of [
    ["smtp465", 465, true],
    ["smtp587", 587, false],
  ]) {
    const t0 = Date.now();
    try {
      const t = nodemailer.createTransport({
        host: config.mail.host,
        port,
        secure,
        auth: { user: config.mail.user, pass: config.mail.pass },
        connectionTimeout: 12000,
        greetingTimeout: 8000,
        socketTimeout: 12000,
      });
      await t.verify();
      out[key] = { ok: true, ms: Date.now() - t0 };
    } catch (e) {
      out[key] = { ok: false, ms: Date.now() - t0, error: e.message };
    }
  }
  res.json(out);
});

function timestamp() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

// ---- POST inscrição (Envie seu Projeto) ----
app.post("/api/inscricao", (req, res) => {
  upload.single("anexo_pdf")(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? `O anexo excede o tamanho máximo de ${FILE_FIELD.maxSizeMB} MB.`
          : "Erro ao processar o arquivo enviado.";
      return res.status(400).json({ ok: false, errors: { anexo_pdf: msg } });
    }
    try {
      const body = req.body || {};
      const file = req.file;

      const { valid, errors } = validate(PROJETO_FIELDS, body, file, { requireFile: true });
      if (!valid) return res.status(422).json({ ok: false, errors });

      const ts = timestamp();
      // salva o PDF
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rand = crypto.randomBytes(4).toString("hex");
      const fileName = `${stamp}_${rand}_${safeName(file.originalname)}`;
      const filePath = path.join(config.uploadsDir, fileName);
      await fsp.writeFile(filePath, file.buffer);
      const fileUrl = `/uploads/${fileName}`;

      // 1) Grava no Sheets (fonte da verdade). Se falhar, registra fallback.
      try {
        await appendInscricao(body, { fileName, fileUrl, timestamp: ts });
      } catch (e) {
        console.error("[inscricao] Sheets falhou:", e.message);
        await appendFallbackLog(body, fileName, ts, ["sheets: " + e.message]);
      }

      // 2) Responde já ao usuário — não espera o e-mail (pode ser lento/bloqueado no host)
      res.json({ ok: true, message: "Inscrição recebida com sucesso!" });

      // 3) E-mails em segundo plano (best-effort); falha vira log, não trava o usuário
      (async () => {
        try {
          await sendOrgEmail(body, { timestamp: ts }, file.buffer, file.originalname);
        } catch (e) {
          console.error("[inscricao] e-mail ADM falhou:", e.message);
          await appendFallbackLog(body, fileName, ts, ["orgEmail: " + e.message]);
        }
        if (config.mail.confirmation) {
          try {
            await sendConfirmationEmail(body);
          } catch (e) {
            console.error("[inscricao] e-mail confirmação falhou:", e.message);
          }
        }
      })();
      return;
    } catch (e) {
      console.error("[inscricao] erro:", e);
      return res.status(500).json({ ok: false, message: "Erro interno ao processar a inscrição." });
    }
  });
});

// ---- POST contato ----
app.post("/api/contato", async (req, res) => {
  try {
    const body = req.body || {};
    const { valid, errors } = validate(CONTATO_FIELDS, body, null, { requireFile: false });
    if (!valid) return res.status(422).json({ ok: false, errors });

    // reaproveita mailer simples para contato
    const { sendContatoEmail } = await import("./mailer-contato.js");
    await sendContatoEmail(body, timestamp());
    return res.json({ ok: true, message: "Mensagem enviada com sucesso!" });
  } catch (e) {
    console.error("[contato] erro:", e);
    return res.status(500).json({ ok: false, message: "Erro ao enviar mensagem." });
  }
});

// fallback: registra a inscrição em arquivo JSONL caso alguma integração falhe
async function appendFallbackLog(body, fileName, ts, problems) {
  try {
    const line =
      JSON.stringify({ ts, fileName, problems, data: body }) + "\n";
    await fsp.appendFile(path.join(config.root, "data", "inscricoes-fallback.jsonl"), line);
  } catch (e) {
    console.error("Falha ao gravar fallback:", e);
  }
}

// ---- Arquivos enviados (acesso restrito por padrão; ajuste conforme necessário) ----
app.use("/uploads", express.static(config.uploadsDir));

// ---- Site estático espelhado ----
app.use(
  express.static(config.siteDir, {
    extensions: ["html"],
    setHeaders(res, p) {
      if (p.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
    },
  })
);

// Fallback para diretórios do WordPress (/pagina/ -> /pagina/index.html)
app.get(/.*/, (req, res) => {
  const rel = decodeURIComponent(req.path.replace(/^\/+/, ""));
  const candidate = path.join(config.siteDir, rel, "index.html");
  if (candidate.startsWith(config.siteDir) && fs.existsSync(candidate)) {
    return res.sendFile(candidate);
  }
  const notFound = path.join(config.siteDir, "404", "index.html");
  if (fs.existsSync(notFound)) return res.status(404).sendFile(notFound);
  res.status(404).send("Página não encontrada");
});

// Um erro solto (ex.: socket de e-mail) nunca deve derrubar o processo
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err?.message || err);
});

// Garante a pasta data/ para o log de fallback
try {
  fs.mkdirSync(path.join(config.root, "data"), { recursive: true });
} catch {}

// Bind explícito em IPv4 (0.0.0.0) para o proxy do Coolify alcançar
app.listen(config.port, "0.0.0.0", () => {
  const miss = missingConfig();
  console.log(`\n▶ Prêmio Cidades Excelentes rodando em 0.0.0.0:${config.port}`);
  if (miss.length) {
    console.log(`⚠  Config pendente (.env): ${miss.join(", ")}`);
    console.log(`   O site é servido normalmente, mas os formulários só funcionam 100% após configurar.`);
  }
});
