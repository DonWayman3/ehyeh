
window.__hagahModuleQueue = window.__hagahModuleQueue || [];
(function () {
var module = { exports: {} };
/* Hagah v3 — personal layer: word book + verse notes journal.
 *
 * Universal module: Node (tests) and browser (shell), same pattern as v2/v2.cjs.
 * In the browser it is exposed as window.HagahPersonal; in Node via module.exports.
 *
 * Guardrail note (standing rule): the guardrail constrains what the AI writes for
 * the user, never what the user writes. This module stores and renders the user's
 * own words verbatim — it NEVER filters, rewrites, or polices user content.
 * This module never calls ctx.guard and never generates study content.
 *
 * ---------------------------------------------------------------------------
 * SHELL CONTRACT
 *
 * Script: include this file in the v3 bundle; access as `HagahPersonal`
 * (Node: require('.../personal.js') → module.exports).
 *
 *   META  = { id:'personal', title:'My Study', modes:['study','sermon'] }
 *
 *   mount(panelEl, ctx) — ctx fields:
 *     mode           'study' | 'sermon' (current)
 *     onModeChange(fn)  subscribe; fn(newMode)
 *     store          { get(k, fallback), set(k, v), del(k) } — keys are
 *                    auto-prefixed 'hagah.' by the shell, so pass bare keys
 *                    ('wordbook', 'notes').
 *     data           read-only app data; used only for ctx.data.books to
 *                    render the current passage name. Never written to.
 *     guard          present but NEVER called by this module.
 *     h(tag, attrs, ...kids)  DOM builder. Must support string kids, and
 *                    attrs: class, id, type, value, placeholder, accept,
 *                    hidden, data-*, aria-*, text. Event listeners are
 *                    attached via el.addEventListener by this module, so h
 *                    does not need on* attrs.
 *     passage        { book, chapter } — current passage (book = number).
 *     notify(msg)    OPTIONAL — shell toast/announcement hook.
 *     onJump(ref)    OPTIONAL — shell navigates to a verse ref, e.g. "John 3:16".
 *                    "Open verse" buttons call it when present.
 *
 *   Save API — call AFTER mount() (store is bound there):
 *
 *     HagahPersonal.saveWord({ ref, word, strongs, lang, gloss })
 *       ref:     "John 3:16"            (required, non-empty string)
 *       word:    tapped English word    (required, non-empty string)
 *       strongs: "G4100" | ["G4100"] | "" — normalized to an uppercase array
 *       lang:    "Greek"|"Hebrew"|"Aramaic" (optional)
 *       gloss:   short lexicon gloss for the list (optional)
 *       → { ok:true, entry:{ref,word,strongs,lang,gloss,savedAt} }
 *       → { ok:true, duplicate:true, entry }   (already saved — idempotent)
 *       → { ok:false, reason, message }  reason ∈ not-bound|missing-ref|
 *                                          missing-word|quota
 *       The tap-a-word panel's "Save to word book" button should call this,
 *       then call HagahPersonal.refresh() so the list updates.
 *
 *     HagahPersonal.setNote(ref, text)
 *       ref:  "John 3:16" (required, ≤160 chars)
 *       text: the user's own words — stored verbatim, never filtered.
 *             Empty/whitespace-only text CLEARS the note for that ref.
 *       → { ok:true } | { ok:true, cleared:true }
 *       → { ok:false, reason, message }  reason ∈ not-bound|missing-ref|
 *                                          ref-too-long|quota
 *
 *     HagahPersonal.getNote(ref) → string ("" when no note)
 *     HagahPersonal.getNotes()   → { ref: { text, updatedAt } } (a copy)
 *     HagahPersonal.removeNote(ref) → { ok:true }
 *     HagahPersonal.getWordbook() → [ {ref,word,strongs,lang,gloss,savedAt} ] (a copy)
 *     HagahPersonal.removeWord(index) → { ok:true } | { ok:false, reason:'bad-index' }
 *     HagahPersonal.clearWordbook() → { ok:true }
 *
 *     HagahPersonal.exportData('wordbook'|'notes') → { ok:true, filename, json }
 *       filename: "ehyeh-wordbook-20261001-170500.json" (local time)
 *
 *     HagahPersonal.importData('wordbook'|'notes', jsonText)
 *       → { ok:true, added, skipped, invalid }
 *       → { ok:false, reason:'parse-error'|'shape-error'|'bad-kind', message }
 *       Merges without duplicates (word book: same ref+word+strongs).
 *
 *     HagahPersonal.downloadExport('wordbook'|'notes')
 *       Browser-only file download of the export. → { ok:true }
 *       or { ok:false, reason:'no-dom' } outside a browser.
 *
 *     HagahPersonal.refresh() — re-render the lists (e.g. after an external
 *       saveWord call). Safe to call any time after mount.
 *     HagahPersonal.getNotices() → [ { ts, msg } ] — honest status messages
 *       (quota, corruption recovery, import results).
 *
 * Storage keys (shell prefixes each with 'hagah.'):
 *   'wordbook' → array of entries
 *   'notes'    → { ref: { text, updatedAt } }
 * Corrupt data: backed up under 'hagah.<key>.corrupt-<timestamp>', then a
 * clean store is started and the user is told what happened.
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  'use strict';
  var P = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = P; }
  else { root.HagahPersonal = P; }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var META = { id: 'personal', title: 'My Study', modes: ['study', 'sermon'] };

  var KEY_WB = 'wordbook';
  var KEY_NOTES = 'notes';

  /* Bound at mount() ---------------------------------------------------- */
  var CTX = null;
  var STORE = null;
  var WB = null;      // in-memory word book (array of entries)
  var NOTES = null;   // in-memory notes ({ ref: { text, updatedAt } })
  var NOTICES = [];
  var SEARCH_Q = '';
  var UI = null;      // element refs while mounted

  /* ------------------------------- utils ------------------------------ */
  function isNonEmptyStr(s) { return typeof s === 'string' && s.trim().length > 0; }
  function nowTs() { return Date.now(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function stampTs(d) {
    d = d || new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }
  function fmtDate(ts) {
    try { return new Date(ts).toLocaleString(); } catch (e) { return String(ts); }
  }
  function keyLabel(k) { return k === KEY_WB ? 'word book' : 'verse notes'; }

  function normStrongs(s) {
    if (s == null) { return []; }
    var arr = Array.isArray(s) ? s : [s];
    var out = [];
    arr.forEach(function (x) {
      var t = String(x).trim().toUpperCase();
      if (t && out.indexOf(t) < 0) { out.push(t); }
    });
    return out;
  }
  function wordKey(e) {
    return e.ref.trim().toLowerCase() + '|' + e.word.trim().toLowerCase() +
      '|' + e.strongs.join(',');
  }

  /* --------------------------- validation ----------------------------- */
  function validWordEntry(e) {
    return !!e && typeof e === 'object' && !Array.isArray(e) &&
      isNonEmptyStr(e.ref) && isNonEmptyStr(e.word);
  }
  function validateWordbook(v) {
    return Array.isArray(v) && v.every(validWordEntry);
  }
  function validNoteValue(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v) &&
      typeof v.text === 'string';
  }
  function validateNotes(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) { return false; }
    return Object.keys(v).every(function (k) {
      return isNonEmptyStr(k) && validNoteValue(v[k]);
    });
  }

  /* ----------------------------- notices ------------------------------ */
  function notify(msg) {
    msg = String(msg);
    NOTICES.push({ ts: nowTs(), msg: msg });
    if (CTX && typeof CTX.notify === 'function') {
      try { CTX.notify(msg); } catch (e) { /* shell hook is best-effort */ }
    }
    renderNotices();
  }
  function getNotices() { return NOTICES.slice(); }

  /* ------------------------- storage handling ------------------------- */
  function quarantine(key, raw) {
    // Back up the damaged value; never throws outward.
    try { STORE.set(key + '.corrupt-' + nowTs(), raw === undefined ? null : raw); }
    catch (e) { /* quota during backup: notice below is the honest record */ }
  }

  function loadChecked(key, validate, fallback) {
    var raw;
    try {
      raw = STORE.get(key, undefined);
    } catch (e) {
      quarantine(key, { unreadable: true, error: String((e && e.message) || e) });
      notify('Your saved ' + keyLabel(key) + ' could not be read, so we started ' +
        'with an empty one. The unreadable copy was kept as "hagah.' + key +
        '.corrupt-…" so nothing was silently thrown away.');
      return clone(fallback);
    }
    if (raw === undefined || raw === null) { return clone(fallback); }
    if (!validate(raw)) {
      quarantine(key, raw);
      try { STORE.set(key, clone(fallback)); } catch (e) { /* keep going */ }
      notify('Your saved ' + keyLabel(key) + ' was damaged, so we started with ' +
        'an empty one. The damaged copy was kept as "hagah.' + key +
        '.corrupt-…" so nothing was silently thrown away.');
      return clone(fallback);
    }
    return raw;
  }

  // Writes value under key. On storage failure the in-memory state is kept
  // (no data loss); the caller gets an honest { ok:false }.
  function persist(key, value) {
    try {
      STORE.set(key, value);
      return { ok: true };
    } catch (e) {
      var nm = String((e && e.name) || '');
      var ms = String((e && e.message) || e || '');
      var isQuota = /quota/i.test(nm) || /quota/i.test(ms) || (e && e.code === 22);
      var msg = isQuota
        ? 'Browser storage is full, so this change was kept in memory only and ' +
          'was NOT saved. Please use Export below to download a backup file, ' +
          'then free up space and try again.'
        : 'Could not save to storage (' + ms + '). The change was kept in ' +
          'memory only — please use Export below to download a backup file.';
      notify(msg);
      return { ok: false, quota: !!isQuota, message: msg };
    }
  }

  /* ------------------------------ API --------------------------------- */
  function notBound() {
    return { ok: false, reason: 'not-bound', message: 'The personal layer is not ready yet (mount() has not run).' };
  }

  function saveWord(entry) {
    if (!STORE) { return notBound(); }
    entry = entry || {};
    if (!isNonEmptyStr(entry.ref)) {
      return { ok: false, reason: 'missing-ref', message: 'A verse reference is required to save a word.' };
    }
    if (!isNonEmptyStr(entry.word)) {
      return { ok: false, reason: 'missing-word', message: 'A word is required to save.' };
    }
    var e = {
      ref: entry.ref.trim(),
      word: entry.word.trim(),
      strongs: normStrongs(entry.strongs),
      lang: isNonEmptyStr(entry.lang) ? entry.lang.trim() : '',
      gloss: isNonEmptyStr(entry.gloss) ? entry.gloss.trim() : '',
      savedAt: nowTs()
    };
    var dup = WB.some(function (x) { return wordKey(x) === wordKey(e); });
    if (dup) { return { ok: true, duplicate: true, entry: e, message: 'Already in your word book.' }; }
    WB.push(e);
    var r = persist(KEY_WB, WB);
    renderWbList();
    if (!r.ok) { return { ok: false, reason: 'quota', message: r.message, entry: e }; }
    return { ok: true, entry: e };
  }

  function getWordbook() { return STORE ? clone(WB) : []; }

  function removeWord(index) {
    if (!STORE) { return notBound(); }
    if (typeof index !== 'number' || index < 0 || index >= WB.length || Math.floor(index) !== index) {
      return { ok: false, reason: 'bad-index', message: 'No word book entry at that position.' };
    }
    WB.splice(index, 1);
    var r = persist(KEY_WB, WB);
    renderWbList();
    if (!r.ok) { return { ok: false, reason: 'quota', message: r.message }; }
    return { ok: true };
  }

  function clearWordbook() {
    if (!STORE) { return notBound(); }
    WB = [];
    try { STORE.del(KEY_WB); } catch (e) { persist(KEY_WB, WB); }
    renderWbList();
    return { ok: true };
  }

  function setNote(ref, text) {
    if (!STORE) { return notBound(); }
    if (!isNonEmptyStr(ref)) {
      return { ok: false, reason: 'missing-ref', message: 'A verse reference is required to save a note.' };
    }
    var r = ref.trim();
    if (r.length > 160) {
      return { ok: false, reason: 'ref-too-long', message: 'That verse reference is too long (max 160 characters).' };
    }
    var t = text == null ? '' : String(text);
    if (t.trim() === '') {
      // Saving an empty note clears it — an empty field stays empty.
      var had = Object.prototype.hasOwnProperty.call(NOTES, r);
      delete NOTES[r];
      if (had) { persist(KEY_NOTES, NOTES); }
      renderNotesList();
      return { ok: true, cleared: true };
    }
    NOTES[r] = { text: t, updatedAt: nowTs() };
    var pr = persist(KEY_NOTES, NOTES);
    renderNotesList();
    if (!pr.ok) { return { ok: false, reason: 'quota', message: pr.message }; }
    return { ok: true };
  }

  function getNote(ref) {
    if (!STORE || !isNonEmptyStr(ref)) { return ''; }
    var n = NOTES[ref.trim()];
    return n ? n.text : '';
  }

  function getNotes() { return STORE ? clone(NOTES) : {}; }

  function removeNote(ref) {
    if (!STORE) { return notBound(); }
    if (isNonEmptyStr(ref)) { delete NOTES[ref.trim()]; }
    persist(KEY_NOTES, NOTES);
    renderNotesList();
    return { ok: true };
  }

  /* ------------------------- export / import -------------------------- */
  function exportData(kind) {
    if (!STORE) { return notBound(); }
    var payload, base;
    if (kind === KEY_WB) { payload = WB; base = 'ehyeh-wordbook'; }
    else if (kind === KEY_NOTES) { payload = NOTES; base = 'ehyeh-notes'; }
    else { return { ok: false, reason: 'bad-kind', message: 'Unknown export kind: ' + kind }; }
    return { ok: true, filename: base + '-' + stampTs() + '.json', json: JSON.stringify(payload, null, 2) };
  }

  function downloadExport(kind) {
    var ex = exportData(kind);
    if (!ex.ok) { return ex; }
    if (typeof document === 'undefined' || typeof Blob === 'undefined' ||
        typeof window === 'undefined') {
      return { ok: false, reason: 'no-dom', message: 'File download needs a browser.' };
    }
    try {
      var blob = new Blob([ex.json], { type: 'application/json' });
      var URL_ = window.URL || window.webkitURL;
      var url = URL_.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = ex.filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { URL_.revokeObjectURL(url); } catch (e) {}
        if (a.parentNode) { a.parentNode.removeChild(a); }
      }, 4000);
      return { ok: true, filename: ex.filename };
    } catch (e) {
      return { ok: false, reason: 'download-failed', message: String((e && e.message) || e) };
    }
  }

  function importWordbook(parsed) {
    if (!Array.isArray(parsed)) {
      return { ok: false, reason: 'shape-error', message: 'A word book file must be a JSON array of entries.' };
    }
    var added = 0, skipped = 0, invalid = 0;
    parsed.forEach(function (raw) {
      if (!validWordEntry(raw)) { invalid++; return; }
      var e = {
        ref: String(raw.ref).trim(),
        word: String(raw.word).trim(),
        strongs: normStrongs(raw.strongs),
        lang: isNonEmptyStr(raw.lang) ? String(raw.lang).trim() : '',
        gloss: isNonEmptyStr(raw.gloss) ? String(raw.gloss).trim() : '',
        savedAt: (typeof raw.savedAt === 'number' && raw.savedAt > 0) ? raw.savedAt : nowTs()
      };
      var dup = WB.some(function (x) { return wordKey(x) === wordKey(e); });
      if (dup) { skipped++; return; }
      WB.push(e);
      added++;
    });
    var r = persist(KEY_WB, WB);
    renderWbList();
    if (!r.ok) { return { ok: false, reason: 'quota', message: r.message, added: added, skipped: skipped, invalid: invalid }; }
    return { ok: true, added: added, skipped: skipped, invalid: invalid };
  }

  function importNotes(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, reason: 'shape-error', message: 'A notes file must be a JSON object mapping verse references to notes.' };
    }
    var added = 0, skipped = 0, invalid = 0;
    Object.keys(parsed).forEach(function (k) {
      var ref = String(k).trim();
      var v = parsed[k];
      if (!ref || ref.length > 160 || !validNoteValue(v)) { invalid++; return; }
      var text = v.text;
      if (NOTES[ref] && NOTES[ref].text === text) { skipped++; return; }
      NOTES[ref] = {
        text: text,
        updatedAt: (typeof v.updatedAt === 'number' && v.updatedAt > 0) ? v.updatedAt : nowTs()
      };
      added++;
    });
    var r = persist(KEY_NOTES, NOTES);
    renderNotesList();
    if (!r.ok) { return { ok: false, reason: 'quota', message: r.message, added: added, skipped: skipped, invalid: invalid }; }
    return { ok: true, added: added, skipped: skipped, invalid: invalid };
  }

  function importData(kind, jsonText) {
    if (!STORE) { return notBound(); }
    if (kind !== KEY_WB && kind !== KEY_NOTES) {
      return { ok: false, reason: 'bad-kind', message: 'Unknown import kind: ' + kind };
    }
    var parsed;
    try { parsed = JSON.parse(String(jsonText)); }
    catch (e) {
      return { ok: false, reason: 'parse-error', message: 'That file is not valid JSON — nothing was imported.' };
    }
    var res = (kind === KEY_WB) ? importWordbook(parsed) : importNotes(parsed);
    if (res.ok) {
      notify('Import finished: ' + res.added + ' added, ' + res.skipped +
        ' already had, ' + res.invalid + ' skipped as invalid.');
    }
    return res;
  }

  /* ------------------------------ UI ---------------------------------- */
  function h(tag, attrs) {
    var kids = Array.prototype.slice.call(arguments, 2);
    return CTX.h.apply(null, [tag, attrs || {}].concat(kids));
  }
  function setChildren(parent, kids) {
    while (parent.firstChild) { parent.removeChild(parent.firstChild); }
    kids.forEach(function (k) { if (k) { parent.appendChild(k); } });
  }
  function textEl(s) { return h('span', {}, String(s)); }

  function bookName(n) {
    var d = CTX && CTX.data;
    if (d && Array.isArray(d.books) && d.books[n - 1]) { return d.books[n - 1]; }
    return '';
  }
  function currentPassageRef() {
    var p = CTX && CTX.passage;
    if (p && typeof p.book === 'number' && typeof p.chapter === 'number') {
      var name = bookName(p.book);
      if (name) { return name + ' ' + p.chapter; }
    }
    return '';
  }
  function jump(ref) {
    if (CTX && typeof CTX.onJump === 'function') {
      try { CTX.onJump(ref); return; } catch (e) { /* fall through */ }
    }
    notify('Jump-to-verse is not wired in this shell yet — your entry is saved under "' + ref + '".');
  }
  function setModeLabel(m) {
    if (!UI || !UI.modeLabel) { return; }
    UI.modeLabel.textContent = (m === 'sermon') ? 'Sermon Prep' : 'Personal Study';
  }

  function filePicker(kind) {
    var input = h('input', {
      type: 'file', accept: 'application/json', 'data-testid': 'import-' + kind,
      style: 'display:none'
    });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) { return; }
      if (typeof FileReader === 'undefined') {
        notify('File import needs a browser file reader.');
        input.value = '';
        return;
      }
      var rd = new FileReader();
      rd.onload = function () {
        var res = importData(kind, rd.result);
        if (!res.ok) { notify(res.message); }
        input.value = '';
      };
      rd.onerror = function () {
        notify('Could not read that file — nothing was imported.');
        input.value = '';
      };
      rd.readAsText(f);
    });
    return input;
  }

  function buildUI(panelEl) {
    UI = {};
    var root = h('div', { 'class': 'hg-personal', 'data-testid': 'personal-root' });

    var header = h('div', { 'class': 'hg-personal-head' },
      h('h2', {}, 'My Study'),
      h('span', { 'class': 'hg-mode', 'data-testid': 'mode-label' }, ''),
      h('p', { 'class': 'hg-sub' },
        'Your words stay yours — everything here lives on this device only. Nothing is sent anywhere.')
    );
    UI.modeLabel = header.children[1];

    UI.notices = h('div', { 'class': 'hg-notices', 'data-testid': 'notices' });

    var tabWb = h('button', { type: 'button', 'class': 'hg-tab', 'data-testid': 'tab-wordbook' }, 'Word book');
    var tabNotes = h('button', { type: 'button', 'class': 'hg-tab', 'data-testid': 'tab-notes' }, 'Verse notes');
    tabWb.addEventListener('click', function () { showTab('wb'); });
    tabNotes.addEventListener('click', function () { showTab('notes'); });
    UI.tabWb = tabWb; UI.tabNotes = tabNotes;
    var tabs = h('div', { 'class': 'hg-tabs' }, tabWb, tabNotes);

    /* ---- word book view ---- */
    var wbSearch = h('input', {
      type: 'search', placeholder: 'Search your word book…',
      'data-testid': 'wb-search', 'class': 'hg-search'
    });
    wbSearch.addEventListener('input', function (ev) {
      SEARCH_Q = (ev.target && ev.target.value ? ev.target.value : '').toLowerCase();
      renderWbList();
    });
    var wbExport = h('button', { type: 'button', 'data-testid': 'wb-export' }, 'Export');
    wbExport.addEventListener('click', function () {
      var r = downloadExport(KEY_WB);
      notify(r.ok ? 'Word book downloaded.' : r.message);
    });
    var wbImportFile = filePicker(KEY_WB);
    var wbImport = h('button', { type: 'button', 'data-testid': 'wb-import' }, 'Import');
    wbImport.addEventListener('click', function () { wbImportFile.click(); });
    var wbToolbar = h('div', { 'class': 'hg-toolbar' }, wbSearch, wbExport, wbImport, wbImportFile);
    UI.wbSearch = wbSearch;
    UI.wbList = h('div', { 'class': 'hg-wb-list', 'data-testid': 'wb-list' });
    UI.wbCount = h('p', { 'class': 'hg-count', 'data-testid': 'wb-count' }, '');
    var viewWb = h('div', { 'class': 'hg-view', 'data-testid': 'view-wordbook' },
      wbToolbar, UI.wbCount, UI.wbList);

    /* ---- notes view ---- */
    var noteRef = h('input', {
      type: 'text', 'data-testid': 'note-ref', 'class': 'hg-ref',
      placeholder: 'Verse reference, e.g. John 3:16', value: currentPassageRef()
    });
    var noteText = h('textarea', {
      'data-testid': 'note-text', 'class': 'hg-note-text',
      placeholder: 'Write your own notes, prayers, and thoughts here…', rows: '6'
    });
    var noteSave = h('button', { type: 'button', 'data-testid': 'note-save' }, 'Save note');
    noteSave.addEventListener('click', function () {
      var r = setNote(noteRef.value, noteText.value);
      if (!r.ok) { notify(r.message); }
      else if (r.cleared) { notify('Note cleared for "' + noteRef.value.trim() + '".'); }
      else { notify('Note saved for "' + noteRef.value.trim() + '".'); }
    });
    var noteClear = h('button', { type: 'button', 'data-testid': 'note-clear' }, 'Clear');
    noteClear.addEventListener('click', function () { noteText.value = ''; });
    var editor = h('div', { 'class': 'hg-editor' },
      h('label', { 'class': 'hg-label' }, 'Verse'),
      noteRef,
      h('label', { 'class': 'hg-label' }, 'Your notes'),
      noteText,
      h('div', { 'class': 'hg-row' }, noteSave, noteClear)
    );
    UI.noteRef = noteRef; UI.noteText = noteText;
    UI.notesList = h('div', { 'class': 'hg-notes-list', 'data-testid': 'notes-list' });
    var nExport = h('button', { type: 'button', 'data-testid': 'notes-export' }, 'Export');
    nExport.addEventListener('click', function () {
      var r = downloadExport(KEY_NOTES);
      notify(r.ok ? 'Notes downloaded.' : r.message);
    });
    var nImportFile = filePicker(KEY_NOTES);
    var nImport = h('button', { type: 'button', 'data-testid': 'notes-import' }, 'Import');
    nImport.addEventListener('click', function () { nImportFile.click(); });
    var viewNotes = h('div', { 'class': 'hg-view', 'data-testid': 'view-notes', hidden: true },
      h('h3', {}, 'Write'),
      editor,
      h('h3', {}, 'Saved notes'),
      UI.notesList,
      h('div', { 'class': 'hg-toolbar' }, nExport, nImport, nImportFile)
    );
    UI.viewWb = viewWb; UI.viewNotes = viewNotes;

    setChildren(root, [header, UI.notices, tabs, viewWb, viewNotes]);
    panelEl.appendChild(root);
    UI.root = root;
    showTab('wb');
  }

  function showTab(which) {
    if (!UI) { return; }
    var wb = (which === 'wb');
    UI.viewWb.hidden = !wb;
    UI.viewNotes.hidden = wb;
    UI.tabWb.setAttribute('aria-selected', wb ? 'true' : 'false');
    UI.tabNotes.setAttribute('aria-selected', wb ? 'false' : 'true');
  }

  function filteredWordbook() {
    if (!SEARCH_Q) { return WB; }
    return WB.filter(function (e) {
      var hay = (e.word + ' ' + e.ref + ' ' + e.gloss + ' ' + e.lang + ' ' + e.strongs.join(' ')).toLowerCase();
      return hay.indexOf(SEARCH_Q) >= 0;
    });
  }

  function wbItem(e, index) {
    var head = h('div', { 'class': 'hg-wb-head' },
      h('strong', {}, e.word),
      h('span', { 'class': 'hg-ref' }, ' ' + e.ref + ' '),
      e.lang ? h('span', { 'class': 'hg-lang' }, e.lang) : null,
      e.strongs.length ? h('span', { 'class': 'hg-strongs' }, ' ' + e.strongs.join(', ')) : null
    );
    var gloss = e.gloss ? h('div', { 'class': 'hg-gloss' }, e.gloss) : null;
    var meta = h('div', { 'class': 'hg-meta' }, 'Saved ' + fmtDate(e.savedAt));
    var open = h('button', { type: 'button', 'data-testid': 'wb-jump-' + index }, 'Open verse');
    open.addEventListener('click', function () { jump(e.ref); });
    var del = h('button', { type: 'button', 'data-testid': 'wb-del-' + index }, 'Delete');
    del.addEventListener('click', function () {
      var r = removeWord(index);
      if (!r.ok) { notify(r.message); }
    });
    var actions = h('div', { 'class': 'hg-row' }, open, del);
    return h('div', { 'class': 'hg-wb-item', 'data-testid': 'wb-item' }, head, gloss, meta, actions);
  }

  function renderWbList() {
    if (!UI || !UI.wbList) { return; }
    var list = filteredWordbook();
    UI.wbCount.textContent = WB.length === 0
      ? 'Your word book is empty.'
      : WB.length + (WB.length === 1 ? ' word' : ' words') + ' saved' +
        (SEARCH_Q ? ' — ' + list.length + ' shown' : '');
    if (WB.length === 0) {
      setChildren(UI.wbList, [
        h('p', { 'class': 'hg-empty' },
          'Nothing saved yet. Tap a word in the passage, then choose "Save to word book".')
      ]);
      return;
    }
    if (list.length === 0) {
      setChildren(UI.wbList, [h('p', { 'class': 'hg-empty' }, 'No words match your search.')]);
      return;
    }
    // Map filtered entries back to their index in WB for delete/jump wiring.
    var items = list.map(function (e) { return wbItem(e, WB.indexOf(e)); });
    setChildren(UI.wbList, items);
  }

  function noteItem(ref) {
    var n = NOTES[ref];
    var preview = n.text.length > 90 ? n.text.slice(0, 90) + '…' : n.text;
    var edit = h('button', { type: 'button', 'data-testid': 'note-edit' }, 'Edit');
    edit.addEventListener('click', function () {
      UI.noteRef.value = ref;
      UI.noteText.value = n.text;
      showTab('notes');
    });
    var open = h('button', { type: 'button', 'data-testid': 'note-jump' }, 'Open verse');
    open.addEventListener('click', function () { jump(ref); });
    var del = h('button', { type: 'button', 'data-testid': 'note-del' }, 'Delete');
    del.addEventListener('click', function () {
      var r = removeNote(ref);
      if (!r.ok) { notify(r.message); } else { notify('Note deleted for "' + ref + '".'); }
    });
    return h('div', { 'class': 'hg-note-item', 'data-testid': 'note-item' },
      h('div', { 'class': 'hg-note-head' },
        h('strong', {}, ref),
        h('span', { 'class': 'hg-meta' }, ' Updated ' + fmtDate(n.updatedAt))
      ),
      h('div', { 'class': 'hg-note-preview' }, preview),
      h('div', { 'class': 'hg-row' }, edit, open, del)
    );
  }

  function renderNotesList() {
    if (!UI || !UI.notesList) { return; }
    var refs = Object.keys(NOTES).sort(function (a, b) {
      return NOTES[b].updatedAt - NOTES[a].updatedAt;
    });
    if (refs.length === 0) {
      setChildren(UI.notesList, [
        h('p', { 'class': 'hg-empty' }, 'No notes yet. Notes you write are stored only on this device.')
      ]);
      return;
    }
    setChildren(UI.notesList, refs.map(noteItem));
  }

  function renderNotices() {
    if (!UI || !UI.notices) { return; }
    var last = NOTICES.slice(-4);
    setChildren(UI.notices, last.map(function (n) {
      return h('p', { 'class': 'hg-notice' }, n.msg);
    }));
  }

  function refresh() {
    renderWbList();
    renderNotesList();
    renderNotices();
  }

  /* ------------------------------ mount ------------------------------- */
  function mount(panelEl, ctx) {
    CTX = ctx || {};
    STORE = CTX.store || null;
    NOTICES = [];
    WB = null; NOTES = null;
    SEARCH_Q = '';
    UI = null;
    if (!STORE || typeof STORE.get !== 'function' ||
        typeof STORE.set !== 'function' || typeof STORE.del !== 'function') {
      // No usable store: render a plain honest error without the h() helper.
      if (typeof document !== 'undefined' && document.createElement) {
        var msg = document.createElement('p');
        msg.textContent = 'The personal layer could not start: no storage was provided.';
        panelEl.appendChild(msg);
      }
      return;
    }
    WB = loadChecked(KEY_WB, validateWordbook, []);
    NOTES = loadChecked(KEY_NOTES, validateNotes, {});
    buildUI(panelEl);
    if (typeof CTX.onModeChange === 'function') {
      try { CTX.onModeChange(function (m) { setModeLabel(m); }); } catch (e) { /* best-effort */ }
    }
    setModeLabel(CTX.mode);
    refresh();
  }

  return {
    META: META,
    mount: mount,
    refresh: refresh,
    saveWord: saveWord,
    getWordbook: getWordbook,
    removeWord: removeWord,
    clearWordbook: clearWordbook,
    setNote: setNote,
    getNote: getNote,
    getNotes: getNotes,
    removeNote: removeNote,
    exportData: exportData,
    downloadExport: downloadExport,
    importData: importData,
    getNotices: getNotices,
    // exposed for tests
    _validateWordbook: validateWordbook,
    _validateNotes: validateNotes
  };
}));

window.__hagahModuleQueue.push(module.exports);
})();
