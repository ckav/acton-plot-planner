/* Update my details: the member's own page. No sign-in and no members' password (gate.js is not on
   this page): the member types their email, the association's "AGA members" Apps Script emails them a
   link that works once and for 24 hours, and that link (update.html?t=...) opens their own row here.
   The token is read from the address bar once and is never kept on the phone.
   Three views, one at a time: ask (the email box), edit (their details) and done. On each change of
   view the heading takes focus, so a screen reader starts at the top.
   Posts go to window.PLANNER_CONFIG.memberUrl in the same shape as check.js (no content-type header,
   so no preflight). While memberUrl is blank the page says it is not ready and shows no form. */
(function () {
  var CONFIG = window.PLANNER_CONFIG || {};
  var URL = CONFIG.memberUrl || '';
  var TOKEN = new URLSearchParams(location.search).get('t') || '';
  var INBOX = 'actongardening@gmail.com';
  var $ = function (id) { return document.getElementById(id); };
  var MSG = {
    sent: 'Thank you. If that address is the one we have for you, your link is on its way. Give it a few minutes and check your junk or spam folder too. If nothing arrives, email ' + INBOX + '.',
    email: 'Type your email address',
    expired: 'That link has expired or has already been used. Ask for a new one below.',
    offline: 'No connection. Try again when you have a signal.',
    wrong: 'Something went wrong at our end. Try again later or email ' + INBOX + '.',
    notSaved: 'Could not save. Try again, or email ' + INBOX + ' with your changes.',
    name: 'Type your name (up to 80 letters).',
    badEmail: 'Check the email address.',
    phone: 'Check the phone number: digits, spaces, + and brackets only.'
  };

  function view(name) {
    ['loading', 'ask', 'edit', 'done'].forEach(function (v) { $(v).classList.toggle('hidden', v !== name); });
    var h = $(name).querySelector('h1');
    if (h) h.focus();
  }
  // Shows a message; the association's address inside it becomes a tap-to-email link.
  function say(id, kind, text) {
    var m = $(id);
    m.className = 'msg ' + kind;
    m.textContent = '';
    text.split(INBOX).forEach(function (part, i) {
      if (i) { var a = document.createElement('a'); a.className = 'mail'; a.href = 'mailto:' + INBOX; a.textContent = INBOX; m.appendChild(a); }
      if (part) m.appendChild(document.createTextNode(part));
    });
  }
  function post(body) { return fetch(URL, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }

  // View 1: ask for a link. The page says the same thing whether or not the address is on the list.
  function askLink(ev) {
    ev.preventDefault();
    var email = $('askEmail').value.trim();
    if (!email) { say('askMsg', 'err', MSG.email); return $('askEmail').focus(); }
    $('askSend').disabled = true;
    post({ action: 'request', email: email })
      .then(function (j) {
        if (j && j.error === 'email') { say('askMsg', 'err', MSG.email); return $('askEmail').focus(); }
        say('askMsg', 'ok', MSG.sent);   // the same words whatever the server did, so nobody learns who is on the list
      })
      .catch(function () { say('askMsg', 'err', MSG.offline); })
      .then(function () { $('askSend').disabled = false; });
  }

  // View 2: the member's own row, fetched with the token from the link.
  function load() {
    view('loading');
    fetch(URL + '?action=record&t=' + encodeURIComponent(TOKEN))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) { view('ask'); return say('askMsg', 'err', j && j.error === 'expired' ? MSG.expired : MSG.wrong); }
        $('plotLine').textContent = j.plots ? 'Plot: ' + j.plots : 'No plot on record';
        $('name').value = j.name || '';
        $('email').value = j.email || '';
        $('phone').value = j.phone || '';
        $('shop').checked = !!j.shop;
        $('rota').checked = !!j.rota;
        $('news').checked = !!j.news;
        view('edit');
      })
      .catch(function () { view('ask'); say('askMsg', 'err', MSG.offline); });
  }

  function save(ev) {
    ev.preventDefault();
    var body = {
      action: 'save', t: TOKEN,
      name: $('name').value.trim(), email: $('email').value.trim(), phone: $('phone').value.trim(),
      shop: $('shop').checked, rota: $('rota').checked, news: $('news').checked
    };
    $('save').disabled = true; say('editMsg', 'warn', 'Saving...');
    post(body)
      .then(function (j) {
        if (j && j.ok) return view('done');
        var err = j && j.error;
        if (err === 'expired') { view('ask'); return say('askMsg', 'err', MSG.expired); }
        if (err === 'name') { say('editMsg', 'err', MSG.name); return $('name').focus(); }
        if (err === 'email') { say('editMsg', 'err', MSG.badEmail); return $('email').focus(); }
        if (err === 'phone') { say('editMsg', 'err', MSG.phone); return $('phone').focus(); }
        say('editMsg', 'err', MSG.wrong);
      })
      .catch(function () { say('editMsg', 'err', MSG.notSaved); })
      .then(function () { $('save').disabled = false; });
  }

  if (!URL) { $('notready').classList.remove('hidden'); return; }
  $('askForm').addEventListener('submit', askLink);
  $('editForm').addEventListener('submit', save);
  if (TOKEN) load(); else view('ask');
})();
