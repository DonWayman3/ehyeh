
/* Sermon Skeleton Builder v2 — study modules.
   Pure functions are exported for tests (Node) and attached to window.SSB in the browser.
   Philosophy: snippets of help, never scripts. This module never generates sermon prose. */
(function (root, factory) {
  'use strict';
  var SSB = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = SSB; }
  else { root.SSB = SSB; }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DATA = null; // set by SSB_init(data) in the browser; tests inject fixtures
  function SSB_init(data) { DATA = data; }
  function db() { return DATA; }

  /* ------------------------------------------------------------------
     References: "John 3:16", "1 John 1:9", "Ps 23", "Gen 1:1-3"
     Returns {book, chapter, verse} (verse may be null) or null.
     ------------------------------------------------------------------ */
  var BOOK_ALIASES = null;
  function bookAliases() {
    if (BOOK_ALIASES || !DATA) { return BOOK_ALIASES || {}; }
    BOOK_ALIASES = {};
    DATA.books.forEach(function (name, i) {
      var n = i + 1;
      BOOK_ALIASES[name.toLowerCase()] = n;
      BOOK_ALIASES[name.toLowerCase().replace(/^(\d) /, '$1')] = n; // "1 john"
      var short = name.replace(/^(\d) /, '$1').split(' ')[0].toLowerCase();
      if (!BOOK_ALIASES[short]) { BOOK_ALIASES[short] = n; }
    });
    // common abbreviations
    var ab = { gen:1, exo:2, ex:2, lev:3, num:4, deūt:5, deut:5, josh:6, judg:7, ruth:8,
      '1sam':9, '2sam':10, '1kgs':11, '1ki':11, '2kgs':12, '2ki':12, '1chr':13, '2chr':14,
      ezra:15, neh:16, est:17, esther:17, job:18, ps:19, psa:19, psalm:19, psalms:19,
      prov:20, pro:20, eccl:21, song:22, isa:23, jer:24, lam:25, ezek:26, dan:27,
      hos:28, joel:29, amos:30, obad:31, ob:31, jonah:32, mic:33, nah:34, nahum:34,
      hab:35, zeph:36, hag:37, zech:38, mal:39, matt:40, mt:40, mark:41, mk:41,
      luke:42, lk:42, john:43, jn:43, acts:44, rom:45, '1cor':46, '2cor':47,
      gal:48, eph:49, phil:50, col:51, '1thess':52, '2thess':53, '1tim':54,
      '2tim':55, titus:56, tit:56, philem:57, phm:57, heb:58, james:59, jas:59,
      '1pet':60, '2pet':61, '1jn':62, '2jn':63, '3jn':64, jude:65, rev:66 };
    Object.keys(ab).forEach(function (k) { if (!BOOK_ALIASES[k]) { BOOK_ALIASES[k] = ab[k]; } });
    return BOOK_ALIASES;
  }

  function parseReference(str) {
    if (!DATA || typeof str !== 'string') { return null; }
    var s = str.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
    var m = s.match(/^([1-3]?\s?[a-z]+(?:\s+[a-z]+){0,2})\s+(\d+)(?::(\d+))?/);
    if (!m) { return null; }
    var aliases = bookAliases();
    var bookName = m[1].replace(/\s+/g, '');
    var book = aliases[bookName] || aliases[m[1]];
    if (!book) {
      // try progressively shorter book-name prefixes ("song of solomon" -> "song")
      var parts = m[1].split(' ');
      for (var i = parts.length - 1; i > 0 && !book; i--) {
        book = aliases[parts.slice(0, i).join(' ')] || aliases[parts.slice(0, i).join('').replace(/^(\d)/, '$1')];
      }
    }
    if (!book) { return null; }
    var chapter = parseInt(m[2], 10);
    var verse = m[3] ? parseInt(m[3], 10) : null;
    var maxCh = DATA.chapter_counts[String(book)];
    if (!maxCh || chapter < 1 || chapter > maxCh) { return null; }
    return { book: book, chapter: chapter, verse: verse };
  }

  /* ------------------------------------------------------------------
     Language detection. The user never picks a language; the passage decides.
     Hebrew: OT except the Aramaic zones. Greek: NT. Aramaic: 5 zones.
     ------------------------------------------------------------------ */
  var ARAMAIC_ZONES = [
    { book: 27, sc: 2, sv: 4, ec: 7, ev: 28 },   // Daniel 2:4 - 7:28
    { book: 15, sc: 4, sv: 8, ec: 6, ev: 18 },   // Ezra 4:8 - 6:18
    { book: 15, sc: 7, sv: 12, ec: 7, ev: 26 },  // Ezra 7:12 - 7:26
    { book: 24, sc: 10, sv: 11, ec: 10, ev: 11 },// Jeremiah 10:11
    { book: 1, sc: 31, sv: 47, ec: 31, ev: 47 }  // Genesis 31:47
  ];
  function inZone(book, chapter, verse, z) {
    if (book !== z.book || verse == null) { return false; }
    var after_start = (chapter > z.sc) || (chapter === z.sc && verse >= z.sv);
    var before_end = (chapter < z.ec) || (chapter === z.ec && verse <= z.ev);
    return after_start && before_end;
  }
  function detectLanguage(book, chapter, verse) {
    if (book >= 40) { return 'Greek'; }
    for (var i = 0; i < ARAMAIC_ZONES.length; i++) {
      if (inZone(book, chapter, verse, ARAMAIC_ZONES[i])) { return 'Aramaic'; }
    }
    return 'Hebrew';
  }

  /* ------------------------------------------------------------------
     Word study. strongs_index[verseKey] maps KJV English word -> [H..]/[G..].
     Geneva words are spelling-modernized at build time, so they match.
     ------------------------------------------------------------------ */
  function normWord(w) {
    return String(w).toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, '');
  }
  function verseKey(book, chapter, verse) { return book + ':' + chapter + ':' + verse; }

  /* Returns { strongs:[...], via:'direct' } or { strongs:[...all in verse...], via:'verse-list' }
     or { strongs:[], via:'none' }. Never guesses: 'verse-list' is shown with the caveat. */
  function lookupWord(b, c, v, word) {
    if (!DATA) { return { strongs: [], via: 'none' }; }
    var idx = DATA.strongs_index[verseKey(b, c, v)];
    if (!idx) { return { strongs: [], via: 'none' }; }
    var w = normWord(word);
    if (w && idx[w]) { return { strongs: idx[w].slice(), via: 'direct' }; }
    // fall back: every underlying word in the verse, in verse order, deduplicated
    var seen = {}, all = [];
    Object.keys(idx).forEach(function (k) {
      idx[k].forEach(function (s) { if (!seen[s]) { seen[s] = true; all.push(s); } });
    });
    return { strongs: all, via: 'verse-list' };
  }
  function getLexicon(num) {
    if (!DATA || !DATA.lexicon[num]) { return null; }
    var e = DATA.lexicon[num];
    return { number: num, word: e[0], transliteration: e[1], definition: e[2],
             language: num.charAt(0) === 'H' ? 'Hebrew' : 'Greek' };
  }
  function getNotes(b, c, v) {
    if (!DATA) { return []; }
    return DATA.notes[verseKey(b, c, v)] || [];
  }
  function getXrefs(b, c, v) {
    if (!DATA) { return []; }
    return (DATA.xrefs[verseKey(b, c, v)] || []).map(function (s) {
      var p = s.split('|');
      return { label: p[0], ref: p[1] };
    });
  }
  function getVerseText(b, c, v) {
    if (!DATA) { return null; }
    var ch = (DATA.bible[String(b)] || {})[String(c)] || {};
    return ch[String(v)] || null;
  }
  function searchEaston(term) {
    if (!DATA || !term) { return []; }
    var q = String(term).trim().toLowerCase();
    if (!q) { return []; }
    var exact = DATA.easton[q];
    var out = [];
    if (exact) { out.push({ term: q, definition: exact }); }
    if (out.length >= 8) { return out; }
    Object.keys(DATA.easton).forEach(function (k) {
      if (out.length >= 8) { return; }
      if (k !== q && k.indexOf(q) === 0) { out.push({ term: k, definition: DATA.easton[k] }); }
    });
    return out;
  }

  /* ------------------------------------------------------------------
     "Use it rightly" — the six classic concordance misuses, plain language.
     ------------------------------------------------------------------ */
  var MISUSES = [
    { title: '1. The root-word fallacy',
      wrong: 'Assuming a word\'s history is its meaning. "Butterfly" is not butter + fly; December comes from the Latin word for "ten," but it is the twelfth month.',
      right: 'A word means what the author meant by it in this sentence — not what its parts used to mean centuries earlier.' },
    { title: '2. Treating Strong\'s as a dictionary',
      wrong: 'Strong\'s gives a five-word gloss. A real lexicon can spend thousands of words on one word because it is used thousands of ways.',
      right: 'Use the gloss as a starting point, then check a real lexicon and read the word in several passages.' },
    { title: '3. Carrying one verse\'s meaning into another',
      wrong: 'The same original word can mean different things in different places. "Free" in Galatians 5:1 and "free" in John 8:32 are not making the same point.',
      right: 'Let each passage speak. Context decides meaning — not a fixed "real meaning" imported from elsewhere.' },
    { title: '4. The "hidden meaning" illusion',
      wrong: 'Believing only people with a concordance can know what the Bible "really means."',
      right: 'The English translation already carries the meaning. Word study should confirm the text, not replace it.' },
    { title: '5. Treating translation glosses as definitions',
      wrong: 'The short English words after the dash in a Strong\'s entry are just how the translators happened to render it — often in old-fashioned English.',
      right: 'Glosses are clues, not definitions. Read whole verses, not word lists.' },
    { title: '6. Ripping a verse out of context',
      wrong: 'Building a point on a single word while ignoring the paragraph, the chapter, and the book around it.',
      right: 'Context first, last, and always. Never build a doctrine on an English gloss.' }
  ];
  function getMisuses() { return MISUSES; }

  /* ------------------------------------------------------------------
     Study Assistant guardrails. The assistant is a study helper, never a writer.
     Layers: (1) action buttons, not an open box; (2) FAIL-CLOSED intent
     allowlist on free input — only the six known-safe study intents below can
     reach the model; anything else gets a gentle local redirect with zero
     network calls; (3) every allowed request is wrapped in a safe,
     internally-constructed prompt template; (4) strict system prompt;
     (5) 150-word hard cap; (6) framed answers.
     There is deliberately no blocklist. Reaching the model requires matching
     a safe intent, so unknown input fails closed by construction: there is no
     list of bad phrasings to bypass, only six safe shapes to match.
     ------------------------------------------------------------------ */
  var WORD_CAP = 150;

  /* The six safe study intents. Finite and enumerable. Matching is on intent
     keywords in any order — not rigid sentence templates — so natural phrasings
     ("grace — what does it mean", "Romans 8, give me background") are accepted
     while sermon-writing requests match nothing and are redirected. */
  var SAFE_INTENTS = [
    { name: 'CROSSREF',
      keys: [/\bcross[\s-]?references?\b/i, /\brelated\s+(verses?|passages?|scriptures?)\b/i,
             /\bparallel\s+passages?\b/i],
      template: 'xrefs' },
    { name: 'PERSON',
      keys: [/\bwho\s+(was|is|were|are)\b/i, /\btell\s+me\s+about\b/i],
      template: 'person' },
    { name: 'BACKGROUND',
      keys: [/\bbackground\b/i, /\bhistor(y|ical)\b/i, /\bcontext\b/i, /\bcustoms?\b/i,
             /\bcultur(e|al)\b/i, /\bsetting\b/i, /\bwho\s+wrote\b/i],
      template: 'background' },
    { name: 'STUDY_QUESTIONS',
      keys: [/\bquestions?\b/i, /\bwhat\s+should\s+i\s+study\b/i, /\bpray\s+over\b/i,
             /\breflect(ion)?\b/i, /\bdiscuss(ion)?\b/i, /\bstudy\s+(tips?|guide)\b/i],
      template: 'questions' },
    { name: 'TOPIC_STUDY',
      keys: [/\bbible\s+says?\b/i, /\bscripture\s+says?\b/i,
             /\bverses?\s+about\b/i, /\bpassages?\s+about\b/i, /\bteach(es|ing)?\s+about\b/i],
      template: 'topic' },
    { name: 'WORD_EXPLAIN',
      keys: [/\bexplain\b/i, /\bmeaning\b/i, /\bmeanings\b/i, /\bmean\b/i,
             /\bdefin(e|ition)\b/i, /\btranslat(e|ion|ed)\b/i, /\bgloss\b/i,
             /\boriginal\b/i],
      template: 'word' }
  ];
  /* Returns a safe intent name, or 'REDIRECT' for anything outside the six.
     'REDIRECT' never reaches the model. */
  function classifyIntent(text) {
    var t = String(text || '');
    for (var i = 0; i < SAFE_INTENTS.length; i++) {
      var keys = SAFE_INTENTS[i].keys;
      for (var j = 0; j < keys.length; j++) {
        if (keys[j].test(t)) { return SAFE_INTENTS[i].name; }
      }
    }
    return 'REDIRECT';
  }
  /* Gentle local redirect for anything outside the safe intents. Never a dead
     end: it names what the assistant CAN do so the user can rephrase. */
  function redirectMessage() {
    return 'That\'s outside what I can help with — I\'m a study companion, not a writer, ' +
      'and your sermon is work for you and the Holy Spirit. ' +
      'I can help with word meanings, background, cross-references, people of the Bible, ' +
      'and study questions. Which would you like to explore?';
  }
  function buildSystemPrompt() {
    return [
      'You are a study assistant and librarian for a preacher. You provide brief study helps.',
      'You NEVER draft sermon prose.',
      'FORBIDDEN: full sermon manuscripts; sermon-length paragraphs in preaching voice;',
      'illustrations written as stories to retell; prayers to pray verbatim; applications',
      'phrased as declarations ("You should..."); altar calls; closing language;',
      'rewording the user\'s draft into a finished product; claims about what God or the',
      'Holy Spirit is saying to the preacher or congregation.',
      'ALLOWED: short factual answers (word meanings, background, dates, customs);',
      'bullet-point observations ABOUT the text (never AS the sermon); questions for',
      'reflection, application, or illustration-sparking; outline SHAPES with empty slots;',
      'summaries clearly labeled as study aids; suggestions for what to study next.',
      'Keep every answer under ' + WORD_CAP + ' words. Plain language. No sermon voice.'
    ].join(' ');
  }
  function warmRefusal() {
    return 'I can\'t write that for you — the sermon is work for you and the Holy Spirit, ' +
      'and your people will hear the difference. Here is what I can do instead: ' +
      'study a word with you, explain the background, show cross-references, ' +
      'or ask questions to pray over. Pick a study action above, or ask me about the text.';
  }
  function capWords(text, max) {
    var words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (words.length <= max) { return { text: String(text || '').trim(), capped: false }; }
    return { text: words.slice(0, max).join(' ') + ' …', capped: true };
  }
  function frameAnswer(body, opts) {
    opts = opts || {};
    return { tips: 'Study tips: read the whole paragraph around this verse; check the cross-references; confirm anything new in the text itself.',
             body: body,
             verify: 'Verify in the text — this is a study aid, not an authority.',
             capped: !!opts.capped };
  }
  /* Stubbed provider call. Never invents a key or endpoint; without both it
     declines locally and makes zero network calls. fetchImpl is injectable for tests. */
  var MUSE_PROXY = '/api/muse';
  var MUSE_MODEL = 'muse-spark-1.3';
  function callAssistant(opts, fetchImpl) {
    opts = opts || {};
    var key = opts.key, endpoint = opts.endpoint, question = opts.question;
    var fetchFn = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    /* Default (2026-11-04): with no user key/endpoint, ask Meta Muse
       Spark through Ehyeh's own same-origin proxy. The server holds
       META_MODEL_API_KEY; no key ever ships to the browser. A user's
       own OpenAI-compatible endpoint + key still overrides this. */
    var useHouse = !key || !endpoint;
    if (useHouse) { endpoint = MUSE_PROXY; }
    var intent = classifyIntent(question);
    if (intent === 'REDIRECT') {
      return Promise.resolve({ ok: true, refused: true, redirected: true,
        answer: frameAnswer(redirectMessage()) });
    }
    if (!fetchFn) {
      return Promise.resolve({ ok: false, declined: true, message: 'This browser cannot make network calls.' });
    }
    var sys = buildSystemPrompt();
    var body = JSON.stringify({
      model: useHouse ? MUSE_MODEL : (opts.model || 'openai/gpt-oss-20b:free'),
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: 'Passage under study: ' + (opts.passage || 'none given') + '\nQuestion: ' + intentPrompt(intent, question) }
      ],
      max_tokens: 2000,
      temperature: 0.3
    });
    return fetchFn(endpoint, {
      method: 'POST',
      headers: useHouse ? { 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: body
    }).then(function (resp) {
      if (!resp.ok) { throw new Error('HTTP ' + resp.status); }
      return resp.json();
    }).then(function (data) {
      var raw = (((data.choices || [])[0] || {}).message || {}).content || '';
      var capped = capWords(raw, WORD_CAP);
      return { ok: true, refused: false, answer: frameAnswer(capped.text, { capped: capped.capped }) };
    }).catch(function (err) {
      return { ok: false, declined: true, message: 'The assistant could not answer (' + err.message + '). ' + (useHouse ? 'The house assistant may be away; everything else in Ehyeh works.' : 'Check your endpoint and key. Nothing was charged.') };
    });
  }

  /* Action-button prompts: fixed study actions, not an open box. */
  var ACTION_PROMPTS = {
    word: 'Explain the meaning of this word in its original language, briefly: ',
    background: 'Give brief historical and cultural background for this passage (under 150 words): ',
    xrefs: 'List the most relevant cross-references for this passage and one line on why each matters: ',
    questions: 'Give me application questions to pray over for this passage — questions only, no answers, no sermon points: ',
    tips: 'Give me study tips for this passage: what to read around it, what to look up, what to watch for: ',
    person: 'Who was this Bible figure? Give brief factual background only — who they were, when they lived, what they did (under 150 words). No sermon material: ',
    topic: 'Summarize what the Bible says about this topic as a study aid (under 150 words), naming the key passages. Do not write sermon content: '
  };
  function actionPrompt(kind, context) {
    return (ACTION_PROMPTS[kind] || ACTION_PROMPTS.tips) + (context || '');
  }
  /* Wrap a free-text question in its intent's safe template. The text box is a
     convenience layer over the same templates the action buttons use. */
  function intentPrompt(intent, question) {
    for (var i = 0; i < SAFE_INTENTS.length; i++) {
      if (SAFE_INTENTS[i].name === intent) {
        return actionPrompt(SAFE_INTENTS[i].template, question);
      }
    }
    return actionPrompt('tips', question);
  }

  return {
    init: SSB_init, db: db,
    parseReference: parseReference, detectLanguage: detectLanguage,
    lookupWord: lookupWord, getLexicon: getLexicon, getNotes: getNotes,
    getXrefs: getXrefs, getVerseText: getVerseText, searchEaston: searchEaston,
    getMisuses: getMisuses, normWord: normWord, verseKey: verseKey,
    classifyIntent: classifyIntent, redirectMessage: redirectMessage,
    intentPrompt: intentPrompt, SAFE_INTENTS: SAFE_INTENTS,
    buildSystemPrompt: buildSystemPrompt,
    warmRefusal: warmRefusal, capWords: capWords, frameAnswer: frameAnswer,
    callAssistant: callAssistant, actionPrompt: actionPrompt,
    WORD_CAP: WORD_CAP, ARAMAIC_ZONES: ARAMAIC_ZONES
  };
}));

