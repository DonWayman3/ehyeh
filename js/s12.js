
/* ==========================================================================
   Hagah rebuild layer — home job-selector + three guided flows.
   Philosophy (unchanged from the app itself): snippets of help, never
   scripts. This layer writes NOTHING for the user. It only guides: it
   drives the app through the app's own buttons (mode switch, tabs,
   sub-views, the legacy router) so a first-time user always knows
   (1) what am I doing, (2) what happens next, (3) why it matters.
   No network calls. No engine internals modified.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- tiny helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var mem = {};
  var store = {
    get: function (k, fb) {
      try { var v = window.localStorage.getItem(k); return v === null ? (k in mem ? mem[k] : fb) : JSON.parse(v); }
      catch (e) { return k in mem ? mem[k] : fb; }
    },
    set: function (k, v) {
      mem[k] = v;
      try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* best-effort */ }
    }
  };
  var FLOWLOG_KEY = 'hagah.flowlog.v1';
  function flowlog(kind, label, book, chapter) {
    var log = store.get(FLOWLOG_KEY, []);
    if (!Array.isArray(log)) { log = []; }
    log.unshift({ kind: kind, label: label, book: book || null, chapter: chapter || null, at: Date.now() });
    store.set(FLOWLOG_KEY, log.slice(0, 12));
  }

  /* ---------------- artwork (inline SVG, gold line on midnight) --------- */
  var MOTIF = '<svg width="190" height="12" viewBox="0 0 200 12" aria-hidden="true" focusable="false">'
    + '<line x1="0" y1="6" x2="80" y2="6" stroke="rgba(212,175,55,0.5)" stroke-width="1.4"/>'
    + '<line x1="120" y1="6" x2="200" y2="6" stroke="rgba(212,175,55,0.5)" stroke-width="1.4"/>'
    + '<path d="M100 1.5 L106.5 6 L100 10.5 L93.5 6 Z" fill="#D4AF37"/>'
    + '<path d="M84 6 q4 -4.5 8 -4 M116 6 q-4 -4.5 -8 -4" stroke="#D4AF37" stroke-width="1.2" fill="none" stroke-linecap="round"/>'
    + '</svg>';
  var ONB_ART = [
    /* 1 welcome: open book + rising sun */
    '<svg viewBox="0 0 120 64" fill="none" stroke="#D4AF37" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="60" cy="20" r="7" stroke="#E5C158"/><path d="M60 6v4M45 11l2.5 3M75 11l-2.5 3M38 22h5M77 22h5" stroke="#E5C158"/><path d="M60 40 C50 33 38 31 28 35 L28 56 C38 52 50 54 60 60 C70 54 82 52 92 56 L92 35 C82 31 70 33 60 40 Z"/><path d="M60 40v20"/></svg>',
    /* 2 study: book + magnifier */
    '<svg viewBox="0 0 120 64" fill="none" stroke="#D4AF37" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M46 34 C38 28 28 26 18 29 L18 54 C28 51 38 53 46 58 L46 34 Z"/><path d="M46 34 C54 28 64 26 74 29 L74 54 C64 51 54 53 46 58" opacity="0.55"/><circle cx="82" cy="26" r="13" stroke="#E5C158"/><line x1="91" y1="36" x2="104" y2="50" stroke="#E5C158" stroke-width="3"/></svg>',
    /* 3 build: stacked outline blocks */
    '<svg viewBox="0 0 120 64" fill="none" stroke="#D4AF37" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="26" y="8" width="68" height="13" rx="2"/><rect x="26" y="26" width="68" height="13" rx="2" stroke="#E5C158"/><rect x="26" y="44" width="44" height="13" rx="2"/><path d="M34 14.5h26M34 32.5h26M34 50.5h18" stroke-width="1.4" opacity="0.8"/></svg>',
    /* 4 help: lamp + flame */
    '<svg viewBox="0 0 120 64" fill="none" stroke="#D4AF37" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M60 8 C55 15 53 19 60 25 C67 19 65 15 60 8 Z" stroke="#E5C158" fill="rgba(229,193,88,0.15)"/><path d="M38 40 C46 33 74 33 82 40 C74 48 46 48 38 40 Z"/><path d="M42 47 L36 56 M78 47 L84 56 M48 52 h24" /><path d="M60 25v6" opacity="0.8"/></svg>'
  ];

  /* ---------------- drive the app through its own UI ---------------- */
  function currentMode() {
    var b = $('[data-hg-mode][aria-pressed="true"]');
    return b ? b.getAttribute('data-hg-mode') : 'study';
  }
  async function ensureMode(m) {
    if (currentMode() === m) { return; }
    var b = $('[data-hg-mode="' + m + '"]');
    if (b) { b.click(); await sleep(90); }
  }
  async function gotoTab(id) {
    var b = $('[data-hg-tab="' + id + '"]');
    if (!b) { return false; }
    if (b.getAttribute('aria-current') !== 'page') { b.click(); await sleep(90); }
    return true;
  }
  async function gotoSub(v) {
    var b = $('[data-hg-subview="' + v + '"]');
    if (!b) { return false; }
    b.click(); await sleep(90); return true;
  }
  async function gotoLegacy(view) {
    /* view: a legacy view id; route through whichever module hosts it */
    if (['study', 'dictionary', 'assistant'].indexOf(view) !== -1) {
      await gotoTab('scripture'); await gotoSub(view);
    } else {
      await gotoTab('sermon'); await gotoSub(view);
    }
  }
  function visibleView() {
    var ids = ['start', 'setup', 'structure', 'check', 'study', 'dictionary', 'assistant', 'library', 'print'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById('view-' + ids[i]);
      if (el && !el.hasAttribute('hidden')) { return ids[i]; }
    }
    return null;
  }
  function passageLabel() {
    var b = $('#st-book'), c = $('#st-chapter');
    var bt = b && b.selectedIndex >= 0 ? b.options[b.selectedIndex].textContent : '';
    var ct = c && c.selectedIndex >= 0 ? c.options[c.selectedIndex].textContent.replace(/^Chapter\s+/i, '') : '';
    return (bt + ' ' + ct).trim() || 'your passage';
  }
  function passageNumbers() {
    var b = $('#st-book'), c = $('#st-chapter');
    return {
      book: b ? parseInt(b.value, 10) || null : null,
      chapter: c ? parseInt(c.value, 10) || null : null
    };
  }

  /* ---------------- home: saved work ---------------- */
  function fillSaved() {
    var box = $('#hg-saved');
    if (!box) { return; }
    box.innerHTML = '';
    var items = [];
    try {
      var raw = window.localStorage.getItem('c4c.sermonSkeletonBuilder.v1');
      if (raw) {
        var parsed = JSON.parse(raw);
        (parsed.sermons || []).slice().sort(function (a, b2) {
          return String(b2.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        }).slice(0, 3).forEach(function (s) {
          items.push({
            kind: 'sermon', id: s.id,
            title: s.title || s.passageOrTheme || 'Untitled sermon',
            meta: 'Sermon' + (s.preachedDate ? ' · ' + s.preachedDate : '')
          });
        });
      }
    } catch (e) { /* storage unavailable: sermons list just stays empty */ }
    store.get(FLOWLOG_KEY, []).filter(function (e) { return e.kind === 'study'; }).slice(0, 3).forEach(function (e) {
      items.push({ kind: 'study', title: e.label, meta: 'Study', book: e.book, chapter: e.chapter });
    });
    if (!items.length) {
      box.innerHTML = '<p class="hg-saved-empty">Nothing saved yet — your studies and sermons will appear here.</p>';
      return;
    }
    items.forEach(function (it) {
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'hg-saved-item';
      btn.innerHTML = '<span class="hg-s-t">' + esc(it.title) + '</span><span class="hg-s-m">' + esc(it.meta) + '</span>';
      btn.addEventListener('click', async function () {
        hideHome();
        if (it.kind === 'sermon') {
          await ensureMode('sermon'); await gotoTab('sermon'); await gotoSub('library');
          var open = $('[data-lib="open"][data-id="' + it.id + '"]');
          if (open) { open.click(); }
        } else {
          startFlow('study');
          if (it.book && it.chapter) {
            var b = $('#st-book'), c = $('#st-chapter');
            if (b) { b.value = String(it.book); b.dispatchEvent(new Event('change', { bubbles: true })); }
            if (c) { c.value = String(it.chapter); }
            var go = $('#st-go'); if (go) { go.click(); }
          }
        }
      });
      box.appendChild(btn);
    });
  }

  /* ---------------- home show / hide ---------------- */
  function showHome() {
    var h = $('#hg-home');
    if (h) { h.hidden = false; }
    document.body.classList.add('hg-home-on');
    fillSaved();
    window.scrollTo(0, 0);
  }
  function hideHome() {
    var h = $('#hg-home');
    if (h) { h.hidden = true; }
    document.body.classList.remove('hg-home-on');
  }

  /* ---------------- overlays: watch-how + finish ---------------- */
  var VIDEO_FILES = {
    start: 'help-videos/start.mp4', setup: 'help-videos/setup.mp4', study: 'help-videos/study.mp4',
    structure: 'help-videos/structure.mp4', check: 'help-videos/check.mp4', dictionary: 'help-videos/dictionary.mp4',
    library: 'help-videos/library.mp4', assistant: 'help-videos/assistant.mp4', print: 'help-videos/print.mp4'
  };
  function openWatch(view) {
    var ov = $('#hg-watch');
    if (!ov || !VIDEO_FILES[view]) { return; }
    var v = $('#hg-watch-video');
    var fb = $('#hg-watch-fallback');
    fb.hidden = true;
    v.removeAttribute('src');
    v.onerror = function () { fb.hidden = false; };
    v.src = VIDEO_FILES[view];
    try { v.load(); } catch (e) { fb.hidden = false; }
    ov.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeWatch() {
    var ov = $('#hg-watch');
    var v = $('#hg-watch-video');
    if (v) { try { v.pause(); } catch (e) {} }
    if (ov) { ov.hidden = true; }
    document.body.style.overflow = '';
  }
  function openFinish(title, bodyHtml, actions) {
    var ov = $('#hg-finish');
    $('#hg-finish-title').textContent = title;
    $('#hg-finish-body').innerHTML = bodyHtml;
    var row = $('#hg-finish-actions');
    row.innerHTML = '';
    actions.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn' + (a.primary ? '' : ' secondary');
      b.textContent = a.label;
      b.addEventListener('click', function () { closeFinish(); a.fn(); });
      row.appendChild(b);
    });
    ov.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeFinish() {
    var ov = $('#hg-finish');
    if (ov) { ov.hidden = true; }
    document.body.style.overflow = '';
  }

  function openHelpFor(view) {
    var b = $('.help-btn[data-help-view="' + view + '"]');
    if (b) { b.click(); }
  }

  /* ---------------- the flows ---------------- */
  var flow = null; /* { id, step, detour } */

  function stepCount() { return FLOWS[flow.id].steps.length; }

  async function enterStep(i) {
    flow.step = i;
    flow.detour = null;
    var def = FLOWS[flow.id];
    var s = def.steps[i];
    document.body.classList.add('hg-flow-on');
    $('#hg-flowbar').hidden = false;
    $('#hg-flow-name').textContent = def.title;
    renderFlowbar();
    if (s.enter) { await s.enter(); }
    window.scrollTo(0, 0);
    renderFlowbar();
  }

  function renderFlowbar() {
    if (!flow) { return; }
    var def = FLOWS[flow.id];
    var s = def.steps[flow.step];
    if (flow.detour) {
      $('#hg-flow-step').textContent = flow.detour.name;
      $('#hg-flow-count').textContent = def.title + ' · step ' + (flow.step + 1) + ' of ' + def.steps.length;
      $('#hg-flow-why').innerHTML = flow.detour.why;
      $('#hg-flow-next').textContent = '← Back to your ' + def.short;
      $('#hg-flow-back').disabled = true;
      return;
    }
    $('#hg-flow-step').textContent = s.name;
    $('#hg-flow-count').textContent = 'Step ' + (flow.step + 1) + ' of ' + def.steps.length;
    $('#hg-flow-why').innerHTML = typeof s.why === 'function' ? s.why() : s.why;
    $('#hg-flow-next').textContent = s.cta;
    $('#hg-flow-back').disabled = flow.step === 0;
    var w = $('#hg-flow-watch');
    if (s.watch) { w.style.display = ''; w.setAttribute('data-w', s.watch); } else { w.style.display = 'none'; }
    var cmp = $('#hg-flow-compare');
    if (cmp) { cmp.style.display = s.compareChip ? '' : 'none'; }
  }

  async function nextStep() {
    if (!flow) { return; }
    if (flow.detour) { var d = flow.detour; flow.detour = null; await enterStep(flow.step); return; }
    var def = FLOWS[flow.id];
    var s = def.steps[flow.step];
    if (s.onNext) { s.onNext(); }
    if (flow.step >= def.steps.length - 1) { def.finish(); return; }
    await enterStep(flow.step + 1);
  }
  async function backStep() {
    if (!flow || flow.detour) { return; }
    if (flow.step > 0) { await enterStep(flow.step - 1); }
  }
  function exitFlow() {
    flow = null;
    document.body.classList.remove('hg-flow-on');
    $('#hg-flowbar').hidden = true;
    showHome();
  }
  function startFlow(id) {
    hideHome();
    closeFinish();
    flow = { id: id, step: 0, detour: null };
    enterStep(0);
  }
  async function detourCompare() {
    if (!flow) { return; }
    flow.detour = {
      name: 'Compare the translations',
      why: '<strong>Same passage, three translations side by side</strong> — Geneva 1599, King James, and the Easy Read (WEB), verse by verse. Below them, 1 Enoch stands in its own clearly-labeled section: ancient witness, never mixed into the Bible rows.'
    };
    renderFlowbar();
    await gotoTab('clm');
    var t = $('.clm-tab[data-tab="compare"]');
    if (t) { t.click(); }
    window.scrollTo(0, 0);
  }

  var FLOWS = {
    study: {
      title: 'Study a Passage', short: 'study',
      steps: [
        {
          name: 'Pick a passage',
          why: '<strong>What:</strong> choose a book and chapter above, then tap <strong>Read</strong>. <strong>Why:</strong> everything in Ehyeh starts from the text itself — one passage, read slowly.',
          cta: 'Next: dig into the words →', watch: 'study', help: 'study', compareChip: true,
          enter: async function () { await ensureMode('study'); await gotoTab('scripture'); await gotoSub('study'); }
        },
        {
          name: 'Tap a word',
          why: '<strong>What:</strong> tap any word in the passage. Its Hebrew, Aramaic, or Greek root opens below — the meaning <em>in this verse</em>, never a generic dictionary guess. <strong>Why:</strong> the original words carry weight the translation cannot.',
          cta: 'Next: the ancient witness →', watch: 'study', help: 'study', compareChip: true,
          enter: async function () { await gotoTab('scripture'); await gotoSub('study'); }
        },
        {
          name: 'Hear the ancient witness',
          why: '<strong>What:</strong> the Dead Sea Scrolls notes for this very passage — variant readings and context cards, in our own words and cited. <strong>Why:</strong> the scrolls are the oldest witnesses we have. They are <strong>non-canonical testimony</strong> — evidence alongside Scripture, never equal to it. (1 Enoch and Jubilees live under Compare, in their own labeled section.)',
          cta: 'Next: your notes →', watch: null, help: 'study',
          enter: async function () { await gotoTab('scrolls'); }
        },
        {
          name: 'What jumps out at you?',
          why: '<strong>What:</strong> write it in your own words — a note, a question, a word you want to keep (your Wordbook lives here too). <strong>Why:</strong> meditation becomes yours when you say it back. Ehyeh stores it; Ehyeh never writes it.',
          cta: 'Finish →', watch: null, help: 'start',
          enter: async function () { await gotoTab('personal'); },
          onNext: function () {
            var p = passageNumbers();
            flowlog('study', passageLabel(), p.book, p.chapter);
          }
        },
        {
          name: 'Choose what\u2019s next',
          why: '<strong>What:</strong> your study is saved. <strong>Why:</strong> study that leads somewhere — another passage, or the pulpit.',
          cta: 'Done — back to Home', watch: null, help: 'start',
          enter: function () { FLOWS.study.finishChoice(); }
        }
      ],
      finishChoice: function () {
        openFinish('Study saved', '<p>Your notes and words are in <strong>My Study</strong> — they stay in this browser, on this device. The passage was <strong>' + esc(passageLabel()) + '</strong>.</p>', [
          { label: 'Study another passage', fn: function () { startFlow('study'); } },
          { label: 'Build a sermon from this', primary: true, fn: function () { startFlow('sermon'); } },
          { label: 'Back to Home', fn: function () { exitFlow(); } }
        ]);
      },
      finish: function () { exitFlow(); }
    },

    compare: {
      title: 'Compare a Topic', short: 'comparison',
      steps: [
        {
          name: 'Pick a topic',
          why: '<strong>What:</strong> choose a topic below — each one gathers the passages that speak to it, with a short introduction. <strong>Why:</strong> a topic is a doorway; the passages behind it are the house.',
          cta: 'Next: see the passages side by side →', watch: null, help: 'study',
          enter: async function () {
            await ensureMode('study'); await gotoTab('study-helps');
            var tabs = $$('.sh-tab');
            for (var i = 0; i < tabs.length; i++) {
              if (tabs[i].textContent.indexOf('Topical') !== -1) { tabs[i].click(); break; }
            }
            await sleep(80);
          }
        },
        {
          name: 'See the passages side by side',
          why: '<strong>What:</strong> open one of the topic\u2019s passages (tap it in Study Helps, or pick it in Read Scripture), then this screen lays the translations out verse by verse — Geneva, King James, Easy Read. <strong>Why:</strong> where translations agree, be confident; where they differ, slow down.',
          cta: 'Next: review →', watch: 'study', help: 'study',
          enter: async function () { await gotoTab('clm'); var t = $('.clm-tab[data-tab="compare"]'); if (t) { t.click(); } }
        },
        {
          name: 'Review',
          why: '<strong>What:</strong> look back over what you gathered. <strong>Why:</strong> a topic becomes a sermon when you decide what it is really saying — in your words, from these passages.',
          cta: 'Done — back to Home', watch: null, help: 'start',
          enter: function () { FLOWS.compare.finishChoice(); }
        }
      ],
      finishChoice: function () {
        openFinish('Ready to build?', '<ul class="hg-finish-list"><li>You picked the topic and its passages</li><li>You saw them side by side, translation by translation</li><li>Nothing was chosen for you — the list is yours</li></ul><p>From here the sermon builder takes the same passages through Setup → Study → Structure → Check → Print.</p>', [
          { label: 'Study the passage first', fn: function () { startFlow('study'); } },
          { label: 'Build a sermon from these', primary: true, fn: function () { startFlow('sermon'); } },
          { label: 'Done — back to Home', fn: function () { exitFlow(); } }
        ]);
      },
      finish: function () { exitFlow(); }
    },

    sermon: {
      title: 'Build a Sermon', short: 'sermon',
      steps: [
        {
          name: 'Set up your sermon',
          why: '<strong>What:</strong> give it a title, the main passage or theme, and a date. <strong>Why:</strong> a sermon with a name and a text has bones already. If this is a new sermon, pick <em>passage</em>, <em>theme</em>, or <em>blank</em> first — the form follows.',
          cta: 'Step 2: choose your passages →', watch: 'setup', help: 'setup',
          enter: async function () {
            await ensureMode('sermon'); await gotoTab('sermon'); await gotoSub('setup');
            if (visibleView() !== 'setup') { await gotoSub('start'); }
          }
        },
        {
          name: 'Choose your passages',
          why: '<strong>What:</strong> read your main passage here; tap the words that carry it. <strong>Why:</strong> the outline in the next step is only as honest as the reading beneath it. Jot supporting references when you return to Structure.',
          cta: 'Step 3: build the outline →', watch: 'study', help: 'study',
          enter: async function () { await gotoTab('scripture'); await gotoSub('study'); }
        },
        {
          name: 'Build the outline',
          why: '<strong>What:</strong> one central idea, your movements in order, the turn (application — your words), and the landing (your closing). <strong>Why:</strong> Ehyeh suggests the <em>shape</em>; every word in it is yours. <strong>Study Connections</strong> below: add word studies as <em>Original language (Hebrew / Greek)</em> and witness notes as <em>1 Enoch</em> or <em>Dead Sea Scrolls context</em> — tick “include in pulpit sheet” and they print in their own sections.',
          cta: 'Step 4: faithfulness check →', watch: 'structure', help: 'structure',
          enter: async function () { await gotoTab('sermon'); await gotoSub('structure'); }
        },
        {
          name: 'Run the faithfulness check',
          why: '<strong>What:</strong> a short checklist you answer yourself — does the main idea arise from the passage? <strong>Why:</strong> nothing here is completed for you; the check is a mirror, not a grade.',
          cta: 'Step 5: print →', watch: 'check', help: 'check',
          enter: async function () { await gotoTab('sermon'); await gotoSub('check'); }
        },
        {
          name: 'Print your sermon',
          why: '<strong>What:</strong> your pulpit sheet — title and date, your opening purpose, the passages in order in all three translations, the original languages, the ancient witness (labeled non-canonical), your application and closing. <strong>Why:</strong> clean, cited, and ready to preach — one to three pages.',
          cta: 'Done — back to Home', watch: 'print', help: 'print',
          enter: async function () { await gotoTab('sermon'); await gotoSub('print'); }
        }
      ],
      finish: function () { exitFlow(); }
    }
  };

  /* ---------------- section-header motifs for legacy views ----------- */
  function insertMotifs() {
    ['h-study', 'h-dict', 'h-asst', 'h-start', 'h-setup', 'h-structure', 'h-check', 'h-library', 'h-print'].forEach(function (id) {
      var h = document.getElementById(id);
      if (!h || !h.parentNode) { return; }
      var d = document.createElement('div');
      d.className = 'hg-motif'; d.setAttribute('aria-hidden', 'true');
      d.innerHTML = MOTIF;
      h.parentNode.insertBefore(d, h.nextSibling);
    });
  }

  /* ---------------- onboarding artwork ---------------- */
  function wireOnboardingArt() {
    var card = $('#onboard .onb-card');
    if (!card) { return; }
    var art = document.createElement('div');
    art.id = 'onb-art'; art.setAttribute('aria-hidden', 'true');
    card.insertBefore(art, card.firstChild);
    function sync() {
      var dots = $$('#onb-dots .onb-dot');
      var idx = 0;
      dots.forEach(function (d, i) { if (d.classList.contains('on')) { idx = i; } });
      art.innerHTML = ONB_ART[Math.min(idx, ONB_ART.length - 1)];
    }
    var dotsBox = $('#onb-dots');
    if (dotsBox && window.MutationObserver) {
      new MutationObserver(sync).observe(dotsBox, { childList: true, subtree: true, attributes: true });
    }
    sync();
  }

  /* ---------------- wiring ---------------- */
  function ready(fn) {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', fn); }
    else { fn(); }
  }
  ready(function () {
    insertMotifs();
    wireOnboardingArt();
    $$('#hg-home [data-flow]').forEach(function (b) {
      b.addEventListener('click', function () { startFlow(b.getAttribute('data-flow')); });
    });
    var all = $('#hg-alltools');
    if (all) { all.addEventListener('click', hideHome); }
    var tour = $('#hg-tour');
    if (tour) { tour.addEventListener('click', function () { hideHome(); var r = $('#onboard-replay'); if (r) { r.click(); } }); }
    var lib = $('#hg-lib');
    if (lib) { lib.addEventListener('click', async function () { hideHome(); await ensureMode('sermon'); await gotoTab('sermon'); await gotoSub('library'); }); }
    var dic = $('#hg-dict');
    if (dic) { dic.addEventListener('click', async function () { hideHome(); await gotoTab('scripture'); await gotoSub('dictionary'); }); }
    var ast = $('#hg-asst');
    if (ast) { ast.addEventListener('click', async function () { hideHome(); await gotoTab('scripture'); await gotoSub('assistant'); }); }
    var hb = $('#hg-homebtn');
    if (hb) { hb.addEventListener('click', function () { if (flow) { exitFlow(); } else { showHome(); } }); }
    var nx = $('#hg-flow-next'); if (nx) { nx.addEventListener('click', nextStep); }
    var bk = $('#hg-flow-back'); if (bk) { bk.addEventListener('click', backStep); }
    var ex = $('#hg-flow-exit'); if (ex) { ex.addEventListener('click', exitFlow); }
    var hp = $('#hg-flow-help'); if (hp) { hp.addEventListener('click', function () { if (flow) { openHelpFor(FLOWS[flow.id].steps[flow.step].help || 'start'); } }); }
    var wt = $('#hg-flow-watch'); if (wt) { wt.addEventListener('click', function () { var v = wt.getAttribute('data-w'); if (v) { openWatch(v); } }); }
    var cp = $('#hg-flow-compare'); if (cp) { cp.addEventListener('click', detourCompare); }
    var wc = $('#hg-watch-close'); if (wc) { wc.addEventListener('click', closeWatch); }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeWatch(); }
    });
    showHome();
  });
})();

