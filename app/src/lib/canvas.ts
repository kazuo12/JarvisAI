/** Ajusta o canvas à densidade da tela e devolve o contexto já escalado. */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  largura: number,
  altura: number
): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(largura * dpr));
  const h = Math.max(1, Math.round(altura * dpr));

  // Escrever no style a cada quadro obriga o navegador a recalcular layout.
  // Só tocamos no DOM quando o tamanho realmente mudou.
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = largura + "px";
    canvas.style.height = altura + "px";
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * Desenha o brilho de um nó uma única vez num canvas fora da tela e reaproveita
 * como imagem. É o que substitui os filtros de blur do SVG, que custavam caro
 * multiplicados por dezenas de elementos.
 */
export function glowSprite(cor: string, raio: number): HTMLCanvasElement {
  const tamanho = Math.ceil(raio * 2);
  const c = document.createElement("canvas");
  c.width = tamanho;
  c.height = tamanho;
  const ctx = c.getContext("2d");
  if (!ctx) return c;

  const g = ctx.createRadialGradient(raio, raio, 0, raio, raio, raio);
  g.addColorStop(0, cor);
  g.addColorStop(0.35, cor + "88");
  g.addColorStop(1, cor + "00");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, tamanho, tamanho);
  return c;
}

export function hexAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return hex + a;
}
