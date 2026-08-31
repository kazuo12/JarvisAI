export type AreaKey =
  | "metas" | "trabalho" | "projetos" | "financas"
  | "aprendizado" | "saude" | "relacoes" | "meta";

export interface Note {
  id: string;
  area: AreaKey;
  title: string;
  body: string;
}

export type Rel = [string, string];

/** Etapas da abertura: boot automático, tela de ativação, aplicação. */
export type Phase = "boot" | "activate" | "app";

/** O que o orbe está representando neste instante. */
export type AgentState = "idle" | "listening" | "thinking" | "speaking";

export type BrainMode = "local" | "claude";

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export interface HealthReport {
  ok: boolean;
  backend?: string;
  modelo_padrao?: string;
  modelos?: string[];
  tts?: { ok: boolean; voz?: string };
}
