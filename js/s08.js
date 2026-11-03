
window.__hagahModuleQueue = window.__hagahModuleQueue || [];
(function () {
var module = { exports: {} };
/* Hagah v3 — Study Helps module (workstream 2: inductive questions, topical chains, reading plans).
   Universal module pattern (mirrors v2/v2.cjs): pure functions exported for Node tests,
   registered on window.HagahV3Modules in the browser.
   Philosophy (carried over from v2): snippets of help, never scripts. This module never
   generates answers, devotional prose, or sermon content — questions only, curated data
   only. Deterministic: no network, no model calls, no keys. The v2 guardrail allowlist
   (ctx.guard) is never touched because this module makes no AI calls at all. */
(function (root, factory) {
  'use strict';
  var M = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = M; }
  else { (root.HagahV3Modules = root.HagahV3Modules || {})['study-helps'] = M; }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var META = { id: 'study-helps', title: 'Study Helps', modes: ['study', 'sermon'] };

  /* DATA is set by init(data) — the shell merges the v2 bible bundle with this
     module's curated files: { books, chapter_counts, bible, topics, plans }.
     topics: array from v3/data/topics.json; plans: array from v3/data/reading-plans.json. */
  var DATA = null;
  function init(data) { DATA = data || null; }
  function db() { return DATA; }

  /* ------------------------------------------------------------------
     Reference parsing: "John 3:16", "1 John 1:9", "Ps 23", "Phil 4:6-7".
     Standalone (self-contained; does not depend on the sibling v2 module).
     Returns { book, chapter, verse } (verse may be null) or null.
     ------------------------------------------------------------------ */
  var BOOK_ALIASES = null;
  function bookAliases() {
    if (BOOK_ALIASES || !DATA) { return BOOK_ALIASES || {}; }
    BOOK_ALIASES = {};
    DATA.books.forEach(function (name, i) {
      var n = i + 1;
      BOOK_ALIASES[name.toLowerCase()] = n;
      BOOK_ALIASES[name.toLowerCase().replace(/^(\d) /, '$1')] = n;
      var short = name.replace(/^(\d) /, '$1').split(' ')[0].toLowerCase();
      if (!BOOK_ALIASES[short]) { BOOK_ALIASES[short] = n; }
    });
    var ab = { gen: 1, exo: 2, ex: 2, lev: 3, num: 4, deut: 5, josh: 6, judg: 7, ruth: 8,
      '1sam': 9, '2sam': 10, '1kgs': 11, '1ki': 11, '2kgs': 12, '2ki': 12, '1chr': 13, '2chr': 14,
      ezra: 15, neh: 16, est: 17, esther: 17, job: 18, ps: 19, psa: 19, psalm: 19, psalms: 19,
      prov: 20, pro: 20, eccl: 21, song: 22, isa: 23, jer: 24, lam: 25, ezek: 26, dan: 27,
      hos: 28, joel: 29, amos: 30, obad: 31, ob: 31, jonah: 32, mic: 33, nah: 34, nahum: 34,
      hab: 35, zeph: 36, hag: 37, zech: 38, mal: 39, matt: 40, mt: 40, mark: 41, mk: 41,
      luke: 42, lk: 42, john: 43, jn: 43, acts: 44, rom: 45, '1cor': 46, '2cor': 47,
      gal: 48, eph: 49, phil: 50, col: 51, '1thess': 52, '2thess': 53, '1tim': 54,
      '2tim': 55, titus: 56, tit: 56, philem: 57, phm: 57, heb: 58, james: 59, jas: 59,
      '1pet': 60, '2pet': 61, '1jn': 62, '2jn': 63, '3jn': 64, jude: 65, rev: 66 };
    Object.keys(ab).forEach(function (k) { if (!BOOK_ALIASES[k]) { BOOK_ALIASES[k] = ab[k]; } });
    return BOOK_ALIASES;
  }

  function parseReference(str) {
    if (!DATA || typeof str !== 'string') { return null; }
    var s = str.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
    var m = s.match(/^([1-3]?\s?[a-z]+(?:\s+[a-z]+){0,2})\s+(\d+)(?::(\d+)(?:-(\d+))?)?/);
    if (!m) { return null; }
    var aliases = bookAliases();
    var bookName = m[1].replace(/\s+/g, '');
    var book = aliases[bookName] || aliases[m[1]];
    if (!book) {
      var parts = m[1].split(' ');
      for (var i = parts.length - 1; i > 0 && !book; i--) {
        book = aliases[parts.slice(0, i).join(' ')] || aliases[parts.slice(0, i).join('')];
      }
    }
    if (!book) { return null; }
    var chapter = parseInt(m[2], 10);
    var maxCh = DATA.chapter_counts[String(book)];
    if (!maxCh || chapter < 1 || chapter > maxCh) { return null; }
    var v1 = m[3] ? parseInt(m[3], 10) : null;
    var v2 = m[4] ? parseInt(m[4], 10) : v1;
    if (v1 !== null && (v2 === null || v2 < v1)) { return null; }
    return { book: book, chapter: chapter, verse: v1, verseEnd: v2 };
  }

  function verseExists(book, chapter, verse) {
    if (!DATA || !DATA.bible) { return false; }
    var ch = DATA.bible[String(book)] && DATA.bible[String(book)][String(chapter)];
    return !!(ch && ch[String(verse)] !== undefined);
  }

  /* Expand a ref string into the concrete verses it covers. Whole-chapter refs
     ("Ps 23") return one entry with verse null. Unresolvable refs return []. */
  function expandRef(ref) {
    var p = parseReference(ref);
    if (!p) { return []; }
    if (p.verse === null) { return [{ book: p.book, chapter: p.chapter, verse: null }]; }
    var out = [];
    for (var v = p.verse; v <= p.verseEnd; v++) {
      out.push({ book: p.book, chapter: p.chapter, verse: v });
    }
    return out;
  }

  function bookName(book) {
    if (!DATA || !DATA.books || book < 1 || book > DATA.books.length) { return null; }
    return DATA.books[book - 1];
  }

  /* ------------------------------------------------------------------
     Feature 1 — Inductive study questions. Deterministic templates over
     passage metadata (book, chapter, verse count, testament). Questions
     only: never answers, never devotional prose. Every template is a
     function of meta so no placeholder can leak into output.
     ------------------------------------------------------------------ */
  function passageMeta(book, chapter) {
    var name = bookName(book);
    if (!name) { return null; }
    var maxCh = DATA.chapter_counts[String(book)];
    if (!maxCh || chapter < 1 || chapter > maxCh) { return null; }
    var verseCount = null;
    if (DATA.bible && DATA.bible[String(book)] && DATA.bible[String(book)][String(chapter)]) {
      verseCount = Object.keys(DATA.bible[String(book)][String(chapter)]).length;
    }
    return {
      book: book,
      bookName: name,
      chapter: chapter,
      ref: name + ' ' + chapter,
      verseCount: verseCount,
      testament: book <= 39 ? 'Old Testament' : 'New Testament',
      prevChapter: chapter > 1 ? chapter - 1 : null
    };
  }

  var Q_OBSERVE = [
    function (m) { return 'Read ' + m.ref + ' slowly, out loud if you can. Which verse stands out to you first — and what words does it actually use?'; },
    function (m) { return 'List the people who speak or act in ' + m.ref + '. What does each one do?'; },
    function (m) { return m.verseCount
      ? 'What words or ideas repeat in these ' + m.verseCount + ' verses?'
      : 'What words or ideas repeat as you read ' + m.ref + '?'; },
    function (m) { return 'What commands, promises, and warnings do you find in ' + m.ref + '?'; },
    function (m) { return m.prevChapter
      ? 'What happened just before this, in ' + m.bookName + ' ' + m.prevChapter + '? How does chapter ' + m.chapter + ' begin in response?'
      : 'How does ' + m.ref + ' begin? What is the first thing the writer wants you to see?'; }
  ];
  var Q_INTERPRET = [
    function (m) { return 'In your own words, what is the main point of ' + m.ref + '?'; },
    function (m) { return 'What did this chapter mean to the first people who heard it, in their own time and place?'; },
    function (m) { return 'How does ' + m.ref + ' connect with what you already know from the rest of ' + m.bookName + '?'; },
    function (m) { return 'Which words in this chapter are you unsure about — and what do they mean once you look them up?'; },
    function (m) { return 'What questions does ' + m.ref + ' leave you with that you still want to explore?'; }
  ];
  var Q_APPLY = [
    function (m) { return 'What is one thing from ' + m.ref + ' you can put into practice this week?'; },
    function (m) { return 'Is there a sin to confess, a promise to trust, or an example to follow in ' + m.ref + '?'; },
    function (m) { return 'Who in your life needs to hear what you learned from ' + m.ref + '?'; },
    function (m) { return 'What prayer, in your own words, does ' + m.ref + ' lead you to pray?'; },
    function (m) { return 'What will you do differently tomorrow because of ' + m.ref + '?'; }
  ];

  function questionsFor(book, chapter) {
    if (!DATA) { return null; }
    var m = passageMeta(book, chapter);
    if (!m) { return null; }
    function run(list) { return list.map(function (fn) { return fn(m); }); }
    return { observation: run(Q_OBSERVE), interpretation: run(Q_INTERPRET), application: run(Q_APPLY) };
  }

  /* ------------------------------------------------------------------
     Feature 2 — Topical chains. Curated in v3/data/topics.json.
     Format (expandable): { id, title, intro, verses } where
       id     kebab-case slug, unique
       title  display title
       intro  ONE study-framed sentence (no devotional prose, no answers)
       verses array of ref strings: "Book C:V" or range "Book C:V-W";
              every ref must parse and every verse must exist in the v2 data.
     ------------------------------------------------------------------ */
  function getTopics() { if (DATA && DATA.topics) { return DATA.topics; } var t = (DATA && DATA.hagah && DATA.hagah.topics) || (window.HAGAH_DATA || {}).topics; return (t && t.topics) ? t.topics : (Array.isArray(t) ? t : []); }
  function getTopic(id) {
    var ts = getTopics();
    for (var i = 0; i < ts.length; i++) { if (ts[i].id === id) { return ts[i]; } }
    return null;
  }
  /* Returns a list of problem strings; empty means every ref resolves. */
  function validateTopics() {
    var problems = [];
    getTopics().forEach(function (t) {
      if (!t.id || !t.title || !t.intro || !Array.isArray(t.verses)) {
        problems.push(t.id + ': missing id/title/intro/verses');
        return;
      }
      t.verses.forEach(function (ref) {
        var parts = expandRef(ref);
        if (!parts.length) { problems.push(t.id + ': unparseable ref "' + ref + '"'); return; }
        parts.forEach(function (p) {
          if (p.verse !== null && !verseExists(p.book, p.chapter, p.verse)) {
            problems.push(t.id + ': verse not in data: "' + ref + '"');
          }
        });
      });
    });
    return problems;
  }

  /* ------------------------------------------------------------------
     Feature 5 — Reading plans. Definitions in v3/data/reading-plans.json.
     Two kinds:
       explicit: days_list is the full day array [{day, kind, ref?, scope?, note}]
       weekly:   chapters[] read in canonical order on read_weekdays;
                 grace_weekdays (and overflow days) are grace days.
     Progress: ctx.store key 'plans.<id>' (shell prefixes 'hagah.') holding
     { startedAt: ISO string, doneDays: [day numbers] }.
     ------------------------------------------------------------------ */
  function getPlans() { if (DATA && DATA.plans) { return DATA.plans; } var p = (DATA && DATA.hagah && DATA.hagah['reading-plans']) || (window.HAGAH_DATA || {})['reading-plans']; return (p && p.plans) ? p.plans : (Array.isArray(p) ? p : []); }
  function getPlan(id) {
    var ps = getPlans();
    for (var i = 0; i < ps.length; i++) { if (ps[i].id === id) { return ps[i]; } }
    return null;
  }

  function planDay(plan, day) {
    if (!plan || day < 1 || day > plan.days) { return null; }
    if (plan.kind === 'explicit') {
      var e = plan.days_list[day - 1];
      return e ? { day: e.day, kind: e.kind, ref: e.ref || null, scope: e.scope || null, note: e.note || '' } : null;
    }
    if (plan.kind === 'weekly') {
      var weekday = ((day - 1) % 7) + 1; // day 1 = Monday
      var graceNote = 'Grace day — catch up on missed readings, or rest.';
      if (plan.grace_weekdays.indexOf(weekday) >= 0) {
        return { day: day, kind: 'grace', ref: null, scope: null, note: graceNote };
      }
      var week = Math.floor((day - 1) / 7);
      var idx = week * plan.read_weekdays.length + plan.read_weekdays.indexOf(weekday);
      if (idx < 0 || idx >= plan.chapters.length) {
        return { day: day, kind: 'grace', ref: null, scope: null, note: graceNote };
      }
      return { day: day, kind: 'read', ref: plan.chapters[idx], scope: null, note: 'Read ' + plan.chapters[idx] + '.' };
    }
    return null;
  }

  function expandPlan(plan) {
    var out = [];
    for (var d = 1; d <= plan.days; d++) { out.push(planDay(plan, d)); }
    return out;
  }

  function progressKey(planId) { return 'plans.' + planId; }

  function getProgress(store, planId) {
    var raw = store.get(progressKey(planId), null);
    if (!raw || typeof raw !== 'object') { return { startedAt: null, doneDays: [] }; }
    var done = Array.isArray(raw.doneDays) ? raw.doneDays.filter(function (d) {
      return typeof d === 'number' && d >= 1;
    }) : [];
    return { startedAt: raw.startedAt || null, doneDays: done };
  }
  function saveProgress(store, planId, p) {
    store.set(progressKey(planId), { startedAt: p.startedAt, doneDays: p.doneDays.slice() });
  }
  function startPlan(store, planId) {
    var p = getProgress(store, planId);
    if (!p.startedAt) { p.startedAt = new Date().toISOString(); saveProgress(store, planId, p); }
    return p;
  }
  function toggleDay(store, planId, day) {
    var plan = getPlan(planId);
    if (!plan || day < 1 || day > plan.days) { return null; }
    var p = startPlan(store, planId);
    var i = p.doneDays.indexOf(day);
    if (i >= 0) { p.doneDays.splice(i, 1); } else { p.doneDays.push(day); }
    p.doneDays.sort(function (a, b) { return a - b; });
    saveProgress(store, planId, p);
    return p;
  }
  function isDayDone(progress, day) { return progress.doneDays.indexOf(day) >= 0; }
  /* First day not yet marked done; null when the plan is complete. */
  function resumeDay(plan, progress) {
    for (var d = 1; d <= plan.days; d++) {
      if (!isDayDone(progress, d)) { return d; }
    }
    return null;
  }

  /* ------------------------------------------------------------------
     mount(panelEl, ctx) — renders the three tabs. Uses only ctx.h for DOM,
     ctx.store for progress, ctx.passage for the current passage. No AI, no
     network, no writes outside the hagah.-prefixed store.
     ------------------------------------------------------------------ */
  function mount(panelEl, ctx) {
    if (!DATA && ctx && ctx.data) { init(ctx.data); }
    if (!DATA) { throw new Error('study-helps: data not loaded (shell must init with merged bundle)'); }
    var h = ctx.h;
    var store = ctx.store;

    function el(tag, attrs) {
      var kids = Array.prototype.slice.call(arguments, 2);
      return h.apply(null, [tag, attrs || {}].concat(kids));
    }
    function clear(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }

    var wrap = el('div', { 'class': 'sh-wrap' });
    var tabBar = el('div', { 'class': 'sh-tabs', role: 'tablist' });
    var body = el('div', { 'class': 'sh-body' });
    wrap.appendChild(tabBar);
    wrap.appendChild(body);

    var tabs = [
      { id: 'questions', label: 'Study Questions', render: renderQuestions },
      { id: 'topics', label: 'Topical Chains', render: renderTopics },
      { id: 'plans', label: 'Reading Plans', render: renderPlans }
    ];
    var buttons = tabs.map(function (t, i) {
      var b = el('button', { 'class': 'sh-tab' + (i === 0 ? ' sh-active' : ''), role: 'tab' }, t.label);
      b.addEventListener('click', function () { showTab(i); });
      tabBar.appendChild(b);
      return b;
    });
    function showTab(i) {
      buttons.forEach(function (b, j) {
        b.className = 'sh-tab' + (j === i ? ' sh-active' : '');
      });
      clear(body);
      tabs[i].render(body);
    }

    /* --- tab 1: inductive questions for ctx.passage --- */
    function renderQuestions(bodyEl) {
      var passage = ctx.passage;
      if (!passage || !passage.book || !passage.chapter) {
        bodyEl.appendChild(el('p', { 'class': 'sh-note' },
          'Open a passage to see inductive study questions for it.'));
        return;
      }
      var q = questionsFor(passage.book, passage.chapter);
      if (!q) {
        bodyEl.appendChild(el('p', { 'class': 'sh-note' }, 'Could not build questions for this passage.'));
        return;
      }
      var meta = passageMeta(passage.book, passage.chapter);
      bodyEl.appendChild(el('h3', { 'class': 'sh-passage' }, meta.ref));
      bodyEl.appendChild(el('p', { 'class': 'sh-note' },
        'Questions only — work through them in your own words. The tool does not give answers.'));
      var sections = [
        { title: 'What does it say? (observation)', items: q.observation },
        { title: 'What does it mean? (interpretation)', items: q.interpretation },
        { title: 'What do I do? (application)', items: q.application }
      ];
      sections.forEach(function (s) {
        bodyEl.appendChild(el('h4', { 'class': 'sh-bucket' }, s.title));
        var ol = el('ol', { 'class': 'sh-qlist' });
        s.items.forEach(function (text) { ol.appendChild(el('li', {}, text)); });
        bodyEl.appendChild(ol);
      });
    }

    /* --- tab 2: topical chains --- */
    function renderTopics(bodyEl) {
      getTopics().forEach(function (t) {
        var open = false;
        var detail = el('div', { 'class': 'sh-topic-detail', hidden: true });
        var btn = el('button', { 'class': 'sh-topic' }, t.title);
        btn.addEventListener('click', function () {
          open = !open;
          if (open && detail.children.length === 0) {
            detail.appendChild(el('p', { 'class': 'sh-topic-intro' }, t.intro));
            var ul = el('ul', { 'class': 'sh-vlist' });
            t.verses.forEach(function (ref) { ul.appendChild(el('li', {}, ref)); });
            detail.appendChild(ul);
          }
          detail.hidden = !open;
        });
        bodyEl.appendChild(btn);
        bodyEl.appendChild(detail);
      });
    }

    /* --- tab 3: reading plans --- */
    function renderPlans(bodyEl) {
      getPlans().forEach(function (plan) {
        var box = el('div', { 'class': 'sh-plan' });
        box.appendChild(el('h3', { 'class': 'sh-plan-title' }, plan.title));
        box.appendChild(el('p', { 'class': 'sh-note' }, plan.subtitle || ''));
        var prog = getProgress(store, plan.id);
        var done = prog.doneDays.length;
        var fill = el('div', { 'class': 'sh-progress-fill', style: 'width:' + Math.round(100 * done / plan.days) + '%' });
        box.appendChild(el('div', { 'class': 'sh-progress' }, fill));
        var label = el('p', { 'class': 'sh-note' }, done + ' of ' + plan.days + ' days');
        box.appendChild(label);
        var resume = resumeDay(plan, prog);
        var startBtn = el('button', { 'class': 'sh-btn' },
          prog.startedAt ? (resume === null ? 'Completed — review again' : 'Resume: day ' + resume) : 'Start plan');
        startBtn.addEventListener('click', function () {
          startPlan(store, plan.id);
          clear(bodyEl);
          renderPlans(bodyEl);
        });
        box.appendChild(startBtn);
        var list = el('div', { 'class': 'sh-daylist' });
        expandPlan(plan).forEach(function (d) {
          var row = el('div', { 'class': 'sh-day' });
          var cb = el('input', { type: 'checkbox' });
          if (isDayDone(getProgress(store, plan.id), d.day)) { cb.checked = true; }
          cb.addEventListener('change', (function (dayNum) {
            return function () {
              toggleDay(store, plan.id, dayNum);
              var pr = getProgress(store, plan.id);
              label.textContent = pr.doneDays.length + ' of ' + plan.days + ' days';
              fill.style.width = Math.round(100 * pr.doneDays.length / plan.days) + '%';
            };
          })(d.day));
          var dayLabel = 'Day ' + d.day + ' — ' +
            (d.kind === 'read' ? d.ref : d.kind === 'reflect' ? 'Reflect: ' + d.scope : 'Grace day');
          row.appendChild(cb);
          row.appendChild(el('span', { 'class': 'sh-dayinfo' }, dayLabel));
          row.appendChild(el('p', { 'class': 'sh-daynote' }, d.note));
          list.appendChild(row);
        });
        box.appendChild(list);
        bodyEl.appendChild(box);
      });
    }

    showTab(0);
    panelEl.appendChild(wrap);
  }

  return {
    META: META,
    init: init,
    db: db,
    parseReference: parseReference,
    expandRef: expandRef,
    verseExists: verseExists,
    bookName: bookName,
    passageMeta: passageMeta,
    questionsFor: questionsFor,
    getTopics: getTopics,
    getTopic: getTopic,
    validateTopics: validateTopics,
    getPlans: getPlans,
    getPlan: getPlan,
    planDay: planDay,
    expandPlan: expandPlan,
    progressKey: progressKey,
    getProgress: getProgress,
    startPlan: startPlan,
    toggleDay: toggleDay,
    isDayDone: isDayDone,
    resumeDay: resumeDay,
    mount: mount
  };
}));

window.__hagahModuleQueue.push(module.exports);
})();
