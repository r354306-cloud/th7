/* Th7 Board backend. Paste this whole file into Extensions > Apps Script. Built 2026-10-26. */
/* Th7 core rules. Shared by the website (instant updates, demo mode) and the
   Google Apps Script backend (the real source of truth), so both sides agree
   on exactly how every change is applied. Keep this file dependency free. */
var Th7Core = (function () {
  'use strict';

  var DAYS = 7, H_START = 6, H_END = 23;           // grid covers 6am to 11pm
  var PER_DAY = H_END - H_START;                   // 17 one-hour slots per day
  var SLOTS = DAYS * PER_DAY;                      // 119 slots per week

  var NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 .'_-]{0,23}$/;
  var ID_RE = /^[a-z0-9]{6,24}$/;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  var COLOR_RE = /^#[0-9a-fA-F]{6}$/;
  var TAG_RE = /^[a-z0-9]{2,16}$/;

  var SESSION_KINDS = ['workout', 'study'];
  var EVENT_KINDS = ['event', 'spot'];
  var EVENT_TAGS = ['party', 'out', 'game', 'food', 'chill', 'other'];

  /* ---------- small helpers ---------- */
  function str(v, max) {
    v = v == null ? '' : String(v);
    v = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    v = v.replace(/^[=+@]+/, '').trim();           // a cell can never become a formula
    if (max && v.length > max) v = v.slice(0, max).trim();
    return v;
  }
  function sameName(a, b) { return String(a == null ? '' : a).toLowerCase() === String(b == null ? '' : b).toLowerCase(); }
  function findMember(db, name) {
    for (var i = 0; i < db.members.length; i++) if (sameName(db.members[i].name, name)) return db.members[i];
    return null;
  }
  function has(arr, name) { for (var i = 0; i < arr.length; i++) if (sameName(arr[i], name)) return true; return false; }
  function addTo(arr, name) { if (!has(arr, name)) arr.push(name); return arr; }
  function removeFrom(arr, name) { return arr.filter(function (x) { return !sameName(x, name); }); }
  function asList(v) {
    if (Array.isArray(v)) return v.map(function (x) { return str(x, 40); }).filter(Boolean);
    if (v == null || v === '') return [];
    return String(v).split(',').map(function (x) { return str(x, 40); }).filter(Boolean);
  }
  function tags(v, max) {
    var out = [];
    asList(v).forEach(function (t) { t = t.toLowerCase(); if (TAG_RE.test(t) && out.indexOf(t) < 0) out.push(t); });
    return out.slice(0, max || 30);
  }
  function int(v, lo, hi, dflt) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  }
  function addDays(ymd, n) {
    var p = ymd.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function validDate(ymd) {
    if (!DATE_RE.test(ymd || '')) return false;
    var p = ymd.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return d.getUTCMonth() === +p[1] - 1 && d.getUTCDate() === +p[2];
  }
  function ok(changed, extra) { var r = { ok: true, changed: changed || [] }; if (extra) for (var k in extra) r[k] = extra[k]; return r; }
  function fail(msg, code) { return { ok: false, error: msg, code: code || 'invalid' }; }
  function emptyDb() { return { members: [], checkins: [], sessions: [], events: [] }; }

  function renameEverywhere(db, from, to) {
    function swap(arr) { return arr.map(function (x) { return sameName(x, from) ? to : x; }); }
    db.checkins.forEach(function (c) { if (sameName(c.name, from)) c.name = to; });
    db.sessions.forEach(function (s) {
      if (sameName(s.by, from)) s.by = to;
      s.invited = swap(s.invited); s.going = swap(s.going); s.done = swap(s.done); s.declined = swap(s.declined);
    });
    db.events.forEach(function (e) {
      if (sameName(e.by, from)) e.by = to;
      e.going = swap(e.going); e.maybe = swap(e.maybe);
    });
    // a rename can collapse duplicates (e.g. ricky -> Ricky); keep check-ins unique
    var seen = {};
    db.checkins = db.checkins.filter(function (c) {
      var k = c.name.toLowerCase() + '|' + c.date;
      if (seen[k]) return false; seen[k] = 1; return true;
    });
  }

  /* ---------- the actions ---------- */
  var actions = {
    saveMember: function (db, p, ctx) {
      var m = p.member || {};
      var name = str(m.name, 24);
      if (!NAME_RE.test(name)) return fail('Names can be 1 to 24 letters, numbers, spaces, dots or dashes.');
      var busy = String(m.busy || '');
      if (busy.length !== SLOTS || /[^01]/.test(busy)) return fail('Schedule data looked wrong, try again.');
      var rec = {
        name: name,
        color: COLOR_RE.test(m.color || '') ? String(m.color).toLowerCase() : '#ff3b5c',
        busy: busy,
        places: tags(m.places, 30),
        splits: tags(m.splits, 20),
        goal: int(m.goal, 1, 7, 4),
        motto: str(m.motto, 60)
      };
      var clash = findMember(db, name);
      if (p.create) {
        if (clash) return fail(clash.name + ' is already on the board. If that is you, pick your name from the list.', 'name_taken');
        rec.joined = ctx.now; rec.updated = ctx.now;
        db.members.push(rec);
        return ok(['members']);
      }
      var old = p.oldName ? findMember(db, p.oldName) : null;
      if (old) {
        if (clash && clash !== old) return fail(clash.name + ' is already on the board. Pick a different name.', 'name_taken');
        var was = old.name;
        for (var k in rec) old[k] = rec[k];
        old.updated = ctx.now;
        if (was !== name) { renameEverywhere(db, was, name); return ok(['members', 'checkins', 'sessions', 'events'], { renamed: [was, name] }); }
        return ok(['members']);
      }
      if (!p.oldName) return fail('Missing profile name.');
      // the profile we were editing is gone (removed on another device). Never overwrite someone else.
      if (clash) return fail(clash.name + ' is already on the board. Pick a different name.', 'name_taken');
      rec.joined = ctx.now; rec.updated = ctx.now;
      db.members.push(rec);
      return ok(['members']);
    },

    removeMember: function (db, p) {
      var m = findMember(db, p.name);
      if (!m) return ok([]);
      db.members = db.members.filter(function (x) { return x !== m; });
      return ok(['members'], { removed: m });
    },

    checkin: function (db, p, ctx) {
      var m = findMember(db, p.name);
      if (!m) return fail('Pick your name first.', 'no_member');
      if (!validDate(p.date)) return fail('Bad date.');
      if (p.date > ctx.today) return fail('You can only check in for today or earlier.');
      if (p.date < addDays(ctx.today, -14)) return fail('That day is too far back to check in.');
      var exists = db.checkins.some(function (c) { return sameName(c.name, m.name) && c.date === p.date; });
      if (p.on) {
        if (exists) return ok([]);
        db.checkins.push({ name: m.name, date: p.date, at: ctx.now });
      } else {
        if (!exists) return ok([]);
        db.checkins = db.checkins.filter(function (c) { return !(sameName(c.name, m.name) && c.date === p.date); });
      }
      return ok(['checkins']);
    },

    propose: function (db, p, ctx) {
      var s = p.session || {};
      if (!ID_RE.test(s.id || '')) return fail('Bad id.');
      for (var i = 0; i < db.sessions.length; i++) if (db.sessions[i].id === s.id) return ok([]); // already saved (retry)
      var by = findMember(db, s.by);
      if (!by) return fail('Pick your name first.', 'no_member');
      if (SESSION_KINDS.indexOf(s.kind) < 0) return fail('Pick workout or study.');
      if (!validDate(s.date)) return fail('Pick a day.');
      if (s.date < addDays(ctx.today, -1) || s.date > addDays(ctx.today, 60)) return fail('Pick a day in the next couple of months.');
      var hour = int(s.hour, 0, 23, -1);
      if (hour < 5) return fail('Pick a start time between 5am and 11pm.');
      var place = str(s.place, 40);
      if (!place) return fail('Pick a spot.');
      var invited = [];
      asList(s.invited).forEach(function (n) { var m = findMember(db, n); if (m && !sameName(m.name, by.name)) addTo(invited, m.name); });
      db.sessions.push({
        id: s.id, kind: s.kind, date: s.date, hour: hour, dur: int(s.dur, 1, 4, 1),
        place: place, split: tags([s.split], 1)[0] || '', note: str(s.note, 140),
        by: by.name, invited: invited, going: [by.name], done: [], declined: [],
        status: 'active', created: ctx.now, updated: ctx.now
      });
      return ok(['sessions']);
    },

    sessionOp: function (db, p, ctx) {
      var s = null;
      for (var i = 0; i < db.sessions.length; i++) if (db.sessions[i].id === p.id) s = db.sessions[i];
      if (!s) return fail('That plan was not found. It may have been canceled.', 'not_found');
      var m = findMember(db, p.name);
      if (!m) return fail('Pick your name first.', 'no_member');
      var n = m.name, op = p.op;
      if (s.status === 'canceled' && op !== 'restore') return fail('That plan was canceled.', 'canceled');
      if (op === 'join') { addTo(s.going, n); s.declined = removeFrom(s.declined, n); }
      else if (op === 'leave') { s.going = removeFrom(s.going, n); s.done = removeFrom(s.done, n); }
      else if (op === 'decline') { addTo(s.declined, n); s.going = removeFrom(s.going, n); s.done = removeFrom(s.done, n); }
      else if (op === 'done') {
        if (s.date > ctx.today) return fail('You can mark it done once it happens.');
        addTo(s.going, n); addTo(s.done, n); s.declined = removeFrom(s.declined, n);
      }
      else if (op === 'undone') { s.done = removeFrom(s.done, n); }
      else if (op === 'cancel') { if (!sameName(s.by, n)) return fail('Only ' + s.by + ' can cancel this one.'); s.status = 'canceled'; }
      else if (op === 'restore') { if (!sameName(s.by, n)) return fail('Only ' + s.by + ' can bring this back.'); s.status = 'active'; }
      else return fail('Unknown action.');
      s.updated = ctx.now;
      return ok(['sessions']);
    },

    addEvent: function (db, p, ctx) {
      var e = p.event || {};
      if (!ID_RE.test(e.id || '')) return fail('Bad id.');
      for (var i = 0; i < db.events.length; i++) if (db.events[i].id === e.id) return ok([]);
      var by = findMember(db, e.by);
      if (!by) return fail('Pick your name first.', 'no_member');
      var kind = EVENT_KINDS.indexOf(e.kind) >= 0 ? e.kind : 'event';
      if (!validDate(e.date)) return fail('Pick a day.');
      if (e.date < addDays(ctx.today, -1) || e.date > addDays(ctx.today, 180)) return fail('Pick a day in the next few months.');
      var time = TIME_RE.test(e.time || '') ? e.time : '';
      var title = str(e.title, 60);
      if (!title) return fail(kind === 'spot' ? 'Name the spot.' : 'Give it a name.');
      db.events.push({
        id: e.id, kind: kind, tag: EVENT_TAGS.indexOf(e.tag) >= 0 ? e.tag : (kind === 'spot' ? 'out' : 'other'),
        date: e.date, time: time, title: title, place: str(e.place, 60), notes: str(e.notes, 300),
        by: by.name, going: [by.name], maybe: [], status: 'active', created: ctx.now, updated: ctx.now
      });
      return ok(['events']);
    },

    eventOp: function (db, p, ctx) {
      var e = null;
      for (var i = 0; i < db.events.length; i++) if (db.events[i].id === p.id) e = db.events[i];
      if (!e) return fail('That event was not found.', 'not_found');
      var m = findMember(db, p.name);
      if (!m) return fail('Pick your name first.', 'no_member');
      var n = m.name, op = p.op;
      if (e.status === 'canceled' && op !== 'restore') return fail('That one was canceled.', 'canceled');
      if (op === 'going') { addTo(e.going, n); e.maybe = removeFrom(e.maybe, n); }
      else if (op === 'maybe') { addTo(e.maybe, n); e.going = removeFrom(e.going, n); }
      else if (op === 'out') { e.going = removeFrom(e.going, n); e.maybe = removeFrom(e.maybe, n); }
      else if (op === 'cancel') { if (!sameName(e.by, n)) return fail('Only ' + e.by + ' can cancel this.'); e.status = 'canceled'; }
      else if (op === 'restore') { if (!sameName(e.by, n)) return fail('Only ' + e.by + ' can bring this back.'); e.status = 'active'; }
      else return fail('Unknown action.');
      e.updated = ctx.now;
      return ok(['events']);
    }
  };

  function apply(db, action, payload, ctx) {
    var fn = actions[action];
    if (!fn) return fail('Unknown action.');
    try { return fn(db, payload || {}, ctx); }
    catch (err) { return fail('Something broke: ' + (err && err.message ? err.message : err), 'error'); }
  }

  return {
    DAYS: DAYS, H_START: H_START, H_END: H_END, PER_DAY: PER_DAY, SLOTS: SLOTS,
    NAME_RE: NAME_RE, EVENT_TAGS: EVENT_TAGS,
    apply: apply, emptyDb: emptyDb, sameName: sameName, findMember: findMember,
    has: has, asList: asList, addDays: addDays, validDate: validDate, str: str, pad: pad
  };
})();

/* ===================== Th7 Board: Google Sheet backend =====================
   This script lives inside the "Th7 Board" Google Sheet and runs as a web app.
   - Everything the site saves lands in the tabs of this sheet.
   - The group passcode is in the Settings tab (change it there any time, no redeploy needed).
   - Every change is written to the Log tab too, so nothing is ever silently lost.
   - The Free Grid tab is a readable "who is free when" view, rebuilt on every schedule save.
   ========================================================================= */

var SHEET_ID = '';                 // leave blank when this script is attached to the sheet
var TZ = 'America/New_York';
var DEFAULT_PASSCODE = 'th7grind';

var TABS = {
  Members:  ['name', 'color', 'busy', 'places', 'splits', 'goal', 'motto', 'joined', 'updated'],
  Checkins: ['name', 'date', 'at'],
  Sessions: ['id', 'kind', 'date', 'hour', 'dur', 'place', 'split', 'note', 'by', 'invited', 'going', 'done', 'declined', 'status', 'created', 'updated'],
  Events:   ['id', 'kind', 'tag', 'date', 'time', 'title', 'place', 'notes', 'by', 'going', 'maybe', 'status', 'created', 'updated'],
  Removed:  ['removedAt', 'name', 'data'],
  Log:      ['at', 'who', 'action', 'detail'],
  Settings: ['key', 'value', 'about']
};
var DATA_TABS = { members: 'Members', checkins: 'Checkins', sessions: 'Sessions', events: 'Events' };
var LIST_FIELDS = { places: 1, splits: 1, invited: 1, going: 1, done: 1, declined: 1, maybe: 1 };
var NUM_FIELDS = { goal: 1, hour: 1, dur: 1 };

/* ---------- web app entry points ---------- */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'ping') return json_({ ok: true, th7: true, v: 1 });
  return ContentService.createTextOutput('Th7 board backend is running. Open the Th7 site to use it.');
}

function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, code: 'invalid', error: 'Bad request.' }); }

  var book = book_();
  ensureTabs_(book);
  if (!codeOk_(book, body.code)) return json_({ ok: false, code: 'bad_code', error: 'Wrong passcode.' });
  if (body.action === 'state') return json_(stateFor_(readDb_(book)));

  var lock = LockService.getScriptLock();
  try { lock.waitLock(28000); }
  catch (err) { return json_({ ok: false, code: 'busy', error: 'The board is busy, retrying.' }); }

  try {
    var cache = CacheService.getScriptCache();
    var opKey = body.opId ? 'op:' + String(body.opId).slice(0, 40) : null;
    var db = readDb_(book);

    if (opKey && cache.get(opKey)) {                      // a retry of something we already saved
      var dup = stateFor_(db); dup.duplicate = true; return json_(dup);
    }

    var before = {};
    Object.keys(DATA_TABS).forEach(function (k) { before[k] = JSON.stringify(db[k]); });

    var now = new Date();
    var ctx = { now: now.toISOString(), today: Utilities.formatDate(now, TZ, 'yyyy-MM-dd') };
    var res = Th7Core.apply(db, body.action, body.payload || {}, ctx);

    if (!res.ok) {
      var st = stateFor_(readDb_(book));
      st.ok = false; st.error = res.error; st.code = res.code;
      return json_(st);
    }

    var changed = [];
    Object.keys(DATA_TABS).forEach(function (k) {
      if (JSON.stringify(db[k]) !== before[k]) { writeTable_(book, DATA_TABS[k], db[k]); changed.push(k); }
    });
    if (res.removed) appendRow_(book, 'Removed', { removedAt: ctx.now, name: res.removed.name, data: JSON.stringify(res.removed) });
    if (changed.length) {
      appendRow_(book, 'Log', { at: ctx.now, who: whoFrom_(body), action: body.action, detail: JSON.stringify(body.payload || {}).slice(0, 1500) });
    }
    if (changed.indexOf('members') >= 0) buildFreeGrid_(book, db.members);
    SpreadsheetApp.flush();
    if (opKey) cache.put(opKey, '1', 21600);
    return json_(stateFor_(db));
  } finally {
    lock.releaseLock();
  }
}

/* ---------- sheet helpers ---------- */
function book_() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }

function ensureTabs_(book) {
  Object.keys(TABS).forEach(function (name) {
    var sh = book.getSheetByName(name);
    if (sh) return;
    sh = book.insertSheet(name);
    var head = TABS[name];
    sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (name === 'Settings') {
      sh.getRange(2, 1, 1, 3).setValues([['passcode', DEFAULT_PASSCODE, 'Group passcode for the Th7 site. Change it here any time.']]);
    }
  });
  var blank = book.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(blank);
}

function codeOk_(book, code) {
  var sh = book.getSheetByName('Settings');
  var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues() : [];
  var pass = DEFAULT_PASSCODE;
  rows.forEach(function (r) { if (String(r[0]).trim().toLowerCase() === 'passcode') pass = String(r[1]); });
  pass = pass.trim().toLowerCase();
  if (!pass) return true;
  return String(code == null ? '' : code).trim().toLowerCase() === pass;
}

function cell_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return v == null ? '' : String(v);
}

function fromRow_(head, row) {
  var o = {};
  head.forEach(function (h, i) {
    var v = cell_(row[i]);
    if (h === 'busy') { v = v.replace(/^v1\./, ''); if (!/^[01]+$/.test(v) || v.length !== Th7Core.SLOTS) v = new Array(Th7Core.SLOTS + 1).join('0'); }
    else if (LIST_FIELDS[h]) v = Th7Core.asList(v);
    else if (NUM_FIELDS[h]) v = parseInt(v, 10) || 0;
    o[h] = v;
  });
  return o;
}

function toRow_(head, o) {
  return head.map(function (h) {
    var v = o[h];
    if (h === 'busy') return 'v1.' + v;
    if (LIST_FIELDS[h]) return (v || []).join(', ');
    if (v == null) return '';
    v = String(v);
    return /^[=+@]/.test(v) ? v.replace(/^[=+@]+/, '') : v;
  });
}

function readTable_(book, name) {
  var sh = book.getSheetByName(name), head = TABS[name];
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, head.length).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) { return fromRow_(head, r); });
}

function writeTable_(book, name, rows) {
  var sh = book.getSheetByName(name), head = TABS[name];
  var prevLast = sh.getLastRow();
  if (rows.length) {
    if (sh.getMaxRows() < rows.length + 1) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
    var rng = sh.getRange(2, 1, rows.length, head.length);
    rng.setNumberFormat('@');
    rng.setValues(rows.map(function (o) { return toRow_(head, o); }));
  }
  // only clear leftovers AFTER the new rows are safely written
  if (prevLast > rows.length + 1) sh.getRange(rows.length + 2, 1, prevLast - rows.length - 1, head.length).clearContent();
}

function appendRow_(book, name, o) {
  var sh = book.getSheetByName(name), head = TABS[name];
  var r = sh.getLastRow() + 1;
  if (sh.getMaxRows() < r) sh.insertRowsAfter(sh.getMaxRows(), 50);
  sh.getRange(r, 1, 1, head.length).setNumberFormat('@').setValues([toRow_(head, o)]);
}

function readDb_(book) {
  var db = Th7Core.emptyDb();
  Object.keys(DATA_TABS).forEach(function (k) { db[k] = readTable_(book, DATA_TABS[k]); });
  return db;
}

function stateFor_(db) {
  return { ok: true, v: 1, now: new Date().toISOString(), members: db.members, checkins: db.checkins, sessions: db.sessions, events: db.events };
}

function whoFrom_(body) {
  var p = body.payload || {};
  return String(p.name || (p.member && p.member.name) || (p.session && p.session.by) || (p.event && p.event.by) || '').slice(0, 30);
}

function buildFreeGrid_(book, members) {
  var sh = book.getSheetByName('Free Grid') || book.insertSheet('Free Grid');
  var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var rows = [['Who is free', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']];
  for (var h = Th7Core.H_START; h < Th7Core.H_END; h++) {
    var row = [label_(h) + ' - ' + label_(h + 1)];
    for (var d = 0; d < 7; d++) {
      var idx = d * Th7Core.PER_DAY + (h - Th7Core.H_START);
      row.push(members.filter(function (m) { return m.busy.charAt(idx) === '0'; }).map(function (m) { return m.name; }).join(', '));
    }
    rows.push(row);
  }
  sh.clear();
  sh.getRange(1, 1, rows.length, 8).setNumberFormat('@').setValues(rows);
  sh.getRange(1, 1, 1, 8).setFontWeight('bold');
  sh.setFrozenRows(1); sh.setFrozenColumns(1);
  sh.getRange(rows.length + 2, 1).setValue('Built automatically from everyone\'s schedules on the Th7 site. Edits here get overwritten.');
}

function label_(h) { var hh = h % 12 === 0 ? 12 : h % 12; return hh + (h < 12 || h === 24 ? 'am' : 'pm'); }

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* Run this once from the editor (Run > setup) to create the tabs and approve access. */
function setup() { ensureTabs_(book_()); buildFreeGrid_(book_(), readDb_(book_()).members); }
