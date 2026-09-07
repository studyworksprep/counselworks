/**
 * Per-browser layout preferences (fix plan 13.0): whether the main sidebar
 * and the student/family rails are collapsed. Stored as cookies rather than
 * localStorage so the server renders the chosen state on the first paint —
 * no flash of a roster a counselor collapsed to keep it off a shared
 * screen. Conveniences only: nothing here is authorization.
 */
export const SIDEBAR_COOKIE = "cw_sidebar";
export const STUDENT_RAIL_COOKIE = "cw_student_rail";
export const FAMILY_RAIL_COOKIE = "cw_family_rail";
const COLLAPSED = "collapsed";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function isCollapsedValue(value: string | undefined): boolean {
  return value === COLLAPSED;
}

/** Client side: persist a collapse choice for future server renders. */
export function persistCollapsed(name: string, collapsed: boolean) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${collapsed ? COLLAPSED : "open"}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
}
