import type { BrainMode, HealthReport } from "../lib/types";

interface Props {
  mode: BrainMode;
  onMode: (m: BrainMode) => void;
  apiKey: string;
  onApiKey: (k: string) => void;
  health: HealthReport | null;
  onRecheck: () => void;
  voices: SpeechSynthesisVoice[];
  voiceURI: string;
  onVoice: (uri: string) => void;
  chosenVoice?: SpeechSynthesisVoice;
}

export function TopBar({
  mode, onMode, apiKey, onApiKey, health, onRecheck,
  voices, voiceURI, onVoice, chosenVoice
}: Props) {
  const local = mode === "local";
  const vivo = Boolean(health?.ok);

  return (
    <header className="topbar">
      <div className="topbar__group">
        <span className={"dot" + (local ? (vivo ? " dot--ok" : " dot--bad") : (apiKey ? " dot--ok" : " dot--bad"))} />
        <label className="topbar__label" htmlFor="modo">CÉREBRO</label>
        <select
          id="modo"
          className="field field--select"
          value={mode}
          onChange={e => onMode(e.target.value as BrainMode)}
        >
          <option value="local">LOCAL · SEM CUSTO</option>
          <option value="claude">CLAUDE · API</option>
        </select>
      </div>

      {local ? (
        <div className="topbar__group topbar__group--grow">
          <span className={"status-chip" + (vivo ? " status-chip--ok" : " status-chip--bad")}>
            {vivo
              ? `${health?.backend} · ${health?.modelo_padrao || "sem modelo"}`
              : "nenhum cérebro local no ar"}
          </span>
          <button className="ghost" onClick={onRecheck} title="reconectar ao cérebro local">↻</button>
        </div>
      ) : (
        <div className="topbar__group topbar__group--grow">
          <input
            className="field"
            type="password"
            value={apiKey}
            placeholder="sk-ant-..."
            autoComplete="off"
            spellCheck={false}
            onChange={e => onApiKey(e.target.value)}
          />
        </div>
      )}

      <div className="topbar__group">
        <label className="topbar__label" htmlFor="voz">VOZ</label>
        <select
          id="voz"
          className="field field--select"
          value={voiceURI || chosenVoice?.voiceURI || ""}
          onChange={e => onVoice(e.target.value)}
          disabled={!voices.length}
        >
          {!voices.length && <option>nenhuma voz pt-BR</option>}
          {voices.map(v => (
            <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
          ))}
        </select>
      </div>
    </header>
  );
}
