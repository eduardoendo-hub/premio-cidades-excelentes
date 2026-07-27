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

      // dispara integrações; não deixa o usuário na mão se uma falhar
      const tasks = [
        appendInscricao(body, { fileName, fileUrl, timestamp: ts }),
        sendOrgEmail(body, { timestamp: ts }, file.buffer, file.originalname),
      ];
      const names = ["sheets", "orgEmail"];
      if (config.mail.confirmation) {
        tasks.push(sendConfirmationEmail(body));
        names.push("confirmEmail");
      }
      const results = await Promise.allSettled(tasks);

      const problems = results
        .map((r, i) => ({ r, name: names[i] }))
        .filter((x) => x.r.status === "rejected")
        .map((x) => `${x.name}: ${x.r.reason?.message || x.r.reason}`);

      if (problems.length) {
        console.error("[inscricao] integrações com problema:", problems);
        // Log persistente para não perder o dado mesmo se integração falhar
        await appendFallbackLog(body, fileName, ts, problems);
      }

      return res.json({
        ok: true,
        message: "Inscrição recebida com sucesso!",
        warnings: problems.length ? problems : undefined,
      });
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

app.listen(config.port, () => {
  const miss = missingConfig();
  console.log(`\n▶ Prêmio Cidades Excelentes rodando em http://localhost:${config.port}`);
  if (miss.length) {
    console.log(`⚠  Config pendente (.env): ${miss.join(", ")}`);
    console.log(`   O site é servido normalmente, mas os formulários só funcionam 100% após configurar.`);
  }
});
