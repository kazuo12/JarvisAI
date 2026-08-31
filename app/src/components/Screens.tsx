import { CONFIG } from "../lib/config";

export function BootScreen({ saindo }: { saindo: boolean }) {
  return (
    <div className={"screen" + (saindo ? " screen--out" : "")}>
      <div className="screen__inner">
        <h1 className="wordmark">{CONFIG.name.toUpperCase()}</h1>
        <div className="rule" />
        <p className="ticker">SINCRONIZANDO DADOS</p>
        <p className="version">v6.0 · NEURAL</p>
      </div>
    </div>
  );
}

export function ActivateScreen({ onActivate }: { onActivate: () => void }) {
  return (
    <div className="screen">
      <div className="screen__inner">
        <h1 className="wordmark">{CONFIG.name.toUpperCase()}</h1>
        <div className="rule" />
        <button className="activate" onClick={onActivate} autoFocus>
          <span className="activate__glow" />
          <span className="activate__label">▶ ATIVAR SISTEMA</span>
        </button>
        <p className="version">CLIQUE PARA INICIAR</p>
      </div>
    </div>
  );
}
