// SEARCH: busca no dicionário (Ctrl+K) e busca de texto dentro do PDF (Ctrl+F). Depende de state-data.js e pdf-loader.js.

    // BUSCA NO DICIONÁRIO (Ctrl+K)
    // ═══════════════════════════════════════════════════════════
    let searchFocusIdx = -1;

    function openSearch() {
      const modal = document.getElementById('search-modal');
      modal.classList.add('open');
      const input = document.getElementById('search-input');
      input.value = '';
      searchFocusIdx = -1;
      renderSearchResults('');
      setTimeout(() => input.focus(), 50);
    }

    function closeSearch() {
      document.getElementById('search-modal').classList.remove('open');
      searchFocusIdx = -1;
    }

    function closeSearchOnBackdrop(e) {
      if (e.target === document.getElementById('search-modal')) closeSearch();
    }

    function handleSearchInput(q) {
      searchFocusIdx = -1;
      renderSearchResults(q.trim());
    }

    function renderSearchResults(q) {
      const container = document.getElementById('search-results');
      const lower = q.toLowerCase();

      // Filtrar por palavra (key) OU por tradução
      const matches = Object.keys(State.dictionary)
        .filter(k => {
          if (!q) return true;
          if (k.includes(lower)) return true;
          const entry = State.dictionary[k];
          return entry.translations?.some(t => t.toLowerCase().includes(lower));
        })
        .sort((a, b) => {
          // Priorizar matches exatos no início da palavra
          const aStart = a.startsWith(lower) ? 0 : 1;
          const bStart = b.startsWith(lower) ? 0 : 1;
          return aStart - bStart || a.localeCompare(b);
        })
        .slice(0, 40); // limitar resultados exibidos

      if (matches.length === 0) {
        container.innerHTML = `
      <div class="search-empty">
        ${q ? `Nenhum resultado para "<strong>${escapeHtml(q)}</strong>"` : 'Digite para buscar no dicionário…'}
        ${q ? `<br><br><button class="btn-save" style="width:auto;padding:8px 20px;font-size:0.8rem" onclick="openNewWordFromSearch('${escapeHtml(q)}')">+ Adicionar "${escapeHtml(q)}"</button>` : ''}
      </div>
    `;
        return;
      }

      container.innerHTML = matches.map((k, i) => {
        const entry = State.dictionary[k];
        const trans = entry.translations?.slice(0, 4).join(', ') || '—';

        // Highlight do match na palavra
        let wordHtml = escapeHtml(k);
        if (q && k.includes(lower)) {
          const idx = k.indexOf(lower);
          wordHtml = escapeHtml(k.slice(0, idx)) +
            '<mark>' + escapeHtml(k.slice(idx, idx + lower.length)) + '</mark>' +
            escapeHtml(k.slice(idx + lower.length));
        }

        return `
      <div class="search-result-item" data-idx="${i}" data-word="${escapeHtml(k)}"
        onclick="searchEditWord('${escapeHtml(k)}')">
        <div class="sri-word">${wordHtml}</div>
        <div class="sri-trans">${escapeHtml(trans)}</div>
        <button class="sri-edit" onclick="event.stopPropagation(); searchEditWord('${escapeHtml(k)}')">✏ Editar</button>
      </div>
    `;
      }).join('');
    }

    function searchEditWord(word) {
      closeSearch();
      openEditEntry(word);
    }

    function openNewWordFromSearch(word) {
      closeSearch();
      openEditEntry(word);
    }

    function handleSearchKey(e) {
      const items = document.querySelectorAll('.search-result-item');
      if (e.key === 'Escape') { closeSearch(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        searchFocusIdx = Math.min(searchFocusIdx + 1, items.length - 1);
        updateSearchFocus(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        searchFocusIdx = Math.max(searchFocusIdx - 1, 0);
        updateSearchFocus(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (searchFocusIdx >= 0 && items[searchFocusIdx]) {
          const word = items[searchFocusIdx].dataset.word;
          if (word) searchEditWord(word);
        }
      }
    }

    function updateSearchFocus(items) {
      items.forEach((el, i) => el.classList.toggle('focused', i === searchFocusIdx));
      if (items[searchFocusIdx]) {
        items[searchFocusIdx].scrollIntoView({ block: 'nearest' });
      }
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // ═══════════════════════════════════════════════════════════
    // BUSCA DE TEXTO DENTRO DO PDF (recurso ausente no reader original —
    // diferente da busca do dicionário: procura o texto real do documento)
    // ═══════════════════════════════════════════════════════════
    let pdfSearchToken = 0; // cancela buscas antigas quando uma nova é digitada

    function openPdfSearch() {
      if (!State.pdf) return;
      const modal = document.getElementById('pdf-search-modal');
      modal.classList.add('open');
      const input = document.getElementById('pdf-search-input');
      input.value = '';
      State.pdfSearchFocusIdx = -1;
      document.getElementById('pdf-search-results').innerHTML =
        '<div class="search-empty">Digite para buscar no texto do documento…</div>';
      document.getElementById('pdf-search-status').textContent = '';
      setTimeout(() => input.focus(), 50);
    }

    function closePdfSearch() {
      document.getElementById('pdf-search-modal').classList.remove('open');
      State.pdfSearchFocusIdx = -1;
    }

    function closePdfSearchOnBackdrop(e) {
      if (e.target === document.getElementById('pdf-search-modal')) closePdfSearch();
    }

    let pdfSearchDebounce = null;
    function handlePdfSearchInput(q) {
      State.pdfSearchFocusIdx = -1;
      clearTimeout(pdfSearchDebounce);
      pdfSearchDebounce = setTimeout(() => performPdfSearch(q.trim()), 220);
    }

    // ══ FUNÇÃO: Junta textContent.items em uma string única, decidindo por
    // geometria (não por default do pdf.js) se cada fronteira entre itens
    // deve virar espaço ou concatenação direta.
    // Usa as coordenadas cruas do item.transform (espaço do PDF, sem viewport)
    // porque essa função pode rodar em páginas ainda não renderizadas durante
    // a busca — mesma ideia do merge do PASSO 2, mas em unidade PDF.
    function joinTextItemsForSearch(items) {
      let out = '';
      let prevEndX = null;
      let prevY = null;
      let prevFontSize = 1;

      items.forEach(it => {
        if (it.str === undefined) return;
        if (it.str === '') {
          // item vazio costuma sinalizar espaço/gap grande no pdf.js
          prevEndX = null;
          return;
        }

        const x = it.transform[4];
        const y = it.transform[5];
        const fontSize = Math.hypot(it.transform[0], it.transform[1]) || prevFontSize;

        if (prevEndX !== null) {
          const sameLine = prevY !== null && Math.abs(y - prevY) < prevFontSize * 0.5;
          const gap = x - prevEndX;
          // Gap pequeno (fração do tamanho da fonte) = fragmento da mesma palavra.
          // Gap maior, quebra de linha, ou item.hasEOL anterior = separador real.
          const isContinuation = sameLine && gap < prevFontSize * 0.25 && gap > -prevFontSize * 0.5;
          out += isContinuation ? it.str : (out.endsWith(' ') ? it.str : ' ' + it.str);
        } else {
          out += it.str;
        }

        prevEndX = x + it.width;
        prevY = y;
        prevFontSize = fontSize;

        if (it.hasEOL) prevEndX = null; // força espaço na próxima quebra de linha
      });

      return out;
    }

    // Extrai (e cacheia) o texto puro de uma página, sob demanda.
    async function getPageText(pageNum) {
      if (State.pdfSearchIndex.has(pageNum)) return State.pdfSearchIndex.get(pageNum);
      try {
        const entry = State.renderedPages.get(pageNum);
        let textContent = entry?.textContent;
        if (!textContent) {
          const page = entry?.page || await State.pdf.getPage(pageNum);
          // Mesma flag do activatePage() — mantém consistência do cache
          // entry.textContent (compartilhado entre as duas chamadas) e evita
          // fusão indevida de runs de texto adjacentes (ver comentário lá).
          textContent = await page.getTextContent({ disableCombineTextItems: true });
          if (entry) entry.textContent = textContent;
        }
        const text = joinTextItemsForSearch(textContent.items).replace(/\s+/g, ' ').trim();
        State.pdfSearchIndex.set(pageNum, text);
        return text;
      } catch (err) {
        console.error(`Erro ao extrair texto da página ${pageNum} para busca:`, err);
        State.pdfSearchIndex.set(pageNum, '');
        return '';
      }
    }

    async function performPdfSearch(q) {
      const myToken = ++pdfSearchToken;
      const container = document.getElementById('pdf-search-results');
      const statusEl = document.getElementById('pdf-search-status');

      if (!q) {
        container.innerHTML = '<div class="search-empty">Digite para buscar no texto do documento…</div>';
        statusEl.textContent = '';
        return;
      }

      container.innerHTML = '<div class="search-empty">Buscando…</div>';
      const lower = q.toLowerCase();
      const results = [];

      for (let p = 1; p <= State.pageCount; p++) {
        if (myToken !== pdfSearchToken) return; // busca cancelada por nova digitação
        const text = await getPageText(p);
        if (!text) continue;
        const lowerText = text.toLowerCase();
        let idx = lowerText.indexOf(lower);
        if (idx === -1) continue;

        const start = Math.max(0, idx - 40);
        const end = Math.min(text.length, idx + lower.length + 60);
        let snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
        results.push({ page: p, snippet, matchStart: idx - start + (start > 0 ? 1 : 0) });

        if (results.length >= 60) break; // limite razoável de resultados exibidos

        // Atualiza incrementalmente a cada ~5 páginas para dar feedback em PDFs longos
        if (p % 5 === 0) {
          statusEl.textContent = `Buscando… (${p}/${State.pageCount})`;
        }
      }

      if (myToken !== pdfSearchToken) return;

      State.pdfSearchResults = results;
      statusEl.textContent = results.length ? `${results.length} resultado${results.length !== 1 ? 's' : ''}` : '';
      renderPdfSearchResults(results, q);
    }

    function renderPdfSearchResults(results, q) {
      const container = document.getElementById('pdf-search-results');
      if (results.length === 0) {
        container.innerHTML = `<div class="search-empty">Nenhum resultado para "<strong>${escapeHtml(q)}</strong>" no texto do PDF.</div>`;
        return;
      }
      container.innerHTML = results.map((r, i) => {
        const before = escapeHtml(r.snippet.slice(0, r.matchStart));
        const match = escapeHtml(r.snippet.slice(r.matchStart, r.matchStart + q.length));
        const after = escapeHtml(r.snippet.slice(r.matchStart + q.length));
        return `
      <div class="pdf-search-result-item" data-idx="${i}" data-page="${r.page}" onclick="jumpToPdfSearchResult(${i})">
        <div class="psri-page">Página ${r.page}</div>
        <div class="psri-snippet">${before}<mark>${match}</mark>${after}</div>
      </div>
    `;
      }).join('');
    }

    function jumpToPdfSearchResult(idx) {
      const result = State.pdfSearchResults[idx];
      if (!result) return;
      closePdfSearch();
      scrollToPage(result.page);
      // Realça brevemente as palavras da página que combinam com a busca
      setTimeout(() => highlightWordsOnPage(result.page, document.getElementById('pdf-search-input')?.value?.trim() || ''), 350);
    }

    function highlightWordsOnPage(pageNum, query) {
      if (!query) return;
      const wrapper = document.querySelector(`.page-wrapper[data-page="${pageNum}"]`);
      if (!wrapper) return;
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const spans = wrapper.querySelectorAll('.word-span');
      const toClear = [];
      spans.forEach(span => {
        const raw = (span.dataset.raw || '').toLowerCase();
        if (terms.some(t => raw.includes(t))) {
          span.classList.add('highlighted');
          toClear.push(span);
        }
      });
      setTimeout(() => toClear.forEach(el => el.classList.remove('highlighted')), 2200);
    }

    function handlePdfSearchKey(e) {
      const items = document.querySelectorAll('.pdf-search-result-item');
      if (e.key === 'Escape') { closePdfSearch(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        State.pdfSearchFocusIdx = Math.min(State.pdfSearchFocusIdx + 1, items.length - 1);
        updatePdfSearchFocus(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        State.pdfSearchFocusIdx = Math.max(State.pdfSearchFocusIdx - 1, 0);
        updatePdfSearchFocus(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (State.pdfSearchFocusIdx >= 0 && items[State.pdfSearchFocusIdx]) {
          jumpToPdfSearchResult(parseInt(items[State.pdfSearchFocusIdx].dataset.idx));
        } else if (items.length > 0) {
          jumpToPdfSearchResult(0);
        }
      }
    }

    function updatePdfSearchFocus(items) {
      items.forEach((el, i) => el.classList.toggle('focused', i === State.pdfSearchFocusIdx));
      if (items[State.pdfSearchFocusIdx]) {
        items[State.pdfSearchFocusIdx].scrollIntoView({ block: 'nearest' });
      }
    }

