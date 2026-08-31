import { useEffect, useState } from "react";
import { AREA, AREA_KEYS } from "../lib/config";
import type { AreaKey, Note } from "../lib/types";

interface Props {
  note: Note | null;
  criando: boolean;
  onSave: (note: Note, ehNova: boolean) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function NoteEditor({ note, criando, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<AreaKey>("meta");
  const [body, setBody] = useState("");

  useEffect(() => {
    setTitle(note?.title ?? "");
    setArea(note?.area ?? "meta");
    setBody(note?.body ?? "");
  }, [note, criando]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const salvar = () => {
    const t = title.trim();
    if (!t) return;
    const id = note?.id ?? "n" + Date.now().toString(36);
    onSave({ id, area, title: t, body: body.trim() }, criando);
    onClose();
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{criando ? "NOVA NOTA" : "EDITAR NOTA"}</h3>

        <label className="card__label" htmlFor="t">TÍTULO</label>
        <input id="t" className="field" value={title} maxLength={40}
               placeholder="1-2 palavras" autoFocus
               onChange={e => setTitle(e.target.value)} />

        <label className="card__label" htmlFor="a">ÁREA</label>
        <select id="a" className="field field--select" value={area}
                onChange={e => setArea(e.target.value as AreaKey)}>
          {AREA_KEYS.map(k => <option key={k} value={k}>{AREA[k].label}</option>)}
        </select>

        <label className="card__label" htmlFor="b">CONTEÚDO</label>
        <textarea id="b" className="field field--area" value={body}
                  placeholder="o que o Jarvis deve saber..."
                  onChange={e => setBody(e.target.value)} />

        <div className="card__actions">
          <button className="btn btn--primary" onClick={salvar}>SALVAR</button>
          {!criando && note && (
            <button className="btn btn--danger" onClick={() => { onDelete(note.id); onClose(); }}>
              EXCLUIR
            </button>
          )}
          <button className="btn" onClick={onClose}>CANCELAR</button>
        </div>
      </div>
    </div>
  );
}
