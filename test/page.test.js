/* Tests for the member page (update.html + update.js) from briefs/us1-build-spec.md, including the
   Stage 3 changes (items 8 to 13) and the round 2 contract (8 Nov 2026: "Sending..." on the tap, the
   sent wording, the honeypot, the name as read-only text, the role line, Mobile and Landline fields).
   Static checks read the files. Live checks start test/page-server.js
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
  sent: 'Thank you. If that address is the one we have for you, your link is on its way. Give it a few minutes and check your junk or spam folder too. If nothing arrives in ten minutes, the address may not be the one we hold: email actongardening@gmail.com. Include your name and plot number and we will update it.',
  sentOld: 'If nothing arrives, email actongardening@gmail.com.',
  sentRound2Draft: 'email actongardening@gmail.com with your name and plot number',
  sendingAlert: 'Sending your link',
  sendingLabel: 'Sending...',
  sendLabel: 'Send me my link',
  honeypotLabel: 'Leave this empty',
  nameNote: 'Your name is shown as it is on our record. A plot cannot be passed to someone else, so the name cannot be changed here. To correct a spelling, add a second contact, or give up your plot, email actongardening@gmail.com.',
  nameNoteSecond: 'Your name is shown as it is on our record and cannot be changed here. To correct a spelling, or to be removed as a contact for this plot, email actongardening@gmail.com.',
  roleResponsible: 'Responsible plot holder',
  roleSecond: 'Second contact (not the plot holder)',
  roleSecondOld: 'Second contact: contact details only',
  mobileLabel: 'Mobile',
  landlineLabel: 'Landline (if you have one)',
  phoneErr: 'Check the mobile number: digits, spaces, + and brackets only.',
  landlineErr: 'Check the landline number: digits, spaces, + and brackets only.',
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
    await shot('7-second', '?t=second');
    R.probes.ask = await probe('?probe=');
    R.probes.edit = await probe('?t=good&probe=');
    R.probes.second = await probe('?t=second&probe=');
    R.probes.spacedRole = await probe('?t=spacedrole&probe=');
    R.probes.noRole = await probe('?t=norole&probe=');
    R.probes.expired = await probe('?t=bad&probe=');
    R.probes.blank = await probe('?probe=blank');
    var sentBefore = server.seen.length;
    R.probes.sent = await probe('?probe=ask');
    R.sentCalls = server.seen.slice(sentBefore);
    var slowBefore = server.seen.length;
    R.probes.slow = await probe('?probe=ask-slow');
    R.slowCalls = server.seen.slice(slowBefore);
    var hpBefore = server.seen.length;
    R.probes.honeypot = await probe('?probe=honeypot');
    R.honeypotCalls = server.seen.slice(hpBefore);
    R.probes.odd = await probe('?probe=ask-odd');
    R.probes.down = await probe('?probe=ask-down');
    R.probes.notready = await probe('?notready=1&probe=');
    R.probes.broken = await probe('?t=broken&probe=');
    R.probes.noplot = await probe('?t=noplot&probe=');
    R.probes.saveDrop = await probe('?t=good&probe=save-drop');
    R.probes.saveServer = await probe('?t=good&probe=save-server');
    R.probes.saveBadPhone = await probe('?t=good&probe=save-badphone');
    R.probes.saveBadLandline = await probe('?t=good&probe=save-badlandline');
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

// ---- static checks: round 2

test('the honeypot is a text input called leave_empty, labelled "Leave this empty", out of the tab order and hidden from screen readers', { skip: pageSkip }, function () {
  var html = fs.readFileSync(HTML, 'utf8');
  var tags = html.match(/<input[^>]*\bid=["']leave_empty["'][^>]*>/gi) || [];
  assert.strictEqual(tags.length, 1, 'exactly one <input id="leave_empty">; found ' + tags.length);
  var tag = tags[0];
  function attr(name) { var m = tag.match(new RegExp('\\b' + name + '=["\']([^"\']*)["\']', 'i')); return m ? m[1] : null; }
  assert.strictEqual(attr('name'), 'leave_empty');
  assert.strictEqual(attr('type'), 'text');
  assert.strictEqual(attr('tabindex'), '-1');
  assert.strictEqual(attr('autocomplete'), 'off');
  assert.strictEqual(attr('aria-hidden'), 'true');
  var label = html.match(/<label[^>]*\bfor=["']leave_empty["'][^>]*>([\s\S]*?)<\/label>/i);
  assert.ok(label, 'a <label for="leave_empty">');
  assert.strictEqual(label[1].replace(/<[^>]+>/g, '').trim(), W.honeypotLabel);
  var askForm = html.match(/<form[^>]*\bid=["']askForm["'][\s\S]*?<\/form>/i);
  assert.ok(askForm && askForm[0].indexOf('id="leave_empty"') >= 0, 'the honeypot sits inside the ask form');
  assert.ok(!/\bid=["']website["']|\bname=["']website["']/i.test(html), 'nothing on the page is still called "website" (password managers fill that name)');
  var js = fs.readFileSync(JS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/['"]website['"]|\bwebsite\s*:/.test(js), 'update.js no longer reads or sends "website"');
});

test('legends have no padding, and the mobile and landline inputs carry the right autocomplete tokens', { skip: pageSkip }, function () {
  var html = fs.readFileSync(HTML, 'utf8');
  assert.ok(/(^|[\s,{};])legend\s*(,[^{]*)?\{[^}]*\bpadding:\s*0\b/.test(html), 'legend { padding: 0; } in the page styles');
  var mobile = html.match(/<input[^>]*\bid=["']phone["'][^>]*>/i);
  var landline = html.match(/<input[^>]*\bid=["']landline["'][^>]*>/i);
  assert.ok(mobile, 'the mobile input');
  assert.ok(landline, 'the landline input');
  assert.ok(/\bautocomplete=["']mobile tel["']/i.test(mobile[0]), 'mobile input autocomplete="mobile tel": ' + mobile[0]);
  assert.ok(/\bautocomplete=["']home tel["']/i.test(landline[0]), 'landline input autocomplete="home tel": ' + landline[0]);
});

test('the Name input is gone from the page and update.js no longer reads or sends a name', { skip: pageSkip }, function () {
  var html = fs.readFileSync(HTML, 'utf8');
  var js = fs.readFileSync(JS, 'utf8');
  assert.ok(!/<input[^>]*\bid=["']name["']/i.test(html), 'no <input id="name">');
  assert.ok(!/<label[^>]*\bfor=["']name["']/i.test(html), 'no <label for="name">');
  assert.ok(/\bid=["']nameLine["']/.test(html), '<p id="nameLine"> is on the page');
  assert.ok(/<p[^>]*\bid=["']nameLine["']/.test(html), 'nameLine is a <p>');
  assert.ok(/\bid=["']roleLine["']/.test(html), 'an element with id="roleLine"');
  var code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/\$\(\s*['"]name['"]\s*\)/.test(code), 'update.js no longer looks up a name field');
  assert.ok(!/MSG\.name\b/.test(code), 'MSG.name is gone');
  assert.ok(!/\bname\s*:\s*\$\(/.test(code), 'the save body carries no name');
});

test('the landline field is a tel input with id="landline" under the mobile', { skip: pageSkip }, function () {
  var html = fs.readFileSync(HTML, 'utf8');
  var tag = html.match(/<input[^>]*\bid=["']landline["'][^>]*>/i);
  assert.ok(tag, 'an <input id="landline">');
  assert.ok(/\btype=["']tel["']/i.test(tag[0]), 'type="tel": ' + tag[0]);
  var label = html.match(/<label[^>]*\bfor=["']landline["'][^>]*>([\s\S]*?)<\/label>/i);
  assert.ok(label, 'a <label for="landline">');
  assert.strictEqual(label[1].replace(/<[^>]+>/g, '').trim(), W.landlineLabel);
  var mobile = html.match(/<label[^>]*\bfor=["']phone["'][^>]*>([\s\S]*?)<\/label>/i);
  assert.ok(mobile, 'a <label for="phone">');
  assert.strictEqual(mobile[1].replace(/<[^>]+>/g, '').trim(), W.mobileLabel, 'Phone\'s label is now Mobile');
  assert.ok(html.indexOf(mobile[0]) < html.indexOf(tag[0]), 'the landline comes after the mobile');
  assert.ok(!/<label[^>]*>\s*Phone\s*<\/label>/i.test(html), 'no label still reads "Phone"');
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
  assert.ok(all.length >= 4, 'expected the email box plus email, mobile and landline fields; got ' + JSON.stringify(all));
  assert.ok(all.some(function (i) { return i.id === 'landline'; }), 'the landline field is styled like the others');
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

test('after sending, the page says the link is on its way in the agreed words, whatever the server said', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  has(R.probes.sent.after.text, W.sent);
  has(R.probes.odd.after.text, W.sent);
  hasNot(R.probes.sent.after.text, W.sentOld);
  hasNot(R.probes.sent.after.text, W.sentRound2Draft);
  alertShowing(R.probes.sent.after, W.sent);
  inboxLinked(R.probes.sent.after, 'sent view');
  var sent = R.sentCalls.filter(function (s) { return s.method === 'POST' && s.body && s.body.action === 'request' && s.body.email === 'one@example.com'; });
  assert.strictEqual(sent.length, 1, 'exactly one request posted for one@example.com in that visit, got ' + JSON.stringify(R.sentCalls.map(function (s) { return s.body || s.method; })));
  assert.ok(/^text\/plain/.test(sent[0].headers['content-type'] || ''), 'posted as text/plain (no preflight), got ' + sent[0].headers['content-type']);
});

test('the request body carries the honeypot as "leave_empty", empty for a person', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var sent = R.sentCalls.filter(function (s) { return s.method === 'POST' && s.body && s.body.action === 'request'; });
  assert.strictEqual(sent.length, 1);
  assert.ok('leave_empty' in sent[0].body, 'the body has a leave_empty key: ' + JSON.stringify(sent[0].body));
  assert.strictEqual(sent[0].body.leave_empty, '', 'empty, because a person did not fill it');
  assert.deepStrictEqual(Object.keys(sent[0].body).sort(), ['action', 'email', 'leave_empty'], 'nothing else in the request body (and no "website")');
});

// ---- live checks: round 2, the tap (B1)

test('the instant Send is tapped the button reads "Sending..." and is disabled, and the alert line says "Sending your link"', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var p = R.probes.slow;
  assert.ok(p.sending, 'the probe sampled the page straight after the tap (steps: ' + p.steps.join('; ') + ')');
  assert.strictEqual(p.sending.label, W.sendingLabel, 'button label mid-request');
  assert.strictEqual(p.sending.disabled, true, 'button disabled mid-request');
  var alert = p.sending.alerts.filter(function (a) { return a.role === 'alert' && a.text === W.sendingAlert; });
  assert.ok(alert.length > 0, 'a visible role="alert" reading exactly "' + W.sendingAlert + '"; alerts at that moment: ' + JSON.stringify(p.sending.alerts));
  var posted = R.slowCalls.filter(function (s) { return s.method === 'POST' && s.body && s.body.email === 'slow@example.com'; });
  assert.strictEqual(posted.length, 1, 'the slow request did reach the endpoint once');
});

test('when the answer comes, the button reads "Send me my link" again, is enabled, and the message is below it', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.slow.after;
  var btn = m.buttons.filter(function (b) { return b.visible && b.text === W.sendLabel; })[0];
  assert.ok(btn, 'a visible button reading "' + W.sendLabel + '" after the answer; buttons: ' + JSON.stringify(m.buttons));
  assert.strictEqual(btn.disabled, false, 'enabled again');
  assert.ok(!m.buttons.some(function (b) { return b.text === W.sendingLabel; }), 'no button still reads "Sending..."');
  has(m.text, W.sent);
  hasNot(m.text, W.sendingAlert);
  assert.ok(m.text.indexOf(W.sendLabel) < m.text.indexOf('your link is on its way'), 'the message comes after the button');
  alertShowing(m, W.sent);
});

test('after an ordinary, refused or dropped request the Send button is back, enabled and reads "Send me my link"', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  // The mid-request state is checked against the slow endpoint above, where it cannot race. The fake
  // server's ordinary 500 ms pause and the dropped connection can both land before the probe's timer
  // tick, so for these only the end state is asserted.
  [['ordinary', R.probes.sent], ['refused by the server', R.probes.odd], ['dropped connection', R.probes.down]].forEach(function (pair) {
    var m = pair[1].after;
    var back = m.buttons.filter(function (b) { return b.visible && b.text === W.sendLabel; })[0];
    assert.ok(back, pair[0] + ': a visible button reading "' + W.sendLabel + '" afterwards; buttons: ' + JSON.stringify(m.buttons));
    assert.strictEqual(back.disabled, false, pair[0] + ': enabled again');
    assert.ok(!m.buttons.some(function (b) { return b.text === W.sendingLabel; }), pair[0] + ': no button still reads "Sending..."');
    hasNot(m.text, W.sendingAlert);
  });
});

test('an empty-box tap does not say "Sending..."', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var p = R.probes.blank;
  assert.ok(p.sending, 'sampled');
  assert.strictEqual(p.sending.label, W.sendLabel, 'nothing was sent, so the label never changed');
  assert.strictEqual(p.sending.disabled, false);
});

// ---- live checks: round 2, the honeypot (B4)

test('the honeypot is on the ask view, off screen, out of the tab order and hidden from screen readers', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var hp = R.probes.ask.after.honeypot;
  assert.ok(hp, 'an input with id="leave_empty" is on the page');
  assert.strictEqual(hp.tag, 'input');
  assert.strictEqual(hp.type, 'text');
  assert.strictEqual(hp.id, 'leave_empty');
  assert.strictEqual(hp.name, 'leave_empty');
  assert.strictEqual(hp.tabindex, '-1');
  assert.strictEqual(hp.autocomplete, 'off');
  assert.strictEqual(hp.ariaHidden, 'true');
  assert.strictEqual(hp.inAskForm, true, 'inside the ask form');
  assert.strictEqual(hp.label, W.honeypotLabel);
  assert.strictEqual(hp.value, '', 'empty to start with');
  assert.ok(hp.wrapper, 'wrapped in a div');
  assert.strictEqual(hp.wrapper.tag, 'div');
  assert.deepStrictEqual({ position: hp.wrapper.position, left: hp.wrapper.left, width: hp.wrapper.width, height: hp.wrapper.height, overflow: hp.wrapper.overflow },
    { position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }, 'the wrapper is moved off screen as the contract says');
  assert.ok(hp.right <= 0, 'the box is off the left of the screen (right edge at ' + hp.right + 'px)');
  assert.strictEqual(hp.visible, false, 'not counted as visible');
  var label = R.probes.ask.after.labels.filter(function (l) { return l.text === W.honeypotLabel; })[0];
  assert.ok(label && label.visible === false, 'the "Leave this empty" label is off screen too: ' + JSON.stringify(label));
  assert.ok(!R.probes.ask.after.targets.some(function (x) { return /#leave_empty/.test(x.el); }), 'not a tap target');
});

test('a filled honeypot shows the sent message and no request reaches the script', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var p = R.probes.honeypot;
  assert.ok(/fill the honeypot: true/.test(p.steps.join('; ')), 'the probe filled the box: ' + p.steps.join('; '));
  has(p.after.text, W.sent);
  alertShowing(p.after, W.sent);
  inboxLinked(p.after, 'honeypot view');
  assert.deepStrictEqual(R.honeypotCalls.map(function (s) { return { method: s.method, body: s.body || null, query: s.query }; }), [], 'nothing reached the fake endpoint during that visit');
  assert.ok(!R.honeypotCalls.some(function (s) { return s.method === 'POST'; }), 'no POST at all');
  var btn = p.after.buttons.filter(function (b) { return b.visible && b.text === W.sendLabel; })[0];
  assert.ok(btn && !btn.disabled, 'the button is back and enabled: ' + JSON.stringify(p.after.buttons));
});

// ---- live checks: round 2, name read-only (B6)

test('the edit view shows the name as text, strong, with the explanation, and no name input', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.edit.after;
  assert.ok(m.nameLine, 'a <p id="nameLine"> on the page');
  assert.strictEqual(m.nameLine.tag, 'p');
  assert.strictEqual(m.nameLine.visible, true);
  assert.strictEqual(m.nameLine.text, 'Test Person One');
  assert.ok(m.nameLine.weight === 'bold' || parseInt(m.nameLine.weight, 10) >= 600, 'strong (font-weight 600 or more), got ' + m.nameLine.weight);
  assert.ok(m.nameLine.fontSize >= 17, 'styled like a field value, got ' + m.nameLine.fontSize + 'px');
  has(m.text, W.nameNote);
  assert.ok(m.text.indexOf('Test Person One') < m.text.indexOf(W.nameNote.slice(0, 30)), 'the explanation sits under the name');
  assert.ok(m.text.indexOf(W.nameNote.slice(0, 30)) < m.text.indexOf('Email'), 'the name and its note come above Email');
  var vis = m.fields.filter(function (f) { return f.visible; });
  assert.ok(!vis.some(function (f) { return f.value === 'Test Person One'; }), 'the name is not in any field: ' + JSON.stringify(vis));
  assert.ok(!vis.some(function (f) { return f.id === 'name' || f.type === 'text'; }), 'no text input for the name: ' + JSON.stringify(vis));
  assert.ok(!m.labels.some(function (l) { return l.visible && /^Name\b/.test(l.text); }), 'no "Name" label: ' + JSON.stringify(m.labels));
  inboxLinked(m, 'edit view with the name note');
});

test('the role line reads "Responsible plot holder" for a responsible tenant and "Second contact (not the plot holder)" for a co-occupier', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var a = R.probes.edit.after, b = R.probes.second.after;
  assert.ok(a.roleLine && a.roleLine.visible, 'a visible roleLine on the edit view');
  assert.strictEqual(a.roleLine.text, W.roleResponsible);
  hasNot(a.text, W.roleSecond);
  assert.ok(b.roleLine && b.roleLine.visible, 'a visible roleLine for the co-occupier');
  assert.strictEqual(b.roleLine.text, W.roleSecond);
  hasNot(b.text, W.roleResponsible);
  hasNot(b.text, W.roleSecondOld);
  assert.ok(a.text.indexOf('Plot: Perryn 99') < a.text.indexOf(W.roleResponsible), 'the role line sits under the plot line');
  assert.strictEqual(b.nameLine.text, 'Test Person Two');
  assert.ok(b.headings.indexOf('Your details') >= 0, 'the co-occupier sees the same edit view');
  assert.ok(!b.fields.some(function (f) { return f.visible && (f.value === 'Responsible' || f.value === 'Co-occupier'); }), 'the role is text, not a field');
});

test('the role is compared trimmed and lower-cased: " responsible " still reads "Responsible plot holder"', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.spacedRole.after;
  assert.ok(m.headings.indexOf('Your details') >= 0, 'the edit view loaded');
  assert.ok(m.roleLine && m.roleLine.visible, 'a visible roleLine');
  assert.strictEqual(m.roleLine.text, W.roleResponsible);
  has(m.text, W.nameNote);
  hasNot(m.text, W.nameNoteSecond);
});

test('a blank role shows no role line at all, and the plot holder\'s name note', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.noRole.after;
  assert.ok(m.headings.indexOf('Your details') >= 0, 'the edit view loaded');
  assert.ok(!m.roleLine || !m.roleLine.visible || m.roleLine.text === '', 'nothing shown for a blank role: ' + JSON.stringify(m.roleLine));
  hasNot(m.text, W.roleResponsible);
  hasNot(m.text, W.roleSecond);
  has(m.text, 'Plot: Perryn 99');
  has(m.text, W.nameNote);
  hasNot(m.text, W.nameNoteSecond);
  bigEnough(m, 'blank-role view');
  inboxLinked(m, 'blank-role view');
});

test('the second contact gets the second-contact name note, the plot holder the plot holder one', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var holder = R.probes.edit.after, second = R.probes.second.after;
  has(holder.text, W.nameNote);
  hasNot(holder.text, W.nameNoteSecond);
  has(second.text, W.nameNoteSecond);
  hasNot(second.text, W.nameNote);
  hasNot(second.text, 'A plot cannot be passed to someone else');
  assert.ok(second.text.indexOf('Test Person Two') < second.text.indexOf(W.nameNoteSecond.slice(0, 30)), 'the note sits under the name');
  assert.ok(second.text.indexOf(W.nameNoteSecond.slice(0, 30)) < second.text.indexOf('Email'), 'and above Email');
  inboxLinked(second, 'second-contact view');
  bigEnough(second, 'second-contact view');
});

// ---- live checks: round 2, Mobile and Landline

test('the phone field is labelled "Mobile" and the landline field "Landline (if you have one)", both tel inputs', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.edit.after;
  var labelled = m.labels.filter(function (l) { return l.visible && l.for; });
  var mobile = labelled.filter(function (l) { return l.text === W.mobileLabel; })[0];
  var landline = labelled.filter(function (l) { return l.text === W.landlineLabel; })[0];
  assert.ok(mobile, 'a visible <label for> reading "Mobile"; labels: ' + JSON.stringify(m.labels));
  assert.strictEqual(mobile.forType, 'tel');
  assert.ok(landline, 'a visible <label for> reading "' + W.landlineLabel + '"; labels: ' + JSON.stringify(m.labels));
  assert.strictEqual(landline.for, 'landline');
  assert.strictEqual(landline.forType, 'tel');
  assert.ok(!labelled.some(function (l) { return /^Phone\b/.test(l.text); }), 'no label reads "Phone" any more');
  assert.ok(m.text.indexOf(W.mobileLabel) < m.text.indexOf(W.landlineLabel), 'the landline comes under the mobile');
  ['Email', W.mobileLabel, W.landlineLabel].forEach(function (f) { assert.ok(labelled.some(function (x) { return x.text === f; }), 'a <label for> reading "' + f + '"'); });
});

test('the landline round-trips: shown from the record, sent back on Save', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var shown = R.probes.edit.after.fields.filter(function (f) { return f.visible && f.id === 'landline'; })[0];
  assert.ok(shown, 'the landline field is showing');
  assert.strictEqual(shown.value, '020 7946 0001', 'filled from the record');
  assert.strictEqual(shown.type, 'tel');
  var none = R.probes.second.after.fields.filter(function (f) { return f.visible && f.id === 'landline'; })[0];
  assert.ok(none && none.value === '', 'blank when the record has none');
  var saves = R.saveCalls.filter(function (s) { return s.method === 'POST' && s.body && s.body.action === 'save'; });
  assert.strictEqual(saves.length, 1);
  assert.strictEqual(saves[0].body.landline, '01632 960099', 'the typed landline is sent');
  assert.strictEqual(saves[0].body.phone, '07700 900099', 'and the mobile with it');
});

test('a landline the server refuses says why in the agreed words and focuses the landline field', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.saveBadLandline.after;
  hasNot(m.text, W.done);
  assert.ok(m.headings.indexOf('Your details') >= 0, 'still on the edit view');
  has(m.text, W.landlineErr);
  alertShowing(m, W.landlineErr);
  hasNot(m.text, W.phoneErr);
  assert.ok(/^input\[tel\]#landline/.test(m.focused), 'focus on the landline field, got ' + m.focused);
  assert.ok(m.fields.some(function (f) { return f.visible && f.id === 'landline' && f.value === 'not a landline'; }), 'what was typed is still in the box to be corrected');
  var save = m.buttons.filter(function (b) { return b.visible && b.text === 'Save'; })[0];
  assert.ok(save && !save.disabled, 'the Save button is back: ' + JSON.stringify(m.buttons));
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
  has(m.text, 'Test Person One');
  assert.ok(values.indexOf('Test Person One') < 0, 'the name is text, not a field: ' + JSON.stringify(vis));
  assert.ok(values.indexOf('one@example.com') >= 0, 'email filled in');
  assert.ok(values.indexOf('07700 900001') >= 0, 'mobile filled in');
  assert.ok(values.indexOf('020 7946 0001') >= 0, 'landline filled in');
  var boxes = vis.filter(function (f) { return f.type === 'checkbox'; });
  assert.strictEqual(boxes.length, 3, 'three tick boxes');
  assert.deepStrictEqual(boxes.map(function (b) { return b.value; }), [false, false, true], 'ticked as the record says (shop no, rota no, news yes)');
  assert.ok(!vis.some(function (f) { return f.value === 'Perryn 99'; }), 'the plot is text, not a field');
  assert.ok(!vis.some(function (f) { return f.value === 'Responsible'; }), 'the role is not a field');
  var labelled = m.labels.filter(function (l) { return l.visible && l.for; }).map(function (l) { return l.text; });
  ['Email', W.mobileLabel, W.landlineLabel].forEach(function (f) { assert.ok(labelled.some(function (x) { return x === f; }), 'a <label for> reading "' + f + '"; labels: ' + JSON.stringify(m.labels)); });
  assert.ok(!labelled.some(function (x) { return /^(Name|Phone)\b/.test(x); }), 'no Name or Phone label: ' + JSON.stringify(labelled));
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

test('tapping Save posts the token and fields once, with no name, disables the button while sending, then says "Saved - thank you"', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var p = R.probes.save;
  assert.strictEqual(p.saveDisabledAfterTap, true, 'Save button disabled while sending (steps: ' + p.steps.join('; ') + ')');
  assert.ok(p.saving && p.saving.alerts.some(function (a) { return a.role === 'alert' && a.text === 'Saving...'; }), 'the alert line says "Saving..." mid-request (the pattern the contract points at): ' + JSON.stringify(p.saving));
  has(p.after.text, W.done);
  var saves = R.saveCalls.filter(function (s) { return s.method === 'POST' && s.body && s.body.action === 'save'; });
  assert.strictEqual(saves.length, 1, 'one save posted, got ' + JSON.stringify(R.saveCalls.map(function (s) { return s.body || s.method; })));
  var b = saves[0].body;
  assert.strictEqual(b.t, 'good');
  assert.ok(!('name' in b), 'the save body carries no name: ' + JSON.stringify(b));
  assert.strictEqual(b.email, 'one@example.com');
  assert.strictEqual(b.phone, '07700 900099');
  assert.strictEqual(b.landline, '01632 960099');
  assert.deepStrictEqual([b.shop, b.rota, b.news], [true, true, false]);
  assert.deepStrictEqual(Object.keys(b).sort(), ['action', 'email', 'landline', 'news', 'phone', 'rota', 'shop', 't'], 'the body is exactly { action, t, email, phone, landline, shop, rota, news }');
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

test('a mobile the server rejects keeps the form, says why in the agreed words and focuses the mobile field', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.saveBadPhone.after;
  hasNot(m.text, W.done);
  assert.ok(m.headings.indexOf('Your details') >= 0, 'still on the edit view');
  assert.ok(/input.*#?.*(phone|Phone)/i.test(m.focused), 'focus on the mobile field, got ' + m.focused);
  assert.ok(!/#landline/.test(m.focused), 'not the landline field');
  has(m.text, W.phoneErr);
  alertShowing(m, W.phoneErr);
  hasNot(m.text, 'Check the phone number');
  assert.ok(m.fields.some(function (f) { return f.visible && f.value === 'not a phone'; }), 'what was typed is still in the box to be corrected');
});

test('a save with no answer says "Could not save" and keeps the form', { skip: pageSkip }, function (t) {
  if (!live(t)) return;
  var m = R.probes.saveDrop.after;
  has(m.text, W.saveFailed);
  hasNot(m.text, W.done);
  assert.ok(m.headings.indexOf('Your details') >= 0, 'still on the edit view');
  assert.ok(m.fields.some(function (f) { return f.visible && f.value === '07700 900099'; }), 'the typed changes are still there');
  assert.ok(m.fields.some(function (f) { return f.visible && f.value === '01632 960099'; }), 'the typed landline too');
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
  ['1-ask', '2-edit', '3-expired', '4-done', '5-sent', '6-notready', '7-second'].forEach(function (n) {
    assert.ok(R.shots[n] && fs.existsSync(R.shots[n]) && fs.statSync(R.shots[n]).size > 1000, 'screenshot ' + n + ' missing');
  });
});
