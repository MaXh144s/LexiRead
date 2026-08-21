# 📖 LexiRead

Leitor de PDF interativo para estudo de inglês. Enquanto você lê um PDF, o LexiRead identifica cada palavra do texto e permite consultar tradução, exemplos, pronúncia (sintetizada ou gravada por você) e sufixos — tudo direto sobre o documento, sem sair da página.

100% front-end (HTML, CSS e JS puro, sem build/framework) e **100% local**: nenhum dado sai do navegador. Não há backend, servidor ou API externa envolvida — tudo é processado e armazenado no próprio dispositivo do usuário via IndexedDB.

---

## ✨ Funcionalidades

- **Leitor de PDF** com zoom, navegação por página e busca de texto dentro do documento (`Ctrl+F`)
- **Dicionário interativo**: clique em qualquer palavra do PDF para ver tradução, exemplos e descrição
- **Edição de dicionário**: adicione, edite e remova palavras, traduções e exemplos
- **Sistema de sufixos**: reconhece sufixos em inglês (-ing, -ed, -tion, etc.) e sublinha visualmente a raiz e o sufixo de forma diferenciada
- **Pronúncia e gravação de áudio**: ouça a pronúncia da palavra (Web Speech API) e grave/reproduza sua própria pronúncia para praticar
- **Personalização visual**: cores, espessura e estilo dos sublinhados (palavra, sufixo, raiz) são todos configuráveis
- **Atalhos de teclado** customizáveis
- **Arquivos recentes**: reabra PDFs já lidos com um clique (o próprio arquivo fica salvo no navegador)
- **Armazenamento local via IndexedDB**: dicionário, sufixos, configurações visuais, recentes e áudios de pronúncia persistem entre sessões sem precisar de servidor

---

## 🗂️ Arquitetura dos arquivos

O projeto é dividido em módulos JS carregados em sequência (sem bundler). Cada arquivo tem uma responsabilidade única:

| Arquivo | Responsabilidade |
|---|---|
| `state-data.js` | Estado global da aplicação (`State`) e dicionário padrão de palavras |
| `common-words-seed.js` | Lista base de ~20 mil palavras em inglês (frequência) com tradução para PT, usada como dicionário inicial |
| `storage.js` | Camada de persistência via IndexedDB: CRUD genérico, dicionário, sufixos, config visual e histórico de recentes |
| `pdf-loader.js` | Carregamento e renderização do PDF (via pdf.js) |
| `text-layer.js` | Tokenização do texto do PDF (geometria/largura de caracteres) e ativação da camada interativa de palavras clicáveis |
| `suffix-system.js` | Reconhecimento e cadastro de sufixos em inglês |
| `zoom-navigation.js` | Zoom (com reancoragem de scroll) e navegação/salto de página |
| `search.js` | Busca no dicionário (`Ctrl+K`) e busca de texto dentro do PDF (`Ctrl+F`) |
| `tooltip.js` | Exibição e edição rápida via tooltip ao clicar em uma palavra |
| `dict-editor.js` | Interface de edição do dicionário (listagem, formulário de edição) |
| `sidebar-visual-panel.js` | Sidebar de abas e painel de personalização visual dos sublinhados |
| `pronunciation.js` | Síntese de voz, gravação e reprodução de pronúncia (ver [`PRONUNCIATION.md`](./PRONUNCIATION.md)) |
| `keyboard-shortcuts.js` | Atalhos globais de teclado |
| `app-ui-helpers.js` | Helpers de UI (loading, notificações, progresso) e inicialização da aplicação — deve ser o **último** script carregado |

> A ordem de carregamento importa: vários módulos dependem de `State` (`state-data.js`) e de funções definidas em outros arquivos (ex.: `search.js` e `keyboard-shortcuts.js` dependem de `zoom-navigation.js`).

---

## 💾 Armazenamento (IndexedDB)

Banco: `lexiread-db`. Nenhum dado é enviado para fora do navegador.

| Object Store | Conteúdo |
|---|---|
| `kv` | Dicionário, dicionário de sufixos e configuração visual (chave/valor) |
| `recents` | Últimos PDFs abertos, incluindo o **Blob do arquivo** (permite reabrir sem selecionar de novo) |
| `pronunciations` | Áudios gravados pelo usuário, um por palavra |

Versões antigas do app usavam `localStorage`; ao detectar dados legados, o app migra automaticamente para o IndexedDB na primeira carga.

---

## ⌨️ Atalhos de teclado (padrão)

| Atalho | Ação |
|---|---|
| `Ctrl/Cmd + K` | Abrir busca no dicionário |
| `Ctrl/Cmd + F` | Abrir busca de texto no PDF |
| `Ctrl/Cmd + Alt + D` | Abrir/fechar sidebar do dicionário |
| `Ctrl/Cmd + Alt + P` | Abrir/fechar painel de personalização visual |
| `←` / `→` ou `Page Up` / `Page Down` | Navegar entre páginas |
| `+` / `-` | Zoom in / out |
| `Esc` | Fechar overlays (busca, tooltip, modais) |

Todos são reconfiguráveis pelo painel de personalização visual.

---

## 🔊 Pronúncia e gravação de áudio

Funcionalidade completa (síntese de voz + gravação do usuário) documentada em detalhe em **[`PRONUNCIATION.md`](./PRONUNCIATION.md)**.

Resumo: usa **Web Speech API** (nativa do navegador, sem chave ou serviço externo) para pronunciar palavras, e `MediaRecorder`/`AudioContext` para gravar e comprimir a pronúncia do próprio usuário, salva localmente no IndexedDB.

---

## 🚀 Como rodar

Não há build. Basta servir os arquivos estaticamente (necessário por causa do `fetch`/módulos usados pelo pdf.js — abrir o `index.html` direto do disco pode não funcionar em todos os navegadores):

```bash
# qualquer servidor estático funciona, por exemplo:
npx serve .
# ou
python3 -m http.server 8000
```

Depois é só abrir `http://localhost:PORTA` no navegador e carregar um PDF.

---

## 🔐 Privacidade

- Nenhuma chamada de rede é feita para serviços externos (nenhuma API do Google, tradução ou dicionário online).
- Todo o conteúdo — PDFs, dicionário, gravações de áudio, configurações — fica salvo **apenas no navegador do usuário** via IndexedDB.
- Não há coleta, telemetria ou sincronização em nuvem.

---

## 🌐 Compatibilidade

| Feature | Chrome | Edge | Firefox | Safari |
|---|---|---|---|---|
| Web Speech (síntese) | ✅ | ✅ | ⚠️ parcial | ✅ |
| MediaRecorder | ✅ | ✅ | ✅ | ✅ |
| AudioContext | ✅ | ✅ | ✅ | ✅ |
| IndexedDB | ✅ | ✅ | ✅ | ✅ |

---

## 🔮 Melhorias futuras

- [ ] Exportar/importar dicionário e áudios juntos
- [ ] Múltiplas gravações de pronúncia por palavra
- [ ] Compressão MP3 via Web Worker
- [ ] Visualização de waveform do áudio
- [ ] Reprodução automática de pronúncia no tooltip
- [ ] Análise de qualidade de pronúncia (ML)

---

**Stack**: HTML + CSS + JS puro · pdf.js · IndexedDB · Web Speech API · MediaRecorder API