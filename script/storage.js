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

    async function idbSet(store, value) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value);
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error);
      });
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
          await saveDictionary();
        }
      } catch (e) {
        console.error('Erro ao carregar dicionário do IndexedDB:', e);
        showNotif('Erro ao carregar dicionário. Usando padrão.');
        State.dictionary = {};
      }
      updateDictStats();
    }

    async function loadSuffixDictionary() {
      try {
        const rec = await idbGet('kv', 'suffixDict');
        if (rec) {
          State.suffixDict = rec.value;
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
        State.suffixDict = { ...DEFAULT_SUFFIX_DICT };
      }
      updateSuffixStats();
    }

    async function saveDictionary() {
      try {
        await idbSet('kv', { key: 'dictionary', value: stripDisabledDictionaryEntries(State.dictionary) });
      } catch (e) {
        console.error('Erro ao salvar dicionário no IndexedDB:', e);
        showNotif('Erro ao salvar dicionário.');
      }
      updateDictStats();
      document.getElementById('stat-words').textContent = Object.keys(State.dictionary).length;
    }

    async function saveSuffixDictionary() {
      try {
        await idbSet('kv', { key: 'suffixDict', value: State.suffixDict });
      } catch (e) {
        console.error('Erro ao salvar dicionário de sufixos no IndexedDB:', e);
        showNotif('Erro ao salvar sufixos.');
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