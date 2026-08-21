// WORD-MODEL: gerenciamento de palavras primitivas/derivadas do dicionário. Depende de state-data.js.

    // ═══════════════════════════════════════════════════════════
    // GERENCIAMENTO DE PALAVRAS PRIMITIVAS E DERIVADAS
    // ═══════════════════════════════════════════════════════════

    // ── Estrutura expandida de palavra no dicionário ──
    // Estrutura base:
    // {
    //   translations: [string],
    //   examples: [string],
    //   // ─ Novo (opcional) ─
    //   primitiveWord?: string,      // "walk" para "walking"
    //   suffix?: string,              // "ing" para "walking"
    //   variationType?: string,       // "continuous", "comparative", etc
    //   description?: string          // "Continuous form of walk"
    // }

    function addWordWithPrimitive(word, translations, examples, primitiveWord = null, suffix = null, variationType = null, description = null) {
      const entry = {
        translations: Array.isArray(translations) ? translations : [translations],
        examples: Array.isArray(examples) ? examples : examples ? [examples] : []
      };

      if (primitiveWord) {
        entry.primitiveWord = primitiveWord;
      }
      if (suffix) {
        entry.suffix = suffix;
      }
      if (variationType) {
        entry.variationType = variationType;
      }
      if (description) {
        entry.description = description;
      }

      State.dictionary[word] = entry;
      saveDictionary();
    }

    function getWordInfo(word) {
      return State.dictionary[word] || null;
    }

    function getWordPrimitive(word) {
      const info = getWordInfo(word);
      return info?.primitiveWord || null;
    }

    function getWordVariationType(word) {
      const info = getWordInfo(word);
      return info?.variationType || null;
    }
    function normalizeWord(word) {
      return word
        .replace(/[\u2018\u2019\u02BC\u02B9]/g, "'") // apóstrofos curvos → ASCII
        .toLowerCase()
        .replace(/[^a-z0-9']/g, '')   // manter apóstrofo interno para contrações
        .replace(/^'+|'+$/g, '')       // remover apóstrofos das bordas
        .trim();
    }

