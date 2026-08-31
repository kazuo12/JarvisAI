import { AREA, AREA_KEYS, CONFIG } from "./config";
import type { AreaKey, Note } from "./types";
import { norm } from "./text";

const PERSONAS: Record<string, string> = {
  "formal britanico":
    "Você é um mordomo britânico impecável: educado, cerimonioso, discreto, com elegância seca e leve ironia refinada. Nunca é servil demais nem informal.",
  "descontraido":
    "Você é descontraído, direto e amigável, como um parceiro de trabalho leve e prestativo.",
  "sarcastico":
    "Você é afiado e sarcástico, com humor seco, mas sempre entrega a informação certa."
};

/** O Second Brain inteiro, agrupado por área, em texto. */
export function brainText(notes: Note[]): string {
  const grupos = new Map<AreaKey, Note[]>();
  for (const n of notes) {
    const area = (AREA[n.area] ? n.area : "meta") as AreaKey;
    const lista = grupos.get(area) || [];
    lista.push(n);
    grupos.set(area, lista);
  }

  let saida = "";
  for (const chave of AREA_KEYS) {
    const lista = grupos.get(chave);
    if (!lista?.length) continue;
    saida += `\n[${AREA[chave].label.toUpperCase()}]\n`;
    for (const n of lista) saida += `- ${n.title}: ${n.body}\n`;
  }
  return saida.trim();
}

export function buildSystemPrompt(notes: Note[]): string {
  const persona = PERSONAS[CONFIG.persona] ?? PERSONAS["formal britanico"];
  return (
    `Você é ${CONFIG.name}, o assistente pessoal de voz do Kazuo. ${persona}` +
    ` Trate o usuário SEMPRE como "${CONFIG.address}".\n\n` +
    "REGRAS DE RESPOSTA:\n" +
    "- Responda sempre em português do Brasil.\n" +
    "- Suas respostas são FALADAS em voz alta: seja curto, de 2 a 4 frases.\n" +
    "- Nunca use emojis, markdown, listas com marcadores, asteriscos ou títulos. Só texto corrido natural.\n" +
    "- Escreva como se fosse falar: nada de siglas soltas ou números crus.\n\n" +
    "SECOND BRAIN — TUDO O QUE VOCÊ SABE SOBRE O KAZUO:\n" +
    brainText(notes) + "\n\n" +
    "Use esse conhecimento em toda resposta: fale como quem conhece a vida dele, os projetos, as metas, a saúde e as pessoas próximas. Nunca finja não saber.\n\n" +
    "PROTOCOLO DE MEMÓRIA VIVA:\n" +
    "Se o usuário revelar algo novo e duradouro sobre a vida dele, TERMINE a resposta com uma linha no formato EXATO [[SAVE:area|titulo|texto]] " +
    "(area ∈ metas, trabalho, projetos, financas, aprendizado, saude, relacoes, meta). O título deve ter 1 ou 2 palavras. " +
    "Se já existir uma nota com esse título, ela é atualizada; senão, uma nova nasce. " +
    "Inclua essa linha SOMENTE quando houver algo realmente novo e permanente — nunca para conversa passageira. " +
    "Nunca mencione, leia ou explique essa linha em voz alta."
  );
}

const SAVE_RE = /\[\[SAVE:([a-z_]+)\|([^|]+)\|([\s\S]+?)\]\]/;

export interface SaveOrder {
  area: AreaKey;
  title: string;
  body: string;
}

/** Separa as ordens de memória do texto que será exibido e falado. */
export function extractSaves(raw: string): { clean: string; saves: SaveOrder[] } {
  let texto = raw;
  const saves: SaveOrder[] = [];
  let m: RegExpMatchArray | null;

  while ((m = texto.match(SAVE_RE))) {
    const area = (AREA[m[1] as AreaKey] ? m[1] : "meta") as AreaKey;
    saves.push({ area, title: m[2].trim(), body: m[3].trim() });
    texto = texto.replace(SAVE_RE, "");
  }

  return { clean: texto.replace(/\n{3,}/g, "\n\n").trim(), saves };
}

/** Aplica as ordens: atualiza a nota de mesmo título ou cria uma nova. */
export function applySaves(
  notes: Note[],
  saves: SaveOrder[]
): { notes: Note[]; touched: string[] } {
  const proximas = notes.slice();
  const touched: string[] = [];

  for (const ordem of saves) {
    const i = proximas.findIndex(n => norm(n.title) === norm(ordem.title));
    if (i >= 0) {
      proximas[i] = { ...proximas[i], area: ordem.area, body: ordem.body };
      touched.push(proximas[i].id);
    } else {
      const id = "n" + Date.now().toString(36) + Math.floor(Math.random() * 999).toString(36);
      proximas.push({ id, area: ordem.area, title: ordem.title, body: ordem.body });
      touched.push(id);
    }
  }

  return { notes: proximas, touched };
}
