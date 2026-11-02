/* Plot planner: draws one site's map from data/sites.js. The right-hand panel shows whatever was
   last tapped: a plot (with "Add / edit notes"), the site's jobs, one job (with a status update),
   or the "Log a job" form. Jobs are kept on this phone until the receiver is connected, then they
   go to the association's sheet and are read back from it. No frameworks, no personal data.
   The plot card shows the plot's latest check (the sheet's Current tab) only to someone whose phone
   holds a rep key, from opening a rep link (?key=...) once. With the members' password (gate.js) it shows
   the plot's condition only, and only if the committee has switched that on in the sheet's Settings tab. */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var sites = window.PLANNER_SITES || [];
  var CONFIG = window.PLANNER_CONFIG || {};
  var REPS = window.PLANNER_REPS || [];
  var layers = { paths: true, outlines: true, numbers: true, sheds: true, water: true, jobs: true };
  var layerNames = { paths: 'Paths', outlines: 'Plot outlines', numbers: 'Plot numbers', sheds: 'Sheds', water: 'Water' };
  var markerStyle = {
    shed: { color: '#7C4A1E', layer: 'sheds' },
    tap:  { color: '#1D4ED8', layer: 'water' },
    tank: { color: '#1D4ED8', layer: 'water' },
    gate: { color: '#141413', layer: null }
  };
  var STATUSES = ['Logged', 'Needs approval at the next committee meeting', 'Approved - waiting to be done', 'Done', 'Not doing'];
  var STATUS_STYLE = { 'Logged': 'st-logged', 'Needs approval at the next committee meeting': 'st-approval', 'Approved - waiting to be done': 'st-approved', 'Done': 'st-done', 'Not doing': 'st-no' };
  var SOON = ['Now - someone could get hurt', 'This season', 'Next work morning', 'Just noting it'];

  var site = sites[0];
  var mode = 'plot';        // plot | jobs | job | logjob
  var selected = null;      // plot id
  var jobId = null;         // selected job id
  var placing = false;      // log-a-job: next tap on the map places the pin
  var draft = { x: null, y: null, photo: null };
  var remoteJobs = null;

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

  // ---- jobs: seed from the data file, plus this phone's additions, plus the sheet when connected
  function allJobs() {
    var byId = {};
    (site.jobs || []).forEach(function (j) { byId[j.id] = Object.assign({ status: 'Logged', updates: [] }, j); });
    (store('jobs-' + site.key) || []).forEach(function (j) { byId[j.id] = Object.assign({ status: 'Logged', updates: [] }, byId[j.id] || {}, j); });
    (remoteJobs || []).forEach(function (j) { byId[j.id] = Object.assign({ status: 'Logged', updates: [] }, byId[j.id] || {}, j); });
    (store('updates-' + site.key) || []).forEach(function (u) {
      var j = byId[u.id]; if (!j) return;
      if (!j.updates.some(function (x) { return x.at === u.at; })) { j.updates = j.updates.concat([u]); }
    });
    return Object.keys(byId).map(function (k) {
      var j = byId[k];
      j.updates = (j.updates || []).slice().sort(function (a, b) { return a.at < b.at ? -1 : 1; });
      if (j.updates.length) j.status = j.updates[j.updates.length - 1].status || j.status;
      return j;
    }).sort(function (a, b) { return (a.logged || '') < (b.logged || '') ? -1 : 1; });
  }
  function saveLocal(key, item) { var list = store(key + '-' + site.key) || []; list.push(item); store(key + '-' + site.key, list); }
  function denied(j) { if (j && j.error === 'password') AGA_GATE.relock(); return j; }
  function post(body) {
    if (!CONFIG.submitUrl) return Promise.resolve({ ok: false, offline: true });
    body = Object.assign({ pw: AGA_GATE.pw() }, body);
    return fetch(CONFIG.submitUrl, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(denied).catch(function () { return { ok: false }; });
  }
  function loadRemote() {
    if (!CONFIG.submitUrl) return;
    fetch(CONFIG.submitUrl + '?action=jobs&site=' + encodeURIComponent(site.recordName || site.name) + AGA_GATE.auth())
      .then(function (r) { return r.json(); })
      .then(denied)
      .then(function (j) { if (j && j.ok) { remoteJobs = j.jobs || []; draw(); } })
      .catch(function () {});
  }

  // ---- controls
  function buildControls() {
    $('map').addEventListener('click', function (ev) { if (placing || mode === 'logjob') placeAt(ev); });
    $('card').addEventListener('click', function (ev) {
      var b = ev.target.closest('.pst'); if (!b) return;
      var n = b.getAttribute('data-item'); cardOpen = cardOpen === n ? null : n; drawPanel();
    });
    var sel = $('site');
    sel.innerHTML = '';
    sites.forEach(function (s, i) { var o = document.createElement('option'); o.value = i; o.textContent = s.name + (s.holding ? ' (no plots yet)' : ''); sel.appendChild(o); });
    sel.addEventListener('change', function () { site = sites[+sel.value]; selected = null; jobId = null; mode = 'plot'; remoteJobs = null; loadRemote(); draw(); });

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
    jb.addEventListener('click', function () { layers.jobs = true; mode = (mode === 'jobs') ? 'plot' : 'jobs'; placing = false; draw(); });
    chips.appendChild(jb);
    $('logjob').addEventListener('click', function () { mode = 'logjob'; layers.jobs = true; placing = false; draft = { x: null, y: null, photo: null }; draw(); });
  }

  // ---- map
  function draw() {
    var svg = $('map');
    svg.innerHTML = '';
    svg.setAttribute('viewBox', '0 0 ' + site.imageW + ' ' + site.imageH);
    svg.setAttribute('aria-label', site.name + ' site map');
    svg.style.cursor = placing ? 'crosshair' : 'default';
    svg.appendChild(el('image', { href: site.image, x: 0, y: 0, width: site.imageW, height: site.imageH, preserveAspectRatio: 'none' }));

    if (layers.paths) site.paths.forEach(function (p) {
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
        if (placing || mode === 'logjob') { ev.stopPropagation(); if (ev.clientX != null) { draft.near = p.id.toUpperCase(); placeAt(ev); } return; }
        if (selected === p.id) { var k = (site.recordName || site.name) + '|' + p.id.toUpperCase(); if (plotInfo[k] && plotInfo[k].state !== 'loading') delete plotInfo[k]; }
        if (selected !== p.id) cardOpen = null;
        selected = p.id; mode = 'plot'; draw();
      };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(ev); } });
      svg.appendChild(g);
    });

    site.markers.forEach(function (m) {
      var st = markerStyle[m.type] || markerStyle.gate;
      if (st.layer && !layers[st.layer]) return;
      svg.appendChild(pin(m.x, m.y, st.color, m.label, false, null));
    });

    if (layers.jobs) allJobs().forEach(function (j) {
      if (j.x == null) return;
      var done = j.status === 'Done' || j.status === 'Not doing';
      var g = pin(j.x, j.y, done ? '#8E8C82' : '#B45309', (j.code ? j.code + ' ' : '') + j.title, mode === 'job' && jobId === j.id, function () { jobId = j.id; mode = 'job'; draw(); });
      svg.appendChild(g);
    });
    if (mode === 'logjob' && draft.x != null) svg.appendChild(pin(draft.x, draft.y, '#B45309', 'New job', true, null));


    drawPanel();
    $('jobsChip').setAttribute('aria-pressed', String(mode === 'jobs'));
    $('legend').innerHTML =
      '<span class="key"><span class="sw"></span>Full plot</span><span class="key"><span class="sw half"></span>Half plot</span>' +
      '<span class="key"><span class="sw sel"></span>Selected</span><span class="key"><span class="sw path"></span>Path</span>' +
      '<span class="key"><span class="dot" style="background:#B45309"></span>Job - tap for details</span>' +
      '<span class="key"><span class="dot" style="background:#7C4A1E"></span>Shed</span>' +
      '<span class="key"><span class="dot" style="background:#1D4ED8"></span>Tap or tank</span>' +
      '<span class="key"><span class="dot" style="background:#141413"></span>Gate</span>';
    $('status').textContent = mode === 'logjob' ? (draft.x == null ? 'Tap the map where the job is.' : 'Pin placed. Tap the map again to move it.') : site.status;
    $('credit').textContent = site.imageCredit + '. Demo for the committee - numbers only, no personal data.';
  }

  function pin(x, y, color, label, big, onClick) {
    var g = el('g', { style: onClick ? 'cursor:pointer' : '', role: onClick ? 'button' : null, tabindex: onClick ? '0' : null, 'aria-label': onClick ? label : null });
    if (big) g.appendChild(el('circle', { cx: x, cy: y, r: 22, fill: 'rgba(255,224,102,0.45)' }));
    g.appendChild(el('circle', { cx: x, cy: y, r: onClick ? 14 : 11, fill: color, stroke: '#FFFFFF', 'stroke-width': 3 }));
    var flip = x > site.imageW * 0.72;
    if (label.length > 34) label = label.slice(0, 32) + '...';
    g.appendChild(el('text', { x: flip ? x - 20 : x + 20, y: y, 'text-anchor': flip ? 'end' : 'start', 'dominant-baseline': 'central', 'font-size': 24, 'font-weight': 600, 'font-family': 'system-ui, sans-serif', fill: '#1A1A1A', stroke: '#FFFFFF', 'stroke-width': 7, 'paint-order': 'stroke', 'stroke-linejoin': 'round' }, label));
    if (onClick) { g.addEventListener('click', function (ev) { ev.stopPropagation(); if (placing || mode === 'logjob') { placeAt(ev); return; } onClick(); }); g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onClick(); } }); }
    else g.setAttribute('pointer-events', 'none');
    return g;
  }

  function placeAt(ev) {
    var svg = $('map'), r = svg.getBoundingClientRect();
    draft.x = Math.round((ev.clientX - r.left) * site.imageW / r.width);
    draft.y = Math.round((ev.clientY - r.top) * site.imageH / r.height);
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
        '<p class="note">What happens next: Claire walks it with the rep, draws the outlines on the printed map, and Claude traces them in - as for Bromyard. Which site this is on the record (and so which rep) is being confirmed. Jobs can be logged here already.</p>';
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

  function statusPill(s) { return '<span class="st ' + (STATUS_STYLE[s] || 'st-logged') + '">' + esc(s) + '</span>'; }

  function drawJobs(panel) {
    var jobs = allJobs();
    var open = jobs.filter(function (j) { return j.status !== 'Done' && j.status !== 'Not doing'; });
    var closed = jobs.filter(function (j) { return j.status === 'Done' || j.status === 'Not doing'; });
    var row = function (j) {
      return '<li><button type="button" class="jobrow" data-id="' + esc(j.id) + '">' +
        '<span class="jcode' + ((j.status === 'Done' || j.status === 'Not doing') ? ' grey' : '') + '">' + esc(j.code || '•') + '</span>' +
        '<span class="jtext"><span class="jtitle">' + esc(j.title) + '</span>' + statusPill(j.status) + '</span></button></li>';
    };
    panel.innerHTML = '<div class="eyebrow">Jobs - ' + esc(site.name) + ', whole site</div>' +
      '<p class="sub">Things that need doing on the site, not on one plot. Tap one for details or to update it.</p>' +
      (open.length ? '<ol class="joblist">' + open.map(row).join('') + '</ol>' : '<p class="empty">No open jobs.</p>') +
      (closed.length ? '<div class="eyebrow" style="margin-top:14px">Done or dropped</div><ol class="joblist">' + closed.map(row).join('') + '</ol>' : '') +
      '<button type="button" class="btn" id="logjob2" style="margin-top:14px">Log a job</button>' +
      (CONFIG.submitUrl ? '' : '<p class="note">Jobs logged here are saved on this phone only until the receiver is connected; then they go to the association sheet and everyone sees them.</p>');
    Array.prototype.forEach.call(panel.querySelectorAll('.jobrow'), function (b) { b.addEventListener('click', function () { jobId = b.getAttribute('data-id'); mode = 'job'; draw(); }); });
    $('logjob2').addEventListener('click', function () { mode = 'logjob'; draft = { x: null, y: null, photo: null }; draw(); });
  }

  function drawJob(panel) {
    var j = allJobs().filter(function (x) { return x.id === jobId; })[0];
    if (!j) { mode = 'jobs'; return drawJobs(panel); }
    var plotNear = j.near ? 'Near plot ' + esc(j.near) : (j.x != null ? 'Pinned on the map' : 'Not placed');
    panel.innerHTML =
      '<button type="button" class="linkbtn" id="backJobs">&larr; All jobs</button>' +
      '<div class="eyebrow">Job ' + esc(j.code || '') + ' ' + statusPill(j.status) + '</div>' +
      '<h2 class="jobh">' + esc(j.title) + '</h2>' +
      (j.detail ? '<p>' + esc(j.detail) + '</p>' : '') +
      '<dl><div><dt>Where</dt><dd>' + plotNear + '</dd></div><div><dt>How soon</dt><dd>' + esc(j.soon || 'Not said') + '</dd></div>' +
      '<div><dt>Logged</dt><dd>' + esc((j.by ? j.by + ', ' : '') + (when(j.logged) || 'date unknown')) + '</dd></div>' +
      '<div><dt>Photo</dt><dd>' + (j.photo ? '<a href="' + esc(j.photo) + '" target="_blank" rel="noopener">Open</a>' : 'None') + '</dd></div></dl>' +
      (j.updates && j.updates.length ? '<div class="eyebrow">Updates</div><ul class="updates">' + j.updates.map(function (u) {
        return '<li><span class="sub">' + esc(when(u.at)) + (u.by ? ' - ' + esc(u.by) : '') + '</span> ' + statusPill(u.status) + (u.note ? '<div>' + esc(u.note) + '</div>' : '') + '</li>';
      }).join('') + '</ul>' : '') +
      '<form id="upd" class="updform"><div class="eyebrow">Update this job</div>' +
      '<label>Status<select id="updStatus">' + STATUSES.map(function (s) { return '<option' + (s === j.status ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label>' +
      '<label>Note (optional)<input type="text" id="updNote" placeholder="e.g. done on the Nov work morning"></label>' +
      '<label>Your name<input type="text" id="updWho" value="' + esc(who()) + '" placeholder="Who is updating"></label>' +
      '<button type="submit" class="btn" id="updSave">Save update</button><div id="updMsg" class="msg hidden" role="status"></div>' +
      '<button type="button" class="btn ghost hidden" id="updBack">&larr; Back to all jobs</button></form>';
    $('backJobs').addEventListener('click', function () { mode = 'jobs'; draw(); });
    $('upd').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var by = $('updWho').value.trim(); if (!by) { msg('updMsg', 'err', 'Put your name so the record shows who updated it.'); return; }
      store('who', by);
      var u = { id: j.id, at: new Date().toISOString(), by: by, status: $('updStatus').value, note: $('updNote').value.trim() };
      $('updSave').disabled = true; $('updSave').textContent = 'Saving...';
      post(Object.assign({ kind: 'job-status', site: site.recordName || site.name }, u)).then(function (r) {
        if (r && r.ok) { saveLocal('updates', u); draw(); afterSaved('Saved: ' + u.status + '.'); return; }
        $('updSave').disabled = false; $('updSave').textContent = 'Save update';
        msg('updMsg', 'err', 'Not saved - no connection, or the planner could not reach the sheet. Try again in a moment.');
      });
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
      '<label>How soon<select id="ljSoon">' + SOON.map(function (s) { return '<option' + (draft.soon === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label>' +
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
        near: $('ljNear').value, x: draft.x, y: draft.y, by: by, logged: new Date().toISOString(), status: 'Logged', updates: [] };
      var body = Object.assign({ kind: 'job', site: site.recordName || site.name, photo: draft.photo ? draft.photo.base64 : '', photoType: 'image/jpeg' }, j);
      var save = $('logf').querySelector('button[type=submit]');
      save.disabled = true; save.textContent = 'Saving...';
      post(body).then(function (r) {
        if (!CONFIG.submitUrl || (r && r.ok)) {
          if (r && r.photo) j.photo = r.photo;
          saveLocal('jobs', j);
          jobId = j.id; mode = 'job'; placing = false; draw();
          afterSaved(CONFIG.submitUrl ? 'Job saved.' : 'Job saved on this phone.');
          return;
        }
        save.disabled = false; save.textContent = 'Save job';
        msg('ljMsg', 'err', 'Not saved - no connection, or the planner could not reach the sheet. Try again in a moment.');
      });
    });
  }

  // After a job or update is saved: a green confirmation and a way back to the list, in place of the form.
  function afterSaved(text) {
    msg('updMsg', 'ok', text + ' Thank you.');
    $('upd').querySelectorAll('label, #updSave').forEach(function (e) { e.classList.add('hidden'); });
    $('updBack').classList.remove('hidden');
    $('updBack').addEventListener('click', function () { mode = 'jobs'; draw(); });
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

  if (site) { buildControls(); draw(); loadRemote(); }
})();
