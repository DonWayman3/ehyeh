
/* Hagah v3 — app shell: mode switch, module registry, shared ctx.
 *
 * Universal module pattern (mirrors v2/v2.cjs): in Node this file exports the
 * factory via module.exports; in the browser it attaches as window.HagahShell.
 *
 * Responsibilities:
 *   - module registry: validate + register v3 feature modules (META/mount)
 *   - mode switch: 'study' (Personal Study, default) | 'sermon' (Sermon Prep),
 *     persisted in localStorage under key 'hagah.mode'
 *   - ctx factory: the shared context every module's mount(panelEl, ctx) receives
 *   - h(): textContent-safe DOM helper (never innerHTML)
 *   - store: localStorage wrapper, keys auto-prefixed 'hagah.'
 *
 * Philosophy (carried from v2): snippets of help, never scripts. The shell never
 * generates sermon/devotional/prayer/illustration content. Every user field
 * starts empty. No teacher/channel/creator is ever named.
 */
(function (root, factory) {
  'use strict';
  var Shell = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = Shell; }
  else { root.HagahShell = Shell; }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '3.0.0-ws1';
  var STORE_PREFIX = 'hagah.';
  var MODE_KEY = 'mode'; // full localStorage key: 'hagah.mode'
  var MODES = ['study', 'sermon'];
  var MODE_LABELS = { study: 'Personal Study', sermon: 'Sermon Prep' };

  /* ------------------------------------------------------------------
     Mode persistence. Never throws: corrupt/missing/unavailable storage
     always falls back to 'study' (the default).
     ------------------------------------------------------------------ */
  function resolveMode(storage) {
    try {
      if (!storage || typeof storage.getItem !== 'function') { return 'study'; }
      var raw = storage.getItem(STORE_PREFIX + MODE_KEY);
      if (raw === null || raw === undefined) { return 'study'; }
      var v = JSON.parse(raw);
      return v === 'sermon' ? 'sermon' : 'study';
    } catch (e) { return 'study'; }
  }

  /* ------------------------------------------------------------------
     Store: keys auto-prefixed 'hagah.'. Values are JSON-encoded.
     Semantics are deliberately fail-loud (NOT fail-silent):
       get(k, fallback) -> fallback when the key is missing; THROWS on corrupt
                           JSON or unreadable storage so the caller can
                           quarantine + notify honestly (see personal.cjs).
       set(k, v)        -> THROWS on quota/unavailable storage (QuotaExceededError
                           propagates; callers catch and keep in-memory state).
       del(k)           -> THROWS on storage failure.
     ------------------------------------------------------------------ */
  function createStore(storage) {
    function full(k) { return STORE_PREFIX + String(k); }
    return {
      get: function (k, fallback) {
        var raw = storage.getItem(full(k));
        if (raw === null || raw === undefined) { return fallback; }
        return JSON.parse(raw); // throws on corrupt: intentional
      },
      set: function (k, v) {
        storage.setItem(full(k), JSON.stringify(v)); // throws on quota: intentional
      },
      del: function (k) {
        storage.removeItem(full(k));
      }
    };
  }

  /* ------------------------------------------------------------------
     h(tag, attrs, ...kids): textContent-safe DOM builder. Never uses
     innerHTML. Supported attrs: class, id, type, value, placeholder,
     accept, hidden, data-*, aria-*, text (sets textContent), plus any
     other attribute name. true -> empty attribute; false/null/undefined
     -> attribute omitted. String/number kids become text nodes; arrays
     are flattened; anything else is assumed to be a DOM node.
     ------------------------------------------------------------------ */
  function createH(doc) {
    function appendKid(node, kid) {
      if (kid === undefined || kid === null || kid === false) { return; }
      if (Array.isArray(kid)) {
        for (var i = 0; i < kid.length; i++) { appendKid(node, kid[i]); }
        return;
      }
      if (typeof kid === 'string' || typeof kid === 'number') {
        node.appendChild(doc.createTextNode(String(kid)));
        return;
      }
      node.appendChild(kid); // a DOM node built elsewhere
    }
    function h(tag, attrs) {
      var node = doc.createElement(String(tag));
      attrs = attrs || {};
      Object.keys(attrs).forEach(function (name) {
        var v = attrs[name];
        if (v === undefined || v === null || v === false) { return; }
        if (name === 'text') { node.textContent = String(v); return; }
        if (v === true) { node.setAttribute(name, ''); return; }
        node.setAttribute(name, String(v));
      });
      for (var i = 2; i < arguments.length; i++) { appendKid(node, arguments[i]); }
      return node;
    }
    return h;
  }

  /* ------------------------------------------------------------------
     Module registry. A module is { META: {id, title, modes}, mount }.
     Extra META fields are tolerated (e.g. a module's own sub-view list).
     ------------------------------------------------------------------ */
  var registry = {};
  var regOrder = [];

  function validateModule(mod) {
    if (!mod || typeof mod !== 'object') { return 'module must be an object'; }
    var META = mod.META;
    if (!META || typeof META !== 'object') { return 'module.META is missing'; }
    if (typeof META.id !== 'string' || !META.id) { return 'META.id must be a non-empty string'; }
    if (typeof META.title !== 'string' || !META.title) { return 'META.title must be a non-empty string'; }
    if (!Array.isArray(META.modes) || META.modes.length === 0) { return 'META.modes must be a non-empty array'; }
    for (var i = 0; i < META.modes.length; i++) {
      if (MODES.indexOf(META.modes[i]) === -1) {
        return 'META.modes[' + i + '] must be one of: ' + MODES.join(', ');
      }
    }
    if (typeof mod.mount !== 'function') { return 'module.mount must be a function'; }
    return null;
  }

  function registerModule(mod) {
    var err = validateModule(mod);
    if (err) { throw new Error('Hagah: invalid module: ' + err); }
    var id = mod.META.id;
    if (registry[id]) { throw new Error('Hagah: duplicate module id "' + id + '"'); }
    registry[id] = mod;
    regOrder.push(id);
    return mod;
  }

  function getModule(id) { return registry[id] || null; }

  function modulesForMode(mode) {
    return regOrder
      .map(function (id) { return registry[id]; })
      .filter(function (mod) { return mod.META.modes.indexOf(mode) !== -1; });
  }

  function resetRegistry() { registry = {}; regOrder = []; } // tests only

  /* ------------------------------------------------------------------
     Data view: v2 bundle (read-only) + v3 bundle namespaced under .hagah.
     Top-level keys are shared by reference; modules must not mutate.
     ------------------------------------------------------------------ */
  function combineData(dataV2, dataV3) {
    var d = {};
    if (dataV2 && typeof dataV2 === 'object') {
      Object.keys(dataV2).forEach(function (k) { d[k] = dataV2[k]; });
    }
    d.hagah = (dataV3 && typeof dataV3 === 'object') ? dataV3 : {};
    return d;
  }

  /* ------------------------------------------------------------------
     createCtx: the shared context handed to mount(panelEl, ctx).
       mode            snapshot of the current mode ('study'|'sermon')
       onModeChange(fn)->unsub   subscribe to mode switches
       store           {get,set,del}, keys auto-prefixed 'hagah.'
       data            v2 bundle + .hagah v3 bundle, read-only
       guard           {classifyIntent, callAssistant} — v2 fail-closed
                       allowlist; never bypassed
       h(tag,attrs,...kids)      textContent-safe DOM helper
       passage         {book, chapter} shared current passage
       navigate(b,c)   ->bool  set shared passage (validated)
       onPassageChange(fn)->unsub
       notify(msg)     shell toast/announcement (best-effort)
       onJump(ref)     navigate to a verse ref ("John 3:16") and show
                       the reader module
     Every mountModule() call builds a FRESH ctx: listeners are per-mount,
     so modules subscribe inside mount() and never leak across remounts.
     ------------------------------------------------------------------ */
  function createCtx(doc, deps) {
    var store = createStore(deps.storage);
    var h = createH(doc);
    var mode = deps.mode;
    var modeListeners = [];
    var passageListeners = [];
    var passage = { book: 43, chapter: 1 }; // John 1, matches v2 default

    function fire(list, arg) {
      list.slice().forEach(function (fn) { try { fn(arg); } catch (e) { /* listener errors never break the shell */ } });
    }

    var ctx = {
      mode: mode,
      onModeChange: function (fn) {
        modeListeners.push(fn);
        return function () {
          var i = modeListeners.indexOf(fn);
          if (i !== -1) { modeListeners.splice(i, 1); }
        };
      },
      store: store,
      data: combineData(deps.dataV2, deps.dataV3),
      guard: deps.guard,
      h: h,
      passage: passage,
      navigate: function (book, chapter) {
        book = parseInt(book, 10); chapter = parseInt(chapter, 10);
        if (!(book >= 1 && book <= 66 && chapter >= 1)) { return false; }
        var counts = (deps.dataV2 && deps.dataV2.chapter_counts) || null;
        if (counts && !(chapter <= (counts[String(book)] || 0))) { return false; }
        passage.book = book; passage.chapter = chapter;
        fire(passageListeners, { book: book, chapter: chapter });
        return true;
      },
      onPassageChange: function (fn) {
        passageListeners.push(fn);
        return function () {
          var i = passageListeners.indexOf(fn);
          if (i !== -1) { passageListeners.splice(i, 1); }
        };
      },
      notify: function (msg) {
        try { deps.toast(String(msg)); } catch (e) { /* best-effort */ }
      },
      onJump: function (ref) { deps.jumpToRef(ref); }
    };

    return {
      ctx: ctx,
      _setMode: function (m) { mode = m; ctx.mode = m; fire(modeListeners, m); }
    };
  }

  /* ------------------------------------------------------------------
     initShell(doc, opts): wire the static header markup produced by the
     build (mode buttons [data-hg-mode], tab list #hagah-tabs, module
     panel #hagah-panel, sub-nav #hagah-subnav, legacy containers
     [data-hg-legacy]). Mounts the default module and returns the app api.
     opts: { storage, dataV2, dataV3, guard, toast, jumpToRef }
     ------------------------------------------------------------------ */
  var ID_TABS = 'hagah-tabs';
  var ID_PANEL = 'hagah-panel';
  var ID_SUBNAV = 'hagah-subnav';

  function initShell(doc, opts) {
    opts = opts || {};
    var storage = opts.storage;
    var mode = resolveMode(storage);
    var h = createH(doc);
    var currentModuleId = null;
    var holder = null; // { ctx, _setMode } for the mounted module
    var currentMount = null; // mount() result of the live module (may carry unmount())

    function $(id) { return doc.getElementById(id); }

    function clearEl(node) {
      if (!node) { return; }
      while (node.firstChild) { node.removeChild(node.firstChild); }
    }

    function renderModeButtons() {
      var btns = doc.querySelectorAll('[data-hg-mode]');
      for (var i = 0; i < btns.length; i++) {
        (function (b) {
          var m = b.getAttribute('data-hg-mode');
          if (m === mode) { b.setAttribute('aria-pressed', 'true'); }
          else { b.removeAttribute('aria-pressed'); }
        })(btns[i]);
      }
    }

    /* Simplicity pass (2026-10-29): a picture above every module's name in
       the module nav — prepended in renderTabs, plain-word label kept. */
    var MODULE_PICS = {
      scrolls: 'dead-sea-scrolls.webp',
      clm: 'listen-ear.webp',
      personal: 'my-study.webp',
      sermon: 'sermon-prep.webp',
      scripture: 'read-scripture.webp',
      'study-helps': 'study-helps.webp'
    };

    function renderTabs() {
      var ul = $(ID_TABS);
      clearEl(ul);
      modulesForMode(mode).forEach(function (mod) {
        var li = h('li');
        var b = h('button', {
          type: 'button',
          'data-hg-tab': mod.META.id
        });
        var pic = MODULE_PICS[mod.META.id];
        if (pic) {
          b.appendChild(h('img', {
            src: 'assets/pics/' + pic,
            alt: '',
            'aria-hidden': 'true',
            'class': 'hg-mod-pic'
          }));
        }
        b.appendChild(h('span', { text: mod.META.title }));
        if (mod.META.id === currentModuleId) { b.setAttribute('aria-current', 'page'); }
        b.addEventListener('click', function () { api.mountModule(mod.META.id); });
        li.appendChild(b);
        ul.appendChild(li);
      });
    }

    function hideLegacy() {
      var boxes = doc.querySelectorAll('[data-hg-legacy]');
      for (var i = 0; i < boxes.length; i++) { boxes[i].setAttribute('hidden', ''); }
    }

    function freshCtx() {
      holder = createCtx(doc, {
        storage: storage,
        mode: mode,
        dataV2: opts.dataV2,
        dataV3: opts.dataV3,
        guard: opts.guard,
        toast: opts.toast,
        jumpToRef: function (ref) { opts.jumpToRef(ref, api); }
      });
      return holder.ctx;
    }

    function mountModule(id) {
      var mod = getModule(id);
      if (!mod) { return false; }
      currentModuleId = id;
      if (currentMount && typeof currentMount.unmount === 'function') {
        try { currentMount.unmount(); } catch (e) { /* a module's cleanup never breaks navigation */ }
      }
      currentMount = null;
      clearEl($(ID_PANEL));
      clearEl($(ID_SUBNAV));
      hideLegacy();
      renderTabs();
      var ctx = freshCtx();
      var mounted = mod.mount($(ID_PANEL), ctx);
      currentMount = (mounted && typeof mounted === 'object') ? mounted : null;
      api.ctx = ctx;
      return true;
    }

    function setMode(m) {
      if (MODES.indexOf(m) === -1) { return false; }
      if (m === mode) { return true; }
      mode = m;
      try { createStore(storage).set(MODE_KEY, m); }
      catch (e) { /* private-mode storage: keep the mode in memory, still switch */ }
      renderModeButtons();
      var visible = modulesForMode(mode).map(function (mod) { return mod.META.id; });
      if (visible.indexOf(currentModuleId) === -1) { mountModule(visible[0]); }
      else { mountModule(currentModuleId); } // remount so the module can adapt
      if (holder) { holder._setMode(m); }
      return true;
    }

    function getMode() { return mode; }

    var api = {
      ctx: null, // set after first mount
      getMode: getMode,
      setMode: setMode,
      mountModule: mountModule,
      getModuleIds: function () { return regOrder.slice(); },
      modulesForMode: modulesForMode
    };

    // wire mode buttons
    var modeBtns = doc.querySelectorAll('[data-hg-mode]');
    for (var i = 0; i < modeBtns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { setMode(b.getAttribute('data-hg-mode')); });
      })(modeBtns[i]);
    }

    renderModeButtons();
    var first = modulesForMode(mode)[0];
    if (first) { mountModule(first.META.id); }
    return api;
  }

  return {
    VERSION: VERSION,
    STORE_PREFIX: STORE_PREFIX,
    MODES: MODES,
    MODE_LABELS: MODE_LABELS,
    resolveMode: resolveMode,
    createStore: createStore,
    createH: createH,
    validateModule: validateModule,
    registerModule: registerModule,
    getModule: getModule,
    modulesForMode: modulesForMode,
    resetRegistry: resetRegistry,
    combineData: combineData,
    createCtx: createCtx,
    initShell: initShell
  };
}));

