// TOOLTIP: exibição e edição rápida via tooltip de palavras no PDF. Depende de state-data.js e word-model.js.

    // ═══════════════════════════════════════════════════════════
    // TOOLTIP
    // ═══════════════════════════════════════════════════════════
    function showTooltip(event, word) {
      const entry = State.dictionary[word];
      if (!entry) return;

      State.currentWord = word;
      const tt = document.getElementById('tooltip');

      document.getElementById('tt-word').textContent = word;
      document.getElementById('tt-edit-btn').textContent = '✏ Editar';

      // Traduções
      const transDiv = document.getElementById('tt-translations');
      if (entry.translations && entry.translations.length > 0) {
        transDiv.innerHTML = `
      <div class="tt-label">Tradução</div>
      <div class="tt-trans-list">
        ${entry.translations.map(t => `<span class="tt-trans-pill">${t}</span>`).join('')}
      </div>
    `;
      } else {
        transDiv.innerHTML = `<div class="tt-label" style="color:rgba(255,255,255,0.3)">Sem tradução cadastrada</div>`;
      }

      const hasExamples = !!(entry.examples && entry.examples.length > 0);
      const hasDescription = !!(entry.description && entry.description.trim());

      // Exemplos (página principal)
      const exDiv = document.getElementById('tt-examples');
      if (hasExamples) {
        exDiv.innerHTML = `
      <div class="tt-label">Exemplos</div>
      ${entry.examples.map(ex => `
        <div class="tt-example">
          <div class="tt-ex-orig">"${ex.original}"</div>
          ${ex.translated ? `<div class="tt-ex-trans">→ ${ex.translated}</div>` : ''}
        </div>
      `).join('')}
    `;
      } else if (hasDescription) {
        // Sem exemplos: a descrição aparece direto na página principal, sem precisar navegar
        exDiv.innerHTML = `
      <div class="tt-label">Descrição</div>
      <div class="tt-description-text">${escapeHtml(entry.description).replace(/\n/g, '<br>')}</div>
    `;
      } else {
        exDiv.innerHTML = '';
      }

      // Descrição (página secundária — só relevante quando também há exemplos,
      // pois aí ela não coube inline e precisa da navegação por setas)
      const descTextDiv = document.getElementById('tt-description-text');
      descTextDiv.innerHTML = hasDescription ? escapeHtml(entry.description).replace(/\n/g, '<br>') : '';

      // Uma página de descrição separada só faz sentido se HÁ exemplos (ocupando a
      // página principal) E HÁ descrição (senão não existe "conteúdo ao lado" pra ir ver)
      tt.dataset.hasExtraDescription = (hasExamples && hasDescription) ? '1' : '0';

      tooltipShowMain();
      positionAndShowTooltip(tt, event.target);
    }

    // Alterna para a página principal (traduções + exemplos) do tooltip.
    // Seta direita só aparece se houver uma página de descrição separada pra navegar.
    function tooltipShowMain() {
      document.getElementById('tt-body-main').style.display = '';
      document.getElementById('tt-body-description').style.display = 'none';
      const tt = document.getElementById('tooltip');
      document.getElementById('tt-nav-right').style.display = tt.dataset.hasExtraDescription === '1' ? 'flex' : 'none';
      document.getElementById('tt-nav-left').style.display = 'none';
    }

    // Alterna para a página de descrição do tooltip (acessada pela seta direita).
    function tooltipShowDescription() {
      document.getElementById('tt-body-main').style.display = 'none';
      document.getElementById('tt-body-description').style.display = '';
      document.getElementById('tt-nav-right').style.display = 'none';
      document.getElementById('tt-nav-left').style.display = 'flex';
    }

    // Abre o tooltip de edição rápida para palavras sem entrada no dicionário
    function openEditForUnknownWord(word, event) {
      State.currentWord = word;
      const tt = document.getElementById('tooltip');

      document.getElementById('tt-word').textContent = word;
      document.getElementById('tt-edit-btn').textContent = '+ Adicionar';
      document.getElementById('tt-translations').innerHTML = `
    <div class="tt-new-word">
      Esta palavra ainda não está no dicionário.<br>
      Clique em <strong style="color:#fca87f">Adicionar</strong> para cadastrá-la agora.
    </div>
  `;
      document.getElementById('tt-examples').innerHTML = '';
      document.getElementById('tt-description-text').innerHTML = '';
      tt.dataset.hasExtraDescription = '0';
      tooltipShowMain();

      positionAndShowTooltip(tt, event.target);
    }

    function positionAndShowTooltip(tt, targetEl) {
      tt.style.display = 'block';
      const rect = targetEl.getBoundingClientRect();
      let left = rect.left;
      let top = rect.bottom + 10;

      // Evitar sair da tela
      const ttW = 300;
      if (left + ttW > window.innerWidth - 16) left = window.innerWidth - ttW - 16;
      if (left < 8) left = 8;
      if (top + 220 > window.innerHeight) top = rect.top - 220;

      tt.style.left = left + 'px';
      tt.style.top = top + 'px';

      // Highlight
      document.querySelectorAll('.word-span.highlighted').forEach(el => el.classList.remove('highlighted'));
      targetEl.classList.add('highlighted');
    }

    function hideTooltip() {
      document.getElementById('tooltip').style.display = 'none';
      document.querySelectorAll('.word-span.highlighted').forEach(el => el.classList.remove('highlighted'));
      State.currentWord = null;
    }

    document.addEventListener('click', (e) => {
      const tt = document.getElementById('tooltip');
      const modal = document.getElementById('search-modal');
      // Fechar tooltip ao clicar fora
      if (!tt.contains(e.target) && !e.target.classList.contains('word-span')) {
        hideTooltip();
      }
    });

    // ═══════════════════════════════════════════════════════════
