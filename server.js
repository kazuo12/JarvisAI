#!/usr/bin/env node
/**
 * JARVIS · servidor local
 *
 * Faz duas coisas e nada mais:
 *   1. serve o jarvis.html em http://localhost:8787  (localhost = contexto seguro,
 *      entao o microfone e o audio do navegador funcionam)
 *   2. repassa os comandos para um cerebro que roda na SUA maquina, sem custo
 *      de token e sem API externa.
 *
 * Cerebros suportados (detectados automaticamente, nesta ordem):
 *   - Ollama      http://127.0.0.1:11434
 *   - LM Studio   http://127.0.0.1:1234
 *   - llama.cpp   http://127.0.0.1:8080
 *
 * Todos falam o dialeto OpenAI em /v1/chat/completions, entao o proxy e um so.
 *
 * Uso:  node server.js
 * Env:  PORT, JARVIS_BACKEND_URL, JARVIS_MODEL
 *
 * Sem dependencias. Precisa de Node 18 ou superior (usa fetch nativo).
 */

"use strict";

// Node antigo nao tem fetch nativo e o erro que ele daria ("fetch is not
// defined") nao ajuda ninguem. Melhor falhar aqui, dizendo o que fazer.
const MAIOR = Number(process.versions.node.split(".")[0]);
if (MAIOR < 18) {
  console.error("\n  Este servidor precisa do Node 18 ou mais novo.");
  console.error("  Voce esta no Node " + process.versions.node + ".");
  console.error("  Baixe a versao LTS em https://nodejs.org e tente de novo.\n");
  process.exit(1);
}

const http = require("http");
const fs   = require("fs");
const path = require("path");
const { execFile, spawn } = require("child_process");

const PORT = Number(process.env.PORT || 8787);
const FORCED_BACKEND = process.env.JARVIS_BACKEND_URL || "";
const FORCED_MODEL   = process.env.JARVIS_MODEL || "";

// TTS neural local. Totalmente opcional: sem Piper instalado o navegador
// continua falando com a propria voz, e nada quebra.
const PIPER_BIN   = process.env.JARVIS_PIPER_BIN || "piper";
const PIPER_MODEL = process.env.JARVIS_PIPER_MODEL || "";

let piperPronto = null;   // null = ainda nao verificado

function checarPiper() {
  if (piperPronto !== null) return Promise.resolve(piperPronto);

  if (!PIPER_MODEL || !fs.existsSync(PIPER_MODEL)) {
    piperPronto = { ok: false, motivo: "sem modelo de voz (JARVIS_PIPER_MODEL)" };
    return Promise.resolve(piperPronto);
  }

  return new Promise(resolve => {
    execFile(PIPER_BIN, ["--version"], { timeout: 4000 }, err => {
      piperPronto = err
        ? { ok: false, motivo: "binario do piper nao encontrado" }
        : { ok: true, voz: path.basename(PIPER_MODEL) };
      resolve(piperPronto);
    });
  });
}

const CANDIDATES = [
  { name: "Ollama",    base: "http://127.0.0.1:11434" },
  { name: "LM Studio", base: "http://127.0.0.1:1234"  },
  { name: "llama.cpp", base: "http://127.0.0.1:8080"  }
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".png":  "image/png",
  ".webp": "image/webp",
  ".woff2":"font/woff2",
  ".wav":  "audio/wav"
};

// Servimos o build do React quando ele existe; senao caimos na versao de
// arquivo unico, que continua funcionando. A raiz do estatico nunca e a pasta
// do projeto, entao codigo-fonte e .git ficam fora de alcance.
const DIST = path.join(__dirname, "app", "dist");
const TEM_BUILD = fs.existsSync(path.join(DIST, "index.html"));
const STATIC_ROOT = TEM_BUILD ? DIST : __dirname;

// Rodar o server.js de outra pasta serve uma pagina que nao existe.
if (!TEM_BUILD && !fs.existsSync(path.join(__dirname, "jarvis.html"))) {
  console.error("\n  Nao achei nem app/dist nem o jarvis.html ao lado do server.js.");
  console.error("  Rode 'npm run build' dentro de app/, ou mantenha o");
  console.error("  jarvis.html na mesma pasta do server.js.");
  console.error("  Pasta atual do servidor: " + __dirname + "\n");
  process.exit(1);
}


/* ────────── util ────────── */

function withTimeout(ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, done: () => clearTimeout(t) };
}

async function listModels(base, ms) {
  const t = withTimeout(ms);
  try {
    const res = await fetch(base + "/v1/models", { signal: t.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const rows = Array.isArray(data && data.data) ? data.data : [];
    return rows.map(m => String(m.id)).filter(Boolean);
  } catch (e) {
    return null;
  } finally {
    t.done();
  }
}

/** Descobre qual cerebro esta no ar. Resultado fica em cache ate falhar. */
let cached = null;

async function findBackend(force) {
  if (cached && !force) return cached;

  const pool = FORCED_BACKEND
    ? [{ name: "Personalizado", base: FORCED_BACKEND.replace(/\/+$/, "") }]
    : CANDIDATES;

  for (const c of pool) {
    const models = await listModels(c.base, 1500);
    if (models) {
      cached = { name: c.name, base: c.base, models };
      return cached;
    }
  }
  cached = null;
  return null;
}

function pickModel(backend, asked) {
  if (asked) return asked;
  if (FORCED_MODEL) return FORCED_MODEL;
  return backend.models[0] || "";
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*",
    "cache-control": "no-store"
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > limit) { reject(new Error("payload-too-large")); req.destroy(); return; }
      parts.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", reject);
  });
}

/* ────────── rotas ────────── */

async function routeHealth(res) {
  const [b, tts] = await Promise.all([findBackend(true), checarPiper()]);

  if (!b) {
    return sendJSON(res, 200, {
      ok: false,
      motivo: "Nenhum cerebro local respondeu. Suba o Ollama ou o LM Studio.",
      procurados: CANDIDATES.map(c => c.name + " " + c.base),
      tts
    });
  }
  sendJSON(res, 200, {
    ok: true, backend: b.name, base: b.base,
    modelos: b.models, modelo_padrao: pickModel(b, ""),
    tts
  });
}

/** Sintetiza a fala com o Piper e devolve um WAV. */
async function routeTTS(req, res) {
  const estado = await checarPiper();
  if (!estado.ok) return sendJSON(res, 503, { erro: "sem-tts", mensagem: estado.motivo });

  let texto = "";
  try {
    const corpo = JSON.parse(await readBody(req, 64 * 1024) || "{}");
    texto = String(corpo.text || "").slice(0, 1200).trim();
  } catch (e) {
    return sendJSON(res, 400, { erro: "json-invalido" });
  }
  if (!texto) return sendJSON(res, 400, { erro: "sem-texto" });

  const piper = spawn(PIPER_BIN, ["--model", PIPER_MODEL, "--output_file", "-"]);
  const pedacos = [];
  let respondido = false;

  const falhar = (motivo) => {
    if (respondido) return;
    respondido = true;
    sendJSON(res, 502, { erro: "piper-falhou", detalhe: String(motivo).slice(0, 200) });
  };

  piper.stdout.on("data", d => pedacos.push(d));
  piper.on("error", falhar);
  piper.on("close", code => {
    if (respondido) return;
    if (code !== 0 || !pedacos.length) return falhar("codigo " + code);
    respondido = true;
    const wav = Buffer.concat(pedacos);
    res.writeHead(200, {
      "content-type": "audio/wav",
      "content-length": wav.length,
      "access-control-allow-origin": "*",
      "cache-control": "no-store"
    });
    res.end(wav);
  });

  piper.stdin.end(texto);
}

async function routeChat(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req, 1024 * 512) || "{}");
  } catch (e) {
    return sendJSON(res, 400, { erro: "json-invalido" });
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (!messages.length) return sendJSON(res, 400, { erro: "sem-mensagens" });

  const backend = await findBackend(false);
  if (!backend) {
    return sendJSON(res, 503, {
      erro: "sem-cerebro",
      mensagem: "Nenhum modelo local esta rodando. Abra o Ollama e tente de novo."
    });
  }

  const model = pickModel(backend, payload.model);
  if (!model) {
    return sendJSON(res, 503, {
      erro: "sem-modelo",
      mensagem: "O servidor local esta no ar mas nao tem modelo instalado."
    });
  }

  const chat = [];
  if (payload.system) chat.push({ role: "system", content: String(payload.system) });
  for (const m of messages) {
    if (!m || !m.role || typeof m.content !== "string") continue;
    chat.push({ role: m.role, content: m.content });
  }

  const t = withTimeout(Number(process.env.JARVIS_TIMEOUT_MS || 180000));
  try {
    const upstream = await fetch(backend.base + "/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: chat,
        max_tokens: Number(payload.max_tokens || 400),
        temperature: typeof payload.temperature === "number" ? payload.temperature : 0.7,
        stream: false
      }),
      signal: t.signal
    });

    const raw = await upstream.text();
    if (!upstream.ok) {
      cached = null;   // forca redeteccao na proxima
      return sendJSON(res, 502, {
        erro: "cerebro-recusou", status: upstream.status,
        detalhe: raw.slice(0, 400)
      });
    }

    let text = "";
    try {
      const data = JSON.parse(raw);
      const choice = data && data.choices && data.choices[0];
      text = (choice && choice.message && choice.message.content) || "";
    } catch (e) {
      return sendJSON(res, 502, { erro: "resposta-ilegivel", detalhe: raw.slice(0, 400) });
    }

    if (!String(text).trim()) return sendJSON(res, 502, { erro: "resposta-vazia" });

    sendJSON(res, 200, { text: String(text), model, backend: backend.name });
  } catch (err) {
    const abortou = err && err.name === "AbortError";
    cached = null;

    // Conexao caiu: pode ser que o modelo tenha sido desligado depois da
    // deteccao. Reconfere antes de escolher o que dizer.
    if (!abortou && !(await findBackend(true))) {
      return sendJSON(res, 503, {
        erro: "sem-cerebro",
        mensagem: "Nenhum modelo local esta rodando. Abra o Ollama e tente de novo."
      });
    }

    sendJSON(res, abortou ? 504 : 502, {
      erro: abortou ? "tempo-esgotado" : "falha-de-conexao",
      mensagem: abortou
        ? "O modelo local demorou demais para responder."
        : "Nao consegui falar com o cerebro local."
    });
  } finally {
    t.done();
  }
}

function routeStatic(req, res, pathname) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const file = path.join(STATIC_ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));

  if (!file.startsWith(STATIC_ROOT)) { res.writeHead(403).end("proibido"); return; }

  // So os tipos que a pagina precisa, e nada que comece com ponto (.git, .env).
  const ext = path.extname(file).toLowerCase();
  const escondido = path.relative(STATIC_ROOT, file).split(/[/\\]/).some(seg => seg.startsWith("."));
  if (escondido || !MIME[ext]) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("nao encontrado");
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("nao encontrado"); return; }
    res.writeHead(200, {
      "content-type": MIME[ext],
      "content-length": buf.length,
      "cache-control": "no-store"
    });
    res.end(buf);
  });
}

/* ────────── servidor ────────── */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-allow-private-network": "true",
      "access-control-max-age": "86400"
    });
    return res.end();
  }

  try {
    if (url.pathname === "/api/health") return await routeHealth(res);
    if (url.pathname === "/api/chat" && req.method === "POST") return await routeChat(req, res);
    if (url.pathname === "/api/tts" && req.method === "POST") return await routeTTS(req, res);
    if (req.method === "GET" || req.method === "HEAD") return routeStatic(req, res, url.pathname);
    sendJSON(res, 405, { erro: "metodo-nao-permitido" });
  } catch (e) {
    sendJSON(res, 500, { erro: "erro-interno", detalhe: String(e && e.message || e) });
  }
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error("\n  A porta " + PORT + " ja esta ocupada.");
    console.error("  Provavelmente o servidor ja esta rodando em outra janela.");
    console.error("  Abra http://localhost:" + PORT + " no navegador,");
    console.error("  ou suba numa porta diferente:  PORT=8788 node server.js\n");
  } else if (err && err.code === "EACCES") {
    console.error("\n  Sem permissao para usar a porta " + PORT + ".");
    console.error("  Tente uma porta acima de 1024:  PORT=8788 node server.js\n");
  } else {
    console.error("\n  Falha ao subir o servidor: " + (err && err.message || err) + "\n");
  }
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", async () => {
  const linha = "─".repeat(52);
  console.log("\n" + linha);
  console.log("  JARVIS · servidor local no ar");
  console.log(linha);
  console.log("  Abra no navegador:  http://localhost:" + PORT);

  const b = await findBackend(true);
  if (b) {
    console.log("  Cerebro detectado:  " + b.name + "  (" + b.base + ")");
    console.log("  Modelo padrao:      " + (pickModel(b, "") || "nenhum instalado"));
    if (b.models.length > 1) console.log("  Outros modelos:     " + b.models.slice(1).join(", "));
  } else {
    console.log("  Cerebro detectado:  NENHUM");
    console.log("  Suba um modelo local e recarregue a pagina. Sugestao:");
    console.log("    ollama serve   e depois   ollama pull llama3.2");
  }
  const tts = await checarPiper();
  console.log("  Voz neural (Piper): " + (tts.ok ? tts.voz : "nao instalada — usando a voz do navegador"));
  console.log(linha + "\n");
});
