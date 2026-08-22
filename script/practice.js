// PRACTICE: aba de prática com repetição espaçada (Leitner). Depende de state-data.js, storage.js e app-ui-helpers.js (showNotif/escapeHtml).

    // ═══════════════════════════════════════════════════════════
    // CONFIGURAÇÃO DA REPETIÇÃO ESPAÇADA
    // ═══════════════════════════════════════════════════════════
    const LEITNER_INTERVALS_DAYS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 15 };
    const PRACTICE_MAX_SESSION_SIZE = 20;

    function todayISO() {
      return new Date().toISOString().slice(0, 10);
    }

    function addDaysISO(dateStr, days) {
      const d = new Date(dateStr + 'T00:00:00');
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    }

    // Remove acentos e normaliza espaços/caixa para comparar respostas com tolerância
    function normalizeForMatch(str) {
      return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
    }

    function shuffleArray(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    // ═══════════════════════════════════════════════════════════
    // ABERTURA / FECHAMENTO DO MODAL
    // ═══════════════════════════════════════════════════════════
    function openPracticeModal() {
      const modal = document.getElementById('practice-modal');
      modal.classList.add('open');
      State.practice.source = 'current';
      State.practice.uploadedDict = null;
      document.getElementById('practice-src-current').classList.add('active');
      document.getElementById('practice-src-upload').classList.remove('active');
      document.getElementById('practice-upload-status').textContent = 'Nenhum arquivo';
      document.getElementById('practice-session-size').value = PRACTICE_MAX_SESSION_SIZE;
      switchPracticeScreen('setup');
      updatePracticeSetupInfo();
    }

    function closePracticeModal() {
      document.getElementById('practice-modal').classList.remove('open');
    }

    function closePracticeOnBackdrop(e) {
      if (e.target === document.getElementById('practice-modal')) closePracticeModal();
    }

    function switchPracticeScreen(screen) {
      document.querySelectorAll('.practice-screen').forEach(el => {
        el.classList.toggle('active', el.id === 'practice-screen-' + screen);
      });
    }

    // ═══════════════════════════════════════════════════════════
    // TELA DE CONFIGURAÇÃO
    // ═══════════════════════════════════════════════════════════
    function selectPracticeSource(src) {
      State.practice.source = src;
      document.getElementById('practice-src-current').classList.toggle('active', src === 'current');
      document.getElementById('practice-src-upload').classList.toggle('active', src === 'upload');
      if (src === 'upload') {
        document.getElementById('practice-file-input').click();
      }
      updatePracticeSetupInfo();
    }

    function handlePracticeFileInput(input) {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data || typeof data !== 'object') {
            throw new Error('invalid');
          }
          // Normaliza chaves (minúsculas) sem tocar no dicionário principal —
          // este dicionário é só para esta sessão de prática.
          const normalized = {};
          Object.keys(data).forEach(k => {
            const key = String(k || '').trim().toLowerCase();
            if (!key) return;
            normalized[key] = data[k];
          });
          State.practice.uploadedDict = normalized;
          document.getElementById('practice-upload-status').textContent =
            `${file.name} (${Object.keys(normalized).length} palavras)`;
          updatePracticeSetupInfo();
        } catch (err) {
          State.practice.uploadedDict = null;
          document.getElementById('practice-upload-status').textContent = 'Nenhum arquivo';
          selectPracticeSource('current');
          showNotif('Erro ao carregar arquivo: JSON inválido.');
        }
      };
      reader.readAsText(file);
    }

    function updatePracticeSetupInfo() {
      document.getElementById('practice-current-count').textContent =
        `${Object.keys(State.dictionary).length} palavras`;

      const dict = State.practice.source === 'current' ? State.dictionary : (State.practice.uploadedDict || {});
      const words = Object.keys(dict).filter(w => dict[w] && Array.isArray(dict[w].translations) && dict[w].translations.length > 0);

      const today = todayISO();
      const dueCount = words.filter(w => State.practiceData[w] && State.practiceData[w].nextReview && State.practiceData[w].nextReview <= today).length;

      const infoEl = document.getElementById('practice-due-info');
      infoEl.textContent = dueCount > 0
        ? `📌 ${dueCount} palavra${dueCount !== 1 ? 's' : ''} atrasada${dueCount !== 1 ? 's' : ''} para revisão entrarão primeiro nesta sessão.`
        : '';

      const startBtn = document.getElementById('practice-start-btn');
      const emptyMsg = document.getElementById('practice-empty-msg');
      const hasWords = words.length > 0;
      startBtn.disabled = !hasWords;
      startBtn.style.display = hasWords ? '' : 'none';
      emptyMsg.style.display = hasWords ? 'none' : 'block';
    }

    // ═══════════════════════════════════════════════════════════
    // MONTAGEM DA SESSÃO (repetição espaçada estilo Leitner)
    // ═══════════════════════════════════════════════════════════
    function buildPracticeQueue(dict, sessionSize) {
      const words = Object.keys(dict).filter(w => dict[w] && Array.isArray(dict[w].translations) && dict[w].translations.length > 0);
      const today = todayISO();

      const overdue = [];
      const fresh = [];
      const notDueYet = [];

      words.forEach(w => {
        const pd = State.practiceData[w];
        if (!pd) {
          fresh.push(w);
        } else if (pd.nextReview && pd.nextReview <= today) {
          overdue.push({ word: w, nextReview: pd.nextReview });
        } else {
          notDueYet.push(w);
        }
      });

      overdue.sort((a, b) => (a.nextReview < b.nextReview ? -1 : a.nextReview > b.nextReview ? 1 : 0));
      shuffleArray(fresh);
      shuffleArray(notDueYet);

      let queue = overdue.map(o => o.word);
      for (const w of fresh) {
        if (queue.length >= sessionSize) break;
        queue.push(w);
      }
      for (const w of notDueYet) {
        if (queue.length >= sessionSize) break;
        queue.push(w);
      }

      queue = queue.slice(0, sessionSize);
      return shuffleArray(queue);
    }

    function startPracticeSession() {
      const dict = State.practice.source === 'current' ? State.dictionary : State.practice.uploadedDict;
      if (!dict || Object.keys(dict).length === 0) {
        document.getElementById('practice-empty-msg').style.display = 'block';
        return;
      }

      let sessionSize = parseInt(document.getElementById('practice-session-size').value, 10) || PRACTICE_MAX_SESSION_SIZE;
      sessionSize = Math.max(1, Math.min(PRACTICE_MAX_SESSION_SIZE, sessionSize));

      const queue = buildPracticeQueue(dict, sessionSize);
      if (queue.length === 0) {
        document.getElementById('practice-empty-msg').style.display = 'block';
        return;
      }

      State.practice.activeDict = dict;
      State.practice.queue = queue;
      State.practice.currentIndex = 0;
      State.practice.correctCount = 0;
      State.practice.wrongWords = [];

      switchPracticeScreen('question');
      renderPracticeQuestion();
    }

    function restartPracticeSetup() {
      switchPracticeScreen('setup');
      updatePracticeSetupInfo();
    }

    // ═══════════════════════════════════════════════════════════
    // TELA DE PERGUNTA / RESPOSTA
    // ═══════════════════════════════════════════════════════════
    function renderPracticeQuestion() {
      const idx = State.practice.currentIndex;
      const total = State.practice.queue.length;
      const word = State.practice.queue[idx];

      State.practice.currentWord = word;
      State.practice.lastCheckCorrect = null;

      document.getElementById('practice-progress-label').textContent = `${idx + 1}/${total}`;
      document.getElementById('practice-progress-fill').style.width = `${(idx / total) * 100}%`;
      document.getElementById('practice-word').textContent = word;

      const input = document.getElementById('practice-input');
      input.value = '';
      document.getElementById('practice-answer-form').style.display = '';
      document.getElementById('practice-reveal').style.display = 'none';
      document.getElementById('practice-self-check').style.display = 'none';
      document.getElementById('practice-next-btn').disabled = true;

      setTimeout(() => input.focus(), 60);
    }

    function handlePracticeInputKey(e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const revealVisible = document.getElementById('practice-reveal').style.display !== 'none';
      if (!revealVisible) {
        checkPracticeAnswer();
      }
    }

    function checkPracticeAnswer() {
      const input = document.getElementById('practice-input');
      const raw = input.value.trim();
      if (!raw) {
        showNotif('Digite uma resposta antes de verificar.');
        return;
      }

      const word = State.practice.currentWord;
      const entry = State.practice.activeDict[word];
      const userNorm = normalizeForMatch(raw);
      const isMatch = (entry.translations || []).some(t => normalizeForMatch(t) === userNorm);

      State.practice.lastCheckCorrect = isMatch;
      renderPracticeReveal(word, entry, isMatch);

      document.getElementById('practice-answer-form').style.display = 'none';
      document.getElementById('practice-reveal').style.display = '';
    }

    function renderPracticeReveal(word, entry, isMatch) {
      const verdict = document.getElementById('practice-verdict');
      const selfCheck = document.getElementById('practice-self-check');
      const nextBtn = document.getElementById('practice-next-btn');

      if (isMatch) {
        verdict.className = 'practice-verdict correct';
        verdict.textContent = '✓ Você acertou!';
        selfCheck.style.display = 'none';
        nextBtn.disabled = false;
      } else {
        verdict.className = 'practice-verdict incorrect';
        verdict.textContent = '✕ Não bateu com nenhuma tradução cadastrada.';
        selfCheck.style.display = '';
        nextBtn.disabled = true;
      }

      document.getElementById('practice-card-word').textContent = word;

      const transWrap = document.getElementById('practice-card-translations');
      transWrap.innerHTML = (entry.translations || [])
        .map(t => `<span class="practice-trans-pill">${escapeHtml(t)}</span>`)
        .join('');

      const descEl = document.getElementById('practice-card-description');
      if (entry.description && entry.description.trim()) {
        descEl.style.display = '';
        descEl.innerHTML = `<div class="practice-card-label">Descrição</div><div>${escapeHtml(entry.description).replace(/\n/g, '<br>')}</div>`;
      } else {
        descEl.style.display = 'none';
        descEl.innerHTML = '';
      }

      const exWrap = document.getElementById('practice-card-examples');
      if (entry.examples && entry.examples.length > 0) {
        exWrap.innerHTML = `<div class="practice-card-label">Exemplos</div>` + entry.examples.map(ex => `
          <div class="practice-example">
            <div class="practice-ex-orig">"${escapeHtml(ex.original || '')}"</div>
            ${ex.translated ? `<div class="practice-ex-trans">→ ${escapeHtml(ex.translated)}</div>` : ''}
          </div>
        `).join('');
      } else {
        exWrap.innerHTML = '';
      }
    }

    function selfCheckAnswer(isCorrectManual) {
      State.practice.lastCheckCorrect = isCorrectManual;
      const verdict = document.getElementById('practice-verdict');
      verdict.className = 'practice-verdict ' + (isCorrectManual ? 'correct' : 'incorrect');
      verdict.textContent = isCorrectManual ? '✓ Marcado como acerto.' : '✕ Marcado como erro — vai para revisão.';
      document.getElementById('practice-self-check').style.display = 'none';
      document.getElementById('practice-next-btn').disabled = false;
    }

    function confirmAndNext() {
      if (document.getElementById('practice-next-btn').disabled) return;

      const word = State.practice.currentWord;
      const entry = State.practice.activeDict[word];
      const correct = !!State.practice.lastCheckCorrect;

      updatePracticeBox(word, correct);

      if (correct) {
        State.practice.correctCount++;
      } else {
        State.practice.wrongWords.push({ word, entry });
      }

      State.practice.currentIndex++;
      if (State.practice.currentIndex >= State.practice.queue.length) {
        showPracticeSummary();
      } else {
        renderPracticeQuestion();
      }
    }

    function updatePracticeBox(word, correct) {
      const pd = State.practiceData[word] || { box: 0, timesSeen: 0, timesCorrect: 0 };
      pd.timesSeen = (pd.timesSeen || 0) + 1;

      if (correct) {
        pd.timesCorrect = (pd.timesCorrect || 0) + 1;
        pd.box = Math.min((pd.box || 0) + 1, 5);
      } else {
        pd.box = 1;
      }

      const today = todayISO();
      pd.lastReviewed = today;
      pd.nextReview = addDaysISO(today, LEITNER_INTERVALS_DAYS[pd.box] || 1);

      State.practiceData[word] = pd;
      savePracticeData();
    }

    // ═══════════════════════════════════════════════════════════
    // TELA DE RESUMO
    // ═══════════════════════════════════════════════════════════
    function showPracticeSummary() {
      const total = State.practice.queue.length;
      const correct = State.practice.correctCount;
      document.getElementById('practice-score').textContent = `${correct}/${total}`;

      const listEl = document.getElementById('practice-review-list');
      const wrong = State.practice.wrongWords;

      if (wrong.length === 0) {
        listEl.innerHTML = `<div class="practice-review-empty">🎉 Nenhuma palavra errada nesta sessão!</div>`;
      } else {
        listEl.innerHTML = `<div class="practice-review-title">Para revisar (${wrong.length}):</div>` +
          wrong.map(({ word, entry }) => `
            <div class="practice-review-item">
              <span class="practice-review-word">${escapeHtml(word)}</span>
              <span class="practice-review-trans">${escapeHtml((entry.translations || []).join(', '))}</span>
            </div>
          `).join('');
      }

      switchPracticeScreen('summary');
    }
