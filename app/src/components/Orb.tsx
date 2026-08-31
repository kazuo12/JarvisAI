import { useEffect, useRef } from "react";
import { CONFIG } from "../lib/config";
import { fitCanvas } from "../lib/canvas";
import { reducedMotion, subscribe } from "../lib/loop";
import type { AgentState } from "../lib/types";

interface Props {
  state: AgentState;
  /** Volume real do microfone, 0 a 1. */
  micLevel: React.MutableRefObject<number>;
  /** Energia da fala sintetizada, 0 a 1. */
  speechEnergy: React.MutableRefObject<number>;
  onClick: () => void;
  size?: number;
}

interface Onda { r: number; vida: number; forca: number }

/**
 * O reator. Desenhado em canvas — não em CSS — para que dezenas de camadas
 * animadas custem um único quadro, e para poder reagir ao volume real da voz.
 */
export function Orb({ state, micLevel, speechEnergy, onClick, size = 240 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const cacheHalo: { raio: number; grad: CanvasGradient | null } = { raio: -1, grad: null };
    const cacheNucleo: { raio: number; grad: CanvasGradient | null } = { raio: -1, grad: null };
    const ondas: Onda[] = [];
    let giro = 0;
    let energiaSuave = 0;
    let desdeUltimaOnda = 0;

    const desenhar = (agora: number, delta: number) => {
      const ctx = fitCanvas(canvas, size, size);
      if (!ctx) return;

      const estado = stateRef.current;
      const cx = size / 2;
      const cy = size / 2;
      const base = size * 0.21;

      // De onde vem a energia depende do que o assistente está fazendo.
      let alvo = 0;
      if (estado === "listening") alvo = micLevel.current;
      else if (estado === "speaking") alvo = speechEnergy.current;
      else if (estado === "thinking") alvo = 0.45 + Math.sin(agora / 90) * 0.3;
      else alvo = 0.12 + Math.sin(agora / 900) * 0.08;

      // A fala decai sozinha entre as palavras.
      if (estado === "speaking") {
        speechEnergy.current = Math.max(0, speechEnergy.current - delta / 420);
      }
      energiaSuave += (alvo - energiaSuave) * (reducedMotion ? 1 : 0.18);

      const raio = base * (1 + energiaSuave * 0.28);
      ctx.clearRect(0, 0, size, size);

      // ── halo ──
      // Gradiente refeito só quando o raio muda de verdade; a intensidade
      // acompanha a energia via globalAlpha, que é barato.
      const raioInteiro = Math.round(raio);
      if (raioInteiro !== cacheHalo.raio) {
        cacheHalo.raio = raioInteiro;
        const g = ctx.createRadialGradient(cx, cy, raioInteiro * 0.6, cx, cy, size / 2);
        g.addColorStop(0, "rgba(78,168,255,1)");
        g.addColorStop(1, "rgba(78,168,255,0)");
        cacheHalo.grad = g;
      }
      ctx.globalAlpha = 0.24 + energiaSuave * 0.3;
      ctx.fillStyle = cacheHalo.grad!;
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 1;

      // ── ondas que saem a cada pico ──
      desdeUltimaOnda += delta;
      const intervalo = estado === "listening" ? 260 : estado === "speaking" ? 420 : 1500;
      if (!reducedMotion && desdeUltimaOnda > intervalo && energiaSuave > 0.14) {
        ondas.push({ r: raio, vida: 0, forca: energiaSuave });
        desdeUltimaOnda = 0;
      }
      for (let i = ondas.length - 1; i >= 0; i--) {
        const o = ondas[i];
        o.vida += delta / 1400;
        o.r = raio + (size / 2 - raio) * o.vida;
        if (o.vida >= 1) { ondas.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(cx, cy, o.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(139,124,255,${(1 - o.vida) * 0.5 * o.forca})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // ── anéis giratórios ──
      if (!reducedMotion) giro += delta / 4200;
      for (let i = 0; i < 2; i++) {
        const rr = raio * (1.5 + i * 0.42);
        const sentido = i % 2 === 0 ? giro : -giro * 0.7;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, sentido, sentido + Math.PI * (1.1 + i * 0.2));
        ctx.strokeStyle = i === 0
          ? `rgba(78,168,255,${0.3 + energiaSuave * 0.4})`
          : `rgba(139,124,255,${0.22 + energiaSuave * 0.3})`;
        ctx.lineWidth = i === 0 ? 1.6 : 1;
        ctx.stroke();
      }

      // ── núcleo ──
      if (raioInteiro !== cacheNucleo.raio) {
        cacheNucleo.raio = raioInteiro;
        const g = ctx.createRadialGradient(
          cx - raioInteiro * 0.25, cy - raioInteiro * 0.3, raioInteiro * 0.05,
          cx, cy, raioInteiro
        );
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.28, "#bfe0ff");
        g.addColorStop(0.62, CONFIG.themeColor);
        g.addColorStop(1, "#0d2f57");
        cacheNucleo.grad = g;
      }
      const nucleo = cacheNucleo.grad!;
      ctx.beginPath();
      ctx.arc(cx, cy, raio, 0, Math.PI * 2);
      ctx.fillStyle = nucleo;
      ctx.fill();

      // Barras de espectro em volta, só quando há som de verdade.
      if (energiaSuave > 0.05) {
        const barras = 48;
        ctx.strokeStyle = `rgba(200,232,255,${0.15 + energiaSuave * 0.45})`;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < barras; i++) {
          const ang = (i / barras) * Math.PI * 2;
          const ruido = 0.5 + Math.sin(agora / 190 + i * 1.7) * 0.5;
          const alt = raio * 0.16 * energiaSuave * (0.4 + ruido);
          const r1 = raio * 1.12;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
          ctx.lineTo(cx + Math.cos(ang) * (r1 + alt), cy + Math.sin(ang) * (r1 + alt));
          ctx.stroke();
        }
      }
    };

    return subscribe(desenhar);
  }, [size, micLevel, speechEnergy]);

  const rotulo =
    state === "listening" ? "ouvindo"
    : state === "thinking" ? "processando"
    : state === "speaking" ? "falando"
    : "clique para falar";

  return (
    <button className="orb" onClick={onClick} aria-label={rotulo} title={rotulo}>
      <canvas ref={ref} width={size} height={size} />
    </button>
  );
}
