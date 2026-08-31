import { useCallback, useEffect, useRef } from "react";

/**
 * Lê o volume real do microfone para o orbe reagir à SUA voz, não a uma
 * animação decorativa. Se o navegador negar o acesso, devolve zero e a
 * interface continua funcionando com a animação sintética.
 */
export function useMicLevel() {
  const level = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const ativo = useRef(false);

  const stop = useCallback(() => {
    ativo.current = false;
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
    ctx.current?.close().catch(() => undefined);
    ctx.current = null;
    level.current = 0;
  }, []);

  const start = useCallback(async () => {
    if (ativo.current) return;
    if (!navigator.mediaDevices?.getUserMedia) return;

    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const c = new AC();
      const fonte = c.createMediaStreamSource(s);
      const analisador = c.createAnalyser();
      analisador.fftSize = 512;
      analisador.smoothingTimeConstant = 0.75;
      fonte.connect(analisador);

      const buffer = new Uint8Array(analisador.frequencyBinCount);
      stream.current = s;
      ctx.current = c;
      ativo.current = true;

      const medir = () => {
        if (!ativo.current) return;
        analisador.getByteTimeDomainData(buffer);
        let soma = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128;
          soma += v * v;
        }
        // RMS, com um ganho para a fala normal ocupar boa parte da escala.
        const rms = Math.sqrt(soma / buffer.length);
        level.current = Math.min(1, rms * 6);
        raf.current = requestAnimationFrame(medir);
      };
      medir();
    } catch {
      ativo.current = false;   // sem microfone extra: seguimos sem reatividade
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { level, start, stop };
}
