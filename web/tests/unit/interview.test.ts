import { describe,expect,it } from "vitest";
import { bankConsentIssue, interviewBankWriteAllowed, interviewResponseWriteAllowed } from "@/lib/auth/interview";
import { ANSWER_STATES, STUDENT_QUESTIONS, PARENT_QUESTIONS, familyVisibleEntries, orderedPriorities, questionFor, type BankEntry } from "@/lib/interview/template";
describe("interview template and consent",()=>{
 it("keeps all 58 original questions and four additions in exactly one stage",()=>{
  expect(STUDENT_QUESTIONS.filter(q=>/^[A-J]/.test(q.key))).toHaveLength(58);
  expect(STUDENT_QUESTIONS).toHaveLength(62);
  expect(new Set(STUDENT_QUESTIONS.map(q=>q.key)).size).toBe(62);
  expect(STUDENT_QUESTIONS.every(q=>[1,2,3].includes(q.stage))).toBe(true);
  expect(questionFor("A5","student")?.stage).toBe(3);
  expect(questionFor("H6","student")?.stage).toBe(2);
 });
 it("keeps parent questions independent from student responses",()=>{
  expect(PARENT_QUESTIONS).toHaveLength(8);
  expect(questionFor("R1","student")).toBeUndefined();
  expect(questionFor("A1","parent")).toBeUndefined();
  expect(ANSWER_STATES).toEqual(["answered","unsure","skip","discuss"]);
 });
 it("accepts partially undecided priorities but rejects duplicates and unknown choices",()=>{
  expect(orderedPriorities(["Cost and financial aid","","Community and belonging"])).toBe("Cost and financial aid\n\nCommunity and belonging");
  expect(orderedPriorities(["","Cost and financial aid",""])).toBe("\nCost and financial aid");
  expect(orderedPriorities(["","",""])).toBe("");
  expect(orderedPriorities(["Academic programs","Academic programs",""])).toBeNull();
  expect(orderedPriorities(["Unrecognized factor"])).toBeNull();
 });
 it.each([
  ["student","own_student",true],["student","none",false],["parent_guardian","family_parent",false],
  ["counselor","assigned_staff",true],["counselor","unassigned_staff",false],["read_only_staff","firm_staff",false],
  ["firm_owner","firm_staff",true],
 ])("limits bank writes for %s / %s",(role,relationship,expected)=>{
  expect(interviewBankWriteAllowed(String(role),String(relationship))).toBe(expected);
 });
 it.each([
  ["student","own_student",true],["parent_guardian","family_parent",true],["parent_guardian","none",false],
  ["counselor","assigned_staff",false],["firm_owner","firm_staff",false],
 ])("reserves original response edits for their respondent: %s / %s",(role,relationship,expected)=>{
  expect(interviewResponseWriteAllowed(String(role),String(relationship))).toBe(expected);
 });
 it("does not let staff confirm or expand family sharing even without database RLS",()=>{
  expect(bankConsentIssue("counselor",{audience:"family",reviewState:"draft"})).toBe("Student chooses family sharing");
  expect(bankConsentIssue("firm_owner",{audience:"counselor",reviewState:"confirmed"})).toBe("Student confirms revised stories and narratives");
  expect(bankConsentIssue("counselor",{audience:"family",reviewState:"draft"},{audience:"counselor"})).toBe("Student chooses family sharing");
  expect(bankConsentIssue("counselor",{audience:"family",reviewState:"draft"},{audience:"family"})).toBeNull();
  expect(bankConsentIssue("student",{audience:"family",reviewState:"confirmed"})).toBeNull();
 });
 it("withdraws a parent narrative when any supporting story is no longer family-shared",()=>{
  const entry=(id:string,kind:string,audience:string,story_ids:string[]=[])=>({id,kind,audience,story_ids,review_state:"confirmed"}) as BankEntry;
  const shared=entry("shared","story","family"),privateStory=entry("private","story","counselor");
  const visible=entry("visible","narrative","family",["shared"]),hidden=entry("hidden","narrative","family",["shared","private"]);
  expect(familyVisibleEntries([shared,privateStory,visible,hidden,entry("empty","narrative","family")]).map(e=>e.id)).toEqual(["shared","visible"]);
  expect(familyVisibleEntries([{...shared,audience:"counselor"},visible])).toEqual([]);
  expect(familyVisibleEntries([{...shared,review_state:"draft"},visible])).toEqual([]);
 });
});
