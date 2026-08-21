// SUFFIX-SYSTEM: detecção morfológica de sufixos, modal de sufixo e formulário/edição de sufixos. Depende de state-data.js e storage.js.

    // ═══════════════════════════════════════════════════════════
    // SISTEMA DE SUFIXOS MORFOLÓGICOS
    // ═══════════════════════════════════════════════════════════

    const DEFAULT_SUFFIX_DICT = {
      // ── Flexionais (alta frequência) ─────────────────────────
      "ing": {
        type: "verbal",
        meaning: "Indica ação contínua (gerúndio/participio presente). Forma o present continuous e substantivos verbais.",
        examples: ["running", "eating", "working", "thinking", "learning"]
      },
      "ed": {
        type: "verbal",
        meaning: "Passado simples e particípio passado de verbos regulares.",
        examples: ["walked", "played", "worked", "called", "started"]
      },
      "es": {
        type: "flexional",
        meaning: "Plural de substantivos terminados em sibilante, ou 3ª pessoa do singular de verbos.",
        examples: ["boxes", "watches", "goes", "does", "teaches"]
      },
      "s": {
        type: "flexional",
        meaning: "Plural de substantivos ou 3ª pessoa do singular no present simple.",
        examples: ["cats", "runs", "works", "plays", "books"]
      },
      "est": {
        type: "adjetivo",
        meaning: "Superlativo de adjetivos curtos (grau máximo).",
        examples: ["fastest", "biggest", "tallest", "smartest", "oldest"]
      },
      // ── Substantivos ─────────────────────────────────────────
      "ation": {
        type: "substantivo",
        meaning: "Forma substantivos a partir de verbos, indicando processo ou resultado de uma ação.",
        examples: ["creation", "information", "education", "formation", "motivation"]
      },
      "tion": {
        type: "substantivo",
        meaning: "Forma substantivos a partir de verbos (ação, estado ou resultado).",
        examples: ["action", "solution", "mention", "section", "ption"]
      },
      "ion": {
        type: "substantivo",
        meaning: "Forma substantivos indicando ação, condição ou resultado.",
        examples: ["union", "region", "opinion", "version", "fusion"]
      },
      "ness": {
        type: "substantivo",
        meaning: "Converte adjetivos em substantivos, indicando estado ou qualidade.",
        examples: ["happiness", "darkness", "kindness", "sadness", "awareness"]
      },
      "ment": {
        type: "substantivo",
        meaning: "Forma substantivos a partir de verbos, indicando ação, processo ou resultado.",
        examples: ["movement", "development", "agreement", "treatment", "statement"]
      },
      "ity": {
        type: "substantivo",
        meaning: "Converte adjetivos em substantivos abstratos indicando qualidade ou estado.",
        examples: ["quality", "ability", "activity", "reality", "possibility"]
      },
      "ty": {
        type: "substantivo",
        meaning: "Forma substantivos abstratos indicando qualidade ou condição.",
        examples: ["beauty", "safety", "liberty", "loyalty", "cruelty"]
      },
      "ship": {
        type: "substantivo",
        meaning: "Indica relação, condição, habilidade ou cargo entre pessoas.",
        examples: ["friendship", "leadership", "relationship", "membership", "scholarship"]
      },
      "er": {
        type: "substantivo",
        meaning: "Indica agente (quem realiza a ação) ou comparativo de adjetivos.",
        examples: ["teacher", "worker", "runner", "faster", "bigger"]
      },
      "or": {
        type: "substantivo",
        meaning: "Indica agente ou objeto que realiza uma função (origem latina).",
        examples: ["actor", "doctor", "editor", "author", "professor"]
      },
      // ── Adjetivos ────────────────────────────────────────────
      "ful": {
        type: "adjetivo",
        meaning: "Significa 'cheio de' ou 'caracterizado por' a qualidade do radical.",
        examples: ["beautiful", "helpful", "powerful", "careful", "grateful"]
      },
      "less": {
        type: "adjetivo",
        meaning: "Significa 'sem' ou 'ausência de' o que indica o radical.",
        examples: ["homeless", "careless", "endless", "hopeless", "useless"]
      },
      "able": {
        type: "adjetivo",
        meaning: "Significa 'capaz de ser' ou 'possível de'. Forma adjetivos a partir de verbos.",
        examples: ["readable", "possible", "capable", "suitable", "available"]
      },
      "ible": {
        type: "adjetivo",
        meaning: "Variante de '-able' (origem latina). Significa 'possível de' ou 'capaz de'.",
        examples: ["flexible", "possible", "visible", "terrible", "responsible"]
      },
      "ive": {
        type: "adjetivo",
        meaning: "Indica que algo tem a tendência ou natureza de realizar uma ação.",
        examples: ["active", "creative", "positive", "native", "effective"]
      },
      // ── Advérbios ────────────────────────────────────────────
      "ly": {
        type: "advérbio",
        meaning: "Converte adjetivos em advérbios de modo, indicando 'de maneira X'.",
        examples: ["quickly", "slowly", "carefully", "really", "actually"]
      },
      // ── Verbos ───────────────────────────────────────────────
      "ize": {
        type: "verbal",
        meaning: "Converte substantivos/adjetivos em verbos, indicando 'tornar-se X' ou 'fazer X'.",
        examples: ["organize", "realize", "recognize", "analyze", "modernize"]
      },
      "ise": {
        type: "verbal",
        meaning: "Variante britânica de '-ize'. Converte em verbo com sentido de 'tornar' ou 'praticar'.",
        examples: ["organise", "realise", "recognise", "advertise", "practise"]
      },
      "ate": {
        type: "verbal",
        meaning: "Forma verbos indicando processo ou ação, geralmente de origem latina.",
        examples: ["create", "educate", "generate", "operate", "communicate"]
      },
    };

    // Sufixos ordenados do maior para o menor para priorizar matches mais específicos
    const SUFFIXES_BY_LENGTH = [];

    // Comprimento mínimo do radical para evitar falsos positivos (ex: "is" não deve virar sufixo)
    const MIN_STEM_LENGTH = 2;

    function getSortedSuffixKeys() {
      return Object.keys(State.suffixDict).sort((a, b) => b.length - a.length);
    }

    /**
     * Detecta o sufixo morfológico mais longo de uma palavra normalizada.
     * Retorna o sufixo (string) ou null se não encontrado.
     */
    function detectSuffix(word) {
      if (!word || word.length < MIN_STEM_LENGTH + 1) return null;
      for (const suffix of getSortedSuffixKeys()) {
        // palavra.length >= suffix.length + MIN_STEM_LENGTH
        // (>= e não > para capturar stems exatamente no tamanho mínimo, ex: go+ing, lo+ve+s)
        if (
          word.endsWith(suffix) &&
          word.length >= suffix.length + MIN_STEM_LENGTH
        ) {
          return suffix;
        }
      }
      return null;
    }

    // ─── Modal de sufixo ────────────────────────────────────────
    function analyzeSuffixParts(rawWord, normalizedWord, suffix) {
      if (!suffix || !normalizedWord || !normalizedWord.endsWith(suffix)) return null;

      const match = rawWord.match(/^([^A-Za-z0-9'-]*)([A-Za-z0-9'-]+)([^A-Za-z0-9'-]*)$/);
      const prefix = match ? match[1] : '';
      const core = match ? match[2] : rawWord;
      const trailing = match ? match[3] : '';

      if (core.length < suffix.length + MIN_STEM_LENGTH) return null;
      if (core.slice(-suffix.length).toLowerCase() !== suffix) return null;

      let base = core.slice(0, -suffix.length);
      let extra = '';

      if (
        base.length >= MIN_STEM_LENGTH + 1 &&
        base[base.length - 1].toLowerCase() === base[base.length - 2].toLowerCase()
      ) {
        extra = base.slice(-1);
        base = base.slice(0, -1);
      }

      if (base.length < MIN_STEM_LENGTH) return null;

      return {
        prefix,
        base,
        extra,
        suffix: core.slice(-suffix.length),
        trailing,
      };
    }

    function isStateSuffix(suffix) {
      const data = State.suffixDict[suffix];
      if (!data || !data.meaning) return false;
      const meaning = data.meaning.toLowerCase();
      return data.type === 'substantivo' && /(estado|qualidade|condi[cç][aã]o|condicao|estado|natureza|caracteriza|caracterizado)/i.test(meaning);
    }

    function getSuffixVisualClass(suffix, normalizedWord) {
      if (!suffix) return 'suffix-derivative';
      const data = State.suffixDict[suffix];
      const wordEntry = normalizedWord ? State.dictionary[normalizedWord] : null;
      if (wordEntry && (wordEntry.primitiveWord || wordEntry.variationType)) {
        return 'suffix-derivative';
      }
      return isStateSuffix(suffix) ? 'suffix-state' : 'suffix-derivative';
    }

    function showSuffixModal(suffix, triggerEl, fullWord) {
      if (!State.visualConfig?.suffix?.visible) return;
      const data = State.suffixDict[suffix];
      if (!data) return;

      // Preparar header do modal
      document.getElementById('sm-suffix').textContent = '-' + suffix;
      document.getElementById('sm-type').textContent = data.type;
      document.getElementById('sm-meaning').textContent = data.meaning;

      // Renderizar exemplos
      document.getElementById('sm-examples').innerHTML =
        data.examples.map(ex => `<span class="suffix-example-pill">${ex}</span>`).join('');

      // Adicionar a palavra completa como contexto (opcional)
      if (fullWord) {
        const parts = analyzeSuffixParts(fullWord, fullWord, suffix);
        const decomposition = parts
          ? `${parts.base}${parts.extra ? ' + ' + parts.extra : ''} + ${suffix}`
          : `${fullWord.slice(0, fullWord.length - suffix.length)} + ${suffix}`;
        document.getElementById('sm-suffix').title = `Palavra completa: ${fullWord} = ${decomposition}`;
      }

      // Mostrar modal
      document.getElementById('suffix-modal').classList.add('open');

      // Highlight no elemento sufixo que disparou
      document.querySelectorAll('.suffix-span.active-suffix')
        .forEach(el => el.classList.remove('active-suffix'));

      if (triggerEl) {
        triggerEl.classList.add('active-suffix');

        // Também destacar a palavra inteira
        let wordSpan = triggerEl.closest('.word-span');
        if (wordSpan) {
          wordSpan.classList.add('highlighted');
        }
      }
    }

    function closeSuffixModal() {
      document.getElementById('suffix-modal').classList.remove('open');
      document.querySelectorAll('.suffix-span.active-suffix')
        .forEach(el => el.classList.remove('active-suffix'));
      document.querySelectorAll('.word-span.highlighted')
        .forEach(el => el.classList.remove('highlighted'));
    }

    function closeSuffixModalBackdrop(e) {
      if (e.target === document.getElementById('suffix-modal')) closeSuffixModal();
    }


    function renderSuffixList() {
      const keys = Object.keys(State.suffixDict).sort((a, b) => a.localeCompare(b));
      document.getElementById('suffix-count').textContent = `${keys.length} sufixo${keys.length !== 1 ? 's' : ''}`;
      const list = document.getElementById('suffix-list');
      if (keys.length === 0) {
        list.innerHTML = `<div class="suffix-list-empty">Nenhum sufixo cadastrado.</div>`;
        return;
      }
      list.innerHTML = keys.map(key => {
        const entry = State.suffixDict[key];
        const meaning = entry.meaning || '—';
        return `
      <div class="dict-entry" onclick="loadSuffixForm('${key.replace(/'/g, "\\'")}')">
        <div class="dict-entry-word">-${key}</div>
        <div class="dict-entry-trans">${entry.type || '—'} · ${meaning}</div>
      </div>
    `;
      }).join('');
    }

    function renderSuffixExampleTags() {
      const wrap = document.getElementById('suffix-examples-wrap');
      const input = document.getElementById('suffix-example-input');
      wrap.innerHTML = '';
      State.editSuffixExamples.forEach((example, index) => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.innerHTML = `${example} <span class="tag-remove" onclick="removeSuffixExample(${index})">×</span>`;
        wrap.appendChild(pill);
      });
      wrap.appendChild(input);
    }

    function handleSuffixExampleInput(e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addSuffixExample();
      }
    }

    function addSuffixExample() {
      const input = document.getElementById('suffix-example-input');
      const value = input.value.trim().replace(/,$/, '');
      if (!value) return;
      State.editSuffixExamples.push(value);
      input.value = '';
      renderSuffixExampleTags();
    }

    function removeSuffixExample(index) {
      State.editSuffixExamples.splice(index, 1);
      renderSuffixExampleTags();
    }

    function loadSuffixForm(suffix) {
      const entry = State.suffixDict[suffix] || { type: '', meaning: '', examples: [] };
      switchTab('suffixes');
      document.getElementById('suffix-key').value = suffix;
      document.getElementById('suffix-type').value = entry.type || '';
      document.getElementById('suffix-meaning').value = entry.meaning || '';
      State.editSuffixExamples = [...(entry.examples || [])];
      renderSuffixExampleTags();
      document.getElementById('suffix-save-success').style.display = 'none';
    }

    function clearSuffixForm() {
      document.getElementById('suffix-key').value = '';
      document.getElementById('suffix-type').value = '';
      document.getElementById('suffix-meaning').value = '';
      State.editSuffixExamples = [];
      renderSuffixExampleTags();
      document.getElementById('suffix-save-success').style.display = 'none';
    }


    function saveSuffixEntry() {
      const exampleInput = document.getElementById('suffix-example-input');
      if (exampleInput.value.trim()) {
        State.editSuffixExamples.push(exampleInput.value.trim());
        exampleInput.value = '';
      }

      const suffix = document.getElementById('suffix-key').value.trim().toLowerCase().replace(/^-+/, '');
      const type = document.getElementById('suffix-type').value.trim();
      const meaning = document.getElementById('suffix-meaning').value.trim();

      if (!suffix) {
        showNotif('Digite um sufixo!');
        return;
      }

      State.suffixDict[suffix] = {
        type,
        meaning,
        examples: State.editSuffixExamples.filter(Boolean),
      };

      saveSuffixDictionary();
      renderSuffixList();
      renderSuffixExampleTags();

      const activeCopy = new Set(State.activePages);
      activeCopy.forEach(p => deactivatePage(p));
      activeCopy.forEach(p => activatePage(p));

      const msg = document.getElementById('suffix-save-success');
      msg.style.display = 'block';
      setTimeout(() => msg.style.display = 'none', 2000);

      showNotif(`"-${suffix}" salvo nos sufixos!`);
    }
