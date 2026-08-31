import { useState } from "react";

interface Props {
  onSend: (texto: string) => void;
  onMic: () => void;
  onStop: () => void;
  listening: boolean;
  speaking: boolean;
}

export function Composer({ onSend, onMic, onStop, listening, speaking }: Props) {
  const [texto, setTexto] = useState("");

  const enviar = () => {
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    onSend(t);
  };

  return (
    <div className="composer">
      <button
        className={"round" + (listening ? " round--live" : "")}
        onClick={onMic}
        title={listening ? "desligar microfone" : "ligar microfone"}
        aria-label={listening ? "desligar microfone" : "ligar microfone"}
      >
        {listening ? "◉" : "🎙"}
      </button>

      <input
        className="composer__input"
        value={texto}
        placeholder="ou digite e tecle Enter"
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") enviar(); }}
      />

      <button
        className="round"
        onClick={onStop}
        disabled={!speaking}
        title="interromper a fala"
        aria-label="interromper a fala"
      >
        ◼
      </button>
    </div>
  );
}
