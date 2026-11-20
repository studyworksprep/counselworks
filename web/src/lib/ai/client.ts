import Anthropic from "@anthropic-ai/sdk";

/**
 * Shared Claude model for prompt analysis and selected-context interview,
 * essay-planning and saved-version coaching assistance.
 */
export const AI_MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Set it in .env.local — see .env.local.example.",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface AiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

/**
 * Extracts usage figures from an Anthropic response in the shape we store in
 * `ai_usage_events`. The SDK returns optional fields for cache tokens when
 * caching wasn't used; we default those to 0.
 */
export function extractUsage(usage: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}): AiUsage {
  return {
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
  };
}
