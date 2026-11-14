import { z } from "zod";
import type { StrategySection } from "./strategy";

export const INTERVIEW_TEMPLATE_VERSION = 1;
export const QUESTIONNAIRE_SOURCE = "https://docs.google.com/document/d/1XTxv8rKvCuUtlJCbT1TJHX7H8JqzlT-YndZZ3MWGSRY";
export const STAGES = [
 {id:1,title:"Your priorities",description:"Start with what matters to you, what you are exploring, and what you need."},
 {id:2,title:"Your experiences",description:"Explore one section at a time. Bullet points and small, ordinary moments are welcome."},
 {id:3,title:"Review together",description:"Correct your summary, review possible stories and themes, and decide what you want to share."},
] as const;
export const SECTION_LABELS: Record<string,string> = {A:"Getting started",B:"Your academics",C:"How you think",D:"What you do",E:"Where you come from",F:"Challenges and turning points",G:"Who you are",H:"Stories and specifics",I:"Where you are headed",J:"Fit and boundaries",P:"Your priorities and support"};
export type InterviewQuestion = {key:string;text:string;stage:number;section:string};
export const STUDENT_QUESTIONS: InterviewQuestion[] = [
  {
    "key": "A1",
    "text": "Your full name, current grade, and the year you expect to graduate high school.",
    "stage": 1,
    "section": "A"
  },
  {
    "key": "A2",
    "text": "Your high school's name and location. Is it public, private, charter, magnet, homeschool, or something else?",
    "stage": 1,
    "section": "A"
  },
  {
    "key": "A3",
    "text": "What you think you might want to study in college — or “undecided,” which is completely fine.",
    "stage": 1,
    "section": "A"
  },
  {
    "key": "A4",
    "text": "Any colleges already on your radar, and what drew you to them (even if it's just a name you've heard).",
    "stage": 1,
    "section": "A"
  },
  {
    "key": "A5",
    "text": "Do you already have a sense of what you'd like your application to say about you? (Totally fine to leave this blank for now.)",
    "stage": 3,
    "section": "A"
  },
  {
    "key": "B1",
    "text": "What classes are you taking this year? List any honors, AP, IB, or dual-enrollment courses you've taken across high school.",
    "stage": 2,
    "section": "B"
  },
  {
    "key": "B2",
    "text": "Your GPA (weighted and/or unweighted, if you know them), and your class rank if your school uses one.",
    "stage": 2,
    "section": "B"
  },
  {
    "key": "B3",
    "text": "Any test scores you have so far — SAT, ACT, PSAT, AP exams, or language / other proficiency tests.",
    "stage": 2,
    "section": "B"
  },
  {
    "key": "B4",
    "text": "Your strongest subject and your weakest — and why you think that is.",
    "stage": 2,
    "section": "B"
  },
  {
    "key": "B5",
    "text": "The class you've enjoyed most in your life, and what specifically made it click for you.",
    "stage": 2,
    "section": "B"
  },
  {
    "key": "B6",
    "text": "A subject, skill, or idea you'd keep learning about even if it were never graded or tested.",
    "stage": 2,
    "section": "B"
  },
  {
    "key": "B7",
    "text": "Anything in your record — a rough semester, a school change, an upward trend — that you'd want someone to understand the story behind.",
    "stage": 2,
    "section": "B"
  },
  {
    "key": "C1",
    "text": "What do you find yourself reading, watching, or falling down internet rabbit holes about, just for yourself?",
    "stage": 2,
    "section": "C"
  },
  {
    "key": "C2",
    "text": "A topic you could talk about for an hour with zero preparation.",
    "stage": 2,
    "section": "C"
  },
  {
    "key": "C3",
    "text": "A question you don't have the answer to but keep thinking about.",
    "stage": 2,
    "section": "C"
  },
  {
    "key": "C4",
    "text": "The last time you really changed your mind about something that mattered to you — what moved you?",
    "stage": 2,
    "section": "C"
  },
  {
    "key": "C5",
    "text": "Something you believe that most people around you don't.",
    "stage": 2,
    "section": "C"
  },
  {
    "key": "C6",
    "text": "When you get to choose what to learn, how do you go about it? Do you dive deep on one thing, sample widely, build something, argue about it?",
    "stage": 2,
    "section": "C"
  },
  {
    "key": "D1",
    "text": "List your activities — clubs, sports, arts, volunteering, research, hobbies — ranked by how much they actually matter to you, not by how impressive they sound. For each, jot down roughly how many hours a week and weeks a year, how long you've done it, and any role you've held.",
    "stage": 2,
    "section": "D"
  },
  {
    "key": "D2",
    "text": "Any leadership you've taken on — official (a title or elected role) or unofficial (the person everyone comes to, the one who makes things happen).",
    "stage": 2,
    "section": "D"
  },
  {
    "key": "D3",
    "text": "Any jobs, internships, or paid work — including anything for a family business.",
    "stage": 2,
    "section": "D"
  },
  {
    "key": "D4",
    "text": "Responsibilities you carry at home that wouldn't show up on a résumé — caring for family, translating, running a household, contributing income, looking after siblings.",
    "stage": 2,
    "section": "D"
  },
  {
    "key": "D5",
    "text": "Something you do regularly that isn't part of any club, team, or program — a personal project, a craft, a creative habit.",
    "stage": 2,
    "section": "D"
  },
  {
    "key": "E1",
    "text": "Who's in your household, and where do you fall among any siblings?",
    "stage": 2,
    "section": "E"
  },
  {
    "key": "E2",
    "text": "What languages are spoken at home?",
    "stage": 2,
    "section": "E"
  },
  {
    "key": "E3",
    "text": "Any cultural, religious, ethnic, or community identities that matter to you — and how big a part of daily life they are.",
    "stage": 2,
    "section": "E"
  },
  {
    "key": "E4",
    "text": "Will you be the first in your family to attend college in the U.S.? What do your parents or guardians do, and what's their educational background?",
    "stage": 2,
    "section": "E"
  },
  {
    "key": "E5",
    "text": "How would you describe the community you come from — your neighborhood, town, or school?",
    "stage": 2,
    "section": "E"
  },
  {
    "key": "E6",
    "text": "Is there anything about your life or circumstances that a college would never guess just from your grades and activities?",
    "stage": 2,
    "section": "E"
  },
  {
    "key": "F1",
    "text": "A real challenge, obstacle, or hardship you've faced — and how you responded to it.",
    "stage": 2,
    "section": "F"
  },
  {
    "key": "F2",
    "text": "A genuine failure or setback, and what happened afterward.",
    "stage": 2,
    "section": "F"
  },
  {
    "key": "F3",
    "text": "A moment when something shifted for you — in how you saw yourself, someone else, or the world.",
    "stage": 2,
    "section": "F"
  },
  {
    "key": "F4",
    "text": "A time you had to stand up for yourself or someone else, or ask for something you needed.",
    "stage": 2,
    "section": "F"
  },
  {
    "key": "F5",
    "text": "Something that used to be hard or scary for you that you now handle easily — what changed?",
    "stage": 2,
    "section": "F"
  },
  {
    "key": "G1",
    "text": "Three words a close friend would honestly use to describe you.",
    "stage": 2,
    "section": "G"
  },
  {
    "key": "G2",
    "text": "Three words a teacher would use.",
    "stage": 2,
    "section": "G"
  },
  {
    "key": "G3",
    "text": "Something you're proud of that would never show up on a transcript or activities list.",
    "stage": 2,
    "section": "G"
  },
  {
    "key": "G4",
    "text": "A contradiction in yourself — a way you're two things at once.",
    "stage": 2,
    "section": "G"
  },
  {
    "key": "G5",
    "text": "What are you like when nobody's assigning you anything and no one's watching? How do you spend genuinely free time?",
    "stage": 2,
    "section": "G"
  },
  {
    "key": "G6",
    "text": "How do you handle risk, boredom, and being wrong?",
    "stage": 2,
    "section": "G"
  },
  {
    "key": "H1",
    "text": "A small object that means a lot to you, and the story behind it.",
    "stage": 2,
    "section": "H"
  },
  {
    "key": "H2",
    "text": "A place you know inside out — one you could describe with your eyes closed.",
    "stage": 2,
    "section": "H"
  },
  {
    "key": "H3",
    "text": "A skill or bit of knowledge you have that seems useless but that you're weirdly good at.",
    "stage": 2,
    "section": "H"
  },
  {
    "key": "H4",
    "text": "The last time you completely lost track of time — what were you doing?",
    "stage": 2,
    "section": "H"
  },
  {
    "key": "H5",
    "text": "A moment you surprised yourself — said or did something you didn't know you had in you.",
    "stage": 2,
    "section": "H"
  },
  {
    "key": "H6",
    "text": "A specific person who changed you, and one real scene with them you still remember. (Not a summary of the whole relationship — an actual moment.)",
    "stage": 2,
    "section": "H"
  },
  {
    "key": "H7",
    "text": "Something funny, strange, or a little embarrassing about you that still says something true about who you are.",
    "stage": 2,
    "section": "H"
  },
  {
    "key": "H8",
    "text": "A habit, routine, or way of doing things that's distinctly yours.",
    "stage": 2,
    "section": "H"
  },
  {
    "key": "I1",
    "text": "Why do you want to go to college — beyond it being the expected next step? What do you actually want from it?",
    "stage": 1,
    "section": "I"
  },
  {
    "key": "I2",
    "text": "Any careers or directions you're curious about, even loose or unlikely ones.",
    "stage": 1,
    "section": "I"
  },
  {
    "key": "I3",
    "text": "Something you'd like to see change — in your community, a field you care about, or the world — and any sense of how you'd want to help.",
    "stage": 3,
    "section": "I"
  },
  {
    "key": "I4",
    "text": "Do you see a thread connecting where you've come from to where you want to go? Describe it, even roughly.",
    "stage": 3,
    "section": "I"
  },
  {
    "key": "J1",
    "text": "What matters most to you in a college? (Size, location, city vs. small town, academic feel, social scene, specific programs, distance from home…)",
    "stage": 1,
    "section": "J"
  },
  {
    "key": "J2",
    "text": "Any hard requirements we should plan around — financial aid needs, staying within a certain distance, a specific program or major, family considerations.",
    "stage": 1,
    "section": "J"
  },
  {
    "key": "J3",
    "text": "Do any of these apply to you: recruited athlete, legacy, a standout talent (arts, research, business), a significant unusual circumstance, or another distinguishing factor?",
    "stage": 1,
    "section": "J"
  },
  {
    "key": "J4",
    "text": "Where's your thinking right now on reach / target / safety schools — and how set or open is your list?",
    "stage": 1,
    "section": "J"
  },
  {
    "key": "J5",
    "text": "Is there anything you know you don't want to write about or highlight? (Just as useful for us to know as what you do.)",
    "stage": 3,
    "section": "J"
  },
  {
    "key": "J6",
    "text": "Anything important about you that none of these questions managed to reach?",
    "stage": 3,
    "section": "J"
  },
  {
    "key": "P1",
    "text": "Choose your three highest college priorities, in order. It is okay to leave some undecided.",
    "stage": 1,
    "section": "P"
  },
  {
    "key": "P2",
    "text": "Where could you be flexible? Describe one tradeoff you would consider and one requirement you would not give up.",
    "stage": 1,
    "section": "P"
  },
  {
    "key": "P3",
    "text": "What helps you learn, feel included, and ask for support? What would you want available at college?",
    "stage": 1,
    "section": "P"
  },
  {
    "key": "P4",
    "text": "What excites or worries you about this process, and how would you like your counselor to help?",
    "stage": 1,
    "section": "P"
  }
];
export const PARENT_QUESTIONS: InterviewQuestion[] = [
 {key:"R1",text:"What do you hope your student gains from college, in their own life?",stage:1,section:"R"},
 {key:"R2",text:"What financial, location, family or timing constraints should the counselor plan around? Share only what is useful for planning.",stage:1,section:"R"},
 {key:"R3",text:"Where do your preferences and your student's preferences differ? Where can you be flexible?",stage:1,section:"R"},
 {key:"R4",text:"Describe a specific moment that shows a strength, interest or quality in your student.",stage:2,section:"R"},
 {key:"R5",text:"What responsibilities, changes or circumstances might help the counselor understand your student's experience?",stage:2,section:"R"},
 {key:"R6",text:"When does your student seem most engaged, comfortable or proud? What support helps them thrive?",stage:2,section:"R"},
 {key:"R7",text:"How would you like to participate, and what decisions should your student lead?",stage:3,section:"R"},
 {key:"R8",text:"What would you like to discuss privately with the counseling team? Is there anything else they should understand?",stage:3,section:"R"},
];
export const PRIORITIES = ["Academic programs","Freedom to explore","Cost and financial aid","Distance from home","Campus size","Location and setting","Community and belonging","Learning and support","Career opportunities"] as const;
export const ANSWER_STATES = ["answered","unsure","skip","discuss"] as const;
export const ANSWER_LABELS: Record<typeof ANSWER_STATES[number],string> = {answered:"My response",unsure:"Still exploring",skip:"Prefer to skip",discuss:"Discuss with my counselor"};
export const INTERVIEW_AUDIENCES = ["counselor","family"] as const;
export const BANK_REVIEW_STATES = ["draft","confirmed","revisit"] as const;
export const answerSchema = z.object({studentId:z.uuid(),questionKey:z.string(),answer:z.string().trim().max(12000),state:z.enum(ANSWER_STATES),audience:z.enum(INTERVIEW_AUDIENCES),revision:z.number().int().min(0)});
export const bankSchema = z.object({studentId:z.uuid(),id:z.uuid().optional(),kind:z.enum(["story","narrative"]),title:z.string().trim().min(1).max(160),body:z.string().trim().min(1).max(12000),reflection:z.string().trim().max(6000),tags:z.array(z.string().trim().min(1).max(40)).max(12),audience:z.enum(INTERVIEW_AUDIENCES),reviewState:z.enum(BANK_REVIEW_STATES),sourceAnswerId:z.uuid().nullable(),storyIds:z.array(z.uuid()).max(20),revision:z.number().int().min(0)});
export function questionsFor(kind:"student"|"parent") { return kind==="student"?STUDENT_QUESTIONS:PARENT_QUESTIONS; }
export function questionFor(key:string,kind:"student"|"parent") { return questionsFor(kind).find(q=>q.key===key); }
export function orderedPriorities(values:string[]) {
 const selected=values.filter(Boolean);
 if(selected.some(v=>!PRIORITIES.includes(v as typeof PRIORITIES[number]))||new Set(selected).size!==selected.length) return null;
 return values.slice(0,values.findLastIndex(Boolean)+1).join("\n");
}
export function familyVisibleEntries(entries:BankEntry[]) {
 const shared=entries.filter(e=>e.audience==="family"&&e.review_state==="confirmed");
 const stories=new Set(shared.filter(e=>e.kind==="story").map(e=>e.id));
 return shared.filter(e=>e.kind==="story" || (e.story_ids.length>0&&e.story_ids.every(id=>stories.has(id))));
}
export type InterviewAnswer = {id:string;student_id:string;respondent_user_id:string;respondent_kind:"student"|"parent";question_key:string;answer:string;state:typeof ANSWER_STATES[number];audience:typeof INTERVIEW_AUDIENCES[number];revision:number;updated_at:string};
export type BankEntry = {id:string;student_id:string;kind:"story"|"narrative";title:string;body:string;reflection:string;tags:string[];audience:typeof INTERVIEW_AUDIENCES[number];review_state:typeof BANK_REVIEW_STATES[number];created_by_user_id:string;source_answer_id:string|null;source_excerpt:string|null;story_ids:string[];revision:number;updated_at:string};
export type InterviewFollowup = {id:string;student_id:string;recipient_user_id:string;question:string;reply:string;status:"open"|"answered"|"closed";audience:typeof INTERVIEW_AUDIENCES[number];source_answer_id:string|null;revision:number;updated_at:string};
export type InterviewWorkspace = {student:{id:string;name:string;school:string|null;graduationYear:number};actorId:string;role:string;canCounsel:boolean;kind:"student"|"parent"|"staff";answers:InterviewAnswer[];entries:BankEntry[];strategySections:StrategySection[];followups:InterviewFollowup[];checkpoints:{respondent_user_id:string;stage:number;reviewed_at:string}[];respondents:{id:string;name:string;kind:"student"|"parent"}[];essays:{id:string;title:string;visibility_scope:string}[];links:{entry_id:string;essay_id:string}[]};
