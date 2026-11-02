/* Members' password screen, on every page. Loaded in the head after data/config.js, so nothing shows
   before it decides. The password is checked by the association's Apps Script (Settings tab), never
   here, and the phone remembers it after the first time. A rep link (?key=...) opens the page without
   it. On each visit the remembered password is re-checked quietly; if the committee has changed it,
   the screen comes back. With no signal the page stays open, so a walk round the site still works.
   Pages call AGA_GATE.auth() for the query string to add to reads, AGA_GATE.pw() for messages, and
   AGA_GATE.relock() when the receiver says the password is wrong. */
(function () {
  var CONFIG = window.PLANNER_CONFIG || {};
  var root = document.documentElement;
  var get = function (k) { try { return JSON.parse(localStorage.getItem('aga-' + k) || 'null'); } catch (e) { return null; } };
  var set = function (k, v) { try { if (v == null) localStorage.removeItem('aga-' + k); else localStorage.setItem('aga-' + k, JSON.stringify(v)); } catch (e) {} };
  var urlKey = new URLSearchParams(location.search).get('key');
  var key = function () { return urlKey || get('key') || ''; };
  var pw = function () { return get('pw') || ''; };
  var auth = function () { return '&pw=' + encodeURIComponent(pw()) + '&key=' + encodeURIComponent(key()); };
  var MSG = {
    password: 'That password did not work. It is in the members\' newsletter, or ask your site rep.',
    changed: 'The password has changed. Type the new one - it is in the members\' newsletter, or ask your site rep.',
    busy: 'Too many wrong tries just now. Wait 15 minutes and try again.',
    offline: 'No connection. Try again when you have a signal.'
  };

  window.AGA_GATE = { pw: pw, key: key, auth: auth, relock: function () { set('pw', null); lock(MSG.changed); } };
  if (!CONFIG.submitUrl) return;   // demo with no receiver: nothing to protect

  var style = document.createElement('style');
  style.textContent =
    'html.aga-locked body > *:not(#aga-gate) { display: none !important; }' +
    '#aga-gate { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; background: #F4F3EE; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1A1A1A; }' +
    '#aga-gate form { background: #fff; border: 1px solid #DAD8CF; border-radius: 12px; padding: 24px 20px; width: 100%; max-width: 380px; }' +
    '#aga-gate h1 { font-size: 22px; margin: 0 0 4px; }' +
    '#aga-gate p { margin: 0 0 16px; color: #5B5A54; }' +
    '#aga-gate label { display: block; font-weight: 600; margin-bottom: 6px; }' +
    '#aga-gate input { font: inherit; font-size: 20px; width: 100%; padding: 12px; border: 1px solid #9C9A90; border-radius: 8px; min-height: 52px; }' +
    '#aga-gate button { font: 600 18px system-ui, sans-serif; width: 100%; margin-top: 14px; min-height: 52px; border: 0; border-radius: 8px; background: #1F5A3A; color: #fff; cursor: pointer; }' +
    '#aga-gate button:disabled { opacity: .6; }' +
    '#aga-gate .gmsg { margin: 14px 0 0; padding: 10px 12px; border-radius: 8px; background: #FFF1D6; color: #5C3D00; }' +
    '#aga-gate .gmsg:empty { display: none; }';
  document.head.appendChild(style);

  var gate = null;
  function lock(text) {
    root.classList.add('aga-locked');
    if (document.body) build(text); else document.addEventListener('DOMContentLoaded', function () { build(text); });
  }
  function unlock() {
    root.classList.remove('aga-locked');
    if (gate) { gate.parentNode.removeChild(gate); gate = null; }
  }
  function build(text) {
    if (!gate) {
      gate = document.createElement('div');
      gate.id = 'aga-gate';
      gate.innerHTML = '<form autocomplete="off" novalidate>' +
        '<h1>Plot planner</h1><p>Acton Gardening Association - members only.</p>' +
        '<label for="aga-pw">Members\' password</label>' +
        '<input id="aga-pw" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go">' +
        '<button type="submit">Open the planner</button><p class="gmsg" role="status"></p></form>';
      document.body.insertBefore(gate, document.body.firstChild);
      gate.querySelector('form').addEventListener('submit', submit);
    }
    gate.querySelector('.gmsg').textContent = text || '';
  }
  function check(p, k) {
    return fetch(CONFIG.submitUrl + '?action=unlock&pw=' + encodeURIComponent(p) + '&key=' + encodeURIComponent(k))
      .then(function (r) { return r.json(); });
  }
  function submit(ev) {
    ev.preventDefault();
    var input = gate.querySelector('input'), button = gate.querySelector('button'), typed = input.value.trim();
    if (!typed) { build('Type the password first.'); return; }
    button.disabled = true; build('Checking...');
    check(typed, '').then(function (j) {
      if (j && j.unlocked) { set('pw', typed); unlock(); return; }
      build(MSG[j && j.error] || MSG.password);
    }).catch(function () { build(MSG.offline); })
      .then(function () { if (gate) button.disabled = false; });
  }

  if (!pw() && !key()) { lock(''); return; }
  // Remembered password or rep link: open straight away, then make sure it still works.
  check(pw(), key()).then(function (j) {
    if (j && j.unlocked) return;
    if (j && j.error === 'busy') return;   // someone else guessing; do not throw this phone out
    var hadPw = !!pw();
    set('pw', null); set('key', null);
    lock(!hadPw && j && j.error === 'key' ? 'This rep link has been switched off. Type the members\' password instead.' : MSG.changed);
  }).catch(function () {});
})();
