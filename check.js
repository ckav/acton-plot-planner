/* Plot check form. No sign-in: the page shrinks the photo on the phone, then posts one JSON message
   to the association's Apps Script web app, which files the photo in Drive and writes the sheet row.
   A rep's own link pre-fills who and site: check.html?who=Jon%20Snow&site=Bromyard */
(function () {
  var PLOTS = window.PLANNER_PLOTS || {};
  var REPS = window.PLANNER_REPS || [];
  var CONFIG = window.PLANNER_CONFIG || {};
  var LOOKS = ['Good - cultivated and tidy', 'Needs work - partly cultivated or untidy', 'Neglected - not being worked', 'Vacant - nobody on it'];
  var FLAGS = ['Shed needs repair', 'Shed should come down', 'More than one shed or greenhouse', 'No guttering or water butt',
    'Plot number not displayed', 'Hedge or trees over the boundary', 'Gate locked', 'Rubbish or materials to clear'];
  var MAX_EDGE = 1600, JPEG_Q = 0.82;

  var $ = function (id) { return document.getElementById(id); };
  var photo = null; // { base64, name, width, height }

  function fill() {
    var who = $('who');
    REPS.forEach(function (r) { var o = document.createElement('option'); o.value = r.name; o.textContent = r.name + (r.site ? ' (' + r.site + ')' : ''); who.appendChild(o); });
    var other = document.createElement('option'); other.value = 'other'; other.textContent = 'Someone else'; who.appendChild(other);
    var site = $('site');
    Object.keys(PLOTS).forEach(function (s) { var o = document.createElement('option'); o.value = s; o.textContent = s; site.appendChild(o); });
    $('look').innerHTML = LOOKS.map(function (t, i) {
      return '<label class="opt"><input type="radio" name="look" value="' + t + '"' + '><span>' + t + '</span></label>';
    }).join('');
    $('flags').innerHTML = FLAGS.map(function (t) {
      return '<label class="opt"><input type="checkbox" name="flag" value="' + t + '"><span>' + t + '</span></label>';
    }).join('');
  }

  function fillPlots() {
    var site = $('site').value, plot = $('plot');
    plot.innerHTML = '';
    var first = document.createElement('option'); first.value = ''; first.textContent = site ? 'Choose' : 'Choose the site first'; plot.appendChild(first);
    (PLOTS[site] || []).concat(site ? ['Not listed'] : []).forEach(function (p) { var o = document.createElement('option'); o.value = p; o.textContent = p; plot.appendChild(o); });
  }

  function prefill() {
    var q = new URLSearchParams(location.search);
    var who = q.get('who') || '', site = q.get('site') || '';
    if (who && REPS.some(function (r) { return r.name === who; })) $('who').value = who;
    if (!site) { var rep = REPS.filter(function (r) { return r.name === who; })[0]; site = rep ? rep.site : ''; }
    if (site && PLOTS[site]) { $('site').value = site; fillPlots(); }
    if ($('who').value && $('site').value) {
      $('whoText').textContent = $('who').value + ' - ' + $('site').value;
      $('whoBar').classList.remove('hidden');
      $('whoFs').classList.add('hidden');
      $('siteFs').classList.add('hidden');
    }
  }

  function shrink(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var dataUrl = c.toDataURL('image/jpeg', JPEG_Q);
        cb({ base64: dataUrl.split(',')[1], dataUrl: dataUrl, width: c.width, height: c.height });
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function show(kind, text) { var m = $('msg'); m.className = 'msg ' + kind; m.textContent = text; }

  function submit(ev) {
    ev.preventDefault();
    var who = $('who').value === 'other' ? $('whoOther').value.trim() : $('who').value;
    var site = $('site').value, plot = $('plot').value;
    var look = (document.querySelector('input[name=look]:checked') || {}).value || '';
    var flags = Array.prototype.map.call(document.querySelectorAll('input[name=flag]:checked'), function (i) { return i.value; });
    if (!who) return show('err', 'Say who this is from.');
    if (!site || !plot) return show('err', 'Pick the site and the plot number.');
    if (!look) return show('err', 'Say how the plot looks.');
    if (!CONFIG.submitUrl) return show('warn', 'Not connected yet - nothing was sent. WhatsApp the photo and plot number to Claire for now.');
    var body = { who: who, site: site, plot: plot, look: look, flags: flags, note: $('note').value.trim(),
      photo: photo ? photo.base64 : '', photoType: 'image/jpeg', sentAt: new Date().toISOString() };
    $('send').disabled = true; show('warn', 'Sending...');
    fetch(CONFIG.submitUrl, { method: 'POST', body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error(j && j.error ? j.error : 'not saved');
        show('ok', 'Logged: ' + site + ' plot ' + plot + '. Thank you.' + (photo ? ' Photo filed.' : ''));
        $('form').reset(); fillPlots(); prefill(); photo = null; $('preview').classList.add('hidden'); $('photoNote').textContent = '';
      })
      .catch(function (e) { show('err', 'Did not go through (' + e.message + '). Try again, or WhatsApp it to Claire.'); })
      .then(function () { $('send').disabled = false; });
  }

  fill();
  $('site').addEventListener('change', fillPlots);
  $('who').addEventListener('change', function () {
    $('whoOther').classList.toggle('hidden', $('who').value !== 'other');
    var rep = REPS.filter(function (r) { return r.name === $('who').value; })[0];
    if (rep && rep.site && !$('site').value) { $('site').value = rep.site; fillPlots(); }
  });
  $('whoChange').addEventListener('click', function () { $('whoBar').classList.add('hidden'); $('whoFs').classList.remove('hidden'); $('siteFs').classList.remove('hidden'); });
  $('file').addEventListener('change', function () {
    var f = $('file').files[0]; if (!f) return;
    $('photoNote').textContent = 'Preparing photo...';
    shrink(f, function (p) {
      photo = p;
      if (!p) { $('photoNote').textContent = 'Could not read that photo. Try another.'; return; }
      $('preview').src = p.dataUrl; $('preview').classList.remove('hidden');
      $('photoNote').textContent = 'Ready (' + Math.round(p.base64.length * 0.75 / 1024) + ' KB).';
    });
  });
  $('form').addEventListener('submit', submit);
  prefill();
  if (!CONFIG.submitUrl) $('notready').classList.remove('hidden');
})();
