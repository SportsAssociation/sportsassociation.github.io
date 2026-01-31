/* dashboard.js (v1.2)
   - League + Individual analytics (canvas charts)
   - History views for attendance & performance
   - CEO tools: invites, user create/delete, DB transfer
*/

(() => {
  const PAGES = {
    HOME: "home",
    ANALYTICS: "analytics",
    OFFICIALS: "officials",
    ATTENDANCE: "attendance",
    PERFORMANCE: "performance",
    INVITES: "invites",
    SETTINGS: "settings",
    AUDIT: "audit"
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
  const fmtDate = (iso) => {
    try { const d = new Date(iso); if (Number.isNaN(d.getTime())) return String(iso||""); return d.toISOString().slice(0,10); }
    catch { return String(iso||""); }
  };

  let user = null;
  let leagueCtx = null;

  function getLeagueCtx() {
    const s = RRSA_DB.getSettings();
    const sess = localStorage.getItem("rrsa_league_ctx_v12");
    return sess || s.defaultLeague || "RRFL";
  }
  function setLeagueCtx(lg) {
    leagueCtx = lg;
    localStorage.setItem("rrsa_league_ctx_v12", lg);
  }

  function userLeagues(u) {
    const all = RRSA_DB.listLeagues();
    if (RRSA_ROLES.isExec(u)) return all;
    const keys = Object.keys(u.leagueRoles || {});
    return keys.length ? keys : [RRSA_DB.getSettings().defaultLeague || "RRFL"];
  }

  function isExec() { return RRSA_ROLES.isExec(user); }
  function can(perm, league = null) { return RRSA_ROLES.hasPerm(user, perm, league); }

  function route() {
    const h = (location.hash || "").replace("#", "").trim();
    return h || PAGES.HOME;
  }
  function go(page) { location.hash = `#${page}`; }

  // ---- scope data ----
  function leagueOfficials(lg) {
    const users = RRSA_DB.listUsers().filter(u => u.active !== false);
    if (isExec()) return users;
    return users.filter(u => (u.leagueRoles || {})[lg]);
  }

  function attendanceForLeague(lg) {
    return RRSA_DB.listAttendance().filter(ev => String(ev.league || "") === String(lg));
  }

  function performanceForLeague(lg) {
    return RRSA_DB.listPerformance().filter(r => String(r.league || "") === String(lg));
  }

  function myLeagueRole(lg) {
    return (user.leagueRoles || {})[lg]?.role || "OFFICIAL";
  }

  function computeAttendanceStats(username, lg) {
    const evs = attendanceForLeague(lg);
    let total = 0;
    const counts = { "Present": 0, "Late": 0, "Excused": 0, "No-Show": 0 };

    evs.forEach(ev => {
      const m = (ev.marks || []).find(x => String(x.username).toLowerCase() === String(username).toLowerCase());
      if (!m) return;
      total += 1;
      if (counts[m.status] !== undefined) counts[m.status] += 1;
    });

    const presentish = counts["Present"] + counts["Late"] + counts["Excused"];
    const pct = total === 0 ? null : Math.round((presentish / total) * 1000) / 10;
    return { total, counts, pct };
  }

  function reviewAvg(r) {
    const s = r.scores || {};
    const vals = [s.ruleKnowledge, s.communication, s.fairness, s.consistency, s.professionalism]
      .map(Number).filter(n => Number.isFinite(n));
    if (!vals.length) return null;
    return vals.reduce((a,b)=>a+b,0)/vals.length;
  }

  function computePerfAvg(username, lg) {
    const revs = performanceForLeague(lg).filter(r => String(r.subjectUsername).toLowerCase() === String(username).toLowerCase());
    if (!revs.length) return null;
    const avgs = revs.map(reviewAvg).filter(v => v !== null);
    if (!avgs.length) return null;
    return Math.round((avgs.reduce((a,b)=>a+b,0)/avgs.length)*10)/10;
  }

  function performanceTrendByMonth(username, lg) {
    const revs = performanceForLeague(lg)
      .filter(r => String(r.subjectUsername).toLowerCase() === String(username).toLowerCase())
      .map(r => ({ at: r.createdAt, avg: reviewAvg(r) }))
      .filter(x => x.avg !== null);

    const map = new Map(); // YYYY-MM -> {sum,count}
    revs.forEach(x => {
      const k = String(x.at || "").slice(0,7); // YYYY-MM
      if (!k || k.length < 7) return;
      const cur = map.get(k) || { sum: 0, count: 0 };
      cur.sum += x.avg;
      cur.count += 1;
      map.set(k, cur);
    });

    const keys = Array.from(map.keys()).sort();
    const labels = keys.map(k => k);
    const values = keys.map(k => {
      const v = map.get(k);
      return v.count ? Math.round((v.sum/v.count)*10)/10 : 0;
    });
    return { labels, values };
  }

  function leagueAttendanceDistribution(lg) {
    const evs = attendanceForLeague(lg);
    const counts = { "Present": 0, "Late": 0, "Excused": 0, "No-Show": 0 };
    evs.forEach(ev => (ev.marks || []).forEach(m => {
      if (counts[m.status] !== undefined) counts[m.status] += 1;
    }));
    return counts;
  }

  function leaguePerfDistribution(lg) {
    const revs = performanceForLeague(lg).map(reviewAvg).filter(v => v !== null);
    // buckets 1-10 into 5 buckets
    const buckets = [0,0,0,0,0]; // 1-2,3-4,5-6,7-8,9-10
    revs.forEach(v => {
      if (v <= 2) buckets[0]++; else if (v <= 4) buckets[1]++; else if (v <= 6) buckets[2]++; else if (v <= 8) buckets[3]++; else buckets[4]++;
    });
    return { labels: ["1-2","3-4","5-6","7-8","9-10"], values: buckets };
  }

  // ---- UI ----
  function mountNav() {
    const nav = $("#sidebarNav");
    if (!nav) return;

    const items = [];
    items.push({ key: PAGES.HOME, label: "Dashboard" });
    items.push({ key: PAGES.ANALYTICS, label: "Analytics" });

    // League ops visible to managers + officials (officials self-only)
    items.push({ key: PAGES.ATTENDANCE, label: "Attendance" });
    items.push({ key: PAGES.PERFORMANCE, label: "Performance" });
    items.push({ key: PAGES.OFFICIALS, label: "Officials" });

    // CEO/exec pages
    if (can(RRSA_ROLES.PERM.MANAGE_USERS_FULL)) items.push({ key: PAGES.INVITES, label: "Invites" });
    if (can(RRSA_ROLES.PERM.CONFIGURE_SYSTEM)) items.push({ key: PAGES.SETTINGS, label: "Settings" });
    if (can(RRSA_ROLES.PERM.VIEW_AUDIT)) items.push({ key: PAGES.AUDIT, label: "Audit Log" });

    nav.innerHTML = items.map(it => `<button class="nav-item" data-page="${it.key}" type="button">${esc(it.label)}</button>`).join("");
    nav.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-page]");
      if (!btn) return;
      go(btn.getAttribute("data-page"));
    });

    highlightNav(route());
  }

  function highlightNav(page) {
    const nav = $("#sidebarNav");
    if (!nav) return;
    $$("[data-page]", nav).forEach(b => b.classList.toggle("active", b.getAttribute("data-page") === page));
  }

  function setTopbar() {
    const ul = $("#userLabel");
    if (ul) ul.textContent = user ? `${user.displayName} (@${user.username})` : "";

    const logoutBtn = $("#logoutBtn");
    if (logoutBtn) logoutBtn.onclick = () => { RRSA_AUTH.logout(); location.replace("login.html"); };

    const themeBtn = $("#themeBtn");
    if (themeBtn) themeBtn.onclick = () => RRSA_AUTH.toggleTheme();

    const leagueSel = $("#leagueCtx");
    if (leagueSel) {
      const leagues = userLeagues(user);
      leagueSel.innerHTML = leagues.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join("");

      const stored = getLeagueCtx();
      if (leagues.includes(stored)) { leagueSel.value = stored; setLeagueCtx(stored); }
      else { leagueSel.value = leagues[0]; setLeagueCtx(leagues[0]); }

      leagueSel.onchange = () => {
        setLeagueCtx(leagueSel.value);
        mountNav();
        render(route());
      };
    }

    const csvBtn = $("#exportCsvBtn");
    if (csvBtn) {
      const canExport = can(RRSA_ROLES.PERM.EXPORT_CSV, leagueCtx) || can(RRSA_ROLES.PERM.EXPORT_CSV);
      csvBtn.classList.toggle("hidden", !canExport);
      csvBtn.onclick = () => exportLeagueCsv(leagueCtx);
    }
  }

  function enforceSessionActivity() {
    ["click","keydown","mousemove","scroll","touchstart"].forEach(ev =>
      window.addEventListener(ev, () => RRSA_AUTH.touchActivity(), { passive: true })
    );
    setInterval(() => {
      if (!RRSA_AUTH.isLoggedIn()) location.replace("login.html");
    }, 15000);
  }

  function render(page) {
    highlightNav(page);
    const view = $("#view");
    if (!view) return;

    switch (page) {
      case PAGES.HOME: view.innerHTML = renderHome(); wireHome(view); break;
      case PAGES.ANALYTICS: view.innerHTML = renderAnalytics(); wireAnalytics(view); break;
      case PAGES.OFFICIALS: view.innerHTML = renderOfficials(); wireOfficials(view); break;
      case PAGES.ATTENDANCE: view.innerHTML = renderAttendance(); wireAttendance(view); break;
      case PAGES.PERFORMANCE: view.innerHTML = renderPerformance(); wirePerformance(view); break;
      case PAGES.INVITES: view.innerHTML = renderInvites(); wireInvites(view); break;
      case PAGES.SETTINGS: view.innerHTML = renderSettings(); wireSettings(view); break;
      case PAGES.AUDIT: view.innerHTML = renderAudit(); wireAudit(view); break;
      default: view.innerHTML = renderHome(); wireHome(view); break;
    }
  }

  // ---------------- HOME ----------------
  function renderHome() {
    const lg = leagueCtx;
    const users = leagueOfficials(lg);
    const attEvs = attendanceForLeague(lg);
    const perfRevs = performanceForLeague(lg);

    const s = RRSA_DB.getSettings();
    const thr = Number(s.performanceThreshold || 6.5);

    const alerts = users
      .map(u => ({ u, avg: computePerfAvg(u.username, lg) }))
      .filter(x => x.avg !== null && x.avg < thr)
      .sort((a,b)=>a.avg-b.avg)
      .slice(0, 10);

    const myAtt = computeAttendanceStats(user.username, lg);
    const myAvg = computePerfAvg(user.username, lg);

    return `
      <div class="page">
        <div class="page-head">
          <h1>Dashboard</h1>
          <div class="muted">League Context: <b>${esc(lg)}</b></div>
        </div>

        <div class="grid-3">
          <div class="card">
            <div class="card-title">Officials</div>
            <div class="big">${users.length}</div>
            <div class="muted tiny">Active accounts in scope</div>
          </div>

          <div class="card">
            <div class="card-title">Attendance Events</div>
            <div class="big">${attEvs.length}</div>
            <div class="muted tiny">Events recorded for ${esc(lg)}</div>
          </div>

          <div class="card">
            <div class="card-title">Performance Reviews</div>
            <div class="big">${perfRevs.length}</div>
            <div class="muted tiny">Reviews recorded for ${esc(lg)}</div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-title">League Attendance Mix</div>
            <canvas id="chart_league_att" class="chart"></canvas>
          </div>
          <div class="card">
            <div class="card-title">League Performance Distribution</div>
            <canvas id="chart_league_perf" class="chart"></canvas>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Problem Alerts</div>
          ${alerts.length ? `
            <div class="table">
              <div class="tr th" style="grid-template-columns: 2fr 1fr 1fr;">
                <div>Official</div><div>Avg Score</div><div>Attendance %</div>
              </div>
              ${alerts.map(x => {
                const a = computeAttendanceStats(x.u.username, lg).pct;
                return `
                  <div class="tr" style="grid-template-columns: 2fr 1fr 1fr;">
                    <div><b>${esc(x.u.displayName)}</b> <span class="muted tiny">@${esc(x.u.username)}</span></div>
                    <div><span class="pill danger">${esc(x.avg.toFixed(1))}</span></div>
                    <div>${a ?? "—"}</div>
                  </div>
                `;
              }).join("")}
            </div>
          ` : `<div class="muted">No officials below threshold (${thr}).</div>`}
        </div>

        <div class="card">
          <div class="card-title">Your Snapshot</div>
          <div class="mini-row">
            <div class="kv"><div class="k">League Role</div><div class="v">${esc(myLeagueRole(lg))}</div></div>
            <div class="kv"><div class="k">Attendance %</div><div class="v">${myAtt.pct ?? "—"}</div></div>
            <div class="kv"><div class="k">Avg Performance</div><div class="v">${myAvg ?? "—"}</div></div>
          </div>
          <div class="divider"></div>
          <div class="grid-2">
            <div>
              <div class="muted tiny" style="margin-bottom:8px">Your Attendance Mix</div>
              <canvas id="chart_me_att" class="chart"></canvas>
            </div>
            <div>
              <div class="muted tiny" style="margin-bottom:8px">Your Performance Trend</div>
              <canvas id="chart_me_perf" class="chart"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function wireHome(root) {
    const lg = leagueCtx;

    // League attendance donut
    const dist = leagueAttendanceDistribution(lg);
    const donut = $("#chart_league_att", root);
    if (donut) {
      RRSA_CHARTS.donut(donut, [
        { label:"Present", value: dist["Present"], colorKey:"success" },
        { label:"Late", value: dist["Late"], colorKey:"warning" },
        { label:"Excused", value: dist["Excused"], colorKey:"info" },
        { label:"No-Show", value: dist["No-Show"], colorKey:"danger" },
      ], { title: "Attendance Statuses", centerText: String(dist["Present"] + dist["Late"] + dist["Excused"] + dist["No-Show"]) });
    }

    // League performance distribution bar
    const perf = leaguePerfDistribution(lg);
    const bar = $("#chart_league_perf", root);
    if (bar) RRSA_CHARTS.bar(bar, perf.labels, perf.values, { title: "Review Avg Buckets" });

    // My attendance donut
    const myAtt = computeAttendanceStats(user.username, lg);
    const myDonut = $("#chart_me_att", root);
    if (myDonut) {
      const c = myAtt.counts;
      RRSA_CHARTS.donut(myDonut, [
        { label:"Present", value: c["Present"], colorKey:"success" },
        { label:"Late", value: c["Late"], colorKey:"warning" },
        { label:"Excused", value: c["Excused"], colorKey:"info" },
        { label:"No-Show", value: c["No-Show"], colorKey:"danger" },
      ], { title: "My Attendance", centerText: myAtt.pct === null ? "—" : `${myAtt.pct}%` });
    }

    // My performance trend
    const trend = performanceTrendByMonth(user.username, lg);
    const line = $("#chart_me_perf", root);
    if (line) RRSA_CHARTS.line(line, trend.labels, trend.values, { title: "My Avg by Month" });
  }

  // ---------------- ANALYTICS ----------------
  function renderAnalytics() {
    const lg = leagueCtx;
    const canViewAll = can(RRSA_ROLES.PERM.VIEW_ALL_RECORDS, lg) || isExec();
    const roster = leagueOfficials(lg);

    const subjectOptions = (canViewAll ? roster : roster.filter(u => u.username === user.username))
      .map(u => `<option value="${esc(u.username)}">${esc(u.displayName)} (@${esc(u.username)})</option>`)
      .join("");

    return `
      <div class="page">
        <div class="page-head">
          <h1>Analytics</h1>
          <div class="muted">League Context: <b>${esc(lg)}</b></div>
        </div>

        <div class="card">
          <div class="card-title">Individual Analytics</div>
          <div class="mini-row" style="gap:10px; align-items:flex-end">
            <div class="field" style="flex:1">
              <label>Official</label>
              <select id="an_subject">${subjectOptions}</select>
            </div>
            <button id="an_run" class="btn" type="button">Load</button>
          </div>

          <div class="divider"></div>

          <div class="grid-2">
            <div>
              <div class="muted tiny" style="margin-bottom:8px">Attendance Mix</div>
              <canvas id="an_att" class="chart"></canvas>
            </div>
            <div>
              <div class="muted tiny" style="margin-bottom:8px">Performance Trend</div>
              <canvas id="an_perf" class="chart"></canvas>
            </div>
          </div>

          <div class="divider"></div>

          <div class="card" style="margin:0; padding:12px; background: var(--panel-alt); border-color: var(--border);">
            <div class="mini-row">
              <div class="kv"><div class="k">Attendance %</div><div id="an_pct" class="v">—</div></div>
              <div class="kv"><div class="k">Avg Performance</div><div id="an_avg" class="v">—</div></div>
              <div class="kv"><div class="k">Marks/Reviews</div><div id="an_counts" class="v">—</div></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">League Analytics</div>
          <div class="grid-2">
            <div>
              <div class="muted tiny" style="margin-bottom:8px">Attendance Mix</div>
              <canvas id="an_league_att" class="chart"></canvas>
            </div>
            <div>
              <div class="muted tiny" style="margin-bottom:8px">Performance Distribution</div>
              <canvas id="an_league_perf" class="chart"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function wireAnalytics(root) {
    const lg = leagueCtx;

    // League charts
    const dist = leagueAttendanceDistribution(lg);
    const perf = leaguePerfDistribution(lg);

    const la = $("#an_league_att", root);
    if (la) RRSA_CHARTS.donut(la, [
      { label:"Present", value: dist["Present"], colorKey:"success" },
      { label:"Late", value: dist["Late"], colorKey:"warning" },
      { label:"Excused", value: dist["Excused"], colorKey:"info" },
      { label:"No-Show", value: dist["No-Show"], colorKey:"danger" },
    ], { title: "League Attendance", centerText: String(dist["Present"] + dist["Late"] + dist["Excused"] + dist["No-Show"]) });

    const lp = $("#an_league_perf", root);
    if (lp) RRSA_CHARTS.bar(lp, perf.labels, perf.values, { title: "League Review Buckets" });

    function run() {
      const uname = $("#an_subject", root).value;
      const att = computeAttendanceStats(uname, lg);
      const avg = computePerfAvg(uname, lg);
      const tr = performanceTrendByMonth(uname, lg);

      const c = att.counts;
      RRSA_CHARTS.donut($("#an_att", root), [
        { label:"Present", value: c["Present"], colorKey:"success" },
        { label:"Late", value: c["Late"], colorKey:"warning" },
        { label:"Excused", value: c["Excused"], colorKey:"info" },
        { label:"No-Show", value: c["No-Show"], colorKey:"danger" },
      ], { title: "Attendance", centerText: att.pct === null ? "—" : `${att.pct}%` });

      RRSA_CHARTS.line($("#an_perf", root), tr.labels, tr.values, { title: "Avg Score by Month" });

      $("#an_pct", root).textContent = att.pct === null ? "—" : `${att.pct}%`;
      $("#an_avg", root).textContent = avg === null ? "—" : String(avg);
      $("#an_counts", root).textContent = `${att.total} marks / ${performanceForLeague(lg).filter(r => String(r.subjectUsername).toLowerCase() === uname).length} reviews`;
    }

    $("#an_run", root).onclick = run;
    run();
  }

  // ---------------- OFFICIALS ----------------
  function renderOfficials() {
    const lg = leagueCtx;
    const canViewAll = can(RRSA_ROLES.PERM.VIEW_ALL_RECORDS, lg) || isExec();
    const canManage = can(RRSA_ROLES.PERM.MANAGE_USERS, lg) || can(RRSA_ROLES.PERM.MANAGE_USERS_FULL);

    const users = leagueOfficials(lg);
    const visible = canViewAll ? users : users.filter(u => u.username === user.username);

    return `
      <div class="page">
        <div class="page-head">
          <h1>Officials</h1>
          <div class="muted">League Context: <b>${esc(lg)}</b></div>
        </div>

        <div class="card">
          <div class="card-title">Search & Filter</div>
          <div class="mini-row" style="gap:10px; align-items:flex-end">
            <div class="field" style="flex:1">
              <label>Search</label>
              <input id="offSearch" type="text" placeholder="name or username" />
            </div>
            <div class="field">
              <label>Status</label>
              <select id="offStatus">
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Roster</div>
          <div class="table" id="offTable">
            <div class="tr th" style="grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1.2fr;">
              <div>Official</div><div>Role</div><div>Dept</div><div>Attendance %</div><div>Avg Score</div><div>Actions</div>
            </div>
            ${visible.map(u => {
              const role = (u.leagueRoles || {})[lg]?.role || "—";
              const dept = (u.leagueRoles || {})[lg]?.dept || "—";
              const att = computeAttendanceStats(u.username, lg).pct;
              const avg = computePerfAvg(u.username, lg);
              return `
                <div class="tr" style="grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1.2fr;">
                  <div>
                    <b>${esc(u.displayName)}</b> <span class="muted tiny">@${esc(u.username)}</span>
                    ${u.active === false ? `<span class="pill danger" style="margin-left:8px">Disabled</span>` : ``}
                  </div>
                  <div>${esc(role)}</div>
                  <div>${esc(dept)}</div>
                  <div>${att ?? "—"}</div>
                  <div>${avg ?? "—"}</div>
                  <div>
                    <button class="btn xs ghost" data-act="view" data-username="${esc(u.username)}" type="button">View</button>
                    ${canManage ? `
                      <button class="btn xs ghost" data-act="edit" data-username="${esc(u.username)}" type="button">Edit</button>
                      <button class="btn xs ${u.active===false?"":"ghost"}" data-act="toggle" data-username="${esc(u.username)}" type="button">
                        ${u.active===false?"Enable":"Disable"}
                      </button>
                    ` : ``}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <div id="modalHost"></div>
      </div>
    `;
  }

  function wireOfficials(root) {
    const lg = leagueCtx;
    const canViewAll = can(RRSA_ROLES.PERM.VIEW_ALL_RECORDS, lg) || isExec();
    const canManage = can(RRSA_ROLES.PERM.MANAGE_USERS, lg) || can(RRSA_ROLES.PERM.MANAGE_USERS_FULL);

    const allUsers = leagueOfficials(lg);
    const visibleBase = canViewAll ? allUsers : allUsers.filter(u => u.username === user.username);

    const table = $("#offTable", root);
    const search = $("#offSearch", root);
    const stSel = $("#offStatus", root);

    function renderRows() {
      let users = visibleBase.slice();
      const q = String(search?.value || "").trim().toLowerCase();
      const stF = String(stSel?.value || "");

      users = users.filter(u => {
        const matchQ = !q || u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
        const matchSt = !stF || (stF === "active" ? u.active !== false : u.active === false);
        return matchQ && matchSt;
      });

      const header = table.querySelector(".tr.th");
      table.innerHTML = "";
      table.appendChild(header);

      users.forEach(u => {
        const role = (u.leagueRoles || {})[lg]?.role || "—";
        const dept = (u.leagueRoles || {})[lg]?.dept || "—";
        const att = computeAttendanceStats(u.username, lg).pct;
        const avg = computePerfAvg(u.username, lg);
        table.insertAdjacentHTML("beforeend", `
          <div class="tr" style="grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1.2fr;">
            <div>
              <b>${esc(u.displayName)}</b> <span class="muted tiny">@${esc(u.username)}</span>
              ${u.active === false ? `<span class="pill danger" style="margin-left:8px">Disabled</span>` : ``}
            </div>
            <div>${esc(role)}</div>
            <div>${esc(dept)}</div>
            <div>${att ?? "—"}</div>
            <div>${avg ?? "—"}</div>
            <div>
              <button class="btn xs ghost" data-act="view" data-username="${esc(u.username)}" type="button">View</button>
              ${canManage ? `
                <button class="btn xs ghost" data-act="edit" data-username="${esc(u.username)}" type="button">Edit</button>
                <button class="btn xs ${u.active===false?"":"ghost"}" data-act="toggle" data-username="${esc(u.username)}" type="button">
                  ${u.active===false?"Enable":"Disable"}
                </button>
              ` : ``}
            </div>
          </div>
        `);
      });
    }

    [search, stSel].forEach(el => el && el.addEventListener("input", renderRows));
    renderRows();

    table.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const act = btn.getAttribute("data-act");
      const uname = btn.getAttribute("data-username");

      if (act === "view") {
        openOfficialModal(uname, lg);
        return;
      }

      if (!canManage) return;

      if (act === "toggle") {
        const u = RRSA_DB.getUserByUsername(uname);
        if (!u) return;
        if (!isExec() && uname === user.username) { alert("You cannot disable yourself."); return; }
        u.active = (u.active === false) ? true : false;
        RRSA_DB.updateUser(u);
        RRSA_DB.audit(user.username, "user_toggle", `Set active=${u.active} for @${uname} (league=${lg})`);
        renderRows();
        return;
      }

      if (act === "edit") {
        const u = RRSA_DB.getUserByUsername(uname);
        if (!u) return;
        openEditUserModal(u, lg);
      }
    });

    function openOfficialModal(uname, lg) {
      const u = RRSA_DB.getUserByUsername(uname);
      if (!u) return;

      const host = $("#modalHost", root);
      const att = computeAttendanceStats(uname, lg);
      const avg = computePerfAvg(uname, lg);
      const trend = performanceTrendByMonth(uname, lg);

      const reviews = performanceForLeague(lg)
        .filter(r => String(r.subjectUsername).toLowerCase() === uname)
        .slice(0, 10);

      host.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal modal-wide">
            <div class="modal-head">
              <h2>${esc(u.displayName)} <span class="muted tiny">@${esc(u.username)}</span></h2>
              <button class="btn xs ghost" data-close="1" type="button">Close</button>
            </div>

            <div class="mini-row">
              <div class="kv"><div class="k">Attendance %</div><div class="v">${att.pct ?? "—"}</div></div>
              <div class="kv"><div class="k">Avg Performance</div><div class="v">${avg ?? "—"}</div></div>
              <div class="kv"><div class="k">Marks / Reviews</div><div class="v">${att.total} / ${performanceForLeague(lg).filter(r => String(r.subjectUsername).toLowerCase() === uname).length}</div></div>
            </div>

            <div class="divider"></div>

            <div class="grid-2">
              <div>
                <div class="muted tiny" style="margin-bottom:8px">Attendance Mix</div>
                <canvas id="m_att" class="chart"></canvas>
              </div>
              <div>
                <div class="muted tiny" style="margin-bottom:8px">Performance Trend</div>
                <canvas id="m_perf" class="chart"></canvas>
              </div>
            </div>

            <div class="divider"></div>

            <div class="card" style="margin:0">
              <div class="card-title">Recent Reviews (latest 10)</div>
              <div class="table">
                <div class="tr th" style="grid-template-columns: 1fr 1fr 1fr 2fr;">
                  <div>Avg</div><div>Event</div><div>By</div><div>Comment</div>
                </div>
                ${reviews.length ? reviews.map(r => {
                  const a = reviewAvg(r);
                  return `
                    <div class="tr" style="grid-template-columns: 1fr 1fr 1fr 2fr;">
                      <div>${a === null ? "—" : a.toFixed(1)}</div>
                      <div class="muted tiny">${esc(r.eventRef || "—")}</div>
                      <div class="muted tiny">@${esc(r.createdBy || "—")}</div>
                      <div class="muted tiny">${esc((r.comments || "").slice(0,120))}${(r.comments||"").length>120?"…":""}</div>
                    </div>
                  `;
                }).join("") : `<div class="muted tiny" style="padding:10px">No reviews.</div>`}
              </div>
            </div>
          </div>
        </div>
      `;

      host.addEventListener("click", (e) => {
        if (e.target.matches("[data-close]") || e.target.classList.contains("modal-backdrop")) host.innerHTML = "";
      }, { once: true });

      // Draw charts after DOM insert
      const c = att.counts;
      RRSA_CHARTS.donut($("#m_att", host), [
        { label:"Present", value: c["Present"], colorKey:"success" },
        { label:"Late", value: c["Late"], colorKey:"warning" },
        { label:"Excused", value: c["Excused"], colorKey:"info" },
        { label:"No-Show", value: c["No-Show"], colorKey:"danger" },
      ], { title: "Attendance", centerText: att.pct === null ? "—" : `${att.pct}%` });

      RRSA_CHARTS.line($("#m_perf", host), trend.labels, trend.values, { title: "Avg Score by Month" });
    }

    function openEditUserModal(u, lg) {
      const host = $("#modalHost", root);
      const lr = (u.leagueRoles || {})[lg]?.role || "OFFICIAL";
      const dept = (u.leagueRoles || {})[lg]?.dept || "Officials";

      host.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal">
            <div class="modal-head">
              <h2>Edit Official</h2>
              <button class="btn xs ghost" data-close="1" type="button">Close</button>
            </div>

            <div class="field">
              <label>Display Name</label>
              <input id="m_name" type="text" value="${esc(u.displayName)}" />
            </div>

            <div class="mini-row" style="gap:10px">
              <div class="field" style="flex:1">
                <label>League Role (${esc(lg)})</label>
                <select id="m_role">
                  ${Object.values(RRSA_ROLES.LEAGUE_ROLE).map(r => `
                    <option value="${esc(r)}" ${r===lr?"selected":""}>${esc(RRSA_ROLES.labelLeague(r))}</option>
                  `).join("")}
                </select>
              </div>
              <div class="field" style="flex:1">
                <label>Department</label>
                <input id="m_dept" type="text" value="${esc(dept)}" />
              </div>
            </div>

            ${can(RRSA_ROLES.PERM.MANAGE_USERS_FULL) ? `
              <div class="divider"></div>
              <div class="field">
                <label>Reset Password</label>
                <input id="m_pw" type="password" placeholder="New password (optional)" />
                <div class="muted tiny">Password policy applies if set.</div>
              </div>
            ` : ``}

            <div class="mini-row" style="justify-content:flex-end; gap:10px">
              <button class="btn ghost" data-close="1" type="button">Cancel</button>
              <button class="btn" id="m_save" type="button">Save</button>
            </div>
          </div>
        </div>
      `;

      host.addEventListener("click", (e) => {
        if (e.target.matches("[data-close]") || e.target.classList.contains("modal-backdrop")) host.innerHTML = "";
      }, { once: true });

      $("#m_save", host).onclick = () => {
        const name = $("#m_name", host).value.trim();
        const role = $("#m_role", host).value;
        const dept2 = $("#m_dept", host).value.trim() || "Officials";

        u.displayName = name || u.displayName;
        u.leagueRoles = u.leagueRoles || {};
        u.leagueRoles[lg] = { role, dept: dept2 };

        if (can(RRSA_ROLES.PERM.MANAGE_USERS_FULL)) {
          const newPw = $("#m_pw", host).value;
          if (newPw) {
            const chk = RRSA_AUTH.validatePassword(newPw);
            if (!chk.ok) { alert(chk.message); return; }
            u.password = newPw;
          }
        }

        RRSA_DB.updateUser(u);
        RRSA_DB.audit(user.username, "user_edit", `Updated @${u.username} (league=${lg}) role=${role}, dept=${dept2}`);
        host.innerHTML = "";
        renderRows();
      };
    }
  }

  // ---------------- ATTENDANCE ----------------
  function renderAttendance() {
    const lg = leagueCtx;

    const canCreate = can(RRSA_ROLES.PERM.CREATE_ATTENDANCE_EVENTS, lg);
    const canGrade = can(RRSA_ROLES.PERM.GRADE_ATTENDANCE, lg);
    const canViewAll = can(RRSA_ROLES.PERM.VIEW_ALL_RECORDS, lg) || isExec();

    const events = attendanceForLeague(lg);

    return `
      <div class="page">
        <div class="page-head">
          <h1>Attendance</h1>
          <div class="muted">League Context: <b>${esc(lg)}</b></div>
        </div>

        ${canCreate ? `
          <div class="card">
            <div class="card-title">Create Event</div>
            <div class="mini-row" style="gap:10px; align-items:flex-end">
              <div class="field" style="flex:1">
                <label>Event Name</label>
                <input id="att_name" type="text" placeholder="RRFL Week 2 - Match B" />
              </div>
              <div class="field">
                <label>Type</label>
                <select id="att_type">
                  <option>Game</option><option>Scrim</option><option>Practice</option><option>Meeting</option>
                </select>
              </div>
              <div class="field">
                <label>Date</label>
                <input id="att_date" type="date" value="${esc(new Date().toISOString().slice(0,10))}" />
              </div>
              <button id="att_create" class="btn" type="button">Create</button>
            </div>
          </div>
        ` : ``}

        <div class="card">
          <div class="card-title">Event History</div>
          <div class="list" id="att_list">
            ${events.length ? events.map(ev => `
              <button class="list-item" data-ev="${esc(ev.id)}" type="button">
                <div>
                  <b>${esc(ev.eventName)}</b>
                  <div class="muted tiny">${esc(ev.eventType)} • ${esc(ev.eventDate)} • by @${esc(ev.createdBy)}</div>
                </div>
                <div class="pill">${esc(ev.marks?.length || 0)} marks</div>
              </button>
            `).join("") : `<div class="muted" style="padding:12px">No events for this league.</div>`}
          </div>
        </div>

        <div class="card" id="att_detail">
          <div class="card-title">Details</div>
          <div class="muted">Select an event to view details.</div>
        </div>

        <div class="muted tiny" style="margin-top:10px">
          ${canGrade ? "" : "You can view your own attendance marks only."}
        </div>

        <div id="modalHost"></div>
      </div>
    `;
  }

  function wireAttendance(root) {
    const lg = leagueCtx;
    const canCreate = can(RRSA_ROLES.PERM.CREATE_ATTENDANCE_EVENTS, lg);
    const canGrade = can(RRSA_ROLES.PERM.GRADE_ATTENDANCE, lg);
    const canViewAll = can(RRSA_ROLES.PERM.VIEW_ALL_RECORDS, lg) || isExec();

    if (canCreate) {
      $("#att_create", root).onclick = () => {
        const name = $("#att_name", root).value.trim();
        const type = $("#att_type", root).value;
        const date = $("#att_date", root).value;

        if (!name) return alert("Event name is required.");
        if (!date) return alert("Event date is required.");

        const ev = {
          id: RRSA_DB.makeId("att"),
          eventType: type,
          league: lg,
          eventName: name,
          eventDate: date,
          createdAt: RRSA_DB.isoNow(),
          createdBy: user.username,
          marks: []
        };

        RRSA_DB.addAttendanceEvent(ev);
        RRSA_DB.audit(user.username, "attendance_create", `Created attendance event "${name}" (${lg}).`);
        render(PAGES.ATTENDANCE);
      };
    }

    const detail = $("#att_detail", root);
    const list = $("#att_list", root);

    function statusPill(status) {
      if (status === "Present") return "ok";
      if (status === "Late") return "warn";
      if (status === "Excused") return "info";
      if (status === "No-Show") return "danger";
      return "";
    }

    function renderDetail(evId) {
      const ev = RRSA_DB.listAttendance().find(x => x.id === evId);
      if (!ev || ev.league !== lg) return;

      const roster = leagueOfficials(lg);
      const visibleRoster = canViewAll ? roster : roster.filter(u => u.username === user.username);
      const marksByUser = new Map((ev.marks || []).map(m => [String(m.username).toLowerCase(), m]));

      detail.innerHTML = `
        <div class="card-title">${esc(ev.eventName)}</div>
        <div class="muted tiny">${esc(ev.eventType)} • ${esc(ev.eventDate)} • Created ${esc(fmtDate(ev.createdAt))} by @${esc(ev.createdBy)}</div>

        <div class="divider"></div>

        <div class="table">
          <div class="tr th" style="grid-template-columns: 2fr 1fr 1.6fr 2fr ${canGrade ? "1fr" : ""};">
            <div>Official</div><div>Status</div><div>Timestamp</div><div>Note</div>${canGrade ? `<div>Action</div>` : ``}
          </div>
          ${visibleRoster.map(u => {
            const m = marksByUser.get(u.username.toLowerCase());
            return `
              <div class="tr" style="grid-template-columns: 2fr 1fr 1.6fr 2fr ${canGrade ? "1fr" : ""};">
                <div><b>${esc(u.displayName)}</b> <span class="muted tiny">@${esc(u.username)}</span></div>
                <div>${m ? `<span class="pill ${statusPill(m.status)}">${esc(m.status)}</span>` : `<span class="muted">—</span>`}</div>
                <div class="muted tiny">${m ? esc(m.timestamp) : "—"}</div>
                <div class="muted tiny">${m ? esc(m.note || "") : "—"}</div>
                ${canGrade ? `<div><button class="btn xs ghost" data-mark="${esc(u.username)}" data-evid="${esc(ev.id)}" type="button">Mark</button></div>` : ``}
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    list?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ev]");
      if (!btn) return;
      renderDetail(btn.getAttribute("data-ev"));
    });

    detail?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-mark]");
      if (!btn || !canGrade) return;
      openMarkModal(btn.getAttribute("data-evid"), btn.getAttribute("data-mark"));
    });

    function openMarkModal(evId, uname) {
      const host = $("#modalHost", root);
      const ev = RRSA_DB.listAttendance().find(x => x.id === evId);
      if (!ev) return;

      const existing = (ev.marks || []).find(m => String(m.username).toLowerCase() === String(uname).toLowerCase());
      const current = existing?.status || "Present";
      const note = existing?.note || "";

      host.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal">
            <div class="modal-head">
              <h2>Mark Attendance</h2>
              <button class="btn xs ghost" data-close="1" type="button">Close</button>
            </div>

            <div class="muted">Event: <b>${esc(ev.eventName)}</b></div>
            <div class="muted">Official: <b>@${esc(uname)}</b></div>

            <div class="divider"></div>

            <div class="field">
              <label>Status</label>
              <select id="m_status">
                ${["Present","Late","Excused","No-Show"].map(s => `<option ${s===current?"selected":""}>${esc(s)}</option>`).join("")}
              </select>
            </div>

            <div class="field">
              <label>Note (optional)</label>
              <input id="m_note" type="text" value="${esc(note)}" placeholder="Reason / context" />
            </div>

            <div class="mini-row" style="justify-content:flex-end; gap:10px">
              <button class="btn ghost" data-close="1" type="button">Cancel</button>
              <button class="btn" id="m_save" type="button">Save</button>
            </div>
          </div>
        </div>
      `;

      host.addEventListener("click", (e) => {
        if (e.target.matches("[data-close]") || e.target.classList.contains("modal-backdrop")) host.innerHTML = "";
      }, { once: true });

      $("#m_save", host).onclick = () => {
        const st = $("#m_status", host).value;
        const nt = $("#m_note", host).value.trim();

        ev.marks = ev.marks || [];
        const idx = ev.marks.findIndex(m => String(m.username).toLowerCase() === String(uname).toLowerCase());
        const mark = { userId: RRSA_DB.getUserByUsername(uname)?.id || null, username: uname, status: st, timestamp: RRSA_DB.isoNow(), note: nt };
        if (idx >= 0) ev.marks[idx] = mark; else ev.marks.push(mark);

        const db = RRSA_DB.getDB();
        const evIdx = db.attendance.findIndex(x => x.id === ev.id);
        if (evIdx >= 0) db.attendance[evIdx] = ev;
        RRSA_DB.setDB(db);

        RRSA_DB.audit(user.username, "attendance_mark", `Marked @${uname} as ${st} for "${ev.eventName}" (${lg}).`);
        host.innerHTML = "";
        render(PAGES.ATTENDANCE);
      };
    }
  }

  // ---------------- PERFORMANCE ----------------
  function renderPerformance() {
    const lg = leagueCtx;
    const canCreate = can(RRSA_ROLES.PERM.CREATE_PERFORMANCE_REVIEWS, lg);
    const canViewAll = can(RRSA_ROLES.PERM.VIEW_ALL_RECORDS, lg) || isExec();

    const reviews = performanceForLeague(lg);
    const roster = leagueOfficials(lg);
    const subjects = (canViewAll ? roster : roster.filter(u => u.username === user.username))
      .map(u => `<option value="${esc(u.username)}">${esc(u.displayName)} (@${esc(u.username)})</option>`)
      .join("");

    const filtered = canViewAll ? reviews : reviews.filter(r => String(r.subjectUsername).toLowerCase() === user.username);

    const s = RRSA_DB.getSettings();
    const thr = Number(s.performanceThreshold || 6.5);

    return `
      <div class="page">
        <div class="page-head">
          <h1>Performance</h1>
          <div class="muted">League Context: <b>${esc(lg)}</b></div>
        </div>

        ${canCreate ? `
          <div class="card">
            <div class="card-title">Create Review</div>
            <div class="mini-row" style="gap:10px; align-items:flex-end">
              <div class="field" style="flex:1">
                <label>Subject</label>
                <select id="pf_subject">${subjects}</select>
              </div>
              <div class="field" style="flex:1">
                <label>Event Ref (optional)</label>
                <input id="pf_event" type="text" placeholder="RRFL Week 2 - Match B" />
              </div>
              <button id="pf_open" class="btn" type="button">Score</button>
            </div>
          </div>
        ` : ``}

        <div class="card">
          <div class="card-title">History</div>
          <div class="muted tiny">Threshold: ${thr}</div>
          <div class="table" id="pf_table">
            <div class="tr th" style="grid-template-columns: 1fr 1fr 1.5fr 1fr 2fr;">
              <div>Subject</div><div>Avg</div><div>Event</div><div>By</div><div>Comments</div>
            </div>
            ${filtered.length ? filtered.map(r => {
              const avg = reviewAvg(r);
              const bad = (avg !== null && avg < thr);
              return `
                <div class="tr" style="grid-template-columns: 1fr 1fr 1.5fr 1fr 2fr;">
                  <div><b>@${esc(r.subjectUsername)}</b></div>
                  <div>${avg === null ? "—" : `<span class="pill ${bad ? "danger" : "ok"}">${avg.toFixed(1)}</span>`}</div>
                  <div class="muted tiny">${esc(r.eventRef || "—")}</div>
                  <div class="muted tiny">@${esc(r.createdBy || "—")}</div>
                  <div class="muted tiny">${esc((r.comments || "").slice(0,120))}${(r.comments||"").length>120?"…":""}</div>
                </div>
              `;
            }).join("") : `<div class="muted tiny" style="padding:10px">No reviews.</div>`}
          </div>
        </div>

        <div id="modalHost"></div>
      </div>
    `;
  }

  function wirePerformance(root) {
    const lg = leagueCtx;
    const canCreate = can(RRSA_ROLES.PERM.CREATE_PERFORMANCE_REVIEWS, lg);
    if (!canCreate) return;

    $("#pf_open", root).onclick = () => openScoreModal();

    function scoreField(label, key, defVal) {
      return `
        <div class="field">
          <label>${esc(label)} (1–10)</label>
          <input id="score_${esc(key)}" type="number" min="1" max="10" value="${defVal}" />
        </div>
      `;
    }

    function openScoreModal() {
      const host = $("#modalHost", root);
      const subject = $("#pf_subject", root).value;
      const eventRef = $("#pf_event", root).value.trim();

      host.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal">
            <div class="modal-head">
              <h2>Performance Scoring</h2>
              <button class="btn xs ghost" data-close="1" type="button">Close</button>
            </div>

            <div class="muted">Subject: <b>@${esc(subject)}</b></div>
            <div class="muted">League: <b>${esc(lg)}</b></div>

            <div class="divider"></div>

            ${scoreField("Rule Knowledge", "ruleKnowledge", 8)}
            ${scoreField("Communication", "communication", 8)}
            ${scoreField("Fairness", "fairness", 8)}
            ${scoreField("Consistency", "consistency", 8)}
            ${scoreField("Professionalism", "professionalism", 8)}

            <div class="field">
              <label>Comments</label>
              <textarea id="pf_comments" rows="4" placeholder="Write structured feedback…"></textarea>
            </div>

            <div class="mini-row" style="justify-content:flex-end; gap:10px">
              <button class="btn ghost" data-close="1" type="button">Cancel</button>
              <button class="btn" id="pf_save" type="button">Save Review</button>
            </div>
          </div>
        </div>
      `;

      host.addEventListener("click", (e) => {
        if (e.target.matches("[data-close]") || e.target.classList.contains("modal-backdrop")) host.innerHTML = "";
      }, { once: true });

      $("#pf_save", host).onclick = () => {
        const scores = {
          ruleKnowledge: Number($("#score_ruleKnowledge", host).value),
          communication: Number($("#score_communication", host).value),
          fairness: Number($("#score_fairness", host).value),
          consistency: Number($("#score_consistency", host).value),
          professionalism: Number($("#score_professionalism", host).value),
        };

        const ok = Object.values(scores).every(v => Number.isFinite(v) && v >= 1 && v <= 10);
        if (!ok) return alert("Scores must be between 1 and 10.");

        const review = {
          id: RRSA_DB.makeId("perf"),
          league: lg,
          subjectUsername: subject,
          eventRef: eventRef || "",
          createdAt: RRSA_DB.isoNow(),
          createdBy: user.username,
          scores,
          comments: $("#pf_comments", host).value.trim()
        };

        RRSA_DB.addPerformanceReview(review);
        RRSA_DB.audit(user.username, "performance_create", `Created review for @${subject} (${lg}).`);
        host.innerHTML = "";
        render(PAGES.PERFORMANCE);
      };
    }
  }

  // ---------------- INVITES (CEO only) ----------------
  function renderInvites() {
    if (!can(RRSA_ROLES.PERM.MANAGE_USERS_FULL)) {
      return `<div class="page"><h1>Invites</h1><div class="muted">Access denied.</div></div>`;
    }

    const lg = leagueCtx;
    const invites = RRSA_DB.listInvites();

    return `
      <div class="page">
        <div class="page-head">
          <h1>Invites</h1>
          <div class="muted">Create invite codes for league-scoped access.</div>
        </div>

        <div class="card">
          <div class="card-title">Create Invite</div>
          <div class="mini-row" style="gap:10px; align-items:flex-end">
            <div class="field">
              <label>League</label>
              <select id="inv_league">
                ${RRSA_DB.listLeagues().map(l => `<option value="${esc(l)}" ${l===lg?"selected":""}>${esc(l)}</option>`).join("")}
              </select>
            </div>

            <div class="field" style="flex:1">
              <label>Role</label>
              <select id="inv_role">
                ${Object.values(RRSA_ROLES.LEAGUE_ROLE).map(r => `<option value="${esc(r)}">${esc(RRSA_ROLES.labelLeague(r))}</option>`).join("")}
              </select>
            </div>

            <div class="field" style="flex:1">
              <label>Department</label>
              <input id="inv_dept" type="text" value="Officials" />
            </div>

            <div class="field">
              <label>Max Uses</label>
              <input id="inv_uses" type="number" min="1" max="50" value="1" />
            </div>

            <div class="field">
              <label>Expires (optional)</label>
              <input id="inv_exp" type="date" />
            </div>

            <button id="inv_create" class="btn" type="button">Create</button>
          </div>
          <div class="muted tiny" style="margin-top:10px">Users created via invite must meet password policy.</div>
        </div>

        <div class="card">
          <div class="card-title">Invite History</div>
          <div class="table" id="inv_table">
            <div class="tr th" style="grid-template-columns: 1.5fr 1fr 1fr 1fr 1fr 1fr 1fr;">
              <div>Code</div><div>League</div><div>Role</div><div>Dept</div><div>Uses</div><div>Expires</div><div>Action</div>
            </div>
            ${invites.length ? invites.map(i => `
              <div class="tr" style="grid-template-columns: 1.5fr 1fr 1fr 1fr 1fr 1fr 1fr;">
                <div><b>${esc(i.code)}</b> ${i.active ? `<span class="pill ok" style="margin-left:8px">Active</span>` : `<span class="pill danger" style="margin-left:8px">Inactive</span>`}</div>
                <div>${esc(i.league)}</div>
                <div>${esc(i.leagueRole)}</div>
                <div>${esc(i.dept)}</div>
                <div>${esc(i.uses)}/${esc(i.maxUses)}</div>
                <div>${i.expiresAt ? esc(String(i.expiresAt).slice(0,10)) : "—"}</div>
                <div>
                  ${i.active ? `<button class="btn xs ghost" data-revoke="${esc(i.code)}" type="button">Revoke</button>` : `<span class="muted tiny">—</span>`}
                </div>
              </div>
            `).join("") : `<div class="muted tiny" style="padding:10px">No invites.</div>`}
          </div>
        </div>
      </div>
    `;
  }

  function wireInvites(root) {
    if (!can(RRSA_ROLES.PERM.MANAGE_USERS_FULL)) return;

    $("#inv_create", root).onclick = () => {
      const league = $("#inv_league", root).value;
      const role = $("#inv_role", root).value;
      const dept = $("#inv_dept", root).value.trim() || "Officials";
      const uses = Number($("#inv_uses", root).value || 1);
      const exp = $("#inv_exp", root).value;
      const expiresAt = exp ? `${exp}T23:59:59.999Z` : null;

      const inv = RRSA_DB.createInvite({
        league, leagueRole: role, dept,
        createdBy: user.username, maxUses: uses, expiresAt, note: ""
      });

      RRSA_DB.audit(user.username, "invite_create", `Created invite ${inv.code} for ${league} role=${role}.`);
      alert(`Invite created: ${inv.code}`);
      render(PAGES.INVITES);
    };

    $("#inv_table", root).addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-revoke]");
      if (!btn) return;
      const code = btn.getAttribute("data-revoke");
      if (!confirm(`Revoke invite ${code}?`)) return;
      RRSA_DB.revokeInvite(code);
      RRSA_DB.audit(user.username, "invite_revoke", `Revoked invite ${code}.`);
      render(PAGES.INVITES);
    });
  }

  // ---------------- SETTINGS (exec/CEO) ----------------
  function renderSettings() {
    if (!can(RRSA_ROLES.PERM.CONFIGURE_SYSTEM)) {
      return `<div class="page"><h1>Settings</h1><div class="muted">Access denied.</div></div>`;
    }

    const s = RRSA_DB.getSettings();
    const p = s.authPolicy || {};
    const leagues = (s.leagues || []).join(", ");

    const canImport = can(RRSA_ROLES.PERM.IMPORT_DB_JSON);
    const canExport = can(RRSA_ROLES.PERM.EXPORT_DB_JSON);

    return `
      <div class="page">
        <div class="page-head">
          <h1>Settings</h1>
          <div class="muted">System-wide configuration</div>
        </div>

        <div class="card">
          <div class="card-title">Performance</div>
          <div class="mini-row" style="gap:10px; align-items:flex-end">
            <div class="field">
              <label>Alert Threshold</label>
              <input id="set_thr" type="number" step="0.1" min="1" max="10" value="${esc(String(s.performanceThreshold ?? 6.5))}" />
            </div>
            <button id="set_save" class="btn" type="button">Save</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Leagues</div>
          <div class="mini-row" style="gap:10px; align-items:flex-end">
            <div class="field" style="flex:1">
              <label>Comma-separated leagues</label>
              <input id="set_leagues" type="text" value="${esc(leagues)}" />
            </div>
            <div class="field">
              <label>Default League</label>
              <input id="set_defleague" type="text" value="${esc(String(s.defaultLeague || "RRFL"))}" />
            </div>
            <button id="set_leagues_save" class="btn ghost" type="button">Update</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Security (Client-side)</div>
          <div class="grid-3">
            <div class="field">
              <label>Min Password Length</label>
              <input id="pol_min" type="number" min="6" max="64" value="${esc(String(p.minLen ?? 8))}" />
            </div>
            <div class="field">
              <label>Max Failed Attempts</label>
              <input id="pol_maxfail" type="number" min="1" max="20" value="${esc(String(p.maxFailedAttempts ?? 5))}" />
            </div>
            <div class="field">
              <label>Lock Minutes</label>
              <input id="pol_lock" type="number" min="1" max="120" value="${esc(String(p.lockMinutes ?? 10))}" />
            </div>
            <div class="field">
              <label>Idle Timeout (minutes)</label>
              <input id="pol_idle" type="number" min="1" max="240" value="${esc(String(p.idleTimeoutMinutes ?? 30))}" />
            </div>
            <div class="field">
              <label>Absolute Timeout (hours)</label>
              <input id="pol_abs" type="number" min="1" max="72" value="${esc(String(p.absoluteTimeoutHours ?? 12))}" />
            </div>
            <div class="field">
              <label>Require Letter</label>
              <select id="pol_letter">
                <option value="true" ${(p.requireLetter ?? true) ? "selected" : ""}>true</option>
                <option value="false" ${(p.requireLetter ?? true) ? "" : "selected"}>false</option>
              </select>
            </div>
            <div class="field">
              <label>Require Number</label>
              <select id="pol_number">
                <option value="true" ${(p.requireNumber ?? true) ? "selected" : ""}>true</option>
                <option value="false" ${(p.requireNumber ?? true) ? "" : "selected"}>false</option>
              </select>
            </div>
          </div>
          <div class="mini-row" style="justify-content:flex-end; gap:10px">
            <button id="pol_save" class="btn" type="button">Save Policy</button>
          </div>
          <div class="muted tiny">Client-side only. Improves UX/deterrence, not real security.</div>
        </div>

        ${can(RRSA_ROLES.PERM.MANAGE_USERS_FULL) ? `
          <div class="card">
            <div class="card-title">CEO User Admin</div>

            <div class="mini-row" style="gap:10px; align-items:flex-end">
              <div class="field" style="flex:1">
                <label>Username</label>
                <input id="u_username" type="text" placeholder="new_user" />
              </div>
              <div class="field" style="flex:1">
                <label>Display Name</label>
                <input id="u_name" type="text" placeholder="New Official" />
              </div>
              <div class="field" style="flex:1">
                <label>Password</label>
                <input id="u_pw" type="password" placeholder="Meets policy" />
              </div>
            </div>

            <div class="mini-row" style="gap:10px; align-items:flex-end">
              <div class="field">
                <label>League</label>
                <select id="u_league">
                  ${RRSA_DB.listLeagues().map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join("")}
                </select>
              </div>
              <div class="field" style="flex:1">
                <label>League Role</label>
                <select id="u_lrole">
                  ${Object.values(RRSA_ROLES.LEAGUE_ROLE).map(r => `<option value="${esc(r)}">${esc(RRSA_ROLES.labelLeague(r))}</option>`).join("")}
                </select>
              </div>
              <div class="field" style="flex:1">
                <label>Department</label>
                <input id="u_dept" type="text" value="Officials" />
              </div>
              <button id="u_create" class="btn" type="button">Create User</button>
            </div>

            <div class="divider"></div>

            <div class="mini-row" style="gap:10px; align-items:flex-end">
              <div class="field" style="flex:1">
                <label>Delete Username</label>
                <input id="u_del" type="text" placeholder="username" />
              </div>
              <button id="u_delete" class="btn danger" type="button">Delete User</button>
            </div>

            <div class="muted tiny">Delete removes user and cleans their attendance marks and performance records.</div>
          </div>
        ` : ``}

        <div class="card">
          <div class="card-title">Database Transfer</div>
          <div class="sub">Export/import JSON to move data between devices.</div>

          <div class="mini-row" style="justify-content:flex-start; gap:10px">
            <button id="dbExportBtn" class="btn ghost ${canExport ? "" : "hidden"}" type="button">Export DB JSON</button>

            <label class="btn ghost ${canImport ? "" : "hidden"}" style="display:inline-flex; align-items:center; gap:8px; cursor:pointer">
              Import DB JSON
              <input id="dbImportFile" type="file" accept="application/json" style="display:none" />
            </label>
          </div>

          <div class="muted tiny" style="margin-top:10px">Import overwrites the current LocalStorage database.</div>
        </div>

        <div class="card">
          <div class="card-title">Maintenance</div>
          <button id="reset_demo" class="btn ghost" type="button">Reset Demo Data</button>
        </div>
      </div>
    `;
  }

  function wireSettings(root) {
    if (!can(RRSA_ROLES.PERM.CONFIGURE_SYSTEM)) return;

    $("#set_save", root).onclick = () => {
      const thr = Number($("#set_thr", root).value);
      if (!Number.isFinite(thr) || thr < 1 || thr > 10) return alert("Threshold must be between 1 and 10.");
      RRSA_DB.setSetting("performanceThreshold", thr);
      RRSA_DB.audit(user.username, "settings_update", `performanceThreshold=${thr}`);
      alert("Saved.");
      render(PAGES.SETTINGS);
    };

    $("#set_leagues_save", root).onclick = () => {
      const raw = $("#set_leagues", root).value;
      const list = raw.split(",").map(s => s.trim()).filter(Boolean);
      if (!list.length) return alert("Provide at least one league.");
      const def = $("#set_defleague", root).value.trim() || list[0];

      const db = RRSA_DB.getDB();
      db.settings.leagues = list;
      db.settings.defaultLeague = def;
      RRSA_DB.setDB(db);

      RRSA_DB.audit(user.username, "settings_update", `leagues=${list.join(",")} defaultLeague=${def}`);
      alert("Leagues updated.");
      render(PAGES.SETTINGS);
    };

    $("#pol_save", root).onclick = () => {
      const pol = {
        minLen: Number($("#pol_min", root).value),
        maxFailedAttempts: Number($("#pol_maxfail", root).value),
        lockMinutes: Number($("#pol_lock", root).value),
        idleTimeoutMinutes: Number($("#pol_idle", root).value),
        absoluteTimeoutHours: Number($("#pol_abs", root).value),
        requireLetter: $("#pol_letter", root).value === "true",
        requireNumber: $("#pol_number", root).value === "true",
      };

      if (!Number.isFinite(pol.minLen) || pol.minLen < 6) return alert("minLen must be >= 6.");
      if (!Number.isFinite(pol.maxFailedAttempts) || pol.maxFailedAttempts < 1) return alert("maxFailedAttempts must be >= 1.");
      if (!Number.isFinite(pol.lockMinutes) || pol.lockMinutes < 1) return alert("lockMinutes must be >= 1.");

      const db = RRSA_DB.getDB();
      db.settings.authPolicy = pol;
      RRSA_DB.setDB(db);
      RRSA_DB.audit(user.username, "settings_update", `authPolicy updated`);
      alert("Policy saved.");
      render(PAGES.SETTINGS);
    };

    if (can(RRSA_ROLES.PERM.MANAGE_USERS_FULL)) {
      $("#u_create", root).onclick = () => {
        const username = $("#u_username", root).value.trim().toLowerCase();
        const displayName = $("#u_name", root).value.trim();
        const pw = $("#u_pw", root).value;
        const league = $("#u_league", root).value;
        const leagueRole = $("#u_lrole", root).value;
        const dept = $("#u_dept", root).value.trim() || "Officials";

        const chk = RRSA_AUTH.validatePassword(pw);
        if (!chk.ok) return alert(chk.message);

        try {
          const u = RRSA_DB.createUser({ username, password: pw, displayName, globalRole: "OFFICIAL", league, leagueRole, dept });
          RRSA_DB.audit(user.username, "user_create", `Created @${u.username} league=${league} role=${leagueRole}`);
          alert(`Created @${u.username}`);
          render(PAGES.SETTINGS);
        } catch (err) {
          alert(String(err.message || err));
        }
      };

      $("#u_delete", root).onclick = () => {
        const uname = $("#u_del", root).value.trim().toLowerCase();
        if (!uname) return;
        if (uname === user.username) return alert("You cannot delete yourself.");
        if (!confirm(`Delete @${uname}? This will remove related records.`)) return;
        try {
          RRSA_DB.deleteUserByUsername(uname);
          RRSA_DB.audit(user.username, "user_delete", `Deleted @${uname}`);
          alert("Deleted.");
          render(PAGES.SETTINGS);
        } catch (err) {
          alert(String(err.message || err));
        }
      };
    }

    // DB export/import
    const dbExportBtn = $("#dbExportBtn", root);
    if (dbExportBtn && can(RRSA_ROLES.PERM.EXPORT_DB_JSON)) {
      dbExportBtn.onclick = () => {
        const obj = RRSA_DB.exportDB();
        const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `rrsa_db_v12_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        RRSA_DB.audit(user.username, "db_export", "Exported DB JSON.");
      };
    }

    const dbImportFile = $("#dbImportFile", root);
    if (dbImportFile && can(RRSA_ROLES.PERM.IMPORT_DB_JSON)) {
      dbImportFile.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!confirm("Import will OVERWRITE current DB. Continue?")) { e.target.value = ""; return; }

        const text = await file.text();
        try {
          const obj = JSON.parse(text);
          RRSA_DB.importDB(obj);
          RRSA_DB.audit(user.username, "db_import", "Imported DB JSON.");
          alert("Import complete. Reloading…");
          location.reload();
        } catch (err) {
          alert("Import failed: " + String(err.message || err));
        } finally {
          e.target.value = "";
        }
      });
    }

    $("#reset_demo", root).onclick = () => {
      if (!confirm("Reset demo data? This overwrites all current data.")) return;
      RRSA_DB.reset();
      RRSA_DB.audit(user.username, "reset", "Reset demo data.");
      location.reload();
    };
  }

  // ---------------- AUDIT ----------------
  function renderAudit() {
    if (!can(RRSA_ROLES.PERM.VIEW_AUDIT)) return `<div class="page"><h1>Audit Log</h1><div class="muted">Access denied.</div></div>`;
    const logs = RRSA_DB.listAudit().slice(0, 200);
    return `
      <div class="page">
        <div class="page-head">
          <h1>Audit Log</h1>
          <div class="muted">Latest 200 actions</div>
        </div>

        <div class="card">
          <div class="table">
            <div class="tr th" style="grid-template-columns: 1.4fr 1fr 1fr 2fr;">
              <div>At</div><div>Actor</div><div>Action</div><div>Details</div>
            </div>
            ${logs.length ? logs.map(l => `
              <div class="tr" style="grid-template-columns: 1.4fr 1fr 1fr 2fr;">
                <div class="muted tiny">${esc(l.at)}</div>
                <div><b>@${esc(l.actor)}</b></div>
                <div>${esc(l.action)}</div>
                <div class="muted tiny">${esc(l.details || "")}</div>
              </div>
            `).join("") : `<div class="muted tiny" style="padding:10px">No logs.</div>`}
          </div>
        </div>
      </div>
    `;
  }
  function wireAudit() {}

  // ---------------- CSV Export ----------------
  function exportLeagueCsv(lg) {
    const att = attendanceForLeague(lg);
    const perf = performanceForLeague(lg);

    const lines = [];
    lines.push(["TYPE","LEAGUE","DATE","EVENT","SUBJECT","STATUS/AVG","DETAILS","CREATED_BY","CREATED_AT"].join(","));

    att.forEach(ev => {
      (ev.marks || []).forEach(m => {
        lines.push([
          "ATTENDANCE", csv(ev.league), csv(ev.eventDate), csv(ev.eventName),
          csv(m.username), csv(m.status), csv(m.note || ""),
          csv(ev.createdBy), csv(ev.createdAt)
        ].join(","));
      });
    });

    perf.forEach(r => {
      const avg = reviewAvg(r);
      const s = r.scores || {};
      const details = `RK:${s.ruleKnowledge},COM:${s.communication},FAIR:${s.fairness},CONS:${s.consistency},PRO:${s.professionalism} | ${r.comments || ""}`;
      lines.push([
        "PERFORMANCE", csv(r.league), csv(String(r.createdAt || "").slice(0,10)), csv(r.eventRef || ""),
        csv(r.subjectUsername), csv(avg === null ? "" : avg.toFixed(2)),
        csv(details), csv(r.createdBy || ""), csv(r.createdAt || "")
      ].join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rrsa_${lg}_export_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    RRSA_DB.audit(user.username, "export_csv", `Exported CSV for ${lg}.`);
  }

  function csv(v) {
    const s = String(v ?? "");
    const needs = /[,"\n]/.test(s);
    const out = s.replace(/"/g, '""');
    return needs ? `"${out}"` : out;
  }

  // ---------------- Boot ----------------
  function boot() {
    RRSA_DB.init();
    RRSA_AUTH.applyThemeFromStorage();

    user = RRSA_AUTH.currentUser();
    if (!user) { location.replace("login.html"); return; }

    leagueCtx = getLeagueCtx();

    setTopbar();
    mountNav();
    enforceSessionActivity();

    window.addEventListener("hashchange", () => render(route()));
    render(route());
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
