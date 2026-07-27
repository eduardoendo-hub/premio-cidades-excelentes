// Definição central dos campos do formulário "Envie seu Projeto 2026".
// Espelha exatamente os campos e obrigatoriedade extraídos do Elementor.
// Usado por: validação, colunas da planilha e corpo dos e-mails.

export const PROJETO_FIELDS = [
  { key: "nome_completo", label: "Nome Completo", type: "text", required: true },
  { key: "cargo", label: "Cargo", type: "text", required: true },
  { key: "email", label: "Email", type: "email", required: true },
  { key: "endereco", label: "Endereço", type: "text", required: true },
  { key: "cidade", label: "Cidade", type: "text", required: true },
  { key: "estado", label: "Estado", type: "text", required: true },
  { key: "site_municipio", label: "Site do município", type: "text", required: true },
  { key: "nome_projeto", label: "Nome do projeto", type: "text", required: true },
  { key: "secretaria_orgao", label: "Secretaria/Órgão municipal responsável", type: "text", required: true },
  { key: "principal_indicador", label: "Principal indicador impactado", type: "text", required: false },
  { key: "outro_indicador", label: "Outro indicador impactado", type: "text", required: false },
  { key: "obj_qualitativos", label: "Objetivos qualitativos", type: "textarea", required: false },
  { key: "obj_quantitativos", label: "Objetivos quantitativos", type: "textarea", required: false },
  { key: "meta_financeira", label: "Meta financeira", type: "text", required: false },
  { key: "publico_alvo", label: "Público alvo", type: "text", required: false },
  { key: "Data_Inicio", label: "Data de início", type: "date", required: true },
  { key: "Data_Termino", label: "Data de término", type: "date", required: true },
  { key: "principais_acoes", label: "Principais ações", type: "textarea", required: true },
  { key: "custo_financeiro", label: "Custo financeiro / fonte de financiamento", type: "text", required: false },
  { key: "pessoas_envolvidas", label: "Pessoas envolvidas / parceiros", type: "textarea", required: false },
  { key: "replicabilidade", label: "Possibilidade de replicabilidade?", type: "checkbox", required: false },
  { key: "repercussao_midia", label: "Teve repercussão na mídia?", type: "checkbox", required: false },
  { key: "link_materias", label: "Links das matérias", type: "textarea", required: false },
  { key: "link_depoimentos", label: "Links dos depoimentos", type: "textarea", required: false },
  { key: "termos_condicoes", label: "Li e aceito termos e condições", type: "accept", required: true },
];

// Campo de arquivo (tratado à parte pelo multer)
export const FILE_FIELD = {
  key: "anexo_pdf",
  label: "Anexo (PDF)",
  required: true,
  maxSizeMB: 10,
  mime: ["application/pdf"],
  ext: [".pdf"],
};

export const CONTATO_FIELDS = [
  { key: "name", label: "Nome", type: "text", required: true },
  { key: "field_34f4e69", label: "Telefone", type: "text", required: false },
  { key: "email", label: "E-mail", type: "email", required: true },
  { key: "message", label: "Mensagem", type: "textarea", required: true },
];
