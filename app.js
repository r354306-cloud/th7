/* Th7 board. Plain JS, no build step. */
(function () {
  'use strict';

  /* =========================================================
     Constants
     ========================================================= */
  var C = Th7Core;
  var PLACES = TH7_PLACES, PLACE = {};
  PLACES.forEach(function (p) { PLACE[p.id] = p; });
  var GYMS = PLACES.filter(function (p) { return p.type === 'gym'; });
  var LIBS = PLACES.filter(function (p) { return p.type === 'library'; });
  var SPLIT = {}; TH7_SPLITS.forEach(function (s) { SPLIT[s.id] = s.label; });
  var TAG = {}; TH7_EVENT_TAGS.forEach(function (t) { TAG[t.id] = t.label; });
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var H0 = C.H_START, H1 = C.H_END, PD = C.PER_DAY, SLOTS = C.SLOTS;
  var ZEROS = new Array(SLOTS + 1).join('0');

  var CFG = window.TH7_CONFIG || {};
  var params = new URLSearchParams(location.search);
  var API = CFG.API_URL || '';
  var apiParam = params.get('api');
  if (apiParam && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(apiParam)) API = apiParam;
  var DEMO = !API;
  var NS = DEMO ? 'th7demo.' : 'th7.';

  var PHOTO_HERO = 'photo-mirror-lake.jpg';
  var PHOTO_GATE = 'photo-thompson.jpg';

  /* =========================================================
     Storage (never throws)
     ========================================================= */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(NS + k); } catch (e) { /* ignore */ } }
  };

  /* =========================================================
     Small utils
     ========================================================= */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var pad = C.pad;
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function same(a, b) { return C.sameName(a, b); }
  function has(arr, n) { return C.has(arr || [], n); }
  function plural(n, w, ws) { return n + ' ' + (n === 1 ? w : (ws || w + 's')); }
  function firstName(n) { return String(n || '').split(' ')[0]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() { return ymd(new Date()); }
  function dowOf(s) { return (parseYmd(s).getDay() + 6) % 7; }
  function weekStartOf(s) { return C.addDays(s, -dowOf(s)); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function mdy(s) { var d = parseYmd(s); return MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function fmtDay(s) { return DAYS[dowOf(s)] + ' ' + mdy(s); }
  function relDay(s) {
    var t = today();
    if (s === t) return 'Today';
    if (s === C.addDays(t, 1)) return 'Tomorrow';
    if (s === C.addDays(t, -1)) return 'Yesterday';
    return fmtDay(s);
  }
  function shortDay(s) {
    var t = today();
    if (s === t) return 'Today';
    if (s === C.addDays(t, 1)) return 'Tomorrow';
    return DAYS[dowOf(s)] + ' ' + parseYmd(s).getDate();
  }
  function weekRange(ws) { var we = C.addDays(ws, 6); return mdy(ws) + ' - ' + mdy(we); }
  function hm(h) { h = ((h % 24) + 24) % 24; return (h % 12 || 12) + (h < 12 ? 'am' : 'pm'); }
  function hs(h) { h = ((h % 24) + 24) % 24; return (h % 12 || 12) + (h < 12 ? 'a' : 'p'); }
  function span(h, dur) {
    var b = h + (dur || 1), am1 = h < 12, am2 = (b % 24) < 12;
    if (am1 === am2 && b < 24) return (h % 12 || 12) + '-' + (b % 12 || 12) + (am2 ? 'am' : 'pm');
    return hm(h) + '-' + hm(b);
  }
  function ml(m) {
    m = ((m % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), mi = m % 60;
    return (h % 12 || 12) + (mi ? ':' + pad(mi) : '') + (h < 12 ? 'am' : 'pm');
  }
  function sStart(s) { var d = parseYmd(s.date); d.setHours(s.hour, 0, 0, 0); return d.getTime(); }
  function sEnd(s) { return sStart(s) + (s.dur || 1) * 3600000; }
  function relTime(ms) {
    var diff = ms - Date.now(), a = Math.abs(diff), m = Math.round(a / 60000);
    var txt = m < 60 ? m + 'm' : (m < 60 * 36 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd');
    if (m < 1) return 'now';
    return diff > 0 ? 'in ' + txt : txt + ' ago';
  }
  function nextDateForDow(d) {
    var t = today(), td = dowOf(t);
    var delta = (d - td + 7) % 7;
    if (delta === 0) return t;
    return C.addDays(t, delta);
  }

  /* =========================================================
     Icons
     ========================================================= */
  var ICONS = {
    home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
    map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
    plans: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4',
    glass: 'M7 3h10l-1 7a4 4 0 0 1-8 0zM12 14v7M8 21h8',
    trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M10 17h4v4h-4z',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    dumbbell: 'M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11',
    book: 'M4 19.5V5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2zM6 21h14M8 7h8',
    plus: 'M12 5v14M5 12h14',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    x: 'M6 6l12 12M18 6L6 18',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    flame: 'M12 21c-4 0-7-2.8-7-6.6 0-3 2-5.2 3.6-7 .4 2 1.6 3.2 3 3.6C11 8 12 5.5 14 3c.6 3.2 5 5.6 5 11.2C19 18.2 16 21 12 21z',
    pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    bolt: 'M13 3 5 13h6l-1 8 8-10h-6z',
    chevL: 'M15 6l-6 6 6 6', chevR: 'M9 6l6 6-6 6', chevD: 'M6 9l6 6 6-6',
    share: 'M12 3v12M8 7l4-4 4 4M5 13v6h14v-6',
    cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
    lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
    users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3.5 6',
    moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
    sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
    party: 'M4 20l4.5-12L16 15.5zM14 4l1 2M19 8l2-1M17 3l-1 3M18.5 12.5l2 .5M10 4.5c1 1 1.2 2.6.5 3.5',
    food: 'M6 3v8a2 2 0 0 0 2 2v8M10 3v8M8 3v6M16 21V3c2 1 3 3.5 3 7s-1 4-3 4',
    sofa: 'M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M2 12a2 2 0 0 1 4 0v3h12v-3a2 2 0 0 1 4 0v6H2zM5 18v2M19 18v2',
    dots: 'M5 12h.01M12 12h.01M19 12h.01',
    ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
    refresh: 'M20 11a8 8 0 0 0-14.8-4M4 4v4h4M4 13a8 8 0 0 0 14.8 4M20 20v-4h-4',
    target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    nav: 'M3 11l18-8-8 18-2-8z',
    wifi: 'M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01',
    edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    swap: 'M7 4l-3 3 3 3M4 7h13M17 20l3-3-3-3M20 17H7'
  };
  function ic(n, cls) { return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (ICONS[n] || '') + '"/></svg>'; }
  var TAG_ICON = { party: 'party', out: 'glass', game: 'ball', food: 'food', chill: 'sofa', other: 'dots' };

  function logo(size) {
    return '<span class="logo" style="font-size:' + (size || 22) + 'px"><span class="logo-th">TH</span><span class="logo-7">7</span></span>';
  }

  /* =========================================================
     App state
     ========================================================= */
  var S = {
    code: store.get('code', ''),
    me: store.get('me', ''),
    server: store.get('cache', null),
    outbox: (store.get('outbox', []) || []).filter(function (o) { return o && o.opId && o.action; }),
    view: store.get('view', 'home'),
    gate: null,
    online: true, pulling: false, flushing: false, lastSync: 0, everSynced: false,
    writeSeq: 0, retryTimer: null, retryDelay: 2000,
    ui: Object.assign({ heatGroup: 'all', heatPlace: '', onlyMe: false, focus: [], plans: 'you', evWeek: 0, period: 'week', mapFilter: 'all' }, store.get('ui', {})),
    draft: null, saveTimer: null, painting: false, blocking: '',
    sheet: null, form: {}, pendingRender: false
  };
  if (['home', 'map', 'plans', 'events', 'ranks', 'me'].indexOf(S.view) < 0) S.view = 'home';
  var DB = C.emptyDb();
  var waiters = {};
  var confirmFn = null;

  function saveUi() { store.set('ui', S.ui); }

  function recompute() {
    var base = S.server ? JSON.parse(JSON.stringify({
      members: S.server.members || [], checkins: S.server.checkins || [],
      sessions: S.server.sessions || [], events: S.server.events || []
    })) : C.emptyDb();
    var ctx = { now: new Date().toISOString(), today: today() };
    S.outbox.forEach(function (op) { C.apply(base, op.action, op.payload, ctx); });
    DB = base;
  }

  /* =========================================================
     Talking to the Google Sheet (or the demo store)
     ========================================================= */
  function call(body) {
    if (DEMO) return demoServer(body);
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 30000);
    return fetch(API, { method: 'POST', body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined, redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) { try { return JSON.parse(t); } catch (e) { throw new Error('Bad response from the sheet'); } })
      .finally(function () { clearTimeout(timer); });
  }

  function setServer(r) {
    if (!r || !Array.isArray(r.members)) return;
    S.server = { members: r.members, checkins: r.checkins || [], sessions: r.sessions || [], events: r.events || [], now: r.now };
    store.set('cache', S.server);
    S.everSynced = true;
  }

  function pull() {
    if (!DEMO && !S.code) return Promise.resolve(false);
    if (S.pulling) return Promise.resolve(false);
    if (S.flushing || S.outbox.length) { flush(); return Promise.resolve(false); }
    S.pulling = true;
    var seq = S.writeSeq;
    return call({ action: 'state', code: S.code }).then(function (r) {
      S.online = true;
      if (r.code === 'bad_code') { badCode(); return false; }
      if (r.ok && seq === S.writeSeq && !S.flushing) setServer(r);
      return true;
    }).catch(function () { S.online = false; return false; })
      .then(function (okv) {
        S.pulling = false; S.lastSync = Date.now();
        recompute(); decideGate(); render({ soft: true });
        return okv;
      });
  }

  function badCode() {
    S.code = ''; store.del('code');
    S.gate = 'code'; S.gateErr = 'The passcode changed. Ask the group for the new one.';
    render();
  }

  function persistOutbox() {
    store.set('outbox', S.outbox.map(function (o) { return { opId: o.opId, action: o.action, payload: o.payload, at: o.at }; }));
  }

  function enqueue(action, payload, opts) {
    opts = opts || {};
    var op = { opId: uid(), action: action, payload: payload, at: Date.now() };
    if (action === 'saveMember' && !payload.create) {
      for (var i = S.outbox.length - 1; i >= 0; i--) {
        var o = S.outbox[i];
        if (o.inflight) break;
        if (o.action === 'saveMember' && !o.payload.create && same(o.payload.oldName, payload.oldName) && same(o.payload.member.name, payload.member.name)) {
          o.payload = { member: payload.member, oldName: o.payload.oldName };
          persistOutbox(); recompute(); render({ soft: true });
          return opts.wait ? new Promise(function (res, rej) { waiters[o.opId] = { res: res, rej: rej }; }) : Promise.resolve();
        }
        if (o.action === 'saveMember') break;
      }
    }
    S.outbox.push(op);
    persistOutbox();
    recompute();
    var p = opts.wait ? new Promise(function (res, rej) { waiters[op.opId] = { res: res, rej: rej }; }) : Promise.resolve();
    render({ soft: true });
    flush();
    return p;
  }

  function flush() {
    if (S.flushing || !S.outbox.length) return;
    if (!DEMO && !S.code) return;
    clearTimeout(S.retryTimer);
    S.flushing = true;
    renderSync();
    var op = S.outbox[0];
    op.inflight = true;
    S.writeSeq++;
    call({ action: op.action, payload: op.payload, opId: op.opId, code: S.code }).then(function (r) {
      S.online = true;
      if (r.code === 'bad_code') { op.inflight = false; S.flushing = false; badCode(); return; }
      if (r.code === 'busy') throw new Error('busy');
      S.outbox.shift(); persistOutbox();
      setServer(r);
      S.retryDelay = 2000;
      var w = waiters[op.opId]; delete waiters[op.opId];
      if (!r.ok) {
        toast(r.error || 'That did not save.', 'err');
        if (w) w.rej(r);
      } else if (w) w.res(r);
      S.flushing = false;
      recompute(); decideGate(); render({ soft: true });
      if (S.outbox.length) flush();
    }).catch(function () {
      op.inflight = false; S.flushing = false; S.online = false;
      renderSync();
      S.retryTimer = setTimeout(flush, S.retryDelay);
      S.retryDelay = Math.min(S.retryDelay * 2, 30000);
    });
  }

  /* demo mode: the same rules, saved in this browser only */
  function demoServer(body) {
    return new Promise(function (res) {
      setTimeout(function () {
        var db = store.get('demo-db', null) || C.emptyDb();
        if (body.action === 'state') return res(Object.assign({ ok: true }, db));
        var ctx = { now: new Date().toISOString(), today: today() };
        var r = C.apply(db, body.action, body.payload, ctx);
        if (r.ok) store.set('demo-db', db); else db = store.get('demo-db', C.emptyDb());
        res(Object.assign({ ok: r.ok, error: r.error, code: r.code }, db));
      }, 150);
    });
  }

  /* =========================================================
     Derived data
     ========================================================= */
  function M(name) { return C.findMember(DB, name); }
  function meM() { return S.me ? M(S.me) : null; }
  function freeAt(m, d, h) { return m.busy.charAt(d * PD + (h - H0)) === '0'; }
  function hasSchedule(m) { return m.busy.indexOf('1') >= 0; }
  function activeSessions() { return DB.sessions.filter(function (s) { return s.status !== 'canceled'; }); }

  function initials(n) {
    var parts = String(n || '?').trim().split(/\s+/);
    var s = parts.length > 1 ? parts[0].charAt(0) + parts[1].charAt(0) : String(n || '?').slice(0, 2);
    return s.toUpperCase();
  }
  function inkFor(hex) {
    var h = String(hex || '#888888').replace('#', '');
    var r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    var L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return L > 0.55 ? '#0b0c10' : '#ffffff';
  }
  function av(m, size, extra, z) {
    if (typeof m === 'string') m = M(m) || { name: m, color: '#5a6170' };
    return '<span class="av av-' + (size || 'md') + ' ' + (extra || '') + '" style="--c:' + esc(m.color) + ';--ink:' + inkFor(m.color) + (z ? ';z-index:' + z : '') + '" title="' + esc(m.name) + '">' + esc(initials(m.name)) + '</span>';
  }
  function stack(names, max, size) {
    max = max || 4;
    var shown = names.slice(0, max).map(function (n, i) { return av(n, size || 'sm', '', max + 1 - i); }).join('');
    var more = names.length > max ? '<span class="av av-' + (size || 'sm') + ' av-more">+' + (names.length - max) + '</span>' : '';
    return '<span class="stack">' + shown + more + '</span>';
  }

  /* ----- places & hours ----- */
  function isOpenAt(p, date, min) {
    var d = dowOf(date);
    while (min >= 1440) { min -= 1440; d = (d + 1) % 7; }
    var h = p.hours[d];
    return !!h && min >= h[0] && min < h[1];
  }
  function openDuring(p, date, h, dur) {
    var a = h * 60, b = (h + (dur || 1)) * 60 - 1;
    for (var m = a; m <= b; m += 30) if (!isOpenAt(p, date, m)) return false;
    return isOpenAt(p, date, b);
  }
  function closeAfter(p, d, close) {
    var steps = 0, dd = d;
    while (close === 1440 && steps < 7) {
      var nh = p.hours[(dd + 1) % 7];
      if (nh && nh[0] === 0) { dd = (dd + 1) % 7; close = nh[1]; steps++; } else break;
    }
    return { steps: steps, day: dd, close: close };
  }
  function statusNow(p) {
    var t = today(), d = dowOf(t), m = nowMin(), h = p.hours[d];
    if (h && m >= h[0] && m < h[1]) {
      var c = closeAfter(p, d, h[1]);
      var label;
      if (c.steps >= 7) label = 'Open 24 hrs';
      else if (c.steps === 0) label = 'Closes ' + ml(c.close);
      else label = 'Open til ' + (c.steps === 1 ? 'tomorrow ' : DAYS[c.day] + ' ') + ml(c.close);
      var soon = c.steps === 0 && c.close - m <= 60;
      return { open: true, soon: soon, label: label, short: c.steps >= 7 ? '24 hrs' : (c.steps === 0 ? 'til ' + ml(c.close) : 'open late') };
    }
    if (h && m < h[0]) return { open: false, label: 'Opens ' + ml(h[0]), short: 'opens ' + ml(h[0]) };
    for (var i = 1; i <= 7; i++) {
      var nd = (d + i) % 7, nh = p.hours[nd];
      if (nh) {
        var when = i === 1 ? 'tomorrow' : DAYS[nd];
        return { open: false, label: 'Opens ' + when + ' ' + ml(nh[0]), short: 'opens ' + (i === 1 ? 'tmrw' : DAYS[nd]) };
      }
    }
    return { open: false, label: 'Closed', short: 'closed' };
  }
  function dayHours(p, d) {
    var h = p.hours[d];
    if (!h) return 'Closed';
    var prev = p.hours[(d + 6) % 7], next = p.hours[(d + 1) % 7];
    var fromPrev = h[0] === 0 && prev && prev[1] === 1440;
    var toNext = h[1] === 1440 && next && next[0] === 0;
    if (fromPrev && toNext) return 'Open 24 hrs';
    if (fromPrev) return 'Open til ' + ml(h[1]);
    if (toNext) return ml(h[0]) + ' to overnight';
    return ml(h[0]) + ' to ' + ml(h[1]);
  }
  function closeCell(p, d) {
    var h = p.hours[d];
    if (!h) return '<span class="cl-closed">Closed</span>';
    var prev = p.hours[(d + 6) % 7], next = p.hours[(d + 1) % 7];
    var toNext = h[1] === 1440 && next && next[0] === 0;
    var fromPrev = h[0] === 0 && prev && prev[1] === 1440;
    if (toNext && fromPrev) return '<span class="cl-24">24h</span>';
    if (toNext) return '<span class="cl-24">Late</span>';
    return '<b>' + ml(h[1]) + '</b>';
  }
  function openUntil(p, d) {
    var h = p.hours[d]; if (!h) return 'Closed';
    var c = closeAfter(p, d, h[1]);
    if (c.steps >= 6) return 'Open 24 hrs';
    if (c.steps === 0) return 'Open, closes ' + ml(c.close);
    return 'Open late, til ' + (c.steps === 1 ? DAYS[c.day] + ' ' : DAYS[c.day] + ' ') + ml(c.close);
  }
  function placeLabel(id) { var p = PLACE[id]; return p ? p.name : id; }
  function placeShort(id) { var p = PLACE[id]; return p ? p.short : id; }
  function membersAt(pid) { return DB.members.filter(function (m) { return m.places.indexOf(pid) >= 0; }); }

  /* ----- sessions ----- */
  function sState(s) {
    if (s.status === 'canceled') return 'canceled';
    var now = Date.now(), a = sStart(s), b = sEnd(s);
    if (s.done.length >= 2 || (s.done.length >= 1 && s.going.every(function (n) { return has(s.done, n); }) && now >= a)) return 'completed';
    if (now < a) return s.going.length >= 2 ? 'locked' : 'open';
    if (now < b) return 'live';
    if (now - b < 7 * 86400000) return 'confirm';
    return s.done.length ? 'completed' : 'missed';
  }
  var STATE_LABEL = { open: 'Needs a buddy', locked: 'Locked in', live: 'Happening now', confirm: 'Confirm it', completed: 'Done', missed: 'Missed', canceled: 'Canceled' };
  function sTitle(s) {
    var where = placeShort(s.place);
    if (s.kind === 'study') return 'Study at ' + where;
    return (s.split ? SPLIT[s.split] || s.split : 'Workout') + ' at ' + where;
  }
  function invitesForMe() {
    var me = S.me;
    return activeSessions().filter(function (s) {
      var st = sState(s);
      if (st !== 'open' && st !== 'locked') return false;
      if (same(s.by, me) || has(s.going, me) || has(s.declined, me)) return false;
      return s.invited.length === 0 || has(s.invited, me);
    }).sort(function (a, b) { return sStart(a) - sStart(b); });
  }
  function toConfirm() {
    var me = S.me;
    return activeSessions().filter(function (s) {
      var st = sState(s);
      return has(s.going, me) && !has(s.done, me) && (st === 'live' || st === 'confirm' || (st === 'completed' && Date.now() - sEnd(s) < 7 * 86400000 && Date.now() >= sStart(s)));
    }).sort(function (a, b) { return sStart(a) - sStart(b); });
  }

  /* ----- points, streaks, badges ----- */
  function workoutDays(name) {
    var set = {};
    DB.checkins.forEach(function (c) { if (same(c.name, name)) set[c.date] = 1; });
    activeSessions().forEach(function (s) { if (s.kind === 'workout' && has(s.done, name)) set[s.date] = 1; });
    return set;
  }
  function statsFor(m, from, to) {
    var inR = function (d) { return (!from || d >= from) && (!to || d <= to); };
    var days = workoutDays(m.name);
    var st = { name: m.name, pts: 0, days: 0, buddy: 0, study: 0, hosted: 0, goals: 0, early: false, owl: false, partners: 0, bestWeek: 0 };
    var partners = {};
    Object.keys(days).forEach(function (d) { if (inR(d)) { st.days++; st.pts += 10; } });
    activeSessions().forEach(function (s) {
      if (!has(s.done, m.name)) return;
      var buddy = s.done.length >= 2;
      if (inR(s.date)) {
        if (s.kind === 'workout') { if (buddy) { st.pts += 20; st.buddy++; } }
        else { st.study++; st.pts += buddy ? 15 : 5; if (buddy) st.buddy++; }
        if (buddy && same(s.by, m.name)) { st.pts += 5; st.hosted++; }
      }
      if (s.hour < 8) st.early = true;
      if (s.hour >= 21) st.owl = true;
      if (buddy) s.done.forEach(function (n) { if (!same(n, m.name)) partners[n.toLowerCase()] = 1; });
    });
    st.partners = Object.keys(partners).length;
    var weeks = {};
    Object.keys(days).forEach(function (d) { var w = weekStartOf(d); weeks[w] = (weeks[w] || 0) + 1; });
    Object.keys(weeks).forEach(function (w) {
      st.bestWeek = Math.max(st.bestWeek, weeks[w]);
      if (weeks[w] >= m.goal && inR(w)) { st.goals++; st.pts += 25; }
    });
    st.weekDays = weeks[weekStartOf(today())] || 0;
    st.streak = streakFor(weeks, m.goal);
    return st;
  }
  function streakFor(weeks, goal) {
    var w = weekStartOf(today()), n = 0;
    if ((weeks[w] || 0) >= goal) n++;
    w = C.addDays(w, -7);
    while ((weeks[w] || 0) >= goal) { n++; w = C.addDays(w, -7); }
    return n;
  }
  function periodRange(p) {
    var t = today();
    if (p === 'week') { var ws = weekStartOf(t); return [ws, C.addDays(ws, 6)]; }
    if (p === 'month') { var d = parseYmd(t); var a = ymd(new Date(d.getFullYear(), d.getMonth(), 1)); var b = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); return [a, b]; }
    return [null, null];
  }
  function board(period) {
    var r = periodRange(period);
    var rows = DB.members.map(function (m) { var st = statsFor(m, r[0], r[1]); st.m = m; return st; });
    rows.sort(function (a, b) { return b.pts - a.pts || b.days - a.days || b.buddy - a.buddy || a.name.localeCompare(b.name); });
    return rows;
  }
  var BADGES = [
    { id: 'first', label: 'First rep', desc: 'Logged a first workout', icon: 'bolt', test: function (s) { return s.days >= 1; } },
    { id: 'early', label: 'Early bird', desc: 'Finished a session before 8am', icon: 'sun', test: function (s) { return s.early; } },
    { id: 'owl', label: 'Night owl', desc: 'Finished a session at 9pm or later', icon: 'moon', test: function (s) { return s.owl; } },
    { id: 'locked', label: 'Locked in', desc: '5 buddy sessions done', icon: 'lock', test: function (s) { return s.buddy >= 5; } },
    { id: 'connector', label: 'Connector', desc: 'Finished sessions with 3 different people', icon: 'users', test: function (s) { return s.partners >= 3; } },
    { id: 'scholar', label: 'Scholar', desc: '3 study sessions done', icon: 'book', test: function (s) { return s.study >= 3; } },
    { id: 'iron', label: 'Iron week', desc: '6 workout days in one week', icon: 'dumbbell', test: function (s) { return s.bestWeek >= 6; } },
    { id: 'fire', label: 'On fire', desc: '3 week streak', icon: 'flame', test: function (s) { return s.streak >= 3; } },
    { id: 'host', label: 'Host', desc: 'Hosted 3 sessions that happened', icon: 'crown', test: function (s) { return s.hosted >= 3; } }
  ];
  function badgesFor(m) { var st = statsFor(m, null, null); return BADGES.filter(function (b) { return b.test(st); }); }

  /* ----- free time ----- */
  function pool() {
    var g = S.ui.heatGroup, pl = S.ui.heatPlace;
    return DB.members.filter(function (m) {
      if (pl) return m.places.indexOf(pl) >= 0;
      if (g === 'gym') return m.places.some(function (id) { return PLACE[id] && PLACE[id].type === 'gym'; });
      if (g === 'study') return m.places.some(function (id) { return PLACE[id] && PLACE[id].type === 'library'; });
      return true;
    });
  }
  function freeList(members, d, h) { return members.filter(function (m) { return freeAt(m, d, h); }); }
  function bestTimes(members, n) {
    var t = today(), td = dowOf(t), hr = new Date().getHours(), me = meM();
    var out = [];
    for (var d = td; d < 7; d++) for (var h = H0; h < H1; h++) {
      if (d === td && h <= hr) continue;
      if (S.ui.onlyMe && me && !freeAt(me, d, h)) continue;
      var f = freeList(members, d, h);
      if (f.length >= 2) out.push({ d: d, h: h, n: f.length, names: f.map(function (m) { return m.name; }) });
    }
    out.sort(function (a, b) { return b.n - a.n || a.d - b.d || a.h - b.h; });
    var picked = [];
    out.forEach(function (o) {
      if (picked.length >= n) return;
      if (picked.some(function (p) { return p.d === o.d && Math.abs(p.h - o.h) < 2; })) return;
      picked.push(o);
    });
    return picked;
  }
  function matchesFor(me) {
    return DB.members.filter(function (o) { return !same(o.name, me.name); }).map(function (o) {
      var overlap = 0, perDay = [0, 0, 0, 0, 0, 0, 0];
      for (var d = 0; d < 7; d++) for (var h = H0; h < H1; h++) if (freeAt(me, d, h) && freeAt(o, d, h)) { overlap++; perDay[d]++; }
      var places = me.places.filter(function (p) { return o.places.indexOf(p) >= 0; });
      var splits = me.splits.filter(function (p) { return o.splits.indexOf(p) >= 0; });
      var score = Math.round(clamp(overlap / 60, 0, 1) * 60 + Math.min(places.length, 3) / 3 * 28 + Math.min(splits.length, 3) / 3 * 12);
      var next = null;
      var t = today(), td = dowOf(t), hr = new Date().getHours();
      for (var i = 0; i < 14 && !next; i++) {
        var date = C.addDays(t, i), dd = dowOf(date);
        for (var hh = H0; hh < H1; hh++) {
          if (i === 0 && hh <= hr) continue;
          if (freeAt(me, dd, hh) && freeAt(o, dd, hh)) {
            var spot = places.filter(function (pid) { return PLACE[pid] && openDuring(PLACE[pid], date, hh, 1); })[0] || '';
            if (places.length && !spot) continue;
            next = { date: date, h: hh, place: spot };
            break;
          }
        }
      }
      return { m: o, overlap: overlap, perDay: perDay, places: places, splits: splits, score: score, next: next };
    }).sort(function (a, b) { return b.score - a.score || b.overlap - a.overlap; });
  }

  /* =========================================================
     Rendering: shell
     ========================================================= */
  var shellBuilt = false;
  var NAV = [
    { v: 'home', label: 'Home', icon: 'home' },
    { v: 'map', label: 'Map', icon: 'map' },
    { v: 'plans', label: 'Plans', icon: 'plans' },
    { v: 'events', label: 'Events', icon: 'glass' },
    { v: 'ranks', label: 'Ranks', icon: 'trophy' }
  ];

  function isTyping() {
    var a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
  }

  function render(opts) {
    opts = opts || {};
    if (opts.soft && (isTyping() || S.painting)) { S.pendingRender = true; renderSync(); return; }
    S.pendingRender = false;
    var app = $('#app');
    if (S.gate) {
      if (map) { map.remove(); map = null; markerLayer = null; }
      shellBuilt = false;
      app.innerHTML = renderGate();
      app.className = 'gate-mode';
      renderSheet(opts);
      renderBlocking();
      return;
    }
    if (!shellBuilt) buildShell();
    app.className = '';
    renderTop();
    $$('.view').forEach(function (el) { el.hidden = el.id !== 'v-' + S.view; });
    $$('[data-nav]').forEach(function (el) { el.classList.toggle('on', el.dataset.nav === S.view); });
    var fn = VIEWS[S.view];
    if (fn) fn();
    renderSheet(opts);
    renderBlocking();
  }

  function buildShell() {
    var navBtns = function (cls) {
      return NAV.map(function (n) {
        return '<button class="' + cls + '" data-act="nav" data-v="' + n.v + '" data-nav="' + n.v + '">' + ic(n.icon) + '<span>' + n.label + '</span><i class="nav-badge" data-badge="' + n.v + '"></i></button>';
      }).join('');
    };
    $('#app').innerHTML =
      '<header class="top"><div class="top-in">' +
        '<button class="brand" data-act="nav" data-v="home" aria-label="Th7 home">' + logo(24) + '</button>' +
        '<nav class="toptabs">' + navBtns('tt') + '</nav>' +
        '<div class="top-r"><span class="sync" id="sync"></span><button class="me-btn" data-act="nav" data-v="me" data-nav="me" id="me-btn" aria-label="My week"></button></div>' +
      '</div></header>' +
      (DEMO ? '<div class="demo-bar">Demo mode: changes stay in this browser. Add the Google Sheet link in config.js to go live.</div>' : '') +
      '<main class="main">' +
        '<section class="view" id="v-home"></section>' +
        '<section class="view" id="v-map"><div class="map-layout"><div class="map-wrap"><div id="map" aria-label="Map of gyms and libraries"></div><div class="map-chips" id="map-chips"></div><div class="map-legend"><span><i class="lg lg-open"></i>Open</span><span><i class="lg lg-soon"></i>Closing soon</span><span><i class="lg lg-closed"></i>Closed</span></div></div><div class="map-panel" id="map-panel"></div></div></section>' +
        '<section class="view" id="v-plans"></section>' +
        '<section class="view" id="v-events"></section>' +
        '<section class="view" id="v-ranks"></section>' +
        '<section class="view" id="v-me"></section>' +
      '</main>' +
      '<nav class="tabbar">' + navBtns('tb') + '</nav>';
    shellBuilt = true;
  }

  function renderTop() {
    var me = meM();
    var mb = $('#me-btn');
    if (mb && me) mb.innerHTML = av(me, 'md') + '<span class="me-name">' + esc(firstName(me.name)) + '</span>';
    var youN = invitesForMe().length + toConfirm().length;
    $$('[data-badge="plans"]').forEach(function (el) { el.textContent = youN ? youN : ''; el.classList.toggle('show', !!youN); });
    renderSync();
  }

  function renderSync() {
    var el = $('#sync');
    if (!el) return;
    var n = S.outbox.length, cls, txt;
    if (DEMO) { cls = 'demo'; txt = 'Demo'; }
    else if (n && !S.online) { cls = 'off'; txt = 'Offline, ' + n + ' waiting'; }
    else if (n || S.saveTimer) { cls = 'saving'; txt = 'Saving'; }
    else if (!S.online) { cls = 'off'; txt = 'Offline'; }
    else { cls = 'live'; txt = 'Saved'; }
    el.className = 'sync ' + cls;
    el.innerHTML = '<i></i>' + txt;
    el.title = S.lastSync ? 'Last synced ' + new Date(S.lastSync).toLocaleTimeString() : '';
  }

  function renderBlocking() {
    var el = $('#blocking');
    if (!S.blocking) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'blocking'; document.body.appendChild(el); }
    el.innerHTML = '<div class="spin"></div><p>' + esc(S.blocking) + '</p>';
  }

  /* =========================================================
     Gate: passcode, pick yourself, join
     ========================================================= */
  function decideGate() {
    if (S.gate === 'new') { if (meM()) S.gate = null; return; }
    if (!DEMO && !S.code) { S.gate = 'code'; return; }
    if (!S.server) { S.gate = 'loading'; return; }
    if (!S.me || !meM()) { if (S.me && S.everSynced && !meM() && !pendingMe()) { S.me = ''; store.del('me'); } S.gate = S.me && meM() ? null : 'pick'; return; }
    S.gate = null;
  }
  function pendingMe() { return S.outbox.some(function (o) { return o.action === 'saveMember'; }); }

  function renderGate() {
    var bg = '<div class="gate-bg" style="background-image:url(\'' + PHOTO_GATE + '\')"></div><div class="gate-shade"></div>';
    var credit = '<div class="photo-credit">Thompson Library photo: Michael Barera, CC BY-SA 4.0, Wikimedia Commons</div>';
    if (S.gate === 'loading') {
      return bg + '<div class="gate-card center">' + logo(56) + '<div class="spin"></div><p class="muted">' + (S.online ? 'Loading the board' : 'Can\'t reach the board right now.') + '</p>' +
        (S.online ? '' : '<button class="btn btn-primary" data-act="retry-load">' + ic('refresh') + 'Try again</button>') + '</div>' + credit;
    }
    if (S.gate === 'code') {
      return bg + '<form class="gate-card" data-form="code" autocomplete="off">' +
        logo(64) +
        '<h1 class="gate-title">The Th7 board</h1>' +
        '<p class="gate-sub">Workouts, study sessions and nights out. Members only.</p>' +
        '<label class="field"><span>Group passcode</span><input id="code-in" type="password" inputmode="text" autocapitalize="off" spellcheck="false" placeholder="Enter the passcode" value="" required></label>' +
        (S.gateErr ? '<p class="err-text">' + esc(S.gateErr) + '</p>' : '') +
        '<button class="btn btn-primary btn-xl" type="submit">' + ic('lock') + 'Let me in</button>' +
        '</form>' + credit;
    }
    if (S.gate === 'pick') {
      var ms = DB.members.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
      return bg + '<div class="gate-card wide">' + logo(48) +
        '<h1 class="gate-title">Who\'s this?</h1>' +
        '<p class="gate-sub">' + (ms.length ? 'Tap your name. You only do this once per device.' : 'Nobody is on the board yet. Be the first.') + '</p>' +
        '<div class="pick-grid">' + ms.map(function (m) {
          return '<button class="pick" data-act="pick-me" data-name="' + esc(m.name) + '">' + av(m, 'xl') + '<span>' + esc(m.name) + '</span></button>';
        }).join('') +
        '<button class="pick pick-new" data-act="new-me"><span class="av av-xl av-add">' + ic('plus') + '</span><span>I\'m new</span></button>' +
        '</div></div>' + credit;
    }
    if (S.gate === 'new') {
      return '<div class="join-wrap"><div class="join-head"><button class="btn btn-ghost" data-act="back-pick">' + ic('chevL') + 'Back</button>' + logo(28) + '</div>' + meEditor(true) + '</div>';
    }
    return '';
  }

  /* =========================================================
     Views
     ========================================================= */
  var VIEWS = {};

  /* ---------------- Home ---------------- */
  VIEWS.home = function () {
    var me = meM(); if (!me) return;
    var t = today(), ws = weekStartOf(t), td = dowOf(t), hr = new Date().getHours();
    var mst = statsFor(me, ws, C.addDays(ws, 6));
    var rows = board('week');
    var rank = rows.findIndex(function (r) { return same(r.name, me.name); }) + 1;
    var checked = DB.checkins.some(function (c) { return same(c.name, me.name) && c.date === t; }) || activeSessions().some(function (s) { return s.kind === 'workout' && s.date === t && has(s.done, me.name); });
    var nowFree = (hr >= H0 && hr < H1) ? DB.members.filter(function (m) { return freeAt(m, td, hr) && !same(m.name, me.name); }) : [];
    var openNow = PLACES.filter(function (p) { return !p.inside && statusNow(p).open; });
    var best = bestTimes(pool(), 1)[0];
    var goalPct = clamp(mst.weekDays / me.goal, 0, 1);

    var hero =
      '<div class="hero">' +
        '<div class="hero-photo" style="background-image:url(\'' + PHOTO_HERO + '\')"></div><div class="hero-shade"></div>' +
        '<div class="hero-in">' +
          '<div class="eyebrow">' + ic('cal') + 'Week of ' + esc(weekRange(ws)) + '</div>' +
          '<h1 class="display">Let\'s get it,<br><span class="accent">' + esc(firstName(me.name)) + '.</span></h1>' +
          '<p class="hero-sub">' + heroLine(nowFree, openNow, hr) + '</p>' +
          '<div class="hero-actions">' +
            '<button class="btn ' + (checked ? 'btn-done' : 'btn-primary') + '" data-act="checkin-today">' + ic(checked ? 'check' : 'bolt') + (checked ? 'Logged today' : 'Log today\'s workout') + '</button>' +
            '<button class="btn btn-glass" data-act="propose">' + ic('plus') + 'Propose a session</button>' +
          '</div>' +
        '</div>' +
        '<div class="hero-stats">' +
          '<button class="stat" data-act="nav" data-v="ranks"><span class="ring" style="--p:' + goalPct + '"><b>' + mst.weekDays + '/' + me.goal + '</b></span><span class="stat-t"><small>Weekly goal</small><strong>' + (mst.weekDays >= me.goal ? 'Goal hit' : plural(me.goal - mst.weekDays, 'day') + ' to go') + '</strong></span></button>' +
          '<button class="stat" data-act="nav" data-v="ranks"><span class="stat-ic">' + ic('trophy') + '</span><span class="stat-t"><small>This week</small><strong>' + mst.pts + ' pts' + (rank ? ' · #' + rank : '') + '</strong></span></button>' +
          '<button class="stat" data-act="best-time"><span class="stat-ic">' + ic('users') + '</span><span class="stat-t"><small>Best overlap</small><strong>' + (best ? DAYS[best.d] + ' ' + hm(best.h) + ' · ' + best.n + ' free' : 'Need more schedules') + '</strong></span></button>' +
          '<button class="stat" data-act="nav" data-v="ranks"><span class="stat-ic flame">' + ic('flame') + '</span><span class="stat-t"><small>Streak</small><strong>' + plural(mst.streak, 'week') + '</strong></span></button>' +
        '</div>' +
        '<div class="photo-credit">Mirror Lake photo: Wikimedia Commons, CC0</div>' +
      '</div>';

    var html = hero + needsYouHtml() + upNextHtml() + heatSection() + matchesHtml(me) + tonightHtml();
    if (!hasSchedule(me)) html = '<div class="nudge">' + ic('edit') + '<div><b>Add your busy times</b><span>So the board knows when you are free.</span></div><button class="btn btn-sm btn-primary" data-act="nav" data-v="me">Set it up</button></div>' + html;
    $('#v-home').innerHTML = html;
  };

  function heroLine(nowFree, openNow, hr) {
    if (hr < H0 || hr >= H1) return 'Late night. ' + openNow.length + ' spots still open: ' + openNow.slice(0, 3).map(function (p) { return esc(p.short); }).join(', ') + '.';
    var a = nowFree.length ? '<b>' + nowFree.length + ' free right now</b> ' + stack(nowFree.map(function (m) { return m.name; }), 5, 'xs') : 'Nobody else is free this hour';
    var b = openNow.length + ' of ' + PLACES.filter(function (p) { return !p.inside; }).length + ' spots open';
    return a + '<span class="dot-sep"></span>' + b;
  }

  function needsYouHtml() {
    var inv = invitesForMe(), conf = toConfirm();
    if (!inv.length && !conf.length) return '';
    var cards = conf.map(function (s) { return sessionCard(s, 'confirm'); }).concat(inv.slice(0, 4).map(function (s) { return sessionCard(s, 'invite'); }));
    return '<section class="sec"><div class="sec-h"><h2>' + ic('bolt') + 'Needs you</h2><span class="count">' + (inv.length + conf.length) + '</span></div><div class="cards">' + cards.join('') + '</div></section>';
  }

  function upNextHtml() {
    var list = activeSessions().filter(function (s) { var st = sState(s); return (st === 'open' || st === 'locked' || st === 'live') && sStart(s) - Date.now() < 7 * 86400000; })
      .sort(function (a, b) { return sStart(a) - sStart(b); }).slice(0, 5);
    var body = list.length ? '<div class="timeline">' + list.map(function (s) { return timelineItem(s); }).join('') + '</div>'
      : '<div class="empty">' + ic('plans') + '<p>No plans yet this week. Propose one and see who bites.</p><button class="btn btn-sm btn-primary" data-act="propose">Propose</button></div>';
    return '<section class="sec"><div class="sec-h"><h2>' + ic('clock') + 'Up next</h2><button class="link" data-act="nav" data-v="plans">All plans ' + ic('chevR') + '</button></div>' + body + '</section>';
  }

  function timelineItem(s) {
    var st = sState(s);
    return '<button class="tl" data-act="open-session" data-id="' + esc(s.id) + '">' +
      '<span class="tl-when"><b>' + esc(shortDay(s.date)) + '</b><small>' + span(s.hour, s.dur) + '</small></span>' +
      '<span class="tl-dot k-' + s.kind + '">' + ic(s.kind === 'study' ? 'book' : 'dumbbell') + '</span>' +
      '<span class="tl-main"><b>' + esc(sTitle(s)) + '</b><small>' + stack(s.going, 4, 'xs') + ' <em class="st st-' + st + '">' + STATE_LABEL[st] + '</em></small></span>' +
      '</button>';
  }

  function heatSection() {
    var me = meM(), members = pool();
    var focus = S.ui.focus.filter(function (n) { return !!M(n); });
    var counted = focus.length ? members.filter(function (m) { return has(focus, m.name); }) : members;
    var maxN = Math.max(1, counted.length);
    var td = dowOf(today()), hr = new Date().getHours();
    var head = '<div class="hh"></div>' + DAYS.map(function (d, i) { return '<div class="hh ' + (i === td ? 'today' : '') + '">' + d + '</div>'; }).join('');
    var cells = '';
    for (var h = H0; h < H1; h++) {
      cells += '<div class="hl">' + hs(h) + '</div>';
      for (var d = 0; d < 7; d++) {
        var f = freeList(counted, d, h);
        var n = f.length, a = n / maxN;
        var meBusy = S.ui.onlyMe && me && !freeAt(me, d, h);
        var all = focus.length >= 2 && n === counted.length;
        var dots = f.slice(0, 8).map(function (m) { return '<i style="--c:' + m.color + '"></i>'; }).join('');
        cells += '<button class="hc' + (meBusy ? ' dim' : '') + (all ? ' all' : '') + (d === td && h === hr ? ' now' : '') + (n === 0 ? ' zero' : '') + '" style="--a:' + a.toFixed(3) + '" data-act="cell" data-d="' + d + '" data-h="' + h + '" aria-label="' + DAYS_LONG[d] + ' ' + hm(h) + ', ' + n + ' free">' +
          '<b>' + (n || '') + '</b><span class="dots">' + dots + '</span></button>';
      }
    }
    var places = PLACES.filter(function (p) { return !p.inside || true; });
    var chips =
      '<div class="filters">' +
        '<div class="seg">' + [['all', 'Everyone'], ['gym', 'Gym crew'], ['study', 'Study crew']].map(function (g) {
          return '<button class="' + (S.ui.heatGroup === g[0] && !S.ui.heatPlace ? 'on' : '') + '" data-act="heat-group" data-v="' + g[0] + '">' + g[1] + '</button>';
        }).join('') + '</div>' +
        '<label class="select"><select data-ui="heatPlace" aria-label="Filter by spot"><option value="">Any spot</option>' +
          '<optgroup label="Gyms">' + GYMS.map(function (p) { return '<option value="' + p.id + '"' + (S.ui.heatPlace === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</optgroup>' +
          '<optgroup label="Libraries">' + LIBS.map(function (p) { return '<option value="' + p.id + '"' + (S.ui.heatPlace === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</optgroup>' +
        '</select>' + ic('chevD') + '</label>' +
        '<button class="toggle ' + (S.ui.onlyMe ? 'on' : '') + '" data-act="only-me"><i></i>Only my free time</button>' +
      '</div>' +
      '<div class="focus-row"><span class="muted">Compare</span>' + members.map(function (m) {
        return '<button class="focus ' + (has(focus, m.name) ? 'on' : '') + '" data-act="focus" data-name="' + esc(m.name) + '">' + av(m, 'sm') + '<span>' + esc(firstName(m.name)) + '</span></button>';
      }).join('') + (focus.length ? '<button class="link" data-act="focus-clear">Clear</button>' : '') + '</div>';
    var noSched = members.filter(function (m) { return !hasSchedule(m); });
    var best = bestTimes(counted, 4);
    return '<section class="sec card heat-card">' +
      '<div class="sec-h"><h2>' + ic('users') + 'When\'s everyone free</h2><span class="muted small">' + (focus.length >= 2 ? 'Glowing = all ' + focus.length + ' free' : plural(counted.length, 'person', 'people')) + '</span></div>' +
      chips +
      '<div class="heat-scroll"><div class="heat">' + head + cells + '</div></div>' +
      '<div class="heat-legend"><span>0</span><i class="grad"></i><span>' + maxN + ' free</span>' + (noSched.length ? '<span class="muted small">· ' + noSched.map(function (m) { return esc(firstName(m.name)); }).join(', ') + ' haven\'t added busy times</span>' : '') + '</div>' +
      (best.length ? '<div class="best"><span class="muted small">Best times left this week</span><div class="best-row">' + best.map(function (b) {
        return '<button class="best-chip" data-act="cell" data-d="' + b.d + '" data-h="' + b.h + '"><b>' + DAYS[b.d] + ' ' + span(b.h, 1) + '</b>' + stack(b.names, 4, 'xs') + '<small>' + b.n + ' free</small></button>';
      }).join('') + '</div></div>' : '') +
      '</section>';
  }

  function matchesHtml(me) {
    if (DB.members.length < 2) return '<section class="sec"><div class="sec-h"><h2>' + ic('target') + 'Your best matches</h2></div><div class="empty">' + ic('users') + '<p>Matches show up once more of the group joins. Send them the link.</p><button class="btn btn-sm btn-primary" data-act="share-site">Share the board</button></div></section>';
    var list = matchesFor(me).slice(0, 6);
    return '<section class="sec"><div class="sec-h"><h2>' + ic('target') + 'Your best matches</h2><span class="muted small hide-sm">Schedule, spots and splits</span></div><div class="hscroll">' +
      list.map(function (x) {
        var bars = x.perDay.map(function (v, i) { return '<i style="--v:' + (v / PD).toFixed(3) + '" title="' + DAYS[i] + ': ' + v + ' hrs"></i>'; }).join('');
        return '<div class="match">' +
          '<button class="match-top" data-act="open-person" data-name="' + esc(x.m.name) + '">' + av(x.m, 'lg') + '<span><b>' + esc(x.m.name) + '</b><small>' + x.overlap + ' hrs free together</small></span><span class="score" style="--p:' + (x.score / 100) + '"><b>' + x.score + '</b></span></button>' +
          '<div class="bars">' + bars + '</div><div class="bars-l">' + DAYS.map(function (d) { return '<span>' + d.charAt(0) + '</span>'; }).join('') + '</div>' +
          '<div class="tags">' + (x.places.length ? x.places.slice(0, 3).map(function (p) { return '<span class="tag">' + ic(PLACE[p] && PLACE[p].type === 'gym' ? 'dumbbell' : 'book') + esc(placeShort(p)) + '</span>'; }).join('') : '<span class="tag muted">No shared spots yet</span>') +
            x.splits.slice(0, 2).map(function (s) { return '<span class="tag tag-s">' + esc(SPLIT[s] || s) + '</span>'; }).join('') + '</div>' +
          (x.next ? '<button class="btn btn-sm btn-primary full" data-act="propose-with" data-name="' + esc(x.m.name) + '" data-date="' + x.next.date + '" data-h="' + x.next.h + '" data-place="' + esc(x.next.place) + '">' + ic('bolt') + relDay(x.next.date) + ' ' + hm(x.next.h) + (x.next.place ? ' at ' + esc(placeShort(x.next.place)) : '') + '</button>' : '<span class="muted small">No overlap in the next 2 weeks</span>') +
          '</div>';
      }).join('') + '</div></section>';
  }

  function tonightHtml() {
    var t = today();
    var evs = DB.events.filter(function (e) { return e.status !== 'canceled' && e.kind === 'event' && e.date >= t && e.date <= C.addDays(t, 6); })
      .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }).slice(0, 4);
    var spots = DB.events.filter(function (e) { return e.status !== 'canceled' && e.kind === 'spot' && e.date === t; })
      .sort(function (a, b) { return b.going.length - a.going.length; });
    var hol = TH7_HOLIDAYS[t];
    var body = '';
    if (spots.length) body += '<div class="tonight"><span class="muted small">Out tonight</span><div class="spot-row">' + spots.slice(0, 4).map(spotChip).join('') + '</div></div>';
    body += evs.length ? '<div class="cards">' + evs.map(eventCard).join('') + '</div>'
      : '<div class="empty">' + ic('party') + '<p>' + (hol ? esc(hol) + ' is today. What\'s the plan?' : 'Nothing on the calendar this week.') + '</p><button class="btn btn-sm btn-primary" data-act="add-event">Add an event</button></div>';
    return '<section class="sec"><div class="sec-h"><h2>' + ic('glass') + 'This week with Th7</h2><button class="link" data-act="nav" data-v="events">Events ' + ic('chevR') + '</button></div>' + body + '</section>';
  }

  /* ---------------- session cards ---------------- */
  function sessionCard(s, mode) {
    var st = sState(s), me = S.me, mine = same(s.by, me), going = has(s.going, me);
    var p = PLACE[s.place];
    var warn = p && !openDuring(p, s.date, s.hour, s.dur) ? '<span class="warn">' + ic('clock') + esc(p.short) + ' is closed for part of this</span>' : '';
    var who = s.going.map(function (n) { return '<span class="who ' + (has(s.done, n) ? 'did' : '') + '">' + av(n, 'sm') + (has(s.done, n) ? '<i class="tick">' + ic('check') + '</i>' : '') + '</span>'; }).join('');
    var pendingInv = s.invited.filter(function (n) { return !has(s.going, n) && !has(s.declined, n); });
    var actions = '';
    if (st === 'canceled') actions = mine ? '<button class="btn btn-sm btn-ghost" data-act="sop" data-op="restore" data-id="' + s.id + '">' + ic('undo') + 'Bring back</button>' : '';
    else if (st === 'open' || st === 'locked') {
      if (!going) actions = '<button class="btn btn-sm btn-primary" data-act="sop" data-op="join" data-id="' + s.id + '">' + ic('check') + 'I\'m in</button>' + (has(s.declined, me) ? '' : '<button class="btn btn-sm btn-ghost" data-act="sop" data-op="decline" data-id="' + s.id + '">Can\'t</button>');
      else if (!mine) actions = '<button class="btn btn-sm btn-ghost" data-act="sop" data-op="leave" data-id="' + s.id + '">Leave</button>';
      else actions = '<button class="btn btn-sm btn-ghost" data-act="share-session" data-id="' + s.id + '">' + ic('share') + 'Rally the group</button>';
    } else if (st === 'live' || st === 'confirm' || st === 'completed') {
      if (going && !has(s.done, me)) actions = '<button class="btn btn-sm btn-primary" data-act="sop" data-op="done" data-id="' + s.id + '">' + ic('check') + (s.kind === 'study' ? 'We studied' : 'We did it') + '</button>' + (st === 'confirm' ? '<button class="btn btn-sm btn-ghost" data-act="sop" data-op="leave" data-id="' + s.id + '">Didn\'t go</button>' : '');
      else if (!going && st === 'live') actions = '<button class="btn btn-sm btn-primary" data-act="sop" data-op="join" data-id="' + s.id + '">Join now</button>';
    }
    var pts = s.kind === 'study' ? '+15' : '+30';
    return '<article class="scard k-' + s.kind + ' s-' + st + '">' +
      '<button class="scard-main" data-act="open-session" data-id="' + esc(s.id) + '">' +
        '<span class="scard-ic">' + ic(s.kind === 'study' ? 'book' : 'dumbbell') + '</span>' +
        '<span class="scard-t"><b>' + esc(sTitle(s)) + '</b><small>' + esc(relDay(s.date)) + ' · ' + span(s.hour, s.dur) + (st === 'open' || st === 'locked' ? ' · ' + relTime(sStart(s)) : '') + '</small>' +
        (s.note ? '<em>"' + esc(s.note) + '"</em>' : '') + '</span>' +
        '<span class="st st-' + st + '">' + (mode === 'invite' && s.invited.length && has(s.invited, me) ? 'Invited you' : STATE_LABEL[st]) + '</span>' +
      '</button>' +
      '<div class="scard-who">' + who + (pendingInv.length ? '<span class="pending">' + stack(pendingInv, 3, 'xs') + '<small>invited</small></span>' : '') +
        '<span class="by">by ' + esc(firstName(s.by)) + '</span></div>' +
      warn +
      (actions ? '<div class="scard-a">' + actions + (st !== 'completed' && st !== 'canceled' && st !== 'missed' ? '<span class="pts">' + pts + ' pts</span>' : '') + '</div>' : '') +
      '</article>';
  }

  /* ---------------- Plans ---------------- */
  VIEWS.plans = function () {
    var me = S.me, tab = S.ui.plans;
    var inv = invitesForMe(), conf = toConfirm();
    var up = activeSessions().filter(function (s) { var st = sState(s); return st === 'open' || st === 'locked' || st === 'live'; }).sort(function (a, b) { return sStart(a) - sStart(b); });
    var past = DB.sessions.filter(function (s) { var st = sState(s); return st === 'completed' || st === 'missed' || st === 'canceled' || st === 'confirm'; }).sort(function (a, b) { return sStart(b) - sStart(a); }).slice(0, 40);
    var list, empty;
    if (tab === 'you') { list = conf.concat(inv); empty = 'You\'re all caught up. Nothing waiting on you.'; }
    else if (tab === 'up') { list = up; empty = 'Nothing planned yet. Be the one who starts it.'; }
    else { list = past; empty = 'No history yet. Finish a session to get on the board.'; }
    var html =
      '<div class="page-h"><div><h1>Plans</h1><p class="muted">Propose it, get a yes, both confirm, get points.</p></div><button class="btn btn-primary" data-act="propose">' + ic('plus') + 'Propose</button></div>' +
      '<div class="seg seg-lg">' +
        '<button class="' + (tab === 'you' ? 'on' : '') + '" data-act="plans-tab" data-v="you">For you' + ((inv.length + conf.length) ? ' <i class="pill-n">' + (inv.length + conf.length) + '</i>' : '') + '</button>' +
        '<button class="' + (tab === 'up' ? 'on' : '') + '" data-act="plans-tab" data-v="up">Upcoming' + (up.length ? ' <i class="pill-n soft">' + up.length + '</i>' : '') + '</button>' +
        '<button class="' + (tab === 'past' ? 'on' : '') + '" data-act="plans-tab" data-v="past">History</button>' +
      '</div>' +
      (list.length ? '<div class="cards">' + list.map(function (s) { return sessionCard(s, tab === 'you' && inv.indexOf(s) >= 0 ? 'invite' : ''); }).join('') + '</div>'
        : '<div class="empty big">' + ic('plans') + '<p>' + empty + '</p><button class="btn btn-primary" data-act="propose">' + ic('plus') + 'Propose a session</button></div>') +
      pointsHelp();
    $('#v-plans').innerHTML = html;
  };

  function pointsHelp() {
    return '<details class="help"><summary>' + ic('trophy') + 'How points work</summary><ul>' +
      '<li><b>+10</b> every day you log a workout (one per day)</li>' +
      '<li><b>+20</b> each when you finish a workout with a buddy (that day counts too, so +30)</li>' +
      '<li><b>+15</b> each for a study session with a buddy, <b>+5</b> solo</li>' +
      '<li><b>+5</b> to the host when a session they proposed happens</li>' +
      '<li><b>+25</b> for hitting your weekly goal</li>' +
      '<li>Sessions count once the people who went tap "We did it". Honor system. The group is watching.</li>' +
      '</ul></details>';
  }

  /* ---------------- Map ---------------- */
  var map = null, markerLayer = null;
  VIEWS.map = function () {
    var f = S.ui.mapFilter;
    var mv = S.ui.mapView || 'campus';
    $('#map-chips').innerHTML = '<div class="chip-row">' + [['all', 'All spots'], ['gym', 'Gyms'], ['library', 'Libraries'], ['open', 'Open now']].map(function (c) {
      return '<button class="chip ' + (f === c[0] ? 'on' : '') + '" data-act="map-filter" data-v="' + c[0] + '">' + c[1] + '</button>';
    }).join('') + '</div><div class="seg seg-map"><button class="' + (mv === 'campus' ? 'on' : '') + '" data-act="map-view" data-v="campus">Campus</button><button class="' + (mv === 'all' ? 'on' : '') + '" data-act="map-view" data-v="all">Off campus too</button></div>';
    var d = dowOf(today());
    var group = function (title, list, icon) {
      return '<div class="pl-group"><h3>' + ic(icon) + title + '</h3>' + list.map(function (p) {
        var s = statusNow(p), ppl = membersAt(p.id);
        return '<button class="pl ' + (s.open ? (s.soon ? 'soon' : 'open') : 'closed') + '" data-act="open-place" data-id="' + p.id + '">' +
          '<span class="pl-dot"></span>' +
          '<span class="pl-t"><b>' + esc(p.name) + '</b><small>' + esc(s.label) + ' · Today: ' + esc(dayHours(p, d).replace(/^Open/, 'open')) + '</small></span>' +
          (ppl.length ? stack(ppl.map(function (m) { return m.name; }), 3, 'xs') : '') +
          ic('chevR', 'muted') + '</button>';
      }).join('') + '</div>';
    };
    var tbl = function (list) {
      return list.map(function (p) {
        return '<tr><th><button class="link" data-act="open-place" data-id="' + p.id + '">' + esc(p.short) + '</button></th>' + DAYS.map(function (_, i) { return '<td class="' + (i === d ? 'today' : '') + '">' + closeCell(p, i) + '</td>'; }).join('') + '</tr>';
      }).join('');
    };
    $('#map-panel').innerHTML =
      '<div class="page-h tight"><div><h1>Spots</h1><p class="muted">Every gym and library, who goes where, and when they close.</p></div></div>' +
      group('Gyms', GYMS, 'dumbbell') + group('Libraries', LIBS, 'book') +
      '<section class="card"><div class="sec-h"><h2>' + ic('clock') + 'Closing times this week</h2></div>' +
      '<div class="tbl-scroll"><table class="hours-tbl"><thead><tr><th></th>' + DAYS.map(function (x, i) { return '<th class="' + (i === d ? 'today' : '') + '">' + x + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody><tr class="tbl-group"><td colspan="8">Gyms</td></tr>' + tbl(GYMS) + '<tr class="tbl-group"><td colspan="8">Libraries</td></tr>' + tbl(LIBS) + '</tbody></table></div>' +
      '<p class="muted small">Regular semester hours as of ' + esc(TH7_HOURS_ASOF) + '. "Late" means it stays open past midnight. Holidays and finals change things, tap a spot for its official hours page.</p></section>';
    setTimeout(initMap, 0);
  };

  function campusPts() { return PLACES.filter(function (p) { return !p.inside && p.id !== 'pf' && p.id !== 'crunch'; }).map(function (p) { return p.ll; }); }
  function allPts() { return PLACES.filter(function (p) { return !p.inside; }).map(function (p) { return p.ll; }); }
  function fitMap(which, animate) {
    if (!map) return;
    var pts = which === 'all' ? allPts() : campusPts();
    map.fitBounds(pts, { padding: [40, 40], maxZoom: 16.5, animate: !!animate });
    if (which !== 'all' && map.getZoom() < 15) map.setView(map.getCenter(), 15, { animate: !!animate });
  }
  function zoomClass() {
    var el = $('#map'); if (!el || !map) return;
    var z = map.getZoom();
    el.classList.toggle('z-low', z < 15);
    el.classList.toggle('z-mid', z >= 15 && z < 16);
    el.classList.toggle('z-high', z >= 16);
  }
  function addTiles() {
    var esriAttr = 'Tiles &copy; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    map.createPane('labels');
    map.getPane('labels').style.zIndex = 450;
    map.getPane('labels').style.pointerEvents = 'none';
    var base = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 16, maxZoom: 19, attribution: esriAttr });
    var ref = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 16, maxZoom: 19, pane: 'labels' });
    var loaded = 0, errors = 0, swapped = false;
    base.on('tileload', function () { loaded++; });
    base.on('tileerror', function () {
      errors++;
      if (!swapped && errors >= 4 && loaded === 0) {        // Esri unreachable: fall back to OpenStreetMap, darkened
        swapped = true;
        map.removeLayer(base); map.removeLayer(ref);
        $('#map').classList.add('osm-dark');
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      }
    });
    base.addTo(map); ref.addTo(map);
  }
  function initMap() {
    if (S.view !== 'map' || S.gate) return;
    if (!window.L) { setTimeout(initMap, 200); return; }
    var el = $('#map');
    if (!el) return;
    if (!map) {
      map = L.map(el, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, zoomSnap: 0.25, zoomDelta: 0.5, maxZoom: 19 });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      addTiles();
      markerLayer = L.layerGroup().addTo(map);
      map.on('zoomend', zoomClass);
      fitMap(S.ui.mapView || 'campus');
      zoomClass();
      el.addEventListener('click', function () { if (map) map.scrollWheelZoom.enable(); });
    } else map.invalidateSize();
    drawMarkers();
  }

  function drawMarkers() {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();
    var f = S.ui.mapFilter, t = today();
    PLACES.filter(function (p) { return !p.inside; }).forEach(function (p) {
      var s = statusNow(p);
      if (f === 'gym' && p.type !== 'gym') return;
      if (f === 'library' && p.type !== 'library') return;
      if (f === 'open' && !s.open) return;
      var ids = [p.id].concat(PLACES.filter(function (x) { return x.inside === p.id; }).map(function (x) { return x.id; }));
      var ppl = DB.members.filter(function (m) { return ids.some(function (id) { return m.places.indexOf(id) >= 0; }); });
      var hot = activeSessions().some(function (x) { var st = sState(x); return ids.indexOf(x.place) >= 0 && x.date === t && (st === 'locked' || st === 'live' || st === 'open'); });
      var html = '<div class="pin pin-' + p.type + ' ' + (s.open ? (s.soon ? 'is-soon' : 'is-open') : 'is-closed') + (hot ? ' is-hot' : '') + '">' +
        '<div class="pin-dot">' + ic(p.type === 'gym' ? 'dumbbell' : 'book') + '</div>' +
        '<div class="pin-label"><b>' + esc(p.short) + '</b><small>' + esc(s.short) + '</small></div>' +
        (ppl.length ? '<div class="pin-people">' + stack(ppl.map(function (m) { return m.name; }), 3, 'xxs') + '</div>' : '') +
        '</div>';
      var icon = L.divIcon({ className: 'pin-wrap', html: html, iconSize: [36, 36], iconAnchor: [18, 18] });
      var mk = L.marker(p.ll, { icon: icon, keyboard: true, title: p.name, riseOnHover: true });
      mk.on('click', function () { openSheet('place', { id: p.id }); });
      markerLayer.addLayer(mk);
    });
  }

  /* ---------------- Events ---------------- */
  VIEWS.events = function () {
    var t = today(), ws = C.addDays(weekStartOf(t), 7 * S.ui.evWeek);
    var label = S.ui.evWeek === 0 ? 'This week' : (S.ui.evWeek === 1 ? 'Next week' : (S.ui.evWeek === -1 ? 'Last week' : weekRange(ws)));
    var days = '';
    for (var i = 0; i < 7; i++) {
      var date = C.addDays(ws, i);
      var evs = DB.events.filter(function (e) { return e.date === date && e.kind === 'event' && e.status !== 'canceled'; }).sort(function (a, b) { return (a.time || '99').localeCompare(b.time || '99'); });
      var spots = DB.events.filter(function (e) { return e.date === date && e.kind === 'spot' && e.status !== 'canceled'; }).sort(function (a, b) { return b.going.length - a.going.length || a.created.localeCompare(b.created); });
      var hol = TH7_HOLIDAYS[date];
      var past = date < t;
      days += '<div class="day ' + (date === t ? 'is-today' : '') + (past ? ' is-past' : '') + (!evs.length && !spots.length ? ' is-empty' : '') + '">' +
        '<div class="day-h"><div class="day-n"><b>' + DAYS[i] + '</b><span>' + parseYmd(date).getDate() + '</span></div><div class="day-t">' + (date === t ? '<em class="today-pill">Today</em>' : '') + (hol ? '<em class="hol">' + esc(hol) + '</em>' : '') +
          (!evs.length && !spots.length ? '<span class="day-empty">' + (past ? 'Nothing happened' : 'Nothing yet') + '</span>' : '') + '</div>' +
          (past ? '' : '<button class="mini-btn" data-act="add-spot" data-date="' + date + '" aria-label="Suggest a spot to go out ' + DAYS_LONG[i] + '">' + ic('glass') + '<span>Spot</span></button><button class="mini-btn" data-act="add-event" data-date="' + date + '" aria-label="Add event on ' + DAYS_LONG[i] + '">' + ic('plus') + '<span>Event</span></button>') + '</div>' +
        (evs.length ? '<div class="cards">' + evs.map(eventCard).join('') + '</div>' : '') +
        (spots.length ? '<div class="spots"><span class="spots-h">' + ic('glass') + 'Where we going out?</span><div class="spot-row">' + spots.map(spotChip).join('') +
          (past ? '' : '<button class="spot add" data-act="add-spot" data-date="' + date + '">' + ic('plus') + 'Another spot</button>') + '</div></div>' : '') +
        '</div>';
    }
    $('#v-events').innerHTML =
      '<div class="page-h"><div><h1>Events</h1><p class="muted">Parties, game days, and where we\'re going out each night.</p></div><button class="btn btn-primary" data-act="add-event">' + ic('plus') + 'Add event</button></div>' +
      '<div class="week-nav"><button class="icon-btn" data-act="ev-week" data-v="-1" aria-label="Previous week">' + ic('chevL') + '</button><div><b>' + esc(label) + '</b><small>' + esc(weekRange(ws)) + '</small></div><button class="icon-btn" data-act="ev-week" data-v="1" aria-label="Next week">' + ic('chevR') + '</button></div>' +
      '<div class="days">' + days + '</div>';
  };

  function eventCard(e) {
    var me = S.me, going = has(e.going, me), maybe = has(e.maybe, me);
    return '<article class="ecard tag-' + esc(e.tag) + '">' +
      '<button class="ecard-main" data-act="open-event" data-id="' + esc(e.id) + '">' +
        '<span class="ecard-ic">' + ic(TAG_ICON[e.tag] || 'party') + '</span>' +
        '<span class="ecard-t"><b>' + esc(e.title) + '</b><small>' + esc(relDay(e.date)) + (e.time ? ' · ' + esc(timeLabel(e.time)) : '') + (e.place ? ' · ' + esc(e.place) : '') + '</small></span>' +
        '<span class="ecard-tag">' + esc(TAG[e.tag] || 'Event') + '</span>' +
      '</button>' +
      '<div class="ecard-b">' + (e.going.length ? stack(e.going, 5, 'sm') + '<small>' + e.going.length + ' going' + (e.maybe.length ? ', ' + e.maybe.length + ' maybe' : '') + '</small>' : '<small class="muted">No one yet</small>') +
        '<span class="rsvp"><button class="' + (going ? 'on' : '') + '" data-act="eop" data-op="' + (going ? 'out' : 'going') + '" data-id="' + esc(e.id) + '">' + ic('check') + 'Going</button><button class="' + (maybe ? 'on' : '') + '" data-act="eop" data-op="' + (maybe ? 'out' : 'maybe') + '" data-id="' + esc(e.id) + '">Maybe</button></span>' +
      '</div></article>';
  }
  function spotChip(e) {
    var mine = has(e.going, S.me);
    return '<button class="spot ' + (mine ? 'on' : '') + '" data-act="vote-spot" data-id="' + esc(e.id) + '" title="Suggested by ' + esc(e.by) + '"><b>' + esc(e.title) + '</b><span class="votes">' + e.going.length + '</span>' + (e.going.length ? stack(e.going, 3, 'xxs') : '') + '</button>' +
      (same(e.by, S.me) ? '<button class="spot-x" data-act="cancel-event" data-id="' + esc(e.id) + '" aria-label="Remove ' + esc(e.title) + '">' + ic('x') + '</button>' : '');
  }
  function timeLabel(t) { var p = t.split(':'); return ml(+p[0] * 60 + +p[1]); }

  /* ---------------- Ranks ---------------- */
  VIEWS.ranks = function () {
    var per = S.ui.period, rows = board(per), t = today(), ws = weekStartOf(t);
    var top = rows.slice(0, 3);
    var order = [top[1], top[0], top[2]];
    var podium = '<div class="podium">' + order.map(function (r, i) {
      if (!r) return '<div class="pod empty"></div>';
      var place = i === 1 ? 1 : (i === 0 ? 2 : 3);
      return '<button class="pod pod-' + place + '" data-act="open-person" data-name="' + esc(r.name) + '">' +
        (place === 1 ? '<span class="crown">' + ic('crown') + '</span>' : '') + av(r.m, place === 1 ? 'xl' : 'lg') +
        '<b>' + esc(firstName(r.name)) + '</b><span class="pod-pts">' + r.pts + '<small>pts</small></span><span class="pod-base"><i>' + place + '</i></span></button>';
    }).join('') + '</div>';
    var maxPts = Math.max(1, rows[0] ? rows[0].pts : 1);
    var list = '<div class="lb">' + rows.map(function (r, i) {
      return '<button class="lb-row ' + (same(r.name, S.me) ? 'me' : '') + '" data-act="open-person" data-name="' + esc(r.name) + '">' +
        '<span class="lb-n">' + (i + 1) + '</span>' + av(r.m, 'md') +
        '<span class="lb-t"><b>' + esc(r.name) + '</b><small>' + plural(r.days, 'workout day') + ' · ' + r.buddy + ' with a buddy' + (r.study ? ' · ' + r.study + ' study' : '') + '</small><i class="lb-bar" style="--p:' + (r.pts / maxPts).toFixed(3) + ';--c:' + r.m.color + '"></i></span>' +
        (r.streak ? '<span class="lb-streak">' + ic('flame') + r.streak + '</span>' : '') +
        '<span class="lb-pts">' + r.pts + '</span></button>';
    }).join('') + '</div>';

    var grid = '<div class="ci"><div class="ci-h"><span></span>' + DAYS.map(function (d, i) { return '<span class="' + (C.addDays(ws, i) === t ? 'today' : '') + '">' + d.charAt(0) + '</span>'; }).join('') + '<span>Goal</span></div>' +
      DB.members.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (m) {
        var days = workoutDays(m.name), n = 0, isMe = same(m.name, S.me);
        var cells = DAYS.map(function (_, i) {
          var date = C.addDays(ws, i), on = !!days[date]; if (on) n++;
          var future = date > t;
          var can = isMe && !future;
          return '<button class="ci-c ' + (on ? 'on' : '') + (future ? ' future' : '') + '" ' + (can ? 'data-act="toggle-checkin" data-date="' + date + '"' : 'disabled') + ' style="--c:' + m.color + '" aria-label="' + esc(m.name) + ' ' + DAYS_LONG[i] + (on ? ' worked out' : '') + '">' + (on ? ic('check') : '') + '</button>';
        }).join('');
        return '<div class="ci-r ' + (isMe ? 'me' : '') + '"><span class="ci-name">' + av(m, 'xs') + esc(firstName(m.name)) + '</span>' + cells + '<span class="ci-goal ' + (n >= m.goal ? 'hit' : '') + '">' + n + '/' + m.goal + '</span></div>';
      }).join('') + '</div>';

    $('#v-ranks').innerHTML =
      '<div class="page-h"><div><h1>Leaderboard</h1><p class="muted">Show up, bring a buddy, stack points.</p></div></div>' +
      '<div class="seg seg-lg">' + [['week', 'This week'], ['month', 'This month'], ['all', 'All time']].map(function (p) { return '<button class="' + (per === p[0] ? 'on' : '') + '" data-act="period" data-v="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div>' +
      (rows.length ? podium + list : '<div class="empty">No one yet.</div>') +
      '<section class="card"><div class="sec-h"><h2>' + ic('check') + 'Who showed up this week</h2><span class="muted small hide-sm">Tap your row to log a day</span></div>' + grid + '</section>' +
      '<section class="card"><div class="sec-h"><h2>' + ic('crown') + 'Badges</h2></div><div class="badge-grid">' + BADGES.map(function (b) {
        var holders = DB.members.filter(function (m) { return badgesFor(m).some(function (x) { return x.id === b.id; }); });
        return '<div class="badge ' + (holders.length ? 'got' : '') + '"><span class="badge-ic">' + ic(b.icon) + '</span><span><b>' + b.label + '</b><small>' + b.desc + '</small></span>' + (holders.length ? stack(holders.map(function (m) { return m.name; }), 4, 'xs') : '') + '</div>';
      }).join('') + '</div></section>' +
      pointsHelp();
  };

  /* ---------------- Me ---------------- */
  VIEWS.me = function () {
    $('#v-me').innerHTML = meEditor(false);
    meSync();
  };

  function blankDraft() {
    var used = DB.members.map(function (m) { return m.color; });
    var color = TH7_COLORS.filter(function (c) { return used.indexOf(c) < 0; })[0] || TH7_COLORS[Math.floor(Math.random() * TH7_COLORS.length)];
    return { name: '', color: color, busy: ZEROS.split(''), places: [], splits: [], goal: 4, motto: '' };
  }
  function initDraft(force) {
    var me = meM();
    if (S.draft && !force && (S.saveTimer || pendingMe())) return;
    if (me) S.draft = { name: me.name, color: me.color, busy: me.busy.split(''), places: me.places.slice(), splits: me.splits.slice(), goal: me.goal, motto: me.motto || '' };
    else S.draft = store.get('draft-new', null) || blankDraft();
    if (!Array.isArray(S.draft.busy) || S.draft.busy.length !== SLOTS) S.draft.busy = ZEROS.split('');
  }
  function draftMember() {
    var d = S.draft;
    return { name: d.name, color: d.color, busy: d.busy.join(''), places: d.places, splits: d.splits, goal: d.goal, motto: d.motto };
  }

  function meEditor(creating) {
    if (!S.draft) initDraft();
    var d = S.draft;
    var preview = { name: d.name || 'You', color: d.color };
    var busyCount = d.busy.filter(function (x) { return x === '1'; }).length;
    var placeChips = function (list) {
      return list.map(function (p) {
        var on = d.places.indexOf(p.id) >= 0, s = statusNow(p);
        return '<button class="pchip ' + (on ? 'on' : '') + '" data-act="me-place" data-id="' + p.id + '" aria-pressed="' + on + '"><span class="pchip-c">' + (on ? ic('check') : ic(p.type === 'gym' ? 'dumbbell' : 'book')) + '</span><span><b>' + esc(p.name) + '</b><small class="' + (s.open ? 'ok' : '') + '">' + esc(s.label) + '</small></span></button>';
      }).join('');
    };
    var grid = '<div class="paint" id="paint"><div class="ph"></div>' + DAYS.map(function (x, i) { return '<button class="ph" data-act="paint-day" data-d="' + i + '" title="Toggle all of ' + DAYS_LONG[i] + '">' + x + '</button>'; }).join('');
    for (var h = H0; h < H1; h++) {
      grid += '<div class="pl-h">' + hs(h) + '</div>';
      for (var dd = 0; dd < 7; dd++) {
        var i2 = dd * PD + (h - H0);
        grid += '<button class="pc ' + (d.busy[i2] === '1' ? 'on' : '') + '" data-i="' + i2 + '" aria-label="' + DAYS_LONG[dd] + ' ' + hm(h) + '"></button>';
      }
    }
    grid += '</div>';
    return '<div class="me-page">' +
      '<div class="page-h"><div><h1>' + (creating ? 'Join Th7' : 'My week') + '</h1><p class="muted">' + (creating ? 'Takes a minute. You can change all of this later.' : 'Changes save on their own.') + '</p></div>' + (creating ? '' : '<span class="sync-inline" id="me-sync"></span>') + '</div>' +
      '<section class="card me-card">' +
        '<div class="me-top">' + av(preview, 'xxl', 'me-av') +
          '<div class="me-fields"><label class="field"><span>Name</span><input data-me="name" maxlength="24" placeholder="What the group calls you" value="' + esc(d.name) + '" autocomplete="off"></label>' +
          '<label class="field"><span>Motto (optional)</span><input data-me="motto" maxlength="60" placeholder="Light weight baby" value="' + esc(d.motto) + '" autocomplete="off"></label></div></div>' +
        '<div class="swatches" role="radiogroup" aria-label="Your color">' + TH7_COLORS.map(function (c) { return '<button class="sw ' + (d.color === c ? 'on' : '') + '" style="--c:' + c + '" data-act="me-color" data-v="' + c + '" aria-label="Color ' + c + '"></button>'; }).join('') + '</div>' +
        '<div class="goal-row"><span><b>Weekly workout goal</b><small>Hit it for +25 and keep your streak alive</small></span><div class="seg seg-num">' + [1, 2, 3, 4, 5, 6, 7].map(function (n) { return '<button class="' + (d.goal === n ? 'on' : '') + '" data-act="me-goal" data-v="' + n + '">' + n + '</button>'; }).join('') + '</div></div>' +
      '</section>' +
      '<section class="card">' +
        '<div class="sec-h"><h2>' + ic('cal') + 'When are you busy?</h2><span class="muted small" id="busy-count">' + plural(busyCount, 'hr') + ' busy</span></div>' +
        '<p class="muted small">Tap or drag to paint class, work, practice, anything. Everything else counts as free. Tap a day to fill or clear it. It repeats every week.</p>' +
        '<div class="paint-tools"><button class="btn btn-sm btn-ghost" data-act="paint-copy">' + ic('swap') + 'Copy Mon to Tue-Fri</button><button class="btn btn-sm btn-ghost" data-act="paint-clear">' + ic('x') + 'Clear all</button></div>' +
        '<div class="paint-wrap">' + grid + '</div>' +
        '<div class="paint-legend"><span><i class="pk on"></i>Busy</span><span><i class="pk"></i>Free</span></div>' +
      '</section>' +
      '<section class="card"><div class="sec-h"><h2>' + ic('dumbbell') + 'Gyms you\'ll go to</h2></div><div class="pchips">' + placeChips(GYMS) + '</div></section>' +
      '<section class="card"><div class="sec-h"><h2>' + ic('book') + 'Libraries you\'ll study at</h2></div><div class="pchips">' + placeChips(LIBS) + '</div></section>' +
      '<section class="card"><div class="sec-h"><h2>' + ic('bolt') + 'What you train</h2></div><div class="chips">' + TH7_SPLITS.map(function (s) { var on = d.splits.indexOf(s.id) >= 0; return '<button class="chip ' + (on ? 'on' : '') + '" data-act="me-split" data-id="' + s.id + '" aria-pressed="' + on + '">' + esc(s.label) + '</button>'; }).join('') + '</div></section>' +
      (creating
        ? '<div class="join-foot"><p class="err-text" id="join-err"></p><button class="btn btn-primary btn-xl" data-act="me-create">' + ic('bolt') + 'Join the board</button></div>'
        : '<div class="me-foot"><button class="btn btn-ghost" data-act="switch-user">' + ic('swap') + 'Not ' + esc(firstName(d.name)) + '? Switch</button><button class="btn btn-ghost danger" data-act="remove-me">Remove me from the board</button></div>') +
      '</div>';
  }

  function draftChanged() {
    var creating = S.gate === 'new';
    if (creating) { store.set('draft-new', S.draft); return; }
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(saveDraftNow, 900);
    renderSync(); meSync();
  }
  function saveDraftNow() {
    clearTimeout(S.saveTimer); S.saveTimer = null;
    var me = meM();
    if (!me || !S.draft || S.gate) return;
    var m = draftMember(); m.name = me.name;            // renames go through their own flow
    enqueue('saveMember', { member: m, oldName: me.name });
    meSync();
  }
  function meSync() {
    var el = $('#me-sync'); if (!el) return;
    var pending = S.saveTimer || pendingMe();
    el.className = 'sync-inline ' + (pending ? (S.online ? 'saving' : 'off') : 'ok');
    el.innerHTML = pending ? (S.online ? '<i></i>Saving' : '<i></i>Offline, will save') : ic('check') + 'Saved';
  }

  /* =========================================================
     Bottom sheets
     ========================================================= */
  var SHEETS = {};
  function openSheet(type, args, isForm) { S.sheet = { type: type, args: args || {}, form: !!isForm, fresh: true }; renderSheet(); }
  function closeSheet() { S.sheet = null; renderSheet(); }

  function renderSheet(opts) {
    opts = opts || {};
    var root = $('#sheet-root');
    if (!S.sheet) {
      if (root.innerHTML) { root.innerHTML = ''; document.body.classList.remove('sheet-open'); }
      return;
    }
    if (opts.soft && S.sheet.form && !S.sheet.fresh) return;
    var body = root.querySelector('.sheet-body');
    var st = body ? body.scrollTop : 0;
    var fresh = S.sheet.fresh; S.sheet.fresh = false;
    var inner;
    try { inner = SHEETS[S.sheet.type](S.sheet.args); } catch (e) { console.error(e); inner = '<p class="muted">Something went wrong showing this.</p>'; }
    root.innerHTML = '<div class="backdrop" data-act="close-sheet"></div><div class="sheet ' + (fresh ? 'enter' : '') + '" role="dialog" aria-modal="true"><div class="grab"></div><button class="sheet-x" data-act="close-sheet" aria-label="Close">' + ic('x') + '</button><div class="sheet-body">' + inner + '</div></div>';
    var nb = root.querySelector('.sheet-body'); if (nb) nb.scrollTop = st;
    document.body.classList.add('sheet-open');
  }

  SHEETS.cell = function (a) {
    var d = +a.d, h = +a.h, date = nextDateForDow(d);
    var everyone = DB.members, free = freeList(everyone, d, h), busy = everyone.filter(function (m) { return free.indexOf(m) < 0; });
    var me = meM();
    var openG = GYMS.filter(function (p) { return openDuring(p, date, h, 1); });
    var openL = LIBS.filter(function (p) { return openDuring(p, date, h, 1); });
    var person = function (m) {
      var shared = me ? m.places.filter(function (p) { return me.places.indexOf(p) >= 0; }) : [];
      return '<button class="prow" data-act="open-person" data-name="' + esc(m.name) + '">' + av(m, 'md') + '<span><b>' + esc(m.name) + (me && same(m.name, me.name) ? ' <span class="muted">(you)</span>' : '') + '</b><small>' + (m.places.length ? m.places.slice(0, 4).map(placeShort).map(esc).join(', ') : 'No spots picked') + '</small></span>' + (shared.length && !same(m.name, me.name) ? '<em class="tag">' + shared.length + ' shared</em>' : '') + '</button>';
    };
    var placeList = function (list) {
      return list.length ? list.map(function (p) { return '<span class="tag">' + esc(p.short) + '<small>' + esc(openUntil(p, dowOf(date)).replace(/^Open, closes /, 'til ').replace(/^Open late, /, '').replace(/^Open /, '')) + '</small></span>'; }).join('') : '<span class="muted small">None open</span>';
    };
    var rd = relDay(date);
    return '<div class="sh-head"><small>' + esc(rd === 'Today' || rd === 'Tomorrow' ? rd + ' · ' + mdy(date) : fmtDay(date)) + '</small><h2>' + DAYS_LONG[d] + ' ' + span(h, 1) + '</h2></div>' +
      '<div class="sh-actions"><button class="btn btn-primary" data-act="propose-at" data-date="' + date + '" data-h="' + h + '" data-kind="workout">' + ic('dumbbell') + 'Propose workout</button><button class="btn btn-ghost" data-act="propose-at" data-date="' + date + '" data-h="' + h + '" data-kind="study">' + ic('book') + 'Propose study</button></div>' +
      '<h3 class="sh-sub">Free (' + free.length + ')</h3><div class="plist">' + (free.length ? free.map(person).join('') : '<p class="muted small">Nobody is free then.</p>') + '</div>' +
      '<h3 class="sh-sub">Open then</h3><div class="tags wrap"><b class="small">Gyms</b>' + placeList(openG) + '</div><div class="tags wrap"><b class="small">Libraries</b>' + placeList(openL) + '</div>' +
      (busy.length ? '<h3 class="sh-sub">Busy (' + busy.length + ')</h3><div class="busy-row">' + stack(busy.map(function (m) { return m.name; }), 12, 'sm') + '</div>' : '');
  };

  SHEETS.propose = function () {
    var f = S.form, t = today();
    var dates = []; for (var i = 0; i < 14; i++) dates.push(C.addDays(t, i));
    if (dates.indexOf(f.date) < 0) dates.unshift(f.date);
    var list = f.kind === 'study' ? LIBS : GYMS;
    var d = dowOf(f.date);
    var past = f.date === t && f.hour <= new Date().getHours() - 1;
    var free = DB.members.filter(function (m) { return !same(m.name, S.me); }).map(function (m) {
      var ok = true; for (var x = 0; x < f.dur; x++) if (f.hour + x >= H0 && f.hour + x < H1 && !freeAt(m, d, f.hour + x)) ok = false;
      return { m: m, free: ok };
    }).sort(function (a, b) { return (b.free - a.free) || a.m.name.localeCompare(b.m.name); });
    var place = PLACE[f.place];
    var placeOk = place && openDuring(place, f.date, f.hour, f.dur);
    var canSend = place && placeOk && !past;
    var hours = ''; for (var hh = 5; hh <= 23; hh++) hours += '<option value="' + hh + '"' + (hh === f.hour ? ' selected' : '') + '>' + hm(hh) + '</option>';
    return '<div class="sh-head"><small>New session</small><h2>Propose a ' + (f.kind === 'study' ? 'study session' : 'workout') + '</h2></div>' +
      '<div class="seg seg-lg"><button class="' + (f.kind === 'workout' ? 'on' : '') + '" data-act="f-kind" data-v="workout">' + ic('dumbbell') + 'Workout</button><button class="' + (f.kind === 'study' ? 'on' : '') + '" data-act="f-kind" data-v="study">' + ic('book') + 'Study</button></div>' +
      '<h3 class="sh-sub">Day</h3><div class="dchips">' + dates.map(function (x) { var pd = parseYmd(x); return '<button class="dchip ' + (x === f.date ? 'on' : '') + '" data-act="f-set" data-k="date" data-v="' + x + '"><small>' + (x === t ? 'Today' : DAYS[dowOf(x)]) + '</small><b>' + pd.getDate() + '</b><small>' + MONTHS[pd.getMonth()] + '</small></button>'; }).join('') + '</div>' +
      '<div class="row2"><label class="field"><span>Start</span><span class="select"><select data-f="hour" data-num data-rr>' + hours + '</select>' + ic('chevD') + '</span></label>' +
      '<label class="field"><span>How long</span><span class="select"><select data-f="dur" data-num data-rr>' + [1, 2, 3].map(function (n) { return '<option value="' + n + '"' + (n === f.dur ? ' selected' : '') + '>' + plural(n, 'hour') + '</option>'; }).join('') + '</select>' + ic('chevD') + '</span></label></div>' +
      (past ? '<p class="warn">' + ic('clock') + 'That time already passed. Pick a later one.</p>' : '') +
      '<h3 class="sh-sub">Where</h3><div class="pchips compact">' + list.map(function (p) {
        var open = openDuring(p, f.date, f.hour, f.dur), on = f.place === p.id;
        var c = p.hours[d];
        return '<button class="pchip ' + (on ? 'on' : '') + (open ? '' : ' closed') + '" data-act="f-set" data-k="place" data-v="' + p.id + '"><span class="pchip-c">' + (on ? ic('check') : ic(p.type === 'gym' ? 'dumbbell' : 'book')) + '</span><span><b>' + esc(p.name) + '</b><small class="' + (open ? 'ok' : 'bad') + '">' + (open ? openUntil(p, d) : 'Closed then') + '</small></span></button>';
      }).join('') + '</div>' +
      (place && !placeOk ? '<p class="warn">' + ic('clock') + esc(place.name) + ' is closed for part of that time. ' + esc(dayHours(place, d)) + ' on ' + DAYS[d] + '.</p>' : '') +
      (f.kind === 'workout'
        ? '<h3 class="sh-sub">Split (optional)</h3><div class="chips">' + TH7_SPLITS.map(function (s) { return '<button class="chip ' + (f.split === s.id ? 'on' : '') + '" data-act="f-set" data-k="split" data-v="' + (f.split === s.id ? '' : s.id) + '">' + esc(s.label) + '</button>'; }).join('') + '</div>'
        : '') +
      '<h3 class="sh-sub">Invite <span class="muted small">Leave empty to open it to all of Th7</span></h3><div class="invite">' + (free.length ? free.map(function (x) {
        var on = has(f.invited, x.m.name);
        return '<button class="inv ' + (on ? 'on' : '') + '" data-act="f-invite" data-name="' + esc(x.m.name) + '">' + av(x.m, 'md') + '<span>' + esc(firstName(x.m.name)) + '</span><small class="' + (x.free ? 'ok' : 'bad') + '">' + (x.free ? 'Free' : 'Busy') + '</small></button>';
      }).join('') : '<p class="muted small">No one else is on the board yet.</p>') + '</div>' +
      '<label class="field"><span>' + (f.kind === 'study' ? 'What are you studying?' : 'Anything else? (optional)') + '</span><input data-f="note" maxlength="140" value="' + esc(f.note) + '" placeholder="' + (f.kind === 'study' ? 'FIN 3200 midterm' : 'Leg day, no skipping') + '"></label>' +
      '<div class="sh-foot"><button class="btn btn-primary btn-xl" data-act="send-proposal" ' + (canSend ? '' : 'disabled') + '>' + ic('bolt') + 'Send it</button></div>';
  };

  SHEETS.session = function (a) {
    var s = DB.sessions.filter(function (x) { return x.id === a.id; })[0];
    if (!s) return '<p class="muted">This plan is gone.</p>';
    var st = sState(s), p = PLACE[s.place], mine = same(s.by, S.me);
    return '<div class="sh-head"><small><em class="st st-' + st + '">' + STATE_LABEL[st] + '</em></small><h2>' + esc(sTitle(s)) + '</h2><p class="muted">' + esc(fmtDay(s.date)) + ' · ' + span(s.hour, s.dur) + ' · ' + relTime(sStart(s)) + '</p></div>' +
      sessionCard(s) +
      (p ? '<button class="prow" data-act="open-place" data-id="' + p.id + '"><span class="scard-ic">' + ic('pin') + '</span><span><b>' + esc(p.name) + '</b><small>' + esc(p.addr) + ' · ' + esc(dayHours(p, dowOf(s.date))) + '</small></span>' + ic('chevR', 'muted') + '</button>' : '') +
      (s.declined.length ? '<p class="muted small">Can\'t make it: ' + s.declined.map(esc).join(', ') + '</p>' : '') +
      '<div class="sh-actions wrap">' +
        '<button class="btn btn-ghost" data-act="ics" data-id="' + s.id + '">' + ic('cal') + 'Add to calendar</button>' +
        '<button class="btn btn-ghost" data-act="share-session" data-id="' + s.id + '">' + ic('share') + 'Share</button>' +
        (mine && st !== 'canceled' && st !== 'completed' ? '<button class="btn btn-ghost danger" data-act="cancel-session" data-id="' + s.id + '">' + ic('x') + 'Cancel plan</button>' : '') +
        (has(s.done, S.me) ? '<button class="btn btn-ghost" data-act="sop" data-op="undone" data-id="' + s.id + '">' + ic('undo') + 'Undo my check</button>' : '') +
      '</div>';
  };

  SHEETS.place = function (a) {
    var p = PLACE[a.id]; if (!p) return '';
    var s = statusNow(p), d = dowOf(today());
    var inside = PLACES.filter(function (x) { return x.inside === p.id; });
    var ids = [p.id].concat(inside.map(function (x) { return x.id; }));
    var ppl = DB.members.filter(function (m) { return ids.some(function (id) { return m.places.indexOf(id) >= 0; }); });
    var ses = activeSessions().filter(function (x) { var st = sState(x); return ids.indexOf(x.place) >= 0 && (st === 'open' || st === 'locked' || st === 'live'); }).sort(function (x, y) { return sStart(x) - sStart(y); }).slice(0, 4);
    var table = function (pl) {
      return '<table class="wk"><tbody>' + DAYS_LONG.map(function (dn, i) { return '<tr class="' + (i === d ? 'today' : '') + '"><th>' + dn + '</th><td>' + esc(dayHours(pl, i)) + '</td></tr>'; }).join('') + '</tbody></table>';
    };
    var dir = 'https://www.google.com/maps/dir/?api=1&destination=' + p.ll[0] + ',' + p.ll[1];
    return '<div class="sh-head"><small>' + (p.type === 'gym' ? 'Gym' : 'Library') + '</small><h2>' + esc(p.name) + '</h2><p class="muted">' + esc(p.full !== p.name ? p.full + ' · ' : '') + esc(p.addr) + '</p></div>' +
      '<div class="status-big ' + (s.open ? (s.soon ? 'soon' : 'open') : 'closed') + '"><i></i><b>' + (s.open ? 'Open now' : 'Closed now') + '</b><span>' + esc(s.label) + '</span></div>' +
      (p.note ? '<p class="note">' + esc(p.note) + '</p>' : '') +
      '<div class="sh-actions wrap"><button class="btn btn-primary" data-act="propose-place" data-id="' + p.id + '">' + ic('bolt') + 'Propose here</button><a class="btn btn-ghost" href="' + dir + '" target="_blank" rel="noopener">' + ic('nav') + 'Directions</a><a class="btn btn-ghost" href="' + esc(p.url) + '" target="_blank" rel="noopener">' + ic('ext') + 'Official hours</a></div>' +
      '<h3 class="sh-sub">Hours this week</h3>' + table(p) +
      inside.map(function (x) { return '<h3 class="sh-sub">Inside: ' + esc(x.name) + '</h3><p class="muted small">' + esc(x.note) + '</p>' + table(x); }).join('') +
      '<h3 class="sh-sub">Th7 regulars (' + ppl.length + ')</h3>' + (ppl.length ? '<div class="plist">' + ppl.map(function (m) { return '<button class="prow" data-act="open-person" data-name="' + esc(m.name) + '">' + av(m, 'md') + '<span><b>' + esc(m.name) + '</b><small>' + (m.splits.length ? m.splits.map(function (x) { return SPLIT[x] || x; }).join(', ') : '') + '</small></span></button>'; }).join('') + '</div>' : '<p class="muted small">Nobody picked this spot yet.</p>') +
      (ses.length ? '<h3 class="sh-sub">Coming up here</h3><div class="cards">' + ses.map(function (x) { return sessionCard(x); }).join('') + '</div>' : '');
  };

  SHEETS.person = function (a) {
    var m = M(a.name); if (!m) return '<p class="muted">Not on the board anymore.</p>';
    var me = meM(), isMe = me && same(m.name, me.name);
    var all = statsFor(m, null, null), wk = periodRange('week'), w = statsFor(m, wk[0], wk[1]);
    var badges = badgesFor(m);
    var strip = '';
    if (me && !isMe) {
      strip = '<h3 class="sh-sub">Free together</h3><div class="mini-heat">';
      for (var d = 0; d < 7; d++) {
        strip += '<div class="mh-col"><span>' + DAYS[d].charAt(0) + '</span>';
        for (var h = H0; h < H1; h++) strip += '<i class="' + (freeAt(me, d, h) && freeAt(m, d, h) ? 'on' : '') + '"></i>';
        strip += '</div>';
      }
      strip += '</div><p class="muted small">Each column is a day, 6am at the top to 11pm at the bottom.</p>';
    }
    return '<div class="person-head">' + av(m, 'xxl') + '<div><h2>' + esc(m.name) + '</h2>' + (m.motto ? '<p class="motto">"' + esc(m.motto) + '"</p>' : '') + '</div></div>' +
      '<div class="pstats"><div><b>' + all.pts + '</b><small>All-time pts</small></div><div><b>' + w.pts + '</b><small>This week</small></div><div><b>' + all.streak + '</b><small>Week streak</small></div><div><b>' + all.days + '</b><small>Workout days</small></div></div>' +
      (badges.length ? '<div class="tags wrap">' + badges.map(function (b) { return '<span class="tag badge-tag">' + ic(b.icon) + esc(b.label) + '</span>'; }).join('') + '</div>' : '') +
      '<h3 class="sh-sub">Spots</h3><div class="tags wrap">' + (m.places.length ? m.places.map(function (p) { return '<span class="tag">' + ic(PLACE[p] && PLACE[p].type === 'gym' ? 'dumbbell' : 'book') + esc(placeLabel(p)) + '</span>'; }).join('') : '<span class="muted small">None picked</span>') + '</div>' +
      (m.splits.length ? '<h3 class="sh-sub">Trains</h3><div class="tags wrap">' + m.splits.map(function (x) { return '<span class="tag tag-s">' + esc(SPLIT[x] || x) + '</span>'; }).join('') + '</div>' : '') +
      strip +
      (isMe ? '<div class="sh-actions"><button class="btn btn-primary" data-act="nav" data-v="me">' + ic('edit') + 'Edit my week</button></div>'
        : '<div class="sh-actions"><button class="btn btn-primary" data-act="propose-with" data-name="' + esc(m.name) + '">' + ic('bolt') + 'Propose with ' + esc(firstName(m.name)) + '</button></div>');
  };

  SHEETS.event = function (a) {
    var e = DB.events.filter(function (x) { return x.id === a.id; })[0];
    if (!e) return '<p class="muted">This event is gone.</p>';
    var mine = same(e.by, S.me);
    return '<div class="sh-head"><small>' + esc(TAG[e.tag] || 'Event') + (e.status === 'canceled' ? ' · Canceled' : '') + '</small><h2>' + esc(e.title) + '</h2><p class="muted">' + esc(fmtDay(e.date)) + (e.time ? ' · ' + esc(timeLabel(e.time)) : '') + (e.place ? ' · ' + esc(e.place) : '') + '</p></div>' +
      (e.notes ? '<p class="note">' + esc(e.notes) + '</p>' : '') +
      eventCard(e) +
      '<h3 class="sh-sub">Going (' + e.going.length + ')</h3><div class="plist">' + e.going.map(function (n) { return '<div class="prow">' + av(n, 'md') + '<span><b>' + esc(n) + '</b></span></div>'; }).join('') + '</div>' +
      (e.maybe.length ? '<h3 class="sh-sub">Maybe (' + e.maybe.length + ')</h3><div class="busy-row">' + stack(e.maybe, 10, 'sm') + '</div>' : '') +
      '<p class="muted small">Added by ' + esc(e.by) + '</p>' +
      '<div class="sh-actions wrap"><button class="btn btn-ghost" data-act="share-event" data-id="' + esc(e.id) + '">' + ic('share') + 'Share</button>' +
      (mine ? (e.status === 'canceled' ? '<button class="btn btn-ghost" data-act="eop" data-op="restore" data-id="' + esc(e.id) + '">' + ic('undo') + 'Bring back</button>' : '<button class="btn btn-ghost danger" data-act="cancel-event" data-id="' + esc(e.id) + '">' + ic('x') + 'Cancel event</button>') : '') + '</div>';
  };

  SHEETS.newEvent = function () {
    var f = S.form, spot = f.kind === 'spot';
    return '<div class="sh-head"><small>' + (spot ? 'Night out' : 'New event') + '</small><h2>' + (spot ? 'Suggest a spot' : 'Add an event') + '</h2></div>' +
      '<div class="seg seg-lg"><button class="' + (!spot ? 'on' : '') + '" data-act="f-kind" data-v="event">' + ic('party') + 'Event</button><button class="' + (spot ? 'on' : '') + '" data-act="f-kind" data-v="spot">' + ic('glass') + 'Where we going out</button></div>' +
      (spot ? '' : '<h3 class="sh-sub">Type</h3><div class="chips">' + TH7_EVENT_TAGS.map(function (t) { return '<button class="chip ' + (f.tag === t.id ? 'on' : '') + '" data-act="f-set" data-k="tag" data-v="' + t.id + '">' + ic(TAG_ICON[t.id]) + esc(t.label) + '</button>'; }).join('') + '</div>') +
      '<label class="field"><span>' + (spot ? 'Spot' : 'What is it') + '</span><input data-f="title" maxlength="60" value="' + esc(f.title) + '" placeholder="' + (spot ? 'Bar, party, whoever\'s house' : 'Halloween party at the house') + '"></label>' +
      '<div class="row2"><label class="field"><span>Day</span><input type="date" data-f="date" value="' + esc(f.date) + '" min="' + C.addDays(today(), -1) + '"></label>' +
      '<label class="field"><span>Time (optional)</span><input type="time" data-f="time" value="' + esc(f.time) + '"></label></div>' +
      (spot ? '' : '<label class="field"><span>Where (optional)</span><input data-f="place" maxlength="60" value="' + esc(f.place) + '" placeholder="Address or spot"></label>') +
      '<label class="field"><span>Notes (optional)</span><textarea data-f="notes" maxlength="300" rows="3" placeholder="' + (spot ? 'Drink specials, cover, who\'s driving' : 'Costumes required, BYOB, etc') + '">' + esc(f.notes) + '</textarea></label>' +
      '<p class="err-text" id="ev-err"></p>' +
      '<div class="sh-foot"><button class="btn btn-primary btn-xl" data-act="send-event">' + ic('check') + (spot ? 'Suggest it' : 'Add it') + '</button></div>';
  };

  SHEETS.confirm = function (a) {
    return '<div class="sh-head"><h2>' + esc(a.title) + '</h2>' + (a.body ? '<p class="muted">' + esc(a.body) + '</p>' : '') + '</div>' +
      '<div class="sh-actions"><button class="btn ' + (a.danger ? 'btn-danger' : 'btn-primary') + '" data-act="confirm-yes">' + esc(a.yes || 'Yes') + '</button><button class="btn btn-ghost" data-act="close-sheet">' + esc(a.no || 'Never mind') + '</button></div>';
  };
  function confirmIt(opts, fn) { confirmFn = fn; openSheet('confirm', opts); }

  /* =========================================================
     Actions
     ========================================================= */
  function go(v) {
    if (S.view === 'me' && v !== 'me' && S.saveTimer) saveDraftNow();
    S.view = v; store.set('view', v);
    S.sheet = null;
    if (v === 'me') initDraft(true);
    render();
    window.scrollTo(0, 0);
    if (v === 'map') setTimeout(initMap, 30);
  }

  function openPropose(pre) {
    pre = pre || {};
    var me = meM(), t = today(), hr = new Date().getHours();
    var kind = pre.kind || 'workout';
    var date = pre.date || (hr >= 22 ? C.addDays(t, 1) : t);
    var hour = pre.hour != null ? +pre.hour : (date === t ? clamp(hr + 1, 6, 23) : 16);
    var list = kind === 'study' ? LIBS : GYMS;
    var place = pre.place || (me ? me.places.filter(function (id) { return list.some(function (p) { return p.id === id; }); })[0] : '') || (kind === 'study' ? 'thompson' : 'rpac');
    S.form = { kind: kind, date: date, hour: hour, dur: 1, place: place, split: '', note: '', invited: pre.invited || [] };
    openSheet('propose', {}, true);
  }

  function toast(msg, type, ms) {
    var box = $('#toasts');
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.innerHTML = (type === 'err' ? ic('x') : (type === 'pts' ? ic('bolt') : ic('check'))) + '<span>' + esc(msg) + '</span>';
    box.appendChild(el);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 350); }, ms || 2800);
  }

  function share(text) {
    var url = location.origin + location.pathname;
    if (navigator.share) {
      navigator.share({ title: 'Th7', text: text, url: url }).catch(function () { /* closed */ });
      return;
    }
    var full = text + ' ' + url;
    (navigator.clipboard ? navigator.clipboard.writeText(full) : Promise.reject()).then(function () { toast('Copied. Paste it in the group chat.'); })
      .catch(function () { toast('Copy this: ' + full, '', 6000); });
  }

  function downloadIcs(s) {
    var p = PLACE[s.place];
    var dt = function (ms) { var d = new Date(ms); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00'; };
    var e = function (x) { return String(x || '').replace(/\\/g, '\\\\').replace(/[,;]/g, function (c) { return '\\' + c; }).replace(/\n/g, '\\n'); };
    var now = new Date(), stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + '00Z';
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Th7//Board//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + s.id + '@th7', 'DTSTAMP:' + stamp, 'DTSTART:' + dt(sStart(s)), 'DTEND:' + dt(sEnd(s)),
      'SUMMARY:' + e('Th7: ' + sTitle(s)), 'LOCATION:' + e(p ? p.name + ', ' + p.addr + ', Columbus, OH' : s.place),
      'DESCRIPTION:' + e('With ' + s.going.join(', ') + (s.note ? '. ' + s.note : '')),
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:' + e(sTitle(s)), 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'];
    var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'th7-' + s.id + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function sessionById(id) { return DB.sessions.filter(function (x) { return x.id === id; })[0]; }
  function eventById(id) { return DB.events.filter(function (x) { return x.id === id; })[0]; }

  function checkinToggle(date) {
    var me = meM(); if (!me) return;
    var on = !DB.checkins.some(function (c) { return same(c.name, me.name) && c.date === date; });
    var viaSession = activeSessions().some(function (s) { return s.kind === 'workout' && s.date === date && has(s.done, me.name); });
    if (!on && viaSession) { toast('That day counts from a finished session.', ''); return; }
    var before = statsFor(me, weekStartOf(today()), C.addDays(weekStartOf(today()), 6));
    enqueue('checkin', { name: me.name, date: date, on: on });
    if (on) {
      var after = statsFor(me, weekStartOf(today()), C.addDays(weekStartOf(today()), 6));
      if (after.weekDays >= me.goal && before.weekDays < me.goal) { confetti(160); toast('Weekly goal hit. +35 pts', 'pts', 3600); }
      else { confetti(60); toast('Logged. +10 pts', 'pts'); }
    } else toast('Removed that day');
  }

  var ACT = {
    nav: function (el) { go(el.dataset.v); },
    'close-sheet': function () { closeSheet(); },
    'retry-load': function () { S.online = true; render(); pull(); },
    'pick-me': function (el) { S.me = el.dataset.name; store.set('me', S.me); S.gate = null; S.view = 'home'; store.set('view', 'home'); render(); toast('Welcome back, ' + firstName(S.me)); },
    'new-me': function () { S.me = ''; store.del('me'); S.gate = 'new'; S.draft = store.get('draft-new', null) || blankDraft(); render(); window.scrollTo(0, 0); },
    'back-pick': function () { S.gate = 'pick'; render(); },
    'switch-user': function () { if (S.saveTimer) saveDraftNow(); S.me = ''; store.del('me'); S.draft = null; S.gate = 'pick'; render(); },
    'remove-me': function () {
      confirmIt({ title: 'Remove yourself?', body: 'Your profile comes off the board. Your past check-ins and sessions stay in the history (and in the Google Sheet).', yes: 'Remove me', danger: true }, function () {
        var name = S.me;
        S.blocking = 'Removing you';
        enqueue('removeMember', { name: name }, { wait: true }).then(function () {
          S.blocking = ''; S.me = ''; store.del('me'); S.draft = null; S.gate = 'pick'; render(); toast('You are off the board');
        }).catch(function () { S.blocking = ''; render(); });
      });
    },
    'confirm-yes': function () { var fn = confirmFn; confirmFn = null; closeSheet(); if (fn) fn(); },

    'checkin-today': function () { checkinToggle(today()); },
    'toggle-checkin': function (el) { checkinToggle(el.dataset.date); },

    propose: function () { openPropose(); },
    'propose-at': function (el) { openPropose({ date: el.dataset.date, hour: +el.dataset.h, kind: el.dataset.kind }); },
    'propose-place': function (el) { var p = PLACE[el.dataset.id]; openPropose({ place: p.id, kind: p.type === 'gym' ? 'workout' : 'study' }); },
    'propose-with': function (el) {
      var pre = { invited: [el.dataset.name] };
      if (el.dataset.date) { pre.date = el.dataset.date; pre.hour = +el.dataset.h; }
      if (el.dataset.place) { pre.place = el.dataset.place; pre.kind = PLACE[el.dataset.place] && PLACE[el.dataset.place].type === 'library' ? 'study' : 'workout'; }
      openPropose(pre);
    },
    'best-time': function () { var b = bestTimes(pool(), 1)[0]; if (b) openSheet('cell', { d: b.d, h: b.h }); else go('me'); },
    'f-kind': function (el) {
      var f = S.form, v = el.dataset.v;
      if (S.sheet.type === 'propose') {
        f.kind = v; var list = v === 'study' ? LIBS : GYMS, me = meM();
        if (!list.some(function (p) { return p.id === f.place; })) f.place = (me && me.places.filter(function (id) { return list.some(function (p) { return p.id === id; }); })[0]) || (v === 'study' ? 'thompson' : 'rpac');
        if (v === 'study') f.split = '';
      } else { f.kind = v; }
      renderSheet();
    },
    'f-set': function (el) { S.form[el.dataset.k] = el.dataset.v; renderSheet(); },
    'f-invite': function (el) { var n = el.dataset.name, f = S.form; f.invited = has(f.invited, n) ? f.invited.filter(function (x) { return !same(x, n); }) : f.invited.concat([n]); renderSheet(); },
    'send-proposal': function () {
      var f = S.form, me = meM(); if (!me) return;
      var s = { id: uid(), kind: f.kind, date: f.date, hour: +f.hour, dur: +f.dur, place: f.place, split: f.split, note: C.str(f.note, 140), by: me.name, invited: f.invited };
      closeSheet();
      enqueue('propose', { session: s });
      confetti(40);
      toast(f.invited.length ? 'Sent to ' + f.invited.map(firstName).join(', ') : 'Posted to the whole group', 'pts');
    },
    'open-session': function (el) { openSheet('session', { id: el.dataset.id }); },
    sop: function (el) {
      var s = sessionById(el.dataset.id); if (!s) return;
      var op = el.dataset.op, me = S.me;
      var wasDone = sState(s) === 'completed';
      enqueue('sessionOp', { id: s.id, op: op, name: me });
      if (op === 'join') { toast(s.going.length >= 1 ? 'Locked in with ' + firstName(s.by) : 'You\'re in', 'pts'); confetti(50); }
      else if (op === 'done') {
        var after = sessionById(s.id);
        var buddy = after && after.done.length >= 2;
        confetti(buddy ? 170 : 80);
        toast(buddy ? (s.kind === 'study' ? 'Study session done. +15 pts' : 'Buddy workout done. +30 pts') : 'Checked. Points land when your buddy confirms too', 'pts', 3600);
        if (!wasDone && buddy && sState(after) === 'completed') { /* celebrated */ }
      }
      else if (op === 'decline') toast('Got it, passed on this one');
      else if (op === 'leave') toast('You left that plan');
    },
    'cancel-session': function (el) {
      var s = sessionById(el.dataset.id); if (!s) return;
      confirmIt({ title: 'Cancel this plan?', body: sTitle(s) + ', ' + relDay(s.date) + ' ' + span(s.hour, s.dur) + '. Everyone sees it as canceled.', yes: 'Cancel plan', no: 'Keep it', danger: true }, function () {
        enqueue('sessionOp', { id: s.id, op: 'cancel', name: S.me }); toast('Plan canceled');
      });
    },
    'share-session': function (el) {
      var s = sessionById(el.dataset.id); if (!s) return;
      share('Who\'s in? ' + sTitle(s) + ' ' + relDay(s.date).toLowerCase() + ' ' + span(s.hour, s.dur) + '. Tap I\'m in on the Th7 board:');
    },
    ics: function (el) { var s = sessionById(el.dataset.id); if (s) downloadIcs(s); },
    'plans-tab': function (el) { S.ui.plans = el.dataset.v; saveUi(); render(); },

    cell: function (el) { openSheet('cell', { d: el.dataset.d, h: el.dataset.h }); },
    'heat-group': function (el) { S.ui.heatGroup = el.dataset.v; S.ui.heatPlace = ''; saveUi(); render(); },
    'only-me': function () { S.ui.onlyMe = !S.ui.onlyMe; saveUi(); render(); },
    focus: function (el) { var n = el.dataset.name; S.ui.focus = has(S.ui.focus, n) ? S.ui.focus.filter(function (x) { return !same(x, n); }) : S.ui.focus.concat([n]); saveUi(); render(); },
    'focus-clear': function () { S.ui.focus = []; saveUi(); render(); },
    'open-person': function (el) { openSheet('person', { name: el.dataset.name }); },
    'open-place': function (el) { openSheet('place', { id: el.dataset.id }); },
    'map-filter': function (el) { S.ui.mapFilter = el.dataset.v; saveUi(); VIEWS.map(); },
    'map-view': function (el) { S.ui.mapView = el.dataset.v; saveUi(); VIEWS.map(); fitMap(el.dataset.v, true); },
    'share-site': function () { share('Join the Th7 board. Add your schedule so we can line up lifts and study sessions.'); },

    'add-event': function (el) {
      S.form = { kind: 'event', tag: 'party', title: '', date: el.dataset.date || today(), time: '', place: '', notes: '' };
      openSheet('newEvent', {}, true);
    },
    'add-spot': function (el) {
      S.form = { kind: 'spot', tag: 'out', title: '', date: el.dataset.date || today(), time: '', place: '', notes: '' };
      openSheet('newEvent', {}, true);
    },
    'send-event': function () {
      var f = S.form, me = meM(); if (!me) return;
      var err = '';
      var title = C.str(f.title, 60);
      if (!title) err = f.kind === 'spot' ? 'Name the spot.' : 'Give it a name.';
      else if (!C.validDate(f.date || '')) err = 'Pick a day.';
      else if (f.date < C.addDays(today(), -1)) err = 'That day already passed.';
      if (err) { var el = $('#ev-err'); if (el) el.textContent = err; return; }
      var e = { id: uid(), kind: f.kind, tag: f.kind === 'spot' ? 'out' : f.tag, date: f.date, time: f.time || '', title: title, place: C.str(f.place, 60), notes: C.str(f.notes, 300), by: me.name };
      closeSheet();
      enqueue('addEvent', { event: e });
      toast(f.kind === 'spot' ? 'Spot suggested. Get the votes.' : 'Added. Tell the group.', 'pts');
      if (S.view !== 'events' && S.view !== 'home') go('events');
    },
    'open-event': function (el) { openSheet('event', { id: el.dataset.id }); },
    eop: function (el) {
      var e = eventById(el.dataset.id); if (!e) return;
      enqueue('eventOp', { id: e.id, op: el.dataset.op, name: S.me });
    },
    'vote-spot': function (el) {
      var e = eventById(el.dataset.id); if (!e) return;
      enqueue('eventOp', { id: e.id, op: has(e.going, S.me) ? 'out' : 'going', name: S.me });
    },
    'cancel-event': function (el) {
      var e = eventById(el.dataset.id); if (!e) return;
      confirmIt({ title: e.kind === 'spot' ? 'Remove ' + e.title + '?' : 'Cancel ' + e.title + '?', body: 'Everyone will see it gone.', yes: e.kind === 'spot' ? 'Remove' : 'Cancel event', no: 'Keep it', danger: true }, function () {
        enqueue('eventOp', { id: e.id, op: 'cancel', name: S.me });
      });
    },
    'share-event': function (el) {
      var e = eventById(el.dataset.id); if (!e) return;
      share(e.title + ', ' + relDay(e.date).toLowerCase() + (e.time ? ' at ' + timeLabel(e.time) : '') + (e.place ? ' (' + e.place + ')' : '') + '. RSVP on the Th7 board:');
    },
    'ev-week': function (el) { S.ui.evWeek = clamp(S.ui.evWeek + +el.dataset.v, -4, 20); saveUi(); render(); },
    period: function (el) { S.ui.period = el.dataset.v; saveUi(); render(); },

    'me-color': function (el) { S.draft.color = el.dataset.v; draftChanged(); rerenderMe(); },
    'me-goal': function (el) { S.draft.goal = +el.dataset.v; draftChanged(); rerenderMe(); },
    'me-place': function (el) { var id = el.dataset.id, a = S.draft.places; S.draft.places = a.indexOf(id) >= 0 ? a.filter(function (x) { return x !== id; }) : a.concat([id]); draftChanged(); rerenderMe(); },
    'me-split': function (el) { var id = el.dataset.id, a = S.draft.splits; S.draft.splits = a.indexOf(id) >= 0 ? a.filter(function (x) { return x !== id; }) : a.concat([id]); draftChanged(); rerenderMe(); },
    'paint-day': function (el) {
      var d = +el.dataset.d, b = S.draft.busy, anyFree = false;
      for (var h = 0; h < PD; h++) if (b[d * PD + h] === '0') anyFree = true;
      for (var h2 = 0; h2 < PD; h2++) b[d * PD + h2] = anyFree ? '1' : '0';
      draftChanged(); rerenderMe();
    },
    'paint-copy': function () {
      var b = S.draft.busy;
      for (var d = 1; d < 5; d++) for (var h = 0; h < PD; h++) b[d * PD + h] = b[h];
      draftChanged(); rerenderMe(); toast('Copied Monday to Tue-Fri');
    },
    'paint-clear': function () {
      confirmIt({ title: 'Clear your whole week?', body: 'All busy blocks come off.', yes: 'Clear it', danger: true }, function () {
        S.draft.busy = ZEROS.split(''); draftChanged(); rerenderMe();
      });
    },
    'me-create': function () {
      var d = S.draft, errEl = $('#join-err');
      var name = C.str(d.name, 24);
      var err = '';
      if (!name) err = 'Add your name first.';
      else if (!C.NAME_RE.test(name)) err = 'Names can use letters, numbers, spaces, dots and dashes.';
      else if (M(name)) err = name + ' is already on the board. Go back and pick it if that is you.';
      else if (!d.places.length) err = 'Pick at least one gym or library.';
      if (err) { if (errEl) errEl.textContent = err; toast(err, 'err'); return; }
      d.name = name;
      var member = draftMember();
      S.blocking = 'Putting you on the board';
      render();
      enqueue('saveMember', { member: member, create: true }, { wait: true }).then(function () {
        S.blocking = ''; S.me = name; store.set('me', name); store.del('draft-new');
        S.gate = null; S.view = 'home'; store.set('view', 'home');
        initDraft(true);
        render(); window.scrollTo(0, 0);
        confetti(200); toast('Welcome to Th7, ' + firstName(name), 'pts', 3600);
      }).catch(function (r) {
        S.blocking = ''; render();
        var e2 = $('#join-err'); if (e2) e2.textContent = (r && r.error) || 'Could not join. Try again.';
      });
    }
  };

  function rerenderMe() {
    if (S.gate === 'new') { var y = window.scrollY; render(); window.scrollTo(0, y); return; }
    var y2 = window.scrollY; VIEWS.me(); window.scrollTo(0, y2); meSync();
  }

  function renameTo(newName) {
    var me = meM(); if (!me) return;
    newName = C.str(newName, 24);
    var input = $('input[data-me="name"]');
    if (!newName || newName === me.name) { if (input) input.value = me.name; S.draft.name = me.name; return; }
    if (!C.NAME_RE.test(newName)) { toast('Names can use letters, numbers, spaces, dots and dashes.', 'err'); if (input) input.value = me.name; S.draft.name = me.name; return; }
    var clash = M(newName);
    if (clash && clash !== me) { toast(clash.name + ' is already taken', 'err'); if (input) input.value = me.name; S.draft.name = me.name; return; }
    if (S.saveTimer) saveDraftNow();
    var old = me.name;
    var m = draftMember(); m.name = newName;
    S.blocking = 'Renaming you everywhere';
    S.me = newName; store.set('me', newName);
    render();
    enqueue('saveMember', { member: m, oldName: old }, { wait: true }).then(function () {
      S.blocking = ''; S.draft.name = newName; render(); toast('You are now ' + newName);
    }).catch(function () {
      S.blocking = ''; S.me = old; store.set('me', old); S.draft.name = old; recompute(); render();
    });
  }

  /* =========================================================
     Events wiring
     ========================================================= */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (el.classList.contains('pc')) return;
    var fn = ACT[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.dataset.form === 'code') {
      e.preventDefault();
      var code = ($('#code-in') || {}).value || '';
      code = code.trim();
      if (!code) return;
      var btn = f.querySelector('button[type=submit]');
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin sm"></span>Checking'; }
      call({ action: 'state', code: code }).then(function (r) {
        if (r.code === 'bad_code') {
          S.gateErr = 'That\'s not it. Ask the group chat.';
          render();
          var c = $('.gate-card'); if (c) { c.classList.add('shake'); }
          var i = $('#code-in'); if (i) i.focus();
          return;
        }
        S.code = code; store.set('code', code); S.gateErr = '';
        setServer(r); recompute();
        S.gate = null; decideGate(); render(); flush();
      }).catch(function () {
        S.gateErr = 'Can\'t reach the board right now. Check your connection and try again.';
        render();
      });
    }
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.dataset.f !== undefined && S.sheet) { if (el.dataset.num === undefined) S.form[el.dataset.f] = el.value; }
    if (el.dataset.me) {
      var k = el.dataset.me;
      if (k === 'motto') { S.draft.motto = el.value; draftChanged(); }
      if (k === 'name' && S.gate === 'new') { S.draft.name = el.value; draftChanged(); var a = $('.me-av'); if (a) a.textContent = initials(el.value || 'You'); }
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset.f !== undefined && S.sheet) {
      S.form[el.dataset.f] = el.dataset.num !== undefined ? +el.value : el.value;
      if (el.dataset.rr !== undefined) renderSheet();
    }
    if (el.dataset.ui) { S.ui[el.dataset.ui] = el.value; if (el.dataset.ui === 'heatPlace' && el.value) S.ui.heatGroup = 'all'; saveUi(); render(); }
    if (el.dataset.me === 'name' && S.gate !== 'new') renameTo(el.value);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && S.sheet) closeSheet();
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.me === 'name' && S.gate !== 'new') e.target.blur();
    var pc = e.target.closest && e.target.closest('.pc');
    if (pc && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      var i = +pc.dataset.i; setPaint(i, S.draft.busy[i] === '1' ? '0' : '1'); draftChanged(); updateBusyCount();
    }
  });

  document.addEventListener('focusout', function () {
    setTimeout(function () { if (S.pendingRender && !isTyping() && !S.painting) render(); }, 60);
  });

  /* ----- painting the busy grid ----- */
  var paint = null;
  function setPaint(i, v) {
    if (!S.draft) return;
    S.draft.busy[i] = v;
    var el = document.querySelector('.pc[data-i="' + i + '"]');
    if (el) el.classList.toggle('on', v === '1');
  }
  function updateBusyCount() {
    var el = $('#busy-count'); if (!el || !S.draft) return;
    el.textContent = plural(S.draft.busy.filter(function (x) { return x === '1'; }).length, 'hr') + ' busy';
  }
  document.addEventListener('pointerdown', function (e) {
    var cell = e.target.closest && e.target.closest('.pc');
    if (!cell || !S.draft) return;
    e.preventDefault();
    var i = +cell.dataset.i;
    var v = S.draft.busy[i] === '1' ? '0' : '1';
    paint = { v: v, last: i, id: e.pointerId };
    S.painting = true;
    setPaint(i, v);
    if (navigator.vibrate) try { navigator.vibrate(5); } catch (err) { /* no-op */ }
  });
  document.addEventListener('pointermove', function (e) {
    if (!paint || e.pointerId !== paint.id) return;
    var t = document.elementFromPoint(e.clientX, e.clientY);
    var c = t && t.closest && t.closest('.pc');
    if (!c) return;
    var i = +c.dataset.i;
    if (i === paint.last) return;
    var a = paint.last, b = i;
    if (Math.floor(a / PD) === Math.floor(b / PD)) {
      var lo = Math.min(a, b), hi = Math.max(a, b);
      for (var k = lo; k <= hi; k++) setPaint(k, paint.v);
    } else setPaint(i, paint.v);
    paint.last = i;
  }, { passive: true });
  function endPaint() {
    if (!paint) return;
    paint = null; S.painting = false;
    updateBusyCount();
    draftChanged();
    if (S.pendingRender) setTimeout(function () { if (!S.painting) render({ soft: true }); }, 50);
  }
  document.addEventListener('pointerup', endPaint);
  document.addEventListener('pointercancel', endPaint);

  /* ----- confetti ----- */
  function confetti(n) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var cv = $('#confetti'); if (!cv) return;
    var ctx = cv.getContext('2d'), W = cv.width = innerWidth * devicePixelRatio, H = cv.height = innerHeight * devicePixelRatio;
    var cols = ['#ff2d55', '#ffffff', '#ffcc4d', '#2fe39a', '#4da3ff', '#c9ced6'];
    var parts = [];
    for (var i = 0; i < n; i++) parts.push({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 18 * devicePixelRatio, vy: (-Math.random() * 16 - 6) * devicePixelRatio, s: (4 + Math.random() * 6) * devicePixelRatio, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length], life: 0 });
    var start = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, W, H);
      var alive = false;
      parts.forEach(function (p) {
        p.vy += 0.5 * devicePixelRatio; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        if (p.y < H + 40) alive = true;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      });
      if (alive && t - start < 4000) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    })(start);
  }

  /* =========================================================
     Demo seed (only when ?demo=seed and no API configured)
     ========================================================= */
  function seedDemo() {
    var db = C.emptyDb(), t = today(), ws = weekStartOf(t), now = new Date().toISOString();
    var ctx = { now: now, today: t };
    var people = [
      ['Ricky', '#ff3b5c', ['rpac', 'nrc', 'thompson', 'l18'], ['push', 'pull', 'legs'], 5, 'Light weight baby'],
      ['Jake', '#2ec4ff', ['rpac', 'crunch', 'thompson'], ['push', 'legs', 'hoops'], 4, ''],
      ['Aidan', '#3ddc97', ['nrc', 'jon', 'l18', 'rcommons'], ['pull', 'upper', 'cardio'], 4, 'No days off'],
      ['Marcus', '#ffd23f', ['pf', 'rpac', 'thompson'], ['fullbody', 'cardio'], 3, ''],
      ['Tyler', '#a66bff', ['jos', 'rpac', 'hsl'], ['legs', 'swim'], 4, ''],
      ['Nick', '#ff8a3d', ['crunch', 'nrc', 'l18'], ['arms', 'push'], 5, 'Arms day is every day'],
      ['Sam', '#00d1c1', ['rpac', 'jos', 'thompson', 'geology'], ['hoops', 'core'], 3, '']
    ];
    people.forEach(function (p, idx) {
      var busy = ZEROS.split('');
      var set = function (d, a, b) { for (var h = a; h < b && h < H1; h++) busy[d * PD + h - H0] = '1'; };
      for (var d = 0; d < 5; d++) {
        var start = 8 + ((idx + d) % 3), len = 3 + ((idx * 3 + d) % 4);
        set(d, start, start + len);
        if ((idx + d) % 2 === 0) set(d, 13, 16);
        if ((idx * 2 + d) % 3 === 0) set(d, 17, 19 + (idx % 2));
        set(d, 6, 7 + (idx % 2));
      }
      set(4, 21, 23); set(5, 6, 10 + (idx % 3)); set(5, 21, 23); set(6, 6, 11);
      if (idx % 3 === 0) set(5, 12, 15);
      if (idx % 2 === 1) set(6, 15, 18);
      C.apply(db, 'saveMember', { member: { name: p[0], color: p[1], busy: busy.join(''), places: p[2], splits: p[3], goal: p[4], motto: p[5] }, create: true }, ctx);
    });
    ['Ricky', 'Jake', 'Aidan', 'Marcus', 'Tyler', 'Nick', 'Sam'].forEach(function (n, i) {
      for (var k = 0; k < 14; k++) { var date = C.addDays(t, -k); if ((k + i) % 3 !== 1 && date <= t) C.apply(db, 'checkin', { name: n, date: date, on: true }, ctx); }
    });
    var mk = function (by, kind, date, hour, place, split, invited, going, done, note) {
      var id = uid();
      C.apply(db, 'propose', { session: { id: id, kind: kind, date: date, hour: hour, dur: 1, place: place, split: split, note: note || '', by: by, invited: invited } }, { now: now, today: C.addDays(t, -7) });
      (going || []).forEach(function (g) { C.apply(db, 'sessionOp', { id: id, op: 'join', name: g }, ctx); });
      (done || []).forEach(function (g) { C.apply(db, 'sessionOp', { id: id, op: 'done', name: g }, ctx); });
    };
    mk('Jake', 'workout', C.addDays(t, -2), 16, 'rpac', 'push', [], ['Ricky'], ['Jake', 'Ricky']);
    mk('Aidan', 'study', C.addDays(t, -1), 19, 'l18', '', ['Ricky'], ['Ricky'], ['Aidan', 'Ricky'], 'FIN 3200');
    mk('Nick', 'workout', C.addDays(t, -3), 7, 'crunch', 'arms', [], ['Jake'], ['Nick', 'Jake']);
    mk('Ricky', 'workout', t, 18, 'rpac', 'legs', ['Jake', 'Tyler'], ['Tyler'], []);
    mk('Marcus', 'workout', C.addDays(t, 1), 7, 'pf', 'fullbody', [], [], []);
    mk('Tyler', 'study', C.addDays(t, 2), 20, 'thompson', '', ['Ricky', 'Sam'], ['Sam'], [], 'Exam cram');
    mk('Sam', 'workout', C.addDays(t, 3), 17, 'jos', 'hoops', [], ['Aidan', 'Nick'], []);
    var ev = function (by, kind, tag, date, time, title, place, notes, going, maybe) {
      var id = uid();
      C.apply(db, 'addEvent', { event: { id: id, kind: kind, tag: tag, date: date, time: time, title: title, place: place, notes: notes, by: by } }, ctx);
      (going || []).forEach(function (g) { C.apply(db, 'eventOp', { id: id, op: 'going', name: g }, ctx); });
      (maybe || []).forEach(function (g) { C.apply(db, 'eventOp', { id: id, op: 'maybe', name: g }, ctx); });
    };
    var sat = C.addDays(ws, 5), fri = C.addDays(ws, 4);
    ev('Nick', 'event', 'party', sat, '21:30', 'Halloween party', 'The house on 15th', 'Costumes required', ['Ricky', 'Jake', 'Aidan', 'Sam'], ['Marcus']);
    ev('Jake', 'event', 'game', sat, '12:00', 'Tailgate + game', 'Lot by the Shoe', '', ['Ricky', 'Tyler'], []);
    ev('Ricky', 'spot', 'out', fri, '', 'Ugly Tuna', '', '', ['Jake', 'Nick', 'Sam'], []);
    ev('Aidan', 'spot', 'out', fri, '', 'Bullwinkles', '', '', ['Tyler'], []);
    ev('Marcus', 'spot', 'out', t, '', 'Leo\'s', '', '', ['Ricky'], []);
    store.set('demo-db', db);
    store.set('code', 'demo');
  }

  /* =========================================================
     Boot
     ========================================================= */
  function boot() {
    if (DEMO && params.get('demo') === 'seed' && !store.get('demo-db', null)) seedDemo();
    if (DEMO && params.get('as')) { S.me = params.get('as'); store.set('me', S.me); }
    if (DEMO) S.code = 'demo';
    recompute();
    decideGate();
    render();
    if (DEMO || S.code) pull().then(function () { decideGate(); render({ soft: true }); flush(); });
    setInterval(function () { if (document.visibilityState === 'visible' && !S.outbox.length && !S.gate) pull(); }, 30000);
    setInterval(function () { if (!S.gate) { render({ soft: true }); if (S.view === 'map') drawMarkers(); } }, 60000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { pull(); flush(); }
      else if (S.saveTimer) saveDraftNow();
    });
    window.addEventListener('pagehide', function () { if (S.saveTimer) saveDraftNow(); });
    window.addEventListener('online', function () { S.online = true; flush(); pull(); });
    window.addEventListener('beforeunload', function (e) {
      if (S.saveTimer) saveDraftNow();
      if (S.outbox.length) { e.preventDefault(); e.returnValue = ''; }
    });
    window.addEventListener('resize', function () { if (map) map.invalidateSize(); });
    window.TH7_DEBUG = { S: S, get DB() { return DB; }, flush: flush, pull: pull };
  }

  boot();
})();
