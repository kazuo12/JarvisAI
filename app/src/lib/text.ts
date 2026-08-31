/** Minúsculas e sem acento — usado para comparar a wake word e títulos. */
export function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Quebra a resposta em frases. Falar frase a frase, com uma respiradinha entre
 * elas, é o que mais diferencia uma leitura natural de uma robótica.
 */
export function splitSentences(text: string): string[] {
  const limpo = text.replace(/\s+/g, " ").trim();
  if (!limpo) return [];

  const partes = limpo.match(/[^.!?…]+(?:[.!?…]+|$)/g) || [limpo];
  const saida: string[] = [];

  for (const bruta of partes) {
    const frase = bruta.trim();
    if (!frase) continue;
    // Frases muito curtas grudam na anterior: pausa demais soa entrecortado.
    const anterior = saida[saida.length - 1];
    if (anterior && frase.length < 18 && anterior.length < 140) {
      saida[saida.length - 1] = anterior + " " + frase;
    } else {
      saida.push(frase);
    }
  }
  return saida;
}

/** Tira o que não se fala: markdown, emoji, marcadores de lista. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#`>]/g, "")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
