/* Plot planner: draws one site's map from data/sites.js. The right-hand panel shows whatever was
   last tapped: a plot (with "Add / edit notes"), the site's jobs, one job (its row: status, who, money,
   blocked by, expected by, latest, then detail and photo, with "Edit this job" and "Move pin"), or the
   "Log a job" form. Jobs are kept on this phone until the receiver is connected, then they go to the
   association's sheet and are read back from it. Edits go as one job-edit message with only the fields
   that changed (jobedit.js); with no connection they wait on the phone and the row says "Not sent yet".
   No frameworks, no personal data.
   The plot card shows the plot's latest check (the sheet's Current tab) only to someone whose phone
   holds a rep key, from opening a rep link (?key=...) once. With the members' password (gate.js) it shows
   the plot's condition only, and only if the committee has switched that on in the sheet's Settings tab.

   The map pans and zooms. `view` {x, y, w, h} is the part of the image on show, in image pixels, and is
   applied as the SVG viewBox. Its aspect always matches the map element, so client px to image px is one
   uniform scale and letterboxing is explicit (the dark background shows past the image edge). Only a site
   change, a section chip (site.views), the + / - / Fit buttons, a gesture (one-finger drag, two-finger
   pinch, mouse wheel) or ?plot= changes it; draw() reads it and never resets it. A pointer that moves more
   than 8 px before it lifts is a drag, and the click it would cause is swallowed, so a pan never selects a
   plot or moves a job pin. index.html?site=Chestnuts&plot=12 opens with that plot's card and the map zoomed
   to about 3x on it; index.html?site=Bromyard&job=J3 opens that job. Jobs pins show while the jobs list, a
   job or "Log a job" is open; gates belong to the Paths layer. A tap on the map is turned into image pixels
   through the SVG's own screen matrix (toMap), so a pin lands under the finger at any zoom or pan. */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var sites = window.PLANNER_SITES || [];
  var CONFIG = window.PLANNER_CONFIG || {};
  var REPS = window.PLANNER_REPS || [];
  var layers = { paths: true, outlines: true, numbers: true, sheds: true, water: true };
  var layerNames = { paths: 'Paths', outlines: 'Plot outlines', numbers: 'Plot numbers', sheds: 'Sheds', water: 'Water' };
  var markerStyle = {
    shed: { color: '#7C4A1E', layer: 'sheds' },
    tap:  { color: '#1D4ED8', layer: 'water' },
    tank: { color: '#1D4ED8', layer: 'water' },
    gate: { color: '#141413', layer: 'paths' }
  };
  var J = window.AGA_JOBS;   // statuses, the edit form and the offline queue, shared with the job board (jobedit.js)
  var SOON = J.SOON;

  var site = sites[0];
  var mode = 'plot';        // plot | jobs | job | logjob
  var selected = null;      // plot id
  var jobId = null;         // selected job id
  var jobSub = 'view';      // in mode 'job': view | edit | move
  var movePin = null;       // move: where the next Save pin would put it, image px, or null until the map is tapped
  var notice = null;        // { id, text }: one green line at the top of that job's panel until the next edit or move
  var placing = false;      // log-a-job: next tap on the map places the pin
  var draft = { x: null, y: null, photo: null };
  var remoteJobs = null;
  var wantJob = null;       // ?job=<id>: open that job once the jobs are in
  var view = { x: 0, y: 0, w: 1, h: 1 };   // the viewBox, image px (see the note at the top)
  var viewIndex = 0;                        // which section chip is lit; -1 after a gesture or zoom button
  var MAX_ZOOM = 6;                         // times the whole-site fit
  var anim = null;                          // requestAnimationFrame id while a chip's move is animating
  var showJobs = function () { return mode === 'jobs' || mode === 'job' || mode === 'logjob'; };
  var moving = function () { return mode === 'job' && jobSub === 'move'; };
  var wantsTap = function () { return placing || mode === 'logjob' || moving(); };   // the next tap on the map places a pin

  var $ = function (id) { return document.getElementById(id); };
  var el = function (name, attrs, text) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var rot = function (ang, cx, cy) { return 'rotate(' + ang + ' ' + cx + ' ' + cy + ')'; };
  var store = function (k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('aga-' + k) || 'null'); localStorage.setItem('aga-' + k, JSON.stringify(v)); } catch (e) { return null; } };
  var who = function () { return store('who') || ''; };
  var KEY = (function () {
    var q = new URLSearchParams(location.search), k = q.get('key');
    if (k) { store('key', k); q.delete('key'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); }
    return k || store('key') || '';
  })();
  var plotInfo = {};
  var cardOpen = null;   // the pill on the plot card whose words are showing   // site|plot -> { state: 'loading' | 'ok' | 'none' | 'error', plot }
  var when = function (iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };

  // ---- jobs: seed from the data file, plus this phone's additions, plus the sheet when connected (the sheet's
  // row wins by id), with any edit still waiting on this phone laid over the top (jobedit.js).
  function allJobs() {
    var byId = {};
    (site.jobs || []).forEach(function (j) { byId[j.id] = Object.assign({}, j); });
    (store('jobs-' + site.key) || []).forEach(function (j) { byId[j.id] = Object.assign({}, byId[j.id] || {}, j); });
    (remoteJobs || []).forEach(function (j) { byId[j.id] = Object.assign({}, byId[j.id] || {}, j); });
    var list = Object.keys(byId).map(function (k) { return byId[k]; });
    return J.mergeEdits(list, site.key).sort(function (a, b) { return (a.logged || '') < (b.logged || '') ? -1 : 1; });
  }
  function jobById(id) { return allJobs().filter(function (x) { return x.id === id; })[0]; }
  function siteName() { return site.recordName || site.name; }
  function saveLocal(key, item) { var list = store(key + '-' + site.key) || []; list.push(item); store(key + '-' + site.key, list); }
  function denied(j) { if (j && j.error === 'password') AGA_GATE.relock(); return j; }
  function post(body) {
    if (!CONFIG.submitUrl) return Promise.resolve({ ok: false, offline: true });
    body = Object.assign({ pw: AGA_GATE.pw(), key: AGA_GATE.key() }, body);   // a rep link has a key and no password
    return fetch(CONFIG.submitUrl, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(denied).catch(function () { return { ok: false }; });
  }
  function loadRemote() {
    if (!CONFIG.submitUrl) { if (wantJob) openWantedJob(); return; }
    var key = site.key;
    fetch(CONFIG.submitUrl + '?action=jobs&site=' + encodeURIComponent(siteName()) + AGA_GATE.auth())
      .then(function (r) { return r.json(); })
      .then(denied)
      .then(function (j) { if (j && j.ok && key === site.key) { remoteJobs = j.jobs || []; J.forget(key); if (wantJob) openWantedJob(); draw(); } })
      .catch(function () {});
  }
  // Edits that waited on this phone: send them when the page opens with a signal, then read the sheet back.
  function sendWaiting() {
    if (!CONFIG.submitUrl || !J.queued(site.key).length || navigator.onLine === false) return;
    J.flush(site.key).then(function (r) { if (r.sent) loadRemote(); else draw(); });
  }
  // ?job=<id>: open that job and zoom in on its pin, once it is in the list.
  function openWantedJob() {
    var j = jobById(wantJob); if (!j) return;
    wantJob = null; jobId = j.id; mode = 'job'; jobSub = 'view';
    if (j.x != null) { var whole = fitWhole(); setView({ x: j.x - whole.w / 6, y: j.y - whole.h / 6, w: whole.w / 3, h: whole.h / 3 }); }
  }

  // ---- controls
  function buildControls() {
    $('map').addEventListener('click', function (ev) { if (wantsTap()) placeAt(ev); });
    $('card').addEventListener('click', function (ev) {
      var b = ev.target.closest('.pst'); if (!b) return;
      var n = b.getAttribute('data-item'); cardOpen = cardOpen === n ? null : n; drawPanel();
    });
    var sel = $('site');
    sel.innerHTML = '';
    sites.forEach(function (s, i) { var o = document.createElement('option'); o.value = i; o.textContent = s.name + (s.holding ? ' (no plots yet)' : ''); sel.appendChild(o); });
    sel.addEventListener('change', function () { setSite(sites[+sel.value]); });

    var chips = $('layers');
    chips.innerHTML = '';
    Object.keys(layerNames).forEach(function (key) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = layerNames[key];
      b.setAttribute('aria-pressed', String(layers[key]));
      b.addEventListener('click', function () { layers[key] = !layers[key]; b.setAttribute('aria-pressed', String(layers[key])); draw(); });
      chips.appendChild(b);
    });
    var jb = document.createElement('button');
    jb.type = 'button'; jb.className = 'chip'; jb.id = 'jobsChip'; jb.textContent = 'Jobs';
    jb.addEventListener('click', function () { mode = showJobs() ? 'plot' : 'jobs'; placing = false; jobSub = 'view'; draw(); });
    chips.appendChild(jb);
    $('logjob').addEventListener('click', function () { mode = 'logjob'; placing = false; jobSub = 'view'; draft = { x: null, y: null, photo: null }; draw(); });

    var centre = function () { return { x: view.x + view.w / 2, y: view.y + view.h / 2 }; };
    $('zoomIn').addEventListener('click', function () { var c = centre(); zoomAt(1.5, c.x, c.y); });
    $('zoomOut').addEventListener('click', function () { var c = centre(); zoomAt(1 / 1.5, c.x, c.y); });
    $('zoomFit').addEventListener('click', function () { goToView(0, true); });
    buildGestures();
  }

  function setSite(s) {
    site = s; selected = null; jobId = null; mode = 'plot'; jobSub = 'view'; movePin = null; placing = false; remoteJobs = null;
    sizeMap(); goToView(0, false); loadRemote(); draw(); sendWaiting();
  }

  // ---- view: which part of the image is on show
  function siteViews() {
    var v = site.views;
    return (v && v.length) ? v : [{ label: 'Whole site', x: 0, y: 0, w: site.imageW, h: site.imageH }];
  }
  function mapBox() { var s = $('map'); return { w: s.clientWidth || 1, h: s.clientHeight || 1 }; }
  // The map's height follows the image's shape, but is capped at about 70% of the screen (a very tall
  // image must not make a very long page) and is never under 320 px. Past the image edge is dark.
  function sizeMap() {
    var svg = $('map'), w = svg.clientWidth || svg.getBoundingClientRect().width || 360;
    var cap = Math.max(320, Math.round(window.innerHeight * 0.7));
    svg.style.height = Math.round(Math.max(320, Math.min(w * site.imageH / site.imageW, cap))) + 'px';
  }
  // The smallest view at the map's aspect that shows all of rect, centred on it.
  function fitRect(r) {
    var b = mapBox(), aspect = b.w / b.h, w = r.w, h = r.h;
    if (w / h < aspect) w = h * aspect; else h = w / aspect;
    return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w: w, h: h };
  }
  function fitWhole() { return fitRect({ x: 0, y: 0, w: site.imageW, h: site.imageH }); }
  // Keep the zoom between "whole site" and MAX_ZOOM times that, and keep the image on screen: along an
  // axis where the image fills the view it cannot be dragged past its edge; where it is smaller, it sits centred.
  function clampView(v) {
    var b = mapBox(), whole = fitWhole();
    var w = Math.min(whole.w, Math.max(whole.w / MAX_ZOOM, v.w)), h = w * b.h / b.w;
    var x = v.x + v.w / 2 - w / 2, y = v.y + v.h / 2 - h / 2;
    x = w >= site.imageW ? (site.imageW - w) / 2 : Math.min(Math.max(x, 0), site.imageW - w);
    y = h >= site.imageH ? (site.imageH - h) / 2 : Math.min(Math.max(y, 0), site.imageH - h);
    return { x: x, y: y, w: w, h: h };
  }
  function applyView(v) {
    view = v;
    $('map').setAttribute('viewBox', [v.x, v.y, v.w, v.h].map(function (n) { return Math.round(n * 100) / 100; }).join(' '));
  }
  function stopAnim() { if (anim) { cancelAnimationFrame(anim); anim = null; } }
  // After a gesture or a zoom button: no chip is lit.
  function setView(v) { stopAnim(); viewIndex = -1; applyView(clampView(v)); drawViewChips(); }
  function goToView(i, animate) {
    stopAnim();
    var target = clampView(fitRect(siteViews()[i] || siteViews()[0]));
    viewIndex = i; drawViewChips();
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || still || !window.requestAnimationFrame) { applyView(target); return; }
    var from = view, t0 = null, D = 260, frames = 0;
    var step = function (now) {
      if (t0 == null) t0 = now;   // time from the first frame, so t never runs backwards
      // by time (260 ms), but never more than 16 frames, so a throttled or stalled frame clock cannot leave it hanging
      var t = Math.max(0, Math.min(1, (now - t0) / D), Math.min(1, ++frames / 16)), e = 1 - Math.pow(1 - t, 3);
      applyView(t < 1 ? { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e } : target);
      anim = t < 1 ? requestAnimationFrame(step) : null;
    };
    anim = requestAnimationFrame(step);
  }
  // Zoom by factor (over 1 = in) keeping the image point (mx, my) where it is on screen.
  function zoomAt(factor, mx, my) {
    var whole = fitWhole(), w = Math.min(whole.w, Math.max(whole.w / MAX_ZOOM, view.w / factor));
    factor = view.w / w;
    setView({ x: mx - (mx - view.x) / factor, y: my - (my - view.y) / factor, w: w, h: view.h / factor });
  }
  // Client (screen) px to image px, right at any zoom: through the SVG's own transform.
  function toMap(clientX, clientY) {
    var svg = $('map'), ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    var pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    var p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }
  function drawViewChips() {
    var row = $('views'), views = siteViews();
    row.innerHTML = '';
    row.classList.toggle('hidden', views.length < 2);
    views.forEach(function (v, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = v.label || ('Part ' + (i + 1));
      b.setAttribute('aria-pressed', String(i === viewIndex));
      b.addEventListener('click', function () { goToView(i, true); });
      row.appendChild(b);
    });
  }

  // Gestures, with Pointer Events: one finger (or the mouse) drags the map; two fingers pinch about their
  // midpoint; the wheel zooms about the cursor. Each move is worked out from where the gesture began, not
  // from the last move, so it cannot drift. No pointer capture: taps still reach the plots and pins as
  // clicks, and a click that follows a pointer that moved over 8 px is swallowed in the capture phase.
  function buildGestures() {
    var svg = $('map'), pts = {}, start = null, moved = false, suppress = false;
    var list = function () { return Object.keys(pts).map(function (k) { return pts[k]; }); };
    var mid = function (p) { return p.length >= 2 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) } : { x: p[0].x, y: p[0].y, d: 0 }; };
    var begin = function () {   // (re)base the gesture on the pointers that are down now
      var p = list();
      if (!p.length) { start = null; return; }
      var m = mid(p);
      start = { view: view, d: m.d, map: toMap(m.x, m.y) };
    };
    svg.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      stopAnim();
      pts[ev.pointerId] = { x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY };
      if (list().length === 1) { moved = false; suppress = false; }
      begin();
    });
    window.addEventListener('pointermove', function (ev) {
      var p = pts[ev.pointerId]; if (!p || !start) return;
      p.x = ev.clientX; p.y = ev.clientY;
      if (!moved && Math.hypot(p.x - p.x0, p.y - p.y0) > 8) moved = true;
      if (!moved) return;
      var m = mid(list()), f = (start.d && m.d) ? m.d / start.d : 1;
      var w = start.view.w / f, h = start.view.h / f, r = svg.getBoundingClientRect();
      // the image point that was under the start midpoint goes under the current one
      setView({ x: start.map.x - (m.x - r.left) * w / r.width, y: start.map.y - (m.y - r.top) * h / r.height, w: w, h: h });
    });
    var end = function (ev) {
      if (!pts[ev.pointerId]) return;
      delete pts[ev.pointerId];
      if (moved) suppress = true;
      begin();
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    svg.addEventListener('click', function (ev) { if (suppress) { suppress = false; ev.stopPropagation(); ev.preventDefault(); } }, true);
    svg.addEventListener('dragstart', function (ev) { ev.preventDefault(); });
    svg.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var m = toMap(ev.clientX, ev.clientY);
      zoomAt(Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.002)), m.x, m.y);
    }, { passive: false });
    var lastW = window.innerWidth;
    window.addEventListener('resize', function () {   // width only: the phone's address bar hiding changes the height
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth; sizeMap(); applyView(clampView(view));
    });
  }

  // ---- map
  function draw() {
    var svg = $('map');
    svg.innerHTML = '';
    svg.setAttribute('aria-label', site.name + ' site map');
    svg.style.cursor = placing ? 'crosshair' : 'default';
    svg.appendChild(el('image', { href: site.image, x: 0, y: 0, width: site.imageW, height: site.imageH, preserveAspectRatio: 'none' }));

    if (layers.paths) (site.paths || []).forEach(function (p) {
      svg.appendChild(el('rect', { x: p.cx - p.len / 2, y: p.cy - p.w / 2, width: p.len, height: p.w, rx: 3, transform: rot(p.ang, p.cx, p.cy), fill: 'rgba(245,243,238,0.45)', stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 1.5 }));
    });

    site.plots.forEach(function (p) {
      var isSel = mode === 'plot' && selected === p.id;
      var g = el('g', { transform: rot(p.ang, p.cx, p.cy), style: 'cursor:pointer', role: 'button', tabindex: '0', 'aria-label': 'Plot ' + p.id });
      var r = el('rect', {
        x: p.cx - p.w / 2, y: p.cy - p.h / 2, width: p.w, height: p.h,
        fill: isSel ? 'rgba(255,224,102,0.35)' : 'rgba(0,0,0,0)',
        stroke: isSel ? '#FFE066' : (layers.outlines ? (p.kind === 'half' ? '#FFB020' : '#FFFFFF') : 'none'),
        'stroke-width': isSel ? 6 : 4, 'stroke-dasharray': (!isSel && p.kind === 'half') ? '14 10' : 'none', 'paint-order': 'stroke'
      });
      if (layers.outlines && !isSel) r.setAttribute('style', 'filter: drop-shadow(0 0 1px rgba(0,0,0,0.9))');
      g.appendChild(r);
      if (layers.numbers) g.appendChild(el('text', { x: p.cx, y: p.cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': p.kind === 'half' ? 34 : 42, 'font-weight': 700, 'font-family': 'system-ui, sans-serif', fill: '#FFFFFF', stroke: 'rgba(20,20,20,0.85)', 'stroke-width': 8, 'paint-order': 'stroke', 'stroke-linejoin': 'round' }, p.id));
      var pick = function (ev) {
        if (wantsTap()) { ev.stopPropagation(); if (ev.clientX != null) { if (mode === 'logjob') draft.near = p.id.toUpperCase(); placeAt(ev); } return; }
        if (selected === p.id) { var k = (site.recordName || site.name) + '|' + p.id.toUpperCase(); if (plotInfo[k] && plotInfo[k].state !== 'loading') delete plotInfo[k]; }
        if (selected !== p.id) cardOpen = null;
        selected = p.id; mode = 'plot'; draw();
      };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(ev); } });
      svg.appendChild(g);
    });

    (site.markers || []).forEach(function (m) {   // site.markers only; a site's markersDraft is never drawn
      var st = markerStyle[m.type] || markerStyle.gate;
      if (st.layer && !layers[st.layer]) return;
      svg.appendChild(pin(m.x, m.y, st.color, m.label, false, null));
    });

    if (showJobs()) allJobs().forEach(function (j) {
      var isSel = mode === 'job' && jobId === j.id;
      if (isSel && moving() && movePin) { svg.appendChild(pin(movePin.x, movePin.y, '#B45309', (j.code ? j.code + ' ' : '') + j.title, true, null)); return; }   // the pin on the move: no handler, so a tap on it reaches the map
      if (j.x == null) return;
      var g = pin(j.x, j.y, J.done(j) ? '#8E8C82' : '#B45309', (j.code ? j.code + ' ' : '') + j.title, isSel, function () { jobId = j.id; mode = 'job'; jobSub = 'view'; movePin = null; draw(); });
      svg.appendChild(g);
    });
    if (mode === 'logjob' && draft.x != null) svg.appendChild(pin(draft.x, draft.y, '#B45309', 'New job', true, null));


    drawPanel();
    $('jobsChip').setAttribute('aria-pressed', String(showJobs()));
    $('legend').innerHTML =
      '<span class="key"><span class="sw"></span>Full plot</span><span class="key"><span class="sw half"></span>Half plot</span>' +
      '<span class="key"><span class="sw sel"></span>Selected</span><span class="key"><span class="sw path"></span>Path</span>' +
      '<span class="key"><span class="dot" style="background:#B45309"></span>Job - tap for details</span>' +
      '<span class="key"><span class="dot" style="background:#7C4A1E"></span>Shed</span>' +
      '<span class="key"><span class="dot" style="background:#1D4ED8"></span>Tap or tank</span>' +
      (layers.paths ? '<span class="key"><span class="dot" style="background:#141413"></span>Gate</span>' : '');
    $('status').textContent = mode === 'logjob' ? (draft.x == null ? 'Tap the map where the job is.' : 'Pin placed. Tap the map again to move it.')
      : moving() ? (movePin ? 'Pin moved. Tap the map again to adjust it, or Save pin.' : 'Tap the map where the pin should be.') : site.status;
    $('credit').textContent = site.imageCredit + '. Demo for the committee - numbers only, no personal data.';
  }

  function pin(x, y, color, label, big, onClick) {
    var g = el('g', { style: onClick ? 'cursor:pointer' : '', role: onClick ? 'button' : null, tabindex: onClick ? '0' : null, 'aria-label': onClick ? label : null });
    if (big) g.appendChild(el('circle', { cx: x, cy: y, r: 22, fill: 'rgba(255,224,102,0.45)' }));
    g.appendChild(el('circle', { cx: x, cy: y, r: onClick ? 14 : 11, fill: color, stroke: '#FFFFFF', 'stroke-width': 3 }));
    var flip = x > site.imageW * 0.72;
    if (label.length > 34) label = label.slice(0, 32) + '...';
    g.appendChild(el('text', { x: flip ? x - 20 : x + 20, y: y, 'text-anchor': flip ? 'end' : 'start', 'dominant-baseline': 'central', 'font-size': 24, 'font-weight': 600, 'font-family': 'system-ui, sans-serif', fill: '#1A1A1A', stroke: '#FFFFFF', 'stroke-width': 7, 'paint-order': 'stroke', 'stroke-linejoin': 'round' }, label));
    if (onClick) { g.addEventListener('click', function (ev) { ev.stopPropagation(); if (wantsTap()) { placeAt(ev); return; } onClick(); }); g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onClick(); } }); }
    else g.setAttribute('pointer-events', 'none');
    return g;
  }

  // A tap on the map while placing: image px from the client point, the same conversion at any zoom or pan.
  function placeAt(ev) {
    var p = toMap(ev.clientX, ev.clientY), x = Math.round(p.x), y = Math.round(p.y);
    if (moving()) { movePin = { x: x, y: y }; draw(); return; }
    draft.x = x; draft.y = y;
    placing = false; draw();
  }

  // ---- panel
  function drawPanel() {
    var panel = $('card');
    if (mode === 'jobs') return drawJobs(panel);
    if (mode === 'job') return drawJob(panel);
    if (mode === 'logjob') return drawLogJob(panel);
    var p = site.plots.filter(function (x) { return x.id === selected; })[0];
    if (site.holding) {
      panel.innerHTML = '<div class="eyebrow">' + esc(site.name) + '</div><p class="empty">Satellite view only - no plots drawn for this area yet.</p>' +
        '<p class="note">What happens next: the site rep draws the plot outlines and numbers on the printed map, and Claude traces them in - as for the other sites. Jobs can be logged here already.</p>';
      return;
    }
    if (!p) {
      panel.innerHTML = '<div class="eyebrow">Plot card</div><p class="empty">Tap a plot on the map to see its card, or Jobs for the whole site.</p>' +
        '<p class="note">What the card will hold once the committee record is connected: holder, rent, last check, photos, flags, notes - all looked up by plot number, none of it stored on this page.</p>';
      return;
    }
    var full = site.plots.filter(function (x) { return x.kind === 'full'; }).length, half = site.plots.length - full;
    var siteName = site.recordName || site.name, plotNo = p.id.toUpperCase();
    var link = 'check.html?site=' + encodeURIComponent(siteName) + '&plot=' + encodeURIComponent(plotNo);
    panel.innerHTML =
      '<div class="eyebrow">' + esc(site.name) + ' <span class="pill' + (p.kind === 'half' ? ' half' : '') + '">' + (p.kind === 'half' ? 'Half plot' : 'Full plot') + '</span></div>' +
      '<h2>Plot ' + esc(p.id) + '</h2>' +
      '<a class="btn" href="' + link + '">Add / edit notes</a>' +
      checkDetails(siteName, plotNo) +
      '<p class="note">' + full + ' full and ' + half + ' half plots drawn on this site. Numbers are provisional until the site rep has walked it.</p>';
  }

  // The latest check, read from the sheet's Current tab: all of it for a rep key, the condition only for members.
  var REPS_ONLY = '<p class="note">Check details and photos show here for site reps and the committee. Open the planner from your own rep link once and this phone will remember it.</p>';
  var PW_ONLY = '<p class="note">You are in with the members&#39; password, which shows plot numbers only. Site reps and the committee: open your own rep link once on this phone or computer to see and edit the latest check.</p>';
  function checkDetails(siteName, plotNo) {
    if (!CONFIG.submitUrl) return REPS_ONLY;
    var k = siteName + '|' + plotNo, info = plotInfo[k];
    if (!info) { loadPlot(siteName, plotNo); return '<p class="empty">Loading the latest check...</p>'; }
    if (info.state === 'loading') return '<p class="empty">Loading the latest check...</p>';
    if (info.state === 'denied') return '<p class="note">This phone\'s rep link does not cover ' + esc(siteName) + ', or has been switched off.</p>';
    if (info.state === 'error') return '<p class="note">Could not load the latest check - no connection? Tap the plot again to retry.</p>';
    if (info.hidden) return PW_ONLY;
    var s = info.plot;
    if (!s) return '<p class="empty">No check on record yet.</p>';
    // Status pills (pills.js): tap one to see its words. Members see the colours only.
    var checked = 'Checked ' + (when(s.lastAt) || 'date unknown') + (s.lastBy ? ' by ' + esc(s.lastBy) : '');
    if (info.limited) return AGA_PILLS.view(s.items, cardOpen) + '<p class="sub">' + checked + '</p>';
    var flags = s.flags ? s.flags.split(', ') : [];
    return AGA_PILLS.view(s.items, cardOpen) +
      (flags.length ? '<div class="flagrow">' + flags.map(function (f) { return '<span class="flag">' + esc(f) + '</span>'; }).join('') + '</div>' : '') +
      (s.photo && s.photo.data ? '<img class="plotphoto" alt="Latest photo of plot ' + esc(plotNo) + '" src="data:image/jpeg;base64,' + s.photo.data + '">' : '') +
      (s.note ? '<p class="plotnote">' + esc(s.note) + '</p>' : '') +
      '<p class="sub">' + checked + '</p>';
  }
  function loadPlot(siteName, plotNo) {
    var k = siteName + '|' + plotNo;
    plotInfo[k] = { state: 'loading' };
    fetch(CONFIG.submitUrl + '?action=plot&site=' + encodeURIComponent(siteName) + '&plot=' + encodeURIComponent(plotNo) + AGA_GATE.auth())
      .then(function (r) { return r.json(); })
      .then(denied)
      .then(function (j) { plotInfo[k] = j && j.ok ? { state: 'ok', plot: j.plot, hidden: j.hidden, limited: j.limited } : { state: (j && (j.error === 'key' || j.error === 'site')) ? 'denied' : 'error' }; })
      .catch(function () { plotInfo[k] = { state: 'error' }; })
      .then(function () { if (mode === 'plot') drawPanel(); });
  }

  var statusPill = J.statusPill;

  function drawJobs(panel) {
    var jobs = allJobs();
    var open = jobs.filter(function (j) { return !J.done(j); });
    var closed = jobs.filter(J.done);
    var row = function (j) {
      return '<li><button type="button" class="jobrow" data-id="' + esc(j.id) + '">' +
        '<span class="jcode' + (J.done(j) ? ' grey' : '') + '">' + esc(j.code || '•') + '</span>' +
        '<span class="jtext"><span class="jtitle">' + esc(j.title) + '</span><span>' + statusPill(j.status) +
        (J.urgent(j) && !J.done(j) ? ' ' + J.pill('Urgent', 'st-urgent') : '') + (j.unsent ? ' ' + J.pill('Not sent yet', 'st-local') : '') + '</span></span></button></li>';
    };
    panel.innerHTML = '<div class="eyebrow">Jobs - ' + esc(site.name) + ', whole site</div>' +
      '<p class="sub">Things that need doing on the site, not on one plot. Tap one for details or to update it.</p>' +
      (open.length ? '<ol class="joblist">' + open.map(row).join('') + '</ol>' : '<p class="empty">No open jobs.</p>') +
      (closed.length ? '<div class="eyebrow" style="margin-top:14px">Done or not doing</div><ol class="joblist">' + closed.map(row).join('') + '</ol>' : '') +
      '<button type="button" class="btn" id="logjob2" style="margin-top:14px">Log a job</button>' +
      '<a class="btn ghost" href="jobs.html" style="margin-top:8px">Job board - all sites</a>' +
      (CONFIG.submitUrl ? '' : '<p class="note">Jobs logged here are saved on this phone only until the receiver is connected; then they go to the association sheet and everyone sees them.</p>');
    Array.prototype.forEach.call(panel.querySelectorAll('.jobrow'), function (b) { b.addEventListener('click', function () { jobId = b.getAttribute('data-id'); mode = 'job'; jobSub = 'view'; movePin = null; draw(); }); });
    $('logjob2').addEventListener('click', function () { mode = 'logjob'; draft = { x: null, y: null, photo: null }; draw(); });
  }

  // One job: its row as the committee keeps it, then "Edit this job" (the shared form, only changed fields are
  // sent) and "Move pin" (the next tap on the map, then Save pin sends x and y alone).
  function drawJob(panel) {
    var j = jobById(jobId);
    if (!j) {
      if (CONFIG.submitUrl && remoteJobs === null) { panel.innerHTML = '<p class="empty">Loading the job...</p>'; return; }
      mode = 'jobs'; return drawJobs(panel);
    }
    var head = '<button type="button" class="linkbtn" id="backJobs">&larr; All jobs</button>' +
      '<div class="eyebrow">Job ' + esc(j.code || '') + '</div><h2 class="jobh">' + esc(j.title) + '</h2>' +
      (notice && notice.id === j.id && jobSub === 'view' ? '<div class="jobmsg ok" role="status">' + esc(notice.text) + '</div>' : '');
    if (jobSub === 'move') {
      panel.innerHTML = head +
        '<p class="jobdetail">' + (movePin ? 'Pin moved. Tap the map again to adjust it, then Save pin.' : 'Tap the map where the pin should be. Anywhere on the map will do - it need not be on a plot.') + '</p>' +
        '<div class="jobacts"><button type="button" class="btn" id="pinSave"' + (movePin ? '' : ' disabled') + '>Save pin</button><button type="button" class="btn ghost" id="pinCancel">Cancel</button></div>' +
        '<div id="pinMsg" class="jobmsg hidden" role="status"></div>';
      $('backJobs').addEventListener('click', function () { jobSub = 'view'; movePin = null; mode = 'jobs'; draw(); });
      $('pinCancel').addEventListener('click', function () { jobSub = 'view'; movePin = null; draw(); });
      $('pinSave').addEventListener('click', function () {
        if (!movePin) return;
        var body = { kind: 'job-edit', id: j.id, site: siteName(), by: who(), x: movePin.x, y: movePin.y };
        $('pinSave').disabled = true; $('pinSave').textContent = 'Saving...';
        J.send(body, site.key).then(function (r) {
          if (r.ok) { notice = { id: j.id, text: r.queued ? J.savedText(r) : 'Pin saved.' }; jobSub = 'view'; movePin = null; draw(); if (!r.queued) loadRemote(); return; }
          $('pinSave').disabled = false; $('pinSave').textContent = 'Save pin';
          var m = $('pinMsg'); m.className = 'jobmsg err'; m.textContent = 'Not saved - the sheet did not accept it (' + r.error + '). Try again in a moment.';
        });
      });
      return;
    }
    if (jobSub === 'edit') {
      panel.innerHTML = head + J.editForm(j);
      $('backJobs').addEventListener('click', function () { jobSub = 'view'; mode = 'jobs'; draw(); });
      J.wireEditForm(panel, j, { by: who(), siteName: siteName(), siteKey: site.key,
        onCancel: function () { jobSub = 'view'; draw(); },
        onSaved: function (r) { notice = { id: j.id, text: J.savedText(r) }; jobSub = 'view'; draw(); if (!r.queued) loadRemote(); } });
      return;
    }
    var plotNear = j.near ? 'Near plot ' + esc(j.near) : (j.x != null ? 'Pinned on the map' : 'No pin yet');
    panel.innerHTML = head + J.fields(j) +
      '<p class="sub">' + plotNear + '. How soon: ' + esc(j.soon || 'not said') + '. Logged ' + esc(when(j.logged) || 'date unknown') + (j.by ? ' by ' + esc(j.by) : '') + '.</p>' +
      (j.unsent && CONFIG.submitUrl ? '<div class="jobmsg warn">A change to this job is waiting on this phone. <button type="button" class="linkbtn" id="sendNow" style="padding:0">Send it now</button></div>' : '') +
      '<div class="jobacts"><button type="button" class="btn" id="jobEditBtn">Edit this job</button><button type="button" class="btn ghost" id="jobMoveBtn">' + (j.x != null ? 'Move pin' : 'Put a pin on the map') + '</button></div>';
    $('backJobs').addEventListener('click', function () { mode = 'jobs'; notice = null; draw(); });
    $('jobEditBtn').addEventListener('click', function () { jobSub = 'edit'; notice = null; drawPanel(); });
    $('jobMoveBtn').addEventListener('click', function () { jobSub = 'move'; movePin = null; notice = null; draw(); });
    if ($('sendNow')) $('sendNow').addEventListener('click', function () {
      $('sendNow').disabled = true; $('sendNow').textContent = 'Sending...';
      J.flush(site.key).then(function (r) { notice = { id: j.id, text: r.sent ? 'Sent.' : r.errors.length ? 'The sheet did not accept it (' + r.errors[0] + ').' : 'Still no connection. It will try again later.' }; if (r.sent) loadRemote(); else draw(); });
    });
  }

  function drawLogJob(panel) {
    if ($('ljTitle')) { draft.title = $('ljTitle').value; draft.detail = $('ljDetail').value; draft.soon = $('ljSoon').value; draft.who = $('ljWho').value; if (draft.near === undefined) draft.near = $('ljNear').value; }
    var plotOpts = '<option value="">Not tied to a plot</option>' + site.plots.map(function (p) { var v = p.id.toUpperCase(); return '<option' + (draft.near === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
    panel.innerHTML =
      '<button type="button" class="linkbtn" id="cancelLog">&larr; Cancel</button>' +
      '<div class="eyebrow">Log a job - ' + esc(site.name) + '</div>' +
      '<form id="logf" class="updform">' +
      '<label>What needs doing<input type="text" id="ljTitle" placeholder="e.g. Hedge by the gate - cut back" required value="' + esc(draft.title || '') + '"></label>' +
      '<label>A bit more, if useful<input type="text" id="ljDetail" placeholder="Optional" value="' + esc(draft.detail || '') + '"></label>' +
      '<label>How soon<select id="ljSoon">' + SOON.map(function (s) { return '<option' + ((draft.soon || 'This season') === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label>' +
      '<label>Where<select id="ljNear">' + plotOpts + '</select></label>' +
      '<button type="button" class="btn ghost" id="ljPlace">' + (draft.x != null ? 'Pin placed - tap the map to move it' : 'Tap the map to place the pin') + '</button>' +
      '<label>Photo (optional)<input type="file" id="ljPhoto" accept="image/*"></label><span id="ljPhotoNote" class="sub"></span>' +
      '<label>Your name<input type="text" id="ljWho" value="' + esc(draft.who != null ? draft.who : who()) + '" placeholder="Who is logging it"></label>' +
      '<button type="submit" class="btn">Save job</button><div id="ljMsg" class="msg hidden" role="status"></div></form>';
    $('cancelLog').addEventListener('click', function () { mode = 'jobs'; placing = false; draw(); });
    $('ljPlace').addEventListener('click', function () { placing = true; draw(); });
    $('ljNear').addEventListener('change', function () { draft.near = $('ljNear').value; });
    $('ljPhoto').addEventListener('change', function () {
      var f = $('ljPhoto').files[0]; if (!f) return;
      $('ljPhotoNote').textContent = 'Preparing photo...';
      shrink(f, function (p) { draft.photo = p; $('ljPhotoNote').textContent = p ? 'Photo ready.' : 'Could not read that photo.'; });
    });
    $('logf').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var title = $('ljTitle').value.trim(), by = $('ljWho').value.trim();
      if (!title) { msg('ljMsg', 'err', 'Say what needs doing.'); return; }
      if (!by) { msg('ljMsg', 'err', 'Put your name so the record shows who logged it.'); return; }
      store('who', by);
      var n = allJobs().length + 1;
      var j = { id: 'J-' + Date.now().toString(36), code: 'J' + n, title: title, detail: $('ljDetail').value.trim(), soon: $('ljSoon').value,
        near: $('ljNear').value, x: draft.x, y: draft.y, by: by, logged: new Date().toISOString(), status: 'Pending', money: 'No' };
      var body = Object.assign({ kind: 'job', site: site.recordName || site.name, photo: draft.photo ? draft.photo.base64 : '', photoType: 'image/jpeg' }, j);
      var save = $('logf').querySelector('button[type=submit]');
      save.disabled = true; save.textContent = 'Saving...';
      post(body).then(function (r) {
        if (!CONFIG.submitUrl || (r && r.ok)) {
          if (r && r.photo) j.photo = r.photo;
          saveLocal('jobs', j);
          jobId = j.id; mode = 'job'; jobSub = 'view'; placing = false;
          notice = { id: j.id, text: (CONFIG.submitUrl ? 'Job saved.' : 'Job saved on this phone.') + ' Thank you.' };
          draw();
          return;
        }
        save.disabled = false; save.textContent = 'Save job';
        msg('ljMsg', 'err', 'Not saved - no connection, or the planner could not reach the sheet. Try again in a moment.');
      });
    });
  }


  function msg(id, kind, text) { var m = $(id); m.className = 'msg ' + kind; m.textContent = text; }

  function shrink(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, 1280 / Math.max(img.width, img.height));   // same as check.js: about 150 KB a photo
        var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var dataUrl = c.toDataURL('image/jpeg', 0.78);
        cb({ base64: dataUrl.split(',')[1], dataUrl: dataUrl });
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  if (site) {
    // ?site=<record name> picks the site; ?plot=<id> opens that plot's card zoomed to about 3x on it;
    // ?job=<id> (from the job board) opens that job, zoomed on its pin.
    var q = new URLSearchParams(location.search), qSite = q.get('site'), qPlot = q.get('plot'), qJob = q.get('job');
    if (qSite) {
      var match = sites.filter(function (s) { return [s.recordName, s.name, s.key].some(function (n) { return n && n.toLowerCase() === qSite.trim().toLowerCase(); }); })[0];
      if (match) site = match;
    }
    buildControls();
    $('site').value = String(sites.indexOf(site));
    sizeMap(); goToView(0, false);
    if (qPlot) {
      var want = site.plots.filter(function (p) { return p.id.toLowerCase() === qPlot.trim().toLowerCase(); })[0];
      if (want) { selected = want.id; var whole = fitWhole(); setView({ x: want.cx - whole.w / 6, y: want.cy - whole.h / 6, w: whole.w / 3, h: whole.h / 3 }); }
    }
    if (qJob) { wantJob = qJob.trim(); mode = 'job'; jobId = wantJob; openWantedJob(); }
    draw(); loadRemote(); sendWaiting();
  }
})();
