/* Injected into update.html by page-server.js when the URL has ?probe=<mode>. Runs inside
   headless Chrome, waits for the page to settle, optionally acts like a member (types an email,
   taps Save), then measures the page and writes the result into <pre id="__qa"> as base64 JSON
   so `chrome --dump-dom` carries it back to page.test.js.
   Modes: '' (just look), 'blank' (tap Send with no email), 'ask' (send one@example.com),
   'ask-odd' (server says no), 'ask-down' (connection drops), 'ask-slow' (the fake endpoint takes
   its time, so the "Sending..." state can be seen), 'honeypot' (fill the hidden website box and
   tap Send), 'save' (change fields and tap Save), 'save-drop', 'save-server', 'save-badphone',
   'save-badlandline'.
   Every Send tap records `sending`, a sample taken straight after the tap (one timer tick later):
   the button's label and disabled state and the visible alerts at that moment. Headless Chrome's
   virtual time stands still while a fetch is pending, so that sample is taken mid-request. */
(function () {
  var MODE = window.__QA_MODE || '';
  var out = { mode: MODE, steps: [] };

  function $(sel) { return document.querySelector(sel); }
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    if (r.right <= 0) return false;   // moved off screen to the left (the honeypot)
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    }
    return true;
  }
  function describe(el) {
    var t = (el.textContent || el.value || el.getAttribute('aria-label') || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return el.tagName.toLowerCase() + (el.type ? '[' + el.type + ']' : '') + (el.id ? '#' + el.id : '') + (t ? ' "' + t + '"' : '');
  }
  function byText(sel, text) {
    var all = document.querySelectorAll(sel);
    for (var i = 0; i < all.length; i++) if (visible(all[i]) && (all[i].textContent || '').trim() === text) return all[i];
    return null;
  }
  // The field a visible <label for> with exactly this text points at.
  function fieldFor(labelText) {
    var all = document.querySelectorAll('label');
    for (var i = 0; i < all.length; i++) if (visible(all[i]) && (all[i].textContent || '').trim().replace(/\s+/g, ' ') === labelText && all[i].htmlFor) return document.getElementById(all[i].htmlFor);
    return null;
  }
  function alerts() {
    return Array.prototype.map.call(document.querySelectorAll('[role=alert], [role=status]'), function (e) { return { id: e.id, role: e.getAttribute('role'), visible: visible(e), text: (e.textContent || '').trim() }; });
  }
  function buttons() {
    return Array.prototype.map.call(document.querySelectorAll('button'), function (b) { return { id: b.id, text: (b.textContent || '').trim(), disabled: b.disabled, visible: visible(b) }; });
  }

  function measure() {
    var small = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      var p = n.parentElement;
      if (!p || p.tagName === 'SCRIPT' || p.tagName === 'STYLE' || !visible(p)) continue;
      var fs = parseFloat(getComputedStyle(p).fontSize);
      if (fs < 16) small.push({ el: describe(p), text: n.nodeValue.trim().slice(0, 50), px: fs });
    }
    var targets = [];
    var els = document.querySelectorAll('button, input, select, textarea, a[href], label.opt, [role=button]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.type === 'hidden' || !visible(el)) continue;
      var box = el;
      if ((el.type === 'checkbox' || el.type === 'radio') && el.closest('label')) box = el.closest('label');
      targets.push({ el: describe(el), height: Math.round(box.getBoundingClientRect().height), width: Math.round(box.getBoundingClientRect().width) });
    }
    var ls = {};
    try { for (var k = 0; k < localStorage.length; k++) { var key = localStorage.key(k); ls[key] = localStorage.getItem(key); } } catch (e) { ls.__error = String(e); }
    var email = $('input[type=email]');
    var scripts = Array.prototype.map.call(document.scripts, function (s) { return s.getAttribute('src') || '(inline)'; });
    var sheets = Array.prototype.map.call(document.querySelectorAll('link'), function (l) { return (l.rel || '') + ' ' + (l.getAttribute('href') || ''); });
    var nameLine = $('#nameLine'), roleLine = $('#roleLine'), hp = $('#leave_empty');
    var hpWrap = hp ? hp.closest('div') : null, hpCs = hpWrap ? getComputedStyle(hpWrap) : null, hpLabel = hp ? $('label[for="' + hp.id + '"]') : null;
    var nameStrong = nameLine ? (nameLine.querySelector('strong, b') || nameLine) : null;
    return {
      title: document.title,
      robots: ($('meta[name=robots]') || {}).content || '',
      text: document.body.innerText,
      headings: Array.prototype.filter.call(document.querySelectorAll('h1, h2'), visible).map(function (h) { return h.textContent.trim(); }),
      small: small,
      targets: targets,
      localStorage: ls,
      scripts: scripts,
      links: sheets,
      email: email ? { type: email.type, autocomplete: email.getAttribute('autocomplete'), height: Math.round(email.getBoundingClientRect().height), visible: visible(email) } : null,
      fields: Array.prototype.map.call(document.querySelectorAll('input, textarea'), function (i) { return { id: i.id, name: i.name, type: i.type, value: i.type === 'checkbox' ? i.checked : i.value, visible: visible(i), readonly: i.readOnly, disabled: i.disabled }; }),
      privacyLink: (function () { var a = byText('a', 'How we look after your details'); return a ? a.getAttribute('href') : null; })(),
      anchors: Array.prototype.map.call(document.querySelectorAll('a'), function (a) { return { href: a.getAttribute('href') || '', text: (a.textContent || '').trim(), visible: visible(a), height: Math.round(a.getBoundingClientRect().height) }; }),
      labels: Array.prototype.map.call(document.querySelectorAll('label'), function (l) { var f = l.htmlFor ? document.getElementById(l.htmlFor) : null; return { text: (l.textContent || '').trim().replace(/\s+/g, ' '), for: l.htmlFor || '', forType: f ? f.type : '', visible: visible(l) }; }),
      inputStyles: Array.prototype.filter.call(document.querySelectorAll('input'), function (i) { return visible(i) && i.type !== 'checkbox'; }).map(function (i) { var cs = getComputedStyle(i); return { id: i.id, type: i.type, border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor, ariaLabel: i.getAttribute('aria-label') || '' }; }),
      referrer: ($('meta[name=referrer]') || {}).content || '',
      alerts: alerts(),
      buttons: buttons(),
      // round 2: the name as text, the role line and the honeypot
      nameLine: nameLine ? { tag: nameLine.tagName.toLowerCase(), text: (nameLine.textContent || '').trim(), visible: visible(nameLine), weight: getComputedStyle(nameStrong).fontWeight, fontSize: parseFloat(getComputedStyle(nameStrong).fontSize) } : null,
      roleLine: roleLine ? { text: (roleLine.textContent || '').trim().replace(/\s+/g, ' '), visible: visible(roleLine) } : null,
      honeypot: hp ? {
        tag: hp.tagName.toLowerCase(), type: hp.type, id: hp.id, name: hp.name, value: hp.value,
        tabindex: hp.getAttribute('tabindex'), autocomplete: hp.getAttribute('autocomplete'), ariaHidden: hp.getAttribute('aria-hidden'),
        inAskForm: !!hp.closest('#askForm'),
        label: hpLabel ? (hpLabel.textContent || '').trim() : null,
        wrapper: hpCs ? { tag: hpWrap.tagName.toLowerCase(), position: hpCs.position, left: hpCs.left, width: hpCs.width, height: hpCs.height, overflow: hpCs.overflow } : null,
        right: Math.round(hp.getBoundingClientRect().right),
        visible: visible(hp)
      } : null,
      focused: document.activeElement ? describe(document.activeElement) : '',
      headingTabindex: Array.prototype.filter.call(document.querySelectorAll('h1, h2'), visible).map(function (h) { return h.getAttribute('tabindex'); }),
      url: location.href,
      scrollWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      viewportHeight: window.innerHeight,
      dpr: window.devicePixelRatio
    };
  }

  function finish() {
    out.after = measure();
    var packed = btoa(unescape(encodeURIComponent(JSON.stringify(out))));
    if (window.parent && window.parent !== window) { window.parent.postMessage({ __qa: packed }, '*'); return; }   // inside test/phone.html
    var pre = document.createElement('pre');
    pre.id = '__qa';
    pre.textContent = packed;
    pre.style.display = 'none';
    document.body.appendChild(pre);
  }

  function setValue(el, v) { if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; }
  function tick(el, on) { if (!el) return false; if (el.checked !== on) el.click(); return true; }

  // Taps Send and, one timer tick later (still mid-request: virtual time waits for the fetch), records
  // what the button and the alerts show.
  function tapSend(sendBtn) {
    if (!sendBtn) return;
    sendBtn.click();
    setTimeout(function () {
      out.sendDisabledAfterTap = sendBtn.disabled;
      out.sending = { label: (sendBtn.textContent || '').trim(), disabled: sendBtn.disabled, alerts: alerts().filter(function (a) { return a.visible; }), buttons: buttons() };
    }, 0);
  }

  function act() {
    out.before = measure();
    var sendBtn = byText('button', 'Send me my link');
    var saveBtn = byText('button', 'Save');
    if (MODE === 'blank') {
      out.steps.push('tap Send with empty box: ' + !!sendBtn);
      tapSend(sendBtn);
    } else if (MODE === 'ask' || MODE === 'ask-odd' || MODE === 'ask-down' || MODE === 'ask-slow') {
      var addr = MODE === 'ask' ? 'one@example.com' : MODE === 'ask-odd' ? 'odd@example.com' : MODE === 'ask-down' ? 'down@example.com' : 'slow@example.com';
      out.steps.push('type ' + addr + ': ' + setValue($('input[type=email]'), addr));
      tapSend(sendBtn);
    } else if (MODE === 'honeypot') {
      out.steps.push('fill the honeypot: ' + setValue($('#leave_empty'), 'http://spam.example.com'));
      out.steps.push('type one@example.com: ' + setValue($('input[type=email]'), 'one@example.com'));
      tapSend(sendBtn);
    } else if (MODE === 'save' || MODE === 'save-drop' || MODE === 'save-server' || MODE === 'save-badphone' || MODE === 'save-badlandline') {
      var inputs = Array.prototype.filter.call(document.querySelectorAll('input'), visible);
      var email = inputs.filter(function (i) { return i.type === 'email'; })[0];
      var boxes = inputs.filter(function (i) { return i.type === 'checkbox'; });
      // the fields by their labels, as the contract names them
      var phone = fieldFor('Mobile'), landline = fieldFor('Landline (if you have one)');
      var newPhone = MODE === 'save-badphone' ? 'not a phone' : '07700 900099';
      var newLandline = MODE === 'save-badlandline' ? 'not a landline' : '01632 960099';
      out.steps.push('mobile field: ' + setValue(phone, newPhone) + ', landline field: ' + setValue(landline, newLandline) + ', boxes: ' + boxes.length);
      if (MODE === 'save-drop') setValue(email, 'drop@example.com');
      if (MODE === 'save-server') setValue(email, 'broken@example.com');
      if (boxes.length === 3) { tick(boxes[0], true); tick(boxes[1], true); tick(boxes[2], false); }
      if (saveBtn) { saveBtn.click(); setTimeout(function () { out.saveDisabledAfterTap = saveBtn.disabled; out.saving = { label: (saveBtn.textContent || '').trim(), disabled: saveBtn.disabled, alerts: alerts().filter(function (a) { return a.visible; }) }; }, 0); }
      out.steps.push('tap Save: ' + !!saveBtn);
    }
    setTimeout(finish, 1500);
  }

  function ready() { setTimeout(act, 1200); }
  if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready);
})();
