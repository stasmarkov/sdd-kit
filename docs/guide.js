// Page shell for the guide: header, theme cycle, table of contents with scroll-spy, mobile menu.
// All strings from the data files are set with textContent.
(function () {
  'use strict';

  var G = window.GUIDE || {};
  var STORE_KEY = 'sdd-guide-theme';
  var NEXT = { system: 'light', light: 'dark', dark: 'system' };
  var root = document.documentElement;
  var osQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function readStoredChoice() {
    try {
      var v = localStorage.getItem(STORE_KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch (e) {
      return 'system';
    }
  }

  function storeChoice(choice) {
    try {
      if (choice === 'system') localStorage.removeItem(STORE_KEY);
      else localStorage.setItem(STORE_KEY, choice);
    } catch (e) {
      // Storage is unavailable or full: the choice lasts for this page view only.
    }
  }

  // The current choice lives in memory, so the toggle keeps cycling even when storage writes fail.
  var choice = readStoredChoice();

  var themeButton = document.getElementById('theme-toggle');

  /** Applies a theme choice ('system', 'light' or 'dark') to the page and the toggle's label. */
  function applyTheme() {
    var theme = choice === 'system' ? (osQuery.matches ? 'dark' : 'light') : choice;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    var label = themeButton.querySelector('.btn-label');
    label.textContent = 'Theme: ' + choice;
    themeButton.setAttribute('aria-label', 'Theme: ' + choice + '. Switch to ' + NEXT[choice] + '.');
  }

  themeButton.addEventListener('click', function () {
    choice = NEXT[choice];
    storeChoice(choice);
    applyTheme();
  });
  var onOsChange = function () { if (choice === 'system') applyTheme(); };
  if (osQuery.addEventListener) osQuery.addEventListener('change', onOsChange);
  else if (osQuery.addListener) osQuery.addListener(onOsChange);
  applyTheme();

  // Header
  if (G.product) document.getElementById('product').textContent = G.product;
  if (G.version) document.getElementById('version').textContent = 'v' + G.version;
  else document.getElementById('version').hidden = true;
  if (G.repo) document.getElementById('repo-link').href = G.repo;
  if (G.tagline) document.getElementById('tagline').textContent = G.promise || G.tagline;
  var searchHint = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘K' : 'Ctrl K';
  document.getElementById('search-hint').textContent = searchHint;
  document.getElementById('search-button').setAttribute('aria-label', 'Search ' + searchHint);

  // Table of contents, built from main section[id]
  var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
  var tocList = document.getElementById('toc-list');
  var linkFor = {};
  sections.forEach(function (section) {
    var heading = section.querySelector('h1, h2, h3');
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = '#' + section.id;
    a.textContent = section.id === 'start' ? 'Start' : heading.textContent;
    li.appendChild(a);
    tocList.appendChild(li);
    linkFor[section.id] = a;
  });

  var currentId = null;
  function setCurrent(id) {
    if (id === currentId || !linkFor[id]) return;
    if (currentId) linkFor[currentId].removeAttribute('aria-current');
    linkFor[id].setAttribute('aria-current', 'location');
    currentId = id;
  }

  if ('IntersectionObserver' in window) {
    // A section is current while it crosses the band just below the sticky header.
    var visible = {};
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      for (var i = 0; i < sections.length; i++) {
        if (visible[sections[i].id]) { setCurrent(sections[i].id); return; }
      }
    }, { rootMargin: '-72px 0px -65% 0px' });
    sections.forEach(function (s) { spy.observe(s); });
  }
  if (sections.length) setCurrent(sections[0].id);

  // The header sizes to its content and wraps onto extra rows on narrow screens. --header-h
  // offsets the TOC sheet, scrim and anchor targets below it; the header itself never reads it.
  var siteHeader = document.querySelector('.site-header');
  function syncHeaderOffset() {
    var h = siteHeader ? Math.ceil(siteHeader.getBoundingClientRect().height) : 0;
    if (h) document.documentElement.style.setProperty('--header-h', h + 'px');
  }
  if (siteHeader && typeof ResizeObserver === 'function') new ResizeObserver(syncHeaderOffset).observe(siteHeader);
  else window.addEventListener('resize', syncHeaderOffset);
  syncHeaderOffset();

  // Mobile menu: the TOC opens as a sheet below 1024 px
  var menuButton = document.getElementById('menu-button');
  var toc = document.getElementById('toc');
  var scrim = null;

  function setMenu(open) {
    toc.classList.toggle('open', open);
    menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && !scrim) {
      scrim = document.createElement('div');
      scrim.className = 'scrim';
      scrim.addEventListener('click', function () { setMenu(false); });
      document.body.appendChild(scrim);
    } else if (!open && scrim) {
      scrim.remove();
      scrim = null;
    }
  }

  menuButton.addEventListener('click', function () {
    setMenu(menuButton.getAttribute('aria-expanded') !== 'true');
  });
  toc.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      menuButton.focus();
    }
  });
  var wideQuery = window.matchMedia('(min-width: 1024px)');
  var onWide = function (e) { if (e.matches) setMenu(false); };
  if (wideQuery.addEventListener) wideQuery.addEventListener('change', onWide);
  else if (wideQuery.addListener) wideQuery.addListener(onWide);
})();

// Sections: the guide's content, rendered from guide-data.js, catalog.js and example-data.js.
// Every string from those files reaches the page through textContent; there are no HTML strings here.
(function () {
  'use strict';

  var G = window.GUIDE;
  var C = window.CATALOG;
  var E = window.EXAMPLE || null;
  var $ = function (id) { return document.getElementById(id); };
  if (!G || !C) {
    var notice = document.createElement('p');
    notice.className = 'note data-missing';
    notice.setAttribute('role', 'alert');
    notice.textContent = 'The guide data did not load. Keep index.html next to guide-data.js, catalog.js and example-data.js in docs/guide/ and reopen it.';
    var main = document.getElementById('content');
    if (main) main.insertBefore(notice, main.firstChild);
    return;
  }
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var QS_KEY = 'sdd-kit-flowmap-quickstart';
  var rendered = [];

  /**
   * Builds an element. The second argument may be a props object: `class`, `text`, `onclick`-style
   * handlers, or any attribute (values are stringified; null, undefined and false are skipped).
   * Remaining arguments are children: strings, nodes, or arrays of either.
   */
  function h(tag, props) {
    var el = document.createElement(tag);
    var kids = Array.prototype.slice.call(arguments, 1);
    if (props && typeof props === 'object' && !props.nodeType && !Array.isArray(props)) {
      kids.shift();
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    (Array.isArray(kids) ? kids : [kids]).forEach(function (k) {
      if (k === null || k === undefined || k === false) return;
      if (Array.isArray(k)) append(el, k);
      else if (typeof k === 'string' || typeof k === 'number') el.appendChild(document.createTextNode(String(k)));
      else el.appendChild(k);
    });
  }
  function fill(el, kids) {
    el.textContent = '';
    append(el, Array.isArray(kids) ? kids : [kids]);
  }
  function body(id) { return $(id).querySelector(':scope > .section-body'); }
  function done(id) { rendered.push(id); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 1600);
  }
  function copyText(text) {
    function ok() { toast('Copied'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.className = 'copy-buffer';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { toast('Select the text and copy it manually'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
  }
  function codeBlock(code, label) {
    return h('div', { class: 'code' },
      h('code', code),
      h('button', { type: 'button', class: 'copy', 'aria-label': 'Copy ' + (label || code), onclick: function () { copyText(code); } }, 'Copy'));
  }
  function labeled(label, code) {
    return h('div', { class: 'labeled' }, h('span', { class: 'code-label' }, label), codeBlock(code, label));
  }
  function chip(text, cls) { return h('span', { class: 'chip' + (cls ? ' ' + cls : '') }, text); }
  function para(text, cls) { return h('p', { class: cls || null }, text); }
  function list(items, cls) { return h('ul', { class: cls || 'outs' }, items.map(function (t) { return h('li', t); })); }
  function plain(href, label, cls) { return h('a', { class: cls || 'linkbtn', href: href }, label); }

  /** Delays fn until calls stop for `ms`; search boxes use it so typing does not rewrite history on every key. */
  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  var setHashSoon = debounce(function (hash) { setHash(hash); }, 300);
  function setHash(hash) {
    var wanted = hash ? '#' + hash : '';
    if (location.hash !== wanted) history.replaceState(null, '', hash ? wanted : location.pathname + location.search);
  }
  function scrollToId(id) {
    var el = $(id);
    if (el) el.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------- Data lookups ---------- */
  function routeById(id) { return G.routes.filter(function (r) { return r.id === id; })[0]; }
  function workflowByName(n) { return C.workflows.filter(function (w) { return w.name === n; })[0]; }
  function itemByName(list, n) { return list.filter(function (x) { return x.name === n; })[0]; }
  function addonBlurb(name) {
    var a = (C.addons || []).filter(function (x) { return x.name === name; })[0];
    return a ? a.description : '';
  }
  function addonShips(name) { return name.replace(/^sdd-kit-/, '') + ' plugin'; }
  function catLabel(c) { return c && c !== 'skills' ? c : 'uncategorized'; }
  function routeKind(r) { return /workflow/.test(r.launches) ? 'workflow' : 'skill'; }
  function routeLinks(r) {
    return {
      workflows: C.workflows.filter(function (w) { return r.launches.indexOf(w.name) !== -1; }),
      skills: C.skills.filter(function (s) { return new RegExp('(^|[\\s→])' + escapeRe(s.name) + '(\\s|$)').test(r.launches); })
    };
  }
  function spaced(t) { return String(t).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'); }
  function whoKind(who) { return /\byou\b/.test(who) ? 'you' : /tools/.test(who) ? 'tools' : 'agent'; }

  var A = G.afterSdd;
  function cmdName(cmd) { return String(cmd).split(' ')[0].replace(/^\//, ''); }
  function cmdArgs(cmd) { return String(cmd).split(' ').slice(1).join(' '); }
  function afterFlat() {
    var out = [];
    if (A) A.groups.forEach(function (g) { g.items.forEach(function (it) { out.push({ group: g, cmd: it.cmd, when: it.when }); }); });
    return out;
  }

  var STATUS_LABEL = { draft: 'Draft', approved: 'Approved', 'in-progress': 'In progress', done: 'Done', unknown: 'Unknown' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function shortDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
    return m ? MONTHS[+m[2] - 1] + ' ' + (+m[3]) : '';
  }
  function guideRouteId(id) { return id === 'feature-task-by-task' ? 'feature' : id; }
  function exRoute(id) { return E ? E.routes.filter(function (r) { return r.id === id; })[0] : null; }
  function chaptersForEx(id) { var r = exRoute(id); return r ? r.chapters.slice() : []; }
  function chaptersForGuide(id) {
    if (!E || !id) return [];
    var out = [];
    E.routes.forEach(function (r) {
      if (guideRouteId(r.id) === id) r.chapters.forEach(function (n) { if (out.indexOf(n) === -1) out.push(n); });
    });
    return out.sort();
  }
  function chapterByN(n) {
    if (!E) return null;
    n = String(n || '');
    if (/^\d$/.test(n)) n = '0' + n;
    return E.chapters.filter(function (c) { return c.n === n; })[0] || null;
  }
  function specByKey(k) {
    if (!E || !k) return null;
    return E.specs.filter(function (s) { return s.key === k; })[0] || E.specs.filter(function (s) { return s.shortId === k; })[0] || null;
  }
  function rtClass(id) { return 'rt-' + (id || 'none'); }
  function routeLabel(id) { var r = exRoute(id); return r ? r.label : 'no route'; }
  function routeChip(id) { return chip(routeLabel(id), 'rt ' + rtClass(id)); }

  /* ---------- Which route? (decision tree over GUIDE.routes) ---------- */
  var PICK_START = 'broken';
  var PICK = {
    broken: { q: 'Is something broken?', hint: function () { return routeById('bug').when; }, yes: 'route:bug', no: 'audit' },
    audit: { q: 'Do you need a deep security audit of existing code, with coverage tracking and verified leads?', hint: function () { return routeById('audit').when; }, yes: 'route:audit', no: 'shipped' },
    shipped: { q: 'Is the code already shipped, and you only need a QA plan or docs?', hint: function () { return routeById('shipped').when; }, yes: 'route:shipped', no: 'decision' },
    decision: { q: 'Do you need to choose a technology or approach first?', hint: function () { return routeById('decision').when; }, yes: 'route:decision', no: 'exists' },
    exists: { q: 'Does code exist yet for the target?', hint: function () { var w = routeById('newapp').when; return 'If not: ' + w.charAt(0).toLowerCase() + w.slice(1); }, yes: 'tiny', no: 'route:newapp' },
    tiny: { q: 'Is it a tiny change?', hint: function () { return routeById('trivial').when; }, yes: 'route:trivial', no: 'route:feature' }
  };
  /**
   * One step of the picker. A question key gives { question, hint, yes, no }, where yes and no are the next keys;
   * a 'route:<id>' key gives { route } for the final answer.
   */
  function pickerStep(key) {
    if (key.indexOf('route:') === 0) return { route: routeById(key.slice(6)) };
    var n = PICK[key];
    return { question: n.q, hint: n.hint(), yes: n.yes, no: n.no };
  }
  function pickerResult(id) {
    var r = routeById(id);
    return r ? { id: r.id, label: r.label, reason: r.when, run: r.example, details: '#route/' + r.id } : null;
  }

  /* ---------- Drawer ---------- */
  var drawer = $('drawer');
  var drawerScrim = $('drawer-scrim');
  var lastFocus = null;
  var drawerSection = 'map';

  function openDrawer(kicker, title, nodes, section) {
    if (!drawer.classList.contains('open')) lastFocus = document.activeElement;
    drawerSection = section || 'map';
    $('drawer-kicker').textContent = kicker;
    $('drawer-title').textContent = title;
    fill($('drawer-body'), nodes);
    $('drawer-body').scrollTop = 0;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    drawerScrim.classList.add('open');
    setTimeout(function () { $('drawer-title').focus(); }, 30);
  }
  function hideDrawer() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    drawerScrim.classList.remove('open');
    restoreRoute();
    markAfter(null);
  }
  function closeDrawer() {
    if (!drawer.classList.contains('open')) return;
    hideDrawer();
    setHash(drawerSection);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  function closeDrawerQuiet() {
    if (drawer.classList.contains('open')) hideDrawer();
  }
  $('drawer-close').addEventListener('click', closeDrawer);
  drawerScrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.classList.contains('open')) { e.preventDefault(); closeDrawer(); }
  });

  /** A button that opens a drawer item or jumps to a section: 'route/bug', 'chapter/04', 'after/learn'. */
  function openLink(label, target, cls) {
    return h('button', { type: 'button', class: cls || 'linkbtn', onclick: function () { openTarget(target); } }, label);
  }
  function openTarget(target) {
    var i = target.indexOf('/');
    var kind = target.slice(0, i), rest = target.slice(i + 1);
    if (kind === 'workflow') showWorkflow(rest);
    else if (kind === 'skill' || kind === 'agent') showItem(kind, rest);
    else if (kind === 'route') showRoute(rest);
    else if (kind === 'chapter') showChapter(rest);
    else if (kind === 'spec') showSpec(rest);
    else if (kind === 'after') showAfter(rest);
  }

  function phaseTrack(wf) {
    var detail = h('div', { class: 'phase-detail', 'aria-live': 'polite' });
    var btns = wf.phases.map(function (p, i) {
      return h('button', {
        type: 'button', class: 'phase', 'aria-pressed': 'false', 'aria-label': 'Phase ' + (i + 1) + ': ' + p.title,
        onclick: function () { pick(i); },
        onkeydown: function (e) {
          var n = null;
          if (e.key === 'ArrowRight') n = Math.min(i + 1, btns.length - 1);
          if (e.key === 'ArrowLeft') n = Math.max(i - 1, 0);
          if (n !== null) { e.preventDefault(); btns[n].focus(); pick(n); }
        }
      }, h('span', { class: 'n' }, pad2(i + 1)), h('span', { class: 'label' }, spaced(p.title)));
    });
    function pick(i) {
      btns.forEach(function (b, j) { b.setAttribute('aria-pressed', String(i === j)); });
      fill(detail, [h('b', wf.phases[i].title), para(wf.phases[i].detail)]);
    }
    pick(0);
    return h('div', { class: 'phases' },
      h('ol', { class: 'track', 'aria-label': wf.name + ' phases' }, btns.map(function (b) { return h('li', b); })),
      detail,
      h('details', { class: 'all' }, h('summary', 'All ' + wf.phases.length + ' phases as a list'),
        h('ol', wf.phases.map(function (p) { return h('li', h('b', p.title), ' — ' + p.detail); }))));
  }
  function routeButtons(routes) {
    return h('div', { class: 'linkrow' }, routes.map(function (r) { return openLink('route · ' + r.label, 'route/' + r.id); }));
  }

  function showRoute(id, fromRouter) {
    var r = routeById(id);
    if (!r) return false;
    var links = routeLinks(r);
    var out = [
      h('h3', 'When'), para(r.when),
      h('h3', 'Example'), codeBlock(r.example, 'example command'),
      h('h3', 'Launches'), para(r.launches, 'mono')
    ];
    if (links.workflows.length || links.skills.length) {
      out.push(h('div', { class: 'linkrow' },
        links.skills.map(function (s) { return openLink('skill · ' + s.name, 'skill/' + s.name); }),
        links.workflows.map(function (w) { return openLink('workflow · ' + w.name, 'workflow/' + w.name); })));
    }
    out.push(h('h3', 'Spec'), para(r.spec), h('h3', 'Outputs'), list(r.outputs), h('h3', 'Done when'), h('div', { class: 'done-box' }, r.done));
    if (r.gate) out.push(h('h3', 'Approval gate'), h('div', { class: 'callout' }, h('b', 'You approve'), ' ' + r.gate));
    var chapters = chaptersForGuide(r.id).map(chapterByN).filter(Boolean);
    if (chapters.length) {
      out.push(h('h3', 'In the ' + E.product + ' example'), h('div', { class: 'linkrow' }, chapters.map(function (c) {
        return openLink('ch. ' + c.n + (c.tickets.length ? ' · ' + c.tickets.join(', ') : ''), 'chapter/' + c.n);
      })));
    }
    links.workflows.forEach(function (w) { out.push(h('h3', w.name + ' · ' + w.phases.length + ' phases'), phaseTrack(w)); });
    openDrawer('Route · ' + routeKind(r), r.label, out, 'map');
    markSelectedRoute(id);
    if (!fromRouter) setHash('route/' + id);
    return true;
  }
  function showWorkflow(name, fromRouter) {
    var w = workflowByName(name);
    if (!w) return false;
    var routes = G.routes.filter(function (r) { return r.launches.indexOf(w.name) !== -1; });
    var out = [para(w.description), h('h3', 'Phases'), phaseTrack(w), h('h3', 'When to use'), para(w.whenToUse, 'muted')];
    if (routes.length) out.push(h('h3', 'Reached from /sdd'), routeButtons(routes));
    openDrawer('Workflow', w.name, out, 'workflows');
    if (!fromRouter) setHash('workflow/' + w.name);
    return true;
  }
  function showItem(type, name, fromRouter) {
    var it = itemByName(type === 'skill' ? C.skills : C.agents, name);
    if (!it) return false;
    var addon = G.addons.filter(function (a) { return addonShips(a.name) === it.ships; })[0];
    var meta = [
      h('dt', 'Category'), h('dd', catLabel(it.category)),
      h('dt', 'Ships'), h('dd', it.ships === 'core' ? chip('core', 'tools') : chip(addon ? addon.name : it.ships, 'addon'))
    ];
    var onHost = catalogHost(it);
    if (type === 'skill' && onHost) meta.push(h('dt', 'Invoke'), h('dd', chip(onHost.invoke), chip(onHost.availability)));
    else if (type === 'skill') meta.push(h('dt', 'Invoke'), h('dd', chip(it.invoke)));
    else {
      if (onHost) meta.push(h('dt', 'Invoke'), h('dd', chip(onHost.invoke), chip(onHost.availability)));
      meta.push(h('dt', 'Model'), h('dd', chip(it.model || '—', 'agent')), h('dt', 'Effort'), h('dd', it.effort || 'not set'));
    }
    var out = [para(it.description), h('h3', 'Details'), h('dl', { class: 'meta-grid' }, meta)];
    if (addon && host === HOSTS.default) out.push(h('h3', 'Add-on'), para(addonBlurb(addon.name), 'muted'), codeBlock('/plugin install ' + addon.name + '@sdd-kit', 'install command for ' + addon.name));
    if (type === 'skill') {
      var routes = G.routes.filter(function (r) { return routeLinks(r).skills.indexOf(it) !== -1; });
      if (routes.length) out.push(h('h3', 'Reached from /sdd'), routeButtons(routes));
    }
    openDrawer(type === 'skill' ? 'Skill' : 'Agent', it.name, out, type === 'skill' ? 'skills' : 'agents');
    if (!fromRouter) setHash(type + '/' + it.name);
    return true;
  }

  /* ---------- Hero ---------- */
  function renderHero() {
    var stats = [['routes', G.routes.length, '#map'], ['skills', C.skills.length, '#skills'], ['agents', C.agents.length, '#agents'], ['workflows', C.workflows.length, '#workflows']];
    if (E) stats.push(['chapters', E.chapters.length, '#example'], ['example specs', E.specs.length, '#board']);
    fill($('stats'), stats.map(function (s) { return h('li', plain(s[2], [h('b', s[1]), h('span', s[0])], 'stat')); }));
    if (G.stacks) {
      fill($('stack-note'), ['Supported stacks: ' + G.stacks.now + '. ', 'Next on the ', plain(G.stacks.href, 'roadmap', 'inline'), ': ' + G.stacks.roadmap + '.']);
    }
    fill($('signposts'), G.signposts.map(function (x) { return h('li', plain(x.href, x.label, 'linkbtn')); }));
    done('start');
  }

  /* ---------- Host selector ---------- */
  var HOSTS = window.GUIDE_HOSTS || { default: 'claude', order: ['claude'], hosts: { claude: { label: 'Claude Code', prefix: '/' } } };
  var HOST_KEY = 'sdd-guide-host';
  var hostListeners = [];

  /**
   * Picks the active host. A valid `?host=` in the query wins over the stored choice; an unknown query
   * or stored value falls back to the default host.
   */
  function resolveHost(search, stored) {
    var m = /[?&]host=([^&#]*)/.exec(search || '');
    var fromQuery = null;
    if (m) {
      try { fromQuery = decodeURIComponent(m[1]); } catch (e) { fromQuery = ''; }
    }
    if (fromQuery !== null) return knownHost(fromQuery) ? fromQuery : HOSTS.default;
    return knownHost(stored) ? stored : HOSTS.default;
  }
  /** True only for a host the data defines; inherited keys such as `constructor` are not hosts. */
  function knownHost(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(HOSTS.hosts, id);
  }
  function readStoredHost() {
    try { return localStorage.getItem(HOST_KEY); } catch (e) { return null; }
  }
  var host = resolveHost(location.search, readStoredHost());
  function hostInfo() { return HOSTS.hosts[host]; }

  /** Swaps the leading slash of a command for the host's invocation prefix. */
  function hostCommand(code) {
    var prefix = hostInfo().prefix;
    return prefix !== '/' && code.charAt(0) === '/' ? prefix + code.slice(1) : code;
  }
  /** Install modes for the active host as [id, {label, steps, note}] pairs. */
  function installModesFor() {
    var src = host === HOSTS.default ? G.install : (hostInfo().install || {});
    var modes = [];
    if (src.plugin) modes.push(['plugin', src.plugin]);
    if (src.fileCopy) modes.push(['file-copy', src.fileCopy]);
    if (src.npx) modes.push(['npx', src.npx]);
    return modes;
  }
  function installFlags() { return host === HOSTS.default ? G.install.flags : (hostInfo().flags || []); }
  /**
   * Quickstart steps for the active host, with each step's original index kept for progress. Another host
   * replaces the Claude-only steps with the steps of its first install mode (indexes after the shared steps)
   * and uses a step's hostTitle and hostText where the Claude wording does not apply.
   */
  function quickstartFor() {
    var out = [];
    var other = host !== HOSTS.default;
    if (other) {
      var first = installModesFor()[0];
      if (first) first[1].steps.forEach(function (s, n, all) {
        out.push({ index: G.quickstart.length + n, title: s.text, text: n === all.length - 1 ? first[1].note : first[1].label, code: s.code });
      });
    }
    G.quickstart.forEach(function (q, i) {
      if (other && q.claudeOnly) return;
      var code = other && q.hostAware ? hostCommand(q.code) : q.code;
      out.push({ index: i, title: other && q.hostTitle ? q.hostTitle : q.title, text: other && q.hostText ? q.hostText : q.text, code: code });
    });
    return out;
  }
  /** Invocation and availability of a catalog entry on the active host (null for Claude Code). */
  function catalogHost(it) { return host === HOSTS.default ? null : (it.hosts && it.hosts[host]) || null; }

  function setHost(next, store) {
    host = knownHost(next) ? next : HOSTS.default;
    if (store) { try { localStorage.setItem(HOST_KEY, host); } catch (e) { /* storage unavailable: the choice lasts for this page view */ } }
    hostListeners.forEach(function (fn) { fn(); });
  }
  (function renderHostSelect() {
    var sel = $('host-select');
    if (!sel) return;
    HOSTS.order.forEach(function (id) { sel.appendChild(h('option', { value: id }, HOSTS.hosts[id].label)); });
    sel.value = host;
    sel.addEventListener('change', function () { setHost(sel.value, true); });
    hostListeners.push(function () { sel.value = host; });
  })();

  /* ---------- Install ---------- */
  var instModes = installModesFor();
  var instMode = instModes[0][0];
  function hasInstMode(m) { return instModes.some(function (x) { return x[0] === m; }); }
  function renderInstall() {
    var root = body('install');
    instModes = installModesFor();
    if (!hasInstMode(instMode)) instMode = instModes[0][0];
    fill(root, []);
    var tabs = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Install mode' });
    var panel = h('div', { role: 'tabpanel', tabindex: '0' });
    var btns = instModes.map(function (m, i) {
      return h('button', {
        type: 'button', role: 'tab', id: 'itab-' + m[0], 'aria-controls': 'install-panel',
        onclick: function () { selectMode(m[0], true); },
        onkeydown: function (e) {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          var next = instModes[(i + (e.key === 'ArrowRight' ? 1 : instModes.length - 1)) % instModes.length][0];
          selectMode(next, true);
          $('itab-' + next).focus();
        }
      }, m[1].label);
    });
    append(tabs, btns);
    panel.id = 'install-panel';
    append(root, [tabs, panel]);
    function selectMode(mode, updateHash) {
      instMode = mode;
      btns.forEach(function (b, i) {
        var on = instModes[i][0] === mode;
        b.setAttribute('aria-selected', String(on));
        b.setAttribute('tabindex', on ? '0' : '-1');
      });
      var m = instModes.filter(function (x) { return x[0] === mode; })[0][1];
      panel.setAttribute('aria-labelledby', 'itab-' + mode);
      var out = m.steps.map(function (s, i) {
        return h('div', { class: 'istep' }, h('span', h('b', pad2(i + 1)), s.text), codeBlock(s.code, s.text));
      });
      out.push(para(m.note, 'note'));
      if (m.href) out.push(h('p', { class: 'note' }, plain(m.href, m.hrefLabel, 'inline'), '.'));
      if (mode === 'file-copy' && installFlags().length) {
        out.push(h('table', { class: 'flags' }, h('caption', { class: 'sr-only' }, 'Installer flags'),
          h('thead', h('tr', h('th', { scope: 'col' }, 'Flag'), h('th', { scope: 'col' }, 'Meaning'))),
          h('tbody', installFlags().map(function (f) { return h('tr', h('td', f.flag), h('td', f.meaning)); }))));
      }
      fill(panel, out);
      if (updateHash) setHash('install/' + mode);
    }
    renderInstall.select = selectMode;
    selectMode(instMode, false);
    if (rendered.indexOf('install') === -1) done('install');
  }
  hostListeners.push(function () { renderInstall(); });

  /* ---------- Add tools ---------- */
  var T = window.GUIDE_THIRD_PARTY;
  function fillTemplate(text, vars) {
    return text.replace(/\{(\w+)\}/g, function (m, k) { return vars[k]; });
  }
  /**
   * What the "Add tools" section shows for the active host, as plain data. Claude Code gets the plugin
   * entries, the MCP list and the claude commands; other hosts get the script lines with their own skills
   * folder, the skill how-to and a pointer to the hosts page for MCP servers.
   */
  function addToolsView() {
    var A = G.addTools;
    var claude = host === HOSTS.default;
    var t = T.hosts[host] || T.hosts[HOSTS.default];
    var label = hostInfo().label || t.label;
    var picks = {
      heading: A.picks.heading,
      fileCopy: claude ? A.picks.fileCopy : null,
      script: t.script,
      userNote: claude ? fillTemplate(A.picks.userNote, { userDir: t.userSkillsDir, dir: t.skillsDir }) : null,
      skills: T.skills,
      plugins: claude ? T.plugins : [],
      pluginFallback: claude ? T.pluginFallback : null,
      manual: T.manual
    };
    var mcp = claude
      ? { heading: A.mcp.heading, servers: T.servers, hostLine: null }
      : { heading: A.mcp.heading, servers: [], hostLine: fillTemplate(A.mcp.hostLine, { host: label }), href: A.mcp.host.href, hrefLabel: A.mcp.host.label };
    var howTos = [];
    if (claude) howTos.push({ title: A.other.plugin, commands: t.pluginHowTo });
    howTos.push({ title: A.other.skill, commands: [t.skillHowTo] });
    if (claude) howTos.push({ title: A.other.server, commands: [t.mcpHowTo] });
    return { picks: picks, mcp: mcp, other: { heading: A.other.heading, howTos: howTos, privileges: A.other.privileges, links: A.other.links } };
  }
  function toolMeta(parts) {
    return h('p', { class: 'note' }, parts.filter(Boolean).map(function (p, i) { return [i ? ' · ' : '', p]; }));
  }
  /** High risk gets a marked label with a warning sign and text, so it does not rely on colour alone. */
  function riskLabel(risk) {
    if (risk !== 'high') return risk + ' risk';
    return h('span', { class: 'risk-high' }, h('span', { 'aria-hidden': 'true' }, '\u26a0 '), risk + ' risk');
  }
  function renderAddTools() {
    if (!T) { dropSection('add-tools'); return; }
    var A = G.addTools;
    var v = addToolsView();
    var root = body('add-tools');
    var pk = v.picks;
    var skills = h('ul', { class: 'tools' }, pk.skills.map(function (s) {
      return h('li', h('b', s.name), ' ', s.purpose,
        toolMeta([s.license, riskLabel(s.risk), s.ref + (s.tag ? ' (' + s.tag + ')' : '')]),
        plain(s.href, 'Source', 'inline'));
    }));
    var picks = [h('h3', pk.heading), para(A.picks.intro, 'note')];
    if (pk.fileCopy) picks.push(labeled(A.picks.fileCopyLabel, pk.fileCopy));
    picks.push(labeled(A.picks.scriptLabel, pk.script));
    if (pk.userNote) picks.push(para(pk.userNote, 'note'));
    picks.push(h('h4', A.picks.skillsHeading), skills);
    if (pk.plugins.length) {
      picks.push(h('h4', A.picks.pluginsHeading), h('ul', { class: 'tools' }, pk.plugins.map(function (p) {
        return h('li', h('b', p.name), ' ', p.purpose,
          toolMeta([p.marketplace, p.version && fillTemplate(A.versionLabel, { version: p.version }), p.addon && fillTemplate(A.addonLabel, { addon: p.addon })]),
          p.commands.map(function (c) { return codeBlock(c); }));
      })), h('p', { class: 'note' }, pk.pluginFallback.text + ' ', h('code', pk.pluginFallback.command)));
    }
    if (pk.manual.length) {
      picks.push(h('h4', A.picks.manualHeading), para(A.picks.manualNote, 'note'), h('ul', { class: 'tools' }, pk.manual.map(function (m) {
        return h('li', h('b', m.name), ' ', m.purpose,
          toolMeta([plain(m.href, 'Source', 'inline'), plain(m.review.href, A.picks.reviewLabel, 'inline')]));
      })));
    }
    var mcp = [h('h3', v.mcp.heading)];
    if (v.mcp.hostLine) mcp.push(h('p', v.mcp.hostLine + ' ', plain(v.mcp.href, v.mcp.hrefLabel, 'inline')));
    else {
      mcp.push(para(A.mcp.intro, 'note'), h('ul', { class: 'tools' }, v.mcp.servers.map(function (s) {
        return h('li', h('b', s.name), ' ', s.addon && fillTemplate(A.addonLabel, { addon: s.addon }),
          toolMeta([A.mcp.whenLabel + ': ' + s.when, A.mcp.requiresLabel + ': ' + s.requires, s.needs && A.mcp.needsLabel + ': ' + s.needs.join(', ')]),
          codeBlock(s.command, 'install command for ' + s.name));
      })));
    }
    var other = [h('h3', v.other.heading), para(A.other.intro, 'note')];
    v.other.howTos.forEach(function (x) {
      other.push(h('div', { class: 'labeled' }, h('span', { class: 'code-label' }, x.title), x.commands.map(function (c) { return codeBlock(c); })));
    });
    other.push(para(v.other.privileges));
    other.push(h('p', { class: 'note' }, v.other.links.map(function (l, i) { return [i ? ' · ' : '', plain(l.href, l.label, 'inline')]; })));
    fill(root, [picks, mcp, other]);
    if (rendered.indexOf('add-tools') === -1) done('add-tools');
  }
  hostListeners.push(function () { if (T) renderAddTools(); });

  /* ---------- Quickstart ---------- */
  var qsDone = [];
  try { qsDone = JSON.parse(localStorage.getItem(QS_KEY) || '[]') || []; } catch (e) { qsDone = []; }
  function saveQs() {
    try { localStorage.setItem(QS_KEY, JSON.stringify(qsDone)); } catch (e) { /* storage unavailable: progress lasts for this page view */ }
  }
  function renderQuickstart() {
    var steps = quickstartFor();
    var count = h('span', { class: 'qs-count' });
    var meter = h('i');
    var list = h('ol', { class: 'steps' });
    var reset = h('button', { type: 'button', class: 'btn', onclick: function () { qsDone = []; saveQs(); draw(); } }, 'Reset');
    fill(body('quickstart'), [
      para('Tick each step as you finish it. Your progress is remembered in this browser.', 'note'),
      h('div', { class: 'progress' }, count, h('div', { class: 'meter', 'aria-hidden': 'true' }, meter), reset),
      list
    ]);
    function draw(focusIdx) {
      fill(list, steps.map(function (q, pos) {
        var i = q.index;
        var isDone = !!qsDone[i];
        return h('li', { class: isDone ? 'done' : null },
          h('button', {
            type: 'button', class: 'chk', 'data-step': i, role: 'checkbox', 'aria-checked': String(isDone),
            'aria-label': 'Mark step ' + (pos + 1) + ', ' + q.title + ', as done',
            onclick: function () { qsDone[i] = !qsDone[i]; saveQs(); draw(pos); }
          }, isDone ? '✓' : String(pos + 1)),
          h('div', h('h3', q.title), para(q.text), codeBlock(q.code, q.title + ' command')));
      }));
      var n = steps.filter(function (q) { return qsDone[q.index]; }).length;
      count.textContent = n + ' / ' + steps.length + ' done';
      meter.style.width = (n / steps.length * 100) + '%';
      if (focusIdx !== undefined) {
        var btns = list.querySelectorAll('.chk');
        if (btns[focusIdx]) btns[focusIdx].focus();
      }
    }
    draw();
    if (rendered.indexOf('quickstart') === -1) done('quickstart');
  }
  hostListeners.push(function () { renderQuickstart(); });

  /* ---------- Which route? ---------- */
  function renderPicker() {
    var trail = [];
    var question = h('div', { class: 'picker-q' });
    var answer = h('div', { class: 'picker-a', 'aria-live': 'polite' });
    var indexBtns = {};
    var direct = h('ul', { class: 'route-index' }, G.routes.map(function (r) {
      var b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: function () { pickDirectly(r); } },
        h('span', { class: 'ri-glyph', 'aria-hidden': 'true' }, r.icon), h('span', { class: 'ri-label' }, r.label), h('span', { class: 'ri-launch' }, r.launches));
      indexBtns[r.id] = b;
      return h('li', b);
    }));
    append(body('which-route'), [
      h('div', { class: 'picker' }, question, answer),
      h('h3', 'Pick directly'), direct
    ]);

    function mark(id) { Object.keys(indexBtns).forEach(function (k) { indexBtns[k].setAttribute('aria-pressed', String(k === id)); }); }
    function empty() {
      fill(answer, h('div', { class: 'picker-empty' }, 'Your route will appear here. ' + G.routes.length + ' routes, one front door: ', h('code', '/sdd')));
      mark(null);
    }
    function resultCard(res) {
      var details = res.details;
      fill(answer, h('article', { class: 'route-card', 'aria-label': 'Route: ' + res.label },
        h('h3', res.label),
        h('h4', 'Why this route'), para(res.reason),
        h('h4', 'Run'), codeBlock(res.run, 'launch line'),
        plain(details, 'Details')));
      mark(res.id);
    }
    function back() {
      var t = trail.pop();
      draw(t ? t.key : PICK_START, true);
    }
    function reset() { trail = []; draw(PICK_START, true); }
    function actions(list) { return h('div', { class: 'picker-actions' }, list); }
    function draw(key, focus) {
      var step = pickerStep(key);
      var parts = [];
      if (trail.length) {
        parts.push(h('ol', { class: 'trail', 'aria-label': 'Your answers' }, trail.map(function (t) {
          return h('li', h('span', PICK[t.key].q), h('span', t.ans ? 'Yes' : 'No'));
        })));
      }
      var focusEl;
      if (step.route) {
        var res = pickerResult(step.route.id);
        focusEl = h('h3', { class: 'q', tabindex: '-1' }, 'Take the ' + res.label.toLowerCase() + ' route.');
        parts.push(h('p', { class: 'step' }, 'Result'), focusEl,
          actions([h('button', { type: 'button', class: 'btn', onclick: back }, 'Back'), h('button', { type: 'button', class: 'btn', onclick: reset }, 'Start over')]));
        resultCard(res);
      } else {
        var yes = h('button', { type: 'button', class: 'btn primary', onclick: function () { trail.push({ key: key, ans: true }); draw(step.yes, true); } }, 'Yes');
        var no = h('button', { type: 'button', class: 'btn', onclick: function () { trail.push({ key: key, ans: false }); draw(step.no, true); } }, 'No');
        focusEl = yes;
        parts.push(h('p', { class: 'step' }, 'Question ' + (trail.length + 1)), h('h3', { class: 'q' }, step.question), para(step.hint, 'muted'),
          actions([yes, no, trail.length ? h('button', { type: 'button', class: 'btn', onclick: back }, 'Back') : null]));
        empty();
      }
      fill(question, parts);
      if (focus) focusEl.focus();
    }
    function pickDirectly(r) {
      trail = [];
      fill(question, [h('p', { class: 'step' }, 'Picked directly'), h('h3', { class: 'q' }, r.label),
        actions([h('button', { type: 'button', class: 'btn', onclick: reset }, 'Answer the questions instead')])]);
      resultCard(pickerResult(r.id));
    }
    draw(PICK_START, false);
    done('which-route');
  }

  /* ---------- One request, many routes ---------- */
  var routeCards = {};
  function markSelectedRoute(id, exId) {
    Object.keys(routeCards).forEach(function (k) { routeCards[k].classList.toggle('is-selected', k === id); });
    if (E) dimChapters(exId ? chaptersForEx(exId) : id ? chaptersForGuide(id) : null);
  }
  function renderMap() {
    var qs = G.quickstart.filter(function (q) { return /\/sdd/.test(q.code); })[0];
    var m = qs ? /^(.*?)\.\s*\/sdd\s+(.*?);\s*(.*?)\.?$/.exec(qs.text) : null;
    var flow = h('ol', { class: 'flow-head', 'aria-label': 'How a request flows' },
      h('li', h('span', { class: 'kind you' }, 'you'), h('b', 'Your request'), m ? h('span', m[1].charAt(0).toLowerCase() + m[1].slice(1)) : null),
      h('li', h('span', { class: 'kind agent' }, 'agent'), h('b', '/sdd'), m ? h('span', m[2]) : null, m ? chip(m[3], 'you') : null));
    var grid = h('ul', { class: 'route-grid' }, G.routes.map(function (r) {
      var b = h('button', {
        type: 'button', class: 'route-card-btn rt-' + r.id, onclick: function () { showRoute(r.id); }
      },
        h('span', { class: 'rc-top' }, h('span', { class: 'icon-disc', 'aria-hidden': 'true' }, r.icon), h('span', { class: 'rc-label' }, r.label), chip(routeKind(r))),
        h('span', { class: 'rc-launch' }, r.launches),
        h('span', { class: 'rc-when' }, r.when),
        r.gate ? chip('approval gate', 'you') : null);
      routeCards[r.id] = b;
      return h('li', b);
    }));
    append(body('map'), [flow, grid]);
    done('map');
  }

  /* ---------- Pipeline ---------- */
  var P = G.pipeline;
  var pIndex = 0;
  var playing = false;
  var playTimer = null;
  var stageBtns = [];
  var playBtn, prevBtn, nextBtn, pipeDetail;
  function renderPipeline() {
    playBtn = h('button', { type: 'button', class: 'btn primary', 'aria-pressed': 'false', onclick: togglePlay }, 'Play');
    prevBtn = h('button', { type: 'button', class: 'btn', 'aria-label': 'Previous stage', onclick: function () { stopPlay(); if (pIndex > 0) selectStage(pIndex - 1, true); } }, '◀');
    nextBtn = h('button', { type: 'button', class: 'btn', 'aria-label': 'Next stage', onclick: function () { stopPlay(); if (pIndex < P.length - 1) selectStage(pIndex + 1, true); } }, '▶');
    pipeDetail = h('div', { class: 'stage-detail', 'aria-live': 'polite' });
    stageBtns = P.map(function (p, i) {
      return h('button', {
        type: 'button', class: 'stage k-' + (p.accent ? 'you' : whoKind(p.who)) + (p.accent ? ' accent' : ''),
        onclick: function () { stopPlay(); selectStage(i, true); },
        onkeydown: function (e) {
          var n = null;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = Math.min(i + 1, P.length - 1);
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = Math.max(i - 1, 0);
          if (e.key === 'Home') n = 0;
          if (e.key === 'End') n = P.length - 1;
          if (n !== null) { e.preventDefault(); stopPlay(); selectStage(n, true); stageBtns[n].focus(); }
        }
      }, h('span', { class: 'sn' }, pad2(i + 1)), h('span', { class: 'st' }, p.title), h('span', { class: 'sw' }, p.who));
    });
    append(body('pipeline'), [
      h('div', { class: 'ctrl' }, playBtn, prevBtn, nextBtn, h('span', { class: 'hint' }, 'Select a stage, or use the arrow keys')),
      h('ol', { class: 'stages', 'aria-label': 'Feature pipeline, ' + P.length + ' stages' }, stageBtns.map(function (b) { return h('li', b); })),
      pipeDetail
    ]);
    selectStage(0, false);
    done('pipeline');
  }
  function selectStage(i, updateHash) {
    pIndex = i;
    var p = P[i];
    stageBtns.forEach(function (b, j) {
      b.classList.toggle('is-selected', j === i);
      b.classList.toggle('is-done', j < i);
      b.setAttribute('aria-pressed', String(j === i));
      b.setAttribute('tabindex', j === i ? '0' : '-1');
    });
    var out = [h('div', { class: 'num' }, pad2(i + 1)), h('div',
      h('h3', p.title),
      h('div', { class: 'chips' }, chip(p.who, p.accent ? 'you' : whoKind(p.who)), p.accent ? chip('human checkpoint', 'you') : null),
      para(p.text),
      p.href ? h('p', { class: 'note' }, 'How the spec is checked before approval: ', plain(p.href, 'spec lint', 'inline'), '.') : null,
      p.id === 'acceptance' && G.browser ? para(G.browser, 'note') : null,
      p.id === 'docs' && A ? h('p', { class: 'note' }, 'Next: ', plain('#after', 'after /sdd', 'inline'), ', ' + A.intro) : null),
      h('div', { class: 'hint' }, (i + 1) + ' / ' + P.length)];
    fill(pipeDetail, out);
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === P.length - 1;
    if (updateHash) setHash('pipeline/' + p.id);
  }
  function stopPlay() {
    playing = false;
    clearTimeout(playTimer);
    playBtn.setAttribute('aria-pressed', 'false');
    playBtn.textContent = 'Play';
  }
  function tick() {
    if (!playing) return;
    if (pIndex >= P.length - 1) { stopPlay(); return; }
    selectStage(pIndex + 1, false);
    playTimer = setTimeout(tick, P[pIndex].accent ? 3200 : 2200);
  }
  function togglePlay() {
    if (playing) { stopPlay(); return; }
    playing = true;
    playBtn.setAttribute('aria-pressed', 'true');
    playBtn.textContent = 'Pause';
    selectStage(pIndex >= P.length - 1 ? 0 : pIndex, false);
    playTimer = setTimeout(tick, P[pIndex].accent ? 3200 : 2200);
  }

  /* ---------- After /sdd ---------- */
  var afterCards = {};
  var currentAfter = null;
  function markAfter(name) {
    currentAfter = name;
    Object.keys(afterCards).forEach(function (k) { afterCards[k].classList.toggle('is-selected', k === name); });
  }
  function renderAfter() {
    if (!A) { $('after').hidden = true; done('after'); return; }
    append(body('after'), [para(A.intro, 'note')].concat(A.groups.map(function (g) {
      return h('div', { class: 'after-group g-' + g.id, id: 'after-' + g.id },
        h('h3', g.label),
        h('ul', g.items.map(function (it) {
          var name = cmdName(it.cmd), args = cmdArgs(it.cmd);
          var b = h('button', { type: 'button', class: 'after-card', onclick: function () { showAfter(name); } },
            h('span', { class: 'cmd' }, '/' + name), args ? h('span', { class: 'args' }, args) : null, h('span', { class: 'when' }, it.when));
          afterCards[name] = b;
          return h('li', b);
        })));
    })));
    done('after');
  }
  function showAfter(name, fromRouter) {
    var it = afterFlat().filter(function (x) { return cmdName(x.cmd) === name; })[0];
    if (!it) return false;
    var out = [para(it.when), h('h3', 'Command'), codeBlock(it.cmd, it.cmd)];
    var sk = itemByName(C.skills, name);
    if (sk) out.push(h('h3', 'Skill'), para(sk.description, 'muted'), h('div', { class: 'linkrow' }, openLink('skill · ' + sk.name, 'skill/' + sk.name)));
    if (E) {
      var used = [], later = [];
      E.chapters.forEach(function (c) {
        c.afterSdd.forEach(function (a) { if (cmdName(a.cmd) === name) used.push({ c: c, cmd: a.cmd }); });
        c.nowAlso.forEach(function (a) { if (a.kind === 'command' && cmdName(a.cmd) === name) later.push({ c: c, why: a.why }); });
      });
      if (used.length) out.push(h('h3', 'Used in the ' + E.product + ' example'), h('div', { class: 'stack-gap' }, used.map(function (u) { return labeled('chapter ' + u.c.n, u.cmd); })));
      if (later.length) {
        out.push(h('h3', 'Not in the chapter: added to the kit after the example was written'),
          h('ul', { class: 'outs' }, later.map(function (u) { return h('li', openLink('ch. ' + u.c.n, 'chapter/' + u.c.n), ' ' + u.why); })));
      }
    }
    out.push(h('h3', it.group.label), h('div', { class: 'linkrow' }, it.group.items.map(function (x) {
      var nm = cmdName(x.cmd);
      return nm === name ? chip('/' + nm) : openLink('/' + nm, 'after/' + nm);
    })));
    openDrawer('After /sdd · ' + it.group.label, '/' + name, out, 'after');
    markAfter(name);
    if (!fromRouter) setHash('after/' + name);
    return true;
  }

  /* ---------- Spec card ---------- */
  function renderSpec() {
    var S = G.spec;
    var real = E && E.specAnatomy.length ? specByKey(E.specAnatomy[0].from) : null;
    append(body('spec'), [
      h('p', h('code', S.folder)),
      para(S.naming),
      h('dl', { class: 'meta-grid' }, S.sizes.map(function (z) { return [h('dt', z.size), h('dd', { class: 'muted' }, z.artifacts)]; })),
      h('p', { class: 'note' }, plain(S.href, S.label, 'inline'), real ? ' · ' : null,
        real ? openLink('See a real one: ' + real.shortId + ', section by section', 'spec/' + real.key) : null)
    ]);
    done('spec');
  }

  /* ---------- Hooks ---------- */
  function renderHooks() {
    var k = G.hooksSummary;
    append(body('hooks'), [
      para(k.text),
      h('p', { class: 'note' }, 'Verify they fire with /framework-doctor. ', plain(k.href, 'Hooks reference', 'inline'), '.')
    ]);
    done('hooks');
  }

  /* ---------- Workflows (direct), more commands, add-ons ---------- */
  function renderWorkflowsDirect() {
    var w = G.workflowsDirect;
    append(body('workflows-direct'), [h('p', w.text + ' ', plain(w.href, w.label, 'inline'), '.')]);
    done('workflows-direct');
  }
  var catState = { tab: 'skills', q: '', ships: '', invoke: '', model: '' };
  function renderEveryday() {
    append(body('everyday'), [
      G.everydayIntro ? para(G.everydayIntro, 'note') : null,
      h('div', { class: 'list-cmd' }, G.everyday.map(function (e) { return h('div', { class: 'row' }, h('span', e.task), codeBlock(e.code, e.task)); }))
    ]);
    var trust = G.stackTrust;
    var notes = [
      G.addonsNote ? para(G.addonsNote, 'note') : null,
      trust ? h('p', { class: 'note' }, trust.text + ' ', plain(trust.href, trust.label, 'inline')) : null
    ];
    // Cards follow the marketplace order (CATALOG.addons, D-24); guide-data adds install commands and skills
    var byName = {};
    G.addons.forEach(function (a) { byName[a.name] = a; });
    var ordered = (C.addons || []).map(function (c) { return byName[c.name]; }).filter(Boolean);
    G.addons.forEach(function (a) { if (ordered.indexOf(a) === -1) ordered.push(a); });
    fill(body('addons'), notes.concat(ordered.map(function (a) {
      var count = C.skills.concat(C.agents).filter(function (x) { return x.ships === addonShips(a.name); }).length;
      return h('div', { class: 'addon-card' }, h('h4', a.name), para(addonBlurb(a.name)),
        h('div', { class: 'linkrow' }, a.skills.map(function (s) { return itemByName(C.skills, s) ? openLink(s, 'skill/' + s) : chip(s); })),
        count ? h('button', {
          type: 'button', class: 'btn',
          onclick: function () {
            var ships = addonShips(a.name);
            setTab(C.skills.some(function (x) { return x.ships === ships; }) ? 'skills' : 'agents', false);
            catState.ships = ships;
            catState.q = '';
            renderFilters();
            renderGroups();
            syncCatHash();
            scrollToId('catalog');
          }
        }, 'View ' + count + ' in catalog') : null);
    })));
    done('everyday');
    done('addons');
  }

  /* ---------- Hireboard example ---------- */
  var exSel = 0;
  var chapLine, chapDetail, routeChips;
  var pinnedEx = null;
  function dimChapters(listOrNull) {
    if (!chapLine) return;
    Array.prototype.slice.call(chapLine.querySelectorAll('li')).forEach(function (li) {
      li.classList.toggle('is-dim', !!listOrNull && listOrNull.indexOf(li.getAttribute('data-n')) === -1);
    });
  }
  function restoreRoute() { markSelectedRoute(pinnedEx ? guideRouteId(pinnedEx) : null, pinnedEx); }
  function specLink(key) {
    var sp = specByKey(key);
    return sp ? openLink(sp.key + ' · ' + sp.title, 'spec/' + sp.key) : null;
  }
  function renderExample() {
    var root = body('example');
    append(root, para('Follow ' + E.product + ' through ' + E.chapters.length + ' chapters: the route /sdd picked for each ticket, the commands typed, what each chapter teaches, and the specs it produced. Select a chapter, or highlight a route.', 'note'));
    append(root, h('div', { class: 'ex-meta' },
      para(E.summary), para(E.fictionNote, 'fiction'),
      h('div', { class: 'linkrow' }, plain(E.readme, 'Read the example\'s README')),
      h('div', { class: 'frow' }, h('span', { class: 'lbl' }, 'People'), E.people.map(function (p) { return chip(p.name + ' · ' + p.role, 'you'); })),
      h('div', { class: 'frow' }, h('span', { class: 'lbl' }, 'Repos'), E.repos.map(function (r) { return chip(r.id + ' · ' + r.stack, 'agent'); })),
      h('details', { class: 'gates' }, h('summary', 'Gates the finished code passes (' + E.gates.length + ')'),
        h('table', { class: 'flags' }, h('caption', { class: 'sr-only' }, 'Gates'),
          h('thead', h('tr', ['Gate', 'Repo', 'Result'].map(function (t) { return h('th', { scope: 'col' }, t); }))),
          h('tbody', E.gates.map(function (g) { return h('tr', h('td', g.gate), h('td', g.repo), h('td', g.result)); }))))));
    routeChips = h('div', { class: 'frow', role: 'group', 'aria-label': 'Highlight chapters by route' }, h('span', { class: 'lbl' }, 'Routes'), E.routes.map(function (r) {
      return h('button', {
        type: 'button', class: 'chip rt ' + rtClass(r.id), 'data-exr': r.id, 'aria-pressed': 'false', title: r.pipeline,
        onclick: function () {
          pinnedEx = pinnedEx === r.id ? null : r.id;
          Array.prototype.slice.call(routeChips.querySelectorAll('[data-exr]')).forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-exr') === pinnedEx)); });
          restoreRoute();
        }
      }, r.label);
    }));
    var btns = E.chapters.map(function (c, i) {
      var tk = c.tickets.length ? c.tickets[0] + (c.tickets.length > 1 ? ' +' + (c.tickets.length - 1) : '') : '—';
      return h('button', {
        type: 'button', 'aria-pressed': String(i === exSel), tabindex: i === exSel ? '0' : '-1',
        onclick: function () { selectChapter(i); showChapter(c.n); },
        onkeydown: function (e) {
          var n = null;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = Math.min(i + 1, btns.length - 1);
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = Math.max(i - 1, 0);
          if (e.key === 'Home') n = 0;
          if (e.key === 'End') n = btns.length - 1;
          if (n !== null) { e.preventDefault(); selectChapter(n); btns[n].focus(); }
        }
      }, h('span', { class: 'cn' }, 'CH ' + c.n), h('span', { class: 'ct' }, tk),
        h('span', { class: 'cd' }, shortDate(c.date) || '—'), h('span', { class: 'cl' }, routeLabel(c.route)),
        h('span', { class: 'sr-only' }, c.title));
    });
    chapLine = h('ol', { class: 'chap-line', 'aria-label': E.product + ' chapters' }, E.chapters.map(function (c, i) {
      return h('li', { class: rtClass(c.route) + (c.specKeys.length ? ' has-spec' : ''), 'data-n': c.n }, btns[i]);
    }));
    chapDetail = h('div', { class: 'chap-detail', 'aria-live': 'polite' });
    append(root, [routeChips, h('p', { class: 'hint' }, 'Scroll sideways or use the arrow keys to move along the timeline. Underlined chapters produce a spec on the board below.'), chapLine, chapDetail]);
    selectChapter(exSel);
    done('example');
  }
  function selectChapter(i) {
    exSel = i;
    var c = E.chapters[i];
    Array.prototype.slice.call(chapLine.querySelectorAll('button')).forEach(function (b, j) {
      b.setAttribute('aria-pressed', String(i === j));
      b.setAttribute('tabindex', i === j ? '0' : '-1');
    });
    var routes = [c.route].concat(c.alsoRoutes).filter(Boolean);
    var step = function (k, label, text, disabled) {
      return h('button', {
        type: 'button', class: 'btn', 'aria-label': label, disabled: disabled,
        onclick: function () { selectChapter(Math.max(0, Math.min(E.chapters.length - 1, exSel + (k === 'next' ? 1 : -1)))); }
      }, text);
    };
    fill(chapDetail, [
      h('div', { class: 'num' }, c.n),
      h('div', h('h3', c.title),
        h('div', { class: 'chips' }, routes.length ? routes.map(routeChip) : routeChip(null), c.tickets.map(function (t) { return chip(t); }), c.date ? chip(c.date) : null),
        para(c.learn, 'learn'), c.pipeline ? para(c.pipeline, 'mono') : null,
        c.specKeys.length ? h('div', { class: 'linkrow' }, h('span', { class: 'hint' }, 'Specs'), c.specKeys.map(specLink)) : null,
        c.features.length ? h('div', { class: 'chips' }, c.features.map(function (f) { return chip(f); })) : null),
      h('div', { class: 'side' }, h('div', { class: 'ctrl' }, step('prev', 'Previous chapter', '◀', i === 0), step('next', 'Next chapter', '▶', i === E.chapters.length - 1)),
        h('button', { type: 'button', class: 'btn primary', onclick: function () { showChapter(E.chapters[exSel].n); } }, 'Commands and files'),
        h('span', { class: 'hint' }, (i + 1) + ' / ' + E.chapters.length))
    ]);
  }
  function showChapter(n, fromRouter) {
    var c = chapterByN(n);
    if (!c) return false;
    var i = E.chapters.indexOf(c);
    selectChapter(i);
    var routes = [c.route].concat(c.alsoRoutes).filter(Boolean);
    var out = [para(c.oneLine), h('div', { class: 'linkrow' }, routes.length ? routes.map(routeChip) : routeChip(null), c.tickets.map(function (t) { return chip(t); })),
      h('h3', 'What you learn'), para(c.learn)];
    if (c.pipeline) out.push(h('h3', 'Pipeline'), para(c.pipeline, 'mono'));
    var gr = routes.map(guideRouteId).filter(function (id, k, arr) { return arr.indexOf(id) === k && routeById(id); });
    if (gr.length) out.push(routeButtons(gr.map(routeById)));
    if (c.features.length) out.push(h('h3', 'Kit features'), list(c.features));
    if (c.commands.length) out.push(h('h3', 'Commands typed'), h('div', { class: 'stack-gap' }, c.commands.map(function (cmd) { return codeBlock(cmd, cmd); })));
    if (c.afterSdd.length) {
      out.push(h('h3', 'After /sdd in this chapter'), h('div', { class: 'stack-gap' }, c.afterSdd.map(function (a) {
        var g = A ? A.groups.filter(function (x) { return x.id === a.group; })[0] : null;
        return labeled(g ? g.label : a.group, a.cmd);
      })));
    }
    if (c.specKeys.length) out.push(h('h3', 'Specs it produces'), h('div', { class: 'linkrow' }, c.specKeys.map(specLink)));
    if (c.artifacts.length) out.push(h('h3', 'Files'), h('ul', { class: 'outs' }, c.artifacts.map(function (a) { return h('li', plain(a.href, a.label, 'inline')); })));
    if (c.nowAlso.length) {
      out.push(h('h3', 'Not in the chapter: added to the kit after the example was written'), h('div', { class: 'stack-gap' }, c.nowAlso.map(function (a) {
        return a.kind === 'command' ? h('div', codeBlock(a.cmd, a.cmd), para(a.why, 'muted')) : h('p', { class: 'muted' }, h('b', a.cmd + '.'), ' ' + a.why);
      })));
    }
    out.push(h('h3', 'Read the chapter'), h('div', { class: 'linkrow' }, plain(c.href, c.n + '-' + c.slug + '.md')));
    var prev = E.chapters[i - 1], next = E.chapters[i + 1];
    out.push(h('div', { class: 'drawer-nav' },
      prev ? openLink('◀ ch. ' + prev.n, 'chapter/' + prev.n, 'btn') : h('span'),
      next ? openLink('ch. ' + next.n + ' ▶', 'chapter/' + next.n, 'btn') : h('span')));
    openDrawer(E.product + ' · chapter ' + c.n + (c.date ? ' · ' + c.date : ''), c.title, out, 'example');
    markSelectedRoute(c.route ? guideRouteId(c.route) : null, c.route);
    if (!fromRouter) setHash('example/' + c.n);
    return true;
  }

  /* ---------- Spec board ---------- */
  function coverage(s) {
    return { ok: s.acceptance.filter(function (a) { return a.coveredBy.length || a.verifiedBy; }).length, total: s.acceptance.length };
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function meter(done, total, cls) {
    return h('span', { class: 'meter' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' }, h('i', { style: 'width:' + pct(done, total) + '%' }));
  }
  function renderBoard() {
    var sb = G.specBoard || {};
    var root = body('board');
    var cmds = (sb.commands || []).slice(0, 2);
    append(root, [
      sb.what ? para(sb.what, 'note') : null,
      h('div', { class: 'board-top' },
        h('div', para('The board below is built from the example\'s ' + E.specs.length + ' spec folders. The full board is the real spec-board output for the same files, as one offline page.'),
          h('div', { class: 'stack-gap' }, cmds.map(function (c) { return labeled(c.label, c.code); })),
          sb.note ? para(sb.note, 'note') : null),
        h('div', { class: 'go' }, plain(E.board.href, 'Open the full spec board ↗', 'btn primary'),
          h('span', { class: 'board-stats' }, E.board.stats.total + ' specs · ' + E.board.stats.backlog + ' backlog, as of ' + shortDate(E.board.generatedAt) + ' ' + E.board.generatedAt.slice(0, 4))))
    ]);
    var cols = E.board.columns.slice();
    E.specs.forEach(function (s) { if (cols.indexOf(s.status) === -1) cols.push(s.status); });
    append(root, h('div', { class: 'kanban' }, cols.map(function (col) {
      var specs = E.specs.filter(function (s) { return s.status === col; });
      var label = STATUS_LABEL[col] || col;
      return h('section', { class: 'kcol st-' + col, 'aria-label': label + ', ' + specs.length + ' specs' },
        h('h3', label, ' ', h('span', specs.length)),
        specs.length ? h('div', { class: 'kcards' }, specs.map(specCard)) : h('div', { class: 'k-empty' }, 'Empty: nothing is ' + label.toLowerCase() + ' at the end of the example.'));
    })));
    done('board');
  }
  function specCard(s) {
    var cv = coverage(s);
    return h('button', { type: 'button', class: 'kcard st-' + s.status, onclick: function () { showSpec(s.key); } },
      h('span', { class: 'kk' }, h('span', h('b', s.shortId), ' · ' + s.repo), chip(s.size)),
      h('span', { class: 'kt' }, s.title),
      meter(s.tasks.done, s.tasks.total),
      h('span', { class: 'kp' }, h('span', 'tasks ' + s.tasks.done + '/' + s.tasks.total), h('span', 'AC ' + cv.ok + '/' + cv.total + ' traced')),
      h('span', { class: 'kf' }, s.approvedBy ? chip('approved · ' + s.approvedBy, 'you') : chip('not approved', 'warn-warn'),
        s.chapter ? chip('ch. ' + s.chapter) : null,
        s.warnings.map(function (w) { return chip(w.level + ': ' + w.code.replace(/-/g, ' '), 'warn-' + w.level); })));
  }
  function anat(id) { return E.specAnatomy.filter(function (a) { return a.id === id; })[0]; }
  function annot(id) { var a = anat(id); return a ? h('p', { class: 'annot' }, h('b', 'What this section is'), a.explain) : null; }
  function covText(x) {
    if (x.coveredBy.length) return h('span', { class: 'cov' }, 'covered by task ' + x.coveredBy.join(', '));
    if (x.verifiedBy) return h('span', { class: 'cov ext' }, 'existing test, no new task');
    return h('span', { class: 'cov bad' }, 'uncovered');
  }
  function criteria(items, idClass) {
    return h('ul', { class: 'ac-list' }, items.map(function (a) {
      return h('li', h('span', { class: idClass }, a.id), a.text, covText(a), a.verifiedBy ? h('span', { class: 'ver' }, (a.kind || 'verified') + ': ' + a.verifiedBy) : null);
    }));
  }
  function showSpec(key, fromRouter) {
    var s = specByKey(key);
    if (!s) return false;
    var ch = chapterByN(s.chapter), cv = coverage(s), bd = anat('boundaries');
    var resolved = s.openQuestions.filter(function (q) { return q.checked; }).length;
    var out = [
      h('div', { class: 'linkrow' }, chip(STATUS_LABEL[s.status] || s.status, 'st-' + s.status), chip(s.size), chip(s.type), s.priority ? chip(s.priority) : null),
      h('h3', 'Status and approval'),
      h('dl', { class: 'meta-grid' },
        h('dt', 'Ticket'), h('dd', s.ticket || '—'),
        h('dt', 'Approved'), h('dd', s.approvedBy ? s.approvedBy + (s.approvedAt ? ' · ' + s.approvedAt.replace('T', ' ').replace(/:00Z$|Z$/, ' UTC') : '') : 'not yet'),
        h('dt', 'Stakeholders'), h('dd', s.stakeholders.join(', ') || '—'),
        h('dt', 'Created'), h('dd', s.created || '—'),
        h('dt', 'Stacks'), h('dd', s.stacks.join(', ') || '—'),
        h('dt', 'Folder'), h('dd', { class: 'mono wrap' }, s.repo + '/.ai/specs/' + s.folder + '/')),
      annot('frontmatter'),
      h('h3', 'Tasks · ' + s.tasks.done + ' of ' + s.tasks.total + ' done'), meter(s.tasks.done, s.tasks.total, 'st-' + s.status),
      s.tasks.items.length ? h('ul', { class: 'task-list' }, s.tasks.items.map(function (t) { return h('li', (t.checked ? '✓ ' : '○ ') + t.number + ' ' + t.title); })) : null,
      annot('traceability'),
      h('h3', 'Acceptance criteria · ' + cv.ok + ' of ' + cv.total + ' traced'), annot('acceptance'), criteria(s.acceptance, 'aid')
    ];
    if (s.mustNotChange.length) out.push(h('h3', 'Must NOT change'), annot('mnc'), criteria(s.mustNotChange, 'mid'));
    if (s.nfrs.length) out.push(h('h3', 'Non-functional requirements'), h('ul', { class: 'ac-list' }, s.nfrs.map(function (n) { return h('li', h('span', { class: 'aid' }, n.id), n.text); })));
    out.push(h('h3', 'Boundaries'), annot('boundaries'),
      bd && bd.from === s.key ? h('pre', { class: 'excerpt' }, bd.excerpt) : h('p', 'Read this spec\'s Always / Ask first / Never rules in ', plain(s.href, 'spec-lite.md', 'inline'), '.'));
    out.push(h('h3', 'Open questions · ' + resolved + ' of ' + s.openQuestions.length + ' resolved'), annot('open-questions'),
      s.openQuestions.length ? h('ul', { class: 'oq' }, s.openQuestions.map(function (q) {
        return h('li', h('span', { class: 'box' + (q.checked ? '' : ' open'), role: 'img', 'aria-label': q.checked ? 'resolved' : 'open' }, '✓'), h('span', q.text));
      })) : para('None recorded.', 'muted'));
    if (s.warnings.length || s.session) {
      out.push(h('h3', 'Board warnings'), h('ul', { class: 'outs' }, s.warnings.map(function (w) { return h('li', chip(w.level, 'warn-' + w.level), ' ' + w.message); })));
      if (s.session) {
        out.push(para('Saved session: task ' + s.session.currentTask + ' of ' + s.session.totalTasks + ', last updated ' + s.session.lastUpdated +
          (s.session.stale ? ' (older than tasks.md)' : '') + '. Resume hint: ' + s.session.resumeHint));
      }
    }
    var parts = E.specAnatomy.filter(function (a) { return a.from === s.key; });
    if (parts.length) {
      out.push(h('h3', 'Every section, annotated'), parts.map(function (a) {
        return h('details', { class: 'anat' }, h('summary', a.section, h('small', a.file)),
          h('div', h('p', { class: 'annot' }, h('b', 'What this section is'), a.explain), h('pre', { class: 'excerpt' }, a.excerpt),
            h('div', { class: 'linkrow' }, plain(a.href, a.file), plain(a.chapterHref, 'explained in the chapter'))));
      }));
    }
    out.push(h('h3', 'Files'), h('div', { class: 'linkrow' }, s.files.map(function (f) { return plain(s.href.replace(/[^\/]*$/, '') + f, f); })));
    out.push(h('div', { class: 'linkrow' }, plain(E.board.href + '#spec/' + s.key, 'Open in the full board ↗', 'btn primary'), ch ? openLink('Chapter ' + ch.n, 'chapter/' + ch.n, 'btn') : null));
    openDrawer('Spec · ' + s.repo + ' · ' + (STATUS_LABEL[s.status] || s.status), s.shortId + ' · ' + s.title, out, 'board');
    if (!fromRouter) setHash('board/' + s.key);
    return true;
  }

  /* ---------- Catalog ---------- */
  var TABS = [['skills', 'Skills', C.skills], ['agents', 'Agents', C.agents], ['workflows', 'Workflows', C.workflows]];
  var catTabs, catFilters, catGroups;
  function tabList(name) { return TABS.filter(function (t) { return t[0] === name; })[0][2]; }
  function uniq(items, key) {
    var seen = [];
    items.forEach(function (x) { if (x[key] && seen.indexOf(x[key]) === -1) seen.push(x[key]); });
    return seen;
  }
  function shipsLabel(v) {
    if (v === 'core') return 'core';
    var a = G.addons.filter(function (x) { return addonShips(x.name) === v; })[0];
    return a ? a.name : v;
  }
  function renderTabs() {
    var btns = TABS.map(function (t, i) {
      var on = catState.tab === t[0];
      return h('button', {
        type: 'button', role: 'tab', id: 'tab-' + t[0], 'aria-controls': 'cat-groups', 'aria-selected': String(on), tabindex: on ? '0' : '-1',
        onclick: function () { setTab(t[0], true); },
        onkeydown: function (e) {
          var n = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : null;
          if (n === null) return;
          e.preventDefault();
          setTab(TABS[n][0], true);
          $('tab-' + TABS[n][0]).focus();
        }
      }, t[1], h('span', { class: 'ct' }, t[2].length));
    });
    fill(catTabs, btns);
    catGroups.setAttribute('aria-labelledby', 'tab-' + catState.tab);
  }
  function setTab(name, updateHash) {
    catState.tab = name;
    catState.ships = '';
    catState.invoke = '';
    catState.model = '';
    renderTabs();
    renderFilters();
    renderGroups();
    if (updateHash) syncCatHash();
  }
  function chipRow(label, key, values, fmt) {
    if (values.length < 2) return null;
    var pick = function (v) {
      return h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(v ? catState[key] === v : !catState[key]),
        onclick: function () {
          catState[key] = v;
          renderFilters();
          renderGroups();
          syncCatHash();
          var again = catFilters.querySelectorAll('[data-f="' + key + '"]');
          Array.prototype.slice.call(again).forEach(function (b) { if (b.getAttribute('data-v') === v) b.focus(); });
        },
        'data-f': key, 'data-v': v
      }, v ? (fmt ? fmt(v) : v) : 'all');
    };
    return h('div', { class: 'frow', role: 'group', 'aria-label': label }, h('span', { class: 'lbl' }, label), pick(''), values.map(pick));
  }
  function renderFilters() {
    var items = tabList(catState.tab);
    var input = h('input', {
      id: 'cat-q', type: 'search', autocomplete: 'off', placeholder: 'Search ' + catState.tab + ' by name or description', value: catState.q,
      oninput: function () { catState.q = input.value; renderGroups(); syncCatHashSoon(); }
    });
    input.value = catState.q;
    fill(catFilters, [
      h('label', { class: 'search' }, h('span', { class: 'sr-only' }, 'Search ' + catState.tab), input),
      catState.tab !== 'workflows' ? chipRow('Ships', 'ships', uniq(items, 'ships'), shipsLabel) : null,
      catState.tab === 'skills' ? chipRow('Invoke', 'invoke', uniq(items, 'invoke')) : null,
      catState.tab === 'agents' ? chipRow('Model', 'model', uniq(items, 'model')) : null
    ]);
  }
  function catMatches(x) {
    if (catState.ships && x.ships !== catState.ships) return false;
    if (catState.invoke && x.invoke !== catState.invoke) return false;
    if (catState.model && x.model !== catState.model) return false;
    if (!catState.q) return true;
    var hay = (x.name + ' ' + x.description + ' ' + (x.whenToUse || '') + ' ' + (x.category || '')).toLowerCase();
    return catState.q.toLowerCase().split(/\s+/).every(function (t) { return hay.indexOf(t) !== -1; });
  }
  function renderGroups() {
    var items = tabList(catState.tab).filter(catMatches);
    if (!items.length) { fill(catGroups, h('div', { class: 'empty' }, 'Nothing matches. Clear the search or pick "all" in the filters.')); return; }
    if (catState.tab === 'workflows') {
      fill(catGroups, h('div', { class: 'cards' }, items.map(function (w) {
        return h('button', { type: 'button', class: 'card k-wf', onclick: function () { showWorkflow(w.name); } },
          h('span', { class: 'nm' }, w.name), h('span', { class: 'ds' }, w.description), h('span', { class: 'chips' }, chip(w.phases.length + ' phases', 'you')));
      })));
      return;
    }
    var type = catState.tab === 'skills' ? 'skill' : 'agent';
    var groups = {};
    items.forEach(function (x) { var c = catLabel(x.category); (groups[c] = groups[c] || []).push(x); });
    var keys = Object.keys(groups).sort(function (a, b) { return a === 'uncategorized' ? 1 : b === 'uncategorized' ? -1 : a.localeCompare(b); });
    fill(catGroups, keys.map(function (k) {
      return h('div', { class: 'group' }, h('h3', k, ' ', h('span', { class: 'ct' }, groups[k].length)),
        h('div', { class: 'cards' }, groups[k].map(function (x) {
          var chips = [x.ships === 'core' ? chip('core', 'tools') : chip(shipsLabel(x.ships), 'addon')];
          var xh = catalogHost(x);
          if (xh) chips.push(chip(xh.invoke), chip(xh.availability));
          if (type === 'skill') { if (!xh) chips.push(chip(x.invoke)); }
          else chips.push(chip(x.model, 'agent'), x.effort ? chip('effort ' + x.effort) : null);
          return h('button', { type: 'button', class: 'card k-' + type, onclick: function () { showItem(type, x.name); } },
            h('span', { class: 'nm' }, x.name), h('span', { class: 'ds' }, x.description), h('span', { class: 'chips' }, chips));
        })));
    }));
  }
  var syncCatHashSoon = debounce(function () { syncCatHash(); }, 300);
  function syncCatHash() {
    var p = [];
    if (catState.q) p.push('q=' + encodeURIComponent(catState.q));
    ['ships', 'invoke', 'model'].forEach(function (k) { if (catState[k]) p.push(k + '=' + encodeURIComponent(catState[k])); });
    setHash(catState.tab + (p.length ? '?' + p.join('&') : ''));
  }
  function renderCatalog() {
    catTabs = h('div', { class: 'cat-tabs', role: 'tablist', 'aria-label': 'Catalog type' });
    catFilters = h('div', { class: 'filters' });
    catGroups = h('div', { class: 'groups', id: 'cat-groups', role: 'tabpanel', tabindex: '0' });
    append(body('catalog'), [catTabs, catFilters, catGroups]);
    renderTabs();
    renderFilters();
    renderGroups();
    done('catalog');
  }
  hostListeners.push(function () { if (catGroups) renderGroups(); });

  /* ---------- Troubleshooting, roles, links ---------- */
  function highlight(text, q) {
    var terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [text];
    var re = new RegExp('(' + terms.map(escapeRe).join('|') + ')', 'ig');
    var out = [], last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push(h('mark', m[0]));
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }
  var helpInput, helpCards;
  function renderHelpCards() {
    var q = helpInput.value.trim();
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    var found = G.troubleshooting.filter(function (t) {
      var hay = (t.problem + ' ' + t.fix).toLowerCase();
      return terms.every(function (x) { return hay.indexOf(x) !== -1; });
    });
    fill(helpCards, found.length ? found.map(function (t) {
      return h('article', { class: 'tcard' }, h('h3', highlight(t.problem, q)), h('p', highlight(t.fix, q)));
    }) : h('div', { class: 'empty' }, 'No match. Try a shorter word, or run ', h('code', '/framework-doctor'), '.'));
  }
  function renderHelp() {
    helpInput = h('input', {
      type: 'search', autocomplete: 'off', placeholder: 'e.g. hooks, jq, skill not found',
      oninput: function () {
        renderHelpCards();
        var v = helpInput.value.trim();
        setHashSoon('help' + (v ? '?q=' + encodeURIComponent(v) : ''));
      }
    });
    helpCards = h('div', { class: 'tcards', 'aria-live': 'polite' });
    append(body('help'), [
      h('label', { class: 'search' }, h('span', { class: 'sr-only' }, 'Search troubleshooting by symptom'), helpInput),
      helpCards
    ]);
    renderHelpCards();
    done('help');
  }
  function renderLinks() {
    fill($('links'), G.links.map(function (l) { return h('li', plain(l.href, l.label, 'inline')); }).concat(h('li', plain(G.repo, 'Repository', 'inline'))));
  }

  /* ---------- Router ---------- */
  function parseHash(raw) {
    var s = String(raw || '').replace(/^#/, '');
    var qi = s.indexOf('?');
    var path = qi === -1 ? s : s.slice(0, qi);
    var params = {};
    var dec = function (t) { try { return decodeURIComponent(t); } catch (e) { return t; } };
    if (qi !== -1) {
      s.slice(qi + 1).split('&').forEach(function (kv) {
        var p = kv.split('=');
        if (p[0]) params[dec(p[0])] = dec(p.slice(1).join('='));
      });
    }
    var seg = dec(path).split('/');
    return { head: seg[0], rest: seg.slice(1).join('/'), params: params };
  }

  /**
   * Turns a location hash into what the page should do: { kind, id, section, ok, ... }.
   * `section` is the id to scroll to, `ok` is false when the target does not exist in the data,
   * and kind 'none' means the hash names nothing on this page.
   */
  function plan(raw) {
    var LEGACY_SECTIONS = { primer: 'start' };
    var r = parseHash(raw), head = r.head, rest = r.rest;
    if (!head || head === 'top') return { kind: 'top', section: 'start' };
    if (head === 'route') return { kind: 'route', id: rest, section: 'map', ok: !!routeById(rest) };
    if (head === 'after' && A && A.groups.some(function (g) { return g.id === rest; })) return { kind: 'section', section: 'after-' + rest, ok: true };
    if (head === 'after') return { kind: 'after', id: rest, section: 'after', ok: !rest || !!afterFlat().filter(function (x) { return cmdName(x.cmd) === rest; })[0] };
    if (head === 'example') {
      var c = chapterByN(rest);
      return rest ? { kind: 'chapter', id: c ? c.n : rest, section: 'example', ok: !!c } : { kind: 'section', section: 'example', ok: !!E };
    }
    if (head === 'board') {
      var bs = specByKey(rest);
      return rest ? { kind: 'spec', id: bs ? bs.key : rest, section: 'board', ok: !!bs } : { kind: 'section', section: 'board', ok: !!E };
    }
    if (head === 'spec') {
      var sp = specByKey(rest);
      if (sp) return { kind: 'spec', id: sp.key, section: 'board', ok: true };
      return { kind: 'section', section: 'spec', ok: true };
    }
    if (head === 'workflow') return { kind: 'workflow', id: rest, section: 'map', ok: !!workflowByName(rest) };
    if (head === 'skill' || head === 'agent') return { kind: head, id: rest, section: 'catalog', ok: !!itemByName(head === 'skill' ? C.skills : C.agents, rest) };
    if (head === 'skills' || head === 'agents' || head === 'workflows' || head === 'catalog') {
      return { kind: 'catalog', tab: head === 'catalog' ? 'skills' : head, params: r.params, section: 'catalog', ok: true };
    }
    if (head === 'pipeline') {
      var idx = P.map(function (p) { return p.id; }).indexOf(rest);
      return { kind: 'pipeline', id: rest, index: idx, section: 'pipeline', ok: !rest || idx !== -1 };
    }
    if (head === 'install') return { kind: 'install', id: rest, section: 'install', ok: !rest || hasInstMode(rest) };
    if (head === 'help') return { kind: 'help', q: r.params.q || '', section: 'help', ok: true };
    if (Object.prototype.hasOwnProperty.call(LEGACY_SECTIONS, head)) return { kind: 'section', section: LEGACY_SECTIONS[head], ok: true };
    if ($(head)) return { kind: 'section', section: head, ok: true };
    return { kind: 'none', ok: false };
  }

  function route() {
    var p = plan(location.hash);
    if (p.kind === 'top' || p.kind === 'none') { closeDrawerQuiet(); return; }
    scrollToId(p.section);
    var opened = false;
    if (p.ok) {
      if (p.kind === 'route') opened = showRoute(p.id, true);
      else if (p.kind === 'workflow') opened = showWorkflow(p.id, true);
      else if (p.kind === 'skill' || p.kind === 'agent') {
        if (catState.tab !== p.kind + 's') setTab(p.kind + 's', false);
        opened = showItem(p.kind, p.id, true);
      } else if (p.kind === 'after' && p.id) opened = showAfter(p.id, true);
      else if (p.kind === 'chapter') opened = showChapter(p.id, true);
      else if (p.kind === 'spec') opened = showSpec(p.id, true);
    }
    if (opened) return;
    closeDrawerQuiet();
    if (!p.ok) return;
    if (p.kind === 'catalog') {
      catState.tab = p.tab;
      catState.q = p.params.q || '';
      catState.ships = p.params.ships || '';
      catState.invoke = p.params.invoke || '';
      catState.model = p.params.model || '';
      renderTabs();
      renderFilters();
      renderGroups();
    } else if (p.kind === 'pipeline' && p.index !== -1) selectStage(p.index, false);
    else if (p.kind === 'install' && p.id) renderInstall.select(p.id, false);
    else if (p.kind === 'help') { helpInput.value = p.q; renderHelpCards(); }
  }
  window.addEventListener('hashchange', route);

  /* ---------- Command palette ---------- */
  var KIND_ORDER = ['section', 'route', 'workflow', 'skill', 'agent', 'chapter', 'spec'];
  var KIND_LABEL = { section: 'Section', route: 'Route', workflow: 'Workflow', skill: 'Skill', agent: 'Agent', chapter: 'Chapter', spec: 'Spec' };
  var PALETTE_MAX = 50;
  var paletteEntries = null;

  /** Builds the search index once: every entry has a kind, name, title, description and its deep link. */
  function paletteIndex() {
    if (paletteEntries) return paletteEntries;
    var out = [];
    function add(kind, name, title, desc, hash) {
      out.push({ kind: kind, name: String(name), title: String(title || ''), desc: String(desc || ''), hash: hash });
    }
    rendered.forEach(function (id) {
      var section = $(id);
      if (!section) return;
      var heading = section.querySelector && section.querySelector('h1, h2, h3');
      var lede = section.querySelector && section.querySelector('.lede');
      var title = heading && heading.textContent ? heading.textContent : id;
      add('section', id, title, lede && lede.textContent, '#' + id);
    });
    G.routes.forEach(function (r) { add('route', r.id, r.label, r.when, '#route/' + r.id); });
    C.workflows.forEach(function (w) { add('workflow', w.name, '', w.description, '#workflow/' + w.name); });
    C.skills.forEach(function (s) { add('skill', s.name, '', s.description, '#skill/' + s.name); });
    C.agents.forEach(function (a) { add('agent', a.name, '', a.description, '#agent/' + a.name); });
    if (E) {
      E.chapters.forEach(function (c) { add('chapter', c.n, c.title, c.oneLine, '#example/' + c.n); });
      E.specs.forEach(function (s) { add('spec', s.key, s.title, s.ticket, '#spec/' + s.key); });
    }
    paletteEntries = out;
    return out;
  }

  /** Best tier a token reaches in a text: exact 4, prefix 3, word start 2, substring 1, none 0. */
  function matchTier(text, token) {
    var t = text.toLowerCase();
    if (!t) return 0;
    if (t === token) return 4;
    if (t.indexOf(token) === 0) return 3;
    if (new RegExp('[^a-z0-9]' + escapeRe(token)).test(t)) return 2;
    return t.indexOf(token) !== -1 ? 1 : 0;
  }
  function entryScore(entry, tokens) {
    var total = 0;
    for (var i = 0; i < tokens.length; i++) {
      var best = Math.max(
        matchTier(entry.name, tokens[i]) * 4 + (matchTier(entry.name, tokens[i]) ? 3 : 0),
        matchTier(entry.title, tokens[i]) * 4 + (matchTier(entry.title, tokens[i]) ? 2 : 0),
        matchTier(entry.desc, tokens[i]) * 4 + (matchTier(entry.desc, tokens[i]) ? 1 : 0));
      if (!best) return 0;
      total += best;
    }
    return total;
  }

  /** Ranked matches for a query, at most PALETTE_MAX. An empty query returns the sections. */
  function paletteSearch(query) {
    var tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    var entries = paletteIndex();
    if (!tokens.length) return entries.filter(function (e) { return e.kind === 'section'; }).slice(0, PALETTE_MAX);
    var scored = [];
    entries.forEach(function (e) {
      var s = entryScore(e, tokens);
      if (s) scored.push({ e: e, s: s });
    });
    scored.sort(function (a, b) {
      return b.s - a.s || KIND_ORDER.indexOf(a.e.kind) - KIND_ORDER.indexOf(b.e.kind) || (a.e.name < b.e.name ? -1 : a.e.name > b.e.name ? 1 : 0);
    });
    return scored.slice(0, PALETTE_MAX).map(function (x) { return x.e; });
  }

  /** Next selected index when moving by delta through len results, wrapping at both ends; -1 when empty. */
  function paletteMove(current, delta, len) {
    if (!len) return -1;
    if (current < 0) return delta > 0 ? 0 : len - 1;
    return (current + delta + len) % len;
  }

  var palette = $('palette');
  var paletteInput = $('palette-input');
  var paletteList = $('palette-list');
  var paletteStatus = $('palette-status');
  var paletteResults = [];
  var paletteSel = -1;
  var paletteReturn = null;
  var BACKGROUND = ['.site-header', '.layout', '.site-footer'];

  function paletteIsOpen() { return !palette.hidden; }
  function setBackgroundInert(on) {
    BACKGROUND.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      if (on) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    });
  }
  function paletteSelect(i) {
    var items = paletteList.children;
    if (paletteSel >= 0 && items[paletteSel]) items[paletteSel].setAttribute('aria-selected', 'false');
    paletteSel = i;
    if (i >= 0 && items[i]) {
      items[i].setAttribute('aria-selected', 'true');
      paletteInput.setAttribute('aria-activedescendant', items[i].id);
      if (items[i].scrollIntoView) items[i].scrollIntoView({ block: 'nearest' });
    } else {
      paletteInput.removeAttribute('aria-activedescendant');
    }
  }
  function paletteRender() {
    paletteResults = paletteSearch(paletteInput.value);
    fill(paletteList, paletteResults.map(function (e, i) {
      return h('li', {
        id: 'palette-opt-' + i, role: 'option', 'aria-selected': 'false', class: 'palette-item',
        onmousedown: function (ev) { ev.preventDefault(); paletteGo(i); },
        onmousemove: function () { if (paletteSel !== i) paletteSelect(i); }
      },
      h('span', { class: 'palette-kind' }, KIND_LABEL[e.kind]),
      h('span', { class: 'palette-name' }, e.title && e.title !== e.name ? e.title : e.name),
      e.title && e.title !== e.name ? h('code', { class: 'palette-id' }, e.name) : null,
      e.desc ? h('span', { class: 'palette-desc' }, e.desc) : null);
    }));
    paletteSelect(paletteResults.length ? 0 : -1);
    paletteList.scrollTop = 0;
    paletteStatus.textContent = paletteResults.length
      ? paletteResults.length + (paletteResults.length === 1 ? ' result' : ' results')
      : 'No results';
  }
  function openPalette() {
    if (paletteIsOpen()) return;
    paletteReturn = document.activeElement && document.activeElement !== document.body ? document.activeElement : $('search-button');
    palette.hidden = false;
    setBackgroundInert(true);
    paletteInput.value = '';
    paletteRender();
    paletteInput.focus();
  }
  function closePalette() {
    if (!paletteIsOpen()) return;
    palette.hidden = true;
    setBackgroundInert(false);
    var target = paletteReturn && document.contains(paletteReturn) ? paletteReturn : $('search-button');
    paletteReturn = null;
    target.focus();
  }
  function paletteGo(i) {
    var entry = paletteResults[i];
    if (!entry) return;
    closePalette();
    if (location.hash === entry.hash) route();
    else location.hash = entry.hash;
  }
  paletteInput.addEventListener('input', paletteRender);
  palette.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      paletteSelect(paletteMove(paletteSel, e.key === 'ArrowDown' ? 1 : -1, paletteResults.length));
    } else if (e.key === 'Enter') { e.preventDefault(); paletteGo(paletteSel); }
    else if (e.key === 'Tab') e.preventDefault();
  });
  palette.addEventListener('mousedown', function (e) { if (e.target === palette) closePalette(); });
  $('search-button').addEventListener('click', openPalette);
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.code === 'KeyK' || (e.key || '').toLowerCase() === 'k')) {
      e.preventDefault();
      if (paletteIsOpen()) paletteInput.focus(); else openPalette();
      return;
    }
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || paletteIsOpen()) return;
    var t = e.target;
    var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
    e.preventDefault();
    openPalette();
  });

  /* ---------- Init ---------- */
  function dropSection(id) {
    var section = $(id);
    if (section) section.remove();
    var link = document.querySelector('#toc-list a[href="#' + id + '"]');
    if (link && link.parentNode) link.parentNode.remove();
    done(id);
  }

  renderHero();
  renderInstall();
  renderAddTools();
  renderQuickstart();
  renderPicker();
  renderMap();
  renderPipeline();
  renderAfter();
  renderSpec();
  done('routes');
  renderHooks();
  renderWorkflowsDirect();
  renderEveryday();
  done('commands');
  if (E) { renderExample(); renderBoard(); } else { dropSection('example'); dropSection('board'); }
  renderCatalog();
  renderHelp();
  renderLinks();

  window.SDDGuide = {
    resolveHost: resolveHost,
    host: function () { return host; },
    setHost: setHost,
    installModes: function () { return installModesFor().map(function (m) { return { id: m[0], steps: m[1].steps }; }); },
    installFlags: installFlags,
    addTools: addToolsView,
    quickstart: quickstartFor,
    catalogHost: catalogHost,
    plan: plan,
    parseHash: parseHash,
    pickerStart: PICK_START,
    pickerStep: pickerStep,
    pickerResult: pickerResult,
    sections: rendered,
    paletteIndex: paletteIndex,
    paletteSearch: paletteSearch,
    paletteMove: paletteMove
  };
  if (location.hash) setTimeout(route, 60);
})();
