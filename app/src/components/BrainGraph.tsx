import { useEffect, useMemo, useRef, useState } from "react";
import { AREA, AREA_KEYS } from "../lib/config";
import { fitCanvas, glowSprite, hexAlpha } from "../lib/canvas";
import { reducedMotion, subscribe } from "../lib/loop";
import type { Note, Rel } from "../lib/types";

const W = 1000;
const H = 560;
const CX = W / 2;
const CY = H / 2;

interface Pos { x: number; y: number; grau: number }
interface Aresta { a: Pos; b: Pos; cx: number; cy: number }

interface Props {
  notes: Note[];
  rel: Rel[];
  flash: string[];
  onSelect: (note: Note) => void;
}

/**
 * Agrupa por área e dá a cada uma um setor do círculo. Notas irmãs ficam
 * vizinhas, então o mapa passa a ter leitura — não é mais um anel aleatório.
 */
function layout(notes: Note[], rel: Rel[]) {
  const grau = new Map<string, number>();
  for (const n of notes) grau.set(n.id, 0);
  for (const [a, b] of rel) {
    if (grau.has(a)) grau.set(a, grau.get(a)! + 1);
    if (grau.has(b)) grau.set(b, grau.get(b)! + 1);
  }

  const porArea = AREA_KEYS
    .map(k => ({ area: k, lista: notes.filter(n => n.area === k) }))
    .filter(g => g.lista.length > 0);

  const total = notes.length || 1;
  const pos = new Map<string, Pos>();
  let anguloCorrente = -Math.PI / 2;

  for (const grupo of porArea) {
    const setor = (grupo.lista.length / total) * Math.PI * 2;
    const passo = setor / grupo.lista.length;

    grupo.lista.forEach((n, i) => {
      const ang = anguloCorrente + passo * (i + 0.5);
      // Alterna o raio dentro do setor para o grupo não virar uma fila reta.
      const dentro = i % 2 === 1 && grupo.lista.length > 1;
      const rx = dentro ? W * 0.27 : W * 0.40;
      const ry = dentro ? H * 0.24 : H * 0.37;
      pos.set(n.id, {
        x: CX + Math.cos(ang) * rx,
        y: CY + Math.sin(ang) * ry,
        grau: grau.get(n.id) || 0
      });
    });

    anguloCorrente += setor;
  }

  return pos;
}

export function BrainGraph({ notes, rel, flash, onSelect }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<string | null>(null);

  const pos = useMemo(() => layout(notes, rel), [notes, rel]);

  const sprites = useMemo(() => {
    const mapa = new Map<string, HTMLCanvasElement>();
    for (const k of AREA_KEYS) mapa.set(k, glowSprite(AREA[k].color, 64));
    mapa.set("__core", glowSprite("#8b7cff", 110));
    return mapa;
  }, []);

  const vizinhos = useMemo(() => {
    const mapa = new Map<string, Set<string>>();
    for (const [a, b] of rel) {
      if (!mapa.has(a)) mapa.set(a, new Set());
      if (!mapa.has(b)) mapa.set(b, new Set());
      mapa.get(a)!.add(b);
      mapa.get(b)!.add(a);
    }
    return mapa;
  }, [rel]);

  const arestas = useMemo<Aresta[]>(() => {
    const saida: Aresta[] = [];
    for (const [ida, idb] of rel) {
      const a = pos.get(ida);
      const b = pos.get(idb);
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      // Ponto de controle puxado 35% para o centro: a teia "abraça" o núcleo.
      saida.push({ a, b, cx: mx + (CX - mx) * 0.35, cy: my + (CY - my) * 0.35 });
    }
    return saida;
  }, [rel, pos]);

  // Refs para o loop de desenho não depender de novas renderizações.
  const dados = useRef({ notes, pos, arestas, hover, flash, vizinhos });
  dados.current = { notes, pos, arestas, hover, flash, vizinhos };

  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    if (!el || !box) return;

    let larguraCss = box.clientWidth || 900;
    let alturaCss = (larguraCss * H) / W;

    const ro = new ResizeObserver(() => {
      larguraCss = box.clientWidth || 900;
      alturaCss = (larguraCss * H) / W;
    });
    ro.observe(box);

    const cache: {
      chave: unknown;
      caminhos: { caminho: Path2D; g: CanvasGradient }[];
    } = { chave: null, caminhos: [] };

    const pulsos = Array.from({ length: 14 }, () => ({
      e: Math.floor(Math.random() * Math.max(1, arestas.length)),
      t: Math.random(),
      v: 0.00028 + Math.random() * 0.00045
    }));

    const desenhar = (agora: number, delta: number) => {
      const ctx = fitCanvas(el, larguraCss, alturaCss);
      if (!ctx) return;

      const d = dados.current;
      const escala = larguraCss / W;
      ctx.clearRect(0, 0, larguraCss, alturaCss);
      ctx.save();
      ctx.scale(escala, escala);

      const realce = d.hover;
      const proximos = realce ? d.vizinhos.get(realce) : null;
      const visivel = (id: string) =>
        !realce || id === realce || Boolean(proximos?.has(id));

      // ── arestas ──
      // O traçado das curvas não muda entre quadros: guardamos o Path2D e o
      // gradiente uma vez por layout. Criar 39 gradientes por quadro era o
      // gargalo real desta tela.
      if (cache.chave !== d.arestas) {
        cache.chave = d.arestas;
        cache.caminhos = d.arestas.map(a => {
          const caminho = new Path2D();
          caminho.moveTo(a.a.x, a.a.y);
          caminho.quadraticCurveTo(a.cx, a.cy, a.b.x, a.b.y);
          const g = ctx.createLinearGradient(a.a.x, a.a.y, a.b.x, a.b.y);
          g.addColorStop(0, "rgba(139,124,255,0.55)");
          g.addColorStop(1, "rgba(45,212,255,0.55)");
          return { caminho, g };
        });
      }

      const desloc = reducedMotion ? 0 : -(agora / 26) % 44;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([9, 13]);
      ctx.lineDashOffset = desloc;
      const posRealce = realce ? d.pos.get(realce) : undefined;

      for (let i = 0; i < d.arestas.length; i++) {
        const aresta = d.arestas[i];
        const guardado = cache.caminhos[i];
        if (!guardado) continue;
        const viva = !posRealce || aresta.a === posRealce || aresta.b === posRealce;
        ctx.globalAlpha = viva ? 1 : 0.14;
        ctx.strokeStyle = guardado.g;
        ctx.stroke(guardado.caminho);
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      // ── raios do núcleo até cada nó ──
      const respiro = 0.18 + Math.sin(agora / 1500) * 0.1;
      for (const n of d.notes) {
        const p = d.pos.get(n.id);
        if (!p) continue;
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = hexAlpha(AREA[n.area].color, visivel(n.id) ? respiro : 0.04);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // ── pulsos de sinapse ──
      if (!reducedMotion && d.arestas.length) {
        ctx.fillStyle = "#ffffff";
        for (const p of pulsos) {
          const aresta = d.arestas[p.e % d.arestas.length];
          if (!aresta) continue;
          const t = p.t;
          const u = 1 - t;
          const x = u * u * aresta.a.x + 2 * u * t * aresta.cx + t * t * aresta.b.x;
          const y = u * u * aresta.a.y + 2 * u * t * aresta.cy + t * t * aresta.b.y;
          ctx.globalAlpha = Math.sin(Math.PI * t) * (realce ? 0.35 : 0.9);
          ctx.beginPath();
          ctx.arc(x, y, 2.6, 0, Math.PI * 2);
          ctx.fill();
          p.t += p.v * delta;
          if (p.t >= 1) {
            p.t = 0;
            p.e = Math.floor(Math.random() * d.arestas.length);
            p.v = 0.00028 + Math.random() * 0.00045;
          }
        }
        ctx.globalAlpha = 1;
      }

      // ── núcleo ──
      const pulsoNucleo = 1 + Math.sin(agora / 900) * 0.06;
      const spriteNucleo = sprites.get("__core")!;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(spriteNucleo, CX - 110, CY - 110, 220, 220);
      ctx.globalAlpha = 1;

      const gc = ctx.createRadialGradient(CX - 10, CY - 12, 4, CX, CY, 36 * pulsoNucleo);
      gc.addColorStop(0, "#efe9ff");
      gc.addColorStop(0.45, "#a794ff");
      gc.addColorStop(1, "#3b2a86");
      ctx.beginPath();
      ctx.arc(CX, CY, 36 * pulsoNucleo, 0, Math.PI * 2);
      ctx.fillStyle = gc;
      ctx.fill();

      ctx.font = "26px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🧠", CX, CY + 1);

      // ── nós ──
      ctx.font = "500 12px ui-monospace, SFMono-Regular, Menlo, monospace";
      for (const n of d.notes) {
        const p = d.pos.get(n.id);
        if (!p) continue;
        const cor = AREA[n.area].color;
        const piscando = d.flash.includes(n.id);
        const forte = visivel(n.id);
        const r = Math.min(13 + p.grau * 1.7, 27) *
          (piscando ? 1.15 + Math.sin(agora / 90) * 0.15 : 1);

        const sprite = sprites.get(n.area)!;
        ctx.globalAlpha = forte ? (piscando ? 0.95 : 0.5) : 0.12;
        ctx.drawImage(sprite, p.x - r * 2.4, p.y - r * 2.4, r * 4.8, r * 4.8);

        ctx.globalAlpha = forte ? 1 : 0.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = cor;
        ctx.fill();
        ctx.lineWidth = n.id === realce ? 3 : 1.5;
        ctx.strokeStyle = n.id === realce ? "#ffffff" : hexAlpha(cor, 0.9);
        ctx.stroke();

        // O rótulo sai na direção oposta ao núcleo: assim ele foge da parte
        // cheia do mapa em vez de cair em cima do nó vizinho.
        const dx = p.x - CX;
        const dy = p.y - CY;
        const dist = Math.hypot(dx, dy) || 1;
        const lx = p.x + (dx / dist) * (r + 13);
        const ly = p.y + (dy / dist) * (r + 13) + 4;

        ctx.textAlign = Math.abs(dx) < 60 ? "center" : dx > 0 ? "left" : "right";
        // Contorno escuro para o texto continuar legível sobre o brilho.
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(5,7,14,0.85)";
        ctx.strokeText(n.title, lx, ly);
        ctx.fillStyle = forte ? "#cfdcee" : "rgba(207,220,238,0.25)";
        ctx.fillText(n.title, lx, ly);
        ctx.textAlign = "center";
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    };

    const parar = subscribe(desenhar);
    return () => { parar(); ro.disconnect(); };
  }, [arestas, sprites]);

  /** Converte a posição do ponteiro para o espaço virtual e acha o nó. */
  const acharNo = (ev: React.PointerEvent<HTMLCanvasElement>): Note | null => {
    const el = canvas.current;
    if (!el) return null;
    const caixa = el.getBoundingClientRect();
    const escala = caixa.width / W;
    const x = (ev.clientX - caixa.left) / escala;
    const y = (ev.clientY - caixa.top) / escala;

    for (const n of notes) {
      const p = pos.get(n.id);
      if (!p) continue;
      const r = Math.min(13 + p.grau * 1.7, 27) + 8;
      if ((x - p.x) ** 2 + (y - p.y) ** 2 <= r * r) return n;
    }
    return null;
  };

  return (
    <div className="graph" ref={wrap}>
      <canvas
        ref={canvas}
        onPointerMove={e => {
          const n = acharNo(e);
          const id = n?.id ?? null;
          if (id !== hover) setHover(id);
          e.currentTarget.style.cursor = n ? "pointer" : "default";
        }}
        onPointerLeave={() => setHover(null)}
        onClick={e => {
          const n = acharNo(e as unknown as React.PointerEvent<HTMLCanvasElement>);
          if (n) onSelect(n);
        }}
      />
    </div>
  );
}
