type Quadro = (agora: number, delta: number) => void;

const inscritos = new Set<Quadro>();
let rodando = false;
let anterior = 0;

function tick(agora: number) {
  const delta = anterior ? Math.min(agora - anterior, 64) : 16;
  anterior = agora;
  for (const cb of inscritos) cb(agora, delta);
  if (inscritos.size && !document.hidden) requestAnimationFrame(tick);
  else { rodando = false; anterior = 0; }
}

function acordar() {
  if (rodando || !inscritos.size || document.hidden) return;
  rodando = true;
  requestAnimationFrame(tick);
}

document.addEventListener("visibilitychange", () => {
  // Aba escondida não desenha nada: nenhum quadro, nenhum consumo de GPU.
  if (!document.hidden) acordar();
});

/**
 * Um único requestAnimationFrame para a aplicação inteira. Vários loops
 * concorrentes é o jeito mais fácil de travar uma máquina fraca — aqui todo
 * componente animado entra na mesma fila.
 */
export function subscribe(cb: Quadro): () => void {
  inscritos.add(cb);
  acordar();
  return () => { inscritos.delete(cb); };
}

/** Respeita quem pediu menos movimento no sistema operacional. */
export const reducedMotion =
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
