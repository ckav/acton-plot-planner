/* Site dashboard: what a rep needs to do on their site, at a glance, from counts only.
   Rent, email and phone counts come from data/dashboard.js (made from the committee record, numbers
   only). Jobs come from the same place the map uses. "Which plots" is deliberately not here: that
   list is personal and comes from the rep's private link once the receiver is connected. */
(function () {
  var DASH = window.PLANNER_DASHBOARD || { sites: {} };
  var SITES = window.PLANNER_SITES || [];
  var PLOTS = window.PLANNER_PLOTS || {};
  var REPS = window.PLANNER_REPS || [];
  var CONFIG = window.PLANNER_CONFIG || {};
  var ORDER = ['Bromyard', 'Chestnuts', 'Perryn', 'The Vale'];
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var store = function (k) { try { return JSON.parse(localStorage.getItem('aga-' + k) || 'null'); } catch (e) { return null; } };

  function jobsFor(site) {
    var s = SITES.filter(function (x) { return (x.recordName || x.name) === site; })[0];
    if (!s) return [];
    var byId = {};
    (s.jobs || []).forEach(function (j) { byId[j.id] = Object.assign({ status: 'Logged' }, j); });
    (store('jobs-' + s.key) || []).forEach(function (j) { byId[j.id] = Object.assign({ status: 'Logged' }, byId[j.id] || {}, j); });
    var ups = (store('updates-' + s.key) || []).slice().sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    ups.forEach(function (u) { if (byId[u.id]) byId[u.id].status = u.status; });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }

  function counts(site) {
    var d = DASH.sites[site] || {};
    var jobs = jobsFor(site);
    var open = jobs.filter(function (j) { return j.status !== 'Done' && j.status !== 'Not doing'; });
    return {
      plots: d.plots || (PLOTS[site] || []).length,
      noEmail: d.noEmail || 0, noPhone: d.noPhone || 0, noContact: d.noContact || 0,
      rentNone: d.rentNone || 0, rentPartial: d.rentPartial || 0, rentPaid: d.rentPaid || 0, rentUnknown: d.rentUnknown || 0,
      warnings: d.warnings || 0, issues: d.issues || 0,
      jobsOpen: open.length,
      jobsApproval: open.filter(function (j) { return j.status === 'Needs approval at the next committee meeting'; }).length,
      jobsUrgent: open.filter(function (j) { return /hurt/i.test(j.soon || ''); }).length,
      checked: 0
    };
  }

  function tile(cls, n, label) { return '<div class="tile ' + cls + '"><div class="n">' + n + '</div><div class="l">' + label + '</div></div>'; }
  function item(cls, n, title, detail, link, linkText) {
    return '<li><span class="n ' + cls + '">' + n + '</span><div><div class="t">' + esc(title) + '</div><div class="d">' + esc(detail) + '</div>' + (link ? '<a class="act" href="' + link + '">' + esc(linkText) + '</a>' : '') + '</div></li>';
  }

  function drawSite(site) {
    var c = counts(site);
    var rentDue = c.rentNone + c.rentPartial;
    var rep = REPS.filter(function (r) { return r.site === site; })[0];
    var mapLink = 'index.html';
    $('tiles').innerHTML =
      tile('info', c.plots, 'plots') +
      tile(rentDue ? 'bad' : 'good', rentDue, 'rent not paid in full (' + esc(DASH.rentYear || '') + ')') +
      tile(c.noEmail ? 'warn' : 'good', c.noEmail, 'without an email address') +
      tile(c.noPhone ? 'warn' : 'good', c.noPhone, 'without a phone number') +
      tile(c.jobsOpen ? 'warn' : 'good', c.jobsOpen, 'open jobs') +
      tile(c.checked ? 'good' : 'warn', c.checked + ' / ' + c.plots, 'plots checked this season') +
      tile(c.warnings ? 'bad' : 'good', c.warnings, 'warnings on record') +
      tile(c.issues ? 'warn' : 'good', c.issues, 'record issues to tidy');
    var todo = [];
    if (c.jobsUrgent) todo.push(item('bad', c.jobsUrgent, 'Urgent job' + (c.jobsUrgent > 1 ? 's' : '') + ' - someone could get hurt', 'Logged as "Now". Look today.', mapLink, 'See on the map'));
    if (rentDue) todo.push(item('bad', rentDue, 'Chase rent', (c.rentNone + ' paid nothing, ' + c.rentPartial + ' paid part, last year. ') + (DASH.rentNote || ''), null, ''));
    if (c.checked < c.plots) todo.push(item('warn', c.plots - c.checked, 'Walk the plots not yet checked this season', 'Tap a plot on the map, "Add / edit notes", under a minute each.', mapLink, 'Start on the map'));
    if (c.noEmail) todo.push(item('warn', c.noEmail, 'Get an email address', 'Plots with no email for the person responsible. Ask when you see them; the committee sends everything by email.', null, ''));
    if (c.noPhone) todo.push(item('warn', c.noPhone, 'Get a phone number', 'Plots with no phone number for the person responsible.', null, ''));
    if (c.jobsApproval) todo.push(item('info', c.jobsApproval, 'Job' + (c.jobsApproval > 1 ? 's' : '') + ' waiting for the next committee meeting', 'Put on the agenda.', mapLink, 'See the jobs'));
    if (c.jobsOpen - c.jobsApproval) todo.push(item('info', c.jobsOpen - c.jobsApproval, 'Open job' + (c.jobsOpen - c.jobsApproval > 1 ? 's' : ''), 'Logged or approved and waiting to be done.', mapLink, 'See the jobs'));
    if (c.warnings) todo.push(item('bad', c.warnings, 'Warning' + (c.warnings > 1 ? 's' : '') + ' on record', 'Follow-up is the committee\'s; the rep checks the plot on the next walk.', null, ''));
    $('todo').innerHTML = todo.length ? todo.join('') : '<li><span class="n good">0</span><div class="t">Nothing outstanding</div></li>';
    $('which').textContent = (rep ? rep.name + ': ' : '') + 'the list of which plots (rent, email, phone) is about identifiable people, so it is not on this open page. ' +
      (CONFIG.submitUrl ? 'Open it from your private link.' : 'It will open from a private link made for you once the receiver is connected - one tap, no login, and only your site.');
  }

  function drawAll() {
    var head = '<thead><tr><th>Site</th><th>Plots</th><th>Rent due</th><th>No email</th><th>No phone</th><th>Open jobs</th><th>Checked</th><th>Warnings</th></tr></thead>';
    var body = ORDER.map(function (site) {
      var c = counts(site);
      return '<tr><td>' + esc(site) + '</td><td>' + c.plots + '</td><td>' + (c.rentNone + c.rentPartial) + '</td><td>' + c.noEmail + '</td><td>' + c.noPhone + '</td><td>' + c.jobsOpen + '</td><td>' + c.checked + '</td><td>' + c.warnings + '</td></tr>';
    }).join('');
    var t = ORDER.reduce(function (a, site) { var c = counts(site); a.plots += c.plots; a.rent += c.rentNone + c.rentPartial; a.email += c.noEmail; a.phone += c.noPhone; a.jobs += c.jobsOpen; a.w += c.warnings; return a; }, { plots: 0, rent: 0, email: 0, phone: 0, jobs: 0, w: 0 });
    body += '<tr><td><strong>All</strong></td><td><strong>' + t.plots + '</strong></td><td><strong>' + t.rent + '</strong></td><td><strong>' + t.email + '</strong></td><td><strong>' + t.phone + '</strong></td><td><strong>' + t.jobs + '</strong></td><td><strong>0</strong></td><td><strong>' + t.w + '</strong></td></tr>';
    $('table').innerHTML = head + '<tbody>' + body + '</tbody>';
  }

  function draw() {
    var v = $('site').value;
    $('single').hidden = v === 'all';
    $('all').hidden = v !== 'all';
    if (v === 'all') drawAll(); else drawSite(v);
    $('status').textContent = v === 'all' ? 'Committee overview - counts only, nothing identifiable.' : 'Counts for ' + v + ' from the committee record. Nothing here names anyone.';
  }

  var sel = $('site');
  ORDER.forEach(function (s) { var o = document.createElement('option'); o.value = s; var rep = REPS.filter(function (r) { return r.site === s; })[0]; o.textContent = s + (rep ? ' - ' + rep.name : ''); sel.appendChild(o); });
  var all = document.createElement('option'); all.value = 'all'; all.textContent = 'All sites (committee)'; sel.appendChild(all);
  var q = new URLSearchParams(location.search).get('site');
  if (q && (ORDER.indexOf(q) >= 0 || q === 'all')) sel.value = q;
  sel.addEventListener('change', draw);
  $('asof').textContent = DASH.generated ? 'Record as at ' + DASH.generated : '';
  draw();
})();
