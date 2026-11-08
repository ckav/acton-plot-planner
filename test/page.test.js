/* Tests for the member page (update.html + update.js) from briefs/us1-build-spec.md, including the
   Stage 3 changes (items 8 to 13). Static checks read the files. Live checks start test/page-server.js
   and drive headless Chrome at phone size (360 x 740): screenshots of the views go to test/screens/
   (gitignored) and an injected probe (test/page-probe.js) reports text sizes, tap targets, wording,
   labels and focus back through --dump-dom. If Chrome is not installed the live checks are skipped
   and say so.
   Headless Chrome on Windows will not open a viewport narrower than about 500px, so the page is
   loaded inside test/phone.html, a 360 x 740 iframe; the screenshots show that frame on grey. */
'use strict';

var nt = require('node:test');
var test = nt.test, before = nt.before, after = nt.after;
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var execFile = require('child_process').execFile;
var serverMod = require('./page-server');

var ROOT = path.join(__dirname, '..');
var HTML = path.join(ROOT, 'update.html');
var JS = path.join(ROOT, 'update.js');
var CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
var SCREENS = path.join(__dirname, 'screens');
var INBOX = 'actongardening@gmail.com';
var pageSkip = fs.existsSync(HTML) && fs.existsSync(JS) ? false : 'update.html / update.js not written yet';

// The agreed wordings (spec items 8 to 12)
var W = {
  askLead: 'Type the email address the association has for you. We will email you a link to your details.',
  askLabel: 'Your email address',
  sent: 'Thank you. If that address is the one we have for you, your link is on its way. Give it a few minutes and check your junk or spam folder too. If nothing arrives, email actongardening@gmail.com.',
  blank: 'Type your email address',
  expired: 'That link has expired or has already been used. Ask for a new one below.',
  noConnection: 'No connection. Try again when you have a signal.',
  server: 'Something went wrong at our end. Try again later or email actongardening@gmail.com.',
  notReady: 'This page is not ready yet. Please try again later, or email actongardening@gmail.com.',
  saveFailed: 'Could not save. Try again, or email actongardening@gmail.com with your changes.',
  noPlot: 'No plot on record',
  emailHint: 'This is where we send your links.',
  privacy: 'We keep your name, contact details and these choices so we can run the allotments. Only the committee sees them. To be removed, email actongardening@gmail.com.',
  done: 'Saved - thank you. You can close this page.'
};

var R = { chrome: false, why: 'not run', shots: {}, probes: {} };
var server = null;
var profile = null;
var PHONE = '/test/phone.html';

function chrome(args, timeoutMs) {
  return new Promise(function (resolve, reject) {
    // Chrome takes 26px of width and 100px of height for the window itself; 526 x 840 gives a 500 x 740 viewport.
    var base = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=526,840', '--force-device-scale-factor=1', '--user-data-dir=' + profile, '--virtual-time-budget=6000', '--disable-extensions'];
    execFile(CHROME, base.concat(args), { timeout: timeoutMs || 45000, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, function (err, stdout, stderr) {
      if (err) return reject(new Error('chrome failed: ' + err.message + '\n' + String(stderr).slice(0, 500)));
      resolve(String(stdout));
    });
  });
}
function probe(query) {
  return chrome(['--dump-dom', server.base + PHONE + query]).then(function (dom) {
    var m = dom.match(/<pre id="__qa"[^>]*>([A-Za-z0-9+\/=]+)<\/pre>/);
    if (!m) throw new Error('probe did not report for ' + query + '; DOM starts: ' + dom.slice(0, 300));
    return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
  });
}
function shot(name, query) {
  var file = path.join(SCREENS, name + '.png');
  return chrome(['--screenshot=' + file, server.base + PHONE + query]).then(function () { R.shots[name] = file; return file; });
}

before(async function () {
  if (pageSkip) return;
  server = await serverMod.start();
  if (!fs.existsSync(CHROME)) { R.why = 'Chrome not found at ' + CHROME; return; }
  fs.mkdirSync(SCREENS, { recursive: true });
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aga-qa-chrome-'));
  try {
    await shot('1-ask', '');
    await shot('2-edit', '?t=good');
    await shot('3-expired', '?t=bad');
    await shot('4-done', '?t=good&probe=save');
    await shot('5-sent', '?probe=ask');
    await shot('6-notready', '?notready=1');
    R.probes.ask = await probe('?probe=');
    R.probes.edit = await probe('?t=good&probe=');
    R.probes.expired = await probe('?t=bad&probe=');
    R.probes.blank = await probe('?probe=blank');
    var sentBefore = server.seen.length;
    R.probes.sent = await probe('?probe=ask');
    R.sentCalls = server.seen.slice(sentBefore);
    R.probes.odd = await probe('?probe=ask-odd');
    R.probes.down = await probe('?probe=ask-down');
    R.probes.notready = await probe('?notready=1&probe=');
    R.probes.broken = await probe('?t=broken&probe=');
    R.probes.noplot = await probe('?t=noplot&probe=');
    R.probes.saveDrop = await probe('?t=good&probe=save-drop');
    R.probes.saveServer = await probe('?t=good&probe=save-server');
    R.probes.saveBadPhone = await probe('?t=good&probe=save-badphone');
    var seenBefore = server.seen.length;
    R.probes.save = await probe('?t=good&probe=save');
    R.saveCalls = server.seen.slice(seenBefore);
    R.chrome = true;
  } catch (e) { R.why = e.message; }
});
after(async function () {
  if (server) await server.close();
  if (profile) { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
});

function live(t) { if (!R.chrome) { t.skip('headless Chrome did not run: ' + R.why); return false; } return true; }
function has(text, wording) { assert.ok(String(text).indexOf(wording) >= 0, 'expected the words "' + wording + '" on the page; page says:\n' + String(text).slice(0, 900)); }
function hasNot(text, wording) { assert.ok(String(text).indexOf(wording) < 0, 'did not expect the words "' + wording + '" on the page; page says:\n' + String(text).slice(0, 900)); }
function bigEnough(m, label) {
  assert.deepStrictEqual(m.small, [], label + ': text under 16px: ' + JSON.stringify(m.small));
  var short = m.targets.filter(function (x) { return x.height < 44; });
  assert.deepStrictEqual(short, [], label + ': tap targets under 44px tall: ' + JSON.stringify(short));
  assert.ok(m.targets.length > 0, label + ': no tap targets found at all');
  assert.ok(m.scrollWidth <= m.viewport, label + ': page scrolls sideways (' + m.scrollWidth + ' > ' + m.viewport + ')');
  assert.strictEqual(m.viewport, 360, label + ': the page was not measured at phone width');
}
// Every actongardening@gmail.com showing on the page is a mailto: link at least 44px tall.
function inboxLinked(m, label) {
  var mentions = (String(m.text).match(/actongardening@gmail\.com/g) || []).length;
  var links = m.anchors.filter(function (a) { return a.visible && /^mailto:actongardening@gmail\.com/i.test(a.href); });
  assert.ok(mentions > 0, label + ': the inbox address should be on the page');
  assert.strictEqual(links.length, mentions, label + ': ' + mentions + ' mention(s) of the inbox but ' + links.length + ' visible mailto: link(s): ' + JSON.stringify(m.anchors));
  links.forEach(function (a) { assert.ok(a.height >= 44, label + ': mailto link under 44px tall: ' + JSON.stringify(a)); });
}
function alertShowing(m, wording) {
  var a = m.alerts.filter(function (x) { return x.visible && x.role === 'alert' && x.text.indexOf(wording) >= 0; });
  assert.ok(a.length > 0, 'the message "' + wording.slice(0, 40) + '..." should be in a visible role="alert" element; alerts: ' + JSON.stringify(m.alerts));
}

// ---- static checks

test('update.html and update.js exist', function () {
  assert.ok(fs.existsSync(HTML), 'expected ' + HTML);
  assert.ok(fs.existsSync(JS), 'expected ' + JS);
});

test('the page does not load gate.js (no members\' password in the way)', { skip: pageSkip }, function () {
  var html = fs.readFileSync(HTML, 'utf8');
  assert.ok(!/gate\.js/.test(html), 'update.html must not reference gate.js');
  assert.ok(!/AGA_GATE/.test(fs.readFileSync(JS, 'utf8')), 'update.js must not use AGA_GATE');
});

test('the page loads no external script, stylesheet or font', { skip: pageSkip }, function () {
  var html = fs.readFileSync(HTML, 'utf8');
  var srcs = (html.match(/<script[^>]*\ssrc=["']([^"']+)["']/gi) || []).map(function (s) { return s.replace(/.*src=["']([^"']+)["'].*/i, '$1'); });
  srcs.forEach(function (s) { assert.ok(!/^(https?:)?\/\//i.test(s), 'external script: ' + s); });
  assert.ok(srcs.indexOf('data/config.js') >= 0 || srcs.indexOf('./data/config.js') >= 0, 'should load data/config.js; found ' + srcs.join(', '));
  (html.match(/<link[^>]*>/gi) || []).forEach(function (l) { assert.ok(!/href=["'](https?:)?\/\//i.test(l), 'external link tag: ' + l); });
  assert.ok(!/@import/.test(html), 'no @import');
  assert.ok(!/url\(\s*["']?https?:/i.test(html), 'no url(http...) in styles');
  assert.ok(!/fonts\.googleapis|fonts\.gstatic|cdnjs|jsdelivr|unpkg/i.test(html + fs.readFileSync(JS, 'utf8')), 'no font or script CDN');
});

test('the page tells search engines to stay away, sends no referrer and has the house tokens', { skip: pageSkip }, function () {
  var html = fs.readFileSync(HTML, 'utf8');
  assert.ok(/<meta\s+name=["']robots["']\s+content=["']noindex["']/i.test(html), 'meta robots noindex');
  assert.ok(/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i.test(html), 'meta referrer no-referrer');
  assert.ok(/<meta\s+name=["']viewport["']/i.test(html), 'viewport meta');
  assert.ok(/--green:\s*#1F5A3A/i.test(html), 'same :root tokens as check.html');
  assert.ok(/max-width:\s*560px/.test(html), '560px wrap');
  assert.ok(/font:\s*17px/.test(html), '17px body');
});

test('no link to the sites.google.com data page remains', { skip: pageSkip }, function () {
  var all = fs.readFileSync(HTML, 'utf8') + fs.readFileSync(JS, 'utf8');
  assert.ok(!/sites\.google\.com/i.test(all), 'sites.google.com still referenced');
  assert.ok(!/How we look after your details/.test(all), 'the "How we look after your details" link should be gone');
});

test('keyboard users can see which tick-box row has focus', { skip: pageSkip }, function () {
  var html = fs.readFileSync(HTML, 'utf8');
  assert.ok(/\.opt:has\(input:focus-visible\)\s*\{[^}]*outline:\s*3px solid var\(--green\)/.test(html), '.opt:has(input:focus-visible) { outline: 3px solid var(--green); }');
});

test('posts go the same way as check.js: fetch with a JSON string body and no content-type header', { skip: pageSkip }, function () {
  var js = fs.readFileSync(JS, 'utf8');
  assert.ok(/fetch\(/.test(js), 'uses fetch');
  assert.ok(/method:\s*['"]POST['"]/.test(js), 'posts');
  var code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // comments may mention it; code may not
  assert.ok(!/['"]content-type['"]\s*:/i.test(code), 'no content-type header (it would force a preflight the script cannot answer)');
  assert.ok(!/headers\s*:/.test(code), 'no custom headers');
  assert.ok(/memberUrl/.test(js), 'reads PLANNER_CONFIG.memberUrl');
});

test('the token is never written to storage', { skip: pageSkip }, function () {
  var js = fs.readFileSync(JS, 'utf8');
  assert.ok(!/(localStorage|sessionStorage)\.setItem|document\.cookie\s*=/.test(js), 'update.js must not write to localStorage, sessionStorage or cookies');
});

// ---- live checks: ask view

test('with no link the page asks for an email address in the agreed words, with a real label', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.ask.after;
  assert.ok(m.headings.indexOf('Update my details') >= 0, 'heading "Update my details"; headings: ' + m.headings.join(' | '));
  has(m.text, W.askLead);
  has(m.text, 'Send me my link');
  hasNot(m.text, 'Your details');
  hasNot(m.text, W.expired);
  assert.ok(m.email && m.email.visible, 'an email box is showing');
  assert.strictEqual(m.email.type, 'email');
  assert.strictEqual(m.email.autocomplete, 'email');
  assert.ok(m.email.height >= 52, 'email box at least 52px tall, got ' + m.email.height);
  var label = m.labels.filter(function (l) { return l.visible && l.text === W.askLabel; })[0];
  assert.ok(label, 'a visible <label> reading "' + W.askLabel + '"; labels: ' + JSON.stringify(m.labels));
  assert.strictEqual(label.forType, 'email', 'the label\'s for= points at the email box');
  var box = m.inputStyles.filter(function (i) { return i.type === 'email'; })[0];
  assert.ok(box, 'email input style found');
  assert.strictEqual(box.ariaLabel, '', 'no aria-label on the box (the label does the job)');
  assert.strictEqual(m.robots, 'noindex');
  assert.strictEqual(m.referrer, 'no-referrer');
});

test('text and email boxes have a visible 2px #7A7870 border', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var all = R.probes.ask.after.inputStyles.concat(R.probes.edit.after.inputStyles);
  assert.ok(all.length >= 4, 'expected the email box plus name, email and phone fields; got ' + JSON.stringify(all));
  all.forEach(function (i) { assert.strictEqual(i.border, '2px solid rgb(122, 120, 112)', 'border on ' + i.type + '#' + i.id); });
});

test('ask view: no text under 16px and every tap target at least 44px tall', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  bigEnough(R.probes.ask.after, 'ask view');
});

test('tapping Send with an empty box says "Type your email address" and sends nothing', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.blank.after;
  has(m.text, W.blank);
  alertShowing(m, W.blank);
  assert.ok(/input\[email\]/.test(m.focused), 'focus goes to the email box, got ' + m.focused);
  var posts = server.seen.filter(function (s) { return s.method === 'POST' && s.body && s.body.action === 'request' && !s.body.email; });
  assert.strictEqual(posts.length, 0, 'no request posted for an empty box');
});

test('after sending, the page says the link is on its way, whatever the server said', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  has(R.probes.sent.after.text, W.sent);
  has(R.probes.odd.after.text, W.sent);
  alertShowing(R.probes.sent.after, 'your link is on its way');
  inboxLinked(R.probes.sent.after, 'sent view');
  var sent = R.sentCalls.filter(function (s) { return s.method === 'POST' && s.body && s.body.action === 'request' && s.body.email === 'one@example.com'; });
  assert.strictEqual(sent.length, 1, 'exactly one request posted for one@example.com in that visit, got ' + JSON.stringify(R.sentCalls.map(function (s) { return s.body || s.method; })));
  assert.ok(/^text\/plain/.test(sent[0].headers['content-type'] || ''), 'posted as text/plain (no preflight), got ' + sent[0].headers['content-type']);
});

test('when the connection drops the page says so in the agreed words', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  has(R.probes.down.after.text, W.noConnection);
  hasNot(R.probes.down.after.text, W.sent);
});

test('with no memberUrl the page says it is not ready yet', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.notready.after;
  has(m.text, W.notReady);
  inboxLinked(m, 'not-ready view');
  hasNot(m.text, W.noConnection);
});

// ---- live checks: edit view

test('with a good link the page shows that person\'s details, plot read-only, three tick boxes and Save', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.edit.after;
  assert.ok(m.headings.indexOf('Your details') >= 0, 'heading "Your details"; headings: ' + m.headings.join(' | '));
  has(m.text, 'Plot: Perryn 99');
  has(m.text, 'If this is wrong, email actongardening@gmail.com');
  has(m.text, 'What would you like to hear about?');
  has(m.text, 'Shop updates - what is in stock and what is arriving');
  has(m.text, 'Volunteer rota - work mornings and jobs that need hands');
  has(m.text, 'General news - the monthly email from the committee');
  has(m.text, 'Save');
  has(m.text, W.privacy);
  has(m.text, W.emailHint);
  hasNot(m.text, 'How we look after your details');
  assert.strictEqual(m.privacyLink, null, 'no "How we look after your details" link');
  assert.ok(!m.anchors.some(function (a) { return /sites\.google\.com/.test(a.href); }), 'no sites.google.com link');
  hasNot(m.text, 'Send me my link');
  var vis = m.fields.filter(function (f) { return f.visible; });
  var values = vis.map(function (f) { return f.value; });
  assert.ok(values.indexOf('Test Person One') >= 0, 'name filled in: ' + JSON.stringify(vis));
  assert.ok(values.indexOf('one@example.com') >= 0, 'email filled in');
  assert.ok(values.indexOf('07700 900001') >= 0, 'phone filled in');
  var boxes = vis.filter(function (f) { return f.type === 'checkbox'; });
  assert.strictEqual(boxes.length, 3, 'three tick boxes');
  assert.deepStrictEqual(boxes.map(function (b) { return b.value; }), [false, false, true], 'ticked as the record says (shop no, rota no, news yes)');
  assert.ok(!vis.some(function (f) { return f.value === 'Perryn 99'; }), 'the plot is text, not a field');
  assert.ok(!vis.some(function (f) { return f.value === 'Responsible'; }), 'the role is not a field');
  var labelled = m.labels.filter(function (l) { return l.visible && l.for; }).map(function (l) { return l.text; });
  ['Name', 'Email', 'Phone'].forEach(function (f) { assert.ok(labelled.some(function (x) { return x.indexOf(f) === 0; }), 'a <label for> for ' + f + '; labels: ' + JSON.stringify(m.labels)); });
});

test('every inbox address on the edit view is a mailto: link', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  inboxLinked(R.probes.edit.after, 'edit view');
});

test('edit view: no text under 16px and every tap target at least 44px tall', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  bigEnough(R.probes.edit.after, 'edit view');
});

test('when the record loads, focus moves to the "Your details" heading', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.edit.after;
  assert.ok(/^h[12].*Your details/.test(m.focused), 'focused element should be the heading, got ' + m.focused);
  assert.ok(m.headingTabindex.indexOf('-1') >= 0, 'the heading has tabindex="-1": ' + JSON.stringify(m.headingTabindex));
});

test('a record with no plot says "No plot on record"', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.noplot.after;
  has(m.text, W.noPlot);
  hasNot(m.text, 'Plot: ');
  assert.ok(m.headings.indexOf('Your details') >= 0, 'still the edit view');
});

test('the link token is not kept in the browser\'s storage', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var ls = JSON.stringify(R.probes.edit.after.localStorage) + JSON.stringify(R.probes.save.after.localStorage);
  assert.ok(ls.indexOf('good') < 0, 'token found in localStorage: ' + ls);
});

test('tapping Save posts the token and fields once, disables the button while sending, then says "Saved - thank you"', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var p = R.probes.save;
  assert.strictEqual(p.saveDisabledAfterTap, true, 'Save button disabled while sending (steps: ' + p.steps.join('; ') + ')');
  has(p.after.text, W.done);
  var saves = R.saveCalls.filter(function (s) { return s.method === 'POST' && s.body && s.body.action === 'save'; });
  assert.strictEqual(saves.length, 1, 'one save posted, got ' + JSON.stringify(R.saveCalls.map(function (s) { return s.body || s.method; })));
  var b = saves[0].body;
  assert.strictEqual(b.t, 'good');
  assert.strictEqual(b.name, 'Test Person Won');
  assert.strictEqual(b.email, 'one@example.com');
  assert.strictEqual(b.phone, '07700 900099');
  assert.deepStrictEqual([b.shop, b.rota, b.news], [true, true, false]);
  assert.ok(!('plots' in b) && !('role' in b) && !('id' in b) && !('contactId' in b), 'the page sends only what the member may change: ' + JSON.stringify(b));
  assert.ok(/^text\/plain/.test(saves[0].headers['content-type'] || ''), 'posted as text/plain (no preflight)');
});

test('done view: shows nothing but the thank-you, and focus is on it', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.save.after;
  var vis = m.fields.filter(function (f) { return f.visible; });
  assert.deepStrictEqual(vis, [], 'no fields showing after save: ' + JSON.stringify(vis));
  hasNot(m.text, 'Send me my link');
  hasNot(m.text, 'Plot: Perryn 99');
  assert.deepStrictEqual(m.small, [], 'done view: text under 16px: ' + JSON.stringify(m.small));
  assert.ok(/^h[12].*Saved - thank you/.test(m.focused), 'focus on the done heading, got ' + m.focused);
});

test('a save the server rejects as a field error keeps the form, says why and focuses that field', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.saveBadPhone.after;
  hasNot(m.text, W.done);
  assert.ok(m.headings.indexOf('Your details') >= 0, 'still on the edit view');
  assert.ok(/input.*#?.*(phone|Phone)/i.test(m.focused), 'focus on the phone field, got ' + m.focused);
  assert.ok(m.alerts.some(function (a) { return a.visible && a.role === 'alert' && a.text.length > 0; }), 'a role="alert" message is showing: ' + JSON.stringify(m.alerts));
  assert.ok(m.fields.some(function (f) { return f.visible && f.value === 'not a phone'; }), 'what was typed is still in the box to be corrected');
});

test('a save with no answer says "Could not save" and keeps the form', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.saveDrop.after;
  has(m.text, W.saveFailed);
  hasNot(m.text, W.done);
  assert.ok(m.headings.indexOf('Your details') >= 0, 'still on the edit view');
  assert.ok(m.fields.some(function (f) { return f.visible && f.value === 'Test Person Won'; }), 'the typed changes are still there');
  inboxLinked(m, 'save-failed view');
  var save = m.targets.filter(function (x) { return /button.*"Save"/.test(x.el); })[0];
  assert.ok(save, 'the Save button is back: ' + JSON.stringify(m.targets));
});

test('a server error on save or on load says "Something went wrong at our end"', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  has(R.probes.saveServer.after.text, W.server);
  hasNot(R.probes.saveServer.after.text, W.done);
  has(R.probes.broken.after.text, W.server);
  hasNot(R.probes.broken.after.text, W.expired);
  hasNot(R.probes.broken.after.text, 'Your details');
  inboxLinked(R.probes.broken.after, 'server-error view');
});

// ---- live checks: expired view

test('an expired or used link falls back to the ask view with the agreed line', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.expired.after;
  has(m.text, W.expired);
  alertShowing(m, 'That link has expired');
  assert.ok(m.headings.indexOf('Update my details') >= 0, 'heading "Update my details"; headings: ' + m.headings.join(' | '));
  has(m.text, 'Send me my link');
  hasNot(m.text, 'Your details');
  hasNot(m.text, 'Test Person One');
  assert.ok(m.email && m.email.visible, 'the email box is showing');
  assert.ok(/^h[12].*Update my details/.test(m.focused), 'focus moves to the heading, got ' + m.focused);
});

test('expired view: no text under 16px and every tap target at least 44px tall', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  bigEnough(R.probes.expired.after, 'expired view');
});

test('the page loads only its own scripts in the browser too', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.ask.after;
  m.scripts.forEach(function (s) { assert.ok(!/^(https?:)?\/\//i.test(s), 'external script loaded: ' + s); assert.ok(!/gate\.js/.test(s), 'gate.js loaded'); });
  m.links.forEach(function (l) { assert.ok(!/https?:\/\//i.test(l), 'external link loaded: ' + l); });
});

test('screenshots of the views were saved', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  ['1-ask', '2-edit', '3-expired', '4-done', '5-sent', '6-notready'].forEach(function (n) {
    assert.ok(R.shots[n] && fs.existsSync(R.shots[n]) && fs.statSync(R.shots[n]).size > 1000, 'screenshot ' + n + ' missing');
  });
});
