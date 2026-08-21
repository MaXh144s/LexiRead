// KEYBOARD-SHORTCUTS: atalhos globais de teclado. Depende de search.js, suffix-system.js, tooltip.js e zoom-navigation.js.

    // ═══════════════════════════════════════════════════════════
    // ATALHOS DE TECLADO
    // Ctrl/Cmd+K → busca no dicionário · Ctrl/Cmd+F → busca no texto do PDF
    // ←/→, PageUp/PageDown → navegar páginas · +/- → zoom · Esc → fechar overlays
    // ═══════════════════════════════════════════════════════════
    function isTypingTarget(el) {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    function anyOverlayOpen() {
      return document.getElementById('search-modal').classList.contains('open') ||
        document.getElementById('pdf-search-modal').classList.contains('open') ||
        document.getElementById('suffix-modal').classList.contains('open');
    }

    function normalizeShortcutString(value) {
      if (!value) return null;
      const parts = value.split('+').map(p => p.trim()).filter(Boolean).map(p => {
        const lower = p.toLowerCase();
        if (lower === 'ctrl' || lower === 'control') return 'ctrl';
        if (lower === 'cmd' || lower === 'meta') return 'meta';
        if (lower === 'alt' || lower === 'option') return 'alt';
        if (lower === 'shift') return 'shift';
        if (lower.startsWith('arrow')) return lower.replace(/^arrow/, '');
        if (lower === ' ') return 'space';
        return lower;
      });

      const modifiers = ['ctrl', 'meta', 'alt', 'shift'];
      const combo = [];
      for (const mod of modifiers) {
        if (parts.includes(mod)) combo.push(mod);
      }
      const key = parts.find(p => !modifiers.includes(p));
      return key ? [...combo, key].join('+') : null;
    }

    function getShortcut(action) {
      const defaultShortcuts = {
        openSearch: 'ctrl+k',
        openPdfSearch: 'ctrl+f',
        toggleSidebar: 'ctrl+alt+d',
        toggleVisualPanel: 'ctrl+alt+p'
      };
      const raw = State.visualConfig?.shortcuts?.[action] || defaultShortcuts[action];
      return normalizeShortcutString(raw);
    }

    function getEventShortcut(e) {
      const combo = [];
      if (e.ctrlKey) combo.push('ctrl');
      if (e.metaKey) combo.push('meta');
      if (e.altKey) combo.push('alt');
      if (e.shiftKey) combo.push('shift');
      let key = e.key.toLowerCase();
      if (key.startsWith('arrow')) key = key.replace(/^arrow/, '');
      if (key === ' ') key = 'space';
      if (!['ctrl', 'meta', 'alt', 'shift'].includes(key)) {
        combo.push(key);
      }
      return combo.join('+');
    }

    function matchesShortcut(e, action) {
      const shortcut = getShortcut(action);
      if (!shortcut) return false;
      return getEventShortcut(e) === shortcut;
    }

    document.addEventListener('keydown', (e) => {
      if (matchesShortcut(e, 'openSearch')) {
        e.preventDefault();
        openSearch();
        return;
      }
      if (matchesShortcut(e, 'openPdfSearch') && State.pdf) {
        e.preventDefault();
        openPdfSearch();
        return;
      }
      if (e.key === 'Escape') {
        closeSearch();
        closePdfSearch();
        closeSuffixModal();
        hideTooltip();
        return;
      }

      if (matchesShortcut(e, 'toggleSidebar')) {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (matchesShortcut(e, 'toggleVisualPanel')) {
        e.preventDefault();
        toggleVisualPanel();
        return;
      }

      // Demais atalhos só valem com o PDF aberto, fora de campos de texto e sem overlay aberto
      if (!State.pdf || isTypingTarget(e.target) || anyOverlayOpen()) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        scrollToPage(Math.min(State.pageCount, State.currentPage + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        scrollToPage(Math.max(1, State.currentPage - 1));
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        changeScale(0.15);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        changeScale(-0.15);
      }
    });
