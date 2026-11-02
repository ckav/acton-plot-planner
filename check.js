/* Plot check form. No sign-in: the page shrinks the photo on the phone, then posts one JSON message
   to the association's Apps Script web app, which files the photo in Drive and writes the sheet row.
   Built for a walk: "Next plot" moves to the next number on the site, and entries queue on the phone
   when there is no signal (or no receiver yet) and go when "Send waiting entries" is tapped or the page
   next loads with a connection.
   Nothing is required beyond the site and plot. With a rep key on this phone, the form opens filled in
   with the plot's current state (the sheet's Current tab), so only what has changed needs touching, and
   shows the photo on display with "Remove from display". The status questions are the same pills as the
   map card (pills.js); only the pills that changed are sent, and the button counts the changes.
   Entry points:
     check.html?site=Bromyard&plot=7A          from "Add / edit notes" on the map
     check.html?who=Jon%20Snow&site=Bromyard   a rep's own link
     any page ?key=<key>                       a rep link: the key is kept on the phone */
(function () {
  var PLOTS = window.PLANNER_PLOTS || {};
  var REPS = window.PLANNER_REPS || [];
  var CONFIG = window.PLANNER_CONFIG || {};
  var FLAGS = ['Extra shed or greenhouse - more than one of each', 'Plot number not displayed', 'Hedge over the boundary', 'Gate locked', 'Rubbish or materials to clear'];
  var MAX_EDGE = 1280, JPEG_Q = 0.78;   // about 150 KB a photo, so thirty can wait on the phone

  var $ = function (id) { return document.getElementById(id); };
  var photo = null;
  var loaded = null;   // the plot's current state as loaded, or null
  var pills = null;    // the status pill editor (pills.js)
  var store = function (k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('aga-' + k) || 'null'); localStorage.setItem('aga-' + k, JSON.stringify(v)); return true; } catch (e) { return v === undefined ? null : false; } };
  var KEY = (function () {
    var q = new URLSearchParams(location.search), k = q.get('key');
    if (k) { store('key', k); q.delete('key'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); }
    return k || store('key') || '';
  })();
  var when = function (iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  var ago = function (iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days < 1) return 'today'; if (days < 2) return 'yesterday'; if (days < 14) return days + ' days ago';
    if (days < 61) return Math.round(days / 7) + ' weeks ago'; if (days < 730) return Math.round(days / 30.4) + ' months ago';
    return Math.round(days / 365) + ' years ago';
  };

  function checks(id, name, values) { $(id).innerHTML = values.map(function (t) { return '<label class="opt"><input type="checkbox" name="' + name + '" value="' + t + '"><span>' + t + '</span></label>'; }).join(''); }
  function setChecks(name, joined) { String(joined || '').split(', ').forEach(function (v) { var i = v && document.querySelector('input[name=' + name + '][value="' + v + '"]'); if (i) i.checked = true; }); }
  function pickedAll(name) { return Array.prototype.map.call(document.querySelectorAll('input[name=' + name + ']:checked'), function (i) { return i.value; }); }

  function fill() {
    var who = $('who');
    REPS.forEach(function (r) { var o = document.createElement('option'); o.value = r.name; o.textContent = r.name + (r.site ? ' (' + r.site + ')' : ''); who.appendChild(o); });
    var other = document.createElement('option'); other.value = 'other'; other.textContent = 'Someone else'; who.appendChild(other);
    var site = $('site');
    Object.keys(PLOTS).forEach(function (s) { var o = document.createElement('option'); o.value = s; o.textContent = s; site.appendChild(o); });
    checks('flags', 'flag', FLAGS);
    pills = AGA_PILLS.editor($('pills'), {}, countChanges);
  }

  function fillPlots(keep) {
    var site = $('site').value, plot = $('plot');
    plot.innerHTML = '';
    var first = document.createElement('option'); first.value = ''; first.textContent = site ? 'Choose' : 'Choose the site first'; plot.appendChild(first);
    (PLOTS[site] || []).concat(site ? ['Not listed'] : []).forEach(function (p) { var o = document.createElement('option'); o.value = p; o.textContent = p; plot.appendChild(o); });
    if (keep) plot.value = keep;
  }

  function whoName() { return $('who').value === 'other' ? $('whoOther').value.trim() : $('who').value; }
  function showWho() {
    var w = whoName(); if (!w) return;
    $('whoText').textContent = 'Person submitting edits: ' + w; $('whoBar').classList.remove('hidden'); $('whoFs').classList.add('hidden');
  }
  function showPlot(site, plot) {
    $('plotBar').innerHTML = 'Plot ' + plot + '<small>' + site + ' - <a href="#" id="plotChange">not this one?</a></small>';
    $('plotBar').classList.remove('hidden'); $('siteFs').classList.add('hidden'); $('plotFs').classList.add('hidden');
    $('plotChange').addEventListener('click', function (ev) { ev.preventDefault(); $('plotBar').classList.add('hidden'); $('siteFs').classList.remove('hidden'); $('plotFs').classList.remove('hidden'); });
  }

  function prefill(siteOverride, plotOverride) {
    var q = new URLSearchParams(location.search);
    var who = q.get('who') || store('who') || '';
    var site = siteOverride || q.get('site') || '', plot = plotOverride || q.get('plot') || '';
    if (who && REPS.some(function (r) { return r.name === who; })) { $('who').value = who; showWho(); }
    else if (who) { $('who').value = 'other'; $('whoOther').value = who; $('whoOther').classList.remove('hidden'); showWho(); }
    if (!site) { var rep = REPS.filter(function (r) { return r.name === $('who').value; })[0]; site = rep ? rep.site : ''; }
    if (site && PLOTS[site]) { $('site').value = site; fillPlots(plot); }
    if (site && plot && PLOTS[site] && PLOTS[site].indexOf(plot) >= 0) showPlot(site, plot);
    $('mapLink').href = 'index.html'; $('nextLink').href = 'index.html';
    loadCurrent();
  }

  // ---- the plot's current state, for reps with a key
  function clearAnswers() {
    Array.prototype.forEach.call(document.querySelectorAll('#form input[type=checkbox]'), function (i) { i.checked = false; });
    $('note').value = ''; loaded = null; pills.reset({});
    $('current').classList.add('hidden'); $('curPhoto').classList.add('hidden'); $('curHideWrap').classList.add('hidden');
    $('curNote').classList.add('hidden'); $('fileLabel').textContent = 'Add a photo';
    countChanges();
  }
  // The button says how many things will be saved: changed pills, flags, the note and a new photo.
  function flagsNow() { return pickedAll('flag').join(', '); }
  function changeCount() {
    var n = pills ? pills.count() : 0;
    if (flagsNow() !== ((loaded && loaded.flags) || '')) n++;
    if ($('note').value.trim()) n++;
    if (photo) n++;
    return n;
  }
  // A rep who finds the plot as it was last time logs the check in one tap (every item re-recorded as confirmed).
  function canConfirmAll() { return !!loaded && !loaded.limited && !!pills && pills.hasLast(); }
  function countChanges() {
    var n = changeCount();
    var same = !n && canConfirmAll();
    $('send').textContent = n ? 'Save today\'s check (' + n + ')' : same ? "Nothing's changed - log today's check" : 'Nothing changed yet';
    $('send').disabled = !n && !same;
  }
  function loadCurrent() {
    clearAnswers();
    var site = $('site').value, plot = $('plot').value;
    if (!CONFIG.submitUrl || !site || !plot) return;
    var blank = 'Opening blank: the latest check shows here only on a phone or computer that has opened a rep link. You can still send what you see.';
    var url = CONFIG.submitUrl + '?action=plot&site=' + encodeURIComponent(site) + '&plot=' + encodeURIComponent(plot) + AGA_GATE.auth();
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if ($('site').value !== site || $('plot').value !== plot) return;
      if (!j || !j.ok) { if (j && j.error === 'key') show('warn', 'Your link has been switched off, so the plot details cannot be shown. You can still send a check.'); return; }
      if (j.hidden) { $('current').textContent = blank; $('current').classList.remove('hidden'); return; }
      if (j.limited) {
        loaded = { limited: true };
        if (j.plot) pills.reset(j.plot.items || {});
        countChanges();
        $('current').textContent = (j.plot ? 'Filled in with the current colours' + (j.plot.lastAt ? ' (checked ' + when(j.plot.lastAt) + ')' : '') + '. ' : 'No check on record for this plot yet. ') +
          'Reasons, flags, notes and photos show only on a phone or computer that has opened a rep link.';
        $('current').classList.remove('hidden');
        return;
      }
      var s = j.plot;
      loaded = s || {};
      if (!s) { $('current').textContent = 'No check on record for this plot yet.'; $('current').classList.remove('hidden'); return; }
      pills.reset(s.items || {}); setChecks('flag', s.flags);
      if (s.note) { $('curNote').textContent = 'On the map now: "' + s.note + '". Anything you type below replaces it.'; $('curNote').classList.remove('hidden'); }
      countChanges();
      $('current').textContent = 'Last checked ' + (s.lastAt ? ago(s.lastAt) + ' (' + when(s.lastAt) + ')' : 'on an unknown date') + (s.lastBy ? ' by ' + s.lastBy : '') + '. Tap each row to confirm or change it.';
      $('current').classList.remove('hidden');
      if (s.photo && s.photo.data) { $('curImg').src = 'data:image/jpeg;base64,' + s.photo.data; $('curPhoto').classList.remove('hidden'); $('curHideWrap').classList.remove('hidden'); $('curHide').setAttribute('data-url', s.photo.url); $('fileLabel').textContent = 'Replace the photo'; }
    }).catch(function () {});
  }
  function hidePhoto() {
    var url = $('curHide').getAttribute('data-url');
    if (!url || !confirm('Take this photo off the map? It stays in the record, marked as replaced.')) return;
    $('curHide').disabled = true;
    fetch(CONFIG.submitUrl, { method: 'POST', body: JSON.stringify({ kind: 'photo-hide', key: KEY, site: $('site').value, plot: $('plot').value, photo: url, who: whoName() }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw new Error(); show('ok', 'Photo taken off the map.'); loadCurrent(); })
      .catch(function () { show('err', 'Could not do that just now - no connection? Try again.'); })
      .then(function () { $('curHide').disabled = false; });
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

  function show(kind, text) { var m = $('msg'); m.className = 'msg ' + kind; m.textContent = text; }

  // ---- queue: entries that could not be sent wait on the phone
  function queue() { return store('queue') || []; }
  function enqueue(body) { var q = queue(); q.push(body); if (!store('queue', q)) return false; return true; }
  function showQueue() {
    var n = queue().length;
    $('queue').classList.toggle('hidden', n === 0);
    $('queueText').textContent = n + (n === 1 ? ' entry' : ' entries') + ' waiting on this phone' + (CONFIG.submitUrl ? '.' : ' until the form is connected.');
    $('queueSend').classList.toggle('hidden', !CONFIG.submitUrl);
  }
  // The password is added at sending time, so entries queued under an old one go with the new one.
  function sendOne(body) {
    return fetch(CONFIG.submitUrl, { method: 'POST', body: JSON.stringify(Object.assign({}, body, { pw: AGA_GATE.pw() })) }).then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) { if (j && j.error === 'password') AGA_GATE.relock(); throw new Error(j && j.error ? j.error : 'not saved'); } return j; });
  }
  function flush() {
    if (!CONFIG.submitUrl) return;
    var q = queue(); if (!q.length) return;
    $('queueSend').disabled = true; $('queueText').textContent = 'Sending ' + q.length + '...';
    var done = 0;
    (function next() {
      if (!q.length) { store('queue', []); $('queueSend').disabled = false; showQueue(); show('ok', done + ' waiting ' + (done === 1 ? 'entry' : 'entries') + ' sent.'); return; }
      sendOne(q[0]).then(function () { q.shift(); done++; store('queue', q); next(); })
        .catch(function (err) {
          var pwGone = err && err.message === 'password';
          store('queue', q); $('queueSend').disabled = false; showQueue();
          $('queueText').textContent = pwGone ? 'Type the new password, then send again - ' + q.length + ' waiting.' : 'Still no connection - ' + q.length + ' waiting. Try again later.';
        });
    })();
  }

  function afterSave(site, plot, text) {
    store('who', whoName());
    show('ok', text);
    $('after').classList.remove('hidden'); $('send').classList.add('hidden');
    var list = PLOTS[site] || [], i = list.indexOf(plot);
    var nxt = (i >= 0 && i + 1 < list.length) ? list[i + 1] : '';
    $('nextPlot').textContent = nxt ? 'Next: plot ' + nxt : 'That was the last plot';
    $('nextPlot').disabled = !nxt;
    $('nextPlot').onclick = function () {
      $('form').reset(); clearPhoto(); clearAnswers();
      $('after').classList.add('hidden'); $('send').classList.remove('hidden'); $('msg').className = 'msg hidden';
      prefill(site, nxt); window.scrollTo(0, 0);
    };
  }

  function submit(ev) {
    ev.preventDefault();
    var who = whoName(), site = $('site').value, plot = $('plot').value;
    if (!site || !plot) return show('err', 'Pick the site and the plot number.');
    var note = $('note').value.trim(), flags = pickedAll('flag');
    if (!changeCount() && canConfirmAll()) pills.confirmAll();
    if (!changeCount()) return show('err', 'Nothing changed yet - tap a pill, tick a flag, add a note or a photo.');
    var body = {
      kind: 'check', key: KEY, who: who, site: site, plot: plot, items: pills.changes(),
      flags: flags, flagsAnswered: (!!loaded && !loaded.limited) || flags.length > 0,
      note: note,
      photo: photo ? photo.base64 : '', photoType: 'image/jpeg', sentAt: new Date().toISOString()
    };
    if (!CONFIG.submitUrl) {
      if (!enqueue(body)) return show('err', 'This phone cannot hold any more entries. Send the photo and notes to Claire by WhatsApp.');
      showQueue(); return afterSave(site, plot, 'Saved on this phone: ' + site + ' plot ' + plot + '. It goes to the record once the form is connected.');
    }
    $('send').disabled = true; show('warn', 'Sending...');
    sendOne(body)
      .then(function (j) {
        var jobs = (j && j.jobs) || [];
        afterSave(site, plot, 'Saved: ' + site + ' plot ' + plot + '. Thank you.' + (photo ? ' Photo filed.' : '') +
          (jobs.length ? ' Added to site jobs: ' + jobs.map(function (x) { return x.code + ' ' + x.title; }).join('; ') + '.' : ''));
      })
      .catch(function (err) {
        if (err && err.message === 'password' && enqueue(body)) { showQueue(); return afterSave(site, plot, 'Saved on this phone: ' + site + ' plot ' + plot + '. Type the new password, then tap "Send waiting entries".'); }
        if (enqueue(body)) { showQueue(); afterSave(site, plot, 'No connection - saved on this phone: ' + site + ' plot ' + plot + '. It will send when you tap "Send waiting entries" with a signal.'); }
        else show('err', 'No connection and this phone cannot hold any more entries. Try again when you have a signal.');
      })
      .then(function () { $('send').disabled = false; });
  }

  fill();
  $('site').addEventListener('change', function () { fillPlots(); clearAnswers(); });
  $('who').addEventListener('change', function () {
    $('whoOther').classList.toggle('hidden', $('who').value !== 'other');
    var rep = REPS.filter(function (r) { return r.name === $('who').value; })[0];
    if (rep && rep.site && !$('site').value) { $('site').value = rep.site; fillPlots(); }
  });
  $('whoChange').addEventListener('click', function () { $('whoBar').classList.add('hidden'); $('whoFs').classList.remove('hidden'); });
  $('flags').addEventListener('change', countChanges);
  $('note').addEventListener('input', countChanges);
  function clearPhoto() { photo = null; $('file').value = ''; $('preview').classList.add('hidden'); $('photoClear').classList.add('hidden'); $('photoNote').textContent = ''; countChanges(); }
  $('photoClear').addEventListener('click', clearPhoto);
  $('curHide').addEventListener('click', hidePhoto);
  $('plot').addEventListener('change', loadCurrent);
  $('file').addEventListener('change', function () {
    var f = $('file').files[0]; if (!f) return;
    $('photoNote').textContent = 'Preparing photo...';
    shrink(f, function (p) {
      photo = p;
      if (!p) { $('photoNote').textContent = 'Could not read that photo. Try another.'; return; }
      $('preview').src = p.dataUrl; $('preview').classList.remove('hidden'); $('photoClear').classList.remove('hidden');
      $('photoNote').textContent = 'Ready (' + Math.round(p.base64.length * 0.75 / 1024) + ' KB).';
      countChanges();
    });
  });
  $('form').addEventListener('submit', submit);
  $('queueSend').addEventListener('click', flush);
  prefill();
  if (!CONFIG.submitUrl) $('notready').classList.remove('hidden');
  showQueue();
  if (CONFIG.submitUrl && queue().length && navigator.onLine) flush();
})();
