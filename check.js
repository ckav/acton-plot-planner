/* Plot check form. No sign-in: the page shrinks the photo on the phone, then posts one JSON message
   to the association's Apps Script web app, which files the photo in Drive and writes the sheet row.
   Entry points:
     check.html?site=Bromyard&plot=7A          from "Check this plot" on the map
     check.html?who=Jon%20Snow&site=Bromyard   a rep's own link
   The rep's name is remembered on the phone after the first entry, so later taps go map -> plot -> answers. */
(function () {
  var PLOTS = window.PLANNER_PLOTS || {};
  var REPS = window.PLANNER_REPS || [];
  var CONFIG = window.PLANNER_CONFIG || {};
  var LOOKS = ['Good - cultivated and tidy', 'Needs work - partly cultivated or untidy', 'Neglected - not being worked', 'Vacant - nobody on it'];
  var SHED_COND = ['Good condition', 'Needs roof repair', 'Unsafe - needs removing'];
  var WATER_WHAT = ['Gutters on the shed', 'Water butt connected', 'Water butt not connected to anything', 'Other container catching rain'];
  var FLAGS = ['More than one shed or greenhouse', 'Plot number not displayed', 'Hedge or trees over the boundary', 'Gate locked', 'Rubbish or materials to clear'];
  var MAX_EDGE = 1600, JPEG_Q = 0.82;

  var $ = function (id) { return document.getElementById(id); };
  var photo = null;

  function radios(id, name, values) {
    $(id).innerHTML = values.map(function (t) {
      return '<label class="opt"><input type="radio" name="' + name + '" value="' + t + '"><span>' + t + '</span></label>';
    }).join('');
  }
  function checks(id, name, values) {
    $(id).innerHTML = values.map(function (t) {
      return '<label class="opt"><input type="checkbox" name="' + name + '" value="' + t + '"><span>' + t + '</span></label>';
    }).join('');
  }
  function picked(name) { var i = document.querySelector('input[name=' + name + ']:checked'); return i ? i.value : ''; }
  function pickedAll(name) { return Array.prototype.map.call(document.querySelectorAll('input[name=' + name + ']:checked'), function (i) { return i.value; }); }
  function remember(k, v) { try { localStorage.setItem('aga-' + k, v); } catch (e) {} }
  function recall(k) { try { return localStorage.getItem('aga-' + k) || ''; } catch (e) { return ''; } }

  function fill() {
    var who = $('who');
    REPS.forEach(function (r) { var o = document.createElement('option'); o.value = r.name; o.textContent = r.name + (r.site ? ' (' + r.site + ')' : ''); who.appendChild(o); });
    var other = document.createElement('option'); other.value = 'other'; other.textContent = 'Someone else'; who.appendChild(other);
    var site = $('site');
    Object.keys(PLOTS).forEach(function (s) { var o = document.createElement('option'); o.value = s; o.textContent = s; site.appendChild(o); });
    radios('look', 'look', LOOKS);
    radios('shed', 'shed', ['No', 'Yes']);
    radios('shedCond', 'shedCond', SHED_COND);
    radios('poly', 'poly', ['No', 'Yes']);
    radios('water', 'water', ['No', 'Yes']);
    checks('waterWhat', 'waterWhat', WATER_WHAT);
    checks('flags', 'flag', FLAGS);
  }

  function fillPlots(keep) {
    var site = $('site').value, plot = $('plot');
    plot.innerHTML = '';
    var first = document.createElement('option'); first.value = ''; first.textContent = site ? 'Choose' : 'Choose the site first'; plot.appendChild(first);
    (PLOTS[site] || []).concat(site ? ['Not listed'] : []).forEach(function (p) { var o = document.createElement('option'); o.value = p; o.textContent = p; plot.appendChild(o); });
    if (keep) plot.value = keep;
  }

  function showWho() {
    var w = $('who').value === 'other' ? $('whoOther').value.trim() : $('who').value;
    if (!w) return;
    $('whoText').textContent = w;
    $('whoBar').classList.remove('hidden');
    $('whoFs').classList.add('hidden');
  }

  function prefill() {
    var q = new URLSearchParams(location.search);
    var who = q.get('who') || recall('who');
    var site = q.get('site') || '', plot = q.get('plot') || '';
    if (who && REPS.some(function (r) { return r.name === who; })) { $('who').value = who; showWho(); }
    if (!site) { var rep = REPS.filter(function (r) { return r.name === $('who').value; })[0]; site = rep ? rep.site : ''; }
    if (site && PLOTS[site]) { $('site').value = site; fillPlots(plot); }
    if (site && plot && PLOTS[site] && PLOTS[site].indexOf(plot) >= 0) {
      $('plotBar').innerHTML = 'Plot ' + plot + '<small>' + site + ' - <a href="#" id="plotChange">not this one?</a></small>';
      $('plotBar').classList.remove('hidden');
      $('siteFs').classList.add('hidden');
      $('plotFs').classList.add('hidden');
      $('plotChange').addEventListener('click', function (ev) { ev.preventDefault(); $('plotBar').classList.add('hidden'); $('siteFs').classList.remove('hidden'); $('plotFs').classList.remove('hidden'); });
    }
    $('mapLink').href = 'index.html' + (site ? '?site=' + encodeURIComponent(site) : '');
    $('nextLink').href = $('mapLink').href;
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
        cb({ base64: dataUrl.split(',')[1], dataUrl: dataUrl });
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
    var look = picked('look'), shed = picked('shed'), poly = picked('poly'), water = picked('water');
    if (!who) return show('err', 'Say who this is from.');
    if (!site || !plot) return show('err', 'Pick the site and the plot number.');
    if (!look) return show('err', 'Say how the plot looks.');
    if (!shed || !poly || !water) return show('err', 'Answer shed, polytunnel and water harvesting - a No is fine.');
    if (shed === 'Yes' && !picked('shedCond')) return show('err', 'What condition is the shed in?');
    if (!CONFIG.submitUrl) return show('warn', 'Not connected yet - nothing was sent. WhatsApp the photo and plot number to Claire for now.');
    var body = {
      who: who, site: site, plot: plot, look: look,
      shed: shed, shedCondition: shed === 'Yes' ? picked('shedCond') : '',
      polytunnel: poly,
      water: water, waterWhat: water === 'Yes' ? pickedAll('waterWhat') : [],
      flags: pickedAll('flag'), note: $('note').value.trim(),
      photo: photo ? photo.base64 : '', photoType: 'image/jpeg', sentAt: new Date().toISOString()
    };
    $('send').disabled = true; show('warn', 'Sending...');
    fetch(CONFIG.submitUrl, { method: 'POST', body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error(j && j.error ? j.error : 'not saved');
        remember('who', who);
        show('ok', 'Logged: ' + site + ' plot ' + plot + '. Thank you.' + (photo ? ' Photo filed.' : ''));
        $('after').classList.remove('hidden');
        $('send').classList.add('hidden');
      })
      .catch(function (e) { show('err', 'Did not go through (' + e.message + '). Try again, or WhatsApp it to Claire.'); $('send').disabled = false; });
  }

  fill();
  $('site').addEventListener('change', function () { fillPlots(); });
  $('who').addEventListener('change', function () {
    $('whoOther').classList.toggle('hidden', $('who').value !== 'other');
    var rep = REPS.filter(function (r) { return r.name === $('who').value; })[0];
    if (rep && rep.site && !$('site').value) { $('site').value = rep.site; fillPlots(); }
  });
  $('whoChange').addEventListener('click', function () { $('whoBar').classList.add('hidden'); $('whoFs').classList.remove('hidden'); });
  $('shed').addEventListener('change', function () { $('shedSub').classList.toggle('hidden', picked('shed') !== 'Yes'); });
  $('water').addEventListener('change', function () { $('waterSub').classList.toggle('hidden', picked('water') !== 'Yes'); });
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
