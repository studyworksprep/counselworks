import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked=vi.hoisted(()=>({actor:vi.fn(),access:vi.fn(),workspace:vi.fn(),generate:vi.fn(),from:vi.fn(),rpc:vi.fn(),refresh:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:mocked.refresh}));
vi.mock("@/lib/auth/resolve",()=>({resolveUserAndFirm:mocked.actor}));
vi.mock("@/lib/auth/student-ai",()=>({requireStudentAiAccess:mocked.access}));
vi.mock("@/lib/db/queries",()=>({getStudentAiWorkspace:mocked.workspace}));
vi.mock("@/lib/db/client",()=>({getDb:()=>({from:mocked.from,rpc:mocked.rpc})}));
vi.mock("@/lib/ai/interview-assistance",()=>({generateInterviewAssistance:mocked.generate}));
import { requestStudentAiAssistance, acceptStudentAiSuggestion } from "@/lib/actions/student-ai";
const id=(n:number)=>`a6400000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const source={kind:"answer",id:id(1),revision:1,stamp:"a".repeat(32),label:"B1",questionKey:"B1",entryKind:null,text:"A fictional repair"};
const input={studentId:id(2),recipientId:id(3),mode:"questions",stage:2,refs:[{kind:source.kind,id:source.id,revision:source.revision,stamp:source.stamp}]};
const workspace={context:{recipientKind:"student",sources:[source],excludedQuestionKeys:[]},requests:[]};
let writes:{table:string;patch:unknown}[];
beforeEach(()=>{
 vi.clearAllMocks();writes=[];mocked.actor.mockResolvedValue({firmId:id(4),dbUserId:id(3),role:"student"});mocked.access.mockResolvedValue(undefined);mocked.workspace.mockResolvedValue(workspace);
 mocked.generate.mockResolvedValue({result:{outcome:"suggestions",contextGap:null,items:[{title:"Explore",body:"What happened?",reason:"Specific action",sourceKeys:[`answer:${id(1)}`],questionKey:"B1",sectionKey:null}]},model:"test-model",usage:{input_tokens:10,output_tokens:20,cache_creation_input_tokens:0,cache_read_input_tokens:0}});
 mocked.from.mockImplementation((table:string)=>{
  const result={data:{id:id(5)},error:null};
  const chain={insert:(patch:unknown)=>{writes.push({table,patch});return chain;},update:(patch:unknown)=>{writes.push({table,patch});return chain;},select:()=>chain,eq:()=>chain,single:async()=>result,maybeSingle:async()=>result,then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};
  return chain;
 });
});
describe("interview AI action boundaries",()=>{
 it("stores a cited needs-more-context result privately without creating story or strategy records",async()=>{
  mocked.generate.mockResolvedValueOnce({result:{outcome:"needs_more_context",items:[],contextGap:{reason:"A detail is missing.",followUpQuestion:"Which detail would you like to explore?",sourceKeys:[`answer:${id(1)}`]}},model:"test-model",usage:{input_tokens:10,output_tokens:20}});
  expect(await requestStudentAiAssistance({...input,mode:"story"})).toHaveProperty("data");
  expect(writes.some(w=>JSON.stringify(w.patch).includes('"needs_more_context"'))).toBe(true);
  expect(writes.every(w=>["student_ai_requests","ai_usage_events"].includes(w.table))).toBe(true);
 });
 it("does not return a context gap after its cited source is withdrawn in flight",async()=>{
  mocked.generate.mockResolvedValueOnce({result:{outcome:"needs_more_context",items:[],contextGap:{reason:"A detail is missing.",followUpQuestion:"Which detail would you like to explore?",sourceKeys:[`answer:${id(1)}`]}},model:"test-model",usage:{}});
  mocked.workspace.mockResolvedValueOnce(workspace).mockResolvedValueOnce({...workspace,context:{...workspace.context,sources:[]}});
  expect(await requestStudentAiAssistance({...input,mode:"story"})).toHaveProperty("error");
  expect(writes.some(w=>JSON.stringify(w.patch).includes('"ready"'))).toBe(false);
 });
 it("refuses a student's attempt to accept a gap through the proposal action",async()=>{
  mocked.workspace.mockResolvedValue({...workspace,requests:[{id:id(5),mode:"story",result:{outcome:"needs_more_context",items:[],contextGap:{reason:"A detail is missing.",followUpQuestion:"What happened?",sourceKeys:[`answer:${id(1)}`]}}}]});
  const form=new FormData();for(const [key,value]of Object.entries({student_id:id(2),recipient_id:id(3),request_id:id(5),index:"0",title:"Pretend story",body:"Pretend prose",section_revision:"0"}))form.set(key,value);
  expect(await acceptStudentAiSuggestion(form)).toHaveProperty("error");expect(mocked.rpc).not.toHaveBeenCalled();
 });
 it("does not call the provider for unauthenticated or denied requests",async()=>{
  mocked.actor.mockResolvedValueOnce(null);expect(await requestStudentAiAssistance(input)).toHaveProperty("error");expect(mocked.generate).not.toHaveBeenCalled();
  mocked.access.mockRejectedValueOnce(new Error("denied"));expect(await requestStudentAiAssistance(input)).toHaveProperty("error");expect(mocked.generate).not.toHaveBeenCalled();
 });
 it("rejects stale selected context before spending or sending student text",async()=>{
  expect(await requestStudentAiAssistance({...input,refs:[{...input.refs[0],revision:999}]})).toHaveProperty("error");expect(mocked.from).not.toHaveBeenCalled();expect(mocked.generate).not.toHaveBeenCalled();
 });
 it("rechecks sources and suppresses model output after in-flight withdrawal",async()=>{
  mocked.workspace.mockResolvedValueOnce(workspace).mockResolvedValueOnce({...workspace,context:{...workspace.context,sources:[]}});
  const result=await requestStudentAiAssistance(input);expect(result).toHaveProperty("error");expect(result).not.toHaveProperty("data");
  expect(writes.some(w=>JSON.stringify(w.patch).includes('"ready"'))).toBe(false);
 });
 it("rechecks assignment after generation and returns no derived text when access was revoked",async()=>{
  mocked.access.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("assignment withdrawn"));
  expect(await requestStudentAiAssistance(input)).toHaveProperty("error");expect(writes.some(w=>JSON.stringify(w.patch).includes('"ready"'))).toBe(false);
 });
 it("suppresses a question when its topic becomes skipped during generation",async()=>{
  mocked.workspace.mockResolvedValueOnce(workspace).mockResolvedValueOnce({...workspace,context:{...workspace.context,excludedQuestionKeys:["B1"]}});
  expect(await requestStudentAiAssistance(input)).toHaveProperty("error");expect(writes.some(w=>JSON.stringify(w.patch).includes('"ready"'))).toBe(false);
 });
 it("sends only selected material, saves suggestions separately, and records token usage",async()=>{
  expect(await requestStudentAiAssistance(input)).toHaveProperty("data");expect(mocked.generate.mock.calls[0][2]).toEqual([source]);
  expect(writes.some(w=>w.table==="ai_usage_events")).toBe(true);expect(writes.every(w=>["student_ai_requests","ai_usage_events"].includes(w.table))).toBe(true);
 });
 it("handles provider failures without exposing provider errors or changing writing",async()=>{
  mocked.generate.mockRejectedValueOnce(new Error("SECRET provider body"));const result=await requestStudentAiAssistance(input);
  expect(JSON.stringify(result)).not.toContain("SECRET");expect(result).toHaveProperty("error");expect(writes.some(w=>JSON.stringify(w.patch).includes('"failed"'))).toBe(true);
 });
});
