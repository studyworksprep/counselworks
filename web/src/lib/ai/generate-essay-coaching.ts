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
  // Match the editors' whitespace-word and UTF-16 character counts, using only
  // the chosen immutable version rather than the current working draft.
  const wordCount = workspace.version.body.trim().split(/\s+/).filter(Boolean).length;
  const characterCount = workspace.version.body.length;
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
            savedVersionMetrics: {
              wordCount,
              characterCount,
              overWordLimit:
                workspace.prompt.wordLimit !== null &&
                wordCount > workspace.prompt.wordLimit,
              overCharacterLimit:
                workspace.prompt.characterLimit !== null &&
                characterCount > workspace.prompt.characterLimit,
            },
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
