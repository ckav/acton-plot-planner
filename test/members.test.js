/* End-to-end tests for the member self-service script (apps-script/Members.gs), written from
   briefs/us1-build-spec.md, including the round 2 contract (8 Nov 2026): an eleventh People column,
   Landline; Name read-only for members; a honeypot on request. Each test starts a fresh fake world:
   new sheet, no emails, empty cache, clock at 10:00 on 7 Nov 2026. Every person here is made up
   (see harness.js).
   Run with: npm test (from plot-planner/). */
'use strict';

var test = require('node:test');
var assert = require('node:assert');
var h = require('./harness');

var HOUR = h.HOUR;
var skip = h.scriptExists() ? false : 'apps-script/Members.gs is not written yet';

// Column positions from the spec (round 2: Landline is column K, position 10).
var P = { id: 0, name: 1, email: 2, phone: 3, plots: 4, role: 5, shop: 6, rota: 7, news: 8, updated: 9, landline: 10 };
var L = { token: 0, id: 1, sentTo: 2, made: 3, expires: 4, used: 5 };
var C = { when: 0, id: 1, what: 2 };

function ms(v) {
  if (v && typeof v.getTime === 'function') return v.getTime();   // a Date from inside the sandbox
  var t = Date.parse(String(v));
  return isNaN(t) ? NaN : t;
}
function linkFor(app, token) { return app.links().filter(function (r) { return r[L.token] === token; })[0]; }
// The round 2 save body: { action, t, email, phone, landline, shop, rota, news }. No name. These are
// Test Person One's own values, so a plain goodSave changes nothing.
function goodSave(token, extra) {
  return Object.assign({ action: 'save', t: token, email: 'one@example.com', phone: '07700 900001', landline: '020 7946 0001', shop: false, rota: false, news: true }, extra || {});
}
// Test Person Two's own values, likewise.
function twoSave(token, extra) {
  return Object.assign({ action: 'save', t: token, email: 'two@example.com', phone: '07700 900002', landline: '', shop: true, rota: false, news: true }, extra || {});
}
// A fresh link for an address that has already had its three for the day: the clock moves on a day first.
function nextDayToken(app, email) { app.advance(24 * HOUR + 60000); return app.request(email); }

test('Members.gs exists and loads with the fake Apps Script globals', function () {
  assert.ok(h.scriptExists(), 'expected ' + h.SCRIPT);
  var app = h.makeApp();
  assert.strictEqual(typeof app.ctx.doGet, 'function');
  assert.strictEqual(typeof app.ctx.doPost, 'function');
  assert.strictEqual(typeof app.ctx.setup, 'function');
});

// ---- setup

test('setup makes the "AGA members" sheet with the four tabs and their headings in order', { skip: skip }, function () {
  var app = h.makeApp();
  app.setup();
  var book = app.fake.book(h.BOOK);
  assert.ok(book, 'no spreadsheet called "AGA members"');
  assert.deepStrictEqual(book.getSheets().map(function (s) { return s.getName(); }), ['People', 'Links', 'Changes', 'Settings']);
  assert.deepStrictEqual(app.tab('People').head, h.PEOPLE_HEAD);
  assert.deepStrictEqual(app.tab('Links').head, ['Token', 'Contact ID', 'Sent to', 'Made', 'Expires', 'Used']);
  assert.deepStrictEqual(app.tab('Changes').head, ['When', 'Contact ID', 'What changed']);
  assert.deepStrictEqual(app.tab('Settings').head, ['Setting', 'Value', 'What it does']);
  assert.deepStrictEqual(app.settings(), [['Page address', 'https://ckav.github.io/acton-plot-planner/update.html', 'Where the link in the email points.']]);
  assert.ok(app.fake.log.some(function (l) { return l.indexOf(book.getUrl()) >= 0; }), 'setup should log the sheet URL');
});

test('the People tab has eleven headings in the contract\'s order, Landline last', { skip: skip }, function () {
  var app = h.makeApp();
  app.setup();
  var head = app.tab('People').head;
  assert.strictEqual(head.length, 11, 'eleven headings; got ' + JSON.stringify(head));
  assert.deepStrictEqual(head, ['Contact ID', 'Name', 'Email', 'Phone', 'Plots', 'Role', 'Shop updates', 'Volunteer rota', 'General news', 'Last updated', 'Landline']);
  assert.strictEqual(head[10], 'Landline', 'Landline is column K, so nothing in the live sheet shifts');
});

test('setup on a sheet made with ten headings adds the Landline heading and leaves the rows alone', { skip: skip }, function () {
  var app = h.makeApp();
  // A People tab as the live sheet has it before this round: ten headings, ten-column rows.
  var ss = app.fake.globals.SpreadsheetApp.create(h.BOOK);
  var sh = ss.getSheets()[0];
  sh.setName('People');
  sh.appendRow(h.PEOPLE_HEAD.slice(0, 10));
  h.PEOPLE.forEach(function (r) { sh.appendRow(r.slice(0, 10)); });
  app.fake.state.props.sheetId = ss.getId();
  assert.strictEqual(app.tab('People').head.length, 10, 'the sheet starts with ten headings');
  app.setup();
  assert.deepStrictEqual(app.tab('People').head, h.PEOPLE_HEAD, 'eleven headings after setup, Landline added at K');
  var rows = app.people();
  assert.strictEqual(rows.length, h.PEOPLE.length, 'no rows added or lost');
  rows.forEach(function (r, i) { assert.deepStrictEqual(r.slice(0, 10), h.PEOPLE[i].slice(0, 10), 'row ' + (i + 2) + ' unchanged in columns A to J'); });
  rows.forEach(function (r, i) { assert.strictEqual(r[P.landline], '', 'row ' + (i + 2) + ' has a blank Landline'); });
  // and a ten-column person's record reads back with a blank landline, not an error
  var rec = app.get({ action: 'record', t: app.request('one@example.com') });
  assert.strictEqual(rec.ok, true, JSON.stringify(rec));
  assert.strictEqual(rec.landline, '');
  assert.strictEqual(app.fake.books.length, 1, 'setup used the existing sheet');
});

test('running setup twice changes nothing', { skip: skip }, function () {
  var app = h.readyApp();
  var before = JSON.stringify(['People', 'Links', 'Changes', 'Settings'].map(function (t) { return app.fake.rows(h.BOOK, t); }));
  app.setup();
  var after = JSON.stringify(['People', 'Links', 'Changes', 'Settings'].map(function (t) { return app.fake.rows(h.BOOK, t); }));
  assert.strictEqual(after, before);
  assert.strictEqual(app.fake.books.length, 1, 'setup must find the existing sheet, not make a second one');
});

// ---- ping

test('ping says which service this is and reads nothing', { skip: skip }, function () {
  var app = h.readyApp();
  assert.deepStrictEqual(app.get({ action: 'ping' }), { ok: true, service: 'AGA members' });
  assert.deepStrictEqual(app.get({}), { ok: true, service: 'AGA members' });
});

// ---- request

test('a known email gets one email with a 64-hex link and a Links row', { skip: skip }, function () {
  var app = h.readyApp();
  var res = app.post({ action: 'request', email: 'one@example.com' });
  assert.deepStrictEqual(res, { ok: true });
  assert.strictEqual(app.emails().length, 1);
  var m = app.lastEmail();
  assert.strictEqual(m.to, 'one@example.com');
  assert.strictEqual(m.subject, 'Acton Gardening Association - your link to update your details');
  assert.strictEqual(m.name, 'Acton Gardening Association');
  var token = h.tokenIn(m);
  assert.ok(token, 'email body should hold a link ending ?t=<64 hex chars>: ' + m.body);
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.ok(m.body.indexOf('https://ckav.github.io/acton-plot-planner/update.html?t=' + token) >= 0, 'link should point at the Settings page address');
  var links = app.links();
  assert.strictEqual(links.length, 1);
  assert.strictEqual(links[0][L.token], token);
  assert.strictEqual(links[0][L.id], 'C901');
  assert.strictEqual(links[0][L.sentTo], 'one@example.com');
  assert.strictEqual(ms(links[0][L.made]), app.fake.now(), 'Made should be the time of the request');
  assert.strictEqual(ms(links[0][L.expires]) - ms(links[0][L.made]), 24 * HOUR, 'Expires should be Made + 24 hours');
  assert.strictEqual(links[0][L.used], '', 'Used should be blank until a save');
});

test('the email greets the person by name and says the link works once and for 24 hours', { skip: skip }, function () {
  var app = h.readyApp();
  app.post({ action: 'request', email: 'one@example.com' });
  var body = app.lastEmail().body;
  assert.ok(body.indexOf('Hello Test Person One,') >= 0, body);
  assert.ok(body.indexOf('You asked on our website for a link to check and update the details Acton Gardening Association holds for you. Here it is:') >= 0, body);
  assert.ok(body.indexOf('The link works once and only for the next 24 hours. If it has run out, ask for a new one on the same page. If you did not ask for this, you can ignore this email - nothing has changed.') >= 0, body);
  assert.ok(/\n\nActon Gardening Association\nactongardening@gmail\.com\s*$/.test(body), 'signs off with the association name and inbox: ' + JSON.stringify(body.slice(-80)));
});

test('the email body contains no HTML and no other links', { skip: skip }, function () {
  var app = h.readyApp();
  app.post({ action: 'request', email: 'one@example.com' });
  var m = app.lastEmail();
  assert.ok(!m.htmlBody, 'no htmlBody');
  assert.ok(!/<[a-z!\/][^>]*>/i.test(m.body), 'no tags in the body: ' + m.body);
  var links = m.body.match(/https?:\/\/\S+/g) || [];
  assert.strictEqual(links.length, 1, 'exactly one link in the email: ' + links.join(' '));
});

test('an unknown email sends nothing and gets the same answer as a known one', { skip: skip }, function () {
  var app = h.readyApp();
  var known = app.post({ action: 'request', email: 'one@example.com' });
  var unknown = app.post({ action: 'request', email: 'nobody@example.com' });
  assert.deepStrictEqual(unknown, known);
  assert.deepStrictEqual(unknown, { ok: true });
  assert.strictEqual(app.emails().length, 1, 'only the known address should get an email');
  assert.strictEqual(app.links().length, 1, 'no Links row for an unknown address');
});

test('a blank email is refused with error "email"', { skip: skip }, function () {
  var app = h.readyApp();
  assert.deepStrictEqual(app.post({ action: 'request', email: '' }), { ok: false, error: 'email' });
  assert.deepStrictEqual(app.post({ action: 'request', email: '   ' }), { ok: false, error: 'email' });
  assert.deepStrictEqual(app.post({ action: 'request' }), { ok: false, error: 'email' });
  assert.strictEqual(app.emails().length, 0);
  assert.strictEqual(app.links().length, 0);
});

test('a malformed or absurd email is refused with error "email", not matched', { skip: skip }, function () {
  var app = h.readyApp();
  var bad = ['not an email', 'one@', '@example.com', 'one@example', 'one@example.com extra words', 'x'.repeat(200) + '@example.com', 42, null, true, { email: 'one@example.com' }];
  bad.forEach(function (v) {
    var res = app.post({ action: 'request', email: v });
    assert.strictEqual(res.ok, false, 'should refuse ' + JSON.stringify(v) + ' but got ' + JSON.stringify(res));
    assert.strictEqual(res.error, 'email', 'error for ' + JSON.stringify(v));
  });
  assert.strictEqual(app.emails().length, 0);
});

test('the email match ignores case and surrounding spaces', { skip: skip }, function () {
  var app = h.readyApp();
  assert.deepStrictEqual(app.post({ action: 'request', email: '  ONE@Example.COM  ' }), { ok: true });
  assert.strictEqual(app.emails().length, 1);
  assert.strictEqual(String(app.lastEmail().to).toLowerCase(), 'one@example.com');
  assert.strictEqual(app.links()[0][L.id], 'C901');
});

test('a request for a blank address never matches the person who has no email', { skip: skip }, function () {
  var app = h.readyApp();
  app.post({ action: 'request', email: '' });
  app.post({ action: 'request', email: ' ' });
  assert.strictEqual(app.emails().length, 0);
  assert.strictEqual(app.links().length, 0);
});

test('two people sharing one email each get their own link, greeted by their own name', { skip: skip }, function () {
  var app = h.readyApp();
  assert.deepStrictEqual(app.post({ action: 'request', email: 'shared@example.com' }), { ok: true });
  assert.strictEqual(app.emails().length, 2, 'one email per People row with that address');
  var bodies = app.emails().map(function (m) { return m.body; });
  assert.ok(bodies.some(function (b) { return b.indexOf('Hello Test Person Five,') >= 0; }), 'one email greets Five');
  assert.ok(bodies.some(function (b) { return b.indexOf('Hello Test Person Six,') >= 0; }), 'one email greets Six');
  app.emails().forEach(function (m) { assert.strictEqual(m.to, 'shared@example.com'); });
  var links = app.links();
  assert.strictEqual(links.length, 2);
  assert.deepStrictEqual(links.map(function (r) { return r[L.id]; }).sort(), ['C905', 'C906']);
  var tokens = app.emails().map(h.tokenIn);
  assert.notStrictEqual(tokens[0], tokens[1], 'the two links must differ');
  // each link opens only its own row
  var byName = {};
  tokens.forEach(function (t) { var rec = app.get({ action: 'record', t: t }); assert.strictEqual(rec.ok, true); byName[rec.name] = rec; });
  assert.deepStrictEqual(Object.keys(byName).sort(), ['Test Person Five', 'Test Person Six']);
  assert.strictEqual(byName['Test Person Five'].role, 'Responsible');
  assert.strictEqual(byName['Test Person Six'].role, 'Co-occupier');
  assert.strictEqual(byName['Test Person Six'].phone, '');
});

// ---- request: the honeypot (round 2, B4 and review R5). A bot that fills the hidden "leave_empty" box gets a
// polite ok and nothing else. (The box was called "website" until review R5: password managers fill that name.)

test('a request with the honeypot filled answers ok at once: no Links row, no email, no lock', { skip: skip }, function () {
  var app = h.readyApp();
  var res = app.post({ action: 'request', email: 'one@example.com', leave_empty: 'http://spam.example.com' });
  assert.deepStrictEqual(res, { ok: true }, 'the same answer a real request gets, so the bot learns nothing');
  assert.strictEqual(app.emails().length, 0, 'no email sent');
  assert.strictEqual(app.links().length, 0, 'no Links row');
  assert.deepStrictEqual(app.fake.locks, [], 'answered before the lock is taken');
  assert.strictEqual(app.fake.lockHeld(), false);
  assert.strictEqual(app.people().length, h.PEOPLE.length, 'nothing touched');
});

test('the honeypot catches a filled box whatever the email, even one that is not on the list', { skip: skip }, function () {
  var app = h.readyApp();
  assert.deepStrictEqual(app.post({ action: 'request', email: 'nobody@example.com', leave_empty: 'x' }), { ok: true });
  assert.deepStrictEqual(app.post({ action: 'request', email: '', leave_empty: 'x' }), { ok: true }, 'even a blank email answers ok, not "email": nothing is read');
  assert.deepStrictEqual(app.post({ action: 'request', email: 'shared@example.com', leave_empty: ' ' }), { ok: true }, 'a single space is a non-empty string');
  assert.strictEqual(app.emails().length, 0);
  assert.strictEqual(app.links().length, 0);
  assert.deepStrictEqual(app.fake.locks, []);
});

test('non-string junk in the honeypot key (a number, an array, an object, a boolean) counts as filled', { skip: skip }, function () {
  var app = h.readyApp();
  [1, 0, 42.5, ['x'], ['a', 'b'], { a: 1 }, true, false].forEach(function (v) {
    assert.deepStrictEqual(app.post({ action: 'request', email: 'one@example.com', leave_empty: v }), { ok: true }, 'for ' + JSON.stringify(v));
  });
  assert.strictEqual(app.emails().length, 0, 'no email for any of them');
  assert.strictEqual(app.links().length, 0, 'no Links row for any of them');
  assert.deepStrictEqual(app.fake.locks, [], 'never reached the lock');
  // null is "nothing sent": the request goes through
  assert.deepStrictEqual(app.post({ action: 'request', email: 'one@example.com', leave_empty: null }), { ok: true });
  assert.strictEqual(app.emails().length, 1, 'null is treated as empty');
});

test('an empty or missing honeypot lets a real request through as before', { skip: skip }, function () {
  var app = h.readyApp();
  assert.deepStrictEqual(app.post({ action: 'request', email: 'one@example.com', leave_empty: '' }), { ok: true });
  assert.strictEqual(app.emails().length, 1, 'the page always sends leave_empty, empty for a person');
  assert.deepStrictEqual(app.post({ action: 'request', email: 'two@example.com' }), { ok: true });
  assert.strictEqual(app.emails().length, 2, 'no leave_empty key at all is fine too');
  assert.strictEqual(app.links().length, 2);
});

test('the old key "website" is not the honeypot any more', { skip: skip }, function () {
  var app = h.readyApp();
  assert.deepStrictEqual(app.post({ action: 'request', email: 'one@example.com', website: 'https://example.com' }), { ok: true });
  assert.strictEqual(app.emails().length, 1, 'a request carrying an old-style website key is an ordinary request');
  assert.strictEqual(app.links().length, 1);
});

test('a filled honeypot does not count against the per-email limit', { skip: skip }, function () {
  var app = h.readyApp();
  for (var i = 0; i < 5; i++) app.post({ action: 'request', email: 'one@example.com', leave_empty: 'spam' });
  assert.strictEqual(app.links().length, 0);
  app.post({ action: 'request', email: 'one@example.com', leave_empty: '' });
  assert.strictEqual(app.emails().length, 1, 'the real request after five bot hits still gets its email');
});

test('the 4th request for one email in a day sends nothing but still says ok', { skip: skip }, function () {
  var app = h.readyApp();
  for (var i = 0; i < 3; i++) assert.deepStrictEqual(app.post({ action: 'request', email: 'one@example.com' }), { ok: true });
  assert.strictEqual(app.emails().length, 3);
  assert.deepStrictEqual(app.post({ action: 'request', email: 'one@example.com' }), { ok: true }, 'the limit is silent');
  assert.strictEqual(app.emails().length, 3, 'the 4th request sends nothing');
  assert.strictEqual(app.links().length, 3, 'and makes no Links row');
  // a different spelling of the same address is still the same address
  app.post({ action: 'request', email: 'ONE@EXAMPLE.COM' });
  assert.strictEqual(app.emails().length, 3);
  // other people are not affected
  app.post({ action: 'request', email: 'two@example.com' });
  assert.strictEqual(app.emails().length, 4);
});

test('the per-email limit counts requests, so a shared address gets 3 requests (6 emails), not 1', { skip: skip }, function () {
  var app = h.readyApp();
  for (var i = 0; i < 3; i++) app.post({ action: 'request', email: 'shared@example.com' });
  assert.strictEqual(app.emails().length, 6, '3 requests x 2 rows');
  app.post({ action: 'request', email: 'shared@example.com' });
  assert.strictEqual(app.emails().length, 6, 'the 4th request sends nothing');
});

test('the per-email limit lets go after 24 hours', { skip: skip }, function () {
  var app = h.readyApp();
  for (var i = 0; i < 4; i++) app.post({ action: 'request', email: 'one@example.com' });
  assert.strictEqual(app.emails().length, 3);
  app.advance(24 * HOUR + 60000);
  app.post({ action: 'request', email: 'one@example.com' });
  assert.strictEqual(app.emails().length, 4);
});

test('the 61st email of the day is not sent but the answer is still ok', { skip: skip }, function () {
  var app = h.readyApp({ extraPeople: 70 });
  var extra = app.people().filter(function (r) { return /^person9\d\d@example\.com$/.test(String(r[P.email])); }).map(function (r) { return r[P.email]; });
  assert.ok(extra.length >= 61, 'need at least 61 made-up people');
  for (var i = 0; i < 60; i++) assert.deepStrictEqual(app.post({ action: 'request', email: extra[i] }), { ok: true });
  assert.strictEqual(app.emails().length, 60);
  assert.deepStrictEqual(app.post({ action: 'request', email: extra[60] }), { ok: true }, 'the cap is silent');
  assert.strictEqual(app.emails().length, 60, 'the 61st request sends nothing');
  assert.strictEqual(app.links().length, 60);
});

test('the daily cap counts emails sent, so a shared address uses two of the sixty', { skip: skip }, function () {
  var app = h.readyApp({ extraPeople: 70 });
  var extra = app.people().filter(function (r) { return /^person9\d\d@example\.com$/.test(String(r[P.email])); }).map(function (r) { return r[P.email]; });
  app.post({ action: 'request', email: 'shared@example.com' });   // 2 emails
  for (var i = 0; i < 58; i++) app.post({ action: 'request', email: extra[i] });
  assert.strictEqual(app.emails().length, 60);
  app.post({ action: 'request', email: extra[58] });
  assert.strictEqual(app.emails().length, 60, 'nothing sent once sixty have gone');
});

test('the daily cap lets go after 24 hours', { skip: skip }, function () {
  var app = h.readyApp({ extraPeople: 70 });
  var extra = app.people().filter(function (r) { return /^person9\d\d@example\.com$/.test(String(r[P.email])); }).map(function (r) { return r[P.email]; });
  for (var i = 0; i < 61; i++) app.post({ action: 'request', email: extra[i] });
  assert.strictEqual(app.emails().length, 60);
  app.advance(24 * HOUR + 60000);
  app.post({ action: 'request', email: extra[61] });
  assert.strictEqual(app.emails().length, 61);
});

// ---- record

test('a good link shows only that person\'s own row, nothing else', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  var rec = app.get({ action: 'record', t: token });
  assert.deepStrictEqual(rec, { ok: true, name: 'Test Person One', email: 'one@example.com', phone: '07700 900001', landline: '020 7946 0001', plots: 'Perryn 99', role: 'Responsible', shop: false, rota: false, news: true });
  assert.deepStrictEqual(Object.keys(rec).sort(), ['email', 'landline', 'name', 'news', 'ok', 'phone', 'plots', 'role', 'rota', 'shop'], 'no extra keys (no Contact ID, no token, nobody else)');
  var text = JSON.stringify(rec);
  assert.ok(text.indexOf('Two') < 0 && text.indexOf('Three') < 0 && text.indexOf('C901') < 0, 'no other people and no Contact ID in the answer');
});

test('the record returns the landline as a string, blank when there is none', { skip: skip }, function () {
  var app = h.readyApp();
  var one = app.get({ action: 'record', t: app.request('one@example.com') });
  assert.strictEqual(one.landline, '020 7946 0001');
  var three = app.get({ action: 'record', t: app.request('three@example.com') });
  assert.strictEqual(three.landline, '01632 960003');
  assert.strictEqual(three.phone, '', 'a landline with no mobile is fine');
  var two = app.get({ action: 'record', t: app.request('two@example.com') });
  assert.strictEqual(two.landline, '', 'blank, not null or undefined');
  assert.strictEqual(typeof two.landline, 'string');
});

test('preferences come back as true/false, not Yes/No', { skip: skip }, function () {
  var app = h.readyApp();
  var rec = app.get({ action: 'record', t: app.request('two@example.com') });
  assert.strictEqual(rec.shop, true);
  assert.strictEqual(rec.rota, false);
  assert.strictEqual(rec.news, true);
  var three = app.get({ action: 'record', t: app.request('three@example.com') });
  assert.strictEqual(three.rota, true);
  assert.strictEqual(three.phone, '');
  assert.strictEqual(three.plots, 'Vale 98, Vale 97');
});

test('a co-occupier\'s link shows the co-occupier\'s row, not the responsible tenant\'s', { skip: skip }, function () {
  var app = h.readyApp();
  var rec = app.get({ action: 'record', t: app.request('two@example.com') });
  assert.strictEqual(rec.ok, true);
  assert.strictEqual(rec.name, 'Test Person Two');
  assert.strictEqual(rec.role, 'Co-occupier');
  assert.strictEqual(rec.plots, 'Perryn 99');
  assert.strictEqual(rec.email, 'two@example.com');
  assert.ok(JSON.stringify(rec).indexOf('Test Person One') < 0, 'the responsible tenant must not appear');
});

test('a missing, empty or nonsense token is refused with "expired"', { skip: skip }, function () {
  var app = h.readyApp();
  app.request('one@example.com');
  assert.deepStrictEqual(app.get({ action: 'record' }), { ok: false, error: 'expired' });
  assert.deepStrictEqual(app.get({ action: 'record', t: '' }), { ok: false, error: 'expired' });
  assert.deepStrictEqual(app.get({ action: 'record', t: 'abc' }), { ok: false, error: 'expired' });
  assert.deepStrictEqual(app.get({ action: 'record', t: 'C901' }), { ok: false, error: 'expired' });
  assert.deepStrictEqual(app.get({ action: 'record', t: '*' }), { ok: false, error: 'expired' });
  assert.deepStrictEqual(app.get({ action: 'record', t: 'one@example.com' }), { ok: false, error: 'expired' });
});

test('a guessed token of the right shape is refused with "expired" and learns nothing', { skip: skip }, function () {
  var app = h.readyApp();
  var real = app.request('one@example.com');
  var guess = real.slice(0, 63) + (real[63] === 'a' ? 'b' : 'a');
  var middle = real.slice(0, 31) + (real[31] === '0' ? '1' : '0') + real.slice(32);
  assert.deepStrictEqual(app.get({ action: 'record', t: guess }), { ok: false, error: 'expired' });
  assert.deepStrictEqual(app.get({ action: 'record', t: middle }), { ok: false, error: 'expired' });
  assert.deepStrictEqual(app.get({ action: 'record', t: 'f'.repeat(64) }), { ok: false, error: 'expired' });
  assert.deepStrictEqual(app.get({ action: 'record', t: real + '0' }), { ok: false, error: 'expired' });
  assert.deepStrictEqual(app.get({ action: 'record', t: real.slice(1) }), { ok: false, error: 'expired' });
  assert.deepStrictEqual(app.post(goodSave(guess)), { ok: false, error: 'expired' });
  assert.strictEqual(app.changes().length, 0);
});

test('a link 23 hours old still works', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  app.advance(23 * HOUR);
  assert.strictEqual(app.get({ action: 'record', t: token }).ok, true);
  assert.deepStrictEqual(app.post(goodSave(token, { phone: '07700 900011' })), { ok: true });
  assert.strictEqual(app.person('C901').Phone, '07700 900011');
});

test('a link 25 hours old is refused with "expired"', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  app.advance(25 * HOUR);
  assert.deepStrictEqual(app.get({ action: 'record', t: token }), { ok: false, error: 'expired' });
  assert.deepStrictEqual(app.post(goodSave(token, { phone: '07700 900011' })), { ok: false, error: 'expired' });
  assert.strictEqual(app.person('C901').Phone, '07700 900001', 'nothing changed');
  assert.strictEqual(app.changes().length, 0);
});

test('no other GET action reads anything', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  ['people', 'rows', 'links', 'list', 'export', 'record ', 'RECORD', 'setup', 'save'].forEach(function (a) {
    var out = JSON.stringify(app.get({ action: a, t: token, email: 'one@example.com' }));
    assert.ok(out.indexOf('Test Person') < 0 && out.indexOf('example.com') < 0 && out.indexOf(token) < 0, 'action "' + a + '" leaked: ' + out);
  });
});

// ---- save

test('a save changes phone, landline and preferences, stamps Last updated, logs a Changes row and uses up the link', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  app.advance(5 * 60000);
  var res = app.post({ action: 'save', t: token, email: 'one@example.com', phone: '07700 900099', landline: '020 7946 0099', shop: true, rota: true, news: false });
  assert.deepStrictEqual(res, { ok: true });
  var p = app.person('C901');
  assert.strictEqual(p.Name, 'Test Person One', 'the name is not the member\'s to change');
  assert.strictEqual(p.Email, 'one@example.com');
  assert.strictEqual(p.Phone, '07700 900099');
  assert.strictEqual(p.Landline, '020 7946 0099');
  assert.strictEqual(p['Shop updates'], 'Yes');
  assert.strictEqual(p['Volunteer rota'], 'Yes');
  assert.strictEqual(p['General news'], 'No');
  assert.strictEqual(ms(p['Last updated']), app.fake.now(), 'Last updated is the save time');
  assert.strictEqual(p.Plots, 'Perryn 99');
  assert.strictEqual(p.Role, 'Responsible');
  var ch = app.changes();
  assert.strictEqual(ch.length, 1);
  assert.strictEqual(ms(ch[0][C.when]), app.fake.now());
  assert.strictEqual(ch[0][C.id], 'C901');
  ['Phone', 'Landline', 'Shop updates', 'Volunteer rota', 'General news'].forEach(function (f) { assert.ok(String(ch[0][C.what]).indexOf(f) >= 0, 'What changed should name ' + f + ': ' + ch[0][C.what]); });
  assert.ok(String(ch[0][C.what]).indexOf('Email') < 0, 'Email did not change');
  assert.ok(String(ch[0][C.what]).indexOf('Name') < 0, 'Name is never listed');
  assert.strictEqual(ms(linkFor(app, token)[L.used]), app.fake.now(), 'Used is stamped');
});

test('the Changes row names fields only, never the old or new values', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  app.post(goodSave(token, { phone: '07700 123456', email: 'won@example.com', landline: '01632 960123' }));
  var what = String(app.changes()[0][C.what]);
  ['Test Person One', '07700 900001', '07700 123456', 'one@example.com', 'won@example.com', '020 7946 0001', '01632 960123'].forEach(function (v) { assert.ok(what.indexOf(v) < 0, 'value leaked into Changes: ' + what); });
});

test('the Changes row names Landline when only the landline changed, and never Name', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  assert.deepStrictEqual(app.post(goodSave(token, { landline: '01632 960077' })), { ok: true });
  assert.strictEqual(String(app.changes()[0][C.what]), 'Landline');
  // a name sent along with a real change is still not a change
  var t2 = app.request('one@example.com');
  assert.deepStrictEqual(app.post(goodSave(t2, { name: 'Test Person Renamed', landline: '', phone: '07700 900011' })), { ok: true });
  var what = String(app.changes()[1][C.what]);
  assert.ok(what.indexOf('Phone') >= 0 && what.indexOf('Landline') >= 0, 'Phone and Landline changed: ' + what);
  assert.ok(what.indexOf('Name') < 0, 'Name is never listed: ' + what);
  assert.strictEqual(app.person('C901').Landline, '', 'a landline can be cleared');
});

// ---- save: Name is read-only for members (round 2, B6): a plot is not transferable, so the name on the record stays.

test('a save ignores a name sent, whatever its shape, and never writes column B', { skip: skip }, function () {
  var app = h.readyApp();
  var names = ['Test Person Won', '', '   ', 'N'.repeat(2000), 'Test\nPerson\r\n\tOne', '=HYPERLINK("x")', '<b>Test</b> Person', 42, null, { a: 1 }];
  var people = ['one@example.com', 'two@example.com', 'three@example.com'];
  var people_ = [goodSave, twoSave, function (t, x) { return Object.assign({ action: 'save', t: t, email: 'three@example.com', phone: '', landline: '01632 960003', shop: false, rota: true, news: true }, x || {}); }];
  names.forEach(function (name, i) {
    var who = i % 3, token = i < 3 ? app.request(people[who]) : nextDayToken(app, people[who]);
    var res = app.post(people_[who](token, { name: name, phone: '07700 9000' + (10 + i) }));
    assert.deepStrictEqual(res, { ok: true }, 'name ' + JSON.stringify(name) + ' is ignored, not refused: ' + JSON.stringify(res));
  });
  assert.strictEqual(app.person('C901').Name, 'Test Person One');
  assert.strictEqual(app.person('C902').Name, 'Test Person Two');
  assert.strictEqual(app.person('C903').Name, 'Test Person Three');
  assert.deepStrictEqual(app.people().map(function (r) { return r[P.name]; }), h.PEOPLE.map(function (r) { return r[1]; }), 'column B is untouched on every row');
  app.changes().forEach(function (r) { assert.ok(String(r[C.what]).indexOf('Name') < 0, 'Name never appears in Changes: ' + r[C.what]); });
  assert.strictEqual(app.changes().length, names.length, 'every save went through');
});

test('a save with no name at all is fine: the name is not read', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  var body = goodSave(token, { phone: '07700 900011' });
  assert.ok(!('name' in body), 'the test body carries no name');
  assert.deepStrictEqual(app.post(body), { ok: true });
  assert.strictEqual(app.person('C901').Name, 'Test Person One');
  assert.strictEqual(app.person('C901').Phone, '07700 900011');
  assert.strictEqual(String(app.changes()[0][C.what]), 'Phone');
});

test('there is no "name" error any more: a save never answers error "name"', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  [goodSave(token, { name: '' }), goodSave(token, { name: 'N'.repeat(81) }), goodSave(token, { name: '=1+1' })].forEach(function (body) {
    var res = app.post(body);
    assert.notStrictEqual(res.error, 'name', 'answered "name" for ' + JSON.stringify(body.name).slice(0, 20));
  });
});

test('a save with nothing changed still says ok and uses the link', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  assert.deepStrictEqual(app.post(goodSave(token)), { ok: true });
  assert.notStrictEqual(linkFor(app, token)[L.used], '');
  assert.deepStrictEqual(app.get({ action: 'record', t: token }), { ok: false, error: 'expired' });
});

test('a used link is refused: the second save on the same token gets "expired"', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  assert.deepStrictEqual(app.post(goodSave(token, { phone: '07700 900011' })), { ok: true });
  assert.deepStrictEqual(app.post(goodSave(token, { phone: '07700 900022' })), { ok: false, error: 'expired' });
  assert.strictEqual(app.person('C901').Phone, '07700 900011');
  assert.strictEqual(app.changes().length, 1);
  assert.deepStrictEqual(app.get({ action: 'record', t: token }), { ok: false, error: 'expired' }, 'the record cannot be read with a used link either');
});

test('two saves in quick succession go through once, inside the script lock', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  var a = app.post(goodSave(token, { phone: '07700 900011' }));
  var b = app.post(goodSave(token, { phone: '07700 900022' }));
  assert.deepStrictEqual([a, b], [{ ok: true }, { ok: false, error: 'expired' }]);
  assert.strictEqual(app.changes().length, 1);
  var locks = app.fake.locks;
  assert.ok(locks.indexOf('wait') >= 0 || locks.indexOf('try') >= 0, 'save should take LockService.getScriptLock()');
  assert.strictEqual(app.fake.lockHeld(), false, 'the lock is released afterwards');
});

test('the lock is released even when the save is refused', { skip: skip }, function () {
  var app = h.readyApp();
  app.post(goodSave('f'.repeat(64)));
  app.post(goodSave(app.request('one@example.com'), { phone: 'not a number' }));
  app.post(goodSave(app.request('one@example.com'), { landline: 'not a number' }));
  assert.strictEqual(app.fake.lockHeld(), false);
  // and a later save still works
  assert.deepStrictEqual(app.post(twoSave(app.request('two@example.com'), { phone: '' })), { ok: true });
});

test('a save cannot change Plots, Role or Contact ID even if they are sent', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('two@example.com');
  var res = app.post({ action: 'save', t: token, email: 'two@example.com', phone: '07700 900002', landline: '', shop: true, rota: false, news: true,
    plots: 'Vale 1', role: 'Responsible', contactId: 'C999', id: 'C999', 'Contact ID': 'C999', Plots: 'Vale 1', Role: 'Responsible', updated: '2020-01-01', lastUpdated: '2020-01-01' });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  var p = app.person('C902');
  assert.ok(p, 'C902 still exists');
  assert.strictEqual(p.Plots, 'Perryn 99');
  assert.strictEqual(p.Role, 'Co-occupier');
  assert.strictEqual(app.people().length, h.PEOPLE.length);
  assert.ok(!app.person('C999'));
  assert.strictEqual(app.person('C901').Plots, 'Perryn 99');
});

test('a save only touches the row the link belongs to', { skip: skip }, function () {
  var app = h.readyApp();
  var before = JSON.stringify(app.people().filter(function (r) { return r[P.id] !== 'C902'; }));
  app.post(twoSave(app.request('two@example.com'), { phone: '07700 900022', landline: '020 7946 0022', shop: false, rota: true, news: false }));
  var after = JSON.stringify(app.people().filter(function (r) { return r[P.id] !== 'C902'; }));
  assert.strictEqual(after, before, 'every other row is untouched');
  assert.strictEqual(app.person('C902').Phone, '07700 900022');
  assert.strictEqual(app.person('C902').Landline, '020 7946 0022');
});

// ---- save: the landline (round 2). Optional, column K, checked like the mobile.

test('a landline is saved to column K and comes back on the record', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('two@example.com');
  assert.deepStrictEqual(app.post(twoSave(token, { landline: '01632 960010' })), { ok: true });
  assert.strictEqual(app.people()[1][P.landline], '01632 960010', 'column K of Test Person Two\'s row');
  assert.strictEqual(app.person('C902').Landline, '01632 960010');
  assert.strictEqual(app.person('C902').Phone, '07700 900002', 'the mobile is separate');
  var rec = app.get({ action: 'record', t: app.request('two@example.com') });
  assert.strictEqual(rec.landline, '01632 960010');
  assert.strictEqual(rec.phone, '07700 900002');
});

test('a landline with +44 and brackets is kept as typed, and a missing landline saves as blank', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  assert.deepStrictEqual(app.post(goodSave(token, { landline: '+44 (0)20 7946 0001' })), { ok: true });
  assert.strictEqual(app.person('C901').Landline, '+44 (0)20 7946 0001');
  var body = goodSave(app.request('one@example.com')); delete body.landline;
  assert.deepStrictEqual(app.post(body), { ok: true });
  assert.strictEqual(app.person('C901').Landline, '', 'no landline in the body means none on the record');
});

test('a bad landline on save is refused with "landline" and nothing changes', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  ['not a number', '020 794O 0001', '1'.repeat(31), '020 7946 0001; DROP TABLE People', '<b>1</b>', '=1+1', 'landline@example.com'].forEach(function (v) {
    assert.deepStrictEqual(app.post(goodSave(token, { landline: v })), { ok: false, error: 'landline' }, 'for ' + JSON.stringify(v));
  });
  assert.strictEqual(app.person('C901').Landline, '020 7946 0001');
  assert.strictEqual(app.person('C901').Phone, '07700 900001');
  assert.strictEqual(app.changes().length, 0);
  assert.strictEqual(linkFor(app, token)[L.used], '', 'a refused save does not spend the link');
  assert.deepStrictEqual(app.post(goodSave(token, { landline: '1'.repeat(30) })), { ok: true }, 'thirty digits is the most a landline may be');
});

test('a bad mobile is "phone" and a bad landline is "landline": the mobile is checked first', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  assert.deepStrictEqual(app.post(goodSave(token, { phone: 'bad', landline: 'bad' })), { ok: false, error: 'phone' });
  assert.deepStrictEqual(app.post(goodSave(token, { phone: '07700 900001', landline: 'bad' })), { ok: false, error: 'landline' });
  assert.deepStrictEqual(app.post(goodSave(token, { phone: 'bad', landline: '' })), { ok: false, error: 'phone' });
});

test('a bad email on save is refused with "email"', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  ['', 'not an email', 'one@', 'x'.repeat(121) + '@example.com', 'a@b.c\nbcc: boss@example.com'].forEach(function (v) {
    assert.deepStrictEqual(app.post(goodSave(token, { email: v })), { ok: false, error: 'email' }, 'for ' + JSON.stringify(v));
  });
  assert.strictEqual(app.person('C901').Email, 'one@example.com');
});

test('a bad phone on save is refused with "phone", an empty phone is fine', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  ['not a number', '0770O 9OOOO1', '1'.repeat(31), '07700 900001; DROP TABLE People', '<b>1</b>'].forEach(function (v) {
    assert.deepStrictEqual(app.post(goodSave(token, { phone: v })), { ok: false, error: 'phone' }, 'for ' + JSON.stringify(v));
  });
  assert.strictEqual(app.person('C901').Phone, '07700 900001');
  assert.deepStrictEqual(app.post(goodSave(token, { phone: '+44 (0)7700 900 001' })), { ok: true });
  assert.strictEqual(app.person('C901').Phone, '+44 (0)7700 900 001');
  var t2 = app.request('two@example.com');
  assert.deepStrictEqual(app.post(twoSave(t2, { phone: '' })), { ok: true });
  assert.strictEqual(app.person('C902').Phone, '');
});

test('the token is checked before the fields, so a bad link with bad fields says "expired"', { skip: skip }, function () {
  var app = h.readyApp();
  assert.deepStrictEqual(app.post(goodSave('f'.repeat(64), { email: '', phone: 'x', landline: 'x' })), { ok: false, error: 'expired' });
  assert.deepStrictEqual(app.post(goodSave('', { landline: 'x' })), { ok: false, error: 'expired' });
});

test('a refused save does not use up the link: fixing the field and saving again works', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  assert.deepStrictEqual(app.post(goodSave(token, { phone: 'wrong' })), { ok: false, error: 'phone' });
  assert.strictEqual(linkFor(app, token)[L.used], '', 'Used stays blank after a refused save');
  assert.strictEqual(app.get({ action: 'record', t: token }).ok, true);
  assert.deepStrictEqual(app.post(goodSave(token, { phone: '07700 900011' })), { ok: true });
});

test('preference values are taken as true/false and stored as Yes/No', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('three@example.com');
  assert.deepStrictEqual(app.post({ action: 'save', t: token, email: 'three@example.com', phone: '', landline: '01632 960003', shop: true, rota: false, news: true }), { ok: true });
  var p = app.person('C903');
  assert.deepStrictEqual([p['Shop updates'], p['Volunteer rota'], p['General news']], ['Yes', 'No', 'Yes']);
  // odd values cannot smuggle text into the sheet
  var t2 = app.request('one@example.com');
  var res = app.post(goodSave(t2, { shop: '<script>', rota: 'DROP', news: { a: 1 } }));
  var q = app.person('C901');
  [q['Shop updates'], q['Volunteer rota'], q['General news']].forEach(function (v) { assert.ok(v === 'Yes' || v === 'No', 'preference cell must be Yes or No, got ' + JSON.stringify(v) + ' (save said ' + JSON.stringify(res) + ')'); });
});

test('an email, phone or landline that starts with "=" (a spreadsheet formula) is refused; a name that does is simply ignored', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  assert.deepStrictEqual(app.post(goodSave(token, { email: '=HYPERLINK("x")@example.com' })), { ok: false, error: 'email' });
  assert.deepStrictEqual(app.post(goodSave(token, { email: '  =1+1@example.com' })), { ok: false, error: 'email' }, 'leading spaces do not hide the =');
  assert.deepStrictEqual(app.post(goodSave(token, { phone: '=1+1' })), { ok: false, error: 'phone' });
  assert.deepStrictEqual(app.post(goodSave(token, { landline: '=1+1' })), { ok: false, error: 'landline' });
  var p = app.person('C901');
  assert.deepStrictEqual([p.Name, p.Email, p.Phone, p.Landline], ['Test Person One', 'one@example.com', '07700 900001', '020 7946 0001'], 'nothing changed');
  assert.strictEqual(app.changes().length, 0);
  assert.strictEqual(linkFor(app, token)[L.used], '', 'the link is still usable');
  // a formula in the name goes nowhere: not refused, not written
  assert.deepStrictEqual(app.post(goodSave(token, { name: '=HYPERLINK("x")' })), { ok: true });
  assert.strictEqual(app.person('C901').Name, 'Test Person One');
});

test('setup makes columns B to D and K plain text for rows 2 to 2001, so a phone keeps its leading zero', { skip: skip }, function () {
  var app = h.makeApp();
  app.setup();
  var f = app.fake.formats('People');
  [2, 3, 4, 11].forEach(function (col) {
    var missing = [];
    for (var row = 2; row <= 2001; row++) if (f[row + ',' + col] !== '@') missing.push(row);
    assert.deepStrictEqual(missing, [], 'People column ' + col + ' should be text (@) on every row from 2 to 2001; rows without it: ' + missing.slice(0, 5).join(', ') + (missing.length > 5 ? '...' : ''));
    assert.notStrictEqual(f['1,' + col], '@', 'the heading row of column ' + col + ' is not formatted');
    assert.notStrictEqual(f['2002,' + col], '@', 'the formatting of column ' + col + ' stops at row 2001');
  });
});

test('the Landline format is applied again when setup runs on a sheet that had ten columns', { skip: skip }, function () {
  var app = h.makeApp();
  var ss = app.fake.globals.SpreadsheetApp.create(h.BOOK);
  var sh = ss.getSheets()[0];
  sh.setName('People');
  sh.appendRow(h.PEOPLE_HEAD.slice(0, 10));
  app.fake.state.props.sheetId = ss.getId();
  app.setup();
  var f = app.fake.formats('People');
  assert.strictEqual(f['2,11'], '@', 'K2 is text after setup');
  assert.strictEqual(f['2001,11'], '@', 'K2001 is text after setup');
});

// ---- when Google misbehaves (Stage 3)

test('the sheet is stored by ID in script properties, and nothing touches Drive', { skip: skip }, function () {
  var app = h.makeApp();
  app.setup();
  var book = app.fake.book(h.BOOK);
  assert.strictEqual(app.fake.props.sheetId, book.getId(), 'setup stores the sheet ID as the "sheetId" script property');
  app.setup();
  assert.strictEqual(app.fake.books.length, 1, 'a second setup opens the stored sheet, not a new one');
  assert.ok(!/DriveApp/.test(require('fs').readFileSync(h.SCRIPT, 'utf8')), 'Members.gs must not use DriveApp (no Drive permission)');
});

test('when the sheet cannot be opened, GET and POST still answer JSON { ok: false, error: "server" }', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  var fresh = h.makeApp();          // a new run, so no book is cached from before
  fresh.fake.failOpen(true);
  fresh.fake.state.props.sheetId = 'book-that-cannot-open';
  assert.deepStrictEqual(fresh.get({ action: 'record', t: token }), { ok: false, error: 'server' });
  assert.deepStrictEqual(fresh.post({ action: 'request', email: 'one@example.com' }), { ok: false, error: 'server' });
  assert.deepStrictEqual(fresh.post(goodSave(token)), { ok: false, error: 'server' });
  assert.ok(fresh.fake.log.some(function (l) { return /unreachable/.test(l); }), 'the real message goes to the log: ' + JSON.stringify(fresh.fake.log));
  assert.strictEqual(fresh.fake.lockHeld(), false, 'the lock is released');
  assert.deepStrictEqual(fresh.get({ action: 'ping' }), { ok: true, service: 'AGA members' }, 'ping needs no sheet');
});

test('an error answer never carries the exception text', { skip: skip }, function () {
  var app = h.readyApp();
  app.fake.failAppend('Links');
  var res = app.post({ action: 'request', email: 'one@example.com' });
  assert.ok(JSON.stringify(res).indexOf('Fake:') < 0 && JSON.stringify(res).indexOf('unreachable') < 0, 'leaked: ' + JSON.stringify(res));
  assert.ok(res.ok === true || res.error === 'server', 'a request that could not be filed is either silent or "server": ' + JSON.stringify(res));
  assert.strictEqual(app.emails().length, 0, 'no email when the Links row could not be written');
});

test('a mail failure for one household member does not stop the other\'s email', { skip: skip }, function () {
  var app = h.readyApp();
  app.fake.failMailNth(1);   // the first send of the request (Test Person Five, the first matching row) fails
  var res = app.post({ action: 'request', email: 'shared@example.com' });
  assert.deepStrictEqual(res, { ok: true });
  assert.strictEqual(app.emails().length, 1, 'exactly one email got through');
  assert.ok(app.lastEmail().body.indexOf('Hello Test Person Six,') >= 0, 'the second person still got their link: ' + app.lastEmail().body.slice(0, 40));
  assert.strictEqual(app.lastEmail().to, 'shared@example.com');
  var token = h.tokenIn(app.lastEmail());
  assert.strictEqual(app.get({ action: 'record', t: token }).name, 'Test Person Six');
  assert.ok(app.fake.log.some(function (l) { return /mail to/i.test(l); }), 'the failure is logged: ' + JSON.stringify(app.fake.log));
  assert.strictEqual(app.fake.lockHeld(), false);
  // and the other way round: the second send fails, the first still goes
  var app2 = h.readyApp();
  app2.fake.failMailNth(2);
  assert.deepStrictEqual(app2.post({ action: 'request', email: 'shared@example.com' }), { ok: true });
  assert.strictEqual(app2.emails().length, 1);
  assert.ok(app2.lastEmail().body.indexOf('Hello Test Person Five,') >= 0);
});

test('the request path takes the script lock and releases it', { skip: skip }, function () {
  var app = h.readyApp();
  assert.deepStrictEqual(app.fake.locks, []);
  app.post({ action: 'request', email: 'one@example.com' });
  assert.ok(app.fake.locks.indexOf('wait') >= 0 || app.fake.locks.indexOf('try') >= 0, 'request should take LockService.getScriptLock(): ' + JSON.stringify(app.fake.locks));
  assert.strictEqual(app.fake.locks[app.fake.locks.length - 1], 'release');
  assert.strictEqual(app.fake.lockHeld(), false);
  app.fake.state.locks.length = 0;
  app.post({ action: 'request', email: 'nobody@example.com' });
  assert.strictEqual(app.fake.lockHeld(), false, 'released after an unknown address too');
});

test('Used is set first: the link is spent even when the Changes row cannot be written', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  app.fake.failAppend('Changes');
  var res = app.post(goodSave(token, { phone: '07700 900011' }));
  assert.ok(res.ok === false, 'the save reports a problem: ' + JSON.stringify(res));
  assert.strictEqual(res.error, 'server');
  assert.notStrictEqual(linkFor(app, token)[L.used], '', 'Used was stamped before the Changes write');
  assert.deepStrictEqual(app.get({ action: 'record', t: token }), { ok: false, error: 'expired' });
  assert.deepStrictEqual(app.post(goodSave(token, { phone: '07700 900022' })), { ok: false, error: 'expired' }, 'the link cannot be replayed');
  assert.strictEqual(app.fake.lockHeld(), false);
});

// ---- unknown and broken input

test('an unknown action is refused with "unknown"', { skip: skip }, function () {
  var app = h.readyApp();
  assert.deepStrictEqual(app.post({ action: 'delete', t: 'x' }), { ok: false, error: 'unknown' });
  assert.deepStrictEqual(app.post({ action: 'setup' }), { ok: false, error: 'unknown' });
  assert.deepStrictEqual(app.post({ action: '' }), { ok: false, error: 'unknown' });
  assert.deepStrictEqual(app.post({}), { ok: false, error: 'unknown' });
  assert.deepStrictEqual(app.post({ action: 'Request', email: 'one@example.com' }), { ok: false, error: 'unknown' });
  assert.strictEqual(app.emails().length, 0);
});

test('a body that is not JSON, or no body at all, gets a polite refusal, not a crash', { skip: skip }, function () {
  var app = h.readyApp();
  ['', 'not json', '[1,2]', 'null', '"text"', '{"action":"request","email":"one@example.com"'].forEach(function (raw) {
    var res;
    assert.doesNotThrow(function () { res = app.post(raw); }, 'body ' + JSON.stringify(raw));
    assert.strictEqual(res.ok, false, 'body ' + JSON.stringify(raw) + ' answered ' + JSON.stringify(res));
  });
  assert.doesNotThrow(function () { app.ctx.doPost({}); });
  assert.doesNotThrow(function () { app.ctx.doPost(); });
  assert.doesNotThrow(function () { app.ctx.doGet(); });
  assert.strictEqual(app.emails().length, 0);
});

test('the People row count is unchanged by any request', { skip: skip }, function () {
  var app = h.readyApp();
  var n = app.people().length;
  app.post({ action: 'request', email: 'one@example.com' });
  app.post({ action: 'request', email: 'nobody@example.com' });
  app.post({ action: 'request', email: '' });
  app.post({ action: 'request', email: 'new@example.com', name: 'Test Person New', plots: 'Perryn 1' });
  var token = h.tokenIn(app.emails()[0]);
  app.get({ action: 'record', t: token });
  app.get({ action: 'record', t: 'f'.repeat(64) });
  app.post(goodSave(token, { phone: 'bad' }));
  app.post(goodSave(token, { phone: '07700 900011' }));
  app.post(goodSave(token));
  app.post({ action: 'delete' });
  app.post('garbage');
  app.ctx.setup();
  assert.strictEqual(app.people().length, n);
  assert.deepStrictEqual(app.people().map(function (r) { return r[P.id]; }), h.PEOPLE.map(function (r) { return r[0]; }));
});

test('nothing but Email, Phone, Landline, the preferences and Last updated ever changes on a People row', { skip: skip }, function () {
  var app = h.readyApp();
  var token = app.request('one@example.com');
  var before = app.people().map(function (r) { return r.slice(); });
  app.post({ action: 'save', t: token, name: 'Test Person Changed', email: 'changed@example.com', phone: '07700 900100', landline: '020 7946 0100', shop: true, rota: true, news: false, extra: 'x', 'Last updated': 'never' });
  var after = app.people();
  after.forEach(function (row, i) {
    row.forEach(function (v, c) {
      var may = i === 0 && [P.email, P.phone, P.landline, P.shop, P.rota, P.news, P.updated].indexOf(c) >= 0;
      if (!may) assert.deepStrictEqual(v, before[i][c], 'row ' + (i + 2) + ' column ' + (c + 1) + ' changed');
    });
  });
  assert.strictEqual(after[0][P.name], 'Test Person One', 'column B (Name) never changes');
  assert.strictEqual(after[0][P.email], 'changed@example.com');
  assert.strictEqual(after[0][P.landline], '020 7946 0100');
  assert.strictEqual(after[0].length, 11, 'the row still has eleven columns');
});

test('the comment block at the top of Members.gs describes the round 2 behaviour', { skip: skip }, function () {
  var src = require('fs').readFileSync(h.SCRIPT, 'utf8');
  var m = src.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  assert.ok(m, 'Members.gs starts with a /** ... */ comment block');
  var head = m[1];
  assert.ok(/Landline/.test(head), 'the comment block mentions the Landline column');
  assert.ok(/leave_empty/.test(head), 'the comment block mentions the "leave_empty" honeypot');
  assert.ok(/landline/.test(head), 'the comment block mentions the landline field of the save body');
  assert.ok(/[Nn]ame[^.]*(read-only|read only|cannot be changed|cannot change|not changed|not written|not read)/.test(head), 'the comment block says Name is read-only for members');
  assert.ok(/transfer|passed to someone else|not transferable/i.test(head), 'the comment block says why (a plot is not transferable)');
});
