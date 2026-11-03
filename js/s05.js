
window.__hagahModuleQueue = window.__hagahModuleQueue || [];
(function () {
var module = { exports: {} };
/* Hagah v3 — Compare · Listen · Memory (workstream 4).
   Universal module pattern (mirrors v2/v2.cjs): pure functions are exported for
   Node tests and attached to window.HAGAH_CLM in the browser.

   SCOPE (v3 spec features 6, 7, 8):
     6. Translation compare — PLUGGABLE, data-driven translation registry.
        The module reads v3/data/translations/registry.json and NEVER hardcodes
        a translation list. v3 ships Geneva 1599 + KJV (both public domain; KJV
        license verified in data/SOURCES.md). v4 texts (WEB, 1 Enoch, DSS
        content) drop in as {JSON file + one registry entry} with zero code
        changes; the `canon` + `disclosure` fields exist so non-canonical texts
        are labeled honestly. Versification mismatches get an honest note;
        rows never silently misalign. Round-2 rule: a canon:"other" text is
        NEVER aligned to or labeled with Bible passage references (its own
        numbering may collide with Bible book numbers — 1 Enoch's book key
        "1" is not Genesis). On the compare tab it gets its own clearly
        labeled section with independent chapter navigation; on the listen
        tab it gets the same disclosure plus an honest "no text for this
        passage" empty state.
     7. Listen — audio read-aloud per passage. PRIMARY: browser speechSynthesis
        (Web Speech API): $0, offline, no network, no key. OPTIONAL:
        user-configured OpenAI-compatible TTS endpoint; endpoint+key live in
        sessionStorage ONLY (never in code, never in localStorage); endpoint
        audio cached in IndexedDB. Unreachable endpoint -> honest fallback to
        built-in voices. No voices at all -> controls hidden + honest note.
        No audio files are shipped.
     8. Memory verses — "hide it in thine heart": local verse collection +
        spaced-repetition review queue in ctx.store ('hagah.memory').

   DATA CONTRACT (for the shell integrator):
     The module reads ONLY the registry — it never hardcodes a translation
     list. Registry / translation files / versification notes are resolved
     from (first hit wins):
       ctx.data.registry | ctx.data.hagah.registry |
       ctx.data.hagah['translations/registry.json'] |
       fetch('data/translations/registry.json')   (dev fallback)
     and the same pattern for 'versification' and each translation id
     (ctx.data.translations[id], ctx.data.hagah['translations/<id>.json'],
     or the entry's `file` fetched relative to the page).
     providedBy:"shell" entries read ctx.data.bible (the v2 Geneva bundle).
   No teacher, channel, or creator is named. Every user field starts empty.
   Rendering is textContent-only (via ctx.h) — no HTML string injection anywhere.

   The module never generates content and never calls the v2 guard surface:
   nothing here needs the allowlist, so nothing bypasses it. */
(function (root, factory) {
  'use strict';
  var CLM = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = CLM; }
  else { root.HAGAH_CLM = CLM; }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var META = { id: 'clm', title: 'Compare · Listen · Memory', modes: ['study', 'sermon'] };

  /* ==================================================================
     Translation registry — validation (pure; no DOM)
     ================================================================== */
  var CANONS = ['protestant', 'other'];
  var PROVIDERS = ['shell', 'file'];
  var ID_RE = /^[a-z0-9][a-z0-9-]*$/;

  /* validateRegistry throws an honest Error on any malformation — never silent. */
  function validateRegistry(reg) {
    function bad(msg) { throw new Error('translation registry: ' + msg); }
    if (!reg || typeof reg !== 'object') { bad('not an object'); }
    if (!Array.isArray(reg.translations) || !reg.translations.length) {
      bad('"translations" must be a non-empty array');
    }
    var seen = {};
    reg.translations.forEach(function (t, i) {
      var where = 'translations[' + i + ']';
      if (!t || typeof t !== 'object') { bad(where + ' not an object'); }
      if (typeof t.id !== 'string' || !ID_RE.test(t.id)) {
        bad(where + ' has a bad/missing id (lowercase letters, digits, hyphens)');
      }
      if (seen[t.id]) { bad('duplicate id "' + t.id + '"'); }
      seen[t.id] = true;
      ['title', 'short', 'language', 'disclosure', 'license', 'source'].forEach(function (f) {
        if (typeof t[f] !== 'string' || !t[f].trim()) { bad(where + ' ("' + t.id + '") missing "' + f + '"'); }
      });
      if (CANONS.indexOf(t.canon) === -1) {
        bad('"' + t.id + '" has unknown canon "' + t.canon + '" (want protestant|other)');
      }
      if (PROVIDERS.indexOf(t.providedBy) === -1) {
        bad('"' + t.id + '" has unknown providedBy "' + t.providedBy + '" (want shell|file)');
      }
      if (t.providedBy === 'file') {
        if (typeof t.file !== 'string' || !t.file.trim()) {
          bad('"' + t.id + '" is file-provided but has no "file" path');
        }
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t.file) || t.file.charAt(0) === '/') {
          bad('"' + t.id + '" "file" must be a relative path (no URLs, no absolute paths)');
        }
        // Round-2 defense-in-depth: reject ".." path segments too, so a
        // registry entry can never escape the data directory (path traversal).
        if (/(^|[\\/])\.\.([\\/]|$)/.test(t.file)) {
          bad('"' + t.id + '" "file" must not contain ".." path segments');
        }
      } else if (t.file !== null && t.file !== undefined) {
        bad('"' + t.id + '" is shell-provided but also sets "file"');
      }
      if (t.versification !== undefined &&
          (typeof t.versification !== 'string' || !t.versification.trim())) {
        bad('"' + t.id + '" has a bad "versification" tag');
      }
    });
    if (typeof reg.reference !== 'string' || !seen[reg.reference]) {
      bad('"reference" must name a registered translation id');
    }
    return reg;
  }

  function translationById(registry, id) {
    for (var i = 0; i < registry.translations.length; i++) {
      if (registry.translations[i].id === id) { return registry.translations[i]; }
    }
    return null;
  }

  /* Sanity-check one translation's bible data. Throws honestly when malformed. */
  function validateBibleData(entry, data) {
    function bad(msg) { throw new Error('translation "' + entry.id + '": ' + msg); }
    var bible = data && data.bible;
    if (!bible || typeof bible !== 'object') { bad('no "bible" object'); }
    var bookKeys = Object.keys(bible);
    if (entry.canon === 'protestant' && bookKeys.length !== 66) {
      bad('protestant canon needs 66 books, found ' + bookKeys.length);
    }
    var verses = 0;
    bookKeys.forEach(function (bk) {
      var book = bible[bk];
      if (!book || typeof book !== 'object') { bad('book ' + bk + ' malformed'); }
      Object.keys(book).forEach(function (ch) {
        var chap = book[ch];
        if (!chap || typeof chap !== 'object') { bad('book ' + bk + ' chapter ' + ch + ' malformed'); }
        Object.keys(chap).forEach(function (v) {
          if (typeof chap[v] !== 'string' || !chap[v].trim()) {
            bad('empty text at ' + bk + ' ' + ch + ':' + v);
          }
          verses++;
        });
      });
    });
    if (entry.canon === 'protestant' && (verses < 30000 || verses > 32000)) {
      bad('protestant canon should hold ~31k verses, found ' + verses);
    }
    if (!verses) { bad('no verses at all'); }
    return data;
  }

  /* ==================================================================
     Memory verses — spaced repetition (pure; no DOM)
     Card: { ref, text, nextDue (epoch ms), interval (days) }
     ================================================================== */
  var LADDER_DAYS = [1, 3, 7, 14, 30, 60];
  var DAY_MS = 86400000;

  function rungIndex(interval) {
    for (var i = 0; i < LADDER_DAYS.length; i++) {
      if (LADDER_DAYS[i] >= interval) { return i; }
    }
    return LADDER_DAYS.length - 1;
  }

  /* grade: 'again' | 'hard' | 'good' | 'easy'. Returns a NEW card object. */
  function gradeCard(card, grade, nowMs) {
    if (!card || typeof card.ref !== 'string') { throw new Error('gradeCard: bad card'); }
    var ni = rungIndex(card.interval || LADDER_DAYS[0]);
    if (grade === 'again') { ni = 0; }
    else if (grade === 'hard') { /* stay on the same rung */ }
    else if (grade === 'good') { ni = Math.min(ni + 1, LADDER_DAYS.length - 1); }
    else if (grade === 'easy') { ni = Math.min(ni + 2, LADDER_DAYS.length - 1); }
    else { throw new Error('gradeCard: unknown grade "' + grade + '"'); }
    var interval = LADDER_DAYS[ni];
    return { ref: card.ref, text: card.text, nextDue: nowMs + interval * DAY_MS, interval: interval };
  }

  /* New cards are due immediately so they enter the review queue at once. */
  function addCard(cards, ref, text, nowMs) {
    if (typeof ref !== 'string' || !ref.trim()) { throw new Error('addCard: ref required'); }
    if (typeof text !== 'string' || !text.trim()) { throw new Error('addCard: text required'); }
    var list = (Array.isArray(cards) ? cards : []).filter(function (c) { return c && c.ref !== ref; });
    list.push({ ref: ref, text: text, nextDue: nowMs, interval: LADDER_DAYS[0] });
    return list;
  }

  function removeCard(cards, ref) {
    return (Array.isArray(cards) ? cards : []).filter(function (c) { return c && c.ref !== ref; });
  }

  function validCard(c) {
    return c && typeof c.ref === 'string' && typeof c.text === 'string' &&
      typeof c.nextDue === 'number' && typeof c.interval === 'number';
  }

  /* Cards due for review, oldest-due first. Malformed stored entries are skipped. */
  function dueQueue(cards, nowMs) {
    return (Array.isArray(cards) ? cards : []).filter(function (c) {
      return validCard(c) && c.nextDue <= nowMs;
    }).sort(function (a, b) {
      return (a.nextDue - b.nextDue) || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0);
    });
  }

  function cardStats(cards, nowMs) {
    var list = (Array.isArray(cards) ? cards : []).filter(validCard);
    var due = 0, next = null;
    list.forEach(function (c) {
      if (c.nextDue <= nowMs) { due++; }
      else if (next === null || c.nextDue < next) { next = c.nextDue; }
    });
    return { total: list.length, due: due, nextDueMs: next };
  }

  /* ==================================================================
     Listen — provider selection + TTS plumbing (pure parts; no DOM)
     ================================================================== */

  /* Decide which voice path to offer. Pure: every branch is unit-tested.
     opts: { customConfigured: bool, voicesAvailable: bool } */
  function resolveListenMode(opts) {
    var custom = !!(opts && opts.customConfigured);
    var voices = !!(opts && opts.voicesAvailable);
    if (custom && voices) {
      return { mode: 'custom',
        note: 'Using your voice service. If it is unreachable, Ehyeh falls back to a built-in device voice.' };
    }
    if (custom && !voices) {
      return { mode: 'custom',
        note: 'Using your voice service. This device reports no built-in voices, so if your service is unreachable there will be no audio.' };
    }
    if (!custom && voices) {
      return { mode: 'builtin',
        note: 'Using a built-in device voice. Free, works offline, and nothing leaves your device.' };
    }
    return { mode: 'unavailable',
      note: 'No voice is available: this device reports no built-in voices and no voice service is configured. You can add your own voice service below.' };
  }

  /* Build the OpenAI-compatible audio/speech request. The key is ALWAYS a
     caller-supplied argument (read from sessionStorage at runtime) — there is
     no key, token, or credential literal anywhere in this file. */
  function ttsRequestParts(endpoint, model, voice, apiKey, text) {
    var ep = String(endpoint || '').trim();
    if (!/^https?:\/\//i.test(ep)) { throw new Error('ttsRequestParts: endpoint must be an http(s) URL'); }
    if (!apiKey) { throw new Error('ttsRequestParts: api key required'); }
    if (!text) { throw new Error('ttsRequestParts: text required'); }
    return {
      url: ep.replace(/\/+$/, '') + '/v1/audio/speech',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: model || 'tts-1',
        input: text,
        voice: voice || 'alloy',
        response_format: 'mp3'
      })
    };
  }

  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h;
  }

  function ttsCacheKey(endpoint, model, voice, text) {
    return 'tts:' + fnv1a([endpoint, model, voice, text].join('\u0000')).toString(16);
  }

  /* Resolve passage audio: IndexedDB cache first, network only on a miss.
     deps: { cache: {get,set} (async), fetchFn }. Pure async — fully testable. */
  function resolveTtsAudio(deps, key, parts) {
    return deps.cache.get(key).then(function (hit) {
      if (hit) { return { audio: hit, fromCache: true }; }
      return deps.fetchFn(parts.url, {
        method: parts.method, headers: parts.headers, body: parts.body
      }).then(function (resp) {
        if (!resp.ok) { throw new Error('voice service returned HTTP ' + resp.status); }
        return resp.blob();
      }).then(function (blob) {
        return deps.cache.set(key, blob).catch(function () {}).then(function () {
          return { audio: blob, fromCache: false };
        });
      });
    });
  }

  /* Built-in voice playback. Takes its dependencies as arguments so tests can
     prove the zero-network property: this function never references fetch. */
  function speakBuiltin(synthLike, UtterCtor, chunks, callbacks) {
    callbacks = callbacks || {};
    try { synthLike.cancel(); } catch (e) {}
    var i = 0;
    function next() {
      if (i >= chunks.length) { if (callbacks.onDone) { callbacks.onDone(); } return; }
      var u = new UtterCtor(chunks[i].text);
      if (callbacks.voice) { u.voice = callbacks.voice; }
      if (callbacks.rate) { u.rate = callbacks.rate; }
      (function (idx) {
        u.onend = function () { i = idx + 1; next(); };
        u.onerror = function (ev) { if (callbacks.onError) { callbacks.onError(ev); } };
      })(i);
      if (callbacks.onChunk) { callbacks.onChunk(i, chunks[i]); }
      synthLike.speak(u);
    }
    next();
    return { stop: function () { try { synthLike.cancel(); } catch (e) {} } };
  }

  /* ==================================================================
     Compare — alignment (pure; no DOM)
     ================================================================== */

  /* Align one chapter across N translations by verse number.
     entries: [{ id, ch }] where ch = { "<verse>": text }.
     Missing sides stay null and are shown as an honest placeholder —
     never silently misaligned. */
  function alignChapters(entries) {
    var seen = {}, nums = [];
    entries.forEach(function (e) {
      var ch = e.ch || {};
      Object.keys(ch).forEach(function (key) {
        var n = parseInt(key, 10);
        if (!isNaN(n) && !seen[n]) { seen[n] = true; nums.push(n); }
      });
    });
    nums.sort(function (a, b) { return a - b; });
    return nums.map(function (n) {
      var texts = {};
      entries.forEach(function (e) {
        var ch = e.ch || {};
        texts[e.id] = Object.prototype.hasOwnProperty.call(ch, String(n)) ? ch[String(n)] : null;
      });
      return { verse: n, texts: texts };
    });
  }

  /* Look up this chapter in versification.json (injected or fetched).
     vers = { reference, notes: { <translationId>: { mismatches: [...] } } }. */
  function versificationEntry(vers, translationId, book, chapter) {
    var per = vers && vers.notes && vers.notes[translationId];
    if (!per || !Array.isArray(per.mismatches)) { return null; }
    for (var i = 0; i < per.mismatches.length; i++) {
      var m = per.mismatches[i];
      if (m.book === book && m.chapter === chapter) { return m; }
    }
    return null;
  }

  function formatRef(books, b, c, v) {
    var name = (books && books[b - 1]) || ('Book ' + b);
    return name + ' ' + c + (v ? ':' + v : '');
  }

  var REF_ALIASES = { gen: 1, exo: 2, ex: 2, lev: 3, num: 4, deut: 5, de: 5, josh: 6,
    judg: 7, jg: 7, ruth: 8, ru: 8, '1sam': 9, '2sam': 10, '1kgs': 11, '2kgs': 12,
    '1kings': 11, '2kings': 12, '1chr': 13, '2chr': 14, '1chron': 13, '2chron': 14,
    ezra: 15, ezr: 15, neh: 16, ne: 16, est: 17, esther: 17, job: 18, ps: 19,
    psa: 19, psalm: 19, psalms: 19, prov: 20, pr: 20, eccl: 21, ecc: 21, song: 22,
    isa: 23, is: 23, jer: 24, je: 24, lam: 25, la: 25, ezek: 26, eze: 26, dan: 27,
    da: 27, hos: 28, ho: 28, joel: 29, joe: 29, amos: 30, am: 30, obad: 31, ob: 31,
    jonah: 32, jon: 32, mic: 33, mi: 33, nah: 34, na: 34, hab: 35,
    zeph: 36, zep: 36, hag: 37, hg: 37, zech: 38, zec: 38, mal: 39, ml: 39,
    matt: 40, mt: 40, mark: 41, mk: 41, mrk: 41, luke: 42, lk: 42, john: 43,
    jn: 43, jhn: 43, acts: 44, ac: 44, rom: 45, ro: 45, '1cor': 46, '2cor': 47,
    gal: 48, ga: 48, eph: 49, ep: 49, phil: 50, php: 50, col: 51, '1thess': 52,
    '2thess': 53, '1tim': 54, '2tim': 55, titus: 56, tit: 56, philem: 57,
    phm: 57, heb: 58, he: 58, james: 59, jas: 59, '1pet': 60, '2pet': 61,
    '1jn': 62, '2jn': 63, '3jn': 64, '1john': 62, '2john': 63, '3john': 64,
    jude: 65, jud: 65, rev: 66, re: 66 };

  /* "John 3:16" -> {book:43, chapter:3, verse:16}. Null when unparseable or
     out of range. Self-contained (does not depend on v2.cjs). */
  function parseRef(books, chapterCounts, str) {
    if (!books || !chapterCounts || typeof str !== 'string') { return null; }
    var s = str.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
    var m = s.match(/^([1-3]?\s?[a-z]+(?:\s+[a-z]+){0,2})\s+(\d+)(?::(\d+))?$/);
    if (!m) { return null; }
    var raw = m[1].replace(/\s+/g, '');
    var book = REF_ALIASES[raw];
    if (!book) {
      for (var i = 0; i < books.length; i++) {
        var n = books[i].toLowerCase();
        if (n === m[1] || n.replace(/\s+/g, '') === raw) { book = i + 1; break; }
      }
    }
    if (!book) { return null; }
    var chapter = parseInt(m[2], 10);
    var verse = m[3] ? parseInt(m[3], 10) : null;
    var maxCh = parseInt(chapterCounts[String(book)], 10);
    if (!maxCh || chapter < 1 || chapter > maxCh) { return null; }
    return { book: book, chapter: chapter, verse: verse };
  }

  /* ==================================================================
     Canon separation (pure; no DOM) — round-2 hardening
     ------------------------------------------------------------------
     A canon:"other" translation (e.g. 1 Enoch) is NEVER aligned to, read
     against, or labeled with Bible passage references. Its book/chapter
     keys live in its own numbering and may collide with Bible book numbers
     (1 Enoch's single book key "1" is not Genesis). These helpers enforce
     that rule for every render path.
     ================================================================== */

  /* Split a validated registry into canonical vs outside-the-canon entries. */
  function canonGroups(registry) {
    var canonical = [], other = [];
    (registry.translations || []).forEach(function (t) {
      if (t.canon === 'other') { other.push(t); } else { canonical.push(t); }
    });
    return { canonical: canonical, other: other };
  }

  /* One honest labeling line per translation, used on every tab. For
     canon:"other" it carries an explicit outside-the-canon note. */
  function translationDisclosure(t) {
    return t.short + ' — ' + t.disclosure + ' License: ' + t.license +
      (t.canon === 'other' ? ' (Note: this text is outside the Protestant canon.)' : '');
  }

  /* Verses of one translation for one BIBLE passage (Listen tab).
     A canon:"other" translation never resolves against Bible passage book
     numbers — 1 Enoch 1 is not Genesis 1 — so it returns ok:false with an
     honest empty-state message instead of someone else's chapter. */
  function listenVerses(registry, bibles, translationId, passage) {
    var t = translationById(registry, translationId);
    if (!t) {
      return { ok: false, reason: 'unknown', message: 'Unknown translation.' };
    }
    if (t.canon === 'other') {
      return { ok: false, reason: 'other-canon',
        message: t.short + ' is outside the Protestant canon, so it has no text ' +
          'for this passage. Choose a canonical translation to listen.' };
    }
    var bible = (bibles || {})[translationId] || {};
    var p = passage || {};
    var ch = (((bible[String(p.book)] || {})[String(p.chapter)] || {}));
    var verses = Object.keys(ch).map(function (k) { return parseInt(k, 10); })
      .filter(function (n) { return !isNaN(n); })
      .sort(function (a, z) { return a - z; })
      .map(function (n) { return { verse: n, text: ch[String(n)] }; });
    if (!verses.length) {
      return { ok: false, reason: 'missing',
        message: 'No text found for this passage in the ' + t.short + '.' };
    }
    return { ok: true, verses: verses };
  }

  /* One chapter of a canon:"other" translation, walked on the translation's
     OWN book/chapter keys — never against Bible passage book numbers.
     Returns null unless the entry exists, is canon:"other", and has text. */
  function otherCanonChapter(registry, bibles, translationId, chapter) {
    var t = translationById(registry, translationId);
    if (!t || t.canon !== 'other') { return null; }
    var bible = (bibles || {})[translationId];
    if (!bible || typeof bible !== 'object') { return null; }
    var bookKeys = Object.keys(bible);
    if (!bookKeys.length) { return null; }
    var bookKey = bookKeys[0];
    var book = bible[bookKey] || {};
    var chapters = Object.keys(book).map(function (k) { return parseInt(k, 10); })
      .filter(function (n) { return !isNaN(n); })
      .sort(function (a, z) { return a - z; });
    if (!chapters.length) { return null; }
    var ch = chapters.indexOf(chapter) !== -1 ? chapter : chapters[0];
    var chapObj = book[String(ch)] || {};
    var verses = Object.keys(chapObj).map(function (k) { return parseInt(k, 10); })
      .filter(function (n) { return !isNaN(n); })
      .sort(function (a, z) { return a - z; })
      .map(function (n) { return { verse: n, text: chapObj[String(n)] }; });
    return { bookKey: bookKey, chapter: ch, chapters: chapters, verses: verses };
  }

  /* ==================================================================
     Data loading — injected ctx.data first, lazy fetch as fallback
     ================================================================== */
  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) { throw new Error('HTTP ' + r.status + ' for ' + url); }
      return r.json();
    });
  }

  /* Injected-data lookup. The module accepts the registry / translation
     files from several plausible injected locations, then falls back to
     fetching relative to the page:
       1. ctx.data.registry / .versification / .translations (original contract)
       2. ctx.data.hagah.registry (shell contract: v3 data namespaced under
          .hagah, keyed by filename)
       3. ctx.data.hagah['translations/registry.json'] (if the build inlines
          the translations/ directory with path keys)
       4. fetch('data/translations/registry.json') relative to the page */
  function injectedData(ctx, key) {
    if (!ctx || !ctx.data) { return undefined; }
    if (ctx.data[key] !== undefined) { return ctx.data[key]; }
    var hg = ctx.data.hagah;
    if (hg && typeof hg === 'object') {
      if (hg[key] !== undefined) { return hg[key]; }
      if (hg['translations/' + key + '.json'] !== undefined) { return hg['translations/' + key + '.json']; }
      if (hg['translations/' + key] !== undefined) { return hg['translations/' + key]; }
    }
    return undefined;
  }

  function injectedTranslation(ctx, id) {
    if (!ctx || !ctx.data) { return undefined; }
    var maps = [ctx.data.translations,
      ctx.data.hagah && typeof ctx.data.hagah === 'object' ? ctx.data.hagah.translations : undefined];
    for (var i = 0; i < maps.length; i++) {
      if (maps[i] && maps[i][id] !== undefined) { return maps[i][id]; }
    }
    var hg = ctx.data.hagah;
    if (hg && typeof hg === 'object') {
      if (hg['translations/' + id + '.json'] !== undefined) { return hg['translations/' + id + '.json']; }
      if (hg[id + '.json'] !== undefined) { return hg[id + '.json']; }
    }
    return undefined;
  }

  /* Resolve every registered translation to its bible object.
     Returns { registry, bibles: {id: bibleObj}, vers }. */
  function ensureTranslations(ctx) {
    var reg = injectedData(ctx, 'registry');
    var regP = (reg !== undefined)
      ? Promise.resolve(reg)
      : fetchJson('data/translations/registry.json');
    return regP.then(function (r) {
      validateRegistry(r);
      var vers = injectedData(ctx, 'versification');
      var versP = (vers !== undefined)
        ? Promise.resolve(vers)
        : fetchJson('data/translations/versification.json').catch(function () { return null; });
      return versP.then(function (v) {
        var jobs = r.translations.map(function (t) {
          var dataP;
          if (t.providedBy === 'shell') {
            dataP = (ctx && ctx.data && ctx.data.bible)
              ? Promise.resolve({ bible: ctx.data.bible })
              : Promise.reject(new Error(
                  'translation "' + t.id + '" is shell-provided but the shell did not inject ctx.data.bible'));
          } else {
            var inj = injectedTranslation(ctx, t.id);
            dataP = (inj !== undefined)
              ? Promise.resolve(inj)
              : fetchJson(t.file).catch(function (err) {
                  throw new Error('could not load "' + t.id + '" from ' + t.file + ': ' + err.message);
                });
          }
          return dataP.then(function (data) {
            validateBibleData(t, data);
            return { id: t.id, bible: data.bible };
          });
        });
        return Promise.all(jobs).then(function (parts) {
          var bibles = {};
          parts.forEach(function (p) { bibles[p.id] = p.bible; });
          return { registry: r, bibles: bibles, vers: v };
        });
      });
    });
  }

  /* ==================================================================
     Browser mount
     ================================================================== */
  var SS_TTS = { endpoint: 'hagah.tts.endpoint', model: 'hagah.tts.model',
    voice: 'hagah.tts.voice', key: 'hagah.tts.key' };

  function ssGet(k) {
    try { return window.sessionStorage.getItem(k) || ''; } catch (e) { return ''; }
  }
  function ssSet(k, v) {
    try {
      if (v) { window.sessionStorage.setItem(k, v); }
      else { window.sessionStorage.removeItem(k); }
    } catch (e) {}
  }

  function hasSpeech() {
    return (typeof window !== 'undefined') && ('speechSynthesis' in window) &&
      typeof window.SpeechSynthesisUtterance !== 'undefined';
  }
  function currentVoices() {
    try { return window.speechSynthesis.getVoices() || []; } catch (e) { return []; }
  }

  /* Minimal promise wrapper turning IndexedDB into an async {get,set} store. */
  function idbStore() {
    function openDb() {
      return new Promise(function (resolve, reject) {
        try {
          var req = window.indexedDB.open('hagah-tts', 1);
          req.onupgradeneeded = function () {
            req.result.createObjectStore('audio', { keyPath: 'key' });
          };
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { reject(req.error); };
        } catch (e) { reject(e); }
      });
    }
    var dbP = null;
    function db() { if (!dbP) { dbP = openDb(); } return dbP; }
    function tx(mode, fn) {
      return db().then(function (d) {
        return new Promise(function (resolve, reject) {
          try {
            var t = d.transaction('audio', mode);
            var st = t.objectStore('audio');
            var req = fn(st);
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
          } catch (e) { reject(e); }
        });
      });
    }
    return {
      get: function (k) {
        return tx('readonly', function (st) { return st.get(k); })
          .then(function (row) { return (row && row.blob) || null; })
          .catch(function () { return null; });
      },
      set: function (k, blob) {
        return tx('readwrite', function (st) { return st.put({ key: k, blob: blob, savedAt: Date.now() }); })
          .then(function () {});
      }
    };
  }

  function mount(panelEl, ctx) {
    var H = ctx.h;
    function clear(n) { while (n.firstChild) { n.removeChild(n.firstChild); } }
    /* el(tag, attrs, ...kids) — spread form, per the ctx.h contract. */
    function el(tag, attrs) {
      var kids = [];
      for (var i = 2; i < arguments.length; i++) {
        var kd = arguments[i];
        if (Array.isArray(kd)) {
          for (var j = 0; j < kd.length; j++) {
            if (kd[j] !== undefined && kd[j] !== null) { kids.push(kd[j]); }
          }
        } else if (kd !== undefined && kd !== null) { kids.push(kd); }
      }
      return H.apply(null, [tag, attrs || {}].concat(kids));
    }
    function txt(s) { return String(s); }
    /* Contract-idiomatic listener attach (shell: use addEventListener). */
    function on(node, ev, fn) {
      if (node.addEventListener) { node.addEventListener(ev, fn); }
      else { node["on" + ev] = fn; } // non-DOM stub fallback
    }
    function note(text, cls) {
      return el('p', { 'class': 'clm-note' + (cls ? ' ' + cls : '') }, txt(text));
    }

    var state = {
      tab: 'compare', renderSeq: 0,
      registry: null, bibles: null, vers: null, dataError: null, dataLoading: false,
      listen: { mode: null, playing: false, paused: false, voiceURI: '', rate: 1,
                source: null, ctl: null, audioEl: null,
                customFailed: false, customFailedMsg: '' },
      review: { queue: [], idx: 0, revealed: false },
      storeFallback: null, storeFailed: false
    };
    try { state.listen.voiceURI = ctx.store.get('voiceUri', ''); } catch (e) {}
    try { state.listen.rate = parseFloat(ctx.store.get('rate', '1')) || 1; } catch (e) {}

    function books() { return (ctx.data && ctx.data.books) || []; }
    function chapterVerses(bibleObj, b, c) {
      return (((bibleObj || {})[String(b)] || {})[String(c)] || {});
    }
    function verseText(bibleObj, b, c, v) {
      var ch = chapterVerses(bibleObj, b, c);
      return Object.prototype.hasOwnProperty.call(ch, String(v)) ? ch[String(v)] : null;
    }
    function refBible() {
      return state.bibles ? state.bibles[state.registry.reference] : null;
    }

    /* Load + validate the registry and every translation, once. */
    function loadTranslations(done) {
      if (state.registry || state.dataError) { done(); return; }
      if (state.dataLoading) {
        var iv = setInterval(function () {
          if (!state.dataLoading) { clearInterval(iv); done(); }
        }, 120);
        return;
      }
      state.dataLoading = true;
      var seq = state.renderSeq;
      ensureTranslations(ctx).then(function (d) {
        if (seq !== state.renderSeq) { return; } // a newer render took over
        state.registry = d.registry; state.bibles = d.bibles; state.vers = d.vers;
        if (!state.listen.source) { state.listen.source = d.registry.reference; }
      }).catch(function (err) {
        if (seq !== state.renderSeq) { return; }
        state.dataError = (err && err.message) || 'could not load translation data';
      }).then(function () { state.dataLoading = false; done(); });
    }

    function stopAudio() {
      var L = state.listen;
      if (L.ctl) { try { L.ctl.stop(); } catch (e) {} L.ctl = null; }
      if (L.audioEl) { try { L.audioEl.pause(); } catch (e) {} L.audioEl = null; }
      L.playing = false; L.paused = false;
    }

    /* ---------------- header + tabs ---------------- */
    function render() {
      clear(panelEl);
      state.renderSeq++;
      var modeName = ctx.mode === 'sermon' ? 'Sermon Prep' : 'Personal Study';
      panelEl.appendChild(el('p', { 'class': 'clm-mode' }, txt('Mode: ' + modeName)));
      var tabs = el('div', { 'class': 'clm-tabs', role: 'tablist' });
      [['compare', 'Compare'], ['listen', 'Listen'], ['memory', 'Memory verses']].forEach(function (t) {
        var b = el('button', {
          'class': 'clm-tab' + (state.tab === t[0] ? ' active' : ''),
          role: 'tab', 'data-tab': t[0], 'aria-selected': state.tab === t[0] ? 'true' : 'false'
        }, txt(t[1]));
        on(b, 'click', function () { stopAudio(); state.tab = t[0]; render(); });
        tabs.appendChild(b);
      });
      panelEl.appendChild(tabs);
      var body = el('div', { 'class': 'clm-body' });
      panelEl.appendChild(body);
      if (state.tab === 'compare') { renderCompare(body); }
      else if (state.tab === 'listen') { renderListen(body); }
      else { renderMemory(body); }
    }

    /* ---------------- Compare tab ---------------- */
    function renderCompare(body) {
      var p = ctx.passage || {};
      var b = p.book, c = p.chapter;
      if (!b || !c) {
        body.appendChild(note('Open a passage first, then come back to compare translations.'));
        return;
      }
      var refLine = formatRef(books(), b, c, null);
      var seq = state.renderSeq;
      loadTranslations(function () {
        if (seq !== state.renderSeq) { return; } // stale async callback
        if (state.dataError) {
          body.appendChild(note('Translation data could not be loaded: ' + state.dataError +
            '. Check your connection and reopen this tab.'));
          return;
        }
        if (!state.registry) { body.appendChild(note('Loading translations…')); return; }
        var groups = canonGroups(state.registry);
        var trs = groups.canonical;   // Bible-canonical translations only
        var otherTrs = groups.other;  // canon:"other" — never aligned to Bible rows
        if (trs.length) {
          renderCanonicalCompare(body, trs, refLine, b, c);
        }

        // Round-2: canon:"other" translations (1 Enoch) are NEVER aligned to
        // or labeled with Bible passage references. Each gets its own
        // clearly-labeled section with independent chapter navigation.
        otherTrs.forEach(function (t) {
          renderOtherSection(body, t);
        });
      });
    }

    /* Verse-by-verse table for the Bible-canonical translations only. */
    function renderCanonicalCompare(body, trs, refLine, b, c) {
      body.appendChild(el('h3', {}, txt(refLine + ' — ' +
        trs.map(function (t) { return t.short; }).join(' and ') + ', verse by verse')));

      var entries = trs.map(function (t) {
        return { id: t.id, ch: chapterVerses(state.bibles[t.id], b, c) };
      });
      if (!entries.some(function (e) { return Object.keys(e.ch).length; })) {
        body.appendChild(note('No text found for ' + refLine + ' in any loaded translation.'));
        return;
      }
      // Honest versification notes, per non-reference translation.
      var refT = translationById(state.registry, state.registry.reference);
      trs.forEach(function (t) {
        if (t.id === state.registry.reference) { return; }
        var m = versificationEntry(state.vers, t.id, b, c);
        if (m) {
          var refCount = (refT && refT.versification) ? m[refT.versification + '_verses'] : undefined;
          var tCount = t.versification ? m[t.versification + '_verses'] : undefined;
          var msg = t.short + ': verse numbering differs here';
          if (typeof refCount === 'number' && typeof tCount === 'number') {
            msg += ' — the ' + refT.short + ' has ' + refCount +
              ' verses in this chapter and the ' + t.short + ' has ' + tCount;
          }
          msg += '. Same words, split or joined differently — read neighboring rows together.';
          if (m.note) { msg += ' ' + m.note; }
          body.appendChild(note(msg, 'warn'));
        }
      });

      var rows = alignChapters(entries);
      var table = el('table', { 'class': 'clm-compare' });
      var head = el('tr', {});
      head.appendChild(el('th', {}, txt('Verse')));
      trs.forEach(function (t) { head.appendChild(el('th', {}, txt(t.short))); });
      table.appendChild(head);
      rows.forEach(function (r) {
        var tr = el('tr', {});
        tr.appendChild(el('td', { 'class': 'clm-vnum' }, txt(String(r.verse))));
        trs.forEach(function (t) {
          var cellText = r.texts[t.id];
          tr.appendChild(el('td', { 'class': 'clm-cell' },
            cellText !== null ? txt(cellText)
              : el('span', { 'class': 'clm-missing' },
                  txt('— not numbered separately in the ' + t.short))));
        });
        table.appendChild(tr);
      });
      body.appendChild(table);

      // Honest per-translation labeling: disclosure + license, from the registry.
      trs.forEach(function (t) {
        body.appendChild(note(translationDisclosure(t)));
      });
    }

    /* A canon:"other" translation gets its own clearly-labeled section —
       its own disclosure, its own chapter navigation independent of the
       Bible passage, and rows labeled with ITS OWN numbering, never with
       Bible references. */
    function renderOtherSection(body, t) {
      body.appendChild(el('h3', {}, txt('Ancient writings — ' + t.short)));
      body.appendChild(note(translationDisclosure(t)));
      body.appendChild(note('Chapter and verse numbers below follow the ' + t.short +
        ', not the Bible passage above — this text is outside the Protestant canon.'));

      var cur = (state.otherChapter && state.otherChapter[t.id]) || 1;
      var info = otherCanonChapter(state.registry, state.bibles, t.id, cur);
      if (!info) {
        body.appendChild(note('No text found for ' + t.short + ' in the loaded data.'));
        return;
      }
      state.otherChapter = state.otherChapter || {};
      state.otherChapter[t.id] = info.chapter;

      var nav = el('div', { 'class': 'clm-row' });
      var prevBtn = el('button', { 'class': 'clm-btn' }, txt('◀ Previous chapter'));
      var nextBtn = el('button', { 'class': 'clm-btn' }, txt('Next chapter ▶'));
      var first = info.chapters[0], last = info.chapters[info.chapters.length - 1];
      if (info.chapter <= first) { prevBtn.disabled = true; }
      if (info.chapter >= last) { nextBtn.disabled = true; }
      on(prevBtn, 'click', function () {
        state.otherChapter[t.id] = info.chapter - 1; render();
      });
      on(nextBtn, 'click', function () {
        state.otherChapter[t.id] = info.chapter + 1; render();
      });
      var sel = el('select', { 'class': 'clm-select', 'aria-label': t.short + ' chapter' });
      info.chapters.forEach(function (n) {
        var o = el('option', { value: String(n) }, txt(t.short + ' ' + n));
        if (n === info.chapter) { o.selected = true; }
        sel.appendChild(o);
      });
      on(sel, 'change', function () {
        state.otherChapter[t.id] = parseInt(sel.value, 10); render();
      });
      nav.appendChild(prevBtn); nav.appendChild(sel); nav.appendChild(nextBtn);
      body.appendChild(nav);

      var list = el('ul', { 'class': 'clm-list' });
      info.verses.forEach(function (vv) {
        var li = el('li', {});
        li.appendChild(el('span', { 'class': 'clm-vnum' },
          txt(t.short + ' ' + info.chapter + ':' + vv.verse)));
        li.appendChild(el('span', {}, txt(' ' + vv.text)));
        list.appendChild(li);
      });
      body.appendChild(list);
    }

    /* ---------------- Listen tab ---------------- */
    function ttsConfigured() { return !!ssGet(SS_TTS.endpoint); }

    /* After a custom-endpoint failure we stop offering it until the user
       changes settings or reloads: customFailed forces the builtin path. */
    function listenMode() {
      return resolveListenMode({
        customConfigured: ttsConfigured() && !state.listen.customFailed,
        voicesAvailable: hasSpeech() && currentVoices().length > 0
      });
    }

    function renderListen(body) {
      var p = ctx.passage || {};
      if (!p.book || !p.chapter) {
        body.appendChild(note('Open a passage first, then come back to listen.'));
        return;
      }
      var refLine = formatRef(books(), p.book, p.chapter, null);
      var seq = state.renderSeq;
      loadTranslations(function () {
        if (seq !== state.renderSeq) { return; }
        if (state.dataError) {
          body.appendChild(note('Translation data could not be loaded: ' + state.dataError + '.'));
          return;
        }
        if (!state.registry) { body.appendChild(note('Loading translations…')); return; }
        renderListenBody(body, refLine, p);
      });
    }

    function renderListenBody(body, refLine, p) {
      body.appendChild(el('h3', {}, txt('Listen — ' + refLine)));

      // Translation choice for the read-aloud, driven by the registry.
      var srcRow = el('div', { 'class': 'clm-row' });
      srcRow.appendChild(el('span', {}, txt('Read aloud: ')));
      state.registry.translations.forEach(function (t) {
        var lab = el('label', { 'class': 'clm-radio' });
        var radio = H('input', { type: 'radio', name: 'clm-src', value: t.id });
        radio.checked = state.listen.source === t.id;
        on(radio, 'change', function () { stopAudio(); state.listen.source = t.id; render(); });
        lab.appendChild(radio);
        lab.appendChild(el('span', {}, txt(t.short)));
        srcRow.appendChild(lab);
      });
      body.appendChild(srcRow);

      // Round-2: the listen tab renders the same per-translation disclosure
      // as the compare tab, including the explicit outside-the-canon note
      // for any canon:"other" translation.
      var sel = translationById(state.registry, state.listen.source);
      if (sel) { body.appendChild(note(translationDisclosure(sel))); }

      var mode = listenMode();
      state.listen.mode = mode.mode;
      if (state.listen.customFailed) {
        body.appendChild(note('Your voice service could not be reached (' +
          state.listen.customFailedMsg + '). It is switched off for this session — ' +
          'nothing was charged. ' +
          (mode.mode === 'builtin'
            ? 'A built-in device voice is offered below instead.'
            : 'This device also has no built-in voices, so no audio is available right now.'),
          'warn'));
      } else {
        body.appendChild(note(mode.note));
      }

      if (mode.mode === 'unavailable') {
        body.appendChild(renderTtsSettings());
        return;
      }

      // Round-2: listenVerses() refuses to resolve a canon:"other"
      // translation against Bible passage book numbers, so a canon:"other"
      // text is never read aloud under a Bible header and the status readout
      // can never announce its verses with a Bible reference.
      var lv = listenVerses(state.registry, state.bibles, state.listen.source, p);
      if (!lv.ok) {
        body.appendChild(note(lv.message));
        body.appendChild(renderTtsSettings());
        return;
      }
      var verses = lv.verses;

      var controls = el('div', { 'class': 'clm-row' });
      var playBtn = el('button', { 'class': 'clm-btn' }, txt('▶ Play'));
      var pauseBtn = el('button', { 'class': 'clm-btn' }, txt('⏸ Pause'));
      var stopBtn = el('button', { 'class': 'clm-btn' }, txt('⏹ Stop'));
      controls.appendChild(playBtn); controls.appendChild(pauseBtn); controls.appendChild(stopBtn);

      if (mode.mode === 'builtin') {
        var voices = currentVoices();
        var vlabel = el('label', {}, txt('Voice: '));
        var vsel = el('select', { 'class': 'clm-select', 'aria-label': 'Voice' });
        var enFirst = voices.slice().sort(function (a, b) {
          var ae = /^en/i.test(a.lang || ''), be = /^en/i.test(b.lang || '');
          return (ae === be) ? 0 : ae ? -1 : 1;
        });
        enFirst.forEach(function (v, i) {
          var o = el('option', { value: v.voiceURI || String(i) },
            txt((v.name || 'Voice') + (v.lang ? ' (' + v.lang + ')' : '')));
          if ((v.voiceURI || String(i)) === state.listen.voiceURI) { o.selected = true; }
          vsel.appendChild(o);
        });
        if (!state.listen.voiceURI && enFirst.length) {
          state.listen.voiceURI = enFirst[0].voiceURI || '0';
        }
        on(vsel, 'change', function () {
          state.listen.voiceURI = vsel.value;
          try { ctx.store.set('voiceUri', vsel.value); } catch (e) {}
        });
        vlabel.appendChild(vsel);
        controls.appendChild(vlabel);

        var rlabel = el('label', {}, txt('Speed: '));
        var rate = H('input', { type: 'range', min: '0.7', max: '1.3', step: '0.1' });
        rate.value = String(state.listen.rate);
        on(rate, 'change', function () {
          state.listen.rate = parseFloat(rate.value) || 1;
          try { ctx.store.set('rate', String(state.listen.rate)); } catch (e) {}
        });
        rlabel.appendChild(rate);
        controls.appendChild(rlabel);

        var status = el('p', { 'class': 'clm-status' }, txt('Ready.'));
        on(playBtn, 'click', function () {
          stopAudio();
          var chunks = verses.map(function (vv) {
            return { ref: formatRef(books(), p.book, p.chapter, vv.verse), text: vv.text };
          });
          var voiceObj = null;
          currentVoices().forEach(function (v) {
            if ((v.voiceURI || '') === state.listen.voiceURI) { voiceObj = v; }
          });
          state.listen.playing = true;
          status.textContent = 'Playing…';
          state.listen.ctl = speakBuiltin(window.speechSynthesis, window.SpeechSynthesisUtterance,
            chunks, {
              voice: voiceObj,
              rate: state.listen.rate,
              onChunk: function (i, ch) { status.textContent = 'Playing ' + ch.ref + '…'; },
              onDone: function () { state.listen.playing = false; status.textContent = 'Finished.'; },
              onError: function () {
                state.listen.playing = false;
                status.textContent = 'The voice stopped unexpectedly. Try pressing Play again.';
              }
            });
        });
        on(pauseBtn, 'click', function () {
          try {
            if (state.listen.paused) { window.speechSynthesis.resume(); state.listen.paused = false; }
            else { window.speechSynthesis.pause(); state.listen.paused = true; }
          } catch (e) {}
        });
        on(stopBtn, 'click', function () { stopAudio(); status.textContent = 'Stopped.'; });
        body.appendChild(controls);
        body.appendChild(status);
      } else {
        // mode.mode === 'custom'
        var cstatus = el('p', { 'class': 'clm-status' }, txt('Ready.'));
        on(playBtn, 'click', function () {
          stopAudio();
          var fullText = verses.map(function (vv) { return vv.text; }).join(' ');
          var endpoint = ssGet(SS_TTS.endpoint), model = ssGet(SS_TTS.model),
            voice = ssGet(SS_TTS.voice), apiKey = ssGet(SS_TTS.key);
          var parts;
          try {
            parts = ttsRequestParts(endpoint, model, voice, apiKey, fullText);
          } catch (err) {
            cstatus.textContent = 'Check your voice-service settings: ' + err.message;
            return;
          }
          var key = ttsCacheKey(endpoint, model || 'tts-1', voice || 'alloy', fullText);
          cstatus.textContent = 'Fetching audio…';
          var cache = (typeof window.indexedDB !== 'undefined') ? idbStore()
            : { get: function () { return Promise.resolve(null); },
                set: function () { return Promise.resolve(); } };
          resolveTtsAudio({ cache: cache, fetchFn: function (url, opts) { return fetch(url, opts); } }, key, parts).then(function (r) {
            var url = URL.createObjectURL(r.audio);
            var audio = new Audio(url);
            state.listen.audioEl = audio;
            state.listen.playing = true;
            cstatus.textContent = r.fromCache ? 'Playing (from this device’s cache)…'
              : 'Playing… (audio is cached on this device for next time)';
            audio.onended = function () {
              state.listen.playing = false;
              cstatus.textContent = 'Finished.';
              URL.revokeObjectURL(url);
            };
            audio.onerror = function () {
              state.listen.playing = false;
              cstatus.textContent = 'Could not play the audio that came back.';
            };
            audio.play().catch(function () {
              state.listen.playing = false;
              cstatus.textContent = 'Playback was blocked by the browser. Press Play again.';
            });
          }).catch(function (err) {
            // Honest fallback: the endpoint failed — say so, stop offering it
            // this session, and fall through to a built-in voice if one exists.
            state.listen.customFailed = true;
            state.listen.customFailedMsg = (err && err.message) || 'network error';
            render();
          });
        });
        on(pauseBtn, 'click', function () {
          if (state.listen.audioEl) {
            try {
              if (state.listen.audioEl.paused) { state.listen.audioEl.play(); }
              else { state.listen.audioEl.pause(); }
            } catch (e) {}
          }
        });
        on(stopBtn, 'click', function () { stopAudio(); cstatus.textContent = 'Stopped.'; });
        body.appendChild(controls);
        body.appendChild(cstatus);
      }
      body.appendChild(renderTtsSettings());
    }

    /* Optional voice-service settings. Endpoint + key live in sessionStorage
       ONLY — never in code, never in localStorage. Every field starts empty. */
    function renderTtsSettings() {
      var box = el('details', { 'class': 'clm-details' });
      box.appendChild(el('summary', {}, txt('Use your own voice service (optional)')));
      box.appendChild(note('OpenAI-compatible audio/speech endpoint. Stored only in this ' +
        'browser session (sessionStorage) — it is never saved to disk by Ehyeh, never ' +
        'put in code, and sent only to your endpoint. Leave blank to use free built-in voices.'));
      function field(labelText, key, secret) {
        var row = el('label', { 'class': 'clm-field' }, txt(labelText + ' '));
        var inp = H('input', { type: secret ? 'password' : 'text', 'class': 'clm-input',
          autocomplete: 'off', spellcheck: 'false' });
        inp.value = ssGet(key);
        on(inp, 'change', function () { ssSet(key, inp.value.trim()); });
        row.appendChild(inp);
        return row;
      }
      box.appendChild(field('Endpoint URL', SS_TTS.endpoint, false));
      box.appendChild(field('Model', SS_TTS.model, false));
      box.appendChild(field('Voice', SS_TTS.voice, false));
      box.appendChild(field('API key', SS_TTS.key, true));
      var clearBtn = el('button', { 'class': 'clm-btn' }, txt('Forget this session’s service'));
      on(clearBtn, 'click', function () {
        Object.keys(SS_TTS).forEach(function (k) { ssSet(SS_TTS[k], ''); });
        state.listen.customFailed = false; state.listen.customFailedMsg = '';
        render();
      });
      box.appendChild(clearBtn);
      return box;
    }

    /* ---------------- Memory tab ---------------- */
    /* The shell's store is fail-loud (throws on quota/unavailable storage).
       We never silently lose the user's verses: a failed write keeps them in
       memory for the session and says so honestly. */
    function loadCards() {
      if (state.storeFallback) { return state.storeFallback.slice(); }
      var raw = null;
      try { raw = ctx.store.get('memory', []); } catch (e) { raw = []; }
      return Array.isArray(raw) ? raw.filter(validCard) : [];
    }
    function saveCards(cards) {
      try {
        ctx.store.set('memory', cards);
        state.storeFallback = null; state.storeFailed = false;
      } catch (e) {
        state.storeFallback = cards.slice();
        state.storeFailed = true;
      }
    }
    function notify(msg) {
      try { if (typeof ctx.notify === 'function') { ctx.notify(msg); } } catch (e) {}
    }

    function renderMemory(body) {
      var seq = state.renderSeq;
      loadTranslations(function () {
        if (seq !== state.renderSeq) { return; }
        if (state.dataError) {
          body.appendChild(note('Translation data could not be loaded: ' + state.dataError + '.'));
          return;
        }
        if (!state.registry) { body.appendChild(note('Loading translations…')); return; }
        renderMemoryBody(body);
      });
    }

    function renderMemoryBody(body) {
      var cards = loadCards();
      var nowMs = Date.now();
      var stats = cardStats(cards, nowMs);
      var queue = dueQueue(cards, nowMs);

      body.appendChild(el('h3', {}, txt('Memory verses — “hide it in thine heart”')));
      var statLine = stats.due > 0
        ? stats.due + ' due for review · ' + stats.total + ' verses kept'
        : stats.total + ' verses kept' +
          (stats.nextDueMs ? ' · next review ' + new Date(stats.nextDueMs).toLocaleDateString() : '');
      body.appendChild(el('p', { 'class': 'clm-stats' }, txt(statLine)));
      if (state.storeFailed) {
        body.appendChild(note('Device storage is unavailable — your verses are kept ' +
          'for this session only and will not survive a reload.', 'warn'));
      }

      if (queue.length) {
        var st = state.review;
        if (!st.queue.length || st.idx >= st.queue.length) {
          st.queue = queue; st.idx = 0; st.revealed = false;
        }
        var card = st.queue[st.idx];
        var cardBox = el('div', { 'class': 'clm-card' });
        cardBox.appendChild(el('p', { 'class': 'clm-card-ref' }, txt(card.ref)));
        if (!st.revealed) {
          var showBtn = el('button', { 'class': 'clm-btn' }, txt('Show verse'));
          on(showBtn, 'click', function () { st.revealed = true; render(); });
          cardBox.appendChild(showBtn);
          cardBox.appendChild(note('Say it from memory first, then show it.'));
        } else {
          cardBox.appendChild(el('p', { 'class': 'clm-card-text' }, txt(card.text)));
          cardBox.appendChild(el('p', { 'class': 'clm-grade-label' },
            txt('How well did you remember it?')));
          var grades = el('div', { 'class': 'clm-row' });
          [['again', 'Again'], ['hard', 'Hard'], ['good', 'Good'], ['easy', 'Easy']]
            .forEach(function (g) {
              var gb = el('button', { 'class': 'clm-btn' }, txt(g[1]));
              on(gb, 'click', function () {
                var all = loadCards();
                var next = all.map(function (c) {
                  return c.ref === card.ref ? gradeCard(c, g[0], Date.now()) : c;
                });
                saveCards(next);
                st.idx++; st.revealed = false;
                render();
              });
              grades.appendChild(gb);
            });
          cardBox.appendChild(grades);
          cardBox.appendChild(note('Again: back to tomorrow · Hard: same wait · ' +
            'Good: longer · Easy: much longer.'));
        }
        cardBox.appendChild(el('p', { 'class': 'clm-progress' },
          txt('Card ' + (st.idx + 1) + ' of ' + st.queue.length + ' due')));
        body.appendChild(cardBox);
      } else {
        body.appendChild(note(stats.total
          ? 'Nothing is due right now. Come back later — the queue keeps the schedule.'
          : 'No verses yet. Add your first verse below.'));
      }

      // Add a verse from the current passage (reference translation text).
      var p = ctx.passage || {};
      if (p.book && p.chapter && state.registry) {
        body.appendChild(el('h4', {}, txt('Add a verse from ' +
          formatRef(books(), p.book, p.chapter, null))));
        var ch = chapterVerses(refBible(), p.book, p.chapter);
        var nums = Object.keys(ch).map(Number).filter(function (n) { return !isNaN(n); })
          .sort(function (a, z) { return a - z; });
        if (nums.length) {
          var row = el('div', { 'class': 'clm-row' });
          var sel = el('select', { 'class': 'clm-select', 'aria-label': 'Verse to add' });
          nums.forEach(function (n) {
            sel.appendChild(el('option', { value: String(n) },
              txt(formatRef(books(), p.book, p.chapter, n))));
          });
          var addBtn = el('button', { 'class': 'clm-btn' }, txt('Add verse'));
          var addMsg = el('p', { 'class': 'clm-status' }, txt(''));
          on(addBtn, 'click', function () {
            var v = parseInt(sel.value, 10);
            var ref = formatRef(books(), p.book, p.chapter, v);
            var text = ch[String(v)];
            try {
              saveCards(addCard(loadCards(), ref, text, Date.now()));
              addMsg.textContent = 'Added ' + ref + ' — it is due for review now.';
              notify('Added ' + ref + ' to memory verses.');
            } catch (err) { addMsg.textContent = err.message; }
            render();
          });
          row.appendChild(sel); row.appendChild(addBtn);
          body.appendChild(row);
          body.appendChild(addMsg);
        }
      }

      // Add any verse by reference (reference translation first, then others).
      if (state.registry) {
        body.appendChild(el('h4', {}, txt('Add any verse')));
        var rrow = el('div', { 'class': 'clm-row' });
        var rinp = H('input', { type: 'text', 'class': 'clm-input',
          placeholder: '', 'aria-label': 'Verse reference, for example John 3:16' });
        var radd = el('button', { 'class': 'clm-btn' }, txt('Add'));
        var rmsg = el('p', { 'class': 'clm-status' }, txt(''));
        on(radd, 'click', function () {
          var parsed = parseRef(books(), (ctx.data && ctx.data.chapter_counts) || {}, rinp.value);
          if (!parsed || !parsed.verse) {
            rmsg.textContent = 'Type a full reference like "John 3:16".';
            return;
          }
          var text = null;
          var order = [state.registry.reference].concat(
            state.registry.translations.map(function (t) { return t.id; })
              .filter(function (id) { return id !== state.registry.reference; }));
          for (var i = 0; i < order.length && text === null; i++) {
            text = verseText(state.bibles[order[i]], parsed.book, parsed.chapter, parsed.verse);
          }
          if (text === null) {
            rmsg.textContent = 'That verse was not found in the loaded translations.';
            return;
          }
          try {
            saveCards(addCard(loadCards(),
              formatRef(books(), parsed.book, parsed.chapter, parsed.verse), text, Date.now()));
            rmsg.textContent = 'Added — it is due for review now.';
            notify('Added ' + formatRef(books(), parsed.book, parsed.chapter, parsed.verse) + ' to memory verses.');
          } catch (err) { rmsg.textContent = err.message; }
          render();
        });
        rrow.appendChild(rinp); rrow.appendChild(radd);
        body.appendChild(rrow);
        body.appendChild(rmsg);
        body.appendChild(note('Type a reference like "John 3:16" — nothing is filled in for you.'));
      }

      // All kept verses.
      if (cards.length) {
        body.appendChild(el('h4', {}, txt('Kept verses')));
        var list = el('ul', { 'class': 'clm-list' });
        cards.slice().sort(function (a, b) { return a.nextDue - b.nextDue; }).forEach(function (c) {
          var li = el('li', {});
          li.appendChild(el('span', {}, txt(c.ref + ' — due ' +
            new Date(c.nextDue).toLocaleDateString() + ' ')));
          var del = el('button', { 'class': 'clm-btn clm-small' }, txt('Remove'));
          on(del, 'click', function () {
            saveCards(removeCard(loadCards(), c.ref));
            notify('Removed ' + c.ref + ' from memory verses.');
            render();
          });
          li.appendChild(del);
          list.appendChild(li);
        });
        body.appendChild(list);
      }
    }

    // Shell subscriptions, tracked so unmount() can release them.
    // Every mount receives a fresh ctx; listeners are per-mount (no leaks).
    var unsubs = [];
    function subscribe(regFn) {
      try {
        var u = regFn();
        if (typeof u === 'function') { unsubs.push(u); }
      } catch (e) {}
    }

    // Re-check built-in voices when they arrive late (some platforms).
    try {
      if (hasSpeech() && window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = function () {
          if (state.tab === 'listen') { render(); }
        };
        state.voicesHooked = true;
      }
    } catch (e) {}

    if (typeof ctx.onModeChange === 'function') {
      subscribe(function () { return ctx.onModeChange(function () { render(); }); });
    }
    // Follow the shared passage (the shell contract provides this; the
    // original workstream contract did not, so subscribe defensively).
    if (typeof ctx.onPassageChange === 'function') {
      subscribe(function () { return ctx.onPassageChange(function () { stopAudio(); render(); }); });
    }

    render();
    return {
      unmount: function () {
        stopAudio();
        unsubs.forEach(function (u) { try { u(); } catch (e) {} });
        try {
          if (state.voicesHooked && hasSpeech()) { window.speechSynthesis.onvoiceschanged = null; }
        } catch (e) {}
        try { clear(panelEl); } catch (e) {}
      }
    };
  }

  return {
    META: META,
    mount: mount,
    ensureTranslations: ensureTranslations,
    /* registry */
    validateRegistry: validateRegistry, validateBibleData: validateBibleData,
    translationById: translationById,
    /* spaced repetition */
    LADDER_DAYS: LADDER_DAYS, DAY_MS: DAY_MS,
    gradeCard: gradeCard, addCard: addCard, removeCard: removeCard,
    dueQueue: dueQueue, cardStats: cardStats, validCard: validCard,
    /* listen */
    resolveListenMode: resolveListenMode, ttsRequestParts: ttsRequestParts,
    ttsCacheKey: ttsCacheKey, fnv1a: fnv1a,
    resolveTtsAudio: resolveTtsAudio, speakBuiltin: speakBuiltin,
    /* compare */
    alignChapters: alignChapters, versificationEntry: versificationEntry,
    formatRef: formatRef, parseRef: parseRef,
    /* canon separation (round-2 hardening) */
    canonGroups: canonGroups, translationDisclosure: translationDisclosure,
    listenVerses: listenVerses, otherCanonChapter: otherCanonChapter
  };
}));

window.__hagahModuleQueue.push(module.exports);
})();
