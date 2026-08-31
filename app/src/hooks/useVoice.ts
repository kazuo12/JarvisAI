import { useCallback, useEffect, useRef, useState } from "react";
import { CONFIG, STORAGE } from "../lib/config";
import { speakable, splitSentences } from "../lib/text";
import { localBase } from "../lib/api";

const FEMININAS = ["luciana","maria","fernanda","francisca","female","helena","camila","vitoria","joana","ines","catarina","thalita"];
const MASCULINAS = ["daniel","felipe","ricardo","male","antonio","joao","carlos","pedro","gustavo","julio","fabio"];

/**
 * Dá nota a cada voz instalada. Vozes "natural"/"neural" são de outra geração
 * em qualidade, então pesam muito mais que o acerto de gênero.
 */
function score(v: SpeechSynthesisVoice): number {
  const nome = v.name.toLowerCase();
  const lang = v.lang.toLowerCase().replace("_", "-");
  let pontos = 0;

  if (lang.startsWith("pt-br")) pontos += 100;
  else if (lang.startsWith("pt")) pontos += 60;
  else return -1;

  if (/natural|neural/.test(nome)) pontos += 70;
  if (/online/.test(nome)) pontos += 25;
  if (/google/.test(nome)) pontos += 20;
  if (!v.localService) pontos += 10;

  const querida = CONFIG.voiceGender === "feminina" ? FEMININAS : MASCULINAS;
  const outra   = CONFIG.voiceGender === "feminina" ? MASCULINAS : FEMININAS;
  if (querida.some(t => nome.includes(t))) pontos += 45;
  if (outra.some(t => nome.includes(t))) pontos -= 45;

  return pontos;
}

export function useVoice() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE.voice) || ""; } catch { return ""; }
  });
  const [speaking, setSpeaking] = useState(false);

  /** 0 a 1 — quanta energia a fala tem agora. O orbe lê isso a cada quadro. */
  const energy = useRef(0);
  const cancelled = useRef(false);

  /** Voz neural do servidor (Piper). Só liga se o /api/health confirmar. */
  const neural = useRef(false);
  const audioCtx = useRef<AudioContext | null>(null);
  const tocando = useRef<AudioBufferSourceNode | null>(null);
  const medindo = useRef(0);

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;

    const ler = () => {
      const lista = synth.getVoices() || [];
      if (lista.length) setVoices(lista.filter(v => score(v) >= 0));
    };
    ler();
    synth.addEventListener("voiceschanged", ler);
    // Alguns navegadores só populam a lista depois de um instante.
    const t1 = window.setTimeout(ler, 400);
    const t2 = window.setTimeout(ler, 1400);

    return () => {
      synth.removeEventListener("voiceschanged", ler);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  const chosen = useCallback((): SpeechSynthesisVoice | undefined => {
    if (!voices.length) return undefined;
    if (voiceURI) {
      const salva = voices.find(v => v.voiceURI === voiceURI);
      if (salva) return salva;
    }
    return voices.slice().sort((a, b) => score(b) - score(a))[0];
  }, [voices, voiceURI]);

  const pickVoice = useCallback((uri: string) => {
    setVoiceURI(uri);
    try { localStorage.setItem(STORAGE.voice, uri); } catch { /* ignora */ }
  }, []);

  const setNeural = useCallback((ligado: boolean) => { neural.current = ligado; }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    try { window.speechSynthesis?.cancel(); } catch { /* ignora */ }
    try { tocando.current?.stop(); } catch { /* ignora */ }
    tocando.current = null;
    cancelAnimationFrame(medindo.current);
    energy.current = 0;
    setSpeaking(false);
  }, []);

  /**
   * Fala pelo servidor. A energia do orbe passa a vir da forma de onda real
   * do áudio, não de uma estimativa por palavra.
   * Devolve false quando não deu — aí a voz do navegador assume.
   */
  const speakNeural = useCallback(async (texto: string): Promise<boolean> => {
    try {
      const res = await fetch(localBase() + "/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: texto })
      });
      if (!res.ok) return false;

      const bytes = await res.arrayBuffer();
      if (cancelled.current) return true;

      const AC = window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = audioCtx.current ?? new AC();
      audioCtx.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      const buffer = await ctx.decodeAudioData(bytes);
      if (cancelled.current) return true;

      const fonte = ctx.createBufferSource();
      fonte.buffer = buffer;

      const analisador = ctx.createAnalyser();
      analisador.fftSize = 512;
      analisador.smoothingTimeConstant = 0.7;
      fonte.connect(analisador);
      analisador.connect(ctx.destination);

      const amostra = new Uint8Array(analisador.frequencyBinCount);
      const medir = () => {
        analisador.getByteTimeDomainData(amostra);
        let soma = 0;
        for (let i = 0; i < amostra.length; i++) {
          const v = (amostra[i] - 128) / 128;
          soma += v * v;
        }
        energy.current = Math.min(1, Math.sqrt(soma / amostra.length) * 5);
        medindo.current = requestAnimationFrame(medir);
      };

      return await new Promise<boolean>(resolve => {
        fonte.onended = () => {
          cancelAnimationFrame(medindo.current);
          energy.current = 0;
          tocando.current = null;
          resolve(true);
        };
        tocando.current = fonte;
        fonte.start();
        medir();
      });
    } catch {
      return false;
    }
  }, []);

  /**
   * Fala frase a frase. A variação leve de ritmo e tom entre as frases é o
   * que tira o efeito de leitura de robô, e a pausa curta imita a respiração.
   */
  const speak = useCallback((texto: string): Promise<void> => {
    const synth = window.speechSynthesis;
    const limpo = speakable(texto);
    if (!synth || !limpo) return Promise.resolve();

    cancelled.current = false;
    setSpeaking(true);

    if (neural.current) {
      return speakNeural(limpo).then(deuCerto => {
        if (deuCerto) { setSpeaking(false); return; }
        neural.current = false;   // falhou uma vez: não insiste
        return falarNoNavegador(limpo);
      });
    }

    return falarNoNavegador(limpo);
  }, [chosen, speakNeural]);

  /** A voz do próprio navegador, frase a frase. */
  const falarNoNavegador = useCallback((limpo: string): Promise<void> => {
    const synth = window.speechSynthesis;
    if (!synth) { setSpeaking(false); return Promise.resolve(); }

    const frases = splitSentences(limpo);
    const voz = chosen();

    return new Promise<void>(resolve => {
      let i = 0;

      const proxima = () => {
        if (cancelled.current || i >= frases.length) {
          energy.current = 0;
          setSpeaking(false);
          resolve();
          return;
        }

        const frase = frases[i++];
        const u = new SpeechSynthesisUtterance(frase);
        if (voz) { u.voice = voz; u.lang = voz.lang; } else { u.lang = "pt-BR"; }

        // Microvariações: cada frase sai um pouco diferente da anterior.
        const desvio = (Math.random() - 0.5) * 2;
        u.rate  = 1.0 + desvio * 0.035;
        u.pitch = (CONFIG.voiceGender === "feminina" ? 1.04 : 0.94) + desvio * 0.03;
        u.volume = 1;

        // Cada palavra pronunciada empurra o orbe.
        u.onboundary = () => { energy.current = 1; };
        u.onstart = () => { energy.current = 0.8; };

        const seguir = () => {
          if (cancelled.current) { proxima(); return; }
          // Pausa entre frases: mais longa depois de ponto final.
          const respiro = /[.!?…]$/.test(frase) ? 190 : 90;
          window.setTimeout(proxima, respiro);
        };
        u.onend = seguir;
        u.onerror = seguir;

        try { synth.speak(u); } catch { seguir(); }
      };

      proxima();
    });
  }, [chosen]);

  return { speak, cancel, speaking, energy, voices, voiceURI, pickVoice, chosen, setNeural };
}
