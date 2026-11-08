/* Loads apps-script/Members.gs into a sandbox with the fake Apps Script globals (gas-fake.js),
   runs setup(), seeds the People tab with made-up members, and gives the tests two plain calls:
     app.get(params)  -> parsed JSON from doGet({ parameter: params })
     app.post(body)   -> parsed JSON from doPost({ postData: { contents: JSON.stringify(body) } })
   The script must take the time from a top-level function now_(); the harness replaces it so a
   test can move the clock (app.advance(hours * 3600000)) and see a link expire.

   Every name, email and plot here is invented. Nothing in this folder is a real member. */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var makeFake = require('./gas-fake');

var SCRIPT = path.join(__dirname, '..', 'apps-script', 'Members.gs');
var BOOK = 'AGA members';
var HOUR = 3600000;

// People tab columns, in the round 2 contract's order: Landline is last so nothing in the live sheet shifts.
var PEOPLE_HEAD = ['Contact ID', 'Name', 'Email', 'Phone', 'Plots', 'Role', 'Shop updates', 'Volunteer rota', 'General news', 'Last updated', 'Landline'];

// One responsible tenant and one co-occupier share Perryn 99. Five and Six are one household sharing
// an email address (two People rows, one address). Four has no email at all. One and Three have a
// landline (Ofcom reserved numbers); the rest do not. Phone is the mobile only.
var PEOPLE = [
  ['C901', 'Test Person One', 'one@example.com', '07700 900001', 'Perryn 99', 'Responsible', 'No', 'No', 'Yes', '', '020 7946 0001'],
  ['C902', 'Test Person Two', 'two@example.com', '07700 900002', 'Perryn 99', 'Co-occupier', 'Yes', 'No', 'Yes', '', ''],
  ['C903', 'Test Person Three', 'three@example.com', '', 'Vale 98, Vale 97', 'Responsible', 'No', 'Yes', 'Yes', '', '01632 960003'],
  ['C904', 'Test Person Four', '', '', 'Bromyard 96', 'Responsible', 'No', 'No', 'Yes', '', ''],
  ['C905', 'Test Person Five', 'shared@example.com', '07700 900005', 'Southfield 95', 'Responsible', 'No', 'No', 'Yes', '', ''],
  ['C906', 'Test Person Six', 'shared@example.com', '', 'Southfield 95', 'Co-occupier', 'No', 'No', 'No', '', '']
];

function scriptExists() { return fs.existsSync(SCRIPT); }

function makeApp(options) {
  options = options || {};
  if (!scriptExists()) throw new Error('apps-script/Members.gs is not written yet (' + SCRIPT + ')');
  var fake = makeFake(options);
  var ctx = vm.createContext(fake.globals);
  var source = fs.readFileSync(SCRIPT, 'utf8');
  vm.runInContext(source, ctx, { filename: 'Members.gs' });
  if (typeof ctx.now_ !== 'function') throw new Error('Members.gs must take the time from a top-level function now_() so tests can move the clock');
  // Dates must come from the sandbox's own Date so "instanceof Date" inside the script holds true.
  // (Builtins are not properties of the object passed to createContext, so ask the context for it.)
  var VmDate = vm.runInContext('Date', ctx);
  ctx.now_ = function () { return new VmDate(fake.now()); };

  function parse(out, what) {
    if (!out || typeof out.getContent !== 'function') throw new Error(what + ' did not return a ContentService text output');
    var text = out.getContent();
    try { return JSON.parse(text); } catch (e) { throw new Error(what + ' returned something that is not JSON: ' + String(text).slice(0, 200)); }
  }

  var app = {
    ctx: ctx,
    fake: fake,
    get: function (params) { return parse(ctx.doGet({ parameter: params || {}, parameters: {} }), 'doGet'); },
    post: function (body) { return parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body), type: 'text/plain' } }), 'doPost'); },
    advance: function (ms) { fake.advance(ms); },
    setTime: function (ms) { fake.setTime(ms); },
    setup: function () { ctx.setup(); return app; },
    // Seeds the People tab. Pass { extraPeople: n } for n more made-up rows (used by the daily-cap test).
    seed: function (opts) {
      opts = opts || {};
      var book = fake.book(BOOK);
      if (!book) throw new Error('setup() did not create a spreadsheet called "' + BOOK + '"');
      var sh = book.getSheetByName('People');
      if (!sh) throw new Error('setup() did not create a People tab');
      var rows = PEOPLE.map(function (r) { return r.slice(); });
      for (var i = 1; i <= (opts.extraPeople || 0); i++) {
        rows.push(['C' + (910 + i), 'Test Person ' + (910 + i), 'person' + (910 + i) + '@example.com', '', 'Perryn ' + (100 + i), 'Responsible', 'No', 'No', 'Yes', '', '']);
      }
      rows.forEach(function (r) { sh.appendRow(r); });
      return app;
    },
    // Tab rows without the header, as plain arrays, header row separately.
    tab: function (name) { var all = fake.rows(BOOK, name); return { head: all[0] || [], rows: all.slice(1) }; },
    people: function () { return app.tab('People').rows; },
    links: function () { return app.tab('Links').rows; },
    changes: function () { return app.tab('Changes').rows; },
    settings: function () { return app.tab('Settings').rows; },
    // A People row as an object keyed by the spec's headings.
    person: function (contactId) {
      var r = app.people().filter(function (x) { return String(x[0]) === contactId; })[0];
      if (!r) return null;
      var o = {}; PEOPLE_HEAD.forEach(function (h, i) { o[h] = r[i]; }); return o;
    },
    emails: function () { return fake.emails; },
    lastEmail: function () { return fake.emails[fake.emails.length - 1]; },
    // Ask for a link and return the token from the email that was sent.
    request: function (email) {
      var before = fake.emails.length;
      var res = app.post({ action: 'request', email: email });
      if (!res.ok) throw new Error('request for ' + email + ' refused: ' + JSON.stringify(res));
      if (fake.emails.length === before) throw new Error('request for ' + email + ' sent no email');
      return tokenIn(fake.emails[fake.emails.length - 1]);
    }
  };
  return app;
}

// The link in an email: <Page address>?t=<64 hex>
function tokenIn(email) {
  var m = String(email && email.body || '').match(/\?t=([0-9a-fA-F]{64})\b/);
  return m ? m[1] : null;
}

// setup() + seed in one go: what nearly every test wants.
function readyApp(opts) {
  var app = makeApp(opts);
  app.setup();
  app.seed(opts);
  return app;
}

module.exports = { makeApp: makeApp, readyApp: readyApp, tokenIn: tokenIn, scriptExists: scriptExists, SCRIPT: SCRIPT, BOOK: BOOK, HOUR: HOUR, PEOPLE: PEOPLE, PEOPLE_HEAD: PEOPLE_HEAD };
