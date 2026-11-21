import { createServer, type Server } from "node:http";

/** A real HTTP contract fixture at the SDK boundary. Never imported by app code;
 * tests require a loopback app/database and point only that app at this server. */
export async function startInterviewAiProvider() {
  const calls: {feature?:string;savedVersion?:{id:string;number:number;body:string};connectedEntryIds?:string[];mode:string;respondent:string;sources:{key:string;label:string;text:string}[];allowedQuestions:{key:string;text:string}[]}[]=[];
  const controls:{fail:boolean;needsContext:boolean;beforeResponse:(()=>Promise<void>)|null}={fail:false,needsContext:false,beforeResponse:null};
  const server:Server=createServer(async(req,res)=>{
    if(req.url!=="/v1/messages"||req.method!=="POST"){res.writeHead(404);res.end();return;}
    try {
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const envelope=JSON.parse(Buffer.concat(chunks).toString()),input=JSON.parse(envelope.messages[0].content) as typeof calls[number];calls.push(input);
      if(controls.beforeResponse)await controls.beforeResponse();
      if(controls.fail){res.writeHead(503,{"content-type":"application/json"});res.end(JSON.stringify({type:"error",error:{type:"overloaded_error",message:"Synthetic provider failure"}}));return;}
      const source=input.sources[0],title=`AI ${input.mode} suggestion`,body=input.mode==="questions"?"What did you try when the first repair did not work?":input.mode==="story"?"The student repaired a workshop item with a friend.":input.mode==="narrative"?"A possible theme is learning through patient experimentation.":"Explore patient experimentation as a possible strength; confirm this interpretation with the student.";
      const interviewResult=controls.needsContext && input.mode!=="questions" ? {outcome:"needs_more_context",items:[],contextGap:{reason:"The selected material does not yet explain which detail the student wants to explore.",followUpQuestion:"Which detail from this selected material, if any, would you like to explore further?",sourceKeys:source?[source.key]:[]}} : {outcome:"suggestions",contextGap:null,items:[{title,body,reason:"An experience worth exploring, not a confirmed conclusion.",sourceKeys:source?[source.key]:[],questionKey:input.mode==="questions"?(input.allowedQuestions.find(q=>q.key==="B1")??input.allowedQuestions[0])?.key:null,sectionKey:input.mode==="strategy"?"strengths":null}]};
      const bank=input.sources.find(s=>s.key.startsWith("bank:")),bankId=bank?.key.slice(5),sourceKeys=input.sources.map(s=>s.key);
      const planningResult=input.feature!=="essay_planning"?interviewResult:input.mode==="story_matches"?{matches:bankId?[{title:"Explore a real design decision",entryIds:[bankId],angle:"Which decision changed the next workshop attempt?",reason:"The selected repair may fit the assigned question about a decision; the student must choose its meaning.",questions:["Which choice mattered and what do you remember?"],sourceKeys}]:[],gaps:bankId?[]:["Confirm a real story before choosing an angle."]}:{purpose:"What did trying another design change?",beats:[{heading:"A decision to explore",notes:"Which choice mattered? Describe the real details in your own words.",entryIds:bankId&&input.connectedEntryIds?.includes(bankId)?[bankId]:[],sourceKeys},{heading:"Reflect in your own words",notes:"What do you think changed? Leave uncertain details open until you remember them.",entryIds:[],sourceKeys}],gaps:["The student still needs to choose the specific details."]};
      const result=input.feature==="saved_version_essay_coaching"?{assessment:"Explore the meaning of this saved passage in your own words.",suggestions:[{category:"specificity",quote:input.savedVersion?.body.split("\n")[0]??null,observation:"The saved draft records an attempt but leaves its meaning open.",question:"What changed about the way you approached the next attempt?",sourceKeys}],gaps:["The student should choose the details and language."]}:planningResult;
      res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"msg_local_interview_fixture",type:"message",role:"assistant",model:envelope.model,content:[{type:"text",text:JSON.stringify(result)}],stop_reason:"end_turn",stop_sequence:null,usage:{input_tokens:100,output_tokens:100}}));
    }catch{res.writeHead(500);res.end();}
  });
  await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(4319,"127.0.0.1",()=>resolve());});
  return {calls,controls,close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
