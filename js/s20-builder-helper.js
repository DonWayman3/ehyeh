/* ==========================================================================
   Ehyeh Sermon Builder — Helper tier + "Bring it into today" (s20).
   Donnie, 2026-10-29: the Helper joins the Sermon Builder, and the
   product works WITHOUT any person behind the curtain — every door
   here is a self-contained service of the app (the ask-door endpoint
   and the news shelves are standing services on the app's own server).

   TIER ORDER on the topic path (s03 owns the first three):
   prepared set (confident) -> all-topics engine -> THIS helper tier.
   The helper tier is never automatic — it costs one bounded call, so
   it runs only when the preacher taps it, and the answer is cached on
   this device per topic so it is never asked twice.

   VERIFICATION GATE (non-negotiable): the helper proposes passage
   references; EVERY one is mechanically resolved against Ehyeh's own
   Bible text (SSB.parseReference + getVerseText) before it can
   appear. Unresolvable references are dropped silently, never shown.
   Point titles are drawn from the passages' own words ("What <ref>
   shows" as the fallback) — helper prose never becomes a title, and
   nothing here writes sermon text. Applied suggestions carry the
   helper banner and clear exactly like the other tiers (s03).

   "BRING IT INTO TODAY" per main point, three grounds, honestly
   labeled: today's news (the server's news shelves — real items,
   source + date shown), past events (retained archive + Wikipedia,
   source + the EVENT's date shown), or something the preacher saw
   himself (he pastes or describes it). No shelf fit -> the screen
   says so plainly and an everyday-situation idea is offered instead,
   clearly a different kind of suggestion. Kept ideas join the
   sermon's present-day ideas and print under the print contract;
   dropped ideas vanish. The helper reads headlines and summaries
   from the app's news shelves — it does not open full articles.

   Pure logic is UMD-exported for the Node self-check (SSB injected
   via _setSSB, same pattern as s19); the browser layer attaches
   window.EHYEH_BUILDER_HELPER and injects its cards into s03's
   Structure DOM (s03's model is written only through the
   window.__ehyehBuilder bridge — single owner).
   ========================================================================== */
(function (root, factory) {
  'use strict';
  var API = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (root) { root.EHYEH_BUILDER_HELPER = API; }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  var ASK_URL = 'api/ehyeh-ask'; /* preview-scoped route: the preview
     server proxies this path to the preview ask service. The live
     app's own helper door (s17) keeps its absolute route. */
  var CACHE_KEY = 'ehyeh.builderHelper.v1';
  var AWAY_LINE = 'The helper is away right now. Everything else in Ehyeh works as always.';
  var ssbOverride = null;
  function SSB() {
    if (ssbOverride) { return ssbOverride; }
    return (typeof window !== 'undefined' && window.SSB) || null;
  }

  /* ---------------- pure: verification gate ---------------- */
  /* A reference may be SHOWN only if it parses AND its text exists
     in Ehyeh's own Bible. Ranges verify start AND end. */
  function refResolves(ref) {
    var S = SSB();
    if (!S || !S.parseReference || !S.getVerseText) { return false; }
    var p = null;
    try { p = S.parseReference(String(ref)); } catch (e) { return false; }
    if (!p || p.chapter == null || !p.verse) { return false; }
    if (S.getVerseText(p.book, p.chapter, p.verse) == null) { return false; }
    var m = String(ref).match(/:(\d+)\s*[-–]\s*(\d+)\s*$/);
    if (m) {
      if (S.getVerseText(p.book, p.chapter, parseInt(m[2], 10)) == null) { return false; }
    }
    return true;
  }
  function verifyRefs(refs) {
    var out = [], seen = {};
    (refs || []).forEach(function (r) {
      var ref = String(r || '').trim();
      if (!ref || seen[ref.toLowerCase()]) { return; }
      if (refResolves(ref)) { seen[ref.toLowerCase()] = 1; out.push(ref); }
    });
    return out;
  }

  /* ---------------- pure: titles from the text itself ----------- */
  function stemLite(w) {
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
  function topicTerms(text) {
    var stop = {};
    ('a an the and or of to in on for with is are was were be been it its this that these those what does do did how why when where who whom about into from by at as').split(' ').forEach(function (w) { stop[w] = 1; });
    var seen = {}, out = [];
    String(text || '').toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).forEach(function (w) {
      w = w.replace(/^'+|'+$/g, '');
      if (w.length < 3 || stop[w] || seen[w]) { return; }
      seen[w] = 1; out.push(w);
    });
    return out;
  }
  /* A <=9-word window of the passage's own words around the first
     topic-term occurrence; else the reference-led fallback. Never
     helper prose, never invented wording. Hard cap 140 chars. */
  function titleFromText(ref, terms) {
    var fallback = 'What ' + ref + ' shows';
    var S = SSB();
    if (!S || !S.parseReference || !S.getVerseText) { return fallback; }
    var p = null;
    try { p = S.parseReference(String(ref)); } catch (e) { return fallback; }
    if (!p || !p.verse) { return fallback; }
    var text = S.getVerseText(p.book, p.chapter, p.verse);
    if (!text) { return fallback; }
    var words = String(text).split(/\s+/);
    var stems = (terms || []).map(stemLite);
    var at = -1;
    for (var i = 0; i < words.length; i++) {
      var clean = words[i].replace(/[^A-Za-z']/g, '');
      if (!clean) { continue; }
      var cs = stemLite(clean);
      for (var j = 0; j < stems.length; j++) {
        var ts = stems[j];
        if (cs === ts || (cs.length >= 4 && ts.length >= 4 && (cs.indexOf(ts) === 0 || ts.indexOf(cs) === 0))) { at = i; break; }
      }
      if (at !== -1) { break; }
    }
    if (at === -1) { return fallback; }
    var start = Math.max(0, at - 3);
    var win = words.slice(start, start + 9).join(' ').replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z.?!]+$/, '');
    if (!win) { return fallback; }
    var title = win.charAt(0).toUpperCase() + win.slice(1);
    if (title.length > 140) { title = title.slice(0, 137).replace(/\s+\S*$/, '') + '…'; }
    return title;
  }

  /* Relevance gate (restored 2026-10-29 — the ease-of-use audit found
     it missing: the helper-builder self-check's Genesis 18:27 case
     failed on the pristine tree). A ref can RESOLVE and still be
     off-topic — the helper once offered Genesis 18:27 ("dust and
     ashes") for "adoption". A ref stays only when its own verse text
     carries a topic term, matched exactly as the titles match. The
     gate steps aside when NOTHING matches or the text cannot be
     read: grouping then proceeds and the honesty banner, not an
     empty outline, carries the no-fit case. */
  function refOnTopic(ref, terms) {
    if (!terms || !terms.length) { return true; }
    var S = SSB();
    if (!S || !S.parseReference || !S.getVerseText) { return true; }
    var p = null;
    try { p = S.parseReference(String(ref)); } catch (e) { return true; }
    if (!p || !p.verse) { return true; }
    var stems = terms.map(stemLite);
    var last = Math.min(p.endVerse || p.verse, p.verse + 3);
    for (var v = p.verse; v <= last; v++) {
      var text = null;
      try { text = S.getVerseText(p.book, p.chapter, v); } catch (e) { return true; }
      if (!text) { continue; }
      var words = String(text).split(/\s+/);
      for (var i = 0; i < words.length; i++) {
        var clean = words[i].replace(/[^A-Za-z']/g, '');
        if (!clean) { continue; }
        var cs = stemLite(clean);
        for (var j = 0; j < stems.length; j++) {
          var ts = stems[j];
          if (cs === ts || (cs.length >= 4 && ts.length >= 4 && (cs.indexOf(ts) === 0 || ts.indexOf(cs) === 0))) { return true; }
        }
      }
    }
    return false;
  }

  /* ---------------- pure: grouping ------------------------------ */
  /* Verified refs -> up to `count` points, order preserved, chunked
     evenly: first of a chunk is Primary, the rest Supporting. */
  function groupPoints(refs, topicText, count) {
    var verified = verifyRefs(refs);
    if (!verified.length) { return null; }
    var gateTerms = topicTerms(topicText);
    if (gateTerms.length) {
      var onTopic = verified.filter(function (r) { return refOnTopic(r, gateTerms); });
      if (onTopic.length) { verified = onTopic; }
    }
    var n = Math.max(1, Math.min(count || 3, 5));
    var capped = verified.slice(0, 12);
    var per = Math.ceil(capped.length / n);
    var terms = topicTerms(topicText);
    var points = [];
    for (var i = 0; i < capped.length; i += per) {
      var chunk = capped.slice(i, i + per);
      points.push({
        title: titleFromText(chunk[0], terms),
        primaryRef: chunk[0],
        supportingRefs: chunk.slice(1).join(', ')
      });
      if (points.length >= n) { break; }
    }
    return points;
  }

  /* ---------------- pure: idea distillation + provenance -------- */
  /* The kept idea is a one-liner in the today-ideas list: first
     sentence of the helper's answer, trailing bare citations removed,
     clamped at a word boundary. The preacher edits it freely before
     and after keeping. */
  function distillIdea(answer) {
    var t = String(answer || '').replace(/\s+/g, ' ').trim();
    t = t.replace(/\s*\((?:[1-3]?\s?[A-Za-z]+\s+\d+:\d+(?:\s*[-–]\s*\d+)?)\)\s*\.?\s*$/, '');
    var cut = t.search(/[.!?]\s/);
    if (cut !== -1) { t = t.slice(0, cut + 1); }
    if (t.length > 240) { t = t.slice(0, 237).replace(/\s+\S*$/, '') + '…'; }
    return t;
  }
  function relDay(iso, nowMs) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ''; }
    var dayMs = 86400000;
    var startOf = function (ms) { var x = new Date(ms); x.setHours(0, 0, 0, 0); return x.getTime(); };
    var diff = Math.round((startOf(nowMs) - startOf(d.getTime())) / dayMs);
    if (diff <= 0) { return 'today'; }
    if (diff === 1) { return 'yesterday'; }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  /* The news card names the item's CALENDAR date (round 4): never
     the word "today" — an item dated today still reads as a date,
     so the reader can weigh how fresh the story is. */
  function calendarDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return String(iso || '').slice(0, 10); }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function provenanceLabel(item, nowMs) {
    if (!item) { return ''; }
    if (item.shelf === 'past') { return item.source + ' — ' + (item.dateLabel || String(item.date || '').slice(0, 10)); }
    return item.source + ' — ' + calendarDate(item.date);
  }

  /* ---------------- device cache -------------------------------- */
  function cacheRead() {
    try {
      var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(CACHE_KEY) : null;
      var obj = raw ? JSON.parse(raw) : null;
      if (obj && typeof obj === 'object') { return obj; }
    } catch (e) {}
    return { topic: {}, today: {}, explain: {}, context: {} };
  }
  function cacheWrite(cache) {
    try { if (typeof localStorage !== 'undefined') { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } } catch (e) {}
  }
  function normKey(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  /* ---------------- transport ----------------------------------- */
  /* ONE bounded POST to the helper lane (B2-008 FIX-4, reconciled
     with round 3's Defect-2 work). Before round 3 there was no
     client timer at all: the edge proxy cut a slow answer in
     transit (the lane had produced it — the journal proved it),
     the JSON parse failed on the error page, and every failure —
     rate limit, timeout, lane down, bad response — read as the
     same "helper is away" line. Now the ask carries a 35 s client
     ceiling (above the lane's own worst case: 3 s news-refresh cap
     + the 25 s lane budget server-side, plus assembly and
     transfer; below the ~100 s edge ceiling) and every result is
     tagged with its reason — 'limit', 'network', 'bad-response',
     or 'away' (the lane's own unavailable answer) — so the line
     the preacher reads says which thing actually happened. */
  var LIMIT_LINE = 'You have used the helper\u2019s asks for this hour. It opens again within the hour. Everything else in Ehyeh works as always.';
  var NET_LINE = 'The helper did not answer in time. Everything else in Ehyeh works as always.';
  function postAsk(body) {
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 35000) : null;
    return fetch(ASK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        if (timer) { clearTimeout(timer); }
        if (r.status === 429) { return { ok: false, reason: 'limit' }; }
        return r.json().then(function (j) { if (j && j.unavailable) { j.reason = 'away'; } return j; }, function () { return { ok: false, reason: 'bad-response' }; });
      })
      .catch(function () { if (timer) { clearTimeout(timer); } return { ok: false, reason: 'network' }; });
  }
  function lineFor(res) {
    if (res && res.reason === 'limit') { return LIMIT_LINE; }
    if (res && res.reason === 'network') { return NET_LINE; }
    return AWAY_LINE;
  }

  /* ONE bounded call per topic (cached on device after success). */
  function askTopic(topic) {
    var cache = cacheRead();
    var key = normKey(topic);
    if (cache.topic[key]) { return Promise.resolve({ ok: true, cached: true, citations: cache.topic[key].citations }); }
    var q = 'Which passages in the Bible speak about ' + topic + '?';
    return postAsk({ question: q, hp: '' }).then(function (out) {
      if (!out || out.ok !== true || out.unavailable) { return { ok: false, reason: out && out.reason }; }
      if (out.refused) { return { ok: false, refused: true, class: out.class, answer: out.answer }; }
      var citations = out.citations || [];
      if (citations.length) {
        cache.topic[key] = { citations: citations, at: new Date().toISOString() };
        cacheWrite(cache);
      }
      return { ok: true, cached: false, citations: citations, noPassages: !!out.noPassages };
    });
  }

  /* ONE bounded call per (point + want + material) — cached likewise. */
  function askToday(payload) {
    var cache = cacheRead();
    var key = normKey(payload.topic) + '|' + normKey(payload.passageRef) + '|' + payload.want + '|' + normKey(payload.material || '');
    if (cache.today[key]) { return Promise.resolve(Object.assign({ cached: true }, cache.today[key])); }
    return postAsk({
      mode: 'builder-today', topic: payload.topic, point_title: payload.pointTitle || '',
      passage_ref: payload.passageRef || '', material: payload.material || '', want: payload.want, hp: ''
    }).then(function (out) {
      if (!out || out.ok !== true || out.unavailable) { return { ok: false, reason: out && out.reason }; }
      if (out.refused) { return { ok: false, refused: true, class: out.class, answer: out.answer }; }
      var result = {
        ok: true, cached: false, kind: out.kind, noFit: !!out.noFit,
        answer: out.answer || '', citations: out.citations || [], itemsUsed: out.itemsUsed || [],
        noPassages: !!out.noPassages, withheld: !!out.withheld
      };
      if (result.answer && !result.withheld) { cache.today[key] = result; cacheWrite(cache); }
      return result;
    });
  }

  /* ONE bounded call per (term + passage) explanation. */
  function askExplain(term, passageRef) {
    var cache = cacheRead();
    var key = normKey(term) + '|' + normKey(passageRef || '');
    if (cache.explain[key]) { return Promise.resolve({ ok: true, cached: true, answer: cache.explain[key].answer, citations: cache.explain[key].citations }); }
    var q = 'What does “' + term + '” mean in the Bible' + (passageRef ? ', in ' + passageRef : '') + '?';
    return postAsk({ question: q, passage_ref: passageRef || '', hp: '' }).then(function (out) {
      if (!out || out.ok !== true || out.unavailable) { return { ok: false, reason: out && out.reason }; }
      if (out.refused) { return { ok: false, refused: true, class: out.class, answer: out.answer }; }
      if (!out.answer) { return { ok: false }; }
      var result = { ok: true, cached: false, answer: out.answer, citations: out.citations || [] };
      cache.explain[key] = { answer: result.answer, citations: result.citations, at: new Date().toISOString() };
      cacheWrite(cache);
      return result;
    });
  }

  /* ONE bounded call per chunk reference — the verses-walk context
     line (2026-11-02). Each verse of the chunk is named in the
     question, so the lane's retrieval starts from the chunk's own
     verses, and the answer returns citation-checked under the lane's
     fail-closed rule. Anything else — away, refused, withheld, no
     passages, cut off mid-sentence — yields no line, and the point
     keeps its plain shape: this door never invents prose to fill the
     gap. Cached on this device per reference, like every door here. */
  function verseListFor(ref) {
    var m = String(ref || '').trim().match(/^(.+)\s(\d+):(\d+)(?:\s*[-\u2013]\s*(\d+))?\s*$/);
    if (!m) { return []; }
    var a = parseInt(m[3], 10), b = m[4] ? parseInt(m[4], 10) : a;
    if (b < a || b - a > 15) { return []; }
    var out = [];
    for (var v = a; v <= b; v++) { out.push(m[1] + ' ' + m[2] + ':' + v); }
    return out;
  }
  function askContext(chunkRef) {
    var verses = verseListFor(chunkRef);
    /* A whole-chapter point reference ('Psalm 23') has no verse
       range for verseListFor to expand, and through rounds 2-3 it
       died silently at this line — its context ask never reached
       the lane (round-3 verification, 2026-11-03: in 'Psalm 23;
       John 10:11' only the John point was ever asked about). The
       lane resolves a chapter reference against the corpus itself,
       so a chapter point asks with the chapter named whole. */
    var chapterOnly = '';
    if (!verses.length && /^(.+)\s(\d+)$/.test(String(chunkRef || '').trim())) { chapterOnly = String(chunkRef).trim(); }
    if (!verses.length && !chapterOnly) { return Promise.resolve({ ok: false }); }
    var cache = cacheRead();
    if (!cache.context) { cache.context = {}; }
    var key = normKey(chunkRef);
    if (cache.context[key]) { return Promise.resolve({ ok: true, cached: true, answer: cache.context[key].answer, citations: cache.context[key].citations }); }
    var named = chapterOnly ? chapterOnly : (verses.length === 1 ? verses[0] : (verses.slice(0, -1).join(', ') + ' and ' + verses[verses.length - 1]));
    var q = 'What happens in ' + named + ', and what does it show? Answer in one or two sentences, in plain language.';
    /* purpose:'context' (B2-008 FIX-5c): context asks draw on
       their own server-side rate bucket, so an automatic walk can
       never starve the preacher's own taps of the shared one. */
    return postAsk({ question: q, passage_ref: chunkRef, hp: '', purpose: 'context' }).then(function (out) {
      if (!out || out.ok !== true || out.unavailable) {
        /* Reason-tagged (FIX-4). 'limit', 'network' and
           'bad-response' mean this ask may never have reached the
           lane: flag them transient — s03's context phase leaves
           the passage unmarked and retries on a later pass instead
           of settling the point without its line. 'away' (the lane
           failed end-to-end) is transient in s03 too since the
           round-3 verification: one bad lane minute must not bare
           a point for the whole session. The gate's terminal
           shapes (refused / withheld / no-passages) return below
           without a reason and settle, as answers should. */
        var reason = (out && out.reason) || null;
        return { ok: false, reason: reason, limited: reason === 'limit', transport: reason === 'network' || reason === 'bad-response' };
      }
      if (out.refused) { return { ok: false, refused: true, class: out.class, answer: out.answer }; }
      if (out.withheld || out.noPassages || out.truncated || !out.answer) { return { ok: false, withheld: !!out.withheld, noPassages: !!out.noPassages }; }
      var result = { ok: true, cached: false, answer: out.answer, citations: out.citations || [] };
      cache.context[key] = { answer: result.answer, citations: result.citations, at: new Date().toISOString() };
      cacheWrite(cache);
      return result;
    });
  }

  var api = {
    ASK_URL: ASK_URL, AWAY_LINE: AWAY_LINE,
    refResolves: refResolves, verifyRefs: verifyRefs, groupPoints: groupPoints,
    titleFromText: titleFromText, topicTerms: topicTerms, distillIdea: distillIdea,
    provenanceLabel: provenanceLabel, askTopic: askTopic, askToday: askToday, askExplain: askExplain, askContext: askContext,
    _setSSB: function (s) { ssbOverride = s; },
    _cacheRead: cacheRead
  };

  /* ================= browser layer ================================ */
  if (typeof document === 'undefined' || typeof window === 'undefined') { return api; }

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) { Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); }
    if (text !== undefined && text !== null) { n.textContent = String(text); }
    return n;
  }
  function bridge() { return window.__ehyehBuilder || null; }

  /* ---- topic assist: a section inside s03's fallback note card -- */
  function ensureTopicCard() {
    var note = $('suggest-note');
    if (!note || $('helper-topic-box')) { return; }
    var box = el('div', { id: 'helper-topic-box' });
    box.appendChild(el('p', { 'class': 'help' }, 'The helper can look for passages on this topic. One ask — the answer is kept on this device, so it is not asked twice. Every passage it names is checked against Ehyeh’s own Bible text before it is shown.'));
    var btn = el('button', { type: 'button', 'class': 'btn secondary', id: 'helper-topic-btn' }, 'Ask the helper for passages');
    var msg = el('p', { 'class': 'help', id: 'helper-topic-msg', 'aria-live': 'polite' });
    btn.addEventListener('click', function () {
      var b = bridge();
      var st = b ? b.topicState() : null;
      if (!st || st.startType !== 'theme' || !st.passageOrTheme) { return; }
      btn.disabled = true;
      msg.textContent = 'Asking the helper…';
      askTopic(st.passageOrTheme).then(function (out) {
        btn.disabled = false;
        if (!out.ok) {
          msg.textContent = out.refused ? (out.answer || AWAY_LINE) : lineFor(out);
          return;
        }
        var points = groupPoints(out.citations, st.passageOrTheme, st.movementCount || 3);
        if (!points) {
          msg.textContent = 'The helper named no passages Ehyeh could check for this topic. The verses door and your own words still work.';
          return;
        }
        if (b.applyHelperPoints(points)) {
          /* renderStructure rebuilds the view; the banner now shows. */
        } else {
          msg.textContent = 'The helper found passages, but the outline had changed — try again.';
        }
      });
    });
    box.appendChild(btn);
    box.appendChild(msg);
    note.appendChild(box);
  }

  /* ---- bring it into today: a block inside each point card ------ */
  function buildTodayBlock(idx) {
    var block = el('div', { 'class': 'field', 'data-today-block': String(idx) });
    block.appendChild(el('label', {}, 'Bring this point into today'));
    block.appendChild(el('p', { 'class': 'help' }, 'The helper reads today’s headlines from Ehyeh’s news shelves (the source and date always show), and past events from the shelves too. It does not open full articles. Or bring something you saw yourself.'));
    var row = el('div', {});
    var newsBtn = el('button', { type: 'button', 'class': 'btn quiet' }, 'Use today’s news');
    var pastBtn = el('button', { type: 'button', 'class': 'btn quiet' }, 'Use a past event');
    row.appendChild(newsBtn); row.appendChild(document.createTextNode(' ')); row.appendChild(pastBtn);
    block.appendChild(row);
    var ta = el('textarea', { 'class': 'tall', placeholder: 'Or paste / describe something you saw — a news story, an event, anything…' });
    var mineBtn = el('button', { type: 'button', 'class': 'btn quiet' }, 'Connect what I saw');
    block.appendChild(ta);
    block.appendChild(mineBtn);
    var out = el('div', { 'data-today-out': String(idx) });
    block.appendChild(out);

    function run(want, material) {
      var b = bridge();
      var st = b ? b.topicState() : null;
      if (!b || !st) { return; }
      var topic = st.passageOrTheme || b.pointTitle(idx) || '';
      var ref = b.pointRef(idx);
      [newsBtn, pastBtn, mineBtn].forEach(function (x) { x.disabled = true; });
      while (out.firstChild) { out.removeChild(out.firstChild); }
      out.appendChild(el('p', { 'class': 'help' }, 'Asking the helper…'));
      askToday({ topic: topic, pointTitle: b.pointTitle(idx), passageRef: ref, material: material || '', want: want }).then(function (res) {
        [newsBtn, pastBtn, mineBtn].forEach(function (x) { x.disabled = false; });
        while (out.firstChild) { out.removeChild(out.firstChild); }
        if (!res.ok) {
          out.appendChild(el('p', { 'class': 'help' }, res.refused ? (res.answer || AWAY_LINE) : lineFor(res)));
          return;
        }
        if (res.withheld) {
          out.appendChild(el('p', { 'class': 'help' }, 'That answer pointed to a passage that couldn’t be verified, so it isn’t shown.'));
          return;
        }
        if (res.noPassages) {
          out.appendChild(el('p', { 'class': 'help' }, res.answer || 'The helper couldn’t find passages for this point.'));
          return;
        }
        if (res.noFit && want === 'news') {
          out.appendChild(el('p', { 'class': 'help' }, 'Nothing in today’s news fits this point. Here is an everyday idea instead — a different kind of suggestion:'));
        }
        if (res.noFit && want === 'past') {
          out.appendChild(el('p', { 'class': 'help' }, 'The shelves hold no past event that fits this point. Here is an everyday idea instead — a different kind of suggestion:'));
        }
        if ((res.kind === 'news' || res.kind === 'past') && res.itemsUsed.length) {
          var it = res.itemsUsed[0];
          out.appendChild(el('p', { 'class': 'help' }, (res.kind === 'past' ? 'From a past event — ' : 'From today’s news — ') + provenanceLabel(it) + ': “' + it.title + '”'));
        }
        if (res.kind === 'material') {
          out.appendChild(el('p', { 'class': 'help' }, 'From what you brought:'));
        }
        if (res.kind === 'everyday' && !res.noFit) {
          out.appendChild(el('p', { 'class': 'help' }, 'An everyday idea (not from the news):'));
        }
        var ideaTa = el('textarea', { 'class': 'tall', 'aria-label': 'The helper’s idea — edit it, keep it, or drop it' });
        ideaTa.value = distillIdea(res.answer);
        out.appendChild(ideaTa);
        var btnRow = el('div', {});
        var keepBtn = el('button', { type: 'button', 'class': 'btn secondary' }, 'Keep this idea');
        var dropBtn = el('button', { type: 'button', 'class': 'btn quiet' }, 'Drop it');
        keepBtn.addEventListener('click', function () {
          var line = ideaTa.value.trim();
          if (!line) { return; }
          if (bridge().appendTodayIdea(line)) {
            /* the outline re-renders with the idea in place */
          }
        });
        dropBtn.addEventListener('click', function () {
          while (out.firstChild) { out.removeChild(out.firstChild); }
        });
        btnRow.appendChild(keepBtn); btnRow.appendChild(document.createTextNode(' ')); btnRow.appendChild(dropBtn);
        out.appendChild(btnRow);
        out.appendChild(el('p', { 'class': 'help' }, 'Keeping puts it in “Relates to today — ideas”, where it prints with the sermon. The words are yours — edit freely.'));
      });
    }
    newsBtn.addEventListener('click', function () { run('news', ''); });
    pastBtn.addEventListener('click', function () { run('past', ''); });
    mineBtn.addEventListener('click', function () { run('any', ta.value.trim()); });
    return block;
  }
  function ensureTodayBlocks() {
    var box = $('movements');
    if (!box) { return; }
    for (var i = 0; i < box.children.length; i++) {
      var card = box.children[i];
      if (!card.querySelector('[data-today-block]')) { card.appendChild(buildTodayBlock(i)); }
    }
  }
  function ensureAll() {
    try { ensureTopicCard(); ensureTodayBlocks(); } catch (e) { /* the builder works without this layer */ }
  }
  var pending = false;
  var obs = new MutationObserver(function () {
    if (pending) { return; }
    pending = true;
    setTimeout(function () { pending = false; ensureAll(); }, 120);
  });
  function boot() {
    ensureAll();
    if (document.body) { obs.observe(document.body, { childList: true, subtree: true }); }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); } else { boot(); }
  return api;
}));
