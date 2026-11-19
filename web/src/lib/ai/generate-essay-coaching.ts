import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AI_MODEL, extractUsage, getAnthropicClient } from "./client";
import {
  contextKey,
  contextSourceLabel,
  type StudentContextSource,
} from "./student-context";
import {
  coachingResultSchema,
  SAVED_VERSION_COACH_SYSTEM,
  validateCoaching,
  type CoachingWorkspace,
} from "./essay-coaching";

export async function generateEssayCoaching(
  workspace: CoachingWorkspace,
  sources: StudentContextSource[],
) {
  const response = await getAnthropicClient().messages.parse(
    {
      model: AI_MODEL,
      max_tokens: 6000,
      system: SAVED_VERSION_COACH_SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            feature: "saved_version_essay_coaching",
            prompt: workspace.prompt,
            savedVersion: workspace.version,
            sources: sources.map((s) => ({
              key: contextKey(s),
              label: contextSourceLabel(s, "student"),
              text: s.text,
            })),
          }),
        },
      ],
      output_config: { format: zodOutputFormat(coachingResultSchema) },
    },
    { timeout: 45000, maxRetries: 0 },
  );
  return {
    result: validateCoaching(
      response.parsed_output,
      workspace.version,
      sources,
    ),
    model: AI_MODEL,
    usage: extractUsage(response.usage),
  };
}
