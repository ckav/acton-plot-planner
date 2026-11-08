/* Checks the fake Apps Script world itself, with a tiny inline script, so a failure in
   members.test.js can be trusted to be about Members.gs and not about the fake. */
'use strict';

var test = require('node:test');
var assert = require('node:assert');
var vm = require('vm');
var makeFake = require('./gas-fake');

var INLINE = [
  "var TABS = { People: ['Contact ID', 'Name'], Links: ['Token', 'Used'] };",
  "function now_() { return new Date(); }",
  "function book_() {",
  "  var files = DriveApp.getRootFolder().getFilesByName('Demo');",
  "  if (files.hasNext()) return SpreadsheetApp.open(files.next());",
  "  var ss = SpreadsheetApp.create('Demo'); ss.getSheets()[0].setName('People'); return ss;",
  "}",
  "function tab_(name) { var ss = book_(); var sh = ss.getSheetByName(name) || ss.insertSheet(name); if (sh.getLastRow() === 0) { sh.appendRow(TABS[name]); sh.setFrozenRows(1); } return sh; }",
  "function setup() { Object.keys(TABS).forEach(tab_); Logger.log('Sheet: ' + book_().getUrl()); }",
  "function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }",
  "function doGet(e) { return json_({ ok: true, when: now_().toISOString(), tz: Session.getScriptTimeZone() }); }",
  "function doPost(e) { var d = JSON.parse(e.postData.contents); var sh = tab_('Links'); var t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');",
  "  sh.appendRow([t, '']); MailApp.sendEmail({ to: d.email, subject: 'Hi', body: '?t=' + t, name: 'Demo' });",
  "  var c = CacheService.getScriptCache(); c.put('n', String(Number(c.get('n') || 0) + 1), 60);",
  "  var lock = LockService.getScriptLock(); lock.waitLock(5000); sh.getRange(2, 2).setValue(now_()); lock.releaseLock();",
  "  return json_({ ok: true, token: t, used: sh.getRange(2, 2).getValue() instanceof Date }); }"
].join('\n');

function load() {
  var fake = makeFake();
  var ctx = vm.createContext(fake.globals);
  vm.runInContext(INLINE, ctx);
  var VmDate = vm.runInContext('Date', ctx);
  ctx.now_ = function () { return new VmDate(fake.now()); };
  return { fake: fake, ctx: ctx };
}

test('the fake starts empty and setup makes a sheet with the asked-for tabs', function () {
  var w = load();
  assert.strictEqual(w.fake.books.length, 0);
  w.ctx.setup();
  w.ctx.setup();   // a second run finds the file by name instead of making another
  assert.strictEqual(w.fake.books.length, 1);
  var names = w.fake.book('Demo').getSheets().map(function (s) { return s.getName(); });
  assert.deepStrictEqual(names, ['People', 'Links']);
  assert.deepStrictEqual(w.fake.rows('Demo', 'People'), [['Contact ID', 'Name']]);
  assert.ok(/Sheet: https:\/\/docs\.google\.com/.test(w.fake.log[0]));
});

test('ranges are 1-based, cells default to blank, and values round-trip', function () {
  var w = load();
  w.ctx.setup();
  var sh = w.fake.book('Demo').getSheetByName('People');
  sh.appendRow(['C1', 'A']);
  sh.appendRow(['C2', 'B']);
  assert.strictEqual(sh.getLastRow(), 3);
  assert.strictEqual(sh.getLastColumn(), 2);
  assert.strictEqual(sh.getRange(3, 2).getValue(), 'B');
  assert.strictEqual(sh.getRange(3, 5).getValue(), '');
  sh.getRange(2, 1, 2, 2).setValues([['C1', 'A2'], ['C2', 'B2']]);
  assert.deepStrictEqual(sh.getRange(2, 1, 2, 2).getValues(), [['C1', 'A2'], ['C2', 'B2']]);
  assert.throws(function () { sh.getRange(0, 1); });
  assert.throws(function () { sh.getRange('A1'); });
  assert.throws(function () { sh.getRange(1, 1, 2, 2).setValues([['x']]); });
});

test('the inline script sends an email, writes a token, takes the lock and reads the fake clock', function () {
  var w = load();
  w.ctx.setup();
  var out = JSON.parse(w.ctx.doPost({ postData: { contents: JSON.stringify({ email: 'x@example.com' }) } }).getContent());
  assert.strictEqual(out.ok, true);
  assert.match(out.token, /^[0-9a-f]{64}$/);
  assert.strictEqual(out.used, true, 'a Date made by now_() must be a Date inside the sandbox');
  assert.strictEqual(w.fake.emails.length, 1);
  assert.deepStrictEqual([w.fake.emails[0].to, w.fake.emails[0].subject, w.fake.emails[0].name], ['x@example.com', 'Hi', 'Demo']);
  assert.strictEqual(w.fake.rows('Demo', 'Links')[1][0], out.token);
  assert.deepStrictEqual(w.fake.locks, ['wait', 'release']);
  var got = JSON.parse(w.ctx.doGet({ parameter: {} }).getContent());
  assert.strictEqual(got.when, '2026-11-07T10:00:00.000Z');
  assert.strictEqual(got.tz, 'Europe/London');
});

test('the cache honours expiry against the fake clock', function () {
  var w = load();
  w.ctx.setup();
  w.ctx.doPost({ postData: { contents: '{"email":"x@example.com"}' } });
  assert.strictEqual(w.fake.cache.n, '1');
  w.fake.advance(59 * 1000);
  assert.strictEqual(w.fake.globals.CacheService.getScriptCache().get('n'), '1');
  w.fake.advance(2 * 1000);
  assert.strictEqual(w.fake.globals.CacheService.getScriptCache().get('n'), null);
  assert.deepStrictEqual(w.fake.cache, {});
});

test('uuids are v4-shaped with hyphens and never repeat', function () {
  var w = load();
  var seen = {};
  for (var i = 0; i < 200; i++) {
    var u = w.fake.globals.Utilities.getUuid();
    assert.match(u, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(!seen[u]); seen[u] = true;
  }
});

test('a text output keeps its content and mime type', function () {
  var w = load();
  var CS = w.fake.globals.ContentService;
  var o = CS.createTextOutput('{"a":1}').setMimeType(CS.MimeType.JSON);
  assert.strictEqual(o.getContent(), '{"a":1}');
  assert.strictEqual(o.getMimeType(), 'application/json');
});

test('a held lock is refused to a second taker', function () {
  var w = load();
  var lock = w.fake.globals.LockService.getScriptLock();
  lock.waitLock(100);
  assert.strictEqual(lock.tryLock(100), false);
  assert.throws(function () { lock.waitLock(100); });
  lock.releaseLock();
  assert.strictEqual(lock.tryLock(100), true);
});
