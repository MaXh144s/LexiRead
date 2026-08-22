// DICT-EDITOR: listagem, edição (form completo) e import/export do dicionário principal. Depende de state-data.js, storage.js e word-model.js.

    // ═══════════════════════════════════════════════════════════
    // LISTA DO DICIONÁRIO
    // ═══════════════════════════════════════════════════════════
    function renderDictList(filter = '') {
      const lower = filter.toLowerCase();
      const keys = Object.keys(State.dictionary)
        .filter(k => {
          if (!filter) return true;
          if (k.includes(lower)) return true;
          return State.dictionary[k].translations?.some(t => t.toLowerCase().includes(lower));
        })
        .sort();

      document.getElementById('dict-count').textContent = `${keys.length} palavra${keys.length !== 1 ? 's' : ''}`;

      const list = document.getElementById('dict-list');
      list.innerHTML = keys.map(k => {
        const entry = State.dictionary[k];
        const trans = entry.translations?.slice(0, 3).join(', ') || '—';
        const safeKey = k.replace(/'/g, "\\'");
        return `
      <div class="dict-entry" style="position:relative;padding-right:34px;" onclick="openEditEntry('${safeKey}')">
        <div class="dict-entry-word">${k}</div>
        <div class="dict-entry-trans">${trans}</div>
        <button type="button" title="Excluir palavra"
          style="position:absolute;top:8px;right:8px;background:none;border:none;color:#dc2626;cursor:pointer;font-size:0.95rem;line-height:1;padding:2px 4px;"
          onclick="event.stopPropagation(); deleteWordFromDictionary('${safeKey}')">✕</button>
      </div>
    `;
      }).join('');
    }

    function filterDict(q) {
      renderDictList(q);
    }

    // ═══════════════════════════════════════════════════════════
    // EXCLUSÃO DE PALAVRA (com confirmação e "desfazer")
    // Excluir só remove a entrada do dicionário local — a palavra pode ser
    // adicionada de novo a qualquer momento, normalmente, como se fosse nova.
    // ═══════════════════════════════════════════════════════════
    let _lastDeletedWord = null; // { key, entry } — guardado só pra permitir "Desfazer" logo em seguida

    function deleteWordFromDictionary(word) {
      word = (word || '').trim();
      const entry = State.dictionary[word];
      if (!entry) return;

      const confirmed = confirm(`Excluir "${word}" do dicionário?\n\nIsso remove a tradução e os exemplos salvos dela. Você pode adicionar essa palavra de novo depois, se quiser.`);
      if (!confirmed) return;

      _lastDeletedWord = { key: word, entry: cloneDictionaryEntry(entry) };
      delete State.dictionary[word];
      saveDictionary();
      renderDictList(document.getElementById('dict-search')?.value || '');

      // Se a palavra excluída era a que estava aberta no formulário, reflete isso ali também
      const wordInput = document.getElementById('edit-word');
      if (wordInput && wordInput.value.trim() === word) {
        toggleDeleteWordButton(word);
      }

      showUndoDeleteNotif(word);
    }

    function showUndoDeleteNotif(word) {
      const el = document.getElementById('notif');
      if (!el) return;
      el.innerHTML = `${escapeHtml(`"${word}" foi excluída do dicionário.`)} <button type="button" onclick="undoDeleteWord()" style="margin-left:10px;background:none;border:none;text-decoration:underline;cursor:pointer;color:inherit;font:inherit;padding:0;">Desfazer</button>`;
      el.style.display = 'block';
      clearTimeout(el._timeout);
      el._timeout = setTimeout(() => {
        el.style.display = 'none';
        _lastDeletedWord = null;
      }, 6000);
    }

    function undoDeleteWord() {
      if (!_lastDeletedWord) return;
      const { key, entry } = _lastDeletedWord;
      State.dictionary[key] = entry;
      saveDictionary();
      renderDictList(document.getElementById('dict-search')?.value || '');

      const wordInput = document.getElementById('edit-word');
      if (wordInput && wordInput.value.trim() === key) {
        toggleDeleteWordButton(key);
      }

      const el = document.getElementById('notif');
      if (el) { clearTimeout(el._timeout); el.style.display = 'none'; }
      _lastDeletedWord = null;
      showNotif(`"${key}" restaurada no dicionário.`);
    }

    // Mostra o botão "Excluir do dicionário" no formulário só quando a palavra
    // já existe de fato no dicionário (não faz sentido excluir algo ainda não salvo).
    function toggleDeleteWordButton(word) {
      const btn = document.getElementById('btn-delete-word');
      if (!btn) return;
      btn.style.display = State.dictionary[(word || '').trim()] ? 'inline-block' : 'none';
    }

    function setEditSectionCollapsed(sectionId, collapsed) {
      const section = document.getElementById(sectionId);
      if (!section) return;

      const toggle = section.querySelector('.collapsible-toggle');
      section.classList.toggle('collapsed', collapsed);
      if (toggle) {
        toggle.textContent = collapsed ? '+' : '-';
        toggle.setAttribute('aria-expanded', String(!collapsed));
      }
    }

    function resetEditSections() {
      setEditSectionCollapsed('section-structure', true);
      setEditSectionCollapsed('section-pronunciation', true);
    }

    function toggleEditSection(sectionId) {
      const section = document.getElementById(sectionId);
      if (!section) return;
      setEditSectionCollapsed(sectionId, !section.classList.contains('collapsed'));
    }


    // ═══════════════════════════════════════════════════════════
    // ROBUSTEZ — rascunho autosalvo + confirmação antes de descartar
    // alterações não salvas ao trocar de palavra no formulário.
    // ═══════════════════════════════════════════════════════════
    let _dictDraftListenersAttached = false;
    function ensureDictEntryDraftListeners() {
      if (_dictDraftListenersAttached) return;
      _dictDraftListenersAttached = true;
      const wordInput = document.getElementById('edit-word');
      if (wordInput) wordInput.addEventListener('input', scheduleDictEntryDraftSave);
      const descInput = document.getElementById('edit-word-description');
      if (descInput) descInput.addEventListener('input', scheduleDictEntryDraftSave);
    }

    // Se o formulário atual tem alterações não salvas de OUTRA palavra,
    // pergunta antes de sobrescrever (o rascunho continua salvo mesmo se o
    // usuário escolher descartar — só sai da visão do formulário).
    function confirmDiscardDictEntryIfDirty(nextWord) {
      if (!State.dirty.dictEntry) return true;
      const currentWord = (document.getElementById('edit-word')?.value || '').trim();
      if (currentWord === (nextWord || '').trim()) return true;
      const label = currentWord || '(sem nome)';
      return confirm(`Você tem alterações não salvas em "${label}". Elas continuam guardadas como rascunho, mas para editar outra palavra agora é preciso sair deste formulário. Continuar mesmo assim?`);
    }

    function restoreDictEntryDraftPrompt() {
      const draft = typeof loadDictEntryDraft === 'function' ? loadDictEntryDraft() : null;
      if (!draft) return;
      const label = draft.word || '(palavra sem nome)';
      const when = draft.savedAt ? new Date(draft.savedAt).toLocaleString('pt-BR') : '';
      const restore = confirm(`Encontramos um rascunho não salvo de "${label}"${when ? ' (' + when + ')' : ''}, provavelmente de uma aba fechada antes de clicar em Salvar. Deseja restaurá-lo agora para revisar e salvar?`);
      if (!restore) {
        clearDictEntryDraft();
        return;
      }
      const sidebar = document.getElementById('sidebar');
      if (!sidebar.classList.contains('open')) toggleSidebar();
      switchTab('edit');
      setTimeout(() => {
        ensureDictEntryDraftListeners();
        const wordInput = document.getElementById('edit-word');
        if (wordInput) wordInput.value = draft.word || '';
        State.editTranslations = [...(draft.translations || [])];
        State.editExamples = (draft.examples || []).map(e => ({ ...e }));
        renderTransTags();
        renderExamples();
        resetEditSections();
        const descInput = document.getElementById('edit-word-description');
        if (descInput) descInput.value = draft.description || '';
        document.getElementById('save-success').style.display = 'none';
        State.dirty.dictEntry = true;
        if (typeof updateDirtyIndicator === 'function') updateDirtyIndicator();
        showNotif('Rascunho restaurado — revise e clique em Salvar.', 4000);
      }, 100);
    }

    // ═══════════════════════════════════════════════════════════
    // EDIÇÃO DE ENTRADA
    // ═══════════════════════════════════════════════════════════
    function openEditEntry(word) {
      if (!confirmDiscardDictEntryIfDirty(word)) return;

      // Abrir sidebar se fechada
      const sidebar = document.getElementById('sidebar');
      if (!sidebar.classList.contains('open')) {
        toggleSidebar();
      }

      // Ativar aba de edição
      switchTab('edit');

      // Escrever a palavra no input e carregar o form
      // Tudo dentro de setTimeout para garantir que o painel está visível no DOM
      setTimeout(() => {
        const wordInput = document.getElementById('edit-word');
        if (wordInput) {
          wordInput.value = word || '';
          wordInput.dispatchEvent(new Event('input')); // garante reatividade se houver listener
        }

        const entry = State.dictionary[word] || { translations: [], examples: [] };
        State.editTranslations = [...(entry.translations || [])];
        State.editExamples = (entry.examples || []).map(e => ({ ...e }));
        renderTransTags();
        renderExamples();
        resetEditSections();

        const descInput = document.getElementById('edit-word-description');
        if (descInput) descInput.value = entry.description || '';

        document.getElementById('save-success').style.display = 'none';

        const panel = document.getElementById('tab-edit');
        if (panel) panel.scrollTop = 0;

        const transInput = document.getElementById('trans-tag-input');
        if (transInput) transInput.focus();

        // Inicializar controles de pronúncia
        if (typeof initPronunciationControls === 'function') {
          initPronunciationControls(word);
        }

        ensureDictEntryDraftListeners();
        toggleDeleteWordButton(word);
        // Reabrir uma entrada existente não é "sujar" o formulário — isso só
        // acontece quando o usuário de fato altera algo a partir daqui.
        State.dirty.dictEntry = false;
        if (typeof updateDirtyIndicator === 'function') updateDirtyIndicator();
      }, 80);
    }

    function openEditForWord() {
      // Ler a palavra do tt-word ANTES de esconder o tooltip
      // (hideTooltip zera State.currentWord, por isso lemos aqui primeiro)
      const word = document.getElementById('tt-word').textContent.trim();
      if (!word || word === '—') return;

      hideTooltip();
      openEditEntry(word);
    }

    // ═══════════════════════════════════════════════════════════


    function loadEditForm(word) {
      // Chamado pela lista do dicionário (não pelo tooltip)
      // openEditEntry já cuida do fluxo do tooltip
      if (!confirmDiscardDictEntryIfDirty(word)) return;

      const wordInput = document.getElementById('edit-word');
      if (wordInput) wordInput.value = word || '';

      const entry = State.dictionary[word] || { translations: [], examples: [] };
      State.editTranslations = [...(entry.translations || [])];
      State.editExamples = (entry.examples || []).map(e => ({ ...e }));
      renderTransTags();
      renderExamples();
      resetEditSections();

      const descInput = document.getElementById('edit-word-description');
      if (descInput) descInput.value = entry.description || '';

      document.getElementById('save-success').style.display = 'none';
      ensureDictEntryDraftListeners();
      toggleDeleteWordButton(word);
      State.dirty.dictEntry = false;
      if (typeof updateDirtyIndicator === 'function') updateDirtyIndicator();
    }

    function clearEditForm() {
      document.getElementById('edit-word').value = '';
      State.editTranslations = [];
      State.editExamples = [];
      renderTransTags();
      renderExamples();
      resetEditSections();
      const descInput = document.getElementById('edit-word-description');
      if (descInput) descInput.value = '';
      document.getElementById('save-success').style.display = 'none';
      toggleDeleteWordButton('');
      // Limpar o formulário é uma decisão explícita de descartar — some com o rascunho também.
      if (typeof clearDictEntryDraft === 'function') clearDictEntryDraft();
    }

    function renderTransTags() {
      const wrap = document.getElementById('trans-tags-wrap');
      const input = document.getElementById('trans-tag-input');
      wrap.innerHTML = '';
      State.editTranslations.forEach((t, i) => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.innerHTML = `${t} <span class="tag-remove" onclick="removeTranslation(${i})">×</span>`;
        wrap.appendChild(pill);
      });
      wrap.appendChild(input);
    }

    function removeTranslation(idx) {
      State.editTranslations.splice(idx, 1);
      renderTransTags();
      scheduleDictEntryDraftSave();
    }

    function addTranslationTokens(rawValue) {
      const tokens = String(rawValue || '')
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      if (!tokens.length) return;

      State.editTranslations.push(...tokens);
      renderTransTags();
      scheduleDictEntryDraftSave();
    }

    function handleTagInput(e, type) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = e.target.value.trim();
        if (val && type === 'translations') {
          addTranslationTokens(val);
          document.getElementById('trans-tag-input').value = '';
        }
      }
    }

    function renderExamples() {
      const list = document.getElementById('examples-list');
      list.innerHTML = State.editExamples.map((ex, i) => `
    <div class="example-item">
      <button class="example-remove" onclick="removeExample(${i})">×</button>
      <input class="form-input" placeholder="Frase em inglês" value="${(ex.original || '').replace(/"/g, '&quot;')}"
        oninput="State.editExamples[${i}].original = this.value; scheduleDictEntryDraftSave();">
      <input class="form-input" placeholder="Tradução da frase" value="${(ex.translated || '').replace(/"/g, '&quot;')}"
        oninput="State.editExamples[${i}].translated = this.value; scheduleDictEntryDraftSave();" style="margin-top:4px">
    </div>
  `).join('');
    }

    function addExampleField() {
      State.editExamples.push({ original: '', translated: '' });
      renderExamples();
      scheduleDictEntryDraftSave();
    }

    function removeExample(idx) {
      State.editExamples.splice(idx, 1);
      renderExamples();
      scheduleDictEntryDraftSave();
    }

    function saveEntry() {
      // Flush tag input
      const tagInput = document.getElementById('trans-tag-input');
      if (tagInput.value.trim()) {
        addTranslationTokens(tagInput.value.trim());
        tagInput.value = '';
      }

      const word = document.getElementById('edit-word').value.trim().toLowerCase();
      if (!word) {
        showNotif('Digite uma palavra!');
        return;
      }

      const descriptionInput = document.getElementById('edit-word-description');
      const description = descriptionInput ? descriptionInput.value.trim() : '';

      // Preserva outros campos existentes na entrada (ex: primitiveWord, suffix,
      // variationType da fieldset de Estrutura Linguística) em vez de sobrescrever
      // o objeto inteiro — só translations/examples/description são geridos por este form.
      const existing = State.dictionary[word] || {};

      State.dictionary[word] = {
        ...existing,
        translations: [...State.editTranslations],
        examples: State.editExamples.filter(e => e.original),
      };

      if (description) {
        State.dictionary[word].description = description;
      } else {
        delete State.dictionary[word].description;
      }

      saveDictionary();

      // Re-ativar páginas ativas para refletir nova entrada
      const activeCopy = new Set(State.activePages);
      activeCopy.forEach(p => {
        deactivatePage(p);
      });
      activeCopy.forEach(p => {
        activatePage(p);
      });

      renderDictList();

      const msg = document.getElementById('save-success');
      msg.style.display = 'block';
      setTimeout(() => msg.style.display = 'none', 2000);

      showNotif(`"${word}" salvo no dicionário!`);

      // Agora a palavra existe de fato no dicionário — o botão de excluir passa a fazer sentido.
      toggleDeleteWordButton(word);

      // Salvou de verdade — o rascunho local (backup do formulário) não é mais necessário.
      if (typeof clearDictEntryDraft === 'function') clearDictEntryDraft();
    }

    function exportDict() {
      const blob = new Blob([JSON.stringify(State.dictionary, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lexiread-dictionary.json';
      a.click();
      URL.revokeObjectURL(url);
      showNotif('Dicionário exportado!');
    }

    function getSelectedImportMode() {
      const selected = document.querySelector('input[name="import-mode"]:checked');
      return selected ? selected.value : 'merge';
    }

    function getDescriptionPolicy() {
      const selected = document.querySelector('input[name="description-policy"]:checked');
      return selected ? selected.value : 'keep-local';
    }

    function normalizeTranslations(translations = []) {
      return Array.isArray(translations)
        ? translations
            .map(t => String(t).trim().toLowerCase())
            .filter(Boolean)
        : [];
    }

    function mergeUniqueTranslations(existing = [], incoming = []) {
      const merged = new Set(normalizeTranslations(existing));
      normalizeTranslations(incoming).forEach(t => merged.add(t));
      return Array.from(merged);
    }

    function mergeExamples(existing = [], incoming = []) {
      const result = Array.isArray(existing) ? existing.map(ex => ({ original: String(ex.original || '').trim(), translated: String(ex.translated || '').trim() })).filter(ex => ex.original || ex.translated) : [];
      const seen = new Set(result.map(ex => `${ex.original}:::${ex.translated}`));
      if (Array.isArray(incoming)) {
        incoming.forEach(ex => {
          const original = String(ex.original || '').trim();
          const translated = String(ex.translated || '').trim();
          if (!original && !translated) return;
          const key = `${original}:::${translated}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push({ original, translated });
          }
        });
      }
      return result;
    }

    function chooseDescription(existingDesc, importedDesc) {
      const policy = getDescriptionPolicy();
      const current = String(existingDesc || '').trim();
      const incoming = String(importedDesc || '').trim();
      if (!current && !incoming) return '';
      if (!current) return incoming;
      if (!incoming) return current;
      return policy === 'use-import' ? incoming : current;
    }

    function importDict(input) {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data || typeof data !== 'object') {
            showNotif('Erro ao importar: arquivo JSON inválido.');
            return;
          }

          const importMode = getSelectedImportMode();
          const isOverwrite = importMode === 'overwrite';
          const mergedDictionary = isOverwrite ? {} : { ...State.dictionary };

          Object.keys(data).forEach(rawKey => {
            const key = String(rawKey || '').trim().toLowerCase();
            if (!key) return;
            const incoming = data[rawKey] || {};
            const incomingTranslations = normalizeTranslations(incoming.translations);
            const incomingExamples = Array.isArray(incoming.examples) ? incoming.examples : [];
            const incomingDescription = String(incoming.description || '').trim();

            if (isOverwrite || !mergedDictionary[key]) {
              mergedDictionary[key] = {
                ...incoming,
                translations: normalizeTranslations(incomingTranslations),
                examples: mergeExamples([], incomingExamples),
              };
              if (!incomingDescription) {
                delete mergedDictionary[key].description;
              } else {
                mergedDictionary[key].description = incomingDescription;
              }
              return;
            }

            const existing = mergedDictionary[key] || {};
            const mergedTranslations = mergeUniqueTranslations(existing.translations, incomingTranslations);
            const mergedExamples = mergeExamples(existing.examples, incomingExamples);
            const chosenDescription = chooseDescription(existing.description, incomingDescription);

            mergedDictionary[key] = {
              ...existing,
              ...incoming,
              translations: mergedTranslations,
              examples: mergedExamples,
            };
            if (chosenDescription) {
              mergedDictionary[key].description = chosenDescription;
            } else {
              delete mergedDictionary[key].description;
            }
          });

          State.dictionary = mergedDictionary;
          saveDictionary();
          renderDictList();
          showNotif('Dicionário importado com sucesso!');
          const activeCopy = new Set(State.activePages);
          activeCopy.forEach(p => { deactivatePage(p); activatePage(p); });
        } catch (err) {
          showNotif('Erro ao importar: arquivo JSON inválido.');
        }
      };
      reader.readAsText(file);
    }

    function clearDictionary() {
      const confirmed = confirm('Tem certeza que deseja apagar o dicionário local? Isso removerá todas as traduções e exemplos salvos.');
      if (!confirmed) return;

      State.dictionary = {};
      saveDictionary();
      renderDictList();

      const activeCopy = new Set(State.activePages);
      activeCopy.forEach(p => { deactivatePage(p); activatePage(p); });
      showNotif('Dicionário local apagado.');
    }