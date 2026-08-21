// PDF-LOADER: config do pdf.js, upload, carregamento e renderização virtualizada das páginas. Depende de state-data.js e storage.js.

// ═══════════════════════════════════════════════════════════
    // CONFIGURAÇÃO DO PDF.JS
    // ═══════════════════════════════════════════════════════════
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';


    // ═══════════════════════════════════════════════════════════
    // UPLOAD DE PDF
    // ═══════════════════════════════════════════════════════════
    function setupUploadZone() {
      const zone = document.getElementById('upload-zone');
      const fileInput = document.getElementById('file-input');

      zone.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') fileInput.click();
      });

      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag');
      });

      zone.addEventListener('dragleave', () => zone.classList.remove('drag'));

      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') loadPDF(file);
        else showNotif('Por favor, selecione um arquivo PDF.');
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) loadPDF(file);
      });

      document.getElementById('btn-open-another').addEventListener('click', () => {
        fileInput.click();
      });
    }

    // ═══════════════════════════════════════════════════════════
    // CARREGAMENTO DO PDF
    // ═══════════════════════════════════════════════════════════
    async function loadPDF(file) {
      showLoading('Lendo arquivo…');
      State.filename = file.name;
      State.pdfSearchIndex.clear();

      // Salva o arquivo (incl. o Blob) em Recentes, para reabertura real com 1 clique
      saveRecent(file).catch(e => console.error(e));

      const arrayBuffer = await file.arrayBuffer();

      try {
        setLoadingText('Processando PDF…');
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        State.pdf = pdf;
        State.pageCount = pdf.numPages;

        // Switch UI
        document.getElementById('splash').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        document.getElementById('tb-filename').textContent = file.name;
        document.getElementById('total-pages').textContent = State.pageCount;

        // Monta os "esqueletos" das páginas (sem renderizar todas de uma vez)
        await renderAllPages();
        setupIntersectionObserver();
        setupRenderObserver();
        updateProgress();

        hideLoading();
        showNotif(`PDF carregado: ${State.pageCount} páginas`);

        // Retomar última página lida, se houver
        try {
          const rec = await idbGet('recents', file.name);
          if (rec && rec.lastPage && rec.lastPage > 1 && rec.lastPage <= State.pageCount) {
            scrollToPage(rec.lastPage, false);
          }
        } catch (e) { /* não é crítico */ }
      } catch (err) {
        hideLoading();
        showNotif('Erro ao carregar PDF: ' + err.message);
        console.error(err);
      }
    }

    // Salva (com debounce) a página atual como "última lida" para este arquivo,
    // permitindo retomar de onde parou numa próxima sessão.
    function scheduleSaveLastPage() {
      if (!State.filename) return;
      clearTimeout(State.lastPageSaveTimer);
      State.lastPageSaveTimer = setTimeout(async () => {
        try {
          const rec = await idbGet('recents', State.filename);
          if (rec) {
            rec.lastPage = State.currentPage;
            await idbSet('recents', rec);
          }
        } catch (e) { /* não é crítico */ }
      }, 600);
    }

    // ═══════════════════════════════════════════════════════════
    // RENDERIZAÇÃO VIRTUALIZADA DAS PÁGINAS
    //
    // Em vez de renderizar todos os canvases do PDF de uma vez (o que trava a UI
    // e consome memória proporcional ao documento inteiro em PDFs longos),
    // montamos apenas "esqueletos" vazios com a altura/largura corretas
    // (via page.getViewport, que é barato e não desenha nada), e o canvas de
    // cada página só é de fato desenhado quando ela entra (ou está perto de
    // entrar) na viewport, via IntersectionObserver. Canvases distantes da
    // página atual são liberados (width = height = 0) para não acumular memória.
    // ═══════════════════════════════════════════════════════════
    async function renderAllPages() {
      const container = document.getElementById('pages-container');
      container.innerHTML = '';
      State.renderedPages.clear();

      const fragment = document.createDocumentFragment();

      for (let i = 1; i <= State.pageCount; i++) {
        setLoadingText(`Preparando página ${i} de ${State.pageCount}…`);

        try {
          const page = await State.pdf.getPage(i);
          const viewport = page.getViewport({ scale: State.scale });

          const wrapper = document.createElement('div');
          wrapper.className = 'page-wrapper';
          wrapper.dataset.page = i;

          const pageContainer = document.createElement('div');
          pageContainer.className = 'page-container page-pending';
          pageContainer.style.width = viewport.width + 'px';
          pageContainer.style.height = viewport.height + 'px';

          // Canvas vazio por enquanto — só ganha pixels quando entrar na janela de render
          const canvas = document.createElement('canvas');
          canvas.width = 0;
          canvas.height = 0;
          const ctx = canvas.getContext('2d');

          const textLayer = document.createElement('div');
          textLayer.className = 'text-layer';
          textLayer.dataset.page = i;

          pageContainer.appendChild(canvas);
          pageContainer.appendChild(textLayer);

          const badge = document.createElement('div');
          badge.className = 'page-num-badge';
          badge.textContent = `${i} / ${State.pageCount}`;

          wrapper.appendChild(pageContainer);
          wrapper.appendChild(badge);
          fragment.appendChild(wrapper);

          State.renderedPages.set(i, {
            page, viewport, wrapper, pageContainer, canvas, ctx, textLayer,
            textContent: null, rendered: false, renderTask: null, failed: false,
            matchCount: null,
          });
        } catch (err) {
          // Tratamento de erro por página: uma página com falha não deve
          // interromper o carregamento das demais.
          console.error(`Erro ao preparar a página ${i}:`, err);
          fragment.appendChild(buildErrorWrapper(i, err));
        }

        const pBar = document.getElementById('progress-bar');
        pBar.style.width = ((i / State.pageCount) * 100) + '%';
      }

      container.appendChild(fragment);

      setTimeout(() => {
        document.getElementById('progress-bar').style.width = '0%';
      }, 800);
    }

    function buildErrorWrapper(pageNum, err) {
      const wrapper = document.createElement('div');
      wrapper.className = 'page-wrapper';
      wrapper.dataset.page = pageNum;
      wrapper.dataset.errored = '1';

      const pageContainer = document.createElement('div');
      pageContainer.className = 'page-container page-error';
      pageContainer.style.width = '400px';
      pageContainer.style.height = '200px';
      pageContainer.innerHTML = `
        <div>⚠ Falha ao carregar a página ${pageNum}</div>
        <div style="font-size:0.7rem;opacity:0.7">${escapeHtml(err?.message || 'Erro desconhecido')}</div>
        <button class="page-error-retry" onclick="retryPageLoad(${pageNum})">Tentar novamente</button>
      `;

      const badge = document.createElement('div');
      badge.className = 'page-num-badge';
      badge.textContent = `${pageNum} / ${State.pageCount}`;

      wrapper.appendChild(pageContainer);
      wrapper.appendChild(badge);
      return wrapper;
    }

    async function retryPageLoad(pageNum) {
      try {
        const page = await State.pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: State.scale });

        const oldWrapper = document.querySelector(`.page-wrapper[data-page="${pageNum}"]`);
        const newWrapper = document.createElement('div');
        newWrapper.className = 'page-wrapper';
        newWrapper.dataset.page = pageNum;

        const pageContainer = document.createElement('div');
        pageContainer.className = 'page-container page-pending';
        pageContainer.style.width = viewport.width + 'px';
        pageContainer.style.height = viewport.height + 'px';

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const textLayer = document.createElement('div');
        textLayer.className = 'text-layer';
        textLayer.dataset.page = pageNum;
        pageContainer.appendChild(canvas);
        pageContainer.appendChild(textLayer);

        const badge = document.createElement('div');
        badge.className = 'page-num-badge';
        badge.textContent = `${pageNum} / ${State.pageCount}`;

        newWrapper.appendChild(pageContainer);
        newWrapper.appendChild(badge);

        oldWrapper.replaceWith(newWrapper);

        State.renderedPages.set(pageNum, {
          page, viewport, wrapper: newWrapper, pageContainer, canvas, ctx, textLayer,
          textContent: null, rendered: false, renderTask: null, failed: false,
        });

        if (State.intersectionObserver) State.intersectionObserver.observe(newWrapper);
        if (State.renderObserver) State.renderObserver.observe(newWrapper);

        await renderPageCanvas(pageNum);
      } catch (err) {
        console.error(`Nova tentativa falhou para a página ${pageNum}:`, err);
        showNotif(`Ainda não foi possível carregar a página ${pageNum}.`);
      }
    }

    // ── Renderiza o canvas de UMA página (chamado quando ela entra na janela de render) ──
    async function renderPageCanvas(pageNum) {
      const entry = State.renderedPages.get(pageNum);
      if (!entry || entry.rendered || entry.renderTask) return;

      const { page, viewport, canvas, ctx, pageContainer } = entry;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      try {
        const task = page.render({ canvasContext: ctx, viewport });
        entry.renderTask = task;
        await task.promise;
        entry.renderTask = null;
        entry.rendered = true;
        entry.failed = false;
        pageContainer.classList.remove('page-pending', 'page-error');
      } catch (err) {
        entry.renderTask = null;
        if (err && err.name === 'RenderingCancelledException') return; // cancelado por unrender rápido, sem problema
        console.error(`Erro ao renderizar a página ${pageNum}:`, err);
        entry.failed = true;
        pageContainer.classList.remove('page-pending');
        pageContainer.classList.add('page-error');
        pageContainer.innerHTML = `
          <div>⚠ Falha ao desenhar a página ${pageNum}</div>
          <button class="page-error-retry" onclick="renderPageCanvas(${pageNum})">Tentar novamente</button>
        `;
      }
    }

    // ── Libera o canvas de uma página distante para economizar memória ──
    function unrenderPageCanvas(pageNum) {
      const entry = State.renderedPages.get(pageNum);
      if (!entry || !entry.rendered) {
        // Se ainda está renderizando, cancela a tarefa em andamento
        if (entry && entry.renderTask) {
          try { entry.renderTask.cancel(); } catch (e) { /* ignore */ }
          entry.renderTask = null;
        }
        return;
      }
      entry.canvas.width = 0;
      entry.canvas.height = 0;
      entry.rendered = false;
      if (!entry.failed) entry.pageContainer.classList.add('page-pending');
    }

    // Garante que as páginas próximas da atual estejam renderizadas, e libera
    // os canvases das páginas que ficaram longe o suficiente.
    function manageRenderWindow(centerPage) {
      const from = Math.max(1, centerPage - RENDER_AHEAD);
      const to = Math.min(State.pageCount, centerPage + RENDER_AHEAD);
      for (let p = from; p <= to; p++) {
        renderPageCanvas(p);
      }
      State.renderedPages.forEach((entry, p) => {
        if (entry.rendered && Math.abs(p - centerPage) > RENDER_KEEP_MARGIN) {
          unrenderPageCanvas(p);
        }
      });
    }

    // ═══════════════════════════════════════════════════════════
    // INTERSECTION OBSERVER — páginas ativas (±1) e página atual
    // ═══════════════════════════════════════════════════════════
    function setupIntersectionObserver() {
      if (State.intersectionObserver) {
        State.intersectionObserver.disconnect();
      }

      const options = {
        root: document.getElementById('reader'),
        rootMargin: '100px 0px 100px 0px',
        threshold: 0.01,
      };

      State.intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const wrapper = entry.target;
          const pageNum = parseInt(wrapper.dataset.page);

          if (entry.isIntersecting) {
            // Ativar esta página e adjacentes
            activatePageRange(pageNum);
            State.currentPage = pageNum;
            updateCurrentPageUI();
            manageRenderWindow(pageNum);
          }
        });
      }, options);

      document.querySelectorAll('.page-wrapper').forEach(wrapper => {
        State.intersectionObserver.observe(wrapper);
      });

      // Garante que a primeira página (e vizinhas) já apareçam renderizadas
      manageRenderWindow(State.currentPage || 1);
    }

    // Observer separado, com margem bem maior, dedicado só à virtualização do
    // canvas — renderiza com bastante antecedência (antes do usuário rolar até
    // lá) e libera memória quando a página sai bem longe da viewport.
    function setupRenderObserver() {
      if (State.renderObserver) {
        State.renderObserver.disconnect();
      }

      const options = {
        root: document.getElementById('reader'),
        rootMargin: '1500px 0px 1500px 0px',
        threshold: 0,
      };

      State.renderObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const pageNum = parseInt(entry.target.dataset.page);
          if (entry.isIntersecting) {
            renderPageCanvas(pageNum);
          } else {
            unrenderPageCanvas(pageNum);
          }
        });
      }, options);

      document.querySelectorAll('.page-wrapper').forEach(wrapper => {
        State.renderObserver.observe(wrapper);
      });
    }

    function activatePageRange(centerPage) {
      const prev = centerPage - 1;
      const next = centerPage + 1;

      // Ativar páginas no range [-1, 0, +1]
      [prev, centerPage, next].forEach(p => {
        if (p >= 1 && p <= State.pageCount && !State.activePages.has(p)) {
          activatePage(p);
        }
      });

      // Desativar páginas fora do range
      State.activePages.forEach(p => {
        if (p < prev - 1 || p > next + 1) {
          deactivatePage(p);
        }
      });

      // Atualizar stats
      document.getElementById('stat-active').textContent =
        Array.from(State.activePages).sort((a, b) => a - b).join(', ');
    }
