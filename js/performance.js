/* performance.js
   Performance reviews, averages, threshold flags.
*/

const RRSA_PERFORMANCE = (() => {
  const CATEGORIES = [
    { key: "ruleKnowledge", label: "Rule Knowledge" },
    { key: "communication", label: "Communication" },
    { key: "fairness", label: "Fairness" },
    { key: "consistency", label: "Consistency" },
    { key: "professionalism", label: "Professionalism" }
  ];

  function _clampScore(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 1;
    return Math.min(10, Math.max(1, Math.round(x)));
  }

  function createReview({ league, subjectUsername, eventRef, createdBy, scores, comments }) {
    const sc = {};
    for (const c of CATEGORIES) sc[c.key] = _clampScore(scores?.[c.key]);
    return {
      id: RRSA_DB.makeId("perf"),
      league: String(league || "RRSA"),
      subjectUsername: String(subjectUsername),
      eventRef: String(eventRef || "General"),
      createdAt: RRSA_DB.isoNow(),
      createdBy: String(createdBy),
      scores: sc,
      comments: String(comments || "").trim()
    };
  }

  function addReview(review, actorUsername) {
    RRSA_DB.addPerformanceReview(review);
    RRSA_DB.audit(actorUsername, "performance_review", `Reviewed ${review.subjectUsername} (${review.eventRef}).`);
  }

  function listAll() {
    return RRSA_DB.listPerformance();
  }

  function listForUser(username) {
    return listAll().filter(r => r.subjectUsername === username);
  }

  function avgForUser(username) {
    const reviews = listForUser(username);
    if (!reviews.length) return { avg: 0, perCategory: Object.fromEntries(CATEGORIES.map(c => [c.key, 0])), count: 0 };

    const sums = Object.fromEntries(CATEGORIES.map(c => [c.key, 0]));
    for (const r of reviews) {
      for (const c of CATEGORIES) sums[c.key] += Number(r.scores[c.key] || 0);
    }
    const perCategory = {};
    for (const c of CATEGORIES) perCategory[c.key] = Math.round((sums[c.key] / reviews.length) * 10) / 10;

    const overall = CATEGORIES.reduce((acc, c) => acc + perCategory[c.key], 0) / CATEGORIES.length;
    return { avg: Math.round(overall * 10) / 10, perCategory, count: reviews.length };
  }

  function flaggedOfficials() {
    const threshold = RRSA_DB.getSettings().performanceThreshold;
    const users = RRSA_DB.listUsers().filter(u => u.role === RRSA_ROLES.ROLE.OFFICIAL && u.active);
    return users
      .map(u => ({ username: u.username, displayName: u.displayName, league: u.league, stats: avgForUser(u.username) }))
      .filter(x => x.stats.count > 0 && x.stats.avg < threshold)
      .sort((a,b) => a.stats.avg - b.stats.avg);
  }

  function buildPerformanceCSV({ scope, username }) {
    const rows = scope === "user" ? listForUser(username) : listAll();
    const header = ["subjectUsername","league","eventRef","createdAt","createdBy",
      "ruleKnowledge","communication","fairness","consistency","professionalism","comments"].join(",");
    const lines = [header];

    for (const r of rows) {
      lines.push([
        _csv(r.subjectUsername),
        _csv(r.league),
        _csv(r.eventRef),
        _csv(r.createdAt),
        _csv(r.createdBy),
        _csv(r.scores.ruleKnowledge),
        _csv(r.scores.communication),
        _csv(r.scores.fairness),
        _csv(r.scores.consistency),
        _csv(r.scores.professionalism),
        _csv(r.comments)
      ].join(","));
    }
    return lines.join("\n");
  }

  function _csv(val) {
    const s = String(val ?? "");
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
    return s;
  }

  return {
    CATEGORIES,
    createReview,
    addReview,
    listAll,
    listForUser,
    avgForUser,
    flaggedOfficials,
    buildPerformanceCSV
  };
})();
