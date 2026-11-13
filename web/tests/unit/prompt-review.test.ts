import { describe, expect, it } from "vitest";
import { effectivePromptSets, promptReviewDue, promptReviewSchema, promptSlot } from "@/lib/colleges/prompt-review";
import { canMaintainCollegePrompts, canPublishCollegePrompts } from "@/lib/auth/authorize";
const prompt = { prompt_key:"story", title:"Story", prompt_text:"Tell a story.", word_limit:250, character_limit:null, requirement:"required", text_kind:"summary" };
const content = { coverage:"verified", source_url:"https://example.edu/apply", verified_on:"2026-11-13", review_due_on:"2027-08-01", notes:"Visible guidance", review_notes:"Checked current application", prompts:[prompt] };
describe("annual prompt maintenance",()=>{
  it("rejects duplicate response slots, invalid limits, unsafe sources and contradictory coverage",()=>{
    expect(promptReviewSchema.safeParse(content).success).toBe(true);
    for(const change of [{prompts:[prompt,prompt]}, {prompts:[{...prompt,word_limit:0}]}, {source_url:"javascript:alert(1)"}, {source_url:"https://secret@example.edu/apply"}, {coverage:"no_supplement"}])
      expect(promptReviewSchema.safeParse({...content,...change}).success).toBe(false);
    expect(promptReviewSchema.safeParse({...content,coverage:"no_supplement",prompts:[{...prompt,requirement:"conditional"}]}).success).toBe(true);
  });
  it("never uses drafts or archives, and selects the firm's publication regardless of result order",()=>{
    const shared={scorecard_id:1,entry_year:2027,firm_id:null,review_state:"published",id:"shared"};
    const own={...shared,firm_id:"alpha",id:"own"};
    const draft={...own,review_state:"draft",id:"draft"};
    for (const sets of [[shared,own,draft],[draft,own,shared]]) expect(effectivePromptSets(sets).map(s=>s.id)).toEqual(["own"]);
    expect(effectivePromptSets([{...own,review_state:"archived"}])).toEqual([]);
    expect(effectivePromptSets([shared,{...own,entry_year:2028}])).toHaveLength(2);
  });
  it("flags unchecked, explicitly unverified and overdue sources by calendar date",()=>{
    expect(promptReviewDue({coverage:"verified",verified_on:"2026-11-13"},"2027-11-12")).toBe(false);
    expect(promptReviewDue({coverage:"verified",verified_on:"2026-11-13"},"2027-11-13")).toBe(true);
    expect(promptReviewDue({coverage:"verified",verified_on:"2026-11-13",review_due_on:"2027-08-01"},"2027-08-01")).toBe(true);
    expect(promptReviewDue({coverage:"needs_review",verified_on:"2026-11-13"},"2026-11-13")).toBe(true);
    expect(promptReviewDue({coverage:"no_supplement",verified_on:null},"2026-11-13")).toBe(true);
  });
  it("keeps assignment identity stable across publications but separate by school and year",()=>{
    expect(promptSlot(1,2027,"story")).toBe("1:2027:story");
    expect(promptSlot(1,2027,"story")).not.toBe(promptSlot(1,2028,"story"));
  });
  it("allows counselors to prepare reviews, reserves publication for owners and admins, and denies portal roles",()=>{
    expect(canMaintainCollegePrompts("counselor")).toBe(true);
    expect(canPublishCollegePrompts("counselor")).toBe(false);
    for(const role of ["firm_owner","firm_admin"]) expect(canPublishCollegePrompts(role)).toBe(true);
    for(const role of ["student","parent_guardian","read_only_staff"]) {
      expect(canMaintainCollegePrompts(role)).toBe(false);
      expect(canPublishCollegePrompts(role)).toBe(false);
    }
  });
});
