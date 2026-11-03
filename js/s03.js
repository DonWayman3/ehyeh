

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
    'Do the movements follow the passage’s flow or the chosen thematic arc?',
    'Are supporting references truly supportive?',
    'Have I supplied my own pastoral application, illustrations, and voice?',
    'Does the landing return people to the central text or truth?',
    'Have I prayed and studied before preaching?'
  ];
  var MOVEMENT_FIELDS = [
    { key: 'title', label: 'Movement title / point', cls: '' },
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
    return { title: '', primaryRef: '', supportingRefs: '', emphasis: '', transition: '', notes: '' };
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
    if (COUNTS.indexOf(raw.movementCount) < 0) { return { ok: false, error: label + ' has an invalid movement count (expected 3 or 5).' }; }
    if (STATUSES.indexOf(raw.status) < 0) { return { ok: false, error: label + ' has an invalid status.' }; }
    if (!Array.isArray(raw.movements) || raw.movements.length < 3 || raw.movements.length > MAX_MOVEMENTS) { return { ok: false, error: label + ' is missing its movements list.' }; }
    if (!Array.isArray(raw.faithfulness) || raw.faithfulness.length !== CHECK_COUNT) { return { ok: false, error: label + ' has an invalid faithfulness-check state.' }; }
    if (typeof raw.createdAt !== 'string' || typeof raw.updatedAt !== 'string') { return { ok: false, error: label + ' is missing its timestamps.' }; }
    if (raw.preachedDate !== '' && raw.preachedDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(raw.preachedDate))) { return { ok: false, error: label + ' has an invalid preached date.' }; }
    var movements = [];
    for (var i = 0; i < MAX_MOVEMENTS; i++) {
      var rm = raw.movements[i];
      var m = blankMovement();
      if (rm !== undefined) {
        if (!isPlainObject(rm)) { return { ok: false, error: label + ' movement ' + (i + 1) + ' is not a valid record.' }; }
        m.title = clampStr(rm.title, LIMITS.short);
        m.primaryRef = clampStr(rm.primaryRef, LIMITS.short);
        m.supportingRefs = clampStr(rm.supportingRefs, LIMITS.medium);
        m.emphasis = clampStr(rm.emphasis, LIMITS.medium);
        m.transition = clampStr(rm.transition, LIMITS.medium);
        m.notes = clampStr(rm.notes, LIMITS.long);
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
  }
  function persist() {
    if (!storage.available) {
      setStatus('Browser storage is unavailable. Your work is held in this tab only — export it before closing.', 'warn');
      return false;
    }
    var payload = JSON.stringify({ schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), sermons: state.sermons });
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
  function renderSetup() {
    var s = currentOrPending();
    $('f-title').value = s.title;
    $('f-passage').value = s.passageOrTheme;
    var lbl = $('l-passage'), help = $('h-passage');
    if (s.startType === 'passage') { lbl.textContent = 'Main passage'; help.textContent = 'Required.'; }
    else if (s.startType === 'theme') { lbl.textContent = 'Theme or topic'; help.textContent = 'Required.'; }
    else { lbl.textContent = 'Main passage or theme'; help.textContent = 'Optional when starting blank.'; }
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

  /* --- Structure --- */
  function renderStructure() {
    var s = currentOrPending();
    $('s-passage-label').textContent = s.startType === 'theme' ? 'Theme' : s.startType === 'passage' ? 'Main passage' : 'Main passage or theme';
    $('s-passage').textContent = s.passageOrTheme || (s.startType === 'blank' ? '—' : '');
    $('f-central').value = s.centralIdea;
    $('f-turn').value = s.turn;
    $('f-landing').value = s.landing;
    var box = $('movements');
    while (box.firstChild) { box.removeChild(box.firstChild); }
    for (var i = 0; i < s.movementCount; i++) {
      var card = el('div', { 'class': 'card movement' });
      var heading = el('h3', {});
      heading.appendChild(el('span', { 'class': 'num' }, 'Movement ' + (i + 1)));
      card.appendChild(heading);
      MOVEMENT_FIELDS.forEach(function (mf) {
        var id = 'm' + i + '-' + mf.key;
        var field = el('div', { 'class': 'field' });
        field.appendChild(el('label', { 'for': id }, mf.label));
        var ta = el('textarea', { id: id, 'data-movement': String(i), 'data-mkey': mf.key, 'class': mf.cls });
        ta.value = s.movements[i][mf.key];
        field.appendChild(ta);
        card.appendChild(field);
      });
      box.appendChild(card);
    }
    renderConnections();
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
  function renderConnections() {
    var s = currentOrPending();
    var list = connectionsOf(s);
    var box = $('sc-list');
    while (box.firstChild) { box.removeChild(box.firstChild); }
    $('sc-empty').hidden = list.length > 0;
    list.forEach(function (cn, i) {
      var idp = 'sc-' + i;
      var card = el('div', { 'class': 'sc-card', 'data-sccard': cn.id });
      var head = el('div', { 'class': 'sc-head' });
      head.appendChild(el('span', { 'class': 'num' }, 'Study connection ' + (i + 1)));
      var rm = el('button', { type: 'button', 'class': 'btn quiet danger', 'data-sc': 'remove', 'data-scid': cn.id }, 'Remove');
      rm.setAttribute('aria-label', 'Remove study connection ' + (i + 1));
      head.appendChild(rm);
      card.appendChild(head);

      var grid = el('div', { 'class': 'sc-grid' });
      var f1 = el('div', { 'class': 'field' });
      f1.appendChild(el('label', { 'for': idp + '-cat' }, 'Source category'));
      f1.appendChild(makeSelect(idp + '-cat', cn.id, 'sourceCategory', SC_CATEGORIES, cn.sourceCategory));
      grid.appendChild(f1);
      var f2 = el('div', { 'class': 'field' });
      f2.appendChild(el('label', { 'for': idp + '-type' }, 'Connection type'));
      f2.appendChild(makeSelect(idp + '-type', cn.id, 'connectionType', SC_TYPES, cn.connectionType));
      grid.appendChild(f2);
      card.appendChild(grid);

      var f3 = el('div', { 'class': 'field' });
      f3.appendChild(el('label', { 'for': idp + '-ref' }, 'Reference'));
      f3.appendChild(el('p', { 'class': 'help', id: idp + '-ref-help' }, 'Cite it the way you would in your own notes: book, chapter, and verse, or document and section.'));
      var ref = el('input', { type: 'text', id: idp + '-ref', 'data-scid': cn.id, 'data-sckey': 'reference', autocomplete: 'off', 'aria-describedby': idp + '-ref-help' });
      ref.value = cn.reference;
      f3.appendChild(ref);
      card.appendChild(f3);

      var f4 = el('div', { 'class': 'field' });
      f4.appendChild(el('label', { 'for': idp + '-note' }, 'Why am I noting this?'));
      var note = el('textarea', { id: idp + '-note', 'data-scid': cn.id, 'data-sckey': 'note' });
      note.value = cn.note;
      f4.appendChild(note);
      card.appendChild(f4);

      var f5 = el('div', { 'class': 'field' });
      var lab = el('label', { 'class': 'sc-include', 'for': idp + '-inc' });
      var cb = el('input', { type: 'checkbox', id: idp + '-inc', 'data-scid': cn.id, 'data-sckey': 'includeInPulpitSheet' });
      cb.checked = cn.includeInPulpitSheet === true;
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(' Include in pulpit sheet'));
      f5.appendChild(lab);
      card.appendChild(f5);

      box.appendChild(card);
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
      ask({ title: 'Remove this study connection?', message: 'This removes “' + name + '” from this sermon. It cannot be undone unless you have an export.', okLabel: 'Remove', danger: true }).then(function (v) {
        if (v !== true) { return; }
        s.studyConnections = list.filter(function (x) { return x.id !== target.id; });
        renderConnections();
        markDirty();
        setStatus('Study connection removed.', 'ok');
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
    if (f === 'centralIdea' || f === 'turn' || f === 'landing') { s[f] = clampStr(input.value, LIMITS.medium); }
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

  /* --- Print sheet --- */
  function renderSheet() {
    var s = currentOrPending();
    var sheet = $('sheet');
    sheet.className = 'sheet ' + $('p-size').value;
    document.documentElement.style.setProperty('--print-base', $('p-type').value + 'px');
    $('page-style').textContent = '@page { size: ' + ($('p-size').value === 'a4' ? 'A4' : 'letter') + '; margin: 0.75in; }';
    var c = $('sheet-content');
    while (c.firstChild) { c.removeChild(c.firstChild); }

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
          if (p.verse) { nums = nums.filter(function (n) { return n >= p.verse; }); }
          nums = nums.slice(0, 12);
          if (!nums.length) { return null; }
          return nums.map(function (n) { return n + ' ' + ch[String(n)]; }).join(' ');
        }
        var hd = window.HAGAH_DATA || {};
        function fileBible(name) {
          var f = hd['translations/' + name];
          return f && f.bible ? f.bible : null;
        }
        var out = [];
        var g = window.SSB_DATA ? grab(window.SSB_DATA.bible) : null;
        if (g) { out.push({ t: 'Geneva 1599', x: g }); }
        var k = grab(fileBible('kjv.json'));
        if (k) { out.push({ t: 'King James', x: k }); }
        var w = grab(fileBible('web.json'));
        if (w) { out.push({ t: 'Easy Read (WEB)', x: w }); }
        return out.length ? out : null;
      } catch (e) { return null; }
    }

    c.appendChild(el('h1', {}, s.title || 'Untitled sermon'));
    if (s.passageOrTheme) { c.appendChild(el('div', { 'class': 's-passage' }, s.passageOrTheme)); }
    var metaBits = [];
    if (s.occasion) { metaBits.push(s.occasion); }
    if (s.preachedDate) { metaBits.push(s.preachedDate); }
    if (s.series) { metaBits.push(s.series); }
    if (metaBits.length) { c.appendChild(el('div', { 'class': 's-meta' }, metaBits.join(' · '))); }
    if (s.purpose && s.purpose.trim()) {
      c.appendChild(el('div', { 'class': 's-label' }, 'Opening'));
      c.appendChild(el('p', {}, s.purpose));
    }
    if (s.centralIdea.trim()) {
      c.appendChild(el('div', { 'class': 's-label' }, 'Central idea'));
      c.appendChild(el('p', { 'class': 's-central' }, s.centralIdea));
    }
    var ol = el('ol');
    for (var i = 0; i < s.movementCount; i++) {
      var m = s.movements[i];
      var li = el('li');
      li.appendChild(el('div', { 'class': 's-sub' }, m.title || ''));
      var refs = [m.primaryRef, m.supportingRefs].filter(function (r) { return r && r.trim(); }).join(' · ');
      if (refs) { li.appendChild(el('div', { 'class': 's-refs' }, refs)); }
      if (m.emphasis.trim()) { li.appendChild(el('p', { 'class': 's-sub' }, m.emphasis)); }
      if (m.transition.trim()) { li.appendChild(el('p', { 'class': 's-trans' }, m.transition)); }
      if (m.notes && m.notes.trim()) { li.appendChild(el('p', { 'class': 's-mnote' }, m.notes)); }
      var vt = versesFor(m.primaryRef);
      if (vt) {
        var vb = el('div', { 'class': 's-verses' });
        vt.forEach(function (row) {
          var line = el('p', { 'class': 's-vrow' });
          line.appendChild(el('span', { 'class': 's-vt' }, row.t + ': '));
          line.appendChild(document.createTextNode(row.x));
          vb.appendChild(line);
        });
        li.appendChild(vb);
      }
      ol.appendChild(li);
    }
    c.appendChild(el('div', { 'class': 's-label' }, 'Study'));
    c.appendChild(ol);
    if (s.supportingRefs.trim()) {
      c.appendChild(el('div', { 'class': 's-label' }, 'References'));
      c.appendChild(el('p', { 'class': 's-refs' }, s.supportingRefs));
    }
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
    var witnessCats = ['1 Enoch', 'Dead Sea Scrolls context', 'Apocrypha / Deuterocanon'];
    var witness = included.filter(function (cn) { return witnessCats.indexOf(cn.sourceCategory) !== -1; });
    var rest = included.filter(function (cn) { return lang.indexOf(cn) === -1 && witness.indexOf(cn) === -1; });
    if (lang.length) {
      c.appendChild(el('div', { 'class': 's-label' }, 'The Original Languages'));
      c.appendChild(connList(lang));
    }
    if (witness.length) {
      c.appendChild(el('div', { 'class': 's-label' }, 'The Ancient Witness — non-canonical testimony, for reference only'));
      c.appendChild(connList(witness));
    }
    if (rest.length) {
      c.appendChild(el('div', { 'class': 's-label' }, 'Study connections'));
      c.appendChild(connList(rest));
    }
    if (s.turn.trim()) { c.appendChild(el('div', { 'class': 's-label' }, 'Application — the turn')); c.appendChild(el('p', {}, s.turn)); }
    if (s.landing.trim()) { c.appendChild(el('div', { 'class': 's-label' }, 'Closing — the landing')); c.appendChild(el('p', {}, s.landing)); }
    c.appendChild(el('div', { 'class': 's-label' }, 'Notes'));
    c.appendChild(el('div', { 'class': 's-strip', 'aria-hidden': 'true' }));
    var foot = el('div', { 'class': 's-foot' }, 'Prepared with Ehyeh • Crews 4 Christ');
    foot.hidden = !$('p-footer').checked;
    c.appendChild(foot);
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
    if (!isPlainObject(parsed)) { return { ok: false, error: 'This file is not a Sermon Skeleton Builder export.' }; }
    if (parsed.format !== EXPORT_FORMAT) { return { ok: false, error: 'This file is not a Sermon Skeleton Builder export.' }; }
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
      ask({ title: 'Delete this sermon?', message: 'This removes “' + (s.title || 'Untitled sermon') + '” from this browser. It cannot be undone unless you have an export.', okLabel: 'Delete', danger: true }).then(function (v) {
        if (v !== true) { return; }
        state.sermons = state.sermons.filter(function (x) { return x.id !== s.id; });
        if (state.currentId === s.id) { state.currentId = null; }
        persist(); renderLibrary(); setStatus('Deleted.', 'ok');
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
    save(false);
    show('structure');
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
  if (!storage.available) { setStatus('Browser storage is unavailable in this window. You can still work and export, but nothing will be kept after you close it.', 'warn'); }
  show('start');
  window.__hagahLegacyShow = show; // Hagah shell bridge (ws1)
})();

