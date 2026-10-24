/**
 * Plot check receiver. Runs in the association's Google account and takes entries from the
 * plot check form on the planner site (check.html). For each entry it files the photo in Drive as
 * Plot checks / <Site> / <Plot> / <date> <who>.jpg and appends a row to the "Plot checks" sheet.
 * Nobody signs in to use the form; this script does the saving as the account owner.
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
var HEADERS = ['Sent', 'Who', 'Site', 'Plot', 'How it looks', 'Shed', 'Shed condition', 'Polytunnel', 'Water harvesting', 'Water - what', 'Flags', 'Note', 'Photo', 'Received'];

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents || '{}');
    var who = clean_(d.who, 60), site = clean_(d.site, 30), plot = clean_(d.plot, 12);
    var look = clean_(d.look, 60), note = clean_(d.note, 500);
    var flags = list_(d.flags), waterWhat = list_(d.waterWhat);
    var shed = clean_(d.shed, 5), shedCond = clean_(d.shedCondition, 40), poly = clean_(d.polytunnel, 5), water = clean_(d.water, 5);
    if (!who || !site || !plot || !look) return json_({ ok: false, error: 'missing who, site, plot or look' });

    var root = folder_(DriveApp.getRootFolder(), ROOT_NAME);
    var siteFolder = folder_(root, site);
    var plotFolder = folder_(siteFolder, 'Plot ' + plot);

    var url = '';
    if (d.photo) {
      var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
      var name = stamp + ' ' + who + '.jpg';
      var blob = Utilities.newBlob(Utilities.base64Decode(d.photo), d.photoType || 'image/jpeg', name);
      url = plotFolder.createFile(blob).getUrl();
    }

    var sheet = sheet_(root);
    sheet.appendRow([d.sentAt || '', who, site, plot, look, shed, shedCond, poly, water, waterWhat, flags, note, url, new Date()]);
    return json_({ ok: true, photo: url });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'AGA plot check receiver' });
}

function folder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function sheet_(root) {
  var files = root.getFilesByName(SHEET_NAME);
  var ss;
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(SHEET_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(root);
    ss.getSheets()[0].setName('Entries').appendRow(HEADERS);
    ss.getSheets()[0].setFrozenRows(1);
  }
  return ss.getSheets()[0];
}

function list_(v) {
  return Array.isArray(v) ? v.map(function (f) { return clean_(f, 60); }).join(', ') : '';
}

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
