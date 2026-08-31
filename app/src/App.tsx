import { useCallback, useEffect, useRef, useState } from "react";
import { CONFIG, STORAGE } from "./lib/config";
import { applySaves, buildSystemPrompt, extractSaves } from "./lib/brain";
import { askClaude, askLocal, errorSpeech, health as pingHealth } from "./lib/api";
import { norm } from "./lib/text";
import { useNotes } from "./hooks/useNotes";
import { useVoice } from "./hooks/useVoice";
import { useRecognition } from "./hooks/useRecognition";
import { useMicLevel } from "./hooks/useMicLevel";
import { Orb } from "./components/Orb";
import { TopBar } from "./components/TopBar";
import { Transcript } from "./components/Transcript";
import { Composer } from "./components/Composer";
import { BrainPanel } from "./components/BrainPanel";
import { NoteEditor } from "./components/NoteEditor";
import { ActivateScreen, BootScreen } from "./components/Screens";
import type { AgentState, BrainMode, HealthReport, Note, Phase, Turn } from "./lib/types";

/** Depois de responder, ele continua aberto a perguntas por este tempo. */
const JANELA_CONVERSA = 30_000;

export default function App() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [saindoDoBoot, setSaindoDoBoot] = useState(false);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [status, setStatus] = useState("AGUARDANDO");
  const [erro, setErro] = useState(false);

  const [mode, setMode] = useState<BrainMode>(() => {
    try { return (localStorage.getItem(STORAGE.brain) as BrainMode) || "local"; }
    catch { return "local"; }
  });
  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem(STORAGE.key) || ""; } catch { return ""; }
  });
  const [health, setHealth] = useState<HealthReport | null>(null);

  const [editor, setEditor] = useState<{ note: Note | null; criando: boolean } | null>(null);

  const notes = useNotes();
  const voice = useVoice();
  const mic = useMicLevel();

  const busy = useRef(false);
  const armed = useRef(false);
  const armedTimer = useRef<number | undefined>(undefined);
  const historico = useRef<Turn[]>([]);
  const notesRef = useRef(notes.notes);
  notesRef.current = notes.notes;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const keyRef = useRef(apiKey);
  keyRef.current = apiKey;

  useEffect(() => { try { localStorage.setItem(STORAGE.brain, mode); } catch { /* ignora */ } }, [mode]);
  useEffect(() => { try { localStorage.setItem(STORAGE.key, apiKey); } catch { /* ignora */ } }, [apiKey]);

  const ouvindoTexto = useCallback(
    () => (armed.current ? "OUVINDO · DIGA O COMANDO" : `OUVINDO · DIGA "${CONFIG.wakeWord.toUpperCase()}"`),
    []
  );

  const rearmar = useCallback(() => {
    window.clearTimeout(armedTimer.current);
    armedTimer.current = window.setTimeout(() => {
      armed.current = false;
      if (!busy.current) setStatus(ouvindoTexto());
    }, JANELA_CONVERSA);
  }, [ouvindoTexto]);

  const recognition = useRecognition({
    busy,
    onFinal: texto => void aoOuvir(texto)
  });

  const checarLocal = useCallback(async () => {
    const r = await pingHealth();
    setHealth(r);
    // Voz neural só entra em cena se o servidor disser que o Piper existe.
    voice.setNeural(Boolean(r.tts?.ok));
    return r;
  }, [voice]);

  /* ── boot automático ─────────────────────────────────────────────── */
  useEffect(() => {
    const t1 = window.setTimeout(() => setSaindoDoBoot(true), 1900);
    const t2 = window.setTimeout(() => setPhase("activate"), 2500);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);

  useEffect(() => {
    if (mode === "local" && phase === "app") void checarLocal();
  }, [mode, phase, checarLocal]);

  /* ── o coração: perguntar e responder ─────────────────────────────── */
  const perguntar = useCallback(async (prompt: string) => {
    if (busy.current) return;
    busy.current = true;
    recognition.stop();

    setTurns(t => [...t, { role: "user", content: prompt }]);
    setAgentState("thinking");
    setStatus("PROCESSANDO");
    setErro(false);

    const encerrar = () => {
      busy.current = false;
      setAgentState("idle");
      setStatus(ouvindoTexto());
      recognition.start();
    };

    if (modeRef.current === "claude" && !keyRef.current.trim()) {
      const fala = `Não encontrei sua chave de acesso, ${CONFIG.address}. Cole a chave da Anthropic no topo, ou volte o cérebro para local.`;
      setTurns(t => [...t, { role: "assistant", content: fala }]);
      setStatus("CHAVE AUSENTE");
      setErro(true);
      setAgentState("speaking");
      await voice.speak(fala);
      encerrar();
      return;
    }

    const turnoUsuario: Turn = { role: "user", content: prompt };
    historico.current = [...historico.current, turnoUsuario].slice(-24);
    const system = buildSystemPrompt(notesRef.current);

    let bruto = "";
    try {
      bruto = modeRef.current === "claude"
        ? await askClaude(keyRef.current.trim(), system, historico.current)
        : await askLocal(system, historico.current);
    } catch (err) {
      historico.current = historico.current.slice(0, -1);
      const { spoken, status: st } = errorSpeech(err);
      setTurns(t => [...t, { role: "assistant", content: spoken }]);
      setStatus(st);
      setErro(true);
      setAgentState("speaking");
      await voice.speak(spoken);
      encerrar();
      return;
    }

    if (!bruto.trim()) {
      historico.current = historico.current.slice(0, -1);
      const fala = `Recebi uma resposta vazia, ${CONFIG.address}. Deseja repetir o comando?`;
      setTurns(t => [...t, { role: "assistant", content: fala }]);
      setStatus("RESPOSTA VAZIA");
      setErro(true);
      setAgentState("speaking");
      await voice.speak(fala);
      encerrar();
      return;
    }

    const turnoAssistente: Turn = { role: "assistant", content: bruto };
    historico.current = [...historico.current, turnoAssistente];

    // A memória viva sai do texto antes de qualquer coisa ser exibida ou falada.
    const { clean, saves } = extractSaves(bruto);
    if (saves.length) {
      const { notes: proximas, touched } = applySaves(notesRef.current, saves);
      notes.applyIncoming(proximas, touched);
    }

    setTurns(t => [...t, { role: "assistant", content: clean }]);
    setStatus("RESPONDENDO");
    setAgentState("speaking");
    await voice.speak(clean);
    encerrar();
  }, [notes, recognition, voice, ouvindoTexto]);

  /* ── wake word ────────────────────────────────────────────────────── */
  const aoOuvir = useCallback(async (dito: string) => {
    if (busy.current) return;
    const cru = norm(dito);
    const chave = norm(CONFIG.wakeWord);

    if (!armed.current) {
      const at = cru.indexOf(chave);
      if (at < 0) return;
      armed.current = true;
      rearmar();

      const resto = dito.slice(at + chave.length).replace(/^[\s,.!?;:]+/, "").trim();
      if (resto.length > 1) { await perguntar(resto); return; }

      busy.current = true;
      recognition.stop();
      setAgentState("speaking");
      setStatus("ÀS SUAS ORDENS");
      await voice.speak(`Sim, ${CONFIG.address}?`);
      busy.current = false;
      setAgentState("idle");
      setStatus("OUVINDO · DIGA O COMANDO");
      recognition.start();
      return;
    }

    let limpo = dito;
    const at2 = cru.indexOf(chave);
    if (at2 >= 0) limpo = dito.slice(at2 + chave.length).replace(/^[\s,.!?;:]+/, "").trim();
    if (limpo.length < 2) return;
    rearmar();
    await perguntar(limpo);
  }, [perguntar, rearmar, recognition, voice]);

  /* ── ativação: o clique que libera microfone e áudio ──────────────── */
  const ativar = useCallback(async () => {
    setPhase("app");
    busy.current = true;
    setAgentState("speaking");
    setStatus("INICIALIZANDO");

    void checarLocal();
    void mic.start();
    recognition.enable(true);

    const saudacao = `Sistemas online. Estou ouvindo, ${CONFIG.address}.`;
    setTurns([{ role: "assistant", content: saudacao }]);
    await voice.speak(saudacao);

    busy.current = false;
    armed.current = false;
    setAgentState("idle");
    setStatus(ouvindoTexto());
    recognition.start();
  }, [checarLocal, mic, recognition, voice, ouvindoTexto]);

  /* ── estado do orbe segue a escuta ────────────────────────────────── */
  useEffect(() => {
    if (busy.current) return;
    setAgentState(recognition.listening ? "listening" : "idle");
  }, [recognition.listening]);

  useEffect(() => {
    if (recognition.denied) {
      setStatus("MICROFONE BLOQUEADO · LIBERE A PERMISSÃO E RECARREGUE");
      setErro(true);
    }
  }, [recognition.denied]);

  const interromper = useCallback(() => {
    voice.cancel();
    busy.current = false;
    setAgentState("idle");
    setStatus(ouvindoTexto());
    recognition.start();
  }, [voice, recognition, ouvindoTexto]);

  const digitar = useCallback((texto: string) => {
    armed.current = true;
    rearmar();
    if (busy.current) { voice.cancel(); busy.current = false; }
    void perguntar(texto);
  }, [perguntar, rearmar, voice]);

  const alternarMicrofone = useCallback(() => {
    if (recognition.listening) {
      recognition.enable(false);
      setStatus("MICROFONE DESLIGADO");
    } else {
      recognition.enable(true);
      armed.current = true;
      rearmar();
      setStatus("OUVINDO · DIGA O COMANDO");
    }
  }, [recognition, rearmar]);

  if (phase === "boot") return <BootScreen saindo={saindoDoBoot} />;
  if (phase === "activate") return <ActivateScreen onActivate={() => void ativar()} />;

  return (
    <div className="app">
      <TopBar
        mode={mode}
        onMode={setMode}
        apiKey={apiKey}
        onApiKey={setApiKey}
        health={health}
        onRecheck={() => void checarLocal()}
        voices={voice.voices}
        voiceURI={voice.voiceURI}
        onVoice={voice.pickVoice}
        chosenVoice={voice.chosen()}
      />

      <main className="stage">
        <section className="stage__left">
          <Orb
            state={agentState}
            micLevel={mic.level}
            speechEnergy={voice.energy}
            onClick={() => {
              recognition.enable(true);
              armed.current = true;
              rearmar();
              setStatus("OUVINDO · DIGA O COMANDO");
            }}
          />
          <h1 className="brand">{CONFIG.name.toUpperCase()}</h1>
          <p className={"status" + (erro ? " status--err" : "")}>{status}</p>

          <Composer
            onSend={digitar}
            onMic={alternarMicrofone}
            onStop={interromper}
            listening={recognition.listening}
            speaking={voice.speaking}
          />
        </section>

        <section className="stage__right">
          <Transcript turns={turns} pending={agentState === "thinking"} />
        </section>
      </main>

      <BrainPanel
        notes={notes.notes}
        rel={notes.rel}
        flash={notes.flash}
        onSelect={n => setEditor({ note: n, criando: false })}
        onCreate={() => setEditor({ note: null, criando: true })}
        onReload={notes.reload}
      />

      {editor && (
        <NoteEditor
          note={editor.note}
          criando={editor.criando}
          onSave={notes.upsert}
          onDelete={notes.remove}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
