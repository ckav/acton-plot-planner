/**
 * Plot planner receiver. Runs in the association's Google account and takes entries from the planner
 * site (check.html and the jobs panel on index.html). Nobody signs in to use the site; this script does
 * the saving as the account owner.
 *
 * It handles three kinds of message:
 *   check       a plot check: files the photo as Plot checks / <Site> / Plot <n> / <date> <who>.jpg and
 *               appends a row to the "Plot checks" sheet (tab "Entries")
 *   job         a new site job: photo to Plot checks / <Site> / Jobs / <id>.jpg, row to tab "Jobs"
 *   job-status  a status update on a job: row to tab "Job updates"
 * and one read: GET ?action=jobs&site=<Site> returns the site's jobs with their latest status, so every
 * phone sees the same list. Jobs carry no personal data beyond the name of who logged them.
 *
 * Set-up (once, in the association account's browser profile; needs the account to authorise, which
 * waits on the Galaxy code, task 1.2):
 * 1. script.google.com > New project. Paste this file over the sample code. Save. Name it "AGA plot check".
 * 2. Deploy > New deployment > type: Web app. Description "plot check". Execute as: Me.
 *    Who has access: Anyone. Deploy. Authorise when asked (Advanced > Go to AGA plot check > Allow).
 * 3. Copy the Web app URL (ends /exec) into data/config.js on the planner site as submitUrl, and
 *    redeploy the site. Open check.html on a phone and send a test with a photo.
 * 4. To change this code later: edit, then Deploy > Manage deployments > pencil > Version: New > Deploy.
 *    The URL stays the same.
 *
 * Everything lands in a Drive folder "Plot checks" at the top of My Drive, created on first use.
 */

var ROOT_NAME = 'Plot checks';
var SHEET_NAME = 'Plot checks';
var TABS = {
  Entries: ['Sent', 'Who', 'Site', 'Plot', 'How it looks', 'Shed', 'Shed condition', 'Polytunnel', 'Water harvesting', 'Water - what', 'Flags', 'Note', 'Photo', 'Received'],
  Jobs: ['Id', 'Code', 'Logged', 'By', 'Site', 'What', 'Detail', 'How soon', 'Near plot', 'X', 'Y', 'Photo', 'Received'],
  'Job updates': ['Id', 'At', 'By', 'Site', 'Status', 'Note', 'Received']
};

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents || '{}');
    var kind = clean_(d.kind, 20) || 'check';
    if (kind === 'job') return saveJob_(d);
    if (kind === 'job-status') return saveJobStatus_(d);
    return saveCheck_(d);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'jobs') return json_({ ok: true, jobs: listJobs_(clean_(p.site, 30)) });
    return json_({ ok: true, service: 'AGA plot planner receiver' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function saveCheck_(d) {
  var who = clean_(d.who, 60), site = clean_(d.site, 30), plot = clean_(d.plot, 12);
  var look = clean_(d.look, 60), note = clean_(d.note, 500);
  var flags = list_(d.flags), waterWhat = list_(d.waterWhat);
  var shed = clean_(d.shed, 5), shedCond = clean_(d.shedCondition, 40), poly = clean_(d.polytunnel, 5), water = clean_(d.water, 5);
  if (!who || !site || !plot || !look) return json_({ ok: false, error: 'missing who, site, plot or look' });
  var plotFolder = folder_(folder_(root_(), site), 'Plot ' + plot);
  var url = d.photo ? savePhoto_(plotFolder, d.photo, d.photoType, stamp_() + ' ' + who + '.jpg') : '';
  tab_('Entries').appendRow([d.sentAt || '', who, site, plot, look, shed, shedCond, poly, water, waterWhat, flags, note, url, new Date()]);
  return json_({ ok: true, photo: url });
}

function saveJob_(d) {
  var id = clean_(d.id, 30), site = clean_(d.site, 30), title = clean_(d.title, 120), by = clean_(d.by, 60);
  if (!id || !site || !title || !by) return json_({ ok: false, error: 'missing id, site, title or by' });
  var url = d.photo ? savePhoto_(folder_(folder_(root_(), site), 'Jobs'), d.photo, d.photoType, id + '.jpg') : '';
  tab_('Jobs').appendRow([id, clean_(d.code, 10), d.logged || new Date().toISOString(), by, site, title, clean_(d.detail, 500),
    clean_(d.soon, 60), clean_(d.near, 12), num_(d.x), num_(d.y), url, new Date()]);
  return json_({ ok: true, photo: url });
}

function saveJobStatus_(d) {
  var id = clean_(d.id, 30), status = clean_(d.status, 60), by = clean_(d.by, 60);
  if (!id || !status || !by) return json_({ ok: false, error: 'missing id, status or by' });
  tab_('Job updates').appendRow([id, d.at || new Date().toISOString(), by, clean_(d.site, 30), status, clean_(d.note, 500), new Date()]);
  return json_({ ok: true });
}

function listJobs_(site) {
  var jobs = {};
  rows_('Jobs').forEach(function (r) {
    if (site && r[4] !== site) return;
    jobs[r[0]] = { id: r[0], code: r[1], logged: iso_(r[2]), by: r[3], site: r[4], title: r[5], detail: r[6], soon: r[7], near: r[8],
      x: r[9] === '' ? null : Number(r[9]), y: r[10] === '' ? null : Number(r[10]), photo: r[11], status: 'Logged', updates: [] };
  });
  rows_('Job updates').forEach(function (r) {
    var j = jobs[r[0]]; if (!j) return;
    j.updates.push({ at: iso_(r[1]), by: r[2], status: r[4], note: r[5] });
  });
  return Object.keys(jobs).map(function (k) {
    var j = jobs[k];
    j.updates.sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    if (j.updates.length) j.status = j.updates[j.updates.length - 1].status;
    return j;
  });
}

// ---- helpers
function root_() { return folder_(DriveApp.getRootFolder(), ROOT_NAME); }
function folder_(parent, name) { var it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function stamp_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm'); }
function savePhoto_(folder, base64, type, name) {
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), type || 'image/jpeg', name);
  return folder.createFile(blob).getUrl();
}
function book_() {
  var root = root_();
  var files = root.getFilesByName(SHEET_NAME);
  if (files.hasNext()) return SpreadsheetApp.open(files.next());
  var ss = SpreadsheetApp.create(SHEET_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(root);
  ss.getSheets()[0].setName('Entries');
  return ss;
}
function tab_(name) {
  var ss = book_();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) { sh.appendRow(TABS[name]); sh.setFrozenRows(1); }
  return sh;
}
function rows_(name) {
  var sh = tab_(name);
  var n = sh.getLastRow();
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, TABS[name].length).getValues();
}
function iso_(v) { return v instanceof Date ? v.toISOString() : String(v || ''); }
function num_(v) { return (v === null || v === undefined || v === '') ? '' : Number(v); }
function list_(v) { return Array.isArray(v) ? v.map(function (f) { return clean_(f, 60); }).join(', ') : ''; }
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
