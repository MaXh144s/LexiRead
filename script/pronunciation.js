// PRONUNCIATION: Web Speech API (SpeechSynthesis), gravação de áudio do usuário,
// compressão de áudio e storage separado no IndexedDB. Depende de storage.js.

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════════
const PRONUNCIATION_CONFIG = {
  synthLang: 'en-US',
  synthRate: 0.9,
  synthPitch: 1,
  synthVolume: 1,
  audioQuality: {
    sampleRate: 16000,  // Reduzido de 48000 para economizar espaço
    bitDepth: 16,
    channels: 1,        // Mono
  },
  maxRecordingTime: 10000, // 10 segundos máximo
};

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let currentUtterance = null;  // Rastreia a utterance atual

// ═══════════════════════════════════════════════════════════
// WEB SPEECH API - PRONUNCIA DE PALAVRAS (Síntese)
// ═══════════════════════════════════════════════════════════

/**
 * Reproduz uma palavra em inglês usando Web Speech API
 * @param {string} word - A palavra a ser pronunciada
 */
function speakWord(word) {
  // Cancelar qualquer pronúncia em andamento
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }

  // Limpar referência da utterance anterior
  currentUtterance = null;

  // Pequeno delay para garantir limpeza completa
  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = PRONUNCIATION_CONFIG.synthLang;
    utterance.rate = PRONUNCIATION_CONFIG.synthRate;
    utterance.pitch = PRONUNCIATION_CONFIG.synthPitch;
    utterance.volume = PRONUNCIATION_CONFIG.synthVolume;

    utterance.onstart = () => {
      updatePronunciationUI(word, 'speaking');
    };

    utterance.onend = () => {
      updatePronunciationUI(word, 'idle');
      currentUtterance = null;
    };

    utterance.onerror = (event) => {
      console.error('Erro ao pronunciar:', event.error);
      updatePronunciationUI(word, 'error');
      showNotif(`Erro ao pronunciar: ${event.error}`);
      currentUtterance = null;
    };

    // Armazenar referência da utterance atual
    currentUtterance = utterance;
    speechSynthesis.speak(utterance);
  }, 50);
}

/**
 * Para a pronúncia em andamento
 */
function stopSpeaking() {
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    currentUtterance = null;
    updatePronunciationUI(null, 'idle');
  }
}

// ═══════════════════════════════════════════════════════════
// GRAVAÇÃO DE ÁUDIO - PREPARAÇÃO E INÍCIO
// ═══════════════════════════════════════════════════════════

/**
 * Inicia a gravação de áudio do usuário
 * @param {string} word - A palavra associada à gravação
 */
async function startRecording(word) {
  try {
    // Parar qualquer pronúncia em andamento
    stopSpeaking();

    // Solicitar acesso ao microfone
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Criar MediaRecorder com codec otimizado
    const mimeType = MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/wav';

    mediaRecorder = new MediaRecorder(stream, { mimeType });
    audioChunks = [];
    isRecording = true;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      isRecording = false;
      try {
        // Processar e comprimir o áudio
        const compressedBlob = await processAndCompressAudio(
          new Blob(audioChunks, { type: mimeType }),
          word
        );

        // Salvar no storage
        await savePronunciationAudio(word, compressedBlob);
        showNotif(`✓ Pronúncia de "${word}" salva!`);
        
        // Atualizar UI
        updateRecordingUI(word, 'saved');
      } catch (error) {
        console.error('Erro ao processar áudio:', error);
        showNotif('Erro ao salvar pronúncia. Tente novamente.');
      }
    };

    mediaRecorder.start();
    updateRecordingUI(word, 'recording');

    // Auto-stop após tempo máximo
    setTimeout(() => {
      if (isRecording) {
        stopRecording(word);
      }
    }, PRONUNCIATION_CONFIG.maxRecordingTime);

  } catch (error) {
    console.error('Erro ao acessar microfone:', error);
    showNotif('Não foi possível acessar o microfone. Verifique as permissões.');
  }
}

/**
 * Para a gravação em andamento
 * @param {string} word - A palavra associada
 */
function stopRecording(word) {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;

    // Parar stream de áudio
    mediaRecorder.stream.getTracks().forEach(track => track.stop());

    updateRecordingUI(word, 'processing');
  }
}

// ═══════════════════════════════════════════════════════════
// COMPRESSÃO E PROCESSAMENTO DE ÁUDIO
// ═══════════════════════════════════════════════════════════

/**
 * Processa e comprime o áudio para economizar espaço
 * Usa downsampling e resampling para reduzir o tamanho
 * @param {Blob} audioBlob - Blob de áudio original
 * @param {string} word - Palavra para referência
 * @returns {Promise<Blob>} Áudio comprimido
 */
async function processAndCompressAudio(audioBlob, word) {
  try {
    // Decodificar áudio
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Aplicar downsampling (reduzir sample rate)
    const compressedBuffer = downsampleAudioBuffer(
      audioBuffer,
      PRONUNCIATION_CONFIG.audioQuality.sampleRate
    );

    // Converter para WAV ou WebM comprimido
    const compressedBlob = audioBufferToWav(compressedBuffer);

    console.log(
      `📦 Áudio comprimido: ${(audioBlob.size / 1024).toFixed(2)}KB → ${(compressedBlob.size / 1024).toFixed(2)}KB`
    );

    return compressedBlob;
  } catch (error) {
    console.error('Erro ao comprimir áudio:', error);
    // Retornar blob original se a compressão falhar
    return audioBlob;
  }
}

/**
 * Reduz sample rate do áudio para economizar espaço
 * @param {AudioBuffer} audioBuffer
 * @param {number} targetSampleRate
 * @returns {AudioBuffer} Áudio reamostrado
 */
function downsampleAudioBuffer(audioBuffer, targetSampleRate) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const originalRate = audioBuffer.sampleRate;

  if (originalRate === targetSampleRate) {
    return audioBuffer;
  }

  const ratio = originalRate / targetSampleRate;
  const newLength = Math.round(audioBuffer.length / ratio);
  const newBuffer = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    newLength,
    targetSampleRate
  );

  const originalData = audioBuffer.getChannelData(0);
  const newData = newBuffer.getChannelData(0);

  // Interpolação linear simples
  let index = 0.0;
  let nextIndex = 0;
  for (let i = 0; i < newLength; i++) {
    index = i * ratio;
    nextIndex = Math.floor(index);
    const frac = index - nextIndex;

    if (nextIndex + 1 < originalData.length) {
      newData[i] =
        originalData[nextIndex] * (1 - frac) +
        originalData[nextIndex + 1] * frac;
    } else {
      newData[i] = originalData[nextIndex];
    }
  }

  return newBuffer;
}

/**
 * Converte AudioBuffer para WAV Blob (formato não comprimido mas compacto)
 * @param {AudioBuffer} audioBuffer
 * @returns {Blob} WAV Blob
 */
function audioBufferToWav(audioBuffer) {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;

  const channelData = [];
  for (let i = 0; i < numberOfChannels; i++) {
    channelData.push(audioBuffer.getChannelData(i));
  }

  // Calcular tamanho do arquivo
  const wavDataLength = audioBuffer.length * blockAlign;
  const wavSize = 36 + wavDataLength;
  const arrayBuffer = new ArrayBuffer(44 + wavDataLength);
  const view = new DataView(arrayBuffer);

  // Escrever cabeçalho WAV
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, wavSize, true);
  writeString(8, 'WAVE');

  // Subchunk1: Format
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Tamanho do subchunk
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // Subchunk2: Data
  writeString(36, 'data');
  view.setUint32(40, wavDataLength, true);

  // Escrever dados de áudio
  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      const sample16bit = sample < 0
        ? sample * 0x8000
        : sample * 0x7FFF;
      view.setInt16(offset, sample16bit, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// ═══════════════════════════════════════════════════════════
// STORAGE - ÁUDIOS DE PRONÚNCIA
// ═══════════════════════════════════════════════════════════

/**
 * Salva áudio de pronúncia no IndexedDB (storage separado)
 * @param {string} word - A palavra pronunciada
 * @param {Blob} audioBlob - Blob de áudio comprimido
 */
async function savePronunciationAudio(word, audioBlob) {
  const key = `pronunciation_${word.toLowerCase()}`;
  const data = {
    key,
    word: word.toLowerCase(),
    audioBlob,
    timestamp: Date.now(),
    size: audioBlob.size,
  };

  await idbSet('pronunciations', data);
}

/**
 * Carrega áudio de pronúncia do storage
 * @param {string} word - A palavra a buscar
 * @returns {Promise<Blob|null>} Blob de áudio ou null
 */
async function getPronunciationAudio(word) {
  const key = `pronunciation_${word.toLowerCase()}`;
  const data = await idbGet('pronunciations', key);
  return data ? data.audioBlob : null;
}

/**
 * Reproduz áudio de pronúncia salvo
 * @param {string} word - A palavra pronunciada
 */
async function playPronunciationAudio(word) {
  try {
    const audioBlob = await getPronunciationAudio(word);
    if (!audioBlob) {
      showNotif('Nenhuma gravação salva para esta palavra.');
      return;
    }

    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.onended = () => URL.revokeObjectURL(audioUrl);
    audio.play();

    updatePlaybackUI(word, 'playing');
    audio.onended = () => {
      updatePlaybackUI(word, 'idle');
      URL.revokeObjectURL(audioUrl);
    };
  } catch (error) {
    console.error('Erro ao reproduzir áudio:', error);
    showNotif('Erro ao reproduzir gravação.');
  }
}

/**
 * Deleta áudio de pronúncia salvo
 * @param {string} word - A palavra pronunciada
 */
async function deletePronunciationAudio(word) {
  const key = `pronunciation_${word.toLowerCase()}`;
  await idbDelete('pronunciations', key);
  showNotif(`Pronúncia de "${word}" deletada.`);
  updateRecordingUI(word, 'idle');
}

/**
 * Verifica se existe gravação para uma palavra
 * @param {string} word
 * @returns {Promise<boolean>}
 */
async function hasPronunciationAudio(word) {
  const audio = await getPronunciationAudio(word);
  return audio !== null;
}

// ═══════════════════════════════════════════════════════════
// UI - ATUALIZAÇÃO DE ESTADOS
// ═══════════════════════════════════════════════════════════

/**
 * Atualiza UI durante pronúncia (síntese)
 */
function updatePronunciationUI(word, state) {
  const btn = document.getElementById('btn-pronounce-word');
  if (!btn) return;

  if (state === 'speaking') {
    btn.classList.add('speaking');
    btn.textContent = '🔊 Parando...';
    btn.onclick = () => stopSpeaking();
  } else if (state === 'error') {
    btn.classList.remove('speaking');
    btn.classList.add('error');
    btn.textContent = '🔊 Pronunciar';
    setTimeout(() => btn.classList.remove('error'), 2000);
  } else {
    btn.classList.remove('speaking', 'error');
    btn.textContent = '🔊 Pronunciar';
    btn.onclick = () => speakWord(word);
  }
}

/**
 * Atualiza UI durante gravação
 */
function updateRecordingUI(word, state) {
  const recordBtn = document.getElementById('btn-record-word');
  const playBtn = document.getElementById('btn-play-recording');
  const deleteBtn = document.getElementById('btn-delete-recording');
  const statusEl = document.getElementById('recording-status');

  if (!recordBtn) return;

  if (state === 'recording') {
    recordBtn.classList.add('recording');
    recordBtn.textContent = '⏹ Parar gravação';
    recordBtn.onclick = () => stopRecording(word);
    if (statusEl) statusEl.textContent = 'Gravando...';
  } else if (state === 'processing') {
    recordBtn.disabled = true;
    recordBtn.textContent = '⏳ Processando...';
    if (statusEl) statusEl.textContent = 'Comprimindo áudio...';
  } else if (state === 'saved') {
    recordBtn.classList.remove('recording');
    recordBtn.disabled = false;
    recordBtn.textContent = '🎤 Gravar novamente';
    recordBtn.onclick = () => startRecording(word);
    if (playBtn) playBtn.disabled = false;
    if (deleteBtn) deleteBtn.disabled = false;
    if (statusEl) statusEl.textContent = '✓ Pronúncia salva';
  } else if (state === 'idle') {
    recordBtn.classList.remove('recording');
    recordBtn.disabled = false;
    recordBtn.textContent = '🎤 Gravar pronúncia';
    recordBtn.onclick = () => startRecording(word);
    if (statusEl) statusEl.textContent = '';
  }
}

/**
 * Atualiza UI durante reprodução
 */
function updatePlaybackUI(word, state) {
  const playBtn = document.getElementById('btn-play-recording');
  if (!playBtn) return;

  if (state === 'playing') {
    playBtn.classList.add('playing');
    playBtn.textContent = '⏸ Parando...';
  } else {
    playBtn.classList.remove('playing');
    playBtn.textContent = '▶ Reproduzir';
  }
}

// ═══════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════

/**
 * Inicializa os controles de pronúncia na aba de edição
 * @param {string} word - A palavra em edição
 */
async function initPronunciationControls(word) {
  // Atualizar estado do botão de gravação
  const hasRecording = await hasPronunciationAudio(word);
  const recordBtn = document.getElementById('btn-record-word');

  if (recordBtn && hasRecording) {
    updateRecordingUI(word, 'saved');
    const playBtn = document.getElementById('btn-play-recording');
    if (playBtn) playBtn.disabled = false;
  } else if (recordBtn) {
    updateRecordingUI(word, 'idle');
  }
}

// ═══════════════════════════════════════════════════════════
// GERENCIAMENTO DE ARMAZENAMENTO
// ═══════════════════════════════════════════════════════════

/**
 * Obtém informações sobre uso de espaço de pronúncias
 * @returns {Promise<Object>} { count, totalSize, avgSize }
 */
async function getPronunciationStorageStats() {
  try {
    const allRecordings = await idbGetAll('pronunciations');
    const count = allRecordings.length;
    const totalSize = allRecordings.reduce((sum, rec) => sum + (rec.size || 0), 0);
    const avgSize = count > 0 ? totalSize / count : 0;

    return {
      count,
      totalSize,
      totalSizeKB: (totalSize / 1024).toFixed(2),
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(4),
      avgSize,
      avgSizeKB: (avgSize / 1024).toFixed(2),
    };
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    return { count: 0, totalSize: 0, totalSizeKB: '0', totalSizeMB: '0', avgSize: 0, avgSizeKB: '0' };
  }
}

/**
 * Lista todas as gravações salvas
 * @returns {Promise<Array>} Array com info de cada gravação
 */
async function listPronunciationRecordings() {
  try {
    const allRecordings = await idbGetAll('pronunciations');
    return allRecordings.map(rec => ({
      word: rec.word,
      sizeKB: (rec.size / 1024).toFixed(2),
      timestamp: new Date(rec.timestamp).toLocaleString('pt-BR'),
      timestampRaw: rec.timestamp,
    })).sort((a, b) => b.timestampRaw - a.timestampRaw);
  } catch (error) {
    console.error('Erro ao listar gravações:', error);
    return [];
  }
}

/**
 * Limpa todas as gravações de pronúncia
 * @returns {Promise<void>}
 */
async function clearAllPronunciationAudio() {
  try {
    const allRecordings = await idbGetAll('pronunciations');
    for (const rec of allRecordings) {
      await idbDelete('pronunciations', rec.key);
    }
    showNotif('Todas as pronúncias foram deletadas.');
  } catch (error) {
    console.error('Erro ao limpar pronunciações:', error);
    showNotif('Erro ao limpar pronunciações.');
  }
}

/**
 * Exibe relatório de armazenamento no console (para debug)
 */
async function debugPronunciationStorage() {
  const stats = await getPronunciationStorageStats();
  const recordings = await listPronunciationRecordings();

  console.group('📊 Estatísticas de Armazenamento de Pronúncias');
  console.table({
    'Total de Gravações': stats.count,
    'Tamanho Total': `${stats.totalSizeKB} KB (${stats.totalSizeMB} MB)`,
    'Tamanho Médio': `${stats.avgSizeKB} KB`,
  });
  console.log('Gravações:');
  console.table(recordings);
  console.groupEnd();
}

// ═══════════════════════════════════════════════════════════
// INTEGRAÇÃO COM TOOLTIP
// ═══════════════════════════════════════════════════════════

/**
 * Pronuncia a palavra exibida no tooltip
 * Garante que está pronunciando a palavra correta do modal
 */
function pronuncieWordFromTooltip() {
  // Pegar a palavra do elemento tt-word no tooltip
  const wordElement = document.getElementById('tt-word');
  if (!wordElement) return;

  const word = wordElement.textContent.trim();
  
  // Validar que é uma palavra válida (não é o placeholder "—")
  if (!word || word === '—' || word.length === 0) {
    showNotif('Nenhuma palavra selecionada no modal.');
    return;
  }

  // Pronunciar a palavra
  speakWord(word);
  
  // Feedback visual no console
  console.log(`🔊 Pronunciando: "${word}"`);
}


