/* attendance.js
   Attendance events and per-official statistics.
*/

const RRSA_ATTENDANCE = (() => {
  const VALID = ["Present", "Late", "Excused", "No-Show"];

  function _normalizeStatus(s) {
    const v = String(s || "").trim();
    return VALID.includes(v) ? v : "Present";
  }

  function createEvent({ eventType, league, eventName, eventDate, createdBy }) {
    return {
      id: RRSA_DB.makeId("att"),
      eventType: String(eventType || "Game"),
      league: String(league || "RRSA"),
      eventName: String(eventName || "Untitled Event"),
      eventDate: String(eventDate || ""),
      createdAt: RRSA_DB.isoNow(),
      createdBy: createdBy,
      marks: [] // {userId, username, status, timestamp, note}
    };
  }

  function markAttendance({ eventId, subjectUsername, status, note, actorUsername }) {
    const db = RRSA_DB.getDB();
    const ev = db.attendance.find(x => x.id === eventId);
    if (!ev) throw new Error("Attendance event not found.");

    const subject = db.users.find(u => u.username === subjectUsername);
    if (!subject) throw new Error("User not found.");

    const s = _normalizeStatus(status);
    const existing = ev.marks.find(m => m.username === subjectUsername);

    const mark = {
      userId: subject.id,
      username: subject.username,
      status: s,
      timestamp: RRSA_DB.isoNow(),
      note: String(note || "").trim()
    };

    if (existing) {
      Object.assign(existing, mark);
    } else {
      ev.marks.push(mark);
    }

    RRSA_DB.setDB(db);
    RRSA_DB.audit(actorUsername, "attendance_mark", `Marked ${subjectUsername} as ${s} for "${ev.eventName}".`);
    return true;
  }

  function listEvents() {
    return RRSA_DB.listAttendance();
  }

  function getUserHistory(username) {
    const events = listEvents();
    const rows = [];
    for (const ev of events) {
      const mark = ev.marks.find(m => m.username === username);
      if (!mark) continue;
      rows.push({
        eventName: ev.eventName,
        league: ev.league,
        eventType: ev.eventType,
        eventDate: ev.eventDate,
        status: mark.status,
        timestamp: mark.timestamp,
        note: mark.note
      });
    }
    return rows;
  }

  function attendanceStats(username) {
    const hist = getUserHistory(username);
    const counts = { Present: 0, Late: 0, Excused: 0, "No-Show": 0, total: 0 };
    hist.forEach(r => {
      counts.total += 1;
      counts[r.status] = (counts[r.status] || 0) + 1;
    });

    // Define "attended" = Present/Late/Excused; "No-Show" counts against.
    const attended = counts.Present + counts.Late + counts.Excused;
    const pct = counts.total ? (attended / counts.total) * 100 : 0;

    return { ...counts, attended, pct: Math.round(pct * 10) / 10 };
  }

  function buildAttendanceCSV({ scope, username }) {
    // scope: "all" or "user"
    const events = listEvents();
    const lines = [];
    lines.push([
      "eventName","league","eventType","eventDate","createdAt","createdBy",
      "subjectUsername","status","timestamp","note"
    ].join(","));

    for (const ev of events) {
      for (const m of ev.marks) {
        if (scope === "user" && m.username !== username) continue;
        lines.push([
          _csv(ev.eventName),
          _csv(ev.league),
          _csv(ev.eventType),
          _csv(ev.eventDate),
          _csv(ev.createdAt),
          _csv(ev.createdBy),
          _csv(m.username),
          _csv(m.status),
          _csv(m.timestamp),
          _csv(m.note)
        ].join(","));
      }
    }
    return lines.join("\n");
  }

  function _csv(val) {
    const s = String(val ?? "");
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
    return s;
  }

  function downloadCSV(filename, csvText) {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return {
    VALID,
    createEvent,
    markAttendance,
    listEvents,
    getUserHistory,
    attendanceStats,
    buildAttendanceCSV,
    downloadCSV
  };
})();
