// STORAGE: camada IndexedDB (CRUD genérico), persistência do dicionário/sufixos/config visual e histórico de recentes. Depende de state-data.js.

    // ═══════════════════════════════════════════════════════════
    // INDEXEDDB — camada de persistência
    // Substitui localStorage para o dicionário (sem limite de ~5-10MB,
    // operações assíncronas, e permite guardar o Blob do PDF para reabertura real).
    // ═══════════════════════════════════════════════════════════
    const IDB_NAME = 'lexiread-db';
    const IDB_VERSION = 2; // Incrementado para adicionar pronunciations
    let idbPromise = null;

    function openDB() {
      if (idbPromise) return idbPromise;
      idbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('kv')) {
            db.createObjectStore('kv', { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains('recents')) {
            db.createObjectStore('recents', { keyPath: 'name' });
          }
          // Novo: Storage separado para áudios de pronúncia compactados
          if (!db.objectStoreNames.contains('pronunciations')) {
            db.createObjectStore('pronunciations', { keyPath: 'key' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return idbPromise;
    }

    async function idbGet(store, key) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }

    // ═══════════════════════════════════════════════════════════
    // ROBUSTEZ DE GRAVAÇÃO — retry automático + fila de gravações falhas
    //
    // idbSet agora tenta gravar até WRITE_MAX_ATTEMPTS vezes (com backoff) antes
    // de desistir. Se mesmo assim falhar, a gravação fica registrada em
    // State.failedWrites (para retry periódico via flushFailedWrites, chamado
    // de app-ui-helpers.js) e State.pendingWrites/failedWrites alimentam
    // hasUnsavedWork(), que por sua vez bloqueia o fechamento da aba
    // (beforeunload) enquanto houver algo não confirmado no IndexedDB.
    // ═══════════════════════════════════════════════════════════
    const WRITE_MAX_ATTEMPTS = 3;
    const WRITE_RETRY_BASE_MS = 350;

    function _sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    function _notifyDirtyChanged() {
      if (typeof updateDirtyIndicator === 'function') updateDirtyIndicator();
    }

    // Cada store usa uma keyPath diferente ('kv'/'pronunciations' -> key, 'recents' -> name)
    // — usamos essa identidade só para não duplicar entradas na fila de falhas.
    function _recordIdentity(store, value) {
      return store === 'recents' ? value?.name : value?.key;
    }

    function _registerFailedWrite(store, value, err) {
      const identity = _recordIdentity(store, value);
      State.failedWrites = State.failedWrites.filter(fw => !(fw.store === store && fw.identity === identity));
      State.failedWrites.push({
        store,
        identity,
        value,
        error: err ? String(err.message || err) : 'erro desconhecido',
        lastTry: Date.now(),
      });
    }

    function _clearFailedWrite(store, value) {
      const identity = _recordIdentity(store, value);
      State.failedWrites = State.failedWrites.filter(fw => !(fw.store === store && fw.identity === identity));
    }

    // `silent`: não mostra toast de erro (usado no retry automático em segundo plano,
    // pra não spammar notificações repetidas pro mesmo problema).
    async function idbSet(store, value, { silent = false } = {}) {
      State.pendingWrites++;
      _notifyDirtyChanged();

      let lastErr = null;
      for (let attempt = 1; attempt <= WRITE_MAX_ATTEMPTS; attempt++) {
        try {
          const db = await openDB();
          await new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).put(value);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          State.pendingWrites = Math.max(0, State.pendingWrites - 1);
          _clearFailedWrite(store, value);
          _notifyDirtyChanged();
          return value;
        } catch (err) {
          lastErr = err;
          console.warn(`Gravação em "${store}" falhou (tentativa ${attempt}/${WRITE_MAX_ATTEMPTS}):`, err);
          if (attempt < WRITE_MAX_ATTEMPTS) await _sleep(WRITE_RETRY_BASE_MS * attempt);
        }
      }

      // Esgotou as tentativas: guarda na fila para retry periódico (flushFailedWrites)
      // em vez de simplesmente desistir e perder a alteração.
      State.pendingWrites = Math.max(0, State.pendingWrites - 1);
      _registerFailedWrite(store, value, lastErr);
      _notifyDirtyChanged();
      if (!silent) {
        showNotif('⚠ Não foi possível salvar agora. Vamos tentar de novo automaticamente — evite fechar a aba.', 5000);
      }
      throw lastErr;
    }

    // Retenta gravações que ficaram pendentes em State.failedWrites. Chamado
    // periodicamente e quando a aba volta a ficar visível (ver app-ui-helpers.js).
    async function flushFailedWrites() {
      if (!State.failedWrites.length) return;
      const queue = [...State.failedWrites];
      for (const item of queue) {
        try {
          await idbSet(item.store, item.value, { silent: true });
          showNotif(`✓ Uma gravação pendente foi recuperada com sucesso.`, 2500);
        } catch (e) {
          // Continua na fila — tenta de novo na próxima passada.
        }
      }
    }

    // Verdadeiro se houver edição em formulário não salva OU gravação pendente/
    // falha no IndexedDB. Usado pelo aviso de "fechar sem salvar" (beforeunload).
    function hasUnsavedWork() {
      return !!(
        State.dirty?.dictEntry ||
        State.dirty?.suffixEntry ||
        State.pendingWrites > 0 ||
        (State.failedWrites && State.failedWrites.length > 0)
      );
    }

    // ═══════════════════════════════════════════════════════════
    // BACKUP ESPELHO EM LOCALSTORAGE — última linha de defesa
    //
    // O IndexedDB é a fonte primária, mas alguns cenários (modo privado com
    // IndexedDB bloqueado, corrupção do banco, extensões de navegador) podem
    // zerá-lo entre sessões. Por isso, a cada save bem-sucedido do dicionário/
    // sufixos, também espelhamos uma cópia compacta em localStorage. Se no
    // próximo boot o IndexedDB vier vazio mas o backup tiver dados, recuperamos
    // dali em vez de assumir que o usuário perdeu tudo.
    // ═══════════════════════════════════════════════════════════
    const BACKUP_KEY_DICTIONARY = 'lexiread_backup_dictionary';
    const BACKUP_KEY_SUFFIXDICT = 'lexiread_backup_suffixDict';

    function mirrorBackupToLocalStorage(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify({ value, savedAt: Date.now() }));
      } catch (e) {
        // Quota do localStorage é pequena; se falhar aqui não é crítico — o
        // IndexedDB (já com retry) continua sendo a persistência principal.
        console.warn('Backup em localStorage falhou (não crítico):', e);
      }
    }

    function readBackupFromLocalStorage(key) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && parsed.value ? parsed.value : null;
      } catch (e) {
        return null;
      }
    }

    async function idbDelete(store, key) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    async function idbGetAll(store) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }

    function cloneDictionaryEntry(entry = {}) {
      return {
        ...entry,
        translations: Array.isArray(entry.translations) ? [...entry.translations] : [],
        examples: Array.isArray(entry.examples) ? entry.examples.map(ex => ({ ...ex })) : [],
      };
    }

    function getDisabledDictionaryKeys() {
      const keys = new Set();
      Object.keys(DEFAULT_DICT || {}).forEach(key => keys.add(String(key).trim().toLowerCase()));
      if (typeof COMMON_WORDS_SEED !== 'undefined') {
        Object.keys(COMMON_WORDS_SEED || {}).forEach(key => keys.add(String(key).trim().toLowerCase()));
      }
      return keys;
    }

    function stripDisabledDictionaryEntries(dictionary = {}) {
      const disabled = getDisabledDictionaryKeys();
      const cleaned = {};
      Object.keys(dictionary || {}).forEach(rawKey => {
        const key = String(rawKey || '').trim().toLowerCase();
        if (!key || disabled.has(key)) return;
        cleaned[key] = cloneDictionaryEntry(dictionary[rawKey]);
      });
      return cleaned;
    }


    // ═══════════════════════════════════════════════════════════
    // INICIALIZAÇÃO DO DICIONÁRIO
    // ═══════════════════════════════════════════════════════════
    async function loadDictionary() {
      try {
        const rec = await idbGet('kv', 'dictionary');
        if (rec) {
          const persisted = stripDisabledDictionaryEntries(rec.value || {});
          if (JSON.stringify(persisted) !== JSON.stringify(rec.value || {})) {
            await idbSet('kv', { key: 'dictionary', value: persisted });
          }
          State.dictionary = persisted;
          mirrorBackupToLocalStorage(BACKUP_KEY_DICTIONARY, persisted);
        } else {
          // Migração: dicionário salvo em versões anteriores usava localStorage
          const legacy = localStorage.getItem('lexiread_dict');
          if (legacy) {
            try { State.dictionary = JSON.parse(legacy); }
            catch (e) { State.dictionary = {}; }
            localStorage.removeItem('lexiread_dict');
          } else {
            State.dictionary = {};
          }
          State.dictionary = stripDisabledDictionaryEntries(State.dictionary);

          // IndexedDB veio vazio — antes de assumir "sem dicionário", checa se
          // existe um backup de segurança de uma sessão anterior (ex: uma
          // gravação no IndexedDB que falhou e nunca foi confirmada).
          if (Object.keys(State.dictionary).length === 0) {
            const backup = readBackupFromLocalStorage(BACKUP_KEY_DICTIONARY);
            if (backup && Object.keys(backup).length > 0) {
              State.dictionary = stripDisabledDictionaryEntries(backup);
              showNotif(`Recuperamos ${Object.keys(State.dictionary).length} palavra(s) de uma cópia de segurança local.`, 4500);
            }
          }
          await saveDictionary();
        }
      } catch (e) {
        console.error('Erro ao carregar dicionário do IndexedDB:', e);
        // IndexedDB indisponível/corrompido: tenta recuperar do backup em
        // localStorage antes de desistir e mostrar o dicionário vazio.
        const backup = readBackupFromLocalStorage(BACKUP_KEY_DICTIONARY);
        if (backup && Object.keys(backup).length > 0) {
          State.dictionary = stripDisabledDictionaryEntries(backup);
          showNotif(`Erro ao carregar dicionário do IndexedDB. Recuperamos ${Object.keys(State.dictionary).length} palavra(s) de uma cópia de segurança local.`, 5000);
        } else {
          showNotif('Erro ao carregar dicionário. Usando padrão.');
          State.dictionary = {};
        }
      }
      updateDictStats();
    }

    async function loadSuffixDictionary() {
      try {
        const rec = await idbGet('kv', 'suffixDict');
        if (rec) {
          State.suffixDict = rec.value;
          mirrorBackupToLocalStorage(BACKUP_KEY_SUFFIXDICT, rec.value);
        } else {
          const legacy = localStorage.getItem('lexiread_suffix_dict');
          if (legacy) {
            try { State.suffixDict = JSON.parse(legacy); }
            catch (e) { State.suffixDict = { ...DEFAULT_SUFFIX_DICT }; }
            localStorage.removeItem('lexiread_suffix_dict');
          } else {
            State.suffixDict = { ...DEFAULT_SUFFIX_DICT };
          }
          await saveSuffixDictionary();
        }
      } catch (e) {
        console.error('Erro ao carregar dicionário de sufixos do IndexedDB:', e);
        const backup = readBackupFromLocalStorage(BACKUP_KEY_SUFFIXDICT);
        State.suffixDict = backup && Object.keys(backup).length > 0 ? backup : { ...DEFAULT_SUFFIX_DICT };
        if (backup) showNotif('Erro ao carregar sufixos do IndexedDB. Recuperamos de uma cópia de segurança local.', 5000);
      }
      updateSuffixStats();
    }

    async function saveDictionary() {
      const toSave = stripDisabledDictionaryEntries(State.dictionary);
      try {
        await idbSet('kv', { key: 'dictionary', value: toSave });
        mirrorBackupToLocalStorage(BACKUP_KEY_DICTIONARY, toSave);
      } catch (e) {
        // idbSet já tentou 3x e já avisou o usuário; ainda assim garantimos uma
        // cópia em localStorage pra não perder a alteração enquanto o retry
        // automático (flushFailedWrites) tenta de novo em segundo plano.
        console.error('Erro ao salvar dicionário no IndexedDB (após retries):', e);
        mirrorBackupToLocalStorage(BACKUP_KEY_DICTIONARY, toSave);
      }
      updateDictStats();
      document.getElementById('stat-words').textContent = Object.keys(State.dictionary).length;
    }

    async function saveSuffixDictionary() {
      try {
        await idbSet('kv', { key: 'suffixDict', value: State.suffixDict });
        mirrorBackupToLocalStorage(BACKUP_KEY_SUFFIXDICT, State.suffixDict);
      } catch (e) {
        console.error('Erro ao salvar dicionário de sufixos no IndexedDB (após retries):', e);
        mirrorBackupToLocalStorage(BACKUP_KEY_SUFFIXDICT, State.suffixDict);
      }
      updateSuffixStats();
    }

    function updateDictStats() {
      const keys = Object.keys(State.dictionary);
      const withExamples = keys.filter(k => State.dictionary[k].examples && State.dictionary[k].examples.length > 0);
      const totalExamples = keys.reduce((s, k) => s + (State.dictionary[k].examples?.length || 0), 0);
      document.getElementById('stat-words').textContent = keys.length;
      document.getElementById('dict-stats').innerHTML = `
    Total de palavras: ${keys.length}<br>
    Com exemplos: ${withExamples.length}<br>
    Total de exemplos: ${totalExamples}
  `;
    }

    function updateSuffixStats() {
      const keys = Object.keys(State.suffixDict).sort();
      const totalExamples = keys.reduce((sum, key) => sum + (State.suffixDict[key].examples?.length || 0), 0);
      const countEl = document.getElementById('suffix-count');
      if (countEl) {
        countEl.textContent = `${keys.length} sufixo${keys.length !== 1 ? 's' : ''}`;
      }
      const statsEl = document.getElementById('dict-stats');
      if (statsEl) {
        const dictKeys = Object.keys(State.dictionary);
        const withExamples = dictKeys.filter(k => State.dictionary[k].examples && State.dictionary[k].examples.length > 0);
        const dictExamples = dictKeys.reduce((s, k) => s + (State.dictionary[k].examples?.length || 0), 0);
        statsEl.innerHTML = `
    Total de palavras: ${dictKeys.length}<br>
    Com exemplos: ${withExamples.length}<br>
    Total de exemplos: ${dictExamples}<br>
    Sufixos cadastrados: ${keys.length}<br>
    Exemplos de sufixos: ${totalExamples}
  `;
      }
    }


    async function saveVisualConfig() {
      try {
        await idbSet('kv', { key: 'visualConfig', value: State.visualConfig });
      } catch (e) {
        console.error('Erro ao salvar configuração visual:', e);
      }
    }

    async function loadVisualConfig() {
      try {
        const rec = await idbGet('kv', 'visualConfig');
        if (rec) {
          State.visualConfig = rec.value;
        } else {
          const legacy = localStorage.getItem('lexiread-visual-config');
          if (legacy) {
            try { State.visualConfig = JSON.parse(legacy); } catch (e) { /* mantém padrão */ }
            localStorage.removeItem('lexiread-visual-config');
            await saveVisualConfig();
          }
        }
        applyVisualConfig();
      } catch (e) {
        console.warn('Erro ao carregar configuração visual:', e);
      }
    }


    // ═══════════════════════════════════════════════════════════
    // DADOS DE PRÁTICA (repetição espaçada, estilo Leitner)
    // Estrutura: { [word]: { box, timesSeen, timesCorrect, lastReviewed, nextReview } }
    // ═══════════════════════════════════════════════════════════
    async function loadPracticeData() {
      try {
        const rec = await idbGet('kv', 'practiceData');
        State.practiceData = rec ? (rec.value || {}) : {};
      } catch (e) {
        console.warn('Erro ao carregar dados de prática:', e);
        State.practiceData = {};
      }
    }

    async function savePracticeData() {
      try {
        await idbSet('kv', { key: 'practiceData', value: State.practiceData });
      } catch (e) {
        console.error('Erro ao salvar dados de prática:', e);
        showNotif('Erro ao salvar progresso da prática.');
      }
    }

    // ═══════════════════════════════════════════════════════════
    // RECENTES
    // ═══════════════════════════════════════════════════════════
    const MAX_RECENTS = 5;

    async function getRecents() {
      try {
        const all = await idbGetAll('recents');
        return all.sort((a, b) => b.date - a.date);
      } catch (e) {
        console.error('Erro ao ler recentes do IndexedDB:', e);
        return [];
      }
    }

    // Registra o arquivo (com seu blob) na lista de recentes, permitindo reabertura
    // real com um clique, e mantém apenas os MAX_RECENTS mais novos.
    async function saveRecent(file) {
      try {
        const existing = await idbGet('recents', file.name);
        await idbSet('recents', {
          name: file.name,
          date: Date.now(),
          size: file.size,
          blob: file,
          lastPage: existing?.lastPage || 1,
        });
        const all = await getRecents();
        const toRemove = all.slice(MAX_RECENTS);
        for (const r of toRemove) await idbDelete('recents', r.name);
      } catch (e) {
        console.error('Erro ao salvar recente no IndexedDB:', e);
        showNotif('Não foi possível salvar o arquivo em Recentes (espaço insuficiente?).');
      }
    }

    async function renderRecents() {
      const recents = await getRecents();
      const section = document.getElementById('recent-section');
      const list = document.getElementById('recent-list');
      if (recents.length === 0) {
        section.style.display = 'none';
        return;
      }
      section.style.display = 'block';
      list.innerHTML = recents.map(r => {
        const d = new Date(r.date);
        return `
      <div class="recent-item" onclick="openRecentFile('${r.name.replace(/'/g, "\\'")}')" title="Clique para reabrir este PDF">
        <span>📄</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.name)}</span>
        <span style="font-size:0.7rem;color:var(--ink3)">${d.toLocaleDateString('pt-BR')}</span>
      </div>
    `;
      }).join('');
    }

    // Reabre um PDF já visto anteriormente, direto do Blob salvo no IndexedDB —
    // sem precisar que o usuário selecione o arquivo de novo.
    async function openRecentFile(name) {
      showLoading('Reabrindo arquivo…');
      try {
        const rec = await idbGet('recents', name);
        if (!rec || !rec.blob) {
          hideLoading();
          showNotif('Arquivo não encontrado em cache. Selecione-o novamente.');
          document.getElementById('file-input').click();
          return;
        }
        const file = new File([rec.blob], rec.name, { type: 'application/pdf' });
        await loadPDF(file);
      } catch (e) {
        hideLoading();
        console.error(e);
        showNotif('Erro ao reabrir arquivo: ' + e.message);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // RASCUNHOS DE FORMULÁRIO (palavra / sufixo em edição)
    //
    // Diferente do dicionário em si (só é gravado no IndexedDB ao clicar em
    // "Salvar"), o rascunho é o que está no FORMULÁRIO, ainda não confirmado.
    // Gravamos em localStorage (síncrono, sem esperar promise) com debounce a
    // cada alteração, para sobreviver a um fechamento abrupto da aba/crash —
    // cenário em que nem o beforeunload nem uma gravação assíncrona no
    // IndexedDB têm garantia de terminar a tempo.
    // ═══════════════════════════════════════════════════════════
    const DICT_DRAFT_KEY = 'lexiread_dict_entry_draft';
    const SUFFIX_DRAFT_KEY = 'lexiread_suffix_entry_draft';
    const DRAFT_SAVE_DEBOUNCE_MS = 600;

    function saveDictEntryDraftNow() {
      try {
        const word = document.getElementById('edit-word')?.value?.trim() || '';
        const description = document.getElementById('edit-word-description')?.value || '';
        const translations = [...(State.editTranslations || [])];
        const examples = (State.editExamples || []).map(e => ({ ...e }));
        const isEmpty = !word && translations.length === 0 && !description &&
          examples.every(e => !e.original && !e.translated);
        if (isEmpty) {
          localStorage.removeItem(DICT_DRAFT_KEY);
        } else {
          localStorage.setItem(DICT_DRAFT_KEY, JSON.stringify({
            word, translations, examples, description, savedAt: Date.now(),
          }));
        }
      } catch (e) {
        console.warn('Não foi possível salvar o rascunho da palavra em edição:', e);
      }
    }

    // Chamado a cada alteração no formulário de palavra: marca "sujo" na hora
    // (pro aviso de fechar a aba já valer imediatamente) e agenda a gravação
    // do rascunho em si com debounce (pra não escrever no localStorage a cada
    // tecla digitada).
    function scheduleDictEntryDraftSave() {
      State.dirty.dictEntry = true;
      if (typeof updateDirtyIndicator === 'function') updateDirtyIndicator();
      clearTimeout(State.dictDraftTimer);
      State.dictDraftTimer = setTimeout(saveDictEntryDraftNow, DRAFT_SAVE_DEBOUNCE_MS);
    }

    function loadDictEntryDraft() {
      try {
        const raw = localStorage.getItem(DICT_DRAFT_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    function clearDictEntryDraft() {
      localStorage.removeItem(DICT_DRAFT_KEY);
      clearTimeout(State.dictDraftTimer);
      State.dirty.dictEntry = false;
      if (typeof updateDirtyIndicator === 'function') updateDirtyIndicator();
    }

    function saveSuffixEntryDraftNow() {
      try {
        const suffix = document.getElementById('suffix-key')?.value?.trim() || '';
        const type = document.getElementById('suffix-type')?.value || '';
        const meaning = document.getElementById('suffix-meaning')?.value || '';
        const examples = [...(State.editSuffixExamples || [])];
        const isEmpty = !suffix && !type && !meaning && examples.length === 0;
        if (isEmpty) {
          localStorage.removeItem(SUFFIX_DRAFT_KEY);
        } else {
          localStorage.setItem(SUFFIX_DRAFT_KEY, JSON.stringify({
            suffix, type, meaning, examples, savedAt: Date.now(),
          }));
        }
      } catch (e) {
        console.warn('Não foi possível salvar o rascunho do sufixo em edição:', e);
      }
    }

    function scheduleSuffixEntryDraftSave() {
      State.dirty.suffixEntry = true;
      if (typeof updateDirtyIndicator === 'function') updateDirtyIndicator();
      clearTimeout(State.suffixDraftTimer);
      State.suffixDraftTimer = setTimeout(saveSuffixEntryDraftNow, DRAFT_SAVE_DEBOUNCE_MS);
    }

    function loadSuffixEntryDraft() {
      try {
        const raw = localStorage.getItem(SUFFIX_DRAFT_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    function clearSuffixEntryDraft() {
      localStorage.removeItem(SUFFIX_DRAFT_KEY);
      clearTimeout(State.suffixDraftTimer);
      State.dirty.suffixEntry = false;
      if (typeof updateDirtyIndicator === 'function') updateDirtyIndicator();
    }