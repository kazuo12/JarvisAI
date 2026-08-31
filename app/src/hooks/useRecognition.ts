import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
};

function construtor(): (new () => SpeechRecognitionLike) | undefined {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined;
}

interface Opcoes {
  onFinal: (texto: string) => void;
  /** Enquanto o Jarvis pensa ou fala, ignoramos tudo — senão ele se escuta. */
  busy: React.MutableRefObject<boolean>;
}

/**
 * Escuta contínua e teimosa: o navegador encerra o reconhecimento sozinho o
 * tempo todo, então religamos no onend — mas só quando não estamos ocupados.
 */
export function useRecognition({ onFinal, busy }: Opcoes) {
  const [supported] = useState(() => Boolean(construtor()));
  const [listening, setListening] = useState(false);
  const [denied, setDenied] = useState(false);

  const rec = useRef<SpeechRecognitionLike | null>(null);
  const querOuvir = useRef(false);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  const start = useCallback(() => {
    if (!rec.current || !querOuvir.current || busy.current) return;
    try {
      rec.current.start();
    } catch {
      /* "already started" é esperado quando o religamento se cruza */
    }
  }, [busy]);

  const stop = useCallback(() => {
    try { rec.current?.stop(); } catch { /* ignora */ }
  }, []);

  useEffect(() => {
    const Ctor = construtor();
    if (!Ctor) return;

    const r = new Ctor();
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onstart = () => setListening(true);

    r.onresult = e => {
      if (busy.current) return;
      let dito = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const alt = e.results[i];
        if (alt.isFinal) dito += alt[0].transcript;
      }
      const texto = dito.trim();
      if (texto) finalRef.current(texto);
    };

    r.onerror = e => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        querOuvir.current = false;
        setDenied(true);
      }
    };

    r.onend = () => {
      setListening(false);
      if (querOuvir.current && !busy.current) window.setTimeout(start, 300);
    };

    rec.current = r;
    return () => {
      querOuvir.current = false;
      try { r.stop(); } catch { /* ignora */ }
      rec.current = null;
    };
  }, [busy, start]);

  const enable = useCallback((ligado: boolean) => {
    querOuvir.current = ligado;
    if (ligado) start(); else stop();
  }, [start, stop]);

  return { supported, listening, denied, enable, start, stop, querOuvir };
}
