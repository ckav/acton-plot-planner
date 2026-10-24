/* Plot planner: draws one site's map from data/sites.js and shows a card for the tapped plot.
   No frameworks, no network calls, no personal data. */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var sites = window.PLANNER_SITES || [];
  var layers = { paths: true, outlines: true, numbers: true, sheds: true, water: true, jobs: true };
  var layerNames = { paths: 'Paths', outlines: 'Plot outlines', numbers: 'Plot numbers', sheds: 'Sheds', water: 'Water', jobs: 'Jobs' };
  var markerStyle = {
    job:  { color: '#B45309', layer: 'jobs' },
    shed: { color: '#7C4A1E', layer: 'sheds' },
    tap:  { color: '#1D4ED8', layer: 'water' },
    tank: { color: '#1D4ED8', layer: 'water' },
    gate: { color: '#141413', layer: null }
  };
  var site = sites[0];
  var selected = null;

  var $ = function (id) { return document.getElementById(id); };
  var el = function (name, attrs, text) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  };
  var rot = function (ang, cx, cy) { return 'rotate(' + ang + ' ' + cx + ' ' + cy + ')'; };

  function buildControls() {
    var sel = $('site');
    sel.innerHTML = '';
    sites.forEach(function (s, i) {
      var o = document.createElement('option'); o.value = i; o.textContent = s.name; sel.appendChild(o);
    });
    ['Chestnuts', 'Perryn', 'The Vale'].forEach(function (n) {
      if (sites.some(function (s) { return s.name === n; })) return;
      var o = document.createElement('option'); o.disabled = true; o.textContent = n + ' - not drawn yet'; sel.appendChild(o);
    });
    sel.addEventListener('change', function () { site = sites[+sel.value]; selected = null; draw(); });

    var chips = $('layers');
    chips.innerHTML = '';
    Object.keys(layerNames).forEach(function (key) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = layerNames[key];
      b.setAttribute('aria-pressed', String(layers[key]));
      b.addEventListener('click', function () {
        layers[key] = !layers[key]; b.setAttribute('aria-pressed', String(layers[key])); draw();
      });
      chips.appendChild(b);
    });
  }

  function draw() {
    var svg = $('map');
    svg.innerHTML = '';
    svg.setAttribute('viewBox', '0 0 ' + site.imageW + ' ' + site.imageH);
    svg.setAttribute('aria-label', site.name + ' site map');
    var img = el('image', { href: site.image, x: 0, y: 0, width: site.imageW, height: site.imageH, preserveAspectRatio: 'none' });
    svg.appendChild(img);

    if (layers.paths) site.paths.forEach(function (p) {
      svg.appendChild(el('rect', {
        x: p.cx - p.len / 2, y: p.cy - p.w / 2, width: p.len, height: p.w, rx: 3,
        transform: rot(p.ang, p.cx, p.cy), fill: 'rgba(245,243,238,0.45)', stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 1.5
      }));
    });

    site.plots.forEach(function (p) {
      var isSel = selected === p.id;
      var g = el('g', { transform: rot(p.ang, p.cx, p.cy), style: 'cursor:pointer', role: 'button', tabindex: '0', 'aria-label': 'Plot ' + p.id });
      var r = el('rect', {
        x: p.cx - p.w / 2, y: p.cy - p.h / 2, width: p.w, height: p.h,
        fill: isSel ? 'rgba(255,224,102,0.35)' : 'rgba(0,0,0,0)',
        stroke: isSel ? '#FFE066' : (layers.outlines ? (p.kind === 'half' ? '#FFB020' : '#FFFFFF') : 'none'),
        'stroke-width': isSel ? 6 : 4,
        'stroke-dasharray': (!isSel && p.kind === 'half') ? '14 10' : 'none',
        'paint-order': 'stroke'
      });
      if (layers.outlines && !isSel) r.setAttribute('style', 'filter: drop-shadow(0 0 1px rgba(0,0,0,0.9))');
      g.appendChild(r);
      if (layers.numbers) {
        g.appendChild(el('text', {
          x: p.cx, y: p.cy, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': p.kind === 'half' ? 34 : 42, 'font-weight': 700, 'font-family': 'system-ui, sans-serif',
          fill: '#FFFFFF', stroke: 'rgba(20,20,20,0.85)', 'stroke-width': 8, 'paint-order': 'stroke', 'stroke-linejoin': 'round'
        }, p.id));
      }
      var pick = function () { selected = p.id; draw(); };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
      svg.appendChild(g);
    });

    site.markers.forEach(function (m) {
      var st = markerStyle[m.type] || markerStyle.gate;
      if (st.layer && !layers[st.layer]) return;
      var g = el('g', { 'pointer-events': 'none' });
      g.appendChild(el('circle', { cx: m.x, cy: m.y, r: 11, fill: st.color, stroke: '#FFFFFF', 'stroke-width': 3 }));
      var flip = m.x > site.imageW * 0.72;
      var label = m.code ? (m.code + ' ' + m.label) : m.label;
      if (label.length > 34) label = label.slice(0, 32) + '...';
      g.appendChild(el('text', {
        x: flip ? m.x - 18 : m.x + 18, y: m.y, 'text-anchor': flip ? 'end' : 'start', 'dominant-baseline': 'central',
        'font-size': 24, 'font-weight': 600, 'font-family': 'system-ui, sans-serif',
        fill: '#1A1A1A', stroke: '#FFFFFF', 'stroke-width': 7, 'paint-order': 'stroke', 'stroke-linejoin': 'round'
      }, label));
      svg.appendChild(g);
    });

    drawCard();
    drawJobs();
    $('legend').innerHTML =
      '<span class="key"><span class="sw"></span>Full plot</span>' +
      '<span class="key"><span class="sw half"></span>Half plot</span>' +
      '<span class="key"><span class="sw sel"></span>Selected</span>' +
      '<span class="key"><span class="sw path"></span>Path</span>' +
      '<span class="key"><span class="dot" style="background:#B45309"></span>Job</span>' +
      '<span class="key"><span class="dot" style="background:#7C4A1E"></span>Shed</span>' +
      '<span class="key"><span class="dot" style="background:#1D4ED8"></span>Tap or tank</span>' +
      '<span class="key"><span class="dot" style="background:#141413"></span>Gate</span>';
    $('status').textContent = site.status;
    $('credit').textContent = site.imageCredit + '. Demo for the committee - numbers only, no personal data.';
  }

  function drawCard() {
    var card = $('card');
    var p = site.plots.filter(function (x) { return x.id === selected; })[0];
    if (!p) {
      card.innerHTML = '<div class="eyebrow">Plot card</div><p class="empty">Tap a plot on the map to see its card.</p>' +
        '<p class="note">What the card will hold once the committee record is connected: holder, rent, last check, photos, flags, notes - all looked up by plot number, none of it stored on this page.</p>';
      return;
    }
    var full = site.plots.filter(function (x) { return x.kind === 'full'; }).length;
    var half = site.plots.length - full;
    card.innerHTML =
      '<div class="eyebrow">' + site.name + ' <span class="pill' + (p.kind === 'half' ? ' half' : '') + '">' + (p.kind === 'half' ? 'Half plot' : 'Full plot') + '</span></div>' +
      '<h2>Plot ' + p.id + '</h2>' +
      '<dl>' +
      '<div><dt>Plot holder</dt><dd>In the committee record</dd></div>' +
      '<div><dt>Status</dt><dd>In the committee record</dd></div>' +
      '<div><dt>Rent 2026-27</dt><dd>In the committee record</dd></div>' +
      '<div><dt>Last check</dt><dd>None yet</dd></div>' +
      '<div><dt>Photos</dt><dd>None yet</dd></div>' +
      '<div><dt>Flags</dt><dd>None yet</dd></div>' +
      '</dl>' +
      '<a class="btn" href="check.html?site=' + encodeURIComponent(site.recordName || site.name) + '&plot=' + encodeURIComponent(p.id.toUpperCase()) + '">Check this plot</a>' +
      '<p class="note">' + full + ' full and ' + half + ' half plots drawn on this site. Numbers are provisional until the site rep has walked it.</p>';
  }

  function drawJobs() {
    var box = $('jobs');
    if (!site.jobs || !site.jobs.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="eyebrow">Jobs on this site - whole site, not a plot</div><ol>' +
      site.jobs.map(function (j) { return '<li><span class="jcode">' + j.code + '</span><span>' + j.text + '</span></li>'; }).join('') + '</ol>';
  }

  if (site) { buildControls(); draw(); }
})();
