/* Ehyeh — All-Topics Engine (s19).
   For any topic the curated sets (s18) do not cover, gather real
   Scripture passages from the app's OWN data — Easton's Bible
   Dictionary citations, the Strong's concordance layer, word
   families, and cross-references — rank them, and group them into
   up to three starting points. Titles are the first complete clause of the passage's
   own Geneva text or reference-led; this module never writes sermon
   prose, never invents a reference, and validates every reference
   it serves against the app's own parser and text before serving it.

   Fully offline: plain data + pure functions over the already-loaded
   SSB data (js/s02.js). No fetch, no network. In the browser it
   attaches window.EHYEH_TOPIC_ENGINE; under Node it is require()-able
   for the proof battery. SSB is resolved lazily at call time
   (window.SSB in the browser); tests inject it via _setSSB(). */
(function (root, factory) {
  'use strict';
  var API = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (root) { root.EHYEH_TOPIC_ENGINE = API; }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  var ENGINE_BANNER = 'Scriptures gathered for your topic — the words and arrangement are yours.';

  /* ---------------- SSB resolution (lazy) ---------------- */
  var injectedSSB = null;
  function ssb() {
    if (injectedSSB) { return injectedSSB; }
    if (typeof window !== 'undefined' && window.SSB) { return window.SSB; }
    if (typeof self !== 'undefined' && self.SSB) { return self.SSB; }
    if (typeof globalThis !== 'undefined' && globalThis.SSB) { return globalThis.SSB; }
    return null;
  }
  function _setSSB(s) { injectedSSB = s || null; INDEX = null; INDEX_DB = null; INDEX_KEYCOUNT = -1; }

  /* ---------------- terms ---------------- */
  var STOPWORDS = {};
  ('what does do did is are was were the a an of and or to in on for with from about say says said ' +
   'bible scripture scriptures between difference how why when who my me i you he she it its should can vs')
    .split(' ').forEach(function (w) { STOPWORDS[w] = true; });

  function singularize(w) {
    if (w.length > 4 && /ies$/.test(w)) { return w.slice(0, -3) + 'y'; }
    if (w.length > 3 && /(ses|xes|zes|ches|shes)$/.test(w)) { return w.slice(0, -2); }
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) { return w.slice(0, -1); }
    return w;
  }
  function termsFor(topicText) {
    var raw = String(topicText == null ? '' : topicText).toLowerCase().match(/[a-z']+/g) || [];
    var out = [], seen = {};
    raw.forEach(function (w) {
      var t = w.replace(/^'+|'+$/g, '');
      if (!t || STOPWORDS[t]) { return; }
      t = singularize(t);
      if (!t || STOPWORDS[t] || seen[t]) { return; }
      seen[t] = true; out.push(t);
    });
    return out;
  }

  /* ---------------- stemming ----------------
     Strip, length-guarded, in a short loop so stacked endings unwind
     (heavens -> heaven -> heav; forgives -> forgiv):
     ies->y; ing; eth; en; ed; es; s (not ss); final e. */
  function stem(w) {
    var s = String(w == null ? '' : w).toLowerCase().replace(/[^a-z]/g, '');
    if (s.length <= 3) { return s; }
    if (s.length > 4 && s.slice(-3) === 'ies') { s = s.slice(0, -3) + 'y'; }
    var guard = 0, changed = true;
    while (changed && guard++ < 3) {
      changed = false;
      if (s.length > 5 && s.slice(-3) === 'ing') { s = s.slice(0, -3); changed = true; }
      else if (s.length > 5 && s.slice(-3) === 'eth') { s = s.slice(0, -3); changed = true; }
      else if (s.length > 5 && s.slice(-2) === 'en') { s = s.slice(0, -2); changed = true; }
      else if (s.length > 4 && s.slice(-2) === 'ed') { s = s.slice(0, -2); changed = true; }
      else if (s.length > 4 && s.slice(-2) === 'es') { s = s.slice(0, -2); changed = true; }
      else if (s.length > 3 && s.charAt(s.length - 1) === 's' && s.slice(-2) !== 'ss') { s = s.slice(0, -1); changed = true; }
      else if (s.length >= 4 && s.charAt(s.length - 1) === 'e') { s = s.slice(0, -1); changed = true; }
    }
    return s;
  }
  function stemsMatch(a, b) {
    var sa = stem(a), sb = stem(b);
    if (!sa || !sb) { return false; }
    if (sa === sb) { return true; }
    var shorter = sa.length <= sb.length ? sa : sb;
    var longer = sa.length <= sb.length ? sb : sa;
    if (shorter.length >= 4 && longer.indexOf(shorter) === 0) { return true; }
    if (sa.length >= 5 && sb.length >= 5 && sa.slice(0, 4) === sb.slice(0, 4) &&
        Math.abs(sa.length - sb.length) <= 3) { return true; }
    return false;
  }

  /* ---------------- reverse index (built once per session) ---------------- */
  var INDEX = null, INDEX_DB = null, INDEX_KEYCOUNT = -1;
  function parseKey(key) {
    var p = key.split(':');
    return { book: +p[0], chapter: +p[1], verse: +p[2] };
  }
  function canonOrder(book, chapter, verse) { return book * 10000000 + chapter * 10000 + verse; }
  function getIndex() {
    var S = ssb(); if (!S) { return null; }
    var data = S.db(); if (!data || !data.strongs_index) { return null; }
    /* The db object is filled in place as the app loads its data, so
       object identity alone cannot key this cache: an index first
       built over a partial strongs_index (879 of 30,859 verse keys at
       first paint) would otherwise serve the whole session. The key
       count is the rebuild trigger (ease-of-use audit, 2026-10-29). */
    if (INDEX && INDEX_DB === data && INDEX_KEYCOUNT === Object.keys(data.strongs_index).length) { return INDEX; }
    var t0 = (typeof Date !== 'undefined') ? Date.now() : 0;
    var wordToVerses = {}, strongToVerses = {}, wordToStrongs = {}, wordEntries = 0, strongAssignments = 0;
    Object.keys(data.strongs_index).forEach(function (key) {
      var entry = data.strongs_index[key] || {};
      Object.keys(entry).forEach(function (word) {
        var wk = S.normWord ? S.normWord(word) : String(word).toLowerCase();
        if (!wk) { return; }
        wordEntries++;
        if (!wordToVerses[wk]) { wordToVerses[wk] = {}; }
        wordToVerses[wk][key] = true;
        if (!wordToStrongs[wk]) { wordToStrongs[wk] = {}; }
        (entry[word] || []).forEach(function (num) {
          strongAssignments++;
          wordToStrongs[wk][num] = true;
          if (!strongToVerses[num]) { strongToVerses[num] = {}; }
          strongToVerses[num][key] = true;
        });
      });
    });
    INDEX = {
      wordToVerses: wordToVerses, strongToVerses: strongToVerses, wordToStrongs: wordToStrongs,
      stats: {
        wordKeys: Object.keys(wordToVerses).length,
        strongNums: Object.keys(strongToVerses).length,
        verseKeys: Object.keys(data.strongs_index).length,
        wordEntries: wordEntries,
        strongAssignments: strongAssignments,
        buildMs: ((typeof Date !== 'undefined') ? Date.now() : 0) - t0,
        cached: false
      }
    };
    INDEX_DB = data;
    INDEX_KEYCOUNT = Object.keys(data.strongs_index).length;
    return INDEX;
  }
  function buildIndex() {
    var idx = getIndex();
    if (!idx) { return null; }
    var s = {}; Object.keys(idx.stats).forEach(function (k) { s[k] = idx.stats[k]; });
    return s;
  }
  /* False friends the stem rules cannot separate by form (anger/angel
     and grief/grievous differ from their true families by exactly the
     same last-letter swap as anger/angry and grief/grieve). They are
     excluded at the concordance-matching layer only — the stemmer
     itself stays as specified. Stems listed are matched as prefixes
     of the index word's stem. */
  var FALSE_FRIEND_STEMS = { anger: ['angel'], grief: ['grievou'] };
  function matchedWordsFor(idx, term) {
    var out = [];
    var ff = FALSE_FRIEND_STEMS[term] || [];
    Object.keys(idx.wordToVerses).forEach(function (wk) {
      if (!stemsMatch(wk, term)) { return; }
      var ws = stem(wk);
      for (var i = 0; i < ff.length; i++) { if (ws.indexOf(ff[i]) === 0) { return; } }
      out.push(wk);
    });
    return out;
  }

  /* ---------------- Easton reference extraction ----------------
     Full refs (book name or abbreviation + C:V, optional range),
     bare C:V refs inheriting the last full ref's book, and bare verse
     numbers in a citation list (", 32" after "Mark 12:29") inheriting
     book + chapter. Chapter-only refs are never matched — a verse is
     never invented. Every candidate is validated through
     SSB.parseReference + SSB.getVerseText (range ends included). */
  var BOOK_SPECIALS = { cant: 'Song of Solomon', canticles: 'Song of Solomon', eccles: 'Ecclesiastes' };
  function validateCandidate(S, book, c, v, endC, endV) {
    var books = S.db().books;
    var name = books[book - 1]; if (!name) { return null; }
    var startDisplay = name + ' ' + c + ':' + v;
    var parsed = S.parseReference(startDisplay);
    if (!parsed || parsed.book !== book || parsed.chapter !== c || parsed.verse !== v) { return null; }
    if (S.getVerseText(book, c, v) == null) { return null; }
    var display = startDisplay, ec = null, ev = null;
    if (endV != null) {
      ec = (endC == null ? c : endC); ev = endV;
      if (canonOrder(book, ec, ev) < canonOrder(book, c, v)) { return null; }
      if (S.getVerseText(book, ec, ev) == null) { return null; }
      display = (ec === c) ? (startDisplay + '-' + ev) : (startDisplay + '-' + ec + ':' + ev);
    }
    return { display: display, book: book, chapter: c, verse: v,
             endChapter: ec, endVerse: ev, key: S.verseKey(book, c, v) };
  }
  function resolveFullRef(S, bookToken, c, v, endC, endV) {
    var token = String(bookToken).replace(/\./g, '').replace(/\s+/g, ' ').trim();
    var lower = token.toLowerCase();
    var use = BOOK_SPECIALS[lower] || token;
    var parsed = S.parseReference(use + ' ' + c + ':' + v);
    if (!parsed) { return null; }
    return validateCandidate(S, parsed.book, c, v, endC, endV);
  }
  /* The bare-verse alternative must NOT swallow the leading number of
     a numbered book ("; 1 Kings 8:60", "; 2 Cor. 1:4"): the (?!\s+[A-Za-z])
     guard blocks a digit that is followed by a book name. */
  var REF_RE = /(([1-3]\s+)?[A-Za-z]+\.?(?:\s+[A-Za-z]+\.?){0,2})\s+(\d{1,3}):(\d{1,3})(?:\s*-\s*(?:(\d{1,3}):)?(\d{1,3}))?|\b(\d{1,3}):(\d{1,3})(?:\s*-\s*(?:(\d{1,3}):)?(\d{1,3}))?|[,;]\s*(\d{1,3})\b(?!\s*:)(?!\s*-)(?!\s+[A-Za-z])/g;
  function extractEastonRefs(defText) {
    var S = ssb(); if (!S || !S.db()) { return []; }
    var text = String(defText == null ? '' : defText);
    var out = [], seen = {};
    var lastBook = null, lastChapter = null;
    var re = new RegExp(REF_RE.source, 'g');
    var m;
    while ((m = re.exec(text)) !== null) {
      var cand = null;
      if (m[1] !== undefined) {
        cand = resolveFullRef(S, m[1], +m[3], +m[4],
          m[5] !== undefined ? +m[5] : null, m[6] !== undefined ? +m[6] : null);
        if (!cand) { re.lastIndex = m.index + 1; continue; }
      } else if (m[7] !== undefined) {
        if (lastBook == null) { continue; }
        cand = validateCandidate(S, lastBook, +m[7], +m[8],
          m[9] !== undefined ? +m[9] : null, m[10] !== undefined ? +m[10] : null);
        if (!cand) { continue; }
      } else if (m[11] !== undefined) {
        if (lastBook == null || lastChapter == null) { continue; }
        cand = validateCandidate(S, lastBook, lastChapter, +m[11], null, null);
        if (!cand) { continue; }
      }
      if (cand) {
        lastBook = cand.book; lastChapter = cand.chapter;
        if (!seen[cand.display]) { seen[cand.display] = true; out.push(cand); }
      }
    }
    return out;
  }

  /* ---------------- candidate pool ---------------- */
  function newEntry(S, cand) {
    return {
      key: cand.key, book: cand.book, chapter: cand.chapter, verse: cand.verse,
      display: cand.display, isRange: !!(cand.endVerse != null),
      easton: false, wordTerms: {}, familyTerms: {}, xref: false,
      score: 0, routeRank: 99, order: canonOrder(cand.book, cand.chapter, cand.verse)
    };
  }
  function singleCandidate(S, key) {
    var p = parseKey(key);
    var books = S.db().books;
    return { display: books[p.book - 1] + ' ' + p.chapter + ':' + p.verse,
             book: p.book, chapter: p.chapter, verse: p.verse, endChapter: null, endVerse: null, key: key };
  }
  function scoreEntry(e) {
    var wordN = Object.keys(e.wordTerms).length;
    var famN = Object.keys(e.familyTerms).length;
    e.score = (e.easton ? 10 : 0) + Math.min(8, 4 * wordN) + Math.min(4.5, 1.5 * famN) + (e.xref ? 2 : 0);
    e.routeRank = e.easton ? 0 : (wordN ? 1 : (famN ? 2 : 3));
    return e;
  }
  function sortPool(list) {
    list.sort(function (a, b) {
      if (b.score !== a.score) { return b.score - a.score; }
      if (a.routeRank !== b.routeRank) { return a.routeRank - b.routeRank; }
      return a.order - b.order;
    });
    return list;
  }

  function eastonEntriesFor(S, topicText, terms) {
    var byTerm = {}, order = [];
    function add(list) {
      (list || []).forEach(function (e) {
        if (e && e.term && !byTerm[e.term]) { byTerm[e.term] = e; order.push(e); }
      });
    }
    add(S.searchEaston(String(topicText || '').trim()));
    terms.forEach(function (t) { add(S.searchEaston(t)); });
    var data = S.db();
    if (data && data.easton) {
      var keys = Object.keys(data.easton);
      terms.forEach(function (t) {
        var added = 0;
        for (var i = 0; i < keys.length && added < 6; i++) {
          var k = keys[i];
          if (byTerm[k]) { continue; }
          /* key contains the term as a whole word (singular-tolerant),
             so "manger"/"stranger" never scan in for "anger" */
          var words = k.split(/[^a-z']+/).filter(Boolean).map(singularize);
          if (words.indexOf(t) !== -1 || words.indexOf(singularize(t)) !== -1) {
            byTerm[k] = { term: k, definition: data.easton[k] }; order.push(byTerm[k]); added++;
          }
        }
      });
    }
    return order;
  }

  /* ---------------- titles: the verse's first COMPLETE clause ---------------- */
  function capTitle(t) {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    if (t.length <= 140) { return t; }
    var cut = t.slice(0, 140);
    var sp = cut.lastIndexOf(' ');
    return (sp > 40 ? cut.slice(0, sp) : cut).trim();
  }
  /* B2-008 FIX-1 rule, extended to the engine (round 4): a point
     title is the first COMPLETE clause of the verse's own words,
     never a window cut mid-phrase. Leading joining words (For /
     And / So / Then / Now / But) are dropped so the title reads as
     a heading; nothing is added. Falls back to the honest
     reference-led title when no clause of 2-14 words exists. The
     same rule as s03's chunkTitle. */
  var TITLE_LEAD = {};
  ('for and so then now but therefore wherefore also').split(' ').forEach(function (w) { TITLE_LEAD[w] = 1; });

  /* Title verb screen (round 5) — the same rule as s03's
     clauseHasVerb: a clause naming no action is not a heading. */
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
  function makeTitle(S, entry, terms) {
    var fallback = 'What ' + entry.display + ' shows';
    var text = S.getVerseText(entry.book, entry.chapter, entry.verse);
    if (!text) { return capTitle(fallback); }
    var clauses = String(text).match(/[^,;:.?!]+[,;:.?!]?/g) || [];
    for (var c = 0; c < clauses.length && c < 3; c++) {
      var words = clauses[c].trim().replace(/[,;:]+$/, '').split(/\s+/).filter(Boolean);
      while (words.length > 1 && TITLE_LEAD[words[0].toLowerCase().replace(/[^a-z]/g, '')]) { words.shift(); }
      if (words.length >= 2 && words.length <= 14 && clauseHasVerb(words)) {
        var t = words.join(' ').replace(/[^A-Za-z.?!']+$/, '');
        return capTitle(t.charAt(0).toUpperCase() + t.slice(1));
      }
      if (words.length > 14) { break; }
    }
    return capTitle(fallback);
  }

  /* ---------------- gather ---------------- */
  function gather(topicText) {
    var S = ssb();
    var terms = termsFor(topicText);
    if (!S || !S.db() || !terms.length) {
      return { tier: 'none', terms: terms, passages: [], points: [], poolSize: 0, top: [] };
    }
    var idx = getIndex();
    if (!idx) { return { tier: 'none', terms: terms, passages: [], points: [], poolSize: 0, top: [] }; }
    var pool = {}; /* verseKey -> entry */
    function entryFor(cand) {
      if (!pool[cand.key]) { pool[cand.key] = newEntry(S, cand); }
      var e = pool[cand.key];
      /* an Easton range display for the same anchor beats a single */
      if (cand.endVerse != null && !e.isRange) { e.display = cand.display; e.isRange = true; }
      return e;
    }

    /* (a) EASTON route (+10) */
    eastonEntriesFor(S, topicText, terms).forEach(function (ent) {
      extractEastonRefs(ent.definition).forEach(function (cand) {
        entryFor(cand).easton = true;
      });
    });

    /* concordance terms: rarest first (document frequency = union of
       matched-word verse sets), keep <= 4; unmatched terms rank last */
    var termInfo = terms.map(function (t) {
      var words = matchedWordsFor(idx, t);
      var verseSet = {};
      words.forEach(function (wk) {
        Object.keys(idx.wordToVerses[wk]).forEach(function (k) { verseSet[k] = true; });
      });
      return { term: t, words: words, verseCount: Object.keys(verseSet).length };
    });
    var concTerms = termInfo.slice().sort(function (a, b) {
      var av = a.verseCount === 0 ? Infinity : a.verseCount;
      var bv = b.verseCount === 0 ? Infinity : b.verseCount;
      return av - bv;
    }).slice(0, 4).filter(function (ti) { return ti.verseCount > 0; });

    /* (b) WORD route (+4 per distinct matched term, cap +8)
       (c) FAMILY route (+1.5 per distinct term-family, cap +4.5) */
    concTerms.forEach(function (ti) {
      var strongs = {};
      ti.words.forEach(function (wk) {
        Object.keys(idx.wordToVerses[wk]).forEach(function (key) {
          entryFor(singleCandidate(S, key)).wordTerms[ti.term] = true;
        });
        Object.keys(idx.wordToStrongs[wk] || {}).forEach(function (num) { strongs[num] = true; });
      });
      Object.keys(strongs).forEach(function (num) {
        Object.keys(idx.strongToVerses[num] || {}).forEach(function (key) {
          entryFor(singleCandidate(S, key)).familyTerms[ti.term] = true;
        });
      });
    });

    var list = sortPool(Object.keys(pool).map(function (k) { return scoreEntry(pool[k]); }));

    /* (d) XREF route (+2): targets of the top 6 after (a)-(c) */
    list.slice(0, 6).forEach(function (e) {
      (S.getXrefs(e.book, e.chapter, e.verse) || []).forEach(function (x) {
        var p = String(x.ref || '').split(':');
        if (p.length !== 3) { return; }
        var b = +p[0], c = +p[1], v = +p[2];
        if (!b || !c || !v || S.getVerseText(b, c, v) == null) { return; }
        entryFor(singleCandidate(S, S.verseKey(b, c, v))).xref = true;
      });
    });
    list = sortPool(Object.keys(pool).map(function (k) { return scoreEntry(pool[k]); }));
    list.forEach(function (e, i) { e.rank = i; });

    if (!list.length) {
      return { tier: 'none', terms: terms, passages: [], points: [], poolSize: 0, top: [] };
    }

    /* xref adjacency (either direction), computed on demand */
    var xrefCache = {};
    function xrefTargets(key) {
      if (!xrefCache[key]) {
        var e = pool[key], set = {};
        if (e) {
          (S.getXrefs(e.book, e.chapter, e.verse) || []).forEach(function (x) { set[x.ref] = true; });
        }
        xrefCache[key] = set;
      }
      return xrefCache[key];
    }
    function xrefLinked(aKey, bKey) {
      return !!(xrefTargets(aKey)[bKey] || xrefTargets(bKey)[aKey]);
    }

    /* SELECT + GROUP: greedy seeds — not xref-adjacent to an existing
       seed, not in the same book+chapter as an existing seed */
    var seeds = [];
    for (var i = 0; i < list.length && seeds.length < 3; i++) {
      var candE = list[i];
      var ok = true;
      for (var s = 0; s < seeds.length; s++) {
        if (seeds[s].book === candE.book && seeds[s].chapter === candE.chapter) { ok = false; break; }
        if (xrefLinked(seeds[s].key, candE.key)) { ok = false; break; }
      }
      if (ok) { seeds.push(candE); }
    }
    var seedKeys = {}; seeds.forEach(function (e) { seedKeys[e.key] = true; });
    var supporting = seeds.map(function () { return []; });
    var rest = list.filter(function (e) { return !seedKeys[e.key]; }).slice(0, 12);
    rest.forEach(function (e) {
      var pick = -1, k;
      for (k = 0; k < seeds.length; k++) {
        if (supporting[k].length < 3 && xrefLinked(seeds[k].key, e.key)) { pick = k; break; }
      }
      if (pick < 0) {
        for (k = 0; k < seeds.length; k++) {
          if (supporting[k].length < 3 && seeds[k].book === e.book) { pick = k; break; }
        }
      }
      if (pick < 0) {
        var fewest = Infinity;
        for (k = 0; k < seeds.length; k++) {
          if (supporting[k].length < 3 && supporting[k].length < fewest) { fewest = supporting[k].length; pick = k; }
        }
      }
      if (pick >= 0) { supporting[pick].push(e); }
    });

    var points = seeds.map(function (e, i2) {
      return {
        title: makeTitle(S, e, terms),
        primaryRef: e.display,
        supportingRefs: supporting[i2].map(function (x) { return x.display; }).join(', ')
      };
    });
    var served = seeds.slice();
    supporting.forEach(function (arr) { arr.forEach(function (e) { served.push(e); }); });
    served.sort(function (a, b) { return a.rank - b.rank; });

    return {
      tier: 'engine',
      terms: terms,
      passages: served.map(function (e) { return e.display; }),
      points: points,
      poolSize: list.length,
      top: list.slice(0, 12).map(function (e) {
        var routes = [];
        if (e.easton) { routes.push('easton'); }
        if (Object.keys(e.wordTerms).length) { routes.push('word'); }
        if (Object.keys(e.familyTerms).length) { routes.push('family'); }
        if (e.xref) { routes.push('xref'); }
        return { ref: e.display, score: e.score, routes: routes };
      })
    };
  }

  return {
    gather: gather,
    ENGINE_BANNER: ENGINE_BANNER,
    termsFor: termsFor,
    stem: stem,
    stemsMatch: stemsMatch,
    extractEastonRefs: extractEastonRefs,
    buildIndex: buildIndex,
    eastonEntriesFor: function (t, terms) { var S = ssb(); return S ? eastonEntriesFor(S, t, terms || termsFor(t)) : []; },
    _setSSB: _setSSB
  };
}));
