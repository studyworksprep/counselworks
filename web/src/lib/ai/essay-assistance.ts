import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AI_MODEL, extractUsage, getAnthropicClient } from "./client";
import {
  contextKey,
  contextSourceLabel,
  type StudentContextSource,
} from "./student-context";
import {
  connectedOutlineSchema,
  ESSAY_CONTEXT_SYSTEM,
  storyMatchesSchema,
  validateEssayAssistance,
  type EssayAssistanceMode,
  type EssayAiWorkspace,
} from "./essay-context";

export async function generateEssayAssistance(
  mode: EssayAssistanceMode,
  workspace: EssayAiWorkspace,
  sources: StudentContextSource[],
) {
  const { row } = workspace.drafting;
  const response = await getAnthropicClient().messages.parse(
    {
      model: AI_MODEL,
      max_tokens: 5000,
      system: ESSAY_CONTEXT_SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            feature: "essay_planning",
            mode,
            prompt: {
              text: row.promptText,
              wordLimit: row.wordLimit,
              characterLimit: row.characterLimit,
            },
            plan:
              mode === "outline" && row.plan
                ? { approach: row.plan.approach, angle: row.plan.angle }
                : null,
            connectedEntryIds: mode === "outline" ? row.entryIds : [],
            sources: sources.map((s) => ({
              key: contextKey(s),
              entryId: s.kind === "bank" ? s.id : null,
              label: contextSourceLabel(s, "student"),
              text: s.text,
            })),
          }),
        },
      ],
      output_config: {
        format: zodOutputFormat(
          mode === "story_matches"
            ? storyMatchesSchema
            : connectedOutlineSchema,
        ),
      },
    },
    { timeout: 45000, maxRetries: 0 },
  );
  return {
    result: validateEssayAssistance(
      response.parsed_output,
      mode,
      sources,
      row.entryIds,
    ),
    model: AI_MODEL,
    usage: extractUsage(response.usage),
  };
}
