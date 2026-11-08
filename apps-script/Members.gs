/**
 * AGA members. Runs in the association's Google account and lets a member update their own details
 * from the planner site (update.html). No login and no password: the member types their email, this
 * script emails them a link that works once and for 24 hours, and the link opens their own row to edit.
 * It is a separate project from the plot check receiver (Code.gs): different sheet, different web app
 * URL, and it asks for permission to use Sheets and to send email, nothing else (no Drive).
 *
 * The "AGA members" sheet (made by setup; its ID is kept in the script property "sheetId") has four tabs:
 *   People    one row per person: Contact ID (matches the committee workbook, C001...), Name, Email,
 *             Phone, Plots (text, e.g. "Perryn 3" or "Vale 25, Vale 26"), Role (Responsible or
 *             Co-occupier), Shop updates, Volunteer rota, General news (Yes or No), Last updated.
 *             A member may change their own Name, Email, Phone and the three choices. Nothing else,
 *             ever. Nothing about rent, warnings or notes lives in this sheet. Name, Email and Phone
 *             are text columns, so a phone keeps its leading zero and nothing is read as a formula.
 *   Links     one row per link sent: Token, Contact ID, Sent to, Made, Expires, Used. To switch a link
 *             off, clear its row or type anything in Used.
 *   Changes   one row per save: When, Contact ID, What changed (field names only, never the values;
 *             the People row is the record, this is the note that something changed).
 *   Settings  one row, Page address: where the link in the email points.
 *
 * Messages (POST, JSON body):
 *   request   { action: 'request', email }. Always answers { ok: true } whether or not the email is on
 *             the list, so nobody can use the page to find out who is a member. A known email gets one
 *             email with a link. Where two people share one address (a household), each gets their own
 *             email and link, greeting them by name, so both can reach their own row; one failing send
 *             does not stop the other. Quietly sends nothing after 3 requests for one address in 24
 *             hours, or 60 emails in 24 hours in total (both counted from the Links tab; a consumer
 *             Gmail account may send about 100 a day). A blank or odd-looking email answers
 *             { ok: false, error: 'email' }. Runs under the script lock, like save.
 *   save      { action: 'save', t, name, email, phone, shop, rota, news }. Checks the link first (it
 *             must exist, be under 24 hours old and unused), then the fields: name 1-80 characters,
 *             email a sensible shape and up to 120, phone up to 30 characters of digits, spaces, + ( ).
 *             A name or email starting with = is refused. Newlines and tabs are stripped. Marks the
 *             link Used first, then writes the member's columns of that one row and Last updated, then
 *             adds a Changes row. Runs under the script lock so two taps on Save cannot both go through.
 *             Answers { ok: true } or { ok: false, error: 'expired' | 'name' | 'email' | 'phone' }.
 *   anything else   { ok: false, error: 'unknown' }
 * Reads (GET):
 *   ?action=record&t=<token>   the member's own row: name, email, phone, plots, role, shop, rota, news.
 *                              A missing, unknown, expired or used token answers
 *                              { ok: false, error: 'expired' } - one word for all four, so a guessed
 *                              token learns nothing. No other read returns anything from the sheet.
 *   ?action=ping (or nothing)  { ok: true, service: 'AGA members' }
 * Anything that goes wrong inside answers { ok: false, error: 'server' } and the real message goes to
 * the execution log, never to the page.
 *
 * Set-up (once, in the association account's browser profile):
 * 1. script.google.com > New project > paste this file over the sample code > name it "AGA members".
 *    Deploy > New deployment > type: Web app. Execute as: Me. Who has access: Anyone. Deploy.
 *    Authorise when asked: on the "Google hasn't verified this app" screen choose Advanced > Go to
 *    AGA members (unsafe) > Allow. It asks for Sheets and email only. Copy the Web app URL (ends /exec).
 * 2. Choose "setup" in the function menu and Run (once). It makes the sheet and remembers its ID.
 *    Open the sheet from the link in the execution log and load data/people-tab-2026-11-07.csv into
 *    People: File > Import > Upload > Replace data at selected cell (A2) > Convert text to numbers,
 *    dates and formulas: No.
 * 3. Put the /exec URL into data/config.js on the planner site as memberUrl and republish the site.
 * 4. Try it from your own plot-holder address on your phone.
 * Later code changes: Deploy > Manage deployments > pencil > Version: New > Deploy. The URL stays the
 * same. Never New deployment (the URL changes and the page breaks). Running setup again changes nothing.
 * If the sheet is ever deleted: Project Settings > Script properties > delete "sheetId", then run setup.
 */

var SHEET_NAME = 'AGA members';
var SENDER_NAME = 'Acton Gardening Association';
var INBOX = 'actongardening@gmail.com';
var PAGE_DEFAULT = 'https://acton-plot-planner.netlify.app/update.html';
var LINK_HOURS = 24;          // how long a link works
var MAX_PER_EMAIL = 3;        // requests one address may make in 24 hours
var MAX_PER_DAY = 60;         // emails sent in 24 hours in total
var DAY_MS = 24 * 60 * 60 * 1000;
var LOCK_MS = 10000;          // how long to wait for another save or request to finish

var TABS = {
  People: ['Contact ID', 'Name', 'Email', 'Phone', 'Plots', 'Role', 'Shop updates', 'Volunteer rota', 'General news', 'Last updated'],
  Links: ['Token', 'Contact ID', 'Sent to', 'Made', 'Expires', 'Used'],
  Changes: ['When', 'Contact ID', 'What changed'],
  Settings: ['Setting', 'Value', 'What it does']
};
var SETTINGS = [
  ['Page address', PAGE_DEFAULT, 'Where the link in the email points.']
];
// Column positions, 0-based, in the order of the headings above
var P = { id: 0, name: 1, email: 2, phone: 3, plots: 4, role: 5, shop: 6, rota: 7, news: 8, updated: 9 };
var L = { token: 0, id: 1, to: 2, made: 3, expires: 4, used: 5 };

var book = null;   // the sheet, opened once per run

// The only place the time is read, so tests can stand in a different clock.
function now_() { return new Date(); }

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'record') return readRecord_(p.t);
    if (!p.action || p.action === 'ping') return json_({ ok: true, service: 'AGA members' });
    return json_({ ok: false, error: 'unknown' });
  } catch (err) {
    Logger.log('doGet failed: ' + String(err && err.message || err));
    return json_({ ok: false, error: 'server' });
  }
}

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.action === 'request') return requestLink_(d);
    if (d.action === 'save') return saveRecord_(d);
    return json_({ ok: false, error: 'unknown' });
  } catch (err) {
    Logger.log('doPost failed: ' + String(err && err.message || err));
    return json_({ ok: false, error: 'server' });
  }
}

// Runs fn while holding the script lock, so two requests or two saves cannot overlap.
function locked_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_MS);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---- request: email in, link out (one link and one email per person on that address)
function requestLink_(d) {
  var typed = clean_(d.email, 200).toLowerCase();
  if (!emailOk_(typed)) return json_({ ok: false, error: 'email' });
  return locked_(function () {
    var people = peopleByEmail_(typed);
    if (!people.length || !underLimits_(typed, people.length)) return json_({ ok: true });
    var made = now_(), expires = new Date(made.getTime() + LINK_HOURS * 60 * 60 * 1000);
    people.forEach(function (person) { sendOne_(person, made, expires); });
    return json_({ ok: true });
  });
}

// One person's Links row and email. A failure here is logged and does not stop the next person.
function sendOne_(person, made, expires) {
  try {
    var to = String(person.row[P.email]).trim(), token = token_();
    tab_('Links').appendRow([token, person.row[P.id], to, made.toISOString(), expires.toISOString(), '']);
    sendLink_(String(person.row[P.name]), to, token);
  } catch (err) {
    Logger.log('Mail to ' + person.row[P.id] + ' failed: ' + String(err && err.message || err));
  }
}

// Both limits are counted from the Links tab rather than a cache, because the script cache cannot hold
// a value for longer than six hours and the limits are for a day. A request for an address shared by
// "count" people writes "count" rows, so requests for that address are its rows divided by count.
function underLimits_(email, count) {
  var since = now_().getTime() - DAY_MS, mine = 0, all = 0;
  rows_('Links').forEach(function (r) {
    var made = new Date(r[L.made]).getTime();
    if (isNaN(made) || made < since) return;
    all++;
    if (String(r[L.to]).trim().toLowerCase() === email) mine++;
  });
  return mine < MAX_PER_EMAIL * count && all + count <= MAX_PER_DAY;
}

function token_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase(); }

// Plain text only: no HTML, no images, no other links (older members and scam filters).
function sendLink_(name, to, token) {
  var page = setting_('Page address') || PAGE_DEFAULT;
  var body = 'Hello ' + name + ',\n\n' +
    'You asked on our website for a link to check and update the details Acton Gardening Association holds for you. Here it is:\n\n' +
    page + '?t=' + token + '\n\n' +
    'The link works once and only for the next 24 hours. If it has run out, ask for a new one on the same page. If you did not ask for this, you can ignore this email - nothing has changed.\n\n' +
    'Acton Gardening Association\n' +
    INBOX + '\n';
  MailApp.sendEmail({ to: to, subject: 'Acton Gardening Association - your link to update your details', body: body, name: SENDER_NAME });
}

// ---- record: the member's own row, by link
function readRecord_(t) {
  var link = linkInfo_(t);
  var person = link ? personById_(link.id) : null;
  if (!person) return json_({ ok: false, error: 'expired' });
  var r = person.row;
  return json_({
    ok: true, name: String(r[P.name]), email: String(r[P.email]), phone: String(r[P.phone]),
    plots: String(r[P.plots]), role: String(r[P.role]),
    shop: yes_(r[P.shop]), rota: yes_(r[P.rota]), news: yes_(r[P.news])
  });
}

// A link is good when it exists, is unused and has not expired. Anything else is null.
// The whole token must be exactly 64 hex characters: it is not trimmed down to fit.
function linkInfo_(t) {
  var token = clean_(t, 200).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  var rows = rows_('Links');
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[L.token]).trim().toLowerCase() !== token) continue;
    if (String(r[L.used]).trim() !== '') return null;
    var expires = new Date(r[L.expires]).getTime();
    if (isNaN(expires) || expires <= now_().getTime()) return null;
    return { at: i + 2, id: String(r[L.id]).trim() };
  }
  return null;
}

// ---- save: the member's changes
function saveRecord_(d) {
  return locked_(function () {
    var link = linkInfo_(d.t);
    var person = link ? personById_(link.id) : null;
    if (!person) return json_({ ok: false, error: 'expired' });
    var name = clean_(d.name, 1000);
    if (name.length < 1 || name.length > 80 || name.charAt(0) === '=') return json_({ ok: false, error: 'name' });
    var email = clean_(d.email, 200);
    if (!emailOk_(email)) return json_({ ok: false, error: 'email' });
    var phone = clean_(d.phone, 100);
    if (!phoneOk_(phone)) return json_({ ok: false, error: 'phone' });
    var prefs = [yesNo_(d.shop), yesNo_(d.rota), yesNo_(d.news)];
    var when = now_().toISOString();
    var changed = whatChanged_(person.row, name, email, phone, prefs);
    // The link is spent first, so a second tap cannot get through even if a later write fails.
    tab_('Links').getRange(link.at, L.used + 1, 1, 1).setValue(when);
    var sh = tab_('People');
    sh.getRange(person.at, P.name + 1, 1, 3).setValues([[name, email, phone]]);
    sh.getRange(person.at, P.shop + 1, 1, 4).setValues([[prefs[0], prefs[1], prefs[2], when]]);
    tab_('Changes').appendRow([when, person.row[P.id], changed.length ? changed.join(', ') : 'Nothing']);
    return json_({ ok: true });
  });
}

// Field names only, in the order of the People headings.
function whatChanged_(row, name, email, phone, prefs) {
  var out = [];
  if (String(row[P.name]) !== name) out.push('Name');
  if (String(row[P.email]) !== email) out.push('Email');
  if (String(row[P.phone]) !== phone) out.push('Phone');
  if (yesNo_(yes_(row[P.shop])) !== prefs[0]) out.push('Shop updates');
  if (yesNo_(yes_(row[P.rota])) !== prefs[1]) out.push('Volunteer rota');
  if (yesNo_(yes_(row[P.news])) !== prefs[2]) out.push('General news');
  return out;
}

// ---- people
// Everyone on that address, in sheet order. Usually one; two where a household shares an email.
function peopleByEmail_(email) {
  var rows = rows_('People'), out = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][P.email]).trim().toLowerCase() === email) out.push({ at: i + 2, row: rows[i] });
  }
  return out;
}
function personById_(id) {
  if (!id) return null;
  var rows = rows_('People');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][P.id]).trim() === id) return { at: i + 2, row: rows[i] };
  }
  return null;
}

// ---- checks on what was typed. A leading = would be read as a formula by a spreadsheet, so it is refused.
function emailOk_(v) { return v.length > 0 && v.length <= 120 && v.charAt(0) !== '=' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function phoneOk_(v) { return v.length <= 30 && /^[0-9 +()]*$/.test(v); }
function yes_(v) { return v === true || /^(yes|true|1)$/i.test(String(v == null ? '' : v).trim()); }
function yesNo_(v) { return yes_(v) ? 'Yes' : 'No'; }

// ---- set-up (run once from the editor; running it again changes nothing)
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('sheetId')) {
    var made = SpreadsheetApp.create(SHEET_NAME);
    made.getSheets()[0].setName('People');
    props.setProperty('sheetId', made.getId());
  }
  var ss = book_();
  Object.keys(TABS).forEach(function (name) { tab_(name); });
  // Name, Email and Phone are text: a phone keeps its leading zero and nothing is read as a formula.
  tab_('People').getRange(2, P.name + 1, 2000, 3).setNumberFormat('@');
  var have = rows_('Settings').map(function (r) { return String(r[0]).trim(); });
  SETTINGS.forEach(function (s) { if (have.indexOf(s[0]) < 0) ss.getSheetByName('Settings').appendRow(s); });
  Logger.log('Sheet: ' + ss.getUrl());
}

function setting_(name) {
  var rows = rows_('Settings');
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).trim() === name) return String(rows[i][1]).trim();
  return '';
}

// ---- the sheet, found by the ID that setup stored (no Drive permission needed)
function book_() {
  if (book) return book;
  var id = PropertiesService.getScriptProperties().getProperty('sheetId');
  if (!id) throw new Error('No sheet yet: run setup first');
  book = SpreadsheetApp.openById(id);
  return book;
}
// Gets a tab, creating it with its headings; adds any headings added to TABS since it was made.
function tab_(name) {
  var ss = book_();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var want = TABS[name];
  if (sh.getLastRow() === 0) { sh.appendRow(want); sh.setFrozenRows(1); }
  else if (sh.getLastColumn() < want.length) sh.getRange(1, 1, 1, want.length).setValues([want]);
  return sh;
}
function rows_(name) {
  var sh = tab_(name);
  var n = sh.getLastRow();
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, TABS[name].length).getValues();
}
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
