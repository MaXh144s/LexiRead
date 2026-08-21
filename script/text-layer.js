// TEXT-LAYER: tokenização de texto do PDF (geometria/largura de caracteres) e ativação/desativação da camada interativa da página. Depende de state-data.js, word-model.js e suffix-system.js.

    // ═══════════════════════════════════════════════════════════
    // ATIVAR PÁGINA — extrai texto, merge de fragmentos, sufixos
    // ═══════════════════════════════════════════════════════════

    // ══ THRESHOLDS APRIMORADOS DE MERGE DE FRAGMENTOS ══
    // IMPORTANTE: com disableCombineTextItems:true, gaps que o pdf.js antes resolvia
    // internamente (com métricas reais de fonte) agora chegam crus até aqui — inclusive
    // espaços normais entre palavras. Um threshold fixo em px absoluto não funciona porque
    // a largura de um espaço real é proporcional ao tamanho da fonte (tipicamente ~20-30%
    // do fontSize), então em texto pequeno (rodapé, legenda) um espaço real pode ter só
    // 2-3px — menor que um threshold fixo de 5px — e acaba sendo colado sem separação.
    // Por isso os thresholds abaixo são relativos ao fontSize de cada par de tokens,
    // com piso/teto absolutos apenas para proteger casos extremos (fonte minúscula/gigante).
    const MERGE_GAP_RATIO   = 0.14;   // gap máx. considerado "mesma palavra" (fração do fontSize)
    const MERGE_GAP_MIN_PX  = 0.5;    // piso absoluto — evita threshold ~0 em fontes minúsculas
    const MERGE_GAP_MAX_PX  = 6;      // teto absoluto — evita merges grandes demais em títulos
    const MERGE_Y_RATIO     = 0.28;   // tolerância vertical (fração do fontSize) — mesma baseline
    const MERGE_Y_MIN_PX    = 0.8;
    const MERGE_Y_MAX_PX    = 5;
    const MERGE_ANGLE_TOLERANCE = 0.05; // ~2.9°: tokens só se fundem se tiverem a mesma orientação
    const FONT_SIZE_TOLERANCE = 0.15;   // Diferença relativa de tamanho de fonte aceita (15%)
    const MIN_MERGE_WIDTH = 0.2;    // px: limite mínimo de espaço para evitar falsos merges

    function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
    // Normaliza diferença de ângulo para [-π, π], evitando falso positivo perto do wrap-around
    function normalizeAngleDiff(d) { return Math.atan2(Math.sin(d), Math.cos(d)); }

    // ══ MEDIÇÃO REAL DE LARGURA DE CARACTERE (canvas measureText) ══
    // Em vez de uma tabela de pesos fixa e genérica (que só cobre bem o alfabeto
    // inglês comum e erra em acentos, dígitos, símbolos ou fontes muito
    // condensadas/expandidas), medimos a largura real de cada caractere com a
    // Canvas 2D API, usando a família de fonte que o próprio pdf.js já classificou
    // pra aquele texto (serif/sans-serif/monospace, ou o nome real pras 14 fontes
    // padrão como Times/Helvetica/Courier — ver textContent.styles). O resultado
    // ainda é calibrado no fim pra somar exatamente totalW (a largura real do PDF),
    // então a única coisa que muda é a distribuição interna — agora baseada na forma
    // real do glifo em vez de um palpite fixo.
    // Medimos numa fonte de referência (REF_FONT_SIZE) e escalamos linearmente pro
    // fontSize real do token — assim o cache é por (fontFamily, char), não por
    // (fontFamily, char, fontSize), evitando milhares de measureText repetidos pra
    // tamanhos de fonte ligeiramente diferentes.
    const REF_FONT_SIZE = 100;
    const measureCtx = document.createElement('canvas').getContext('2d');
    const charRefWidthCache = new Map(); // `${fontFamily}\u0000${char}` -> largura em REF_FONT_SIZE

    function measureCharRefWidth(ch, fontFamily) {
      const key = fontFamily + '\u0000' + ch;
      let w = charRefWidthCache.get(key);
      if (w === undefined) {
        measureCtx.font = `${REF_FONT_SIZE}px ${fontFamily}`;
        w = measureCtx.measureText(ch).width;
        if (!(w > 0)) w = REF_FONT_SIZE * 0.5; // fallback de segurança (glifo não medível, ex: controle)
        charRefWidthCache.set(key, w);
      }
      return w;
    }

    // Retorna um array de larguras (px), uma por caractere de `str`, cuja soma total
    // é EXATAMENTE igual a totalW (a largura real do item, vinda do PDF) — só a
    // distribuição interna entre os caracteres é que passa a ser proporcional à
    // largura real medida de cada glifo, em vez de uniforme ou de uma tabela fixa.
    function estimateCharWidths(str, totalW, fontFamily, fontSize) {
      const n = str.length;
      if (n === 0) return [];
      const family = fontFamily || 'sans-serif';
      const scaleBySize = (fontSize || REF_FONT_SIZE) / REF_FONT_SIZE;
      const weights = new Array(n);
      let sumW = 0;
      for (let i = 0; i < n; i++) {
        const w = measureCharRefWidth(str[i], family) * scaleBySize;
        weights[i] = w;
        sumW += w;
      }
      if (sumW <= 0) sumW = n; // fallback de segurança, não deveria ocorrer
      const scale = totalW / sumW;
      const widths = new Array(n);
      for (let i = 0; i < n; i++) widths[i] = weights[i] * scale;
      return widths;
    }

    // Soma as larguras calibradas no intervalo [start, end) — usado para obter a
    // largura real de uma sub-string (palavra, espaço, delimitador) dentro do item.
    function sumWidths(widths, start, end) {
      let s = 0;
      const lim = Math.min(end, widths.length);
      for (let i = start; i < lim; i++) s += widths[i];
      return s;
    }

    function parsePdfFontAttributes(item, styles) {
      const fontName = item.fontName || '';
      const textStyle = styles && fontName ? styles[fontName] : null;
      let fontFamily = (textStyle && textStyle.fontFamily) || fontName || 'sans-serif';

      const normalizedName = fontName.replace(/^[^+]+\+/, '');
      const hasItalic = /(?:italic|oblique|slanted)/i.test(normalizedName);
      const hasBold = /(?:bold|black|heavy|semibold|extrabold|ultrabold)/i.test(normalizedName);

      let fontStyle = hasItalic ? 'italic' : 'normal';
      let fontWeight = hasBold ? 'bold' : 'normal';

      if (textStyle) {
        if (textStyle.fontStyle) fontStyle = textStyle.fontStyle;
        if (textStyle.fontWeight) fontWeight = textStyle.fontWeight;
      }

      return { fontName, fontFamily, fontStyle, fontWeight };
    }

    // ══ TOKENIZAÇÃO INTELIGENTE DE PALAVRAS E DELIMITADORES ══
    // Separa palavras reais de caracteres estruturais:
    // - Aspas: " '
    // - Pontuação: . , ; : ! ?
    // - Delimitadores: / ( ) [ ] { }
    // - Apóstrofos: diferencia contrações (I'm, don't) de aspas ('she')
    function smartTokenize(rawString) {
      if (!rawString) return [];

      // Normalizar apóstrofos curvos (U+2018, U+2019) para ASCII (U+0027)
      // PDFs frequentemente usam tipografia curva; sem isso "I'm" vira "I" + delimitador + "m"
      const str = rawString
        .replace(/[\u2018\u2019\u02BC\u02B9]/g, "'")  // apóstrofos curvos → '
        .replace(/[\u201C\u201D]/g, '"');              // aspas duplas curvas → "

      const tokens = [];
      let i = 0;

      while (i < str.length) {
        const char = str[i];

        // ── Caracteres estruturais puros (sempre delimitadores) ──
        if (/["«».,;:!?\/()[\]{}—–]/.test(char)) {
          tokens.push({ str: char, isWord: false });
          i++;
          continue;
        }

        // ── Hífen: sempre delimitador ──
        if (char === '-') {
          tokens.push({ str: char, isWord: false });
          i++;
          continue;
        }

        // ── Apóstrofo ASCII: análise contextual ──
        if (char === "'") {
          const hasBefore = i > 0 && /[A-Za-z]/.test(str[i - 1]);
          const hasAfter  = i < str.length - 1 && /[A-Za-z]/.test(str[i + 1]);

          if (hasBefore && hasAfter) {
            // Apóstrofo interno numa contração já capturada: não deve chegar aqui sozinho
            // mas se chegar, volta para capturar a palavra completa
            let j = i - 1;
            while (j > 0 && /[A-Za-z']/.test(str[j - 1])) j--;
            let wordStr = '';
            while (j < str.length && /[A-Za-z']/.test(str[j])) {
              wordStr += str[j];
              j++;
            }
            tokens.push({ str: wordStr, isWord: true });
            i = j;
            continue;
          }

          // Apóstrofo isolado = delimitador
          tokens.push({ str: char, isWord: false });
          i++;
          continue;
        }

        // ── Letras e números: capturar como palavra (inclui contrações internas) ──
        if (/[A-Za-z0-9]/.test(char)) {
          let wordStr = '';

          while (i < str.length) {
            const c = str[i];

            if (/[A-Za-z0-9]/.test(c)) {
              wordStr += c;
              i++;
            } else if (c === "'" && i < str.length - 1 && /[A-Za-z]/.test(str[i - 1]) && /[A-Za-z]/.test(str[i + 1])) {
              // Apóstrofo interno em contração (don't, I'm, they're)
              wordStr += c;
              i++;
            } else {
              break;
            }
          }

          tokens.push({ str: wordStr, isWord: true });
          continue;
        }

        // ── Espaços e outros: pular ──
        i++;
      }

      return tokens;
    }

    // ══ FUNÇÃO: Remove delimitadores estruturais de ambas as bordas
    function stripStructuralDelimiters(rawStr) {
      return rawStr
        .replace(/[\u2018\u2019\u02BC\u02B9]/g, "'") // normalizar apóstrofos curvos
        .replace(/^["«»"".,;:!?\/()[\]{}—–\-]+/, '')
        .replace(/["«»"".,;:!?\/()[\]{}—–\-]+$/, '');
    }

    // ══ FUNÇÃO: Calcula a estrutura visual de um token
    // Retorna { prefix, cleanWord, trailing } separando delimitadores da palavra.
    // Usa busca de índice em vez de regex para lidar com todos os tipos de aspas.
    function analyzeTokenStructure(rawStr) {
      if (!rawStr) return { prefix: '', cleanWord: '', trailing: '' };

      // Conjunto de caracteres que são delimitadores estruturais (nunca parte da palavra)
      const DELIMITERS = new Set([
        '"', '"', '"', "'", '\u2018', '\u2019', '\u201A', '\u201B',
        '«', '»', '(', ')', '[', ']', '{', '}',
        '.', ',', ':', ';', '!', '?', '/', '—', '–', '-', '…', '\\'
      ]);

      // Encontrar primeiro e último caractere alfanumérico ou apóstrofo-interno
      let start = 0;
      let end = rawStr.length - 1;

      while (start <= end && DELIMITERS.has(rawStr[start])) start++;
      while (end >= start && DELIMITERS.has(rawStr[end])) end--;

      if (start > end) {
        // Só delimitadores
        return { prefix: rawStr, cleanWord: '', trailing: '' };
      }

      const prefix   = rawStr.slice(0, start);
      const cleanWord = rawStr.slice(start, end + 1);
      const trailing = rawStr.slice(end + 1);

      return { prefix, cleanWord, trailing };
    }

    async function activatePage(pageNum) {
      State.activePages.add(pageNum);
      const entry = State.renderedPages.get(pageNum);
      if (!entry) return;

      // A camada de texto se posiciona com base em entry.canvas.height (px do viewport),
      // então garantimos que o canvas já tenha suas dimensões definidas antes de calcular
      // a posição das palavras — mesmo que o desenho em si ainda esteja em andamento.
      if (!entry.rendered) {
        await renderPageCanvas(pageNum);
      }

      const { page, viewport, textLayer } = entry;

      if (textLayer.dataset.activated === '1') return;
      textLayer.dataset.activated = '1';
      textLayer.classList.add('active');

      let textContent = entry.textContent;
      if (!textContent) {
        // disableCombineTextItems: true evita que o pdf.js funda itens de texto
        // adjacentes quando o ajuste de posição (TJ-array) é pequeno demais.
        // Sem isso, casos como "17:" + "Minimize" (tab-stop) chegam já concatenados
        // em item.str ("17:Minimize"), sem fronteira nenhuma pra recuperar — e aí
        // nem o split por espaço nem o merge por gap em px têm como diferenciar
        // esse caso de uma palavra realmente partida (ex: "Java" + "Script", gap ≈ 0px).
        // Com a flag, cada run vira um item separado com x real, e o PASSO 2
        // (merge por threshold) decide corretamente os dois casos usando só geometria.
        textContent = await page.getTextContent({ disableCombineTextItems: true });
        entry.textContent = textContent;
      }

      // ── PASSO 1: Expandir todos os itens em tokens atômicos ──────
      // Cada token = { str, x, y, w, fontSize, angle, isWord }
      // onde x/y/w já estão em espaço de viewport (px).
      // Usa smartTokenize() para dividir por delimitadores estruturais
      const allTokens = [];

      textContent.items.forEach(item => {
        if (!item.str || !item.str.trim()) return;

        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const x = tx[4];
        const y = tx[5];
        const angle = Math.atan2(tx[1], tx[0]);
        const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
        const totalW = item.width * viewport.scale;
        const fontAttrs = parsePdfFontAttributes(item, textContent.styles);
        // Largura calibrada por caractere (ver estimateCharWidths) — substitui a média
        // uniforme antiga, que fazia o espaço real parecer tão largo quanto uma letra
        // média (ou mais estreito que o real em strings longas), gerando gaps calculados
        // abaixo do threshold e colando palavras que tinham espaço de verdade entre elas.
        const charWidths = estimateCharWidths(item.str, totalW, fontAttrs.fontFamily, fontSize);

        let offsetX = 0;
        let charCursor = 0; // índice no item.str original, avança junto com os splits abaixo

        // Primeira divisão: separar por espaços
        const spaceParts = item.str.split(/(\s+)/);

        spaceParts.forEach(spacePart => {
          if (spacePart === '') return; // split() pode gerar strings vazias nas bordas

          const spacePartW = sumWidths(charWidths, charCursor, charCursor + spacePart.length);

          if (spacePart.trim() === '') {
            // É espaço: pular (não criar token), mas usar a largura real calibrada
            offsetX += spacePartW;
            charCursor += spacePart.length;
            return;
          }

          // Segunda divisão: usar smartTokenize para separar delimitadores estruturais
          const smartTokens = smartTokenize(spacePart);
          let localCursor = 0;

          smartTokens.forEach(smartToken => {
            const tokLen = smartToken.str.length;
            const tokenW = sumWidths(charWidths, charCursor + localCursor, charCursor + localCursor + tokLen);

            // Criar token apenas se for uma palavra ou se tiver conteúdo visível
            // Palavras: incluir sempre (isWord = true)
            // Delimitadores estruturais: incluir também, mas marcar
            allTokens.push({
              str: smartToken.str,
              x: x + offsetX,
              y,
              w: Math.max(tokenW, 0.1),
              fontSize,
              angle,
              fontFamily: fontAttrs.fontFamily,
              fontStyle: fontAttrs.fontStyle,
              fontWeight: fontAttrs.fontWeight,
              fontName: fontAttrs.fontName,
              isWord: smartToken.isWord // true = palavra real, false = delimitador/pontuação
            });

            offsetX += tokenW;
            localCursor += tokLen;
          });

          charCursor += spacePart.length;
        });
      });

      // ── PASSO 2: Merge inteligente de fragmentos vizinhos ────────
      // Algoritmo aprimorado:
      // 1. Verifica proximidade horizontal (gap < threshold)
      // 2. Verifica alinhamento vertical (Y similar)
      // 3. Verifica compatibilidade de tamanho de fonte
      // 4. Evita falsos positivos (overlap, colunas diferentes)
      // 5. NÃO faz merge se um dos tokens é um delimitador estrutural
      const words = []; // lista final de palavras já merged

      allTokens.forEach(tok => {
        const prev = words[words.length - 1];

        if (!prev) {
          words.push({ ...tok });
          return;
        }

        // Não fazer merge com delimitadores estruturais
        // Eles devem permanecer como tokens independentes
        if (!tok.isWord || !prev.isWord) {
          words.push({ ...tok });
          return;
        }

        // Projeta o deslocamento entre os dois tokens na direção da linha de base (ângulo
        // do texto), em vez de usar x/y crus — necessário pra texto rotacionado (rótulos
        // verticais, cabeçalhos girados) não quebrar a detecção de gap/mesma-linha.
        const angleDiff = Math.abs(normalizeAngleDiff(tok.angle - prev.angle));
        const sameOrientation = angleDiff < MERGE_ANGLE_TOLERANCE;

        const refAngle = prev.angle;
        const dx = tok.x - prev.x;
        const dy = tok.y - prev.y;
        const along = dx * Math.cos(refAngle) + dy * Math.sin(refAngle); // distância ao longo da baseline
        const perp  = -dx * Math.sin(refAngle) + dy * Math.cos(refAngle); // distância perpendicular à baseline

        // Gap horizontal real entre fim do token anterior e início deste (na direção do texto)
        const gap = along - prev.w;

        // Thresholds relativos ao tamanho de fonte do par (ver comentário nas constantes):
        // um espaço real tem largura proporcional ao fontSize, então o limite de decisão
        // também precisa ser — um número fixo em px erra tanto pra fonte pequena quanto pra grande.
        const avgFontSize = (tok.fontSize + prev.fontSize) / 2;
        const gapThreshold = clamp(avgFontSize * MERGE_GAP_RATIO, MERGE_GAP_MIN_PX, MERGE_GAP_MAX_PX);
        const yTolerance = clamp(avgFontSize * MERGE_Y_RATIO, MERGE_Y_MIN_PX, MERGE_Y_MAX_PX);

        // Verificações para fusão:
        const sameLineY = sameOrientation && Math.abs(perp) < yTolerance;
        const closeGapH = gap < gapThreshold && gap > -gapThreshold;
        const compatFontSize = Math.abs(tok.fontSize - prev.fontSize) / Math.max(tok.fontSize, prev.fontSize) < FONT_SIZE_TOLERANCE;
        const compatFontFamily = tok.fontFamily === prev.fontFamily;
        const compatFontStyle = tok.fontStyle === prev.fontStyle;
        const compatFontWeight = tok.fontWeight === prev.fontWeight;
        const notOverlapping = gap > -gapThreshold * 2;
        const minimalWidth = Math.abs(gap) > MIN_MERGE_WIDTH || gap > 0;

        if (
          sameLineY &&
          closeGapH &&
          compatFontSize &&
          compatFontFamily &&
          compatFontStyle &&
          compatFontWeight &&
          notOverlapping &&
          minimalWidth
        ) {
          // MERGE: concatenar texto, expandir largura, manter posição inicial
          const gap_to_add = Math.max(gap, 0); // só adiciona gap se positivo
          prev.str += tok.str;
          prev.w += gap_to_add + tok.w;
          // Manter os atributos (x, y, fontSize, angle) do primeiro fragmento
        } else {
          // Novo token independente
          words.push({ ...tok });
        }
      });

      // ── PASSO 3: Renderizar words como spans interativos ────────
      let matchCount = 0;
      textLayer.innerHTML = '';

      words.forEach(word => {
        // Pular delimitadores estruturais (aspas, pontuação, barras, parênteses)
        // Apenas renderizar palavras reais
        if (!word.isWord) {
          return;
        }

        // ── Análise estrutural: separar delimitadores da palavra real ──
        const structure = analyzeTokenStructure(word.str);
        const { prefix, cleanWord: extractedWord, trailing } = structure;

        // Se não há palavra real, pular
        if (!extractedWord || !extractedWord.trim()) {
          return;
        }

        const normalizedWord = normalizeWord(extractedWord);
        const hasTrans = normalizedWord && !!State.dictionary[normalizedWord];
        const suffix = normalizedWord ? detectSuffix(normalizedWord) : null;
        const suffixParts = suffix ? analyzeSuffixParts(extractedWord, normalizedWord, suffix) : null;

        // ── Calcular posição e largura apenas da palavra (sem delimitadores) ──
        // Usa a mesma calibração por peso de glifo (estimateCharWidths/sumWidths)
        // já usada na tokenização — uma média uniforme (w / length) supõe largura
        // igual pra todo caractere, o que erra visivelmente em palavras com mistura
        // de caracteres estreitos (i, l, j, .) e largos (m, w, M, W), fazendo o
        // underline (que usa width: 100% do span) ficar mais curto ou mais longo
        // que a palavra renderizada.
        const wordCharWidths = estimateCharWidths(word.str, word.w, word.fontFamily, word.fontSize);
        const prefixW = sumWidths(wordCharWidths, 0, prefix.length);
        const cleanWordW = sumWidths(wordCharWidths, prefix.length, prefix.length + extractedWord.length);

        const span = document.createElement('span');
        span.className = 'word-span';
        if (hasTrans) span.classList.add('has-translation');
        span.dataset.raw = word.str;
        span.dataset.word = normalizedWord;
        span.dataset.hasSuffix = suffix ? '1' : '0';
        span.dataset.fontFamily = word.fontFamily;
        span.dataset.fontStyle = word.fontStyle;
        span.dataset.fontWeight = word.fontWeight;
        span.dataset.fontName = word.fontName;
        span.dataset.fontSize = word.fontSize.toFixed(2);

        // ── Posição: deslocar para o início da palavra real (sem prefix) ──
        const baseBottom = entry.canvas.height - word.y;
        span.style.left = (word.x + prefixW) + 'px';
        span.style.fontSize = word.fontSize + 'px';
        span.style.fontFamily = word.fontFamily;
        span.style.fontStyle = word.fontStyle;
        span.style.fontWeight = word.fontWeight;
        span.style.width = cleanWordW + 'px'; // Apenas a palavra limpa

        span.style.bottom = baseBottom + 'px';

        if (word.angle !== 0) span.style.transform = `rotate(${-word.angle}rad)`;

        // ── Conteúdo interno: base + extra + (opcional) sufixo ───────
        if (suffix && suffixParts) {
          span.appendChild(document.createTextNode(suffixParts.prefix + suffixParts.base));

          if (suffixParts.extra) {
            const extraEl = document.createElement('span');
            extraEl.className = 'word-extra';
            extraEl.textContent = suffixParts.extra;
            span.appendChild(extraEl);
          }

          const suffixEl = document.createElement('span');
          const suffixClass = getSuffixVisualClass(suffix, normalizedWord);
          suffixEl.className = `suffix-span ${suffixClass}`;
          suffixEl.dataset.suffix = suffix;
          suffixEl.dataset.base = suffixParts.base;
          if (suffixParts.extra) suffixEl.dataset.extra = suffixParts.extra;
          suffixEl.textContent = suffixParts.suffix;

          suffixEl.addEventListener('click', (e) => {
            e.stopPropagation();
            showSuffixModal(suffix, suffixEl, normalizedWord);
          });

          span.appendChild(suffixEl);
          if (suffixParts.trailing) {
            span.appendChild(document.createTextNode(suffixParts.trailing));
          }
        } else {
          span.textContent = extractedWord; // Renderizar só a palavra limpa
        }

        // Clique na palavra completa
        span.addEventListener('click', (e) => {
          // Se clicou no sufixo, já foi tratado acima via stopPropagation
          if (e.target.classList.contains('suffix-span')) return;

          e.stopPropagation();
          if (hasTrans) {
            showTooltip(e, normalizedWord);
          } else {
            openEditForUnknownWord(normalizedWord || extractedWord.toLowerCase().trim(), e);
          }
        });

        if (hasTrans) matchCount++;
        textLayer.appendChild(span);
      });

      entry.matchCount = matchCount;
      if (pageNum === State.currentPage) {
        refreshPageMatchStat(pageNum);
      }
    }

    function refreshPageMatchStat(pageNum) {
      const entry = State.renderedPages.get(pageNum);
      if (!entry || entry.matchCount == null) {
        document.getElementById('stat-match').textContent = '—';
        return;
      }

      document.getElementById('stat-match').textContent = `${entry.matchCount} palavras`;
    }

    function deactivatePage(pageNum) {
      State.activePages.delete(pageNum);
      const entry = State.renderedPages.get(pageNum);
      if (!entry) return;

      // Remover interatividade mas manter canvas visível
      const { textLayer } = entry;
      textLayer.classList.remove('active');
      textLayer.dataset.activated = '0';
      textLayer.innerHTML = '';
    }