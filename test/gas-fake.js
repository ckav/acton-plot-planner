/* In-memory stand-in for the Google Apps Script globals that Members.gs uses.
   Nothing here talks to Google. Each call to makeFake() returns a fresh, empty world:
   no spreadsheets, no emails sent, an empty cache, and a clock you can move.

   How the tests use it (see harness.js):
     var fake = makeFake();
     vm.createContext(fake.globals)       <- the script sees SpreadsheetApp, MailApp etc.
     fake.emails                           <- every MailApp.sendEmail call, in order
     fake.rows('AGA members', 'People')    <- a tab's rows, header included, as plain arrays
     fake.cache                            <- what CacheService holds right now
     fake.setTime(ms) / fake.advance(ms)   <- the fake clock (cache expiry uses it)
     fake.locks                            <- waitLock / releaseLock calls, in order

   Only the surface the build spec promised is here, plus a few harmless no-ops (number
   formats, column widths) so cosmetic calls do not blow up a test. Anything else the
   script asks for is a ReferenceError or TypeError, which is a finding, not a fake bug. */
'use strict';

var crypto = require('crypto');

function makeFake(options) {
  options = options || {};
  var state = {
    clock: options.startTime || Date.UTC(2026, 10, 7, 10, 0, 0),   // 7 Nov 2026 10:00 UTC
    books: [],       // every spreadsheet made by SpreadsheetApp.create
    files: [],       // Drive files: one per spreadsheet, plus anything createFile makes
    folders: [],     // Drive folders made under the root
    emails: [],      // { to, subject, body, name, replyTo, raw }
    cache: {},       // key -> { value, expiresAt }
    locks: [],       // 'wait', 'release', 'try'
    log: [],         // Logger.log lines
    props: {},       // PropertiesService script properties
    formats: {},     // sheet name -> { 'row,col': format } from setNumberFormat
    uuids: 0,
    // failure switches a test can flip to see how the script copes
    failOpen: false,      // SpreadsheetApp.openById / open throw
    failMailTo: null,     // MailApp.sendEmail throws for this address
    failAppendTab: null   // appendRow throws on the tab with this name
  };

  function now() { return state.clock; }

  // ---- Spreadsheet: a book holds sheets; a sheet is a 2-D array of cells. 1-based rows and cols.
  function makeSheet(book, name) {
    var cells = [];   // cells[r][c], 0-based inside; '' when unset
    var frozen = 0;
    function ensure(r, c) {
      while (cells.length < r) cells.push([]);
      for (var i = 0; i < cells.length; i++) while (cells[i].length < c) cells[i].push('');
    }
    function lastRow() {
      for (var r = cells.length - 1; r >= 0; r--) if (cells[r].some(function (v) { return v !== '' && v !== null && v !== undefined; })) return r + 1;
      return 0;
    }
    function lastCol() {
      var n = 0;
      cells.forEach(function (row) { for (var c = row.length - 1; c >= 0; c--) if (row[c] !== '' && row[c] !== null && row[c] !== undefined) { n = Math.max(n, c + 1); break; } });
      return n;
    }
    function checkInt(v, what) { if (typeof v !== 'number' || v < 1 || v !== Math.floor(v)) throw new TypeError('getRange: ' + what + ' must be a whole number from 1, got ' + JSON.stringify(v)); }
    var sheet = {
      getName: function () { return name; },
      setName: function (n) { name = String(n); return sheet; },
      getLastRow: lastRow,
      getLastColumn: lastCol,
      getMaxRows: function () { return Math.max(cells.length, 1000); },
      getMaxColumns: function () { return Math.max(lastCol(), 26); },
      getFrozenRows: function () { return frozen; },
      setFrozenRows: function (n) { frozen = n; return sheet; },
      appendRow: function (arr) {
        if (!Array.isArray(arr)) throw new TypeError('appendRow wants an array');
        if (state.failAppendTab === name) throw new Error('Fake: the sheet is unreachable (appendRow on ' + name + ')');
        var r = lastRow() + 1;
        ensure(r, arr.length);
        for (var c = 0; c < arr.length; c++) cells[r - 1][c] = arr[c] === undefined ? '' : arr[c];
        return sheet;
      },
      getRange: function (row, col, numRows, numCols) {
        if (typeof row === 'string') throw new TypeError('getRange: this fake takes (row, col, numRows, numCols) numbers, not A1 notation "' + row + '"');
        checkInt(row, 'row'); checkInt(col, 'column');
        numRows = numRows === undefined ? 1 : numRows;
        numCols = numCols === undefined ? 1 : numCols;
        checkInt(numRows, 'numRows'); checkInt(numCols, 'numCols');
        var range = {
          getRow: function () { return row; },
          getColumn: function () { return col; },
          getNumRows: function () { return numRows; },
          getNumColumns: function () { return numCols; },
          getValues: function () {
            var out = [];
            for (var r = 0; r < numRows; r++) {
              var line = [];
              for (var c = 0; c < numCols; c++) {
                var rr = cells[row - 1 + r], v = rr ? rr[col - 1 + c] : undefined;
                line.push(v === undefined ? '' : v);
              }
              out.push(line);
            }
            return out;
          },
          setValues: function (grid) {
            if (!Array.isArray(grid) || grid.length !== numRows || grid.some(function (l) { return !Array.isArray(l) || l.length !== numCols; }))
              throw new Error('setValues: the grid must be ' + numRows + ' x ' + numCols);
            ensure(row - 1 + numRows, col - 1 + numCols);
            for (var r = 0; r < numRows; r++) for (var c = 0; c < numCols; c++) cells[row - 1 + r][col - 1 + c] = grid[r][c] === undefined ? '' : grid[r][c];
            return range;
          },
          getValue: function () { return range.getValues()[0][0]; },
          setValue: function (v) {
            ensure(row, col);
            cells[row - 1][col - 1] = v === undefined ? '' : v;
            return range;
          },
          // number formats are recorded (setup should make Name, Email, Phone plain text); the rest are ignored
          setNumberFormat: function (fmt) {
            var f = state.formats[name] = state.formats[name] || {};
            for (var r = 0; r < numRows; r++) for (var c = 0; c < numCols; c++) f[(row + r) + ',' + (col + c)] = String(fmt);
            return range;
          },
          setFontWeight: function () { return range; },
          setWrap: function () { return range; },
          setDataValidation: function () { return range; }
        };
        return range;
      },
      // cosmetic calls: accepted, ignored
      setColumnWidth: function () { return sheet; },
      setColumnWidths: function () { return sheet; },
      hideColumns: function () { return sheet; },
      autoResizeColumns: function () { return sheet; },
      // inspection
      _cells: function () { return cells.map(function (r) { return r.slice(); }); }
    };
    return sheet;
  }

  function makeBook(name) {
    var id = 'book-' + (state.books.length + 1) + '-' + crypto.randomBytes(6).toString('hex');
    var sheets = [];
    var book = {
      getId: function () { return id; },
      getName: function () { return name; },
      getUrl: function () { return 'https://docs.google.com/spreadsheets/d/' + id + '/edit'; },
      getSheets: function () { return sheets.slice(); },
      getSheetByName: function (n) {
        for (var i = 0; i < sheets.length; i++) if (sheets[i].getName() === n) return sheets[i];
        return null;
      },
      insertSheet: function (n) { var s = makeSheet(book, n); sheets.push(s); return s; },
      getNumSheets: function () { return sheets.length; }
    };
    sheets.push(makeSheet(book, 'Sheet1'));
    return book;
  }

  function makeFile(name, book) {
    var file = {
      _book: book,
      _trashed: false,
      _parent: 'root',
      getId: function () { return book ? book.getId() : 'file-' + crypto.randomBytes(6).toString('hex'); },
      getName: function () { return name; },
      getUrl: function () { return book ? book.getUrl() : 'https://drive.google.com/file/d/' + file.getId(); },
      moveTo: function (folder) { file._parent = folder && folder.getName ? folder.getName() : 'root'; return file; },
      setTrashed: function (t) { file._trashed = !!t; return file; },
      isTrashed: function () { return file._trashed; }
    };
    return file;
  }

  function iterator(list) {
    var i = 0;
    return { hasNext: function () { return i < list.length; }, next: function () { if (i >= list.length) throw new Error('Iterator has no more items'); return list[i++]; } };
  }

  function makeFolder(name) {
    var folder = {
      getName: function () { return name; },
      getId: function () { return 'folder-' + name; },
      getFilesByName: function (n) { return iterator(state.files.filter(function (f) { return f.getName() === n && !f._trashed && f._parent === name; })); },
      getFoldersByName: function (n) { return iterator(state.folders.filter(function (f) { return f.getName() === n && f._parent === name; })); },
      createFolder: function (n) { var f = makeFolder(n); f._parent = name; state.folders.push(f); return f; },
      getFiles: function () { return iterator(state.files.filter(function (f) { return !f._trashed && f._parent === name; })); }
    };
    return folder;
  }
  var rootFolder = makeFolder('root');

  var SpreadsheetApp = {
    create: function (name) {
      var book = makeBook(String(name));
      state.books.push(book);
      state.files.push(makeFile(String(name), book));
      return book;
    },
    open: function (file) {
      if (state.failOpen) throw new Error('Fake: Google Sheets is unreachable');
      if (!file || !file._book) throw new TypeError('SpreadsheetApp.open wants a Drive file from getFilesByName');
      return file._book;
    },
    openById: function (id) {
      if (state.failOpen) throw new Error('Fake: Google Sheets is unreachable');
      for (var i = 0; i < state.books.length; i++) if (state.books[i].getId() === id) return state.books[i];
      throw new Error('No spreadsheet with id ' + id);
    }
  };

  var propsObj = {
    getProperty: function (k) { return Object.prototype.hasOwnProperty.call(state.props, k) ? state.props[k] : null; },
    setProperty: function (k, v) { state.props[k] = String(v); return propsObj; },
    deleteProperty: function (k) { delete state.props[k]; return propsObj; },
    getProperties: function () { return Object.assign({}, state.props); },
    getKeys: function () { return Object.keys(state.props); }
  };
  var PropertiesService = { getScriptProperties: function () { return propsObj; }, getUserProperties: function () { return propsObj; }, getDocumentProperties: function () { return propsObj; } };

  var DriveApp = {
    getRootFolder: function () { return rootFolder; },
    getFileById: function (id) {
      for (var i = 0; i < state.files.length; i++) if (state.files[i].getId() === id) return state.files[i];
      throw new Error('No file with id ' + id);
    }
  };

  var MailApp = {
    sendEmail: function (a, b, c, d) {
      var m;
      if (a && typeof a === 'object') m = { to: a.to, subject: a.subject, body: a.body, name: a.name, replyTo: a.replyTo, htmlBody: a.htmlBody, raw: a };
      else m = { to: a, subject: b, body: c, name: d && d.name, replyTo: d && d.replyTo, htmlBody: d && d.htmlBody, raw: { to: a, subject: b, body: c, options: d } };
      if (!m.to) throw new Error('MailApp.sendEmail: no recipient');
      state.mailCalls = (state.mailCalls || 0) + 1;
      if (state.failMailNth && state.mailCalls === state.failMailNth) throw new Error('Fake: mail to ' + m.to + ' failed (send number ' + state.mailCalls + ')');
      if (state.failMailTo && String(m.to) === String(state.failMailTo)) throw new Error('Fake: mail to ' + m.to + ' failed');
      state.emails.push(m);
    },
    getRemainingDailyQuota: function () { return 100 - state.emails.length; }
  };

  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  var Utilities = {
    getUuid: function () {
      state.uuids++;
      var b = crypto.randomBytes(16);
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      var h = b.toString('hex');
      return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
    },
    // Enough of formatDate for stamps: yyyy MM dd HH mm ss, MMM and d. Time zone is ignored (UTC).
    formatDate: function (date, tz, pattern) {
      var d = new Date(date instanceof Date ? date.getTime() : date);
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return String(pattern)
        .replace(/yyyy/g, d.getUTCFullYear())
        .replace(/MMM/g, months[d.getUTCMonth()])
        .replace(/MM/g, pad(d.getUTCMonth() + 1, 2))
        .replace(/dd/g, pad(d.getUTCDate(), 2))
        .replace(/\bd\b/g, d.getUTCDate())
        .replace(/HH/g, pad(d.getUTCHours(), 2))
        .replace(/mm/g, pad(d.getUTCMinutes(), 2))
        .replace(/ss/g, pad(d.getUTCSeconds(), 2));
    },
    base64Encode: function (s) { return Buffer.from(s).toString('base64'); },
    base64Decode: function (s) { return Array.from(Buffer.from(s, 'base64')); },
    sleep: function () {}
  };

  var cacheObj = {
    get: function (key) {
      var e = state.cache[key];
      if (!e) return null;
      if (e.expiresAt <= now()) { delete state.cache[key]; return null; }
      return e.value;
    },
    put: function (key, value, seconds) {
      seconds = seconds === undefined ? 600 : Math.min(Number(seconds), 21600);
      state.cache[key] = { value: String(value), expiresAt: now() + seconds * 1000 };
    },
    remove: function (key) { delete state.cache[key]; }
  };
  var CacheService = { getScriptCache: function () { return cacheObj; }, getUserCache: function () { return cacheObj; } };

  var lockHeld = false;
  var lockObj = {
    waitLock: function (ms) { state.locks.push('wait'); if (lockHeld) throw new Error('Lock timeout: another process was holding the lock for too long'); lockHeld = true; },
    tryLock: function (ms) { state.locks.push('try'); if (lockHeld) return false; lockHeld = true; return true; },
    releaseLock: function () { state.locks.push('release'); lockHeld = false; },
    hasLock: function () { return lockHeld; }
  };
  var LockService = { getScriptLock: function () { return lockObj; }, getDocumentLock: function () { return lockObj; }, getUserLock: function () { return lockObj; } };

  var ContentService = {
    MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
    createTextOutput: function (s) {
      var out = { _mime: null, setMimeType: function (m) { out._mime = m; return out; }, getContent: function () { return s; }, getMimeType: function () { return out._mime; } };
      return out;
    }
  };

  var Logger = { log: function () { state.log.push(Array.prototype.map.call(arguments, String).join(' ')); } };
  var Session = { getScriptTimeZone: function () { return 'Europe/London'; }, getActiveUser: function () { return { getEmail: function () { return 'actongardening@gmail.com'; } }; } };

  var globals = {
    SpreadsheetApp: SpreadsheetApp, DriveApp: DriveApp, MailApp: MailApp, Utilities: Utilities,
    CacheService: CacheService, LockService: LockService, ContentService: ContentService,
    PropertiesService: PropertiesService, Logger: Logger, Session: Session,
    console: { log: Logger.log, error: Logger.log, warn: Logger.log }
  };

  // ---- inspection hooks
  function findBook(name) {
    for (var i = 0; i < state.books.length; i++) if (state.books[i].getName() === name) return state.books[i];
    return null;
  }
  function rows(bookName, tabName) {
    var book = findBook(bookName);
    if (!book) throw new Error('No spreadsheet called "' + bookName + '" has been created');
    var sh = book.getSheetByName(tabName);
    if (!sh) throw new Error('No tab called "' + tabName + '" in "' + bookName + '"');
    var n = sh.getLastRow(), c = sh.getLastColumn();
    return n === 0 ? [] : sh.getRange(1, 1, n, Math.max(c, 1)).getValues();
  }

  return {
    globals: globals,
    state: state,
    get emails() { return state.emails; },
    get cache() { var out = {}; Object.keys(state.cache).forEach(function (k) { if (state.cache[k].expiresAt > now()) out[k] = state.cache[k].value; }); return out; },
    get locks() { return state.locks; },
    get log() { return state.log; },
    get books() { return state.books; },
    get props() { return state.props; },
    formats: function (sheetName) { return state.formats[sheetName] || {}; },
    // failure switches
    failOpen: function (on) { state.failOpen = on !== false; },
    failMailTo: function (addr) { state.failMailTo = addr || null; },                 // exact address
    failMailNth: function (n) { state.mailCalls = 0; state.failMailNth = n || 0; },   // the nth sendEmail call from now throws
    failAppend: function (tabName) { state.failAppendTab = tabName || null; },
    now: now,
    setTime: function (ms) { state.clock = ms instanceof Date ? ms.getTime() : Number(ms); },
    advance: function (ms) { state.clock += Number(ms); },
    book: findBook,
    rows: rows,
    lockHeld: function () { return lockHeld; }
  };
}

module.exports = makeFake;
