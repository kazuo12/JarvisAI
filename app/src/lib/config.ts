import type { AreaKey, Note, Rel } from "./types";

export const CONFIG = {
  name: "Jarvis",
  address: "senhor",
  themeColor: "#4ea8ff",
  persona: "formal britanico",
  wakeWord: "ei jarvis",
  voiceGender: "masculina" as "masculina" | "feminina",
  model: "claude-sonnet-5",
  localUrl: "",
  localModel: ""
};

export const AREA: Record<AreaKey, { label: string; color: string }> = {
  metas:       { label: "Metas",       color: "#fbbf24" },
  trabalho:    { label: "Carreira",    color: "#ff5547" },
  projetos:    { label: "Projetos",    color: "#8b7cff" },
  financas:    { label: "Finanças",    color: "#f7931a" },
  aprendizado: { label: "Aprendizado", color: "#2dd4ff" },
  saude:       { label: "Saúde",       color: "#10b981" },
  relacoes:    { label: "Relações",    color: "#ec4899" },
  meta:        { label: "Perfil",      color: "#8a90a6" }
};

export const AREA_KEYS = Object.keys(AREA) as AreaKey[];

export const SEED_NOTES: Note[] = [
  { id: "n1",  area: "meta",        title: "Kazuo",           body: "Kazuo, 18 anos, engenheiro de software, mora em Itapetininga (SP)." },
  { id: "n2",  area: "metas",       title: "Evoluir Código",  body: "Meta de curto prazo (3-6 meses): melhorar muito em programação." },
  { id: "n3",  area: "metas",       title: "Empresa Própria", body: "Meta de longo prazo (1-3 anos): abrir a própria empresa." },
  { id: "n4",  area: "trabalho",    title: "Full Stack",      body: "Estudante e engenheiro de software; foco atual em desenvolvimento full stack." },
  { id: "n5",  area: "projetos",    title: "App",             body: "Projeto de aplicativo, feito para evolução pessoal." },
  { id: "n6",  area: "projetos",    title: "Site",            body: "Projeto de site, feito para evolução pessoal." },
  { id: "n7",  area: "projetos",    title: "Bot",             body: "Projeto de bot, feito para evolução pessoal." },
  { id: "n8",  area: "financas",    title: "Crescer",         body: "Objetivo financeiro: ser grande na área da programação e fazer a conta bancária crescer junto." },
  { id: "n9",  area: "aprendizado", title: "Fundamentos",     body: "Estudando as bases da programação neste momento." },
  { id: "n10", area: "aprendizado", title: "Banco de Dados",  body: "Próxima trilha de estudo depois dos fundamentos." },
  { id: "n11", area: "aprendizado", title: "Frameworks",      body: "Próxima trilha de estudo depois dos fundamentos." },
  { id: "n12", area: "aprendizado", title: "IA",              body: "Próxima trilha de estudo: inteligência artificial." },
  { id: "n13", area: "saude",       title: "Musculação",      body: "Treina musculação com regularidade." },
  { id: "n14", area: "saude",       title: "Sono",            body: "Dorme 6 horas por dia — pouco, há espaço para melhorar." },
  { id: "n15", area: "saude",       title: "Alimentação",     body: "Mantém alimentação saudável." },
  { id: "n16", area: "relacoes",    title: "Giovana",         body: "Giovana, namorada do Kazuo." },
  { id: "n17", area: "relacoes",    title: "Pais",            body: "Pai e mãe — família mais próxima." }
];

export const SEED_REL: Rel[] = [
  ["n1","n2"],["n1","n3"],["n1","n4"],["n1","n16"],["n1","n17"],["n1","n9"],
  ["n2","n3"],["n2","n4"],["n2","n5"],["n2","n6"],["n2","n7"],
  ["n2","n9"],["n2","n10"],["n2","n11"],["n2","n12"],["n2","n14"],
  ["n3","n4"],["n3","n5"],["n3","n8"],["n3","n12"],
  ["n4","n5"],["n4","n6"],["n4","n7"],["n4","n10"],["n4","n11"],["n4","n8"],
  ["n5","n11"],["n6","n11"],["n7","n12"],["n5","n6"],
  ["n9","n10"],["n9","n11"],["n11","n12"],
  ["n13","n14"],["n13","n15"],["n14","n15"],
  ["n16","n17"],["n16","n13"],["n17","n8"]
];

export const STORAGE = {
  notes: "jarvis_notes",
  rel:   "jarvis_rel",
  brain: "jarvis_brain",
  key:   "anthropic_key",
  voice: "jarvis_voice"
} as const;
