import { useMemo } from "react";
import { AREA, AREA_KEYS, CONFIG } from "../lib/config";
import { BrainGraph } from "./BrainGraph";
import type { Note, Rel } from "../lib/types";

interface Props {
  notes: Note[];
  rel: Rel[];
  flash: string[];
  onSelect: (n: Note) => void;
  onCreate: () => void;
  onReload: () => void;
}

export function BrainPanel({ notes, rel, flash, onSelect, onCreate, onReload }: Props) {
  const areasUsadas = useMemo(
    () => AREA_KEYS.filter(k => notes.some(n => n.area === k)),
    [notes]
  );

  return (
    <section className="panel">
      <header className="panel__head">
        <span className="panel__title">🧠 SECOND BRAIN</span>
        <span className="panel__sub">contexto vivo da sua vida</span>
        <span className="panel__count">
          {notes.length} notas · {areasUsadas.length} áreas
        </span>
        <button className="ghost" onClick={onCreate} title="nova nota">+</button>
        <button className="ghost" onClick={onReload} title="recarregar">↻</button>
      </header>

      <BrainGraph notes={notes} rel={rel} flash={flash} onSelect={onSelect} />

      <footer className="legend">
        {areasUsadas.map(k => (
          <span className="legend__item" key={k}>
            <i style={{ background: AREA[k].color }} />
            {AREA[k].label}
          </span>
        ))}
        <span className="legend__ok">
          ✓ contexto injetado em todos os comandos do {CONFIG.name}
        </span>
      </footer>
    </section>
  );
}
