// APP-UI-HELPERS: helpers de UI (loading/notificação/progresso) e inicialização da aplicação (DOMContentLoaded). Deve ser o último script carregado.

    // ═══════════════════════════════════════════════════════════
    // UI HELPERS
    // ═══════════════════════════════════════════════════════════
    function showLoading(text = 'Carregando…') {
      document.getElementById('loading-overlay').style.display = 'flex';
      document.getElementById('loading-text').textContent = text;
    }

    function setLoadingText(text) {
      document.getElementById('loading-text').textContent = text;
    }

    function hideLoading() {
      document.getElementById('loading-overlay').style.display = 'none';
    }

    function showNotif(msg, duration = 2800) {
      const el = document.getElementById('notif');
      el.textContent = msg;
      el.style.display = 'block';
      clearTimeout(el._timeout);
      el._timeout = setTimeout(() => el.style.display = 'none', duration);
    }

    function updateCurrentPageUI() {
      document.getElementById('stat-page').textContent = `${State.currentPage} / ${State.pageCount}`;
      document.getElementById('page-input').value = State.currentPage;
      if (typeof refreshPageMatchStat === 'function') {
        refreshPageMatchStat(State.currentPage);
      }
      scheduleSaveLastPage();
    }

    // ═══════════════════════════════════════════════════════════
    // ROBUSTEZ DE ARMAZENAMENTO
    // Indicador visual de alterações não salvas (título da aba), aviso nativo
    // do navegador antes de fechar/recarregar enquanto houver algo pendente,
    // e retry periódico de gravações que falharam no IndexedDB.
    // Ver storage.js (hasUnsavedWork/flushFailedWrites) e dict-editor.js/
    // suffix-system.js (State.dirty.*).
    // ═══════════════════════════════════════════════════════════
    const BASE_TITLE = document.title;

    function updateDirtyIndicator() {
      const unsaved = typeof hasUnsavedWork === 'function' && hasUnsavedWork();
      document.title = unsaved ? `● ${BASE_TITLE}` : BASE_TITLE;
    }

    window.addEventListener('beforeunload', (e) => {
      if (typeof hasUnsavedWork === 'function' && hasUnsavedWork()) {
        e.preventDefault();
        e.returnValue = ''; // exigido por navegadores pra exibir o diálogo nativo
        return '';
      }
    });

    if (typeof flushFailedWrites === 'function') {
      // Retry periódico em segundo plano, e também assim que a aba volta a
      // ficar visível (ex: usuário estava em outra aba/app e voltou).
      setInterval(flushFailedWrites, 20000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') flushFailedWrites();
      });
    }

    function updateProgress() {
      const reader = document.getElementById('reader');
      reader.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = reader;
        const maxScroll = scrollHeight - clientHeight;
        let pct = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
        if (scrollTop + clientHeight >= scrollHeight - 1) {
          pct = 100;
        }
        pct = Math.min(100, Math.max(0, pct));
        document.getElementById('progress-bar').style.width = pct + '%';
      });
    }

    // ═══════════════════════════════════════════════════════════
    // INICIALIZAÇÃO
    // ═══════════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', async () => {
      setupUploadZone();
      setupZoom();
      setupPageJump();
      setupPageTracking();
      renderSuffixExampleTags();

      try {
        await Promise.all([
          loadDictionary(),
          loadSuffixDictionary(),
          loadVisualConfig(),
          loadPracticeData(),
        ]);
      } catch (e) {
        console.error('Erro na inicialização do armazenamento:', e);
      }

      await renderRecents();

      // Stats iniciais
      document.getElementById('stat-words').textContent = Object.keys(State.dictionary).length;

      // Recupera rascunhos de edição não salvos de uma sessão anterior
      // (aba fechada/crash antes de clicar em Salvar) — ver storage.js.
      if (typeof restoreDictEntryDraftPrompt === 'function') restoreDictEntryDraftPrompt();
      if (typeof restoreSuffixEntryDraftPrompt === 'function') restoreSuffixEntryDraftPrompt();
    });