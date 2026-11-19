import { describe, expect, it } from "vitest";
import { NAV, areaIconForPath } from "@/components/layout/nav-config";
import { ICONS } from "@/components/ui/icon";
import { STAGE_ICONS, stageIcon } from "@/components/applications/stage-icons";
import { APPLICATION_STAGES } from "@/lib/constants/applications";

/**
 * The icon vocabulary (design refresh): a destination's icon follows it from
 * the sidebar to the page header, so each sidebar item needs its own glyph
 * and every route must resolve to the area it belongs to.
 */
describe("icon system", () => {
  it("gives every sidebar destination its own glyph within a shell", () => {
    for (const [shell, groups] of Object.entries(NAV)) {
      const glyphs = groups.flatMap((g) => g.items.map((i) => ICONS[i.icon]));
      expect(new Set(glyphs).size, `${shell} shell reuses an icon`).toBe(glyphs.length);
    }
  });

  it("titles each page with the icon of the area it sits in", () => {
    expect(areaIconForPath("/applications")).toBe("applications");
    expect(areaIconForPath("/applications/123/decisions")).toBe("applications");
    expect(areaIconForPath("/colleges/discrepancies")).toBe("catalog");
    expect(areaIconForPath("/colleges/abc")).toBe("colleges");
    expect(areaIconForPath("/settings")).toBe("settings");
    expect(areaIconForPath("/student-essays/planning")).toBe("essayPlanning");
    expect(areaIconForPath("/student-essays/abc")).toBe("essays");
    expect(areaIconForPath("/family-booking")).toBe("schedule");
    expect(areaIconForPath("/family-agreements/abc")).toBe("billing");
    // A prefix match needs a path boundary: /students is not /student-*.
    expect(areaIconForPath("/student-tasks")).toBe("tasks");
    expect(areaIconForPath("/sign-in")).toBeNull();
    expect(areaIconForPath(null)).toBeNull();
  });

  it("gives every application stage a distinct glyph", () => {
    const names = APPLICATION_STAGES.map((s) => STAGE_ICONS[s.value]);
    expect(names.every((n) => n in ICONS)).toBe(true);
    expect(new Set(names.map((n) => ICONS[n])).size).toBe(names.length);
    expect(stageIcon("not_a_stage")).toBe("stageNotStarted");
  });
});
