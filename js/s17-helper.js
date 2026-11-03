/* ==========================================================================
   Ehyeh Helper — Layer 1 (BUILD_QUEUE #240), staged build, Finish Program II
   Wave B. Built-in helper: offline, no AI, no external network calls.
   Answers only from data already in the app: the lexicon (data/lexicon.json),
   Easton's dictionary (data/easton.json, via SSB.searchEaston), the CHECKED
   word studies (HAGAH_WS_SIDECAR), reference-jump via SSB.parseReference,
   and the curated pronunciation set (data/pron/*.mp3, Kokoro house voice).
   This layer drives the app through its own DOM, like the W2-C layer (s16).
   The "Ask the helper" door (Layer 2, #241) renders its honest unavailable
   state only — no endpoint is wired in this staged build.
   ========================================================================== */
(function () {
  'use strict';

  var COVERAGE_LINE = "The helper answers from what's already in Ehyeh — the word studies, the dictionary, and the verses themselves. It can't explain or teach, it can't search the verses by topic, and if the answer isn't in the book, it will say so.";
  var ASK_LABEL = 'A helper, not a teacher — check the verses. Answers come only from the passages shown, and the helper can be wrong.';
  var ASK_SERVER_LINE = 'Questions go through our server to a free AI service. The rest of Ehyeh works without any connection; this one door needs one.';
  var AWAY_LINE = 'The helper is away right now. Everything else in Ehyeh works as always.';
  var CAND_KEY = 'ehyeh.pron.candidates.v1';

  /* Curated pronunciation set — extracted by hand from CHECKED entry WS-0001
     (WS-0002 contributes no Hebrew/Greek headwords). Scholarly transliteration
     is the lexicon's stored form; respelling is the checked plain-English form;
     speak is the exact text the Kokoro engine read for the clip. */
  var PRON = [
    { id: 'H3045', word: 'יָדַע', translit: 'yâdaʻ', respell: 'yah-DAH', speak: 'Yada', gloss: 'to know', from: 'WS-0001 · Genesis 4:1 — “The man knew (yadaʿ) Eve his wife”' },
    { id: 'H7069', word: 'קָנָה', translit: 'qânâh', respell: 'kah-NAH', speak: 'Kanah', gloss: 'to get, create, possess', from: 'WS-0001 · Genesis 4:1 — Eve’s qaniti, “I have gotten a man”' },
    { id: 'H3068', word: 'יְהֹוָה', translit: 'Yᵉhôvâh', respell: 'yah-WEH', speak: 'Yahweh', gloss: 'the LORD — God’s personal name', from: 'WS-0001 · the name YHWH throughout Genesis 4' },
    { id: 'H430', word: 'אֱלֹהִים', translit: 'ʼĕlôhîym', respell: 'eh-loh-HEEM', speak: 'Elohim', gloss: 'God', from: 'WS-0001 · Elohim, “God”, in Genesis 1–4' },
    { id: 'H8549', word: 'תָּמִים', translit: 'tâmîym', respell: 'tah-MEEM', speak: 'Tameem', gloss: 'blameless, whole', from: 'WS-0001 · Genesis 6:9 — Noah “blameless (tamim)”' },
    { id: 'H376', word: 'אִישׁ', translit: 'ʼîysh', respell: 'eesh', speak: 'Eesh', gloss: 'a man', from: 'WS-0001 · Genesis 25 — ish sadeh, ish tam' },
    { id: 'H853', word: 'אֵת', translit: 'ʼêth', respell: 'et', speak: 'Et', gloss: '(points to the object of a verb; not translated)', from: 'WS-0001 · Genesis 4:1 — the particle ʾet in Eve’s words' },
    { id: 'H3063', word: 'יְהוּדָה', translit: 'Yᵉhûwdâh', respell: 'yeh-hoo-DAH', speak: 'Yehuda', gloss: 'Judah', from: 'WS-0001 · Judah (Yehudah), Genesis 37' },
    { id: 'G2962', word: 'κύριος', translit: 'kýrios', respell: 'KEE-ree-os', speak: 'Kyrios', gloss: 'Lord, master', from: 'WS-0001 · Romans 10:9 — “Jesus is Lord (Kyrios)”' },
    { id: 'G2455', word: 'Ἰούδας', translit: 'Ioúdas', respell: 'ee-OO-dahs', speak: 'Ioodas', gloss: 'Judas / Jude', from: 'WS-0001 · Greek Ioudas, form of Hebrew Yehudah' }
  ];
  var PRON_BY_ID = {};
  PRON.forEach(function (p) { PRON_BY_ID[p.id] = p; });
  var NAME_CLIP = 'data/pron/name-ehyeh.mp3';

  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) { Object.keys(attrs).forEach(function (k) {
      if (k === 'class') { n.className = attrs[k]; }
      else { n.setAttribute(k, attrs[k]); }
    }); }
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid == null) { continue; }
      n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return n;
  }
  function clear(node) { while (node && node.firstChild) { node.removeChild(node.firstChild); } }

  /* ---------------- styles (the app's own palette + sheet pattern) ------- */
  function injectStyles() {
    if ($('#eh-style')) { return; }
    var css = [
      '#eh-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10000; max-height: 88vh; overflow-y: auto; background: var(--hg-vellum, #FDFBF7); color: var(--ink); border-top: 2px solid var(--gold, #9c7f3a); box-shadow: 0 -12px 40px rgba(0,0,0,0.45); padding: 1rem 1.1rem 1.4rem; }',
      '@media (min-width: 900px) { #eh-sheet { left: auto; top: 0; bottom: 0; width: 430px; max-height: none; border-top: none; border-left: 2px solid var(--gold, #9c7f3a); box-shadow: -12px 0 40px rgba(0,0,0,0.45); } }',
      '#eh-sheet h3 { margin: 0 0 0.4rem; font-size: 1.25rem; }',
      '#eh-sheet h4 { margin: 1.1rem 0 0.4rem; font-size: 1.02rem; }',
      '.eh-cover { color: var(--muted); font-size: 1rem; line-height: 1.5; border-left: 3px solid var(--gold, #9c7f3a); padding: 0.45rem 0.7rem; background: var(--accent-soft, #e4ece6); margin: 0.6rem 0; }',
      '.eh-row { display: flex; gap: 0.45rem; flex-wrap: wrap; align-items: center; margin: 0.45rem 0; }',
      '.eh-input { flex: 1 1 10rem; border: 1px solid var(--line); border-radius: 4px; padding: 0.55rem 0.65rem; font: inherit; font-size: 1rem; background: #fff; color: var(--ink); }',
      '.eh-btn { border: 1px solid var(--line); background: var(--paper, #fffdf7); color: var(--ink); border-radius: 4px; padding: 0.55rem 0.95rem; font: inherit; font-size: 1rem; cursor: pointer; min-height: 2.75rem; }',
      '.eh-btn:hover { border-color: var(--accent); }',
      '.eh-btn.primary { background: var(--accent); border-color: var(--accent); color: #04121A; font-weight: 600; }',
      '.eh-note { color: var(--muted); font-size: 1rem; line-height: 1.5; }',
      '.eh-card { border: 1px solid var(--line); border-radius: 6px; padding: 0.7rem 0.85rem; margin: 0 0 0.6rem; background: var(--paper, #fffdf7); }',
      '.eh-card .eh-orig { font-size: 1.15rem; }',
      '.eh-say { border-top: 1px dashed var(--line); margin-top: 0.55rem; padding-top: 0.55rem; }',
      '.eh-translit { font-style: italic; }',
      '.eh-respell { font-weight: 600; }',
      '.eh-close { float: right; }',
      '.eh-ws-item { display: block; width: 100%; text-align: left; }',
      '#eh-word-panel-say { border-top: 1px dashed var(--line); margin-top: 0.8rem; padding-top: 0.6rem; }',
      '.wp-say-slot #eh-word-panel-say { border-top: none; margin-top: 0; padding-top: 0; }',
      '#eh-helper-btn { display: inline-flex; align-items: center; gap: 0.5rem; border-radius: 999px; padding: 0.4rem 1rem 0.4rem 0.45rem; min-height: 2.75rem; font-size: 1rem; }',
      '#eh-helper-btn .eh-helper-pic { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; }'
    ].join('\n');
    document.head.appendChild(el('style', { id: 'eh-style' }, css));
  }

  /* ---------------- data loading (resident app data only) ---------------- */
  var lexPromise = null, eastPromise = null;
  function ensureLexicon() {
    var db = window.SSB && SSB.db();
    if (db && db.lexicon && Object.keys(db.lexicon).length) { return Promise.resolve(true); }
    if (!lexPromise) {
      lexPromise = fetch('data/lexicon.json').then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.json();
      }).then(function (d) {
        if (window.SSB_DATA) { window.SSB_DATA.lexicon = d; }
        return true;
      }).catch(function () { lexPromise = null; return false; });
    }
    return lexPromise;
  }
  function ensureEaston() {
    var db = window.SSB && SSB.db();
    if (db && db.easton && Object.keys(db.easton).length) { return Promise.resolve(true); }
    if (!eastPromise) {
      eastPromise = fetch('data/easton.json').then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.json();
      }).then(function (d) {
        if (window.SSB_DATA) { window.SSB_DATA.easton = d; }
        return true;
      }).catch(function () { eastPromise = null; return false; });
    }
    return eastPromise;
  }

  /* ---------------- pronunciation playback + the honest ladder ----------- */
  function phoneVoice(text, btn) {
    try {
      if (!('speechSynthesis' in window)) {
        window.alert('This phone has no voice to speak with.');
        return;
      }
      var u = new SpeechSynthesisUtterance(text);
      u.rate = 0.85;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { /* the text rung always remains */ }
  }
  function playClip(src, noteNode) {
    var a = new Audio();
    var failed = false;
    function fail() {
      if (failed) { return; }
      failed = true;
      if (noteNode) {
        noteNode.textContent = 'The house recording needs a connection once to arrive. You can still read how it sounds above, or use your phone’s voice.';
        noteNode.hidden = false;
      }
    }
    a.addEventListener('error', fail);
    a.src = src;
    var p = a.play();
    if (p && p.catch) { p.catch(fail); }
  }
  /* A "Say it" block for one Strong's number. Transliteration always shown;
     house clip where the curated set has one; phone's voice labeled as such;
     no syllable breakdowns anywhere (none exist in the data). */
  function sayItBlock(num, lex) {
    var wrap = el('div', { 'class': 'eh-say' });
    var pron = PRON_BY_ID[num];
    var translit = pron ? pron.translit : (lex ? lex.transliteration : '');
    var row = el('div', { 'class': 'eh-row' });
    row.appendChild(el('strong', {}, 'Say it: '));
    if (translit) { row.appendChild(el('span', { 'class': 'eh-translit' }, translit)); }
    if (pron) { row.appendChild(el('span', { 'class': 'eh-respell' }, ' — say: ' + pron.respell)); }
    wrap.appendChild(row);
    var btns = el('div', { 'class': 'eh-row' });
    var note = el('p', { 'class': 'eh-note', hidden: 'hidden' });
    if (pron) {
      var houseBtn = el('button', { 'class': 'eh-btn', type: 'button' }, '▶ House voice');
      houseBtn.addEventListener('click', function () { note.hidden = true; playClip('data/pron/' + pron.id + '.mp3', note); });
      btns.appendChild(houseBtn);
    }
    var speakText = pron ? pron.speak : String(translit || '').replace(/[ʼʿᵉâêîôûāēīōūʻ]/g, '');
    if (speakText) {
      var phoneBtn = el('button', { 'class': 'eh-btn', type: 'button' }, '▶ Phone’s voice');
      phoneBtn.addEventListener('click', function () { phoneVoice(speakText, phoneBtn); });
      btns.appendChild(phoneBtn);
      var lab = el('span', { 'class': 'eh-note' }, pron
        ? 'The phone’s voice is your phone’s own voice — it may say it imperfectly.'
        : 'No house recording for this word yet. Your phone’s own voice may say it imperfectly.');
      btns.appendChild(lab);
    }
    if (!pron) {
      var candBtn = el('button', { 'class': 'eh-btn', type: 'button' }, 'Remember this word for a future recording');
      candBtn.addEventListener('click', function () {
        addCandidate(num, translit, lex ? lex.definition : '');
        candBtn.textContent = 'Remembered ✓';
        candBtn.disabled = true;
        renderCandidates();
      });
      btns.appendChild(candBtn);
    }
    wrap.appendChild(btns);
    wrap.appendChild(note);
    return wrap;
  }

  /* ---------------- on-device candidate list ------------------------------ */
  function loadCandidates() {
    try {
      var raw = localStorage.getItem(CAND_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function addCandidate(num, translit, gloss) {
    var arr = loadCandidates();
    if (arr.some(function (c) { return c.id === num; })) { return; }
    arr.push({ id: num, transliteration: translit || '', gloss: String(gloss || '').slice(0, 160), added: new Date().toISOString().slice(0, 10) });
    try { localStorage.setItem(CAND_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  /* ---------------- passage jump (the app's own reader) ------------------- */
  function gotoPassage(b, c, v) {
    try {
      var modeBtn = document.querySelector('[data-hg-mode="study"]');
      if (modeBtn) { modeBtn.click(); }
      var door = Array.prototype.slice.call(document.querySelectorAll('button.hg6-door')).filter(function (d) { return d.textContent.trim() === 'Bible'; })[0];
      if (door) { door.click(); }
      var tab = document.querySelector('[data-hg-tab="scripture"]');
      if (tab) { tab.click(); }
      var sub = document.querySelector('[data-hg-subview="study"]');
      if (sub) { sub.click(); }
      /* The reader engine boots lazily on first open, and the shell's view
         switch repaints the reader from its own state on its own tick: a
         single synchronous drive can be overwritten or land before the
         reader's handlers attach (selects set, old passage still showing).
         So: let the switch settle, drive the selects, then verify against
         the reader's own ref line on an interval — re-driving with the
         reader's own Read button until the passage actually lands. */
      var bookName = null;
      try { bookName = (window.SSB && SSB.db() && SSB.db().books) ? SSB.db().books[b - 1] : null; } catch (e) {}
      function landed() {
        if (!bookName) { return true; }
        var ref = $('#st-ref-line');
        return !ref || ref.textContent.indexOf(bookName + ' ' + c + ' —') === 0;
      }
      function drive() {
        var selB = $('#st-book'), selC = $('#st-chapter');
        if (selB && selC && selB.options.length) {
          selB.value = String(b);
          selB.dispatchEvent(new Event('change', { bubbles: true }));
          selC.value = String(c);
          selC.dispatchEvent(new Event('change', { bubbles: true }));
          var go = $('#st-go');
          if (go) { go.click(); }
        }
      }
      setTimeout(function () {
        drive();
        var ticks = 0;
        var iv = setInterval(function () {
          ticks++;
          if (landed()) {
            clearInterval(iv);
            if (v) {
              var p = document.querySelector('#st-text p.verse[data-verse="' + v + '"]');
              if (p) { p.scrollIntoView({ block: 'center' }); }
            }
            return;
          }
          if (ticks >= 30) { clearInterval(iv); return; }
          drive();
        }, 700);
      }, 350);
    } catch (e) {}
  }

  /* ---------------- word lookup (new front door over resident data) ------ */
  function norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[ʼʿʻ]/g, '').replace(/ᵉ/g, 'e').replace(/\s+/g, ' ').trim();
  }
  function searchLexicon(qRaw) {
    var db = window.SSB && SSB.db();
    if (!db || !db.lexicon) { return []; }
    var q = String(qRaw || '').trim();
    var strongs = q.toUpperCase().replace(/\s/g, '');
    if (/^[HG]\d{1,4}$/.test(strongs)) {
      var one = window.SSB.getLexicon(strongs);
      return one ? [one] : [];
    }
    var nq = norm(q);
    if (!nq) { return []; }
    var hits = [];
    Object.keys(db.lexicon).forEach(function (num) {
      if (hits.length >= 40) { return; }
      var e = db.lexicon[num];
      if (!e) { return; }
      var score = -1;
      if (norm(e[1]) === nq) { score = 0; }
      else if (norm(e[1]).indexOf(nq) === 0) { score = 1; }
      else if (String(e[0]) === q) { score = 0; }
      else if (norm(e[1]).indexOf(nq) !== -1) { score = 2; }
      else if (String(e[2]).toLowerCase().indexOf(nq) !== -1) { score = 3; }
      if (score >= 0) { hits.push({ score: score, entry: { number: num, word: e[0], transliteration: e[1], definition: e[2] } }); }
    });
    hits.sort(function (a, b2) { return a.score - b2.score; });
    return hits.slice(0, 12).map(function (h) { return h.entry; });
  }
  function lexCard(entry) {
    var card = el('div', { 'class': 'eh-card' });
    var head = el('div', { 'class': 'eh-row' });
    head.appendChild(el('span', { 'class': 'eh-orig' }, entry.word));
    head.appendChild(el('strong', {}, entry.number));
    head.appendChild(el('span', { 'class': 'eh-translit' }, entry.transliteration));
    card.appendChild(head);
    card.appendChild(el('p', {}, entry.definition));
    card.appendChild(sayItBlock(entry.number, entry));
    return card;
  }

  /* ---------------- word studies (CHECKED entries only) ------------------- */
  function wsEntries() {
    var sc = window.HAGAH_WS_SIDECAR;
    if (!sc || !sc.entries) { return []; }
    return sc.entries.filter(function (e) { return e.status === 'CHECKED' || e.status === 'TEACHING-READY'; });
  }

  /* ---------------- the sheet --------------------------------------------- */
  var sheet = null;
  function closeSheet() { if (sheet) { sheet.remove(); sheet = null; } }
  function renderCandidates() {
    var box = $('#eh-candidates');
    if (!box) { return; }
    clear(box);
    var arr = loadCandidates();
    if (!arr.length) {
      box.appendChild(el('p', { 'class': 'eh-note' }, 'No words waiting. When a word has no house recording yet, you can remember it from its Say it row, and it will wait here.'));
      return;
    }
    arr.forEach(function (c) {
      box.appendChild(el('p', { 'class': 'eh-note' }, c.id + ' · ' + (c.transliteration || '') + ' — ' + (c.gloss || '')));
    });
    var dl = el('button', { 'class': 'eh-btn', type: 'button' }, 'Download candidate list');
    dl.addEventListener('click', function () {
      try {
        var blob = new Blob([JSON.stringify(loadCandidates(), null, 1)], { type: 'application/json' });
        var a = el('a', { href: URL.createObjectURL(blob), download: 'ehyeh-pron-candidates.json' });
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) {}
    });
    box.appendChild(dl);
    box.appendChild(el('p', { 'class': 'eh-note' }, 'This list lives on this device. Download it and send it in with your marks backup, and the next recording pass can work from it.'));
  }
  function renderWsList(container) {
    clear(container);
    var entries = wsEntries();
    if (!entries.length) {
      container.appendChild(el('p', { 'class': 'eh-note' }, 'No checked word studies are shelved yet.'));
      return;
    }
    entries.forEach(function (e) {
      var b = el('button', { 'class': 'eh-btn eh-ws-item', type: 'button' }, e.id + ' — ' + e.title);
      b.addEventListener('click', function () { renderWsEntry(container, e); });
      container.appendChild(b);
    });
  }
  function renderWsEntry(container, e) {
    clear(container);
    var back = el('button', { 'class': 'eh-btn', type: 'button' }, '‹ Word studies');
    back.addEventListener('click', function () { renderWsList(container); });
    container.appendChild(back);
    container.appendChild(el('h4', {}, e.title));
    if (e.entry_verdict_line) { container.appendChild(el('p', {}, e.entry_verdict_line)); }
    if (e.center) {
      var cen = el('p', {});
      cen.appendChild(el('strong', {}, 'Center: '));
      cen.appendChild(document.createTextNode(e.center));
      container.appendChild(cen);
    }
    (e.claims || []).forEach(function (cl) {
      var box = el('div', { 'class': 'eh-card' });
      box.appendChild(el('p', {}, cl.id + '. ' + (cl.text || '') + (cl.verdict ? ' — ' + cl.verdict : '')));
      [['A — what the record says: ', cl.layer_a], ['B — what interpreters have held: ', cl.layer_b], ['C — where inference is added: ', cl.layer_c]].forEach(function (L) {
        if (!L[1]) { return; }
        var d = el('p', {});
        d.appendChild(el('strong', {}, L[0]));
        d.appendChild(document.createTextNode(L[1]));
        box.appendChild(d);
      });
      container.appendChild(box);
    });
    var anchors = (e.passage_anchors || []).filter(function (a) { return a.kind === 'passage'; });
    if (anchors.length && window.SSB) {
      container.appendChild(el('p', { 'class': 'eh-note' }, 'Passages — tap to open in the reader:'));
      var row = el('div', { 'class': 'eh-row' });
      anchors.forEach(function (a) {
        var ab = el('button', { 'class': 'eh-btn', type: 'button' }, a.ref);
        ab.addEventListener('click', function () {
          var p = window.SSB.parseReference(a.ref);
          if (p) { closeSheet(); gotoPassage(p.book, p.chapter, p.verse); }
        });
        row.appendChild(ab);
      });
      container.appendChild(row);
    }
  }
  function openSheet() {
    injectStyles();
    closeSheet();
    sheet = el('div', { id: 'eh-sheet', role: 'dialog', 'aria-label': 'Ehyeh helper' });
    var closeBtn = el('button', { 'class': 'eh-btn eh-close', type: 'button', 'aria-label': 'Close the helper' }, 'Close ✕');
    closeBtn.addEventListener('click', closeSheet);
    sheet.appendChild(closeBtn);
    sheet.appendChild(el('h3', {}, 'Helper'));
    sheet.appendChild(el('p', { 'class': 'eh-cover' }, COVERAGE_LINE));

    /* The name of the app, said aloud */
    var nameCard = el('div', { 'class': 'eh-card' });
    nameCard.appendChild(el('p', {}, 'The name of this app — Ehyeh (אֶהְיֶה), “I AM WHO I AM” (Exodus 3:14). Say: eh-YEH.'));
    var nameRow = el('div', { 'class': 'eh-row' });
    var nameNote = el('p', { 'class': 'eh-note', hidden: 'hidden' });
    var nameBtn = el('button', { 'class': 'eh-btn', type: 'button' }, '▶ Hear the name');
    nameBtn.addEventListener('click', function () { nameNote.hidden = true; playClip(NAME_CLIP, nameNote); });
    var namePhone = el('button', { 'class': 'eh-btn', type: 'button' }, '▶ Phone’s voice');
    namePhone.addEventListener('click', function () { phoneVoice('Ehyeh', namePhone); });
    nameRow.appendChild(nameBtn); nameRow.appendChild(namePhone);
    nameCard.appendChild(nameRow);
    nameCard.appendChild(nameNote);
    sheet.appendChild(nameCard);

    /* 1 — Go to a passage (reference jump; never called "search") */
    sheet.appendChild(el('h4', {}, 'Go to a passage'));
    var refRow = el('div', { 'class': 'eh-row' });
    var refInput = el('input', { 'class': 'eh-input', id: 'eh-ref-input', type: 'text', autocomplete: 'off', placeholder: 'John 3:16', 'aria-label': 'Passage reference, for example John 3:16' });
    var refBtn = el('button', { 'class': 'eh-btn primary', type: 'button' }, 'Go');
    var refMsg = el('p', { 'class': 'eh-note', 'aria-live': 'polite' });
    function doRef() {
      var val = refInput.value.trim();
      if (!val || !window.SSB) { return; }
      var p = window.SSB.parseReference(val);
      if (!p) {
        refMsg.textContent = 'Ehyeh couldn’t find that passage. Try a book, chapter, and verse — like “John 3:16”.';
        return;
      }
      refMsg.textContent = '';
      closeSheet();
      gotoPassage(p.book, p.chapter, p.verse);
    }
    refBtn.addEventListener('click', doRef);
    refInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { doRef(); } });
    refRow.appendChild(refInput); refRow.appendChild(refBtn);
    sheet.appendChild(refRow);
    sheet.appendChild(refMsg);

    /* 2 — What does a word mean? */
    sheet.appendChild(el('h4', {}, 'What does a word mean?'));
    sheet.appendChild(el('p', { 'class': 'eh-note' }, 'Look up a Hebrew or Greek word by how it sounds (transliteration), its original letters, a word from its meaning, or its Strong’s number (like H3045 or G2962). Names and places come from Easton’s dictionary.'));
    var wRow = el('div', { 'class': 'eh-row' });
    var wInput = el('input', { 'class': 'eh-input', id: 'eh-word-input', type: 'search', autocomplete: 'off', placeholder: 'yada, H3045, know, Aaron…', 'aria-label': 'Word to look up' });
    var wBtn = el('button', { 'class': 'eh-btn primary', type: 'button' }, 'Look up');
    var wOut = el('div', { id: 'eh-word-out', 'aria-live': 'polite' });
    function doWord() {
      var q = wInput.value.trim();
      clear(wOut);
      if (!q) { return; }
      wOut.appendChild(el('p', { 'class': 'eh-note' }, 'Looking…'));
      Promise.all([ensureLexicon(), ensureEaston()]).then(function (oks) {
        clear(wOut);
        if (!oks[0] && !oks[1]) {
          wOut.appendChild(el('p', { 'class': 'eh-note' }, 'Couldn’t load the dictionary — check your connection and tap again.'));
          return;
        }
        var found = 0;
        if (oks[0]) {
          searchLexicon(q).forEach(function (entry) { wOut.appendChild(lexCard(entry)); found++; });
        }
        if (oks[1] && window.SSB) {
          window.SSB.searchEaston(q).slice(0, 3).forEach(function (r) {
            var card = el('div', { 'class': 'eh-card' });
            card.appendChild(el('p', {}, r.term.charAt(0).toUpperCase() + r.term.slice(1)));
            card.appendChild(el('p', {}, String(r.definition).slice(0, 600)));
            card.appendChild(el('p', { 'class': 'eh-note' }, 'Easton’s Bible Dictionary (1897), public domain.'));
            wOut.appendChild(card); found++;
          });
        }
        if (!found) {
          wOut.appendChild(el('p', { 'class': 'eh-note' }, 'The helper found nothing for “' + q + '”. If the answer isn’t in the book, it will say so — and this one isn’t.'));
        }
      });
    }
    wBtn.addEventListener('click', doWord);
    wInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { doWord(); } });
    wRow.appendChild(wInput); wRow.appendChild(wBtn);
    sheet.appendChild(wRow);
    sheet.appendChild(wOut);

    /* 3 — How do you say it? */
    sheet.appendChild(el('h4', {}, 'How do you say it?'));
    sheet.appendChild(el('p', { 'class': 'eh-note' }, 'The recorded words so far — from the checked word studies. The house voice is one recorded voice for every word.'));
    var pRow = el('div', { 'class': 'eh-row' });
    var pInput = el('input', { 'class': 'eh-input', id: 'eh-pron-input', type: 'search', autocomplete: 'off', placeholder: 'Filter the recorded words…', 'aria-label': 'Filter the recorded words' });
    var pList = el('div', { id: 'eh-pron-list' });
    function renderPron(filter) {
      clear(pList);
      var f = norm(filter || '');
      var shown = 0;
      PRON.forEach(function (p) {
        if (f && norm(p.translit + ' ' + p.respell + ' ' + p.id + ' ' + p.gloss).indexOf(f) === -1) { return; }
        shown++;
        var card = el('div', { 'class': 'eh-card' });
        var head = el('div', { 'class': 'eh-row' });
        head.appendChild(el('span', { 'class': 'eh-orig' }, p.word));
        head.appendChild(el('strong', {}, p.id));
        head.appendChild(el('span', { 'class': 'eh-translit' }, p.translit));
        head.appendChild(el('span', { 'class': 'eh-respell' }, 'say: ' + p.respell));
        card.appendChild(head);
        card.appendChild(el('p', { 'class': 'eh-note' }, p.gloss + ' · ' + p.from));
        card.appendChild(sayItBlock(p.id, null));
        pList.appendChild(card);
      });
      if (!shown) {
        pList.appendChild(el('p', { 'class': 'eh-note' }, 'No recorded word matches that yet. Words are recorded as word studies are checked.'));
      }
    }
    pInput.addEventListener('input', function () { renderPron(pInput.value); });
    pRow.appendChild(pInput);
    sheet.appendChild(pRow);
    sheet.appendChild(pList);
    renderPron('');

    /* 4 — Word studies (CHECKED only, rendered as the shelf renders them) */
    sheet.appendChild(el('h4', {}, 'Word studies'));
    sheet.appendChild(el('p', { 'class': 'eh-note' }, 'Studies appear here only when their checking is complete (CHECKED) — the same rule as the Word Studies shelf.'));
    var wsBox = el('div', { id: 'eh-ws' });
    sheet.appendChild(wsBox);
    renderWsList(wsBox);

    /* Candidates */
    sheet.appendChild(el('h4', {}, 'Words waiting to be recorded'));
    var candBox = el('div', { id: 'eh-candidates' });
    sheet.appendChild(candBox);
    renderCandidates();

    /* 5 — Ask the helper (Layer 2 door, #241: OPENED 2026-10-23 under
       Donnie's blanket word. Posts to the house endpoint /api/ehyeh-ask,
       which answers only from handed verses; passages below are rendered
       from Ehyeh's own local WEB text, never from the model's quoting.
       Any failure shows the honest away line — the rest of Ehyeh works.) */
    sheet.appendChild(el('h4', {}, 'Ask the helper'));
    sheet.appendChild(el('p', { 'class': 'eh-cover' }, ASK_LABEL));
    sheet.appendChild(el('p', { 'class': 'eh-note' }, ASK_SERVER_LINE));
    sheet.appendChild(el('p', { 'class': 'eh-note' }, "We don't keep your question, and there's no account and no name attached to it."));
    var askInput = el('input', { 'class': 'eh-input', type: 'text', placeholder: 'Ask about a passage…', 'aria-label': 'Ask the helper a Bible question' });
    var askBtn = el('button', { 'class': 'eh-btn', type: 'button' }, 'Ask');
    var askHp = el('input', { type: 'text', name: 'hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    askHp.style.display = 'none';
    var askRow = el('div', { 'class': 'eh-row' });
    askRow.appendChild(askInput); askRow.appendChild(askBtn); askRow.appendChild(askHp);
    sheet.appendChild(askRow);
    var askOut = el('div', { id: 'eh-ask-out' });
    sheet.appendChild(askOut);
    function askShow(text) {
      clear(askOut);
      askOut.appendChild(el('p', { 'class': 'eh-note' }, text));
    }
    function renderPassage(refStr) {
      var p = (window.SSB && SSB.parseReference) ? SSB.parseReference(refStr) : null;
      if (!p || !p.verse) { askOut.appendChild(el('p', { 'class': 'eh-note' }, refStr)); return; }
      var bookFile = 'data/pd/WEB/b' + (p.book < 10 ? '0' : '') + p.book + '.json';
      fetch(bookFile).then(function (r) { if (!r.ok) { throw new Error('nf'); } return r.json(); })
        .then(function (arr) {
          var chap = arr && arr[p.chapter - 1];
          var lines = typeof chap === 'string' ? chap.split('\n') : [];
          var text = lines[p.verse - 1] || '';
          askOut.appendChild(el('p', { 'class': 'eh-note' }, refStr + (text ? ' — ' + text : '')));
        })
        .catch(function () { askOut.appendChild(el('p', { 'class': 'eh-note' }, refStr)); });
    }
    function doAsk() {
      var q = (askInput.value || '').trim();
      if (!q) { askShow('Type a question about a passage, a word, a name, or a place in the Bible.'); return; }
      askBtn.disabled = true; askInput.disabled = true;
      askShow('Asking…');
      fetch('/api/ehyeh-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, hp: askHp.value || '' })
      }).then(function (r) { return r.json(); })
        .then(function (out) {
          askBtn.disabled = false; askInput.disabled = false;
          if (!out || out.ok !== true || out.unavailable) { askShow(AWAY_LINE); return; }
          clear(askOut);
          askOut.appendChild(el('p', {}, out.answer || AWAY_LINE));
          if (out.shortened && out.note) { askOut.appendChild(el('p', { 'class': 'eh-note' }, out.note)); }
          if (out.citations && out.citations.length) {
            askOut.appendChild(el('p', { 'class': 'eh-note' }, 'The passages, from Ehyeh’s own text:'));
            out.citations.forEach(renderPassage);
          }
        })
        .catch(function () {
          askBtn.disabled = false; askInput.disabled = false;
          askShow(AWAY_LINE);
        });
    }
    askBtn.addEventListener('click', doAsk);
    askInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); doAsk(); } });

    document.body.appendChild(sheet);
    sheet.scrollTop = 0;
  }

  /* ---------------- tap-a-word panel: the Say it row ---------------------- */
  var lastPanelText = '';
  function enhanceWordPanel() {
    var panel = $('#st-word-panel');
    var body = $('#st-word-body');
    if (!panel || !body || panel.hidden) { return; }
    var text = body.textContent || '';
    if (text === lastPanelText && $('#eh-word-panel-say')) { return; }
    lastPanelText = text;
    var old = $('#eh-word-panel-say');
    if (old) { old.remove(); }
    var nums = [];
    var seen = {};
    function take(tok) {
      if (!seen[tok] && nums.length < 6) { seen[tok] = 1; nums.push(tok); }
    }
    /* The direct panel puts the Strong's number in a table cell, and
       textContent concatenates cells with no separator ("…NUMBERH430ORIGINAL…"),
       so a \b regex over the raw text misses it. Read leaf elements (cells,
       strongs spans, list items) whose whole text is a Strong's number first;
       fall back to the regex over the full text for prose-shaped panels. */
    Array.prototype.slice.call(body.querySelectorAll('*')).forEach(function (n) {
      if (n.children && n.children.length) { return; }
      var t = (n.textContent || '').trim();
      if (/^[HG]\d{1,4}$/.test(t)) { take(t); }
    });
    if (!nums.length) {
      var re = /\b[HG]\d{1,4}\b/g, m;
      while ((m = re.exec(text)) !== null) {
        take(m[0]);
        if (nums.length >= 6) { break; }
      }
    }
    if (!nums.length) { return; }
    var wrap = el('div', { id: 'eh-word-panel-say' });
    wrap.appendChild(el('h4', {}, 'Say it'));
    nums.forEach(function (num) {
      var lex = window.SSB ? window.SSB.getLexicon(num) : null;
      var block = sayItBlock(num, lex);
      block.className = '';
      var lab = el('p', { 'class': 'eh-note' }, num + (lex ? ' · ' + lex.word : ''));
      wrap.appendChild(lab);
      wrap.appendChild(block);
    });
    var slot = body.querySelector('.wp-say-slot');
    if (slot) { slot.appendChild(wrap); } else { body.appendChild(wrap); }
  }

  /* ---------------- entry point ------------------------------------------- */
  function ensureButton() {
    if ($('#eh-helper-btn')) { return true; }
    var listen = $('#st-listen');
    if (!listen || !listen.parentNode) { return false; }
    var btn = el('button', { 'class': 'btn secondary', id: 'eh-helper-btn', type: 'button', 'aria-label': 'Open the Ehyeh helper' });
    btn.appendChild(el('img', { 'class': 'eh-helper-pic', src: 'assets/pics/helper-lantern.webp', alt: '', 'aria-hidden': 'true' }));
    btn.appendChild(document.createTextNode('Helper'));
    btn.addEventListener('click', openSheet);
    listen.parentNode.insertBefore(btn, listen.nextSibling);
    return true;
  }
  function boot() {
    injectStyles();
    var tries = 0;
    (function attempt() {
      tries++;
      if (ensureButton() || tries > 40) { return; }
      setTimeout(attempt, 300);
    })();
    var pending = false;
    var obs = new MutationObserver(function () {
      if (pending) { return; }
      pending = true;
      setTimeout(function () {
        pending = false;
        try { ensureButton(); enhanceWordPanel(); } catch (e) {}
      }, 80);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
  /* Sermon Builder word-study card (s03) reuses this same pronunciation
     ladder — curated house clips where they exist, the phone's own voice
     otherwise — so a word sounds the same wherever he taps it. */
  window.EHYEH_PRON = { byId: PRON_BY_ID, playClip: playClip, phoneVoice: phoneVoice };
  /* The Sermon Builder (s03) asks for the Easton dictionary by this
     name before it gathers Scriptures for a topic. Until the
     ease-of-use audit (2026-10-29) the export was missing, so s03's
     guard never passed in the browser and the topic engine's Easton
     route — its strongest — never ran outside the Node battery. */
  window.ensureEaston = ensureEaston;
})();
