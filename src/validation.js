// Validação server-side espelhando as regras do Elementor.
import { FILE_FIELD } from "./fields.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmpty(v) {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  return String(v).trim() === "";
}

// Valida os campos de texto do formulário conforme a definição.
// `body` = campos de texto; `file` = objeto do multer (ou undefined).
export function validate(fields, body, file, { requireFile = true } = {}) {
  const errors = {};

  for (const f of fields) {
    const val = body[f.key];

    if (f.type === "accept") {
      // checkbox de aceite obrigatório precisa estar marcado
      const accepted = val === true || val === "on" || val === "true" || val === "1" || (Array.isArray(val) && val.length > 0);
      if (f.required && !accepted) errors[f.key] = "É necessário aceitar os termos e condições.";
      continue;
    }

    if (f.required && isEmpty(val)) {
      errors[f.key] = `O campo "${f.label}" é obrigatório.`;
      continue;
    }
    if (isEmpty(val)) continue;

    if (f.type === "email" && !EMAIL_RE.test(String(val).trim())) {
      errors[f.key] = "E-mail inválido.";
    }
    if (f.type === "date" && isNaN(Date.parse(String(val)))) {
      errors[f.key] = "Data inválida.";
    }
  }

  // Arquivo
  if (requireFile) {
    if (!file) {
      errors[FILE_FIELD.key] = "O anexo em PDF é obrigatório.";
    } else {
      const okMime = FILE_FIELD.mime.includes(file.mimetype);
      const okExt = FILE_FIELD.ext.some((e) => file.originalname.toLowerCase().endsWith(e));
      if (!okMime && !okExt) {
        errors[FILE_FIELD.key] = "O anexo deve ser um arquivo PDF.";
      }
      if (file.size > FILE_FIELD.maxSizeMB * 1024 * 1024) {
        errors[FILE_FIELD.key] = `O anexo excede o tamanho máximo de ${FILE_FIELD.maxSizeMB} MB.`;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// Normaliza checkboxes (array) para string legível
export function normalizeValue(v) {
  if (Array.isArray(v)) return v.join(", ");
  if (v === true) return "Sim";
  return v == null ? "" : String(v);
}
