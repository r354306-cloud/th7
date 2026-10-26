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
if (typeof module !== 'undefined') module.exports = Th7Core;
