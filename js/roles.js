/* roles.js (v1.2) */

const RRSA_ROLES = (() => {
  const GLOBAL_ROLE = {
    EXEC_COMMISSIONER: "EXEC_COMMISSIONER",
    EXEC_EVP: "EXEC_EVP",
    EXEC_CAO: "EXEC_CAO",
    EXEC_DAO: "EXEC_DAO",
    HEAD_RRSA_MEDIA: "HEAD_RRSA_MEDIA",
    MEDIA_TEAM: "MEDIA_TEAM",
    OFFICIAL: "OFFICIAL"
  };

  const LEAGUE_ROLE = {
    LEAGUE_MANAGER: "LEAGUE_MANAGER",
    ASSIST_LEAGUE_MANAGER: "ASSIST_LEAGUE_MANAGER",
    HEAD_OF_REFEREES: "HEAD_OF_REFEREES",
    LEAGUE_MEDIA_MANAGER: "LEAGUE_MEDIA_MANAGER",
    OFFICIAL: "OFFICIAL"
  };

  const PERM = {
    VIEW_EXEC_DASH: "VIEW_EXEC_DASH",
    VIEW_MANAGER_DASH: "VIEW_MANAGER_DASH",
    VIEW_OFFICIAL_DASH: "VIEW_OFFICIAL_DASH",

    MANAGE_USERS: "MANAGE_USERS",
    MANAGE_USERS_FULL: "MANAGE_USERS_FULL",

    CREATE_ATTENDANCE_EVENTS: "CREATE_ATTENDANCE_EVENTS",
    GRADE_ATTENDANCE: "GRADE_ATTENDANCE",

    CREATE_PERFORMANCE_REVIEWS: "CREATE_PERFORMANCE_REVIEWS",
    VIEW_ALL_RECORDS: "VIEW_ALL_RECORDS",

    VIEW_AUDIT: "VIEW_AUDIT",
    EXPORT_CSV: "EXPORT_CSV",
    CONFIGURE_SYSTEM: "CONFIGURE_SYSTEM",

    EXPORT_DB_JSON: "EXPORT_DB_JSON",
    IMPORT_DB_JSON: "IMPORT_DB_JSON"
  };

  const GLOBAL_LABEL = {
    [GLOBAL_ROLE.EXEC_COMMISSIONER]: "Commissioner of the RRSA — M.R.VR (CEO)",
    [GLOBAL_ROLE.EXEC_EVP]: "Executive Vice President — VP Pox",
    [GLOBAL_ROLE.EXEC_CAO]: "Chief Administrative Officer — CAO Shark",
    [GLOBAL_ROLE.EXEC_DAO]: "Director of Association Operations — DAO Will",
    [GLOBAL_ROLE.HEAD_RRSA_MEDIA]: "Head of RRSA Media",
    [GLOBAL_ROLE.MEDIA_TEAM]: "Sports Association Media Team",
    [GLOBAL_ROLE.OFFICIAL]: "Official (baseline)"
  };

  const LEAGUE_LABEL = {
    [LEAGUE_ROLE.LEAGUE_MANAGER]: "League Manager",
    [LEAGUE_ROLE.ASSIST_LEAGUE_MANAGER]: "Assistant League Manager",
    [LEAGUE_ROLE.HEAD_OF_REFEREES]: "Head of Referees",
    [LEAGUE_ROLE.LEAGUE_MEDIA_MANAGER]: "League Media Manager",
    [LEAGUE_ROLE.OFFICIAL]: "Official (Ref/Umpire/Judge/Staff)"
  };

  const GLOBAL_PERMS = {
    [GLOBAL_ROLE.EXEC_COMMISSIONER]: Object.values(PERM),
    [GLOBAL_ROLE.EXEC_EVP]: Object.values(PERM).filter(p => p !== PERM.MANAGE_USERS_FULL && p !== PERM.IMPORT_DB_JSON),
    [GLOBAL_ROLE.EXEC_CAO]: Object.values(PERM).filter(p => p !== PERM.MANAGE_USERS_FULL && p !== PERM.IMPORT_DB_JSON),
    [GLOBAL_ROLE.EXEC_DAO]: Object.values(PERM).filter(p => p !== PERM.MANAGE_USERS_FULL && p !== PERM.IMPORT_DB_JSON),
    [GLOBAL_ROLE.HEAD_RRSA_MEDIA]: [PERM.VIEW_MANAGER_DASH, PERM.VIEW_ALL_RECORDS, PERM.EXPORT_CSV],
    [GLOBAL_ROLE.MEDIA_TEAM]: [PERM.VIEW_MANAGER_DASH, PERM.VIEW_ALL_RECORDS],
    [GLOBAL_ROLE.OFFICIAL]: [PERM.VIEW_OFFICIAL_DASH]
  };

  const LEAGUE_PERMS = {
    [LEAGUE_ROLE.LEAGUE_MANAGER]: [
      PERM.VIEW_MANAGER_DASH, PERM.MANAGE_USERS,
      PERM.CREATE_ATTENDANCE_EVENTS, PERM.GRADE_ATTENDANCE,
      PERM.CREATE_PERFORMANCE_REVIEWS, PERM.VIEW_ALL_RECORDS, PERM.EXPORT_CSV
    ],
    [LEAGUE_ROLE.ASSIST_LEAGUE_MANAGER]: [
      PERM.VIEW_MANAGER_DASH, PERM.MANAGE_USERS,
      PERM.CREATE_ATTENDANCE_EVENTS, PERM.GRADE_ATTENDANCE,
      PERM.CREATE_PERFORMANCE_REVIEWS, PERM.VIEW_ALL_RECORDS, PERM.EXPORT_CSV
    ],
    [LEAGUE_ROLE.HEAD_OF_REFEREES]: [
      PERM.VIEW_MANAGER_DASH,
      PERM.CREATE_ATTENDANCE_EVENTS, PERM.GRADE_ATTENDANCE,
      PERM.CREATE_PERFORMANCE_REVIEWS, PERM.VIEW_ALL_RECORDS, PERM.EXPORT_CSV
    ],
    [LEAGUE_ROLE.LEAGUE_MEDIA_MANAGER]: [PERM.VIEW_MANAGER_DASH, PERM.VIEW_ALL_RECORDS],
    [LEAGUE_ROLE.OFFICIAL]: [PERM.VIEW_OFFICIAL_DASH]
  };

  function labelGlobal(roleKey) { return GLOBAL_LABEL[roleKey] || roleKey; }
  function labelLeague(roleKey) { return LEAGUE_LABEL[roleKey] || roleKey; }

  function getGlobalPerms(user) {
    const role = user?.globalRole || GLOBAL_ROLE.OFFICIAL;
    return GLOBAL_PERMS[role] || [];
  }
  function getLeaguePerms(user, league) {
    if (!league) return [];
    const lr = user?.leagueRoles?.[league]?.role || LEAGUE_ROLE.OFFICIAL;
    return LEAGUE_PERMS[lr] || [];
  }

  function hasPerm(user, perm, leagueContext = null) {
    if (!user) return false;
    const gp = getGlobalPerms(user);
    if (gp.includes(perm)) return true;
    return getLeaguePerms(user, leagueContext).includes(perm);
  }

  function isExec(user) {
    const gr = user?.globalRole;
    return gr === GLOBAL_ROLE.EXEC_COMMISSIONER ||
           gr === GLOBAL_ROLE.EXEC_EVP ||
           gr === GLOBAL_ROLE.EXEC_CAO ||
           gr === GLOBAL_ROLE.EXEC_DAO;
  }

  return { GLOBAL_ROLE, LEAGUE_ROLE, PERM, labelGlobal, labelLeague, hasPerm, isExec };
})();
