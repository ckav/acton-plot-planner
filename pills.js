/* Status pills, shared by the plot card on the map (planner.js) and the plot check form (check.js), so
   the two always look and work the same. Agreed with Claire 27 Oct 2026:
     Fine             green circle
     May need a hand  amber triangle - a job for the holder or a working party, not a judgement
     Unsafe           red square - only when something could fall or hurt someone
     Not checked      grey ring
     Not there        no pill on the card
   Amber and red carry reasons (tick all that apply, or own words) and can carry a help request, which the
   receiver turns into a site job. Shape and lightness differ as well as colour, for colour-blind reps and
   for sunlight; the words are one tap away and read out by screen readers.
   AGA_PILLS.view(items, open)          the card's pill row; open = the item whose words are showing
   AGA_PILLS.editor(el, items, onChange) the form's editor; returns { changes(), count(), reset(items) } */
(function () {
  var ITEMS = ['Plot', 'Shed', 'Greenhouse', 'Polytunnel', 'Water', 'Fruit trees'];
  var STATUSES = ['Fine', 'May need a hand', 'Unsafe', 'Not there'];
  var REASONS = {
    Plot: { 'May need a hand': ['Partly cultivated or untidy', 'Not being worked', 'Vacant - nobody on it'], Unsafe: ['Hazard on the plot'] },
    Shed: { 'May need a hand': ['Roof not watertight', 'Door or lock broken', 'Rotten timber'], Unsafe: ['Leaning or falling down'] },
    Greenhouse: { 'May need a hand': ['Broken glass or panels', 'Frame damaged'], Unsafe: ['Glass loose or falling'] },
    Polytunnel: { 'May need a hand': ['Cover torn', 'Frame damaged'], Unsafe: ['Frame collapsing'] },
    Water: { 'May need a hand': ['No water harvesting', 'Gutters but no butt', 'Butt not connected', 'Butt leaking or no lid'], Unsafe: [] },
    'Fruit trees': { 'May need a hand': ['Need pruning', 'Over a path or neighbour', 'Dead branches'], Unsafe: ['Branch about to fall'] }
  };
  var TONE = { 'Fine': 'g', 'May need a hand': 'a', 'Unsafe': 'r', 'Not checked': 'n', '': 'n', 'Not there': 'x' };
  var WORD = { 'Fine': 'Fine', 'May need a hand': 'May need a hand', 'Unsafe': 'Unsafe - act now', 'Not there': 'Not there', 'Not checked': 'Not checked', '': 'Not checked' };
  var ICON = {
    g: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#1F7A4A"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    a: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5L22.5 21h-21z" fill="#C26A06"/><path d="M12 9.5v5M12 17.6v.4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>',
    r: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="#A11D1D"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>',
    n: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="#8E8C82" stroke-width="2.5"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="#B5B3A9" stroke-width="2" stroke-dasharray="3 3"/></svg>'
  };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var needsWhy = function (s) { return s === 'May need a hand' || s === 'Unsafe'; };

  var css = document.createElement('style');
  css.textContent =
    '.pst-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }' +
    '.pst { min-height: 44px; display: inline-flex; align-items: center; gap: 7px; padding: 0 14px 0 10px; border-radius: 22px; cursor: pointer; font: 600 14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; border: 1.5px solid; }' +
    '.pst.on { border-width: 2.5px; }' +
    '.pst.t-g { background: #E4F0E7; color: #14532F; border-color: #1F7A4A; }' +
    '.pst.t-a { background: #FFF1D6; color: #6B3A00; border-color: #C26A06; }' +
    '.pst.t-r { background: #F8E1E1; color: #7A1414; border-color: #A11D1D; }' +
    '.pst.t-n { background: #fff; color: #4A4944; border-color: #C9C7BD; }' +
    '.pst.t-x { background: #fff; color: #6E6D66; border-color: #DAD8CF; border-style: dashed; font-weight: 500; }' +
    '.pst .help { font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 9px; background: #fff; border: 1px solid #C26A06; }' +
    '.pst-words { font-size: 14px; line-height: 1.45; background: #F4F3EE; border-radius: 8px; padding: 8px 10px; margin: 0 0 10px; }' +
    '.pst-panel { background: #F4F3EE; border-radius: 10px; padding: 12px; display: grid; gap: 10px; margin: 0 0 10px; }' +
    '.pst-panel h4 { margin: 0; font-size: 16px; }' +
    '.pst-sts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }' +
    '.pst-st { min-height: 44px; padding: 0 10px; border-radius: 10px; text-align: left; cursor: pointer; font: 600 14px system-ui, sans-serif; background: #fff; color: #1A1A1A; border: 1px solid #DAD8CF; display: flex; align-items: center; gap: 8px; }' +
    '.pst-st.on.t-g { background: #E4F0E7; border: 2px solid #1F7A4A; } .pst-st.on.t-a { background: #FFF1D6; border: 2px solid #C26A06; }' +
    '.pst-st.on.t-r { background: #F8E1E1; border: 2px solid #A11D1D; } .pst-st.on.t-x { background: #fff; border: 2px solid #5B5A54; }' +
    '.pst-lbl { font-size: 12px; font-weight: 600; color: #5B5A54; text-transform: uppercase; letter-spacing: .04em; }' +
    '.pst-rs { display: flex; flex-wrap: wrap; gap: 6px; }' +
    '.pst-r { min-height: 40px; padding: 0 12px; border-radius: 20px; cursor: pointer; font: 500 14px system-ui, sans-serif; background: #fff; color: #1A1A1A; border: 1px solid #C9C7BD; }' +
    '.pst-r.on { background: #1A1A1A; color: #fff; border-color: #1A1A1A; }' +
    '.pst-panel input[type=text] { width: 100%; box-sizing: border-box; font: 15px system-ui, sans-serif; min-height: 44px; padding: 0 10px; border: 1px solid #DAD8CF; border-radius: 8px; background: #fff; }' +
    '.pst-help { min-height: 44px; display: flex; align-items: center; gap: 10px; padding: 0 12px; border-radius: 10px; cursor: pointer; font: 600 14px system-ui, sans-serif; background: #fff; color: #1A1A1A; border: 1px solid #DAD8CF; text-align: left; }' +
    '.pst-help .box { width: 18px; height: 18px; flex: 0 0 auto; border-radius: 4px; box-sizing: border-box; border: 2px solid #C26A06; background: #fff; }' +
    '.pst-help.on { border-color: #C26A06; } .pst-help.on .box { background: #C26A06; }' +
    // The form's rows: like the flag rows, white cards, the whole row a 52px tap target.
    '.pst-progress { margin: 0 0 8px; font-size: 14px; color: #5B5A54; }' +
    '.pst-list { display: grid; gap: 8px; }' +
    '.pst-card { background: #fff; border: 1px solid #DAD8CF; border-radius: 10px; overflow: hidden; }' +
    '.pst-card.c-r { background: #FCF1F1; border-color: #A11D1D; border-left-width: 5px; }' +
    '.pst-card.c-x { border-style: dashed; }' +
    '.pst-card.open { border: 2px solid #1F5A3A; background: #F2F8F3; }' +
    '.pst-card.flash { border-color: #1F7A4A; background: #E4F0E7; transition: background .3s; }' +
    '.pst-rowbtn { width: 100%; min-height: 52px; display: flex; align-items: center; gap: 10px; padding: 8px 14px; background: none; border: 0; cursor: pointer; font: 600 17px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1A1A1A; text-align: left; }' +
    '.pst-name { flex: 1 1 auto; min-width: 0; }' +
    '.pst-val { display: inline-flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 600; text-align: right; }' +
    '.pst-val.v-g { color: #14532F; } .pst-val.v-a { color: #6B3A00; } .pst-val.v-r { color: #7A1414; } .pst-val.v-x { color: #4A4944; }' +
    '.pst-val.v-none { color: #5B5A54; font-weight: 500; }' +
    '.pst-saved { color: #14532F; font-size: 15px; font-weight: 700; }' +
    '.pst-ask { font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 9px; background: #FFF1D6; color: #6B3A00; border: 1px solid #C26A06; white-space: nowrap; }' +
    '.pst-chev { flex: 0 0 auto; width: 18px; text-align: center; font-size: 22px; line-height: 1; color: #5B5A54; }' +
    '.pst-card.open .pst-chev { transform: rotate(90deg); }' +
    '.pst-body { padding: 0 12px 12px; display: grid; gap: 10px; }' +
    '.pst-q { font-size: 15px; font-weight: 600; color: #1F5A3A; }' +
    '.pst-sts .pst-st { min-height: 48px; }' +
    '.pst-val.v-last { color: #5B5A54; font-weight: 500; }' +
    '.pst-same { min-height: 48px; display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 10px; cursor: pointer; text-align: left; font: 600 15px system-ui, sans-serif; background: #fff; color: #1A1A1A; border: 2px solid #1F5A3A; }' +
    // Reasons and the help tick look like the "Anything else to flag?" checkbox rows.
    '.pst-rs { display: grid; gap: 8px; }' +
    '.pst-rc, .pst-help { min-height: 48px; display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 10px; cursor: pointer; text-align: left; font: 500 16px system-ui, sans-serif; background: #fff; color: #1A1A1A; border: 1px solid #DAD8CF; }' +
    '.pst-rc .box, .pst-help .box { width: 22px; height: 22px; flex: 0 0 auto; border-radius: 4px; box-sizing: border-box; border: 2px solid #767570; background: #fff; }' +
    '.pst-rc.on, .pst-help.on { border-color: #1F5A3A; background: #E4F0E7; }' +
    '.pst-rc.on .box, .pst-help.on .box { border-color: #1F5A3A; background: #1F5A3A url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M6 12.5l4 4 8-9%27 fill=%27none%27 stroke=%27white%27 stroke-width=%273%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E") center/16px no-repeat; }' +
    '.pst-done { min-height: 48px; border-radius: 24px; border: 1px solid #1F5A3A; background: #1F5A3A; color: #fff; font: 600 16px system-ui, sans-serif; cursor: pointer; }' +
    '@media (max-width: 380px) { .pst-rowbtn { font-size: 16px; gap: 8px; padding: 8px 10px; } .pst-val { font-size: 14px; } }';
  document.head.appendChild(css);

  function words(name, it) {
    var w = WORD[it.status || ''] || it.status;
    if (it.why) w += ' - ' + it.why;
    if (it.help) w += '. Help requested: ' + it.help;
    return w;
  }
  function pill(name, it, on, extraClass) {
    var t = TONE[it.status || ''] || 'n';
    return '<button type="button" class="pst t-' + t + (on ? ' on' : '') + (extraClass || '') + '" data-item="' + esc(name) + '" aria-label="' + esc(name + ': ' + words(name, it)) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      ICON[t] + '<span>' + esc(name) + '</span>' + (it.help ? '<span class="help">help asked</span>' : '') + '</button>';
  }

  // The card: Plot and Water always show (grey when not checked); the rest only when they are there.
  function view(items, open) {
    items = items || {};
    var html = ITEMS.filter(function (n) {
      var s = (items[n] || {}).status || '';
      return n === 'Plot' || n === 'Water' || (s && s !== 'Not there');
    }).map(function (n) { return pill(n, items[n] || {}, open === n); }).join('');
    var shown = open && items[open] ? '<p class="pst-words"><strong>' + esc(open) + ':</strong> ' + esc(words(open, items[open])) + '</p>' : '';
    return '<div class="pst-row">' + html + '</div>' + shown;
  }

  // The form: one full-width row per item (UX briefs, briefs/). A status loaded from the last check shows muted
  // as "Last time: Fine" until the rep sets or confirms it today; then it shows in full colour. Each open row
  // offers "Same as last time" first when there is a last time. Fine, Not there and Same as last time close the
  // row with "Saved"; amber and red stay open for the reasons and help, with Done.
  // Items set or confirmed today are what gets sent, in the receiver's shape: { Shed: { status, why: [..], help } }.
  function editor(el, start, onChange) {
    var prev = {}, cur = {}, today = {}, open = null, flash = null, flashTimer = null;
    var answered = function (s) { return !!s && s !== 'Not checked'; };
    function parse(n, it) {
      var why = String(it.why || ''), listed = (REASONS[n][it.status] || []);
      var parts = why ? why.split(', ') : [];
      return { status: it.status || '', why: parts.filter(function (p) { return listed.indexOf(p) >= 0; }),
        own: parts.filter(function (p) { return listed.indexOf(p) < 0; }).join(', '), helpOn: !!it.help, help: it.help === 'yes' ? '' : (it.help || '') };
    }
    var copy = function (x) { return { status: x.status, why: x.why.slice(), own: x.own, helpOn: x.helpOn, help: x.help }; };
    function load(items) {
      prev = {}; cur = {}; today = {}; open = null; flash = null;
      ITEMS.forEach(function (n) { prev[n] = parse(n, (items || {})[n] || {}); cur[n] = copy(prev[n]); });
      draw();
    }
    function done() { return ITEMS.filter(function (n) { return today[n]; }); }
    function valueHtml(n) {
      var x = cur[n];
      if (flash === n) return '<span class="pst-saved">Saved &#10003;</span>';
      if (today[n] && answered(x.status)) { var t = TONE[x.status]; return '<span class="pst-val v-' + t + '">' + ICON[t] + esc(x.status === 'Unsafe' ? 'Unsafe' : WORD[x.status]) + '</span>'; }
      if (answered(prev[n].status)) return '<span class="pst-val v-last">' + ICON.n + 'Last time: ' + esc(prev[n].status === 'Unsafe' ? 'Unsafe' : WORD[prev[n].status]) + '</span>';
      return '<span class="pst-val v-none">Not checked yet</span>';
    }
    function draw(focusItem) {
      var html = '<p class="pst-progress" aria-live="polite">' + done().length + ' of ' + ITEMS.length + ' checked today</p><div class="pst-list">' + ITEMS.map(function (n) {
        var x = cur[n], isOpen = open === n, id = 'pst-' + n.replace(/\W/g, '');
        var t = today[n] && answered(x.status) ? TONE[x.status] : 'n';
        var row = '<div class="pst-card c-' + t + (isOpen ? ' open' : '') + (flash === n ? ' flash' : '') + '">' +
          '<button type="button" class="pst-rowbtn" data-item="' + esc(n) + '" aria-expanded="' + isOpen + '" aria-controls="' + id + '">' +
          '<span class="pst-name">' + esc(n) + '</span>' + valueHtml(n) + (x.helpOn ? '<span class="pst-ask">help asked</span>' : '') +
          '<span class="pst-chev" aria-hidden="true">&#8250;</span></button>';
        if (isOpen) {
          var reasons = REASONS[n][x.status] || [], p = prev[n];
          row += '<div class="pst-body" id="' + id + '"><div class="pst-q">' + esc(n) + ' - what state is it in?</div>' +
            (answered(p.status) ? '<button type="button" class="pst-same" data-same>' + ICON[TONE[p.status]] + '<span>Same as last time - ' + esc(WORD[p.status]) + (p.why.length || p.own ? ': ' + esc(p.why.concat(p.own ? [p.own] : []).join(', ')) : '') + '</span></button>' : '') +
            '<div class="pst-sts">' +
            STATUSES.map(function (s) { var tt = TONE[s], on = today[n] && x.status === s; return '<button type="button" class="pst-st t-' + tt + (on ? ' on' : '') + '" data-st="' + esc(s) + '" aria-pressed="' + on + '">' + ICON[tt] + esc(WORD[s]) + '</button>'; }).join('') + '</div>';
          if (today[n] && needsWhy(x.status)) {
            row += '<div class="pst-lbl">Why - tick all that apply</div>' +
              (reasons.length ? '<div class="pst-rs">' + reasons.map(function (r) { var on = x.why.indexOf(r) >= 0; return '<button type="button" class="pst-rc' + (on ? ' on' : '') + '" data-r="' + esc(r) + '" role="checkbox" aria-checked="' + on + '"><span class="box"></span><span>' + esc(r) + '</span></button>'; }).join('') + '</div>' : '') +
              '<input type="text" data-own placeholder="Or in your own words" aria-label="Why, in your own words" value="' + esc(x.own) + '">' +
              '<button type="button" class="pst-help' + (x.helpOn ? ' on' : '') + '" data-help role="checkbox" aria-checked="' + x.helpOn + '"><span class="box"></span><span>Help requested - add it to the site jobs</span></button>' +
              (x.helpOn ? '<label class="pst-lbl" for="pst-help-' + id + '">What help, in a sentence</label><input type="text" id="pst-help-' + id + '" data-helptext placeholder="e.g. has roofing felt, needs help fitting" value="' + esc(x.help) + '">' : '') +
              '<button type="button" class="pst-done" data-done>Done</button>';
          }
          row += '</div>';
        }
        return row + '</div>';
      }).join('') + '</div>';
      el.innerHTML = html;
      if (focusItem) { var f = el.querySelector('[data-item="' + focusItem + '"]'); if (f && f.focus) f.focus(); }
      onChange && onChange(done().length);
    }
    function closeWithFlash(n) {
      open = null; flash = n; draw(n);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { flash = null; draw(); }, 1500);
    }
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b || !el.contains(b)) return;
      if (b.hasAttribute('data-item')) { var n = b.getAttribute('data-item'); open = open === n ? null : n; flash = null; return draw(n); }
      var x = cur[open]; if (!x) return;
      if (b.hasAttribute('data-same')) { cur[open] = copy(prev[open]); today[open] = true; return closeWithFlash(open); }
      if (b.hasAttribute('data-st')) {
        var s = b.getAttribute('data-st');
        if (s === prev[open].status) cur[open] = copy(prev[open]);
        else if (s !== x.status || !today[open]) { x.status = s; x.why = []; x.own = ''; x.helpOn = false; x.help = ''; }
        today[open] = true;
        return needsWhy(s) ? draw() : closeWithFlash(open);
      }
      if (b.hasAttribute('data-done')) return closeWithFlash(open);
      if (b.hasAttribute('data-r')) { var r = b.getAttribute('data-r'); x.why = x.why.indexOf(r) >= 0 ? x.why.filter(function (y) { return y !== r; }) : x.why.concat([r]); return draw(); }
      if (b.hasAttribute('data-help')) { x.helpOn = !x.helpOn; return draw(); }
    });
    el.addEventListener('input', function (ev) {
      var x = cur[open]; if (!x) return;
      if (ev.target.hasAttribute('data-own')) x.own = ev.target.value;
      if (ev.target.hasAttribute('data-helptext')) x.help = ev.target.value;
      onChange && onChange(done().length);
    });
    load(start);
    return {
      reset: load,
      // "Nothing's changed": confirm every item that had a status last time, as if "Same as last time" were tapped on each.
      hasLast: function () { return ITEMS.some(function (n) { return answered(prev[n].status); }); },
      confirmAll: function () { ITEMS.forEach(function (n) { if (answered(prev[n].status) && !today[n]) { cur[n] = copy(prev[n]); today[n] = true; } }); open = null; draw(); },
      count: function () { return done().length; },
      changes: function () {
        var out = {};
        done().forEach(function (n) {
          var x = cur[n], keep = needsWhy(x.status);
          out[n] = { status: x.status || 'Not checked', why: keep ? x.why.concat(x.own.trim() ? [x.own.trim()] : []) : [], help: keep && x.helpOn ? (x.help.trim() || 'Help requested') : '' };
        });
        return out;
      }
    };
  }

  window.AGA_PILLS = { ITEMS: ITEMS, view: view, editor: editor, words: words };
})();
