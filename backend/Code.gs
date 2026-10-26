/** @OnlyCurrentDoc */
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
  var PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+=*$/;
  var PHOTO_MAX = 45000;

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
      if (m.photo !== undefined && m.photo !== null) {
        var ph = String(m.photo);
        if (ph && (ph.length > PHOTO_MAX || !PHOTO_RE.test(ph))) return fail('That photo did not work. Try a different one.');
        rec.photo = ph;
      }
      var clash = findMember(db, name);
      if (p.create) {
        if (clash) return fail(clash.name + ' is already on the board. If that is you, pick your name from the list.', 'name_taken');
        if (rec.photo === undefined) rec.photo = '';
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
      if (rec.photo === undefined) rec.photo = '';
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

  /* short, stable fingerprint of a photo so phones only download it when it changes */
  function photoVersion(data) {
    data = String(data || '');
    if (!data) return '';
    var h = 5381;
    for (var i = 0; i < data.length; i++) h = ((h * 33) ^ data.charCodeAt(i)) >>> 0;
    return 'p' + data.length.toString(36) + h.toString(36);
  }

  /* who a change is "by" (the person whose password must match) */
  function actorOf(action, p) {
    p = p || {};
    if (action === 'saveMember') return p.create ? null : (p.oldName || (p.member && p.member.name) || null);
    if (action === 'removeMember' || action === 'checkin' || action === 'sessionOp' || action === 'eventOp') return p.name || null;
    if (action === 'propose') return (p.session && p.session.by) || null;
    if (action === 'addEvent') return (p.event && p.event.by) || null;
    return null;
  }

  function apply(db, action, payload, ctx) {
    var fn = actions[action];
    if (!fn) return fail('Unknown action.');
    try { return fn(db, payload || {}, ctx); }
    catch (err) { return fail('Something broke: ' + (err && err.message ? err.message : err), 'error'); }
  }

  return {
    DAYS: DAYS, H_START: H_START, H_END: H_END, PER_DAY: PER_DAY, SLOTS: SLOTS,
    NAME_RE: NAME_RE, EVENT_TAGS: EVENT_TAGS,
    apply: apply, emptyDb: emptyDb, photoVersion: photoVersion, actorOf: actorOf, PHOTO_MAX: PHOTO_MAX, sameName: sameName, findMember: findMember,
    has: has, asList: asList, addDays: addDays, validDate: validDate, str: str, pad: pad
  };
})();

/* ===================== Th7 Board: Google Sheet backend =====================
   This script lives inside the "Th7 Board" Google Sheet and runs as a web app.
   - Everything the site saves lands in the tabs of this sheet.
   - The group passcode is in the Settings tab (change it there any time, no redeploy needed).
   - Each person has their own password. Only a salted hash is stored (pwhash column).
     To reset someone's password: clear their pwhash cell in the Members tab. Next time
     they log in, the site asks them to set a new one.
   - Every change is written to the Log tab too, so nothing is ever silently lost.
   - The Free Grid tab is a readable "who is free when" view, rebuilt on every schedule save.
   ========================================================================= */

var SHEET_ID = '';                 // leave blank when this script is attached to the sheet
var TZ = 'America/New_York';
var DEFAULT_PASSCODE = 'th7derf';
var SCHEMA = 2;

var TABS = {
  Members:  ['name', 'color', 'busy', 'places', 'splits', 'goal', 'motto', 'joined', 'updated', 'photo', 'pwhash', 'salt', 'tokens'],
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
var PRIVATE_FIELDS = ['photo', 'pwhash', 'salt', 'tokens'];

/* ---------- web app entry points ---------- */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'ping') return json_({ ok: true, th7: true, v: SCHEMA });
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
  if (body.action === 'photos') return json_(photosFor_(readDb_(book), body.names));

  var lock = LockService.getScriptLock();
  try { lock.waitLock(28000); }
  catch (err) { return json_({ ok: false, code: 'busy', error: 'The board is busy, retrying.' }); }

  try {
    var cache = CacheService.getScriptCache();
    var db = readDb_(book);
    var before = {};
    Object.keys(DATA_TABS).forEach(function (k) { before[k] = JSON.stringify(db[k]); });
    var now = new Date();
    var ctx = { now: now.toISOString(), today: Utilities.formatDate(now, TZ, 'yyyy-MM-dd') };

    var out;
    if (body.action === 'login') out = login_(db, body, cache);
    else if (body.action === 'claim') out = claim_(db, body);
    else if (body.action === 'join') out = join_(db, body, ctx);
    else if (body.action === 'setPassword') out = setPassword_(db, body);
    else if (body.action === 'logout') out = logout_(db, body);
    else out = runOps_(db, body, cache, ctx);
    db = out.db || db;

    var changed = [];
    Object.keys(DATA_TABS).forEach(function (k) {
      if (JSON.stringify(db[k]) !== before[k]) { writeTable_(book, DATA_TABS[k], db[k]); changed.push(k); }
    });
    (out.removed || []).forEach(function (m) { appendRow_(book, 'Removed', { removedAt: ctx.now, name: m.name, data: JSON.stringify(publicMember_(m)) }); });
    (out.logs || []).forEach(function (l) { appendRow_(book, 'Log', { at: ctx.now, who: String(l.who || '').slice(0, 30), action: l.action, detail: String(l.detail || '').slice(0, 1500) }); });
    if (changed.indexOf('members') >= 0) buildFreeGrid_(book, db.members);
    SpreadsheetApp.flush();
    (out.doneKeys || []).forEach(function (k) { try { cache.put(k, '1', 21600); } catch (err) { /* ignore */ } });

    var st = stateFor_(db);
    ['ok', 'error', 'code', 'token', 'name', 'results', 'duplicate'].forEach(function (k) { if (out[k] !== undefined) st[k] = out[k]; });
    return json_(st);
  } finally {
    lock.releaseLock();
  }
}

/* ---------- people, passwords, devices ---------- */
function hex_(bytes) { return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)); }
function hashPw_(pw, salt) { var h = salt + ':' + pw; for (var i = 0; i < 120; i++) h = sha_(h + ':' + salt); return h; }
function validPw_(pw) { return typeof pw === 'string' && pw.length >= 4 && pw.length <= 64; }
function setPw_(m, pw) { m.salt = Utilities.getUuid().replace(/-/g, ''); m.pwhash = hashPw_(pw, m.salt); }
function checkPw_(m, pw) { return !!m.pwhash && !!m.salt && hashPw_(String(pw || ''), m.salt) === m.pwhash; }
function issueToken_(m) {
  var t = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  m.tokens = [sha_(t)].concat(m.tokens || []).slice(0, 8);      // up to 8 devices per person
  return t;
}
function authed_(db, auth) {
  if (!auth || !auth.name || !auth.token) return null;
  var m = Th7Core.findMember(db, auth.name);
  if (!m || !m.pwhash) return null;
  return (m.tokens || []).indexOf(sha_(auth.token)) >= 0 ? m : null;
}
function failKey_(name) { return 'fail:' + String(name).toLowerCase().slice(0, 30); }
function tooManyTries_(cache, name) { return +(cache.get(failKey_(name)) || 0) >= 8; }
function noteFail_(cache, name) { var k = failKey_(name); cache.put(k, String(+(cache.get(k) || 0) + 1), 600); }
function err_(error, code, extra) { var o = { ok: false, error: error, code: code || 'invalid' }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }

function login_(db, body, cache) {
  var m = Th7Core.findMember(db, body.name);
  if (!m) return err_('That name is not on the board.', 'no_member');
  if (!m.pwhash) return err_('Set a password to lock your profile.', 'needs_password', { name: m.name });
  if (tooManyTries_(cache, m.name)) return err_('Too many wrong tries. Wait 10 minutes and try again.', 'locked');
  if (!checkPw_(m, body.password)) { noteFail_(cache, m.name); return err_('Wrong password.', 'bad_password'); }
  try { cache.remove(failKey_(m.name)); } catch (e) { /* ignore */ }
  return { ok: true, token: issueToken_(m), name: m.name };
}

function claim_(db, body) {
  var m = Th7Core.findMember(db, body.name);
  if (!m) return err_('That name is not on the board.', 'no_member');
  if (m.pwhash) return err_('This profile already has a password.', 'has_password');
  if (!validPw_(body.password)) return err_('Passwords need at least 4 characters.');
  setPw_(m, body.password);
  m.tokens = [];
  return { ok: true, token: issueToken_(m), name: m.name, logs: [{ who: m.name, action: 'setPassword', detail: '(new password set)' }] };
}

function join_(db, body, ctx) {
  var member = body.member || {};
  if (!validPw_(body.password)) return err_('Passwords need at least 4 characters.');
  var name = Th7Core.str(member.name, 24);
  var existing = Th7Core.findMember(db, name);
  if (existing) {
    if (checkPw_(existing, body.password)) return { ok: true, token: issueToken_(existing), name: existing.name };   // a retry of a join that already worked
    return err_(existing.name + ' is already on the board. If that is you, go back and pick your name.', 'name_taken');
  }
  var res = Th7Core.apply(db, 'saveMember', { member: member, create: true }, ctx);
  if (!res.ok) return res;
  var m = Th7Core.findMember(db, name);
  setPw_(m, body.password);
  m.tokens = [];
  return { ok: true, token: issueToken_(m), name: m.name, logs: [{ who: m.name, action: 'join', detail: logDetail_({ member: member }) }] };
}

function setPassword_(db, body) {
  var m = authed_(db, body.auth);
  if (!m) return err_('Log in again first.', 'auth');
  if (!validPw_(body.password)) return err_('Passwords need at least 4 characters.');
  setPw_(m, body.password);
  m.tokens = [sha_(body.auth.token)];                    // stay logged in here, log out everywhere else
  return { ok: true, name: m.name, logs: [{ who: m.name, action: 'setPassword', detail: '(password changed)' }] };
}

function logout_(db, body) {
  var m = authed_(db, body.auth);
  if (m) { var h = sha_(body.auth.token); m.tokens = (m.tokens || []).filter(function (t) { return t !== h; }); }
  return { ok: true };
}

function runOps_(db, body, cache, ctx) {
  var ops = body.action === 'batch' ? (Array.isArray(body.ops) ? body.ops.slice(0, 40) : []) : [{ opId: body.opId, action: body.action, payload: body.payload }];
  var me = authed_(db, body.auth);
  if (!me) {
    return err_('Log in again to save your changes.', 'auth', { results: ops.map(function (op) { return { opId: (op || {}).opId, ok: false, code: 'auth' }; }) });
  }
  var meName = me.name;
  var results = [], removed = [], logs = [], doneKeys = [];
  ops.forEach(function (op) {
    op = op || {};
    var key = op.opId ? 'op:' + String(op.opId).slice(0, 40) : null;
    if (key && cache.get(key)) { results.push({ opId: op.opId, ok: true, duplicate: true }); return; }   // retry of a saved change
    var actor = Th7Core.actorOf(op.action, op.payload);
    if (!actor) { results.push({ opId: op.opId, ok: false, code: 'invalid', error: 'That change is not allowed.' }); return; }
    if (!meName || !Th7Core.sameName(actor, meName)) { results.push({ opId: op.opId, ok: false, code: 'not_you', error: 'You can only change your own stuff.' }); return; }
    var trial = JSON.parse(JSON.stringify(db));                     // all-or-nothing per change
    var res = Th7Core.apply(trial, op.action, op.payload || {}, ctx);
    if (res.ok) {
      db = trial;
      if (res.renamed) meName = res.renamed[1];
      if (op.action === 'removeMember') meName = null;
      if (res.removed) removed.push(res.removed);
      if (res.changed.length) logs.push({ who: actor, action: op.action, detail: logDetail_(op.payload) });
      if (key) doneKeys.push(key);
    }
    results.push({ opId: op.opId, ok: res.ok, error: res.error, code: res.code });
  });
  var out = { db: db, results: results, removed: removed, logs: logs, doneKeys: doneKeys };
  if (body.action !== 'batch') {
    var r0 = results[0] || { ok: false, error: 'Nothing to do.' };
    out.ok = r0.ok; if (!r0.ok) { out.error = r0.error; out.code = r0.code; }
    if (r0.duplicate) out.duplicate = true;
  }
  return out;
}

function logDetail_(payload) {
  var p = JSON.parse(JSON.stringify(payload || {}));
  if (p.member && p.member.photo) p.member.photo = '(photo)';
  delete p.password;
  return JSON.stringify(p);
}

function publicMember_(m) {
  var o = {};
  for (var k in m) if (PRIVATE_FIELDS.indexOf(k) < 0) o[k] = m[k];
  o.pv = Th7Core.photoVersion(m.photo);
  o.locked = !!m.pwhash;
  return o;
}

function photosFor_(db, names) {
  var want = Array.isArray(names) ? names : null;
  var photos = {};
  db.members.forEach(function (m) {
    if (!m.photo) return;
    if (want && !want.some(function (n) { return Th7Core.sameName(n, m.name); })) return;
    photos[m.name] = { pv: Th7Core.photoVersion(m.photo), data: m.photo };
  });
  return { ok: true, photos: photos };
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
  // add any new columns to older tabs (runs once per schema version)
  var cache = CacheService.getScriptCache();
  if (cache.get('schema') !== String(SCHEMA)) {
    Object.keys(TABS).forEach(function (name) {
      var sh = book.getSheetByName(name), head = TABS[name];
      var cur = sh.getRange(1, 1, 1, head.length).getValues()[0].map(String);
      if (cur.join('|') !== head.join('|')) sh.getRange(1, 1, 1, head.length).setNumberFormat('@').setValues([head]).setFontWeight('bold');
    });
    cache.put('schema', String(SCHEMA), 21600);
  }
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
    else if (h === 'tokens') v = v.split(',').map(function (t) { return t.trim(); }).filter(function (t) { return /^[0-9a-f]{64}$/.test(t); });
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
    if (LIST_FIELDS[h] || h === 'tokens') return (v || []).join(', ');
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
  return { ok: true, v: SCHEMA, now: new Date().toISOString(), members: db.members.map(publicMember_), checkins: db.checkins, sessions: db.sessions, events: db.events };
}

function buildFreeGrid_(book, members) {
  var sh = book.getSheetByName('Free Grid') || book.insertSheet('Free Grid');
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
