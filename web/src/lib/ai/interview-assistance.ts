import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AI_MODEL, extractUsage, getAnthropicClient } from "./client";
import { assistanceResultSchema, INTERVIEW_ASSISTANCE_SYSTEM, contextKey, contextSourceLabel, validateAssistance, type AssistanceMode, type StudentAiContext, type StudentContextSource } from "./student-context";
import type { InterviewQuestion } from "../interview/template";

/** Uses the established provider and credentials. No additional vendor receives
 * student data. Inputs are explicitly selected, current recipient-visible text. */
export async function generateInterviewAssistance(mode: AssistanceMode, context: StudentAiContext, sources: StudentContextSource[], questions: InterviewQuestion[]) {
  const response = await getAnthropicClient().messages.parse({
    model: AI_MODEL, max_tokens: 4000,
    system: INTERVIEW_ASSISTANCE_SYSTEM,
    messages: [{ role: "user", content: JSON.stringify({ mode, respondent: context.recipientKind,
      allowedQuestions: questions.map(q => ({ key: q.key, text: q.text })),
      sources: sources.map(s => ({ key: contextKey(s), label: contextSourceLabel(s,context.recipientKind), text: s.text })) }) }],
    output_config: { format: zodOutputFormat(assistanceResultSchema) },
  }, { timeout: 45000, maxRetries: 0 });
  return { result: validateAssistance(response.parsed_output, mode, sources, questions.map(q => q.key)), usage: extractUsage(response.usage), model: AI_MODEL };
}
