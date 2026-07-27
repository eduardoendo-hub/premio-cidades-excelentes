# Prêmio Cidades Excelentes — site espelhado + backend do formulário

Migração do site `premiocidadesexcelentes.band.com.br` (WordPress + Elementor Pro)
para um app **Node.js/Express** autônomo, pronto para rodar no **Coolify**.

O que este projeto faz:

1. **Serve o site estático** espelhado (todas as páginas de conteúdo).
2. **Recebe o formulário "Envie seu Projeto 2026"** (com upload de PDF) e, a cada envio:
   - valida os campos (mesmas regras do site original) e o PDF (somente PDF, até 10 MB);
   - **salva o PDF** em disco (`UPLOADS_DIR`);
   - **grava uma linha no Google Sheets** com todos os dados;
   - **envia e-mail para a organização** com os dados + o **PDF em anexo**;
   - **envia e-mail de confirmação** para quem se inscreveu.
3. Recebe também o **formulário de contato** da home (envia e-mail para a organização).

---

## Estrutura

```
premio-cidades-excelentes/
├── site/                 # site estático espelhado (servido pelo Express)
│   └── _premio/form-handler.js   # religa os formulários à nova API
├── src/
│   ├── server.js         # Express: site + /api/inscricao + /api/contato
│   ├── config.js         # lê variáveis do .env
│   ├── fields.js         # definição central dos campos (validação/planilha/e-mail)
│   ├── validation.js     # validação server-side
│   ├── sheets.js         # append no Google Sheets
│   ├── mailer.js         # e-mails da inscrição (org + confirmação)
│   └── mailer-contato.js # e-mail do formulário de contato
├── tools/
│   ├── mirror.mjs        # espelhador do site (re-executável)
│   └── patch-forms.mjs   # injeta o form-handler nas páginas espelhadas
├── uploads/              # PDFs enviados (use volume persistente em produção)
├── Dockerfile
└── .env.example
```

---

## Rodando localmente

```bash
npm install
cp .env.example .env      # preencha as credenciais (veja abaixo)
npm start                 # http://localhost:3000
```

O site é servido mesmo sem credenciais; os formulários só concluem o envio
depois de configurar Google Sheets e SMTP. `GET /healthz` mostra o que falta.

---

## Configuração

### 1. Google Sheets

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e
   ative a **Google Sheets API**.
2. Crie uma **Service Account** e gere uma **chave JSON**.
3. Crie a planilha no Google Sheets e **compartilhe com o e-mail da service account**
   (algo como `conta@projeto.iam.gserviceaccount.com`) com permissão de **Editor**.
4. Copie o **ID da planilha** (parte da URL entre `/d/` e `/edit`).
5. No `.env`: defina `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_TAB` e aponte
   `GOOGLE_APPLICATION_CREDENTIALS` para o JSON (ou use `GOOGLE_CLIENT_EMAIL` +
   `GOOGLE_PRIVATE_KEY`).

O cabeçalho da planilha é criado automaticamente na primeira inscrição.

### 2. E-mail (Gmail / Google Workspace)

- Ative a verificação em 2 etapas na conta e gere uma **Senha de App**:
  https://myaccount.google.com/apppasswords
- No `.env`: `SMTP_USER` (o e-mail), `SMTP_PASS` (a senha de app de 16 dígitos),
  `MAIL_FROM`, e `MAIL_TO_ORG` (destino das inscrições — pode ter vários,
  separados por vírgula).

> Observação: contas Gmail comuns têm limites de envio diários. Para volume alto,
> considere um serviço transacional (Resend/SendGrid) — o `mailer.js` é fácil de trocar.

---

## Deploy no Coolify

1. Suba este repositório no Git (GitHub/GitLab).
2. No Coolify, crie um recurso do tipo **Dockerfile** apontando para o repo.
3. Configure as **variáveis de ambiente** (mesmas do `.env`).
4. Monte um **volume persistente** em `/data` (para `UPLOADS_DIR=/data/uploads` e,
   se usar arquivo, o JSON da service account em `/data/google-service-account.json`).
5. Porta interna: **3000**. Healthcheck: `/healthz`.
6. Aponte o domínio e o Coolify cuida do HTTPS.

---

## Reespelhar o site (atualizar conteúdo)

```bash
npm run mirror                 # baixa novamente as páginas + assets em site/
node tools/patch-forms.mjs     # reinjeta o form-handler nas páginas de formulário
```

Ambos os passos são idempotentes.

---

## Observações importantes

- **Não temos acesso ao servidor WordPress original**, então este espelhamento cobre
  o que está publicamente acessível. PDFs/anexos já enviados no site antigo não vêm
  neste pacote (ficaram no servidor original).
- A pasta `/uploads` fica pública por padrão (`/uploads/<arquivo>`). Se os PDFs forem
  sensíveis, restrinja esse acesso (auth/token) — o ponto está isolado em `server.js`.
- Se alguma integração falhar em uma inscrição (ex.: Sheets fora do ar), os dados são
  gravados em `data/inscricoes-fallback.jsonl` para não se perderem.
```
