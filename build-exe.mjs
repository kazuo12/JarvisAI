#!/usr/bin/env node
/**
 * Empacota o Jarvis num executável único.
 *
 * Usa o recurso nativo do Node (Single Executable Application): a aplicação
 * inteira — servidor e página — é injetada dentro de uma cópia do binário do
 * Node. Quem receber o arquivo não precisa instalar Node nem npm.
 *
 *   node build-exe.mjs --target=win     → build/jarvis.exe
 *   node build-exe.mjs --target=linux   → build/jarvis
 *   node build-exe.mjs --target=mac     → build/jarvis-mac
 *
 * O modelo de IA NÃO vai junto: são gigabytes, e o Ollama é um programa à
 * parte. O executável carrega a interface e o servidor.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const RAIZ = import.meta.dirname;
const DIST = path.join(RAIZ, "app", "dist");
const BUILD = path.join(RAIZ, "build");
const CACHE = path.join(BUILD, "cache");
const VERSAO_NODE = process.version;                 // casa com o blob gerado
const FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

const alvo = (process.argv.find(a => a.startsWith("--target=")) || "--target=linux").split("=")[1];

const ALVOS = {
  win:   { arquivo: "jarvis.exe",     pacote: `node-${VERSAO_NODE}-win-x64.zip`,        dentro: `node-${VERSAO_NODE}-win-x64/node.exe` },
  linux: { arquivo: "jarvis",         pacote: null, dentro: null },
  mac:   { arquivo: "jarvis-mac",     pacote: `node-${VERSAO_NODE}-darwin-arm64.tar.gz`, dentro: `node-${VERSAO_NODE}-darwin-arm64/bin/node` }
};

const cfg = ALVOS[alvo];
if (!cfg) { console.error(`alvo desconhecido: ${alvo}. Use win, linux ou mac.`); process.exit(1); }

/** Lista todos os arquivos do build, com o caminho que o navegador vai pedir. */
async function mapearAssets(dir, prefixo = "") {
  const mapa = {};
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const completo = path.join(dir, item.name);
    const chave = prefixo ? `${prefixo}/${item.name}` : item.name;
    if (item.isDirectory()) Object.assign(mapa, await mapearAssets(completo, chave));
    else mapa[chave] = path.relative(RAIZ, completo);
  }
  return mapa;
}

async function baixarBase() {
  if (alvo === "linux") {
    // Para Linux basta o próprio Node que está rodando este script.
    const destino = path.join(BUILD, cfg.arquivo);
    await fs.copyFile(process.execPath, destino);
    return destino;
  }

  await fs.mkdir(CACHE, { recursive: true });
  const zip = path.join(CACHE, cfg.pacote);

  if (!await fs.access(zip).then(() => true, () => false)) {
    const url = `https://nodejs.org/dist/${VERSAO_NODE}/${cfg.pacote}`;
    console.log("baixando o Node base:", url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download falhou: ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(zip));
  }

  console.log("extraindo o binário base...");
  if (cfg.pacote.endsWith(".zip")) {
    execFileSync("unzip", ["-o", "-q", zip, cfg.dentro, "-d", CACHE], { stdio: "inherit" });
  } else {
    execFileSync("tar", ["-xzf", zip, "-C", CACHE, cfg.dentro], { stdio: "inherit" });
  }

  const destino = path.join(BUILD, cfg.arquivo);
  await fs.copyFile(path.join(CACHE, cfg.dentro), destino);
  await fs.chmod(destino, 0o755);
  return destino;
}

async function main() {
  if (!await fs.access(path.join(DIST, "index.html")).then(() => true, () => false)) {
    console.error("app/dist não existe. Rode primeiro:  cd app && npm run build");
    process.exit(1);
  }

  await fs.mkdir(BUILD, { recursive: true });

  const assets = await mapearAssets(DIST);
  console.log(`empacotando ${Object.keys(assets).length} arquivos da interface`);

  const configPath = path.join(BUILD, "sea-config.json");
  await fs.writeFile(configPath, JSON.stringify({
    main: "server.js",
    output: "build/jarvis.blob",
    disableExperimentalSEAWarning: true,
    assets
  }, null, 2));

  console.log("gerando o pacote da aplicação...");
  execFileSync(process.execPath, ["--experimental-sea-config", "build/sea-config.json"], {
    cwd: RAIZ, stdio: "inherit"
  });

  const binario = await baixarBase();

  console.log("injetando a aplicação no binário...");
  const args = [
    "--yes", "postject", binario, "NODE_SEA_BLOB", "build/jarvis.blob",
    "--sentinel-fuse", FUSE
  ];
  if (alvo === "mac") args.push("--macho-segment-name", "NODE_SEA");

  const r = spawnSync("npx", args, { cwd: RAIZ, stdio: "inherit" });
  if (r.status !== 0) { console.error("postject falhou"); process.exit(1); }

  const { size } = await fs.stat(binario);
  console.log(`\npronto: ${path.relative(RAIZ, binario)}  (${(size / 1048576).toFixed(1)} MB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
