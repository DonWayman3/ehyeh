
/* Hagah v3 — browser boot. Inlined by v3/tools/build_hagah.py AFTER shell.js.
 * Browser-only (not required in Node tests). Wires:
 *   - storage (localStorage with in-memory fallback)
 *   - window.__hagahModuleQueue (v3 feature modules, wrapped by the build)
 *   - two built-in carry-over modules: 'scripture' (v2 study UI) and
 *     'sermon' (v1 skeleton builder, sermon mode only)
 *   - ctx deps: guard from window.SSB (v2 fail-closed allowlist, unchanged),
 *     toast to the status line, jumpToRef via SSB.parseReference
 *
 * The v2 study UI (SSBUI) and v1 skeleton UI run from their original markup,
 * extracted verbatim from v2/template.html by the build. The build exports
 * the v1 view router as window.__hagahLegacyShow(view); the adapters below
 * drive it. v2/v2.cjs and v2/v2-ui.cjs are never modified.
 */
(function () {
  'use strict';

  function fail(msg) {
    try {
      var p = document.createElement('p');
      p.setAttribute('role', 'alert');
      p.textContent = 'Ehyeh could not start: ' + msg;
      document.body.appendChild(p);
    } catch (e) { /* last resort: nothing to draw on */ }
  }

  if (!window.HagahShell) { fail('the app shell failed to load.'); return; }
  if (!window.SSB || !window.SSB_DATA) { fail('the Bible data failed to load.'); return; }
  window.SSB.init(window.SSB_DATA);

  var Shell = window.HagahShell;

  /* ---------- storage: localStorage, else in-memory (never throws) ---------- */
  function pickStorage() {
    try {
      var ls = window.localStorage;
      ls.setItem('__hagah_probe', '1');
      ls.removeItem('__hagah_probe');
      return ls;
    } catch (e) {
      var m = {};
      return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
        setItem: function (k, v) { m[String(k)] = String(v); },
        removeItem: function (k) { delete m[String(k)]; }
      };
    }
  }
  var storage = pickStorage();

  /* The v1 view router, exported by the build. Resolved LAZILY at
     each use (round 8): the one-time snapshot this replaces wedged
     the sermon planner for the whole life of a tab whenever the
     router module's boot was interrupted before it published its
     bridge — the mount kept testing the stale null and answering
     "could not start" while the sermons sat intact (re-test 7,
     R1). A live lookup can only improve as boot completes. */
  function legacyShowFn() {
    return (typeof window.__hagahLegacyShow === 'function')
      ? window.__hagahLegacyShow
      : null;
  }

  function ensureReader() {
    try {
      if (window.SSBUI && window.SSBUI.browserInit && !window._ssbui) {
        window._ssbui = window.SSBUI.browserInit();
      }
    } catch (e) { /* the reader stays unavailable; sub-views still render */ }
  }

  /* Keep the v2 reader on the shell's shared passage (best-effort). */
  function syncReaderToPassage(ctx) {
    try {
      var ui = window._ssbui;
      if (ui && ui._study && typeof ui.renderChapter === 'function') {
        ui._study.book = ctx.passage.book;
        ui._study.chapter = ctx.passage.chapter;
        ui.renderChapter();
      }
    } catch (e) { /* best-effort */ }
  }

  /* ---------- register v3 feature modules queued by the build ---------- */
  var skipped = [];
  (window.__hagahModuleQueue || []).forEach(function (mod) {
    try { Shell.registerModule(mod); }
    catch (e) {
      var id = (mod && mod.META && mod.META.id) || '(unknown)';
      skipped.push(id + ': ' + e.message);
    }
  });

  /* ---------- built-in carry-over module: Read Scripture (v2 UI) ---------- */
  Shell.registerModule({
    META: { id: 'scripture', title: 'Read Scripture', modes: ['study', 'sermon'] },
    mount: function (panelEl, ctx) {
      var h = ctx.h;
      var box = document.getElementById('legacy-scripture');
      var sub = document.getElementById('hagah-subnav');
      var legacyShow = legacyShowFn();
      if (!box || !legacyShow) {
        panelEl.appendChild(h('p', { text: 'The Scripture reader could not start.' }));
        return;
      }
      box.removeAttribute('hidden');
      ensureReader();
      var views = [
        { id: 'study', label: 'Read' },
        { id: 'dictionary', label: 'Dictionary' },
        { id: 'assistant', label: 'Assistant' }
      ];
      function pick(view) {
        legacyShow(view);
        syncReaderToPassage(ctx);
        var btns = sub.querySelectorAll('[data-hg-subview]');
        for (var i = 0; i < btns.length; i++) {
          if (btns[i].getAttribute('data-hg-subview') === view) { btns[i].setAttribute('aria-current', 'true'); }
          else { btns[i].removeAttribute('aria-current'); }
        }
      }
      views.forEach(function (v) {
        var b = h('button', { type: 'button', 'data-hg-subview': v.id, text: v.label });
        b.addEventListener('click', function () { pick(v.id); });
        sub.appendChild(b);
      });
      ctx.onPassageChange(function () { syncReaderToPassage(ctx); });
      pick('study');
    }
  });

  /* ---------- built-in carry-over module: Sermon Prep (v1 UI, sermon mode) ---------- */
  Shell.registerModule({
    META: { id: 'sermon', title: 'Sermon Prep', modes: ['sermon'] },
    mount: function (panelEl, ctx) {
      var h = ctx.h;
      var box = document.getElementById('legacy-sermon');
      var sub = document.getElementById('hagah-subnav');
      function startPlanner(showFn) {
        box.removeAttribute('hidden');
        var views = [
          { id: 'start', label: 'Start' },
          { id: 'setup', label: 'Setup' },
          { id: 'structure', label: 'Structure' },
          { id: 'check', label: 'Check it against the Bible' },
          { id: 'library', label: 'Saved sermons' },
          { id: 'print', label: 'Print preview' }
        ];
        function pick(view) {
          showFn(view);
          var btns = sub.querySelectorAll('[data-hg-subview]');
          for (var i = 0; i < btns.length; i++) {
            if (btns[i].getAttribute('data-hg-subview') === view) { btns[i].setAttribute('aria-current', 'true'); }
            else { btns[i].removeAttribute('aria-current'); }
          }
        }
        views.forEach(function (v) {
          var b = h('button', { type: 'button', 'data-hg-subview': v.id, text: v.label });
          b.addEventListener('click', function () { pick(v.id); });
          sub.appendChild(b);
        });
        pick('start');
      }
      var showFn = legacyShowFn();
      if (box && showFn) { startPlanner(showFn); return; }
      if (!box) {
        panelEl.appendChild(h('p', { text: 'The sermon planner could not start.' }));
        return;
      }
      /* Round 8: the router publishes its bridge during its own
         module's boot run. If that run is still finishing — a
         reloaded tab is the known case (re-test 7, R1) — wait for
         the bridge instead of declaring the planner dead over
         intact sermons. Only a bridge that never arrives earns
         the could-not-start note. */
      var note = h('p', { text: 'The sermon planner is starting…' });
      panelEl.appendChild(note);
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        var fn = legacyShowFn();
        if (fn) {
          clearInterval(iv);
          if (note.parentNode) { note.parentNode.removeChild(note); }
          startPlanner(fn);
        } else if (tries > 16) {
          clearInterval(iv);
          note.textContent = 'The sermon planner could not start.';
        }
      }, 250);
    }
  });

  /* ---------- status-line toast (shared with the v1/v2 UI) ---------- */
  function toast(msg) {
    try {
      var s = document.getElementById('status');
      if (!s) { return; }
      while (s.firstChild) { s.removeChild(s.firstChild); }
      var span = document.createElement('span');
      span.textContent = String(msg);
      s.appendChild(span);
    } catch (e) { /* best-effort */ }
  }

  /* ---------- boot the shell ---------- */
  var app = Shell.initShell(document, {
    storage: storage,
    dataV2: window.SSB_DATA,
    dataV3: window.HAGAH_DATA || {},
    guard: {
      classifyIntent: window.SSB.classifyIntent,
      callAssistant: window.SSB.callAssistant
    },
    toast: toast,
    jumpToRef: function (ref, apiRef) {
      var parsed = null;
      try { parsed = window.SSB.parseReference(ref); } catch (e) { parsed = null; }
      if (!parsed) {
        toast('Could not understand the reference "' + ref + '". Try "John 3:16".');
        return;
      }
      apiRef.mountModule('scripture');
      if (apiRef.ctx && !apiRef.ctx.navigate(parsed.book, parsed.chapter)) {
        toast('Could not open "' + ref + '".');
      }
    }
  });

  /* Staging additions (the listen door) drive the shell through this
     handle — the same export pattern the build already uses for
     window.__hagahLegacyShow. */
  window.__hagahApp = app;

  if (skipped.length) {
    toast('Note: ' + skipped.length + ' tool(s) did not load: ' + skipped.join('; '));
  }
})();

