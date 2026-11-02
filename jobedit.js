/* Site jobs, shared by the map (planner.js) and the job board (jobs.js), so a job looks and edits the same
   on both. The process is in 22-site-jobs-process.md: one row per job, no history, the row is the truth.
     Status   Pending (amber)  Arranged (blue)  Done (green)  Not doing (grey). Blank reads as Pending, and the
              planner's old five (Logged, Needs approval..., Approved...) read as Pending too.
     Money    No / Needs approval / Approved. Blank reads as No.
   One message to the receiver, job-edit: { kind: 'job-edit', id, site, by, ...only the fields that changed }.
   A photo goes as base64 with photoType, exactly as the check and job messages send theirs. x and y alone
   move the pin. With no connection the edit waits on this phone under aga-edits-<siteKey>, shows on the row as
   "Not sent yet", and is sent next time a page opens with a signal (or when "Send now" is tapped). Old
   aga-updates-<siteKey> stores from the history days are thrown away on first load.
   AGA_JOBS.norm(job)                   fills status and money so blank reads right
   AGA_JOBS.mergeEdits(list, siteKey)   lays queued and just-sent edits over the rows; sets job.unsent
   AGA_JOBS.editForm(job) / wireEditForm(root, job, opts)   the edit form and its save
   AGA_JOBS.send(body, siteKey)         post, or queue when there is no connection
   AGA_JOBS.flush(siteKey)              send what is waiting */
(function () {
  var CONFIG = window.PLANNER_CONFIG || {};
  var SITES = window.PLANNER_SITES || [];
  var STATUSES = ['Pending', 'Arranged', 'Done', 'Not doing'];
  var MONEY = ['No', 'Needs approval', 'Approved'];
  var SOON = ['Now - someone could get hurt', 'This season', 'Next work morning', 'Just noting it'];
  var STATUS_CLASS = { 'Pending': 'st-pending', 'Arranged': 'st-arranged', 'Done': 'st-done', 'Not doing': 'st-no' };
  var LIMIT = { who: 60, blockedBy: 200, expectedBy: 40, latest: 500, title: 120, detail: 500 };
  var FIELDS = ['status', 'who', 'money', 'blockedBy', 'expectedBy', 'latest', 'soon', 'title', 'detail'];
  var MAX_EDGE = 1280, JPEG_Q = 0.78;   // same as check.js: about 150 KB a photo

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var store = function (k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('aga-' + k) || 'null'); localStorage.setItem('aga-' + k, JSON.stringify(v)); return true; } catch (e) { return v === undefined ? null : false; } };
  var drop = function (k) { try { localStorage.removeItem('aga-' + k); } catch (e) {} };
  var trim = function (v) { return String(v == null ? '' : v).trim(); };
  var when = function (iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  var today = function () { return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };

  var css = document.createElement('style');
  css.textContent =
    '.st { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 10px; background: #EDEBE3; color: #5B5A54; white-space: nowrap; }' +
    '.st-pending { background: #FFF1D6; color: #8A5A00; }' +
    '.st-arranged { background: #DCEBFA; color: #1D4ED8; }' +
    '.st-done { background: #E4F0E7; color: #1F5A3A; }' +
    '.st-no { background: #EDEBE3; color: #5B5A54; }' +
    '.st-urgent { background: #F3E0E0; color: #8A1F1F; border: 1px solid #8A1F1F; }' +
    '.st-local { background: #fff; color: #5B5A54; border: 1px dashed #9C9A90; }' +
    '.jobfields { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 8px 10px; margin: 12px 0; font-size: 15px; }' +
    '.jobfields dt { font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #5B5A54; padding-top: 3px; }' +
    '.jobfields dd { margin: 0; color: #1A1A1A; overflow-wrap: anywhere; }' +
    '.jobfields dd.none { color: #8E8C82; }' +
    '.jobdetail { margin: 10px 0; font-size: 15px; }' +
    '.jobphoto { display: block; width: 100%; border-radius: 8px; margin: 6px 0 10px; }' +
    '.jobedit { display: grid; gap: 10px; margin-top: 10px; }' +
    '.jobedit label { display: grid; gap: 4px; font-size: 13px; font-weight: 600; color: #5B5A54; }' +
    '.jobedit input[type=text], .jobedit select, .jobedit textarea { width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; font: 15px system-ui, sans-serif; padding: 10px 12px; min-height: 44px; border: 1px solid #DAD8CF; border-radius: 8px; background: #fff; color: #1A1A1A; }' +
    '.jobedit textarea { min-height: 72px; resize: vertical; }' +
    '.jobedit .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }' +
    '@media (max-width: 420px) { .jobedit .two { grid-template-columns: 1fr; } }' +
    '.jobedit .photorow { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }' +
    '.jobedit input[type=file] { position: absolute; width: 1px; height: 1px; opacity: 0; }' +
    '.jobedit .acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }' +
    '.jobedit .msg, .jobmsg { border-radius: 8px; padding: 10px 12px; font-size: 14px; }' +
    '.jobedit .msg.err, .jobmsg.err { background: #F3E0E0; color: #8A1F1F; }' +
    '.jobedit .msg.ok, .jobmsg.ok { background: #E4F0E7; color: #1F5A3A; }' +
    '.jobedit .msg.warn, .jobmsg.warn { background: #FFF1D6; color: #5C3D00; }' +
    '.jobedit .msg.hidden { display: none; }' +
    '.jobedit .btn, .jobacts .btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; min-height: 48px; padding: 0 14px; border-radius: 24px; border: 1px solid #1F5A3A; background: #1F5A3A; color: #fff; font: 600 15px system-ui, sans-serif; text-decoration: none; cursor: pointer; }' +
    '.jobedit .btn.ghost, .jobacts .btn.ghost { background: #fff; color: #1F5A3A; }' +
    '.jobedit .btn:disabled, .jobacts .btn:disabled { opacity: .55; cursor: default; }' +
    '.jobacts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }' +
    '.jobacts .wide { grid-column: 1 / -1; }';
  document.head.appendChild(css);

  // ---- the row, read right
  function siteKey(name) {
    var s = SITES.filter(function (x) { return x.recordName === name || x.name === name || x.key === name; })[0];
    return s ? s.key : String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }
  function siteName(key) { var s = SITES.filter(function (x) { return x.key === key; })[0]; return s ? (s.recordName || s.name) : key; }
  function normStatus(s) { s = trim(s); return STATUSES.indexOf(s) >= 0 ? s : 'Pending'; }
  function norm(j) {
    j.status = normStatus(j.status);
    j.money = MONEY.indexOf(trim(j.money)) >= 0 ? trim(j.money) : 'No';
    ['who', 'blockedBy', 'expectedBy', 'latest', 'detail', 'soon', 'title'].forEach(function (f) { j[f] = trim(j[f]); });
    delete j.updates;
    return j;
  }
  var done = function (j) { return j.status === 'Done' || j.status === 'Not doing'; };
  var urgent = function (j) { return /hurt/i.test(j.soon || ''); };   // the "could hurt someone" answer
  var pill = function (text, cls) { return '<span class="st ' + cls + '">' + esc(text) + '</span>'; };
  var statusPill = function (s) { s = normStatus(s); return pill(s, STATUS_CLASS[s]); };

  // ---- queue: edits waiting on this phone, and edits just sent (kept in memory until the sheet is read back)
  var sentEdits = {};
  (SITES.length ? SITES.map(function (s) { return s.key; }) : []).forEach(function (k) { drop('updates-' + k); });   // the old history store
  function queued(key) { return store('edits-' + key) || []; }
  function enqueue(key, body) { var q = queued(key); q.push(Object.assign({ queuedAt: new Date().toISOString() }, body)); return store('edits-' + key, q); }
  function applyEdit(j, e) {
    FIELDS.forEach(function (f) { if (e[f] !== undefined) j[f] = e[f]; });
    if (e.x !== undefined) j.x = e.x;
    if (e.y !== undefined) j.y = e.y;
    if (e.photo) { if (/^https?:/.test(e.photo)) j.photo = e.photo; else j.photoLocal = 'data:' + (e.photoType || 'image/jpeg') + ';base64,' + e.photo; }
  }
  function mergeEdits(list, key) {
    var byId = {};
    list.forEach(function (j) { byId[j.id] = j; });
    (sentEdits[key] || []).forEach(function (e) { if (byId[e.id]) applyEdit(byId[e.id], e); });
    queued(key).forEach(function (e) { var j = byId[e.id]; if (!j) return; applyEdit(j, e); j.unsent = true; });
    list.forEach(norm);
    return list;
  }
  function remember(key, body) { (sentEdits[key] = sentEdits[key] || []).push(body); }
  function forget(key) { delete sentEdits[key]; }

  function post(body) {
    if (!CONFIG.submitUrl) return Promise.resolve({ ok: false, offline: true });
    body = Object.assign({ pw: AGA_GATE.pw(), key: AGA_GATE.key() }, body);   // a rep link has a key and no password
    return fetch(CONFIG.submitUrl, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.error === 'password') AGA_GATE.relock(); return j; })
      .catch(function () { return { ok: false, offline: true }; });
  }
  // Send one edit. No connection (or no receiver yet): it waits on the phone and counts as saved here.
  // The receiver refusing it (unknown id, bad status) is a real failure and is not queued.
  function send(body, key) {
    return post(body).then(function (r) {
      if (r && r.ok) { remember(key, r.photo ? Object.assign({}, body, { photo: r.photo }) : body); return { ok: true, photo: r.photo || '' }; }
      if (r && r.error) return { ok: false, error: r.error };
      return enqueue(key, body) ? { ok: true, queued: true } : { ok: false, error: 'full' };
    });
  }
  // Send what is waiting, oldest first. Stops at the first connection failure; an edit the receiver refuses
  // stays in the queue (so the row keeps saying Not sent yet) and the next one is tried.
  function flush(key) {
    var q = queued(key), keep = [], sent = 0, errors = [], i = 0;
    if (!CONFIG.submitUrl || !q.length) return Promise.resolve({ sent: 0, left: q.length, errors: errors });
    var save = function () { store('edits-' + key, keep.concat(q.slice(i))); };
    return (function next() {
      if (i >= q.length) return Promise.resolve();
      var body = Object.assign({}, q[i]); delete body.queuedAt;
      return post(body).then(function (r) {
        if (r && r.ok) { sent++; i++; save(); remember(key, r.photo ? Object.assign({}, body, { photo: r.photo }) : body); return next(); }
        if (r && r.error) { errors.push(r.error); keep.push(q[i]); i++; return next(); }
      });   // no connection: stop here, the rest stays
    })().then(function () { save(); return { sent: sent, left: queued(key).length, errors: errors }; });
  }

  function shrink(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var dataUrl = c.toDataURL('image/jpeg', JPEG_Q);
        cb({ base64: dataUrl.split(',')[1], dataUrl: dataUrl });
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // ---- what a job looks like: the row's fields, then detail and photo
  function fields(j) {
    var row = function (label, value) { return '<dt>' + label + '</dt><dd' + (value ? '' : ' class="none"') + '>' + (value ? esc(value) : '-') + '</dd>'; };
    return '<dl class="jobfields">' +
      '<dt>Status</dt><dd>' + statusPill(j.status) + (urgent(j) && !done(j) ? ' ' + pill('Urgent', 'st-urgent') : '') + (j.unsent ? ' ' + pill('Not sent yet', 'st-local') : '') + '</dd>' +
      row('Who', j.who) + row('Money', j.money) + row('Blocked by', j.blockedBy) + row('Expected by', j.expectedBy) + row('Latest', j.latest) + '</dl>' +
      (j.detail ? '<p class="jobdetail">' + esc(j.detail) + '</p>' : '') +
      (j.photoLocal ? '<img class="jobphoto" alt="Photo of this job, not sent yet" src="' + j.photoLocal + '">' :
        j.photo ? '<p class="jobdetail"><a href="' + esc(j.photo) + '" target="_blank" rel="noopener">Open the photo</a></p>' : '');
  }

  // ---- the edit form: every field the committee keeps on the row, plus how soon, detail and a photo
  function opt(list, cur) {
    if (cur && list.indexOf(cur) < 0) list = list.concat([cur]);
    return list.map(function (s) { return '<option' + (s === cur ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
  }
  function editForm(j) {
    return '<form class="jobedit" id="jobEdit" novalidate>' +
      '<div class="two"><label>Status<select id="jeStatus">' + opt(STATUSES, j.status) + '</select></label>' +
      '<label>Money<select id="jeMoney">' + opt(MONEY, j.money) + '</select></label></div>' +
      '<label>Who is dealing with it<input type="text" id="jeWho" maxlength="' + LIMIT.who + '" value="' + esc(j.who) + '" placeholder="A committee member, rep or contractor"></label>' +
      '<label>Blocked by<input type="text" id="jeBlocked" maxlength="' + LIMIT.blockedBy + '" value="' + esc(j.blockedBy) + '" placeholder="What has to happen first, if anything"></label>' +
      '<label>Expected by<input type="text" id="jeExpected" maxlength="' + LIMIT.expectedBy + '" value="' + esc(j.expectedBy) + '" placeholder="e.g. Feb 2027, once arranged"></label>' +
      '<label>Latest<input type="text" id="jeLatest" maxlength="' + LIMIT.latest + '" value="' + esc(j.latest) + '" placeholder="The latest position, in a line (amount here if money)"></label>' +
      '<label>How soon<select id="jeSoon">' + opt(SOON, j.soon) + '</select></label>' +
      '<label>Detail<textarea id="jeDetail" maxlength="' + LIMIT.detail + '">' + esc(j.detail) + '</textarea></label>' +
      '<div class="photorow"><label class="btn ghost" for="jePhoto" style="width:auto; min-height:44px">' + (j.photo ? 'Replace the photo' : 'Add photo') + '</label><input type="file" id="jePhoto" accept="image/*"><span id="jePhotoNote" class="sub"></span></div>' +
      '<div class="acts"><button type="submit" class="btn" id="jeSave">Save</button><button type="button" class="btn ghost" id="jeCancel">Cancel</button></div>' +
      '<div id="jeMsg" class="msg hidden" role="status"></div></form>';
  }
  // Only the fields that changed are sent. opts: { by, siteName, siteKey, onSaved(result, body), onCancel }
  function wireEditForm(root, j, opts) {
    var form = root.querySelector('#jobEdit'); if (!form) return;
    var photo = null, busy = false;
    var msg = function (kind, text) { var m = $('jeMsg'); m.className = 'msg ' + kind; m.textContent = text; };
    $('jeCancel').addEventListener('click', function () { if (!busy) opts.onCancel(); });
    $('jePhoto').addEventListener('change', function () {
      var f = $('jePhoto').files[0]; if (!f) return;
      $('jePhotoNote').textContent = 'Preparing photo...';
      shrink(f, function (p) { photo = p; $('jePhotoNote').textContent = p ? 'Photo ready (' + Math.round(p.base64.length * 0.75 / 1024) + ' KB).' : 'Could not read that photo. Try another.'; });
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (busy) return;
      var now = { status: $('jeStatus').value, money: $('jeMoney').value, who: trim($('jeWho').value), blockedBy: trim($('jeBlocked').value),
        expectedBy: trim($('jeExpected').value), latest: trim($('jeLatest').value), soon: $('jeSoon').value, detail: trim($('jeDetail').value) };
      var changes = {};
      Object.keys(now).forEach(function (f) { if (now[f] !== trim(j[f])) changes[f] = now[f]; });
      if (photo) { changes.photo = photo.base64; changes.photoType = 'image/jpeg'; }
      if (!Object.keys(changes).length) { msg('err', 'Nothing changed yet.'); return; }
      var body = Object.assign({ kind: 'job-edit', id: j.id, site: opts.siteName, by: opts.by || '' }, changes);
      busy = true; $('jeSave').disabled = true; $('jeSave').textContent = 'Saving...'; msg('hidden', '');
      send(body, opts.siteKey).then(function (r) {
        busy = false;
        if (r.ok) { opts.onSaved(r, body); return; }
        $('jeSave').disabled = false; $('jeSave').textContent = 'Save';
        msg('err', r.error === 'unknown id' ? 'Not saved - the sheet does not have this job yet. If it was logged with no connection, open the map and send it first.'
          : r.error === 'full' ? 'Not saved - this phone cannot hold any more. Try again when you have a signal.'
          : 'Not saved - the sheet did not accept it (' + r.error + '). Try again in a moment.');
      });
    });
  }
  // The words for a save: sent, or waiting on this phone.
  function savedText(r) { return r.queued ? 'No connection - saved on this phone. It will send next time the planner opens with a signal.' : 'Saved.'; }

  window.AGA_JOBS = { STATUSES: STATUSES, MONEY: MONEY, SOON: SOON, FIELDS: FIELDS, norm: norm, done: done, urgent: urgent, pill: pill, statusPill: statusPill,
    fields: fields, editForm: editForm, wireEditForm: wireEditForm, send: send, flush: flush, queued: queued, mergeEdits: mergeEdits, forget: forget,
    siteKey: siteKey, siteName: siteName, when: when, today: today, savedText: savedText, esc: esc };
})();
