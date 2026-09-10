import { describe, expect, it } from "vitest";
import { workflowWeekBounds } from "@/lib/tasks/due-date";
import { formatTimeZone } from "@/lib/utils";
import { TASK_STATUS_OPTIONS, TASK_STATUS_VALUES, taskPriorityLabel, taskOwnerRoleLabel } from "@/lib/constants/tasks";

describe("UX3 calendar and labels", () => {
  it("uses seven local dates with an exclusive DST-aware end", () => {
    expect(workflowWeekBounds(Date.parse("2026-03-07T18:00:00Z"), "America/New_York"))
      .toEqual({start: "2026-03-07T05:00:00.000Z", end: "2026-03-14T04:00:00.000Z"});
    expect(workflowWeekBounds(Date.parse("2026-10-31T18:00:00Z"), "America/New_York"))
      .toEqual({start: "2026-10-31T04:00:00.000Z", end: "2026-11-07T05:00:00.000Z"});
  });
  it("names the timezone at the due instant, including winter versus summer", () => {
    expect(formatTimeZone("America/New_York", "2026-01-10T23:00:00Z")).toBe("Eastern Standard Time");
    expect(formatTimeZone("America/New_York", "2026-07-10T23:00:00Z")).toBe("Eastern Daylight Time");
  });
  it("exposes every status with shared labels and safe owner fallbacks", () => {
    expect(new Set(TASK_STATUS_OPTIONS.map(o => o.value))).toEqual(TASK_STATUS_VALUES);
    expect(taskPriorityLabel("medium")).toBe("Medium");
    expect(taskOwnerRoleLabel("firm_owner")).toBe("Counseling team");
    expect(taskOwnerRoleLabel("parent")).toBe("Parent or guardian");
    expect(taskOwnerRoleLabel("private-unknown")).toBe("Responsible person");
  });
});
