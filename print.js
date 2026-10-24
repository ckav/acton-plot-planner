/* Walk sheet: a printable page per site. Page 1 is the numbers-only map where one is drawn;
   then a table with one row per plot from the record, with tick boxes for the walk. Numbers only. */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var SITES = window.PLANNER_SITES || [];
  var PLOTS = window.PLANNER_PLOTS || {};
  var ORDER = ['Bromyard', 'Chestnuts', 'Perryn', 'The Vale'];
  var ROWS_PER_PAGE = 18;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var el = function (name, attrs, text) { var e = document.createElementNS(NS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };

  function mapSvg(site) {
    var s = SITES.filter(function (x) { return (x.recordName || x.name) === site; })[0];
    if (!s) return null;
    var svg = el('svg', { viewBox: '0 0 ' + s.imageW + ' ' + s.imageH, role: 'img', 'aria-label': s.name + ' map' });
    svg.appendChild(el('image', { href: s.image, x: 0, y: 0, width: s.imageW, height: s.imageH, preserveAspectRatio: 'none' }));
    s.paths.forEach(function (p) { svg.appendChild(el('rect', { x: p.cx - p.len / 2, y: p.cy - p.w / 2, width: p.len, height: p.w, transform: 'rotate(' + p.ang + ' ' + p.cx + ' ' + p.cy + ')', fill: 'rgba(245,243,238,0.5)', stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 1.5 })); });
    s.plots.forEach(function (p) {
      svg.appendChild(el('rect', { x: p.cx - p.w / 2, y: p.cy - p.h / 2, width: p.w, height: p.h, transform: 'rotate(' + p.ang + ' ' + p.cx + ' ' + p.cy + ')', fill: 'none', stroke: '#FFFFFF', 'stroke-width': 5, 'stroke-dasharray': p.kind === 'half' ? '14 10' : 'none', style: 'filter: drop-shadow(0 0 1.5px rgba(0,0,0,1))' }));
      svg.appendChild(el('text', { x: p.cx, y: p.cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 46, 'font-weight': 700, 'font-family': 'system-ui, sans-serif', fill: '#FFFFFF', stroke: '#000', 'stroke-width': 9, 'paint-order': 'stroke', 'stroke-linejoin': 'round' }, p.id.toUpperCase()));
    });
    return svg;
  }

  function draw() {
    var site = $('site').value, date = $('date').value || '', pages = $('pages');
    pages.innerHTML = '';
    var plots = PLOTS[site] || [];
    var head = '<h1>Walk sheet - ' + esc(site) + '</h1><div class="sub">Acton Gardening Association. Date: ' + (date ? esc(date) : '____________') + ' &nbsp; With: ____________________ &nbsp; Plots: ' + plots.length + '. Numbers from the record; cross out and write the real number where it differs.</div>';
    var svg = mapSvg(site);
    if (svg) {
      var pg = document.createElement('div'); pg.className = 'page';
      pg.innerHTML = head + '<div class="mapwrap"></div><div class="key">Dashed = half plot. Draw sheds, tanks, taps, gates and anything else straight onto this. North is up; the entrance is marked on the planner.</div>';
      pg.querySelector('.mapwrap').appendChild(svg);
      pages.appendChild(pg);
    }
    for (var i = 0; i < plots.length; i += ROWS_PER_PAGE) {
      var chunk = plots.slice(i, i + ROWS_PER_PAGE);
      var pg2 = document.createElement('div'); pg2.className = 'page';
      pg2.innerHTML = (i === 0 && !svg ? head : '<h1>Walk sheet - ' + esc(site) + '</h1><div class="sub">Plots ' + esc(chunk[0]) + ' to ' + esc(chunk[chunk.length - 1]) + (date ? ' - ' + esc(date) : '') + '</div>') +
        '<table><colgroup><col style="width:11mm"><col style="width:22mm"><col style="width:26mm"><col style="width:12mm"><col style="width:12mm"><col style="width:30mm"><col style="width:26mm"><col></colgroup>' +
        '<thead><tr><th>Plot</th><th>Looks</th><th>Shed</th><th>GH</th><th>PT</th><th>Water</th><th>Flags</th><th>Notes / photo no.</th></tr></thead><tbody>' +
        chunk.map(function (p) {
          return '<tr><td class="plot">' + esc(p) + '</td>' +
            '<td class="tick">Good / Needs work<br>Neglected / Vacant</td>' +
            '<td class="tick">N / Y: good<br>roof / unsafe</td>' +
            '<td class="tick">N / Y</td><td class="tick">N / Y</td>' +
            '<td class="tick">N / Y: gutters<br>butt on / butt off / other</td>' +
            '<td class="tick">2+ structures<br>no number / hedge<br>gate locked / rubbish</td><td></td></tr>';
        }).join('') + '</tbody></table>' +
        '<div class="foot"><span>Circle what applies. One photo per plot from the path, number in shot; write the photo number in the last column if your camera shows one.</span><span>Page ' + (Math.floor(i / ROWS_PER_PAGE) + 1 + (svg ? 1 : 0)) + '</span></div>';
      pages.appendChild(pg2);
    }
  }

  var sel = $('site');
  ORDER.forEach(function (s) { var o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });
  var q = new URLSearchParams(location.search).get('site');
  if (q && ORDER.indexOf(q) >= 0) sel.value = q;
  var d = new Date(); $('date').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  sel.addEventListener('change', draw);
  $('date').addEventListener('change', draw);
  $('print').addEventListener('click', function () { window.print(); });
  draw();
})();
