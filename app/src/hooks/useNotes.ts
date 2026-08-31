import { useCallback, useEffect, useRef, useState } from "react";
import { SEED_NOTES, SEED_REL, STORAGE } from "../lib/config";
import type { AreaKey, Note, Rel } from "../lib/types";

function load<T>(chave: string, padrao: T): T {
  try {
    const cru = localStorage.getItem(chave);
    if (!cru) return padrao;
    const dado = JSON.parse(cru);
    return Array.isArray(dado) && dado.length ? (dado as T) : padrao;
  } catch {
    return padrao;
  }
}

/**
 * O Second Brain: notas, ligações e persistência. Guarda no localStorage a
 * cada mudança, e limpa ligações órfãs quando uma nota morre.
 */
export function useNotes() {
  const [notes, setNotes] = useState<Note[]>(() => load(STORAGE.notes, SEED_NOTES));
  const [rel, setRel] = useState<Rel[]>(() => load(STORAGE.rel, SEED_REL));

  /** Nós que devem piscar — a memória viva acabou de tocá-los. */
  const [flash, setFlash] = useState<string[]>([]);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE.notes, JSON.stringify(notes));
      localStorage.setItem(STORAGE.rel, JSON.stringify(rel));
    } catch {
      /* modo privado do navegador: seguimos só em memória */
    }
  }, [notes, rel]);

  const highlight = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setFlash(ids);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash([]), 2600);
  }, []);

  /** Uma nota nova nasce ligada ao hub de metas, ao perfil e à própria área. */
  const linkNew = useCallback((lista: Note[], id: string, area: AreaKey): Rel[] => {
    const novas: Rel[] = [];
    const hub = lista.find(n => n.area === "metas" && n.id !== id);
    if (hub) novas.push([id, hub.id]);
    const perfil = lista.find(n => n.area === "meta" && n.id !== id);
    if (perfil) novas.push([id, perfil.id]);
    const irmas = lista.filter(n => n.area === area && n.id !== id);
    if (irmas[0]) novas.push([id, irmas[0].id]);
    if (irmas.length > 1) novas.push([id, irmas[irmas.length - 1].id]);
    return novas;
  }, []);

  const upsert = useCallback((note: Note, ehNova: boolean) => {
    setNotes(atuais => {
      const proximas = ehNova
        ? [...atuais, note]
        : atuais.map(n => (n.id === note.id ? note : n));
      if (ehNova) setRel(r => [...r, ...linkNew(proximas, note.id, note.area)]);
      return proximas;
    });
    highlight([note.id]);
  }, [linkNew, highlight]);

  const remove = useCallback((id: string) => {
    setNotes(atuais => atuais.filter(n => n.id !== id));
    setRel(atuais => atuais.filter(([a, b]) => a !== id && b !== id));
  }, []);

  /** Aplica o que a memória viva pediu e devolve os nós tocados. */
  const applyIncoming = useCallback((proximas: Note[], touched: string[]) => {
    setNotes(anteriores => {
      const conhecidas = new Set(anteriores.map(n => n.id));
      const nascidas = proximas.filter(n => !conhecidas.has(n.id));
      if (nascidas.length) {
        setRel(r => {
          const extras = nascidas.flatMap(n => linkNew(proximas, n.id, n.area));
          return [...r, ...extras];
        });
      }
      return proximas;
    });
    highlight(touched);
  }, [linkNew, highlight]);

  const reload = useCallback(() => {
    setNotes(load(STORAGE.notes, SEED_NOTES));
    setRel(load(STORAGE.rel, SEED_REL));
  }, []);

  const reset = useCallback(() => {
    setNotes(SEED_NOTES);
    setRel(SEED_REL);
  }, []);

  return { notes, rel, flash, upsert, remove, applyIncoming, reload, reset };
}
