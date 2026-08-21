# 🔊 Pronúncia e Gravação de Áudio — LexiRead

Documentação completa da funcionalidade de pronúncia: como usar, como funciona por baixo dos panos, e referência técnica para desenvolvedores.

**Status**: ✅ Pronto para produção · **Versão**: 1.0 · **Desde**: 2026-08-12

---

## 📁 Arquivos envolvidos

| Arquivo | Descrição |
|---|---|
| `pronunciation.js` | Módulo principal: Web Speech API, gravação, compressão e storage |
| `storage.js` | Object store `pronunciations` no IndexedDB (`lexiread-db`, v2) |
| `dict-editor.js` | Chama `initPronunciationControls()` ao abrir a edição de uma palavra |
| `index.html` | Script `pronunciation.js` + seção de UI na edição de palavra |
| `styles.css` | Estilos dos botões e animações de estado |
| `PRONUNCIATION_CHEATSHEET.js` | Referência rápida de funções para uso no console do navegador |

Nenhum serviço externo é usado — tudo roda com APIs nativas do navegador (Web Speech, MediaRecorder, AudioContext, IndexedDB). Não há chave de API nem chamada de rede envolvida.

---

## 🎯 Funcionalidades

### 1️⃣ Pronunciar uma palavra (síntese)

1. Abra a aba **Dicionário** (lado direito)
2. Clique em uma palavra para **editar**
3. Na seção "🔊 Pronúncia & Áudio", clique em **"🔊 Pronunciar"**
4. O navegador reproduz a palavra em inglês (EUA) via **Web Speech API** (`SpeechSynthesis`)
5. Clique novamente para **parar**

Use para confirmar como a palavra soa em inglês enquanto estuda.

### 2️⃣ Gravar sua pronúncia

1. Clique em **"🎤 Gravar pronúncia"**
2. Autorize o acesso ao microfone (primeira vez)
3. Fale a palavra claramente — até **10 segundos**
4. Clique em **"⏹ Parar gravação"** ou deixe o tempo esgotar
5. O áudio é **comprimido automaticamente** e salvo no IndexedDB
6. Uma mensagem ✓ confirma o salvamento

Detalhes:
- Gravação em **mono** (1 canal) e **16 kHz**, para economizar espaço
- Tamanho típico: **50–150 KB** por 10 segundos
- Gravações ficam num store **separado do dicionário** (não afeta performance dele)
- **1 gravação por palavra** — gravar de novo sobrescreve a anterior

### 3️⃣ Reproduzir sua gravação

Com uma gravação salva, o botão **"▶ Reproduzir"** fica ativo. Use para comparar sua pronúncia com a do navegador e acompanhar sua evolução.

### 4️⃣ Deletar uma gravação

Clique em **"🗑️ Deletar"** para remover a gravação salva. Pode gravar novamente quando quiser.

---

## 🛠️ Como funciona por dentro

### Síntese de voz
```javascript
PRONUNCIATION_CONFIG = {
  synthLang: 'en-US',   // Inglês EUA
  synthRate: 0.9,       // Velocidade 90%
  synthPitch: 1,        // Tom natural
  synthVolume: 1,       // Volume 100%
}
```
Usa `SpeechSynthesis` do navegador — sem download, sem chave, sem custo.

### Gravação e compressão
```javascript
audioQuality: {
  sampleRate: 16000,   // 16kHz (reduzido de 48kHz nativo)
  bitDepth: 16,         // 16-bit
  channels: 1,           // Mono
},
maxRecordingTime: 10000, // 10 segundos
```

Pipeline de compressão:
1. **Downsampling**: 48 kHz → 16 kHz (≈ −66% de tamanho)
2. **Mono**: 1 canal em vez de estéreo (≈ −50% adicional)
3. **Formato**: WAV (simples, sem dependência de encoder externo)

Resultado: compressão média de **~67%**, arquivo final de 50–150 KB para 10 segundos de áudio.

### Armazenamento (IndexedDB)

```javascript
Database: lexiread-db (v2)

Store: pronunciations {
  key: "pronunciation_${word.toLowerCase()}",
  word: string,
  audioBlob: Blob,
  timestamp: number,
  size: number
}
```

- Separado do dicionário — não impacta a performance dele
- Limite prático: ~50 MB+ por navegador
- Persiste entre sessões e entre diferentes PDFs
- Sem sincronização em nuvem — 100% local

---

## 📚 Referência de funções (console / dev)

### Síntese
| Função | Descrição |
|---|---|
| `speakWord(word)` | Pronuncia a palavra |
| `stopSpeaking()` | Para a pronúncia em andamento |

### Gravação
| Função | Descrição |
|---|---|
| `startRecording(word)` | Inicia gravação (pede permissão de microfone) |
| `stopRecording(word)` | Para a gravação |

### Reprodução de gravação salva
| Função | Descrição |
|---|---|
| `playPronunciationAudio(word)` | Toca a gravação salva |
| `deletePronunciationAudio(word)` | Deleta a gravação |
| `hasPronunciationAudio(word)` | Verifica se existe gravação |

### Storage
| Função | Descrição |
|---|---|
| `savePronunciationAudio(word, blob)` | Salva no IndexedDB |
| `getPronunciationAudio(word)` | Carrega do IndexedDB |

### Gerenciamento / debug
| Função | Descrição |
|---|---|
| `getPronunciationStorageStats()` | Estatísticas de uso: `{ count, totalSize, totalSizeKB, avgSize, ... }` |
| `listPronunciationRecordings()` | Lista todas as gravações salvas |
| `clearAllPronunciationAudio()` | Deleta **todas** as gravações (⚠️ irreversível) |
| `debugPronunciationStorage()` | Log detalhado no console |

### Receitas úteis de console

```javascript
// Espaço usado
(async () => {
  const stats = await getPronunciationStorageStats();
  console.log(`Usando ${stats.totalSizeKB} KB para ${stats.count} gravações`);
})();

// Exportar metadados de todas as gravações (sem o áudio)
(async () => {
  const recordings = await listPronunciationRecordings();
  console.log(JSON.stringify(recordings, null, 2));
})();

// Achar a maior gravação
(async () => {
  const all = await idbGetAll('pronunciations');
  const largest = all.reduce((a, b) => a.size > b.size ? a : b);
  console.log(`Maior: ${largest.word} (${(largest.size/1024).toFixed(2)}KB)`);
})();

// Apagar gravações com mais de 7 dias
(async () => {
  const all = await idbGetAll('pronunciations');
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  for (const rec of all) {
    if (now - rec.timestamp > week) {
      await idbDelete('pronunciations', rec.key);
      console.log(`Deletado: ${rec.word}`);
    }
  }
})();
```

### Checagem de compatibilidade

```javascript
console.log('SpeechSynthesis:', 'speechSynthesis' in window);
console.log('MediaRecorder:', 'MediaRecorder' in window);
console.log('AudioContext:', window.AudioContext !== undefined);
console.log('IndexedDB:', 'indexedDB' in window);

// Listar vozes disponíveis
speechSynthesis.getVoices().forEach(v => console.log(v.name, v.lang));
```

---

## 🎨 Estados visuais dos botões

```
🔊 Pronunciar
  idle        → Normal
  speaking    → Azul + pulso
  error       → Vermelho

🎤 Gravar
  idle        → Normal
  recording   → Vermelho + pulso
  processing  → Desabilitado
  saved       → Verde

▶ Reproduzir
  disabled    → Sem gravação
  playing     → Laranja + pulso

🗑️ Deletar
  disabled    → Sem gravação
  normal      → Disponível
```

Classes CSS aplicadas automaticamente:
- `#btn-pronounce-word`: `.speaking`, `.error`
- `#btn-record-word`: `.recording`
- `#btn-play-recording`: `.playing`, `:disabled` (sem gravação)

---

## 🌐 Compatibilidade

| Feature | Chrome | Edge | Firefox | Safari |
|---|---|---|---|---|
| Web Speech (síntese) | ✅ | ✅ | ⚠️ parcial | ✅ |
| MediaRecorder | ✅ | ✅ | ✅ | ✅ |
| AudioContext | ✅ | ✅ | ✅ | ✅ |
| IndexedDB | ✅ | ✅ | ✅ | ✅ |

---

## 🎓 Casos de uso

**Para estudantes**
- Ouvir a pronúncia correta antes de gravar
- Gravar a própria pronúncia para praticar
- Comparar com a pronúncia do navegador
- Manter histórico de tentativas

**Para professores**
- Verificar a pronúncia dos alunos via gravações
- Usar como ferramenta de feedback
- Acompanhar progresso ao longo do tempo

---

## ⚠️ Limitações conhecidas

1. **Web Speech API**: qualidade depende do navegador; algumas vozes/idiomas são limitados (Firefox tem suporte parcial).
2. **Gravação**: exige permissão de microfone; máximo 10 segundos; apenas 1 gravação por palavra (sobrescreve a anterior).
3. **Armazenamento**: sem sincronização em nuvem; ainda não exporta áudios junto com o JSON do dicionário; depende do IndexedDB do navegador (limite prático por navegador).

---

## 🔧 Troubleshooting

**"Não foi possível acessar o microfone"**
- Verifique se a permissão foi concedida ao navegador (`Chrome → Configurações → Privacidade → Microfone`)
- Teste o microfone em outro site
- Reinicie o navegador

**"Erro ao pronunciar"**
- O navegador pode não suportar Web Speech totalmente — teste em Chrome, Edge ou Safari
- Verifique o volume do sistema

**"Erro ao salvar pronúncia"**
- IndexedDB pode estar cheio — rode `await getPronunciationStorageStats()` para checar
- Verifique espaço em disco; tente fechar outras abas
- Em último caso: `await clearAllPronunciationAudio()` (⚠️ apaga tudo)

**Áudio muito baixo/alto**
- Ajuste o volume do navegador/sistema
- Edite `PRONUNCIATION_CONFIG.synthVolume` no código

**Para investigar qualquer erro**: abra o console (`F12`) e rode `debugPronunciationStorage()`.

---

## 🔮 Melhorias futuras

**Curto prazo**
- [ ] Exportar/importar áudios junto com o JSON do dicionário
- [ ] Interface de gerenciamento de espaço em disco
- [ ] Múltiplas gravações por palavra

**Médio prazo**
- [ ] Compressão MP3 via Web Worker
- [ ] Visualização de waveform (onda de áudio)
- [ ] Análise de qualidade de pronúncia

**Longo prazo**
- [ ] Reprodução automática no tooltip
- [ ] Sincronização com nuvem (opcional)
- [ ] Machine learning para feedback de pronúncia

---

## 🔒 Segurança e privacidade

- Sem permissões externas além do microfone local
- Sem sincronização em nuvem — dados ficam só no navegador
- Sem tracking ou telemetria

---

## 📄 Referências (MDN)

- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

---

## ✍️ Changelog

**v1.0 (2026-08-12)**
- Implementação inicial
- Web Speech API (síntese)
- Gravação com MediaRecorder
- Compressão de áudio (downsampling + mono)
- Storage separado no IndexedDB
- UI completa na aba de edição de palavra
- Documentação completa