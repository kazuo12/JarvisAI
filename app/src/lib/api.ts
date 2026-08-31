import { CONFIG } from "./config";
import type { HealthReport, Turn } from "./types";

/**
 * No modo local o alvo é sempre a máquina do usuário. Quando a página já vem
 * do server.js, usamos a mesma origem; caso contrário apontamos para a porta
 * padrão do servidor.
 */
export function localBase(): string {
  if (CONFIG.localUrl) return CONFIG.localUrl.replace(/\/+$/, "");
  const h = location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return "";
  return "http://localhost:8787";
}

export class BrainError extends Error {
  constructor(public code: string, public detail?: unknown) {
    super(code);
    this.name = "BrainError";
  }
}

export async function health(): Promise<HealthReport> {
  try {
    const res = await fetch(localBase() + "/api/health", { cache: "no-store" });
    return (await res.json()) as HealthReport;
  } catch {
    return { ok: false };
  }
}

export async function askLocal(
  system: string,
  messages: Turn[],
  signal?: AbortSignal
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(localBase() + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ system, messages, max_tokens: 400, model: CONFIG.localModel || "" }),
      signal
    });
  } catch {
    throw new BrainError("local-offline");
  }

  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) throw new BrainError("local-" + res.status, data);
  return String((data as { text?: string }).text || "");
}

export async function askClaude(
  key: string,
  system: string,
  messages: Turn[],
  signal?: AbortSignal
): Promise<string> {
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: CONFIG.model,
        max_tokens: 400,
        system,
        messages
      }),
      signal
    });
  } catch {
    throw new BrainError("rede");
  }

  if (!res.ok) throw new BrainError("http-" + res.status);
  const data = await res.json();
  return String(data?.content?.[0]?.text || "");
}

/** Traduz a falha para uma frase que o Jarvis consegue dizer em voz alta. */
export function errorSpeech(err: unknown): { spoken: string; status: string } {
  const code = err instanceof BrainError ? err.code : "rede";
  const detail = err instanceof BrainError ? (err.detail as { erro?: string }) : undefined;
  const sr = CONFIG.address;

  switch (true) {
    case code === "local-offline":
      return {
        spoken: `Não encontrei o servidor local, ${sr}. Confira se o comando node server.js está rodando no terminal.`,
        status: "SERVIDOR LOCAL FORA DO AR"
      };
    case code === "local-503":
      return {
        spoken: detail?.erro === "sem-modelo"
          ? "O servidor está no ar, mas não há modelo instalado. Rode ollama pull llama3.2."
          : "Nenhum modelo local está rodando. Abra o Ollama e tente de novo.",
        status: "SEM CÉREBRO LOCAL"
      };
    case code === "local-504":
      return {
        spoken: `O modelo local demorou demais para responder, ${sr}. Tente uma pergunta mais curta ou um modelo menor.`,
        status: "TEMPO ESGOTADO"
      };
    case code.startsWith("local-"):
      return {
        spoken: `O cérebro local recusou a requisição, ${sr}. Veja o terminal do servidor para o detalhe.`,
        status: "ERRO LOCAL " + code.replace("local-", "")
      };
    case code === "http-401":
      return {
        spoken: `A chave da Anthropic foi recusada, ${sr}. Confira se ela está correta e ativa.`,
        status: "ERRO 401"
      };
    case code.startsWith("http-"):
      return {
        spoken: `O servidor recusou a requisição, ${sr}. Verifique sua chave e seu crédito na Anthropic.`,
        status: "ERRO " + code.replace("http-", "")
      };
    default:
      return {
        spoken: `Não consegui me conectar à rede, ${sr}. Confira sua conexão e tente novamente.`,
        status: "FALHA DE REDE"
      };
  }
}
