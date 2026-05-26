import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AI_MODEL, extractUsage, getAnthropicClient, type AiUsage } from "./client";
import {
  COLLEGE_ENRICHMENT_SYSTEM,
  DISCREPANCY_CLASSIFICATION_SYSTEM,
} from "./prompts";
import {
  collegeEnrichmentSchema,
  discrepancyClassificationSchema,
  type CollegeEnrichment,
  type DiscrepancyClassification,
} from "./schemas";

export interface EnrichmentInput {
  scorecard_id: number;
  name: string;
  alias: string | null;
  city: string | null;
  state: string | null;
  website_url: string | null;
  institution_type: string | null;
  locale_type: string | null;
  ownership_code: number;
  predominant_degree_code: number | null;
  undergraduate_size: number | null;
}

export interface EnrichResult {
  enrichment: CollegeEnrichment | null;
  usage: AiUsage;
}

/**
 * Enriches a freshly-imported college record. Returns null enrichment if
 * the model output failed validation (Zod parse error or model refusal).
 * Caller should fall back to the raw Scorecard values in that case.
 */
export async function enrichNewCollegeRecord(
  input: EnrichmentInput,
): Promise<EnrichResult> {
  const client = getAnthropicClient();
  const lines = [
    `Scorecard ID: ${input.scorecard_id}`,
    `Name: ${input.name}`,
    input.alias ? `Alias: ${input.alias}` : null,
    input.city || input.state
      ? `Location: ${[input.city, input.state].filter(Boolean).join(", ")}`
      : null,
    input.website_url ? `Website: ${input.website_url}` : null,
    input.institution_type
      ? `Institution type (Scorecard): ${input.institution_type}`
      : null,
    input.locale_type ? `Locale: ${input.locale_type}` : null,
    input.undergraduate_size
      ? `Undergrad size: ${input.undergraduate_size}`
      : null,
  ].filter(Boolean);

  const response = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 800,
    system: [
      {
        type: "text",
        text: COLLEGE_ENRICHMENT_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Normalize this college record:\n\n${lines.join("\n")}`,
      },
    ],
    output_config: { format: zodOutputFormat(collegeEnrichmentSchema) },
  });

  return {
    enrichment: response.parsed_output,
    usage: extractUsage(response.usage),
  };
}

export interface DiscrepancyInput {
  field_name: string;
  current_value: string | null;
  proposed_value: string | null;
  college_name: string;
}

export interface ClassifyResult {
  classification: DiscrepancyClassification | null;
  usage: AiUsage;
}

export async function classifyDiscrepancyFlag(
  input: DiscrepancyInput,
): Promise<ClassifyResult> {
  const client = getAnthropicClient();
  const userPrompt = [
    `College: ${input.college_name}`,
    `Field: ${input.field_name}`,
    `Current value (our DB): ${JSON.stringify(input.current_value)}`,
    `Proposed value (Scorecard): ${JSON.stringify(input.proposed_value)}`,
    "",
    "Classify this diff.",
  ].join("\n");

  const response = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 400,
    system: [
      {
        type: "text",
        text: DISCREPANCY_CLASSIFICATION_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: zodOutputFormat(discrepancyClassificationSchema),
    },
  });

  return {
    classification: response.parsed_output,
    usage: extractUsage(response.usage),
  };
}

export function addUsage(a: AiUsage, b: AiUsage): AiUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_creation_input_tokens:
      a.cache_creation_input_tokens + b.cache_creation_input_tokens,
    cache_read_input_tokens:
      a.cache_read_input_tokens + b.cache_read_input_tokens,
  };
}

export const ZERO_USAGE: AiUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};
