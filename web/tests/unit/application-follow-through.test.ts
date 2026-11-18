import { describe, it, expect } from "vitest";
import {
  followThroughSchema,
  portalUrl,
  followThroughResolved,
} from "@/lib/applications/follow-through";
const base = {
  applicationId: "c6200000-0000-4000-8000-000000000001",
  revision: 0,
  kind: "material",
  title: "Transcript",
  status: "needed",
  sentOn: null,
  receivedOn: null,
  checkedOn: null,
  portalUrl: "",
  notes: "",
  documentId: null,
};
describe("application follow-through input", () => {
  it("requires actual receipt evidence and keeps sent separate", () => {
    expect(
      followThroughSchema.safeParse({ ...base, status: "received" }).success,
    ).toBe(false);
    expect(
      followThroughSchema.safeParse({
        ...base,
        status: "sent",
        sentOn: "2026-11-12",
      }).success,
    ).toBe(true);
    expect(followThroughResolved("material", "sent")).toBe(false);
    expect(
      followThroughSchema.safeParse({
        ...base,
        status: "received",
        receivedOn: "2026-11-12",
        sentOn: "2026-11-13",
      }).success,
    ).toBe(false);
    expect(
      followThroughSchema.safeParse({
        ...base,
        status: "received",
        receivedOn: "2026-02-30",
      }).success,
    ).toBe(false);
  });
  it("does not accept portal activation as a college acknowledgment", () => {
    expect(
      followThroughSchema.safeParse({
        ...base,
        kind: "receipt",
        status: "active",
      }).success,
    ).toBe(false);
    expect(
      followThroughSchema.safeParse({
        ...base,
        kind: "portal",
        status: "active",
        portalUrl: "https://admissions.example.edu/login",
      }).success,
    ).toBe(true);
    expect(followThroughResolved("portal", "active")).toBe(false);
    expect(followThroughResolved("receipt", "received")).toBe(true);
    expect(followThroughResolved("material", "waived")).toBe(true);
  });
  it("rejects executable or credential-bearing portal addresses", () => {
    for (const value of [
      "javascript:alert(1)",
      "http://college.edu",
      "https://user:secret@college.edu",
    ])
      expect(portalUrl.safeParse(value).success).toBe(false);
  });
  it("requires the original revision on edits and can preserve an unavailable attachment", () => {
    expect(
      followThroughSchema.safeParse({ ...base, id: base.applicationId })
        .success,
    ).toBe(false);
    expect(
      followThroughSchema.safeParse({
        ...base,
        id: base.applicationId,
        revision: 3,
        documentId: undefined,
      }).success,
    ).toBe(true);
  });
});
