// ZOOM-NAVIGATION: zoom (com reancoragem de scroll) e navegação/salto de página. Depende de state-data.js e pdf-loader.js.

    // Ajuste aqui a porcentagem de visibilidade mínima que ainda conta como a página
    // atual. Ex.: 0.20 = quando a página atual tiver menos de 20% visível, a próxima
    // passa a ser considerada como página em foco.
    const PAGE_SWITCH_VISIBILITY_THRESHOLD = 0.20;

    // ═══════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════
    // ZOOM
    // ═══════════════════════════════════════════════════════════
    function setupZoom() {
      document.getElementById('zoom-in').addEventListener('click', () => changeScale(0.15));
      document.getElementById('zoom-out').addEventListener('click', () => changeScale(-0.15));
    }

    function getFocusedPageFromScroll() {
      const reader = document.getElementById('reader');
      const scrollTop = reader.scrollTop;
      const wrappers = Array.from(document.querySelectorAll('.page-wrapper'));
      if (!wrappers.length) return { pageNum: State.currentPage || 1, fraction: 0 };

      let target = wrappers.find(wrapper => wrapper.offsetTop + wrapper.offsetHeight > scrollTop);
      if (!target) target = wrappers[wrappers.length - 1];
      if (!target) return { pageNum: State.currentPage || 1, fraction: 0 };

      const pageNum = parseInt(target.dataset.page, 10);
      const pageHeight = target.offsetHeight || 1;
      const scrolledPast = clamp((scrollTop - target.offsetTop) / pageHeight, 0, 1);
      const visibleFraction = 1 - scrolledPast;

      // Se a página atual estiver menos visível que o threshold, a próxima passa a
      // ser a página em foco.
      if (target !== wrappers[wrappers.length - 1] && visibleFraction < PAGE_SWITCH_VISIBILITY_THRESHOLD) {
        const nextWrapper = wrappers[wrappers.indexOf(target) + 1];
        if (nextWrapper) {
          const nextPageNum = parseInt(nextWrapper.dataset.page, 10);
          const nextFraction = nextWrapper.offsetHeight
            ? clamp((scrollTop - nextWrapper.offsetTop) / nextWrapper.offsetHeight, 0, 1)
            : 0;
          return { pageNum: nextPageNum, fraction: nextFraction };
        }
      }

      return { pageNum, fraction: scrolledPast };
    }

    // Captura em qual página o usuário está e em que fração (0..1) da altura
    // dela ele está olhando agora — pra depois do zoom restaurar exatamente a
    // mesma posição relativa de leitura, em vez de só mandar pro topo da página.
    function captureScrollAnchor() {
      return getFocusedPageFromScroll();
    }

    // Restaura a posição capturada por captureScrollAnchor(), já contra as
    // NOVAS dimensões (pós-zoom) do wrapper daquela página.
    function restoreScrollAnchor(anchor) {
      const reader = document.getElementById('reader');
      const wrapper = document.querySelector(`.page-wrapper[data-page="${anchor.pageNum}"]`);
      if (!wrapper) return;
      reader.scrollTop = wrapper.offsetTop + anchor.fraction * wrapper.offsetHeight;
    }

    // Recalcula geometria (viewport) de todas as páginas já montadas, SEM destruir
    // e recriar os elementos do DOM. Reaproveita os objetos `page` do pdf.js já
    // carregados em State.renderedPages (getViewport é barato, não precisa
    // re-buscar a página) — só ajusta width/height do wrapper e invalida o
    // conteúdo (canvas + text layer) pra ser redesenhado na nova escala.
    //
    // Por que não usar renderAllPages() aqui: ele faz `container.innerHTML = ''`,
    // o que zera instantaneamente a scrollHeight do container e força o scroll
    // do leitor pro topo (colapsa pra 0) antes de reconstruir tudo — isso é
    // exatamente o "tremor" / pulo pra página anterior que o zoom causava.
    // Mantendo os nós do DOM vivos (só redimensionando), o navegador nunca vê
    // um estado de "documento vazio" e não há salto de scroll.
    function relayoutPagesForScale() {
      State.renderedPages.forEach((entry, pageNum) => {
        if (!entry.page) return; // wrapper de erro (falhou ao carregar) — nada a reajustar

        const viewport = entry.page.getViewport({ scale: State.scale });
        entry.viewport = viewport;
        entry.pageContainer.style.width = viewport.width + 'px';
        entry.pageContainer.style.height = viewport.height + 'px';

        // Libera o canvas (conteúdo da escala antiga) em vez de deixá-lo esticado
        // via CSS — o zoom precisa RE-RENDERIZAR o conteúdo na nova resolução,
        // não apenas ampliar/reduzir visualmente o bitmap já desenhado.
        if (entry.renderTask) {
          try { entry.renderTask.cancel(); } catch (e) { /* ignore */ }
          entry.renderTask = null;
        }
        entry.canvas.width = 0;
        entry.canvas.height = 0;
        entry.rendered = false;
        if (!entry.failed) entry.pageContainer.classList.add('page-pending');

        // As posições de palavra calculadas pra escala antiga não valem mais —
        // força a text layer a ser reconstruída do zero na nova escala.
        entry.textContent = null;
        entry.textLayer.innerHTML = '';
        entry.textLayer.dataset.activated = '';
        entry.textLayer.classList.remove('active');
      });
    }

    async function changeScale(delta) {
      const newScale = clamp(State.scale + delta, 0.5, 2.5);
      if (newScale === State.scale) return;

      document.getElementById('scale-val').textContent = Math.round(newScale * 100) + '%';

      if (!State.pdf) {
        State.scale = newScale;
        return;
      }

      // 1. Guarda onde exatamente o usuário está lendo antes de qualquer mudança.
      const anchor = captureScrollAnchor();

      State.scale = newScale;
      State.activePages.clear();

      // 2. Reajusta a geometria in-place (sem tocar no DOM/observers) e invalida
      //    o conteúdo desenhado, obrigando o re-render na nova escala.
      relayoutPagesForScale();

      // 3. Restaura a posição de leitura imediatamente (sem animação), já com
      //    base nas novas dimensões — evita qualquer salto visível.
      restoreScrollAnchor(anchor);

      // 4. Redesenha a página focada e vizinhas de imediato (não esperar o
      //    IntersectionObserver reagir), garantindo que o texto/canvas apareçam
      //    nítidos na nova escala sem esperar o usuário rolar.
      activatePageRange(anchor.pageNum);
      manageRenderWindow(anchor.pageNum);
      State.currentPage = anchor.pageNum;
      updateCurrentPageUI();
    }

    // ═══════════════════════════════════════════════════════════
    // PULAR PÁGINA
    // ═══════════════════════════════════════════════════════════
    function setupPageJump() {
      const input = document.getElementById('page-input');
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const page = parseInt(input.value, 10);
          if (page >= 1 && page <= State.pageCount) {
            scrollToPage(page);
          }
        }
      });
    }

    function setupPageTracking() {
      const reader = document.getElementById('reader');
      let scheduled = null;

      const updatePageFromScroll = () => {
        scheduled = null;
        const focused = getFocusedPageFromScroll();
        if (focused.pageNum && focused.pageNum !== State.currentPage) {
          State.currentPage = focused.pageNum;
          updateCurrentPageUI();
        }
      };

      reader.addEventListener('scroll', () => {
        if (scheduled) cancelAnimationFrame(scheduled);
        scheduled = requestAnimationFrame(updatePageFromScroll);
      });
    }

    function scrollToPage(pageNum, smooth = true) {
      const wrapper = document.querySelector(`.page-wrapper[data-page="${pageNum}"]`);
      if (wrapper) {
        wrapper.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
        manageRenderWindow(pageNum);
        State.currentPage = pageNum;
        updateCurrentPageUI();
      }
    }

