

(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Constants and schema
     ------------------------------------------------------------------ */
  var SCHEMA_VERSION = 1;
  var STORAGE_KEY = 'c4c.sermonSkeletonBuilder.v1';
  var EXPORT_FORMAT = 'c4c-sermon-skeleton';
  var MAX_MOVEMENTS = 5;
  var CHECK_COUNT = 6;
  var LIMITS = { short: 500, medium: 20000, long: 60000 };
  var START_TYPES = ['passage', 'theme', 'blank'];
  var APPROACHES = ['passage', 'thematic'];
  var COUNTS = [3, 5];
  var STATUSES = ['Draft', 'Preached', 'Revisiting'];
  var MAX_CONNECTIONS = 100;
  var SC_CATEGORIES = ['Bible', 'Apocrypha / Deuterocanon', '1 Enoch', 'Dead Sea Scrolls context', 'Original language (Hebrew / Greek)', 'Other historical source'];
  var SC_TYPES = ['Related theme', 'Similar wording', 'Historical background', 'Manuscript context', 'Pastor’s own study note'];
  var CHECK_ITEMS = [
    'Does the main idea arise from the passage or theme?',
    'Do the main points follow the passage’s flow or the one theme all the way through?',
    'Are supporting references truly supportive?',
    'Have I supplied my own pastoral application, illustrations, and voice?',
    'Does the landing return people to the central text or truth?',
    'Have I prayed and studied before preaching?'
  ];
  var MOVEMENT_FIELDS = [
    { key: 'title', label: 'Main point', cls: '' },
    { key: 'primaryRef', label: 'Primary Scripture reference', cls: '' },
    { key: 'supportingRefs', label: 'Supporting Scripture references', cls: '' },
    { key: 'emphasis', label: 'What the text emphasizes', cls: 'tall' },
    { key: 'transition', label: 'Transition', cls: '' },
    { key: 'notes', label: 'Pastor’s private notes', cls: 'notes' }
  ];

  /* ------------------------------------------------------------------
     Utilities
     ------------------------------------------------------------------ */
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) { Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); }
    if (text !== undefined && text !== null) { n.textContent = String(text); }
    return n;
  }
  function nowIso() { return new Date().toISOString(); }
  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') { return window.crypto.randomUUID(); }
    var s = '';
    for (var i = 0; i < 32; i++) { s += Math.floor(Math.random() * 16).toString(16); }
    return s;
  }
  function timeLabel() {
    try { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function clampStr(v, max) {
    if (typeof v !== 'string') { return ''; }
    return v.length > max ? v.slice(0, max) : v;
  }
  function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  /* ------------------------------------------------------------------
     Data model
     ------------------------------------------------------------------ */
  function blankMovement() {
    return { title: '', primaryRef: '', supportingRefs: '', emphasis: '', transition: '', notes: '', context: '', explainers: [] };
  }
  /* One added term explanation on a point (Donnie, 2026-10-29):
     study material he chose to keep — term, the explanation text, the
     references it rests on, and where it came from ('prepared',
     'dictionary', or 'helper'). Prints under its point only because
     he added it; un-added explanations never reach the sheet. */
  var MAX_EXPLAINERS = 6;
  function clampExplainers(rawList) {
    if (!Array.isArray(rawList)) { return []; }
    var out = [];
    rawList.slice(0, MAX_EXPLAINERS).forEach(function (re) {
      if (!isPlainObject(re)) { return; }
      out.push({
        term: clampStr(re.term, 140),
        text: clampStr(re.text, LIMITS.medium),
        refs: clampStr(re.refs, LIMITS.short),
        source: (re.source === 'prepared' || re.source === 'dictionary' || re.source === 'helper') ? re.source : 'prepared'
      });
    });
    return out.filter(function (e) { return e.term && e.text; });
  }
  function blankConnection() {
    return { id: newId(), sourceCategory: SC_CATEGORIES[0], reference: '', connectionType: SC_TYPES[0], note: '', includeInPulpitSheet: false };
  }
  function newSermon(startType) {
    var ts = nowIso();
    var m = [];
    for (var i = 0; i < MAX_MOVEMENTS; i++) { m.push(blankMovement()); }
    return {
      schemaVersion: SCHEMA_VERSION,
      id: newId(),
      createdAt: ts,
      updatedAt: ts,
      title: '',
      startType: startType,
      passageOrTheme: '',
      approach: startType === 'theme' ? 'thematic' : 'passage',
      movementCount: 3,
      purpose: '',
      series: '',
      occasion: '',
      preachedDate: '',
      supportingRefs: '',
      scriptureText: '',
      centralIdea: '',
      movements: m,
      realLifeIdeas: '',
      todayIdeas: '',
      suggestedFor: '',
      versesAppliedFor: '',
      versesApplied: '',
      suggestTier: '',
      engineFor: '',
      engineApplied: '',
      helperFor: '',
      helperApplied: '',
      turn: '',
      landing: '',
      faithfulness: [false, false, false, false, false, false],
      status: 'Draft',
      studyConnections: []
    };
  }

  /* Validate one raw sermon object. Returns { ok: true, sermon } or { ok: false, error }.
     Never trusts input types; every string is clamped; unknown keys are dropped. */
  function validateSermon(raw, label) {
    if (!isPlainObject(raw)) { return { ok: false, error: label + ' is not a sermon record.' }; }
    if (raw.schemaVersion !== SCHEMA_VERSION) { return { ok: false, error: label + ' has an unsupported schemaVersion (expected ' + SCHEMA_VERSION + ').' }; }
    if (typeof raw.id !== 'string' || raw.id.length < 1 || raw.id.length > 64) { return { ok: false, error: label + ' has a missing or invalid id.' }; }
    if (START_TYPES.indexOf(raw.startType) < 0) { return { ok: false, error: label + ' has an invalid start type.' }; }
    if (APPROACHES.indexOf(raw.approach) < 0) { return { ok: false, error: label + ' has an invalid preaching approach.' }; }
    if (COUNTS.indexOf(raw.movementCount) < 0) { return { ok: false, error: label + ' has an invalid main-point count (expected 3 or 5).' }; }
    if (STATUSES.indexOf(raw.status) < 0) { return { ok: false, error: label + ' has an invalid status.' }; }
    if (!Array.isArray(raw.movements) || raw.movements.length < 3 || raw.movements.length > MAX_MOVEMENTS) { return { ok: false, error: label + ' is missing its main points list.' }; }
    if (!Array.isArray(raw.faithfulness) || raw.faithfulness.length !== CHECK_COUNT) { return { ok: false, error: label + ' has an invalid faithfulness-check state.' }; }
    if (typeof raw.createdAt !== 'string' || typeof raw.updatedAt !== 'string') { return { ok: false, error: label + ' is missing its timestamps.' }; }
    if (raw.preachedDate !== '' && raw.preachedDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(raw.preachedDate))) { return { ok: false, error: label + ' has an invalid preached date.' }; }
    var movements = [];
    for (var i = 0; i < MAX_MOVEMENTS; i++) {
      var rm = raw.movements[i];
      var m = blankMovement();
      if (rm !== undefined) {
        if (!isPlainObject(rm)) { return { ok: false, error: label + ' main point ' + (i + 1) + ' is not a valid record.' }; }
        m.title = clampStr(rm.title, LIMITS.short);
        m.primaryRef = clampStr(rm.primaryRef, LIMITS.short);
        m.supportingRefs = clampStr(rm.supportingRefs, LIMITS.medium);
        m.emphasis = clampStr(rm.emphasis, LIMITS.medium);
        m.transition = clampStr(rm.transition, LIMITS.medium);
        m.notes = clampStr(rm.notes, LIMITS.long);
        m.context = clampStr(rm.context, LIMITS.medium);
        m.explainers = clampExplainers(rm.explainers);
      }
      movements.push(m);
    }
    var checks = [];
    for (var c = 0; c < CHECK_COUNT; c++) { checks.push(raw.faithfulness[c] === true); }
    /* studyConnections is optional (older records lack it) but, when present, must be a fully valid list. */
    var rawSc = raw.studyConnections === undefined ? [] : raw.studyConnections;
    if (!Array.isArray(rawSc)) { return { ok: false, error: label + ' has an invalid study connections list.' }; }
    if (rawSc.length > MAX_CONNECTIONS) { return { ok: false, error: label + ' has more than ' + MAX_CONNECTIONS + ' study connections.' }; }
    var conns = [], seenIds = {};
    for (var k = 0; k < rawSc.length; k++) {
      var rc = rawSc[k], cl = label + ' study connection ' + (k + 1);
      if (!isPlainObject(rc)) { return { ok: false, error: cl + ' is not a valid record.' }; }
      if (typeof rc.id !== 'string' || rc.id.length < 1 || rc.id.length > 64) { return { ok: false, error: cl + ' has a missing or invalid id.' }; }
      if (SC_CATEGORIES.indexOf(rc.sourceCategory) < 0) { return { ok: false, error: cl + ' has an invalid source category.' }; }
      if (SC_TYPES.indexOf(rc.connectionType) < 0) { return { ok: false, error: cl + ' has an invalid connection type.' }; }
      if (typeof rc.reference !== 'string') { return { ok: false, error: cl + ' has an invalid reference.' }; }
      if (typeof rc.note !== 'string') { return { ok: false, error: cl + ' has an invalid note.' }; }
      if (typeof rc.includeInPulpitSheet !== 'boolean') { return { ok: false, error: cl + ' has an invalid pulpit-sheet setting.' }; }
      var cid = seenIds[rc.id] ? newId() : rc.id;
      seenIds[cid] = true;
      conns.push({
        id: cid,
        sourceCategory: rc.sourceCategory,
        reference: clampStr(rc.reference, LIMITS.short),
        connectionType: rc.connectionType,
        note: clampStr(rc.note, LIMITS.medium),
        includeInPulpitSheet: rc.includeInPulpitSheet
      });
    }
    return { ok: true, sermon: {
      schemaVersion: SCHEMA_VERSION,
      id: raw.id,
      createdAt: clampStr(raw.createdAt, 40),
      updatedAt: clampStr(raw.updatedAt, 40),
      title: clampStr(raw.title, LIMITS.short),
      startType: raw.startType,
      passageOrTheme: clampStr(raw.passageOrTheme, LIMITS.short),
      approach: raw.approach,
      movementCount: raw.movementCount,
      purpose: clampStr(raw.purpose, LIMITS.medium),
      series: clampStr(raw.series, LIMITS.short),
      occasion: clampStr(raw.occasion, LIMITS.short),
      preachedDate: clampStr(raw.preachedDate, 10),
      supportingRefs: clampStr(raw.supportingRefs, LIMITS.medium),
      scriptureText: clampStr(raw.scriptureText, LIMITS.long),
      centralIdea: clampStr(raw.centralIdea, LIMITS.medium),
      movements: movements,
      realLifeIdeas: clampStr(raw.realLifeIdeas, LIMITS.medium),
      todayIdeas: clampStr(raw.todayIdeas, LIMITS.medium),
      suggestedFor: clampStr(raw.suggestedFor, LIMITS.short),
      versesAppliedFor: clampStr(raw.versesAppliedFor, LIMITS.short),
      versesApplied: clampStr(raw.versesApplied, LIMITS.medium),
      suggestTier: (raw.suggestTier === 'curated' || raw.suggestTier === 'engine' || raw.suggestTier === 'helper') ? raw.suggestTier : '',
      engineFor: clampStr(raw.engineFor, LIMITS.short),
      engineApplied: clampStr(raw.engineApplied, LIMITS.medium),
      helperFor: clampStr(raw.helperFor, LIMITS.short),
      helperApplied: clampStr(raw.helperApplied, LIMITS.medium),
      turn: clampStr(raw.turn, LIMITS.medium),
      landing: clampStr(raw.landing, LIMITS.medium),
      faithfulness: checks,
      status: raw.status,
      studyConnections: conns
    } };
  }

  /* ------------------------------------------------------------------
     Storage (defensive)
     ------------------------------------------------------------------ */
  var storage = { available: false, full: false };
  function detectStorage() {
    try {
      var k = STORAGE_KEY + '.probe';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      storage.available = true;
    } catch (e) { storage.available = false; }
  }
  var state = { sermons: [], currentId: null, dirty: false, view: 'start' };

  function loadAll() {
    if (!storage.available) { return; }
    var text = null;
    try { text = window.localStorage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (!text) { return; }
    var parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { setStatus('Saved data could not be read. Nothing was changed.', 'warn'); return; }
    if (!isPlainObject(parsed) || !Array.isArray(parsed.sermons)) { setStatus('Saved data has an unexpected shape. Nothing was changed.', 'warn'); return; }
    var out = [];
    parsed.sermons.forEach(function (raw, i) {
      var r = validateSermon(raw, 'Saved sermon ' + (i + 1));
      if (r.ok) { out.push(r.sermon); }
    });
    state.sermons = out;
    /* Round 7: the current-sermon pointer rides the same payload.
       Until now it lived only in memory, so ANY reload — the
       service-worker update shim, the back/forward-cache reload, a
       browser restart — booted to Home with no current sermon and
       the outline on screen a moment earlier could not be brought
       back from Structure at all (re-test 6: a user's work read as
       vanished mid-session). The sermon data was never lost; the
       pointer was. */
    if (typeof parsed.currentId === 'string') {
      for (var ci = 0; ci < out.length; ci++) { if (out[ci].id === parsed.currentId) { state.currentId = parsed.currentId; break; } }
    }
  }
  function persist() {
    if (!storage.available) {
      setStatus('Browser storage is unavailable. Your work is held in this tab only — export it before closing.', 'warn');
      return false;
    }
    var payload = JSON.stringify({ schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), currentId: state.currentId, sermons: state.sermons });
    try {
      window.localStorage.setItem(STORAGE_KEY, payload);
      storage.full = false;
      return true;
    } catch (e) {
      storage.full = true;
      setStatus('Browser storage is full. Your latest changes are held in this tab only — export a backup and delete old sermons.', 'warn');
      return false;
    }
  }

  /* ------------------------------------------------------------------
     Status line
     ------------------------------------------------------------------ */
  function setStatus(text, kind) {
    var s = $('status');
    while (s.firstChild) { s.removeChild(s.firstChild); }
    if (!text) { return; }
    s.appendChild(el('span', { 'class': kind || '' }, text));
  }

  /* ------------------------------------------------------------------
     Current sermon helpers
     ------------------------------------------------------------------ */
  function current() {
    if (!state.currentId) { return null; }
    for (var i = 0; i < state.sermons.length; i++) { if (state.sermons[i].id === state.currentId) { return state.sermons[i]; } }
    return null;
  }
  function ensureInList(s) {
    for (var i = 0; i < state.sermons.length; i++) { if (state.sermons[i].id === s.id) { return; } }
    state.sermons.push(s);
  }
  var pending = null; /* a new sermon not yet added to the list */
  function currentOrPending() { return current() || pending; }

  var autosaveTimer = null;
  function markDirty() {
    state.dirty = true;
    setStatus('Unsaved changes');
    if (autosaveTimer) { clearTimeout(autosaveTimer); }
    autosaveTimer = setTimeout(function () { save(true); }, 1500);
  }
  function save(auto) {
    if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
    var s = currentOrPending();
    if (!s) { return; }
    s.updatedAt = nowIso();
    ensureInList(s);
    state.currentId = s.id;
    pending = null;
    if (persist()) {
      state.dirty = false;
      setStatus((auto ? 'Draft autosaved' : 'Saved locally') + ' · ' + timeLabel(), 'ok');
    }
  }

  /* ------------------------------------------------------------------
     Views
     ------------------------------------------------------------------ */
  var VIEWS = ['start', 'setup', 'structure', 'check', 'study', 'dictionary', 'assistant', 'library', 'print'];
  function show(view) {
    if ((view === 'setup' || view === 'structure' || view === 'check' || view === 'print') && !currentOrPending()) {
      setStatus('Choose how to start, or open a saved sermon first.');
      view = 'start';
    }
    state.view = view;
    VIEWS.forEach(function (v) { $('view-' + v).hidden = (v !== view); });
    var navs = document.querySelectorAll('nav [data-nav]');
    for (var i = 0; i < navs.length; i++) {
      if (navs[i].getAttribute('data-nav') === view) { navs[i].setAttribute('aria-current', 'page'); } else { navs[i].removeAttribute('aria-current'); }
    }
    if (view === 'setup') { renderSetup(); }
    if (view === 'structure') { renderStructure(); }
    if (view === 'check') { renderCheck(); }
    if (view === 'library') { renderLibrary(); }
    if (view === 'print') { renderSheet(); }
    /* v2 views are rendered by the SSBUI module when present */
    if ((view === 'study' || view === 'dictionary' || view === 'assistant') && window.SSBUI && window.SSBUI.browserInit) {
      if (!window._ssbui) { window._ssbui = window.SSBUI.browserInit(); }
    }
    var h = $('h-' + view);
    if (h) { h.focus(); }
    window.scrollTo(0, 0);
  }

  /* --- Setup --- */
  /* Guided front door (2026-10-29): on the topic and verses paths the
     Setup screen shows ONE big box and ONE big "Build my outline" button.
     Defaults are already chosen in newSermon (3 main points; build around
     one theme for a topic, walk through the passage for verses); every
     other choice — approach, structure, title, details — lives in the
     "More choices" fold, closed by default. A blank start keeps the full
     form open, as before. */
  function renderSetup() {
    var s = currentOrPending();
    $('f-title').value = s.title;
    $('f-passage').value = s.passageOrTheme;
    var lbl = $('l-passage'), help = $('h-passage');
    if (s.startType === 'passage') { lbl.textContent = 'Your verses'; help.textContent = 'Required. One passage, or several of your own — separate them with ; and Ehyeh builds a main point around each one.'; }
    else if (s.startType === 'theme') { lbl.textContent = 'Your topic'; help.textContent = 'Required. Type your topic in your own words — for example: Hope in suffering.'; }
    else { lbl.textContent = 'Main passage or theme'; help.textContent = 'Optional when starting blank.'; }
    var guided = (s.startType === 'theme' || s.startType === 'passage');
    $('view-setup').classList.toggle('setup-guided', guided);
    $('setup-more').open = !guided;
    $('setup-go').textContent = guided ? 'Build my outline' : 'Continue to structure';
    setRadio('approach', s.approach);
    setRadio('movementCount', String(s.movementCount));
    $('f-purpose').value = s.purpose;
    $('f-series').value = s.series;
    $('f-occasion').value = s.occasion;
    $('f-date').value = s.preachedDate;
    $('f-refs').value = s.supportingRefs;
    $('f-scripture').value = s.scriptureText;
    $('setup-error').textContent = '';
  }
  function setRadio(name, value) {
    var rs = document.querySelectorAll('input[name="' + name + '"]');
    for (var i = 0; i < rs.length; i++) { rs[i].checked = (rs[i].value === value); }
  }
  function readSetupField(input) {
    var s = currentOrPending();
    if (!s) { return; }
    var f = input.getAttribute('data-field');
    if (f === 'approach') { if (input.checked) { s.approach = input.value; } return; }
    if (f === 'movementCount') { if (input.checked) { s.movementCount = parseInt(input.value, 10); } return; }
    if (f === 'preachedDate') { s.preachedDate = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? input.value : ''; return; }
    var max = (f === 'scriptureText') ? LIMITS.long : (f === 'title' || f === 'passageOrTheme' || f === 'series' || f === 'occasion') ? LIMITS.short : LIMITS.medium;
    s[f] = clampStr(input.value, max);
    if (f === 'passageOrTheme' && input.value.trim() !== '') { $('setup-error').textContent = ''; }
  }
  function setupValid() {
    var s = currentOrPending();
    if (s.startType !== 'blank' && s.passageOrTheme.trim() === '') {
      $('setup-error').textContent = s.startType === 'passage' ? 'Enter the main passage to continue.' : 'Enter the theme or topic to continue.';
      $('f-passage').focus();
      return false;
    }
    $('setup-error').textContent = '';
    return true;
  }

  /* --- Topic suggestions (FIX B) ------------------------------------
     When a sermon starts from a theme/topic that matches one of the
     13 built-in topic passage sets, the Structure screen arrives
     pre-filled with SUGGESTIONS: point titles, Scripture references
     copied from the topic's own passage set, and one-line real-life
     idea prompts (data: js/s18-topic-suggest.js →
     window.EHYEH_TOPIC_SUGGEST). Suggestions are titles, references,
     and prompts only — never prose. They fill EMPTY boxes only, are
     applied once per topic text (s.suggestedFor), and stay fully
     editable/deletable. No match = nothing is invented; the honest
     fallback note is shown instead. If the data file has not loaded,
     the builder behaves exactly as before, and s03 tries once to load
     it (same-folder file, offline) and re-renders on arrival. */
  var suggestLoadTried = false;
  function suggestApi() {
    return (typeof window !== 'undefined' && window.EHYEH_TOPIC_SUGGEST) || null;
  }
  function ensureSuggestData() {
    if (suggestApi() || suggestLoadTried) { return; }
    suggestLoadTried = true;
    try {
      var sc = document.createElement('script');
      sc.src = 'js/s18-topic-suggest.js';
      sc.async = true;
      sc.onload = function () { if (state.view === 'structure') { renderStructure(); } };
      document.body.appendChild(sc);
    } catch (e) { /* no suggestions this session — builder unchanged */ }
  }
  function matchFor(s) {
    var api = suggestApi();
    if (!api || !s || s.startType !== 'theme') { return null; }
    return api.matchTopic(s.passageOrTheme || '');
  }
  /* Fill empty boxes from the matched topic. Returns true if applied. */
  function applySuggestions(s, topic) {
    if (!s || !topic) { return false; }
    buildEpoch++;
    resetContextPhaseState(s.passageOrTheme);
    var changed = false;
    for (var i = 0; i < topic.points.length && i < s.movements.length; i++) {
      var mv = s.movements[i], pt = topic.points[i];
      if (!mv.title.trim()) { mv.title = pt.title; changed = true; }
      if (!mv.primaryRef.trim()) { mv.primaryRef = pt.primaryRef; changed = true; }
      if (!mv.supportingRefs.trim()) { mv.supportingRefs = pt.supportingRefs; changed = true; }
    }
    if (!s.realLifeIdeas.trim()) { s.realLifeIdeas = topic.ideas.join('\n'); changed = true; }
    if (!s.todayIdeas.trim() && topic.today && topic.today.length) { s.todayIdeas = topic.today.join('\n'); changed = true; }
    s.suggestedFor = s.passageOrTheme;
    s.suggestTier = 'curated';
    return changed;
  }
  /* ALL-TOPICS ENGINE (Donnie, 2026-10-29 — "They need all topics in
     the Bible. With scriptures."): the curated sets are the polish
     tier, not the ceiling. When no prepared set confidently matches a
     typed topic, the engine (s19) gathers real scriptures for it from
     the app's own data — Easton entry references, concordance hits
     and Strong's-number families over the per-verse mapping,
     cross-reference expansion — and groups them into up to 3 main
     points. Point titles are the passages' own words or "What <ref>
     shows" — never generated prose. Engine fills EMPTY boxes only,
     never touches the ideas fields (explain-ideas and relates-to-
     today stay curated-tier only), and applies once per topic text
     (s.engineFor). The outline labels the tier honestly through
     s.suggestTier: 'curated' when a prepared set served the topic,
     'engine' when the engine gathered the scriptures. If Easton is
     not resident yet, the gather waits for it and applies on arrival;
     if even the engine finds nothing, the honest fallback note is
     what shows. Fully offline; no network call in this path. */
  var engineLoadTried = false;
  var engineGatherPending = false;
  function engineApi() {
    return (typeof window !== 'undefined' && window.EHYEH_TOPIC_ENGINE) || null;
  }
  function ensureEngineData() {
    if (engineApi() || engineLoadTried) { return; }
    engineLoadTried = true;
    try {
      var sc = document.createElement('script');
      sc.src = 'js/s19-topic-engine.js';
      sc.async = true;
      document.body.appendChild(sc);
    } catch (e) { /* no engine this session — curated + fallback unchanged */ }
  }
  /* Fill empty boxes from an engine gather. Returns true if applied. */
  function applyEngine(s, result) {
    if (!s || !result || result.tier !== 'engine' || !result.points.length) { return false; }
    buildEpoch++;
    resetContextPhaseState(s.passageOrTheme);
    var changed = false;
    for (var i = 0; i < result.points.length && i < s.movements.length; i++) {
      var mv = s.movements[i], pt = result.points[i];
      if (!mv.title.trim()) { mv.title = pt.title; changed = true; }
      if (!mv.primaryRef.trim()) { mv.primaryRef = pt.primaryRef; changed = true; }
      if (!mv.supportingRefs.trim()) { mv.supportingRefs = pt.supportingRefs; changed = true; }
    }
    s.suggestTier = 'engine';
    s.engineFor = s.passageOrTheme;
    s.engineApplied = JSON.stringify(result.points);
    return changed;
  }
  /* HELPER TIER (Donnie, 2026-10-29 — the Helper joins the builder):
     when neither a prepared set nor the engine can serve a topic, the
     preacher may ask the Helper (one bounded, device-cached call, made
     by js/s20-builder-helper.js). The Helper proposes passage
     references; s20 verifies every one against Ehyeh's own Bible text
     before anything reaches this function — unverified references are
     dropped there, never shown. What lands here is points in the same
     shape as the other tiers: titles drawn from the passages' own
     words (never helper prose), references, nothing else. Fills EMPTY
     boxes only; the ideas fields stay untouched (helper connection
     ideas arrive through the per-point "Bring it into today" door and
     land in todayIdeas only when he keeps them). Applied once per
     topic text (s.helperFor) and labeled honestly as the helper tier. */
  var HELPER_BANNER = 'Suggested starting points from the helper — change any of them. The words are yours.';
  function applyHelper(s, points) {
    if (!s || !points || !points.length) { return false; }
    buildEpoch++;
    resetContextPhaseState(s.passageOrTheme);
    var changed = false;
    for (var i = 0; i < points.length && i < s.movements.length; i++) {
      var mv = s.movements[i], pt = points[i];
      if (!mv.title.trim()) { mv.title = pt.title; changed = true; }
      if (!mv.primaryRef.trim()) { mv.primaryRef = pt.primaryRef; changed = true; }
      if (!mv.supportingRefs.trim()) { mv.supportingRefs = pt.supportingRefs; changed = true; }
    }
    s.suggestTier = 'helper';
    s.helperFor = s.passageOrTheme;
    s.helperApplied = JSON.stringify(points);
    return changed;
  }
  function runEngineGather(s) {
    var api = engineApi();
    if (!api) { return null; }
    var result = null;
    try { result = api.gather(s.passageOrTheme || ''); } catch (e) { result = null; }
    return result;
  }
  /* Try the engine for a theme sermon. Returns 'applied' | 'none' | 'pending'. */
  function tryEngine(s) {
    if (!s || s.startType !== 'theme') { return 'none'; }
    if (!engineApi()) { ensureEngineData(); return 'none'; }
    var db = (typeof window !== 'undefined' && window.SSB && window.SSB.db) ? window.SSB.db() : null;
    var eastonReady = !!(db && db.easton && Object.keys(db.easton).length);
    if (!eastonReady && typeof window.ensureEaston === 'function') {
      engineGatherPending = true;
      var gatherEpoch = buildEpoch;
      var p = null;
      try { p = window.ensureEaston(); } catch (e) { p = null; }
      if (p && typeof p.then === 'function') {
        p.then(function () {
          engineGatherPending = false;
          if (gatherEpoch !== buildEpoch) { if (state.view === 'structure') { renderStructure(); } return; }
          if (s.engineFor !== s.passageOrTheme) {
            var r = runEngineGather(s);
            if (r && r.tier === 'engine') { applyEngine(s, r); save(false); }
          }
          if (state.view === 'structure') { renderStructure(); }
        }, function () {
          engineGatherPending = false;
          if (state.view === 'structure') { renderStructure(); }
        });
        return 'pending';
      }
      engineGatherPending = false;
      return 'none';
    }
    var result = runEngineGather(s);
    if (result && result.tier === 'engine') { applyEngine(s, result); return 'applied'; }
    return 'none';
  }
  /* Verses-first door (Donnie, 2026-10-29; full builder 2026-10-30):
     a sermon that starts from HIS passages gets the whole builder,
     not just the references. A lone passage spanning several verses
     is walked through in chunks \u2014 one main point per chunk, in the
     passage's own order; every entered reference otherwise becomes
     a point of its own, and verses past the point count land in the
     sermon's Supporting references, as before. Each point carries
     his reference exactly as he wrote it, a title drawn from the
     chunk's own words (the helper tier's rule \u2014 never invented
     prose; a prepared set's title only where the app's own curated
     sets anchor that exact verse), and \u2014 once Ehyeh's dictionary
     is resident \u2014 cross-reference bullets gathered by the
     all-topics engine for the chunk's own terms (Phase B, below).
     Ideas come from an anchored prepared set when there is one;
     otherwise two fixed spark templates filled with the passage's
     own quoted words start the boxes \u2014 never empty (Donnie's
     tap-test, 2026-10-30). Applied once per passage text, tracked
     in s.versesAppliedFor with the applied points recorded in
     s.versesApplied; fills EMPTY boxes only. */
  var versesAttemptFor = '';
  function validRefsFor(text) {
    var api = suggestApi();
    if (!api || !api.parseRefList) { return []; }
    var out = [], seen = {};
    api.parseRefList(text).forEach(function (r) {
      /* Validate against the app's own reference parser. A candidate
         that absorbed prose words ("I love John 3:16") is retried with
         leading words dropped until the parser accepts it or nothing
         is left — a real verse is never lost to its own sentence. */
      var cand = r;
      for (var tries = 0; tries < 3; tries++) {
        if (typeof window.SSB === 'undefined' || !window.SSB.parseReference) { pushRef(cand); return; }
        if (window.SSB.parseReference(cand)) { pushRef(cand); return; }
        var sp = cand.indexOf(' ');
        if (sp === -1) { return; }
        cand = cand.slice(sp + 1);
      }
    });
    function pushRef(c) {
      var key = c.toLowerCase();
      if (!seen[key]) { seen[key] = true; out.push(c); }
    }
    return out;
  }
  /* Point specs for the verses door: one spec per main point.
     { ref, firstRef, text, firstText } \u2014 ref is the point's Primary
     Scripture exactly as it should stand; text is the chunk's whole
     verse text (the terms and title source); firstText its first
     verse's text. */
  function versesSpecs(s) {
    var refs = validRefsFor(s.passageOrTheme);
    if (!refs.length) { return []; }
    if (refs.length === 1) {
      var det = versesDetailed(refs[0]);
      if (det && det.verses.length > 1) {
        var names = (typeof window !== 'undefined' && window.SSB_DATA && window.SSB_DATA.books) || [];
        var bookName = names[det.book - 1] || String(det.label || '').replace(/\s+\d+:\d+.*$/, '');
        var n = Math.min(s.movementCount || 1, det.verses.length);
        var total = det.verses.length, base = Math.floor(total / n), rem = total % n, idx = 0;
        var specs = [];
        for (var c = 0; c < n; c++) {
          var size = base + (c < rem ? 1 : 0);
          var part = det.verses.slice(idx, idx + size);
          idx += size;
          if (!part.length) { break; }
          var a = part[0].n, b = part[part.length - 1].n;
          specs.push({
            ref: bookName + ' ' + det.chapter + ':' + a + (b > a ? '-' + b : ''),
            firstRef: bookName + ' ' + det.chapter + ':' + a,
            text: part.map(function (v) { return v.text; }).join(' '),
            firstText: part[0].text
          });
        }
        return specs;
      }
    }
    return refs.map(function (r) {
      var d = versesDetailed(r);
      return {
        ref: r,
        firstRef: r,
        text: d ? d.verses.map(function (v) { return v.text; }).join(' ') : '',
        firstText: d && d.verses.length ? d.verses[0].text : ''
      };
    });
  }
  /* Titles from the passage's own words. Through 2026-11-02 the
     rule took a <=9-word window of the chunk's first verse around
     a content term, which in practice started at word one and cut
     headings mid-phrase ("For the Lord had said unto Abram, Get
     thee") — the defect behind the G4 re-test failures. B2-008
     FIX-1 (below) takes the first COMPLETE clause instead. Never
     invented wording, under either rule. */
  var CHUNK_STOP = {};
  ('a an the and or of to in on for with is are was were be been it its this that these those what does do did how why when where who whom about into from by at as').split(' ').forEach(function (w) { CHUNK_STOP[w] = 1; });
  function stemLite2(w) {
    var s = String(w || '').toLowerCase();
    for (var i = 0; i < 3; i++) {
      var before = s;
      if (/ies$/.test(s) && s.length > 4) { s = s.slice(0, -3) + 'y'; }
      else if (/ing$/.test(s) && s.length > 5) { s = s.slice(0, -3); }
      else if (/s$/.test(s) && !/ss$/.test(s) && s.length > 3) { s = s.slice(0, -1); }
      if (s === before) { break; }
    }
    return s;
  }
  function chunkTerms(text) {
    var seen = {}, out = [];
    String(text || '').toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).forEach(function (w) {
      w = w.replace(/^'+|'+$/g, '');
      if (w.length < 3 || CHUNK_STOP[w] || seen[w]) { return; }
      seen[w] = 1; out.push(w);
    });
    return out;
  }
  /* B2-008 FIX-1: a point title is the chunk's first COMPLETE clause,
     in the verse's own words, never cut mid-phrase. Leading joining
     words (For / And / So / Then / Now / But) are dropped so the title
     reads as a heading; nothing is added. Falls back to the honest
     reference-led title when no clause of 2-14 words exists. */
  var TITLE_LEAD = {};
  ('for and so then now but therefore wherefore also').split(' ').forEach(function (w) { TITLE_LEAD[w] = 1; });

  /* Title verb screen (round 5): a clause that names no action is a
     place or a thing, not a heading — "From Jerusalem" titled a Mark
     point in the 2026-11-03 sweep. A title clause must carry a verb:
     a known verb form (modern or archaic), an -ed past form, or an
     -eth third person. No verb in any early clause -> the honest
     reference-led fallback title. */
  var TITLE_VERBS = {};
  ('had hath has have said saith say went came come was were is are art been being did does done made make took take gave give given saw see seen heard hear called call began begin stood stand sat sit looked look answered answer spake spoke speak told tell asked ask entered entred healed heal taught teach followed follow believed believe received receive became become brought bring sent send put set laid lay rose rise risen fell fall cried cry prayed pray blessed bless promised promise departed depart appeared appear dwelt dwell lived live died die loved love loveth knew know goeth gone wrought built build opened shut bowed sang rejoiced wept feared fear trusted trust waited wait returned return passed pass crossed lifted stretched drew bore bare kept keep held hold found find sought seek fought reigned judged saved delivered created formed planted grew grow shone turned hid ran run fled flee slept sleep awoke woke brake loosed bound chose chosen wrote written read slew smote arose abode tarried remain remained continued liveth dieth').split(' ').forEach(function (w) { TITLE_VERBS[w] = 1; });
  var TITLE_NOT_VERB_ED = { indeed: 1, sacred: 1, wicked: 1, naked: 1, hundred: 1, kindred: 1, learned: 1 };
  function clauseHasVerb(words) {
    for (var i = 0; i < words.length; i++) {
      var w = words[i].toLowerCase().replace(/[^a-z]/g, '');
      if (!w) { continue; }
      if (TITLE_VERBS[w]) { return true; }
      if (w.length >= 5 && /ed$/.test(w) && !TITLE_NOT_VERB_ED[w]) { return true; }
      if (w.length >= 6 && /eth$/.test(w)) { return true; }
    }
    return false;
  }
  function chunkTitle(spec) {
    var fallback = 'What ' + spec.ref + ' shows';
    var text = String(spec.firstText || '').trim();
    if (!text) { return fallback; }
    var clauses = text.match(/[^,;:.?!]+[,;:.?!]?/g) || [];
    for (var c = 0; c < clauses.length && c < 3; c++) {
      var words = clauses[c].trim().replace(/[,;:]+$/, '').split(/\s+/).filter(Boolean);
      while (words.length > 1 && TITLE_LEAD[words[0].toLowerCase().replace(/[^a-z]/g, '')]) { words.shift(); }
      if (words.length >= 2 && words.length <= 14 && clauseHasVerb(words)) {
        var t = words.join(' ').replace(/[^A-Za-z.?!']+$/, '');
        return t.charAt(0).toUpperCase() + t.slice(1);
      }
      if (words.length > 14) { break; }
    }
    return fallback;
  }
  function firstSentence(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    var m = t.match(/^(.{20,220}?[.;])\s/);
    if (m) { return m[1]; }
    return t.length > 200 ? t.slice(0, 200).replace(/\s+\S*$/, '') + '\u2026' : t;
  }
  function firstWords(text, n) {
    var w = String(text || '').trim().split(/\s+/).filter(function (x) { return x !== ''; });
    if (!w.length) { return ''; }
    var take = w.slice(0, n).join(' ').replace(/[\s;:,]+$/, '');
    return w.length > n ? take + '\u2026' : take;
  }
  /* Idea sparks for a passage no prepared set anchors: fixed
     house templates, filled ONLY with the passage's own
     quoted words \u2014 the same honesty class as the fallback notes.
     The boxes stay his to edit; the banner says so. */
  function passageSparks(specs) {
    if (!specs.length) { return null; }
    var first = specs[0], last = specs[specs.length - 1];
    var mid = specs.length > 1 ? specs[Math.floor(specs.length / 2)] : first;
    return {
      realLife: [
        '\u201C' + firstWords(first.firstText, 10) + '\u201D (' + first.firstRef + ') \u2014 a picture or a memory from real life that shows this.',
        '\u201C' + firstWords(mid.firstText, 10) + '\u201D (' + mid.firstRef + ') \u2014 what does this look like at a kitchen table, at work, on the road?'
      ].join('\n'),
      today: [
        '\u201C' + firstWords(last.firstText, 10) + '\u201D (' + last.firstRef + ') \u2014 where do your hearers meet this in this week\u2019s world?'
      ].join('\n')
    };
  }
  function applyVerses(s) {
    var api = suggestApi();
    if (!s || !api || s.startType !== 'passage') { return false; }
    buildEpoch++;
    resetContextPhaseState(s.passageOrTheme);
    versesAttemptFor = s.passageOrTheme;
    var refs = validRefsFor(s.passageOrTheme);
    if (!refs.length) { return false; }
    var specs = versesSpecs(s);
    var changed = false;
    var usedTopic = null;
    var wholeHit = null;
    if (refs.length === 1 && api.suggestForRef) { wholeHit = api.suggestForRef(refs[0]); }
    if (wholeHit) { usedTopic = api.topicById(wholeHit.topicId); }
    var appliedPts = [];
    for (var i = 0; i < specs.length; i++) {
      var spec = specs[i];
      var hit = api.suggestForRef ? api.suggestForRef(spec.ref) : null;
      if (hit && !usedTopic) { usedTopic = api.topicById(hit.topicId); }
      if (i < s.movementCount) {
        var mv = s.movements[i];
        if (!mv.primaryRef.trim()) { mv.primaryRef = spec.ref; changed = true; }
        if (!mv.title.trim()) {
          mv.title = (hit && hit.title) || (i === 0 && wholeHit ? wholeHit.title : '') || chunkTitle(spec);
          changed = true;
        }
        appliedPts.push({ title: mv.title, primaryRef: spec.ref, supportingRefs: '', context: '' });
      } else {
        var cur = s.supportingRefs || '';
        if (cur.indexOf(spec.ref) === -1) {
          s.supportingRefs = cur.trim() ? cur.replace(/\s+$/, '') + '\n' + spec.ref : spec.ref;
          changed = true;
        }
      }
    }
    var sparks = null;
    if (usedTopic) {
      if (!s.realLifeIdeas.trim()) { s.realLifeIdeas = usedTopic.ideas.join('\n'); changed = true; }
      if (!s.todayIdeas.trim() && usedTopic.today && usedTopic.today.length) { s.todayIdeas = usedTopic.today.join('\n'); changed = true; }
    } else {
      sparks = passageSparks(specs);
      if (sparks) {
        if (!s.realLifeIdeas.trim()) { s.realLifeIdeas = sparks.realLife; changed = true; }
        if (!s.todayIdeas.trim()) { s.todayIdeas = sparks.today; changed = true; }
      }
    }
    s.versesApplied = JSON.stringify({ points: appliedPts, realLife: sparks ? sparks.realLife : '', today: sparks ? sparks.today : '' });
    s.versesAppliedFor = s.passageOrTheme;
    return changed;
  }
  function maybeApplyVerses(s) {
    if (!s || s.startType !== 'passage') { return; }
    if (!s.passageOrTheme || !s.passageOrTheme.trim()) { return; }
    if (s.versesAppliedFor === s.passageOrTheme) {
      /* Sermons the pre-2026-10-30 verses door applied carry no
         applied-points record; rebuild them once under the full
         builder (fills empty boxes only, his words stay). */
      if (!s.versesApplied && versesAttemptFor !== s.passageOrTheme) { clearVerses(s); applyVerses(s); }
      return;
    }
    if (versesAttemptFor === s.passageOrTheme) { return; }
    if (!suggestApi()) { return; }
    applyVerses(s);
  }
  /* Phase B for the verses door (2026-10-30): cross-reference
     bullets + dictionary chips. Both need Ehyeh's dictionary
     (Easton) resident; until it is, the fill waits and lands on
     arrival \u2014 the topic engine's pending shape. Bullets are the
     all-topics engine's top-ranked passages for the chunk's own
     terms, his own passage excluded, every one mechanically
     resolved by the engine itself. Chips are Easton's own entries
     for the chunk's words, offered through the same explainer door
     as a topic's prepared explainers, labeled dictionary. Fills
     EMPTY boxes only; bullets set here are recorded in
     s.versesApplied so Clear removes exactly them. */
  var versesBulletsFor = '';
  var versesContextFor = '';
  /* Build epoch (round 7): every fresh apply and every rebuild clear
     bumps this counter. The lane passes below are async — a pass
     kicked for one build can settle after the preacher has already
     rebuilt the sermon under a new passage, and its writes land on
     the SHARED movement objects and the SHARED applied record. A
     settling pass whose epoch (or passage text) no longer matches
     writes nothing at all: no context lines, no record merges, no
     latch or cool-off marks, no save, no render. */
  var buildEpoch = 0;
  /* Context-phase bookkeeping (round 3, 2026-11-02): the passage is
     marked done (versesContextFor) only when every point's ask
     actually reached the lane and was answered or honestly refused.
     While asks are in flight versesContextFlightFor guards against
     duplicate fires from re-renders; when an ask was rate-limited
     or cut off in transit the passage instead gets a cool-off
     (versesContextRetryFor/After) and a later pass retries — the
     round-2 shape marked the passage done BEFORE the calls, so one
     starved attempt silently settled every point without its line
     for the whole session. */
  var versesContextFlightFor = '';
  var versesContextRetryFor = '';
  var versesContextRetryAfter = 0;
  /* In-settle retries (round 5): see scheduleEngineContextRetry —
     the same discipline for the verses walk. */
  var versesContextStreak = {};
  var versesContextTimer = null;
  function scheduleVersesContextRetry(s) {
    var key = s.passageOrTheme;
    var n = versesContextStreak[key] || 0;
    if (n >= CONTEXT_RETRY_DELAYS_MS.length) { return false; }
    versesContextStreak[key] = n + 1;
    if (versesContextTimer) { clearTimeout(versesContextTimer); }
    var sermonId = s.id;
    var timerEpoch = buildEpoch;
    versesContextTimer = setTimeout(function () {
      versesContextTimer = null;
      if (timerEpoch !== buildEpoch) { return; }
      var cur = null;
      for (var i = 0; i < state.sermons.length; i++) { if (state.sermons[i].id === sermonId) { cur = state.sermons[i]; break; } }
      if (!cur || cur.passageOrTheme !== key) { return; }
      kickVersesContext(cur);
    }, CONTEXT_RETRY_DELAYS_MS[n]);
    return true;
  }
  /* Points the lane answered terminally without a line (refusal,
     withheld, no-passages), by passage: they count as done for
     settling, and later passes never re-ask them. */
  var versesContextDonePoints = {};
  var VERSES_CONTEXT_COOL_OFF_MS = 10 * 60 * 1000;
  var versesFillPending = false;
  var passageChipsCache = { forText: '', byPoint: {} };
  function eastonResident() {
    var db = (typeof window !== 'undefined' && window.SSB && window.SSB.db) ? window.SSB.db() : null;
    return !!(db && db.easton && Object.keys(db.easton).length);
  }
  function kickVersesContext(s) {
    if (versesContextFor === s.passageOrTheme) { return; }
    if (versesContextFlightFor === s.passageOrTheme) { return; }
    if (versesContextRetryFor === s.passageOrTheme && Date.now() < versesContextRetryAfter) { return; }
    var bh = (typeof window !== 'undefined' && window.EHYEH_BUILDER_HELPER) || null;
    if (!bh || typeof bh.askContext !== 'function') { return; }
    versesContextFlightFor = s.passageOrTheme;
    fillVersesContext(s);
  }
  /* Automatic context for ENGINE-built points (round 4): the
     all-topics engine's points used to render bare — no background,
     no context line — because every automatic phase was keyed to
     the verses door. The same phases now cover a sermon the engine
     built (suggestTier 'engine', applied for this exact topic
     text): the context kick fires FIRST (it needs nothing from
     Easton), then the background chips compute on Easton's
     arrival, exactly as the verses walk behaves. Asks run one at
     a time into the same context bucket; a transient outcome
     cools off and retries on a later pass; a terminal answer
     settles its point; a landed line is mirrored into
     s.engineApplied so Clear removes exactly it. */
  var engineContextFor = '';
  var engineContextFlightFor = '';
  var engineContextRetryFor = '';
  var engineContextRetryAfter = 0;
  /* In-settle retries (round 5, both context phases): a transient
     pass used to cool off for ten minutes and retry only when some
     later tap re-rendered the screen — in the 2026-11-03 sweep two
     Mark points lost their lines to one slow lane minute and a
     still screen, and nothing ever asked again. Now a transient
     pass schedules its own retries (10s, 25s, 50s) while the sermon
     is open; only a pass that still fails after those falls back
     to the standing ten-minute cool-off. */
  var CONTEXT_RETRY_DELAYS_MS = [10000, 25000, 50000];
  var engineContextStreak = {};
  var engineContextTimer = null;
  function scheduleEngineContextRetry(s) {
    var key = s.passageOrTheme;
    var n = engineContextStreak[key] || 0;
    if (n >= CONTEXT_RETRY_DELAYS_MS.length) { return false; }
    engineContextStreak[key] = n + 1;
    if (engineContextTimer) { clearTimeout(engineContextTimer); }
    var sermonId = s.id;
    var timerEpoch = buildEpoch;
    engineContextTimer = setTimeout(function () {
      engineContextTimer = null;
      if (timerEpoch !== buildEpoch) { return; }
      var cur = null;
      for (var i = 0; i < state.sermons.length; i++) { if (state.sermons[i].id === sermonId) { cur = state.sermons[i]; break; } }
      if (!cur || cur.passageOrTheme !== key) { return; }
      kickEngineContext(cur);
    }, CONTEXT_RETRY_DELAYS_MS[n]);
    return true;
  }
  var engineContextDonePoints = {};
  var engineFillPending = false;
  function engineTierApplied(s) {
    return !!(s && s.startType === 'theme' && s.suggestTier === 'engine' && s.engineFor && s.engineFor === s.passageOrTheme && s.engineApplied);
  }
  /* Topic tiers (round 5): round 4's automatic context phase covered
     only the engine tier, so a prepared-set (curated) topic — Faith
     in the 2026-11-03 sweep — and a helper-tier topic rendered with
     no context line and no background at all, short of the T1 bar
     the passage road meets. The phase now covers every tier that
     applied points for this exact topic text. */
  function topicTierApplied(s) {
    if (!s || s.startType !== 'theme') { return false; }
    if (engineTierApplied(s)) { return true; }
    if (s.suggestTier === 'curated' && s.suggestedFor && s.suggestedFor === s.passageOrTheme) { return true; }
    if (s.suggestTier === 'helper' && s.helperFor && s.helperFor === s.passageOrTheme) { return true; }
    return false;
  }
  function engineContextComplete(s) {
    var doneMap = engineContextDonePoints[s.passageOrTheme] || {};
    for (var j = 0; j < s.movementCount && j < s.movements.length; j++) {
      var m2 = s.movements[j];
      if (m2 && m2.primaryRef && !m2.context && !doneMap[j]) { return false; }
    }
    return true;
  }
  function fillEngineContext(s) {
    var bh = (typeof window !== 'undefined' && window.EHYEH_BUILDER_HELPER) || null;
    if (!bh || typeof bh.askContext !== 'function') { engineContextFlightFor = ''; return; }
    var passEpoch = buildEpoch;
    var passText = s.passageOrTheme;
    var doneMap = engineContextDonePoints[s.passageOrTheme] || {};
    var jobs = [];
    for (var i = 0; i < s.movementCount && i < s.movements.length; i++) {
      (function (idx) {
        var mv = s.movements[idx];
        if (!mv || mv.context || !mv.primaryRef || doneMap[idx]) { return; }
        jobs.push(function () {
          return bh.askContext(mv.primaryRef).then(function (out) {
            if (out && out.ok && out.answer) { return { idx: idx, answer: out.answer }; }
            if (out && (out.limited || out.transport || out.reason === 'away')) { return { idx: idx, transient: true }; }
            return { idx: idx, terminal: true };
          }, function () { return { idx: idx, transient: true }; });
        });
      })(i);
    }
    if (!jobs.length) {
      engineContextFlightFor = '';
      if (engineContextComplete(s)) { engineContextFor = s.passageOrTheme; }
      return;
    }
    jobs.reduce(function (p, job) {
      return p.then(function (acc) { return job().then(function (r) { acc.push(r); return acc; }); });
    }, Promise.resolve([])).then(function (results) {
      /* Round 7: stale-pass guard, same rule as the verses walk —
         a rebuild during the flight retires this pass entirely. */
      if (passEpoch !== buildEpoch || s.passageOrTheme !== passText) {
        if (engineContextFlightFor === passText) { engineContextFlightFor = ''; }
        return;
      }
      engineContextFlightFor = '';
      var changed = false;
      var transient = false;
      results.forEach(function (r) {
        if (!r) { return; }
        if (r.transient) { transient = true; return; }
        if (r.terminal) {
          if (!engineContextDonePoints[s.passageOrTheme]) { engineContextDonePoints[s.passageOrTheme] = {}; }
          engineContextDonePoints[s.passageOrTheme][r.idx] = true;
          return;
        }
        var mv = s.movements[r.idx];
        if (!mv || mv.context) { return; }
        mv.context = r.answer;
        changed = true;
        /* Mirror into the engineApplied record AS IT STANDS NOW
           (re-read at write time): a copy parsed when the pass
           started goes stale while the asks are in flight, and
           writing it back would replace what a later pass
           recorded — the round-4 refs-stability rule. */
        try {
          var cur = s.engineApplied ? JSON.parse(s.engineApplied) : null;
          if (Array.isArray(cur) && cur[r.idx]) { cur[r.idx].context = r.answer; s.engineApplied = JSON.stringify(cur); }
        } catch (e) { /* the line lives on the movement regardless */ }
        /* Mirror into the tier-wide record too (round 5): curated
           and helper tiers keep no applied-points record of their
           own, and Clear removes exactly what a record names — an
           unrecorded context line would survive it. */
        try {
          var trec = s.topicApplied ? JSON.parse(s.topicApplied) : [];
          if (!Array.isArray(trec)) { trec = []; }
          while (trec.length <= r.idx) { trec.push({}); }
          trec[r.idx].context = r.answer;
          s.topicApplied = JSON.stringify(trec);
        } catch (e) { /* the line lives on the movement regardless */ }
      });
      if (transient) {
        if (!scheduleEngineContextRetry(s)) {
          engineContextRetryFor = s.passageOrTheme;
          engineContextRetryAfter = Date.now() + VERSES_CONTEXT_COOL_OFF_MS;
        }
      } else {
        engineContextStreak[s.passageOrTheme] = 0;
        if (engineContextComplete(s)) {
          engineContextFor = s.passageOrTheme;
        }
      }
      if (changed) {
        save(false);
        var cur2 = currentOrPending();
        if (cur2 && cur2.id === s.id && state.view === 'structure') { renderStructure(); }
      }
    });
  }
  function kickEngineContext(s) {
    if (engineContextFor === s.passageOrTheme) { return; }
    if (engineContextFlightFor === s.passageOrTheme) { return; }
    if (engineContextRetryFor === s.passageOrTheme && Date.now() < engineContextRetryAfter) { return; }
    var bh = (typeof window !== 'undefined' && window.EHYEH_BUILDER_HELPER) || null;
    if (!bh || typeof bh.askContext !== 'function') { return; }
    engineContextFlightFor = s.passageOrTheme;
    fillEngineContext(s);
  }
  function kickEngineFill(s) {
    if (!topicTierApplied(s)) { return; }
    kickEngineContext(s);
    if (!eastonResident()) {
      if (engineFillPending || typeof window === 'undefined' || typeof window.ensureEaston !== 'function') { return; }
      engineFillPending = true;
      var p = null;
      try { p = window.ensureEaston(); } catch (e) { p = null; }
      if (p && typeof p.then === 'function') {
        p.then(function () {
          engineFillPending = false;
          var cur = currentOrPending();
          if (cur && cur.id === s.id && state.view === 'structure') { renderStructure(); }
        }, function () { engineFillPending = false; });
      } else { engineFillPending = false; }
      return;
    }
    if (passageChipsCache.forText !== s.passageOrTheme) { computePassageChips(s); }
  }
  function kickVersesFill(s) {
    if (!s || s.startType !== 'passage') { return; }
    if (!s.versesAppliedFor || s.versesAppliedFor !== s.passageOrTheme) { return; }
    /* The context phase fires FIRST (round 3): it needs nothing
       from Easton's dictionary, and sitting behind that 2.4 MB
       download meant one unrelated load hiccup silently starved
       every point of its line. Bullets and chips below still wait
       for Easton — they are the pieces that read it. */
    kickVersesContext(s);
    if (!eastonResident()) {
      if (versesFillPending || typeof window === 'undefined' || typeof window.ensureEaston !== 'function') { return; }
      versesFillPending = true;
      var p = null;
      try { p = window.ensureEaston(); } catch (e) { p = null; }
      if (p && typeof p.then === 'function') {
        p.then(function () {
          versesFillPending = false;
          var cur = currentOrPending();
          if (cur && cur.startType === 'passage' && cur.passageOrTheme === s.passageOrTheme && state.view === 'structure') { renderStructure(); }
        }, function () { versesFillPending = false; });
      } else { versesFillPending = false; }
      return;
    }
    if (passageChipsCache.forText !== s.passageOrTheme) { computePassageChips(s); }
    if (versesBulletsFor !== s.passageOrTheme) {
      if (engineApi()) {
        versesBulletsFor = s.passageOrTheme;
        if (fillVersesBullets(s)) { save(false); }
      } else { ensureEngineData(); }
    }
  }
  /* Context lines for the verses walk (2026-11-02): one bounded
     helper call per applied point, handed the chunk's own verses;
     the lane's answer returns citation-checked or not at all. The
     line lands on the point (mv.context), is mirrored in the applied
     record so Clear removes exactly it, and never appears when the
     lane is away — the point keeps its plain shape rather than wear
     invented prose. A success is cached on the device by the helper
     door itself (s20).
     Round 3 (same night): the passage settles only on the lane's
     own terminal answers. A rate-limited, cut-off, or lane-failed
     ('away') ask is 'transient': the passage stays unmarked under
     a cool-off and a later pass retries the points still missing
     their lines (points already holding a line, and the device
     cache, are never re-asked). */
  function versesContextComplete(s) {
    var doneMap = versesContextDonePoints[s.passageOrTheme] || {};
    /* The passage's own spec list is the count of points this road
       owes a line — NOT the points whose references happen to be
       filled already. On the multiple-reference road a point's
       title and reference land in a later apply pass than its
       sibling's ask; counting only filled references settled
       'Psalm 23; John 10:11' while the Psalm point still had no
       reference at all, and its ask never fired (round-3
       verification, 2026-11-03). Blank template slots beyond the
       spec count are the preacher's own and are never owed. */
    var specs = [];
    try { specs = versesSpecs(s) || []; } catch (e) { specs = []; }
    if (specs.length) {
      for (var i = 0; i < specs.length; i++) {
        var mv = s.movements[i];
        if (!mv || (!mv.context && !doneMap[i])) { return false; }
      }
      return true;
    }
    for (var j = 0; j < s.movementCount && j < s.movements.length; j++) {
      var m2 = s.movements[j];
      if (m2 && m2.primaryRef && !m2.context && !doneMap[j]) { return false; }
    }
    return true;
  }
  function fillVersesContext(s) {
    var bh = (typeof window !== 'undefined' && window.EHYEH_BUILDER_HELPER) || null;
    if (!bh || typeof bh.askContext !== 'function') { versesContextFlightFor = ''; return; }
    var passEpoch = buildEpoch;
    var passText = s.passageOrTheme;
    var rec = null;
    try { rec = s.versesApplied ? JSON.parse(s.versesApplied) : null; } catch (e) { rec = null; }
    var doneMap = versesContextDonePoints[s.passageOrTheme] || {};
    var jobs = [];
    for (var i = 0; i < s.movementCount && i < s.movements.length; i++) {
      (function (idx) {
        var mv = s.movements[idx];
        if (!mv || mv.context || !mv.primaryRef || doneMap[idx]) { return; }
        jobs.push(function () {
          return bh.askContext(mv.primaryRef).then(function (out) {
            if (out && out.ok && out.answer) { return { idx: idx, answer: out.answer }; }
            /* 'away' is transient too (round-3 verification finding,
               2026-11-03): the journal showed the lane failing two
               context asks in one bad minute (primary timeout, a 429
               pool, router timeout) and answering the third plus
               every later tap once it recovered — settling on 'away'
               left those points bare for the whole session. A lane
               failure cools off and retries on a later pass like a
               limit does. The gate's own terminal shapes (refusal,
               withheld, no-passages) carry no reason and still
               settle — they are answers, not outages. */
            if (out && (out.limited || out.transport || out.reason === 'away')) { return { idx: idx, transient: true }; }
            return { idx: idx, terminal: true };
          }, function () { return { idx: idx, transient: true }; });
        });
      })(i);
    }
    if (!jobs.length) {
      versesContextFlightFor = '';
      /* Settle only when the passage is genuinely complete. On the
         multiple-reference road points can land AFTER the first
         pass ran (round-3 verification, 2026-11-03: 'Psalm 23;
         John 10:11' settled on the John point alone and the Psalm
         point's ask never fired). An incomplete passage stays
         unmarked so the next render's kick asks the late points. */
      if (versesContextComplete(s)) { versesContextFor = s.passageOrTheme; }
      return;
    }
    /* One at a time, never all at once (B2-008 FIX-5c): round 2
       fired every point's ask in a single breath (Promise.all),
       draining the shared hourly bucket before the preacher tapped
       anything. The asks now run in point order, each settling
       before the next is sent — and they draw on the context
       bucket server-side, not the shared one. */
    jobs.reduce(function (p, job) {
      return p.then(function (acc) { return job().then(function (r) { acc.push(r); return acc; }); });
    }, Promise.resolve([])).then(function (results) {
      /* Round 7: a pass that settles after a rebuild belongs to a
         dead build. It writes nothing — above all it must not write
         its stale applied record back over the new build's record
         (the record-merge below did exactly that whenever the new
         record was momentarily unreadable), and it must not mark
         the NEW passage's latches with the old pass's answers. */
      if (passEpoch !== buildEpoch || s.passageOrTheme !== passText) {
        if (versesContextFlightFor === passText) { versesContextFlightFor = ''; }
        return;
      }
      versesContextFlightFor = '';
      var changed = false;
      var transient = false;
      results.forEach(function (r) {
        if (!r) { return; }
        if (r.transient) { transient = true; return; }
        if (r.terminal) {
          if (!versesContextDonePoints[s.passageOrTheme]) { versesContextDonePoints[s.passageOrTheme] = {}; }
          versesContextDonePoints[s.passageOrTheme][r.idx] = true;
          return;
        }
        var mv = s.movements[r.idx];
        if (!mv || mv.context) { return; }
        mv.context = r.answer;
        changed = true;
        if (rec && rec.points && rec.points[r.idx]) { rec.points[r.idx].context = r.answer; }
      });
      /* Markers BEFORE any re-render: the render below re-enters
         kickVersesFill, and it must already see this passage as
         settled or cooling off — never as fresh to fire again. A
         pass that ends with points still missing (they landed
         after this pass started) settles nothing: the next kick
         asks exactly those points. */
      if (transient) {
        if (!scheduleVersesContextRetry(s)) {
          versesContextRetryFor = s.passageOrTheme;
          versesContextRetryAfter = Date.now() + VERSES_CONTEXT_COOL_OFF_MS;
        }
      } else {
        versesContextStreak[s.passageOrTheme] = 0;
        if (versesContextComplete(s)) {
          versesContextFor = s.passageOrTheme;
        }
      }
      if (changed) {
        try {
          var fresh = s.versesApplied ? JSON.parse(s.versesApplied) : null;
          if (fresh && fresh.points) {
            results.forEach(function (r) {
              if (r && r.answer && fresh.points[r.idx]) { fresh.points[r.idx].context = r.answer; }
            });
            s.versesApplied = JSON.stringify(fresh);
          } else if (rec) { s.versesApplied = JSON.stringify(rec); }
        } catch (e) { if (rec) { s.versesApplied = JSON.stringify(rec); } }
        save(false);
        var cur = currentOrPending();
        if (cur && cur.id === s.id && state.view === 'structure') { renderStructure(); }
      }
    });
  }
  function fillVersesBullets(s) {
    var eng = engineApi();
    if (!eng || !eng.gather || !eng.termsFor) { return false; }
    var specs = versesSpecs(s);
    if (!specs.length) { return false; }
    var own = [];
    validRefsFor(s.passageOrTheme).forEach(function (r) {
      var det = versesDetailed(r);
      if (!det || !det.verses.length) { return; }
      own.push({ book: det.book, chapter: det.chapter, from: det.verses[0].n, to: det.verses[det.verses.length - 1].n });
    });
    function isOwn(ref) {
      var p = null;
      try { p = window.SSB.parseReference(ref); } catch (e) { p = null; }
      if (!p || p.chapter == null || !p.verse) { return false; }
      var end = refEndVerse(ref) || p.verse;
      return own.some(function (o) { return o.book === p.book && o.chapter === p.chapter && p.verse <= o.to && end >= o.from; });
    }
    var rec = null;
    try { rec = s.versesApplied ? JSON.parse(s.versesApplied) : null; } catch (e) { rec = null; }
    var used = {};
    s.movements.forEach(function (m) { if (m.primaryRef) { used[String(m.primaryRef).toLowerCase()] = true; } });
    var changed = false;
    for (var i = 0; i < specs.length && i < s.movementCount; i++) {
      var mv = s.movements[i];
      if (!mv || mv.primaryRef !== specs[i].ref) { continue; }
      if (rec && rec.points && rec.points[i] && rec.points[i].supportingRefs) {
        if (!mv.supportingRefs.trim()) { mv.supportingRefs = rec.points[i].supportingRefs; changed = true; }
        continue;
      }
      if (mv.supportingRefs.trim()) { continue; }
      var res = null;
      try { res = eng.gather(eng.termsFor(specs[i].text).join(' ')); } catch (e) { res = null; }
      if (!res) { continue; }
      var pool = [];
      (res.top || []).forEach(function (t) { if (t && t.ref && pool.indexOf(t.ref) === -1) { pool.push(t.ref); } });
      (res.passages || []).forEach(function (r) { if (pool.indexOf(r) === -1) { pool.push(r); } });
      var picks = [];
      for (var k = 0; k < pool.length && picks.length < 2; k++) {
        var cand = pool[k];
        if (!cand || used[String(cand).toLowerCase()] || isOwn(cand)) { continue; }
        picks.push(cand); used[String(cand).toLowerCase()] = true;
      }
      if (picks.length) {
        mv.supportingRefs = picks.join(', ');
        changed = true;
        if (rec && rec.points && rec.points[i]) { rec.points[i].supportingRefs = mv.supportingRefs; }
      }
    }
    if (changed && rec) { s.versesApplied = JSON.stringify(rec); }
    return changed;
  }
  var CHIP_SKIP = {};
  ('the and but for so now then when that this with from into will shall hath have were your yours about after before because behold unto said saying went came upon also there here they them their his her him all out over under among within without lord god jehovah thou thee thine').split(' ').forEach(function (w) { CHIP_SKIP[w] = 1; });
  /* Specs for points the all-topics engine built (theme road):
     the chunking the verses door gets from versesSpecs does not
     exist here, so each point's own primary reference supplies the
     text — its first verses, read from the app's own Bible. Same
     spec shape ({ref, text}) the chip scan consumes; indices stay
     keyed to the movement index, as in the verses door. */
  function movementSpecs(s) {
    var out = [];
    if (typeof window === 'undefined' || !window.SSB || !window.SSB.parseReference || !window.SSB.getVerseText) { return out; }
    for (var i = 0; i < s.movementCount && i < s.movements.length; i++) {
      var mv = s.movements[i];
      if (!mv || !mv.primaryRef || !mv.primaryRef.trim()) { continue; }
      var p = null;
      try { p = window.SSB.parseReference(mv.primaryRef); } catch (e) { p = null; }
      if (!p || p.chapter == null || !p.verse) { continue; }
      var last = Math.min(p.endVerse || p.verse, p.verse + 3);
      var texts = [];
      for (var v = p.verse; v <= last; v++) {
        var t = null;
        try { t = window.SSB.getVerseText(p.book, p.chapter, v); } catch (e) { t = null; }
        if (t) { texts.push(t); }
      }
      if (texts.length) { out[i] = { ref: mv.primaryRef, firstRef: mv.primaryRef, text: texts.join(' '), firstText: texts[0] }; }
    }
    return out;
  }
  function computePassageChips(s) {
    var byPoint = {};
    passageChipsCache = { forText: s.passageOrTheme, byPoint: byPoint };
    if (typeof window === 'undefined' || !window.SSB || !window.SSB.searchEaston) { return; }
    var specs = versesSpecs(s);
    if (!specs.length) { specs = movementSpecs(s); }
    specs.forEach(function (spec, i) {
      if (i >= s.movementCount) { return; }
      var words = String(spec.text || '').match(/[A-Za-z']+/g) || [];
      var seen = {}, ordered = [];
      words.forEach(function (w) {
        var key = w.toLowerCase();
        if (seen[key]) { return; }
        seen[key] = 1; ordered.push(w);
      });
      var chips = [], tried = {};
      function consider(w) {
        if (chips.length >= 3) { return; }
        var key = w.toLowerCase().replace(/^'+|'+$/g, '');
        if (!key || key.length < 3 || CHIP_SKIP[key] || tried[key]) { return; }
        tried[key] = 1;
        var keys = [key];
        if (key.length > 3 && /s$/.test(key)) { keys.push(key.slice(0, -1)); }
        for (var q = 0; q < keys.length; q++) {
          var res = null;
          try { res = window.SSB.searchEaston(keys[q]) || []; } catch (e) { res = []; }
          var done = false;
          for (var k = 0; k < res.length; k++) {
            var e = res[k];
            if (e && e.term && e.term.toLowerCase() === keys[q] && e.definition && String(e.definition).length >= 40) {
              chips.push({ point: i, term: e.term, text: String(e.definition).slice(0, 700), refs: [] });
              done = true; break;
            }
          }
          if (done) { break; }
        }
      }
      ordered.forEach(function (w) { if (/^[A-Z]/.test(w)) { consider(w); } });
      ordered.forEach(function (w) { consider(w); });
      if (chips.length) { byPoint[i] = chips; }
    });
  }
  function passageChipsFor(s, i) {
    if (!s || passageChipsCache.forText !== s.passageOrTheme) { return []; }
    return passageChipsCache.byPoint[i] || [];
  }
  /* Clear exactly the values the verses-first door put in. */
  /* Phase state reset (round 6, 2026-11-03): the context and
     bullets phase bookkeeping is keyed by passage/topic TEXT and
     lives for the whole page session. A fresh apply for a text is a
     NEW outline, so a latch, terminal-point record, retry streak or
     cool-off an earlier sermon earned under the same text must not
     follow it into the new one — in one session, a second Genesis
     build silently lost its context phase to the first build's
     completion latch, and a lane storm during one sermon could
     suppress the next sermon's asks under the same text for ten
     minutes. The Clear paths reset the pieces they own; a fresh
     apply now resets all of it for its own text. In-flight guards
     are left alone — they clear themselves when their pass
     settles, and resetting them mid-flight would double the asks
     the round-3 discipline exists to prevent. */
  function resetContextPhaseState(text) {
    if (!text) { return; }
    if (versesContextFor === text) { versesContextFor = ''; }
    if (engineContextFor === text) { engineContextFor = ''; }
    if (versesBulletsFor === text) { versesBulletsFor = ''; }
    if (versesContextDonePoints[text]) { delete versesContextDonePoints[text]; }
    if (engineContextDonePoints[text]) { delete engineContextDonePoints[text]; }
    if (versesContextStreak[text]) { delete versesContextStreak[text]; }
    if (engineContextStreak[text]) { delete engineContextStreak[text]; }
    if (versesContextRetryFor === text) { versesContextRetryFor = ''; versesContextRetryAfter = 0; }
    if (engineContextRetryFor === text) { engineContextRetryFor = ''; engineContextRetryAfter = 0; }
    if (passageChipsCache.forText === text) { passageChipsCache = { forText: '', byPoint: {} }; }
  }
  function clearVerses(s) {
    var api = suggestApi();
    if (!api || !s.versesAppliedFor) { return; }
    var refs = validRefsFor(s.versesAppliedFor);
    var usedTopic = null;
    refs.forEach(function (r, i) {
      var hit = api.suggestForRef ? api.suggestForRef(r) : null;
      if (hit && !usedTopic) { usedTopic = api.topicById(hit.topicId); }
      if (i < s.movements.length) {
        var mv = s.movements[i];
        if (mv.primaryRef === r) { mv.primaryRef = ''; }
        if (hit && mv.title === hit.title) { mv.title = ''; }
      }
    });
    /* What the full verses fill recorded (2026-10-30): chunk points,
       titles, bullets and sparks \u2014 removed exactly; his edits stay. */
    var rec = null;
    try { rec = s.versesApplied ? JSON.parse(s.versesApplied) : null; } catch (e) { rec = null; }
    if (rec && rec.points) {
      rec.points.forEach(function (pt, i) {
        if (i >= s.movements.length) { return; }
        var mv = s.movements[i];
        if (pt.title && mv.title === pt.title) { mv.title = ''; }
        if (pt.primaryRef && mv.primaryRef === pt.primaryRef) { mv.primaryRef = ''; }
        if (pt.supportingRefs && mv.supportingRefs === pt.supportingRefs) { mv.supportingRefs = ''; }
        if (pt.context && mv.context === pt.context) { mv.context = ''; }
      });
    }
    if (s.supportingRefs) {
      var kept = s.supportingRefs.split('\n').filter(function (line) { return refs.indexOf(line.trim()) === -1 || line.trim() === ''; });
      s.supportingRefs = kept.join('\n');
    }
    if (usedTopic) {
      if (s.realLifeIdeas === usedTopic.ideas.join('\n')) { s.realLifeIdeas = ''; }
      if (s.todayIdeas === (usedTopic.today || []).join('\n')) { s.todayIdeas = ''; }
    }
    if (rec) {
      if (rec.realLife && s.realLifeIdeas === rec.realLife) { s.realLifeIdeas = ''; }
      if (rec.today && s.todayIdeas === rec.today) { s.todayIdeas = ''; }
    }
    s.versesApplied = '';
    s.versesAppliedFor = '';
    versesAttemptFor = s.passageOrTheme;
    if (versesBulletsFor === s.passageOrTheme) { versesBulletsFor = ''; }
    if (versesContextFor === s.passageOrTheme) { versesContextFor = ''; }
    if (versesContextDonePoints[s.passageOrTheme]) { delete versesContextDonePoints[s.passageOrTheme]; }
    if (passageChipsCache.forText === s.passageOrTheme) { passageChipsCache = { forText: '', byPoint: {} }; }
  }
  /* Clear exactly the values the suggestions put in (user edits stay).
     The clearing itself lives in clearAppliedValues so the Setup
     submit can reuse it for a rebuild under changed text (round 5):
     same rule both ways — only values that still match the applied
     record are removed; his edited words never match and stay. */
  function clearAppliedValues(s) {
    if (!s || (!s.suggestedFor && !s.versesAppliedFor && !s.engineFor && !s.helperFor)) { return false; }
    buildEpoch++;
    var api = suggestApi();
    var topic = api ? api.matchTopic(s.suggestedFor) : null;
    if (topic) {
      for (var i = 0; i < topic.points.length && i < s.movements.length; i++) {
        var mv = s.movements[i], pt = topic.points[i];
        if (mv.title === pt.title) { mv.title = ''; }
        if (mv.primaryRef === pt.primaryRef) { mv.primaryRef = ''; }
        if (mv.supportingRefs === pt.supportingRefs) { mv.supportingRefs = ''; }
      }
      if (s.realLifeIdeas === topic.ideas.join('\n')) { s.realLifeIdeas = ''; }
      if (s.todayIdeas === (topic.today || []).join('\n')) { s.todayIdeas = ''; }
    }
    if (s.engineFor && s.engineApplied) {
      var epts = [];
      try { epts = JSON.parse(s.engineApplied) || []; } catch (e) { epts = []; }
      for (var j = 0; j < epts.length && j < s.movements.length; j++) {
        var emv = s.movements[j], ept = epts[j];
        if (ept && emv.title === ept.title) { emv.title = ''; }
        if (ept && emv.primaryRef === ept.primaryRef) { emv.primaryRef = ''; }
        if (ept && emv.supportingRefs === ept.supportingRefs) { emv.supportingRefs = ''; }
        if (ept && ept.context && emv.context === ept.context) { emv.context = ''; }
      }
    }
    if (s.helperFor && s.helperApplied) {
      var hpts = [];
      try { hpts = JSON.parse(s.helperApplied) || []; } catch (e) { hpts = []; }
      for (var hj = 0; hj < hpts.length && hj < s.movements.length; hj++) {
        var hmv = s.movements[hj], hpt = hpts[hj];
        if (hpt && hmv.title === hpt.title) { hmv.title = ''; }
        if (hpt && hmv.primaryRef === hpt.primaryRef) { hmv.primaryRef = ''; }
        if (hpt && hmv.supportingRefs === hpt.supportingRefs) { hmv.supportingRefs = ''; }
      }
    }
    if (s.topicApplied) {
      var tpts = [];
      try { tpts = JSON.parse(s.topicApplied) || []; } catch (e) { tpts = []; }
      for (var ti = 0; ti < tpts.length && ti < s.movements.length; ti++) {
        var tmv = s.movements[ti], tpt = tpts[ti];
        if (tpt && tpt.context && tmv.context === tpt.context) { tmv.context = ''; }
      }
    }
    if (s.versesAppliedFor) { clearVerses(s); }
    /* Phase state is keyed by the APPLIED text — on a rebuild that
       is the old text, not the text now in the setup box. */
    [s.suggestedFor, s.engineFor, s.helperFor, s.versesAppliedFor].forEach(function (t) {
      if (!t) { return; }
      if (engineContextFor === t) { engineContextFor = ''; }
      if (engineContextDonePoints[t]) { delete engineContextDonePoints[t]; }
      if (versesContextFor === t) { versesContextFor = ''; }
      if (versesContextDonePoints[t]) { delete versesContextDonePoints[t]; }
      if (passageChipsCache.forText === t) { passageChipsCache = { forText: '', byPoint: {} }; }
    });
    s.suggestedFor = '';
    s.engineFor = '';
    s.engineApplied = '';
    s.helperFor = '';
    s.helperApplied = '';
    s.suggestTier = '';
    s.topicApplied = '';
    return true;
  }
  function clearSuggestions() {
    var s = currentOrPending();
    if (!clearAppliedValues(s)) { return; }
    fillMissFor = s.passageOrTheme;
    renderStructure();
    markDirty();
    setStatus('Suggestions cleared. The boxes are yours to fill.', 'ok');
  }
  /* Saved-sermon fill (Donnie, 2026-10-29): the topic fill used to
     run ONLY in the Setup submit handler, so a sermon saved before
     the matcher/engine existed — his anger sermon, saved empty the
     same morning — opened on Structure empty forever. Now the
     Structure screen itself offers the SAME consultation as a fresh
     build: curated matchTopic first (confident only), then the s19
     engine. ONE big button, shown only while the sermon carries a
     topic, at least one of its main points is still completely
     empty, and nothing has been applied for this exact topic text.
     The fill is never automatic and never overwrites: a point that
     already carries a title or a reference is snapshotted before
     the apply and restored untouched after it, and his own-words
     fields and entered ideas are never written (the apply functions
     only fill empty boxes to begin with). If both tiers find
     nothing, the tap lands on the honest fallback note instead of a
     dead end: fillMissFor records the miss so the button steps
     aside and the note shows. Clearing suggestions records the
     topic here too, so a deliberate clear is not re-offered. */
  var fillMissFor = '';
  function fillOfferApplies(s) {
    if (!s || s.startType !== 'theme') { return false; }
    if (!(s.passageOrTheme || '').trim()) { return false; }
    if (s.suggestedFor === s.passageOrTheme || s.engineFor === s.passageOrTheme || s.helperFor === s.passageOrTheme) { return false; }
    for (var i = 0; i < s.movementCount && i < s.movements.length; i++) {
      var mv = s.movements[i];
      if (mv && !mv.title.trim() && !mv.primaryRef.trim() && !mv.supportingRefs.trim()) { return true; }
    }
    return false;
  }
  function fillFromTopic() {
    var s = currentOrPending();
    if (!s || s.startType !== 'theme') { return; }
    var handsOff = [];
    for (var i = 0; i < s.movements.length; i++) {
      var mv = s.movements[i];
      if (mv.title.trim() || mv.primaryRef.trim() || mv.supportingRefs.trim()) {
        handsOff.push({ i: i, title: mv.title, primaryRef: mv.primaryRef, supportingRefs: mv.supportingRefs });
      }
    }
    function restoreHandsOff() {
      handsOff.forEach(function (h) {
        var m = s.movements[h.i];
        if (m) { m.title = h.title; m.primaryRef = h.primaryRef; m.supportingRefs = h.supportingRefs; }
      });
    }
    function finish(applied) {
      restoreHandsOff();
      if (applied) {
        fillMissFor = '';
        save(false);
        setStatus('Outline built from your topic. Change any of it — the words are yours.', 'ok');
      } else {
        /* Ease-of-use rule 11 (2026-10-29): a tap always answers in
           words. A miss used to change nothing on screen at all; the
           fallback note below says the same thing for readers who
           scroll to it. */
        setStatus('Ehyeh could not gather Scriptures for that topic yet. Try different words for the topic, or start from your own verses.', 'warn');
      }
      if (state.view === 'structure') { renderStructure(); }
    }
    var topic = matchFor(s);
    if (topic) { applySuggestions(s, topic); finish(true); return; }
    if (!engineApi()) {
      ensureEngineData();
      setStatus('Ehyeh is still getting ready — tap the button again in a moment.', 'warn');
      return;
    }
    var db = (typeof window !== 'undefined' && window.SSB && window.SSB.db) ? window.SSB.db() : null;
    var eastonReady = !!(db && db.easton && Object.keys(db.easton).length);
    if (!eastonReady && typeof window.ensureEaston === 'function') {
      engineGatherPending = true;
      if (state.view === 'structure') { renderStructure(); }
      var p = null;
      try { p = window.ensureEaston(); } catch (e) { p = null; }
      if (p && typeof p.then === 'function') {
        p.then(function () {
          engineGatherPending = false;
          var r = runEngineGather(s);
          if (r && r.tier === 'engine') { applyEngine(s, r); finish(true); }
          else { fillMissFor = s.passageOrTheme; finish(false); }
        }, function () {
          engineGatherPending = false;
          fillMissFor = s.passageOrTheme;
          finish(false);
        });
        return;
      }
      engineGatherPending = false;
    }
    var result = runEngineGather(s);
    if (result && result.tier === 'engine') { applyEngine(s, result); finish(true); return; }
    fillMissFor = s.passageOrTheme;
    finish(false);
  }
  /* Banner / fallback note / real-life ideas card — created by s03
     because Hagah.html's Structure markup is not ours to edit. */
  function ensureSuggestDom() {
    var view = $('view-structure');
    if (!view) { return; }
    var movementsBox = $('movements');
    if (!movementsBox) { return; }
    if (!$('suggest-banner')) {
      var banner = el('div', { 'class': 'card', id: 'suggest-banner' });
      banner.hidden = true;
      banner.appendChild(el('p', { 'class': 'help', id: 'suggest-banner-text' }, ''));
      var clearBtn = el('button', { type: 'button', 'class': 'btn quiet', id: 'suggest-clear' }, 'Clear the suggestions');
      clearBtn.addEventListener('click', function () { clearSuggestions(); });
      banner.appendChild(clearBtn);
      movementsBox.parentNode.insertBefore(banner, movementsBox);
    }
    if (!$('suggest-note')) {
      var note = el('div', { 'class': 'card', id: 'suggest-note' });
      note.hidden = true;
      note.appendChild(el('p', { 'class': 'help', id: 'suggest-note-text' }, ''));
      movementsBox.parentNode.insertBefore(note, movementsBox);
    }
    if (!$('fill-card')) {
      var fcard = el('div', { 'class': 'card', id: 'fill-card' });
      fcard.hidden = true;
      fcard.appendChild(el('p', { 'class': 'help' }, 'This sermon has a topic, but its main points are still empty. Ehyeh can build the outline from the topic — a prepared passage set when it has one, gathered Scriptures when it doesn’t. Nothing you have written is changed.'));
      var fillBtn = el('button', { type: 'button', 'class': 'btn', id: 'btn-fill-topic' }, 'Build this outline from my topic');
      fillBtn.addEventListener('click', function () { fillFromTopic(); });
      fcard.appendChild(fillBtn);
      movementsBox.parentNode.insertBefore(fcard, movementsBox);
    }
    if (!$('f-ideas')) {
      var card = el('div', { 'class': 'card', id: 'ideas-card' });
      card.appendChild(el('h3', {}, suggestApi() ? suggestApi().IDEAS_LABEL : 'Explain it in real life — ideas'));
      card.appendChild(el('p', { 'class': 'help', id: 'h-ideas' }, suggestApi() ? suggestApi().IDEAS_HELP : 'One-line sparks for your own stories and pictures. The telling is yours.'));
      var field = el('div', { 'class': 'field' });
      var lab = el('label', { 'for': 'f-ideas', 'class': 'sr-only' }, 'Explain it in real life — ideas');
      field.appendChild(lab);
      var ta = el('textarea', { id: 'f-ideas', 'class': 'tall', 'data-field': 'realLifeIdeas', 'aria-describedby': 'h-ideas' });
      field.appendChild(ta);
      card.appendChild(field);
      var turnTa = $('f-turn');
      var turnCard = turnTa;
      while (turnCard && !(turnCard.className && String(turnCard.className).indexOf('card') !== -1)) { turnCard = turnCard.parentNode; }
      if (turnCard && turnCard.parentNode) { turnCard.parentNode.insertBefore(card, turnCard); }
      else { view.appendChild(card); }
    }
    if (!$('f-today')) {
      var apiT = suggestApi();
      var tcard = el('div', { 'class': 'card', id: 'today-card' });
      tcard.appendChild(el('h3', {}, apiT ? apiT.TODAY_LABEL : 'Relates to today — ideas'));
      tcard.appendChild(el('p', { 'class': 'help', id: 'h-today' }, apiT ? apiT.TODAY_HELP : 'Present-day situations where this passage lands. Sparks only — the telling is yours.'));
      var tfield = el('div', { 'class': 'field' });
      var tlab = el('label', { 'for': 'f-today', 'class': 'sr-only' }, 'Relates to today — ideas');
      tfield.appendChild(tlab);
      var tta = el('textarea', { id: 'f-today', 'class': 'tall', 'data-field': 'todayIdeas', 'aria-describedby': 'h-today' });
      tfield.appendChild(tta);
      tcard.appendChild(tfield);
      var ideasCard = $('ideas-card');
      if (ideasCard && ideasCard.parentNode) { ideasCard.parentNode.insertBefore(tcard, ideasCard.nextSibling); }
      else { view.appendChild(tcard); }
    }
    /* One-tap print, on the builder itself: the global data-action
       handler renders the pulpit sheet and opens the print dialog. */
    if (!$('btn-print-outline')) {
      var btnRow = view.querySelector('.btn-row');
      if (btnRow) {
        var pbtn = el('button', { type: 'button', 'class': 'btn', id: 'btn-print-outline', 'data-action': 'print' }, 'Print the outline');
        btnRow.insertBefore(pbtn, btnRow.firstChild);
      }
    }
    if (!$('vp-main')) {
      var pline = view.querySelector('.passage-line');
      if (pline && pline.parentNode) {
        var vpm = el('div', { id: 'vp-main' });
        pline.parentNode.insertBefore(vpm, pline.nextSibling);
      }
    }
    if (!$('builder-word-card')) {
      var wcard = el('div', { 'class': 'card', id: 'builder-word-card', hidden: 'hidden' });
      movementsBox.parentNode.insertBefore(wcard, movementsBox.nextSibling);
    }
    if (!$('explain-card')) {
      var xcard = el('div', { 'class': 'card', id: 'explain-card', hidden: 'hidden' });
      movementsBox.parentNode.insertBefore(xcard, movementsBox.nextSibling);
    }
    if (!view.getAttribute('data-wordtap')) {
      view.setAttribute('data-wordtap', '1');
      view.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('.w') : null;
        if (t) { openBuilderWord(t); }
      });
      view.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.classList && e.target.classList.contains('w')) {
          e.preventDefault();
          openBuilderWord(e.target);
        }
      });
    }
  }
  var PASSAGE_NOTE = 'Ehyeh could not find a Scripture reference in that text. Write it like “John 3:16” — or put several of your passages in, separated with ; — and Ehyeh builds a main point around each one.';
  function renderSuggestions(s) {
    ensureSuggestDom();
    var banner = $('suggest-banner'), note = $('suggest-note'), ideas = $('f-ideas');
    if (ideas) { ideas.value = s.realLifeIdeas || ''; }
    var today = $('f-today');
    if (today) { today.value = s.todayIdeas || ''; }
    if (!banner || !note) { return; }
    var api = suggestApi();
    var eApi = engineApi();
    var curatedApplied = !!(s.suggestedFor && api && api.matchTopic(s.suggestedFor));
    var engineApplied = !!(s.suggestTier === 'engine' && s.engineFor && s.engineFor === s.passageOrTheme);
    var helperApplied = !!(s.suggestTier === 'helper' && s.helperFor && s.helperFor === s.passageOrTheme);
    var applied = curatedApplied || engineApplied || helperApplied;
    if (!applied && s.startType === 'passage' && s.versesAppliedFor && s.versesAppliedFor === s.passageOrTheme) { applied = true; }
    var fillCard = $('fill-card');
    var fillOffer = !applied && !engineGatherPending && fillMissFor !== (s.passageOrTheme || '') && fillOfferApplies(s);
    if (fillCard) { fillCard.hidden = !fillOffer; }
    if (applied) {
      banner.hidden = false;
      if (curatedApplied) {
        $('suggest-banner-text').textContent = api.BANNER + ' Ehyeh’s prepared set for this topic.';
      } else if (engineApplied) {
        $('suggest-banner-text').textContent = eApi ? eApi.ENGINE_BANNER : 'Scriptures gathered for your topic — the words and arrangement are yours.';
      } else if (helperApplied) {
        $('suggest-banner-text').textContent = HELPER_BANNER;
      } else {
        /* Round 8: this module executes BEFORE s18, so on the boot
           render of a restored passage sermon the suggest API is
           still null here — this line threw, the throw escaped the
           module's top level during its boot show('structure'), and
           the shell bridge published after that render never ran:
           the reloaded tab's sermon planner was dead for the life
           of the tab (re-test 7, R1; stack reproduced in the
           round-8 rig). Fall back to s18's own banner words — the
           convention this file already uses for IDEAS_LABEL /
           TODAY_LABEL above; s18's arrival re-renders with the
           live value, which is the same string. */
        $('suggest-banner-text').textContent = api ? api.BANNER : 'Suggested starting points from Ehyeh — change any of them. The words are yours.';
      }
      note.hidden = true;
      return;
    }
    banner.hidden = true;
    if (engineGatherPending && s.startType === 'theme' && (s.passageOrTheme || '').trim()) {
      note.hidden = false;
      $('suggest-note-text').textContent = 'Gathering Scriptures for your topic…';
    } else if (fillOffer) {
      note.hidden = true;
    } else if (s.startType === 'theme' && (s.passageOrTheme || '').trim() && api) {
      note.hidden = false;
      $('suggest-note-text').textContent = api.FALLBACK_NOTE;
    } else if (s.startType === 'passage' && (s.passageOrTheme || '').trim() && api && !validRefsFor(s.passageOrTheme).length) {
      note.hidden = false;
      $('suggest-note-text').textContent = PASSAGE_NOTE;
    } else {
      note.hidden = true;
    }
  }

  /* --- Structure --- */
  /* Ease-of-use rule 12 (2026-10-29): a point's order changes with the
     plain Move up / Move down buttons — never a drag. The whole movement
     object swaps places, so its own words and its added explanations
     travel with it. Saved through the same autosave path as typing. */
  function moveMovement(idx, dir) {
    var s = currentOrPending();
    var j = idx + dir;
    if (!s || j < 0 || j >= s.movementCount) { return; }
    var tmp = s.movements[idx];
    s.movements[idx] = s.movements[j];
    s.movements[j] = tmp;
    markDirty();
    renderStructure();
    setStatus('Point ' + (idx + 1) + (dir < 0 ? ' moved up.' : ' moved down.'), 'ok');
  }

  function renderStructure() {
    ensureSuggestData();
    ensureEngineData();
    var s = currentOrPending();
    maybeApplyVerses(s);
    kickVersesFill(s);
    kickEngineFill(s);
    $('s-passage-label').textContent = s.startType === 'theme' ? 'Theme' : s.startType === 'passage' ? 'Main passage' : 'Main passage or theme';
    $('s-passage').textContent = s.passageOrTheme || (s.startType === 'blank' ? '—' : '');
    $('f-turn').value = s.turn;
    /* centralIdea and landing no longer render on this screen (Donnie
       2026-10-29 — the screen is the sermon itself); their saved
       values stay in the sermon record, un-rendered. */
    renderSuggestions(s);
    /* Fewer points than boxes (round 5): a single-verse passage
       honestly gives ONE point; the sweep found the other boxes
       standing blank with no word about why, which reads as the
       app failing. Say it on the screen instead — never invent
       points to fill the count.
       Round 7: the count is taken from the boxes themselves, on
       EVERY apply path. The round-5 form recomputed the passage's
       spec list at render time and trusted one tier's applied
       marker; in the acceptance profile the John 3:16 outline
       arrived with its points filled by an apply the recompute
       did not reproduce (spec counts move with corpus residency),
       the marker check passed or failed on state the render could
       not see, and the note silently stayed hidden behind two
       blank boxes (re-tests 5 and 6). What the preacher can see —
       how many boxes the build actually filled — is the count
       that decides the note now, for passage and topic alike. */
    var specsNote = $('specs-note');
    var shortBy = 0;
    var gaveN = 0;
    var noteApplied = (s.versesAppliedFor && s.versesAppliedFor === s.passageOrTheme) ||
      (s.suggestedFor && s.suggestedFor === s.passageOrTheme) ||
      (s.engineFor && s.engineFor === s.passageOrTheme) ||
      (s.helperFor && s.helperFor === s.passageOrTheme);
    if (noteApplied && (s.startType === 'passage' || s.startType === 'theme')) {
      var filledN = 0;
      for (var fi = 0; fi < s.movementCount && fi < s.movements.length; fi++) {
        var fm = s.movements[fi];
        if (fm && (String(fm.title || '').trim() || String(fm.primaryRef || '').trim())) { filledN++; }
      }
      if (filledN > 0 && filledN < s.movementCount) { gaveN = filledN; shortBy = s.movementCount - filledN; }
    }
    if (!shortBy && s.startType === 'passage' && s.versesAppliedFor && s.versesAppliedFor === s.passageOrTheme) {
      try {
        var specShort = s.movementCount - (versesSpecs(s) || []).length;
        if (specShort > 0) { shortBy = specShort; gaveN = s.movementCount - specShort; }
      } catch (e) { /* the filled-count above already had its say */ }
    }
    if (shortBy > 0) {
      if (!specsNote) {
        specsNote = el('p', { 'class': 'help', id: 'specs-note', role: 'status' });
        var mvBox0 = $('movements');
        if (mvBox0 && mvBox0.parentNode) { mvBox0.parentNode.insertBefore(specsNote, mvBox0); }
      }
      if (s.startType === 'theme') {
        specsNote.textContent = 'This topic gave ' + gaveN + (gaveN === 1 ? ' point' : ' points') + '. The other ' + (shortBy === 1 ? 'box is' : 'boxes are') + ' yours to fill — or try a broader topic.';
      } else {
        specsNote.textContent = 'This passage gave ' + gaveN + (gaveN === 1 ? ' point' : ' points') + '. The other ' + (shortBy === 1 ? 'box is' : 'boxes are') + ' yours to fill — or widen the passage to cover more verses.';
      }
      specsNote.hidden = false;
    } else if (specsNote) { specsNote.hidden = true; }
    var box = $('movements');
    while (box.firstChild) { box.removeChild(box.firstChild); }
    for (var i = 0; i < s.movementCount; i++) {
      var card = el('div', { 'class': 'card movement' });
      var heading = el('h3', {});
      heading.appendChild(el('span', { 'class': 'num' }, 'Main point ' + (i + 1)));
      card.appendChild(heading);
      MOVEMENT_FIELDS.forEach(function (mf) {
        /* Donnie 2026-10-29: a point renders its title, its two
           Scripture boxes, and ONE own-words box. 'What the text
           emphasizes' and 'Transition' no longer render — their saved
           values stay in the sermon record, un-rendered. The old
           'Pastor's private notes' box is the own-words space, under
           a label that says what goes there and that it prints. */
        if (mf.key === 'emphasis' || mf.key === 'transition') { return; }
        var id = 'm' + i + '-' + mf.key;
        var field = el('div', { 'class': 'field' });
        field.appendChild(el('label', { 'for': id }, mf.key === 'notes' ? 'Your own words for this point — these print with the sermon' : mf.label));
        var ta = el('textarea', { id: id, 'data-movement': String(i), 'data-mkey': mf.key, 'class': mf.cls });
        ta.value = s.movements[i][mf.key];
        field.appendChild(ta);
        card.appendChild(field);
        if (mf.key === 'title' && s.movements[i].context) {
          /* The helper's context line for this point (verses walk,
             2026-11-02): citation-checked at the lane, from the
             chunk's own verses, shown under the title. It is the
             lane's words, labeled as such — read-only here, and
             Clear removes it with the rest of the verses fill. */
          var cfield = el('div', { 'class': 'field' });
          cfield.appendChild(el('label', {}, 'What this part of the passage says \u2014 the helper, from these verses'));
          cfield.appendChild(el('p', { 'class': 'help', 'data-context-for': String(i) }, s.movements[i].context));
          card.appendChild(cfield);
        }
        if (mf.key === 'title' && (s.startType === 'passage' || topicTierApplied(s))) {
          /* B2-008 FIX-2: offline background under every verses-door
             point, shown without a tap. The app already holds this
             context (Easton's entries for the chunk's own words —
             the same entries the tappable chips offer); showing the
             first sentence of each under its source label makes the
             point carry context even when the helper lane is down.
             Printing still follows the 2026-10-29 rule: the text
             reaches paper only through the Add-to-outline button,
             which uses the existing addExplainer path. */
          var bg = passageChipsFor(s, i);
          if (bg.length) {
            var bfield = el('div', { 'class': 'field' });
            bfield.appendChild(el('label', {}, 'Background for this part - from Easton\u2019s Bible Dictionary (1897), Ehyeh\u2019s own dictionary'));
            var bul = el('ul', { 'class': 's-conn', 'data-background-for': String(i) });
            bg.forEach(function (entry) { bul.appendChild(el('li', {}, entry.term + ': ' + firstSentence(entry.text))); });
            bfield.appendChild(bul);
            var addAll = el('button', { type: 'button', 'class': 'btn quiet' }, 'Add this background to my outline');
            (function (idx, list) {
              addAll.addEventListener('click', function () {
                list.forEach(function (entry) { addExplainer(idx, { term: entry.term, text: entry.text, refs: '', source: 'dictionary' }); });
              });
            })(i, bg);
            bfield.appendChild(addAll);
            card.appendChild(bfield);
          }
        }
      });
      /* Move up / Move down for this point (rule 12, above). */
      var mvrow = el('div', { 'class': 'btn-row' });
      var upBtn = el('button', { type: 'button', 'class': 'btn secondary' }, 'Move point up');
      var dnBtn = el('button', { type: 'button', 'class': 'btn secondary' }, 'Move point down');
      if (i === 0) { upBtn.disabled = true; }
      if (i === s.movementCount - 1) { dnBtn.disabled = true; }
      (function (idx) {
        upBtn.addEventListener('click', function () { moveMovement(idx, -1); });
        dnBtn.addEventListener('click', function () { moveMovement(idx, 1); });
      })(i);
      mvrow.appendChild(upBtn);
      mvrow.appendChild(dnBtn);
      card.appendChild(mvrow);
      /* Term explanations for THIS point (Donnie, 2026-10-29): the
         concepts the point names, tappable to understand before
         teaching. Prepared explainers ride the applied topic set;
         any other word or idea goes through the same door —
         dictionary first, helper second. What he adds lists here
         and prints under the point; the rest never reaches paper. */
      var exTopic = explainTopicFor(s);
      var prepared = (exTopic && exTopic.explain) ? exTopic.explain.filter(function (e) { return e.point === i; }) : [];
      var preparedSource = 'prepared';
      if (!prepared.length && s.startType === 'passage') {
        prepared = passageChipsFor(s, i);
        if (prepared.length) { preparedSource = 'dictionary'; }
      }
      if (prepared.length) {
        var crow = el('div', { 'class': 'field' });
        crow.appendChild(el('label', {}, 'Ideas in this point — tap one to understand it'));
        prepared.forEach(function (entry) {
          var chip = el('button', { type: 'button', 'class': 'btn quiet' }, entry.term);
          /* Capture the point index per chip (round 5): the bare
             loop variable left every chip reporting the LAST point
             ("this explains an idea in point 4" from point 1's
             chip, 2026-11-03 drill) — the same capture its
             neighbouring handlers already guard against. */
          (function (idx, src, ent) {
            chip.addEventListener('click', function () {
              if (src === 'dictionary') { showExplainer(idx, { term: ent.term, text: ent.text, refs: '', source: 'dictionary' }); }
              else { openPreparedExplainer(idx, ent); }
            });
          })(i, preparedSource, entry);
          crow.appendChild(chip);
          crow.appendChild(document.createTextNode(' '));
        });
        card.appendChild(crow);
      }
      var mdoor = el('div', { 'class': 'field' });
      mdoor.appendChild(el('label', { 'for': 'mx' + i }, 'What does this mean? Type a word or idea from this point'));
      var minput = el('input', { id: 'mx' + i, type: 'text', autocomplete: 'off', placeholder: 'covenant, altar, blessing…' });
      var mbtn = el('button', { type: 'button', 'class': 'btn quiet' }, 'Look it up');
      (function (idx, input) {
        mbtn.addEventListener('click', function () { openTermExplainer(idx, input.value); });
      })(i, minput);
      mdoor.appendChild(minput);
      mdoor.appendChild(mbtn);
      card.appendChild(mdoor);
      (s.movements[i].explainers || []).forEach(function (ex, xi) {
        var xrow = el('div', { 'class': 'field' });
        xrow.appendChild(el('label', {}, '“' + ex.term + '” — added to your outline'));
        xrow.appendChild(el('p', { 'class': 'help' }, ex.text));
        var rm = el('button', { type: 'button', 'class': 'btn quiet' }, 'Remove');
        (function (idx, xidx) {
          rm.addEventListener('click', function () { removeExplainer(idx, xidx); });
        })(i, xi);
        xrow.appendChild(rm);
        card.appendChild(xrow);
      });
      box.appendChild(card);
    }
    renderConnections();
    renderVersePreviews(s);
  }
  function connectionsOf(s) {
    if (!Array.isArray(s.studyConnections)) { s.studyConnections = []; }
    return s.studyConnections;
  }
  function findConnection(s, id) {
    var list = connectionsOf(s);
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } }
    return null;
  }
  function makeSelect(id, cid, key, options, value) {
    var sel = el('select', { id: id, 'data-scid': cid, 'data-sckey': key });
    options.forEach(function (opt) { var o = el('option', { value: opt }, opt); if (opt === value) { o.selected = true; } sel.appendChild(o); });
    return sel;
  }
  /* Slim renderer since 2026-10-29 (Donnie): the Structure screen is
     the sermon itself, nothing else. The full study-connections editor
     no longer renders here; what stays visible is this sermon's
     Original Languages card — the words he added from the word card —
     shown only when he added some. The connection data itself is
     untouched in the sermon record. */
  function renderConnections() {
    var s = currentOrPending();
    var view = $('view-structure');
    if (!s || !view) { return; }
    var lang = connectionsOf(s).filter(function (cn) { return cn.sourceCategory === 'Original language (Hebrew / Greek)'; });
    var card = $('lang-card');
    if (!lang.length) { if (card) { card.hidden = true; } return; }
    if (!card) {
      card = el('div', { 'class': 'card', id: 'lang-card' });
      card.appendChild(el('h3', {}, 'The Original Languages'));
      card.appendChild(el('div', { id: 'lang-list' }));
      var anchor = $('ideas-card');
      if (anchor && anchor.parentNode) { anchor.parentNode.insertBefore(card, anchor); }
      else { view.appendChild(card); }
    }
    card.hidden = false;
    var box = $('lang-list');
    while (box.firstChild) { box.removeChild(box.firstChild); }
    lang.forEach(function (cn) {
      box.appendChild(el('p', { 'class': 'help' }, cn.reference + (cn.note ? ' — ' + cn.note : '')));
    });
  }
  function readConnectionField(input) {
    var s = currentOrPending();
    if (!s) { return; }
    var cn = findConnection(s, input.getAttribute('data-scid'));
    if (!cn) { return; }
    var key = input.getAttribute('data-sckey');
    if (key === 'includeInPulpitSheet') { cn.includeInPulpitSheet = input.checked === true; return; }
    if (key === 'sourceCategory') { if (SC_CATEGORIES.indexOf(input.value) >= 0) { cn.sourceCategory = input.value; } return; }
    if (key === 'connectionType') { if (SC_TYPES.indexOf(input.value) >= 0) { cn.connectionType = input.value; } return; }
    if (key === 'reference') { cn.reference = clampStr(input.value, LIMITS.short); return; }
    if (key === 'note') { cn.note = clampStr(input.value, LIMITS.medium); }
  }
  function connectionAction(action, id) {
    var s = currentOrPending();
    if (!s) { return; }
    var list = connectionsOf(s);
    if (action === 'add') {
      if (list.length >= MAX_CONNECTIONS) { setStatus('This sermon already has ' + MAX_CONNECTIONS + ' study connections.', 'warn'); return; }
      var cn = blankConnection();
      list.push(cn);
      renderConnections();
      markDirty();
      var first = document.querySelector('#sc-list [data-sccard="' + cn.id + '"] select');
      if (first) { first.focus(); }
      return;
    }
    if (action === 'remove') {
      var target = findConnection(s, id);
      if (!target) { return; }
      var name = target.reference.trim() || 'this study connection';
      ask({ title: 'Remove this study connection?', message: 'This removes “' + name + '” from this sermon. You can undo it right after removing.', okLabel: 'Remove', danger: true }).then(function (v) {
        if (v !== true) { return; }
        var rmIdx = s.studyConnections.indexOf(target);
        s.studyConnections = s.studyConnections.filter(function (x) { return x.id !== target.id; });
        renderConnections();
        /* save(false), not markDirty(): the autosave timer would wipe
           the Undo button out of the status line after 1.5 seconds. */
        save(false);
        setStatus('Study connection removed.', 'ok');
        /* Rule 14: undo first, same as sermon delete. */
        var stEl = $('status');
        if (stEl && rmIdx >= 0) {
          var undoBtn = el('button', { type: 'button', 'class': 'btn secondary' }, 'Undo remove');
          undoBtn.addEventListener('click', function () {
            s.studyConnections.splice(Math.min(rmIdx, s.studyConnections.length), 0, target);
            renderConnections();
            save(false);
            setStatus('Restored “' + name + '”.', 'ok');
          });
          stEl.appendChild(document.createTextNode(' '));
          stEl.appendChild(undoBtn);
        }
        var add = document.querySelector('#sc-panel [data-sc="add"]');
        if (add) { add.focus(); }
      });
    }
  }
  function readStructureField(input) {
    var s = currentOrPending();
    if (!s) { return; }
    var mi = input.getAttribute('data-movement');
    if (mi !== null) {
      var key = input.getAttribute('data-mkey');
      var max = (key === 'notes') ? LIMITS.long : (key === 'title' || key === 'primaryRef') ? LIMITS.short : LIMITS.medium;
      s.movements[parseInt(mi, 10)][key] = clampStr(input.value, max);
      return;
    }
    var f = input.getAttribute('data-field');
    if (f === 'centralIdea' || f === 'turn' || f === 'landing' || f === 'realLifeIdeas' || f === 'todayIdeas') { s[f] = clampStr(input.value, LIMITS.medium); }
  }

  /* --- Faithfulness check --- */
  function renderCheck() {
    var s = currentOrPending();
    var list = $('check-list');
    while (list.firstChild) { list.removeChild(list.firstChild); }
    CHECK_ITEMS.forEach(function (text, i) {
      var li = el('li');
      var cb = el('input', { type: 'checkbox', id: 'chk-' + i, 'data-check': String(i) });
      cb.checked = s.faithfulness[i] === true;
      li.appendChild(cb);
      li.appendChild(el('label', { 'for': 'chk-' + i }, text));
      list.appendChild(li);
    });
  }

  /* --- Library --- */
  function renderLibrary() {
    var q = $('lib-search').value.trim().toLowerCase();
    var list = $('lib-list');
    while (list.firstChild) { list.removeChild(list.firstChild); }
    var items = state.sermons.slice().sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : -1; });
    if (q) {
      items = items.filter(function (s) {
        return [s.title, s.passageOrTheme, s.series, s.occasion, s.status, s.preachedDate].join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    $('lib-empty').hidden = items.length > 0;
    $('lib-empty').textContent = state.sermons.length === 0 ? 'No saved sermons yet.' : 'No sermons match your search.';
    items.forEach(function (s) {
      var li = el('li', { 'class': 'lib-item' });
      li.appendChild(el('div', { 'class': 'title' }, s.title || 'Untitled sermon'));
      var meta = el('div', { 'class': 'meta' });
      meta.appendChild(el('span', {}, s.passageOrTheme || (s.startType === 'blank' ? 'Blank start' : '—')));
      if (s.preachedDate) { meta.appendChild(el('span', {}, s.preachedDate)); }
      if (s.series) { meta.appendChild(el('span', {}, s.series)); }
      if (s.occasion) { meta.appendChild(el('span', {}, s.occasion)); }
      meta.appendChild(el('span', {}, s.status));
      li.appendChild(meta);
      var actions = el('div', { 'class': 'actions' });
      var statusLabel = el('label', { 'for': 'st-' + s.id, 'class': 'sr-only' }, 'Status');
      var sel = el('select', { id: 'st-' + s.id, 'data-lib': 'status', 'data-id': s.id });
      STATUSES.forEach(function (st) { var o = el('option', { value: st }, st); if (st === s.status) { o.selected = true; } sel.appendChild(o); });
      actions.appendChild(statusLabel); actions.appendChild(sel);
      [['open', 'Open'], ['duplicate', 'Duplicate'], ['rename', 'Rename'], ['export', 'Export'], ['delete', 'Delete']].forEach(function (a) {
        var b = el('button', { type: 'button', 'class': 'btn quiet' + (a[0] === 'delete' ? ' danger' : ''), 'data-lib': a[0], 'data-id': s.id }, a[1]);
        b.setAttribute('aria-label', a[1] + ': ' + (s.title || 'Untitled sermon'));
        actions.appendChild(b);
      });
      li.appendChild(actions);
      list.appendChild(li);
    });
  }
  function findById(id) { for (var i = 0; i < state.sermons.length; i++) { if (state.sermons[i].id === id) { return state.sermons[i]; } } return null; }

  /* ------------------------------------------------------------------
     Scripture display: full text under the points (Structure screen),
     tappable words, and the builder word-study card. Text comes only
     from the app's own bundled public-domain Bible (Geneva 1599 on
     screen; the pulpit sheet adds King James + Easy Read). A reference
     with an explicit range ("Philippians 4:6-7") shows exactly that
     range; a single verse shows that verse; a chapter shows the
     chapter (first 12 verses). Fail-safe: anything unresolvable
     shows nothing extra — the reference itself always remains.
     ------------------------------------------------------------------ */
  function splitRefs(str) {
    if (!str) { return []; }
    return String(str).split(/[·;,\n]/).map(function (x) { return x.trim(); }).filter(function (x) { return x !== ''; });
  }
  function refEndVerse(ref) {
    var m = String(ref == null ? '' : ref).match(/:(\d+)\s*[-–]\s*(\d+)\s*$/);
    if (!m) { return null; }
    var end = parseInt(m[2], 10);
    return isNaN(end) ? null : end;
  }
  function versesDetailed(ref) {
    try {
      if (!ref || !String(ref).trim()) { return null; }
      if (typeof window.SSB === 'undefined' || !window.SSB.parseReference) { return null; }
      if (typeof window.SSB_DATA === 'undefined' || !window.SSB_DATA.bible) { return null; }
      var p = window.SSB.parseReference(String(ref));
      if (!p || p.chapter == null) { return null; }
      var ch = (window.SSB_DATA.bible[String(p.book)] || {})[String(p.chapter)];
      if (!ch) { return null; }
      var nums = Object.keys(ch).map(function (k) { return parseInt(k, 10); })
        .filter(function (n) { return !isNaN(n); })
        .sort(function (a, b) { return a - b; });
      if (p.verse) {
        var end = refEndVerse(ref);
        nums = nums.filter(function (n) { return n >= p.verse && (end != null ? n <= end : n === p.verse); });
        nums = nums.slice(0, 40);
      } else { nums = nums.slice(0, 12); }
      if (!nums.length) { return null; }
      var names = window.SSB_DATA.books || [];
      var end2 = refEndVerse(ref);
      var label = (names[p.book - 1] || ('Book ' + p.book)) + ' ' + p.chapter + (p.verse ? ':' + p.verse + (end2 != null ? '-' + end2 : '') : '');
      return { label: label, book: p.book, chapter: p.chapter, verses: nums.map(function (n) { return { n: n, text: ch[String(n)] }; }) };
    } catch (e) { return null; }
  }
  function splitWordsB(text) {
    var parts = [], re = /[A-Za-z']+|[^A-Za-z']+/g, m;
    var s = String(text == null ? '' : text);
    while ((m = re.exec(s)) !== null) { parts.push(m[0]); }
    return parts;
  }
  function verseBlock(det) {
    var wrap = el('div', { 'class': 'vp-block' });
    wrap.appendChild(el('p', { 'class': 'help' }, det.label + ' — Geneva Bible (1599). Tap any word to study it.'));
    det.verses.forEach(function (v) {
      var p = el('p', { 'class': 'verse' });
      p.appendChild(el('span', { 'class': 'verse-num' }, String(v.n)));
      splitWordsB(v.text).forEach(function (tok) {
        if (/^[A-Za-z']+$/.test(tok)) {
          var sp = el('span', { 'class': 'w', tabindex: '0', role: 'button', 'data-word': tok, 'data-verse': String(v.n), 'data-book': String(det.book), 'data-chapter': String(det.chapter), 'aria-label': 'Study the word ' + tok });
          sp.textContent = tok;
          p.appendChild(sp);
        } else { p.appendChild(document.createTextNode(tok)); }
      });
      wrap.appendChild(p);
    });
    return wrap;
  }
  function renderVersePreviews(s) {
    if (!s) { return; }
    var main = $('vp-main');
    if (main) {
      while (main.firstChild) { main.removeChild(main.firstChild); }
      if (s.startType === 'passage') {
        validRefsFor(s.passageOrTheme).forEach(function (r) {
          var det = versesDetailed(r);
          if (det) { main.appendChild(verseBlock(det)); }
        });
      }
    }
    var box = $('movements');
    if (!box) { return; }
    for (var i = 0; i < s.movementCount && i < box.children.length; i++) {
      var card = box.children[i];
      var old = card.querySelector('.vp-slot');
      if (old) { old.parentNode.removeChild(old); }
      var m = s.movements[i];
      var refs = [];
      splitRefs(m.primaryRef).forEach(function (r) { refs.push(r); });
      splitRefs(m.supportingRefs).forEach(function (r) { refs.push(r); });
      var slot = el('div', { 'class': 'vp-slot' });
      var any = false;
      refs.forEach(function (r) {
        var det = versesDetailed(r);
        if (det) { slot.appendChild(verseBlock(det)); any = true; }
      });
      if (any) { card.appendChild(slot); }
    }
  }
  function meaningHead(def) {
    var d = String(def || '');
    var cut = d.search(/[.;]/);
    return cut > 0 ? d.slice(0, cut) : d;
  }
  function phoneVoiceFallback(text) {
    try {
      if (!('speechSynthesis' in window)) { window.alert('This phone has no voice to speak with.'); return; }
      var u = new SpeechSynthesisUtterance(text);
      u.rate = 0.85;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { /* the text rung always remains */ }
  }
  /* The pronunciation ladder, same as the Helper's Say it row (s17):
     house recording where the curated set has one, the phone's own
     voice otherwise — labelled honestly either way. */
  function sayRow(num, lex) {
    var wrap = el('div', { 'class': 'eh-say' });
    var pronApi = (typeof window !== 'undefined' && window.EHYEH_PRON) ? window.EHYEH_PRON : null;
    var pron = pronApi && pronApi.byId ? pronApi.byId[num] : null;
    var translit = pron ? pron.translit : (lex ? lex.transliteration : '');
    var row = el('div', { 'class': 'eh-row' });
    row.appendChild(el('strong', {}, 'Say it: '));
    if (translit) { row.appendChild(el('span', { 'class': 'eh-translit' }, translit)); }
    if (pron) { row.appendChild(el('span', { 'class': 'eh-respell' }, ' — say: ' + pron.respell)); }
    wrap.appendChild(row);
    var btns = el('div', { 'class': 'eh-row' });
    var note = el('p', { 'class': 'eh-note', hidden: 'hidden' });
    if (pron && pronApi) {
      var hb = el('button', { 'class': 'eh-btn', type: 'button' }, '▶ House voice');
      hb.addEventListener('click', function () { note.hidden = true; pronApi.playClip('data/pron/' + pron.id + '.mp3', note); });
      btns.appendChild(hb);
    }
    var speakText = pron ? pron.speak : String(translit || '').replace(/[ʼʿᵉâêîôûāēīōūʻ]/g, '');
    if (speakText) {
      var pb = el('button', { 'class': 'eh-btn', type: 'button' }, '▶ Phone’s voice');
      pb.addEventListener('click', function () {
        if (pronApi) { pronApi.phoneVoice(speakText, pb); } else { phoneVoiceFallback(speakText); }
      });
      btns.appendChild(pb);
      btns.appendChild(el('span', { 'class': 'eh-note' }, pron
        ? 'The phone’s voice is your phone’s own voice — it may say it imperfectly.'
        : 'No house recording for this word yet. Your phone’s own voice may say it imperfectly.'));
    }
    wrap.appendChild(btns);
    wrap.appendChild(note);
    return wrap;
  }
  function wordEntry(num, lex, refLabel) {
    var wrap = el('div', { 'class': 'bw-entry' });
    var tbl = el('table', { 'class': 'kv-table' });
    [['Dictionary number', num], ['Original word', lex.word], ['How to say it', lex.transliteration]].forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('th', {}, r[0]));
      var td = el('td', {}, r[1]);
      if (r[0] === 'Original word') { td.className = 'orig-word'; }
      tr.appendChild(td);
      tbl.appendChild(tr);
      if (r[0] === 'Dictionary number') {
        var ntr = el('tr');
        var ntd = el('td', { colspan: '2' });
        ntd.appendChild(el('div', { 'class': 'wp-note' }, 'A number that finds this word in a Bible dictionary.'));
        ntr.appendChild(ntd);
        tbl.appendChild(ntr);
      }
    });
    wrap.appendChild(tbl);
    var def = String(lex.definition || '');
    var head = meaningHead(def);
    var mw = el('div', { 'class': 'wp-meaning' });
    mw.appendChild(el('p', { 'class': 'wp-full-label' }, 'Meaning'));
    mw.appendChild(el('p', { 'class': 'wp-meaning-head' }, head));
    if (def && def !== head) {
      mw.appendChild(el('p', { 'class': 'wp-full-label' }, 'Full dictionary entry'));
      mw.appendChild(el('p', { 'class': 'wp-full' }, def));
    }
    wrap.appendChild(mw);
    wrap.appendChild(sayRow(num, lex));
    var addBtn = el('button', { type: 'button', 'class': 'btn secondary' }, 'Add this word to my outline');
    addBtn.addEventListener('click', function () { addWordToOutline(num, lex, refLabel, addBtn); });
    wrap.appendChild(addBtn);
    return wrap;
  }
  function addWordToOutline(num, lex, refLabel, btn) {
    var s = currentOrPending();
    if (!s) { return; }
    var list = connectionsOf(s);
    var reference = lex.word + ' (' + num + ') — ' + refLabel;
    for (var i = 0; i < list.length; i++) {
      if (list[i].reference === reference) { setStatus('That word is already in your outline.', 'ok'); return; }
    }
    if (list.length >= MAX_CONNECTIONS) { setStatus('This sermon already has ' + MAX_CONNECTIONS + ' study connections.', 'warn'); return; }
    var note = (lex.transliteration ? lex.transliteration + ' — ' : '') + meaningHead(lex.definition);
    list.push({ id: newId(), sourceCategory: 'Original language (Hebrew / Greek)', reference: clampStr(reference, LIMITS.short), connectionType: 'Pastor’s own study note', note: clampStr(note, LIMITS.medium), includeInPulpitSheet: true });
    renderConnections();
    markDirty();
    if (btn) { btn.textContent = 'Added ✓'; btn.disabled = true; }
    setStatus('Added to your outline — it prints under “The Original Languages”.', 'ok');
  }
  function openBuilderWord(span) {
    var card = $('builder-word-card');
    if (!card || typeof window.SSB === 'undefined' || !window.SSB.lookupWord) { return; }
    var b = parseInt(span.getAttribute('data-book'), 10);
    var c = parseInt(span.getAttribute('data-chapter'), 10);
    var v = parseInt(span.getAttribute('data-verse'), 10);
    var word = span.getAttribute('data-word');
    var prev = document.querySelector('#view-structure .w.active');
    if (prev) { prev.classList.remove('active'); }
    span.classList.add('active');
    while (card.firstChild) { card.removeChild(card.firstChild); }
    var lang = window.SSB.detectLanguage ? window.SSB.detectLanguage(b, c, v) : '';
    if (lang) { card.appendChild(el('p', { 'class': 'help' }, lang)); }
    card.appendChild(el('h3', {}, '“' + word + '”'));
    var names = (window.SSB_DATA && window.SSB_DATA.books) || [];
    var refLabel = (names[b - 1] || ('Book ' + b)) + ' ' + c + ':' + v;
    var res = window.SSB.lookupWord(b, c, v, word);
    if (res.via === 'direct') {
      res.strongs.forEach(function (num) {
        var lex = window.SSB.getLexicon(num);
        if (lex) { card.appendChild(wordEntry(num, lex, refLabel)); }
      });
    } else if (res.via === 'verse-list') {
      card.appendChild(el('p', {}, 'This wording differs from the mapping below, so here are all the underlying words in ' + refLabel + ':'));
      var list = el('ul');
      res.strongs.forEach(function (num) {
        var lex = window.SSB.getLexicon(num);
        var li = el('li');
        li.appendChild(el('span', { 'class': 'strongs-num' }, num + ' '));
        li.appendChild(document.createTextNode(lex ? (lex.transliteration + ' — ' + meaningHead(lex.definition)) : 'definition unavailable'));
        list.appendChild(li);
      });
      card.appendChild(list);
    } else {
      card.appendChild(el('p', {}, 'No word-study data is available for this verse.'));
    }
    var db = window.SSB.db ? window.SSB.db() : null;
    if (db && db.meta && db.meta.caveat) { card.appendChild(el('div', { 'class': 'caveat' }, 'Honest note: ' + db.meta.caveat)); }
    card.hidden = false;
  }

  /* ------------------------------------------------------------------
     Term explanations (Donnie, 2026-10-29): "We need to explain hard
     hearts, and hypocrisy." A point names concepts a teacher must
     understand before he can teach them. The panel below is STUDY
     material: dictionary first (Ehyeh's own Easton), the applied
     topic's prepared explainers for its concepts, and the Helper lane
     (via s20) only where the dictionary is thin — labeled as helper
     words, never as words to preach. An explanation reaches the
     printed sheet ONLY through "Add this to my outline", exactly
     like the Original Languages rule.
     ------------------------------------------------------------------ */
  function explainTopicFor(s) {
    var api = suggestApi();
    if (!api || !s || s.startType !== 'theme') { return null; }
    if (!s.suggestedFor || s.suggestedFor !== s.passageOrTheme) { return null; }
    return api.matchTopic(s.suggestedFor);
  }
  var explainSourceLabels = {
    prepared: 'Prepared for this topic — for your study.',
    dictionary: 'From Easton’s Bible Dictionary (1897) — Ehyeh’s own dictionary.',
    helper: 'Helper explanation — for your study, not words to preach. Check the verses.'
  };
  function showExplainer(pointIdx, data) {
    var card = $('explain-card');
    if (!card) { return; }
    var s = currentOrPending();
    while (card.firstChild) { card.removeChild(card.firstChild); }
    card.appendChild(el('p', { 'class': 'help' }, 'For your study — this explains an idea in point ' + (pointIdx + 1) + '. It prints only if you add it to your outline.'));
    card.appendChild(el('h3', {}, '“' + data.term + '”'));
    card.appendChild(el('p', { 'class': 'help' }, explainSourceLabels[data.source] || ''));
    card.appendChild(el('p', {}, data.text));
    if (data.refs) { card.appendChild(el('p', { 'class': 'help' }, 'Passages: ' + data.refs)); }
    var already = !!(s && (s.movements[pointIdx].explainers || []).some(function (e) { return e.term === data.term; }));
    if (already) {
      card.appendChild(el('p', { 'class': 'help' }, 'Already in your outline — it prints under this point.'));
    } else {
      var addBtn = el('button', { type: 'button', 'class': 'btn secondary' }, 'Add this to my outline');
      addBtn.addEventListener('click', function () { addExplainer(pointIdx, data); });
      card.appendChild(addBtn);
    }
    var closeBtn = el('button', { type: 'button', 'class': 'btn quiet' }, 'Close');
    closeBtn.addEventListener('click', function () { card.hidden = true; });
    card.appendChild(closeBtn);
    card.hidden = false;
    card.scrollIntoView({ block: 'nearest' });
  }
  function openPreparedExplainer(pointIdx, entry) {
    showExplainer(pointIdx, { term: entry.term, text: entry.text, refs: (entry.refs || []).join(', '), source: 'prepared' });
  }
  function openTermExplainer(pointIdx, rawTerm) {
    var s = currentOrPending();
    var term = String(rawTerm || '').trim();
    if (!s || !term) { setStatus('Type a word or idea from the point first — like “covenant”.'); return; }
    /* 1 — the applied topic's prepared explainer for this concept. */
    var exTopic = explainTopicFor(s);
    if (exTopic && exTopic.explain) {
      var hit = null;
      exTopic.explain.forEach(function (e) {
        if (e.point === pointIdx && e.term.toLowerCase().replace(/[“”"]/g, '') === term.toLowerCase().replace(/[“”"]/g, '')) { hit = e; }
      });
      if (hit) { openPreparedExplainer(pointIdx, hit); return; }
    }
    /* 2 — Ehyeh's own dictionary (Easton). */
    var eastonHit = null;
    try {
      if (typeof window.SSB !== 'undefined' && window.SSB.searchEaston) {
        var res = window.SSB.searchEaston(term) || [];
        res.forEach(function (r) { if (!eastonHit && r.term && r.term.toLowerCase() === term.toLowerCase()) { eastonHit = r; } });
        if (!eastonHit && res.length) { eastonHit = res[0]; }
      }
    } catch (e) { eastonHit = null; }
    if (eastonHit) {
      showExplainer(pointIdx, { term: term, text: String(eastonHit.definition || '').slice(0, 700), refs: '', source: 'dictionary' });
      return;
    }
    /* 3 — the dictionary is thin: offer the Helper lane (via s20). */
    var card = $('explain-card');
    if (!card) { return; }
    while (card.firstChild) { card.removeChild(card.firstChild); }
    card.appendChild(el('p', { 'class': 'help' }, 'For your study — this explains an idea in point ' + (pointIdx + 1) + '. It prints only if you add it to your outline.'));
    card.appendChild(el('h3', {}, '“' + term + '”'));
    card.appendChild(el('p', {}, 'Ehyeh’s dictionary doesn’t have this one.'));
    var helperApi = (typeof window !== 'undefined' && window.EHYEH_BUILDER_HELPER) || null;
    if (helperApi && helperApi.askExplain) {
      var askBtn = el('button', { type: 'button', 'class': 'btn secondary' }, 'Ask the helper to explain it');
      askBtn.addEventListener('click', function () {
        askBtn.disabled = true;
        askBtn.textContent = 'Asking…';
        helperApi.askExplain(term, s.movements[pointIdx].primaryRef || '').then(function (out) {
          if (out && out.ok && out.answer) {
            showExplainer(pointIdx, { term: term, text: out.answer, refs: (out.citations || []).join(', '), source: 'helper' });
          } else {
            askBtn.textContent = 'The helper isn’t reachable right now';
          }
        });
      });
      card.appendChild(askBtn);
    } else {
      card.appendChild(el('p', { 'class': 'help' }, 'The helper door isn’t loaded in this copy.'));
    }
    card.hidden = false;
    card.scrollIntoView({ block: 'nearest' });
  }
  function addExplainer(pointIdx, data) {
    var s = currentOrPending();
    if (!s) { return; }
    var list = s.movements[pointIdx].explainers || (s.movements[pointIdx].explainers = []);
    if (list.some(function (e) { return e.term === data.term; })) { setStatus('That explanation is already in your outline.', 'ok'); return; }
    if (list.length >= MAX_EXPLAINERS) { setStatus('This point already has ' + MAX_EXPLAINERS + ' explanations.', 'warn'); return; }
    list.push({ term: clampStr(data.term, 140), text: clampStr(data.text, LIMITS.medium), refs: clampStr(data.refs || '', LIMITS.short), source: data.source || 'prepared' });
    var card = $('explain-card');
    if (card) { card.hidden = true; }
    renderStructure();
    markDirty();
    setStatus('Added to your outline — it prints under point ' + (pointIdx + 1) + '.', 'ok');
  }
  function removeExplainer(pointIdx, xi) {
    var s = currentOrPending();
    if (!s || !s.movements[pointIdx].explainers) { return; }
    s.movements[pointIdx].explainers.splice(xi, 1);
    renderStructure();
    markDirty();
    setStatus('Removed from your outline.', 'ok');
  }
  function ideasList(text) {
    var ul = el('ul', { 'class': 's-conn' });
    String(text).split('\n').forEach(function (line) {
      var t = line.trim();
      if (t) { ul.appendChild(el('li', {}, t)); }
    });
    return ul;
  }
  function multilineP(text, cls) {
    var wrap = el('div', { 'class': cls });
    String(text).split('\n').forEach(function (line) {
      if (line.trim()) { wrap.appendChild(el('p', { 'class': 's-vrow' }, line)); }
    });
    return wrap;
  }

  /* --- Print sheet --- */
  /* Round 8 print state: sheetCompactNow says the sheet on screen
     was rendered in the compact chapter form (see fitSheet);
     sheetLongRefs says the full form carried at least one
     chapter-length text (>= 4 verses in more than one translation),
     which is what makes a sheet a candidate for the compact form. */
  var sheetCompactNow = false;
  var sheetLongRefs = false;
  function renderSheet(compact) {
    var s = currentOrPending();
    var sheet = $('sheet');
    sheetCompactNow = !!compact;
    sheetLongRefs = false;
    sheet.setAttribute('data-compact', sheetCompactNow ? '1' : '0');
    sheet.className = 'sheet ' + $('p-size').value;
    document.documentElement.style.setProperty('--print-base', $('p-type').value + 'px');
    $('page-style').textContent = '@page { size: ' + ($('p-size').value === 'a4' ? 'A4' : 'letter') + '; margin: 0.75in; }';
    var c = $('sheet-content');
    while (c.firstChild) { c.removeChild(c.firstChild); }
    /* Print contract (Donnie 2026-10-29): the sheet carries ONLY the
       sermon — title/theme, main points with their reference bullets,
       the full Scripture text under each point, the Original Languages
       words he added (only when he added some), his own-words spaces
       (only when he wrote in them), and the two idea lists. Working
       fields (central idea, emphasis, transitions, purpose, occasion
       lines, sermon-level reference list, other study connections)
       no longer print; their data stays in the sermon record. */

    /* Verse texts for a reference, from the bundled translations only.
       Fail-safe by design: any lookup problem returns null and the sheet
       prints the reference alone, exactly as before. */
    function versesFor(ref) {
      try {
        if (!ref || !String(ref).trim()) { return null; }
        if (typeof window.SSB === 'undefined' || !window.SSB.parseReference) { return null; }
        var p = window.SSB.parseReference(String(ref));
        if (!p || p.chapter == null) { return null; }
        function chapterOf(bible, bookName) {
          if (!bible) { return null; }
          var b = bible[String(p.book)] || (bookName ? bible[bookName] : null);
          if (!b) { return null; }
          return b[String(p.chapter)] || null;
        }
        function grab(bible) {
          var names = (window.SSB_DATA && window.SSB_DATA.books) || [];
          var ch = chapterOf(bible, names[p.book - 1]);
          if (!ch) { return null; }
          var nums = Object.keys(ch).map(function (k) { return parseInt(k, 10); })
            .filter(function (n) { return !isNaN(n); })
            .sort(function (a, b) { return a - b; });
          if (p.verse) {
            var endV = refEndVerse(ref);
            nums = nums.filter(function (n) { return n >= p.verse && (endV != null ? n <= endV : n === p.verse); });
            nums = nums.slice(0, 40);
          } else {
            nums = nums.slice(0, 12);
          }
          if (!nums.length) { return null; }
          /* Round 8: rows also carry their verse count, so the
             print fit (below) can tell a chapter-length text from
             a verse text and, only when a chapter sheet cannot fit
             at a readable size, collapse the non-primary
             translations of chapter-length texts to a one-line
             pointer. */
          return {
            x: nums.map(function (n) { return n + ' ' + ch[String(n)]; }).join(' '),
            n: nums.length,
            x1: nums[0] + ' ' + ch[String(nums[0])]
          };
        }
        var hd = window.HAGAH_DATA || {};
        function fileBible(name) {
          var f = hd['translations/' + name];
          return f && f.bible ? f.bible : null;
        }
        var out = [];
        var g = window.SSB_DATA ? grab(window.SSB_DATA.bible) : null;
        if (g) { out.push({ t: 'Geneva 1599', x: g.x, n: g.n, x1: g.x1 }); }
        var k = grab(fileBible('kjv.json'));
        if (k) { out.push({ t: 'King James', x: k.x, n: k.n, x1: k.x1 }); }
        var w = grab(fileBible('web.json'));
        if (w) { out.push({ t: 'Easy Read (WEB)', x: w.x, n: w.n, x1: w.x1 }); }
        return out.length ? out : null;
      } catch (e) { return null; }
    }

    c.appendChild(el('h1', {}, s.title || 'Untitled sermon'));
    if (s.passageOrTheme) { c.appendChild(el('div', { 'class': 's-passage' }, s.passageOrTheme)); }
    var ol = el('ol');
    for (var i = 0; i < s.movementCount; i++) {
      var m = s.movements[i];
      var li = el('li');
      li.appendChild(el('div', { 'class': 's-sub' }, m.title || ''));
      var pointRefs = [];
      splitRefs(m.primaryRef).forEach(function (r) { pointRefs.push(r); });
      splitRefs(m.supportingRefs).forEach(function (r) { pointRefs.push(r); });
      if (pointRefs.length) {
        var bul = el('ul', { 'class': 's-conn' });
        pointRefs.forEach(function (r) { bul.appendChild(el('li', { 'class': 's-refs' }, r)); });
        li.appendChild(bul);
      }
      pointRefs.forEach(function (r) {
        var vt = versesFor(r);
        if (vt) {
          if (vt.length > 1 && vt.some(function (row) { return row.n >= 4; })) { sheetLongRefs = true; }
          var vb = el('div', { 'class': 's-verses' });
          vt.forEach(function (row, ri) {
            /* Compact chapter form (round 8, engaged by fitSheet
               only when a chapter sheet cannot fit at a readable
               size): the primary translation (Geneva 1599, the
               first row) always prints in full; the other
               translations share ONE pointer line per reference —
               their full text stays one tap away in the reader.
               This is the brief's own example shape (primary full
               text + others collapsed). Softer forms were measured
               on the worst-case sheet and left it over the page or
               without slack: a first-verse excerpt of the long
               texts, 26px over at the true floor; one pointer per
               translation, 1px of slack at the floor. A
               verse-build sheet never enters this form (see
               sheetLongRefs), so it loses nothing it fits with
               today. */
            if (sheetCompactNow && ri > 0) {
              if (ri === 1) {
                var others = vt.slice(1).map(function (r2) { return r2.t; }).join(', ');
                var pline = el('p', { 'class': 's-vrow' });
                pline.appendChild(el('span', { 'class': 's-vt' }, r + ' · ' + others + ': '));
                pline.appendChild(document.createTextNode('(full text in the reader)'));
                vb.appendChild(pline);
              }
              return;
            }
            var line = el('p', { 'class': 's-vrow' });
            line.appendChild(el('span', { 'class': 's-vt' }, r + ' · ' + row.t + ': '));
            line.appendChild(document.createTextNode(row.x));
            vb.appendChild(line);
          });
          li.appendChild(vb);
        }
      });
      if (m.notes && m.notes.trim()) {
        li.appendChild(el('p', { 'class': 's-sub' }, 'Your own words for this point'));
        li.appendChild(el('p', {}, m.notes));
      }
      /* Term explanations print under their point — ONLY the ones he
         added (Donnie, 2026-10-29). Un-added explanations are study
         material and never reach the paper. */
      (m.explainers || []).forEach(function (ex) {
        li.appendChild(el('p', { 'class': 's-sub' }, '“' + ex.term + '” — what it means'));
        li.appendChild(el('p', {}, ex.text));
      });
      ol.appendChild(li);
    }
    c.appendChild(ol);
    var included = connectionsOf(s).filter(function (cn) { return cn.includeInPulpitSheet === true; });
    function connList(list) {
      var ul = el('ul', { 'class': 's-conn' });
      list.forEach(function (cn) {
        var li = el('li');
        li.appendChild(el('div', { 'class': 's-refs' }, cn.sourceCategory + ' · ' + (cn.reference.trim() || '—') + ' · ' + cn.connectionType));
        if (cn.note.trim()) { li.appendChild(el('p', { 'class': 's-sub' }, cn.note)); }
        ul.appendChild(li);
      });
      return ul;
    }
    var lang = included.filter(function (cn) { return cn.sourceCategory === 'Original language (Hebrew / Greek)'; });
    if (lang.length) {
      c.appendChild(el('div', { 'class': 's-label' }, 'The Original Languages'));
      c.appendChild(connList(lang));
    }
    if (s.realLifeIdeas && s.realLifeIdeas.trim()) { c.appendChild(el('div', { 'class': 's-label' }, 'Explain it in real life — ideas')); c.appendChild(ideasList(s.realLifeIdeas)); }
    if (s.todayIdeas && s.todayIdeas.trim()) { c.appendChild(el('div', { 'class': 's-label' }, 'Relates to today — ideas')); c.appendChild(ideasList(s.todayIdeas)); }
    if (s.turn.trim()) { c.appendChild(el('div', { 'class': 's-label' }, 'Your own words for the whole sermon')); c.appendChild(el('p', {}, s.turn)); }
    var foot = el('div', { 'class': 's-foot' }, 'Prepared with Ehyeh • Crews 4 Christ');
    foot.hidden = !$('p-footer').checked;
    c.appendChild(foot);
    fitSheet();
    /* Round 8: webfont arrival can change the sheet's true height
       after the first measure. When the fonts settle, fit once
       more against the sheet as it actually renders. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { if (state.view === 'print') { fitSheet(); } });
    }
  }
  /* One-page fit (round 5): the sheet's own heading promises one
     page, yet a standard outline at the default size ran past it
     and the warning told the preacher to pick "the smaller type
     size" when none smaller existed. Now the chosen size is the
     ceiling: the type steps down 1px at a time until the sheet
     fits its page box, and the warning survives only when even
     the floor cannot hold the sermon.
     Round 7: the floor drops from 15px to 11px. A whole-chapter
     sheet (Genesis 12: three points carrying twelve verses in
     three translations each) measured 1413px against the 1054px
     page box at the 15px floor — it fits at 12px and not at 13px
     (rig probe, 2026-11-03) — so the SHIPPED DEFAULT ran the
     warning on the app's most standard sheet (re-tests 5 and 6).
     The floor keeps a step of headroom under that measure; the
     warning still fires for a sermon that cannot fit even at
     11px, as it should.
     Round 8: 11px tuned to one probe was still marginal — the
     acceptance profile's Genesis 12 sheet (three translations x
     twelve verses + contexts + bullet refs + footer) is taller
     than the rig's and bottomed out (re-test 7, R2). The fit now
     converges on the ACTUAL rendered sheet, in three stages, each
     re-measuring the live sheet: (1) step down from the chosen
     size to the readable floor, 11px; (2) if a CHAPTER sheet
     (chapter-length texts in more than one translation) still
     cannot fit at a readable size, re-render it in the compact
     chapter form — primary translation in full, the others
     collapsed to a one-line pointer — and fit that; (3) only then
     keep stepping to the true floor, 9px. The warning survives
     for a sheet that cannot fit even so (the overstuffed-notes
     proof still trips it), and verse-build sheets never enter
     stage 2, so they lose nothing they fit with today. */
  function fitSheet() {
    var sheet = $('sheet');
    if (!sheet) { return; }
    var size = parseInt($('p-type').value, 10) || 20;
    var fit = size;
    while (fit > 11) {
      document.documentElement.style.setProperty('--print-base', fit + 'px');
      if (sheet.scrollHeight <= sheet.clientHeight + 1) { break; }
      fit--;
    }
    document.documentElement.style.setProperty('--print-base', fit + 'px');
    if (sheet.scrollHeight > sheet.clientHeight + 1 && sheetLongRefs && !sheetCompactNow) {
      /* Compact re-render fits itself (renderSheet ends in
         fitSheet); do not measure the stale full-form sheet. */
      renderSheet(true);
      return;
    }
    if (sheet.scrollHeight > sheet.clientHeight + 1) {
      while (fit > 9) {
        fit--;
        document.documentElement.style.setProperty('--print-base', fit + 'px');
        if (sheet.scrollHeight <= sheet.clientHeight + 1) { break; }
      }
    }
    checkOverflow();
  }
  function checkOverflow() {
    var sheet = $('sheet');
    var over = sheet.scrollHeight > sheet.clientHeight + 1;
    $('overflow-warn').className = 'overflow-warn' + (over ? ' show' : '');
  }

  /* ------------------------------------------------------------------
     Export / import
     ------------------------------------------------------------------ */
  function downloadJson(obj, filename) {
    var text = JSON.stringify(obj, null, 2);
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function safeFilename(s) {
    var base = (s || 'sermon').replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
    return base || 'sermon';
  }
  function exportOne(s) { downloadJson({ format: EXPORT_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: nowIso(), sermons: [s] }, safeFilename(s.title) + '.sermon.json'); }
  function exportAll() { downloadJson({ format: EXPORT_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: nowIso(), sermons: state.sermons }, 'sermon-skeleton-backup.json'); }

  function importText(text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, error: 'This file is not valid JSON, so nothing was imported.' }; }
    if (!isPlainObject(parsed)) { return { ok: false, error: 'This file is not a Sermon Builder export.' }; }
    if (parsed.format !== EXPORT_FORMAT) { return { ok: false, error: 'This file is not a Sermon Builder export.' }; }
    if (parsed.schemaVersion !== SCHEMA_VERSION) { return { ok: false, error: 'This file uses schemaVersion ' + String(parsed.schemaVersion) + ', which this version cannot read.' }; }
    if (!Array.isArray(parsed.sermons)) { return { ok: false, error: 'This file has no sermons list.' }; }
    if (parsed.sermons.length === 0) { return { ok: false, error: 'This file contains no sermons.' }; }
    if (parsed.sermons.length > 500) { return { ok: false, error: 'This file contains more than 500 sermons and was not imported.' }; }
    var valid = [];
    for (var i = 0; i < parsed.sermons.length; i++) {
      var r = validateSermon(parsed.sermons[i], 'Sermon ' + (i + 1));
      if (!r.ok) { return { ok: false, error: r.error + ' Nothing was imported.' }; }
      valid.push(r.sermon);
    }
    /* All valid. Merge without overwriting: colliding ids get a new id. */
    var added = 0, renumbered = 0;
    valid.forEach(function (s) {
      if (findById(s.id)) { s.id = newId(); renumbered++; }
      state.sermons.push(s);
      added++;
    });
    var saved = persist();
    return { ok: true, message: 'Imported ' + added + (added === 1 ? ' sermon.' : ' sermons.') + (renumbered ? ' ' + renumbered + (renumbered === 1 ? ' had an id already in use and was given a new one.' : ' had ids already in use and were given new ones.') : '') + (saved ? '' : ' It could not be written to browser storage; export a backup now.') };
  }

  /* ------------------------------------------------------------------
     Dialog
     ------------------------------------------------------------------ */
  var dlg = $('dlg'), dlgResolve = null;
  function ask(opts) {
    $('dlg-title').textContent = opts.title || '';
    $('dlg-msg').textContent = opts.message || '';
    $('dlg-ok').textContent = opts.okLabel || 'OK';
    $('dlg-ok').className = 'btn' + (opts.danger ? ' danger' : '');
    $('dlg-cancel').hidden = opts.noCancel === true;
    var f = $('dlg-field');
    if (opts.input !== undefined) { f.hidden = false; $('dlg-label').textContent = opts.inputLabel || ''; $('dlg-input').value = opts.input; } else { f.hidden = true; }
    return new Promise(function (resolve) {
      dlgResolve = resolve;
      if (typeof dlg.showModal === 'function') { dlg.showModal(); } else { dlg.setAttribute('open', ''); }
      (opts.input !== undefined ? $('dlg-input') : $('dlg-ok')).focus();
    });
  }
  function closeDlg(result) {
    if (dlg.open) { dlg.close(); } else { dlg.removeAttribute('open'); }
    if (dlgResolve) { var r = dlgResolve; dlgResolve = null; r(result); }
  }
  $('dlg-ok').addEventListener('click', function () { closeDlg($('dlg-field').hidden ? true : $('dlg-input').value); });
  $('dlg-cancel').addEventListener('click', function () { closeDlg(null); });
  dlg.addEventListener('cancel', function (e) { e.preventDefault(); closeDlg(null); });
  $('dlg-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); closeDlg($('dlg-input').value); } });

  /* ------------------------------------------------------------------
     Wiring
     ------------------------------------------------------------------ */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-nav],[data-start],[data-action],[data-lib],[data-sc]');
    if (!t) { return; }
    if (t.hasAttribute('data-sc')) { connectionAction(t.getAttribute('data-sc'), t.getAttribute('data-scid')); return; }
    if (t.hasAttribute('data-nav')) { show(t.getAttribute('data-nav')); return; }
    if (t.hasAttribute('data-start')) {
      pending = newSermon(t.getAttribute('data-start'));
      state.currentId = null;
      state.dirty = false;
      setStatus('New sermon. Nothing is saved until you type or press Save.');
      show('setup');
      return;
    }
    if (t.hasAttribute('data-action')) {
      var a = t.getAttribute('data-action');
      if (a === 'save') { save(false); }
      if (a === 'export-all') { if (state.sermons.length) { exportAll(); setStatus('Exported all sermons.', 'ok'); } else { setStatus('There are no saved sermons to export.'); } }
      if (a === 'print') { renderSheet(); window.print(); }
      return;
    }
    if (t.hasAttribute('data-lib')) { libAction(t.getAttribute('data-lib'), t.getAttribute('data-id')); }
  });

  function libAction(action, id) {
    var s = findById(id);
    if (!s) { return; }
    if (action === 'open') { pending = null; state.currentId = s.id; show('structure'); setStatus('Opened ' + (s.title || 'Untitled sermon') + '.'); }
    if (action === 'duplicate') {
      var copy = validateSermon(JSON.parse(JSON.stringify(s)), 'Copy').sermon;
      copy.id = newId(); copy.createdAt = nowIso(); copy.updatedAt = copy.createdAt;
      copy.studyConnections.forEach(function (cn) { cn.id = newId(); });
      copy.title = (s.title || 'Untitled sermon') + ' (copy)';
      copy.status = 'Draft';
      state.sermons.push(copy); persist(); renderLibrary(); setStatus('Duplicated.', 'ok');
    }
    if (action === 'rename') {
      ask({ title: 'Rename sermon', input: s.title, inputLabel: 'Sermon title', okLabel: 'Rename' }).then(function (v) {
        if (v === null) { return; }
        s.title = clampStr(v, LIMITS.short); s.updatedAt = nowIso(); persist(); renderLibrary(); setStatus('Renamed.', 'ok');
      });
    }
    if (action === 'export') { exportOne(s); setStatus('Exported.', 'ok'); }
    if (action === 'delete') {
      ask({ title: 'Delete this sermon?', message: 'This removes “' + (s.title || 'Untitled sermon') + '” from this browser. You can undo it right after deleting.', okLabel: 'Delete', danger: true }).then(function (v) {
        if (v !== true) { return; }
        var delIdx = -1;
        for (var di = 0; di < state.sermons.length; di++) { if (state.sermons[di].id === s.id) { delIdx = di; break; } }
        var removed = delIdx >= 0 ? state.sermons[delIdx] : null;
        state.sermons = state.sermons.filter(function (x) { return x.id !== s.id; });
        if (state.currentId === s.id) { state.currentId = null; }
        persist(); renderLibrary(); setStatus('Deleted.', 'ok');
        /* Ease-of-use rule 14 (2026-10-29): undo first — one tap in the
           status line brings the sermon back where it was, no harm
           done. The button lives until the next status message. */
        if (removed) {
          var stEl = $('status');
          if (stEl) {
            var undoBtn = el('button', { type: 'button', 'class': 'btn secondary' }, 'Undo delete');
            undoBtn.addEventListener('click', function () {
              state.sermons.splice(Math.min(delIdx, state.sermons.length), 0, removed);
              persist(); renderLibrary();
              setStatus('Restored “' + (removed.title || 'Untitled sermon') + '”.', 'ok');
            });
            stEl.appendChild(document.createTextNode(' '));
            stEl.appendChild(undoBtn);
          }
        }
      });
    }
  }

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('#lib-list select[data-lib="status"]')) {
      var s = findById(t.getAttribute('data-id'));
      if (s && STATUSES.indexOf(t.value) >= 0) { s.status = t.value; s.updatedAt = nowIso(); persist(); renderLibrary(); setStatus('Status updated.', 'ok'); }
      return;
    }
    if (t.matches('#view-setup [data-field]')) {
      readSetupField(t);
      markDirty();
      return;
    }
    if (t.matches('#sc-list [data-sckey]')) { readConnectionField(t); markDirty(); return; }
    if (t.matches('#view-structure textarea[data-mkey]')) { var curP = currentOrPending(); if (curP) { renderVersePreviews(curP); } return; }
    if (t.matches('#check-list input[data-check]')) {
      var cur = currentOrPending();
      if (cur) { cur.faithfulness[parseInt(t.getAttribute('data-check'), 10)] = t.checked; markDirty(); }
      return;
    }
    if (t.id === 'p-size' || t.id === 'p-type' || t.id === 'p-footer') { renderSheet(); return; }
    if (t.id === 'import-file') { handleImportFile(t); }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.matches('#view-setup [data-field]') && t.type !== 'radio') { readSetupField(t); markDirty(); return; }
    if (t.matches('#sc-list [data-sckey]')) { readConnectionField(t); markDirty(); return; }
    if (t.matches('#view-structure textarea')) { readStructureField(t); markDirty(); return; }
    if (t.id === 'lib-search') { renderLibrary(); }
  });
  $('setup-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!setupValid()) { return; }
    var s = currentOrPending();
    /* Rebuild rule (round 5): the setup text changed under an
       outline an earlier build applied (the 2026-11-03 sweep built
       John 3:16 over a Genesis 12 sermon and the Genesis titles and
       references stayed, because every apply fills only blank
       boxes). Clear exactly the old build's recorded values first,
       so the new passage or topic fills fresh boxes. Same-passage
       rebuilds skip this and behave exactly as before. */
    if (s && (s.versesAppliedFor || s.suggestedFor || s.engineFor || s.helperFor)) {
      var appliedFor = s.versesAppliedFor || s.suggestedFor || s.engineFor || s.helperFor;
      if (appliedFor !== s.passageOrTheme) {
        clearAppliedValues(s);
        versesAttemptFor = '';
      }
    }
    if (s && s.startType === 'theme') {
      ensureSuggestData();
      ensureEngineData();
      var topic = matchFor(s);
      if (topic && s.suggestedFor !== s.passageOrTheme) { applySuggestions(s, topic); }
      else if (!topic && s.engineFor !== s.passageOrTheme) { tryEngine(s); }
    }
    if (s && s.startType === 'passage') {
      ensureSuggestData();
      if (suggestApi() && s.versesAppliedFor !== s.passageOrTheme) { applyVerses(s); }
    }
    save(false);
    show('structure');
    /* Usability fix (2026-11-04): show() scrolls to the top, which left
       the finished outline below the fold at 720p and the build looked
       like it did nothing. Bring the Structure heading into view and
       focus it so the preacher (and screen readers) land on the outline. */
    var hs = $('h-structure');
    if (hs) {
      if (hs.scrollIntoView) { hs.scrollIntoView({ block: 'start' }); }
      try { hs.focus({ preventScroll: true }); } catch (err) { hs.focus(); }
    }
  });
  function handleImportFile(input) {
    var file = input.files && input.files[0];
    input.value = '';
    if (!file) { return; }
    if (file.size > 20 * 1024 * 1024) { ask({ title: 'Import failed', message: 'This file is larger than 20 MB and was not imported.', noCancel: true }); return; }
    var reader = new FileReader();
    reader.onerror = function () { ask({ title: 'Import failed', message: 'The file could not be read. Nothing was changed.', noCancel: true }); };
    reader.onload = function () {
      var r = importText(String(reader.result));
      ask({ title: r.ok ? 'Import complete' : 'Import failed', message: r.ok ? r.message : r.error, noCancel: true }).then(function () { renderLibrary(); });
      if (r.ok) { setStatus(r.message, 'ok'); }
    };
    reader.readAsText(file);
  }
  window.addEventListener('beforeprint', function () { if (state.view !== 'print' && currentOrPending()) { show('print'); } });
  window.addEventListener('resize', function () { if (state.view === 'print') { checkOverflow(); } });
  window.addEventListener('beforeunload', function () { if (state.dirty) { save(true); } });

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  detectStorage();
  loadAll();
  /* A page restored from the browser's back/forward cache revives
     the exact in-memory build it was frozen with. After a fix
     ships, that memory can be the OLD build, whose missing pieces
     fail silently — the 2026-11-02 acceptance re-test read exactly
     like the pre-fix app (no context phase at all) while the served
     bytes were already the fixed build. Sermons live in local
     storage, so a reload loses nothing and always runs the build
     the server actually serves. (G4 fix round 3.) */
  window.addEventListener('pageshow', function (e) { if (e && e.persisted) { window.location.reload(); } });
  if (!storage.available) { setStatus('Browser storage is unavailable in this window. You can still work and export, but nothing will be kept after you close it.', 'warn'); }
  /* Round 7: a boot that follows a reload IN THE SAME TAB SESSION
     (sessionStorage survives reloads, not new tabs) returns to the
     restored sermon's Structure — the outline the preacher was
     looking at — instead of Home. A genuinely new visit still
     starts at the start door, with the sermon one tap away and
     already current. */
  var bootView = 'start';
  try {
    if (window.sessionStorage.getItem('ehyeh.sessionAlive') && current()) { bootView = 'structure'; }
    window.sessionStorage.setItem('ehyeh.sessionAlive', '1');
  } catch (e) { bootView = 'start'; }
  /* Round 8: the shell bridge is published BEFORE the boot render,
     and the boot render can no longer abort this module. Round 7's
     same-session boot lands on Structure, whose render runs while
     the later modules have not executed yet; a throw there escaped
     this top level, the bridge assignment that used to sit below
     the render never ran, and the shell's sermon module — which
     snapshots the bridge at its own boot — answered "The sermon
     planner could not start." for the whole life of that tab while
     a new tab on the same data booted fine (re-test 7, R1). A
     failed first start now falls back to the start door and
     retries the intended view once the page has finished loading,
     when every module and data file is resident. */
  window.__hagahLegacyShow = show; // Hagah shell bridge (ws1)
  try {
    show(bootView);
  } catch (e) {
    try { show('start'); } catch (e2) { /* the bridge still answers the shell */ }
    var retryBootView = function () { try { show(bootView); } catch (e3) { /* leave the start door standing */ } };
    if (document.readyState === 'complete') { setTimeout(retryBootView, 600); }
    else { window.addEventListener('load', function () { setTimeout(retryBootView, 60); }); }
  }
  /* Bridge for js/s20-builder-helper.js (the Helper tier + "Bring it
     into today" doors): s20 owns the network calls and its injected
     cards; everything that writes the sermon model goes through here,
     so the model stays single-owned by this module. */
  window.__ehyehBuilder = {
    topicState: function () {
      var s = currentOrPending();
      if (!s) { return null; }
      return {
        startType: s.startType, passageOrTheme: s.passageOrTheme, movementCount: s.movementCount,
        suggestTier: s.suggestTier, suggestedFor: s.suggestedFor, engineFor: s.engineFor, helperFor: s.helperFor
      };
    },
    pointRef: function (i) { var s = currentOrPending(); return (s && s.movements[i]) ? s.movements[i].primaryRef : ''; },
    pointTitle: function (i) { var s = currentOrPending(); return (s && s.movements[i]) ? s.movements[i].title : ''; },
    applyHelperPoints: function (points) {
      var s = currentOrPending();
      if (!s || s.startType !== 'theme') { return false; }
      if (!applyHelper(s, points)) { return false; }
      save(false);
      renderStructure();
      return true;
    },
    appendTodayIdea: function (line) {
      var s = currentOrPending();
      if (!s || !line) { return false; }
      var cur = s.todayIdeas || '';
      if (cur.indexOf(line) !== -1) { return false; }
      s.todayIdeas = cur.trim() ? cur.replace(/\s+$/, '') + '\n' + line : line;
      save(false);
      renderStructure();
      return true;
    }
  };
})();

