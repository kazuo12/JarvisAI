import { useEffect, useRef } from "react";
import { CONFIG } from "../lib/config";
import type { Turn } from "../lib/types";

export function Transcript({ turns, pending }: { turns: Turn[]; pending: boolean }) {
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, pending]);

  if (!turns.length && !pending) {
    return (
      <div className="transcript transcript--empty">
        <p>Diga <strong>“{CONFIG.wakeWord}”</strong> ou escreva abaixo.</p>
      </div>
    );
  }

  return (
    <div className="transcript">
      {turns.map((t, i) => (
        <article key={i} className={"turn turn--" + t.role}>
          <span className="turn__who">{t.role === "user" ? "VOCÊ" : CONFIG.name.toUpperCase()}</span>
          <p className="turn__text">{t.content}</p>
        </article>
      ))}
      {pending && (
        <article className="turn turn--assistant">
          <span className="turn__who">{CONFIG.name.toUpperCase()}</span>
          <p className="turn__text turn__text--thinking">
            <i /><i /><i />
          </p>
        </article>
      )}
      <div ref={fim} />
    </div>
  );
}
