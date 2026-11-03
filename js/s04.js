
/* Sermon Skeleton Builder v2 — UI wiring for Study / Dictionary / Assistant views.
   Expects window.SSB (v2.js) and SSB_DATA. Uses textContent-only rendering (no innerHTML).
   In Node tests, pass a stub document: SSBUI_init(doc, ssb). */
(function (root, factory) {
  'use strict';
  var UI = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = UI; }
  else { root.SSBUI = UI; }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function makeApi(doc, SSB) {
    function $(id) { return doc.getElementById(id); }
    function el(tag, attrs, text) {
      var n = doc.createElement(tag);
      if (attrs) { Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); }
      if (text !== undefined && text !== null) { n.textContent = String(text); }
      return n;
    }
    function clear(n) { while (n.firstChild) { n.removeChild(n.firstChild); } }

    var study = { book: 43, chapter: 1 }; // default: John 1

    /* ---------- Study: passage reader ---------- */
    function populateBooks() {
      var sel = $('st-book');
      clear(sel);
      SSB.db().books.forEach(function (name, i) {
        var o = el('option', { value: String(i + 1) }, name);
        if (i + 1 === study.book) { o.selected = true; }
        sel.appendChild(o);
      });
    }
    function populateChapters() {
      var sel = $('st-chapter');
      clear(sel);
      var max = SSB.db().chapter_counts[String(study.book)] || 1;
      for (var c = 1; c <= max; c++) {
        var o = el('option', { value: String(c) }, 'Chapter ' + c);
        if (c === study.chapter) { o.selected = true; }
        sel.appendChild(o);
      }
    }
    function splitWords(text) {
      // Split into word tokens and separators, preserving punctuation/spacing.
      var parts = [], re = /[A-Za-z']+|[^A-Za-z']+/g, m;
      while ((m = re.exec(text)) !== null) { parts.push(m[0]); }
      return parts;
    }
    function isWord(tok) { return /^[A-Za-z']+$/.test(tok); }

    function renderChapter() {
      var box = $('st-text');
      clear(box);
      var b = study.book, c = study.chapter;
      var ch = (SSB.db().bible[String(b)] || {})[String(c)] || {};
      var verses = Object.keys(ch).map(Number).sort(function (a, z) { return a - z; });
      $('st-ref-line').textContent = SSB.db().books[b - 1] + ' ' + c +
        ' — Geneva Bible (1599). Tap any word to study it.';
      verses.forEach(function (v) {
        var p = el('p', { 'class': 'verse', 'data-verse': String(v) });
        p.appendChild(el('span', { 'class': 'verse-num' }, String(v)));
        splitWords(ch[String(v)]).forEach(function (tok) {
          if (isWord(tok)) {
            var s = el('span', { 'class': 'w', tabindex: '0', role: 'button',
              'data-word': tok, 'data-verse': String(v),
              'aria-label': 'Study the word ' + tok });
            s.textContent = tok;
            p.appendChild(s);
          } else {
            p.appendChild(doc.createTextNode(tok));
          }
        });
        box.appendChild(p);
      });
      hideWordPanel();
      renderNotesForChapter();
    }

    function hideWordPanel() { $('st-word-panel').hidden = true; }

    function showWordPanel(word, verseNum) {
      var b = study.book, c = study.chapter, v = parseInt(verseNum, 10);
      var lang = SSB.detectLanguage(b, c, v);
      var res = SSB.lookupWord(b, c, v, word);
      var panel = $('st-word-panel');
      var body = $('st-word-body');
      clear(body);
      $('st-lang').textContent = lang;
      body.appendChild(el('h3', {}, '“' + word + '”'));
      if (res.via === 'direct') {
        res.strongs.forEach(function (num) {
          var lex = SSB.getLexicon(num);
          if (!lex) { return; }
          var tbl = el('table', { 'class': 'kv-table' });
          var rows = [
            ['Strong’s number', num],
            ['Original word', ''],
            ['Transliteration', lex.transliteration],
            ['Meaning', lex.definition]
          ];
          rows.forEach(function (r) {
            var tr = el('tr');
            tr.appendChild(el('th', {}, r[0]));
            var td = el('td', {}, r[1]);
            if (r[0] === 'Original word') { td.textContent = lex.word; td.className = 'orig-word'; }
            tr.appendChild(td);
            tbl.appendChild(tr);
          });
          body.appendChild(tbl);
        });
      } else if (res.via === 'verse-list') {
        var p = el('p', {}, 'This wording differs from the mapping below, so here are all the underlying words in ' +
          SSB.db().books[b - 1] + ' ' + c + ':' + v + ':');
        body.appendChild(p);
        var list = el('ul');
        res.strongs.forEach(function (num) {
          var lex = SSB.getLexicon(num);
          var li = el('li');
          li.appendChild(el('span', { 'class': 'strongs-num' }, num + ' '));
          li.appendChild(doc.createTextNode((lex ? lex.transliteration + ' — ' + lex.definition : 'definition unavailable')));
          list.appendChild(li);
        });
        body.appendChild(list);
      } else {
        body.appendChild(el('p', {}, 'No word-study data is available for this verse.'));
      }
      var cav = el('div', { 'class': 'caveat' });
      cav.textContent = 'Honest note: ' + SSB.db().meta.caveat;
      body.appendChild(cav);
      var tip = el('p', { 'class': 'help' });
      tip.textContent = 'Use it rightly: the English already carries the meaning — word study confirms the text, it does not replace it.';
      body.appendChild(tip);
      panel.hidden = false;
    }

    function renderNotesForChapter() {
      var b = study.book, c = study.chapter;
      var ch = (SSB.db().bible[String(b)] || {})[String(c)] || {};
      var verses = Object.keys(ch).map(Number).sort(function (a, z) { return a - z; });
      var nbox = $('st-notes'), xbox = $('st-xrefs');
      clear(nbox); clear(xbox);
      var nCount = 0, xCount = 0;
      verses.forEach(function (v) {
        SSB.getNotes(b, c, v).forEach(function (n) {
          var d = el('div', { 'class': 'margin-note' });
          d.appendChild(el('div', { 'class': 'src' }, SSB.db().books[b - 1] + ' ' + c + ':' + v + ' — Geneva margin note (16th-century Reformer voice)'));
          d.appendChild(el('p', {}, n));
          nbox.appendChild(d);
          nCount++;
        });
        SSB.getXrefs(b, c, v).forEach(function (x) {
          var ref = SSB.parseReference(x.label.replace(/^[A-Za-z. ]+/, function (m) { return m; }));
          var chip = el('button', { type: 'button', 'class': 'xref-chip', 'data-xref': x.ref }, x.label);
          chip.setAttribute('aria-label', 'Read ' + x.label);
          xbox.appendChild(chip);
          xCount++;
        });
      });
      $('st-notes-card').hidden = nCount === 0;
      $('st-xrefs-card').hidden = xCount === 0;
    }

    function goToXref(ref) {
      var p = String(ref).split(':');
      if (p.length !== 3) { return; }
      study.book = parseInt(p[0], 10); study.chapter = parseInt(p[1], 10);
      populateBooks(); populateChapters(); renderChapter();
      var box = $('st-text');
      var target = null;
      for (var i = 0; i < box.children.length; i++) {
        if (box.children[i].getAttribute('data-verse') === p[2]) { target = box.children[i]; break; }
      }
      if (target && target.scrollIntoView) { target.scrollIntoView(); }
    }

    function renderLesson() {
      var box = $('st-lesson-body');
      clear(box);
      var intro = el('p', { 'class': 'help' });
      intro.textContent = 'A concordance is a powerful tool — and a misunderstood one. Here are the six classic mistakes, and what to do instead.';
      box.appendChild(intro);
      SSB.getMisuses().forEach(function (m) {
        var card = el('div', { 'class': 'lesson-card' });
        card.appendChild(el('h4', {}, m.title));
        var w = el('p'); w.appendChild(el('strong', {}, 'The mistake: ')); w.appendChild(doc.createTextNode(m.wrong));
        var r = el('p', { 'class': 'instead' }); r.appendChild(el('strong', {}, 'Instead: ')); r.appendChild(doc.createTextNode(m.right));
        card.appendChild(w); card.appendChild(r);
        box.appendChild(card);
      });
    }

    /* ---------- Dictionary ---------- */
    function doDictionarySearch() {
      var q = $('dict-q').value;
      var box = $('dict-results');
      clear(box);
      var res = SSB.searchEaston(q);
      if (!res.length) {
        box.appendChild(el('p', { 'class': 'empty' }, 'No dictionary entry found. Try a person, place, or term (e.g., Aaron, Jerusalem).'));
        return;
      }
      res.forEach(function (r) {
        var d = el('div', { 'class': 'dict-result' });
        d.appendChild(el('h3', {}, r.term.charAt(0).toUpperCase() + r.term.slice(1)));
        d.appendChild(el('p', {}, r.definition));
        var src = el('p', { 'class': 'help' });
        src.textContent = 'Easton’s Bible Dictionary (1897), public domain.';
        d.appendChild(src);
        box.appendChild(d);
      });
    }

    /* ---------- Assistant ---------- */
    var asst = { key: '', endpoint: '' };
    function sessionStore() {
      try { return (typeof sessionStorage !== 'undefined') ? sessionStorage : null; }
      catch (e) { return null; }
    }
    function asstEnabled() { return !!(asst.key && asst.endpoint); }
    function enableAssistant() {
      asst.key = $('asst-key').value.trim();
      asst.endpoint = $('asst-endpoint').value.trim();
      var st = sessionStore();
      if (st) { try { st.setItem('ssb.asst.key', asst.key); st.setItem('ssb.asst.endpoint', asst.endpoint); } catch (e) {} }
      updateAsstStatus();
    }
    function disableAssistant() {
      asst.key = ''; asst.endpoint = '';
      $('asst-key').value = ''; $('asst-endpoint').value = '';
      var st = sessionStore();
      if (st) { try { st.removeItem('ssb.asst.key'); st.removeItem('ssb.asst.endpoint'); } catch (e) {} }
      updateAsstStatus();
    }
    function updateAsstStatus() {
      $('asst-status').textContent = asstEnabled()
        ? 'Assistant enabled for this tab only. It answers study questions — never sermon wording.'
        : 'Assistant is off. Nothing here contacts any service.';
      $('asst-chat').hidden = !asstEnabled();
    }
    function restoreAssistant() {
      var st = sessionStore();
      if (st) {
        try {
          asst.key = st.getItem('ssb.asst.key') || '';
          asst.endpoint = st.getItem('ssb.asst.endpoint') || '';
          if (asst.key) { $('asst-key').value = asst.key; }
          if (asst.endpoint) { $('asst-endpoint').value = asst.endpoint; }
        } catch (e) {}
      }
      updateAsstStatus();
    }
    function currentPassageLabel() {
      return SSB.db().books[study.book - 1] + ' ' + study.chapter;
    }
    function renderAnswer(res) {
      var out = $('asst-out');
      clear(out);
      var box = el('div', { 'class': 'asst-answer' });
      if (!res.ok) {
        box.appendChild(el('p', {}, res.message));
      } else if (res.refused) {
        box.appendChild(el('p', { 'class': 'refusal' }, res.answer.body));
      } else {
        box.appendChild(el('div', { 'class': 'tips' }, res.answer.tips));
        var ps = String(res.answer.body).split(/\n\s*\n/);
        ps.forEach(function (para) { box.appendChild(el('p', {}, para)); });
        if (res.answer.capped) {
          var cn = el('p', { 'class': 'help' });
          cn.textContent = '(Answer shortened to 150 words — the assistant gives snippets, not scripts.)';
          box.appendChild(cn);
        }
        box.appendChild(el('div', { 'class': 'verify' }, res.answer.verify));
      }
      out.appendChild(box);
    }
    function askAssistant(kindOrQuestion, fetchImpl) {
      var question = (kindOrQuestion === 'free') ? $('asst-q').value.trim()
        : SSB.actionPrompt(kindOrQuestion, currentPassageLabel());
      if (!question) { return Promise.resolve(); }
      $('asst-out').textContent = 'Thinking…';
      return SSB.callAssistant({
        key: asst.key, endpoint: asst.endpoint,
        question: question, passage: currentPassageLabel()
      }, fetchImpl).then(function (res) { renderAnswer(res); return res; });
    }

    /* ---------- init / events ---------- */
    function init() {
      if (!SSB.db()) { return false; }
      populateBooks(); populateChapters(); renderChapter(); renderLesson(); restoreAssistant();
      $('st-go').addEventListener('click', function () {
        study.book = parseInt($('st-book').value, 10);
        study.chapter = parseInt($('st-chapter').value, 10);
        populateChapters(); renderChapter();
      });
      $('st-book').addEventListener('change', function () {
        study.book = parseInt($('st-book').value, 10);
        study.chapter = 1;
        populateChapters(); renderChapter();
      });
      $('st-chapter').addEventListener('change', function () {
        study.chapter = parseInt($('st-chapter').value, 10);
        renderChapter();
      });
      function step(d) {
        var max = SSB.db().chapter_counts[String(study.book)] || 1;
        var nc = study.chapter + d, nb = study.book;
        if (nc < 1) { if (nb > 1) { nb--; nc = SSB.db().chapter_counts[String(nb)] || 1; } else { return; } }
        if (nc > max) { if (nb < 66) { nb++; nc = 1; } else { return; } }
        study.book = nb; study.chapter = nc;
        populateBooks(); populateChapters(); renderChapter();
      }
      $('st-prev').addEventListener('click', function () { step(-1); });
      $('st-next').addEventListener('click', function () { step(1); });
      $('st-text').addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('.w') : null;
        if (t) {
          var prev = $('st-text').querySelector('.w.active');
          if (prev) { prev.classList.remove('active'); }
          t.classList.add('active');
          showWordPanel(t.getAttribute('data-word'), t.getAttribute('data-verse'));
        }
        var x = e.target && e.target.closest ? e.target.closest('.xref-chip') : null;
        // xref chips live in a different card; handled below too
      });
      $('st-text').addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.classList &&
            e.target.classList.contains('w')) {
          e.preventDefault();
          showWordPanel(e.target.getAttribute('data-word'), e.target.getAttribute('data-verse'));
        }
      });
      $('st-xrefs').addEventListener('click', function (e) {
        var x = e.target && e.target.closest ? e.target.closest('.xref-chip') : null;
        if (x) { goToXref(x.getAttribute('data-xref')); }
      });
      $('dict-go').addEventListener('click', doDictionarySearch);
      $('dict-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { doDictionarySearch(); } });
      $('asst-enable').addEventListener('click', enableAssistant);
      $('asst-disable').addEventListener('click', disableAssistant);
      $('asst-ask').addEventListener('click', function () { askAssistant('free'); });
      $('asst-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { askAssistant('free'); } });
      var acts = doc.querySelectorAll('[data-asst]');
      for (var i = 0; i < acts.length; i++) {
        (function (b) {
          b.addEventListener('click', function () { askAssistant(b.getAttribute('data-asst')); });
        })(acts[i]);
      }
      return true;
    }

    return {
      init: init, renderChapter: renderChapter, showWordPanel: showWordPanel,
      doDictionarySearch: doDictionarySearch, goToXref: goToXref,
      enableAssistant: enableAssistant, disableAssistant: disableAssistant,
      askAssistant: askAssistant, renderLesson: renderLesson,
      _study: study, _asst: asst, _splitWords: splitWords
    };
  }

  // Browser: wire to real document + window.SSB on DOMContentLoaded-ish (script at end of body).
  function browserInit() {
    if (typeof document === 'undefined' || typeof window === 'undefined' || !window.SSB) { return null; }
    var api = makeApi(document, window.SSB);
    api.init();
    return api;
  }

  return { makeApi: makeApi, browserInit: browserInit };
}));

