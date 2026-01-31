/* auth.js (v1.2)
   - Lockouts
   - Password policy helper
   - Session timeout (idle + absolute)
*/

const RRSA_AUTH = (() => {
  const SESSION_KEY = "rrsa_session_v1";

  function _getSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function _setSession(sess) { localStorage.setItem(SESSION_KEY, JSON.stringify(sess)); }
  function _clearSession() { localStorage.removeItem(SESSION_KEY); }

  function _policy() {
    const s = RRSA_DB.getSettings();
    return s.authPolicy || {
      minLen: 8, requireLetter: true, requireNumber: true,
      maxFailedAttempts: 5, lockMinutes: 10, idleTimeoutMinutes: 30, absoluteTimeoutHours: 12
    };
  }

  function validatePassword(pw) {
    const p = _policy();
    const s = String(pw || "");
    if (s.length < Number(p.minLen || 8)) return { ok: false, message: `Password must be at least ${p.minLen} characters.` };
    if (p.requireLetter && !/[A-Za-z]/.test(s)) return { ok: false, message: "Password must include a letter." };
    if (p.requireNumber && !/[0-9]/.test(s)) return { ok: false, message: "Password must include a number." };
    return { ok: true };
  }

  function isSessionExpired(sess) {
    const p = _policy();
    const createdAt = Number(sess.createdAtMs || 0);
    const lastActive = Number(sess.lastActiveMs || createdAt || 0);
    if (!createdAt) return false;

    const absMs = Number(p.absoluteTimeoutHours || 12) * 60 * 60 * 1000;
    const idleMs = Number(p.idleTimeoutMinutes || 30) * 60 * 1000;

    const now = Date.now();
    return (now - createdAt > absMs) || (now - lastActive > idleMs);
  }

  function isLoggedIn() {
    const s = _getSession();
    if (!s) return false;
    if (isSessionExpired(s)) { _clearSession(); return false; }
    const user = RRSA_DB.getUserByUsername(s.username);
    return !!user && user.active === true;
  }

  function currentUser() {
    const s = _getSession();
    if (!s) return null;
    if (isSessionExpired(s)) { _clearSession(); return null; }
    const user = RRSA_DB.getUserByUsername(s.username);
    if (!user || !user.active) return null;
    return user;
  }

  function touchActivity() {
    const s = _getSession();
    if (!s) return;
    s.lastActiveMs = Date.now();
    _setSession(s);
  }

  function login(username, password) {
    const uname = String(username || "").trim().toLowerCase();

    const lock = RRSA_DB.getLockout(uname);
    if (lock.locked) {
      const until = new Date(lock.lockedUntilMs).toISOString();
      return { ok: false, message: `Account locked due to failed attempts. Try again after ${until}.` };
    }

    const user = RRSA_DB.getUserByUsername(uname);
    if (!user) {
      RRSA_DB.recordLoginFail(uname);
      return { ok: false, message: "Invalid username or password." };
    }
    if (!user.active) return { ok: false, message: "Account disabled." };

    if (String(user.password) !== String(password)) {
      const st = RRSA_DB.recordLoginFail(uname);
      if (st.locked) {
        const until = new Date(st.lockedUntilMs).toISOString();
        return { ok: false, message: `Too many attempts. Locked until ${until}.` };
      }
      return { ok: false, message: "Invalid username or password." };
    }

    RRSA_DB.clearLoginFail(uname);
    const now = Date.now();
    _setSession({ username: uname, at: RRSA_DB.isoNow(), createdAtMs: now, lastActiveMs: now });
    RRSA_DB.audit(uname, "login", "User logged in.");
    return { ok: true };
  }

  function logout() {
    const u = currentUser();
    if (u) RRSA_DB.audit(u.username, "logout", "User logged out.");
    _clearSession();
  }

  function applyThemeFromStorage() {
    const s = RRSA_DB.getSettings();
    document.documentElement.setAttribute("data-theme", s.theme === "light" ? "light" : "dark");
  }

  function toggleTheme() {
    const s = RRSA_DB.getSettings();
    const next = (s.theme === "light") ? "dark" : "light";
    RRSA_DB.setSetting("theme", next);
    applyThemeFromStorage();
  }

  return {
    isLoggedIn,
    currentUser,
    login,
    logout,
    touchActivity,
    validatePassword,
    applyThemeFromStorage,
    toggleTheme
  };
})();
