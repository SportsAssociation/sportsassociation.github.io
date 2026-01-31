/* database.js (v1.2)
   LocalStorage "DB" with migration, invites, lockouts, export/import.
*/

const RRSA_DB = (() => {
  const NS = "rrsa_system_v1_db";
  const nowISO = () => new Date().toISOString();
  const nowMs = () => Date.now();

  function _load() {
    const raw = localStorage.getItem(NS);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function _save(db) { localStorage.setItem(NS, JSON.stringify(db)); }

  function _newId(prefix) {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  function seedFreshV12() {
    const leagues = ["RRSA", "RRFL", "RRBL", "RRHL"];

    const users = [
      { id: _newId("usr"), username: "mrv", password: "rrsa", displayName: "M.R.VR", globalRole: "EXEC_COMMISSIONER", leagueRoles: {}, active: true },
      { id: _newId("usr"), username: "vp_pox", password: "rrsa", displayName: "VP Pox", globalRole: "EXEC_EVP", leagueRoles: {}, active: true },
      { id: _newId("usr"), username: "shark", password: "rrsa", displayName: "CAO Shark", globalRole: "EXEC_CAO", leagueRoles: {}, active: true },
      { id: _newId("usr"), username: "will", password: "rrsa", displayName: "DAO Will", globalRole: "EXEC_DAO", leagueRoles: {}, active: true },

      { id: _newId("usr"), username: "head_media", password: "rrsa", displayName: "Head of RRSA Media", globalRole: "HEAD_RRSA_MEDIA", leagueRoles: {}, active: true },
      { id: _newId("usr"), username: "media_team", password: "rrsa", displayName: "RRSA Media Team", globalRole: "MEDIA_TEAM", leagueRoles: {}, active: true },

      {
        id: _newId("usr"), username: "rrfl_mgr", password: "rrsa", displayName: "RRFL League Manager",
        globalRole: "OFFICIAL", leagueRoles: { RRFL: { role: "LEAGUE_MANAGER", dept: "League" } }, active: true
      },
      {
        id: _newId("usr"), username: "head_refs", password: "rrsa", displayName: "Head of Referees",
        globalRole: "OFFICIAL", leagueRoles: { RRFL: { role: "HEAD_OF_REFEREES", dept: "League" } }, active: true
      },
      {
        id: _newId("usr"), username: "ref_ava", password: "rrsa", displayName: "Ref Ava",
        globalRole: "OFFICIAL", leagueRoles: { RRFL: { role: "OFFICIAL", dept: "Officials" } }, active: true
      }
    ];

    const attEventId = _newId("att");
    const perfId = _newId("perf");

    return {
      _meta: { version: 12, createdAt: nowISO(), updatedAt: nowISO() },
      settings: {
        performanceThreshold: 6.5,
        theme: "dark",
        leagues,
        defaultLeague: "RRFL",
        authPolicy: {
          minLen: 8,
          requireLetter: true,
          requireNumber: true,
          maxFailedAttempts: 5,
          lockMinutes: 10,
          idleTimeoutMinutes: 30,
          absoluteTimeoutHours: 12
        }
      },
      users,
      attendance: [
        {
          id: attEventId,
          eventType: "Game",
          league: "RRFL",
          eventName: "RRFL Week 1 - Match A",
          eventDate: "2026-01-25",
          createdAt: nowISO(),
          createdBy: "mrv",
          marks: [
            { userId: users.find(u => u.username === "ref_ava")?.id, username: "ref_ava", status: "Present", timestamp: nowISO(), note: "" }
          ]
        }
      ],
      performance: [
        {
          id: perfId,
          league: "RRFL",
          subjectUsername: "ref_ava",
          eventRef: "RRFL Week 1 - Match A",
          createdAt: nowISO(),
          createdBy: "head_refs",
          scores: { ruleKnowledge: 8, communication: 7, fairness: 8, consistency: 7, professionalism: 8 },
          comments: "Solid calls. Improve whistle cadence & comms."
        }
      ],
      invites: [],
      audit: [{ id: _newId("aud"), at: nowISO(), actor: "system", action: "seed", details: "Initial seed applied (v1.2)." }],
      auth: { fails: {} }
    };
  }

  function migrateAnyToV12(old) {
    // Supports v1.0, v1.1, v1.2-ish
    const db = structuredClone(old || {});
    db._meta = db._meta || {};
    const v = Number(db._meta.version || 1);

    // If no users, just reset to new seed
    if (!Array.isArray(db.users) || !db.users.length) return seedFreshV12();

    // Ensure core arrays exist
    db.attendance = Array.isArray(db.attendance) ? db.attendance : [];
    db.performance = Array.isArray(db.performance) ? db.performance : [];
    db.invites = Array.isArray(db.invites) ? db.invites : [];
    db.audit = Array.isArray(db.audit) ? db.audit : [];
    db.auth = db.auth || { fails: {} };

    db.settings = db.settings || {};
    db.settings.leagues = db.settings.leagues || ["RRSA", "RRFL", "RRBL", "RRHL"];
    db.settings.defaultLeague = db.settings.defaultLeague || "RRFL";
    db.settings.authPolicy = db.settings.authPolicy || {
      minLen: 8, requireLetter: true, requireNumber: true,
      maxFailedAttempts: 5, lockMinutes: 10, idleTimeoutMinutes: 30, absoluteTimeoutHours: 12
    };

    // Normalize users to v1.2 schema: username lower, active boolean, globalRole + leagueRoles
    const execRoles = ["EXEC_COMMISSIONER","EXEC_EVP","EXEC_CAO","EXEC_DAO","HEAD_RRSA_MEDIA","MEDIA_TEAM"];
    db.users = db.users.map(u => {
      const nu = { ...u };
      nu.username = String(nu.username || "").trim().toLowerCase();
      nu.active = (nu.active !== false);

      // v1.0 might have "role" field; v1.1+ has globalRole
      const role = nu.globalRole || nu.role || "OFFICIAL";
      nu.globalRole = execRoles.includes(role) ? role : (nu.globalRole || "OFFICIAL");

      // leagueRoles
      nu.leagueRoles = nu.leagueRoles || {};
      if (!Object.keys(nu.leagueRoles).length) {
        const league = nu.league || db.settings.defaultLeague || "RRFL";
        nu.leagueRoles[league] = { role: (nu.role || "OFFICIAL"), dept: (nu.dept || "Officials") };
      }

      delete nu.role; // avoid conflicts
      return nu;
    });

    db._meta.version = 12;
    db._meta.updatedAt = nowISO();
    db.audit.unshift({ id: _newId("aud"), at: nowISO(), actor: "system", action: "migrate", details: `Migrated v${v} → v12 schema.` });
    return db;
  }

  function init() {
    const db = _load();
    if (!db) { _save(seedFreshV12()); return; }
    const v = Number(db._meta?.version || 1);
    if (v !== 12) _save(migrateAnyToV12(db));
  }

  function reset() {
    localStorage.removeItem(NS);
    _save(seedFreshV12());
  }

  function getDB() {
    const db = _load();
    if (!db) throw new Error("DB not initialized");
    return db;
  }

  function setDB(db) {
    db._meta = db._meta || {};
    db._meta.updatedAt = nowISO();
    _save(db);
  }

  // Settings
  function getSettings() { return { ...getDB().settings }; }
  function setSetting(key, value) { const db = getDB(); db.settings[key] = value; setDB(db); }
  function listLeagues() { return (getDB().settings.leagues || ["RRSA", "RRFL"]).slice(); }

  // Users
  function listUsers() { return getDB().users.slice(); }
  function getUserByUsername(username) {
    const uname = String(username || "").trim().toLowerCase();
    return getDB().users.find(u => u.username === uname) || null;
  }

  function updateUser(user) {
    const db = getDB();
    const idx = db.users.findIndex(u => u.id === user.id);
    if (idx === -1) throw new Error("User not found");
    db.users[idx] = user;
    setDB(db);
  }

  function _validateUsername(uname) {
    if (!uname || uname.length < 3) throw new Error("Username must be at least 3 characters.");
    if (!/^[a-z0-9_]+$/.test(uname)) throw new Error("Username can only contain a-z, 0-9, underscore.");
  }

  function createUser({ username, password, displayName, globalRole, league, leagueRole, dept }) {
    const db = getDB();
    const uname = String(username || "").trim().toLowerCase();
    _validateUsername(uname);
    if (db.users.some(u => u.username === uname)) throw new Error("Username already exists.");

    const pass = String(password || "");
    if (pass.length < 3) throw new Error("Password too short.");

    const lg = String(league || db.settings.defaultLeague || "RRFL");
    const lr = String(leagueRole || "OFFICIAL");

    const user = {
      id: _newId("usr"),
      username: uname,
      password: pass,
      displayName: String(displayName || uname),
      globalRole: String(globalRole || "OFFICIAL"),
      leagueRoles: { [lg]: { role: lr, dept: String(dept || "Officials") } },
      active: true
    };

    db.users.push(user);
    setDB(db);
    return user;
  }

  function setUserPassword(username, newPassword) {
    const db = getDB();
    const uname = String(username || "").trim().toLowerCase();
    const u = db.users.find(x => x.username === uname);
    if (!u) throw new Error("User not found.");
    u.password = String(newPassword || "");
    setDB(db);
    return true;
  }

  function deleteUserByUsername(username) {
    const db = getDB();
    const uname = String(username || "").trim().toLowerCase();
    const idx = db.users.findIndex(u => u.username === uname);
    if (idx === -1) throw new Error("User not found.");

    const removed = db.users[idx];
    db.users.splice(idx, 1);

    db.attendance.forEach(ev => {
      ev.marks = (ev.marks || []).filter(m => String(m.username).toLowerCase() !== uname);
    });
    db.performance = db.performance.filter(r => String(r.subjectUsername).toLowerCase() !== uname);

    setDB(db);
    return removed;
  }

  // Attendance/Performance
  function addAttendanceEvent(event) { const db = getDB(); db.attendance.unshift(event); setDB(db); }
  function listAttendance() { return (getDB().attendance || []).slice(); }
  function addPerformanceReview(review) { const db = getDB(); db.performance.unshift(review); setDB(db); }
  function listPerformance() { return (getDB().performance || []).slice(); }

  // Audit
  function audit(actor, action, details) {
    const db = getDB();
    db.audit = db.audit || [];
    db.audit.unshift({ id: _newId("aud"), at: nowISO(), actor, action, details });
    setDB(db);
  }
  function listAudit() { return (getDB().audit || []).slice(); }

  // Invites
  function _makeInviteCode() {
    const body = Math.random().toString(36).slice(2, 10).toUpperCase();
    return `RRSA-${body}`;
  }
  function listInvites() { return (getDB().invites || []).slice(); }

  function createInvite({ league, leagueRole, dept, createdBy, maxUses, expiresAt, note }) {
    const db = getDB();
    const inv = {
      id: _newId("inv"),
      code: _makeInviteCode(),
      league: String(league || db.settings.defaultLeague || "RRFL"),
      leagueRole: String(leagueRole || "OFFICIAL"),
      dept: String(dept || "Officials"),
      createdAt: nowISO(),
      createdBy: String(createdBy || "mrv"),
      expiresAt: expiresAt ? String(expiresAt) : null,
      maxUses: Number.isFinite(Number(maxUses)) ? Math.max(1, Math.floor(Number(maxUses))) : 1,
      uses: 0,
      active: true,
      note: String(note || "").trim()
    };
    db.invites.unshift(inv);
    setDB(db);
    return inv;
  }

  function revokeInvite(code) {
    const db = getDB();
    const c = String(code || "").trim().toUpperCase();
    const inv = (db.invites || []).find(i => String(i.code).toUpperCase() === c);
    if (!inv) throw new Error("Invite not found.");
    inv.active = false;
    setDB(db);
    return true;
  }

  function _isExpired(inv) {
    if (!inv.expiresAt) return false;
    const d = new Date(inv.expiresAt);
    if (Number.isNaN(d.getTime())) return false;
    return Date.now() > d.getTime();
  }

  function redeemInvite({ code, username, password, displayName }) {
    const db = getDB();
    const c = String(code || "").trim().toUpperCase();
    const inv = (db.invites || []).find(i => String(i.code).toUpperCase() === c);
    if (!inv) throw new Error("Invalid invite code.");
    if (!inv.active) throw new Error("Invite is inactive/revoked.");
    if (_isExpired(inv)) throw new Error("Invite has expired.");
    if (inv.uses >= inv.maxUses) throw new Error("Invite has no remaining uses.");

    const uname = String(username || "").trim().toLowerCase();
    _validateUsername(uname);
    if ((db.users || []).some(u => u.username === uname)) throw new Error("Username already exists.");

    const user = {
      id: _newId("usr"),
      username: uname,
      password: String(password || ""),
      displayName: String(displayName || uname),
      globalRole: "OFFICIAL",
      leagueRoles: { [inv.league]: { role: inv.leagueRole, dept: inv.dept } },
      active: true
    };

    db.users.push(user);
    inv.uses += 1;
    if (inv.uses >= inv.maxUses) inv.active = false;

    setDB(db);
    return user;
  }

  // Lockouts
  function getLockout(username) {
    const db = getDB();
    const uname = String(username || "").trim().toLowerCase();
    const rec = db.auth?.fails?.[uname];
    if (!rec) return { locked: false, lockedUntilMs: 0, count: 0 };
    const locked = Number(rec.lockedUntilMs || 0) > nowMs();
    return { locked, lockedUntilMs: Number(rec.lockedUntilMs || 0), count: Number(rec.count || 0) };
  }

  function recordLoginFail(username) {
    const db = getDB();
    db.auth = db.auth || { fails: {} };
    const uname = String(username || "").trim().toLowerCase();
    const rec = db.auth.fails[uname] || { count: 0, lastAtISO: null, lockedUntilMs: 0 };

    rec.count += 1;
    rec.lastAtISO = nowISO();

    const p = db.settings.authPolicy || {};
    const max = Number(p.maxFailedAttempts || 5);
    const lockMinutes = Number(p.lockMinutes || 10);

    if (rec.count >= max) {
      rec.lockedUntilMs = nowMs() + lockMinutes * 60 * 1000;
      rec.count = 0;
    }

    db.auth.fails[uname] = rec;
    setDB(db);
    return getLockout(uname);
  }

  function clearLoginFail(username) {
    const db = getDB();
    const uname = String(username || "").trim().toLowerCase();
    if (db.auth?.fails?.[uname]) {
      delete db.auth.fails[uname];
      setDB(db);
    }
  }

  // Export/Import
  function exportDB() { return getDB(); }

  function importDB(obj) {
    if (!obj || typeof obj !== "object") throw new Error("Invalid JSON.");
    if (!obj._meta || !obj._meta.version) throw new Error("Missing _meta.version.");
    if (Number(obj._meta.version) !== 12) throw new Error("Unsupported DB version. Expected v1.2 (12).");
    if (!Array.isArray(obj.users)) throw new Error("Invalid users.");
    if (!Array.isArray(obj.attendance)) throw new Error("Invalid attendance.");
    if (!Array.isArray(obj.performance)) throw new Error("Invalid performance.");

    obj._meta.updatedAt = nowISO();
    obj.settings = obj.settings || {};
    obj.settings.leagues = obj.settings.leagues || ["RRSA", "RRFL"];
    obj.settings.authPolicy = obj.settings.authPolicy || {
      minLen: 8, requireLetter: true, requireNumber: true,
      maxFailedAttempts: 5, lockMinutes: 10, idleTimeoutMinutes: 30, absoluteTimeoutHours: 12
    };
    obj.auth = obj.auth || { fails: {} };
    obj.invites = obj.invites || [];
    obj.audit = obj.audit || [];

    _save(obj);
    return true;
  }

  function makeId(prefix) { return _newId(prefix); }
  function isoNow() { return nowISO(); }

  return {
    init, reset,
    getDB, setDB,
    getSettings, setSetting, listLeagues,

    listUsers, getUserByUsername, updateUser,
    createUser, setUserPassword, deleteUserByUsername,

    addAttendanceEvent, listAttendance,
    addPerformanceReview, listPerformance,

    audit, listAudit,
    listInvites, createInvite, revokeInvite, redeemInvite,

    getLockout, recordLoginFail, clearLoginFail,

    exportDB, importDB,
    makeId, isoNow
  };
})();
