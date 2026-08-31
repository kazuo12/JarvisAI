# JARVIS

Assistente de voz pessoal com Second Brain, em arquivo único, rodando no navegador.
O cérebro pode ser **local** (sem custo, sem API externa) ou a **API do Claude**.

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
Para ver o diagnóstico cru: <http://localhost:8787/api/health>

---

## Arquivos

| Arquivo | O que é |
|---|---|
| `jarvis.html` | o assistente inteiro — HTML, CSS e JS num arquivo só |
| `server.js` | servidor local e proxy para o cérebro; sem dependências |
| `index.html` | redireciona a raiz para o `jarvis.html` |

O Second Brain fica no `localStorage` do navegador (`jarvis_notes`), então suas
notas sobrevivem a recarregar e a fechar o navegador.
