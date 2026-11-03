
window.__hagahModuleQueue = window.__hagahModuleQueue || [];
(function () {
var module = { exports: {} };
/* Hagah v3 — Dead Sea Scrolls module: context cards + verse-level variant-note
 * hooks + deep links.
 *
 * Universal module: Node (tests) and browser (shell), same pattern as v2/v2.cjs.
 * In the browser it is exposed as window.HagahScrolls; in Node via module.exports.
 *
 * SHELL CONTRACT
 *
 *   META = { id:'scrolls', title:'Dead Sea Scrolls', modes:['study','sermon'] }
 *
 *   mount(panelEl, ctx) — ctx fields used:
 *     mode            'study' | 'sermon' (snapshot; 'sermon' label = 'Sermon Prep')
 *     onModeChange(fn)   re-renders the mode label
 *     onPassageChange(fn) re-renders the passage-matched variant notes
 *     data            read-only; variant cards from ctx.data.hagah.dss,
 *                     variant notes from ctx.data.hagah['dss-variants'],
 *                     book names from ctx.data.books (fallback to bundled list)
 *     guard           present but NEVER called by this module
 *     h(tag, attrs, ...kids)  textContent-safe DOM builder
 *     passage         { book, chapter } — current passage (book = 1..66)
 *     notify(msg)     OPTIONAL shell toast
 *     onJump(ref)     OPTIONAL shell verse navigation, e.g. "Isaiah 53:11"
 *
 * LEGAL BOUNDS (absolute): no modern DSS English translations are bundled and
 * no Leon Levy / IAA images are bundled — curated facts and our own summaries
 * only. The module itself makes NO network calls. "See the scroll" links are
 * plain user-initiated anchors to https://www.deadseascrolls.org.il/ ; they
 * simply will not load while offline, and the UI says so honestly.
 *
 * GUARDRAIL NOTE: this module never calls ctx.guard and never generates study
 * content. It renders curated, cited facts and verse-level variant notes.
 */
(function (root, factory) {
  'use strict';
  var M = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = M; }
  else { root.HagahScrolls = M; }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var META = { id: 'scrolls', title: 'Dead Sea Scrolls', modes: ['study', 'sermon'] };

  var LIBRARY_URL = 'https://www.deadseascrolls.org.il/';

  /* Fallback 66-book name list, used only when ctx.data.books is absent.
   * Public-domain factual data, not user content. */
  var BOOKS66 = [
    'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua',
    'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
    '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job',
    'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah',
    'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
    'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai',
    'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts',
    'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
    'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
    '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James',
    '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation'
  ];

  /* ------------------------------ helpers ------------------------------ */

  function getBooks(data) {
    if (data && Array.isArray(data.books) && data.books.length === 66) { return data.books; }
    return BOOKS66;
  }

  /* ctx.data.hagah is the merged v3 data (see v3/CONTRACT.md): v3/data/dss.json
   * lands under key 'dss', v3/data/dss-variants.json under 'dss-variants'. */
  function getDssData(ctx) {
    var d = (ctx && ctx.data && ctx.data.hagah) || {};
    return {
      cards: (d.dss && Array.isArray(d.dss.cards)) ? d.dss.cards : null,
      links: (d.dss && Array.isArray(d.dss.links)) ? d.dss.links : null,
      variants: (d['dss-variants'] && Array.isArray(d['dss-variants'].variants))
        ? d['dss-variants'].variants : null
    };
  }

  /* "Deuteronomy 32:8" -> { bookName:'Deuteronomy', chapter:32, verse:8 }.
   * "Psalms" (bundle spelling) is normalized to the variant spelling "Psalm". */
  function parseRef(ref) {
    var m = /^(.+?)\s+(\d+):(\d+)$/.exec(String(ref || ''));
    if (!m) { return null; }
    var name = m[1].trim();
    if (name === 'Psalms') { name = 'Psalm'; }
    return { bookName: name, chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) };
  }

  function bookNumber(books, name) {
    var n = name.toLowerCase();
    for (var i = 0; i < books.length; i++) {
      var b = String(books[i]).toLowerCase();
      if (b === n || (b === 'psalms' && n === 'psalm')) { return i + 1; }
    }
    return 0;
  }

  function variantsForPassage(variants, books, book, chapter) {
    return (variants || []).filter(function (v) {
      var p = parseRef(v.ref);
      if (!p) { return false; }
      return bookNumber(books, p.bookName) === book && p.chapter === chapter;
    });
  }

  function modeLabel(mode) { return mode === 'sermon' ? 'Sermon Prep' : 'Personal Study'; }

  /* ------------------------------ render ------------------------------ */

  function render(panelEl, ctx, st) {
    var h = ctx.h;
    /* Clear explicitly: textContent='' drops children in a real browser but
     * not in every test double — explicit removal works in both. The shell
     * also clears panelEl before remounting; belt and suspenders. */
    while (panelEl.firstChild) { panelEl.removeChild(panelEl.firstChild); }
    panelEl.textContent = '';

    var header = h('div', { 'class': 'dss-header', 'data-testid': 'dss-header' },
      h('h2', { text: META.title }),
      h('p', { 'class': 'dss-mode', 'data-testid': 'mode-label', text: modeLabel(st.mode) }),
      h('p', { 'class': 'dss-intro', text:
        'Ancient manuscripts of the Hebrew Scriptures — what they are, why they ' +
        'matter for Bible study, and famous places where the scrolls differ from ' +
        'the later Masoretic text. Every variant note below is cited; none are ' +
        'invented.' }));

    panelEl.appendChild(header);

    if (!st.cards || !st.variants) {
      panelEl.appendChild(h('p', { 'class': 'dss-empty', 'data-testid': 'dss-not-loaded',
        text: 'The Dead Sea Scrolls data has not loaded in this build. ' +
              'Nothing is invented here — the module shows nothing rather than ' +
              'guess.' }));
      panelEl.appendChild(offlineNote(h));
      return;
    }

    /* --- verse-level hooks for the current passage --- */
    var books = getBooks(ctx.data);
    var matched = variantsForPassage(st.variants, books, st.passage.book, st.passage.chapter);
    var bookName = books[st.passage.book - 1] || ('Book ' + st.passage.book);
    var passageBox = h('section', { 'class': 'dss-passage', 'data-testid': 'dss-passage-box' },
      h('h3', { text: 'DSS notes on ' + bookName + ' ' + st.passage.chapter }));
    if (matched.length === 0) {
      passageBox.appendChild(h('p', { 'class': 'dss-none',
        text: 'No Dead Sea Scrolls variant notes are catalogued for this chapter. ' +
              'Browse all ' + st.variants.length + ' notes below.' }));
    } else {
      matched.forEach(function (v, i) {
        passageBox.appendChild(variantCard(h, ctx, v, 'dss-passage-note-' + i));
      });
    }
    panelEl.appendChild(passageBox);

    /* --- context cards --- */
    var cardsBox = h('section', { 'class': 'dss-cards' },
      h('h3', { text: 'Context cards' }));
    st.cards.forEach(function (c, i) {
      cardsBox.appendChild(h('article', { 'class': 'dss-card', 'data-testid': 'dss-card-' + i },
        h('h4', { text: c.heading }),
        h('p', { text: c.body }),
        c.source && c.source.title
          ? h('p', { 'class': 'dss-source' }, h('small', { text: 'Source: ' + c.source.title }))
          : null));
    });
    panelEl.appendChild(cardsBox);

    /* --- all variant notes (browsable) --- */
    var allBox = h('section', { 'class': 'dss-variants' },
      h('h3', { text: 'Variant notes (' + st.variants.length + ')' }),
      h('p', { 'class': 'dss-caveat', text:
        'A “variant” is simply a place where an ancient copy reads differently. ' +
        'These are the famous, multiply-attested ones. Short descriptions only — ' +
        'no modern scroll translations are bundled.' }));
    st.variants.forEach(function (v, i) {
      allBox.appendChild(variantCard(h, ctx, v, 'dss-variant-' + i));
    });
    panelEl.appendChild(allBox);

    /* --- deep links (user-initiated; offline-honest) --- */
    panelEl.appendChild(seeTheScrolls(h, st.links));
    panelEl.appendChild(offlineNote(h));
  }

  function variantCard(h, ctx, v, testid) {
    var kids = [
      h('p', { 'class': 'dss-ref' },
        h('strong', { text: v.ref + ' ' }),
        h('span', { 'class': 'dss-badge', text: 'DSS' })),
      h('p', { 'class': 'dss-note', text: v.note }),
      h('p', { 'class': 'dss-source' }, h('small', { text: 'Source: ' + v.source }))
    ];
    if (typeof ctx.onJump === 'function') {
      var btn = h('button', { type: 'button', 'data-testid': 'open-' + testid, text: 'Open verse' });
      btn.addEventListener('click', function () { ctx.onJump(v.ref); });
      kids.push(btn);
    }
    return h('article', { 'class': 'dss-variant', 'data-testid': testid }, kids);
  }

  function seeTheScrolls(h, links) {
    var box = h('section', { 'class': 'dss-links' },
      h('h3', { text: 'See the scrolls' }));
    var list = (links && links.length) ? links
      : [{ label: 'Leon Levy Dead Sea Scrolls Digital Library', url: LIBRARY_URL }];
    list.forEach(function (l, i) {
      var a = h('a', {
        href: l.url, target: '_blank', rel: 'noopener noreferrer',
        'data-testid': 'dss-link-' + i, text: l.label
      });
      box.appendChild(h('p', {}, a));
    });
    return box;
  }

  function offlineNote(h) {
    return h('p', { 'class': 'dss-offline', 'data-testid': 'dss-offline-note' },
      h('small', { text:
        'This module works fully offline. The library links above are plain ' +
        'links — they need an internet connection to open, and they never load ' +
        'by themselves.' }));
  }

  /* ------------------------------ mount ------------------------------ */

  function mount(panelEl, ctx) {
    var st = {
      mode: ctx.mode,
      passage: { book: ctx.passage.book, chapter: ctx.passage.chapter }
    };
    var d = getDssData(ctx);
    st.cards = d.cards; st.links = d.links; st.variants = d.variants;

    function rerender() { render(panelEl, ctx, st); }
    rerender();

    if (typeof ctx.onModeChange === 'function') {
      ctx.onModeChange(function (newMode) { st.mode = newMode; rerender(); });
    }
    if (typeof ctx.onPassageChange === 'function') {
      ctx.onPassageChange(function (p) {
        st.passage = { book: p.book, chapter: p.chapter };
        rerender();
      });
    }
  }

  return {
    META: META,
    mount: mount,
    _internal: {
      getDssData: getDssData,
      parseRef: parseRef,
      bookNumber: bookNumber,
      variantsForPassage: variantsForPassage,
      LIBRARY_URL: LIBRARY_URL
    }
  };
}));

window.__hagahModuleQueue.push(module.exports);
})();
