# JARVIS

Assistente de voz pessoal com Second Brain: reconhecimento de voz, síntese de fala
e um grafo neural animado que guarda o contexto da sua vida e alimenta todas as
respostas. O cérebro roda **local** (sem custo, sem API externa) ou pela **API do
Claude**.

Interface em React + TypeScript, construída com Vite. Orbe e grafo desenhados em
Canvas 2D, num único `requestAnimationFrame` para a aplicação inteira.

---

## Rodar em dois comandos

```bash
node server.js          # sobe em http://localhost:8787
```

O build já vem pronto no repositório, então isso basta. Para desenvolver:

```bash
cd app
npm install
npm run dev             # http://localhost:5173, com recarga instantânea
npm run build           # gera app/dist, que o server.js passa a servir
```

Deixe o `node server.js` rodando numa janela: o `npm run dev` encaminha as
chamadas de cérebro para ele.

---

## Rodar com cérebro local — sem gastar nada

### 1. Instale o Ollama

Baixe em <https://ollama.com/download> (Windows, macOS ou Linux). Depois de instalar,
ele já sobe sozinho e fica escutando na porta 11434.

### 2. Baixe um modelo

```bash
ollama pull llama3.2:3b
```

Escolha pelo que sua máquina aguenta:

| Modelo | Peso | Precisa de | Como se sai em português |
|---|---|---|---|
| `llama3.2:3b` | ~2 GB | 8 GB de RAM | rápido; respostas simples |
| `qwen2.5:7b` | ~4,7 GB | 16 GB de RAM | bom equilíbrio |
| `gemma2:9b` | ~5,4 GB | 16 GB de RAM | mais articulado, mais lento |

Comece pelo menor. Trocar depois é só rodar outro `ollama pull`.

### 3. Suba o servidor

```bash
node server.js
```

Ele imprime qual cérebro encontrou e abre em **<http://localhost:8787>**.

Pronto: clique em **ATIVAR SISTEMA**, permita o microfone e diga *"Ei Jarvis"*.

> Rodar por `localhost` não é frescura — é o que faz o navegador liberar o
> microfone. Abrir o `jarvis.html` com dois cliques funciona, mas por esse
> caminho o áudio e a captura de voz ficam limitados.

---

## Outros cérebros locais

O servidor procura, nesta ordem, e usa o primeiro que responder:

| Programa | Porta | Observação |
|---|---|---|
| Ollama | 11434 | recomendado |
| LM Studio | 1234 | ligue o *Local Server* na aba de servidor |
| llama.cpp | 8080 | `llama-server -m modelo.gguf` |

Todos falam o dialeto OpenAI em `/v1/chat/completions`, então o proxy é o mesmo.

### Variáveis de ambiente

| Variável | Para quê | Padrão |
|---|---|---|
| `PORT` | porta do servidor | `8787` |
| `JARVIS_BACKEND_URL` | forçar um cérebro específico | detecta sozinho |
| `JARVIS_MODEL` | forçar um modelo | o primeiro instalado |
| `JARVIS_TIMEOUT_MS` | paciência com modelo lento | `180000` |

Exemplo:

```bash
JARVIS_MODEL=qwen2.5:7b node server.js
```

---

## Voltar para o Claude

No topo da página, mude o seletor **CÉREBRO** de `LOCAL` para `CLAUDE`, cole a chave
da Anthropic e clique em SALVAR. A escolha fica guardada no navegador. Esse caminho
é pago e cobrado por uso — o local não custa nada.

---

## Quando algo não funciona

O Jarvis **fala** todo erro em voz alta, e o status abaixo do nome mostra o código.

| O que aparece | O que significa |
|---|---|
| `SERVIDOR LOCAL FORA DO AR` | o `node server.js` não está rodando |
| `SEM CÉREBRO LOCAL` | o servidor está no ar, mas nenhum modelo respondeu |
| `TEMPO ESGOTADO` | o modelo demorou demais — use um menor |
| `CHAVE AUSENTE` | modo Claude sem chave colada |
| `ERRO 401` | chave da Anthropic inválida |

O botão `↻` ao lado do seletor reconecta ao cérebro local sem recarregar a página.

Quando nenhum cérebro é encontrado, <http://localhost:8787/api/health> mostra o
que aconteceu em cada porta, uma a uma — e a mesma lista sai na janela do
servidor. É por aí que se descobre se o problema é o programa não estar no ar,
demorar a responder ou falar um dialeto diferente.

O servidor entende os dois dialetos do Ollama: o compatível com OpenAI
(`/v1/models`) e o nativo (`/api/tags`), usado pelas versões anteriores a 2024.
A detecção tenta um e depois o outro, e a conversa segue pelo mesmo caminho que
respondeu.

---

## Executável (Windows)

Um `jarvis.exe` que não precisa de Node, npm nem terminal: dois cliques sobem o
servidor e abrem o navegador no Jarvis. O que ele **não** carrega é o modelo de
IA — são gigabytes, e o Ollama é um programa à parte que continua sendo
instalado normalmente.

Na primeira execução o Windows mostra *"O Windows protegeu o seu PC"*. Isso
acontece porque o executável não tem assinatura digital paga, não porque haja
algo errado: clique em **Mais informações** e depois em **Executar assim mesmo**.

Para gerar você mesmo:

```bash
cd app && npm run build && cd ..
node build-exe.mjs --target=win     # build/jarvis.exe
node build-exe.mjs --target=linux   # build/jarvis
node build-exe.mjs --target=mac     # build/jarvis-mac
```

O empacotamento usa o recurso nativo do Node (Single Executable Application):
a aplicação é injetada dentro de uma cópia do próprio binário do Node, e os
arquivos da interface viajam embutidos, servidos direto da memória.

---

## Voz mais natural

A fala é quebrada em frases, com uma pausa curta entre elas e uma leve variação
de ritmo e tom a cada frase — é o que tira o efeito de leitura mecânica. O
seletor **VOZ** no topo lista as vozes em português instaladas; as marcadas como
*Natural* ou *Neural* são de outra geração em qualidade, e o sistema já as
prefere sozinho.

### Voz neural local (opcional)

Para uma voz bem acima do que o navegador oferece, instale o
[Piper](https://github.com/rhasspy/piper), baixe um modelo em português e aponte:

```bash
JARVIS_PIPER_MODEL=/caminho/pt_BR-faber-medium.onnx node server.js
```

O servidor detecta sozinho e a página passa a usar a voz neural — o orbe então
pulsa com a forma de onda real do áudio. Sem o Piper, nada muda: a voz do
navegador continua respondendo.

---

## Arquivos

| Caminho | O que é |
|---|---|
| `server.js` | servidor local, proxy do cérebro e TTS opcional; sem dependências |
| `app/src/` | a aplicação React: componentes, hooks e domínio |
| `app/dist/` | build pronto, versionado para o `node server.js` funcionar sem npm |
| `jarvis.html` | a versão anterior, de arquivo único; ainda roda sozinha |

O Second Brain fica no `localStorage` do navegador (`jarvis_notes`), então suas
notas sobrevivem a recarregar e a fechar o navegador.

---

## Desempenho

O orbe e o grafo saíram de SVG com filtros e dezenas de animações CSS para Canvas
2D. Medido no mesmo Chromium, com a mesma tela e as mesmas 17 notas:

| | quadros por segundo | quadros acima de 32 ms |
|---|---|---|
| SVG + CSS (v5) | 19,1 | 284 de 298 |
| Canvas (v6) | 59,6 | 2 de 298 |

O que fez diferença: um único `requestAnimationFrame` para tudo, brilho
pré-desenhado em sprite no lugar de `feGaussianBlur` por nó, `Path2D` e
gradientes criados uma vez por layout em vez de a cada quadro, nada de
`backdrop-filter`, e o desenho para por completo quando a aba está escondida.
