// SIDEBAR-VISUAL-PANEL: sidebar de abas e painel de personalização visual (sublinhados). Depende de state-data.js e storage.js.

    // SIDEBAR
    // ═══════════════════════════════════════════════════════════
    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const btn = document.getElementById('btn-dict');
      const isOpen = sidebar.classList.toggle('open');
      btn.classList.toggle('active', isOpen);
      if (isOpen) {
        renderDictList();
        updateDictStats();
        renderSuffixList();
        if (typeof resetEditSections === 'function') {
          resetEditSections();
        }
      }
    }

    function switchTab(tab) {
      document.querySelectorAll('.stab').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
      });
      document.querySelectorAll('.stab-panel').forEach(el => {
        el.classList.toggle('active', el.id === 'tab-' + tab);
      });
      if (tab === 'edit' && typeof resetEditSections === 'function') {
        resetEditSections();
      }
      if (tab === 'list') renderDictList();
      if (tab === 'suffixes') renderSuffixList();
    }

    // ═══════════════════════════════════════════════════════════
    // GERENCIAMENTO DO PAINEL DE PERSONALIZAÇÃO VISUAL
    // ═══════════════════════════════════════════════════════════

    function toggleVisualPanel() {
      const panel = document.getElementById('visual-panel');
      const btn = document.getElementById('btn-visual');
      const isOpen = panel.classList.toggle('open');
      btn.classList.toggle('active', isOpen);
      if (isOpen) {
        syncVisualConfigUI();
      }
    }

    function updateVisualConfig(section, property, value) {
      if (!State.visualConfig[section]) {
        State.visualConfig[section] = {};
      }
      State.visualConfig[section][property] = value;
      applyVisualConfig();
      saveVisualConfig();
      syncVisualConfigUI();
    }

    function normalizeVisualConfig() {
      const defaults = {
        word: {
          color: '#c2410c',
          thickness: '2px',
          opacity: 1,
          style: 'dashed',
          offset: '1px'
        },
        suffixState: {
          color: '#16a34a',
          thickness: '1.5px',
          opacity: 0.75,
          style: 'dashed',
          offset: '1px',
          useWordOffset: true
        },
        suffixDerivative: {
          color: '#2563eb',
          thickness: '1.5px',
          opacity: 0.75,
          style: 'dashed',
          offset: '1px',
          useWordOffset: true
        },
        suffix: {
          visible: true
        },
        extra: {
          color: '#16a34a',
          thickness: '1.5px',
          opacity: 0.75,
          style: 'dashed'
        },
        shortcuts: {
          openSearch: 'Ctrl+K',
          openPdfSearch: 'Ctrl+F',
          toggleSidebar: 'Ctrl+Alt+D',
          toggleVisualPanel: 'Ctrl+Alt+P'
        }
      };

      if (!State.visualConfig) {
        State.visualConfig = {};
      }

      for (const key of Object.keys(defaults)) {
        State.visualConfig[key] = {
          ...defaults[key],
          ...State.visualConfig[key]
        };
      }
    }

    function syncVisualConfigUI() {
      normalizeVisualConfig();
      // Sincroniza os valores do formulário com State
      const cfg = State.visualConfig;

      // Word config
      document.getElementById('vc-word-color').value = cfg.word.color;
      document.getElementById('vc-word-thickness').value = cfg.word.thickness;
      document.getElementById('vc-word-style').value = cfg.word.style;
      document.getElementById('vc-word-opacity').value = (cfg.word.opacity || 1) * 100;
      document.getElementById('vc-word-opacity-val').textContent = Math.round((cfg.word.opacity || 1) * 100) + '%';
      const wordOffsetValue = parseFloat(cfg.word.offset) || 0;
      document.getElementById('vc-word-offset-val').textContent = cfg.word.offset || '0px';
      document.getElementById('vc-word-offset').value = wordOffsetValue;
      document.getElementById('vc-suffix-visible').checked = cfg.suffix?.visible !== false;

      // Suffix state config
      document.getElementById('vc-suffix-state-color').value = cfg.suffixState.color;
      document.getElementById('vc-suffix-state-thickness').value = cfg.suffixState.thickness;
      document.getElementById('vc-suffix-state-style').value = cfg.suffixState.style;
      document.getElementById('vc-suffix-state-opacity').value = (cfg.suffixState.opacity || 0.75) * 100;
      document.getElementById('vc-suffix-state-opacity-val').textContent = Math.round((cfg.suffixState.opacity || 0.75) * 100) + '%';
      document.getElementById('vc-suffix-state-use-word-offset').checked = !!cfg.suffixState.useWordOffset;
      const stateOffsetValue = cfg.suffixState.useWordOffset ? (cfg.word.offset || '0px') : cfg.suffixState.offset;
      document.getElementById('vc-suffix-state-offset-val').textContent = stateOffsetValue;
      document.getElementById('vc-suffix-state-offset').value = cfg.suffixState.useWordOffset ? (parseFloat(cfg.word.offset) || 0) : (parseFloat(cfg.suffixState.offset) || 0);
      document.getElementById('vc-suffix-state-offset').disabled = !!cfg.suffixState.useWordOffset;

      // Suffix derivative config
      document.getElementById('vc-suffix-derivative-color').value = cfg.suffixDerivative.color;
      document.getElementById('vc-suffix-derivative-thickness').value = cfg.suffixDerivative.thickness;
      document.getElementById('vc-suffix-derivative-style').value = cfg.suffixDerivative.style;
      document.getElementById('vc-suffix-derivative-opacity').value = (cfg.suffixDerivative.opacity || 0.75) * 100;
      document.getElementById('vc-suffix-derivative-opacity-val').textContent = Math.round((cfg.suffixDerivative.opacity || 0.75) * 100) + '%';
      document.getElementById('vc-suffix-derivative-use-word-offset').checked = !!cfg.suffixDerivative.useWordOffset;
      const derivativeOffsetValue = cfg.suffixDerivative.useWordOffset ? (cfg.word.offset || '0px') : cfg.suffixDerivative.offset;
      document.getElementById('vc-suffix-derivative-offset-val').textContent = derivativeOffsetValue;
      document.getElementById('vc-suffix-derivative-offset').value = cfg.suffixDerivative.useWordOffset ? (parseFloat(cfg.word.offset) || 0) : (parseFloat(cfg.suffixDerivative.offset) || 0);
      document.getElementById('vc-suffix-derivative-offset').disabled = !!cfg.suffixDerivative.useWordOffset;

      // Extra letter config
      document.getElementById('vc-extra-color').value = cfg.extra.color;
      document.getElementById('vc-extra-thickness').value = cfg.extra.thickness;
      document.getElementById('vc-extra-style').value = cfg.extra.style;
      document.getElementById('vc-extra-opacity').value = (cfg.extra.opacity || 0.75) * 100;
      document.getElementById('vc-extra-opacity-val').textContent = Math.round((cfg.extra.opacity || 0.75) * 100) + '%';

      document.getElementById('vc-shortcut-open-search').value = cfg.shortcuts.openSearch;
      document.getElementById('vc-shortcut-open-pdf-search').value = cfg.shortcuts.openPdfSearch;
      document.getElementById('vc-shortcut-toggle-sidebar').value = cfg.shortcuts.toggleSidebar;
      document.getElementById('vc-shortcut-toggle-visual').value = cfg.shortcuts.toggleVisualPanel;
    }

    function applyVisualConfig() {
      normalizeVisualConfig();
      const cfg = State.visualConfig;
      const style = document.createElement('style');
      style.id = 'dynamic-visual-style';

      // Remove estilo anterior se existir
      const old = document.getElementById('dynamic-visual-style');
      if (old) old.remove();

      const suffixVisible = cfg.suffix?.visible !== false;
      const suffixStateOffset = cfg.suffixState.useWordOffset ? (cfg.word.offset || '0px') : (cfg.suffixState.offset || cfg.word.offset || '0px');
      const suffixDerivativeOffset = cfg.suffixDerivative.useWordOffset ? (cfg.word.offset || '0px') : (cfg.suffixDerivative.offset || cfg.word.offset || '0px');

      // ── CSS dinâmico baseado em visualConfig ──
      const css = `
        .word-span.has-translation::after {
          border-bottom: ${cfg.word.thickness} ${cfg.word.style} ${cfg.word.color};
          opacity: ${cfg.word.opacity || 1};
          bottom: calc(-1 * (${cfg.word.offset || '0px'}));
        }

        .suffix-span {
          display: ${suffixVisible ? 'inline-block' : 'none'} !important;
          pointer-events: ${suffixVisible ? 'auto' : 'none'};
          position: relative;
          color: transparent !important;
          opacity: ${suffixVisible ? 1 : 0};
        }

        .suffix-span::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          top: 100%;
          bottom: auto;
          width: 100%;
          height: 0;
          pointer-events: none;
        }

        .suffix-state::after {
          transform: translateY(calc(${suffixStateOffset}));
          border-bottom: ${cfg.suffixState.thickness} ${cfg.suffixState.style} ${cfg.suffixState.color};
          opacity: ${cfg.suffixState.opacity || 0.75};
        }

        .suffix-derivative::after {
          bottom: calc(-1 * (${suffixDerivativeOffset}));
          border-bottom: ${cfg.suffixDerivative.thickness} ${cfg.suffixDerivative.style} ${cfg.suffixDerivative.color};
          opacity: ${cfg.suffixDerivative.opacity || 0.75};
        }

        .word-extra {
          text-decoration-color: ${cfg.extra?.color || 'rgba(21, 128, 61, 0.75)'};
          text-decoration-thickness: ${cfg.extra?.thickness || '1.5px'};
          text-decoration-style: ${cfg.extra?.style || 'dashed'};
          opacity: ${cfg.extra?.opacity || 0.75};
        }
      `;

      style.textContent = css;
      document.head.appendChild(style);
    }

    function toggleMobileMenu(forceOpen) {
      const menu = document.getElementById('mobile-actions-menu');
      const button = document.getElementById('tb-menu-toggle');
      if (!menu || !button) return;
      const isOpen = forceOpen === undefined ? !menu.classList.contains('open') : forceOpen;
      menu.classList.toggle('open', isOpen);
      menu.setAttribute('aria-hidden', String(!isOpen));
      button.classList.toggle('active', isOpen);
    }

    function captureShortcutInput(event, actionKey) {
      event.preventDefault();
      event.stopPropagation();
      const combo = [];
      if (event.ctrlKey) combo.push('Ctrl');
      if (event.metaKey) combo.push('Meta');
      if (event.altKey) combo.push('Alt');
      if (event.shiftKey) combo.push('Shift');
      const key = event.key && event.key.length === 1 ? event.key.toUpperCase() : event.key;
      if (key && !['CONTROL', 'SHIFT', 'ALT', 'META', 'TAB', 'ESCAPE', 'ENTER'].includes(key.toUpperCase())) {
        combo.push(key.length === 1 ? key.toUpperCase() : key.replace(/^Arrow/, ''));
      }
      if (combo.length === 0) return;
      const shortcut = combo.join('+');
      updateVisualConfig('shortcuts', actionKey, shortcut);
      document.getElementById(`vc-shortcut-${actionKey}`).value = shortcut;
    }

    function resetVisualConfig() {
      State.visualConfig = {
        word: {
          color: '#c2410c',
          thickness: '2px',
          opacity: 1,
          style: 'dashed',
          offset: '1px'
        },
        suffixState: {
          color: '#16a34a',
          thickness: '1.5px',
          opacity: 0.75,
          style: 'dashed',
          offset: '1px',
          useWordOffset: true
        },
        suffixDerivative: {
          color: '#2563eb',
          thickness: '1.5px',
          opacity: 0.75,
          style: 'dashed',
          offset: '1px',
          useWordOffset: true
        },
        suffix: {
          visible: true
        },
        extra: {
          color: 'rgba(21, 128, 61, 0.75)',
          thickness: '1.5px',
          opacity: 0.75,
          style: 'dashed'
        },
        shortcuts: {
          openSearch: 'Ctrl+K',
          openPdfSearch: 'Ctrl+F',
          toggleSidebar: 'Ctrl+Alt+D',
          toggleVisualPanel: 'Ctrl+Alt+P'
        }
      };
      syncVisualConfigUI();
      applyVisualConfig();
      saveVisualConfig();
      showNotification('✓ Aparência restaurada aos padrões');
    }
