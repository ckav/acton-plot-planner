/**
 * Plot planner receiver. Runs in the association's Google account and takes entries from the planner
 * site (check.html and the jobs panel on index.html). Nobody signs in to use the site; this script does
 * the saving as the account owner.
 *
 * The "Plot checks" sheet has two layers:
 *   Entries   the history: one row per check, as sent. Never edited except by the committee removal column.
 *   Current   one row per plot, the latest state. Each check updates it: items sent overwrite, items not
 *             sent keep what was there, so a quick note does not wipe the shed or water answers.
 *             The map card reads this tab. The committee can correct it by typing into it.
 * Plus Jobs (one row per job, the latest position, no history), Rep links (who may see check details),
 * Settings (the members' password) and Removals (the removal log).
 *
 * Changes
 *   2 Nov 2026  Job board as a log (C9) and movable pins (B3). The Jobs tab gains Status, Who, Money,
 *               Blocked by, Expected by and Latest on the end, with dropdowns on Status and Money. The
 *               Job updates tab is retired: setup copies each job's last status and note into the new
 *               columns once, then renames the tab "Job updates (old)". job-status is gone; job-edit
 *               replaces it. Setup seeds J1-J3 (Bromyard) into the Jobs tab.
 *               To deploy: paste this file over the old one, Deploy > Manage deployments > pencil >
 *               Version: New > Deploy, then run setup from the function menu. Check the Jobs header ends
 *               with "Latest" and J1-J3 are Pending. Never New deployment (that changes the URL).
 *
 * Status pills (agreed 27 Oct 2026). Each of Plot, Shed, Greenhouse, Polytunnel, Water and Fruit trees has
 * a status - Fine, May need a hand, Unsafe (only when something could fall or hurt someone), Not there or
 * Not checked - with reasons (comma separated) and, for amber or red, an optional help request. A new or
 * changed help request becomes a site job (code H1, H2...) naming the plot, never the person; marking that
 * job Done or Not doing clears the "help asked" marker in Current.
 *
 * Messages (POST):
 *   check       a plot check: items { Shed: { status, why: [..], help: '' } ... } with only what changed,
 *               plus flags, note, photo. Photo to Plot checks / <Site> / Plot <n> / <date> <who>.jpg, row to
 *               Entries, Current updated. The older form's fields (look, shed, water...) are still accepted
 *               and translated, so entries queued on a phone before the change still go in.
 *   photo-hide  "Remove from display" on a plot photo (needs a rep key): the photo stays in Drive and in
 *               Entries, marked Replaced, and leaves the Current row
 *   job         a new site job: photo to Plot checks / <Site> / Jobs / <id>.jpg, row to tab "Jobs"
 *               (Status Pending, Money No)
 *   job-edit    changes to a saved job: { id, status, who, money, blockedBy, expectedBy, latest, soon,
 *               title, detail, photo, x, y }. Only the fields sent are written; the rest of the row is
 *               left alone. Status must be Pending, Arranged, Done or Not doing; Money must be No, Needs
 *               approval or Approved; an unknown id is refused. A photo is a data URL, filed under
 *               Plot checks / <Site> / Jobs / <id> <date>.jpg with the link in the Photo column. x and y
 *               on their own move the pin. "by" is accepted and ignored: there is no history.
 * Reads (GET):
 *   ?action=unlock&pw=<p>                      does this password (or rep key) open the planner?
 *   ?action=jobs&site=<Site>&pw=<p>            the site's jobs (all sites without &site). Each: id, code,
 *                                              logged, by, site, title, detail, soon, near, x, y, photo,
 *                                              status, who, money, blockedBy, expectedBy, latest. A blank
 *                                              Status reads as Pending, a blank Money as No
 *   ?action=plot&site=<Site>&plot=<n>&key=<k>  the Current row and photo for one plot. With the members'
 *                                              password instead of a key: the statuses only, and only when
 *                                              Settings says members see plot condition
 *
 * Who gets in. Every message and read needs one of:
 *   the members' password  one shared password, typed once on the gate and remembered by the phone. It sits
 *                          in the Settings tab: change it there and everyone is asked for the new one. Capitals
 *                          and spaces are ignored. While it is blank, only rep links get in.
 *   a rep key              from the "Rep links" tab. Type a name and a site (or All) on a new row; the key and
 *                          the link fill in. Set Active to No to switch a link off. Reps see notes and photos.
 * After 30 wrong passwords in 15 minutes the password is refused for 15 minutes, so it cannot be guessed by
 * trying thousands. Rep links still work during that time.
 *
 * Committee removal (GDPR request, a person in shot, anything inappropriate): in Entries or Jobs, pick a
 * reason in "Remove photo (committee)" on that row. The photo goes to the Drive bin, the row says Removed,
 * the Current row loses it, and the Removals tab logs when, who, which row and why - never the photo.
 * Then empty the Drive bin to delete it for good. Notes: clear the cell by hand. See README.
 *
 * Set-up (once, in the association account's browser profile):
 * 1. script.google.com > New project. Paste this file over the sample code. Save. Name it "AGA plot check".
 * 2. Deploy > New deployment > type: Web app. Description "plot check". Execute as: Me.
 *    Who has access: Anyone. Deploy. Authorise when asked (Advanced > Go to AGA plot check > Allow).
 * 3. Copy the Web app URL (ends /exec) into data/config.js on the planner site as submitUrl, and
 *    redeploy the site. Open check.html on a phone and send a test with a photo.
 * 4. Choose "setup" in the function menu and Run (once). It adds the new tabs and columns, the dropdowns
 *    and the edit trigger, seeds J1-J3, makes a link for Claire, and prints it in the execution log.
 *    Running it again changes nothing.
 * 5. To change this code later: edit, then Deploy > Manage deployments > pencil > Version: New > Deploy.
 *    The URL stays the same. Run setup again after any change that adds tabs or columns.
 *
 * Everything lands in a Drive folder "Plot checks" at the top of My Drive, created on first use.
 */

var ROOT_NAME = 'Plot checks';
var SHEET_NAME = 'Plot checks';
var PLANNER_URL = 'https://acton-plot-planner.netlify.app/';
var REMOVE_COL = 'Remove photo (committee)';
var REMOVE_REASONS = ['Person in the photo', 'Inappropriate', 'Plot holder asked', 'Wrong plot or duplicate'];
var ITEMS = ['Plot', 'Shed', 'Greenhouse', 'Polytunnel', 'Water', 'Fruit trees'];
var STATUSES = ['Fine', 'May need a hand', 'Unsafe', 'Not there', 'Not checked'];
// Jobs (2 Nov 2026): four statuses, a money flag, and the text fields job-edit may write with their lengths
var JOB_STATUSES = ['Pending', 'Arranged', 'Done', 'Not doing'];
var JOB_MONEY = ['No', 'Needs approval', 'Approved'];
var JOB_TEXT = { who: ['Who', 60], blockedBy: ['Blocked by', 200], expectedBy: ['Expected by', 40], latest: ['Latest', 500],
  title: ['What', 120], detail: ['Detail', 500], soon: ['How soon', 60] };
// The three Bromyard jobs from the 24 Oct sketch, put into the Jobs tab by setup if they are not there
var SEED_JOBS = [
  ['J1', 'Hedge along the Bromyard Avenue footpath - cut back', 'Plots bounded by the hedge keep their own stretch trimmed (rule 11g), so partly a plot matter for the Avenue side.', 'This season', 187, 567, 'No', ''],
  ['J2', 'Trees and hedge along the fenceline - cut back', 'Pin position to confirm on the walk.', 'This season', 633, 81, 'No', ''],
  ['J3', 'Large trees - felling', 'Ask the council first: likely their land, and big trees may be protected. Needs a contractor and money, so next year\'s budget. Pin position to confirm on the walk.', 'Just noting it', 1019, 796, 'Needs approval', 'Council to confirm whose trees they are']
];
var TABS = {
  Entries: ['Sent', 'Who', 'Site', 'Plot', 'How it looks', 'Shed', 'Shed condition', 'Greenhouse', 'Polytunnel', 'Water harvesting', 'Water - what', 'Flags', 'Note', 'Photo', 'Received', 'Photo status', REMOVE_COL]
    .concat(ITEMS.reduce(function (a, i) { return a.concat([i + ' status', i + ' - why']); }, []), ['Help requested']),
  Current: ['Site', 'Plot'].concat(ITEMS.reduce(function (a, i) { return a.concat([i + ' status', i + ' - why', i + ' - help']); }, []),
    ['Flags', 'Latest note', 'Photo', 'Last check', 'Checked by']),
  Jobs: ['Id', 'Code', 'Logged', 'By', 'Site', 'What', 'Detail', 'How soon', 'Near plot', 'X', 'Y', 'Photo', 'Received', 'Photo status', REMOVE_COL, 'Plot item',
    'Status', 'Who', 'Money', 'Blocked by', 'Expected by', 'Latest'],
  'Rep links': ['Name', 'Site', 'Key', 'Link', 'Active', 'Made'],
  Settings: ['Setting', 'Value', 'What it does'],
  Removals: ['When', 'By', 'Tab', 'Row', 'Site', 'Plot or job', 'Reason']
};
var SETTINGS = [
  ['Members password', '', 'The one password members type to open the planner. Change it here and everyone is asked for the new one. Capitals and spaces do not matter. Blank: only rep links get in.'],
  ['Members see plot condition', 'No', 'Yes: members see the status of each plot and its shed, greenhouse, polytunnel, water and fruit trees. Never reasons, help requests, notes, flags, photos or who checked.']
];
var MAX_FAILS = 30, FAIL_WINDOW = 900;   // wrong passwords allowed per 15 minutes
// Column positions, 0-based, looked up by heading
function col_(tab, name) { return TABS[tab].indexOf(name); }
var E = { who: 1, site: 2, plot: 3, flags: 11, note: 12, photo: 13, received: 14, photoStatus: 15 };

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents || '{}');
    var kind = clean_(d.kind, 20) || 'check';
    var who = access_(d);
    if (!who.ok) return json_({ ok: false, error: who.error });
    if (kind === 'job') return saveJob_(d);
    if (kind === 'job-edit') return editJob_(d);
    if (kind === 'photo-hide') return hidePhoto_(d);
    return saveCheck_(d);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (!p.action) return json_({ ok: true, service: 'AGA plot planner receiver' });
    var who = access_(p);
    if (p.action === 'unlock') return json_({ ok: who.ok, unlocked: who.ok, error: who.error || '' });
    if (!who.ok) return json_({ ok: false, error: who.error });
    if (p.action === 'jobs') return json_({ ok: true, jobs: listJobs_(clean_(p.site, 30)) });
    if (p.action === 'plot') return plotRead_(p, who);
    return json_({ ok: true, service: 'AGA plot planner receiver' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---- plot checks
function saveCheck_(d) {
  var rep = keyInfo_(d.key);
  var who = clean_(d.who, 60) || (rep ? rep.name : '') || 'Not given';
  var site = clean_(d.site, 30), plot = clean_(d.plot, 12);
  if (!site || !plot) return json_({ ok: false, error: 'missing site or plot' });
  var note = clean_(d.note, 500), flags = list_(d.flags);
  if (!flags && d.flagsAnswered) flags = 'None';
  var items = d.items ? cleanItems_(d.items) : legacyItems_(d);
  var plotFolder = folder_(folder_(root_(), site), 'Plot ' + plot);
  var url = d.photo ? savePhoto_(plotFolder, d.photo, d.photoType, stamp_() + ' ' + who + '.jpg') : '';

  var helpText = Object.keys(items).filter(function (i) { return items[i].help; }).map(function (i) { return i + ': ' + items[i].help; }).join('; ');
  var row = [d.sentAt || '', who, site, plot, clean_(d.look, 60), clean_(d.shed, 5), clean_(d.shedCondition, 40), clean_(d.greenhouse, 5),
    clean_(d.polytunnel, 5), clean_(d.water, 5), list_(d.waterWhat), flags, note, url, new Date(), '', ''];
  ITEMS.forEach(function (i) { row.push(items[i] ? items[i].status : '', items[i] ? items[i].why : ''); });
  row.push(helpText);
  tab_('Entries').appendRow(row);

  // Current: items sent overwrite, the rest keep what was there. A new or changed help request makes a job.
  var cur = currentRow_(site, plot, true), v = cur.values, jobs = [];
  Object.keys(items).forEach(function (i) {
    var it = items[i], before = String(v[col_('Current', i + ' - help')] || '');
    v[col_('Current', i + ' status')] = it.status;
    v[col_('Current', i + ' - why')] = it.why;
    var keep = it.status === 'May need a hand' || it.status === 'Unsafe';
    var help = keep ? it.help : '';
    if (help && help !== before) jobs.push(helpJob_(site, plot, i, it, help, who));
    v[col_('Current', i + ' - help')] = help;
  });
  if (flags) v[col_('Current', 'Flags')] = flags;
  if (note) v[col_('Current', 'Latest note')] = note;
  if (url) v[col_('Current', 'Photo')] = url;
  v[col_('Current', 'Last check')] = new Date(); v[col_('Current', 'Checked by')] = who;
  cur.sheet.getRange(cur.row, 1, 1, v.length).setValues([v]);
  return json_({ ok: true, photo: url, jobs: jobs });
}

function cleanItems_(raw) {
  var out = {};
  ITEMS.forEach(function (i) {
    var it = raw[i]; if (!it) return;
    var status = clean_(it.status, 30);
    if (STATUSES.indexOf(status) < 0) return;
    var why = Array.isArray(it.why) ? it.why.map(function (w) { return clean_(w, 80); }).filter(String).join(', ') : clean_(it.why, 300);
    out[i] = { status: status, why: why, help: clean_(it.help, 200) };
  });
  return out;
}

// The form before 27 Oct sent look / shed / water answers. Translates them to the pills.
function legacyItems_(d) {
  var out = {}, look = clean_(d.look, 60), shed = clean_(d.shed, 5), cond = clean_(d.shedCondition, 40);
  var green = clean_(d.greenhouse, 5), poly = clean_(d.polytunnel, 5), water = clean_(d.water, 5);
  var what = Array.isArray(d.waterWhat) ? d.waterWhat.join(', ') : String(d.waterWhat || '');
  var item = function (status, why) { return { status: status, why: why || '', help: '' }; };
  if (/^Good/.test(look)) out.Plot = item('Fine');
  else if (/^Needs work/.test(look)) out.Plot = item('May need a hand', 'Partly cultivated or untidy');
  else if (/^Neglected/.test(look)) out.Plot = item('May need a hand', 'Not being worked');
  else if (/^Vacant/.test(look)) out.Plot = item('May need a hand', 'Vacant - nobody on it');
  if (shed === 'No') out.Shed = item('Not there');
  else if (shed === 'Yes') {
    if (/^Good/.test(cond)) out.Shed = item('Fine');
    else if (/roof/i.test(cond)) out.Shed = item('May need a hand', 'Roof not watertight');
    else if (/^Unsafe/.test(cond)) out.Shed = item('Unsafe', 'Leaning or falling down');
    else out.Shed = item('Not checked');
  }
  if (green) out.Greenhouse = item(green === 'Yes' ? 'Not checked' : 'Not there');
  if (poly) out.Polytunnel = item(poly === 'Yes' ? 'Not checked' : 'Not there');
  if (water === 'No') out.Water = item('May need a hand', 'No water harvesting');
  else if (water === 'Yes') {
    if (/butt connected/.test(what)) out.Water = item('Fine');
    else if (/not connected/.test(what)) out.Water = item('May need a hand', 'Butt not connected');
    else if (/Gutters/.test(what)) out.Water = item('May need a hand', 'Gutters but no butt');
    else out.Water = item('Fine');
  }
  return out;
}

function helpJob_(site, plot, itemName, it, help, who) {
  var sh = tab_('Jobs'), n = rows_('Jobs').filter(function (r) { return /^H\d+$/.test(r[1]); }).length + 1;
  var id = 'H-' + Date.now().toString(36) + n, code = 'H' + n;
  var title = 'Plot ' + plot + ' - ' + itemName.toLowerCase() + (it.why ? ': ' + it.why.toLowerCase() : '') + ' - help requested';
  sh.appendRow([id, code, new Date().toISOString(), who, site, title.slice(0, 120), help, 'Next work morning', plot, '', '', '', new Date(), '', '', itemName,
    'Pending', '', 'No', '', '', '']);
  return { id: id, code: code, title: title };
}

function plotRead_(p, who) {
  var site = clean_(p.site, 30), plot = clean_(p.plot, 12);
  var rep = who.rep;
  if (!rep && setting_('Members see plot condition').toLowerCase() !== 'yes') return json_({ ok: true, plot: null, hidden: true });
  if (rep && rep.site !== 'All' && rep.site !== site) return json_({ ok: false, error: 'site' });
  var cur = currentRow_(site, plot, false);
  if (!cur) return json_({ ok: true, plot: null });
  var v = cur.values, items = {};
  ITEMS.forEach(function (i) {
    var status = String(v[col_('Current', i + ' status')] || '');
    items[i] = rep ? { status: status, why: String(v[col_('Current', i + ' - why')] || ''), help: String(v[col_('Current', i + ' - help')] || '') } : { status: status };
  });
  if (!rep) return json_({ ok: true, limited: true, plot: { items: items, lastAt: iso_(v[col_('Current', 'Last check')]) } });
  var flags = String(v[col_('Current', 'Flags')] || '');
  var out = { items: items, flags: flags === 'None' ? '' : flags, note: v[col_('Current', 'Latest note')],
    lastAt: iso_(v[col_('Current', 'Last check')]), lastBy: v[col_('Current', 'Checked by')], photo: null };
  var url = String(v[col_('Current', 'Photo')] || '');
  if (/^https?:/.test(url)) {
    try { out.photo = { url: url, data: Utilities.base64Encode(DriveApp.getFileById(fileId_(url)).getBlob().getBytes()) }; } catch (err) { out.photo = null; }
  }
  return json_({ ok: true, plot: out });
}

function hidePhoto_(d) {
  var rep = keyInfo_(d.key);
  if (!rep) return json_({ ok: false, error: 'key' });
  var site = clean_(d.site, 30), plot = clean_(d.plot, 12), url = clean_(d.photo, 300);
  var who = clean_(d.who, 60) || rep.name;
  if (rep.site !== 'All' && rep.site !== site) return json_({ ok: false, error: 'site' });
  var sh = tab_('Entries'), rows = rows_('Entries');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][E.photo] === url) sh.getRange(i + 2, E.photoStatus + 1).setValue('Replaced ' + day_() + ' by ' + who);
  }
  var cur = currentRow_(site, plot, false), pc = col_('Current', 'Photo');
  if (cur && cur.values[pc] === url) cur.sheet.getRange(cur.row, pc + 1).setValue(previousPhoto_(site, plot, url));
  return json_({ ok: true });
}

// The newest photo for the plot that is still on display, other than the one leaving.
function previousPhoto_(site, plot, leaving) {
  var rows = rows_('Entries');
  for (var i = rows.length - 1; i >= 0; i--) {
    var r = rows[i];
    if (String(r[E.site]) === site && samePlot_(r[E.plot], plot) && /^https?:/.test(r[E.photo]) && r[E.photo] !== leaving && !r[E.photoStatus]) return r[E.photo];
  }
  return '';
}

function currentRow_(site, plot, create) {
  var sh = tab_('Current'), rows = rows_('Current');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === site && samePlot_(rows[i][1], plot)) return { sheet: sh, row: i + 2, values: rows[i] };
  }
  if (!create) return null;
  var v = TABS.Current.map(function () { return ''; });
  v[0] = site; v[1] = plot;
  sh.appendRow(v);
  return { sheet: sh, row: sh.getLastRow(), values: v };
}

// ---- jobs
function saveJob_(d) {
  var id = clean_(d.id, 30), site = clean_(d.site, 30), title = clean_(d.title, 120), by = clean_(d.by, 60);
  if (!id || !site || !title || !by) return json_({ ok: false, error: 'missing id, site, title or by' });
  var url = d.photo ? savePhoto_(folder_(folder_(root_(), site), 'Jobs'), d.photo, d.photoType, id + '.jpg') : '';
  tab_('Jobs').appendRow([id, clean_(d.code, 10), d.logged || new Date().toISOString(), by, site, title, clean_(d.detail, 500),
    clean_(d.soon, 60), clean_(d.near, 12), num_(d.x), num_(d.y), url, new Date(), '', '', '', 'Pending', '', 'No', '', '', '']);
  return json_({ ok: true, photo: url });
}

// job-edit: writes only the fields sent, each straight into its cell, so a committee member typing in the
// sheet at the same time loses nothing else on the row. "by" is accepted and ignored: the row is the record.
function editJob_(d) {
  var id = clean_(d.id, 30);
  if (!id) return json_({ ok: false, error: 'missing id' });
  var sh = tab_('Jobs'), rows = rows_('Jobs'), at = -1;
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]) === id) { at = i; break; }
  if (at < 0) return json_({ ok: false, error: 'unknown id' });
  var row = rows[at], set = {}, sent = function (k) { return d[k] !== undefined; };
  if (sent('status')) {
    var status = clean_(d.status, 20);
    if (JOB_STATUSES.indexOf(status) < 0) return json_({ ok: false, error: 'status must be one of ' + JOB_STATUSES.join(', ') });
    set.Status = status;
  }
  if (sent('money')) {
    var money = clean_(d.money, 20);
    if (JOB_MONEY.indexOf(money) < 0) return json_({ ok: false, error: 'money must be one of ' + JOB_MONEY.join(', ') });
    set.Money = money;
  }
  Object.keys(JOB_TEXT).forEach(function (k) { if (sent(k)) set[JOB_TEXT[k][0]] = clean_(d[k], JOB_TEXT[k][1]); });
  if (set.What === '') return json_({ ok: false, error: 'title cannot be blank' });
  if (sent('x') || sent('y')) {
    if (!isFinite(Number(d.x)) || !isFinite(Number(d.y)) || d.x === '' || d.y === '' || d.x === null || d.y === null) return json_({ ok: false, error: 'x and y must both be numbers' });
    set.X = Number(d.x); set.Y = Number(d.y);
  }
  var url = '';
  if (d.photo) {
    url = savePhoto_(folder_(folder_(root_(), String(row[4])), 'Jobs'), d.photo, d.photoType, id + ' ' + stamp_() + '.jpg');
    set.Photo = url; set['Photo status'] = '';
  }
  if (!Object.keys(set).length) return json_({ ok: false, error: 'nothing to change' });
  Object.keys(set).forEach(function (name) {
    var c = col_('Jobs', name);
    sh.getRange(at + 2, c + 1).setValue(set[name]);
    row[c] = set[name];
  });
  if (set.Status === 'Done' || set.Status === 'Not doing') clearHelp_(id);
  return json_({ ok: true, photo: url, job: jobObj_(row) });
}

// A help job closed: take the "help asked" marker off the plot's item.
function clearHelp_(id) {
  var job = rows_('Jobs').filter(function (r) { return r[0] === id; })[0];
  var itemName = job ? String(job[col_('Jobs', 'Plot item')] || '') : '';
  if (!itemName || ITEMS.indexOf(itemName) < 0) return;
  var cur = currentRow_(String(job[4]), String(job[8]), false);
  if (cur) cur.sheet.getRange(cur.row, col_('Current', itemName + ' - help') + 1).setValue('');
}

// All jobs, or one site's. The row is the whole record: no history, no updates list.
function listJobs_(site) {
  return rows_('Jobs').filter(function (r) { return r[0] !== '' && (!site || String(r[4]) === site); }).map(jobObj_);
}

function jobObj_(r) {
  var c = function (name) { return r[col_('Jobs', name)]; }, s = function (name) { return String(c(name) == null ? '' : c(name)); };
  return { id: s('Id'), code: s('Code'), logged: iso_(c('Logged')), by: s('By'), site: s('Site'), title: s('What'), detail: s('Detail'),
    soon: s('How soon'), near: s('Near plot'), x: s('X') === '' ? null : Number(c('X')), y: s('Y') === '' ? null : Number(c('Y')),
    photo: /^https?:/.test(s('Photo')) ? s('Photo') : '', status: s('Status') || 'Pending', who: s('Who'), money: s('Money') || 'No',
    blockedBy: s('Blocked by'), expectedBy: s('Expected by'), latest: s('Latest') };
}

// ---- who gets in: a rep key, or the members' password
function access_(p) {
  var rep = keyInfo_(p.key);
  if (rep) return { ok: true, rep: rep };
  if (p.key && !p.pw) return { ok: false, error: 'key' };
  var want = norm_(setting_('Members password'));
  if (!want) return { ok: false, error: 'password' };
  var cache = CacheService.getScriptCache(), fails = Number(cache.get('pw-fails') || 0);
  if (fails >= MAX_FAILS) return { ok: false, error: 'busy' };
  if (norm_(p.pw) === want) return { ok: true, member: true };
  if (p.pw) cache.put('pw-fails', String(fails + 1), FAIL_WINDOW);
  return { ok: false, error: 'password' };
}
function norm_(v) { return clean_(v, 80).toLowerCase().replace(/\s+/g, ''); }
function setting_(name) {
  var rows = rows_('Settings');
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).trim() === name) return String(rows[i][1]).trim();
  return '';
}

// ---- rep keys
function keyInfo_(key) {
  key = clean_(key, 40);
  if (!key) return null;
  var rows = rows_('Rep links');
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r[2] === key && String(r[4]).toLowerCase() !== 'no') return { name: r[0], site: String(r[1]).trim() || 'None' };
  }
  return null;
}

// ---- set-up and the sheet's edit trigger (run setup once from the editor)
function setup() {
  var ss = book_();
  // Current before the pills (27 Oct) had "How it looks" in column C: keep it aside and rebuild.
  var old = ss.getSheetByName('Current');
  if (old && old.getLastColumn() >= 3 && old.getRange(1, 3).getValue() === 'How it looks') old.setName('Current (before pills) ' + day_());
  Object.keys(TABS).forEach(function (name) { tab_(name); });
  ['Entries', 'Jobs'].forEach(function (name) {
    var sh = ss.getSheetByName(name), col = TABS[name].indexOf(REMOVE_COL) + 1;
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(REMOVE_REASONS, true).setAllowInvalid(false).build();
    sh.getRange(2, col, 2000, 1).setDataValidation(rule);
  });
  var cur = ss.getSheetByName('Current');
  cur.getRange('B:B').setNumberFormat('@');
  var statusRule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(true).build();
  ITEMS.forEach(function (i) { cur.getRange(2, col_('Current', i + ' status') + 1, 2000, 1).setDataValidation(statusRule); });
  var jobs = ss.getSheetByName('Jobs');
  [['Status', JOB_STATUSES], ['Money', JOB_MONEY]].forEach(function (p) {
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(p[1], true).setAllowInvalid(false).build();
    jobs.getRange(2, col_('Jobs', p[0]) + 1, Math.max(1, jobs.getMaxRows() - 1), 1).setDataValidation(rule);
  });
  retireJobUpdates_(ss);
  seedJobs_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'handleEdit') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('handleEdit').forSpreadsheet(ss).onEdit().create();
  rebuildCurrent_();
  var have = rows_('Settings').map(function (r) { return String(r[0]).trim(); });
  SETTINGS.forEach(function (s) { if (have.indexOf(s[0]) < 0) ss.getSheetByName('Settings').appendRow(s); });
  if (!setting_('Members password')) Logger.log('No members password yet: type one in the Settings tab, next to "Members password".');
  var links = ss.getSheetByName('Rep links');
  if (links.getLastRow() < 2) { links.appendRow(['Claire Kavanagh', 'All']); fillKey_(links, 2); }
  Logger.log('Sheet: ' + ss.getUrl());
  rows_('Rep links').forEach(function (r) { Logger.log(r[0] + ' (' + r[1] + '): ' + r[3]); });
}

// One-off (2 Nov 2026): the Job updates tab held a status history. Each job's last row becomes its Status
// (Logged, Needs approval and Approved become Pending; Done and Not doing stay) and its note becomes Latest,
// only where the new cells are still blank. Then the tab is renamed "Job updates (old)" and never touched
// again, so running setup twice does nothing the second time.
function retireJobUpdates_(ss) {
  var old = ss.getSheetByName('Job updates');
  if (!old) return;
  var n = old.getLastRow(), last = {};
  var rows = n < 2 ? [] : old.getRange(2, 1, n - 1, 7).getValues();
  rows.forEach(function (r) {
    var id = String(r[0] || ''), at = iso_(r[1]);
    if (!id) return;
    if (!last[id] || at > last[id].at) last[id] = { at: at, status: String(r[4] || '').trim(), note: String(r[5] || '').trim() };
  });
  var sh = tab_('Jobs'), sc = col_('Jobs', 'Status'), lc = col_('Jobs', 'Latest');
  rows_('Jobs').forEach(function (r, i) {
    var u = last[String(r[0])]; if (!u) return;
    var status = (u.status === 'Done' || u.status === 'Not doing') ? u.status : 'Pending';
    if (String(r[sc] || '') === '') sh.getRange(i + 2, sc + 1).setValue(status);
    if (String(r[lc] || '') === '' && u.note) sh.getRange(i + 2, lc + 1).setValue(u.note.slice(0, 500));
  });
  var name = 'Job updates (old)';
  if (ss.getSheetByName(name)) name += ' ' + day_();
  old.setName(name);
}

// The three Bromyard jobs from the sketch, once. A job already in the tab (by Id) is left alone.
function seedJobs_() {
  var sh = tab_('Jobs'), have = {};
  rows_('Jobs').forEach(function (r) { have[String(r[0])] = true; });
  SEED_JOBS.forEach(function (s) {
    if (have[s[0]]) return;
    sh.appendRow([s[0], s[0], '2026-10-24T14:30:00Z', 'Claire Kavanagh', 'Bromyard', s[1], s[2], s[3], '', s[4], s[5], '', new Date(), '', '', '',
      'Pending', '', s[6], s[7], '', '']);
  });
}

// Builds Current from Entries for any plot that has no Current row yet (first run, after the pill change,
// or after a test clear-out). Older entries are translated from the look / shed / water answers.
function rebuildCurrent_() {
  var have = {};
  rows_('Current').forEach(function (r) { have[r[0] + '|' + String(r[1]).toUpperCase()] = true; });
  var state = {};
  rows_('Entries').forEach(function (r) {
    var k = r[E.site] + '|' + String(r[E.plot]).toUpperCase();
    if (have[k]) return;
    var v = state[k] || (state[k] = TABS.Current.map(function () { return ''; }));
    v[0] = r[E.site]; v[1] = String(r[E.plot]);
    var items = {};
    ITEMS.forEach(function (i) {
      var s = r[col_('Entries', i + ' status')];
      if (s) items[i] = { status: s, why: r[col_('Entries', i + ' - why')] || '' };
    });
    if (!Object.keys(items).length) {
      items = legacyItems_({ look: r[4], shed: r[5], shedCondition: r[6], greenhouse: r[7], polytunnel: r[8], water: r[9], waterWhat: String(r[10] || '').split(', ') });
    }
    Object.keys(items).forEach(function (i) { v[col_('Current', i + ' status')] = items[i].status; v[col_('Current', i + ' - why')] = items[i].why; });
    if (r[E.flags]) v[col_('Current', 'Flags')] = r[E.flags];
    if (r[E.note]) v[col_('Current', 'Latest note')] = r[E.note];
    if (/^https?:/.test(r[E.photo]) && !r[E.photoStatus]) v[col_('Current', 'Photo')] = r[E.photo];
    v[col_('Current', 'Last check')] = r[E.received]; v[col_('Current', 'Checked by')] = r[E.who];
  });
  var sh = tab_('Current');
  Object.keys(state).forEach(function (k) { sh.appendRow(state[k]); });
}

function handleEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet(), name = sh.getName();
  var first = e.range.getRow(), last = e.range.getLastRow();
  if (name === 'Rep links') { for (var r = Math.max(2, first); r <= last; r++) fillKey_(sh, r); return; }
  if ((name === 'Entries' || name === 'Jobs') && e.range.getColumn() === TABS[name].indexOf(REMOVE_COL) + 1 && first >= 2 && first === last && e.value) {
    removePhoto_(sh, name, first, e.value, (e.user && e.user.getEmail && e.user.getEmail()) || '');
  }
}

function fillKey_(sh, row) {
  var v = sh.getRange(row, 1, 1, 6).getValues()[0];
  if (!String(v[0]).trim() || !String(v[1]).trim() || v[2]) return;
  var key = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  sh.getRange(row, 3, 1, 4).setValues([[key, PLANNER_URL + '?key=' + key, 'Yes', new Date()]]);
}

function removePhoto_(sh, name, row, reason, by) {
  var head = TABS[name];
  var photoCol = head.indexOf('Photo') + 1, statusCol = head.indexOf('Photo status') + 1;
  var url = String(sh.getRange(row, photoCol).getValue() || '');
  var siteCol = name === 'Entries' ? 3 : 5, refCol = name === 'Entries' ? 4 : 1;
  var site = sh.getRange(row, siteCol).getValue(), ref = sh.getRange(row, refCol).getValue();
  if (/^https?:/.test(url)) {
    try { DriveApp.getFileById(fileId_(url)).setTrashed(true); } catch (err) {}
    if (name === 'Entries') {
      var cur = currentRow_(String(site), String(ref), false), pc = col_('Current', 'Photo');
      if (cur && cur.values[pc] === url) cur.sheet.getRange(cur.row, pc + 1).setValue(previousPhoto_(String(site), String(ref), url));
    }
  }
  sh.getRange(row, photoCol).setValue('Removed');
  sh.getRange(row, statusCol).setValue('Removed ' + day_() + ' - ' + reason);
  tab_('Removals').appendRow([new Date(), by, name, row, site, ref, reason]);
}

// ---- helpers
function root_() { return folder_(DriveApp.getRootFolder(), ROOT_NAME); }
function folder_(parent, name) { var it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function stamp_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm'); }
function day_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMM yyyy'); }
function fileId_(url) { var m = String(url).match(/[-\w]{25,}/); return m ? m[0] : ''; }
function samePlot_(a, b) { return String(a).trim().toUpperCase() === String(b).trim().toUpperCase(); }
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
function iso_(v) { return v instanceof Date ? v.toISOString() : String(v || ''); }
function num_(v) { return (v === null || v === undefined || v === '') ? '' : Number(v); }
function list_(v) { return Array.isArray(v) ? v.map(function (f) { return clean_(f, 60); }).join(', ') : ''; }
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
