import { cookies } from "next/headers";
import {
  SIDEBAR_COOKIE,
  STUDENT_RAIL_COOKIE,
  isCollapsedValue,
} from "./layout-prefs";

/** Server side: read the collapse choices for this browser. */
export async function readLayoutPrefs(): Promise<{
  sidebarCollapsed: boolean;
  studentRailCollapsed: boolean;
}> {
  const jar = await cookies();
  return {
    sidebarCollapsed: isCollapsedValue(jar.get(SIDEBAR_COOKIE)?.value),
    studentRailCollapsed: isCollapsedValue(jar.get(STUDENT_RAIL_COOKIE)?.value),
  };
}
