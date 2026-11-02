/* Job board: every site's jobs on one page, the row as the committee keeps it (22-site-jobs-process.md):
   Ref, Site, Job, Status, Who, Money, Blocked by, Expected by, Latest, Logged, Urgent. Tap a row for the
   detail and photo, a link to the pin on the map, and the same edit form as the map (jobedit.js), which sends
   one job-edit message with only the fields that changed. Reads ?action=jobs with no site, and lays over it
   the jobs and edits still waiting on this phone ("Not sent yet"). Prints on A4 landscape: Pending first,
   urgent at the top, grouped by site, with the date printed. Behind the members' password (gate.js). */
(function () {
  var CONFIG = window.PLANNER_CONFIG || {};
  var SITES = window.PLANNER_SITES || [];
  var J = window.AGA_JOBS;
  var ORDER = ['Bromyard', 'Chestnuts', 'Perryn', 'The Vale'];
  var RANK = { 'Pending': 0, 'Arranged': 1, 'Done': 2, 'Not doing': 3 };

  var remote = null;        // jobs from the sheet
  var jobs = [];            // merged: sheet plus this phone
  var open = null;          // id of the job whose detail and edit form are showing
  var showDone = false;
  var loadState = CONFIG.submitUrl ? 'loading' : 'none';
  var notice = null;        // { id, text } shown under that job after a save

  var $ = function (id) { return document.getElementById(id); };
  var esc = J.esc;
  var store = function (k) { try { return JSON.parse(localStorage.getItem('aga-' + k) || 'null'); } catch (e) { return null; } };
  var who = function () { return store('who') || ''; };   // the name the map's forms remember, same key
  // A rep link (?key=...) opened on this page: keep the key as the map does, so the phone stays in.
  (function () { var q = new URLSearchParams(location.search), k = q.get('key'); if (k) { try { localStorage.setItem('aga-key', JSON.stringify(k)); } catch (e) {} q.delete('key'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); } })();

  // ---- the list: seeds from data/sites.js, jobs logged on this phone, then the sheet (which wins by id),
  // then any edit still waiting on this phone (jobedit.js marks those unsent).
  function merge() {
    var byId = {}, bySite = {};
    SITES.forEach(function (s) {
      var name = s.recordName || s.name;
      (s.jobs || []).forEach(function (j) { byId[j.id] = Object.assign({ site: name }, j); });
      (store('jobs-' + s.key) || []).forEach(function (j) { byId[j.id] = Object.assign({ site: name }, byId[j.id] || {}, j); });
    });
    (remote || []).forEach(function (j) { byId[j.id] = Object.assign({}, byId[j.id] || {}, j); });
    Object.keys(byId).forEach(function (id) { var j = byId[id]; (bySite[j.site] = bySite[j.site] || []).push(j); });
    var out = [];
    Object.keys(bySite).forEach(function (name) { out = out.concat(J.mergeEdits(bySite[name], J.siteKey(name))); });
    return out;
  }

  function load() {
    if (!CONFIG.submitUrl) { jobs = merge(); draw(); return; }
    loadState = 'loading'; drawStatus();
    fetch(CONFIG.submitUrl + '?action=jobs' + AGA_GATE.auth())
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.error === 'password') AGA_GATE.relock(); return j; })
      .then(function (j) { if (j && j.ok) { remote = j.jobs || []; loadState = 'ok'; SITES.forEach(function (s) { J.forget(s.key); }); } else loadState = 'error'; })
      .catch(function () { loadState = 'error'; })
      .then(function () { jobs = merge(); draw(); });
  }
  // Edits that waited on this phone, any site: send them, then read the sheet back.
  function sendWaiting() {
    if (!CONFIG.submitUrl || navigator.onLine === false) return;
    var keys = SITES.map(function (s) { return s.key; }).filter(function (k) { return J.queued(k).length; });
    if (!keys.length) return;
    var sent = 0;
    (function next() {
      if (!keys.length) { if (sent) load(); return; }
      J.flush(keys.shift()).then(function (r) { sent += r.sent; next(); });
    })();
  }

  // ---- drawing
  function tile(cls, n, label) { return '<div class="tile ' + cls + '"><div class="n">' + esc(n) + '</div><div class="l">' + esc(label) + '</div></div>'; }
  // Pending first, urgent at the top, then by date logged.
  function sortJobs(list) {
    return list.slice().sort(function (a, b) {
      if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status];
      if (J.urgent(a) !== J.urgent(b)) return J.urgent(a) ? -1 : 1;
      return (a.logged || '') < (b.logged || '') ? -1 : 1;
    });
  }
  function siteOrder(a, b) {
    var ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
    if (ia < 0) ia = ORDER.length; if (ib < 0) ib = ORDER.length;
    return ia !== ib ? ia - ib : (a < b ? -1 : 1);
  }
  function counts() {
    var live = jobs.filter(function (j) { return !J.done(j); });
    return {
      pending: jobs.filter(function (j) { return j.status === 'Pending'; }).length,
      urgent: live.filter(J.urgent).length,
      money: live.filter(function (j) { return j.money === 'Needs approval'; }).length,
      blocked: live.filter(function (j) { return !!j.blockedBy; }).length
    };
  }

  function drawStatus() {
    var s = $('status');
    if (!CONFIG.submitUrl) s.textContent = 'Not connected yet: the receiver is not set up, so this shows the seeded jobs and any saved on this phone. Changes are kept on this phone.';
    else if (loadState === 'loading') s.textContent = 'Loading jobs from the sheet...';
    else if (loadState === 'error') s.textContent = 'Could not load the jobs from the sheet - no connection? Showing what this phone has. Reload to try again.';
    else s.textContent = '';
  }

  function draw() {
    drawStatus();
    var c = counts();
    $('tiles').innerHTML =
      tile(c.pending ? 'warn' : 'good', c.pending, 'pending') +
      tile(c.urgent ? 'bad' : 'good', c.urgent, 'urgent - someone could get hurt') +
      tile(c.money ? 'info' : 'good', c.money, 'need money approval') +
      tile(c.blocked ? 'warn' : 'good', c.blocked, 'blocked');
    $('printline').textContent = 'Site jobs - printed ' + J.today() + '. Pending ' + c.pending + ', urgent ' + c.urgent + ', need money approval ' + c.money + ', blocked ' + c.blocked + (showDone ? '. Finished jobs included.' : '.');

    var board = $('board');
    if (!jobs.length) {
      board.innerHTML = '<p class="empty">No jobs logged yet. <a href="index.html">Log a job on the map</a>.</p>';
      return;
    }
    var shown = showDone ? jobs : jobs.filter(function (j) { return !J.done(j); });
    if (!shown.length) {
      board.innerHTML = '<p class="empty">No open jobs. Tick "Show finished" to see the ' + jobs.length + ' finished one' + (jobs.length > 1 ? 's' : '') + '.</p>';
      return;
    }
    var sites = {};
    shown.forEach(function (j) { (sites[j.site || 'Site not given'] = sites[j.site || 'Site not given'] || []).push(j); });
    var html = '<table><thead><tr><th>Ref</th><th>Site</th><th>Job</th><th>Status</th><th>Who</th><th>Money</th><th>Blocked by</th><th>Expected by</th><th>Latest</th><th>Logged</th><th>Urgent</th></tr></thead><tbody>';
    Object.keys(sites).sort(siteOrder).forEach(function (name) {
      html += '<tr class="site"><th colspan="11">' + esc(name) + '</th></tr>';
      sortJobs(sites[name]).forEach(function (j) { html += row(j); if (open === j.id) html += '<tr class="more"><td colspan="11">' + moreBox(j) + '</td></tr>'; });
    });
    board.innerHTML = html + '</tbody></table>';
    Array.prototype.forEach.call(board.querySelectorAll('tr.job'), function (tr) {
      tr.addEventListener('click', function (ev) { if (ev.target.closest('a')) return; toggle(tr.getAttribute('data-id')); });
      tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(tr.getAttribute('data-id')); } });
    });
    if (open) wireMore();
  }

  function cell(cls, label, html, blank) { return '<td class="' + cls + (blank ? ' blank' : '') + '" data-label="' + label + '">' + html + '</td>'; }
  function row(j) {
    var pills = J.statusPill(j.status) + (j.unsent ? ' ' + J.pill('Not sent yet', 'st-local') : '');
    var urgent = J.urgent(j);
    return '<tr class="job ' + (J.done(j) ? 'finished' : 'open') + (open === j.id ? ' open' : '') + '" data-id="' + esc(j.id) + '" tabindex="0" role="button" aria-expanded="' + (open === j.id) + '" aria-label="' + esc((j.code || '') + ' ' + j.title) + ', tap for detail and to edit">' +
      cell('ref', 'Ref', esc(j.code || '-')) +
      cell('', 'Site', esc(j.site || '-')) +
      cell('what', 'Job', '<span class="code">' + esc(j.code || '') + '</span>' + esc(j.title)) +
      cell('', 'Status', '<span class="pills">' + pills + '</span>') +
      cell('', 'Who', esc(j.who || '-')) +
      cell('', 'Money', esc(j.money || 'No')) +
      cell('', 'Blocked by', esc(j.blockedBy || '-'), !j.blockedBy) +
      cell('', 'Expected by', esc(j.expectedBy || '-'), !j.expectedBy) +
      cell('latest', 'Latest', esc(j.latest || '-'), !j.latest) +
      cell('', 'Logged', esc(J.when(j.logged) || '-')) +
      cell('', 'Urgent', urgent ? (J.done(j) ? 'Yes' : J.pill('Yes', 'st-urgent')) : 'No') +
      '</tr>';
  }

  // ---- under the row: detail, photo, the map link and the edit form
  function toggle(id) { open = open === id ? null : id; draw(); }
  function moreBox(j) {
    var mapHref = 'index.html?site=' + encodeURIComponent(j.site || '') + '&job=' + encodeURIComponent(j.id);
    return '<div class="morebox"><h2>' + esc((j.code ? j.code + ' - ' : '') + j.title) + '</h2>' +
      '<p class="sub" style="margin:0 0 6px">' + esc(j.site || '') + (j.near ? ', near plot ' + esc(j.near) : '') + '. How soon: ' + esc(j.soon || 'not said') + '. Logged ' + esc(J.when(j.logged) || 'date unknown') + (j.by ? ' by ' + esc(j.by) : '') + '.</p>' +
      (j.detail ? '<p class="jobdetail">' + esc(j.detail) + '</p>' : '<p class="jobdetail sub">No detail yet.</p>') +
      (j.photoLocal ? '<img class="jobphoto" alt="Photo of this job, not sent yet" src="' + j.photoLocal + '">' :
        j.photo ? '<p class="jobdetail"><a href="' + esc(j.photo) + '" target="_blank" rel="noopener">Open the photo</a></p>' : '<p class="jobdetail sub">No photo yet.</p>') +
      (notice && notice.id === j.id ? '<div class="jobmsg ok" role="status">' + esc(notice.text) + '</div>' : '') +
      '<p class="maplink"><a href="' + mapHref + '">' + (j.x != null ? 'Move the pin on the map' : 'Put a pin on the map') + '</a></p>' +
      '<div class="eyebrow">Edit this job</div>' + J.editForm(j) + '</div>';
  }
  function wireMore() {
    var j = jobs.filter(function (x) { return x.id === open; })[0]; if (!j) return;
    J.wireEditForm($('board'), j, { by: who(), siteName: j.site, siteKey: J.siteKey(j.site),
      onCancel: function () { open = null; draw(); },
      onSaved: function (r) { notice = { id: j.id, text: J.savedText(r) }; if (r.queued) { jobs = merge(); draw(); } else load(); } });
  }

  $('showDone').addEventListener('change', function () { showDone = $('showDone').checked; draw(); });
  $('print').addEventListener('click', function () { window.print(); });
  jobs = merge(); draw(); load(); sendWaiting();
})();
