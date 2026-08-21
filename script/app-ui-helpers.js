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
        ]);
      } catch (e) {
        console.error('Erro na inicialização do armazenamento:', e);
      }

      await renderRecents();

      // Stats iniciais
      document.getElementById('stat-words').textContent = Object.keys(State.dictionary).length;
    });