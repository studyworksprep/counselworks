"use server";

import { resolveUserAndFirm } from "../auth/resolve";
import { inngest } from "../queue/inngest";

export async function refreshReports() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  await inngest.send({
    name: "reports/refresh",
    data: { firmId: ctx.firmId },
  });

  return { success: true };
}
