
/* Hagah UX revamp (task hagah-ux-revamp-001): first-launch onboarding tour,
   per-view "?" help, and "watch how" video slots.
   - Self-contained: no network calls, no credentials, no dependencies.
   - help-videos.json is the source of truth for the video manifest; its
     contents are embedded below as HAGAH_HELP_VIDEOS (build step: copy the
     JSON file verbatim into that constant). The single file never fetches
     the manifest at runtime (the page CSP forbids fetch anyway).
   - Fails safe: unknown view ids open nothing rather than wrong help;
     missing/unloadable videos keep the friendly placeholder text visible.
*/
(function () {
  'use strict';

  /* ---- storage: localStorage with in-memory fallback; never throws ---- */
  var memStore = {};
  var store = {
    get: function (key) {
      try {
        var v = window.localStorage.getItem('hagah.' + key);
        return v === null ? (memStore[key] || null) : v;
      } catch (e) { return memStore[key] || null; }
    },
    set: function (key, value) {
      memStore[key] = value;
      try { window.localStorage.setItem('hagah.' + key, value); } catch (e) { /* best-effort */ }
    }
  };
  var ONBOARDED = 'onboarded';

  /* ---- plain-language help copy: 1-2 sentences per view ---- */
  var HELP = {
    start: ['Getting started', 'Choose how to begin: from a Bible passage, a theme, or a blank page. Ehyeh only organizes your own words \u2014 it never writes your sermon.'],
    setup: ['Sermon setup', 'Give your sermon a title, passage, and shape here: walk through the passage or build a theme, with three or five movements.'],
    study: ['Study Scripture', 'Read the Geneva Bible (1599) and tap any word to study it. Margin notes and cross-references from the Geneva editors are included for digging deeper.'],
    structure: ['Structure', 'Lay out your sermon\u2019s bones: one central idea, your movements, the turn, and the landing. Every word here is yours \u2014 Ehyeh only holds the outline.'],
    check: ['Faithfulness check', 'A short checklist to review before you preach. You check each box yourself; nothing is filled in for you.'],
    dictionary: ['Bible Dictionary', 'Look up people, places, and terms in Easton\u2019s Bible Dictionary (1897). It works fully offline.'],
    library: ['Saved sermons', 'Every sermon you save lives in this browser only. Export backups regularly \u2014 clearing browser data will lose them.'],
    assistant: ['Study Assistant', 'An optional helper that answers short study questions about the text. It refuses to write sermon wording, illustrations, or prayers.'],
    print: ['Print preview', 'Your pulpit sheet in large type, designed to fit one page. If it runs long, shorten a field or choose the smaller type size.']
  };

  /* ---- onboarding tour: 4 steps, plain language, dismissable ---- */
  var STEPS = [
    { title: 'Welcome to Ehyeh',
      body: 'Ehyeh is the name God spoke at the burning bush \u2014 \u201cI AM\u201d (Exodus 3:14). It helps you study Scripture and organize a sermon \u2014 and one rule shapes everything: Ehyeh never writes your sermon. Every word is yours.' },
    { title: 'Study Scripture first',
      body: 'Read the Geneva Bible (1599), tap any word to study its meaning, and look things up in the built-in Bible dictionary. Wondering what a page does? Press the ? button on it.' },
    { title: 'Build the bones',
      body: 'Start a sermon from a passage or a theme, arrange your own movements in Structure, then run the Faithfulness check. Press Save anytime \u2014 your sermons stay in this browser.' },
    { title: 'Help is one tap away',
      body: 'Every page has a ? button and a \u201cWatch how\u201d video. The study assistant answers short study questions but will never write sermons. Ready? Press \u201cStart.\u201d' }
  ];

  /* ---- video manifest: embedded copy of help-videos.json ---- */
  var VIDEOS = {"note":"Help-video manifest for Hagah.html 'Watch how' slots. Each entry maps a view id to a video file. Files live in help-videos/ next to the HTML. The HTML embeds a copy of this manifest (build step: copy verbatim into HAGAH_HELP_VIDEOS) so the page stays a single self-contained file and never needs a network fetch (the page CSP forbids it). If a listed file is missing or unloadable, the page shows a friendly placeholder message instead of a broken player.","version":1,"videos":[{"file":"help-videos/start.mp4","title":"Getting started with Ehyeh","view":"start"},{"file":"help-videos/setup.mp4","title":"Setting up your sermon","view":"setup"},{"file":"help-videos/study.mp4","title":"Reading and studying Scripture","view":"study"},{"file":"help-videos/structure.mp4","title":"Building your sermon structure","view":"structure"},{"file":"help-videos/check.mp4","title":"The faithfulness check","view":"check"},{"file":"help-videos/dictionary.mp4","title":"Using the Bible dictionary","view":"dictionary"},{"file":"help-videos/library.mp4","title":"Saving and finding sermons","view":"library"},{"file":"help-videos/assistant.mp4","title":"Asking the study assistant","view":"assistant"},{"file":"help-videos/print.mp4","title":"Printing your pulpit sheet","view":"print"},{"file":"help-videos/welcome.mp4","title":"Welcome to Ehyeh","view":"welcome"}]};

  /* ---- overlay helpers (onboarding + help modal share these) ---- */
  var lastFocus = null;
  function openOverlay(el) {
    if (!el) { return; }
    lastFocus = document.activeElement;
    el.removeAttribute('hidden');
    try { document.body.style.overflow = 'hidden'; } catch (e) {}
    var f = el.querySelector('button');
    if (f) { try { f.focus(); } catch (e) {} }
  }
  function closeOverlay(el) {
    if (!el) { return; }
    el.setAttribute('hidden', '');
    try { document.body.style.overflow = ''; } catch (e) {}
    if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) {} }
    lastFocus = null;
  }

  function ready(fn) {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', fn); }
    else { fn(); }
  }

  ready(function () {
    /* ---- help modal ---- */
    var helpModal = document.getElementById('help-modal');
    var helpTitle = document.getElementById('help-title');
    var helpBody = document.getElementById('help-body');
    var helpClose = document.getElementById('help-close');
    function openHelp(id) {
      var h = HELP[id];
      if (!h) { return; } /* unknown view: open nothing rather than wrong text */
      helpTitle.textContent = h[0];
      helpBody.textContent = h[1];
      openOverlay(helpModal);
    }
    if (helpClose) { helpClose.addEventListener('click', function () { closeOverlay(helpModal); }); }
    document.addEventListener('click', function (e) {
      var t = e.target;
      var b = (t && t.closest) ? t.closest('.help-btn') : null;
      if (!b) { return; }
      openHelp(b.getAttribute('data-help-view'));
    });

    /* ---- onboarding ---- */
    var onb = document.getElementById('onboard');
    var onbTitle = document.getElementById('onb-title');
    var onbBody = document.getElementById('onb-body');
    var onbDots = document.getElementById('onb-dots');
    var onbSkip = document.getElementById('onb-skip');
    var onbBack = document.getElementById('onb-back');
    var onbNext = document.getElementById('onb-next');
    var replay = document.getElementById('onboard-replay');
    var step = 0;
    function renderStep() {
      var s = STEPS[step];
      onbTitle.textContent = s.title;
      onbBody.textContent = s.body;
      while (onbDots.firstChild) { onbDots.removeChild(onbDots.firstChild); }
      for (var i = 0; i < STEPS.length; i++) {
        var d = document.createElement('span');
        d.className = 'onb-dot' + (i === step ? ' on' : '');
        onbDots.appendChild(d);
      }
      onbBack.disabled = (step === 0);
      onbNext.textContent = (step === STEPS.length - 1) ? 'Start' : 'Next';
      var ow = document.getElementById('onb-watch');
      if (ow) {
        if (step === 0) { ow.removeAttribute('hidden'); }
        else {
          ow.setAttribute('hidden', '');
          var owv = ow.querySelector('video');
          if (owv) { try { owv.pause(); } catch (e) {} }
        }
      }
    }
    function finishTour() {
      var owv = document.querySelector('#onb-watch video');
      if (owv) { try { owv.pause(); } catch (e) {} }
      store.set(ONBOARDED, '1'); closeOverlay(onb);
    }
    function startTour() { step = 0; renderStep(); openOverlay(onb); }
    if (onbNext) { onbNext.addEventListener('click', function () {
      if (step < STEPS.length - 1) { step++; renderStep(); } else { finishTour(); }
    }); }
    if (onbBack) { onbBack.addEventListener('click', function () { if (step > 0) { step--; renderStep(); } }); }
    if (onbSkip) { onbSkip.addEventListener('click', finishTour); }
    if (replay) { replay.addEventListener('click', startTour); }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') { return; }
      if (onb && !onb.hasAttribute('hidden')) { finishTour(); }
      else if (helpModal && !helpModal.hasAttribute('hidden')) { closeOverlay(helpModal); }
    });
    /* first launch only: repeat visits see nothing */
    if (store.get(ONBOARDED) !== '1') { startTour(); }

    /* ---- watch-how video slots ---- */
    wireWatchSlots();
  });

  function manifestEntries() {
    if (VIDEOS && Object.prototype.toString.call(VIDEOS.videos) === '[object Array]') { return VIDEOS.videos; }
    return [];
  }
  function entryFor(view) {
    var es = manifestEntries();
    for (var i = 0; i < es.length; i++) {
      var e = es[i];
      if (e && e.view === view && typeof e.file === 'string' && e.file) {
        if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(e.file)) { return null; } /* local files only: no URLs, no schemes */
        return e;
      }
    }
    return null;
  }
  function wireWatchSlots() {
    var slots = document.querySelectorAll('details.watchhow');
    for (var i = 0; i < slots.length; i++) { wireSlot(slots[i]); }
  }
  function wireSlot(d) {
    var view = d.getAttribute('data-watch-view');
    var video = d.querySelector('video');
    var fallback = d.querySelector('.watchhow-fallback');
    if (!video) { return; }
    var wired = false;
    function showFallback() { if (fallback) { fallback.hidden = false; } }
    d.addEventListener('toggle', function () {
      if (!d.open || wired) { return; }
      wired = true;
      var entry = view ? entryFor(view) : null;
      if (!entry) { showFallback(); return; } /* view missing from manifest: graceful */
      function onError() { video.removeEventListener('error', onError); showFallback(); }
      function onReady() { video.removeEventListener('loadedmetadata', onReady); if (fallback) { fallback.hidden = true; } }
      video.addEventListener('error', onError);
      video.addEventListener('loadedmetadata', onReady);
      try { video.src = entry.file; video.load(); } catch (e) { showFallback(); }
    });
  }
})();
