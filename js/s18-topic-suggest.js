/* Ehyeh — Sermon Builder topic suggestions (FIX B, simplicity pass).
   Data + matching ONLY. No prose: every string here is a point TITLE,
   a Scripture reference copied verbatim from the app's own topic
   passage sets, or a one-line idea prompt. The preacher edits or
   deletes all of it — Ehyeh never writes the sermon.

   SOURCE OF THE PASSAGE SETS (do not invent references):
   Hagah.html, SKEL.hagah.topics.topics — the same curated sets the
   Topical Chains module (js/s08.js, getTopics()) and the Compare a
   Topic flow use. Each topic below carries `verses` copied verbatim
   from that data, and every primaryRef / supportingRefs entry is an
   exact member of its topic's `verses` list. The FIX-B self-check
   re-verifies that membership against Hagah.html mechanically.

   SET 14 (Anger, added 2026-10-29 at Donnie's own request, from the
   topic he typed into the preview): SKEL holds no anger set, so its
   verses could not be copied from one. Each reference was instead
   verified verse by verse against the app's own Geneva 1599 text
   (canonical data/geneva/*.json — book, chapter, and every verse of
   the span present). Same discipline — nothing invented — with the
   Bible text itself as the ground truth. The FIX-B self-check
   re-verifies the 13 against SKEL and Anger against the Geneva files.

   Offline-first: this file is plain data + pure functions. No fetch,
   no network. In the browser it attaches window.EHYEH_TOPIC_SUGGEST;
   under Node it is require()-able for the self-check. */
(function (root, factory) {
  'use strict';
  var API = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (root) { root.EHYEH_TOPIC_SUGGEST = API; }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  var BANNER = 'Suggested starting points from Ehyeh — change any of them. The words are yours.';
  var IDEAS_LABEL = 'Explain it in real life — ideas';
  var IDEAS_HELP = 'One-line sparks for your own stories and pictures. Use one, change it, or delete them all — the telling is yours.';
  var TODAY_LABEL = 'Relates to today — ideas';
  var TODAY_HELP = 'Present-day situations where this passage lands. Sparks only — where it lands in your people’s week is yours to say.';
  var TOPIC_TITLES = ['Anxiety and Worry', 'Forgiveness', 'Prayer', 'Faith', 'Growing in Virtue', 'Anger', 'Love', 'Fear', 'Guidance and Decisions', 'Gratitude and Thanksgiving', 'Suffering and Trials', 'Hope', 'Peace', 'Wisdom'];
  var FALLBACK_NOTE = 'Ehyeh doesn’t have a ready-made passage set for this topic yet. The built-in topics are: ' + TOPIC_TITLES.join(', ') + '. Ways forward, right here: try your topic in different words — different words match different sets and gather different passages. Or go back and choose “My verses” — start from the passages you have, and Ehyeh builds the outline around them. Or fill the boxes in your own words.';

  /* points: exactly 3 per topic. title = short heading phrase only.
     primaryRef / supportingRefs: exact strings from `verses` only.
     ideas: 2–3 one-line prompts. Every string ≤ 140 characters —
     headings and prompts, never prose to read aloud. */
  var TOPICS = [
    {
      id: 'anxiety', title: 'Anxiety and Worry',
      aliases: ['anxiety', 'worry', 'worried', 'worrying', 'anxious', 'anxiety and worry'],
      verses: ['Philippians 4:6-7', '1 Peter 5:7', 'Matthew 6:34', 'Psalm 55:22', 'Isaiah 41:10', 'John 14:27'],
      points: [
        { title: 'Bring every worry to God in prayer', primaryRef: 'Philippians 4:6-7', supportingRefs: '1 Peter 5:7' },
        { title: 'God carries what you cannot carry', primaryRef: 'Psalm 55:22', supportingRefs: 'Isaiah 41:10' },
        { title: 'Live today; do not borrow tomorrow’s trouble', primaryRef: 'Matthew 6:34', supportingRefs: 'John 14:27' }
      ],
      ideas: [
        'A heavy bag carried all day — set it down at God’s feet, like 1 Peter 5:7 says.',
        'A child asleep while the parent drives — rest, because Someone else is awake.',
        'Bills on the table, one by one — name each worry out loud in prayer.'
      ]
    },
    {
      id: 'forgiveness', title: 'Forgiveness',
      aliases: ['forgiveness', 'forgive', 'forgiving', 'forgiven'],
      verses: ['1 John 1:9', 'Ephesians 4:32', 'Colossians 3:13', 'Matthew 6:14-15', 'Psalm 103:12', 'Micah 7:18-19'],
      points: [
        { title: 'God forgives us first', primaryRef: '1 John 1:9', supportingRefs: 'Psalm 103:12' },
        { title: 'Forgiven people forgive each other', primaryRef: 'Ephesians 4:32', supportingRefs: 'Colossians 3:13' },
        { title: 'Forgive, as you have been forgiven', primaryRef: 'Matthew 6:14-15', supportingRefs: 'Micah 7:18-19' }
      ],
      ideas: [
        'A debt at the bank cancelled — you owe nothing; that’s how God wipes the slate.',
        'East to west on a map never meets — Psalm 103:12 puts sins that far away.',
        'Holding a hot coal to throw — the one who won’t forgive gets burned first.'
      ]
    },
    {
      id: 'prayer', title: 'Prayer',
      aliases: ['prayer', 'prayers', 'praying', 'pray'],
      verses: ['Matthew 6:9-13', '1 Thessalonians 5:17', 'James 5:16', 'Jeremiah 33:3', 'Luke 11:9-10', 'Philippians 4:6'],
      points: [
        { title: 'Jesus teaches us how to pray', primaryRef: 'Matthew 6:9-13', supportingRefs: 'Luke 11:9-10' },
        { title: 'Pray at all times, not only in trouble', primaryRef: '1 Thessalonians 5:17', supportingRefs: 'Philippians 4:6' },
        { title: 'God hears and answers prayer', primaryRef: 'Jeremiah 33:3', supportingRefs: 'James 5:16' }
      ],
      ideas: [
        'A phone line that is never busy — God invites you to call, Jeremiah 33:3.',
        'Knocking on a neighbour’s door at midnight — keep asking, like Luke 11.',
        'Talking with a father at the kitchen table — prayer is a talk, not a speech.'
      ]
    },
    {
      id: 'faith', title: 'Faith',
      aliases: ['faith', 'belief', 'believing', 'believe'],
      verses: ['Hebrews 11:1', 'Hebrews 11:6', 'Romans 10:17', 'Mark 11:24', 'James 2:17', '2 Corinthians 5:7'],
      points: [
        { title: 'Faith trusts what we cannot see', primaryRef: 'Hebrews 11:1', supportingRefs: '2 Corinthians 5:7' },
        { title: 'Faith grows by hearing God’s Word', primaryRef: 'Romans 10:17', supportingRefs: 'Hebrews 11:6' },
        { title: 'Real faith shows itself in action', primaryRef: 'James 2:17', supportingRefs: 'Mark 11:24' }
      ],
      ideas: [
        'Sitting on a chair without testing it first — trust proved by resting on it.',
        'Walking a path by lamplight — you see the next step, not the whole road.',
        'A seed planted before any green shows — faith acts before results appear.'
      ]
    },
    {
      id: 'growing-in-virtue', title: 'Growing in Virtue',
      aliases: ['growing in virtue', 'virtue', 'virtues', 'character', 'growing', 'growth'],
      verses: ['2 Peter 1:5-7', 'Hebrews 5:14', 'Romans 7:15-23', 'Colossians 3:5-10', 'Matthew 6:16-18', 'Romans 5:3-4', 'Galatians 5:22-25', '1 John 1:8-9'],
      points: [
        { title: 'Growth comes step by step', primaryRef: '2 Peter 1:5-7', supportingRefs: 'Galatians 5:22-25' },
        { title: 'Put off the old life, put on the new', primaryRef: 'Colossians 3:5-10', supportingRefs: '1 John 1:8-9' },
        { title: 'Struggle and practice train us', primaryRef: 'Romans 7:15-23', supportingRefs: 'Hebrews 5:14, Romans 5:3-4' }
      ],
      ideas: [
        'Changing out of old work clothes — Colossians 3 pictures a new life to put on.',
        'An athlete in training — the senses get sharp by practice, Hebrews 5:14.',
        'Stairs, not an elevator — Peter lists one step added to the next.'
      ]
    },
    {
      id: 'anger', title: 'Anger',
      aliases: ['anger', 'angry', 'righteous anger', 'sinful anger', 'wrath', 'temper'],
      verses: ['Mark 3:5', 'John 2:13-17', 'Matthew 23:25-28', 'Luke 19:1-10', 'John 8:1-11', 'Ephesians 4:26-27', 'James 1:19-20', 'Psalm 4:4', 'Proverbs 16:32', 'Matthew 5:21-22'],
      points: [
        { title: 'Jesus’ anger fell on hard hearts and hypocrisy', primaryRef: 'Mark 3:5', supportingRefs: 'Matthew 23:25-28, John 2:13-17' },
        { title: 'Jesus welcomed sinners with love, not anger', primaryRef: 'Luke 19:1-10', supportingRefs: 'John 8:1-11' },
        { title: 'Be angry and do not sin — slow anger, short anger', primaryRef: 'Ephesians 4:26-27', supportingRefs: 'Matthew 5:21-22, James 1:19-20' }
      ],
      ideas: [
        'A parent angry at the bully, never at the child — anger aimed at the harm.',
        'Tables turned in a temple, then dinner with Zacchaeus — watch where the anger lands.',
        'A guardrail with a sundown: Ephesians 4:26 lets anger visit, not move in.'
      ],
      /* TERM EXPLANATIONS for study (Donnie, 2026-10-29 — "We need to
         explain hard hearts, and hypocrisy"). These are preparation
         material, NOT sermon content: they explain the concepts a
         point names so the teacher understands before he teaches.
         They never fill a sermon box; they print only when he adds
         one to his outline himself. Every reference named here is
         verified against the app's own Geneva 1599 text by the
         term-explain self-check, like the set's verses. */
      explain: [
        { point: 0, term: 'Hard heart', refs: ['Mark 3:5', 'Ezekiel 36:26'],
          text: 'A heart that will not be moved. In Mark 3:5 the leaders watched Jesus, waiting to accuse him — they heard him, they saw the man’s need, and they would not bend. A hard heart is refusal, not confusion: it understands, and still says no. God promises the opposite — “I will take away the stony heart... and give you a heart of flesh” (Ezekiel 36:26).' },
        { point: 0, term: 'Hypocrisy', refs: ['Matthew 23:25-28'],
          text: 'The Greek word is hypokritēs — a stage actor, one who speaks from behind a mask. Jesus aims it at religion that looks clean outside and is corrupt inside: cups washed on the outside, tombs whitewashed — “beautiful outward, but inside full of dead men’s bones” (Matthew 23:27). The outside and the inside do not match.' },
        { point: 2, term: '“Be angry and sin not”', refs: ['Ephesians 4:26-27', 'Psalm 4:4'],
          text: 'Paul reaches back to Psalm 4:4: “Be angry, and do not sin.” Anger itself is not named the sin — what matters is where it aims and how long it stays. The guardrails are in the same breath: settle it before sundown, and “give no place to the devil” (Ephesians 4:27). Anger aimed at harm and hardness, moving to heal, is one thing; anger aimed at a person and kept overnight becomes another.' }
      ]
    },
    {
      id: 'love', title: 'Love',
      aliases: ['love', 'loving'],
      verses: ['1 Corinthians 13:4-7', 'John 3:16', '1 John 4:8', '1 John 4:19', 'Romans 5:8', 'Mark 12:30-31'],
      points: [
        { title: 'God’s love shown at the cross', primaryRef: 'John 3:16', supportingRefs: 'Romans 5:8' },
        { title: 'What love looks like day by day', primaryRef: '1 Corinthians 13:4-7', supportingRefs: '1 John 4:8' },
        { title: 'Love God, love your neighbour', primaryRef: 'Mark 12:30-31', supportingRefs: '1 John 4:19' }
      ],
      ideas: [
        'A parent running to meet a child — love moves first, before we clean up.',
        'Love as verbs, not feelings — patient, kind: 1 Cor 13 read as a checklist.',
        'The neighbour across the fence — love has an address, not just a feeling.'
      ]
    },
    {
      id: 'fear', title: 'Fear',
      aliases: ['fear', 'fears', 'afraid', 'fearful'],
      verses: ['Isaiah 41:10', '2 Timothy 1:7', 'Psalm 23:4', 'Joshua 1:9', '1 John 4:18', 'Deuteronomy 31:6'],
      points: [
        { title: 'God says: do not fear, I am with you', primaryRef: 'Isaiah 41:10', supportingRefs: 'Deuteronomy 31:6' },
        { title: 'God walks with us through the dark valley', primaryRef: 'Psalm 23:4', supportingRefs: 'Joshua 1:9' },
        { title: 'Love pushes fear out', primaryRef: '1 John 4:18', supportingRefs: '2 Timothy 1:7' }
      ],
      ideas: [
        'A small hand in a big hand crossing a busy street — held, not just told.',
        'A night-light in a child’s room — God’s presence changes the dark.',
        'A shepherd’s staff in the valley — comfort is a Person near, Psalm 23.'
      ]
    },
    {
      id: 'guidance', title: 'Guidance and Decisions',
      aliases: ['guidance', 'guidance and decisions', 'decisions', 'decision', 'direction', 'making decisions'],
      verses: ['Proverbs 3:5-6', 'Psalm 32:8', 'James 1:5', 'Isaiah 30:21', 'Psalm 119:105', 'Jeremiah 29:11'],
      points: [
        { title: 'Trust God, not your own understanding', primaryRef: 'Proverbs 3:5-6', supportingRefs: 'Jeremiah 29:11' },
        { title: 'Ask God for wisdom — he gives it', primaryRef: 'James 1:5', supportingRefs: 'Psalm 32:8' },
        { title: 'God’s Word lights the next step', primaryRef: 'Psalm 119:105', supportingRefs: 'Isaiah 30:21' }
      ],
      ideas: [
        'A lamp shows the next step, not the whole journey — Psalm 119:105.',
        'A compass over a map you drew yourself — trust God’s direction, Prov 3.',
        'Asking a wise father before a big purchase — James 1:5 says ask God.'
      ]
    },
    {
      id: 'gratitude', title: 'Gratitude and Thanksgiving',
      aliases: ['gratitude', 'gratitude and thanksgiving', 'thanksgiving', 'thankful', 'thankfulness', 'thanks'],
      verses: ['1 Thessalonians 5:18', 'Psalm 100:4', 'Colossians 3:17', 'Psalm 107:1', 'Ephesians 5:20', 'Philippians 4:6'],
      points: [
        { title: 'Give thanks in every circumstance', primaryRef: '1 Thessalonians 5:18', supportingRefs: 'Ephesians 5:20' },
        { title: 'Thanks is how we come to God', primaryRef: 'Psalm 100:4', supportingRefs: 'Psalm 107:1' },
        { title: 'Do everything in Jesus’ name, with thanks', primaryRef: 'Colossians 3:17', supportingRefs: 'Philippians 4:6' }
      ],
      ideas: [
        'Saying thank-you at the table before eating — thanks comes first, Ps 100.',
        'A thank-you note after a gift — gratitude names the Giver, not just the gift.',
        'Counting blessings on your fingers at bedtime — one thanks per finger.'
      ]
    },
    {
      id: 'suffering', title: 'Suffering and Trials',
      aliases: ['suffering', 'suffering and trials', 'trials', 'trial', 'hard times', 'pain'],
      verses: ['Romans 5:3-5', '2 Corinthians 4:17', 'James 1:2-4', '1 Peter 4:12-13', 'Psalm 34:18', 'Romans 8:18'],
      points: [
        { title: 'Suffering produces endurance and hope', primaryRef: 'Romans 5:3-5', supportingRefs: 'James 1:2-4' },
        { title: 'God is near to the brokenhearted', primaryRef: 'Psalm 34:18', supportingRefs: '1 Peter 4:12-13' },
        { title: 'Present pain weighed against coming glory', primaryRef: 'Romans 8:18', supportingRefs: '2 Corinthians 4:17' }
      ],
      ideas: [
        'Weights in a gym — resistance is how strength is built, James 1.',
        'A scale: a feather of pain, a stone of glory — Paul weighs them, Rom 8:18.',
        'Sitting with a friend in a hospital chair — nearness is the comfort, Ps 34.'
      ]
    },
    {
      id: 'hope', title: 'Hope',
      aliases: ['hope', 'hoping', 'hopeful'],
      verses: ['Romans 15:13', 'Jeremiah 29:11', 'Hebrews 6:19', 'Psalm 42:11', 'Romans 8:25', 'Lamentations 3:22-23'],
      points: [
        { title: 'God fills his people with hope', primaryRef: 'Romans 15:13', supportingRefs: 'Jeremiah 29:11' },
        { title: 'Hope is an anchor for the soul', primaryRef: 'Hebrews 6:19', supportingRefs: 'Lamentations 3:22-23' },
        { title: 'Hope waits with patience', primaryRef: 'Romans 8:25', supportingRefs: 'Psalm 42:11' }
      ],
      ideas: [
        'An anchor holding a boat in a storm — hope holds; it does not drift, Heb 6.',
        'Sunrise after the longest night — mercies are new every morning, Lam 3.',
        'Seeds under winter soil — hope waits for what cannot be seen yet, Rom 8.'
      ]
    },
    {
      id: 'peace', title: 'Peace',
      aliases: ['peace', 'peaceful'],
      verses: ['John 14:27', 'Philippians 4:7', 'Isaiah 26:3', 'Colossians 3:15', 'Romans 5:1', 'Psalm 29:11'],
      points: [
        { title: 'Jesus gives a peace the world cannot give', primaryRef: 'John 14:27', supportingRefs: 'Romans 5:1' },
        { title: 'Peace guards hearts and minds', primaryRef: 'Philippians 4:7', supportingRefs: 'Isaiah 26:3' },
        { title: 'Let Christ’s peace rule in your hearts', primaryRef: 'Colossians 3:15', supportingRefs: 'Psalm 29:11' }
      ],
      ideas: [
        'A guard standing at the door of your mind — Philippians 4:7 uses that picture.',
        'Still water after wind — a mind stayed on God is kept in peace, Isa 26:3.',
        'A referee settling a dispute — let peace rule and decide, Colossians 3:15.'
      ]
    },
    {
      id: 'wisdom', title: 'Wisdom',
      aliases: ['wisdom', 'wise'],
      verses: ['James 1:5', 'Proverbs 2:6', 'Proverbs 3:13', '1 Kings 3:9', 'Colossians 1:9', 'Proverbs 9:10'],
      points: [
        { title: 'Wisdom comes from God — ask him', primaryRef: 'James 1:5', supportingRefs: 'Proverbs 2:6' },
        { title: 'Blessed is the one who finds wisdom', primaryRef: 'Proverbs 3:13', supportingRefs: 'Colossians 1:9' },
        { title: 'Wisdom begins with reverence for God', primaryRef: 'Proverbs 9:10', supportingRefs: '1 Kings 3:9' }
      ],
      ideas: [
        'Solomon asked for a listening heart, not riches — 1 Kings 3:9.',
        'Treasure buried in a field — Proverbs 2: search for wisdom like silver.',
        'Reading the maker’s instructions before building — fear of the Lord first.'
      ]
    }
  ];

  /* "Relates to today" bullets (spec addition, Donnie 2026-10-29):
     short fragments naming present-day situations, settings, and
     questions where the topic's passages land — work, family, phones,
     money pressure, fear in the news. Ideas only, under the same
     ≤140-character cap as every other suggestion string: no written
     application, no sermon wording, nothing that preaches for him. */
  var TODAY = {
    'anxiety': [
      'A phone buzzing with bad news before the day even starts.',
      'Rent, bills, and a paycheck that feels too small.',
      'Waiting on test results, checking the phone every hour.'
    ],
    'forgiveness': [
      'A family member who brings up an old hurt at every gathering.',
      'A debt someone owes you that they cannot repay.',
      'An apology you keep rehearsing but have not given.'
    ],
    'prayer': [
      'A two-minute pause in the car before walking into work.',
      'A friend asking for prayer in a group chat at midnight.',
      'Talking to God in the grocery line instead of scrolling.'
    ],
    'faith': [
      'Starting the thing before you can see how it ends.',
      'Trusting a pilot you cannot see on a night flight.',
      'Planting a garden in soil that still looks bare.'
    ],
    'growing-in-virtue': [
      'A habit you are trying to change one day at a time.',
      'Practice that feels slow — like training for a race.',
      'Old friends, old places, and the pull of the old life.'
    ],
    'anger': [
      'Angry at a real injustice in the news — then sharp with everyone at home.',
      'Road rage and online pile-ons: quick anger dressed up as righteous.',
      'A family argument where being slow to speak would change everything.'
    ],
    'love': [
      'The neighbour whose name you still do not know.',
      'Loving someone on their hardest day, not their best day.',
      'A parent driving across town at midnight because their child called.'
    ],
    'fear': [
      'Headlines that make the world feel unsafe.',
      'A child afraid of the dark, asking you to stay a while.',
      'Driving home late on an empty road.'
    ],
    'guidance': [
      'Two job offers and no clear answer.',
      'A big purchase the family cannot undo.',
      'Asking a wise friend before deciding, not after.'
    ],
    'gratitude': [
      'Saying thanks before the meal, not after the day goes wrong.',
      'A thank-you text sent the same day, not someday.',
      'Counting good things on a hard night, one by one.'
    ],
    'suffering': [
      'Sitting in a hospital waiting room with a friend.',
      'A long season where nothing seems to change.',
      'Grief that comes back on ordinary days.'
    ],
    'hope': [
      'A winter garden — nothing green, everything waiting.',
      'Checking each morning for news that has not come yet.',
      'Holding on through a long night shift until sunrise.'
    ],
    'peace': [
      'An argument at home that needs a referee, not a winner.',
      'A mind that will not stop racing at bedtime.',
      'Traffic, noise, and a phone that never stops.'
    ],
    'wisdom': [
      'A decision everyone else is rushing into.',
      'Asking a mentor before signing anything.',
      'Searching for the truth like it costs something.'
    ]
  };
  TOPICS.forEach(function (t) { t.today = TODAY[t.id] || []; });

  /* Verses-first door (Donnie, 2026-10-29): he puts in HIS OWN passages
     and the builder structures points around them. parseRefList scans
     free text (one-per-line, ;-separated, or pasted together) for
     reference-shaped candidates and returns them as written, trimmed,
     de-duplicated. Shape only — the builder validates each candidate
     against the app's own reference parser before using it, so a
     non-reference is dropped, never honoured. */
  var REF_SCAN = /\b(?:[1-3]\s+)?[A-Za-z]+(?:\s+[A-Za-z]+){0,2}\s+\d+:\d+(?:\s*[-–]\s*\d+(?::\d+)?)?|\b(?:[1-3]\s+)?[A-Za-z]+(?:\s+[A-Za-z]+){0,2}\s+\d+\b/g;
  function parseRefList(text) {
    var s = String(text == null ? '' : text);
    if (!s.trim()) { return []; }
    var found = s.match(REF_SCAN) || [];
    var out = [], seen = {};
    found.forEach(function (raw) {
      var r = raw.replace(/\s+/g, ' ').trim();
      var key = r.toLowerCase();
      if (r && !seen[key]) { seen[key] = true; out.push(r); }
    });
    return out.slice(0, 10);
  }
  /* A suggested point TITLE for one of his verses, from the app's own
     curated sets only: the title of the point anchored on that exact
     reference, or — when the verse sits in a topic's passage set — the
     topic's own title. No match = null = the box stays blank for his
     own words. Titles only, under the same cap; never prose. */
  function suggestForRef(ref) {
    var target = norm(ref);
    if (!target) { return null; }
    var i, j, t, pt;
    for (i = 0; i < TOPICS.length; i++) {
      t = TOPICS[i];
      for (j = 0; j < t.points.length; j++) {
        pt = t.points[j];
        if (norm(pt.primaryRef) === target) { return { title: pt.title, topicId: t.id, via: 'point' }; }
        var parts = String(pt.supportingRefs || '').split(',');
        for (var k = 0; k < parts.length; k++) {
          if (norm(parts[k]) === target) { return { title: pt.title, topicId: t.id, via: 'point' }; }
        }
      }
    }
    for (i = 0; i < TOPICS.length; i++) {
      t = TOPICS[i];
      for (j = 0; j < t.verses.length; j++) {
        if (norm(t.verses[j]) === target) { return { title: t.title, topicId: t.id, via: 'topic' }; }
      }
    }
    return null;
  }
  function topicForRef(ref) {
    var hit = suggestForRef(ref);
    return hit ? topicById(hit.topicId) : null;
  }

  /* Confident matching ONLY (matcher honesty, 2026-10-29). The old
     matcher used raw substring containment: Donnie typed a long anger
     theme containing the clause "He loved sinners", the substring
     'love' inside 'loved' matched, and the builder served him the
     LOVE set — keyword bleed from a subordinate clause. The rules
     now: evidence is whole words and whole phrases, never substrings
     ('loved' is not 'love'); plurals are tolerated per word
     ('worries' ~ 'worry'); a set fills ONLY when it is the unique
     best score. A tie, or no evidence at all, returns null and the
     builder shows the honest fallback instead of another subject's
     points. Case/punctuation tolerance is unchanged. Returns the
     topic or null. No match = no suggestions are ever invented. */
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z0-9' ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function wordNorm(w) {
    var s = String(w || '');
    if (s.length > 4 && /ies$/.test(s)) { return s.slice(0, -3) + 'y'; }
    if (s.length > 3 && s.charAt(s.length - 1) === 's') { return s.slice(0, -1); }
    return s;
  }
  function tokens(s) {
    var n = norm(s);
    if (!n) { return []; }
    return n.split(' ').map(wordNorm);
  }
  function phraseIn(phrase, words) {
    if (!phrase.length || phrase.length > words.length) { return false; }
    for (var i = 0; i + phrase.length <= words.length; i++) {
      var okAll = true;
      for (var j = 0; j < phrase.length; j++) { if (words[i + j] !== phrase[j]) { okAll = false; break; } }
      if (okAll) { return true; }
    }
    return false;
  }
  function matchTopic(input) {
    var words = tokens(input);
    if (!words.length) { return null; }
    var joined = words.join(' ');
    var scored = [];
    TOPICS.forEach(function (t) {
      var names = [t.title].concat(t.aliases || []);
      var score = 0;
      for (var i = 0; i < names.length; i++) {
        var nt = tokens(names[i]);
        if (!nt.length) { continue; }
        if (nt.join(' ') === joined) { score = 1000; break; }
        if (nt.length > 1) { if (phraseIn(nt, words)) { score += 40; } }
        else if (words.indexOf(nt[0]) !== -1) { score += 10; }
      }
      if (score > 0) { scored.push({ t: t, score: score }); }
    });
    if (!scored.length) { return null; }
    scored.sort(function (a, b) { return b.score - a.score; });
    if (scored.length > 1 && scored[1].score === scored[0].score) { return null; }
    return scored[0].t;
  }
  function topicById(id) {
    for (var i = 0; i < TOPICS.length; i++) { if (TOPICS[i].id === id) { return TOPICS[i]; } }
    return null;
  }

  return {
    BANNER: BANNER,
    IDEAS_LABEL: IDEAS_LABEL,
    IDEAS_HELP: IDEAS_HELP,
    TODAY_LABEL: TODAY_LABEL,
    TODAY_HELP: TODAY_HELP,
    TOPIC_TITLES: TOPIC_TITLES,
    FALLBACK_NOTE: FALLBACK_NOTE,
    TOPICS: TOPICS,
    matchTopic: matchTopic,
    topicById: topicById,
    normTopic: norm,
    parseRefList: parseRefList,
    suggestForRef: suggestForRef,
    topicForRef: topicForRef
  };
}));
